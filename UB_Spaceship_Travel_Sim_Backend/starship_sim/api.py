"""HTTP/WebSocket contract independent of the ROS executor thread."""

import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, FiniteFloat, Field
from starship_sim.ai.coordinator import AICoordinator
from starship_sim.ai.routes import install_ai_routes
from starship_sim.ai.settings import load_settings
from starship_sim.spacecraft import DISASTERS

ROOT = Path(__file__).resolve().parents[1]


class ArmCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    targets: dict[str, FiniteFloat] = Field(min_length=1)


class WorldControl(BaseModel):
    model_config = ConfigDict(extra="forbid")
    paused: bool


class MapControl(BaseModel):
    model_config = ConfigDict(extra="forbid")
    orbit_speed: FiniteFloat = Field(ge=0, le=5)


class SolarPanelCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_rad: FiniteFloat


class DisasterCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: str
    severity: FiniteFloat = Field(default=65, ge=1, le=100)


def create_app(backend=None, origins=None, scene_path=None, assets_dir=None, ai_settings=None, ai_client=None):
    scene = json.loads(Path(scene_path or ROOT / "config/scene.json").read_text(encoding="utf-8"))
    settings = ai_settings or load_settings()
    allowed_origins = origins if origins is not None else [
        value.strip() for value in os.getenv(
            "WEB_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
        ).split(",") if value.strip()]
    arms = {arm["id"]: arm for arm in scene["arms"]}

    @asynccontextmanager
    async def lifespan(app):
        nonlocal backend
        if backend is None:
            from starship_sim.ros_backend import RosBackend
            backend = RosBackend(scene, ai_managed=settings.enabled)
        app.state.backend = backend
        try:
            app.state.ai = AICoordinator(scene, backend, settings, ai_client)
            yield
        finally:
            if hasattr(app.state, 'ai'):
                await app.state.ai.close()
            backend.close()

    app = FastAPI(title="Starship Environment API", version="0.1.0", lifespan=lifespan,
                  description="Live Space ROS/Gazebo state and commands. Coordinates are Z-up; angles are radians.")
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
    app.mount(f'/api/v1/assets/{scene["revision"]}', StaticFiles(directory=assets_dir or ROOT / "assets"), name="environment-assets")

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, exc):
        # An overflowed JSON number can become infinity. Returning it as part of
        # Pydantic's raw error input would itself fail JSON serialization.
        return JSONResponse(status_code=422, content={"detail": [
            {key: error[key] for key in ("type", "loc", "msg")}
            for error in exc.errors()
        ]})

    @app.get("/healthz")
    def health():
        return {"service": "starship-environment", **app.state.backend.health()}

    @app.get("/readyz")
    def ready():
        status = app.state.backend.health()
        if not status["ready"]:
            raise HTTPException(503, detail=status)
        return status

    @app.get("/api/v1/scene")
    def get_scene():
        return scene

    @app.get("/api/v1/state")
    def get_state():
        return app.state.backend.snapshot()

    @app.post('/api/v1/disasters', status_code=202)
    def inject_disaster(command: DisasterCommand):
        if command.kind not in DISASTERS:
            raise HTTPException(422, 'Unknown disaster kind')
        try:
            return app.state.backend.inject_disaster(command.kind, command.severity)
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post("/api/v1/arms/{arm_id}/target", status_code=202)
    def command_arm(arm_id: str, command: ArmCommand):
        if settings.enabled:
            raise HTTPException(403, 'Manual actuator commands are disabled in AI-managed mode; use Main Judging')
        if arm_id not in arms:
            raise HTTPException(404, "Unknown arm")
        joints = arms[arm_id]["joints"]
        # Validate the complete request before publishing any joint target.
        for name, target in command.targets.items():
            bounds = joints.get(name)
            if bounds is None:
                raise HTTPException(422, f"Unknown joint: {name}")
            if not bounds["lower_rad"] <= target <= bounds["upper_rad"]:
                raise HTTPException(422, f"{name} is outside the joint limits")
        try:
            return app.state.backend.command_arm(arm_id, command.targets)
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post('/api/v1/solar-panels/{panel_id}/target', status_code=202)
    def command_solar_panel(panel_id: str, command: SolarPanelCommand):
        if settings.enabled:
            raise HTTPException(403, 'Manual actuator commands are disabled in AI-managed mode; use Main Judging')
        panel = next((panel for panel in scene.get('solar_panels', []) if panel['id'] == panel_id), None)
        if not panel:
            raise HTTPException(404, 'Unknown solar panel')
        if not panel['lower_rad'] <= command.target_rad <= panel['upper_rad']:
            raise HTTPException(422, 'Solar-panel target is outside its limits')
        try:
            return app.state.backend.command_solar_panel(panel_id, command.target_rad)
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post("/api/v1/simulation/control")
    async def control_world(command: WorldControl):
        try:
            return await app.state.backend.control_world(command.paused)
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post("/api/v1/map/control")
    def control_map(command: MapControl):
        try:
            return app.state.backend.command_map(command.orbit_speed)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.websocket("/api/v1/telemetry")
    async def telemetry(socket: WebSocket):
        # CORS does not protect WebSockets; check browser origins here as well.
        origin = socket.headers.get("origin")
        if origin is not None and origin not in allowed_origins:
            await socket.close(code=1008)
            return
        await socket.accept()
        try:
            while True:
                await asyncio.wait_for(socket.send_json({
                    "type": "state", "schema_version": 1,
                    "data": app.state.backend.snapshot(),
                }), timeout=2)
                await asyncio.sleep(0.1)
        except (WebSocketDisconnect, asyncio.TimeoutError, OSError):
            pass

    install_ai_routes(app, scene)
    return app
