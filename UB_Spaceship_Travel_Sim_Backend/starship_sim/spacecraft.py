"""Shared game-state telemetry and geometric sensing driven by Gazebo samples.

Health, faults, power and maintenance are an explicit abstract simulation model.
Positions, velocities and service-joint feedback come from Gazebo, never an LLM.
"""

from copy import deepcopy
import math

from pydantic import BaseModel, ConfigDict, Field
from starship_sim.geometry import world_to_local

COMPONENTS = ('hull', 'solar_panels', 'life_support', 'thrusters', 'electronics', 'robot_arms')
METRICS = ('hull_integrity_pct', 'solar_panel_health_pct', 'battery_level_pct', 'oxygen_pct', 'thruster_efficiency_pct')
DISASTERS = ('Asteroid Collision', 'Black Hole Encounter', 'Solar Storm', 'Alien Encounter',
             'Thruster Failure', 'Solar Panel Power Crisis', 'Oxygen Leak', 'Spacecraft Fire',
             'AI System Malfunction', 'Robotic Arm Malfunction', 'Engine Failure')


class SimulationConfig(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    sensor_range_m: float = Field(default=1000, gt=0, le=100000)
    initial_battery_pct: float = Field(default=100, ge=0, le=100)
    solar_charge_pct_s: float = Field(default=1.2, ge=0, le=10)
    idle_drain_pct_s: float = Field(default=.08, ge=0, le=10)
    thrust_drain_pct_s: float = Field(default=.6, ge=0, le=10)
    maintenance_rate_pct_s: float = Field(default=2, gt=0, le=10)


def xyz(value):
    return tuple(value[key] for key in 'xyz')


def vector(value):
    return dict(zip('xyz', value))


def radius(entity):
    """Approximate visual bounding sphere, used for warnings, never contact proof."""
    result = 0.
    for link in entity.get('links', []):
        offset = math.dist(xyz(link['pose_in_model']['position']), (0, 0, 0))
        for visual in link['visuals']:
            shape = visual['geometry']
            if shape['type'] == 'box': extent = math.sqrt(sum(v*v for v in shape['size'])) / 2
            elif shape['type'] in {'sphere', 'cylinder', 'capsule'}: extent = shape['radius'][0] + sum(shape.get('length', [])) / 2
            else: extent = 5.  # Imported mesh bounds are unavailable to this simple sensor.
            local = visual.get('pose', {}).get('position', dict(x=0, y=0, z=0))
            result = max(result, offset + math.dist(xyz(local), (0, 0, 0)) + extent)
    return max(result, .1)


class SpacecraftState:
    def __init__(self, scene):
        self.scene = scene
        self.config = SimulationConfig.model_validate(scene.get('simulation', {}))
        self.metrics = dict.fromkeys(METRICS, 100.)
        self.metrics['battery_level_pct'] = self.config.initial_battery_pct
        self.last_time = None
        self.samples, self.velocities = {}, {}
        self.angular_rate = 0.
        self.attitude = None
        self.faults, self.maintenance = {}, {}
        self.maintenance_history = []
        self.events = []
        self.power = {'generation_pct_s': 0., 'consumption_pct_s': 0., 'balance_pct_s': 0., 'panel_alignment': []}
        self.entities = {item['id']: item for item in scene['entities']}
        self.annotations = {item['entity_id']: item for item in scene.get('map', {}).get('objects', [])}
        self.radii = {identifier: radius(entity) for identifier, entity in self.entities.items()}
        self.sensors = {'source': 'gazebo_ground_truth', 'range_m': self.config.sensor_range_m, 'objects': [], 'ready': False}

    def inject_disaster(self, kind, severity, sim_time):
        if kind not in DISASTERS or not math.isfinite(severity) or not 1 <= severity <= 100:
            raise ValueError('Unknown disaster or severity outside 1–100')
        # Explicit scenario effects; these do not spawn a Gazebo projectile or gravity field.
        effects = {
            'Asteroid Collision': {'hull_integrity_pct': .48, 'solar_panel_health_pct': .15},
            'Black Hole Encounter': {'hull_integrity_pct': .3, 'thruster_efficiency_pct': .15},
            'Solar Storm': {'solar_panel_health_pct': .55, 'battery_level_pct': .15},
            'Alien Encounter': {'hull_integrity_pct': .35},
            'Thruster Failure': {'thruster_efficiency_pct': .65},
            'Engine Failure': {'thruster_efficiency_pct': .8},
            'Solar Panel Power Crisis': {'solar_panel_health_pct': .65, 'battery_level_pct': .35},
            'Oxygen Leak': {'oxygen_pct': .2, 'hull_integrity_pct': .1},
            'Spacecraft Fire': {'hull_integrity_pct': .2, 'oxygen_pct': .15},
            'AI System Malfunction': {}, 'Robotic Arm Malfunction': {},
        }[kind]
        for key, scale in effects.items(): self.metrics[key] = max(0., self.metrics[key] - severity * scale)
        if kind in {'Oxygen Leak', 'Spacecraft Fire', 'AI System Malfunction', 'Robotic Arm Malfunction'}:
            self.faults[kind] = severity
        event = {'kind': kind, 'severity': severity, 'at_sim_time_s': sim_time, 'source': 'human_scenario',
                 'note': 'Abstract scenario effects; no physical projectile, radiation or gravity field spawned.'}
        self.events = (self.events + [event])[-30:]
        return {'status': 'applied', 'event': event}

    def start_maintenance(self, arm, component, duration_s, sim_time):
        previous = self.maintenance.get(arm['id'])
        if previous:
            self.maintenance_history = (self.maintenance_history + [{**deepcopy(previous), 'status': 'superseded'}])[-20:]
        self.maintenance[arm['id']] = {'arm_id': arm['id'], 'component': component,
            'expires_at_sim_time_s': sim_time + duration_s, 'targets_rad': arm['maintenance']['targets_rad'],
            'tolerance_rad': arm['maintenance']['tolerance_rad'], 'status': 'positioning', 'recovered_pct': 0.}

    def cancel_maintenance(self):
        for job in self.maintenance.values():
            self.maintenance_history.append({**deepcopy(job), 'status': 'cancelled'})
        self.maintenance_history = self.maintenance_history[-20:]
        self.maintenance.clear()

    def propulsion_factor(self):
        return (self.metrics['thruster_efficiency_pct'] / 100 * min(1., self.metrics['battery_level_pct'] / 15)
                * (1 if self.metrics['hull_integrity_pct'] > 0 else 0))

    def update(self, sim_time, transforms, joints, velocity_body, arm_targets):
        if sim_time is None: return
        dt = sim_time - self.last_time if self.last_time is not None else 0.
        self.last_time = sim_time
        if dt < 0:
            self.samples.clear(); self.velocities.clear(); self.cancel_maintenance()
            dt = 0.
        poses = {key: value for key, value in transforms.items() if key in self.entities}
        for key, entity in self.entities.items():
            if key not in poses and not entity['dynamic']: poses[key] = entity['pose_in_world']
        for identifier, pose in poses.items():
            sample_time = pose.get('stamp_sim_time_s', sim_time)
            before = self.samples.get(identifier)
            if before and sample_time > before[0]:
                self.velocities[identifier] = tuple((pose['position'][key] - before[1]['position'][key]) / (sample_time - before[0]) for key in 'xyz')
                if identifier == self.scene['ship_entity_id']:
                    dot = abs(sum(pose['orientation'][key] * before[1]['orientation'][key] for key in 'xyzw'))
                    self.angular_rate = 2 * math.acos(min(1., dot)) / (sample_time - before[0])
            self.samples[identifier] = (sample_time, deepcopy(pose))
            if not self.entities[identifier]['dynamic']: self.velocities[identifier] = (0., 0., 0.)
        ship = poses.get(self.scene['ship_entity_id'])
        self.sense(sim_time, ship, poses)
        alignment = []
        star = next((poses[item['entity_id']] for item in self.annotations.values() if item['kind'] == 'star' and item['entity_id'] in poses), None)
        sun_body = None
        if ship and star:
            direction = tuple(star['position'][a] - ship['position'][a] for a in 'xyz')
            length = math.sqrt(sum(v*v for v in direction))
            if length: sun_body = world_to_local(tuple(v / length for v in direction), ship['orientation'])
        for panel in self.scene.get('solar_panels', []):
            angle = joints.get(panel['joint_name'])
            efficiency, recommended = 0., None
            if sun_body is not None and angle is not None:
                normal, axis = panel['normal_body_at_zero'], panel['hinge_axis_body']
                cross = (axis[1]*normal[2]-axis[2]*normal[1], axis[2]*normal[0]-axis[0]*normal[2], axis[0]*normal[1]-axis[1]*normal[0])
                rotated = tuple(normal[i]*math.cos(angle) + cross[i]*math.sin(angle) for i in range(3))
                efficiency = max(0., sum(rotated[i]*sun_body[i] for i in range(3)))
                n, s = sum(normal[i]*sun_body[i] for i in range(3)), sum(cross[i]*sun_body[i] for i in range(3))
                ideal = math.atan2(s, n)
                candidates = [panel['lower_rad'], panel['upper_rad']] + [max(panel['lower_rad'], min(panel['upper_rad'], ideal+turn*2*math.pi)) for turn in (-1, 0, 1)]
                recommended = max(candidates, key=lambda value: n*math.cos(value)+s*math.sin(value))
            alignment.append({'panel_id': panel['id'], 'alignment': efficiency, 'recommended_target_rad': recommended})
        generation = self.config.solar_charge_pct_s * (sum(p['alignment'] for p in alignment) / len(alignment) if alignment else 0.) * self.metrics['solar_panel_health_pct'] / 100
        moving_arms = sum(any(abs(joints.get(arm['joints'][key]['joint_name'], target) - target) > .05 for key, target in arm_targets.get(arm['id'], {}).items()) for arm in self.scene['arms'])
        speed_fraction = min(1., math.sqrt(sum(v*v for v in velocity_body)) / self.scene['cruise_speed_m_s'])
        consumption = self.config.idle_drain_pct_s + self.config.thrust_drain_pct_s * speed_fraction**2 + .04*moving_arms + .12*len(self.maintenance)
        self.power = {'generation_pct_s': generation, 'consumption_pct_s': consumption,
                      'balance_pct_s': generation-consumption, 'panel_alignment': alignment,
                      'sun_direction_body': vector(sun_body) if sun_body is not None else None}
        if not 0 < dt <= 5: return  # Freeze the game model across startup/clock discontinuities.
        self.metrics['battery_level_pct'] += (generation-consumption) * dt
        self.metrics['oxygen_pct'] -= self.faults.get('Oxygen Leak', 0) / 100 * .4 * dt
        fire = self.faults.get('Spacecraft Fire', 0) / 100
        self.metrics['hull_integrity_pct'] -= fire * .2 * dt
        self.metrics['oxygen_pct'] -= fire * .15 * dt
        metric = dict(hull='hull_integrity_pct', solar_panels='solar_panel_health_pct', life_support='oxygen_pct', thrusters='thruster_efficiency_pct')
        for identifier, job in list(self.maintenance.items()):
            active_dt = max(0., min(dt, job['expires_at_sim_time_s'] - (sim_time-dt)))
            arm = next(arm for arm in self.scene['arms'] if arm['id'] == identifier)
            docked = all(abs(joints.get(arm['joints'][key]['joint_name'], math.inf) - target) <= job['tolerance_rad'] for key, target in job['targets_rad'].items())
            powered = self.metrics['battery_level_pct'] > 1
            job['status'] = 'servicing' if docked and powered else 'positioning' if not docked else 'no_power'
            if not docked or not powered:
                if sim_time >= job['expires_at_sim_time_s']:
                    self.maintenance_history = (self.maintenance_history + [{**deepcopy(job), 'status': 'expired_without_service'}])[-20:]
                    del self.maintenance[identifier]
                continue
            impairment = 1 - self.faults.get('Robotic Arm Malfunction', 0) / 100
            gain = self.config.maintenance_rate_pct_s * active_dt * impairment
            key = metric.get(job['component'])
            recovered = min(100. - self.metrics[key], gain) if key else 0.
            if key: self.metrics[key] += recovered
            job['recovered_pct'] += recovered
            cleared = {'life_support': ['Oxygen Leak'], 'hull': ['Spacecraft Fire'],
                       'electronics': ['AI System Malfunction'], 'robot_arms': ['Robotic Arm Malfunction']}.get(job['component'], [])
            for fault in cleared:
                if fault in self.faults:
                    self.faults[fault] = max(0., self.faults[fault] - 20 * active_dt)
                    if not self.faults[fault]: del self.faults[fault]
            if sim_time >= job['expires_at_sim_time_s']:
                self.maintenance_history = (self.maintenance_history + [{**deepcopy(job), 'status': 'completed'}])[-20:]
                del self.maintenance[identifier]
        for key in self.metrics: self.metrics[key] = max(0., min(100., self.metrics[key]))

    def sense(self, sim_time, ship, poses):
        self.sensors = {'source': 'gazebo_ground_truth', 'range_m': self.config.sensor_range_m,
            'detected_at_sim_time_s': sim_time, 'ready': ship is not None,
            'method': '360-degree geometric truth-state sensing; no camera, occlusion or contact sensor', 'objects': []}
        if not ship: return
        self.attitude = deepcopy(ship['orientation'])
        ship_id = self.scene['ship_entity_id']
        for identifier, pose in poses.items():
            if identifier == ship_id: continue
            age = sim_time - self.samples[identifier][0]
            if self.entities[identifier]['dynamic'] and age > 3: continue
            delta = tuple(pose['position'][a] - ship['position'][a] for a in 'xyz')
            distance = math.sqrt(sum(v*v for v in delta))
            if distance - self.radii[identifier] > self.config.sensor_range_m: continue
            relative = None
            if identifier in self.velocities and ship_id in self.velocities:
                relative = tuple(self.velocities[identifier][i] - self.velocities[ship_id][i] for i in range(3))
            combined_radius = self.radii[identifier] + self.radii[ship_id]
            clearance = distance - combined_radius
            closest_time, closest_clearance = None, None
            if relative is not None:
                speed2 = sum(v*v for v in relative)
                closest_time = max(0., min(30., -sum(delta[i]*relative[i] for i in range(3))/speed2)) if speed2 else 0.
                closest_clearance = math.sqrt(sum((delta[i]+relative[i]*closest_time)**2 for i in range(3))) - combined_radius
            metadata = self.annotations.get(identifier, {})
            self.sensors['objects'].append({'entity_id': identifier, 'label': metadata.get('label', identifier),
                'kind': metadata.get('kind', 'object'), 'position_world_m': deepcopy(pose['position']),
                'position_source': 'gazebo_pose' if self.entities[identifier]['dynamic'] else 'static_scene',
                'sample_age_s': max(0., age),
                'relative_position_body_m': vector(world_to_local(delta, ship['orientation'])),
                'relative_velocity_world_m_s': vector(relative) if relative is not None else None,
                'distance_m': distance, 'approx_clearance_m': clearance,
                'closing_speed_m_s': -sum(delta[i]*relative[i] for i in range(3))/distance if relative is not None and distance else None,
                'closest_approach_s': closest_time, 'closest_approx_clearance_m': closest_clearance,
                'proximity_warning': clearance < 5 or (closest_clearance is not None and closest_clearance < 5)})
        self.sensors['objects'].sort(key=lambda item: item['distance_m'])

    def snapshot(self):
        speed = self.velocities.get(self.scene['ship_entity_id'])
        return {'ship_status': {'source': 'simulation_model', 'metrics': {key: round(value, 4) for key, value in self.metrics.items()},
            'velocity_world_m_s': vector(speed) if speed is not None else None,
            'speed_m_s': math.sqrt(sum(v*v for v in speed)) if speed is not None else None,
            'attitude': {'label': 'MANEUVERING' if self.angular_rate > .02 else 'STABLE', 'orientation': self.attitude,
                         'angular_rate_rad_s': self.angular_rate}, 'power': deepcopy(self.power),
            'propulsion_factor': self.propulsion_factor(), 'active_faults': [{'kind': key, 'severity': value} for key, value in self.faults.items()],
            'maintenance': deepcopy(list(self.maintenance.values())), 'maintenance_history': deepcopy(self.maintenance_history), 'recent_events': deepcopy(self.events),
            'note': 'Health/power/maintenance are abstract game mechanics; motion is Gazebo-measured. No material repair/contact physics.'},
            'sensors': deepcopy(self.sensors)}
