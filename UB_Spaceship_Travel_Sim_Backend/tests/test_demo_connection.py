import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from starship_sim.ai.connection import BrowserConnection
from starship_sim.ai.demo import Proposals
from starship_sim.ai.provider import ModelClient, ModelError
from starship_sim.ai.settings import load_settings
from starship_sim.demo_api import create_demo_app
from test_demo_ai import Models, observation, settings


def connection(provider='deepseek', **changes):
    return {'provider': provider, 'api_key': 'browser-fixture-key', 'model': 'fixture-flight',
            'base_url': 'https://provider.example/v1' if provider == 'other' else '', **changes}


def envelope(provider, value):
    text = json.dumps(value)
    if provider == 'anthropic':
        return {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': text}]}
    if provider == 'google':
        return {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': text}]}}]}
    return {'choices': [{'finish_reason': 'stop', 'message': {'content': text}}]}


def model_factory(calls, fault=None):
    def factory(config):
        def handler(request):
            calls.append(request)
            if fault:
                return httpx.Response(fault, text='browser-fixture-key server-secret must not leak', headers={'Location': 'https://redirect.example'})
            if request.method == 'GET':
                return httpx.Response(200, json={'data': [{'id': 'fixture-flight'}], 'id': 'fixture-flight', 'name': 'models/fixture-flight'})
            body = json.loads(request.content)
            provider = config.provider
            if provider == 'google':
                context = json.loads(body['contents'][0]['parts'][0]['text'])
            else:
                context = json.loads(body['messages'][-1]['content'])
            if 'proposals' in context:
                value = {'summary': 'Combine repairs and evasion', 'combination_rationale': 'Independent controls',
                    'reviews': [{'proposal_id': p['id'], 'approve': True, 'reason': 'Beneficial'} for p in context['proposals']]}
            else:
                value = {'assessment': 'Measured telemetry received', 'proposals': [
                    {'option_id': context['options'][0]['id'], 'rationale': 'Reduce damage', 'risks': 'Consumes resources'}]}
            return httpx.Response(200, json=envelope(provider, value))
        client = ModelClient(config, httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        client.owns_client = True
        return client
    return factory


@pytest.mark.parametrize('provider', ['deepseek', 'openai', 'anthropic', 'google', 'other'])
def test_browser_settings_reach_all_four_roles_without_entering_prompts_or_changing_server(provider):
    calls, server = [], Models()
    with TestClient(create_demo_app(settings(), server, model_factory(calls))) as api:
        selected = connection(provider)
        check = api.post('/api/v1/demo-ai/check', json={'connection': selected})
        assert check.status_code == 200, check.text
        assert check.json()['verified'] and len(calls) == 1
        assert not server.calls
        result = api.post('/api/v1/demo-ai/cycle', json={'connection': selected, 'observation': observation().model_dump()})
        assert result.status_code == 200, result.text
        data = result.json()
        assert set(data['approved_options']) == {'burn', 'repair', 'solar'}
        assert data['connection']['source'] == 'browser'
        assert len(data['connection']['systems']) == 4
        assert all(s['model'] == 'fixture-flight' for s in data['connection']['systems'])
        assert len(calls) == 5 and not server.calls
        for request in calls:
            key_header = {'anthropic': 'x-api-key', 'google': 'x-goog-api-key'}.get(provider, 'authorization')
            assert 'browser-fixture-key' in request.headers[key_header]
            assert 'browser-fixture-key' not in str(request.url)
            assert 'browser-fixture-key' not in request.content.decode()
            if request.method == 'POST':
                body = json.loads(request.content)
                assert ('thinking' in body) == (provider == 'deepseek')
                if provider == 'openai': assert 'max_completion_tokens' in body and 'max_tokens' not in body
        assert 'browser-fixture-key' not in result.text + check.text
        assert api.get('/api/v1/demo-ai/status').json()['source'] == 'backend'
        assert api.get('/api/v1/demo-ai/status').json()['systems'][0]['model'] == 'deepseek-flash'
        # Removing browser settings selects the original server connection again.
        assert api.post('/api/v1/demo-ai/cycle', json=observation().model_dump()).status_code == 200
        assert len(server.calls) == 4


@pytest.mark.parametrize('fault', [401, 429, 302])
def test_failed_browser_connection_never_falls_back_or_leaks_keys(fault):
    calls, server = [], Models()
    with TestClient(create_demo_app(settings(), server, model_factory(calls, fault))) as api:
        result = api.post('/api/v1/demo-ai/cycle', json={'connection': connection(), 'observation': observation().model_dump()})
        assert result.status_code == 503
        assert 'browser-fixture-key' not in result.text and 'server-secret' not in result.text
        assert not server.calls
        assert all(r.url.host == 'api.deepseek.com' for r in calls), 'redirect must not receive credentials'


@pytest.mark.parametrize('changes', [
    {'base_url': 'https://user:password@example.com'}, {'base_url': 'https://example.com?key=browser-fixture-key'},
    {'base_url': 'http://example.com'}, {'base_url': 'file:///tmp/key'}, {'base_url': 'https://example.com/chat/completions'},
    {'provider': 'unknown'}, {'model': ''}, {'api_key': ''}, {'api_key': 'browser-fixture-key\nBAD'},
])
def test_invalid_connections_are_redacted_and_never_call_a_provider(changes):
    calls = []
    with TestClient(create_demo_app(settings(), Models(), model_factory(calls))) as api:
        result = api.post('/api/v1/demo-ai/check', json={'connection': connection(**changes)})
        assert result.status_code == 422
        assert 'browser-fixture-key' not in result.text
        assert not calls


def test_custom_connection_requires_its_own_key_and_works_without_server_ai_enabled():
    calls = []
    disabled = load_settings({'AI_ENABLED': 'false', 'DEEPSEEK_API_KEY': 'server-secret'})
    with TestClient(create_demo_app(disabled, Models(), model_factory(calls))) as api:
        selected = connection(base_url='http://127.0.0.1:9123/v1')
        missing = {k: v for k, v in selected.items() if k != 'api_key'}
        assert api.post('/api/v1/demo-ai/check', json={'connection': missing}).status_code == 422
        assert api.post('/api/v1/demo-ai/check', json={}).status_code == 503
        assert not calls
        result = api.post('/api/v1/demo-ai/check', json={'connection': selected})
        assert result.status_code == 200 and result.json()['enabled']
        assert 'server-secret' not in str(calls[0].headers)


@pytest.mark.parametrize('provider', ['openai', 'anthropic', 'google', 'other'])
def test_other_protocols_reject_unstructured_or_truncated_responses(provider):
    async def run():
        config = BrowserConnection(**connection(provider)).settings()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json={'output': 'invalid'}))) as http:
            with pytest.raises(ModelError, match='invalid structured'):
                await ModelClient(config, http).complete('energy', 'Return JSON', {}, Proposals)
    asyncio.run(run())


@pytest.mark.parametrize('data', [None, [], {'data': None}, {'data': [None, 'bad']}, {'data': [{'id': 'different-model'}]}])
def test_model_access_check_rejects_malformed_or_missing_model_metadata(data):
    async def run():
        config = BrowserConnection(**connection()).settings()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=data))) as http:
            with pytest.raises(ModelError):
                await ModelClient(config, http).check()
    asyncio.run(run())


def test_connection_cards_poll_configuration_without_calling_providers():
    calls, server = [], Models()
    with TestClient(create_demo_app(settings(), server, model_factory(calls))) as api:
        for _ in range(3):
            response = api.post('/api/v1/demo-ai/status', json={'connection': connection()})
            assert response.status_code == 200
            assert response.json()['source'] == 'browser'
            assert all(s['configured'] and s['model'] == 'fixture-flight' for s in response.json()['systems'])
            assert 'browser-fixture-key' not in response.text
        assert api.post('/api/v1/demo-ai/status', json={}).json()['source'] == 'backend'
        assert not calls and not server.calls


def test_all_failed_roles_are_reported_and_main_judging_is_skipped():
    with TestClient(create_demo_app(settings(), Models(), model_factory([], 401))) as api:
        response = api.post('/api/v1/demo-ai/cycle', json={'connection': connection(), 'observation': observation().model_dump()})
        assert response.status_code == 503
        cycle = response.json()['cycle']
        assert set(cycle['errors']) == {'propelling', 'energy', 'robot_arms'}
        assert all(cycle['calls'][r]['status'] == 'error' for r in cycle['errors'])
        assert cycle['calls']['main_judging']['status'] == 'skipped'
        assert cycle['approved_options'] == []
        assert 'browser-fixture-key' not in response.text
