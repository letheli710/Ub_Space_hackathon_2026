# Interstellar X⁴

**DEMO is the main simulator.** It runs physics directly in the browser, starts at
the existing **7.9 km/s**, and needs no WSL, Docker, Gazebo or API key. Rocks apply
collision impulses; excessive attachment loads detach ship modules and solar wings.
Thrust, fuel, rotation, velocity, position and drifting debris are measured in DEMO.

All eight DEMO planets now move on inclined Kepler ellipses, and the Moon follows
Earth. A moving Earth–Mars reference loop has tangent transfers and far-side
parking arcs behind both planets. The ship is now a [free body with powered course correction](frontend/docs/demo-free-flight.md),
so impacts can knock it off course. Propelling can restore routine navigation
without a proposal or model call; planned and actual flight are shown separately.
**Pause demo** freezes both celestial
and local clocks; local collisions/AI reactions keep their safe timing during
accelerated map playback. See [dynamic celestial motion](frontend/docs/celestial-motion.md)
for sources, controls and guided-spacecraft approximations.

Normal impacts now leave **progressive, repairable component damage**, shown with
scars, tint and integrity bars. Targets cycle through modules or can be selected.
Disasters remain available while paused and after destruction, including wreckage.
Four-role AI now controls DEMO through a lightweight Python gateway on **8001**:
Main Judging approves/combines evasion burns, local arm repairs and solar isolation.
DEMO also has [storm outages, energy shutdowns, integrity speed and reconstruction](frontend/docs/demo-system-rules.md).
Storm hits disable one subsystem for 15 seconds; each 25% energy loss removes
another subsystem's normal power. Engine integrity scales cruise from 7.9 km/s.
A surviving arm must touch a missing component's socket for 10 seconds to recreate
it; emergency power is reserved for energy repairs.
Follow the [DEMO AI setup for Windows/macOS](frontend/docs/demo-ai.md) to enable it.
The frontend **AI API** tab now connects its saved provider, API link, model and
key to all four DEMO roles. Use **Save → Check saved connection**, then run a cycle
from **AI Logs** or **Generator**. Removing the saved connection restores backend
`.env` settings. Restart the Python gateway after updating this code.
The teammate's Earth–Mars round trip, parking orbits and rock trails are included.
**AI Logs** now connects the new per-system tabs and status cards to real gateway
results, including failed calls, judgement reviews and executed-action counts.

### Launch DEMO on Windows or macOS

1. Install Node.js 24 with npm. Check `node --version` and `npm --version`.
2. Open PowerShell (Windows) or Terminal (Mac) in `Ub_Space_hackathon_2026`.
3. Run `cd frontend`, then `npm ci` on first setup or after the lockfile changes.
   Stop any running frontend with Ctrl+C before `npm ci`.
4. Run `npm run dev`. Keep that terminal open and open the localhost URL it prints
   (normally `http://127.0.0.1:5173`).
5. Open **Generator → DEMO**. Select **Asteroid Collision** and click the 3D view
   to place rocks at the pointer. It stays highlighted until clicked again or Esc.
   **Physical space rock → Launch space rock** is a separate preset shot.
   You can also use **DEMO propulsion test controls**. Watch **DEMO TELEMETRY**.
6. Use **Pause demo** to inspect an impact and **Reset demo** to restore the ship.
   Ctrl+C in the terminal stops the frontend.

Map travel retains its playback speed through impacts. Local collision physics
runs at **1x**, with the ship still moving. See the [DEMO physics guide](frontend/docs/demo-physics.md)
for the model, tests, controls and approximations.

### Enable AI for DEMO

With Python dependencies and your key already configured:

1. Start the gateway from `Ub_Space_hackathon_2026/UB_Spaceship_Travel_Sim_Backend`:
   Windows PowerShell: `..\.venv-demo\Scripts\python.exe -m starship_sim.demo_api`.
   macOS Terminal: `../.venv-demo/bin/python -m starship_sim.demo_api`.
   If using the existing `.venv` environment, replace `.venv-demo` with `.venv`.
   Leave this terminal open; the gateway listens on **8001**. To restart it after
   code or `.env` changes, press Ctrl+C and rerun the command.
2. Keep the frontend running with `npm run dev` in its own terminal.
3. Open **AI API → Check backend connection** to use the existing backend `.env`
   (`AI_ENABLED=true` and a valid key), or **Check saved connection** for a browser
   connection. Wait for **Model access verified**.
4. Click **Open spacecraft AI controls → All → Enable DEMO autopilot**. Keep the
   simulator playing. **Run DEMO AI once** runs a single manual cycle.
5. Autopilot watches for threats and repairable damage. For asteroid avoidance,
   set a **60-second preset warning**, then click **Launch space rock**.

See the [AI activation checklist and first-time Windows/macOS setup](frontend/docs/demo-ai.md#enable-ai-with-your-existing-setup)
for full commands and key configuration. **Stop DEMO AI** disables autopilot.

### Optional Gazebo integration

The previously implemented native backend remains available. The sections below
describe that separate integration. Its **25 m/s** speed, AI execution and health
readings belong to Gazebo. In DEMO mode, **AI Logs** now uses the separate DEMO
gateway; selecting Gazebo switches back to the original native AI controls.

A spaceship simulation with a React/Three.js frontend and a Space ROS/Gazebo
backend. The browser displays the backend's ship and mission map, measured arm
positions, and simulation time. Its controls send real arm and pause/resume
commands to the simulator.

The default ship now uses force-based propulsion at the same **25 m/s** nominal
cruise speed. Physical space-rock collisions change motion and can detach modules,
wings and arms. See [physics and damage](UB_Spaceship_Travel_Sim_Backend/docs/physics-and-damage.md)
for Windows/macOS rebuild steps and the material model's scope.

Four DeepSeek-connected AI roles now support proposals, risk analysis and
Main Judging's combined approvals. AI is off by default until you configure a
key. Live health, scenario events, nearby-object sensing and approved arm
maintenance are now implemented in the shared backend game model.
A separate browser physics engine powers the primary DEMO described above.
The **Spacecraft** tab displays the live modular Gazebo ship with ten controlled arms;
**Generator → DEMO** adds mission-day/time-scale controls, asteroids and a solar
storm. The live ship continues to come from the backend's replaceable SDF.
**AI API** saves DEMO connection settings in the browser and sends them through
the DEMO gateway when used; live Gazebo DeepSeek keys remain in backend `.env`.
**AI Logs** shows controls for the selected DEMO/Gazebo mode.
Its original animated design preview remains available separately. Robot Arms
receives all ten IDs, module locations, measured mount/tool poses and joint limits.
See the [ten-arm spacecraft guide](UB_Spaceship_Travel_Sim_Backend/docs/modular-spacecraft.md)
for Windows/macOS rebuild steps, arm locations and control details.
The current ship remains replaceable. The default backend map is now
the solar system converted from the frontend artwork: Sun, eight orbiting
planets, and hazard landmarks. The ship starts near Earth and navigates to Mars.

**Planetary Trajectories uses the backend map**, including measured planet and
ship positions. Scroll or use W/S to zoom, drag or use A/D to pan, and click an
object (or use Inspect) for details. Mission route and Landmarks control map
overlays. Pause controls the Gazebo world; Orbit speed changes the planets'
backend motion. The map has no independent browser animation clock.

## Start here

To make AI act, use **AI Logs → Run one cycle** or **Start loop**. **Analyze only**
is a preview; **Execute approved plan** dispatches its fresh judgement. Watch the
ship in **Generator → LIVE SIM**. The five Demo Telemetry health fields now have
live counterparts shared with AI. See [live status and behavior](UB_Spaceship_Travel_Sim_Backend/docs/ship-state-and-sensing.md)
for rebuild steps and a scenario walkthrough.

The project folder is **`Ub_Space_hackathon_2026`**. All instructions use paths
inside this folder, so they work wherever you keep the project.

```text
Ub_Space_hackathon_2026/
├── frontend/                           React website
│   └── README.md                       Frontend setup and troubleshooting
└── UB_Spaceship_Travel_Sim_Backend/     Space ROS/Gazebo backend
    ├── README.md                       Backend setup and troubleshooting
    ├── tools/                          Setup, start and stop scripts
    ├── config/environment.json         Ship/map selection and arm mappings
    └── assets/                         SDF models, maps and mesh files
```

Choose the instructions for your computer. **macOS** means a Mac laptop or
desktop; the Mac commands below run in Terminal.

| Operating system | Backend first | Frontend second |
|---|---|---|
| Windows | [PowerShell + Ubuntu WSL setup](UB_Spaceship_Travel_Sim_Backend/README.md#windows-setup) | [Windows frontend setup](frontend/README.md#windows-setup) |
| macOS, Intel or Apple Silicon | [Terminal + Docker Desktop setup](UB_Spaceship_Travel_Sim_Backend/README.md#macos-setup) | [macOS frontend setup](frontend/README.md#macos-setup) |

For the first run, follow the backend guide before the frontend guide:

1. [Backend: install the Docker tools for your operating system, build and start](UB_Spaceship_Travel_Sim_Backend/README.md).
2. [Frontend: install Node.js/dependencies and start the website](frontend/README.md).

On Windows, the PowerShell launcher runs the Linux simulator inside Ubuntu WSL.
On macOS, Docker Desktop runs it inside its Linux VM; use `docker compose`
directly from Terminal. ROS and Gazebo stay inside the container on both systems.
The unused API bridge, ROS package and development-container scaffolds have been
removed. The backend container and frontend are the two applications to launch.

## Windows: open PowerShell in the project folder

1. Open File Explorer and open `Ub_Space_hackathon_2026`.
2. Click the address bar, type `powershell`, and press Enter.
3. Confirm you opened the correct folder:

```powershell
Test-Path .\frontend\package.json
Test-Path .\UB_Spaceship_Travel_Sim_Backend\compose.yaml
```

Both commands should print `True`. Open a second PowerShell window the same way
when starting the frontend.

## Windows: launch after first-time setup

### Terminal 1: start the backend

Start in `Ub_Space_hackathon_2026`:

```powershell
cd .\UB_Spaceship_Travel_Sim_Backend
.\tools\start.ps1 -NoBuild
```

Use `-NoBuild` only after a successful full build. For the first build, or after
changing backend code, ship assets, maps or configuration, use:

```powershell
.\tools\start.ps1
```

The default launcher runs the simulator in the background. Wait for
<http://127.0.0.1:8000/readyz> to show `"ready": true` before testing controls.
Initial HTTP 503 responses mean the simulator is still starting.

### Terminal 2: start the frontend

Open a **new** PowerShell window in `Ub_Space_hackathon_2026`:

```powershell
cd .\frontend
npm run dev
```

If this is the first frontend run, or `package-lock.json` changed since the last
dependency installation, stop any existing frontend dev/preview server with
Ctrl+C, then run `npm ci` in this folder before `npm run dev`. Wait for the
installation to finish successfully.

Keep this terminal open. Open **<http://127.0.0.1:5173>** in a browser. The
header should show **LIVE**, or **PAUSED** if the simulator has been paused.

## macOS: first-time setup and launch

### Open Terminal in the project folder

1. Find `Ub_Space_hackathon_2026` in Finder.
2. Press Command+Space, search for **Terminal**, and open it.
3. Type `cd `, including the space, then drag the project folder from Finder into
   Terminal and press Enter. This selects your own project location.
4. Check the folder:

```bash
ls frontend/package.json UB_Spaceship_Travel_Sim_Backend/compose.yaml
```

Both file names should appear. Open each additional Terminal window in the
project folder the same way.

### Install the prerequisites once

1. Install [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/),
   choosing Apple Silicon or Intel to match **Apple menu > About This Mac**.
   Open Docker Desktop and wait for its engine to start. Keep Docker Desktop
   running while using the backend.
2. Install Node.js 24 with npm using the macOS installer from the
   [Node.js download page](https://nodejs.org/en/download). Reopen Terminal after
   installation. The [Mac frontend guide](frontend/README.md#macos-setup) includes
   the version and architecture checks.

Use the Mac guides instead of the Windows WSL setup script and `.ps1` launchers.

### Terminal 1: build and start the backend

Start in `Ub_Space_hackathon_2026`:

```bash
cd UB_Spaceship_Travel_Sim_Backend
docker version
docker compose version
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker compose up -d --build
```

`docker version` should show both Client and Server information. Resolve a
Docker connection error before running the build. The platform setting matches
the pinned Space ROS image and is required on Apple Silicon; set it in every
new backend Terminal window. Docker emulates this architecture on Apple Silicon,
so builds and simulation can take longer.

The first build downloads a large image. After it succeeds, check:

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/readyz
```

Wait for `"ready": true`. An initial HTTP 503 means startup is still in progress.
For logs, readiness failures and optional settings, use the
[Mac backend guide](UB_Spaceship_Travel_Sim_Backend/README.md#macos-setup).

### Terminal 2: install and start the frontend

Open a **new Terminal window** in `Ub_Space_hackathon_2026`:

```bash
cd frontend
node --version
npm --version
npm ci
```

Wait for `npm ci` to finish successfully, then run:

```bash
npm run dev
```

Keep this frontend terminal open and visit **<http://127.0.0.1:5173>**.
The header should show **LIVE** or **PAUSED** once connected.

### Later macOS launches

Open Docker Desktop first. In Terminal 1, starting at the project root:

```bash
cd UB_Spaceship_Travel_Sim_Backend
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker compose up -d --no-build
```

Use `--no-build` only after a successful build and while backend source, assets
and configuration are unchanged. After changes, use `docker compose up -d --build`.
Wait for readiness again. In Terminal 2, starting at the project root:

```bash
cd frontend
npm run dev
```

Run `npm ci` again only when dependencies need installing, such as after a
changed lockfile or a move from Windows to Mac. Stop the frontend first and
install packages on the Mac itself so native dependencies match its OS and CPU.

## Check that everything works

These manual checks use the default `AI_ENABLED=false`. If you enabled AI,
use **AI Logs** to request approved actions instead of sending manual targets.

1. Open Spacecraft or Generator → LIVE SIM. The modular backend ship and ten arms should appear.
2. Change a joint target and press **Send arm target**.
3. Watch the measured joint readings change as the arm moves.
4. Press **Pause simulation**. Simulation time should stop.
5. Press **Resume simulation** to continue.
6. Open **Planetary Trajectories** to see the backend mission map.

Vite forwards the website's `/api` requests, model files and live WebSocket
connection to the backend. There is no additional API bridge to start.

| Address | Purpose |
|---|---|
| <http://127.0.0.1:5173> | Frontend website |
| <http://127.0.0.1:8000/docs> | Interactive backend API reference |
| <http://127.0.0.1:8000/readyz> | Simulator readiness |
| <http://127.0.0.1:8000/api/v1/state> | Current measured simulation state |

These are the default ports. The component guides explain how to change them.

## Stop or rebuild

**Frontend:** press Ctrl+C in the terminal running `npm run dev`.

**Windows backend:** in Terminal 1, still inside `UB_Spaceship_Travel_Sim_Backend`:

```powershell
.\tools\stop.ps1
```

For a full Windows backend rebuild from that same folder:

```powershell
.\tools\stop.ps1
.\tools\start.ps1
```

**macOS backend:** from Terminal inside `UB_Spaceship_Travel_Sim_Backend`:

```bash
docker compose down
```

For a full macOS backend rebuild from that same folder:

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker compose down
docker compose up -d --build
```

Stopping and starting the backend creates a fresh voyage. Restarting the
frontend alone reconnects to the existing simulation.

## Replace the ship or map

Put the SDF models/maps and their mesh dependencies under
`UB_Spaceship_Travel_Sim_Backend/assets/`, select them in
`UB_Spaceship_Travel_Sim_Backend/config/environment.json`, then rebuild the
backend. The same assets generate the physics world and browser scene; a model
change does not require editing React geometry.

See [model and map import instructions](UB_Spaceship_Travel_Sim_Backend/docs/models-and-maps.md)
for formats, joint mappings and import limitations.

## More help

- [Enable AI on Windows or Mac, role prompts and model API ports](UB_Spaceship_Travel_Sim_Backend/docs/ai-management.md)

- [Backend setup, configuration, logs and troubleshooting](UB_Spaceship_Travel_Sim_Backend/README.md)
- [Frontend setup, configuration, builds and troubleshooting](frontend/README.md)
- [HTTP/WebSocket integration contract](UB_Spaceship_Travel_Sim_Backend/docs/web-integration.md)
