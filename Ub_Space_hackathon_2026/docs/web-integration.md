# Web integration contract, version 1

Base URL: `http://localhost:8000`. Live stream:
`ws://localhost:8000/api/v1/telemetry`. Both use the same configurable host port.
There is one shared simulation per backend process and a single API worker.

## Rendering the environment

1. Fetch `GET /api/v1/scene` once. Each entity has a stable `id`, initial
   `pose_in_world`, a `dynamic` flag and its links. Each link has a stable scoped
   ID such as `starship::arm_power_upper`, a `pose_in_model`, and primitive visuals.
2. Build a renderer object for each entity and child objects for its links.
   A visual's `pose` is relative to its link, and its geometry uses meters.
   Boxes have `size: [x, y, z]`; spheres have `radius: [r]`; cylinders have
   `radius: [r]` and `length: [length]`. Cylinders extend along local Z.
   Colors are RGBA arrays in the range 0–1.
3. Subscribe to the telemetry stream and apply measured transforms. The
   `starship` transform places the ship relative to the world. A transform such
   as `starship::arm_power_upper` places that link relative to `starship`.
   Use each message's `parent_frame_id` and `child_frame_id`, not array order.
   Static planets and asteroids retain the initial scene poses.

Coordinates are right-handed: X forward, Y left and Z up. Orientations are
quaternions with explicitly named `x`, `y`, `z`, `w` fields. For a renderer using
Y up, convert the whole scene consistently (for example, place the environment
under a root rotated −90 degrees around X). All angles are radians.

The endpoint transmits scene data and state, not video or a ready-made embedded
Gazebo viewport. Rendering and the human interface belong to the web frontend.

## Read state and connection health

```javascript
const base = 'http://localhost:8000';
const scene = await fetch(`${base}/api/v1/scene`).then(r => r.json());
const socket = new WebSocket('ws://localhost:8000/api/v1/telemetry');
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.type === 'state') {
    const state = message.data;
    // Update link transforms and show state.arms, state.navigation,
    // and state.connection.ready in your own renderer/interface.
  }
};
// Reconnect with backoff after socket.onclose; fetch a fresh scene after a
// server restart. There is no replay buffer.
```

Snapshots arrive at up to 10 Hz, independently of the physical simulation step.
Each envelope contains `type: "state"`, `schema_version: 1`, and `data`:

| Field | Meaning |
|---|---|
| `sim_time_s` | Gazebo simulation clock; initially null. It stops while paused. |
| `sequence` | Monotonic callback counter within one backend process. |
| `paused` | Measured world status; initially null. |
| `connection` | `backend`, `online`, `ready`, topic ages in wall seconds, and any executor error. |
| `transforms` | Last measured model/link poses, with explicit frame names. |
| `arms` | Arm IDs, `measured_rad` and separately `requested_rad` for yaw/shoulder/elbow. |
| `navigation` | Destination ID, measured center distance, arrival flag and nominal cruise speed. |

Before initialization, measured joint angles are null and transforms may be
empty. After disconnection, previous measurements remain visible but `ready`
becomes false; display them as stale. A paused simulator remains ready while
world-statistics messages continue to arrive. Never substitute requested joint
targets for actual measured positions.

`GET /healthz` reports API liveness and simulation connection status.
`GET /readyz` returns 200 only after clock, ship pose and all arm joints have
arrived and the simulator is responsive; otherwise it returns 503.
`GET /api/v1/state` provides a single snapshot, even while disconnected.

## Request an arm movement

```javascript
const response = await fetch(`${base}/api/v1/arms/power/target`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ targets: { yaw: 0.4, shoulder: 0.2, elbow: -0.3 } })
});
if (!response.ok) throw new Error(await response.text());
const accepted = await response.json();
```

Arm IDs: `power`, `life_support`, `thermal`, `navigation`. The scene includes
the authoritative joint limits. You may send one, two or three targets; omitted
joints retain their controller targets. The entire request is validated before
any target is published. Unknown arms return 404; invalid joints, nonfinite
angles, out-of-range targets or extra fields return 422. A disconnected or
stale simulator returns 503. Concurrent clients share the same arms; the latest
published target for a joint replaces its previous target.

202 means the command was published to the ROS/Gazebo bridge. It does not mean
that the arm reached the target. Inspect `measured_rad` and the link transforms.
While paused, targets may be accepted but take effect only after resuming.
There are no direct damage/repair endpoints or AI model connections yet.

## Pause and resume

```javascript
await fetch(`${base}/api/v1/simulation/control`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ paused: true }) // false resumes
});
```

The response confirms Gazebo accepted world control; telemetry confirms the
observed paused state. A missing service, rejection or five-second timeout
returns 503. This control belongs to the human simulator interface.

## Hosting and origins

Set `WEB_ORIGINS` to the frontend's exact origin(s), separated by commas. Both
HTTP CORS and browser WebSocket origins use this list. Default origins support
local development on ports 3000 and 5173. CORS is not authentication; non-browser
clients can call the API. Keep the default loopback binding and route access
through the web application's authenticated backend/reverse proxy for hosting.
The proxy must support WebSocket upgrades and suitable idle timeouts. Use HTTPS
and WSS when the website is served over HTTPS. No public hosting is created here.

The browser has no need to access DDS, Gazebo Transport or a raw ROS bridge.
