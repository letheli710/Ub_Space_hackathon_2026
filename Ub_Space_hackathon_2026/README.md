# Starship simulation environment

A local Space ROS + Gazebo backend for the spaceship AI management simulator.
The website connects through HTTP and WebSocket on port **8000**; it does not need
to run ROS or Gazebo in the browser.

## Included in this first environment

- A zero-gravity 3D world containing an open-top, 18 m ship, destination and
  departure planets, a moon and two asteroids. All geometry is local; no asset
  downloads are required at simulation startup.
- Four ship-mounted arms with three actuated joints each, assigned to power,
  life support, thermal management and navigation. Their movement is simulated
  by Gazebo and reported back through Space ROS.
- An automatic, straight-line cruise at up to 2 m/s toward the destination,
  slowing to stop 70 m from its center. Distances and celestial sizes are
  deliberately compressed for a short demonstration, not orbital mechanics.
- A scene description for the web renderer, measured link transforms and joint
  angles, joint target commands, pause/resume and connection health.

The equipment blocks identify future ship systems. They do not yet simulate
power, oxygen, heat, damage, repairs, grasping or AI decision-making. API model
connections and disaster mechanics are subsequent work. Arm commands currently
control joint angles; task planning and inverse kinematics are not included.

## Run

Use a Linux container engine: Docker Desktop with WSL integration, or Docker
Engine inside Ubuntu WSL. The existing Ubuntu WSL distribution can be prepared
with the explicit `tools/setup_docker_wsl.sh` script (it installs Docker packages
and starts the Docker service). No Windows reboot or new distro is required.

From this repository directory:

```bash
docker compose up --build -d
docker compose logs -f
```

For Docker Engine installed inside WSL, run the same commands in Ubuntu from
`/mnt/c/Users/usjac/Desktop/Coding Studio/Codex/UB_Hacking-Starship_Travel_Simulator/Ub_Space_hackathon_2026`.
Use `sudo docker` if your Linux user has no Docker permissions.

On this Windows checkout, use the provided PowerShell launcher to avoid WSL
extended-attribute permission errors during the Docker build:

```powershell
.\tools\start.ps1
```

It packages only source files into `.runtime/build-context.tar.gz`, builds the
image inside the existing Ubuntu WSL distribution, then starts an attached
Compose session in a hidden Windows process. This keeps WSL alive: Docker's
systemd service alone does not prevent WSL from shutting down while idle.
Logs are saved in `.runtime/`. Use `-NoBuild` to reuse the image or `-Foreground`
to keep the logs in your terminal. Stop with `.\tools\stop.ps1` before rebuilding.
The launcher requires the Docker setup above.

- Interactive API reference: <http://localhost:8000/docs>
- Readiness (503 until live Gazebo data arrives): <http://localhost:8000/readyz>
- Scene geometry: <http://localhost:8000/api/v1/scene>
- Current state: <http://localhost:8000/api/v1/state>
- Live state: `ws://localhost:8000/api/v1/telemetry`

Stop with `docker compose down`. Starting a new container creates a new voyage;
there is no persistence or reset endpoint in this initial environment.

Copy `.env.example` to `.env` to change `SIM_PORT` or `WEB_ORIGINS`. The API binds
to loopback by default. For deployment, the web developer should route a server
path such as `/sim/` to this backend, including WebSocket upgrades, and configure
the actual frontend origin. Keep the simulator port private behind the web
application's authentication and HTTPS. The backend does not implement accounts.

## Web developer handoff

See [docs/web-integration.md](docs/web-integration.md) for the rendering contract,
examples and endpoint behavior. [docs/openapi.json](docs/openapi.json) is an
exported OpenAPI specification; `/openapi.json` provides the running version.
This repository supplies the environment and interface, not a website frontend.

## Development and verification

Python 3.12+ is sufficient for offline API/asset tests; executing the simulator
also requires the container's Space ROS and Gazebo libraries.

```bash
uv sync --locked
uv run python tools/generate_environment.py --check
uv run pytest -q
uv run python tools/smoke_test.py
```

The smoke test requires a running container. It verifies actual simulated time,
ship movement, pause/resume, measured movement of all four arm yaw joints and
WebSocket delivery. Contract tests use an explicit test double; there is no
synthetic or mock backend in the running service.

Edit `tools/generate_environment.py` to change the environment, then regenerate:

```bash
uv run python tools/generate_environment.py
uv run python -m tools.export_openapi
```

Commit generated `worlds/deep_space.sdf`, `config/scene.json`, `config/bridge.yaml`
alongside the generator when making local commits. Dependencies are locked in
`uv.lock`; `requirements.lock` is the production-only export used by Docker.
All source changes stay local under the standing no-push instruction.

## Compatibility references

The container uses `osrf/space-ros:jazzy-2026.07.0`, also used by the
[official Canadarm2 demo](https://github.com/space-ros/demos/blob/main/canadarm2/Dockerfile).
ROS 2 Jazzy's supported pairing is
[Gazebo Harmonic](https://gazebosim.org/docs/latest/ros_installation/).
The image sources binary Jazzy dependencies first and the Space ROS overlay
second; startup checks that `rclpy` really comes from Space ROS.
