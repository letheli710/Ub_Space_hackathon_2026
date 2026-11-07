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

## Supported assets

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
