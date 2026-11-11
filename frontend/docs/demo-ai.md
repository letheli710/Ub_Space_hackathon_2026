# DEMO AI: launch, avoidance and repair

DEMO physics runs in the browser. A small Python gateway calls the four configured
AI roles and returns Main Judging-approved actions. **Gazebo, WSL and Docker
are not required for this gateway.** The existing native Gazebo AI remains separate.

See [DEMO subsystem rules](demo-system-rules.md) for 15-second solar-storm outages,
25%-energy-loss shutdowns, integrity-scaled cruise, emergency power, and arm-contact
reconstruction. Offline roles are skipped; proposed catalog actions require Main Judging.
Routine [automatic course correction](demo-free-flight.md) instead has direct
standing Propelling authority. It works without enabling model autopilot or
making API calls; approved evasions temporarily take priority over route recovery.

## Enable AI with your existing setup

If Python dependencies and your DeepSeek key are already configured, use this
checklist each time you launch. For first-time installation, use [Windows setup](#windows-setup)
or [macOS setup](#macos-setup) below.

1. Open a terminal in `Ub_Space_hackathon_2026` and start the gateway.

   Windows PowerShell:

   ```powershell
   cd UB_Spaceship_Travel_Sim_Backend
   ..\.venv-demo\Scripts\python.exe -m starship_sim.demo_api
   ```

   macOS Terminal:

   ```bash
   cd UB_Spaceship_Travel_Sim_Backend
   ../.venv-demo/bin/python -m starship_sim.demo_api
   ```

   These commands use the `.venv-demo` created in the setup below. If you already
   use the project's `.venv`, the Windows command is
   `..\.venv\Scripts\python.exe -m starship_sim.demo_api`; on Mac use
   `../.venv/bin/python -m starship_sim.demo_api`. Leave the terminal open and
   confirm startup reports `http://127.0.0.1:8001`. To restart after an update or
   `.env` edit, press Ctrl+C in that terminal and run the gateway command again.

2. Open another terminal in `Ub_Space_hackathon_2026`, run `cd frontend`, then
   `npm run dev`. Open Vite's printed URL and keep both terminals running.
3. In **AI API**, click **Check backend connection** to use an existing backend
   `.env` with `AI_ENABLED=true` and a valid key. If browser settings are saved,
   click **Check saved connection** instead. You do not need to enter an already
   configured key again. Wait for **Model access verified**. To add or change a
   browser connection, follow [Connect from the frontend](#connect-from-the-frontend).
4. Click **Open spacecraft AI controls**, then choose **AI Logs → All → Enable
   DEMO autopilot**. Keep the simulator playing; click **Resume demo** if paused.
   Use **Run DEMO AI once** for a single manual cycle. Saving a key or starting
   the gateway alone does not enable autopilot.
5. Autopilot waits for incoming threats or repairable damage. To test avoidance,
   set **Preset warning time (s)** to **60**, then click **Launch space rock**.
   Check proposals, approved actions and errors under the four AI system tabs.
   A short warning may not give the models enough time to respond.

Use **Stop DEMO AI** to disable autopilot. Checking a connection does not generate
model output; running a cycle or an autopilot decision does use the model API.

## Connect from the frontend

Start the gateway and frontend using the Windows/macOS steps below. After updating
this project, restart the gateway so it loads the new connection endpoints.

1. Open **AI API**. Select **DeepSeek**, leave API link empty for its standard
   address (or enter `https://api.deepseek.com`), and use model **deepseek-flash**.
2. Enter your key locally in that page and click **Save**. All four DEMO roles use
   this saved provider/model/key. You can edit the API link or model without
   re-entering the saved key. Switching providers requires a key for that provider.
3. Click **Check saved connection**. This checks credentials and model access
   through the gateway using model metadata, without generating tokens or moving
   the ship. A successful check does not guarantee model decisions will be valid.
4. Click **Open spacecraft AI controls**, then **Run DEMO AI once** or **Enable
   DEMO autopilot**. Generator → DEMO has the same controls. Each cycle supplies
   measured telemetry and nearby objects to the subsystems, then Main Judging
   reviews and combines their proposals. Only approved, still-valid actions execute.
5. Open **AI Logs**. **All** contains the run/autopilot controls and combined log;
   **Main Judging**, **Propelling**, **Energy**, and **Robot Arms** show each role's
   latest assessment, proposals, reviews, errors, and event history. The right-side
   cards show that role's model and connection state. Check the ship and DEMO
   TELEMETRY for the resulting burn or repair.

The connection panel polls the local gateway every 10 seconds without calling a
model provider. **Configured · not verified** means a key/model is present, not that
it has been tested. **Check again** explicitly verifies model access. **Connected**
means that role completed a valid model call; failed or skipped roles are reported
separately. A provider error does not mean the Python gateway is offline. The
optional live/Gazebo status is independent of DEMO.

The last 20 DEMO cycles remain in the role logs while navigating between pages.
Resetting DEMO, changing the AI connection, or reloading the website clears this
browser-session history. Failed Main Judging responses and decisions discarded by
local safety checks show **zero executed actions**, even when a proposal was made.

The [dynamic solar system](celestial-motion.md) uses moving Keplerian planets and
guided Earth–Mars transfers. AI observations include the current route phase,
destination, predicted arrival, celestial date, planetary position/velocity vectors
and map orientation. Local collision sensing, burns and repairs stay in physical
body coordinates at the safe encounter clock while the map keeps moving. The
spacecraft route remains guided playback; planet motion uses the orbital model.

The menu supports DeepSeek, OpenAI Chat Completions, Anthropic Messages, Gemini
generateContent, and **Other (OpenAI-compatible)** endpoints. For providers other
than DeepSeek, enter an explicit text model ID supported by your account. Use an
API **base** URL, not `/chat/completions` or another method URL. HTTP is accepted
only for localhost proxies; remote endpoints require HTTPS. Custom endpoints must
support JSON Chat Completions; the connection check additionally requires `/models`.

With no browser connection saved, the gateway uses the existing backend `.env`,
including different models/keys per role. Click **Remove** to return to that mode.
Browser connections work without setting `AI_ENABLED` or a key in `.env`; the
gateway must still be running. Saving/removing settings stops autopilot and
discards any in-flight decision. Start autopilot again explicitly afterward.

The key is kept in sessionStorage by default, or localStorage when **Remember on
this device** is checked. Status, check and cycle requests send it to your configured
gateway; only checks and cycles forward it to the selected provider. The gateway
keeps it only for that request;
it never rewrites `.env`, puts credentials into model prompts, or falls back to
the server key after a custom connection fails. Changing one browser's settings
does not reconfigure another browser. The optional Gazebo AI remains configured
through its backend `.env`.

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
3. Enter the backend folder. If configuring through **AI API**, only the `cd`
   command is required. For the optional server-configured connection, keep any
   existing `.env`; create it only if missing:

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
6. Open Vite's URL, normally `http://127.0.0.1:5173`. Configure **AI API** as above,
   or use the backend `.env`. Choose **Generator → DEMO**, then **Check AI connection**
   in DEMO AI MANAGEMENT. It should say MODEL ACCESS VERIFIED.
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

3. Enter the backend folder. When using **AI API**, only `cd` is required.
   To use the optional backend configuration without overwriting existing keys:

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
  An attached repair completes after 10 continuous seconds of arm contact and
  recovers up to eight points, capped at 95%. A missing component can instead be
  recreated at 100% by a surviving neighbouring arm; its old debris keeps drifting.
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
`POST /api/v1/demo-ai/check` and `POST /api/v1/demo-ai/cycle`. The new cycle body is
`{observation, connection}`; `connection: null` selects backend settings. Legacy
observation-only requests remain supported. No credentials are returned in status
or cycle results. Vite proxies that prefix to the gateway, while the
optional Gazebo API stays on 8000. Restart Vite after changing its configuration.
For another gateway host/port use `DEMO_AI_PROXY_TARGET` in frontend `.env.local`;
for production, route `/api/v1/demo-ai` to the gateway and allow long requests
(the browser timeout is 150 s). `VITE_DEMO_AI_URL` is available for a separate
API origin; configure that origin's CORS explicitly. Never put a key in a `VITE_`
variable or commit it. Use HTTPS and authentication when deploying a shared
gateway; the default command binds to localhost for local development.

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
Provider errors are sanitized and private reasoning content is neither returned
nor saved. Adapters follow the [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
[Anthropic Messages reference](https://platform.claude.com/docs/en/api/messages/create),
and [Gemini generateContent reference](https://ai.google.dev/api/generate-content).
Provider JSON is always validated against the simulation's schema before use.

## Verified real-model trials (2026-11-08)

These historical trials preceded the contact/reconstruction update. Current repair
duration includes arm positioning plus the mandatory 10-second contact hold.

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
