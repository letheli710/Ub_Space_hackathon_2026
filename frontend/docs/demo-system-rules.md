# DEMO outages, integrity speed and component reconstruction

These rules apply to **Generator → DEMO** and its AI gateway on port 8001.
Use the existing [Windows/macOS launch and AI instructions](demo-ai.md).

## Solar storm

Click **Solar Storm** in the Disaster Maker. The particle wave starts at the Sun.
When it reaches the spacecraft, one subsystem shuts down for **15 playing physical
seconds**. Successive storms cycle through **Propelling → Energy → Robot Arms**.
Main Judging stays online. The timer is independent of the accelerated celestial
clock and stops while DEMO is paused. Navigating to Home or AI Logs does not stop
the wave or the outage timer. The wave passing does not end an outage early.

An offline role is not called by the model gateway and cannot propose/execute
actions. A Propelling outage cuts an active burn; existing coasting momentum
continues. A Robot Arms outage suspends maintenance and resets its continuous
contact timer. Stale AI decisions are discarded when subsystem availability changes.
DEMO TELEMETRY, AI Logs and the event timeline show the reason and time remaining.

## Propulsion integrity and cruise

The engine section's integrity controls the nominal cruise reference:

| Propulsion integrity | Cruise reference |
|---|---|
| 100% | 7.900 km/s |
| 75% | 5.925 km/s |
| 50% | 3.950 km/s |
| 25% | 1.975 km/s |
| Detached / 0% | 0 km/s of forward mission progress |

The measured speed includes this reference plus local collision/burn offsets.
Earth–Mars journey progress slows with the same integrity fraction; celestial time
and the planets continue at their selected map playback speed. With no propulsion,
the arrival display says **Propulsion repair required**. Repairing/recreating the
engine restores its corresponding cruise speed.

This requested integrity/speed relationship is a gameplay control rule, not a law
of inertial coasting. Cruise changes shift the whole local encounter reference
equally, preserving relative rock/debris motion and collision impulses. They do
not create artificial high-speed secondary collisions or atmospheric drag.

## Energy damage and subsystem power

Energy integrity is the equal average of **Auxiliary arrays & radiators**, **Right
solar wing**, and **Left solar wing** integrity. A missing component contributes
zero. Each completed 25% loss cuts another subsystem:

| Energy integrity | Subsystem availability |
|---|---|
| Greater than 75% | All three online |
| 75% or less | Propelling offline |
| 50% or less | Propelling and Energy offline |
| 25% or less | Normal power to all three off; Robot Arms has emergency maintenance power |

Main Judging is always online. Repair the **energy components** to raise integrity
above the corresponding threshold and restore power; repairing another module
does not clear an energy-induced shutdown. A concurrent storm outage still lasts
its own full 15 seconds.

Emergency Robot Arms power is restricted to energy-component repair/reconstruction.
Other repairs and actuator commands remain blocked. A separate 20-unit emergency
reserve supports these jobs even when the main battery is empty. It recharges
when energy integrity exceeds 75% and the main battery has usable charge.
Emergency power does not bypass a Robot Arms storm outage or arm malfunction.

## Arm contact and reconstruction

1. Robot Arms receives a catalog naming an attached surviving arm, a reachable
   service socket, and the damaged/missing component. A detached component's own
   detached arm cannot do the job; a neighbouring ship-mounted arm must reach it.
2. Main Judging must approve the proposal. The arm turns, moves its rail carriage
   if applicable, and extends its existing links as needed, up to 3× nominal length.
   Shared forward/inverse kinematics drive both the displayed arm and contact check.
   Arm motion takes additional time before the contact timer starts.
3. Its tool must remain within **0.12 m** of the original repair socket for
   **10 continuous physical seconds**. Pause freezes progress. Lost contact or
   a power outage resets the contact timer; a detached servicing arm cancels the job.
4. At completion, a missing component is **recreated at its original ship mount
   with 100% integrity**, including its mounted arms. Its mass and attachment return.
   The old fragment remains separate drifting debris. Ordinary attached repairs
   restore up to eight integrity points per job, capped at 95%.

Repairs consume battery/reserve only while holding contact. One arm cannot service
two components simultaneously. The model cannot shorten the 10-second contact
requirement, invent targets, or bypass Main Judging. Reconstruction creates new
material as a simulation mechanic; it is not salvage, welding or a mass-conserving
manufacturing model. Arm motion currently uses joint/extension limits and reach,
not obstacle-avoiding robotic motion planning.

## Try the rules

- **Storm:** click Solar Storm, then open AI Logs. Observe an outage and its later
  **power restored** event. Use Pause demo to verify the countdown freezes.
- **Cruise:** aim a moderate rock at **Engine section**; compare propulsion
  integrity, velocity and Integrity cruise after contact.
- **Energy:** damage or detach a solar component. Observe energy integrity and
  the affected system cards. An approved solar reconstruction restores power.
- **Reconstruction:** choose **Command module**, **5000 kg**, **150 m/s**, **2 s
  preset warning**, then **Launch space rock**. After detachment, run a DEMO AI
  cycle (or enable autopilot). Watch **REBUILD**, arm ID, movement/holding status,
  socket distance and **tool contact n/10 s** in telemetry. The recreated component
  returns at the ship while the old debris remains nearby.

Reset demo restores all components, both energy stores, timers and full cruise.
Disaster controls remain usable while paused, during outages and after destruction.
If no surviving arm can reach a repair socket, no executable repair is offered;
use other reachable repairs or Reset demo.
