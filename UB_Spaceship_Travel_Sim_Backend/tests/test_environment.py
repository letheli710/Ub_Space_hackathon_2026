import json
import math
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

import yaml

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
    controllers = ship.findall("plugin[@name='gz::sim::systems::JointPositionController']")
    assert len(controllers) == 12
    for arm in scene["arms"]:
        for name, limits in arm["joints"].items():
            joint = ship.find(f"joint[@name='{limits['joint_name']}']")
            assert joint is not None
            assert float(joint.findtext("axis/limit/lower")) == limits["lower_rad"]
            assert float(joint.findtext("axis/limit/upper")) == limits["upper_rad"]
            topic = f"/arms/{arm['id']}/{name}/target"
            assert any(c.findtext("topic") == topic for c in controllers)
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
                assert visual["geometry"]["type"] in {"box", "sphere", "cylinder"}
                assert len(visual["color"]) == 4


def test_each_arm_is_mounted_within_reach_of_its_equipment():
    ship = ET.parse(ROOT / "worlds/environment.sdf").getroot().find("world/model[@name='starship']")
    scene = json.loads((ROOT / "config/scene.json").read_text())
    for arm in scene["arms"]:
        pivot = [float(v) for v in ship.findtext(f"link[@name='arm_{arm['id']}_upper']/pose").split()[:3]]
        equipment = [float(v) for v in ship.findtext(f"link[@name='hull']/visual[@name='{arm['system']}_equipment']/pose").split()[:3]]
        assert math.dist(pivot, equipment) < 1.85
