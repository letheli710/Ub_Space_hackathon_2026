"""Live ROS adapter. Measured state comes only from Gazebo through ros_gz."""

import asyncio
from copy import deepcopy
import math
import threading
import time

import rclpy
from rclpy.context import Context
from rclpy.executors import SingleThreadedExecutor
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from geometry_msgs.msg import Twist
from rosgraph_msgs.msg import Clock
from ros_gz_interfaces.msg import WorldStatistics
from ros_gz_interfaces.srv import ControlWorld
from sensor_msgs.msg import JointState
from std_msgs.msg import Float64
from tf2_msgs.msg import TFMessage
from starship_sim.geometry import tracking_velocity, world_to_local


class RosBackend:
    def __init__(self, scene):
        self.scene = scene
        self.ship_id = scene["ship_entity_id"]
        self.destination_position = next(e["pose_in_world"]["position"] for e in scene["entities"]
                                         if e["id"] == scene["destination"]["entity_id"])
        self.destination_velocity = dict(x=0., y=0., z=0.)
        self.destination_sample = None
        self.orbit_speed = 1.
        self.lock = threading.RLock()
        self.sim_time = None
        self.paused = None
        self.transforms = {}
        self.joints = {}
        self.targets = {}
        self.received = {}
        self.sequence = 0
        self.error = None
        self.arrived = False
        self.closing = False
        self.context = Context()
        rclpy.init(context=self.context)
        self.node = Node("starship_environment_gateway", context=self.context)
        self.executor = SingleThreadedExecutor(context=self.context)
        self.executor.add_node(self.node)
        self.publishers = {}
        for arm in scene["arms"]:
            for name in arm["joints"]:
                self.publishers[(arm["id"], name)] = self.node.create_publisher(
                    Float64, f'/arms/{arm["id"]}/{name}/target', 10)
        self.velocity = self.node.create_publisher(Twist, "/starship/cmd_vel", 10)
        self.orbits = {item["entity_id"]: item["orbit"] for item in scene.get("map", {}).get("objects", []) if "orbit" in item}
        self.orbit_publishers = {name: self.node.create_publisher(Float64, orbit["velocity_topic"], 10)
                                 for name, orbit in self.orbits.items()}
        self.control = self.node.create_client(ControlWorld, f'/world/{scene["world"]}/control')
        self.subscriptions = [
            self.node.create_subscription(Clock, "/clock", self.on_clock, qos_profile_sensor_data),
            self.node.create_subscription(WorldStatistics, "/simulation/stats", self.on_stats, qos_profile_sensor_data),
            self.node.create_subscription(TFMessage, "/starship/poses", self.on_poses, qos_profile_sensor_data),
            self.node.create_subscription(JointState, "/starship/joint_states", self.on_joints, qos_profile_sensor_data),
        ]
        self.timer = self.node.create_timer(0.1, self.navigate)
        self.thread = threading.Thread(target=self.spin, name="space-ros-executor", daemon=True)
        self.thread.start()

    def spin(self):
        try:
            self.executor.spin()
        except Exception as exc:
            if not self.closing:
                with self.lock:
                    self.error = str(exc)
                self.node.get_logger().error(f"ROS executor failed: {exc}")

    def received_topic(self, name):
        self.received[name] = time.monotonic()
        self.sequence += 1

    def on_clock(self, msg):
        with self.lock:
            self.sim_time = msg.clock.sec + msg.clock.nanosec / 1e9
            self.received_topic("clock")

    def on_stats(self, msg):
        with self.lock:
            self.paused = msg.paused
            self.received_topic("stats")

    def on_poses(self, msg):
        with self.lock:
            for transform in msg.transforms:
                translation, rotation = transform.transform.translation, transform.transform.rotation
                frame_id = transform.child_frame_id.strip("/").replace("/", "::")
                parent_id = transform.header.frame_id.strip("/").replace("/", "::")
                self.transforms[frame_id] = {
                    "parent_frame_id": parent_id,
                    "child_frame_id": frame_id,
                    "position": {"x": translation.x, "y": translation.y, "z": translation.z},
                    "orientation": {"x": rotation.x, "y": rotation.y, "z": rotation.z, "w": rotation.w},
                }
                if frame_id == self.scene["destination"]["entity_id"]:
                    stamp = transform.header.stamp
                    sample_time = stamp.sec + stamp.nanosec / 1e9
                    sample_time = sample_time if sample_time > 0 else self.sim_time
                    if self.destination_sample is not None and sample_time is not None:
                        previous_time, previous_position = self.destination_sample
                        dt = sample_time - previous_time
                        if dt > 1e-6:
                            self.destination_velocity = {a: (self.transforms[frame_id]["position"][a] - previous_position[a]) / dt for a in "xyz"}
                    self.destination_position = dict(x=translation.x, y=translation.y, z=translation.z)
                    if sample_time is not None:
                        self.destination_sample = (sample_time, self.destination_position.copy())
            self.received_topic("poses")

    def on_joints(self, msg):
        with self.lock:
            self.joints.update(zip(msg.name, msg.position))
            self.received_topic("joints")

    def health(self):
        with self.lock:
            now = time.monotonic()
            ages = {name: round(now - stamp, 3) for name, stamp in self.received.items()}
            online = ages.get("stats", math.inf) < 3 and self.error is None
            complete = (self.sim_time is not None and self.ship_id in self.transforms and
                        all(entity["id"] in self.transforms for entity in self.scene["entities"] if entity["dynamic"]) and
                        all(joint["joint_name"] in self.joints for arm in self.scene["arms"]
                            for joint in arm["joints"].values()))
            required = ("clock", "poses", "joints") if self.scene["arms"] else ("clock", "poses")
            fresh = self.paused is True or all(ages.get(name, math.inf) < 3 for name in required)
            return {"backend": "space_ros_gazebo", "online": online,
                    "ready": bool(online and complete and fresh),
                    "topic_age_s": ages, "error": self.error}

    def snapshot(self):
        with self.lock:
            position = self.transforms.get(self.ship_id, {}).get("position")
            distance = math.dist([position[a] for a in "xyz"],
                                 [self.destination_position[a] for a in "xyz"]) if position else None
            return {"schema_version": 1, "scene_revision": self.scene["revision"],
                    "sequence": self.sequence, "sim_time_s": self.sim_time,
                    "paused": self.paused, "connection": self.health(),
                    "transforms": deepcopy(list(self.transforms.values())),
                    "arms": [{"id": arm["id"], "measured_rad": {
                        name: self.joints.get(joint["joint_name"])
                        for name, joint in arm["joints"].items()},
                        "requested_rad": deepcopy(self.targets.get(arm["id"], {}))}
                        for arm in self.scene["arms"]],
                    "map": {"orbit_speed": self.orbit_speed if self.orbits else None},
                    "navigation": {"origin": self.scene.get("map", {}).get("origin_entity_id"),
                                   "destination": self.scene["destination"]["entity_id"], "distance_m": distance,
                                   "arrived": self.arrived, "cruise_speed_m_s": self.scene["cruise_speed_m_s"]}}

    def navigate(self):
        with self.lock:
            if not self.health()["ready"] or self.paused:
                return
            ship = self.transforms[self.ship_id]
            delta = tuple(self.destination_position[a] - ship["position"][a] for a in "xyz")
            distance = math.sqrt(sum(value * value for value in delta))
            stop_distance = self.scene["destination"]["stop_distance_m"]
            message = Twist()
            # Match a moving destination near arrival, rather than repeatedly stopping
            # in world space while the planet moves away. All inputs are measured poses.
            world_velocity, self.arrived = tracking_velocity(delta, tuple(self.destination_velocity[a] for a in "xyz"),
                self.scene["cruise_speed_m_s"], stop_distance, self.arrived)
            velocity = world_to_local(world_velocity, ship["orientation"])
            message.linear.x, message.linear.y, message.linear.z = velocity
            self.velocity.publish(message)

    def command_map(self, orbit_speed):
        with self.lock:
            if not self.orbits:
                raise ValueError("The selected map has no controllable orbits")
            if not self.health()["ready"] or any(p.get_subscription_count() == 0 for p in self.orbit_publishers.values()):
                raise RuntimeError("The map command bridge is unavailable or telemetry is stale")
            for name, orbit in self.orbits.items():
                message = Float64()
                message.data = orbit["angular_speed_rad_s"] * orbit_speed
                self.orbit_publishers[name].publish(message)
            self.orbit_speed = float(orbit_speed)
            return {"status": "accepted", "requested_orbit_speed": self.orbit_speed}

    def command_arm(self, arm_id, targets):
        with self.lock:
            if not self.health()["ready"]:
                raise RuntimeError("Gazebo telemetry is unavailable or stale")
            if any(self.publishers[(arm_id, name)].get_subscription_count() == 0 for name in targets):
                raise RuntimeError("The ROS/Gazebo command bridge is not connected")
            for name, target in targets.items():
                message = Float64()
                message.data = float(target)
                self.publishers[(arm_id, name)].publish(message)
            self.targets.setdefault(arm_id, {}).update(targets)
            return {"status": "accepted", "arm_id": arm_id, "targets_rad": targets,
                    "note": "Acceptance confirms publication; inspect measured_rad for physical movement."}

    async def control_world(self, paused):
        if not self.control.service_is_ready():
            raise RuntimeError("Gazebo world-control service is unavailable")
        request = ControlWorld.Request()
        request.world_control.pause = paused
        future = self.control.call_async(request)
        deadline = time.monotonic() + 5
        while not future.done():
            if time.monotonic() > deadline:
                future.cancel()
                raise RuntimeError("Gazebo did not acknowledge world control within 5 seconds")
            await asyncio.sleep(0.01)
        try:
            result = future.result()
        except Exception as exc:
            raise RuntimeError(f"Gazebo world control failed: {exc}") from exc
        if result is None or not result.success:
            raise RuntimeError("Gazebo rejected world control")
        return {"status": "accepted", "requested_paused": paused}

    def close(self):
        self.closing = True
        self.executor.shutdown(timeout_sec=2)
        self.thread.join(timeout=2)
        self.node.destroy_node()
        self.context.try_shutdown()
