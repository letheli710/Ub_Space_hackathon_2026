from copy import deepcopy
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import pytest

from starship_sim.environment import build_environment
from starship_sim import environment

ROOT = Path(__file__).resolve().parents[1]


def profile():
    return json.loads((ROOT / 'config/environment.json').read_text())


def test_solar_map_exports_physical_orbits_spawn_and_matching_command_topics():
    outputs = build_environment(ROOT, profile())
    scene = json.loads(outputs['config/scene.json'])
    world = ET.fromstring(outputs['worlds/environment.sdf']).find('world')
    objects = {item['entity_id']: item for item in scene['map']['objects']}
    assert scene['world'] == 'solar_system'
    assert scene['map']['origin_entity_id'] == 'earth'
    assert scene['destination']['entity_id'] == 'mars'
    assert len([item for item in objects.values() if item['kind'] == 'planet']) == 8
    for name, item in objects.items():
        if 'orbit' not in item:
            continue
        planet = world.find(f"model[@name='{name}']")
        assert planet.findtext('static') == 'false'
        assert planet.findtext('joint/parent') == 'world'
        assert planet.findtext('joint/axis/xyz') == '0 0 1'
        controller = planet.find("plugin[@name='gz::sim::systems::JointController']")
        assert math.isclose(float(controller.findtext('initial_velocity')), item['orbit']['angular_speed_rad_s'])
        assert item['orbit']['velocity_topic'] in outputs['config/bridge.yaml']
        assert all(abs(value) < 1e-9 for value in item['orbit']['center'].values())
    entities = {entity['id']: entity for entity in scene['entities']}
    ship = entities[scene['ship_entity_id']]['pose_in_world']['position']
    earth = entities['earth']['pose_in_world']['position']
    assert math.dist(list(ship.values()), list(earth.values())) > objects['earth']['radius_m'] + 10


def test_legacy_sdf_map_can_replace_the_solar_system_without_frontend_edits():
    settings = profile()
    settings['map_sdf'] = 'assets/maps/deep_space.sdf'
    settings['destination'] = {'entity_id': 'destination_planet', 'stop_distance_m': 70}
    settings.pop('ship_spawn')
    settings.pop('map')
    scene = json.loads(build_environment(ROOT, settings)['config/scene.json'])
    assert scene['world'] == 'deep_space'
    assert scene['map']['objects']
    assert not any('orbit' in item for item in scene['map']['objects'])


def test_scene_revision_ignores_platform_trigonometry_roundoff(monkeypatch):
    baseline = build_environment(ROOT, profile())['config/scene.json']
    sin, cos = math.sin, math.cos
    monkeypatch.setattr(environment.math, 'sin', lambda value: sin(value) + (1e-16 if abs(value) > .01 else 0))
    monkeypatch.setattr(environment.math, 'cos', lambda value: cos(value) + (1e-16 if abs(value) > .01 else 0))
    assert build_environment(ROOT, profile())['config/scene.json'] == baseline


@pytest.mark.parametrize('change', ['unknown_origin', 'unknown_annotation', 'unknown_spawn'])
def test_invalid_map_references_fail_during_generation(change):
    settings = deepcopy(profile())
    if change == 'unknown_origin':
        settings['map']['origin_entity_id'] = 'missing'
    elif change == 'unknown_annotation':
        settings['map']['objects']['missing'] = {'label': 'Missing'}
    else:
        settings['ship_spawn']['entity_id'] = 'missing'
    with pytest.raises(ValueError):
        build_environment(ROOT, settings)
