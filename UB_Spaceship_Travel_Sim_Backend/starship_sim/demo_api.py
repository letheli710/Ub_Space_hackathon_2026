"""Run the DEMO AI gateway without ROS/Gazebo: python -m starship_sim.demo_api."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from .ai.demo import DemoAdvisor, DemoCycleError, Observation
from .ai.connection import BrowserConnection
from .ai.contracts import Contract
from .ai.provider import ModelError
from .ai.settings import load_settings


def load_local_env(path=None):
    """Read simple KEY=value assignments without executing shell code or logging secrets."""
    path = Path(path or Path(__file__).resolve().parents[1] / '.env')
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            os.environ.setdefault(key, value)


class ConnectionRequest(Contract):
    connection: BrowserConnection | None = None


class CycleRequest(ConnectionRequest):
    observation: Observation


def create_demo_app(settings=None, client=None, connection_client_factory=None):
    advisor = DemoAdvisor(settings or load_settings(), client)

    @asynccontextmanager
    async def selected(connection):
        if connection is None:
            yield advisor
            return
        configured = connection.settings()
        active = DemoAdvisor(configured, connection_client_factory(configured) if connection_client_factory else None)
        try:
            yield active
        finally:
            await active.close()

    def public_status(active, connection):
        return {**active.status(), 'source': 'browser' if connection else 'backend'}

    @asynccontextmanager
    async def lifespan(app):
        yield
        await advisor.close()

    app = FastAPI(title='DEMO AI gateway', lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in os.getenv('WEB_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')], allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])

    @app.middleware('http')
    async def limit_body(request: Request, call_next):
        if request.method == 'POST':
            total = 0
            chunks = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 250000:
                    return JSONResponse(status_code=413, content={'detail': 'Observation too large'})
                chunks.append(chunk)
            request._body = b''.join(chunks)
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def invalid(_request, exc):
        return JSONResponse(status_code=422, content={'detail': [{k: e[k] for k in ('type', 'loc', 'msg')} for e in exc.errors()]})

    @app.get('/api/v1/demo-ai/status')
    def status():
        return public_status(advisor, None)

    @app.post('/api/v1/demo-ai/status')
    async def selected_status(command: ConnectionRequest):
        # Connection cards poll configuration only; no provider traffic or generation.
        async with selected(command.connection) as active:
            return public_status(active, command.connection)

    @app.post('/api/v1/demo-ai/check')
    async def check(command: ConnectionRequest):
        try:
            async with selected(command.connection) as active:
                if not active.settings.enabled or any(not c.api_key for c in active.settings.roles.values()):
                    raise ModelError('No active AI connection. Save settings in AI API or configure the backend .env.')
                await active.client.check()
                return {**public_status(active, command.connection), 'verified': True,
                        'message': 'Model access verified. Run a DEMO cycle to test decisions.'}
        except ModelError as exc:
            raise HTTPException(503, str(exc)) from exc

    @app.post('/api/v1/demo-ai/cycle')
    async def cycle(command: CycleRequest | Observation):
        try:
            connection = command.connection if isinstance(command, CycleRequest) else None
            observation = command.observation if isinstance(command, CycleRequest) else command
            async with selected(connection) as active:
                try:
                    result = await active.cycle(observation)
                except DemoCycleError as exc:
                    return JSONResponse(status_code=503, content={'detail': str(exc), 'cycle': exc.cycle,
                                        'connection': public_status(active, connection)})
                return {**result, 'connection': public_status(active, connection)}
        except ModelError as exc:
            raise HTTPException(503, str(exc)) from exc

    return app


if __name__ == '__main__':
    import argparse
    import uvicorn
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()
    load_local_env()
    uvicorn.run(create_demo_app(), host='127.0.0.1', port=args.port)
