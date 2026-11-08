"""Run the DEMO AI gateway without ROS/Gazebo: python -m starship_sim.demo_api."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from .ai.demo import DemoAdvisor, Observation
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


def create_demo_app(settings=None, client=None):
    advisor = DemoAdvisor(settings or load_settings(), client)

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
        return advisor.status()

    @app.post('/api/v1/demo-ai/cycle')
    async def cycle(observation: Observation):
        try:
            return await advisor.cycle(observation)
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
