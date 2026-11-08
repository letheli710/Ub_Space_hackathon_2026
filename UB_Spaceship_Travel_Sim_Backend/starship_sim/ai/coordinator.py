"""Observe -> subsystem proposals -> combined judgement -> guarded execution."""

import asyncio
from collections import OrderedDict, deque
from copy import deepcopy
from datetime import datetime, timezone
import time
import uuid

from .contracts import Judgement, LABELS, PolicyError, SUBSYSTEMS, SubsystemOutput, SystemId, select_plan, validate_action
from .prompts import model_prompt, role_description
from .provider import DeepSeekClient, ModelError


class AIUnavailable(RuntimeError):
    pass


class AICoordinator:
    def __init__(self, scene, backend, settings, model_client=None, now=time.monotonic):
        self.scene, self.backend, self.settings = scene, backend, settings
        self.client = model_client or DeepSeekClient(settings)
        self.now = now
        self.cycles = OrderedDict()
        self.events = deque(maxlen=200)
        self.event_sequence = 0
        self.role_calls = {role: {'status': 'not_called'} for role in SystemId}
        self.active_task = None
        self.loop_task = None
        self.loop_running = False
        self.latest_id = None
        self.generation = 0
        if settings.enabled:
            if not hasattr(backend, 'configure_ai_authority') or not hasattr(backend, 'execute_approved'):
                raise AIUnavailable('Backend does not support guarded AI execution')
            backend.configure_ai_authority(True)

    def event(self, kind, text, **details):
        self.event_sequence += 1
        self.events.append({'id': self.event_sequence, 'at': datetime.now(timezone.utc).isoformat(),
                            'kind': kind, 'text': text, **details})

    def require_models(self, role=None):
        if not self.settings.enabled:
            raise PolicyError('AI mode is disabled. Set AI_ENABLED=true in the backend .env and restart.')
        roles = [role] if role else list(SystemId)
        if any(not self.settings.roles[item].api_key for item in roles):
            raise AIUnavailable('DeepSeek API key is not configured. Set DEEPSEEK_API_KEY locally and restart.')

    def observation(self, snapshot):
        poses = {item['child_frame_id']: item for item in snapshot.get('transforms', [])}
        bodies = [{**item, 'pose': poses.get(item['entity_id'], {}).get('position')}
                  for item in self.scene.get('map', {}).get('objects', [])]
        ship = next(item for item in self.scene['entities'] if item['id'] == self.scene['ship_entity_id'])
        return {'observation_id': uuid.uuid4().hex, 'run_id': snapshot.get('run_id'),
                'scene_revision': self.scene['revision'], 'control_epoch': snapshot.get('control_epoch'),
                'sim_time_s': snapshot.get('sim_time_s'), 'paused': snapshot.get('paused'),
                'connection': snapshot.get('connection'), 'ship_pose': poses.get(self.scene['ship_entity_id']),
                'navigation': snapshot.get('navigation'), 'propulsion': snapshot.get('propulsion'),
                'solar_panels': snapshot.get('solar_panels', []), 'arms': snapshot.get('arms', []),
                'ship_status': deepcopy(snapshot.get('ship_status')), 'sensors': deepcopy(snapshot.get('sensors')),
                'physics': deepcopy(snapshot.get('physics')),
                'map_objects': bodies, 'ship_geometry': {'id': ship['id'], 'bounds_body_m': ship.get('bounds_body_m'),
                    'frame': 'ship_body: X forward, Y port/left, Z up', 'modules': self.scene.get('ship_layout', {}).get('modules', [])},
                'unavailable_telemetry': ['electrical_generation_w', 'material_repair_results'],
                'limitations': ['Force-limited main engine and RCS; velocity requests are goals, never instantaneous changes. Coast without approval.',
                    'Joint targets are position requests, not proof of movement or repair.',
                    'Contact fracture uses pre-segmented rigid attachments. No continuous deformation or hypervelocity fragmentation.',
                    'Fuel is consumed with specific impulse; rigid-body mass does not decrease with fuel. Health, power and maintenance remain abstract.',
                    'Nearby-object warnings use approximate visual bounding spheres; they are not proof of contact.']}

    def snapshot(self, execute=False):
        snapshot = self.backend.snapshot()
        if not snapshot.get('connection', {}).get('ready'):
            raise AIUnavailable('Fresh Gazebo telemetry is required')
        if execute and snapshot.get('paused'):
            raise PolicyError('Resume the simulator before requesting an executing AI cycle')
        return snapshot

    def public_cycle(self, cycle):
        return {'id': cycle['id'], 'status': cycle['status'], 'created_at': cycle['created_at'],
                'execute_requested': cycle['execute_requested'], 'observation': deepcopy(cycle['observation']),
                'proposals': [{**{key: value for key, value in proposal.items() if key != 'actions'},
                               'actions': [{'id': action['id'], 'action': action['action'].model_dump()} for action in proposal['actions']]}
                              for proposal in cycle['proposals']],
                'judgement': cycle['judgement'].model_dump() if cycle['judgement'] else None,
                'execution': deepcopy(cycle['execution']), 'errors': dict(cycle['errors']),
                'expires_in_s': max(0., self.settings.max_cycle_age_s - (self.now() - cycle['started']))}

    def status(self):
        return {'enabled': self.settings.enabled, 'loop_running': self.loop_running,
                'active': bool(self.active_task and not self.active_task.done()),
                'provider': 'deepseek', 'base_url': self.settings.base_url,
                'systems': [{'id': role, 'name': LABELS[role], 'model': self.settings.roles[role].model,
                             'configured': bool(self.settings.roles[role].api_key),
                             'last_call': dict(self.role_calls[role])} for role in SystemId],
                'latest_cycle': self.public_cycle(self.cycles[self.latest_id]) if self.latest_id else None,
                'events': list(self.events)}

    async def call_model(self, role, context):
        started = self.now()
        self.role_calls[role] = {'status': 'calling'}
        self.event('model_call', f'{LABELS[role]} is analyzing the observation', system_id=role)
        try:
            output_type = Judgement if role == SystemId.MAIN_JUDGING else SubsystemOutput
            output = await self.client.complete(role, model_prompt(role, self.scene), context, output_type)
            self.role_calls[role] = {'status': 'ok', 'duration_s': round(self.now() - started, 3)}
            return output
        except ModelError as exc:
            self.role_calls[role] = {'status': 'error', 'error': str(exc)}
            raise

    def proposals(self, role, output):
        result = []
        for proposal in output.proposals:
            for action in proposal.actions:
                validate_action(self.scene, role, action)
            payload = proposal.model_dump(exclude={'actions'})
            result.append({'id': 'proposal_' + uuid.uuid4().hex, 'system_id': role, **payload,
                           'actions': [{'id': 'action_' + uuid.uuid4().hex, 'action': action} for action in proposal.actions]})
        return result

    async def analyze_role(self, role):
        """A role's read-only model port; it never grants executable authority."""
        self.require_models(role)
        snapshot = self.snapshot()
        context = {'observation': self.observation(snapshot), 'submitted_proposals': []}
        output = await self.call_model(role, context)
        if role == SystemId.MAIN_JUDGING:
            select_plan(self.scene, [], output)
        else:
            self.proposals(role, output)
        return {'system_id': role, 'analysis_only': True, 'output': output.model_dump(), 'executed': False}

    def start_cycle(self, execute=True):
        self.require_models()
        if self.active_task and not self.active_task.done():
            raise PolicyError('An AI cycle is already running')
        snapshot = self.snapshot(execute)
        if not snapshot.get('run_id') or snapshot.get('control_epoch') is None:
            raise AIUnavailable('Backend needs run and control-epoch identifiers for AI authority')
        identifier = 'cycle_' + uuid.uuid4().hex
        cycle = {'id': identifier, 'created_at': datetime.now(timezone.utc).isoformat(),
                 'started': self.now(), 'generation': self.generation, 'initial': snapshot,
                 'observation': self.observation(snapshot), 'execute_requested': execute,
                 'status': 'collecting', 'proposals': [], 'judgement': None, 'execution': None,
                 'errors': {}, 'consumed': False}
        self.cycles[identifier] = cycle
        self.latest_id = identifier
        while len(self.cycles) > 50:
            self.cycles.popitem(last=False)
        self.event('cycle_started', 'Subsystems are preparing proposals', cycle_id=identifier)
        self.active_task = asyncio.create_task(self.run_cycle(cycle))
        return self.public_cycle(cycle)

    def check_fresh(self, cycle, execute=False):
        if cycle['generation'] != self.generation or cycle['id'] != self.latest_id:
            raise PolicyError('This cycle has been stopped or superseded')
        if self.now() - cycle['started'] > self.settings.max_cycle_age_s:
            raise PolicyError('AI proposals expired; request a fresh cycle')
        current = self.snapshot(execute)
        initial = cycle['initial']
        if current.get('run_id') != initial.get('run_id') or current.get('scene_revision') != self.scene['revision'] or current.get('control_epoch') != initial.get('control_epoch'):
            raise PolicyError('Simulator or operator controls changed; request a fresh judgement')
        if current.get('sim_time_s', -1) < initial.get('sim_time_s', 0):
            raise PolicyError('Simulation clock restarted; request a fresh cycle')
        return current

    async def run_cycle(self, cycle):
        try:
            async def collect(role):
                try:
                    output = await self.call_model(role, {'cycle_id': cycle['id'], 'observation': cycle['observation']})
                    proposals = self.proposals(role, output)
                    cycle['proposals'].extend(proposals)
                    self.event('proposals', f'{LABELS[role]} submitted {len(proposals)} proposals', cycle_id=cycle['id'], system_id=role)
                except (ModelError, PolicyError) as exc:
                    cycle['errors'][role] = str(exc)
                    self.role_calls[role] = {'status': 'error', 'error': str(exc)}
            await asyncio.gather(*(collect(role) for role in SUBSYSTEMS))
            current = self.check_fresh(cycle)
            cycle['status'] = 'judging'
            # Main Judging sees refreshed measurements and each subsystem's failures.
            context = {'cycle_id': cycle['id'], 'observation': self.observation(current),
                       'submitted_proposals': self.public_cycle(cycle)['proposals'], 'subsystem_errors': dict(cycle['errors'])}
            cycle['judgement'] = await self.call_model(SystemId.MAIN_JUDGING, context)
            select_plan(self.scene, cycle['proposals'], cycle['judgement'])
            self.check_fresh(cycle)
            cycle['status'] = 'planned'
            self.event('judgement', cycle['judgement'].summary, cycle_id=cycle['id'],
                       approved_actions=len(cycle['judgement'].approved_action_ids),
                       combination_rationale=cycle['judgement'].combination_rationale)
            if cycle['execute_requested']:
                await self.execute_cycle(cycle['id'])
        except asyncio.CancelledError:
            cycle['status'] = 'cancelled'
            self.event('cancelled', 'AI cycle cancelled; no further actions will be dispatched', cycle_id=cycle['id'])
            raise
        except (ModelError, PolicyError, AIUnavailable, RuntimeError) as exc:
            cycle['status'] = 'failed'
            cycle['errors']['coordinator'] = str(exc)
            self.event('failed', str(exc), cycle_id=cycle['id'])
        except Exception:
            cycle['status'] = 'failed'
            cycle['errors']['coordinator'] = 'Unexpected AI coordination error; no automatic retry'
            self.event('failed', cycle['errors']['coordinator'], cycle_id=cycle['id'])

    async def execute_cycle(self, identifier):
        self.require_models()
        cycle = self.cycles.get(identifier)
        if not cycle:
            raise KeyError(identifier)
        if cycle['status'] != 'planned' or cycle['consumed'] or not cycle['judgement']:
            raise PolicyError('Only a fresh, unexecuted Main Judging plan can be dispatched')
        self.check_fresh(cycle, execute=True)
        actions = select_plan(self.scene, cycle['proposals'], cycle['judgement'])
        cycle['consumed'] = True  # Never automatically replay a partly published batch.
        if not actions:
            cycle['status'] = 'held'
            cycle['execution'] = {'status': 'held', 'actions': [], 'note': 'Main Judging approved no actions.'}
        else:
            cycle['status'] = 'executing'
            try:
                # This synchronous bounded publication completes before cancellation
                # can schedule another cycle; the ROS adapter locks and rechecks epoch.
                cycle['execution'] = self.backend.execute_approved(actions, cycle['initial']['run_id'], cycle['initial']['control_epoch'])
                cycle['status'] = cycle['execution']['status']
            except Exception:
                cycle['status'] = 'failed'
                cycle['execution'] = {'status': 'failed', 'error': 'Actuator batch rejected or transport failed; inspect measured state before retrying.'}
                raise
        self.event('execution', cycle['status'], cycle_id=identifier)
        return self.public_cycle(cycle)

    async def set_running(self, running):
        if not running:
            await self.stop()
            return self.status()
        self.require_models()
        self.snapshot(execute=True)
        if not self.loop_running:
            self.loop_running = True
            self.loop_task = asyncio.create_task(self.run_loop())
            self.event('loop_started', 'AI observation/proposal/judgement loop started')
        return self.status()

    async def run_loop(self):
        try:
            while self.loop_running:
                try:
                    if not self.active_task or self.active_task.done():
                        self.start_cycle(execute=True)
                    await self.active_task
                except (AIUnavailable, PolicyError):
                    pass  # No paid model calls while telemetry is stale or paused.
                await asyncio.sleep(self.settings.loop_interval_s)
        except asyncio.CancelledError:
            pass

    async def stop(self):
        self.loop_running = False
        self.generation += 1
        for task in (self.loop_task, self.active_task):
            if task and not task.done():
                task.cancel()
        await asyncio.gather(*(task for task in (self.loop_task, self.active_task) if task), return_exceptions=True)
        if self.settings.enabled and hasattr(self.backend, 'cancel_ai_commands'):
            self.backend.cancel_ai_commands()
        self.event('loop_stopped', 'AI stopped; propulsion and maintenance revoked. Existing joint targets may remain active.')

    async def close(self):
        await self.stop()
        await self.client.close()
