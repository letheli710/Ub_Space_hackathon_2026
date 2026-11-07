# Interstellar X⁴

A React/Three.js frontend connected to a Space ROS/Gazebo spaceship environment.
The browser renders the backend's ship and mission map, displays measured arm
positions and simulation time, and sends real pause/resume and arm commands.
Disaster injection, ship-health dynamics and autonomous AI agents are future work.

## Run on this Windows machine

The repository root is:

```text
C:\Users\usjac\Desktop\Coding Studio\Codex\UB_Hacking-Starship_Travel_Simulator\Ub_Space_hackathon_2026
```

**PowerShell terminal 1 — backend:**

```powershell
cd "C:\Users\usjac\Desktop\Coding Studio\Codex\UB_Hacking-Starship_Travel_Simulator\Ub_Space_hackathon_2026"
.\UB_Spaceship_Travel_Sim_Backend\tools\start.ps1
```

This builds the current environment and starts it in a hidden WSL session.
Docker Engine and Compose must be installed in Ubuntu WSL, or use the existing
setup script described in the backend README. After a successful build, use
`start.ps1 -NoBuild` for quicker starts when backend code/assets have not changed.
Before rebuilding an already running backend, stop it with:

```powershell
.\UB_Spaceship_Travel_Sim_Backend\tools\stop.ps1
```

**PowerShell terminal 2 — frontend:**

```powershell
cd "C:\Users\usjac\Desktop\Coding Studio\Codex\UB_Hacking-Starship_Travel_Simulator\Ub_Space_hackathon_2026\frontend"
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The status should change to **LIVE** after telemetry
arrives. The initial camera follows the backend ship; Planetary Trajectories
shows the actual mission map. Select a ship system to command its arm, and read
the measured joint angles to confirm movement. Arm targets accepted while
paused take effect after resuming. Stop the frontend with Ctrl+C and the backend
with `UB_Spaceship_Travel_Sim_Backend\tools\stop.ps1` from the repository root.

- API documentation: <http://127.0.0.1:8000/docs>
- Backend readiness: <http://127.0.0.1:8000/readyz>
- Frontend: <http://127.0.0.1:5173>

Vite forwards `/api` HTTP requests, model assets and WebSocket connections to
port 8000. There is no need to launch `api_bridge/` or `shuttle_sim_backend/`.
Those folders and the Humble `.devcontainer/` are separate scaffolds; the active
simulator is the Jazzy environment under `UB_Spaceship_Travel_Sim_Backend/`.

## Replace the ship or map

The current assets are placeholders. Put SDF models/maps and their mesh files
under `UB_Spaceship_Travel_Sim_Backend/assets/`, then select them in
`UB_Spaceship_Travel_Sim_Backend/config/environment.json`. Rebuild the backend.
The Docker build generates both the physics world and the browser scene from
those same inputs. No React model code needs changing.

See [model and map import instructions](UB_Spaceship_Travel_Sim_Backend/docs/models-and-maps.md)
for formats, articulation, frame mapping and a configuration example.

## Configuration and verification

Copy `frontend/.env.example` to `frontend/.env.local` to configure the development
proxy target or a separately hosted backend. Restart Vite after changing it.
For production, serve `frontend/dist/` after `npm run build` and reverse-proxy
`/api` (including WebSocket upgrades) to the simulator. The backend's
`WEB_ORIGINS` must allow the website's exact origin. See the
[web integration guide](UB_Spaceship_Travel_Sim_Backend/docs/web-integration.md).

Frontend checks: `npm test` and `npm run build` from `frontend/`.
Backend checks and live smoke test are described in the
[backend README](UB_Spaceship_Travel_Sim_Backend/README.md).
All changes remain local under the standing no-push instruction.
