"""Live ROS adapter. Measured state comes only from Gazebo through ros_gz."""

import asyncio
from copy import deepcopy
import math
import threading
import time
import uuid

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
from starship_sim.spacecraft import SpacecraftState


class RosBackend:
    def __init__(self, scene, ai_managed=False):
        self.scene = scene
        self.spacecraft = SpacecraftState(scene)
        self.last_command_velocity = (0., 0., 0.)
        self.run_id = uuid.uuid4().hex
        self.control_epoch = 0
        self.ai_managed = ai_managed
        self._approved_batch = False
        self.thrust_override = None
        self.solar_targets = {}
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
        self.solar_publishers = {panel['id']: self.node.create_publisher(Float64, f'/solar_panels/{panel["id"]}/target', 10)
                                 for panel in scene.get('solar_panels', [])}
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
        self.watchdog_stop = threading.Event()
        self.watchdog = threading.Thread(target=self.watch_commands, name='ai-command-watchdog', daemon=True)
        self.watchdog.start()

    def configure_ai_authority(self, enabled):
        with self.lock:
            self.ai_managed = bool(enabled)
            self.thrust_override = None
            self.spacecraft.cancel_maintenance()
            self.control_epoch += 1
            if enabled:
                self.velocity.publish(Twist())

    def watch_commands(self):
        while not self.watchdog_stop.wait(.1):
            with self.lock:
                if self.ai_managed and self.thrust_override and (self.error or time.monotonic() >= self.thrust_override['wall_deadline']):
                    self.thrust_override = None
                    self.velocity.publish(Twist())

    def cancel_ai_commands(self):
        with self.lock:
            self.control_epoch += 1
            self.thrust_override = None
            self.last_command_velocity = (0., 0., 0.)
            self.spacecraft.cancel_maintenance()
            if self.ai_managed:
                self.velocity.publish(Twist())

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
            new_time = msg.clock.sec + msg.clock.nanosec / 1e9
            if self.sim_time is not None and new_time < self.sim_time:
                self.control_epoch += 1
                self.thrust_override = None
                self.spacecraft.cancel_maintenance()
            self.sim_time = new_time
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
                    'stamp_sim_time_s': transform.header.stamp.sec + transform.header.stamp.nanosec / 1e9,
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
                            for joint in arm["joints"].values()) and
                        all(panel['joint_name'] in self.joints for panel in self.scene.get('solar_panels', [])))
            required = ("clock", "poses", "joints") if self.scene["arms"] or self.scene.get('solar_panels') else ("clock", "poses")
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
                    **self.spacecraft.snapshot(),
                    'run_id': self.run_id, 'control_epoch': self.control_epoch, 'ai_managed': self.ai_managed,
                    "sequence": self.sequence, "sim_time_s": self.sim_time,
                    "paused": self.paused, "connection": self.health(),
                    "transforms": deepcopy(list(self.transforms.values())),
                    "arms": [{"id": arm["id"], "measured_rad": {
                        name: self.joints.get(joint["joint_name"])
                        for name, joint in arm["joints"].items()},
                        "requested_rad": deepcopy(self.targets.get(arm["id"], {}))}
                        for arm in self.scene["arms"]],
                    "map": {"orbit_speed": self.orbit_speed if self.orbits else None},
                    'solar_panels': [{'id': panel['id'], 'measured_rad': self.joints.get(panel['joint_name']),
                                      'requested_rad': self.solar_targets.get(panel['id'])}
                                     for panel in self.scene.get('solar_panels', [])],
                    'propulsion': {'control_mode': self.thrust_override['mode'] if self.thrust_override else ('ai_hold' if self.ai_managed else 'autopilot'),
                                   'requested_velocity_body_m_s': self.thrust_override.get('velocity') if self.thrust_override else None,
                                   'expires_at_sim_time_s': self.thrust_override['sim_deadline'] if self.thrust_override else None},
                    "navigation": {"origin": self.scene.get("map", {}).get("origin_entity_id"),
                                   "destination": self.scene["destination"]["entity_id"], "distance_m": distance,
                                   "arrived": self.arrived, "cruise_speed_m_s": self.scene["cruise_speed_m_s"]}}

    def navigate(self):
        with self.lock:
            if not self.health()["ready"] or self.paused:
                if self.ai_managed:
                    self.velocity.publish(Twist())
                return
            self.spacecraft.update(self.sim_time, self.transforms, self.joints, self.last_command_velocity, self.targets)
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
            if self.ai_managed:
                grant = self.thrust_override
                if grant is None or self.sim_time >= grant['sim_deadline'] or time.monotonic() >= grant['wall_deadline']:
                    self.thrust_override = None
                    velocity = (0., 0., 0.)
                elif grant['mode'] == 'ai_velocity':
                    velocity = tuple(grant['velocity'][axis] for axis in 'xyz')
            factor = self.spacecraft.propulsion_factor()
            velocity = tuple(value * factor for value in velocity)
            self.last_command_velocity = velocity
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
            self.control_epoch += 1
            if self.ai_managed:
                self.thrust_override = None
            return {"status": "accepted", "requested_orbit_speed": self.orbit_speed}

    def command_arm(self, arm_id, targets):
        with self.lock:
            if self.ai_managed and not self._approved_batch:
                raise PermissionError('Arm commands require Main Judging approval in AI-managed mode')
            if not self.health()["ready"]:
                raise RuntimeError("Gazebo telemetry is unavailable or stale")
            if any(self.publishers[(arm_id, name)].get_subscription_count() == 0 for name in targets):
                raise RuntimeError("The ROS/Gazebo command bridge is not connected")
            for name, target in targets.items():
                message = Float64()
                message.data = float(target)
                self.publishers[(arm_id, name)].publish(message)
            self.targets.setdefault(arm_id, {}).update(targets)
            if not self._approved_batch:
                self.control_epoch += 1
            return {"status": "accepted", "arm_id": arm_id, "targets_rad": targets,
                    "note": "Acceptance confirms publication; inspect measured_rad for physical movement."}

    def command_solar_panel(self, panel_id, target):
        with self.lock:
            if self.ai_managed and not self._approved_batch:
                raise PermissionError('Solar-panel commands require Main Judging approval in AI-managed mode')
            if not self.health()['ready'] or self.solar_publishers[panel_id].get_subscription_count() == 0:
                raise RuntimeError('Solar panel command bridge is unavailable')
            message = Float64()
            message.data = float(target)
            self.solar_publishers[panel_id].publish(message)
            self.solar_targets[panel_id] = float(target)
            if not self._approved_batch:
                self.control_epoch += 1
            return {'status': 'accepted', 'panel_id': panel_id, 'target_rad': target,
                    'note': 'Publication accepted; inspect measured_rad for physical movement.'}

    def inject_disaster(self, kind, severity):
        with self.lock:
            if not self.health()['ready'] or self.paused:
                raise RuntimeError('Resume a ready simulator before applying a scenario event')
            result = self.spacecraft.inject_disaster(kind, severity, self.sim_time)
            self.control_epoch += 1
            # A new fault invalidates outstanding authority; get a fresh judgement.
            self.thrust_override = None
            self.last_command_velocity = (0., 0., 0.)
            self.spacecraft.cancel_maintenance()
            if self.ai_managed: self.velocity.publish(Twist())
            return result

    def execute_approved(self, actions, expected_run_id, expected_epoch):
        """Only the coordinator calls this after validating the judge's selection.

        Preflight the whole batch before the first publication. Transport errors
        cannot roll back an already published joint target; report that explicitly.
        """
        from starship_sim.ai.contracts import ArmService, ArmTarget, OWNERS, SolarPanelTarget, ThrusterVelocity, resources, validate_action
        with self.lock:
            if not self.ai_managed or self.run_id != expected_run_id or self.control_epoch != expected_epoch:
                raise RuntimeError('AI authority or observation changed; a new judgement is required')
            if not self.health()['ready'] or self.paused:
                raise RuntimeError('Actuation requires fresh telemetry and an unpaused simulator')
            used = set()
            for action in actions:
                validate_action(self.scene, OWNERS[action.type], action)
                if used & resources(action, self.scene):
                    raise RuntimeError('Conflicting actuator requests')
                used |= resources(action, self.scene)
                if isinstance(action, ArmService):
                    arm = next(arm for arm in self.scene['arms'] if arm['id'] == action.arm_id)
                    connected = all(self.publishers[(action.arm_id, name)].get_subscription_count() for name in arm['maintenance']['targets_rad'])
                elif isinstance(action, ArmTarget):
                    connected = all(self.publishers[(action.arm_id, name)].get_subscription_count() for name in action.targets)
                elif isinstance(action, SolarPanelTarget):
                    connected = self.solar_publishers[action.panel_id].get_subscription_count()
                else:
                    connected = self.velocity.get_subscription_count()
                if not connected:
                    raise RuntimeError('An actuator bridge is unavailable; no batch commands published')
            results = []
            self._approved_batch = True
            try:
                for action in actions:
                    if isinstance(action, ArmService):
                        arm = next(arm for arm in self.scene['arms'] if arm['id'] == action.arm_id)
                        result = self.command_arm(action.arm_id, arm['maintenance']['targets_rad'])
                        self.spacecraft.start_maintenance(arm, action.component, action.duration_s, self.sim_time)
                        result = {**result, 'maintenance_component': action.component,
                                  'note': 'Joint targets published. Abstract maintenance starts only at the measured service pose with battery power.'}
                    elif isinstance(action, ArmTarget):
                        self.spacecraft.maintenance.pop(action.arm_id, None)
                        result = self.command_arm(action.arm_id, action.targets)
                    elif isinstance(action, SolarPanelTarget):
                        result = self.command_solar_panel(action.panel_id, action.target_rad)
                    else:
                        self.thrust_override = {'mode': 'ai_velocity' if isinstance(action, ThrusterVelocity) else 'ai_navigation',
                            'sim_deadline': self.sim_time + action.duration_s,
                            'wall_deadline': time.monotonic() + action.duration_s + 1,
                            'velocity': action.linear_m_s.model_dump() if isinstance(action, ThrusterVelocity) else None}
                        result = {'status': 'accepted', 'mode': self.thrust_override['mode'], 'duration_s': action.duration_s}
                    results.append({'action': action.model_dump(), 'result': result})
            except Exception:
                self.thrust_override = None
                self.spacecraft.cancel_maintenance()
                self.velocity.publish(Twist())
                return {'status': 'partial_failure', 'actions': results,
                        'interrupted_action': action.model_dump(),
                        'error': 'Actuator publication failed. Earlier joint commands may already have taken effect.'}
            finally:
                self._approved_batch = False
                self.control_epoch += 1
            return {'status': 'dispatched', 'actions': results,
                    'note': 'Commands accepted, not proof of successful movement or repair.'}

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
        with self.lock:
            self.control_epoch += 1
            if self.ai_managed:
                self.thrust_override = None
        return {"status": "accepted", "requested_paused": paused}

    def close(self):
        self.closing = True
        self.watchdog_stop.set()
        self.watchdog.join(timeout=1)
        if self.ai_managed:
            self.velocity.publish(Twist())
        self.executor.shutdown(timeout_sec=2)
        self.thread.join(timeout=2)
        self.node.destroy_node()
        self.context.try_shutdown()
