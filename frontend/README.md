# Frontend — Interstellar X⁴

This React/Vite/Three.js app runs the main **DEMO simulation in the browser**.
DEMO has rigid-body propulsion, rock impacts, breakable module/wing attachments,
drifting debris and measured telemetry. Initial cruise remains **7.9 km/s**.

Damage is now progressive: normal hits scar and weaken individual components;
repeated/severe hits can detach them. Each component has an integrity bar, and
Main Judging-approved local-arm repairs recover attached damage up to 95%.
Disaster controls remain usable while paused and after destruction. The default
rock is 200 kg at 40 m/s; targets cycle through components or can be selected.

## Run DEMO — Windows and macOS

1. Install Node.js 24 and npm. In PowerShell on Windows or Terminal on a Mac,
   run `node --version` and `npm --version` to check installation.
2. Open that terminal in `Ub_Space_hackathon_2026` and run:

   ```text
   cd frontend
   npm ci
   npm run dev
   ```

   Run `npm ci` only for first setup or dependency/lockfile updates, with all
   frontend servers stopped first. Keep `npm run dev` running in this terminal.
3. Open the URL printed by Vite, normally `http://127.0.0.1:5173`.
4. Choose **Generator → DEMO** (the default). No backend, WSL, Docker or model key
   is required. **Physical space rock** selects target, mass, radius and speed;
   select **Asteroid Collision**, then click the 3D view to launch from the pointer.
   It stays highlighted for repeated placement; click it again or press Esc to cancel.
   **Launch space rock** sends a separate preset projectile. **DEMO propulsion test
   controls** apply finite burns and rotation torques.
5. Read **DEMO TELEMETRY** for velocity, position, spin, fuel, attachment loads,
   nearby objects and lost arm mounts. **Pause demo** freezes physics;
   **Reset demo** restores the ship and its initial speed. Ctrl+C stops Vite.

Map travel keeps its playback speed during placement and impacts; local collision
physics runs at 1x with the ship still moving. Only **Pause demo** pauses it. See the
[DEMO physics guide](docs/demo-physics.md) for details and current approximations.

## Enable real AI in DEMO

Follow the detailed [Windows/macOS DEMO AI launch guide](docs/demo-ai.md). Start
the Python gateway with `python -m starship_sim.demo_api` from the backend folder,
using the Python environment created by that guide. It loads your existing local
backend `.env`, listens on **8001**, and needs no ROS, Gazebo, Docker or WSL.
Keep the gateway and frontend terminals open. Restart Vite for the new proxy route.

In **Generator → DEMO → DEMO AI MANAGEMENT**, check the connection, then run a
cycle or enable autopilot. Subsystems only propose; Main Judging approves and
combines actions. For avoidance tests use **60 s warning**: physics continues
while the API responds. AI Logs also shows the DEMO controls when DEMO is selected.
Paid requests occur only when you run a cycle or enable autopilot.

## Optional backend features

The longer platform setup below also covers the optional Gazebo integration.
Skip its Gazebo-start steps when using DEMO. **Planetary Trajectories** and the
optional Gazebo ship controls still use that backend. AI Logs follows the selected
DEMO/Gazebo mode; the DEMO gateway is independent of the Gazebo process.

The **Spacecraft** tab opens the design preview, with an optional live modular Gazebo ship: eight modules and
ten controlled robotic arms. Its selector identifies each arm, module, mount,
reach and measured body coordinates; a yellow marker highlights the chosen mount.
Angular joints use radians and gripper openness uses a 0–1 fraction. In AI mode,
use **AI Logs** for Main Judging approval. **Generator → LIVE SIM** renders the
same backend SDF and measured joints. **Open design preview** retains the original
exploded view, ring animation and independent illustrative controls.

Rebuild the backend after pulling this change. Follow the
[ten-arm spacecraft guide](../UB_Spaceship_Travel_Sim_Backend/docs/modular-spacecraft.md)
for Windows/macOS launch steps, arm locations, AI control and model replacement.

**Generator → DEMO** includes the modular ship, mission days, adjustable time
acceleration, detailed asteroids, a solar-storm wave and persistent inner-failure
indicators. These are browser simulation features. Live scenarios and AI approval
remain connected to the backend independently.

The **AI API** tab stores optional browser settings only. Live DeepSeek credentials
belong in the backend `.env`, and **AI Logs** controls that connection. Saving a
browser key neither configures the backend nor tests a provider connection.

Planetary Trajectories now displays the backend's solar-system SDF and measured
planet/ship positions. It always uses the backend, independently of the
Generator's Live Sim / Demo selector. The separate browser-only 3D demo is still
available in Generator; it does not move the backend planets.

On the map, scroll or use W/S to zoom, drag or use A/D to pan, use Fit map to
restore the overview, and click a body or use Inspect to see its coordinates.
Mission route shows the current ship-to-destination line. Landmarks toggles
the backend's hazard markers. Pause/resume controls Gazebo; Orbit speed changes
planet motion in the backend (0× stops planets while the ship/arms can continue).
The map keeps its last positions marked stale after disconnection and disables
backend controls. Rebuild the backend after pulling the solar-system changes.

All paths below start inside **`Ub_Space_hackathon_2026`**. No machine-specific
parent folder is required.

| Computer | Follow this guide |
|---|---|
| Windows | [Windows setup in PowerShell](#windows-setup) |
| Mac, Intel or Apple Silicon | [macOS setup in Terminal](#macos-setup) |

Configuration, connection checks and build commands are shared; each setup
section explains how to start the backend for that operating system.

## Windows setup

Use Windows PowerShell for steps 1–7 below. Mac users should follow
[macOS setup](#macos-setup).

## 1. Install or check Node.js

Use **Node.js 24**, the version used to verify this project. It includes npm.

1. Open the official [Node.js download page](https://nodejs.org/en/download).
2. Select Node.js 24 and the Windows installer appropriate for your computer.
3. Run the installer, including npm, and finish installation.
4. Close and reopen PowerShell so it sees the installed commands.

If Node.js is already installed, check it in PowerShell:

```powershell
node --version
npm --version
```

You should see version numbers. The locked Vite version requires Node.js
`^20.19.0` or `>=22.12.0`; Node.js 24 satisfies that requirement.
If either command is not found, finish installation and reopen PowerShell.

## 2. Open PowerShell in the project folder

1. Open `Ub_Space_hackathon_2026` in File Explorer.
2. Click its address bar, type `powershell`, and press Enter.
3. Check the folder:

```powershell
Test-Path .\frontend\package.json
Test-Path .\UB_Spaceship_Travel_Sim_Backend\compose.yaml
```

Both should print `True`.

## 3. Optional: start the backend (skip for DEMO)

For a machine that has already completed the WSL/Docker setup and a full backend
build, run this from the project-root PowerShell window:

```powershell
.\UB_Spaceship_Travel_Sim_Backend\tools\start.ps1 -NoBuild
```

For the first build, or after backend code/assets/configuration changed, omit
`-NoBuild`:

```powershell
.\UB_Spaceship_Travel_Sim_Backend\tools\start.ps1
```

Use **one** of those start commands. If a backend is already running and you
need to rebuild it, stop it first:

```powershell
.\UB_Spaceship_Travel_Sim_Backend\tools\stop.ps1
```

If WSL or Docker has not been set up yet, follow the
[backend README](../UB_Spaceship_Travel_Sim_Backend/README.md), including its
Docker setup-script step, before starting the backend.

Wait for <http://127.0.0.1:8000/readyz> to show **`"ready": true`**. An initial
HTTP 503 response is normal while the simulator starts. The default backend
launcher runs in the background; it does not need this PowerShell window to
remain open afterward.

## 4. Open a frontend terminal and install dependencies when needed

Install dependencies on the first setup and after pulling a changed lockfile.
For later starts with dependencies already installed, go directly to step 5.

**Before running `npm ci`, stop every existing dev or preview server for this
frontend with Ctrl+C in its terminal.** On Windows, a running Vite server can
hold native dependency files open and prevent npm from replacing them.

Open a **new PowerShell window** in `Ub_Space_hackathon_2026`, using the same
File Explorer method from step 2. Then run:

```powershell
cd .\frontend
Test-Path .\package.json
npm ci
```

`Test-Path` should print `True`. `npm ci` installs the exact dependencies recorded
in `package-lock.json`. Wait until it finishes successfully. Internet access is
needed to download packages that are not cached. **If it prints an error, stop
here and fix the installation before running `npm run dev`.** See the
[installation recovery steps](#npm-ci-fails-with-eperm-and-vite-is-not-recognized)
below for a locked Rolldown file or missing Vite command.

Keep this terminal in `Ub_Space_hackathon_2026/frontend` for the remaining
frontend commands. Run `npm ci` again after pulling a changed lockfile or when
dependencies have not been installed on this computer.

## 5. Start the website

In that frontend terminal:

```powershell
npm run dev
```

The terminal should print a local URL using port **5173**. Keep the terminal
open and visit **<http://127.0.0.1:5173>** in your browser.

The port is fixed: Vite reports an error if 5173 is already occupied rather than
silently switching to a different port. If the page already opens from an
existing development session, you can use that session.

## 6. Verify the live connection

These manual checks assume the default `AI_ENABLED=false`. With AI enabled,
use **AI Logs** for Main Judging approval; manual arm commands are disabled.

1. Wait for the header to show **LIVE**. **PAUSED** also means it is connected,
   with simulation time currently stopped.
2. In **Spacecraft** or **Generator → LIVE SIM**, confirm the modular ship and ten arms are visible.
3. Select an ID in **Robot Arms · select arm**.
4. Move one or more joint sliders and press **Send arm target**.
5. Watch the arm and its **measured** joint readings change. A target is a
   requested position; the measured value is feedback from Gazebo.
6. Press **Pause simulation** and confirm simulation time stops. Press
   **Resume simulation** to continue.
7. Open **Planetary Trajectories** for the backend map. Inspect Earth or Mars,
   check live coordinates, and confirm the map and 3D view use the same world.
8. Use **Reset View** in the 3D view or **Fit map** on the map. **Full Page**
   enlarges either viewer. The map supports zoom/pan; the 3D view supports orbit.

Targets sent while paused take effect after resuming. If the connection drops,
the interface marks measurements stale, keeps the last scene visible, disables
commands, and retries the connection automatically.

Disasters and AI responses in Generator's Demo mode are browser illustrations.
Live scenario events now affect backend health. In LIVE SIM, use Disaster Maker
to apply one. Asteroid Collision launches a physical rock using the component,
mass, speed and radius controls; other events apply modeled faults. See
[physics and damage](../UB_Spaceship_Travel_Sim_Backend/docs/physics-and-damage.md)
for Windows/macOS rebuild steps and examples. The
five Demo Telemetry health readings have live counterparts shared with AI.
API-connected AI management is available in **AI Logs**; follow the setup below.

## Enable the four AI systems (Windows and macOS)

1. Follow the backend [AI setup guide](../UB_Spaceship_Travel_Sim_Backend/docs/ai-management.md#configure-later-or-enable-now)
   to create/edit backend `.env`, set `DEEPSEEK_API_KEY` and `AI_ENABLED=true`, and
   rebuild/recreate the backend using the commands for your operating system.
   You may do this later; no key is required for the default environment.
2. Start the frontend normally with `npm run dev`. There is no frontend model
   key or additional server to start. The four roles use the existing API proxy.
3. Open **AI Logs**. Check Main Judging, Energy, Propelling and Robot Arms show
   their model and configured state. Configured means a key exists; the first
   cycle verifies the connection. Missing keys and disabled AI are shown clearly.
4. Choose **Analyze only** for proposals plus judgement without actuation, then
   **Execute approved plan** to dispatch the fresh plan once, or
   **Run one cycle** to execute Main Judging's approved combination. **Start loop**
   repeats cycles and makes paid API calls until **Stop AI** is selected.
5. Inspect each proposal, risk review, combination rationale and dispatch result.
   Compare against measured arm/panel positions and propulsion state in telemetry.
   Dispatch confirms publication, not successful repair.

In AI-managed mode, manual arm sliders are disabled and the ship coasts without
thrust until Main Judging approves Propelling's request. Stop AI
revokes propulsion and cancels analysis/maintenance; previous joint targets may continue.
Pause the simulation to freeze motion. The **LIVE SPACECRAFT AI** panel controls
the backend even when Generator's separate Demo mode is selected.

Hull/panel health, battery, oxygen, efficiency, charge balance and maintenance
now evolve in the backend game model. Detections and measured velocity come from
Gazebo physics. Fuel use and attachment fracture are modeled; electrical power
and maintenance remain abstract. Detached hardware cannot be repaired in flight.
Scripted disaster responses in Demo remain illustrations and never
authorize the backend. See the [AI integration routes](../UB_Spaceship_Travel_Sim_Backend/docs/ai-management.md#model-connection-ports)
for connecting a different web interface.

See [live status and sensing](../UB_Spaceship_Travel_Sim_Backend/docs/ship-state-and-sensing.md)
for a scenario and execution walkthrough on Windows and Mac.

## 7. Stop and restart the website

Press **Ctrl+C** in the terminal running `npm run dev`. This stops the website;
the backend continues running independently.

To start the website again from the same frontend folder:

```powershell
npm run dev
```

You do not need to reinstall dependencies on every start.

To stop the backend as well, open PowerShell in `Ub_Space_hackathon_2026` and run:

```powershell
.\UB_Spaceship_Travel_Sim_Backend\tools\stop.ps1
```

## macOS setup

Use **Terminal** for these Mac steps. The frontend runs on macOS with Node.js;
Docker Desktop runs the Linux backend. Follow the Mac backend guide for its
Docker setup rather than the Windows WSL commands or `.ps1` launchers.

### Mac step 1: install or check Node.js

1. Open the official [Node.js download page](https://nodejs.org/en/download).
2. Select **Node.js 24**, **macOS**, and the installer (`.pkg`). If asked to
   choose an architecture, use **arm64** for Apple Silicon or **x64** for Intel.
   Check **Apple menu > About This Mac** if unsure which chip you have.
3. Run the installer with npm included, then reopen Terminal.
4. Check the installation:

```bash
node --version
npm --version
node -p 'process.platform + " " + process.arch'
```

The first two commands should print version numbers. Node.js 24 satisfies the
locked Vite requirement, `^20.19.0` or `>=22.12.0`. The last command should show
`darwin arm64` on Apple Silicon or `darwin x64` on Intel with the matching Node
installation. Install dependencies separately on each operating system and CPU
architecture so native packages match the machine running the frontend.

### Mac step 2: open Terminal in the project folder

1. Find `Ub_Space_hackathon_2026` in Finder.
2. Press Command+Space, search for **Terminal**, and open it.
3. Type `cd `, including the space. Drag the project folder from Finder into
   Terminal, then press Enter.
4. Check the project files:

```bash
ls frontend/package.json UB_Spaceship_Travel_Sim_Backend/compose.yaml
```

Both file names should appear. Repeat this folder-opening method whenever a
step asks for a new Terminal window at the project root.

### Mac step 3: optional backend (skip for DEMO)

First complete the Docker Desktop setup in the
[Mac backend guide](../UB_Spaceship_Travel_Sim_Backend/README.md#macos-setup).
Open Docker Desktop and keep it running. If the backend is already ready at
<http://127.0.0.1:8000/readyz>, continue to Mac step 4.

For the first build, or after backend source/assets/configuration changed,
start from `Ub_Space_hackathon_2026` in Terminal:

```bash
cd UB_Spaceship_Travel_Sim_Backend
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker compose up -d --build
```

The platform matches the pinned Space ROS image. On Apple Silicon, Docker
emulates amd64, so builds and simulation can be slower. Repeat the export in
each new backend Terminal window; it also works on Intel Macs.

For a later start with an existing image and unchanged backend files, use
`docker compose up -d --no-build` instead of the build command, from the same
backend folder with the platform export set.

After startup, check:

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/readyz
```

Wait for **`"ready": true`**. An initial HTTP 503 means the simulator is still
starting; check again after a short wait. The `-d` backend continues in the
background while Docker Desktop is running.

### Mac step 4: install frontend dependencies when needed

Open a **new Terminal window** in `Ub_Space_hackathon_2026` and run:

```bash
cd frontend
ls package.json package-lock.json
```

For the first setup, after a changed lockfile, or after moving the checkout
from another OS/CPU architecture, stop any running frontend dev/preview server
with Ctrl+C and install the dependencies on this Mac:

```bash
npm ci
```

Wait until npm finishes successfully. If it prints an error, fix the installation
before starting Vite. Keep this Terminal window inside the frontend folder.
For later launches with dependencies already installed and unchanged, skip the
installation and continue to Mac step 5.

### Mac step 5: start the website

In the frontend Terminal window:

```bash
npm run dev
```

Open **<http://127.0.0.1:5173>** and keep this Terminal window open. Vite forwards
the website's `/api` requests, model assets and live WebSocket connection to
the backend at port 8000. The port is fixed; stop an older frontend dev/preview
server before starting a second one on 5173.

### Mac step 6: verify the connection

Wait for **LIVE**, or **PAUSED** if simulation time is stopped. In Generator,
confirm the backend ship and arms appear. Resume if paused, send an arm target
and watch its measured readings change. The full
[live connection checks](#6-verify-the-live-connection) above apply on Mac too.

### Mac step 7: stop or restart

Press **Ctrl+C** in the frontend terminal to stop Vite. To start it again from
that same folder, run `npm run dev`; reinstalling dependencies is only needed
when the conditions in Mac step 4 apply.

To stop the backend, open Terminal in `Ub_Space_hackathon_2026` and run:

```bash
cd UB_Spaceship_Travel_Sim_Backend
docker compose down
```

Use the [Mac backend guide](../UB_Spaceship_Travel_Sim_Backend/README.md#macos-setup)
for backend restarts, rebuilds and container logs. Restarting only the frontend
reconnects to the existing simulation.

## Configuration

The default settings work with the backend on port 8000. Skip this section for
the normal local setup.

From the frontend folder, create a local settings file **if `.env.local` does
not already exist**. In Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

In macOS Terminal, this conditional preserves an existing file:

```bash
if [ ! -f .env.local ]; then
  cp .env.example .env.local
fi
```

Edit it in your editor. Preserve any existing local settings.

| Setting | Default | When to change it |
|---|---|---|
| `SIMULATOR_PROXY_TARGET` | `http://127.0.0.1:8000` | The backend uses another port or host during development/preview. |
| `VITE_SIMULATOR_URL` | Empty | The built browser app should use an explicit backend URL or deployment prefix instead of the website's own `/api` route. |

For example, if the backend's `SIM_PORT` is `8001`, use:

```dotenv
SIMULATOR_PROXY_TARGET=http://127.0.0.1:8001
VITE_SIMULATOR_URL=
```

Stop and restart Vite after changing these settings. Rebuild production files
after changing `VITE_SIMULATOR_URL`.

Vite forwards `/api` requests, model assets and WebSocket traffic to the backend.
For direct browser connections to a separately hosted backend, its
`WEB_ORIGINS` must include the website's exact origin, including scheme and port.
The default backend configuration allows both localhost and 127.0.0.1 on 5173.

## Tests and a production-build preview

Run from the frontend folder in Windows PowerShell or macOS Terminal; these
commands are the same on both:

```sh
npm test
npm run build
```

The tests cover connection handling, frame matching and imported mesh handling.
The build writes the compiled website to `dist/`.

To inspect that build locally, stop a running development server with Ctrl+C,
keep the backend running, then run:

```sh
npm run preview
```

Open <http://127.0.0.1:5173>. Keep the preview terminal open and stop it with Ctrl+C.
The preview server also forwards `/api` to the configured backend.

For hosting, serve `dist/` and configure the host's reverse proxy to forward
`/api`, including WebSocket upgrades, to the backend. `npm run preview` is for
local verification. See the
[web integration guide](../UB_Spaceship_Travel_Sim_Backend/docs/web-integration.md).

## Troubleshooting

| Problem | What to do |
|---|---|
| `node` or `npm` is not recognized | Install Node.js with npm, then reopen PowerShell. |
| macOS says `zsh: command not found: node` or `npm` | Finish the Node.js macOS installer and reopen Terminal; see Mac step 1. |
| macOS says `vite: command not found` | From the frontend folder, complete `npm ci` successfully before running `npm run dev`. |
| A native Rolldown dependency is missing or has the wrong architecture on Mac | Stop Vite, check the Node architecture in Mac step 1 and rerun `npm ci` on this Mac to install its native dependencies. |
| An `EBADENGINE` or unsupported Node version message appears | Check `node --version` and use Node.js 24, or a version satisfying the requirement in step 1. |
| `npm ci` cannot find `package.json` or the lockfile | Confirm you are in `Ub_Space_hackathon_2026/frontend`; `Test-Path .\package-lock.json` should return `True`. |
| `npm ci` reports `EPERM` while unlinking a Rolldown `.node` file | Stop the existing frontend dev/preview server before reinstalling; follow the recovery steps below. |
| `'vite' is not recognized` after an install error | The dependency installation is incomplete. Finish the recovery steps below before starting the website. |
| A package download fails | Check the network/proxy error printed by npm, resolve it, and rerun `npm ci`. |
| Port 5173 is already in use | Use the existing frontend session or stop its dev/preview server with Ctrl+C before starting another. |
| The page opens but says OFFLINE or Simulator unavailable | Check backend `/readyz`, start the backend if needed, and confirm the proxy target matches its port. |
| The API is ready but the live stream does not connect | Confirm the backend's `WEB_ORIGINS` contains the exact browser origin and that a hosting proxy supports WebSocket upgrades. |
| An arm target is accepted but does not move | Resume the simulation if paused. Compare requested and measured values; physical limits/collisions can prevent reaching a target. |
| The model shows an asset-loading error | Check backend logs, the selected asset files and the [model import guide](../UB_Spaceship_Travel_Sim_Backend/docs/models-and-maps.md). Rebuild after asset changes. |

### `npm ci` fails with `EPERM` and `vite` is not recognized

These errors can occur together. `npm ci` removes the existing `node_modules`
before reinstalling dependencies, as described in the
[npm documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
If a running Vite dev/preview server has
`rolldown-binding.win32-x64-msvc.node` loaded, Windows prevents npm from deleting
that file. The failed installation can leave `node_modules/.bin/vite.cmd`
missing, so `npm run dev` then reports that `vite` is not recognized.
The following `.cmd` and PowerShell recovery commands are for Windows; Mac
users should use `npm ci` in Terminal as described in Mac step 4.

1. Find each terminal running this project's `npm run dev` or `npm run preview`.
   Press **Ctrl+C** and wait until the PowerShell prompt returns. Keep the backend
   running; it does not need to be stopped for a frontend dependency install.
2. In PowerShell inside `Ub_Space_hackathon_2026/frontend`, reinstall:

```powershell
npm.cmd ci
```

3. Wait for npm to finish successfully. Check the result:

```powershell
$LASTEXITCODE
Test-Path .\node_modules\.bin\vite.cmd
```

   The exit code should be `0` and the file check should print `True`. If npm
   still reports an error, resolve that error before continuing.
4. Start the website:

```powershell
npm.cmd run dev
```

Open <http://127.0.0.1:5173> and keep that terminal open. For future launches,
run `npm run dev` directly when dependencies have not changed.

If the same file remains locked and you cannot find the old server terminal,
save your work and restart Windows. Then rerun `npm.cmd ci` in the frontend
folder before starting any frontend server. After a restart, also start the
backend again using step 3 when you are ready to test the connected simulator.

### PowerShell blocks `npm.ps1`

Use npm's Windows command launcher from the same frontend folder:

```powershell
npm.cmd ci
npm.cmd run dev
```

For a blocked backend `.ps1` launcher, use the project-specific instructions in
the [backend troubleshooting section](../UB_Spaceship_Travel_Sim_Backend/README.md#powershell-blocks-a-ps1-launcher).
