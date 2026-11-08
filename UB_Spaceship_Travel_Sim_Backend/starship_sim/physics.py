"""Validate replaceable physical attachments and compile the native plugin contract."""
from copy import deepcopy
import math
import xml.etree.ElementTree as ET
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator


class ImpactCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_id: str = Field(min_length=1, max_length=100)
    mass_kg: FiniteFloat = Field(default=200, ge=1, le=5000)
    radius_m: FiniteFloat = Field(default=.6, ge=.15, le=2)
    speed_m_s: FiniteFloat = Field(default=40, ge=1, le=150)
    direction_body: tuple[FiniteFloat, FiniteFloat, FiniteFloat] = (0, 0, -1)

    @model_validator(mode='after')
    def direction(self):
        length = math.hypot(*self.direction_body)
        if length < 1e-6: raise ValueError('Impact direction cannot be zero')
        self.direction_body = tuple(v / length for v in self.direction_body)
        return self


def compile_physics(ship, profile, frames):
    from starship_sim.environment import compose, inverse, rotate
    source = deepcopy(profile['physics'])
    allowed = {'hull_link', 'engine_link', 'main_thrust_n', 'rcs_thrust_n', 'rcs_torque_nm',
               'main_isp_s', 'rcs_isp_s', 'rcs_lever_m', 'fuel_kg', 'bonds', 'impact_targets'}
    if set(source) - allowed: raise ValueError('Unknown physics configuration key')
    links = {link.get('name'): link for link in ship.findall('link')}
    for name in ('hull_link', 'engine_link'):
        if source[name] not in links: raise ValueError(f'{name} must reference an existing link')
    for key in allowed - {'hull_link', 'engine_link', 'bonds', 'impact_targets'}:
        value = source[key]
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError(f'{key} must be positive and finite')
    source.update(links=list(links), cruise_speed_m_s=profile['cruise_speed_m_s'])
    joints = {joint.get('name'): joint for joint in ship.findall('joint')}
    children = {}
    for joint in joints.values(): children.setdefault(joint.findtext('parent'), []).append(joint.findtext('child'))
    def subtree(link, trail=()):
        if link in trail: raise ValueError('Cyclic physical joint graph')
        return [link] + [descendant for child in children.get(link, []) for descendant in subtree(child, (*trail, link))]
    ids, assigned = set(), set()
    for bond in source['bonds']:
        if bond['id'] in ids or bond['joint_name'] in assigned: raise ValueError('Duplicate structural bond')
        ids.add(bond['id']); assigned.add(bond['joint_name'])
        joint = joints.get(bond['joint_name'])
        if joint is None or joint.get('type') != 'fixed': raise ValueError('Breakable bonds require fixed joints')
        parent, child = joint.findtext('parent'), joint.findtext('child')
        if parent not in links or child not in links or child == source['hull_link']: raise ValueError('Invalid structural bond links')
        for key in ('area_m2', 'section_modulus_m3', 'shear_strength_pa', 'normal_strength_pa'):
            if not math.isfinite(bond[key]) or bond[key] <= 0: raise ValueError('Bond strength and dimensions must be positive finite numbers')
        normal = bond.get('normal_local', [0, 0, 1])
        if len(normal) != 3 or not all(math.isfinite(v) for v in normal) or not math.isclose(math.hypot(*normal), 1):
            raise ValueError('Bond normal must be a unit vector')
        bond.update(parent_link=parent, child_link=child, links=subtree(child), normal_local=normal)
    target_ids = set()
    for target in source['impact_targets']:
        if target['id'] in target_ids or target['link_name'] not in links: raise ValueError('Invalid impact target')
        target_ids.add(target['id'])
        point = target['point_local_m']
        if len(point) != 3 or not all(math.isfinite(v) for v in point): raise ValueError('Invalid impact point')
    motors = []
    for controller in list(ship.findall('plugin')):
        if not controller.get('name', '').endswith('::JointPositionController'): continue
        name = controller.findtext('joint_name'); joint = joints[name]
        motors.append({'joint_name': name, 'child_link': joint.findtext('child'), 'topic': controller.findtext('topic'),
                       'velocity_control': controller.findtext('use_velocity_commands') == 'true',
                       'limit': float(controller.findtext('cmd_max')), 'lower': float(joint.findtext('axis/limit/lower')),
                       'upper': float(joint.findtext('axis/limit/upper'))})
        ship.remove(controller)
    source['motors'] = motors
    return source


def modular_physics(builder):
    """Engineering demo parameters, editable in the profile; not material certification."""
    bonds = []
    for joint in builder.model.findall('joint'):
        if joint.get('type') != 'fixed': continue
        child = joint.findtext('child')
        arm, wing = child.startswith('arm_'), child.startswith('solar_')
        bonds.append({'id': child, 'joint_name': joint.get('name'), 'material': 'aluminium attachment (effective section)',
            'area_m2': .001 if arm else .002 if wing else .03,
            'section_modulus_m3': .0002 if arm else .001 if wing else .025,
            'shear_strength_pa': 100e6, 'normal_strength_pa': 180e6,
            'normal_local': [0, 1, 0] if arm else [0, 0, 1]})
    targets = [{'id': m['id'], 'label': m['label'], 'link_name': m['link_name'],
                'point_local_m': [10.5, 0, 0] if m['id'] == 'ring' else [0, 0, 0]} for m in builder.modules]
    targets += [{'id': 'solar_'+side, 'label': side.title()+' solar wing', 'link_name': 'solar_'+side,
                 'point_local_m': [6, 0, 0]} for side in ('port', 'starboard')]
    targets += [{'id': 'arm_'+a['id'], 'label': a['label'], 'link_name': a['location']['tool_link'],
                 'point_local_m': [0, 0, 0]} for a in builder.arms]
    return {'hull_link': 'hull', 'engine_link': 'module_engine', 'main_thrust_n': 40000., 'rcs_thrust_n': 18000.,
            'rcs_torque_nm': 80000., 'main_isp_s': 450., 'rcs_isp_s': 230., 'rcs_lever_m': 8.,
            'fuel_kg': 4000., 'bonds': bonds, 'impact_targets': targets}


def derive_collision_inertias(model):
    """Uniform-density collision proxies; rotate tensors and apply parallel axes.

    Keep declared mass. Visual detail is deliberately excluded from collision and
    inertia integration. Links without proxies retain their explicit CAD estimate.
    """
    from starship_sim.environment import read_pose, rotate
    for link in model.findall('link'):
        pieces = []
        for collision in link.findall('collision'):
            g = collision.find('geometry')[0]
            if g.tag == 'box':
                x, y, z = map(float, g.findtext('size').split())
                volume, diagonal = x*y*z, [(y*y+z*z)/12, (x*x+z*z)/12, (x*x+y*y)/12]
            elif g.tag == 'sphere':
                r = float(g.findtext('radius')); volume, diagonal = 4*math.pi*r**3/3, [.4*r*r]*3
            elif g.tag == 'cylinder':
                r, h = float(g.findtext('radius')), float(g.findtext('length'))
                volume, diagonal = math.pi*r*r*h, [(3*r*r+h*h)/12]*2+[r*r/2]
            else: continue
            pose = read_pose(collision)
            columns = [list(rotate(dict(zip('xyz', [int(i == j) for i in range(3)])), pose['orientation']).values()) for j in range(3)]
            tensor = [[sum(columns[k][i]*diagonal[k]*columns[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
            pieces.append((volume, list(pose['position'].values()), tensor))
        if not pieces: continue
        inertial = link.find('inertial'); mass = float(inertial.findtext('mass')); volume = sum(p[0] for p in pieces)
        center = [sum(v*p[i] for v, p, _ in pieces)/volume for i in range(3)]
        tensor = [[0.]*3 for _ in range(3)]
        for v, p, moment in pieces:
            d = [p[i]-center[i] for i in range(3)]
            for i in range(3):
                for j in range(3): tensor[i][j] += mass*v/volume*(moment[i][j] + (sum(c*c for c in d) if i == j else 0) - d[i]*d[j])
        position = inertial.find('pose')
        if position is None: position = ET.SubElement(inertial, 'pose')
        position.text = ' '.join(f'{x:.12g}' for x in center) + ' 0 0 0'
        for key, i, j in [('ixx',0,0),('iyy',1,1),('izz',2,2),('ixy',0,1),('ixz',0,2),('iyz',1,2)]:
            inertial.find('inertia/'+key).text = f'{tensor[i][j]:.12g}'
