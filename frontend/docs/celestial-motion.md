# Dynamic solar system and Earth–Mars guidance

The main **Generator → DEMO** now moves all eight planets around the Sun and the
Moon around Earth. Planet orbits are eccentric, inclined ellipses; their speed
changes around the orbit. Body rotation and celestial motion use the mission
clock shown as **Celestial date (UTC)**. The deterministic starting epoch is
**2026-11-08 12:00 UTC**; Reset demo restores that epoch and the initial route.

## Launch and watch

Use the existing Windows/macOS [frontend launch instructions](../README.md#run-demo--windows-and-macos).
For this simulation, no new service or dependency is required. Restart Vite after
updating, open **Generator → DEMO**, and use these controls:

1. At the default **200Kx**, Earth completes a year in about 158 real seconds.
   Increase **Time scale** to `1M` to watch the mission faster. The field accepts
   `100K`, `1M` and numeric values; press Enter to apply.
2. Use **Full Page**, click the 3D view and hold **S** to zoom out. **W** zooms in.
   The faint paths show planetary ellipses. The cyan dotted line is one closed
   loop around the current Earth and Mars, including the far side of each planet.
   Its solid portion shows progress through the current lap of this moving
   reference loop. **Reset View** returns to the spacecraft camera.
3. Watch **Mission phase**, **Next phase in**, **Map travel day** and
   **Celestial date (UTC)** in DEMO TELEMETRY. **Guided map X/Y/Z (AU)** is the
   long-range map location; **Target orbital speed** comes from the planet's
   celestial velocity. Local **Position X/Y/Z (km)** remains the separate
   encounter-body coordinate. The mission repeats
   **Earth → Mars → half a lap at Mars → Mars → Earth → half a lap at Earth**.
   Transfer duration changes with planetary positions.
4. **Pause demo** freezes planet positions, rotations, ship guidance and local
   physics. **Resume demo** continues from that point. Navigating between pages
   does not restart the mission.
5. Asteroid placement, repair and AI controls work as before. Local rocks, finite
   burns and repairs use the safe encounter clock while celestial/map time keeps
   its selected playback scale. See [AI activation](demo-ai.md) for model setup.

The default first Earth–Mars guided transfer takes about 300 mission days. This
is scenario guidance, not a real mission's launch window or propellant estimate.

## Celestial motion

The model initializes the planets from [JPL Table 1 orbital elements and rates](https://ssd.jpl.nasa.gov/planets/approx_pos.html)
at the starting epoch, then propagates fixed two-body ellipses by solving
`M = E - e sin(E)`. Mean motion is `sqrt((GM_sun + GM_planet) / a³)`.
Positions, analytic velocities, period, eccentricity and inclination share one
simulation state. They are computed from absolute elapsed mission time, so
positions do not accumulate frame-integration drift at high playback rates.

AU and gravitational parameters come from [JPL astrodynamic parameters](https://ssd.jpl.nasa.gov/astro_par.html).
Nominal body rotation periods come from [NASA's planetary fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/).
The Moon uses a simplified inclined, eccentric relative orbit with the
[27.3217-day sidereal period](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html).
Earth uses JPL's Earth–Moon barycenter approximation. The lunar phase is a
scenario phase, not a precise observed lunar ephemeris.

This is an approximate two-body model: planets do not perturb each other, the
Sun remains the heliocentric origin, and relativity, tides and secular evolution
after initialization are omitted. It is not the high-precision JPL Horizons
ephemeris. Planet sizes and lunar display distance remain enlarged for visibility.
Physical celestial positions and velocities sent to AI use meters and m/s.

## Spacecraft guidance and clocks

The ship and dotted line share a single current-epoch route: an outbound tangent
from Earth to Mars, a far-side parking arc behind Mars, an inbound tangent to
Earth, and a far-side arc behind Earth that closes the loop. Both planet centers
are evaluated at the same mission time. The loop reshapes every frame as they
move. It does not combine planet positions from different future dates.

The route lies in the shared plane through the two planet centers. Transfers stay
straight when clear; a planar detour is added only when the enlarged Sun would
block a leg. No automatic vertical arch is added. Parking radii stay fixed, with
smooth tangent joins. Segment duration is scheduled from its nominal length at
entry and the 7.9 km/s guidance reference. The phase clock then progresses while
the shape follows planetary motion; this is not constant inertial map speed.
Arrival prediction evaluates that same moving loop at future mission times.

This preserves the existing loop as a reference for [free-body powered guidance](demo-free-flight.md).
The spacecraft now integrates independent position and velocity with bounded
control; it is not assigned the route pose. This is not a Lambert solution, a
gravity-integrated spacecraft orbit, or a real mission fuel-budgeted capture. Parking radii
retain the enlarged frontend scale. The initial local spacecraft velocity remains
**7.9 km/s**; collisions and approved burns still change local velocity, rotation,
fuel and deviation from guidance. Local contact/repair timing is never multiplied
by celestial playback speed.

The render adapter uses a fixed inertial encounter frame anchored on the actual
ship center of mass. Pointer placement uses the same transform, so a rock still
spawns under the pointer while the ship turns. Nearby rocks and detached pieces
share the same map anchor; planet motion never directly teleports a physical rock.

The AI gateway receives `telemetry.navigation` with the current phase, target,
ETA and planned arrival, plus `telemetry.solar_system` with the epoch/date and
all eight heliocentric position/velocity vectors. This is explicitly separate
from local body-frame collision sensing. Main Judging approval gates proposed
catalog actions. Routine Propelling course/attitude corrections have direct standing
authority and need no proposal or model call; AI responses cannot change clocks or orbital data.
The optional Gazebo map on port 8000 remains its separate simulation.

## Verification

From `Ub_Space_hackathon_2026/frontend`, run `npm test` and `npm run build`.
Tests cover two-body energy and angular-momentum conservation, orbital periods,
inclination, faster perihelion motion, lunar motion, pause/reset, per-voyage
isolation, current-epoch loop closure, far-side arcs behind both visible planets,
actual spacecraft passage behind Mars and Earth, Sun clearance, continuous captures
and departures, multiple mission legs, prediction, pointer placement and AI avoidance.
The four-role gateway also accepts the exported dynamic DEMO observation using
simulated model responses, without provider calls.
