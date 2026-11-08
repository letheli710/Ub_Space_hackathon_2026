# DEMO physics

DEMO is the primary simulation. Open PowerShell on Windows or Terminal on macOS
in `Ub_Space_hackathon_2026`, then run:

```text
cd frontend
npm ci
npm run dev
```

Install Node.js 24 first. Stop an existing frontend with Ctrl+C before `npm ci`;
skip that install command for later launches with unchanged dependencies. Open
the Vite URL (normally `http://127.0.0.1:5173`) and choose **Generator → DEMO**.
No WSL, Docker, Gazebo or LLM key is needed. To stop, press Ctrl+C in its terminal.

## Try collisions and propulsion

For pointer placement, select **Asteroid Collision** under Outer Disasters. The
button stays highlighted. Click the 3D view to spawn a rock at the pointer on a
camera-facing plane through the ship; each click places another rock. A drag still
orbits the camera. Press the button again or Esc to cancel. The selected mass,
radius, relative speed and component apply to every shot. Rocks lead the moving
target at launch and then fly ballistically; later thrust can make them miss.
Clicking close to the ship can cause immediate contact. Placement never pauses or
resumes the demo. If you explicitly pause, rocks wait until you resume.

**Launch space rock** below the settings is a separate, repeatable preset shot.
Its warning time determines the preset distance; pointer shots instead use the
actual clicked distance. For a longer AI reaction window, use a preset shot or
place farther away / lower the relative speed.

Physical rocks reuse the original frontend's cratered asteroid model and blue/violet
glowing cracks. Its solid mesh fits within the selected spherical collision radius;
the glow extends slightly beyond it. Tumbling is visual and follows physics time,
including Pause. Collision detection still uses the spherical rock approximation.

1. Under **Physical space rock**, choose a component. Set mass to **1 kg**, speed
   to **5 m/s**, radius to **0.6 m**, and click **Launch space rock**. A light
   contact changes momentum but should leave the attachment intact.
2. Choose Command module and launch **200 kg at 40 m/s** with **2 s warning**.
   This normally leaves attached, repairable damage (about 91% integrity). The
   default warning is 12 s; use 60 s for AI avoidance tests. Cycle through components
   changes the target on each launch; every module and wing can also be chosen.
   **5000 kg at 150 m/s**, or repeated damage, can still detach assemblies.
3. Check DEMO TELEMETRY for velocity vector, position, angular speed, course
   deviation, impulse, attachment load, debris and arm availability. Pause DEMO
   to inspect; reset restores all components and 4000 kg propellant.
4. Use **DEMO propulsion test controls** to burn for 0.1–10 seconds. Main thrust
   acts along model +Z, right is +X and up is +Y. Pitch/yaw/roll apply torque.
   Turning the nose does not instantly redirect velocity. Thrust along the new
   orientation changes the flight vector gradually.
5. **Cut thrust · coast** removes commanded thrust; velocity and spin persist.
   Use opposing burns/torques to brake. No drag or automatic spin damping is added.

The manual controls are physics tests. Real four-role AI now connects to DEMO
through the gateway described in [DEMO AI setup](demo-ai.md). Only Main Judging's
approved selections reach the simulation. The models receive component integrity,
arm mounts, fuel, charge, nearby objects and predicted maneuver clearances.
Attached local-arm repairs take time and battery and recover integrity up to 95%.
They cannot reattach wreckage. Scars and damage tint fade as integrity recovers.

Disaster controls never lock because the ship is paused, damaged or destroyed.
Paused launches are queued; detached parts remain valid targets. A 48-rock limit
retires the oldest rock without blocking a new launch. Other faults can be injected
again while active. Valid ranges still apply to numeric settings.

## Physics and time

The ship starts at the original **7900 m/s (7.9 km/s)**. This is an initial
condition, not a speed clamp. The initial heading aims from the Earth departure
point toward Mars. It now coasts in an inertial straight line instead of following
the old curved animation. The displayed route is a reference; there is no automatic
teleport, turnaround, arrival braking or orbit capture.

Body-frame thrust is transformed by the measured quaternion and integrated with
`a = F / m`. Main thrust is 40 kN, translation RCS 18 kN and torque 80 kN·m.
Fuel consumption uses `mass flow = thrust / (Isp × g0)`; nominal specific impulses
are 450 s (main) and 230 s (RCS), with an 8 m effective torque lever arm.
This follows the [NASA thrust / specific-impulse relationship](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/).
These engine values are tunable prototype assumptions, not measurements of a real ship.
Fuel loss updates mass and inertia; exhausted fuel produces no thrust. An engine
fault/lost engine removes main thrust, while RCS remains available. Thruster Failure
removes all thrust and torque. Losing a module also makes its mounted arms unavailable.

Physics steps at **120 Hz** during close encounters and burns, independent of
render frame rate. Local physics switches to **1x** on the first rock, burn or
repair; the ship retains its velocity and keeps translating during the encounter.
The **map travel scale** remains at the selected value so the visible journey
does not appear to stop. The map integrates measured ship displacement at that
playback scale, including collision/thrust deflections. Nearby rocks and wreckage
share this moving map anchor, preserving their true relative motion.

This deliberately separates illustrative map travel/day from SI physics position
and elapsed time. Map acceleration never multiplies impact speed, burn duration,
repair rate or AI reaction time. Before an encounter, undisturbed coasting can use
exact analytical fast-forward. Afterward physics stays at 1x until reset; the map
scale can still be changed. Pause freezes both clocks and fuel. A suspended browser
tab does not catch up missed wall time.

All physics uses SI units. Planets use an astronomical map scale, while the ship
and nearby rocks/fragments share an enlarged local scale (0.15 rendered units per
meter) so you can see them. A floating origin keeps local separation visible.
These display scales never enter the collision, force or stress equations.

## Collision and material model

The ship is a compound rigid body with mass, center of mass and a full inertia
tensor derived from component boxes. Off-center contact applies equal/opposite
linear impulses and angular impulses `r × J`. Rocks follow ballistic trajectories;
they do not home in after launch. Continuous sphere/box sweeps detect thin panels
at the maximum supported 150 m/s relative launch speed. The ring has open space
between its rim, hub and spokes. Contact restitution is 0.15 and friction is 0.25.

Average contact force is impulse divided by a configured 20 ms contact duration.
Attachments have configurable cross-sectional area, bending section modulus,
120 MPa shear strength and 240 MPa tensile strength. The revised attachment areas
and section moduli are four times the earlier values. Combined normalized shear,
axial/bending load and absorbed collision energy now accumulate component damage,
instead of detaching a part on its first yield event. Damage reduces remaining
strength; zero integrity or an extreme 12× overload detaches the assembly.
The damage budget is a tunable gameplay approximation, independent of render rate.
Failed modules become independent rigid bodies at
their existing pose and point velocity; their mass/inertia leave the main ship.
Fragments retain their spin and can be hit by later rocks. Tests check momentum
conservation, dissipative contact, weak/strong loads and actual fragment drift.

This is an engineering approximation with predefined breakable assemblies,
**not finite-element material fracture**. It does not simulate dents, cracks,
thermal weakening, fatigue, flexible beams, internal arm-joint breakage,
fragment-to-fragment contact, rock-to-rock contact, orbital gravity or planetary
surface collisions. Main wings separate independently; arms stay rigidly mounted
to their parent fragment. The habitat ring is held fixed for matching collision
geometry. Other disaster artwork (aliens, black hole, solar storm) and nonpropulsion
faults remain illustrative/scenario state, not additional physical force solvers.
No physical welding/reassembly is performed. Timed arm maintenance can restore
attached integrity; reset is required to restore detached assemblies. Battery and
charging are modeled percentages, not an electrical-circuit simulation.

## Replace a model or tune materials

`src/simulation/demoShip.js` contains stable component IDs, collision boxes,
mass, attachment properties and the ten arm mounts. Box centers are in model
meters; box `angle` rotates about +Z. `src/components/DemoPhysicsObjects.jsx`
binds these IDs to the current modular preview components. Replace these two
adapters together when importing another ship so collision and visible geometry
continue to agree. `src/data/voyage.js` contains the solar-system layout/mission
coordinates. `src/simulation/demoPhysics.js` has no React, backend or renderer
dependency beyond Three.js math and can be exercised without a browser.

## Verify changes

From `Ub_Space_hackathon_2026/frontend`:

```text
npm test
npm run build
```

Tests cover initial speed/fast-forward, finite acceleration/fuel/expiry/coast,
torque and redirected thrust, light/heavy impacts, linear/angular momentum,
energy dissipation, thin-wing collision, engine loss, a genuine near miss,
frame-rate independence, invalid commands, time-warp guards, reset, and physical
state driving DEMO pose/telemetry. The Vite build may report its existing bundle
size advisory; no additional physics dependency is installed.
