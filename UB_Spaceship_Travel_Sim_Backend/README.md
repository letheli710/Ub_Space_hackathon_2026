# Backend — Space ROS and Gazebo

This backend runs the spaceship physics and exposes an HTTP/WebSocket interface
to the frontend. The default API port is **8000**. The default ship has four
articulated arms and travels toward a destination planet in a zero-gravity map.

This guide covers the Windows + Ubuntu WSL setup used for this project. Run the
commands in **Windows PowerShell**, including commands that begin with `wsl`.
The launcher handles the Linux/container side for you.

## 1. Open the correct project folder

1. Open `Ub_Space_hackathon_2026` in File Explorer.
2. Click the address bar, type `powershell`, and press Enter.
3. Enter the backend folder:

```powershell
cd .\UB_Spaceship_Travel_Sim_Backend
Test-Path .\tools\setup_docker_wsl.sh
Test-Path .\compose.yaml
```

Both checks should print `True`. Keep this PowerShell window in the backend
folder for the remaining backend commands. If you already opened PowerShell
inside this folder, skip the `cd` command.

You do not need Node.js or a Windows ROS/Gazebo installation to run the backend.
Docker installs the simulation dependencies inside its Linux image. Python on
Windows is optional and is only needed for the development checks near the end
of this guide.

## 2. Check whether Ubuntu WSL 2 is installed

In PowerShell:

```powershell
wsl --list --verbose
```

For example, you might see:

```text
  NAME      STATE           VERSION
* Ubuntu    Running         2
```

**This output means WSL and Ubuntu are already installed, Ubuntu is currently
running, and it uses WSL 2. Continue to step 3. Do not install WSL again.**

Read the columns as follows:

| Output | Meaning | What to do |
|---|---|---|
| `Ubuntu` under `NAME` | Ubuntu is an installed Linux distribution. | Use `Ubuntu` in the commands below. |
| `Running` under `STATE` | Ubuntu is currently active. | Stay in PowerShell and continue to step 3. |
| `Stopped` under `STATE` | Ubuntu is installed but currently inactive. | Stay in PowerShell and continue to step 3; the next `wsl -d Ubuntu ...` command starts it automatically. |
| `2` under `VERSION` | Ubuntu uses WSL 2, which this backend requires. | Continue with the guide. |
| `*` before `Ubuntu` | Ubuntu is your default distribution. | No action is needed. |

If the row instead says `Ubuntu Stopped 2`, your WSL setup is also ready for the
next step. **Both `Running` and `Stopped` are normal states.**

### When do I need to launch WSL myself?

For normal project use, **keep using Windows PowerShell in the backend folder**.
You do not need to open the Ubuntu app or run a separate `wsl` command to enter
a Linux terminal. The commands beginning with `wsl -d Ubuntu ...` run the needed
Linux commands for you, and `tools/start.ps1` also starts Ubuntu when needed.
Open the Ubuntu app during its first-time setup if you need to create your Linux
username and password, as described below.

`Running` refers to **Ubuntu**, so you still need to check Docker in step 3,
launch the backend in step 5, and confirm simulator readiness in step 6.

If Ubuntu is listed with **VERSION 1**, it needs WSL 2 before you continue; see
Microsoft's [WSL version commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands#set-wsl-version-to-1-or-2).

### If WSL or Ubuntu is missing

1. Open a separate PowerShell window with **Run as administrator**.
2. Run:

```powershell
wsl --install -d Ubuntu
```

3. Restart Windows if requested.
4. Open Ubuntu from the Start menu and finish its initial setup, including
   creating a Linux username and password when prompted.
5. Reopen PowerShell in the backend folder as described in step 1.
6. Run `wsl --list --verbose` again to confirm Ubuntu is available.

For Windows requirements and installation help, see Microsoft's
[WSL installation instructions](https://learn.microsoft.com/en-us/windows/wsl/install).

### If the distribution has a different name

Use the exact name printed by `wsl --list --verbose`. Replace `Ubuntu` after
`-d` in the WSL commands below. Pass the same name to both project launchers:

```powershell
.\tools\start.ps1 -Distribution Ubuntu-24.04
.\tools\stop.ps1 -Distribution Ubuntu-24.04
```

These are examples for a distribution named `Ubuntu-24.04`; use your actual
distribution name. The normal setup in this guide uses `Ubuntu`.

## 3. Check Docker and install it if needed

**Working folder: `Ub_Space_hackathon_2026/UB_Spaceship_Travel_Sim_Backend`.**

First, check Docker from the PowerShell window from step 1:

```powershell
wsl -d Ubuntu -u root -- docker version
wsl -d Ubuntu -u root -- docker compose version
```

These commands also start Ubuntu automatically if it was `Stopped`.

- If the first command prints both **Client** and **Server** information, and
  the second prints `Docker Compose version ...`, Docker is ready. Skip the
  installation command below and continue to step 4, then launch in step 5.
- If Docker or its Compose command is missing, run the installation command below.
- If Docker is installed but says it cannot connect to the Docker daemon, start
  Docker with this command, then repeat the two checks above:

```powershell
wsl -d Ubuntu -u root -- systemctl start docker
```

### Install Docker — first time only, or if a check says it is missing

Still in the same PowerShell window and backend folder, run:

```powershell
wsl -d Ubuntu -u root -- bash ./tools/setup_docker_wsl.sh
```

The relative path works because WSL inherits the current project folder. This
command runs the script through Linux Bash as the Linux root user. You do not
need to double-click the `.sh` file or mark it executable first.

The script downloads package information, installs Docker Engine and Docker
Compose inside Ubuntu, starts Docker, and prints version information. Wait for
it to finish. A successful run ends with Docker client/server information and a
`Docker Compose version ...` line.

Use the `wsl` prefix: this setup installs Docker inside Ubuntu. Running `docker`
directly in Windows PowerShell is not required.

You can skip the installation command on later runs when the two checks above
succeed. Continue to step 4, then launch the backend in step 5.

## 4. Choose configuration — optional

The defaults work with the frontend on port 5173, so you can skip this step.
To customize the backend, create a local configuration file from the example
**if you do not already have `.env`**:

```powershell
Copy-Item .env.example .env
```

Edit `.env` in your editor. Keep an existing `.env` rather than overwriting it.

| Setting | Default | Meaning |
|---|---|---|
| `SIM_PORT` | `8000` | The backend port exposed on this computer. |
| `WEB_ORIGINS` | Localhost/127.0.0.1 on ports 3000 and 5173 | Exact browser origins allowed to connect. Keep the frontend's origin in this list. |
| `SPACE_ROS_IMAGE` | `osrf/space-ros:jazzy-2026.07.0` | Space ROS container base. Use the supplied value for the documented setup. |

If you change `SIM_PORT`, also change the frontend's proxy target as described
in the [frontend README](../frontend/README.md#configuration).

## 5. Build and start the backend

Still in the backend folder:

```powershell
.\tools\start.ps1
```

The first build downloads a large container image and simulation dependencies,
so it can take several minutes. Let it finish. The launcher:

1. Packages the source files and assets for Docker.
2. Builds the Space ROS/Gazebo image.
3. Generates the physics world, browser scene and ROS bridge from the selected
   ship and map configuration.
4. Starts the backend in a hidden, attached WSL session.
5. Prints the API and readiness addresses.

The attached WSL session keeps Ubuntu and the simulator running in the
background. After a successful background launch, this PowerShell window can
be closed. Use the stop script in step 8 when finished.

### Later starts without a rebuild

After at least one successful build, use this when backend code, assets and
configuration have not changed:

```powershell
.\tools\start.ps1 -NoBuild
```

### Run with logs in the terminal

For a foreground session, use:

```powershell
.\tools\start.ps1 -NoBuild -Foreground
```

Keep that terminal open. Use another PowerShell window in the backend folder
to run the stop script when finished.

## 6. Confirm the simulator is ready

Open <http://127.0.0.1:8000/readyz> in your browser, or run:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/readyz
```

Find **`ready: true`** in the response. An initial HTTP 503 response means the
API is waiting for live Gazebo measurements; wait briefly and check again.

| Address | What it shows |
|---|---|
| <http://127.0.0.1:8000/docs> | Interactive API reference. |
| <http://127.0.0.1:8000/readyz> | Whether the simulation is ready. |
| <http://127.0.0.1:8000/healthz> | API liveness and simulation connection information. |
| <http://127.0.0.1:8000/api/v1/scene> | The selected ship/map geometry and arm definitions. |
| <http://127.0.0.1:8000/api/v1/state> | Measured time, poses, joint positions and navigation state. |

The live WebSocket address is `ws://127.0.0.1:8000/api/v1/telemetry`.
Use your configured port instead of 8000 if you changed `SIM_PORT`.

## 7. Start the frontend and test the connection

1. Open a **new** PowerShell window in `Ub_Space_hackathon_2026` using File Explorer.
2. Enter the frontend folder:

```powershell
cd .\frontend
```

3. If this is its first run, install dependencies:

```powershell
npm ci
```

4. Start the website:

```powershell
npm run dev
```

5. Keep that terminal open and visit <http://127.0.0.1:5173>.
6. Confirm **LIVE** appears in the header. **PAUSED** also indicates a connected
   simulator, with time currently stopped.
7. Select an arm, change a target and press **Send arm target**. The measured
   readings should change as the arm moves. Resume first if the simulator is paused.

Node.js is required for these frontend commands. The
[frontend README](../frontend/README.md) includes installation and troubleshooting
steps. You do not need to start `api_bridge/`, `shuttle_sim_backend/` or the
Humble development container for this connection.

## 8. Stop, restart or rebuild

From a PowerShell window in the backend folder:

```powershell
.\tools\stop.ps1
```

This stops and removes this simulator's container/network and lets the hidden
WSL launch session exit. Stop the frontend separately with Ctrl+C in its terminal.

For a fresh voyage using the existing image:

```powershell
.\tools\stop.ps1
.\tools\start.ps1 -NoBuild
```

After changing backend code, assets, maps, configuration, or pulling such changes:

```powershell
.\tools\stop.ps1
.\tools\start.ps1
```

The simulation has no persistence or reset endpoint in this version. A new
backend container starts a fresh voyage. The website reconnects automatically.

## Logs and troubleshooting

Launcher logs are saved under `.runtime/` in this backend folder. You can also
read container logs from PowerShell in the same folder:

```powershell
wsl -d Ubuntu -u root -- docker compose ps
wsl -d Ubuntu -u root -- docker compose logs --tail 100
```

| Problem | What to do |
|---|---|
| The setup script cannot be found | Run `Test-Path .\tools\setup_docker_wsl.sh`. If it is `False`, reopen PowerShell in the correct folder using step 1. |
| WSL cannot find `Ubuntu` | Check `wsl --list --verbose`, finish Ubuntu's first-run setup, or use your actual distribution name in step 2. |
| Docker cannot connect to its daemon | Run `wsl -d Ubuntu -u root -- systemctl start docker`, then retry. If Docker is missing, run step 3. |
| `systemctl` says the system was not booted with systemd | Follow Microsoft's [WSL systemd instructions](https://learn.microsoft.com/en-us/windows/wsl/systemd), then rerun step 3. |
| A Windows/WSL metadata or `xattr` error occurs during a build | Use `tools/start.ps1` from PowerShell as documented; it packages a source archive for this reason. |
| Docker prints a deprecated legacy-builder warning | If the build continues, let it finish. The warning itself does not indicate the build failed. |
| Port 8000 is already in use | Stop an existing copy of this simulator, or choose another `SIM_PORT` and update the frontend proxy target. |
| `/readyz` stays unavailable | Check `.runtime/` and the container logs for the actual startup error. `/healthz` distinguishes an API connection from simulation readiness. |
| The website says OFFLINE or reports a WebSocket origin error | Check backend readiness, the frontend proxy target, and that `WEB_ORIGINS` includes the exact website origin. |

### PowerShell blocks a `.ps1` launcher

If the error says script execution is disabled, and you trust this project's
local scripts, enable local scripts for **this PowerShell window only**:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

If scripts downloaded in a ZIP are blocked as unsigned, unblock these specific
project files, then retry the launch command:

```powershell
Unblock-File .\tools\start.ps1
Unblock-File .\tools\stop.ps1
```

The process-scoped policy ends when you close this PowerShell window. If an
organization policy still blocks scripts, follow that policy or contact its
administrator. See Microsoft's
[execution policy documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies).

## Optional development checks

Running the container does not require these host-side tools. For local Python
tests, install Python 3.12+ and/or [uv](https://docs.astral.sh/uv/getting-started/installation/).
From the backend folder:

```powershell
uv sync --locked
uv run python tools/generate_environment.py --check
uv run pytest -q
```

With the backend running and unpaused, check the live simulator:

```powershell
uv run python tools/smoke_test.py
```

To exercise HTTP/WebSocket traffic through a running frontend as well:

```powershell
uv run python tools/smoke_test.py --base-url http://127.0.0.1:5173
```

The smoke test sends real simulated arm targets and briefly pauses/resumes the
simulation. It verifies time, ship movement, measured joint movement and live
WebSocket delivery.

## Change ship/map assets

Choose SDF files, arm mappings, destination and cruise speed in
`config/environment.json`. Put asset files under `assets/`, then stop and rebuild
the backend. See [model/map import instructions](docs/models-and-maps.md).

The build generates `worlds/environment.sdf`, `config/scene.json` and
`config/bridge.yaml`. To refresh the host-side exports while developing:

```powershell
uv run python tools/generate_environment.py
uv run python -m tools.export_openapi
```

See [the integration contract](docs/web-integration.md) for endpoints and
[the validation record](docs/validation.md) for checks already performed.
