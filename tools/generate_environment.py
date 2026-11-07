"""Generate the SDF, browser scene description and ROS bridge from one definition."""

import argparse
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WORLD = "deep_space"
ARMS = {
    "power": (-5, -2.5, math.pi / 2),
    "life_support": (4, -2.5, math.pi / 2),
    "thermal": (-5, 2.5, -math.pi / 2),
    "navigation": (4, 2.5, -math.pi / 2),
}
LIMITS = {"yaw": (-1.57, 1.57), "shoulder": (-1.2, 1.2), "elbow": (-1.5, 1.5)}


def element(parent, tag, value=None, **attrs):
    child = ET.SubElement(parent, tag, attrs)
    if value is not None:
        child.text = str(value)
    return child


def pose(parent, values):
    element(parent, "pose", " ".join(f"{v:.9g}" for v in values))


def shape(parent, kind, dimensions):
    geometry = element(parent, "geometry")
    item = element(geometry, kind)
    if kind == "box":
        element(item, "size", " ".join(map(str, dimensions)))
    elif kind == "sphere":
        element(item, "radius", dimensions[0])
    else:
        element(item, "radius", dimensions[0])
        element(item, "length", dimensions[1])


def visual(link, name, kind, dimensions, color, position=(0, 0, 0), collision=True):
    item = element(link, "visual", name=name)
    pose(item, (*position, 0, 0, 0))
    shape(item, kind, dimensions)
    material = element(item, "material")
    element(material, "ambient", color)
    element(material, "diffuse", color)
    if collision:
        item = element(link, "collision", name=name + "_collision")
        pose(item, (*position, 0, 0, 0))
        shape(item, kind, dimensions)


def link(model, name, position, yaw=0, mass=1, inertia=(1, 1, 1), center=(0, 0, 0)):
    item = element(model, "link", name=name)
    pose(item, (*position, 0, 0, yaw))
    inertial = element(item, "inertial")
    pose(inertial, (*center, 0, 0, 0))
    element(inertial, "mass", mass)
    tensor = element(inertial, "inertia")
    for axis, value in zip(("ixx", "iyy", "izz"), inertia):
        element(tensor, axis, value)
    for axis in ("ixy", "ixz", "iyz"):
        element(tensor, axis, 0)
    return item


def plugin(parent, filename, name):
    return element(parent, "plugin", filename="gz-sim-" + filename + "-system",
                   name="gz::sim::systems::" + name)


def joint(model, name, parent, child, axis=None, limits=None):
    item = element(model, "joint", name=name, type="revolute" if axis else "fixed")
    element(item, "parent", parent)
    element(item, "child", child)
    if axis:
        a = element(item, "axis")
        element(a, "xyz", axis)
        limit = element(a, "limit")
        element(limit, "lower", limits[0])
        element(limit, "upper", limits[1])
        element(limit, "effort", 200)
        element(limit, "velocity", 1)
        element(element(a, "dynamics"), "damping", 2)


def build_world():
    sdf = ET.Element("sdf", version="1.9")
    world = element(sdf, "world", name=WORLD)
    element(world, "gravity", "0 0 0")
    physics = element(world, "physics", name="zero_g", type="ignored")
    element(physics, "max_step_size", 0.002)
    element(physics, "real_time_factor", 1)
    for filename, name in (("physics", "Physics"), ("user-commands", "UserCommands"),
                           ("scene-broadcaster", "SceneBroadcaster")):
        plugin(world, filename, name)
    scene = element(world, "scene")
    element(scene, "ambient", "0.2 0.23 0.3 1")
    element(scene, "background", "0.002 0.003 0.012 1")
    element(scene, "shadows", "true")
    light = element(world, "light", name="starlight", type="directional")
    pose(light, (0, 0, 100, 0, 0, 0))
    element(light, "direction", "-0.3 0.2 -1")
    element(light, "diffuse", "0.9 0.93 1 1")
    element(light, "specular", "0.4 0.4 0.4 1")
    element(light, "cast_shadows", "true")

    ship = element(world, "model", name="starship")
    element(ship, "self_collide", "true")
    pose(ship, (0, 0, 0, 0, 0, 0))
    hull = link(ship, "hull", (0, 0, 0), mass=12000, inertia=(80000, 280000, 320000))
    visual(hull, "deck", "box", (18, 8, 0.4), "0.16 0.22 0.31 1", (0, 0, 0))
    # An open top makes the interior and robotic arms inspectable.
    for side in (-1, 1):
        visual(hull, f"wall_{side}", "box", (18, 0.25, 2.5), "0.32 0.42 0.55 1",
               (0, side * 3.875, 1.45))
        visual(hull, f"engine_{side}", "cylinder", (0.65, 1.4), "0.12 0.55 0.85 1",
               (-8, side * 2.5, -1))
    visual(hull, "bow", "box", (0.4, 8, 1), "0.35 0.55 0.72 1", (8.8, 0, 0.7))
    for name, x, y, color in (("power", -5, -0.8, "0.95 0.65 0.12 1"),
                               ("life_support", 4, -0.8, "0.2 0.8 0.5 1"),
                               ("thermal", -5, 0.8, "0.2 0.65 0.95 1"),
                               ("navigation", 4, 0.8, "0.7 0.4 0.95 1")):
        visual(hull, name + "_equipment", "box", (1.4, 0.8, 0.6), color, (x, y, 0.5))

    for arm, (x, y, yaw) in ARMS.items():
        prefix = "arm_" + arm
        base = link(ship, prefix + "_base", (x, y, 0.4), yaw, mass=5,
                    inertia=(0.1, 0.1, 0.1))
        visual(base, "mount", "cylinder", (0.25, 0.4), "0.3 0.35 0.4 1")
        joint(ship, prefix + "_mount", "hull", prefix + "_base")
        hub = link(ship, prefix + "_yaw_link", (x, y, 0.75), yaw, mass=2,
                   inertia=(0.04, 0.04, 0.04))
        visual(hub, "hub", "sphere", (0.18,), "0.95 0.65 0.15 1")
        upper = link(ship, prefix + "_upper", (x, y, 1.05), yaw, mass=3,
                     inertia=(0.02, 0.26, 0.26), center=(0.5, 0, 0))
        visual(upper, "upper", "box", (1, 0.14, 0.14), "0.85 0.88 0.93 1", (0.5, 0, 0))
        lower = link(ship, prefix + "_forearm", (x + math.cos(yaw), y + math.sin(yaw), 1.05),
                     yaw, mass=2, inertia=(0.01, 0.11, 0.11), center=(0.4, 0, 0))
        visual(lower, "forearm", "box", (0.8, 0.12, 0.12), "0.55 0.68 0.8 1", (0.4, 0, 0))
        visual(lower, "tool_tip", "sphere", (0.12,), "0.15 0.85 0.9 1", (0.85, 0, 0))
        for name, parent, child, axis in (
            ("yaw", prefix + "_base", prefix + "_yaw_link", "0 0 1"),
            ("shoulder", prefix + "_yaw_link", prefix + "_upper", "0 1 0"),
            ("elbow", prefix + "_upper", prefix + "_forearm", "0 1 0"),
        ):
            full_name = prefix + "_" + name
            joint(ship, full_name, parent, child, axis, LIMITS[name])
            control = plugin(ship, "joint-position-controller", "JointPositionController")
            for tag, value in (("joint_name", full_name), ("topic", f"/arms/{arm}/{name}/target"),
                               ("p_gain", 80), ("d_gain", 12), ("i_gain", 0),
                               ("cmd_min", -200), ("cmd_max", 200)):
                element(control, tag, value)

    plugin(ship, "velocity-control", "VelocityControl")
    publisher = plugin(ship, "pose-publisher", "PosePublisher")
    for tag, value in (("publish_link_pose", "true"), ("publish_model_pose", "true"),
                       ("use_pose_vector_msg", "true"), ("update_frequency", 20),
                       ("topic", "/starship/poses")):
        element(publisher, tag, value)
    publisher = plugin(ship, "joint-state-publisher", "JointStatePublisher")
    element(publisher, "topic", "/starship/joint_states")

    for name, position, radius, color in (
        ("destination_planet", (600, 0, 0), 45, "0.14 0.45 0.8 1"),
        ("departure_planet", (-180, -100, -70), 35, "0.65 0.3 0.16 1"),
        ("moon", (560, 120, 45), 12, "0.5 0.52 0.57 1"),
        ("asteroid_1", (150, 35, 15), 3, "0.38 0.3 0.22 1"),
        ("asteroid_2", (280, -45, -10), 5, "0.42 0.35 0.26 1"),
    ):
        model = element(world, "model", name=name)
        element(model, "static", "true")
        pose(model, (*position, 0, 0, 0))
        body = link(model, "body", (0, 0, 0))
        visual(body, "surface", "sphere", (radius,), color)
    return sdf


def read_pose(parent):
    values = [float(v) for v in parent.findtext("pose", "0 0 0 0 0 0").split()]
    x, y, z, roll, pitch, yaw = values
    cr, sr = math.cos(roll / 2), math.sin(roll / 2)
    cp, sp = math.cos(pitch / 2), math.sin(pitch / 2)
    cy, sy = math.cos(yaw / 2), math.sin(yaw / 2)
    return {"position": {"x": x, "y": y, "z": z}, "orientation": {
        "x": sr * cp * cy - cr * sp * sy, "y": cr * sp * cy + sr * cp * sy,
        "z": cr * cp * sy - sr * sp * cy, "w": cr * cp * cy + sr * sp * sy}}


def export_scene(sdf):
    entities = []
    for model in sdf.findall("world/model"):
        links = []
        for body in model.findall("link"):
            visuals = []
            for item in body.findall("visual"):
                geometry = item.find("geometry")[0]
                dimensions = {v.tag: [float(n) for n in v.text.split()] for v in geometry}
                visuals.append({"id": item.get("name"), "pose": read_pose(item),
                                "geometry": {"type": geometry.tag, **dimensions},
                                "color": [float(v) for v in item.findtext("material/diffuse").split()]})
            links.append({"id": model.get("name") + "::" + body.get("name"),
                          "pose_in_model": read_pose(body), "visuals": visuals})
        entities.append({"id": model.get("name"), "dynamic": model.findtext("static") != "true",
                         "pose_in_world": read_pose(model), "links": links})
    return {"schema_version": 1, "world": WORLD, "units": "meters", "up_axis": "Z",
            "travel_model": "compressed_scale_straight_line", "entities": entities,
            "destination": {"entity_id": "destination_planet", "stop_distance_m": 70},
            "arms": [{"id": arm, "system": arm, "joints": {
                name: {"joint_name": f"arm_{arm}_{name}", "lower_rad": bounds[0],
                       "upper_rad": bounds[1]} for name, bounds in LIMITS.items()}} for arm in ARMS]}


def bridge_config():
    entries = [
        ("/world/deep_space/clock", "/clock", "rosgraph_msgs/msg/Clock", "gz.msgs.Clock", "GZ_TO_ROS"),
        ("/world/deep_space/stats", "/simulation/stats", "ros_gz_interfaces/msg/WorldStatistics", "gz.msgs.WorldStatistics", "GZ_TO_ROS"),
        ("/starship/poses", "/starship/poses", "tf2_msgs/msg/TFMessage", "gz.msgs.Pose_V", "GZ_TO_ROS"),
        ("/starship/joint_states", "/starship/joint_states", "sensor_msgs/msg/JointState", "gz.msgs.Model", "GZ_TO_ROS"),
        ("/model/starship/cmd_vel", "/starship/cmd_vel", "geometry_msgs/msg/Twist", "gz.msgs.Twist", "ROS_TO_GZ"),
    ]
    for arm in ARMS:
        for name in LIMITS:
            topic = f"/arms/{arm}/{name}/target"
            entries.append((topic, topic, "std_msgs/msg/Float64", "gz.msgs.Double", "ROS_TO_GZ"))
    lines = ["# Generated by tools/generate_environment.py"]
    for gz_topic, ros_topic, ros_type, gz_type, direction in entries:
        lines.extend((f"- ros_topic_name: {ros_topic}", f"  gz_topic_name: {gz_topic}",
                      f"  ros_type_name: {ros_type}", f"  gz_type_name: {gz_type}",
                      f"  direction: {direction}"))
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated assets have drifted")
    args = parser.parse_args()
    sdf = build_world()
    scene = export_scene(sdf)
    ET.indent(sdf)
    files = {"worlds/deep_space.sdf": '<?xml version="1.0"?>\n' + ET.tostring(sdf, encoding="unicode") + "\n",
             "config/scene.json": json.dumps(scene, indent=2) + "\n", "config/bridge.yaml": bridge_config()}
    for name, content in files.items():
        path = ROOT / name
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                raise SystemExit(f"Regenerate {name}: python tools/generate_environment.py")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    print("Environment assets are consistent." if args.check else "Generated world, scene and bridge.")


if __name__ == "__main__":
    main()
