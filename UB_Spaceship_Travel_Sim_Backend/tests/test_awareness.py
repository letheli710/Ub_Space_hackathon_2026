import json
from copy import deepcopy
from pathlib import Path
import math
import pytest
from fastapi.testclient import TestClient

from starship_sim.ai.coordinator import AICoordinator
from starship_sim.ai.settings import load_settings
from starship_sim.ai.contracts import ArmService, ArmTarget, PolicyError, resources, validate_action
from starship_sim.api import create_app
from starship_sim.spacecraft import SpacecraftState
from starship_sim.actuators import joint_names, physical_target

SCENE = json.loads((Path(__file__).resolve().parents[1] / 'config/scene.json').read_text())


def test_ai_observation_uses_the_same_status_and_object_detections_as_the_website():
    snapshot = {'ship_status': {'source': 'simulation_model', 'metrics': {
        'hull_integrity_pct': 80, 'solar_panel_health_pct': 75, 'battery_level_pct': 65,
        'oxygen_pct': 90, 'thruster_efficiency_pct': 70}},
        'sensors': {'range_m': 500, 'objects': [{'entity_id': 'earth', 'distance_m': 100}]}}
    manager = AICoordinator(SCENE, None, load_settings({}), model_client=object())
    observation = manager.observation(snapshot)
    assert observation.get('ship_status') == snapshot['ship_status'], 'AI cannot see the Demo Telemetry health fields'
    assert observation.get('sensors') == snapshot['sensors'], 'AI cannot see nearby-object detections'


def pose(x=0, y=0, z=0):
    return {'position': dict(x=x, y=y, z=z), 'orientation': dict(x=0, y=0, z=0, w=1)}


def scene():
    result = deepcopy(SCENE)
    result['ship_entity_id'] = 'ship'
    result['entities'] = [{'id': name, 'dynamic': dynamic, 'pose_in_world': position, 'links': []}
                          for name, dynamic, position in [('ship', True, pose()), ('sun', False, pose(0, -100)), ('object', True, pose(10))]]
    result['map']['objects'] = [{'entity_id': 'sun', 'kind': 'star'}, {'entity_id': 'object', 'kind': 'asteroid'}]
    result['simulation']['initial_battery_pct'] = 50
    for panel in result['solar_panels']: panel['hinge_axis_body'] = [1, 0, 0]
    return result


def joints_for(scene):
    return {**{panel['joint_name']: 0. for panel in scene['solar_panels']},
            **{name: 0. for arm in scene['arms'] for joint in arm['joints'].values() for name in joint_names(joint)}}


def test_detection_uses_relative_measured_motion_and_filters_unobserved_or_distant_objects():
    state = SpacecraftState(scene())
    state.update(0, {'ship': pose(), 'object': pose(10)}, {}, (0, 0, 0), {})
    state.update(1, {'ship': pose(1), 'object': pose(9)}, {}, (0, 0, 0), {})
    sensed = next(item for item in state.snapshot()['sensors']['objects'] if item['entity_id'] == 'object')
    assert sensed['distance_m'] == 8 and sensed['closing_speed_m_s'] == 2
    assert sensed['relative_position_body_m'] == dict(x=8, y=0, z=0)
    assert sensed['closest_approach_s'] == 4 and sensed['proximity_warning']
    assert state.snapshot()['ship_status']['speed_m_s'] == 1
    state.update(2, {'ship': pose(1), 'object': pose(5000)}, {}, (0, 0, 0), {})
    assert 'object' not in {item['entity_id'] for item in state.snapshot()['sensors']['objects']}
    fresh = SpacecraftState(scene())
    fresh.update(0, {'ship': pose()}, {}, (0, 0, 0), {})
    assert 'object' not in {item['entity_id'] for item in fresh.snapshot()['sensors']['objects']}


def test_panel_feedback_changes_battery_and_health_limits_actual_propulsion():
    description = scene()
    state = SpacecraftState(description)
    joints = joints_for(description)
    state.update(0, {'ship': pose()}, joints, (0, 0, 0), {})
    state.update(1, {'ship': pose()}, joints, (0, 0, 0), {})
    drained = state.metrics['battery_level_pct']
    for panel in description['solar_panels']: joints[panel['joint_name']] = 1.4
    state.update(2, {'ship': pose()}, joints, (0, 0, 0), {})
    assert state.metrics['battery_level_pct'] > drained
    assert state.power['panel_alignment'][0]['recommended_target_rad'] == pytest.approx(1.4)
    state.inject_disaster('Thruster Failure', 50, 2)
    assert state.propulsion_factor() == pytest.approx(.675)
    state.metrics['battery_level_pct'] = 0
    assert state.propulsion_factor() == 0


def test_faults_advance_only_in_simulation_time_and_snapshots_are_read_only():
    state = SpacecraftState(scene())
    state.update(0, {'ship': pose()}, {}, (0, 0, 0), {})
    state.inject_disaster('Oxygen Leak', 65, 0)
    initial = state.metrics['oxygen_pct']
    state.update(1, {'ship': pose()}, {}, (0, 0, 0), {})
    assert state.metrics['oxygen_pct'] < initial
    before = state.snapshot()
    assert state.snapshot() == before
    state.update(1, {'ship': pose()}, {}, (0, 0, 0), {})
    assert state.metrics['oxygen_pct'] == before['ship_status']['metrics']['oxygen_pct']


def test_maintenance_requires_measured_service_pose_and_power_then_reports_recovery():
    description = scene()
    arm = next(arm for arm in description['arms'] if 'hull' in arm['maintenance']['components'])
    state = SpacecraftState(description)
    joints = joints_for(description)
    state.inject_disaster('Asteroid Collision', 65, 0)
    initial = state.metrics['hull_integrity_pct']
    state.update(0, {'ship': pose()}, joints, (0, 0, 0), {})
    state.start_maintenance(arm, 'hull', 3, 0)
    state.update(1, {'ship': pose()}, joints, (0, 0, 0), {})
    assert state.metrics['hull_integrity_pct'] == initial
    assert state.maintenance[arm['id']]['status'] == 'positioning'
    for key, target in arm['maintenance']['targets_rad'].items(): joints[arm['joints'][key]['joint_name']] = physical_target(arm['joints'][key], target)
    state.update(2, {'ship': pose()}, joints, (0, 0, 0), {})
    assert state.metrics['hull_integrity_pct'] > initial
    state.update(3, {'ship': pose()}, joints, (0, 0, 0), {})
    history = state.snapshot()['ship_status']['maintenance_history'][-1]
    assert history['status'] == 'completed' and history['recovered_pct'] == pytest.approx(4)
    assert not state.maintenance
    state.metrics['battery_level_pct'] = 0
    state.start_maintenance(arm, 'hull', 2, 3)
    before = state.metrics['hull_integrity_pct']
    state.update(4, {'ship': pose()}, joints, (0, 0, 0), {})
    assert state.metrics['hull_integrity_pct'] == before
    state.cancel_maintenance()
    assert not state.maintenance


def test_arm_service_authority_capabilities_and_joint_conflicts():
    arm = next(arm for arm in SCENE['arms'] if 'solar_panels' in arm['maintenance']['components'])
    action = ArmService(type='arm_service', arm_id=arm['id'], component='solar_panels', duration_s=5)
    validate_action(SCENE, 'robot_arms', action)
    with pytest.raises(PolicyError): validate_action(SCENE, 'energy', action)
    with pytest.raises(PolicyError): validate_action(SCENE, 'robot_arms', action.model_copy(update={'component': 'hull'}))
    with pytest.raises(PolicyError): validate_action(SCENE, 'robot_arms', action.model_copy(update={'arm_id': 'missing'}))
    target = ArmTarget(type='arm_target', arm_id=arm['id'], targets={'yaw': .1})
    assert resources(action, SCENE) & resources(target, SCENE)


def test_scenario_api_is_human_control_and_validates_the_whole_request():
    class Backend:
        def __init__(self): self.calls = []
        def inject_disaster(self, kind, severity):
            self.calls.append((kind, severity))
            return {'status': 'applied'}
        def close(self): pass
    backend = Backend()
    with TestClient(create_app(backend=backend, ai_settings=load_settings({}))) as client:
        for payload in [{'kind': 'unknown'}, {'kind': 'Oxygen Leak', 'severity': 101}, {'kind': 'Oxygen Leak', 'metrics': {'hull': 100}}]:
            assert client.post('/api/v1/disasters', json=payload).status_code == 422
        assert not backend.calls
        assert client.post('/api/v1/disasters', json={'kind': 'Oxygen Leak', 'severity': 50}).status_code == 202
        assert backend.calls == [('Oxygen Leak', 50)]
