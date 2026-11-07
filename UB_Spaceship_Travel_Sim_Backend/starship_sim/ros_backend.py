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
from starship_sim.geometry import world_to_local


class RosBackend:
    def __init__(self, scene):
        self.scene = scene
        self.ship_id = scene["ship_entity_id"]
        self.destination_position = next(e["pose_in_world"]["position"] for e in scene["entities"]
                                         if e["id"] == scene["destination"]["entity_id"])
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
                    self.destination_position = dict(x=translation.x, y=translation.y, z=translation.z)
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
                    "navigation": {"destination": self.scene["destination"]["entity_id"], "distance_m": distance,
                                   "arrived": self.arrived, "cruise_speed_m_s": self.scene["cruise_speed_m_s"]}}

    def navigate(self):
        with self.lock:
            if not self.health()["ready"] or self.paused:
                return
            ship = self.transforms[self.ship_id]
            delta = tuple(self.destination_position[a] - ship["position"][a] for a in "xyz")
            distance = math.sqrt(sum(value * value for value in delta))
            stop_distance = self.scene["destination"]["stop_distance_m"]
            self.arrived = distance <= stop_distance + 0.1
            message = Twist()
            if not self.arrived:
                speed = min(self.scene["cruise_speed_m_s"], max(0.0, (distance - stop_distance) * 0.5))
                velocity = world_to_local(tuple(value / distance * speed for value in delta), ship["orientation"])
                message.linear.x, message.linear.y, message.linear.z = velocity
            self.velocity.publish(message)

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
