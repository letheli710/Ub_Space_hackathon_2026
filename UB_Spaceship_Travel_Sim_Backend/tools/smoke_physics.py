"""Native integration test, run with an isolated ROS domain/Gazebo partition.

No provider calls. Exercises the same approved-action adapter as Main Judging.
"""
import asyncio
import json
import math
import os
import signal
import time
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from starship_sim.ros_backend import RosBackend
from starship_sim.ai.contracts import ThrusterVelocity, ThrusterBurn
from std_msgs.msg import String
from smoke_ai import eventually


async def main():
    scene = json.loads(Path('config/scene.json').read_text())
    children, logs = [], []
    backend = None
    Path('.runtime').mkdir(exist_ok=True)
    try:
        for name, command in [('gazebo', ['gz', 'sim', '-s', '-r', 'worlds/environment.sdf']),
            ('bridge', ['ros2', 'run', 'ros_gz_bridge', 'parameter_bridge',
             '--ros-args', '-p', 'config_file:=/workspace/config/bridge.yaml'])]:
            log = open(f'.runtime/physics-smoke-{name}.log', 'w'); logs.append(log)
            children.append(subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True))
        backend = RosBackend(scene, ai_managed=True)
        await eventually(lambda: backend.health()['ready'], timeout=60)
        async def advance(seconds):
            start = backend.sim_time
            await eventually(lambda: backend.sim_time > start+seconds, timeout=max(60, seconds*12))
        await advance(5)
        state = backend.snapshot()
        assert not state['physics']['detached_links'], state['physics']
        assert math.hypot(*state['physics']['velocity_world_m_s']) < .1
        print('PASS: native physics ready, all bonds intact and zero-force ship at rest', flush=True)
        weak = backend.inject_impact(dict(target_id='command', mass_kg=1, speed_m_s=5, radius_m=.3))
        # Duplicate transport delivery must not create intersecting duplicate rocks.
        backend.impacts.publish(String(data=json.dumps({k:v for k,v in weak.items() if k not in ('status','note')})))
        await advance(3)
        assert len(backend.physics['projectiles']) == 1
        assert not backend.physics['detached_links']
        assert any(0 < b['peak_utilization'] < 1 for b in backend.physics['bonds'])
        print('PASS: below-strength contact survives; duplicate launch delivery creates only one rock', flush=True)
        fuel = state['physics']['fuel_kg']
        started, wall_start, renewed, reported = backend.sim_time, time.monotonic(), 0., backend.sim_time
        while '--impact-only' not in sys.argv and backend.snapshot()['ship_status']['speed_m_s'] < 24.5:
            assert time.monotonic()-wall_start < 240, 'Cruise goal did not converge'
            command = ThrusterVelocity(type='thruster_velocity', linear_m_s={'x': 25, 'y': 0, 'z': 0}, duration_s=10)
            if time.monotonic()-renewed > 2:
                result = backend.execute_approved([command], backend.run_id, backend.control_epoch)
                assert result['status'] == 'dispatched', result
                renewed = time.monotonic()
            await asyncio.sleep(.2)
            if backend.sim_time < started+1: assert backend.snapshot()['ship_status']['speed_m_s'] < 4
            if backend.sim_time > reported+5:
                print('THRUST', backend.sim_time, backend.snapshot()['ship_status']['speed_m_s'], backend.physics['mode'], flush=True)
                reported = backend.sim_time
        state = backend.snapshot()
        if '--impact-only' not in sys.argv:
            assert 23 < state['ship_status']['speed_m_s'] < 26, state['physics']
            assert state['physics']['fuel_kg'] < fuel
        backend.cancel_ai_commands()
        await advance(1)
        velocity = backend.physics['velocity_world_m_s'][:]
        position = backend.transforms[backend.ship_id]['position'].copy()
        await advance(4)
        assert math.dist(velocity, backend.physics['velocity_world_m_s']) < .15
        assert math.hypot(*backend.physics['force_world_n']) < .01
        if '--impact-only' not in sys.argv: assert math.dist(list(position.values()), list(backend.transforms[backend.ship_id]['position'].values())) > 80
        if '--impact-only' not in sys.argv:
            print('PASS: finite acceleration to 25 m/s, fuel use, expired authority coasts without erasing momentum', flush=True)
            initial_rotation = backend.physics['angular_velocity_world_rad_s'][:]
            burn = ThrusterBurn(type='thruster_burn', linear_throttle=dict(x=0,y=0,z=0), angular_throttle=dict(x=0,y=0,z=.3), duration_s=1)
            backend.execute_approved([burn], backend.run_id, backend.control_epoch)
            await advance(1.4)
            assert math.dist(initial_rotation, backend.physics['angular_velocity_world_rad_s']) > .001
            assert math.dist(velocity, backend.physics['velocity_world_m_s']) < .3
            print('PASS: approved RCS torque changes rotation without instantly redirecting translational velocity', flush=True)
        target = 'command'
        result = backend.inject_impact(dict(target_id=target, mass_kg=1000, speed_m_s=80, radius_m=.7))
        await eventually(lambda: len(backend.physics.get('projectiles', [])) == 2, timeout=10)
        momentum = backend.physics['total_system_momentum_kg_m_s'][:]
        assert any(o['kind'] == 'space_rock' for o in backend.snapshot()['sensors']['objects'])
        await eventually(lambda: backend.physics.get('detached_links'), timeout=60)
        await advance(3)
        state = backend.snapshot()
        Path('.runtime/physics-smoke-result.json').write_text(json.dumps(state, indent=2))
        assert 'module_command' in state['physics']['detached_links'], state['physics']
        assert math.dist(velocity, state['physics']['velocity_world_m_s']) > .01
        assert math.hypot(*state['physics']['angular_velocity_world_rad_s']) > .0001
        assert math.dist(momentum, state['physics']['total_system_momentum_kg_m_s']) / math.hypot(*momentum) < .02, (momentum, state['physics']['total_system_momentum_kg_m_s'])
        from starship_sim.ai.contracts import ArmTarget
        try: backend.execute_approved([ArmTarget(type='arm_target', arm_id='command', targets={'yaw':.1})], backend.run_id, backend.control_epoch)
        except RuntimeError as exc: assert 'detached' in str(exc)
        else: raise AssertionError('Detached arm accepted a command')
        module = next(t for t in state['transforms'] if t['child_frame_id'] == 'starship::module_command')
        assert math.dist(list(module['position'].values()), [13,0,0]) > 1, module
        print('PASS: real rock contact fractures command module, changes velocity/rotation, and disables detached arm', flush=True)
        print(json.dumps({k: state['physics'][k] for k in ['velocity_world_m_s','angular_velocity_world_rad_s','detached_links']}), flush=True)
    finally:
        if backend: Path('.runtime/physics-smoke-last.json').write_text(json.dumps(backend.snapshot(), indent=2))
        if backend: backend.close()
        for child in children:
            if child.poll() is None: os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try: child.wait(timeout=10)
            except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); child.wait()
        for log in logs: log.close()

if __name__ == '__main__': asyncio.run(main())
