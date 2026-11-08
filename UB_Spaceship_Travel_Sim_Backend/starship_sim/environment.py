"""Load replaceable SDF assets into one physics/rendering/command contract."""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import quote
import xml.etree.ElementTree as ET
from starship_sim.spacecraft import COMPONENTS, SimulationConfig

IDENTITY = {"position": dict(x=0., y=0., z=0.), "orientation": dict(x=0., y=0., z=0., w=1.)}
RUNTIME_PLUGINS = {"VelocityControl", "PosePublisher", "JointStatePublisher", "JointPositionController", "Physics"}


def canonical_numbers(value):
    """Keep exported poses and revisions stable across host libm implementations."""
    if isinstance(value, float):
        return round(value, 12) or 0.
    if isinstance(value, dict):
        return {key: canonical_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [canonical_numbers(item) for item in value]
    return value


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
    scene = {"schema_version": 1, "world": world.get("name"), "units": "meters", "up_axis": "Z",
            "ship_entity_id": profile["ship_entity_id"], "travel_model": "compressed_scale_straight_line",
            "cruise_speed_m_s": profile.get("cruise_speed_m_s", 2), "destination": profile["destination"], "entities": entities}
    metadata = profile.get("map", {})
    annotations = metadata.get("objects", {})
    ids = {entity["id"] for entity in entities}
    if set(annotations) - ids or (metadata.get("origin_entity_id") and metadata["origin_entity_id"] not in ids):
        raise ValueError("Map annotations and origin must reference existing entities")
    objects = []
    for entity, model in zip(entities, world.findall("model")):
        if entity["id"] == profile["ship_entity_id"]:
            continue
        visuals = [visual for link in entity["links"] for visual in link["visuals"]]
        visual = next((v for v in visuals if v["geometry"]["type"] == "sphere"), visuals[0] if visuals else None)
        item = {"entity_id": entity["id"], "label": entity["id"].replace("_", " ").title(),
                "kind": "object", "radius_m": 5., "color": visual["color"] if visual else [.6, .7, .8, 1.]}
        if visual and visual["geometry"]["type"] == "sphere":
            item["radius_m"] = visual["geometry"]["radius"][0]
        annotation = annotations.get(entity["id"], {})
        if set(annotation) - {"label", "kind", "description"}:
            raise ValueError("Map annotations accept only label, kind and description")
        item.update(annotation)
        for controller in model.findall("plugin"):
            if not controller.get("name", "").endswith("::JointController"):
                continue
            joint = model.find(f'joint[@name="{controller.findtext("joint_name")}"]')
            if joint is None or joint.findtext("parent") != "world" or joint.get("type") != "revolute":
                continue
            axis = numbers(joint.findtext("axis/xyz", "0 0 1"), 3)
            if axis != [0., 0., 1.]:
                raise ValueError("Map orbits must rotate around the Z axis")
            center = compose(entity["pose_in_world"], Frames(model, "__model__").resolve(joint.get("name")))["position"]
            omega = float(controller.findtext("initial_velocity", "0"))
            if not math.isfinite(omega) or omega == 0:
                raise ValueError("Map orbit controllers need a finite nonzero initial velocity")
            item["orbit"] = {"center": center,
                             "radius_m": math.dist(list(center.values()), list(entity["pose_in_world"]["position"].values())),
                             "angular_speed_rad_s": omega, "period_s": 2 * math.pi / abs(omega),
                             "velocity_topic": controller.findtext("topic", f'/model/{entity["id"]}/joint/{joint.get("name")}/cmd_vel')}
            break
        objects.append(item)
    scene["map"] = {"title": metadata.get("title", world.get("name").replace("_", " ").title()),
                    "description": metadata.get("description", "Coordinates and geometry come from the selected backend map."),
                    "origin_entity_id": metadata.get("origin_entity_id"), "objects": objects}
    return scene


def bridge_config(scene):
    world, ship = scene["world"], scene["ship_entity_id"]
    entries = [
        (f"/world/{world}/clock", "/clock", "rosgraph_msgs/msg/Clock", "gz.msgs.Clock", "GZ_TO_ROS"),
        (f"/world/{world}/stats", "/simulation/stats", "ros_gz_interfaces/msg/WorldStatistics", "gz.msgs.WorldStatistics", "GZ_TO_ROS"),
        ("/starship/poses", "/starship/poses", "tf2_msgs/msg/TFMessage", "gz.msgs.Pose_V", "GZ_TO_ROS"),
    ]
    if scene.get('physics'):
        for name, direction in [('command', 'ROS_TO_GZ'), ('impact', 'ROS_TO_GZ'), ('state', 'GZ_TO_ROS')]:
            topic = f'/starship/physics/{name}'
            entries.append((topic, topic, 'std_msgs/msg/String', 'gz.msgs.StringMsg', direction))
    else:
        entries.append(('/starship/joint_states', '/starship/joint_states', 'sensor_msgs/msg/JointState', 'gz.msgs.Model', 'GZ_TO_ROS'))
        entries.append((f'/model/{ship}/cmd_vel', '/starship/cmd_vel', 'geometry_msgs/msg/Twist', 'gz.msgs.Twist', 'ROS_TO_GZ'))
    for arm in scene["arms"]:
        for name in arm["joints"]:
            topic = f'/arms/{arm["id"]}/{name}/target'
            entries.append((topic, topic, "std_msgs/msg/Float64", "gz.msgs.Double", "ROS_TO_GZ"))
    for panel in scene.get("solar_panels", []):
        topic = f'/solar_panels/{panel["id"]}/target'
        entries.append((topic, topic, "std_msgs/msg/Float64", "gz.msgs.Double", "ROS_TO_GZ"))
    for item in scene["map"]["objects"]:
        if "orbit" in item:
            topic = item["orbit"]["velocity_topic"]
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
    if "ship_spawn" in profile:
        spawn = profile["ship_spawn"]
        reference = Frames(world, "world").resolve(spawn["entity_id"])
        offset = numbers(" ".join(map(str, spawn["offset_m"])), 3)
        yaw = float(spawn.get("yaw_rad", 0))
        if not math.isfinite(yaw):
            raise ValueError("Ship spawn yaw must be finite")
        pose = ship.find("pose")
        if pose is None:
            pose = ET.SubElement(ship, "pose")
        pose.attrib.clear()
        pose.text = " ".join(map(str, [reference["position"][a] + offset[i] for i, a in enumerate("xyz")] + [0, 0, yaw]))
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
    if not profile.get('physics'): plugin(ship, "velocity-control", "VelocityControl")
    pose_publisher(ship)
    if not profile.get('physics'):
        values(plugin(ship, "joint-state-publisher", "JointStatePublisher"), topic="/starship/joint_states")
    for model in world.findall("model"):
        if model is not ship and model.findtext("static", "false").lower() != "true":
            pose_publisher(model)
    arms, configured_joints = [], set()
    if len({arm["id"] for arm in profile["arms"]}) != len(profile["arms"]):
        raise ValueError("Arm IDs must be unique")
    frames = Frames(ship, '__model__')
    module_ids = set()
    modules = []
    for module in profile.get('ship_modules', []):
        if module['id'] in module_ids or ship.find(f'link[@name="{module["link_name"]}"]') is None:
            raise ValueError('Ship modules need unique IDs and existing links')
        module_ids.add(module['id'])
        modules.append({**module, 'pose_in_body': frames.resolve(module['link_name'])})
    for arm in profile["arms"]:
        metadata = {"id": arm["id"], "label": arm.get('label', arm['id'].replace('_', ' ').title()),
                    "system": arm.get("system", arm["id"]), 'owner_system': 'robot_arms', "joints": {}}
        if not arm["joints"]:
            raise ValueError(f'Arm {arm["id"]} must map at least one joint')
        for name, specification in arm["joints"].items():
            specification = {'joint_name': specification} if isinstance(specification, str) else specification
            joint_name = specification['joint_name']
            names = [joint_name, *specification.get('coupled_joint_names', [])]
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) or len(set(names)) != len(names) or set(names) & configured_joints:
                raise ValueError("Joint command names must be valid; assign each joint once")
            configured_joints.update(names)
            item = ship.find(f'joint[@name="{joint_name}"]')
            if item is None or item.get('type') not in {'revolute', 'prismatic'}:
                raise ValueError(f'Arm joint must exist and be revolute or prismatic: {joint_name}')
            lower, upper = float(item.findtext("axis/limit/lower", "nan")), float(item.findtext("axis/limit/upper", "nan"))
            if not math.isfinite(lower) or not math.isfinite(upper) or lower >= upper:
                raise ValueError(f"Arm joint needs finite lower/upper limits: {joint_name}")
            for coupled_name in names[1:]:
                coupled = ship.find(f'joint[@name="{coupled_name}"]')
                if coupled is None or coupled.get('type') != item.get('type') or any(
                    not math.isclose(float(coupled.findtext(f'axis/limit/{tag}', 'nan')), value, abs_tol=1e-9)
                    for tag, value in [('lower', lower), ('upper', upper)]):
                    raise ValueError('Coupled gripper joints must have identical types and limits')
            scale, offset = float(specification.get('scale', 1.)), float(specification.get('offset', 0.))
            unit = specification.get('unit', 'rad' if item.get('type') == 'revolute' else 'm')
            if not math.isfinite(scale) or scale <= 0 or not math.isfinite(offset) or unit not in ({'rad'} if item.get('type') == 'revolute' else {'m', 'fraction'}):
                raise ValueError('Invalid joint conversion or command unit')
            command_lower, command_upper = (lower-offset)/scale, (upper-offset)/scale
            joint = {'joint_name': joint_name, 'coupled_joint_names': names[1:], 'joint_type': item.get('type'),
                     'lower_limit': command_lower, 'upper_limit': command_upper, 'unit': unit,
                     'scale': scale, 'offset': offset, 'initial_value': -offset/scale}
            if unit == 'rad': joint.update(lower_rad=command_lower, upper_rad=command_upper)
            metadata['joints'][name] = joint
            # Gazebo's multi-joint controller measures only its first joint.
            # Separate feedback loops on one topic let either finger recover
            # independently after contact, without adding public command aliases.
            for controlled_name in names:
                controller = plugin(ship, 'joint-position-controller', 'JointPositionController')
                values(controller, joint_name=controlled_name, topic=f'/arms/{arm["id"]}/{name}/target',
                       p_gain=80, d_gain=12, i_gain=0, cmd_min=-200, cmd_max=200, initial_position=0)
                if 'max_speed' in specification:
                    speed = float(specification['max_speed'])
                    if not math.isfinite(speed) or speed <= 0: raise ValueError('Joint speed must be finite and positive')
                    controller.find('cmd_max').text = str(speed)
                    controller.find('cmd_min').text = str(-speed)
                    values(controller, use_velocity_commands='true')
        if 'location' in arm:
            location = arm['location']
            if location['module_id'] not in module_ids:
                raise ValueError('Arm location must reference a configured module')
            for key in ('base_link', 'tool_link', 'parent_link'):
                if ship.find(f'link[@name="{location[key]}"]') is None: raise ValueError('Arm location references an unknown link')
            reach = float(location['reach_m'])
            if not math.isfinite(reach) or reach <= 0: raise ValueError('Arm reach must be positive and finite')
            metadata['location'] = {**location, 'nominal_pose_in_body': frames.resolve(location['base_link']), 'reach_m': reach}
        if 'maintenance' in arm:
            service = arm['maintenance']
            if set(service) - {'components', 'targets_rad', 'tolerance_rad'}:
                raise ValueError('Unknown arm maintenance configuration')
            components, targets = service['components'], service['targets_rad']
            tolerance = float(service.get('tolerance_rad', .12))
            if not components or len(set(components)) != len(components) or set(components) - set(COMPONENTS) or not targets or not math.isfinite(tolerance) or not 0 < tolerance <= .3:
                raise ValueError('Invalid maintenance components, joint targets or tolerance')
            for key, target in targets.items():
                limits = metadata['joints'].get(key)
                if not limits or not math.isfinite(target) or not (limits.get('lower_limit', limits.get('lower_rad')) <= target <= limits.get('upper_limit', limits.get('upper_rad'))):
                    raise ValueError('Maintenance pose must use mapped joints within their limits')
            metadata['maintenance'] = {'components': components, 'targets_rad': targets, 'tolerance_rad': tolerance}
        arms.append(metadata)
    panels = []
    for panel in profile.get("solar_panels", []):
        identifier, joint_name = panel["id"], panel["joint_name"]
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier) or any(item["id"] == identifier for item in panels) or joint_name in configured_joints:
            raise ValueError("Solar panel IDs must be unique and their joints cannot overlap arm joints")
        joint = ship.find(f'joint[@name="{joint_name}"]')
        if joint is None or joint.get("type") != "revolute":
            raise ValueError("Solar panel joint must exist and be revolute")
        lower, upper = float(joint.findtext("axis/limit/lower", "nan")), float(joint.findtext("axis/limit/upper", "nan"))
        if not math.isfinite(lower) or not math.isfinite(upper) or lower >= upper:
            raise ValueError("Solar panel joints need finite lower/upper limits")
        configured_joints.add(joint_name)
        normal, axis = panel.get('normal_body_at_zero', [0, 0, 1]), panel.get('hinge_axis_body', [1, 0, 0])
        if any(len(v) != 3 or not all(math.isfinite(n) for n in v) or not math.isclose(sum(n*n for n in v), 1., abs_tol=1e-6) for v in (normal, axis)) or abs(sum(normal[i]*axis[i] for i in range(3))) > 1e-6:
            raise ValueError('Panel normal and hinge axis must be perpendicular unit vectors in the ship body frame')
        panels.append({"id": identifier, "joint_name": joint_name, 'link_name': joint.findtext('child'), "lower_rad": lower, "upper_rad": upper,
                       'normal_body_at_zero': normal, 'hinge_axis_body': axis})
        values(plugin(ship, "joint-position-controller", "JointPositionController"), joint_name=joint_name,
               topic=f'/solar_panels/{identifier}/target', p_gain=120, d_gain=180, i_gain=0, cmd_min=-400, cmd_max=400)
    physics = None
    if profile.get('physics'):
        from starship_sim.physics import compile_physics
        physics = canonical_numbers(compile_physics(ship, profile, frames))
        native = ET.SubElement(ship, 'plugin', filename='starship-physics', name='starship::Physics')
        values(native, configuration=json.dumps(physics, separators=(',', ':')))
        # Resolve contacts at 1 ms. At the API limit 150 m/s a rock travels 0.15 m per step.
        settings = world.find('physics')
        if settings is None: settings = ET.SubElement(world, 'physics', name='physics', type='ignored')
        step = settings.find('max_step_size')
        if step is None: step = ET.SubElement(settings, 'max_step_size')
        step.text = '0.001'
    scene = scene_from_world(world, profile)
    if physics: scene['physics'] = physics
    if 'ship_bounds_body_m' in profile:
        bounds = profile['ship_bounds_body_m']
        lower, upper = numbers(' '.join(map(str, bounds['min'])), 3), numbers(' '.join(map(str, bounds['max'])), 3)
        if any(lower[i] >= upper[i] for i in range(3)): raise ValueError('Ship bounds must be ordered')
        next(entity for entity in scene['entities'] if entity['id'] == scene['ship_entity_id'])['bounds_body_m'] = {'min': lower, 'max': upper}
    scene["arms"] = arms
    scene["solar_panels"] = panels
    scene['ship_layout'] = {'frame': 'ship_body', 'axes': {'x': 'forward', 'y': 'port/left', 'z': 'up'}, 'modules': modules}
    scene['simulation'] = SimulationConfig.model_validate(profile.get('simulation', {})).model_dump()
    ids = [entity["id"] for entity in scene["entities"]]
    if len(set(ids)) != len(ids) or scene["destination"]["entity_id"] not in ids:
        raise ValueError("Entity IDs must be unique and the destination must exist in the map")
    stop, speed = scene["destination"]["stop_distance_m"], scene["cruise_speed_m_s"]
    if not all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0 for value in (stop, speed)):
        raise ValueError("Stop distance and cruise speed must be positive finite numbers")
    scene = canonical_numbers(scene)
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
