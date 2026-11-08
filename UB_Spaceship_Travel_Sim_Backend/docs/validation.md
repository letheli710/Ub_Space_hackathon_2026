# Environment validation

## Live ship state and AI behavior — latest validation

Verified November 7, 2026, on Windows/Ubuntu WSL 2.

- **84 backend tests** and **12 frontend tests** passed; the production build
  passed with its existing bundle-size advisory. A regression test first failed
  because AI observations omitted the five live health metrics; it now passes.
- State tests check measured relative motion, detection range, missing dynamic
  objects, charging, efficiency/battery thrust limits, simulation-clock faults,
  read-only snapshots, service-pose/power gates and action ownership.
- The isolated real-Gazebo test passed: preview published nothing; approved
  navigation, panels and arm service reached actuators; propulsion expired;
  measured service joints gated modeled hull recovery. All fixture-model
  observations contained health and nearby detections.
- One executing cycle used the user's configured **real DeepSeek connections**
  through the browser. After a 65%-severity asteroid scenario, Main Judging
  combined thermal-arm hull service, both panel targets at 1.4 radians, and a
  bounded zero-velocity hold. It rejected navigation during maintenance.
- Live telemetry showed modeled hull integrity rise from **68.8% to 88.3%**,
  measured service-pose completion, panel rotation and charging that subsequently
  filled the battery to 100%. The browser rendered the actuated model and the
  same status/detections supplied to AI. No loop was started.

Health, power balance and maintenance are game mechanics. This does not validate
material repair, contact sensing, electrical watts, camera/LiDAR perception or
real-world flight. Earlier records below describe earlier implementation stages.

## Initial AI model interfaces and approval authority

Verified locally on November 7, 2026, on Windows/Ubuntu WSL 2.

- Backend suite: **77 tests passed**. Coverage includes DeepSeek JSON requests
  and sanitized errors, role ownership, actuator limits, full/partial/combined
  approvals, conflicting/invented commands, stale plans, cancellation, replay
  prevention, missing keys and blocked manual actuators in AI mode.
- Frontend suite: **11 tests passed**; production build passed. Vite reports the
  existing large JavaScript bundle advisory.
- Actual Gazebo manual-mode checks passed through the API: eight planetary
  orbits and 0x/2x controls, clock pause/resume, four measured arm movements,
  both measured solar-panel hinge movements and WebSocket telemetry.
- A disposable container, ROS domain 78 and Gazebo partition
  `starship_ai_validation` exercised `tools/smoke_ai.py` with injected model
  responses. AI hold and direct-command rejection worked; preview published no
  commands; Main Judging's combined selection moved the real ship, panel and
  arm. The bounded propulsion grant expired back to hold.
- The browser showed four `deepseek-flash` role connections, disabled AI and
  missing-key notices, disabled model-run controls, and the ship's two panels
  rendered from backend SDF links. No private key was entered.
- World/scene/bridge and OpenAPI exports were regenerated and checked.

**No real DeepSeek inference was performed.** The user chose to configure the
backend key later. Provider tests use an HTTP mock transport; the physical AI
test injects fixtures and has no runtime fallback setting. The normal container
remains AI-disabled with no provider key. Mac hardware and live model decision
quality have not been verified.

Hull integrity, electrical generation, battery, fuel, disaster damage and repair
outcomes remain unavailable. This feature supplies model connections and a
guarded command pipeline. Earlier environment-only validation follows below.

## Solar-system map integration

Verified on Windows/Ubuntu WSL on November 7, 2026:

- **36 backend tests** and **11 frontend tests** passed; the production frontend
  build succeeded with the existing large-bundle warning.
- The selected SDF world is `solar_system`, with 13 entities: the ship, Sun,
  eight planets and three landmarks. Gazebo validated and loaded the world.
- All eight planets publish measured model poses and remain on their configured
  orbital radii. Orbits use prescribed revolute-joint motion in zero gravity.
- The live smoke test passed through the frontend's port 5173, including orbit
  multipliers 0×/2×, world pause/resume, physical movement of all four arms,
  and WebSocket delivery. The test restores the orbit multiplier afterward.
- A 30-second, 61-sample native tracking check kept the ship near Mars with
  sampled mean stand-off distance **31.074 m**, range **30.145–32.202 m**.
  Model poses arrive independently; relative distances are not a synchronized
  distance-sensor measurement. Sampled arrival state remained true.
- Windows-generated and Linux-runtime scene revisions match. A regression test
  covers platform trigonometry rounding differences in exported orientations.
- The browser map showed measured coordinates, Earth/Mars mission data, working
  zoom/pan/fit/selection and landmark visibility. Orbit and pause controls reached
  Gazebo. During a backend restart, retained positions were marked stale and
  backend controls disabled; the client reconnected afterward.
- Replacement/import tests include another SDF map without orbital controllers,
  renamed world/ship/destination IDs and invalid map/spawn references.

The default solar system is stylized and compressed. Black-hole gravity,
radiation damage, AI agents and automatic repair behavior are not implemented.
Mac hardware has not been used for this validation.

## Original starter-map validation

Verified locally on November 7, 2026.

- Space ROS base: `osrf/space-ros:jazzy-2026.07.0`.
- Startup confirmed `rclpy` loaded from `/opt/ros/spaceros/`.
- Gazebo Sim reported version `8.15.0` and validated the generated SDF world.
- The Windows Python 3.12 contract/asset/import suite passed: **22 tests**.
- The frontend's Node suite passed: **8 tests**; the Vite production build succeeded.
- The live smoke test called the public Windows `localhost:8000` port and passed:
  - simulation time advanced and the ship moved toward its destination;
  - pause/resume stopped and restarted the actual Gazebo clock;
  - all four arms' measured yaw angles approached the requested 0.4 radians;
  - WebSocket telemetry arrived through the same published port.

Docker Engine and Compose were installed in the existing Ubuntu WSL distro.
The Windows launcher uses a source archive to avoid DrvFS extended-attribute
errors and keeps an attached WSL Compose session in a hidden process to prevent
WSL idle shutdown. The API port is bound to loopback.

The integrated frontend was verified through `http://127.0.0.1:5173`:

- The browser rendered the backend ship, four arms and six mission-map entities.
- A browser arm command reached measured yaw/shoulder/elbow values of
  0.6 / -0.5 / 0.8 radians; the corresponding link poses animated the mesh.
- Pause/resume affected Gazebo time. Disconnecting disabled command controls,
  marked readings stale and preserved the last scene. Restarting automatically
  reconnected and detected the new voyage.
- Ship and map framing remained stable during live updates. ROS frame scopes
  are normalized to the SDF scoped link IDs used by the scene contract.
- Versioned asset URLs were served through the same frontend proxy.

Import tests cover replacement world/ship/destination IDs, relative SDF frames,
mesh URI export, asset revision changes, missing joint mappings and asset path
containment. The OBJ material test verifies imported meshes remain renderable
without mutating cached source assets. Other mesh loader formats have not been
visually exercised with a real replacement ship in this validation run.

These checks validate the backend environment and connected browser renderer.
They do not validate AI agents, disaster
mechanics, realistic orbital dynamics or a physical repair task; those are
outside this first environment's implemented scope.
