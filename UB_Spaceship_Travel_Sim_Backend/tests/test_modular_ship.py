"""The preview-to-physics contract, canonical units and location observations."""
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

import pytest

from starship_sim.actuators import joint_names, limits, measured_value, physical_target
from starship_sim.ai.contracts import ArmTarget, PolicyError, validate_action
from starship_sim.ai.coordinator import AICoordinator
from starship_sim.ai.prompts import role_description
from starship_sim.ai.settings import load_settings
from starship_sim.environment import Frames
from starship_sim.geometry import compose_pose, measured_world_pose, relative_pose

ROOT = Path(__file__).resolve().parents[1]
SCENE = json.loads((ROOT / 'config/scene.json').read_text())
SHIP = ET.parse(ROOT / 'assets/models/modular_station/model.sdf').find('model')
IDS = {'command', 'hab', 'node', 'cargo', 'ringHub', 'ringRailA', 'ringRailB', 'solarLeft', 'solarRight', 'engine'}


def test_preview_ids_and_physical_mounts_match():
    source = (ROOT.parent / 'frontend/src/components/station/StationShip.jsx').read_text()
    preview_ids = set(re.findall(r"id: ['\"]([^'\"]+)['\"]", source.split('export const ARMS')[1].split('];')[0]))
    assert preview_ids == IDS == {arm['id'] for arm in SCENE['arms']}
    assert len(SCENE['ship_layout']['modules']) == 8
    assert sum(len(arm['joints']) for arm in SCENE['arms']) == 52
    assert sum(len(joint_names(j)) for arm in SCENE['arms'] for j in arm['joints'].values()) == 62
    frames = Frames(SHIP, '__model__')
    expected = {'command': (11.8, 0, 1.7), 'hab': (8, 1.45, 0), 'node': (3.6, -2.35, 0),
                'cargo': (3.6, 0, -5.8), 'ringHub': (-1.4, 0, 1.55), 'engine': (-14, 2.8, 0)}
    for arm in SCENE['arms']:
        location = arm['location']
        assert arm['owner_system'] == 'robot_arms'
        assert location['module_id'] in {m['id'] for m in SCENE['ship_layout']['modules']}
        for key in ('position', 'orientation'):
            assert tuple(location['nominal_pose_in_body'][key].values()) == pytest.approx(tuple(frames.resolve(location['base_link'])[key].values()))
        assert SHIP.find(f"link[@name='{location['tool_link']}']") is not None
        if arm['id'] in expected:
            assert tuple(location['nominal_pose_in_body']['position'].values()) == pytest.approx(expected[arm['id']])
        assert ('slide' in arm['joints']) == arm['id'].startswith('ringRail')


def test_default_spawn_has_vertical_clearance_above_earths_orbit():
    ship = next(e for e in SCENE['entities'] if e['id'] == SCENE['ship_entity_id'])
    earth = next(e for e in SCENE['entities'] if e['id'] == 'earth')
    radius = earth['links'][0]['visuals'][0]['geometry']['radius'][0]
    assert ship['pose_in_world']['position']['z'] + ship['bounds_body_m']['min'][2] > radius + 10


@pytest.mark.parametrize('arm', SCENE['arms'], ids=lambda a: a['id'])
def test_gripper_drives_two_sliding_fingers_with_bounded_canonical_units(arm):
    grip = arm['joints']['grip']
    assert grip['unit'] == 'fraction' and limits(grip) == (0, 1)
    names = joint_names(grip)
    assert len(names) == 2
    assert all(SHIP.find(f"joint[@name='{name}']").get('type') == 'prismatic' for name in names)
    for target in (0., .5, 1.):
        samples = dict.fromkeys(names, physical_target(grip, target))
        assert measured_value(grip, samples) == pytest.approx(target)
        assert measured_value(grip, {names[0]: samples[names[0]]}) is None
        validate_action(SCENE, 'robot_arms', ArmTarget(type='arm_target', arm_id=arm['id'], targets={'grip': target}))
    for value in (-.01, 1.01):
        with pytest.raises(PolicyError):
            validate_action(SCENE, 'robot_arms', ArmTarget(type='arm_target', arm_id=arm['id'], targets={'grip': value}))
    with pytest.raises(PolicyError):
        validate_action(SCENE, 'energy', ArmTarget(type='arm_target', arm_id=arm['id'], targets={'wrist': .2}))


def test_nested_measured_frames_preserve_mount_position_during_ship_rotation():
    root = {'position': dict(x=100,y=50,z=20), 'orientation': dict(x=0,y=0,z=math.sqrt(.5),w=math.sqrt(.5))}
    arm = SCENE['arms'][0]
    local = arm['location']['nominal_pose_in_body']
    transforms = {'starship': {**root, 'parent_frame_id': 'solar_system'},
                  'starship::base': {**local, 'parent_frame_id': 'starship'}}
    world = measured_world_pose(transforms, 'starship::base', 'solar_system')
    assert world == compose_pose(root, local)
    restored = relative_pose(world, root)
    assert tuple(restored['position'].values()) == pytest.approx(tuple(local['position'].values()))
    assert measured_world_pose({'bad': {**root, 'parent_frame_id': 'bad'}}, 'bad') is None


def test_robot_role_receives_ten_arm_catalog_and_compact_shared_observation():
    role = role_description('robot_arms', SCENE)
    assert {a['id'] for a in role['capabilities']['arms']} == IDS
    assert 'location.module_id' in role['prompt'] and 'Main Judging' in role['prompt']
    manager = AICoordinator(SCENE, None, load_settings({}), model_client=object())
    measured = [{'id': a['id'], 'location': {'pose_source': 'gazebo', 'base_pose_body': a['location']['nominal_pose_in_body']}} for a in SCENE['arms']]
    observation = manager.observation({'arms': measured})
    assert observation['arms'] == measured
    assert len(observation['ship_geometry']['modules']) == 8
    assert 'visuals' not in json.dumps(observation['ship_geometry'])
