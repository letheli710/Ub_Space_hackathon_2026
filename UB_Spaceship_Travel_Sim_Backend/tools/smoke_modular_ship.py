"""Isolated Gazebo check: ten approved arms, twenty fingers and two rail mounts.

Uses injected model fixtures, never a paid provider. Run in a disposable container
with its own ROS_DOMAIN_ID and GZ_PARTITION, like smoke_ai.py.
"""
import asyncio
import json
import math
import os
import signal
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from starship_sim.actuators import joint_names, physical_target
from starship_sim.ai.contracts import Judgement, PolicyError, SubsystemOutput, SystemId
from starship_sim.ai.coordinator import AICoordinator
from starship_sim.ai.settings import load_settings
from starship_sim.ros_backend import RosBackend
from smoke_ai import eventually

TARGETS = dict(yaw=.25, shoulder=.35, elbow=-.9, wrist=-.3, grip=.9, slide=.2)


class Models:
    def __init__(self, scene): self.scene = scene

    async def complete(self, role, prompt, context, output_type):
        arms = context['observation']['arms']
        assert len(arms) == 10 and all(a['location']['pose_source'] == 'gazebo' for a in arms)
        assert all(a['location']['base_pose_body'] and a['location']['tool_pose_world'] for a in arms)
        if role == SystemId.MAIN_JUDGING:
            proposals = context['submitted_proposals']
            return Judgement(summary='Approve isolated ten-arm test', combination_rationale='Bounded independent joints',
                risk_analysis=[{'proposal_id': p['id'], 'decision': 'approve', 'damage_avoidance': 'Test only',
                                'risks': 'Joint motion', 'uncertainties': []} for p in proposals],
                approved_action_ids=[a['id'] for p in proposals for a in p['actions']])
        if role == SystemId.ROBOT_ARMS:
            actions = [{'type': 'arm_target', 'arm_id': a['id'], 'targets': {k: TARGETS[k] for k in a['joints']}}
                       for a in self.scene['arms']]
        elif role == SystemId.ENERGY:
            actions = [{'type': 'solar_panel_target', 'panel_id': p['id'], 'target_rad': .3} for p in self.scene['solar_panels']]
        else: actions = [{'type': 'follow_navigation', 'duration_s': 1.5}]
        return SubsystemOutput.model_validate({'assessment': 'Measured ten-arm catalog available', 'proposals': [
            {'title': 'Physical fixture movement', 'rationale': 'Validate all channels', 'expected_benefit': 'Test evidence',
             'risks': 'Isolated test only', 'confidence': 1, 'actions': actions[start:start+8]}
            for start in range(0, len(actions), 8)]})

    async def close(self): pass


def distance(a, b): return math.dist([a[k] for k in 'xyz'], [b[k] for k in 'xyz'])


async def main():
    scene = json.loads(Path('config/scene.json').read_text())
    children, logs = [], []
    backend = manager = None
    Path('.runtime').mkdir(exist_ok=True)
    try:
        for name, command in [('gazebo', ['gz', 'sim', '-s', '-r', 'worlds/environment.sdf']),
            ('bridge', ['ros2', 'run', 'ros_gz_bridge', 'parameter_bridge',
             f'/world/{scene["world"]}/control@ros_gz_interfaces/srv/ControlWorld',
             '--ros-args', '-p', 'config_file:=/workspace/config/bridge.yaml'])]:
            log = open(f'.runtime/modular-smoke-{name}.log', 'w'); logs.append(log)
            children.append(subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
        backend = RosBackend(scene, ai_managed=True)
        manager = AICoordinator(scene, backend, load_settings({'AI_ENABLED': 'true', 'DEEPSEEK_API_KEY': 'fixture-only'}), Models(scene))
        await eventually(lambda: backend.health()['ready'])
        started = backend.snapshot()['sim_time_s']
        await eventually(lambda: backend.snapshot()['sim_time_s'] > started + 20, timeout=240)
        initial = backend.snapshot()
        for arm in scene['arms']:
            measured = next(a for a in initial['arms'] if a['id'] == arm['id'])
            assert all(abs(measured['measured'][k] - joint['initial_value']) < .025 for k, joint in arm['joints'].items()), measured
            assert all(abs(value) < .004 for value in measured['physical_joints'].values()), measured
        print('PASS: all ten arms and twenty fingers hold their home pose for 20 simulation seconds', flush=True)
        initial_arms = {a['id']: a for a in initial['arms']}
        for arm in scene['arms']:
            try: backend.command_arm(arm['id'], {'yaw': .1})
            except PermissionError: pass
            else: raise AssertionError('Manual command bypassed the judge')
        manager.start_cycle(execute=False); await manager.active_task
        assert manager.status()['latest_cycle']['status'] == 'planned', manager.status()['latest_cycle']
        assert not backend.targets and not backend.solar_targets
        print('PASS: AI sees all ten measured arm locations; preview publishes nothing; direct arm control blocked', flush=True)
        result = await manager.execute_cycle(manager.latest_id)
        assert result['status'] == 'dispatched' and len(result['execution']['actions']) == 13, result
        def reached():
            state = backend.snapshot()
            return state if all(abs(a['measured'][k] - TARGETS[k]) < (.025 if k == 'grip' else .04)
                                for a in state['arms'] for k in a['measured']) else None
        final = await eventually(reached, timeout=60)
        for arm in scene['arms']:
            measured = next(a for a in final['arms'] if a['id'] == arm['id'])
            grip = arm['joints']['grip']
            assert all(abs(measured['physical_joints'][name] - physical_target(grip, TARGETS['grip'])) < .004 for name in joint_names(grip))
            assert distance(initial_arms[arm['id']]['location']['tool_pose_body']['position'], measured['location']['tool_pose_body']['position']) > .05
            if 'slide' in arm['joints']:
                assert distance(initial_arms[arm['id']]['location']['base_pose_body']['position'], measured['location']['base_pose_body']['position']) > 1
            print(f"PASS: {arm['id']} all joints measured at approved targets; both fingers moved", flush=True)
        await eventually(lambda: all(abs(p['measured_rad'] - .3) < .04 for p in backend.snapshot()['solar_panels']), timeout=30)
        final = backend.snapshot()
        for arm_id in ('solarLeft', 'solarRight'):
            arm = next(a for a in final['arms'] if a['id'] == arm_id)
            assert distance(initial_arms[arm_id]['location']['base_pose_body']['position'], arm['location']['base_pose_body']['position']) > .04
        assert final['propulsion']['control_mode'] == 'ai_coast'
        settled = final['sim_time_s']
        await eventually(lambda: backend.snapshot()['sim_time_s'] > settled + 5, timeout=60)
        assert reached(), 'An arm drifted away from its approved target'
        try: await manager.execute_cycle(manager.latest_id)
        except PolicyError: pass
        else: raise AssertionError('Approved cycle executed twice')
        print('PASS: rail and solar mounts report changed positions; propulsion expires; approval cannot replay', flush=True)
    finally:
        if manager: await manager.close()
        if backend: backend.close()
        for child in children:
            if child.poll() is None: os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try: child.wait(timeout=8)
            except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); child.wait()
        for log in logs: log.close()


if __name__ == '__main__': asyncio.run(main())
