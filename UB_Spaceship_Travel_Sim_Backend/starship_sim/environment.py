"""Load replaceable SDF assets into one physics/rendering/command contract."""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import quote
import xml.etree.ElementTree as ET

IDENTITY = {"position": dict(x=0., y=0., z=0.), "orientation": dict(x=0., y=0., z=0., w=1.)}
RUNTIME_PLUGINS = {"VelocityControl", "PosePublisher", "JointStatePublisher", "JointPositionController"}


def numbers(text, length):
    result = [float(value) for value in text.split()]
    if len(result) != length or not all(math.isfinite(value) for value in result):
        raise ValueError(f"Expected {length} finite numbers: {text}")
    return result


def read_pose(node):
    x, y, z, roll, pitch, yaw = numbers(node.findtext("pose", "0 0 0 0 0 0"), 6)
    cr, sr, cp, sp, cy, sy = math.cos(roll/2), math.sin(roll/2), math.cos(pitch/2), math.sin(pitch/2), math.cos(yaw/2), math.sin(yaw/2)
    return {"position": dict(x=x, y=y, z=z), "orientation": dict(
        x=sr*cp*cy-cr*sp*sy, y=cr*sp*cy+sr*cp*sy,
        z=cr*cp*sy-sr*sp*cy, w=cr*cp*cy+sr*sp*sy)}


def multiply(a, b):
    x, y, z, w = [a[key] for key in "xyzw"]
    i, j, k, r = [b[key] for key in "xyzw"]
    return dict(x=w*i+x*r+y*k-z*j, y=w*j-x*k+y*r+z*i,
                z=w*k+x*j-y*i+z*r, w=w*r-x*i-y*j-z*k)


def rotate(vector, q):
    rotated = multiply(multiply(q, dict(**vector, w=0)), dict(x=-q["x"], y=-q["y"], z=-q["z"], w=q["w"]))
    return {key: rotated[key] for key in "xyz"}


def compose(a, b):
    moved = rotate(b["position"], a["orientation"])
    return {"position": {key: a["position"][key] + moved[key] for key in "xyz"},
            "orientation": multiply(a["orientation"], b["orientation"])}


def inverse(pose):
    q = pose["orientation"]
    q = dict(x=-q["x"], y=-q["y"], z=-q["z"], w=q["w"])
    return {"position": rotate({key: -pose["position"][key] for key in "xyz"}, q), "orientation": q}


class Frames:
    def __init__(self, parent, origin):
        self.origin = origin
        self.nodes = {node.get("name"): node for node in parent if node.tag in {"frame", "link", "joint", "model"}}
        self.cache = {origin: IDENTITY}

    def resolve(self, name, trail=()):
        if name in self.cache:
            return self.cache[name]
        if name in trail or name not in self.nodes:
            raise ValueError(f"Unknown or cyclic SDF frame: {name}")
        node = self.nodes[name]
        default = node.findtext("child", self.origin) if node.tag == "joint" else node.get("attached_to", self.origin)
        result = self.at(node, default, (*trail, name))
        self.cache[name] = result
        return result

    def at(self, node, default, trail=()):
        pose = node.find("pose")
        if pose is not None and (pose.get("degrees") == "true" or pose.get("rotation_format", "euler_rpy") != "euler_rpy"):
            raise ValueError("Import poses as radian Euler RPY values before generation")
        relative = pose.get("relative_to", default) if pose is not None else default
        return compose(self.resolve(relative, trail), read_pose(node))


def plugin(parent, slug, name):
    return ET.SubElement(parent, "plugin", filename=f"gz-sim-{slug}-system", name=f"gz::sim::systems::{name}")


def values(parent, **items):
    for name, value in items.items():
        ET.SubElement(parent, name).text = str(value)


def pose_publisher(model):
    values(plugin(model, "pose-publisher", "PosePublisher"), publish_link_pose="true", publish_model_pose="true",
           use_pose_vector_msg="true", update_frequency=20, topic="/starship/poses")


def asset_path(root, value, source=None):
    assets = (root / "assets").resolve()
    if value.startswith("model://"):
        tail = value.removeprefix("model://")
        candidates = [assets / tail, assets / "models" / tail, assets / "imported" / tail]
        path = next((path for path in candidates if path.is_file()), candidates[0])
    elif "://" in value and not value.startswith("file://"):
        raise ValueError(f"Vendor this external asset into assets/ first: {value}")
    else:
        path = Path(value.removeprefix("file://"))
        if not path.is_absolute():
            path = (source.parent if source is not None else root) / path
    path = path.resolve()
    if not path.is_relative_to(assets) or not path.is_file():
        raise ValueError(f"Asset must exist inside assets/: {value}")
    return path


def rewrite_assets(root, node, source):
    for item in node.iter():
        if item.tag in {"uri", "albedo_map", "normal_map", "roughness_map", "metalness_map", "emissive_map"} and item.text:
            path = asset_path(root, item.text.strip(), source)
            item.text = "file:///workspace/assets/" + path.relative_to(root / "assets").as_posix()


def geometry(node):
    item = node.find("geometry")
    if item is None or len(item) != 1:
        raise ValueError("Each visual needs one supported geometry")
    shape = item[0]
    kind = shape.tag
    dimensions = {child.tag: child.text for child in shape}
    if kind == "mesh":
        uri = dimensions.get("uri", "")
        prefix = "file:///workspace/assets/"
        if not uri.startswith(prefix):
            raise ValueError(f"Unresolved mesh asset: {uri}")
        extension = Path(uri).suffix.lower()
        if extension not in {".glb", ".gltf", ".stl", ".obj", ".dae"}:
            raise ValueError(f"Unsupported browser mesh format: {extension}")
        if shape.find("submesh") is not None:
            raise ValueError("Export SDF submeshes as separate mesh files before importing")
        return {"type": kind, "uri": "/api/v1/assets/" + quote(uri.removeprefix(prefix), safe="/"),
                "format": extension[1:], "scale": numbers(dimensions.get("scale", "1 1 1"), 3)}
    specs = {"box": {"size": 3}, "sphere": {"radius": 1}, "cylinder": {"radius": 1, "length": 1},
             "capsule": {"radius": 1, "length": 1}, "plane": {"size": 2, "normal": 3}}
    if kind not in specs:
        raise ValueError(f"Unsupported geometry: {kind}. Use a mesh or supported primitive.")
    result = {"type": kind}
    for key, count in specs[kind].items():
        result[key] = numbers(dimensions.get(key, "0 0 1" if key == "normal" else ""), count)
        if key != "normal" and any(value <= 0 for value in result[key]):
            raise ValueError(f"Geometry dimensions must be positive: {kind}")
    return result


def scene_from_world(world, profile):
    world_frames = Frames(world, "world")
    entities = []
    for model in world.findall("model"):
        frames = Frames(model, "__model__")
        links = []
        for body in model.findall("link"):
            body_pose = frames.resolve(body.get("name"))
            visuals = []
            for item in body.findall("visual"):
                color = numbers(item.findtext("material/diffuse", "0.65 0.7 0.8 1"), 4)
                color[3] *= 1 - float(item.findtext("transparency", "0"))
                visuals.append({"id": item.get("name"), "pose": compose(inverse(body_pose), frames.at(item, body.get("name"))),
                                "geometry": geometry(item), "color": color,
                                "material_override": item.find("material/diffuse") is not None})
            links.append({"id": f'{model.get("name")}::{body.get("name")}', "pose_in_model": body_pose, "visuals": visuals})
        entities.append({"id": model.get("name"), "dynamic": model.findtext("static", "false").lower() != "true",
                         "pose_in_world": world_frames.resolve(model.get("name")), "links": links})
    return {"schema_version": 1, "world": world.get("name"), "units": "meters", "up_axis": "Z",
            "ship_entity_id": profile["ship_entity_id"], "travel_model": "compressed_scale_straight_line",
            "cruise_speed_m_s": profile.get("cruise_speed_m_s", 2), "destination": profile["destination"], "entities": entities}


def bridge_config(scene):
    world, ship = scene["world"], scene["ship_entity_id"]
    entries = [
        (f"/world/{world}/clock", "/clock", "rosgraph_msgs/msg/Clock", "gz.msgs.Clock", "GZ_TO_ROS"),
        (f"/world/{world}/stats", "/simulation/stats", "ros_gz_interfaces/msg/WorldStatistics", "gz.msgs.WorldStatistics", "GZ_TO_ROS"),
        ("/starship/poses", "/starship/poses", "tf2_msgs/msg/TFMessage", "gz.msgs.Pose_V", "GZ_TO_ROS"),
        ("/starship/joint_states", "/starship/joint_states", "sensor_msgs/msg/JointState", "gz.msgs.Model", "GZ_TO_ROS"),
        (f"/model/{ship}/cmd_vel", "/starship/cmd_vel", "geometry_msgs/msg/Twist", "gz.msgs.Twist", "ROS_TO_GZ"),
    ]
    for arm in scene["arms"]:
        for name in arm["joints"]:
            topic = f'/arms/{arm["id"]}/{name}/target'
            entries.append((topic, topic, "std_msgs/msg/Float64", "gz.msgs.Double", "ROS_TO_GZ"))
    lines = ["# Generated from config/environment.json and imported SDF assets"]
    for gz_topic, ros_topic, ros_type, gz_type, direction in entries:
        lines.extend((f"- ros_topic_name: {ros_topic}", f"  gz_topic_name: {gz_topic}",
                      f"  ros_type_name: {ros_type}", f"  gz_type_name: {gz_type}", f"  direction: {direction}"))
    return "\n".join(lines) + "\n"


def build_environment(root, profile):
    root = Path(root).resolve()
    map_path, ship_path = [asset_path(root, profile[key]) for key in ("map_sdf", "ship_sdf")]
    world = deepcopy(ET.parse(map_path).getroot().find("world"))
    ship = deepcopy(ET.parse(ship_path).getroot().find("model"))
    if world is None or ship is None:
        raise ValueError("map_sdf needs <sdf><world>; ship_sdf needs <sdf><model>")
    if world.find(".//include") is not None or ship.find(".//include") is not None or world.find("model/model") is not None or ship.find("model") is not None:
        raise ValueError("Flatten nested models and <include> elements into top-level models/links before import")
    for identifier in (world.get("name", ""), profile["ship_entity_id"], *[arm["id"] for arm in profile["arms"]]):
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
            raise ValueError(f"Invalid world/ship/arm identifier: {identifier}")
    ship.set("name", profile["ship_entity_id"])
    if ship.findtext("static", "false").lower() == "true":
        raise ValueError("The ship model must be dynamic")
    rewrite_assets(root, world, map_path)
    rewrite_assets(root, ship, ship_path)
    for item in list(ship.findall("plugin")):
        if item.get("name", "").split("::")[-1] in RUNTIME_PLUGINS:
            ship.remove(item)
    if world.find(f'model[@name="{profile["ship_entity_id"]}"]') is not None:
        raise ValueError("Map already contains the configured ship ID")
    world.append(ship)
    for slug, name in (("physics", "Physics"), ("user-commands", "UserCommands"), ("scene-broadcaster", "SceneBroadcaster")):
        if not any(item.get("name", "").endswith("::" + name) for item in world.findall("plugin")):
            plugin(world, slug, name)
    plugin(ship, "velocity-control", "VelocityControl")
    pose_publisher(ship)
    values(plugin(ship, "joint-state-publisher", "JointStatePublisher"), topic="/starship/joint_states")
    for model in world.findall("model"):
        if model is not ship and model.findtext("static", "false").lower() != "true":
            pose_publisher(model)
    arms, configured_joints = [], set()
    if len({arm["id"] for arm in profile["arms"]}) != len(profile["arms"]):
        raise ValueError("Arm IDs must be unique")
    for arm in profile["arms"]:
        metadata = {"id": arm["id"], "system": arm.get("system", arm["id"]), "joints": {}}
        if not arm["joints"]:
            raise ValueError(f'Arm {arm["id"]} must map at least one joint')
        for name, joint_name in arm["joints"].items():
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) or joint_name in configured_joints:
                raise ValueError("Joint command names must be valid; assign each joint once")
            configured_joints.add(joint_name)
            item = next((joint for joint in ship.findall("joint") if joint.get("name") == joint_name), None)
            if item is None or item.get("type") != "revolute":
                raise ValueError(f"Arm joint must exist and be revolute: {joint_name}")
            lower, upper = float(item.findtext("axis/limit/lower", "nan")), float(item.findtext("axis/limit/upper", "nan"))
            if not math.isfinite(lower) or not math.isfinite(upper) or lower >= upper:
                raise ValueError(f"Arm joint needs finite lower/upper limits: {joint_name}")
            metadata["joints"][name] = {"joint_name": joint_name, "lower_rad": lower, "upper_rad": upper}
            values(plugin(ship, "joint-position-controller", "JointPositionController"), joint_name=joint_name,
                   topic=f'/arms/{arm["id"]}/{name}/target', p_gain=80, d_gain=12, i_gain=0, cmd_min=-200, cmd_max=200)
        arms.append(metadata)
    scene = scene_from_world(world, profile)
    scene["arms"] = arms
    ids = [entity["id"] for entity in scene["entities"]]
    if len(set(ids)) != len(ids) or scene["destination"]["entity_id"] not in ids:
        raise ValueError("Entity IDs must be unique and the destination must exist in the map")
    stop, speed = scene["destination"]["stop_distance_m"], scene["cruise_speed_m_s"]
    if not all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0 for value in (stop, speed)):
        raise ValueError("Stop distance and cruise speed must be positive finite numbers")
    digest = hashlib.sha256(json.dumps(scene, sort_keys=True).encode())
    for path in sorted((root / "assets").rglob("*")):
        if path.is_file():
            digest.update(path.relative_to(root).as_posix().encode())
            with path.open("rb") as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
    scene["revision"] = digest.hexdigest()[:20]
    # Version the entire asset directory, including relative glTF/Collada
    # dependencies, so browser and useLoader caches cannot retain old meshes.
    for entity in scene["entities"]:
        for body in entity["links"]:
            for visual in body["visuals"]:
                if visual["geometry"]["type"] == "mesh":
                    visual["geometry"]["uri"] = visual["geometry"]["uri"].replace(
                        "/api/v1/assets/", f'/api/v1/assets/{scene["revision"]}/', 1)
    sdf = ET.Element("sdf", version="1.9")
    sdf.append(world)
    ET.indent(sdf)
    return {"worlds/environment.sdf": '<?xml version="1.0"?>\n' + ET.tostring(sdf, encoding="unicode") + "\n",
            "config/scene.json": json.dumps(scene, indent=2) + "\n", "config/bridge.yaml": bridge_config(scene)}
