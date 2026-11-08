# Frontend — Interstellar X⁴

This is the React/Vite/Three.js website for the simulator. It loads the ship and
mission map from the backend, displays measured telemetry, and sends arm and
pause/resume commands. It does not run ROS or Gazebo inside the browser.

The backend should be running before you test the controls. The website can
open without it, but will show **OFFLINE** and disable simulation commands.

All paths below start inside **`Ub_Space_hackathon_2026`**. No machine-specific
parent folder is required.

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

## 3. Start the backend first

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

1. Wait for the header to show **LIVE**. **PAUSED** also means it is connected,
   with simulation time currently stopped.
2. In **Generator**, confirm the backend ship and four arms are visible.
3. Select a ship system in **Ship system**.
4. Move one or more joint sliders and press **Send arm target**.
5. Watch the arm and its **measured** joint readings change. A target is a
   requested position; the measured value is feedback from Gazebo.
6. Press **Pause simulation** and confirm simulation time stops. Press
   **Resume simulation** to continue.
7. Open **Planetary Trajectories** for the actual backend mission map.
8. Use **Reset View** to frame the current ship/map, or **Full Page** for a
   larger viewer. Drag to orbit; click the 3D view before using WASD/arrow keys.

Targets sent while paused take effect after resuming. If the connection drops,
the interface marks measurements stale, keeps the last scene visible, disables
commands, and retries the connection automatically.

Disaster injection and autonomous AI responses are not connected features in
this version. The disaster catalog is marked as coming later.

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

## Configuration

The default settings work with the backend on port 8000. Skip this section for
the normal local setup.

From the frontend folder, create a local settings file **if `.env.local` does
not already exist**:

```powershell
Copy-Item .env.example .env.local
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

Run from the frontend folder:

```powershell
npm test
npm run build
```

The tests cover connection handling, frame matching and imported mesh handling.
The build writes the compiled website to `dist/`.

To inspect that build locally, stop a running development server with Ctrl+C,
keep the backend running, then run:

```powershell
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
