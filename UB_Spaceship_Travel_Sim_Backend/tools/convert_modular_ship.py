"""Bake the frontend station's dimensional layout into flat SDF/OBJ assets.

Source: frontend/src/components/station/{modules,parts,RoboticArm}.jsx.
Geometry is merged by link/material to avoid thousands of browser draw calls.
Preview +Z nose / +Y up becomes Gazebo +X forward / +Z up by a proper rotation.
Animated preview effects are not baked into the physical model.
"""

import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from starship_sim.environment import compose, inverse, rotate

PI = math.pi
COLORS = {'hull': '.89 .90 .92 1', 'plating': '.82 .85 .89 1', 'dark': '.227 .247 .278 1',
          'truss': '.725 .745 .776 1', 'gold': '.788 .604 .235 1', 'solar': '.035 .10 .27 1',
          'radiator': '.95 .953 .96 1', 'glass': '.05 .13 .22 1', 'window': '1 .83 .54 1', 'glow': '.275 .784 1 1'}
HOME = dict(yaw=0., shoulder=.6, elbow=-1.2, wrist=.4, grip=.5, slide=0.)
BOUNDS = dict(yaw=(-PI, PI), shoulder=(-1.5, 1.5), elbow=(-2.4, .6), wrist=(-1.6, 1.6), grip=(0., 1.), slide=(-PI, PI))


def pose(position=(0, 0, 0), rpy=(0, 0, 0)):
    r, p, y = (v/2 for v in rpy)
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    return {'position': dict(zip('xyz', position)), 'orientation': dict(x=sr*cp*cy-cr*sp*sy, y=cr*sp*cy+sr*cp*sy,
        z=cr*cp*sy-sr*sp*cy, w=cr*cp*cy+sr*sp*sy)}


CONVERSION = {'position': dict(x=0., y=0., z=0.), 'orientation': dict(x=.5, y=.5, z=.5, w=.5)}


def xml_value(node, tag, value):
    ET.SubElement(node, tag).text = str(value)


def sdf_pose(value):
    q = value['orientation']; x, y, z, w = (q[a] for a in 'xyzw')
    angles = (math.atan2(2*(w*x+y*z), 1-2*(x*x+y*y)), math.asin(max(-1, min(1, 2*(w*y-z*x)))),
              math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z)))
    return ' '.join(f'{v:.12g}' for v in [*value['position'].values(), *angles])


def vertices(shape, dimensions):
    points, faces = [], []
    if shape == 'box':
        x, y, z = (v/2 for v in dimensions)
        points = [(a*x, b*y, c*z) for a, b, c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        faces = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(3,7,6),(3,6,2),(0,4,7),(0,7,3),(1,2,6),(1,6,5)]
    elif shape == 'tube':
        front, back, length, segments = dimensions
        for z, radius in [(-length/2, back), (length/2, front)]:
            points += [(radius*math.cos(i*2*PI/segments), radius*math.sin(i*2*PI/segments), z) for i in range(segments)]
        points += [(0,0,-length/2), (0,0,length/2)]
        for i in range(segments):
            j = (i+1) % segments
            faces += [(i,j,j+segments),(i,j+segments,i+segments),(2*segments,j,i),(2*segments+1,i+segments,j+segments)]
    elif shape == 'sphere':
        radius, horizontal, vertical = dimensions
        for j in range(vertical+1):
            theta = PI*j/vertical
            points += [(radius*math.sin(theta)*math.cos(i*2*PI/horizontal), radius*math.sin(theta)*math.sin(i*2*PI/horizontal), radius*math.cos(theta)) for i in range(horizontal)]
        for j in range(vertical):
            for i in range(horizontal):
                a, b, c, d = j*horizontal+i, j*horizontal+(i+1)%horizontal, (j+1)*horizontal+(i+1)%horizontal, (j+1)*horizontal+i
                if j: faces.append((a,d,b))
                if j < vertical-1: faces.append((b,d,c))
    elif shape == 'torus':
        radius, tube, segments, cross = dimensions
        for i in range(segments):
            a = i*2*PI/segments
            for j in range(cross):
                b = j*2*PI/cross
                points.append(((radius+tube*math.cos(b))*math.cos(a), (radius+tube*math.cos(b))*math.sin(a), tube*math.sin(b)))
        for i in range(segments):
            for j in range(cross):
                a, b, c, d = i*cross+j, ((i+1)%segments)*cross+j, ((i+1)%segments)*cross+(j+1)%cross, i*cross+(j+1)%cross
                faces += [(a,b,c),(a,c,d)]
    else: raise ValueError(shape)
    return points, faces


class Builder:
    def __init__(self):
        self.model = ET.Element('model', name='starship')
        xml_value(self.model, 'self_collide', 'false')
        self.source_poses, self.links, self.meshes = {}, {}, defaultdict(lambda: ([], []))
        self.modules, self.arms = [], []
        self.bounds = [[math.inf]*3, [-math.inf]*3]
        hull = ET.SubElement(self.model, 'link', name='hull')
        self.inertia(hull, 1000, 1000)

    @staticmethod
    def inertia(link, mass, moment, center=None):
        inertia = ET.SubElement(link, 'inertial')
        if center is not None: xml_value(inertia, 'pose', sdf_pose(pose(center)))
        xml_value(inertia, 'mass', mass)
        tensor = ET.SubElement(inertia, 'inertia')
        for key in ('ixx','iyy','izz'): xml_value(tensor, key, moment)
        for key in ('ixy','ixz','iyz'): xml_value(tensor, key, 0)

    def link(self, name, source_pose, mass=1, moment=.1, parent=None, center=None):
        link = ET.SubElement(self.model, 'link', name=name)
        self.source_poses[name], self.links[name] = source_pose, link
        xml_value(link, 'pose', sdf_pose(compose(CONVERSION, source_pose)))
        self.inertia(link, mass, moment, center)
        if parent: self.joint(name+'_fixed', parent, name, source_pose, 'fixed')
        return name

    def module(self, identifier, label, position, mass=1500):
        name = self.link('module_'+identifier, pose(position), mass, mass*4, 'hull')
        self.modules.append({'id': identifier, 'label': label, 'link_name': name})
        return name

    def joint(self, name, parent, child, source_pose, kind='revolute', axis=(0,0,1), bounds=None):
        joint = ET.SubElement(self.model, 'joint', name=name, type=kind)
        ET.SubElement(joint, 'pose', relative_to='__model__').text = sdf_pose(compose(CONVERSION, source_pose))
        xml_value(joint, 'parent', parent); xml_value(joint, 'child', child)
        if kind != 'fixed':
            axis_node = ET.SubElement(joint, 'axis'); xml_value(axis_node, 'xyz', ' '.join(map(str, axis)))
            limit = ET.SubElement(axis_node, 'limit')
            for tag, value in [('lower', bounds[0]), ('upper', bounds[1]), ('effort', 150), ('velocity', .15 if kind == 'prismatic' else 1.5)]: xml_value(limit, tag, value)
            dynamics = ET.SubElement(axis_node, 'dynamics'); xml_value(dynamics, 'damping', .1)
        return name

    def visual(self, link, material, shape, dimensions, world_pose):
        relative = compose(inverse(self.source_poses[link]), world_pose)
        points, faces = vertices(shape, dimensions)
        target_points, target_faces = self.meshes[(link, material)]
        offset = len(target_points)
        for point in points:
            moved = rotate(dict(zip('xyz', point)), relative['orientation'])
            target_points.append(tuple(relative['position'][key]+moved[key] for key in 'xyz'))
            body = compose(CONVERSION, world_pose)
            body_point = rotate(dict(zip('xyz', point)), body['orientation'])
            for i, key in enumerate('xyz'):
                value = body['position'][key]+body_point[key]
                self.bounds[0][i] = min(self.bounds[0][i], value); self.bounds[1][i] = max(self.bounds[1][i], value)
        target_faces.extend(tuple(index+offset for index in face) for face in faces)

    def part(self, link, shape, dimensions, position, material='hull', rpy=(0,0,0)):
        self.visual(link, material, shape, dimensions, pose(position, rpy))

    def collision(self, link, shape, dimensions, world_pose):
        node = ET.SubElement(self.links[link], 'collision', name='collision_'+str(len(self.links[link].findall('collision'))))
        xml_value(node, 'pose', sdf_pose(compose(inverse(self.source_poses[link]), world_pose)))
        geometry = ET.SubElement(node, 'geometry'); primitive = ET.SubElement(geometry, shape)
        if shape == 'box': xml_value(primitive, 'size', ' '.join(map(str, dimensions)))
        elif shape == 'sphere': xml_value(primitive, 'radius', dimensions[0])
        else:
            xml_value(primitive, 'radius', dimensions[0]); xml_value(primitive, 'length', dimensions[1])

    def tube(self, link, r, length, position, material='hull', back=None):
        self.part(link, 'tube', (r, back if back is not None else r, length, 24), position, material)

    def band(self, link, r, position, material='dark', width=.06):
        self.part(link, 'torus', (r, width, 48, 6), position, material)

    def rod(self, link, a, b, radius=.05, material='truss'):
        delta = [b[i]-a[i] for i in range(3)]; length = math.sqrt(sum(v*v for v in delta))
        if not length: return
        # Quaternion rotating the cylinder's +Z axis onto the rod direction.
        direction = [v/length for v in delta]
        if direction[2] < -.999999: q = dict(x=1., y=0., z=0., w=0.)
        else:
            norm = math.sqrt(2*(1+direction[2])); q = dict(x=-direction[1]/norm, y=direction[0]/norm, z=0., w=norm/2)
        self.visual(link, material, 'tube', (radius, radius, length, 6), {'position': dict(zip('xyz', [(a[i]+b[i])/2 for i in range(3)])), 'orientation': q})

    def truss(self, link, start, end, width, radius=.05):
        delta = [end[i]-start[i] for i in range(3)]; length = math.sqrt(sum(v*v for v in delta)); axis = [v/length for v in delta]
        helper = (1,0,0) if abs(axis[0]) < .8 else (0,1,0)
        u = (axis[1]*helper[2]-axis[2]*helper[1], axis[2]*helper[0]-axis[0]*helper[2], axis[0]*helper[1]-axis[1]*helper[0])
        scale = math.sqrt(sum(v*v for v in u)); u = [v/scale for v in u]
        v = (axis[1]*u[2]-axis[2]*u[1], axis[2]*u[0]-axis[0]*u[2], axis[0]*u[1]-axis[1]*u[0])
        corners = [(-1,-1),(1,-1),(1,1),(-1,1)]; bays = max(1, round(length/width))
        def point(index, t): return tuple(start[i]+axis[i]*length*t+(u[i]*corners[index][0]+v[i]*corners[index][1])*width/2 for i in range(3))
        for c in range(4): self.rod(link, point(c,0), point(c,1), radius)
        for j in range(bays+1):
            for c in range(4):
                self.rod(link, point(c,j/bays), point((c+1)%4,j/bays), radius)
                if j < bays: self.rod(link, point(c,j/bays), point((c+1)%4,(j+1)/bays), radius)

    def arm(self, identifier, label, module, parent, mount, description, components, upper=1.5, lower=1.3, rail=None):
        prefix = 'arm_'+identifier
        joint_map = {}
        if rail is not None:
            carrier_pose = pose((0,0,-2), (0,0,rail))
            carrier = self.link(prefix+'_carrier', carrier_pose, 2, .1, center=(10.5,0,1.18))
            joint_map['slide'] = {'joint_name': self.joint(prefix+'_rail', parent, carrier, carrier_pose, bounds=BOUNDS['slide']), 'max_speed': .15}
            self.visual(carrier, 'dark', 'box', (.83,.9,.16), compose(carrier_pose, pose((10.5,0,1.18))))
            parent = carrier
        base = self.link(prefix+'_mount', mount, .5, .03, parent)
        def local_part(link, shape, dimensions, local, material='hull', rpy=(0,0,0)):
            self.visual(link, material, shape, dimensions, compose(self.source_poses[link], pose(local, rpy)))
        local_part(base, 'tube', (.32,.36,.12,16), (0,.06,0), 'dark', (-PI/2,0,0))
        local_part(base, 'torus', (.3,.025,24,6), (0,.13,0), 'glow', (-PI/2,0,0))
        yaw_pose = compose(mount, pose((0,.12,0), (0,HOME['yaw'],0)))
        yaw = self.link(prefix+'_yaw_link', yaw_pose, .5, .03)
        joint_map['yaw'] = {'joint_name': self.joint(prefix+'_yaw', base, yaw, yaw_pose, axis=(0,1,0), bounds=BOUNDS['yaw']), 'max_speed': .8}
        local_part(yaw,'box',(.36,.3,.36),(0,.16,0))
        previous = yaw
        for alias, offset, length, thickness in [('shoulder', .36, upper, .16), ('elbow', upper, lower, .13), ('wrist', lower, 0, .11)]:
            source = compose(self.source_poses[previous], pose((0,offset,0), (0,0,HOME[alias])))
            link = self.link(prefix+'_'+alias+'_link', source, .7 if length else .3, .15 if length else .01)
            bounds = tuple(value-HOME[alias] for value in BOUNDS[alias])
            joint_map[alias] = {'joint_name': self.joint(prefix+'_'+alias, previous, link, source, bounds=bounds),
                                'offset': -HOME[alias], 'max_speed': .8}
            if length:
                local_part(link,'tube',(thickness,thickness,.32,16),(0,0,0),'dark')
                local_part(link,'box',(thickness,length,thickness),(0,length/2,0))
                self.collision(link,'box',(thickness,length,thickness),compose(source,pose((0,length/2,0))))
            else:
                local_part(link,'sphere',(.11,16,10),(0,0,0),'dark')
                local_part(link,'box',(.24,.12,.14),(0,.13,0))
                local_part(link,'box',(.12,.03,.01),(0,.13,.072),'glow')
            previous = link
        fingers = []
        for side, sign in [('a',1),('b',-1)]:
            source = compose(self.source_poses[previous],pose((sign*(.05+.13*HOME['grip']),.3,0)))
            finger = self.link(prefix+'_finger_'+side, source, .08, .001)
            fingers.append(self.joint(prefix+'_finger_'+side+'_slide', previous, finger, source, 'prismatic', (sign,0,0), (-.065,.065)))
            local_part(finger,'box',(.04,.24,.08),(0,0,0),'dark')
            self.collision(finger,'box',(.04,.24,.08),source)
        joint_map['grip'] = {'joint_name': fingers[0], 'coupled_joint_names': fingers[1:], 'scale': .13, 'offset': -.065, 'unit': 'fraction', 'max_speed': .08}
        self.arms.append({'id': identifier, 'label': label, 'system': module, 'joints': joint_map,
            'location': {'module_id': module, 'base_link': base, 'tool_link': previous, 'parent_link': parent,
                         'description': description, 'attachment': 'ring_rail' if rail is not None else 'solar_hinge' if module == 'solar' else 'fixed',
                         'reach_m': upper+lower+.93},
            'maintenance': {'components': components, 'targets_rad': {'yaw': .1, 'shoulder': .7, 'elbow': -1.05, 'wrist': .4}, 'tolerance_rad': .1}})

    def write(self, output):
        from starship_sim.physics import derive_collision_inertias
        derive_collision_inertias(self.model)
        output.mkdir(parents=True, exist_ok=True)
        for (name, material), (points, faces) in sorted(self.meshes.items()):
            filename = f'{name}_{material}.obj'
            text = '# Generated modular spacecraft visual, link-local coordinates\n'
            text += ''.join('v '+' '.join(f'{v:.7g}' for v in point)+'\n' for point in points)
            text += ''.join('f '+' '.join(str(v+1) for v in face)+'\n' for face in faces)
            (output/filename).write_text(text, encoding='utf-8', newline='\n')
            visual = ET.SubElement(self.links[name], 'visual', name=name+'_'+material)
            geometry = ET.SubElement(visual, 'geometry'); mesh = ET.SubElement(geometry, 'mesh'); xml_value(mesh, 'uri', filename)
            color = ET.SubElement(visual, 'material'); xml_value(color,'diffuse',COLORS[material]); xml_value(color,'ambient',COLORS[material])
        sdf = ET.Element('sdf', version='1.9'); sdf.append(self.model); ET.indent(sdf)
        (output/'model.sdf').write_text('<?xml version="1.0"?>\n'+ET.tostring(sdf, encoding='unicode')+'\n', encoding='utf-8', newline='\n')


def build():
    b = Builder()
    command = b.module('command','Command module',(0,0,13))
    b.tube(command,1.7,5,(0,0,13),'plating'); b.tube(command,1,1.3,(0,0,16.15),back=1.7)
    b.tube(command,.72,.45,(0,0,17),'dark'); b.band(command,.95,(0,0,16.85),width=.13)
    for z in (15.3,10.7): b.band(command,1.72,(0,0,z),'gold',.05)
    b.tube(command,1.4,.6,(0,0,10.2),'dark')
    for i in range(10):
        a=i*2*PI/10; b.part(command,'box',(.04,.3,.55),(1.71*math.cos(a),1.71*math.sin(a),14.4),'window',(0,0,a))
    for sign in (-1,1):
        b.part(command,'box',(.35,1.1,2.2),(sign*1.85,-.3,12.4),'dark')
        b.part(command,'box',(.02,.9,1.8),(sign*2.03,-.3,12.4),'gold')
    b.rod(command,(.6,1.7,14),(.6,2.7,14),.03); b.part(command,'sphere',(.35,16,10),(.6,2.75,14))
    b.collision(command,'cylinder',(1.7,5),pose((0,0,13)))
    b.arm('command','Command module arm','command',command,pose((0,1.7,11.8)), 'Dorsal forebody, above the command module', ['electronics'])
    hab = b.module('hab','Habitation module',(0,0,7.4)); b.tube(hab,1.45,4.4,(0,0,7.4),'plating')
    for z in (-1.8,-.9,0,.9,1.8): b.band(hab,1.47,(0,0,7.4+z))
    b.part(hab,'box',(1.1,.3,3.4),(0,-1.5,7.4),'dark'); b.part(hab,'box',(.04,.8,3.2),(-1.48,0,7.4),'gold')
    b.collision(hab,'cylinder',(1.45,4.4),pose((0,0,7.4)))
    b.arm('hab','Habitation module arm','hab',hab,pose((1.45,0,8),(0,0,-PI/2)), 'Port side of the forward habitation cylinder', ['life_support'])
    node = b.module('node','Junction node',(0,0,3.6)); b.part(node,'sphere',(1.9,24,16),(0,0,3.6),'plating')
    for sign in (-1,1): b.part(node,'tube',(.8,.8,.6,24),(sign*2.05,0,3.6),'hull',(0,PI/2,0))
    b.part(node,'tube',(.8,.8,.6,24),(0,-2.05,3.6),'dark',(PI/2,0,0))
    b.part(node,'tube',(.75,.85,.5,8),(0,2.05,3.6),'hull',(PI/2,0,0)); b.part(node,'sphere',(.6,20,12),(0,2.3,3.6),'glass')
    b.collision(node,'sphere',(1.9,),pose((0,0,3.6)))
    b.arm('node','Junction node arm','node',node,pose((-2.35,0,3.6),(0,0,PI/2)), 'Starboard lateral docking node', ['hull','electronics'])
    cargo = b.module('cargo','Cargo pod',(0,-4.4,3.6)); b.part(cargo,'tube',(1.8,1.8,2.6,8),(0,-4.4,3.6),'hull',(PI/2,0,0))
    b.part(cargo,'tube',(.5,.5,.9,16),(0,-2.65,3.6),'dark',(PI/2,0,0))
    for sign in (-1,1): b.part(cargo,'tube',(1.6,1.85,.12,8),(0,-4.4+sign*1.35,3.6),'dark',(PI/2,0,0))
    b.collision(cargo,'cylinder',(1.8,2.6),pose((0,-4.4,3.6),(PI/2,0,0)))
    b.arm('cargo','Cargo pod arm','cargo',cargo,pose((0,-5.8,3.6),(PI,0,0)), 'Ventral cargo pod, pointing below the ship', ['hull'])
    spine = b.module('spine','Spine truss',(0,0,-5),800); b.truss(spine,(0,0,2),(0,0,-13.6),1.2)
    b.collision(spine,'box',(1.2,1.2,15.6),pose((0,0,-5.8)))
    ring = b.module('ring','Habitat ring',(0,0,-2),9000); b.tube(ring,1.55,2.4,(0,0,-2),'plating')
    for z in (-.9,-3.1): b.band(ring,1.57,(0,0,z),width=.08)
    for angle in (PI/2,7*PI/6,11*PI/6): b.truss(ring,(1.5*math.cos(angle),1.5*math.sin(angle),-2),(9.8*math.cos(angle),9.8*math.sin(angle),-2),.6,.035)
    segment=2*PI*10.5/36*1.02
    for i in range(36):
        a=i*2*PI/36; x,y=10.5*math.cos(a),10.5*math.sin(a)
        b.part(ring,'box',(1.3,segment,1.9),(x,y,-2),'plating' if i%2 else 'hull',(0,0,a))
        b.part(ring,'box',(.04,segment*.75,1.4),(x+.66*math.cos(a),y+.66*math.sin(a),-2),'dark',(0,0,a))
        if i%3 == 0: b.part(ring,'box',(.03,segment*.4,.3),(x-.66*math.cos(a),y-.66*math.sin(a),-2),'window',(0,0,a))
        b.collision(ring,'box',(1.3,segment,1.9),pose((x,y,-2),(0,0,a)))
    for z in (-1.2,-2.8): b.band(ring,9.75,(0,0,z),'truss',.05)
    b.band(ring,10.5,(0,0,-1),'dark',.18)
    for radius in (10.18,10.82): b.band(ring,radius,(0,0,-.88),'truss',.05)
    for i in range(72):
        a=i*2*PI/72; b.part(ring,'box',(.768,.08,.06),(10.5*math.cos(a),10.5*math.sin(a),-.92),'dark',(0,0,a))
    b.arm('ringHub','Ring hub arm','ring',ring,pose((0,1.55,-1.4)), 'Dorsal hub of the midship habitat ring', ['hull','robot_arms'])
    for identifier, angle in [('ringRailA',.5),('ringRailB',.5+PI)]:
        mount=compose(pose((0,0,-2),(0,0,angle)),pose((10.5,0,1.26),(PI/2,0,0)))
        b.arm(identifier, 'Ring rail arm '+identifier[-1], 'ring', ring, mount,
              f'Forward face of habitat ring; circular rail radius 10.5 m, initial angle {angle:.6g} rad', ['hull','robot_arms'], rail=angle)
    solar = b.module('solar','Solar arrays and radiators',(0,0,-6),500)
    def wing(link,z,angle,length,width,material='solar',panels=2):
        base=pose((0,0,z),(0,0,angle))
        endpoint=compose(base,pose((length,0,0)))['position']; b.rod(link,(0,0,z),tuple(endpoint.values()),.07)
        b.visual(link,'dark','box',(.6,.45,.6),compose(base,pose((.9,0,0))))
        panel_length=(length-2)/panels
        for index in range(panels): b.visual(link,material,'box',(panel_length,.05,width),compose(base,pose((1.6+panel_length*(index+.5)+index*.15,0,0))))
        return base
    panels=[]
    for identifier, arm_id, angle in [('port','solarRight',0.),('starboard','solarLeft',PI)]:
        base=pose((0,0,-6),(0,0,angle)); link=b.link('solar_'+identifier,base,50,500)
        mount=b.link('solar_'+identifier+'_mount',base,2,1,solar)
        joint=b.joint('solar_'+identifier+'_tilt',mount,link,base,axis=(1,0,0),bounds=(-1.4,1.4))
        wing(link,-6,angle,11,3)
        center=compose(base,pose((6.1,0,0))); b.collision(link,'box',(9.2,.05,3),center)
        b.arm(arm_id, 'Solar wing arm '+('right' if arm_id == 'solarRight' else 'left'), 'solar', link,
              compose(base,pose((1,.22,0))), f'{identifier.title()} main solar wing near the root hinge; preview ID {arm_id}', ['solar_panels'], upper=1.2, lower=1.)
        axis=rotate(dict(x=1,y=0,z=0),compose(CONVERSION,base)['orientation'])
        panels.append({'id': identifier,'joint_name':joint,'normal_body_at_zero':[0,0,1],'hinge_axis_body':[round(axis[a],12) for a in 'xyz']})
    for angle in (PI/2,-PI/2): wing(solar,-11.6,angle,5,1.6,panels=1)
    for angle in (PI/4,5*PI/4): wing(solar,-9,angle,4.2,1.3,'radiator',panels=1)
    engine=b.module('engine','Engine section',(0,0,-16.3),3000)
    for i in range(8):
        a=i*2*PI/8; b.part(engine,'sphere',(.95,20,12),(1.85*math.cos(a),1.85*math.sin(a),-14),'hull' if i%2 else 'plating')
    b.tube(engine,1.1,5,(0,0,-16.2),'dark')
    for i in range(6):
        a=i*2*PI/6; x,y=1.7*math.cos(a),1.7*math.sin(a)
        b.tube(engine,.48,3.2,(x,y,-16.3))
        for z in (-15.4,-17.2): b.band(engine,.5,(x,y,z),'gold',.04)
    b.tube(engine,2.15,.3,(0,0,-18.4),'dark'); b.tube(engine,.55,1.8,(0,0,-19.5),'dark',back=1.4)
    for z,r in [(-18.4,2.1),(-19.6,1.85),(-20.8,1.55),(-22,1.2)]: b.band(engine,r,(0,0,z),'truss',.05)
    for i in range(8):
        a=i*2*PI/8; b.rod(engine,(2.1*math.cos(a),2.1*math.sin(a),-18.4),(1.2*math.cos(a),1.2*math.sin(a),-22))
    b.collision(engine,'cylinder',(2.7,6),pose((0,0,-15.5))); b.collision(engine,'cylinder',(1.4,2),pose((0,0,-19.5)))
    b.arm('engine','Engine service arm','engine',engine,pose((2.8,0,-14),(0,0,-PI/2)), 'Port aft engine/tank service mount', ['thrusters'])
    return b, panels


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--activate',action='store_true'); args=parser.parse_args()
    builder, panels=build(); output=ROOT/'assets/models/modular_station'; builder.write(output)
    source=ROOT.parent/'frontend/src/components/station'
    manifest={'source':'frontend modular station dimensional layout', 'axes':'preview (x,y,z) -> body (z,x,y)',
              'fixed_habitat_ring':True,'arm_ids':[arm['id'] for arm in builder.arms], 'modules':builder.modules,
              'source_sha256':{name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in ('modules.jsx','parts.jsx','RoboticArm.jsx','StationShip.jsx')}}
    (output/'conversion.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    if args.activate:
        profile_path=ROOT/'config/environment.json'; profile=json.loads(profile_path.read_text())
        legacy=ROOT/'config/profiles/starter.json'; legacy.parent.mkdir(parents=True,exist_ok=True)
        if not legacy.exists(): legacy.write_text(json.dumps(profile,indent=2)+'\n',encoding='utf-8')
        profile.update(ship_sdf='assets/models/modular_station/model.sdf', arms=builder.arms, solar_panels=panels, ship_modules=builder.modules,
                       ship_bounds_body_m={'min':[value-.5 for value in builder.bounds[0]],'max':[value+.5 for value in builder.bounds[1]]})
        from starship_sim.physics import modular_physics
        profile.setdefault('physics', modular_physics(builder))
        profile['destination']['stop_distance_m']=55
        if profile.get('ship_spawn', {}).get('offset_m') == [15, -40, 10]:
            # The much larger hull needs clearance above Earth's moving orbit.
            profile['ship_spawn']['offset_m'] = [15, -40, 60]
        profile_path.write_text(json.dumps(profile,indent=2)+'\n',encoding='utf-8')
    print(f'Converted 8 modules and {len(builder.arms)} arms into {output.name}/model.sdf; use generate_environment.py next.')


if __name__ == '__main__': main()
