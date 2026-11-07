# Environment validation

Verified locally on November 7, 2026.

- Space ROS base: `osrf/space-ros:jazzy-2026.07.0`.
- Startup confirmed `rclpy` loaded from `/opt/ros/spaceros/`.
- Gazebo Sim reported version `8.15.0` and validated the generated SDF world.
- The Windows Python 3.12 contract/asset suite passed: **17 tests**.
- The live smoke test called the public Windows `localhost:8000` port and passed:
  - simulation time advanced and the ship moved toward its destination;
  - pause/resume stopped and restarted the actual Gazebo clock;
  - all four arms' measured yaw angles approached the requested 0.4 radians;
  - WebSocket telemetry arrived through the same published port.

Docker Engine and Compose were installed in the existing Ubuntu WSL distro.
The Windows launcher uses a source archive to avoid DrvFS extended-attribute
errors and keeps an attached WSL Compose session in a hidden process to prevent
WSL idle shutdown. The API port is bound to loopback.

These checks validate the backend environment and browser data/control
interface. They do not validate a website renderer, AI agents, disaster
mechanics, realistic orbital dynamics or a physical repair task; those are
outside this first environment's implemented scope.
