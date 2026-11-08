import json
import math
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

import yaml
import pytest
from copy import deepcopy
from starship_sim.environment import build_environment
from starship_sim.actuators import joint_names, limits as joint_limits, physical_target

ROOT = Path(__file__).resolve().parents[1]


def test_generated_environment_has_no_drift():
    subprocess.run([sys.executable, "tools/generate_environment.py", "--check"], cwd=ROOT, check=True)


def test_world_scene_and_command_bridge_agree():
    world = ET.parse(ROOT / "worlds/environment.sdf").getroot().find("world")
    scene = json.loads((ROOT / "config/scene.json").read_text())
    bridge = yaml.safe_load((ROOT / "config/bridge.yaml").read_text())
    assert world.findtext("gravity") == "0 0 0"
    assert scene["up_axis"] == "Z"
    assert {e["id"] for e in scene["entities"]} == {m.get("name") for m in world.findall("model")}
    ship = world.find("model[@name='starship']")
    assert ship.findtext("static", "false") == "false"
    assert all(j.findtext("parent") != "world" for j in ship.findall("joint"))
    controllers = scene['physics']['motors']
    native = ship.find("plugin[@name='starship::Physics']")
    assert json.loads(native.findtext('configuration'))['motors'] == controllers
    assert ship.find("plugin[@name='gz::sim::systems::VelocityControl']") is None
    assert len(controllers) == sum(len(joint_names(j)) for arm in scene['arms'] for j in arm['joints'].values()) + len(scene.get("solar_panels", []))
    for arm in scene["arms"]:
        for name, limits in arm["joints"].items():
            joint = ship.find(f"joint[@name='{limits['joint_name']}']")
            assert joint is not None
            assert float(joint.findtext("axis/limit/lower")) == pytest.approx(physical_target(limits, joint_limits(limits)[0]))
            assert float(joint.findtext("axis/limit/upper")) == pytest.approx(physical_target(limits, joint_limits(limits)[1]))
            topic = f"/arms/{arm['id']}/{name}/target"
            assert any(c['topic'] == topic for c in controllers)
            for physical_name in joint_names(limits):
                assert any(c['joint_name'] == physical_name and c['topic'] == topic for c in controllers)
            assert any(b["gz_topic_name"] == topic and b["direction"] == "ROS_TO_GZ" for b in bridge)


def test_scene_exports_all_visual_geometry_and_initial_frames():
    world = ET.parse(ROOT / "worlds/environment.sdf").getroot().find("world")
    scene = json.loads((ROOT / "config/scene.json").read_text())
    for entity in scene["entities"]:
        model = world.find(f"model[@name='{entity['id']}']")
        assert len(entity["links"]) == len(model.findall("link"))
        for body in entity["links"]:
            link_name = body["id"].split("::")[-1]
            assert len(body["visuals"]) == len(model.findall(f"link[@name='{link_name}']/visual"))
            for visual in body["visuals"]:
                assert visual["geometry"]["type"] in {"box", "sphere", "cylinder", "mesh"}
                assert len(visual["color"]) == 4


def test_solar_panel_scene_limits_controllers_and_bridge_agree():
    profile = json.loads((ROOT / 'config/environment.json').read_text())
    generated = build_environment(ROOT, profile)
    scene = json.loads(generated['config/scene.json'])
    ship = ET.fromstring(generated['worlds/environment.sdf']).find("world/model[@name='starship']")
    bridge = yaml.safe_load(generated['config/bridge.yaml'])
    assert len(scene['solar_panels']) == 2
    for panel in scene['solar_panels']:
        joint = ship.find(f"joint[@name='{panel['joint_name']}']")
        assert float(joint.findtext('axis/limit/lower')) == panel['lower_rad']
        topic = f'/solar_panels/{panel["id"]}/target'
        assert any(m['topic'] == topic and m['joint_name'] == panel['joint_name'] for m in scene['physics']['motors'])
        assert any(item['ros_topic_name'] == topic and item['direction'] == 'ROS_TO_GZ' for item in bridge)
    without_panels = deepcopy(profile)
    without_panels.pop('solar_panels')
    assert json.loads(build_environment(ROOT, without_panels)['config/scene.json'])['solar_panels'] == []


@pytest.mark.parametrize('mapping', [
    [{'id': 'bad/name', 'joint_name': 'solar_port_tilt'}],
    [{'id': 'panel', 'joint_name': 'missing'}],
    [{'id': 'panel', 'joint_name': 'solar_port_tilt'}, {'id': 'panel', 'joint_name': 'solar_starboard_tilt'}],
])
def test_invalid_solar_mappings_fail_before_startup(mapping):
    profile = json.loads((ROOT / 'config/environment.json').read_text())
    profile['solar_panels'] = mapping
    with pytest.raises(ValueError): build_environment(ROOT, profile)


def test_each_arm_is_mounted_within_reach_of_its_equipment():
    generated = build_environment(ROOT, json.loads((ROOT / "config/profiles/starter.json").read_text()))
    ship = ET.fromstring(generated["worlds/environment.sdf"]).find("world/model[@name='starship']")
    scene = json.loads(generated["config/scene.json"])
    for arm in scene["arms"]:
        pivot = [float(v) for v in ship.findtext(f"link[@name='arm_{arm['id']}_upper']/pose").split()[:3]]
        equipment = [float(v) for v in ship.findtext(f"link[@name='hull']/visual[@name='{arm['system']}_equipment']/pose").split()[:3]]
        assert math.dist(pivot, equipment) < 1.85
