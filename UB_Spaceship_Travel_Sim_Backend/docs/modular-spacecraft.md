# Live modular spacecraft and ten robotic arms

The spacecraft from the frontend's design preview is now the default Gazebo
ship. Its command module, habitation section, junction, cargo pod, spine,
habitat ring, solar assemblies and engine section use the preview's dimensions
and mounting layout. Both **Spacecraft** and **Generator → LIVE SIM** render
the backend SDF meshes and measured link transforms.

## Rebuild and open it

Keep your existing backend `.env`, including DeepSeek settings. Start in
`Ub_Space_hackathon_2026/UB_Spaceship_Travel_Sim_Backend`.

Windows PowerShell, with Ubuntu WSL 2 and Docker already set up:

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

Then open another terminal in `Ub_Space_hackathon_2026/frontend`:

```bash
npm ci
npm run dev
```

Stop an existing frontend server before `npm ci`. Open
<http://127.0.0.1:5173>, wait for **LIVE**, and choose **Spacecraft**. Select an
arm to see its module, mounting description, approximate reach and measured
body coordinates. A yellow marker identifies its mount. With AI enabled,
sliders are read-only: use **AI Logs → Analyze only**, review the proposals and
Main Judging's selection, then **Execute approved plan** while it is fresh.
**Run one cycle** performs those steps together. Models may reasonably propose
no motion when there is no useful supported task. Start a human disaster in
Generator's live mode to give the systems a damaged condition to address.

**Open design preview** keeps the original exploded view, ring animation and
illustrative arm controls available. Those controls affect the preview only.

## Arm identities and locations

All ten arms belong to **Robot Arms** (`robot_arms`), including the arms on
solar wings. Energy alone controls the solar hinges; Propelling controls
thrust. Every subsystem action still requires Main Judging approval.

Ship-body axes are **+X forward, +Y port/left, +Z up**. Approximate nominal
mount coordinates below are meters relative to the ship origin at the home
pose. Rail and solar mounts change when their supporting joints move; use
the measured poses rather than this table for a current task.

| Arm ID | Module / mount | Nominal (X, Y, Z), m | Modeled service capabilities |
|---|---|---|---|
| `command` | Dorsal command module | (11.80, 0, 1.70) | Electronics |
| `hab` | Port habitation side | (8.00, 1.45, 0) | Life support |
| `node` | Starboard junction side | (3.60, -2.35, 0) | Hull, electronics |
| `cargo` | Ventral cargo pod | (3.60, 0, -5.80) | Hull |
| `ringHub` | Dorsal habitat-ring hub | (-1.40, 0, 1.55) | Hull, robot arms |
| `ringRailA` | Forward face of circular ring rail | (-0.74, 9.21, 5.03) | Hull, robot arms |
| `ringRailB` | Opposite circular ring carriage | (-0.74, -9.21, -5.03) | Hull, robot arms |
| `solarRight` | Port main solar-wing root | (-6.00, 1.00, 0.22) | Solar panels |
| `solarLeft` | Starboard main solar-wing root | (-6.00, -1.00, -0.22) | Solar panels |
| `engine` | Port aft engine/tank mount | (-14.00, 2.80, 0) | Thrusters |

The preview names `solarRight` and `solarLeft` are preserved as stable IDs.
The preview-to-body rotation is `(x, y, z) → (z, x, y)`, so its right wing is
body port. The AI prompt explicitly instructs models to use coordinates and
mount metadata instead of guessing a side from an ID.

Each arm supports `yaw`, `shoulder`, `elbow`, `wrist` (radians) and `grip`
(openness fraction: 0 most closed, 1 most open). Only `ringRailA` and
`ringRailB` also support `slide`, a circular angular displacement in radians,
relative to their nominal rail angles of 0.5 and 0.5 + π. Positive slide follows
the declared joint axis; it is not linear travel in meters. The two rail
carriages move independently. The habitat ring structure itself remains fixed.

| Canonical target | Allowed range | Home |
|---|---|---|
| `yaw` | -π to +π rad | 0 |
| `shoulder` | -1.5 to +1.5 rad | 0.6 |
| `elbow` | -2.4 to +0.6 rad | -1.2 |
| `wrist` | -1.6 to +1.6 rad | 0.4 |
| `grip` | 0 to 1 fraction | 0.5 |
| `slide` (rail arms only) | -π to +π rad | 0 |

The active scene catalog is authoritative if a model is replaced. Gripper
targets drive two physical prismatic finger joints, each with its own feedback
controller listening to the same public target topic. There are 52 public arm
channels, 62 physical arm joints and two additional solar hinges. This uses
Gazebo position requests with bounded joint speeds, not motor torque realism.

The native physics plugin now drives these feedback loops and publishes measured
joint positions at 20 Hz. Broken modules, arm mounts and solar-wing mounts detach
their subtrees and disable their motors. See [collision physics](physics-and-damage.md).

## What the Robot Arms model receives

`GET /api/v1/ai/systems/robot_arms` exposes the prompt and current capabilities:
all IDs, labels, owner, modules, mounting descriptions, parent/base/tool links,
nominal mounting poses, approximate reaches, units, limits and service tasks.
Every AI cycle also receives the same measured arm state as the website:

- `measured` and `requested`: canonical per-alias values, with `units`.
- `physical_joints`: raw Gazebo feedback for each physical joint, including
  both fingers. Canonical `grip` is their average converted to openness; inspect
  both physical readings to detect a mismatch.
- `location.base_pose_body`, `tool_pose_body`, `base_pose_world`,
  `tool_pose_world`: measured poses resolved through their named frame parents.
  The tool frame is the wrist link frame, not a verified grasp/contact point.
- `location.pose_source`: `gazebo` only when the relevant measured poses exist;
  otherwise `unavailable`. Check the shared connection freshness as well.
- Five health metrics, faults, maintenance results and nearby-object detections.

Legacy `measured_rad` / `requested_rad` remain available for angular joints
only. They intentionally omit the fractional gripper. The full mesh scene is
kept out of LLM observations; models receive module poses and ship bounds.

For example, Robot Arms may propose this action inside its proposal schema:

```json
{"type":"arm_target","arm_id":"ringRailA","targets":{"slide":0.2,"wrist":-0.3,"grip":0.9}}
```

This becomes a physical command only if Main Judging selects its assigned
action ID and the backend validates the whole plan. The judge can combine it
with actions for other arms, Energy or Propelling. An approved `arm_service`
uses that arm's configured service pose; modeled recovery starts only after
measured joints reach the pose with battery power. No inverse kinematics,
collision-free path planning, verified grasping or material repair is implied.

## Replace or regenerate the model

Editable sources are `tools/convert_modular_ship.py`,
`assets/models/modular_station/model.sdf` and `config/environment.json`.
`conversion.json` records preview source hashes and the axis conversion.
The converter is a dimensional port, not a JSX interpreter: after changing
preview dimensions or mounts, update its layout and regenerate both exports.
Merged link-local OBJ visuals preserve the structure and main details;
procedural textures, animated thrust and other preview effects are omitted.
Collisions use simplified primitives, with self-collision disabled.

From the backend directory, with the development dependencies installed:

```bash
uv run python tools/convert_modular_ship.py --activate
uv run python tools/generate_environment.py
```

Rebuild the backend afterward with the OS-specific commands above. The larger
ship starts 60 m above Earth's orbital plane and uses a 55 m destination
stand-off. The converter raises the old default spawn height when activating
this model; custom spawn/map settings still need suitable clearance.

For an unrelated replacement ship, follow [model imports](models-and-maps.md).
Map joint aliases to its actual SDF joints and declare optional `ship_modules`,
arm `location` and `ship_bounds_body_m`; do not retain metadata for removed
links. Existing simple string joint mappings still work. The original four-arm
model remains under `assets/models/starship/`, and its complete profile is saved
as `config/profiles/starter.json`. To restore it, back up the active
`config/environment.json`, copy the starter profile over it, regenerate the
environment, then rebuild.

An extended mapping can declare conversion and coupled fingers:

```json
{"grip":{"joint_name":"finger_a","coupled_joint_names":["finger_b"],"scale":0.13,"offset":-0.065,"unit":"fraction","max_speed":0.08}}
```

Physical target = canonical target × scale + offset; feedback uses the inverse.
The generator reads physical SDF limits and exports canonical limits. Coupled
joints must share a type and limits. Each gets independent feedback on the
same command topic. `max_speed` is in the physical unit per second.

## Verify without model API charges

After building the image, from the backend directory in Ubuntu WSL or macOS
Terminal (Mac: set `DOCKER_DEFAULT_PLATFORM=linux/amd64` first):

```bash
docker compose run --rm --no-deps -T \
  -e ROS_DOMAIN_ID=79 -e GZ_PARTITION=starship_arm_validation \
  environment python tools/smoke_modular_ship.py
```

The disposable simulation uses fixture model proposals and a combined judge
approval. It checks all ten arm joints, both fingers on each arm, both rail
carriages, moving solar mounts, measured location observations, no actuation
during preview, blocked direct commands and replay protection. It does not
call DeepSeek or change the running main simulation.
