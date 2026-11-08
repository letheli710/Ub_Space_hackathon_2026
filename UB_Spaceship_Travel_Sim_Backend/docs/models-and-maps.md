# Replaceable ship models and mission maps

`config/environment.json` selects the assets. The current ship and map are
starter assets; their geometry is not embedded in React code or the generator.
The same SDF inputs produce Gazebo's physics world and `/api/v1/scene` for the
browser. The UI discovers entities, links, arms and limits from this contract.

## Import workflow

1. Copy the SDF file and its mesh/texture dependencies into `assets/`, for example
   `assets/models/explorer/model.sdf` and `assets/maps/new_mission.sdf`.
2. Edit `config/environment.json` to select the files. Paths are relative to this
   backend folder, not to the configuration file.
3. Map each controllable arm's joint names to real revolute joints in the SDF.
   The lower and upper limits are read directly from those joints.
4. Choose an existing map model as the destination and set the center stopping
   distance and nominal cruise speed in meters and seconds.
   Update or remove `ship_spawn` and `map` annotations when replacing the solar
   system: their entity IDs must exist in the replacement SDF.
5. Stop and rebuild the backend using `tools/stop.ps1` and `tools/start.ps1`.
   The Docker build generates `worlds/environment.sdf`, `config/scene.json` and
   `config/bridge.yaml`. The frontend automatically reloads the new scene when
   the backend reconnects. No frontend rebuild is needed for asset changes.

Example profile:

```json
{
  "ship_sdf": "assets/models/explorer/model.sdf",
  "map_sdf": "assets/maps/new_mission.sdf",
  "ship_entity_id": "explorer",
  "destination": { "entity_id": "arrival_planet", "stop_distance_m": 100 },
  "cruise_speed_m_s": 3,
  "arms": [
    {
      "id": "engineering",
      "system": "engineering",
      "joints": { "base": "engineering_base_joint", "elbow": "engineering_elbow_joint" }
    }
  ]
}
```

`ship_entity_id` assigns the ship's model/frame ID; it is not hardcoded in the
renderer or navigation controller. World names come from the map SDF. World,
ship, arm IDs and joint command keys use letters, numbers and underscores,
beginning with a letter or underscore. The ship model must be dynamic. Map
entities may be static or dynamic; dynamic entities receive pose publishers.

## Solar-system map and map controls

`assets/maps/solar_system.sdf` is the editable source for the default map. Its
planet colors, sizes, starting angles and orbit spacing were converted from
the frontend artwork. The old `deep_space.sdf` remains an optional sample; it
is no longer selected. The frontend's standalone HTML map has been retired.

Each planet is a dynamic sphere with a world-anchored revolute joint. A Gazebo
`JointController` sets its angular velocity. These are prescribed circular
orbits in zero gravity, not an N-body simulation. Physics controls their poses;
the browser consumes the measured transforms. The Sun and hazard landmarks
are static. Asteroids have collision geometry; storm/black-hole markers do not
simulate radiation, gravity or damage.

The optional profile fields are:

```json
{
  "ship_spawn": {
    "entity_id": "earth",
    "offset_m": [15, -40, 10],
    "yaw_rad": -1.38
  },
  "map": {
    "title": "Solar System",
    "origin_entity_id": "earth",
    "description": "Compressed simulator scale, measured backend positions.",
    "objects": {
      "earth": { "label": "Earth", "kind": "planet" },
      "asteroid_field": { "label": "Asteroid field", "kind": "hazard" }
    }
  }
}
```

`ship_spawn` overrides the ship asset's pose with a world-axis offset from the
named map entity's initial position. It is optional; omit it to use the ship's
own SDF pose. `map.objects` accepts `label`, `kind` and `description`. Omit map
annotations entirely to render another imported map with generated labels.
The frontend discovers model IDs, position, radius, color and orbit descriptions
from the exported contract, rather than using a list of solar-system names.

For controllable map orbits, use a world-parent revolute joint with local Z axis,
an explicit model-relative joint pose, and a `gz::sim::systems::JointController`
with a finite, nonzero `initial_velocity`. The generator exports its center,
radius, period and velocity topic, and creates the ROS/Gazebo command bridge.
See [Gazebo's JointController reference](https://gazebosim.org/api/sim/8/classgz_1_1sim_1_1systems_1_1JointController.html).
Keep orbits horizontal in the Z-up world for the map's top-down projection.

`POST /api/v1/map/control` accepts `{"orbit_speed": 0}` through
`{"orbit_speed": 5}`. This multiplier changes planetary velocities, not the
physics clock or ship's nominal cruise speed. At 0×, planets stop while the
unpaused ship and arms can still move. The frontend's shared pause/resume button
instead freezes/resumes the whole Gazebo world. Changes affect every connected
viewer. Maps without orbital controllers still render and disable the speed
selector. Fast planets can outrun the configured ship; tune cruise speed in
the profile for a different mission.

After edits, regenerate with `uv run python tools/generate_environment.py`,
then stop and rebuild using the appropriate OS instructions in the backend
README. Neither the frontend bundle nor its map renderer needs editing for
replacement SDFs or renamed entities.

## Supported assets

### Solar panels and AI capabilities

Optionally map solar-panel hinges in `config/environment.json`:

```json
"solar_panels": [
  { "id": "port", "joint_name": "solar_port_tilt" },
  { "id": "starboard", "joint_name": "solar_starboard_tilt" }
]
```

Each mapping must identify a distinct revolute joint in the selected ship SDF,
with finite ordered lower/upper limits. It cannot reuse an arm joint. The
generator adds position controllers, ROS/Gazebo bridge topics, scene metadata
and measured telemetry. The browser renders panel links like other imported
links. Omit the list or use `[]` for a ship without movable panels; Energy then
has no panel action available and must propose no unsupported action.

AI prompts discover these panels, arms, map objects and speed limits from the
generated scene. Replacing a ship/map does not require editing role prompts or
React geometry. Panel health and incidence-based charge rates now use an abstract
game model, rather than electrical watts or material physics. Arms may declare
maintenance capabilities and a service pose. See [status configuration](ship-state-and-sensing.md#replacement-models-and-tuning)
for those fields and panel mounting vectors.

- The ship file contains `<sdf><model>…</model></sdf>` with links, collisions,
  inertias and joints. The map file contains `<sdf><world>…</world></sdf>` with
  top-level models. The map does not contain the ship itself.
- Browser geometry supports boxes, spheres, cylinders, capsules, planes and
  mesh files in GLB/glTF, STL, OBJ and Collada (`.dae`) formats. Gazebo must also
  support the chosen mesh. Preserve physical collision geometry in the SDF.
- Keep mesh files and their dependencies under `assets/`. Relative SDF mesh
  URIs and local `model://name/...` references resolve within that directory
  (including `assets/models/` and `assets/imported/`). External network/package
  URIs and files outside `assets/` are rejected. No asset is silently omitted.
- Generation rewrites Gazebo mesh paths to `/workspace/assets/...` and browser
  paths to `/api/v1/assets/<revision>/...`; Windows paths are not baked into the world.
- Each mesh supports an SDF `<scale>x y z</scale>`. Uncompressed GLB/glTF and
  Collada keep embedded materials; STL/OBJ can use an SDF diffuse color. OBJ MTL
  materials and compressed glTF extensions are not configured by this loader.
- Primitive materials use SDF diffuse color/transparency. Other SDF material
  shader features, scripts and PBR textures on primitives are not exported.
- Poses use radians and Euler RPY. Named local frames and `relative_to` are
  resolved into model-relative link transforms and link-relative visuals.
  Meters and Z up remain the contract; the renderer converts the scene to Y up.

Flatten nested models, `<include>` elements and mesh `<submesh>` selections
before importing. The generator reports unsupported geometry, unresolved
frames, missing files or missing arm joints before starting a broken scene.
It does not convert arbitrary Gazebo Fuel packages or author robot physics.

A whole-ship visual mesh does not define an articulated robot. To preserve arm
movement, attach each imported arm mesh to its corresponding SDF link and map
the joints in the profile. Runtime pose, joint and velocity plugins are added
by the generator, so those topics remain consistent across replacement ships.

The browser frames the selected model/map from its actual bounds. It follows
the configured ship and applies measured transforms by scoped frame ID rather
than by array order. Scene revisions include asset content; edited mesh files
cause a fresh scene load after rebuilding and reconnecting. The revision is
part of the mesh URL directory, so relative textures/buffers and loader caches
also load the updated version.

To refresh host-side generated exports before local testing/committing:

```powershell
uv sync --locked
uv run python tools/generate_environment.py
uv run pytest -q
```
