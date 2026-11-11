# DEMO free flight and automatic course correction

Use **Generator → DEMO**. The dotted cyan Earth–Mars loop is a planned route.
It no longer sets the spacecraft's position or rotates its collision frame.
The solid amber line records the actual recent flight, including deviations.

## What moves the ship

The ship has position, velocity, attitude, angular momentum, mass and inertia.
A rock collision applies an impulse at its contact point: the ship can translate,
spin, lose components and leave its planned route. No position projection or
automatic rotation puts it back on the line. Without available propulsion,
momentum persists; the navigation body coasts along a straight inertial trajectory
while the moving planets and the planned loop continue independently.

Propelling has **standing direct authority for routine navigation correction**.
This is a deterministic onboard flight controller, enabled by default. It does
not call an LLM, require an API key, submit a proposal, or wait for Main Judging.
It uses position/velocity feedback to brake disturbance motion and return toward
the route, and torque to recover attitude. Local corrections use the existing
18 kN RCS and 80 kN·m torque limits, available hardware, current mass/inertia and
propellant. Large impacts take time to recover; damage, loss of power or fuel can
prevent recovery entirely. There is no passive drag or hidden spin damping.

Only routine route/attitude restoration has this exception. AI-proposed avoidance
burns, Energy actions and Robot Arms jobs still use Main Judging approval. The
controller yields to a deliberate burn, waits at least six seconds afterward,
and keeps yielding while rocks associated with that maneuver are approaching.
It therefore does not immediately cancel an approved evasive displacement.

## Controls and telemetry

- **Cut thrust · coast** cancels a burn and disables automatic correction. The
  ship keeps its velocity and spin, and can miss the planned planetary pass.
- **Enable automatic course correction** restores routine Propelling authority.
  Recovery is powered and gradual. The same button can disable it independently.
- Propelling outages, Engine Failure, Thruster Failure, missing engine/spine or
  exhausted propellant prevent correction. Restoring availability allows recovery
  if the controller is still enabled. An outage does not disable Disaster Maker.
- **Pause demo** freezes motion, both clocks, control, fuel, the actual trail and
  visual effects. **Reset demo** restores the ship and enables correction again.
- DEMO TELEMETRY shows local deviation, disturbance velocity, actual map position,
  distance from the reference and correction mode: tracking, correcting, yielding,
  offline or coasting. The event timeline records autonomous corrections.

To try it, launch a Command module shot at **1000 kg**, **60 m/s**, **2 s warning**.
Watch the impact move/rotate the ship away from the dotted line, then recover.
Use **Cut thrust · coast** before repeating the shot to compare uncontrolled drift.
A reflected rock can hit another part later; a second impulse is not a control
reset. Enable correction afterward to observe finite recovery. No model call is
needed for this test. The existing flame and repair-spark effects remain active.

## Scale and simulation limits

There are two explicit scales. The long-range navigation body integrates position
and velocity in the selected accelerated mission clock. Its bounded controller
tracks the current moving-planet reference; it never copies the reference pose.
The detailed rigid body, nearby rocks, burns, repairs and feedback controller run
at **120 Hz, 1× physical time from launch**, independently of map playback.

Local disturbance displacement is displayed at the same enlarged meter scale as
the ship and rocks (`0.15 map units/metre`). Previously it was reduced to the
astronomical scale, which hid collision deflection. Local axes remain inertial;
changing the route does not rotate nearby rocks, debris or the ship's impact spin.
Changes in the cruise reference shift all local velocities equally and preserve
relative impact/avoidance velocity. The integrity-scaled cruise rule remains a
gameplay reference; it cannot erase a collision's velocity offset.

Fuel for both control layers uses the physical gameplay clock, not accelerated
mission days. The moving-planet loop and enlarged parking radii remain an
illustrative mission: this is not a gravity-integrated spacecraft solar-system
trajectory, a real interplanetary propellant budget, or a guaranteed capture after
an outage. Arrival events are withheld if the body misses its planned pass.
Forecasts advance a private copy of the body/control state; future impacts and
new operator/model commands can still change their outcome.

See [launch and AI setup](demo-ai.md), [collision physics](demo-physics.md), and
[subsystem outages and reconstruction](demo-system-rules.md). The optional Gazebo
simulation remains separate; these rules apply to the main browser DEMO.
