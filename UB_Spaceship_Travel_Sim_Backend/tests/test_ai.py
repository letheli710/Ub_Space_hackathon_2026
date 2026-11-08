"""Exercise model boundaries and authority with explicitly injected test doubles."""

import asyncio
from copy import deepcopy
import json
from pathlib import Path

from fastapi.testclient import TestClient
import httpx
import pytest
from pydantic import ValidationError

from starship_sim.ai.contracts import (ArmTarget, FollowNavigation, Judgement, PolicyError,
    SolarPanelTarget, SubsystemOutput, SystemId, ThrusterVelocity, select_plan, validate_action)
from starship_sim.ai.coordinator import AICoordinator, AIUnavailable
from starship_sim.ai.provider import DeepSeekClient, ModelError
from starship_sim.ai.settings import load_settings
from starship_sim.api import create_app

SCENE = json.loads((Path(__file__).resolve().parents[1] / 'config/scene.json').read_text())
SETTINGS = load_settings({'AI_ENABLED': 'true', 'DEEPSEEK_API_KEY': 'test-only-secret'})


class Backend:
    def __init__(self):
        self.state = {'scene_revision': SCENE['revision'], 'run_id': 'test-run', 'control_epoch': 0,
                      'sim_time_s': 10, 'paused': False, 'connection': {'ready': True}}
        self.actions = []

    def configure_ai_authority(self, enabled):
        self.enabled = enabled

    def snapshot(self):
        return deepcopy(self.state)

    def execute_approved(self, actions, run_id, epoch):
        assert run_id == self.state['run_id'] and epoch == self.state['control_epoch']
        self.actions.append(actions)
        self.state['control_epoch'] += 1
        return {'status': 'dispatched', 'actions': [item.model_dump() for item in actions]}

    def cancel_ai_commands(self):
        self.state['control_epoch'] += 1

    def close(self):
        pass


def output(action):
    return SubsystemOutput.model_validate({'assessment': 'Test observation', 'proposals': [{
        'title': 'Test proposal', 'rationale': 'Measured geometry', 'expected_benefit': 'Reduce exposure',
        'risks': 'Movement risk', 'confidence': .7, 'actions': [action]}]})


class Models:
    def __init__(self, fail_role=None):
        self.calls = []
        self.fail_role = fail_role

    async def complete(self, role, prompt, context, output_type):
        self.calls.append((role, context))
        assert 'JSON' in prompt
        if role == self.fail_role:
            raise ModelError('Injected provider failure')
        if role == SystemId.MAIN_JUDGING:
            proposals = context['submitted_proposals']
            return Judgement(summary='Combine compatible actions', risk_analysis=[{
                'proposal_id': proposal['id'], 'decision': 'approve', 'damage_avoidance': 'Reduced exposure',
                'risks': 'Joint motion', 'uncertainties': ['No damage sensor']}
                for proposal in proposals],
                approved_action_ids=[action['id'] for proposal in proposals for action in proposal['actions']],
                combination_rationale='Independent panel, thruster and arm targets can run together')
        return output({SystemId.ENERGY: {'type': 'solar_panel_target', 'panel_id': 'port', 'target_rad': .2},
            SystemId.PROPELLING: {'type': 'follow_navigation', 'duration_s': 2},
            SystemId.ROBOT_ARMS: {'type': 'arm_target', 'arm_id': 'power', 'targets': {'yaw': .1}}}[role])

    async def close(self):
        pass


def coordinator(models=None, now=None):
    return AICoordinator(SCENE, Backend(), SETTINGS, models or Models(), **({'now': now} if now else {}))


def test_combined_proposals_execute_only_after_main_judging_and_only_once():
    async def run():
        manager = coordinator()
        manager.start_cycle()
        assert manager.backend.actions == []
        await manager.active_task
        cycle = manager.status()['latest_cycle']
        assert cycle['status'] == 'dispatched'
        assert [call[0] for call in manager.client.calls][-1] == SystemId.MAIN_JUDGING
        assert len(manager.backend.actions[0]) == 3
        assert {item.type for item in manager.backend.actions[0]} == {'solar_panel_target', 'follow_navigation', 'arm_target'}
        with pytest.raises(PolicyError):
            await manager.execute_cycle(cycle['id'])
        assert len(manager.backend.actions) == 1
        assert 'test-only-secret' not in json.dumps(manager.status())
        await manager.close()
    asyncio.run(run())


def test_role_ports_and_preview_cannot_execute_without_a_cycle_judgement():
    async def run():
        manager = coordinator()
        for role in SystemId:
            result = await manager.analyze_role(role)
            assert result['executed'] is False
        manager.start_cycle(execute=False)
        await manager.active_task
        assert manager.backend.actions == []
        assert manager.status()['latest_cycle']['status'] == 'planned'
        await manager.execute_cycle(manager.latest_id)
        assert len(manager.backend.actions) == 1
        await manager.close()
    asyncio.run(run())


@pytest.mark.parametrize('change', ['epoch', 'run', 'revision', 'time', 'paused', 'offline', 'expired', 'stopped', 'superseded'])
def test_stale_plan_never_reaches_actuators(change):
    async def run():
        clock = [0.]
        manager = coordinator(now=lambda: clock[0])
        manager.start_cycle(execute=False)
        await manager.active_task
        identifier = manager.latest_id
        if change == 'epoch': manager.backend.state['control_epoch'] += 1
        if change == 'run': manager.backend.state['run_id'] = 'another-run'
        if change == 'revision': manager.backend.state['scene_revision'] = 'changed-map'
        if change == 'time': manager.backend.state['sim_time_s'] = 0
        if change == 'paused': manager.backend.state['paused'] = True
        if change == 'offline': manager.backend.state['connection']['ready'] = False
        if change == 'expired': clock[0] = 121
        if change == 'stopped': await manager.stop()
        if change == 'superseded':
            manager.start_cycle(execute=False)
            await manager.active_task
        with pytest.raises((PolicyError, AIUnavailable)):
            await manager.execute_cycle(identifier)
        assert manager.backend.actions == []
        await manager.close()
    asyncio.run(run())


def test_judge_failure_fails_closed_but_failed_subsystem_can_be_omitted():
    async def run():
        for failed_role in (SystemId.MAIN_JUDGING, SystemId.ENERGY):
            manager = coordinator(Models(failed_role))
            manager.start_cycle()
            await manager.active_task
            cycle = manager.status()['latest_cycle']
            if failed_role == SystemId.MAIN_JUDGING:
                assert cycle['status'] == 'failed' and not manager.backend.actions
            else:
                assert cycle['status'] == 'dispatched' and len(manager.backend.actions[0]) == 2
                assert 'energy' in manager.client.calls[-1][1]['subsystem_errors']
            await manager.close()
    asyncio.run(run())


def test_overlapping_cycles_and_late_models_after_stop_cannot_dispatch():
    class Slow(Models):
        async def complete(self, *args):
            await asyncio.sleep(60)
    async def run():
        manager = coordinator(Slow())
        manager.start_cycle()
        with pytest.raises(PolicyError): manager.start_cycle()
        await asyncio.sleep(0)
        await manager.stop()
        assert manager.status()['latest_cycle']['status'] == 'cancelled'
        assert not manager.backend.actions
        await manager.close()
    asyncio.run(run())


def test_invalid_model_authority_and_invented_judge_actions_fail_closed():
    class Invalid(Models):
        async def complete(self, role, prompt, context, output_type):
            if role == SystemId.ENERGY:
                return output({'type': 'follow_navigation', 'duration_s': 1})
            result = await super().complete(role, prompt, context, output_type)
            if role == SystemId.MAIN_JUDGING:
                assert 'energy' in context['subsystem_errors']
                result.approved_action_ids.append('invented-action')
            return result
    async def run():
        manager = coordinator(Invalid())
        manager.start_cycle()
        await manager.active_task
        cycle = manager.status()['latest_cycle']
        assert cycle['status'] == 'failed' and 'energy' in cycle['errors']
        assert not manager.backend.actions
        await manager.close()
    asyncio.run(run())


def test_partial_transport_failure_is_not_replayed():
    async def run():
        manager = coordinator()
        def partly_publish(actions, run_id, epoch):
            manager.backend.actions.append(actions[:1])
            return {'status': 'partial_failure', 'actions': [], 'error': 'Injected transport failure'}
        manager.backend.execute_approved = partly_publish
        manager.start_cycle()
        await manager.active_task
        assert manager.status()['latest_cycle']['status'] == 'partial_failure'
        with pytest.raises(PolicyError): await manager.execute_cycle(manager.latest_id)
        assert len(manager.backend.actions) == 1
        await manager.close()
    asyncio.run(run())


@pytest.mark.parametrize('role,action', [
    ('energy', FollowNavigation(type='follow_navigation', duration_s=1)),
    ('robot_arms', SolarPanelTarget(type='solar_panel_target', panel_id='port', target_rad=.1)),
    ('energy', SolarPanelTarget(type='solar_panel_target', panel_id='missing', target_rad=.1)),
    ('energy', SolarPanelTarget(type='solar_panel_target', panel_id='port', target_rad=2)),
    ('robot_arms', ArmTarget(type='arm_target', arm_id='power', targets={'yaw': 999})),
    ('propelling', ThrusterVelocity(type='thruster_velocity', linear_m_s={'x': 25, 'y': 25, 'z': 0}, duration_s=1)),
])
def test_role_ownership_and_physical_limits(role, action):
    with pytest.raises(PolicyError): validate_action(SCENE, role, action)


def test_nonfinite_values_and_unbounded_grants_are_rejected():
    with pytest.raises(ValidationError):
        SolarPanelTarget(type='solar_panel_target', panel_id='port', target_rad=float('nan'))
    with pytest.raises(ValidationError):
        FollowNavigation(type='follow_navigation', duration_s=11)


@pytest.mark.parametrize('fault', ['unknown', 'duplicate', 'missing_review', 'wrong_decision', 'conflict'])
def test_invalid_judgements_cannot_form_an_executable_plan(fault):
    manager = coordinator()
    proposals = manager.proposals('propelling', output({'type': 'follow_navigation', 'duration_s': 1}))
    if fault == 'conflict':
        proposals += manager.proposals('propelling', output({'type': 'follow_navigation', 'duration_s': 2}))
    judgement = Judgement(summary='Test', combination_rationale='Test',
        approved_action_ids=[p['actions'][0]['id'] for p in proposals],
        risk_analysis=[{'proposal_id': p['id'], 'decision': 'approve', 'damage_avoidance': 'Test', 'risks': 'Test', 'uncertainties': []} for p in proposals])
    if fault == 'unknown': judgement.approved_action_ids = ['invented']
    if fault == 'duplicate': judgement.approved_action_ids *= 2
    if fault == 'missing_review': judgement.risk_analysis = []
    if fault == 'wrong_decision': judgement.risk_analysis[0].decision = 'reject'
    with pytest.raises(PolicyError): select_plan(SCENE, proposals, judgement)
    asyncio.run(manager.close())


def test_partial_proposals_can_combine_with_other_systems():
    manager = coordinator()
    arm = output({'type': 'arm_target', 'arm_id': 'power', 'targets': {'yaw': .1}})
    arm.proposals[0].actions.append(ArmTarget(type='arm_target', arm_id='power', targets={'elbow': .2}))
    proposals = manager.proposals('robot_arms', arm) + manager.proposals('energy', output({'type': 'solar_panel_target', 'panel_id': 'port', 'target_rad': .1}))
    judge = Judgement(summary='Partial combination', combination_rationale='Keep elbow fixed',
        approved_action_ids=[p['actions'][0]['id'] for p in proposals], risk_analysis=[
            {'proposal_id': p['id'], 'decision': decision, 'damage_avoidance': 'Test', 'risks': 'Test', 'uncertainties': []}
            for p, decision in zip(proposals, ['partial', 'approve'])])
    assert len(select_plan(SCENE, proposals, judge)) == 2
    asyncio.run(manager.close())


def test_provider_uses_verified_model_json_mode_and_role_settings():
    async def run():
        settings = load_settings({'DEEPSEEK_API_KEY': 'fallback', 'AI_ENERGY_API_KEY': 'energy-key', 'AI_ENERGY_MODEL': 'deepseek-flash'})
        def handler(request):
            payload = json.loads(request.content)
            assert str(request.url) == 'https://api.deepseek.com/chat/completions'
            assert request.headers['authorization'] == 'Bearer energy-key'
            assert payload['model'] == 'deepseek-flash'
            assert payload['thinking'] == {'type': 'disabled'}
            assert payload['response_format'] == {'type': 'json_object'}
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {
                'content': '{"assessment":"Hold","proposals":[]}', 'reasoning_content': 'PRIVATE'}}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            result = await DeepSeekClient(settings, http).complete('energy', 'Return JSON', {}, SubsystemOutput)
            assert result.proposals == [] and 'PRIVATE' not in result.model_dump_json()
    asyncio.run(run())


@pytest.mark.parametrize('fault', ['blank', 'truncated', 'malformed', 'wrong_schema', 'http', 'timeout'])
def test_provider_failures_are_sanitized_and_never_return_actions(fault):
    async def run():
        def handler(request):
            if fault == 'timeout': raise httpx.ReadTimeout('test-only-secret', request=request)
            if fault == 'http': return httpx.Response(401, text='test-only-secret')
            content = {'blank': ' ', 'truncated': '{', 'malformed': 'not json', 'wrong_schema': '{"execute":"shell"}'}.get(fault)
            return httpx.Response(200, json={'choices': [{'finish_reason': 'length' if fault == 'truncated' else 'stop', 'message': {'content': content}}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            with pytest.raises(ModelError) as error:
                await DeepSeekClient(SETTINGS, http).complete('energy', 'JSON', {}, SubsystemOutput)
            assert 'test-only-secret' not in str(error.value)
    asyncio.run(run())


def test_api_ports_missing_key_and_manual_authority():
    for enabled, expected in [('false', 409), ('true', 503)]:
        with TestClient(create_app(backend=Backend(), ai_settings=load_settings({'AI_ENABLED': enabled}), ai_client=Models())) as client:
            status = client.get('/api/v1/ai/status').json()
            assert len(status['systems']) == 4
            assert all(not role['configured'] for role in status['systems'])
            for role in SystemId:
                description = client.get(f'/api/v1/ai/systems/{role}').json()
                assert description['id'] == role and 'prompt' in description
                assert client.post(f'/api/v1/ai/systems/{role}/invoke', json={}).status_code == expected
            assert client.post('/api/v1/ai/cycles', json={}).status_code == expected
            if enabled == 'true':
                assert client.post('/api/v1/arms/power/target', json={'targets': {'yaw': .1}}).status_code == 403
                assert client.post('/api/v1/solar-panels/port/target', json={'target_rad': .1}).status_code == 403


def test_api_does_not_accept_client_authored_judgement_or_execution():
    backend = Backend()
    with TestClient(create_app(backend=backend, ai_settings=SETTINGS, ai_client=Models())) as client:
        assert client.post('/api/v1/ai/cycles', json={'judgement': {'approved_action_ids': ['anything']}}).status_code == 422
        assert client.post('/api/v1/ai/cycles/missing/execute', json={}).status_code == 404
        assert not backend.actions
