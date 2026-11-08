import asyncio
import json
from fastapi.testclient import TestClient
import pytest

from starship_sim.ai.demo import DemoAdvisor, Observation, Proposals, Decision, validated_selection
from starship_sim.ai.provider import ModelError
from starship_sim.ai.settings import load_settings
from starship_sim.demo_api import create_demo_app


def observation():
    return Observation.model_validate({'run_id': 'test', 'epoch': 0, 'sim_time_s': 1,
        'coordinate_frame': '+Z nose, +Y up, +X right', 'telemetry': {}, 'active_faults': [], 'threats': [],
        'options': [
            {'id': 'burn', 'owner': 'propelling', 'action': {'type': 'burn', 'linear': [1, 0, 0], 'angular': [0, 0, 0], 'seconds': 8}, 'prediction': {}},
            {'id': 'repair', 'owner': 'robot_arms', 'action': {'type': 'repair', 'arm_id': 'command', 'part_id': 'command', 'seconds': 10}, 'prediction': {}},
            {'id': 'solar', 'owner': 'energy', 'action': {'type': 'solar_protection', 'enabled': True}, 'prediction': {}},
        ]})


class Models:
    def __init__(self, bad_role=False, bad_judge=False):
        self.calls = []; self.bad_role = bad_role; self.bad_judge = bad_judge

    async def complete(self, role, prompt, context, output_type):
        self.calls.append(role)
        assert 'JSON' in prompt
        if role == 'main_judging':
            return Decision(summary='Combine independent actions', combination_rationale='Compatible resources',
                reviews=[] if self.bad_judge else [{'proposal_id': p['id'], 'approve': True, 'reason': 'Test'} for p in context['proposals']])
        option = 'burn' if self.bad_role and role == 'energy' else context['options'][0]['id']
        return Proposals(assessment='Test fixture', proposals=[{'option_id': option, 'rationale': 'Test', 'risks': 'Test'}])

    async def close(self):
        pass


def settings():
    return load_settings({'AI_ENABLED': 'true', 'DEEPSEEK_API_KEY': 'fixture-only-not-a-real-key'})


def test_gateway_combines_only_judged_subsystem_proposals():
    models = Models()
    with TestClient(create_demo_app(settings(), models)) as client:
        assert 'fixture-only' not in json.dumps(client.get('/api/v1/demo-ai/status').json())
        response = client.post('/api/v1/demo-ai/cycle', json=observation().model_dump())
        assert response.status_code == 200
        assert set(response.json()['approved_options']) == {'burn', 'repair', 'solar'}
        assert len(models.calls) == 4


def test_wrong_role_cannot_control_thrusters_and_bad_judge_cannot_skip_reviews():
    result = asyncio.run(DemoAdvisor(settings(), Models(bad_role=True)).cycle(observation()))
    assert 'energy' in result['errors']
    assert 'solar' not in result['approved_options']
    with pytest.raises(ModelError, match='review each'):
        asyncio.run(DemoAdvisor(settings(), Models(bad_judge=True)).cycle(observation()))


def test_duplicate_or_conflicting_judgements_fail():
    o = observation()
    proposals = [{'id': 'a', 'option_id': 'burn'}, {'id': 'b', 'option_id': 'burn'}]
    decision = Decision(summary='Bad', combination_rationale='Bad', reviews=[{'proposal_id': p['id'], 'approve': True, 'reason': 'Bad'} for p in proposals])
    with pytest.raises(ModelError, match='conflicting'):
        validated_selection(o, proposals, decision)
    decision.reviews[1].proposal_id = 'a'
    with pytest.raises(ModelError, match='review each'):
        validated_selection(o, proposals, decision)


def test_invalid_or_oversized_observations_never_call_models():
    models = Models()
    with TestClient(create_demo_app(settings(), models)) as client:
        o = observation().model_dump(); o['options'][0]['owner'] = 'energy'
        assert client.post('/api/v1/demo-ai/cycle', json=o).status_code == 422
        assert client.post('/api/v1/demo-ai/cycle', content='x' * 250001).status_code == 413
        o = observation().model_dump(); o['options'][0]['action']['linear'] = [2, 0, 0]
        assert client.post('/api/v1/demo-ai/cycle', json=o).status_code == 422
        assert not models.calls


def test_per_system_diagnostics_preserve_partial_success_and_judge_failure():
    with TestClient(create_demo_app(settings(), Models(bad_role=True))) as client:
        cycle = client.post('/api/v1/demo-ai/cycle', json=observation().model_dump()).json()
        assert cycle['calls']['energy']['status'] == 'error'
        assert cycle['calls']['robot_arms']['status'] == 'ok'
        assert cycle['calls']['main_judging']['duration_s'] >= 0
        assert cycle['status'] == 'judged'
    with TestClient(create_demo_app(settings(), Models(bad_judge=True))) as client:
        response = client.post('/api/v1/demo-ai/cycle', json=observation().model_dump())
        assert response.status_code == 503
        cycle = response.json()['cycle']
        assert cycle['status'] == 'failed' and cycle['approved_options'] == []
        assert len(cycle['proposals']) == 3 and len(cycle['assessments']) == 3
        assert cycle['calls']['main_judging']['status'] == 'error'
        assert 'review each' in cycle['errors']['main_judging']


def test_offline_subsystem_is_not_called_and_cannot_propose_but_main_judging_stays_online():
    models = Models()
    o = observation().model_dump()
    o['telemetry']['systems'] = {'energy': {'mode': 'offline', 'reason': 'Solar storm', 'remaining_s': 15}}
    with TestClient(create_demo_app(settings(), models)) as client:
        response = client.post('/api/v1/demo-ai/cycle', json=o)
        assert response.status_code == 200
        cycle = response.json()
        assert 'energy' not in models.calls and 'main_judging' in models.calls
        assert cycle['calls']['energy']['status'] == 'offline'
        assert 'solar' not in cycle['approved_options']


def test_emergency_robot_arms_can_only_propose_energy_repairs():
    class EmergencyModels(Models):
        async def complete(self, role, prompt, context, output_type):
            if role == 'robot_arms':
                self.calls.append(role)
                assert [o['id'] for o in context['options']] == ['solar_rebuild']
                return Proposals(assessment='Restore emergency energy', proposals=[{'option_id': 'solar_rebuild', 'rationale': 'Restore power', 'risks': 'Contact required'}])
            return await super().complete(role, prompt, context, output_type)
    models = EmergencyModels()
    o = observation().model_dump()
    o['telemetry']['systems'] = {role: {'mode': 'emergency' if role == 'robot_arms' else 'offline'} for role in ['energy', 'propelling', 'robot_arms']}
    o['options'].append({'id': 'solar_rebuild', 'owner': 'robot_arms', 'action': {'type': 'repair', 'arm_id': 'engine', 'part_id': 'solar', 'seconds': 10}, 'prediction': {}})
    with TestClient(create_demo_app(settings(), models)) as client:
        response = client.post('/api/v1/demo-ai/cycle', json=o)
        assert response.status_code == 200, response.text
        assert response.json()['approved_options'] == ['solar_rebuild']
        assert set(models.calls) == {'robot_arms', 'main_judging'}


def test_main_judging_cannot_assign_one_arm_to_two_components():
    o = observation()
    from starship_sim.ai.demo import Option
    o.options.append(Option.model_validate({'id': 'repair2', 'owner': 'robot_arms', 'action': {'type': 'repair', 'arm_id': 'command', 'part_id': 'engine', 'seconds': 10}, 'prediction': {}}))
    proposals = [{'id': 'a', 'option_id': 'repair'}, {'id': 'b', 'option_id': 'repair2'}]
    decision = Decision(summary='Bad combination', combination_rationale='Bad', reviews=[{'proposal_id': p['id'], 'approve': True, 'reason': 'Bad'} for p in proposals])
    with pytest.raises(ModelError, match='one arm'):
        validated_selection(o, proposals, decision)
