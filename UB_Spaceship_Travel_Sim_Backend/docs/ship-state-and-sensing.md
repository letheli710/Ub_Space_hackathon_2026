# Live status, object sensing and AI behavior

The website and all four AI roles now read the same backend state. The five
health fields in the old **Demo Telemetry** have live counterparts. The offline
browser Demo remains separate; its scripted values never control Gazebo.

## Rebuild and launch

Preserve your existing backend `.env` and configured key. From
`Ub_Space_hackathon_2026/UB_Spaceship_Travel_Sim_Backend`, rebuild after these
changes. Windows PowerShell:

```powershell
.\tools\stop.ps1
.\tools\start.ps1
```

macOS Terminal, with Docker Desktop running:

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker compose down
docker compose up -d --build
```

Wait for `http://127.0.0.1:8000/readyz` to show `ready:true`. In a second terminal
starting at `Ub_Space_hackathon_2026`, run `cd frontend`, then `npm run dev`.
Open `http://127.0.0.1:5173`. See the [frontend README](../../frontend/README.md)
for first-time dependencies and [AI setup](ai-management.md) for backend keys.

## Try a scenario and watch the AI act

1. Open **Generator → LIVE SIM**. **SHIP TELEMETRY** shows live health, measured
   speed/attitude, battery balance, faults, maintenance and nearby detections.
2. Apply a **Disaster Maker** event and select its severity. Asteroid Collision
   lowers hull integrity; Oxygen Leak also causes ongoing oxygen loss. Live
   events immediately affect backend game state. They do not spawn a physical
   projectile, radiation or gravity field.
3. Open **AI Logs → Run one cycle**. The subsystems see health, faults, nearby
   objects and joints. Main Judging selects or combines proposals; approved
   actions execute automatically. It may hold when no action is justified.
4. **Analyze only** creates a preview without actuation. **Execute approved
   plan** dispatches its fresh judgement once. Expired or superseded plans need
   a new cycle. No human approval step is required for **Run one cycle**.
5. Use **View live ship** to watch real motion. AI Logs also shows current
   propulsion/speed and each health change since the cycle observation.
6. **Start loop** repeats observation, proposals, judgement and execution and
   incurs provider usage. It never starts automatically. **Stop AI** cancels
   analysis, propulsion and modeled service jobs. Existing joint targets may
   continue moving; pause to freeze physical motion.

A new human event invalidates pending AI plans and revokes current
propulsion/maintenance. Start a fresh cycle to assess the changed state.

## Health and behavior

Health, charge balance and maintenance are explicit **game mechanics**, not
LLM-generated percentages or material/electrical sensor physics. Values stay
within 0–100. Gazebo supplies poses and joint feedback.

| Reading / `ship_status.metrics` field | Behavior |
|---|---|
| Hull Integrity / `hull_integrity_pct` | Scenario impacts/fire lower it; hull service restores it. Zero prevents propulsion. |
| Solar Panel Health / `solar_panel_health_pct` | Storm/power scenarios lower it; panel service restores it. It scales charging. |
| Battery Level / `battery_level_pct` | Integrates charging minus idle, thrust, moving-arm and maintenance consumption. |
| Oxygen / `oxygen_pct` | Leak/fire lower it; life-support service restores it and mitigates leaks. |
| Thruster Efficiency / `thruster_efficiency_pct` | Engine/thruster scenarios lower it; thruster service restores it. It scales achieved speed. |

`ship_status.speed_m_s` uses Gazebo position/stamp differences, in simulator
meters per second. `attitude` contains its measured quaternion and an
angular-rate-derived label. Panel charging uses Sun direction and measured
hinge angles. `power` includes alignment, suggested bounded panel angles and
generation/drain rates in **battery percentage points per simulation second**,
not watts. With no star/panels there is no solar generation. Battery below 15%
reduces achieved thrust proportionally, as does damaged thruster efficiency.
Approved speed limits and grant expiration still apply.

Fire/leaks advance only on the simulation clock; pause freezes them. Reading
snapshots never advances state. A new container starts a fresh scenario. The
ship uses velocity control: there is no fuel, nozzle-force, realistic
acceleration, material fracture, contact verification or welding model.

## Maintenance through real robotic arms

Robot Arms can propose:

```json
{"type":"arm_service","arm_id":"thermal","component":"hull","duration_s":10}
```

After Main Judging approval, the backend moves the real arm to its configured
service pose. Modeled recovery starts only when **measured** joints are within
tolerance, battery is above 1%, and the simulation-time grant is active. Time
spent positioning counts toward the grant. Off-pose, unpowered, rejected or
preview-only actions do not recover health. This is an abstract task gated by
real joint feedback, not proof of physical contact or repair.

| Default arm | Allowed service components |
|---|---|
| `power` | `solar_panels`, `electronics` |
| `life_support` | `life_support` |
| `thermal` | `hull`, `robot_arms` |
| `navigation` | `thrusters` |

Life-support service mitigates leaks; hull service mitigates fire. Electronics
and robot-arm service mitigate their respective scenario malfunction flags.
Those flags never alter real API credentials, model permissions or the Main
Judging gate. Arm-malfunction severity reduces modeled service effectiveness.
`maintenance` and `maintenance_history` report positioning, service, power loss,
completion/cancellation and recovered percentage points. A later command may
supersede a job. Service reserves its arm's joints; conflicting arm targets or
services cannot be combined in one plan.

## Nearby objects and interfaces

`sensors` is range-limited, 360-degree **simulator ground-truth sensing**.
Dynamic poses come from Gazebo; static objects use SDF positions. The AI sees
object IDs/labels, distances, body-frame relative positions, relative world
velocities, closing speed and approximate closest approach over 30 seconds.
Unobserved/stale dynamic objects are not replaced with initial map poses.

Positive closing speed means approaching. Bounds are approximate visual
spheres (meshes use a fallback radius), with constant-relative-velocity
prediction. Warnings do not prove collision. There is no camera inference,
occlusion test or LiDAR ray casting. The global map catalog is separate from
local detections; landmark names alone do not imply physical hazard fields.

HTTP `/api/v1/state` and WebSocket telemetry include `ship_status` and `sensors`.
All four model observations contain those same fields. Human scenario control
is `POST /api/v1/disasters` with `{"kind":"Oxygen Leak","severity":65}`.
Kinds match Disaster Maker's labels; severity must be finite and 1–100. Invalid
requests return 422 without changing state; paused/unready simulators return
503. AI proposals cannot invoke this route or set health values directly.
Everything shares backend port 8000 and the existing frontend `/api` proxy.

## Replacement models and tuning

`config/environment.json` has `simulation` settings for sensor range, initial
battery, charge/drain and service rates. Arms may declare:

```json
"maintenance": {
  "components":["hull"],
  "targets_rad":{"yaw":0,"shoulder":0.25,"elbow":-0.3},
  "tolerance_rad":0.12
}
```

Aliases must map to real SDF revolute joints and in-limit targets. Omit
`maintenance` for positioning-only arms. Each panel may provide perpendicular
unit vectors `normal_body_at_zero` and `hinge_axis_body` in body coordinates
(defaults `[0,0,1]` and `[1,0,0]`). Configure them for another mounting arrangement.
Regenerate exports and rebuild after asset/config changes. Prompts and React
geometry discover these capabilities; they do not hardcode the starter rig.

`uv run pytest -q` checks state evolution, sensing, shared observations and
authority. The isolated [physical AI test](ai-management.md#verification-without-a-key)
also verifies measured arm pose gates modeled hull recovery without provider calls.
