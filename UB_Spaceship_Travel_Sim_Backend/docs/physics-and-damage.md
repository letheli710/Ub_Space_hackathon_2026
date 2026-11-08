# Force propulsion and collision damage

This page describes the **optional Gazebo implementation**. The main simulator
is now the browser's **DEMO**, which implements propulsion and collision damage
locally at an initial **7.9 km/s**. Use the [DEMO physics guide](../../frontend/docs/demo-physics.md)
and frontend launch instructions for that mode; no backend rebuild is needed.

The default modular ship uses `native/StarshipPhysics.cc`, a Gazebo Harmonic
plugin compiled automatically inside Docker. Nominal cruise stays **25 m/s**.
The browser renders measured poses, including separated components.

## Rebuild and launch

This update needs a full backend rebuild. Your backend `.env` stays unchanged.
No Windows/Mac compiler or additional API key is needed.

**Windows:** open PowerShell in `Ub_Space_hackathon_2026`:

```powershell
cd UB_Spaceship_Travel_Sim_Backend
wsl --list --verbose
.\tools\stop.ps1
.\tools\start.ps1
Invoke-RestMethod http://localhost:8000/readyz
```

Ubuntu must show WSL version 2. Running and Stopped are both normal: the launcher
starts Ubuntu when needed. Wait for `ready: True`; retry readiness while building.
Do not use `-NoBuild` for this update. Follow the backend README if setup is missing.

**macOS:** start Docker Desktop, then open Terminal in `Ub_Space_hackathon_2026`:

```bash
cd UB_Spaceship_Travel_Sim_Backend
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker compose down
docker compose up --build -d
curl --fail http://localhost:8000/readyz
```

In a second terminal, from `Ub_Space_hackathon_2026`, start the frontend:

```text
cd frontend
npm ci
npm run dev
```

Close existing frontend dev servers before `npm ci`. Open Vite's displayed URL.
Use **Generator → LIVE SIM** or **Spacecraft → Live Gazebo ship**. Restart the
backend container to restore damaged hardware and fuel. Pausing preserves damage.
Restarting only Vite does not rebuild Gazebo.

## Try a collision

1. Wait for LIVE telemetry and resume if paused.
2. Under **Disaster Maker → Physical space rock**, select a component, mass,
   relative speed and radius. **Launch space rock** and **Asteroid Collision**
   use these settings. Other fault buttons use the severity slider.
3. A dynamic rock launches from above the component, with its initial target
   velocity added. It is ballistic, can miss moving targets, and causes damage
   only on actual contact.
4. Watch speed, rotation, fuel, peak attachment loads and DETACHED labels. A weak
   collision may alter motion without fracture. A strong collision can release
   a module, wing or arm together with its attached children.
5. Request a fresh AI cycle. Fracture invalidates older plans and blocks powered
   commands to detached arms/panels. Abstract maintenance cannot reattach them.

On a fresh unpowered ship, a command-module hit with 1 kg at 5 m/s demonstrates
surviving a weak contact. A 1,000 kg rock at 80 m/s breaks its configured attachment.
Results depend on attitude, intervening geometry and existing damage.

## Flight behavior

Gazebo/DART integrates all ship movement; there is no ship velocity-setting
controller. Main thrust (40,000 N) acts through the engine. Bus RCS provides up to
18,000 N and 80,000 N·m. Turning changes thrust direction; existing momentum does
not instantly turn. Opposing thrust needs time and distance to brake.

`thruster_velocity` is a velocity **goal**, transformed from body coordinates to
a fixed world vector once at approval. Bounded forces approach it while an
attitude controller points the nose along travel. `follow_navigation` includes a
braking approach to the moving destination. `thruster_burn` accepts body-frame
`linear_throttle` and `angular_throttle` vectors, each magnitude <=1. Angular
X/Y/Z mean roll/pitch/yaw torque; direct burns do not stabilize attitude.

Main Judging must approve each burn/goal. Grants last at most 10 simulation
seconds, with the existing duration-plus-one-second wall watchdog. Native command
loss cuts thrust after 0.6 wall seconds. Expiry, Stop AI and an empty plan mean
**coast**, not immediate stopping. A zero velocity goal actively brakes while
approved. Pause freezes the physics clock. The nominal 25 m/s limit applies to
velocity goals; collisions and direct burns can exceed it. Measured speed is
never clamped. Low battery and damage reduce thrust, not existing coasting speed.

Fuel starts at 4,000 kg. Consumption follows `thrust / (Isp × 9.80665)`; main Isp
is 450 s, RCS Isp 230 s, and torque uses an 8 m effective lever arm. Empty fuel
cuts thrust. Fuel mass does not yet decrease the rigid-body mass/inertia.
Loss of the main engine disables its thrust; independent bus RCS can remain.

## Attachment strength and model replacement

Contact forces are summed over each attachment's connected subtree. Shear is
`F_shear / area`; axial stress and bending `moment / section_modulus` are also
evaluated. Combined normalized load >=1 removes the native fixed constraint,
releasing the existing rigid-body subtree. Motors on detached links lose their
command components. Collision primitives supply uniform-density inertia estimates
using rotated tensors and the parallel-axis theorem; declared masses are retained.

Edit `config/environment.json` → `physics` for root/engine links, thrust/torque,
Isp, fuel, fixed-joint bonds, effective material sections/strengths and impact
target points in each link's local coordinates. These are engineering-demo
parameters, not certified material properties. The importer validates references
and positive finite values. Preserve the canonical hull; use a fixed sacrificial
mount upstream of a movable hinge. Driven revolute joints are not breakable bonds.

Regenerate with `python tools/generate_environment.py`, then rebuild. The frontend
and AI discover the catalog from `/api/v1/scene`. The modular converter retains
existing physics tuning; deliberately update it when changing model topology.
Profiles without `physics` retain the legacy velocity controller.

## API and checks

`POST /api/v1/impacts` accepts:

```json
{"target_id":"command","mass_kg":1000,"radius_m":0.7,"speed_m_s":80,"direction_body":[0,0,-1]}
```

Limits: 1–5,000 kg, radius 0.15–2 m, speed 1–150 m/s. A nonzero direction is
normalized. The world uses a 1 ms timestep. At most 24 rocks exist at once; each
expires after 120 simulation seconds. Duplicate transport delivery of an ID
creates one rock. Acceptance is a spawn request; inspect telemetry for the result.

The 1 ms contact timestep can run slower than real time on modest hardware.
Speeds and durations use the simulation clock; 25 m/s remains the cruise goal
regardless of wall-clock rendering speed. AI grants also retain a wall watchdog,
so an overloaded machine may need more frequent fresh approvals.

State/WebSocket `physics` contains measured linear/angular velocity, applied
force/torque, fuel, attached mass, peak bond stresses, detached links and rock
poses. `ship_status` uses measured velocity and limits abstract health according
to lost hardware. Ground-truth sensors include rocks. Total ship/debris/rock
linear momentum is reported for isolated conservation checks; prescribed planets
can exert external forces.

Reported ship velocity is measured at the canonical hull frame. After an impact,
rotation about an offset center of mass can change that point's velocity even
while the whole assembly conserves momentum.

Run these in macOS Terminal or Ubuntu/WSL with Docker access. They use disposable
containers and injected approvals, with no paid LLM calls:

```bash
docker run --rm -e ROS_DOMAIN_ID=91 -e GZ_PARTITION=physics_validation starship-environment:local /workspace/.venv/bin/python tools/smoke_physics.py
docker run --rm -e ROS_DOMAIN_ID=92 -e GZ_PARTITION=arm_validation starship-environment:local /workspace/.venv/bin/python tools/smoke_modular_ship.py
```

## Remaining approximations

Breakage occurs at predefined attachments, not arbitrary new mesh cuts. There is
no finite-element deformation, fatigue, thermal fracture, welding, reattachment
or hypervelocity fragmentation. Peak stress depends on timestep and collision
proxies. Failure currently uses external contact loads, not engine/motor-induced
joint loads. Internal self-collision remains disabled. RCS is an aggregate
force/torque model, not individual nozzle plumes. Electrical power and repairs
remain abstract; fuel does not change inertia. The compressed map still uses
prescribed planetary orbits and zero gravity, not orbital astrodynamics.

References: [Gazebo force/velocity API](https://gazebosim.org/api/sim/8/classgz_1_1sim_1_1Link.html)
and [Gazebo 8 physics integration](https://github.com/gazebosim/gz-sim/blob/gz-sim8/src/systems/physics/Physics.cc).
