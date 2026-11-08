"""Four read-only model ports and the separate Main-Judging execution pipeline."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from .contracts import PolicyError, SystemId
from .coordinator import AIUnavailable
from .prompts import role_description
from .provider import ModelError


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')


class CycleRequest(EmptyRequest):
    execute: bool = True


class LoopRequest(EmptyRequest):
    running: bool


def translate(exc):
    if isinstance(exc, KeyError):
        return HTTPException(404, 'Unknown AI cycle')
    if isinstance(exc, PolicyError):
        return HTTPException(409, str(exc))
    if isinstance(exc, (AIUnavailable, ModelError)):
        return HTTPException(503, str(exc))
    return HTTPException(503, 'AI operation failed; inspect the cycle status')


def install_ai_routes(app, scene):
    router = APIRouter(prefix='/api/v1/ai', tags=['Spacecraft AI'])

    @router.get('/status')
    async def ai_status(request: Request):
        return request.app.state.ai.status()

    @router.get('/systems')
    async def systems(request: Request):
        return request.app.state.ai.status()['systems']

    @router.get('/systems/{system_id}')
    async def system_description(system_id: SystemId):
        return role_description(system_id, scene)

    @router.post('/systems/{system_id}/invoke')
    async def invoke(system_id: SystemId, command: EmptyRequest, request: Request):
        try:
            return await request.app.state.ai.analyze_role(system_id)
        except (PolicyError, AIUnavailable, ModelError) as exc:
            raise translate(exc) from exc

    @router.get('/cycles')
    async def cycles(request: Request):
        return [{'id': cycle['id'], 'status': cycle['status'], 'created_at': cycle['created_at']}
                for cycle in reversed(request.app.state.ai.cycles.values())]

    @router.post('/cycles', status_code=202)
    async def start_cycle(command: CycleRequest, request: Request):
        try:
            return request.app.state.ai.start_cycle(command.execute)
        except (PolicyError, AIUnavailable) as exc:
            raise translate(exc) from exc

    @router.get('/cycles/{cycle_id}')
    async def get_cycle(cycle_id: str, request: Request):
        try:
            coordinator = request.app.state.ai
            return coordinator.public_cycle(coordinator.cycles[cycle_id])
        except KeyError as exc:
            raise translate(exc) from exc

    @router.post('/cycles/{cycle_id}/execute')
    async def execute_cycle(cycle_id: str, command: EmptyRequest, request: Request):
        try:
            return await request.app.state.ai.execute_cycle(cycle_id)
        except (PolicyError, AIUnavailable, ModelError, RuntimeError, KeyError) as exc:
            raise translate(exc) from exc

    @router.post('/control')
    async def control(command: LoopRequest, request: Request):
        try:
            return await request.app.state.ai.set_running(command.running)
        except (PolicyError, AIUnavailable, ModelError) as exc:
            raise translate(exc) from exc

    app.include_router(router)
