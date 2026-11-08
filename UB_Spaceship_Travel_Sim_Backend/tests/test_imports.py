import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

import pytest
from fastapi.testclient import TestClient

from starship_sim.api import create_app
from starship_sim.environment import build_environment
from test_api import ContractBackend

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def imported(tmp_path):
    shutil.copytree(ROOT / "assets", tmp_path / "assets")
    profile = json.loads((ROOT / "config/environment.json").read_text())
    return tmp_path, profile


def test_ship_and_map_names_can_change_without_ui_or_controller_edits(imported):
    root, profile = imported
    map_path = root / profile["map_sdf"]
    sdf = ET.parse(map_path)
    sdf.find("world").set("name", "replacement_map")
    old_destination = profile["destination"]["entity_id"]
    sdf.find(f"world/model[@name='{old_destination}']").set("name", "new_destination")
    sdf.write(map_path)
    profile["ship_entity_id"] = "replacement_ship"
    profile["destination"]["entity_id"] = "new_destination"
    profile["map"]["objects"]["new_destination"] = profile["map"]["objects"].pop(old_destination)
    result = build_environment(root, profile)
    scene = json.loads(result["config/scene.json"])
    assert scene["ship_entity_id"] == "replacement_ship"
    assert scene["world"] == "replacement_map"
    assert scene["destination"]["entity_id"] == "new_destination"
    assert "/world/replacement_map/clock" in result["config/bridge.yaml"]
    assert "/model/replacement_ship/cmd_vel" in result["config/bridge.yaml"]


def test_mesh_assets_and_relative_frames_share_one_export(imported):
    root, profile = imported
    ship_path = root / profile["ship_sdf"]
    mesh = ship_path.parent / "meshes/triangle.obj"
    mesh.parent.mkdir()
    mesh.write_text("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
    sdf = ET.parse(ship_path)
    ship = sdf.find("model")
    frame = ET.SubElement(ship, "frame", name="new_mount")
    ET.SubElement(frame, "pose").text = "2 3 4 0 0 0"
    body = ET.SubElement(ship, "link", name="imported_detail")
    ET.SubElement(body, "pose", relative_to="new_mount").text = "1 0 0 0 0 0"
    visual = ET.SubElement(body, "visual", name="detail")
    item = ET.SubElement(ET.SubElement(visual, "geometry"), "mesh")
    ET.SubElement(item, "uri").text = "meshes/triangle.obj"
    ET.SubElement(item, "scale").text = "2 2 2"
    sdf.write(ship_path)
    result = build_environment(root, profile)
    scene = json.loads(result["config/scene.json"])
    detail = next(link for entity in scene["entities"] for link in entity["links"] if link["id"] == "starship::imported_detail")
    assert detail["pose_in_model"]["position"] == dict(x=3, y=3, z=4)
    assert detail["visuals"][0]["geometry"]["scale"] == [2, 2, 2]
    assert detail["visuals"][0]["geometry"]["uri"] == f'/api/v1/assets/{scene["revision"]}/models/starship/meshes/triangle.obj'
    assert "file:///workspace/assets/models/starship/meshes/triangle.obj" in result["worlds/environment.sdf"]
    changed = build_environment(root, profile)
    mesh.write_text(mesh.read_text() + "# edited mesh\n")
    updated = json.loads(build_environment(root, profile)["config/scene.json"])
    assert updated["revision"] != json.loads(changed["config/scene.json"])["revision"]
    updated_detail = next(link for entity in updated["entities"] for link in entity["links"] if link["id"] == "starship::imported_detail")
    assert updated_detail["visuals"][0]["geometry"]["uri"] != detail["visuals"][0]["geometry"]["uri"]


def test_asset_server_serves_imports_and_rejects_directory_escape(imported):
    root, profile = imported
    scene = root / "scene.json"
    scene.write_text(build_environment(root, profile)["config/scene.json"])
    outside = root / "private.txt"
    outside.write_text("private")
    with TestClient(create_app(backend=ContractBackend(), scene_path=scene, assets_dir=root / "assets")) as client:
        revision = json.loads(scene.read_text())["revision"]
        assert client.get(f"/api/v1/assets/{revision}/models/starship/model.sdf").status_code == 200
        assert client.get(f"/api/v1/assets/{revision}/%2e%2e/private.txt").status_code == 404


def test_invalid_joint_mapping_fails_before_building_a_broken_ship(imported):
    root, profile = imported
    profile["arms"][0]["joints"]["yaw"] = "missing_joint"
    with pytest.raises(ValueError, match="must exist"):
        build_environment(root, profile)


def test_import_rejects_meshes_outside_the_asset_directory(imported):
    root, profile = imported
    ship_path = root / profile["ship_sdf"]
    sdf = ET.parse(ship_path)
    geometry = sdf.find("model/link/visual/geometry")
    geometry.clear()
    ET.SubElement(ET.SubElement(geometry, "mesh"), "uri").text = "../../../../outside.obj"
    (root / "outside.obj").write_text("not an allowed asset")
    sdf.write(ship_path)
    with pytest.raises(ValueError, match="inside assets"):
        build_environment(root, profile)
