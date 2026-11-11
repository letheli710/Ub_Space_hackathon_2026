# LLM spacecraft management

The main DEMO now has [free flight and automatic course correction](../../frontend/docs/demo-free-flight.md).
Routine course/attitude recovery has direct standing Propelling authority and runs
locally without proposals, Main Judging approval, an API key or model calls.
The LLM gateway below still judges proposed evasions, energy actions and repairs;
enabling/disabling model autopilot does not toggle the routine flight controller.

## Enable AI for the main DEMO simulator

**DEMO AI needs the Python gateway on port 8001 and the running frontend.**
Use these steps when Python dependencies and your API key are already configured.
For first-time installation, follow the [Windows setup](../../frontend/docs/demo-ai.md#windows-setup)
or [macOS setup](../../frontend/docs/demo-ai.md#macos-setup).

1. Open PowerShell on Windows or Terminal on a Mac in `Ub_Space_hackathon_2026`.
   Start the gateway using the environment created by the setup guide:

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

   If your working Python environment is named `.venv`, use
   `..\.venv\Scripts\python.exe -m starship_sim.demo_api` on Windows or
   `../.venv/bin/python -m starship_sim.demo_api` on Mac instead. Both environment
   folders live directly inside `Ub_Space_hackathon_2026`. Leave this terminal
   open. After updating code or backend `.env`, press Ctrl+C here and rerun the
   gateway command. Its startup message should show `http://127.0.0.1:8001`.

2. Open a second terminal in `Ub_Space_hackathon_2026`. With frontend dependencies
   already installed, run:

   ```text
   cd frontend
   npm run dev
   ```

   Keep it open and visit Vite's printed URL, normally `http://127.0.0.1:5173`.

3. Open **AI API**. With `AI_ENABLED=true` and a valid `DEEPSEEK_API_KEY` already
   saved in backend `.env`, click **Check backend connection**. If a browser
   connection is saved, click **Check saved connection** instead. To configure a
   new browser connection, select **DeepSeek**, enter model `deepseek-flash` and
   your key, leave API link empty for the default address, then click
   **Save → Check saved connection**. Wait for **Model access verified**.

4. Click **Open spacecraft AI controls**, then select **AI Logs → All → Enable
   DEMO autopilot**. Keep the simulator playing; if paused, click **Resume demo**.
   **Run DEMO AI once** performs a single manual cycle instead. Saving a connection
   alone does not start automatic AI control.

5. Autopilot watches for incoming threats and repairable damage. For an avoidance
   test, set **Preset warning time (s)** to **60**, then click **Launch space rock**.
   Read the four system tabs for proposals, Main Judging's approvals and errors;
   inspect DEMO TELEMETRY for the outcome. Short-warning impacts may be unavoidable.

Click **Stop DEMO AI** to stop automatic decisions. Check/status requests do not
generate model output; manual cycles and autopilot decisions use your model API.
WSL, Docker and Gazebo are not required for DEMO AI. The remaining sections below
describe the optional Gazebo system on port 8000, which has different controls.

## Optional Gazebo AI

The default live ship now has ten individually identified Robot Arms rigs.
See the [modular spacecraft guide](modular-spacecraft.md) for locations, joint
units, measured mount/tool poses, rail movement and rebuild instructions.

See [ship state and sensing](ship-state-and-sensing.md) for live health, nearby
objects, scenario events, service actions and the preview-to-execution workflow.

The backend connects four independent roles to DeepSeek through server-side
Chat Completions. The default model alias is `deepseek-flash` at
`https://api.deepseek.com`. DeepSeek's [model documentation](https://api-docs.deepseek.com/quick_start/pricing/)
currently maps this alias to DeepSeek-V4.1-Flash-1017; the provider can update an
alias in the future. Each role can override its model and API key independently.

## Roles and prompts

| Role / API ID | Authority | Prompt |
|---|---|---|
| Main Judging / `main_judging` | Compare risks, approve/reject whole or partial proposals, combine compatible submitted actions | [Main Judging](../starship_sim/ai/prompts/main_judging.md) |
| Energy / `energy` | Propose solar-panel hinge targets | [Energy](../starship_sim/ai/prompts/energy.md) |
| Propelling / `propelling` | Propose bounded ship-frame velocity or permission to follow navigation | [Propelling](../starship_sim/ai/prompts/propelling.md) |
| Robot Arms / `robot_arms` | Propose joint targets for every configured robotic arm | [Robot Arms](../starship_sim/ai/prompts/robot_arms.md) |

All roles also receive the [common instructions](../starship_sim/ai/prompts/common.md),
the active scene's actuator IDs and limits, a JSON output schema and an example.
Arm module labels describe mounting locations, not additional AI roles.
Robot Arms owns all ten rigs, including both solar-wing arms. Energy owns
the solar hinges, not the arms attached to those wings.

## Configure or enable optional Gazebo AI

The default is **AI off**, with no key and no automatic model calls. You can run
the environment and frontend normally without a DeepSeek account. To enable AI
when ready, open a terminal in `Ub_Space_hackathon_2026/UB_Spaceship_Travel_Sim_Backend`.

1. Create `.env` **only if it does not already exist**. Preserve existing settings.

   Windows PowerShell:

   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   notepad .env
   ```

   macOS Terminal:

   ```bash
   if [ ! -f .env ]; then cp .env.example .env; fi
   open -e .env
   ```

2. In that local file, set:

   ```dotenv
   AI_ENABLED=true
   DEEPSEEK_API_KEY=replace_with_your_own_key
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   DEEPSEEK_MODEL=deepseek-flash
   ```

   Replace the placeholder with your real key. `.env` is ignored by Git and is
   excluded from the Docker build context. Do not put a key in frontend files,
   a `VITE_` variable, prompts, screenshots or chat. Keep provider keys server-side.

3. Stop and rebuild once to install this feature. On Windows:

   ```powershell
   .\tools\stop.ps1
   .\tools\start.ps1
   ```

   On macOS, with Docker Desktop running:

   ```bash
   export DOCKER_DEFAULT_PLATFORM=linux/amd64
   docker compose down
   docker compose up -d --build
   ```

   After this image has been built, changing only `.env` needs a container
   recreation: stop and `start.ps1 -NoBuild` on Windows, or `docker compose down`
   and `docker compose up -d --no-build` on Mac. `docker compose restart` alone
   does not apply changed environment variables. A direct Python/uv launch reads
   process environment variables; it does not load `.env` automatically. The
   separate DEMO gateway described above loads backend `.env` when started.

4. Wait for `http://127.0.0.1:8000/readyz` to report `ready: true`. Start the
   frontend using its [README](../../frontend/README.md), then open **AI Logs**.
   Each role should show its model and **Configured · not called yet**. This
   means a key is present, not that authentication has already succeeded.

5. Choose **Analyze only** to collect proposals and a judgement without
   executing anything. **Execute approved plan** dispatches a fresh preview once.
   Choose **Run one cycle** for an approved execution, or
   **Start loop** for repeated cycles. These are live backend operations even
   when Generator has its separate browser Demo selected.

6. Use **Stop AI** to cancel analysis and maintenance, stop the loop and revoke
   the propulsion grant. Already published arm/panel position targets can continue
   moving toward their targets. **Pause simulation** freezes physical motion.

AI-managed mode turns off the automatic ship-following authority and rejects
manual arm/panel API commands with 403. Without approval, the ship coasts with no
thrust. Propelling must propose `follow_navigation`, `thruster_velocity` or `thruster_burn`,
and Main Judging must approve it before propulsion resumes. Pause/resume and
planet orbit-speed controls remain human simulator controls. To return to
manual/autopilot mode, set `AI_ENABLED=false` and recreate the container.

## Observation, proposal, combination, execution

1. Capture measured Gazebo state and the run ID, scene revision and control epoch.
2. Call Energy, Propelling and Robot Arms concurrently. Each returns zero to
   three proposals, with rationale, expected benefit, risk, confidence and one
   to eight typed actions. An empty list requests no new action; propulsion coasts.
3. Validate ownership, finite values, known actuator IDs and physical limits.
   Invalid subsystem output contributes no executable proposals. Its error is
   shown to Main Judging alongside the other systems' proposals.
4. Refresh telemetry and ask Main Judging to assess every submitted proposal.
   Main Judging selects server-assigned action IDs and explains its combined
   plan. It can approve all, some or none of each proposal's actions.
5. Recheck the complete selection and its freshness before publishing. Unknown
   IDs, conflicting targets, missing risk reviews and disagreement between a
   review and selected actions invalidate the plan. The judge cannot invent
   new commands, rewrite their arguments or borrow another role's authority.
6. Dispatch each selected action once. Publication acceptance is recorded
   separately from measured motion. A partial transport failure is never
   automatically replayed; inspect measurements and request a new cycle.

For example, Energy can propose rotating the port panel, Propelling can propose
brief navigation, and Robot Arms can propose moving a ring-hub arm joint.
Main Judging may approve all three together, or keep just the panel action and
one joint action. Conflicting targets for the same panel, arm joint or thruster
channel cannot be combined. A batch does not guarantee coordinated completion
or a physical sequence: dependent steps require later cycles and new measurements.

Plans expire after 120 wall seconds by default, including inference time. A new
cycle, stop, map/world control, backend restart, scene replacement or simulation
clock reset invalidates earlier plans. Executing requires an unpaused, ready
simulator. Model/network/JSON errors never grant authority. There is no fabricated
fallback model response in the running application.

## Actions and physical limits

| Action | Role | Constraints |
|---|---|---|
| `solar_panel_target` | Energy | `panel_id`, `target_rad` within scene hinge limits |
| `thruster_velocity` | Propelling | `linear_m_s: {x,y,z}` in ship body frame, vector speed at most configured cruise speed, `duration_s` >0 and <=10 |
| `follow_navigation` | Propelling | Existing measured destination follower, `duration_s` >0 and <=10 |
| `thruster_burn` | Propelling | Body-frame `linear_throttle` and `angular_throttle` vectors, each magnitude <=1; duration >0 and <=10; native physics required |
| `arm_target` | Robot Arms | `arm_id`, nonempty `targets` mapping aliases to values within scene limits and declared units (angles rad, grip fraction) |
| `arm_service` | Robot Arms | Configured arm/component, measured service-pose gate, duration >0 and <=10 simulation seconds |

Propulsion grants expire in simulation time, with a separate wall-clock watchdog
at duration + 1 second. Expiration cuts thrust and preserves coasting momentum.
The default ship uses bounded forces/torques, fuel consumption and finite braking.
A velocity request is a goal; zero requests active braking while approved. Panel
and arm targets persist while attached. Fracture invalidates plans and disables
detached actuators. See [physics and damage](physics-and-damage.md).

The modular ship includes two hinged main panels, `port` and `starboard`.
Replacement ships declare optional `solar_panels` joint mappings in the profile;
the prompts and API discover them rather than hardcoding this model.
See [model imports](models-and-maps.md#solar-panels-and-ai-capabilities).

**Current scope:** Gazebo supplies poses, joints and motion. The backend now
supplies modeled hull/panel health, battery, oxygen, thruster efficiency,
charge/drain rates, scenario faults and pose-gated maintenance outcomes. Local
detections include approximate closest approach. Physics supplies fuel, contact
stress and attachment failures. Electrical watts and physical repair remain
unavailable. Models must distinguish game
outcomes from physical repair. The main browser DEMO has its own physical
simulation and AI gateway; use the activation steps at the top of this guide.

## Model connection ports

For optional Gazebo AI, all four logical model ports share backend HTTP port
**8000**. DEMO AI instead requires the gateway on **8001** described above.
Use IDs in the role table above for these Gazebo routes.

| Method and route under `/api/v1/ai` | Purpose |
|---|---|
| `GET /status` | Enabled/configured states, model names, latest cycle, bounded activity history; never keys |
| `GET /systems` | Four role connection states |
| `GET /systems/{id}` | Prompt, prompt revision, dynamic capabilities, JSON schema and example |
| `POST /systems/{id}/invoke` with `{}` | Read-only role call; never executes. Main receives no subsystem proposals here |
| `POST /cycles` with `{"execute": false}` | Start background analysis and Main Judging; returns 202 with cycle ID |
| `POST /cycles` with `{"execute": true}` | Start background analysis followed by guarded execution |
| `GET /cycles/{id}` | Poll proposals, risk analysis, selected action IDs, status, errors and dispatch results |
| `GET /cycles` | Recent cycle IDs/statuses; latest 50 retained in memory |
| `POST /cycles/{id}/execute` with `{}` | Dispatch a fresh server-generated analysis plan once |
| `POST /control` with `{"running": true}` or `false` | Start/stop continuous management |

Cycle states include `collecting`, `judging`, `planned`, `dispatched`, `held`,
`failed`, `partial_failure` and `cancelled`. Polling status is free of model calls.
No route accepts a client-authored judgement or raw action plan for execution.
Disabled/stale/conflicting requests return 409; missing keys/provider failures
return 503; malformed requests return 422. Asynchronous model errors appear in
the cycle's `errors`. A stopped request does not imply the provider refunds an
already submitted model call. History is in memory and resets on backend restart.

Example from the frontend or another web client:

```javascript
const response = await fetch('/api/v1/ai/cycles', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ execute: false })
});
if (!response.ok) throw new Error(await response.text());
const { id } = await response.json();
// Poll until status leaves collecting/judging, then render the returned decision.
const cycle = await fetch(`/api/v1/ai/cycles/${id}`).then(r => r.json());
```

The existing Vite `/api` proxy forwards these routes. Production access control
and HTTPS belong to the hosting application's backend/proxy, as described in
the [web integration contract](web-integration.md#hosting-and-origins).

## Optional settings and request cost

`DEEPSEEK_MODEL` and `DEEPSEEK_API_KEY` apply to all four roles by default.
For an independent connection, set `AI_MAIN_JUDGING_MODEL`,
`AI_MAIN_JUDGING_API_KEY`, `AI_MAIN_JUDGING_THINKING` or
`AI_MAIN_JUDGING_MAX_TOKENS`. The same suffixes work with `AI_ENERGY_`,
`AI_PROPELLING_` and `AI_ROBOT_ARMS_`. Keep these variables in backend `.env`.
All roles currently use the same DeepSeek base URL and protocol adapter.

Main Judging defaults to thinking enabled with high reasoning effort; subsystems
default to thinking disabled. Every call uses [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode/)
and validates the result server-side. Private `reasoning_content` is discarded;
the UI displays the requested risk summary and combination rationale.

| Setting | Default | Meaning |
|---|---|---|
| `AI_REQUEST_TIMEOUT_S` | 45 | Wall timeout per model call, allowed 1–120 |
| `AI_MAX_CYCLE_AGE_S` | 120 | Maximum total plan age, allowed 1–300 |
| `AI_LOOP_INTERVAL_S` | 10 | Delay after each completed loop cycle, allowed 2–300 |
| `AI_*_MAX_TOKENS` | 4096 | Per-role output budget, allowed 256–16384 |

A normal cycle makes four model calls (three subsystems plus Main Judging).
There are no automatic request retries. The loop never overlaps cycles and
waits while telemetry is unavailable or the simulation is paused. Keep the loop
off until wanted; model usage incurs your provider's charges.

## Verification without a key

From the backend folder, `uv run pytest -q` uses injected test models and an
HTTP mock transport. It checks combination/partial approvals, permissions,
limits, malformed responses, provider errors, stale plans, stop, replay and API
contracts. Test doubles are not selectable in runtime configuration. Live
DeepSeek inference requires your local key; fixture tests make no provider calls.

For a physical approval-gate test, build the image first, then run the following
**inside Ubuntu WSL** (Windows) or macOS Terminal, from the backend directory:

```bash
docker compose run --rm --no-deps -T \
  -e ROS_DOMAIN_ID=78 -e GZ_PARTITION=starship_ai_validation \
  environment python tools/smoke_ai.py
```

On Mac, set `export DOCKER_DEFAULT_PLATFORM=linux/amd64` first. On Windows,
enter Ubuntu from the backend PowerShell window with `wsl -d Ubuntu -u root`;
its starting folder should be the same backend folder (`pwd` to check).
The test starts an isolated Gazebo/ROS stack inside a disposable container,
injects model fixtures and verifies unpowered rest, blocked direct commands, a motionless
preview, combined approved movement and propulsion expiration. It makes no
DeepSeek requests. Do not run the Python script against your normal ROS domain
or Gazebo partition; its test publishers must remain isolated.
