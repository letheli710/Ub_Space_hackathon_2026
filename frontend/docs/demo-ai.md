# DEMO AI: launch, avoidance and repair

DEMO physics runs in the browser. A small Python gateway calls the four configured
DeepSeek roles and returns Main Judging-approved actions. **Gazebo, WSL and Docker
are not required for this gateway.** The existing native Gazebo AI remains separate.

## Windows setup

1. Install Python 3.12 or newer and Node.js 24. Check `py --version`, `node --version`
   and `npm --version` in PowerShell. If `py` is missing, install Python from
   [python.org](https://www.python.org/downloads/) and reopen PowerShell.
2. Open PowerShell in `Ub_Space_hackathon_2026`. On first setup only, create a
   dedicated environment and install the gateway dependencies:

   ```powershell
   py -3.12 -m venv .venv-demo
   .\.venv-demo\Scripts\python.exe -m pip install "fastapi>=0.120,<1" "uvicorn>=0.38,<1" "httpx>=0.28,<1" "websockets>=15,<17"
   ```

   If your installed Python is newer, replace `-3.12` with its version. Skip these
   two commands for later starts with the environment already installed.
3. Enter the backend folder. Keep any existing `.env`; create it only if missing:

   ```powershell
   cd UB_Spaceship_Travel_Sim_Backend
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   notepad .env
   ```

   Set `AI_ENABLED=true` and your existing `DEEPSEEK_API_KEY`. Keep the key local.
   `DEEPSEEK_MODEL=deepseek-flash` is the default. Existing per-role model/key settings
   also apply. Save and close the editor.
4. Start the gateway and leave this terminal open:

   ```powershell
   ..\.venv-demo\Scripts\python.exe -m starship_sim.demo_api
   ```

5. Open a second PowerShell window in `Ub_Space_hackathon_2026`:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

   Run `npm ci` only on first setup or dependency updates, after stopping existing
   frontend servers. For subsequent launches use just `npm run dev`.
6. Open Vite's URL, normally `http://127.0.0.1:5173`. Choose **Generator → DEMO**,
   then **Check AI connection** in DEMO AI MANAGEMENT. It should say CONFIGURED.
   Use **Run DEMO AI once** or **Enable DEMO autopilot**. The **AI Logs** tab also
   shows these DEMO controls when DEMO is selected.

If this checkout already has a working project-root `.venv`, you may use its
`Scripts\python.exe` in place of `.venv-demo\Scripts\python.exe` after installing
the listed dependencies there. No environment activation or PowerShell execution
policy change is needed.

## macOS setup

1. Install Python 3.12 or newer and Node.js 24. Check `python3 --version`,
   `node --version`, and `npm --version` in Terminal.
2. Open Terminal in `Ub_Space_hackathon_2026`. On first setup only:

   ```bash
   python3 -m venv .venv-demo
   .venv-demo/bin/python -m pip install 'fastapi>=0.120,<1' 'uvicorn>=0.38,<1' 'httpx>=0.28,<1' 'websockets>=15,<17'
   ```

3. Open the backend configuration without overwriting existing keys:

   ```bash
   cd UB_Spaceship_Travel_Sim_Backend
   if [ ! -f .env ]; then cp .env.example .env; fi
   open -e .env
   ```

   Set `AI_ENABLED=true`, `DEEPSEEK_API_KEY` and optionally `DEEPSEEK_MODEL` as
   described in the Windows section. Save the file.
4. Start the gateway and keep Terminal open:

   ```bash
   ../.venv-demo/bin/python -m starship_sim.demo_api
   ```

5. In a second Terminal opened in `Ub_Space_hackathon_2026`, run `cd frontend`,
   `npm ci` for first setup, and `npm run dev`. Open the URL and follow Windows
   step 6. This runs natively on Intel and Apple Silicon; no Linux container is used.
   The commands are documented for Mac; this change was executed and tested on Windows.

## Use and stop

- **Avoidance:** choose Command module, 200 kg, 40 m/s, and **60 s warning**.
  Enable DEMO autopilot, then launch a rock. The models see relative position,
  velocity, estimated closest approach, fuel, integrity, arm availability and
  bounded candidate maneuvers with conservative clearance estimates. They take
  real time to respond; physics continues. Short-warning encounters can be unavoidable.
- **Repair:** with autopilot off, launch 200 kg at 40 m/s with 2 s warning.
  Once the impact leaves attached damage, click **Run DEMO AI once**. Robot Arms
  can propose a local repair; Main Judging must approve. The arm moves to a
  maintenance pose and integrity recovers over time, using battery charge.
  Repair reaches at most 95%; detached parts cannot be reattached.
- **Damage:** use Cycle through components to vary targets automatically, or
  choose any module/wing. Scars, tint and per-component health show partial damage.
  Repeated damage or extreme impacts can still detach parts. The default is 200 kg
  at 40 m/s, rather than the previous destructive 1000 kg at 80 m/s.
- **Disasters always remain available:** paused launches queue until Resume;
  detached assemblies remain selectable wreckage targets. Inner faults can be
  injected again. A 48-projectile bound retires the oldest rock rather than locking
  the controls. Invalid numeric input still produces a useful error.
- **Stop:** Stop DEMO AI cancels local acceptance of an in-flight decision and
  disables automatic cycles. It does not cancel already-applied finite burns/repairs;
  use Cut thrust or Pause demo for those. The provider may finish a request already
  submitted. Reset demo restores the ship and disables autopilot. Ctrl+C in each
  terminal stops the frontend and gateway. No persistent paid loop is enabled by default.

The gateway uses port **8001**, with `GET /api/v1/demo-ai/status` and
`POST /api/v1/demo-ai/cycle`. Vite proxies that prefix to the gateway, while the
optional Gazebo API stays on 8000. Restart Vite after changing its configuration.
For another gateway host/port use `DEMO_AI_PROXY_TARGET` in frontend `.env.local`;
for production, route `/api/v1/demo-ai` to the gateway and allow long requests
(the browser timeout is 150 s). `VITE_DEMO_AI_URL` is available for a separate
API origin; configure that origin's CORS explicitly. Keys belong only in backend
`.env`, never in a `VITE_` variable or the browser AI API settings tab.

## Authority and limits

Subsystems can only reference their own catalog entries. Main Judging reviews
every proposal and may combine compatible actions. The gateway rejects unknown,
unauthorized, duplicate or conflicting selections. The browser then rechecks the
run, control epoch, availability and predicted clearance; reset, another disaster,
a contact, or a manual command invalidates an older plan. Decisions execute once.
No sub-system response directly moves an actuator.

Clearance prediction uses an enclosing ship radius and constant attitude; actual
contacts use compound box geometry. It is conservative, not a guaranteed flight
planner, particularly while tumbling. Repairs are a timed maintenance game model,
not a simulation of welding, material reconstruction or tool-contact forces.
Energy can isolate/restore solar generation; isolation does not physically shield
panels from rocks. Other nonphysical disaster artwork remains illustrative.

The provider requests JSON output and validates it before use, following
[DeepSeek's JSON output documentation](https://api-docs.deepseek.com/guides/json_mode/).
Provider errors are sanitized, keys stay server-side, and private reasoning content
is neither returned nor saved.

## Verified real-model trials (2026-11-08)

Using the configured `deepseek-flash` for all four roles:

| Trial | Result |
|---|---|
| Avoidance, 60 s warning | API latency 19.39 s; Main Judging approved `burn_right_8`; no contact, 100% command integrity |
| Identical coast-only baseline | One contact; command integrity 90.88% |
| Repair after that impact | API latency 16.09 s; approved `repair_command`; integrity recovered 90.88% → 95% |
| Repair through the actual website | API latency 17.3 s; judge rejected unnecessary burns and approved the arm repair; displayed integrity reached 95% |

The CLI trial advances physics through the measured API delay before applying the
decision. It does not pause time to manufacture an avoidance result. These are
specific successful trials, not a claim that the AI avoids every incoming rock.

To repeat paid API tests deliberately, start the gateway, then from
`Ub_Space_hackathon_2026/frontend` run `node tools/test-demo-ai.mjs avoidance` or
`node tools/test-demo-ai.mjs repair`. Each trial makes four model calls and saves
its nonsecret result under the backend's ignored `.runtime` folder. Unit tests use
fixtures and never call DeepSeek: `npm test` and backend `python -m pytest tests/test_demo_ai.py`.
