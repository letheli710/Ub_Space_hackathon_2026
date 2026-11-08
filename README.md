# Interstellar X⁴

A spaceship simulation with a React/Three.js frontend and a Space ROS/Gazebo
backend. The browser displays the backend's ship and mission map, measured arm
positions, and simulation time. Its controls send real arm and pause/resume
commands to the simulator.

Disaster injection, ship-health simulation and autonomous AI agents are planned
features. The current ship and map are replaceable starter assets.

## Start here

The project folder is **`Ub_Space_hackathon_2026`**. All instructions use paths
inside this folder, so they work wherever you keep the project.

```text
Ub_Space_hackathon_2026/
├── frontend/                           React website
│   └── README.md                       Frontend setup and troubleshooting
├── UB_Spaceship_Travel_Sim_Backend/    Space ROS/Gazebo backend
│   ├── README.md                       Backend setup and troubleshooting
│   ├── tools/                          Setup, start and stop scripts
│   ├── config/environment.json         Ship/map selection and arm mappings
│   └── assets/                         SDF models, maps and mesh files
├── api_bridge/                         Separate scaffold; not used to run this app
└── shuttle_sim_backend/                Separate scaffold; not used to run this app
```

For the first run, follow these guides in order:

1. [Backend: install WSL/Docker, build and start the simulator](UB_Spaceship_Travel_Sim_Backend/README.md).
2. [Frontend: install Node.js/dependencies and start the website](frontend/README.md).

The frontend runs in Windows PowerShell. The backend's PowerShell launcher runs
the Linux simulator inside Ubuntu WSL. ROS and Gazebo do not need to be installed
directly on Windows. The Humble `.devcontainer/` is a separate development
scaffold and is not required for the launch steps below.

## Open PowerShell in the project folder

1. Open File Explorer and open `Ub_Space_hackathon_2026`.
2. Click the address bar, type `powershell`, and press Enter.
3. Confirm you opened the correct folder:

```powershell
Test-Path .\frontend\package.json
Test-Path .\UB_Spaceship_Travel_Sim_Backend\compose.yaml
```

Both commands should print `True`. Open a second PowerShell window the same way
when starting the frontend.

## Everyday launch after first-time setup

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
dependency installation, run `npm ci` in this folder before `npm run dev`.

Keep this terminal open. Open **<http://127.0.0.1:5173>** in a browser. The
header should show **LIVE**, or **PAUSED** if the simulator has been paused.

## Check that everything works

1. Open the Generator tab. The backend spaceship and four arms should appear.
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

**Backend:** in Terminal 1, still inside `UB_Spaceship_Travel_Sim_Backend`:

```powershell
.\tools\stop.ps1
```

For a full backend rebuild from that same folder:

```powershell
.\tools\stop.ps1
.\tools\start.ps1
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

- [Backend setup, configuration, logs and troubleshooting](UB_Spaceship_Travel_Sim_Backend/README.md)
- [Frontend setup, configuration, builds and troubleshooting](frontend/README.md)
- [HTTP/WebSocket integration contract](UB_Spaceship_Travel_Sim_Backend/docs/web-integration.md)
