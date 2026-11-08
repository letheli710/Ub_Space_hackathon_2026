"""Isolated real-Gazebo authority check with injected model fixtures; no API calls.

Run in a disposable container with a separate ROS domain and Gazebo partition.
Do not attach this test's command publishers to an existing simulation.
"""

import asyncio
import json
import math
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from starship_sim.ai.contracts import Judgement, SubsystemOutput, SystemId
from starship_sim.ai.coordinator import AICoordinator
from starship_sim.ai.settings import load_settings
from starship_sim.ros_backend import RosBackend


class FixtureModels:
    """Explicit dependency injection used only by this physical smoke test."""
    def __init__(self, scene):
        self.scene = scene

    async def complete(self, role, prompt, context, output_type):
        assert len(context['observation']['ship_status']['metrics']) == 5
        assert context['observation']['sensors']['ready']
        if role == SystemId.MAIN_JUDGING:
            proposals = context['submitted_proposals']
            return Judgement(summary='Smoke-test combination', combination_rationale='Independent actuators',
                risk_analysis=[{'proposal_id': p['id'], 'decision': 'approve', 'damage_avoidance': 'Test only',
                                'risks': 'Test movement', 'uncertainties': []} for p in proposals],
                approved_action_ids=[a['id'] for p in proposals for a in p['actions']])
        panel = self.scene['solar_panels'][0]
        arm = next(arm for arm in self.scene['arms'] if 'hull' in arm.get('maintenance', {}).get('components', []))
        alias = next(iter(arm['joints']))
        action = {SystemId.ENERGY: {'type': 'solar_panel_target', 'panel_id': panel['id'], 'target_rad': .25},
                  SystemId.PROPELLING: {'type': 'follow_navigation', 'duration_s': 1.5},
                  SystemId.ROBOT_ARMS: {'type': 'arm_service', 'arm_id': arm['id'], 'component': 'hull', 'duration_s': 10}}[role]
        return SubsystemOutput.model_validate({'assessment': 'Physical smoke test', 'proposals': [{
            'title': 'Physical movement', 'rationale': 'Test fixture', 'expected_benefit': 'Validate dispatch',
            'risks': 'Test fixture movement', 'confidence': 1, 'actions': [action]}]})

    async def close(self):
        pass


async def eventually(predicate, timeout=60):
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        result = predicate()
        if result:
            return result
        await asyncio.sleep(.1)
    raise AssertionError('Timed out waiting for measured state')


async def main():
    scene = json.loads(Path('config/scene.json').read_text())
    Path('.runtime').mkdir(exist_ok=True)
    children, logs = [], []
    backend = manager = None
    try:
        for name, command in [('gazebo', ['gz', 'sim', '-s', '-r', 'worlds/environment.sdf']),
            ('bridge', ['ros2', 'run', 'ros_gz_bridge', 'parameter_bridge',
             f'/world/{scene["world"]}/control@ros_gz_interfaces/srv/ControlWorld',
             '--ros-args', '-p', 'config_file:=/workspace/config/bridge.yaml'])]:
            log = open(f'.runtime/ai-smoke-{name}.log', 'w')
            logs.append(log)
            children.append(subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT))
        backend = RosBackend(scene, ai_managed=True)
        manager = AICoordinator(scene, backend,
            load_settings({'AI_ENABLED': 'true', 'DEEPSEEK_API_KEY': 'injected-fixtures-only'}), FixtureModels(scene))
        await eventually(lambda: backend.health()['ready'])
        await asyncio.sleep(.5)  # ROS command discovery after measured telemetry
        def position():
            return next(t['position'] for t in backend.snapshot()['transforms'] if t['child_frame_id'] == scene['ship_entity_id'])
        def distance(a, b):
            return math.dist([a[axis] for axis in 'xyz'], [b[axis] for axis in 'xyz'])
        initial = position()
        await asyncio.sleep(.5)
        assert distance(initial, position()) < .05
        assert backend.snapshot()['propulsion']['control_mode'] == 'ai_hold'
        for call in [lambda: backend.command_arm(scene['arms'][0]['id'], {'yaw': .1}),
                     lambda: backend.command_solar_panel(scene['solar_panels'][0]['id'], .1)]:
            try: call()
            except PermissionError: pass
            else: raise AssertionError('Direct actuator command bypassed Main Judging')
        print('PASS: real AI mode holds propulsion and blocks direct subsystem/manual actuation', flush=True)
        assert backend.snapshot()['sensors']['objects'], 'No nearby objects detected in the real scene'
        backend.inject_disaster('Asteroid Collision', 50)
        damaged_hull = backend.snapshot()['ship_status']['metrics']['hull_integrity_pct']
        assert damaged_hull < 100
        manager.start_cycle(execute=False)
        await manager.active_task
        assert manager.status()['latest_cycle']['status'] == 'planned'
        assert backend.targets == {} and backend.solar_targets == {}
        assert distance(initial, position()) < .05
        print('PASS: subsystem proposals and combined judgement publish no actions during preview', flush=True)
        result = await manager.execute_cycle(manager.latest_id)
        assert result['status'] == 'dispatched' and len(result['execution']['actions']) == 3
        await eventually(lambda: distance(initial, position()) > .2, timeout=5)
        await eventually(lambda: backend.snapshot()['propulsion']['control_mode'] == 'ai_hold', timeout=5)
        await eventually(lambda: abs(backend.snapshot()['solar_panels'][0]['measured_rad'] - .25) < .04, timeout=15)
        await eventually(lambda: backend.snapshot()['ship_status']['metrics']['hull_integrity_pct'] > damaged_hull + 1, timeout=15)
        arm = next(arm for arm in scene['arms'] if 'hull' in arm.get('maintenance', {}).get('components', []))
        measured = next(item for item in backend.snapshot()['arms'] if item['id'] == arm['id'])['measured_rad']
        assert all(abs(measured[key] - value) < arm['maintenance']['tolerance_rad'] for key, value in arm['maintenance']['targets_rad'].items())
        held = position()
        await asyncio.sleep(.5)
        assert distance(held, position()) < .05
        print('PASS: combined approved actions move the ship, panel and service arm; propulsion expires to hold', flush=True)
        print('PASS: AI receives five shared health metrics and nearby objects; physical arm pose gates modeled hull recovery', flush=True)
    finally:
        if manager:
            await manager.close()
        if backend:
            backend.close()
        for child in children:
            child.terminate()
        for child in children:
            try: child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        for log in logs:
            log.close()


if __name__ == '__main__':
    asyncio.run(main())
