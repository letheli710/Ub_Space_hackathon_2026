"""Role prompts plus the current scene's capabilities and output contract."""

import hashlib
import json
from pathlib import Path

from .contracts import Judgement, LABELS, SubsystemOutput, SystemId

ROOT = Path(__file__).with_name('prompts')


def prompt_text(role):
    return (ROOT / 'common.md').read_text(encoding='utf-8') + '\n\n' + (ROOT / f'{role}.md').read_text(encoding='utf-8')


def role_description(role, scene):
    role = SystemId(role)
    output = Judgement if role == SystemId.MAIN_JUDGING else SubsystemOutput
    capabilities = {
        SystemId.MAIN_JUDGING: {'approval_only': True, 'can_combine_subsystem_actions': True},
        SystemId.ENERGY: {'allowed_actions': ['solar_panel_target'], 'solar_panels': scene.get('solar_panels', [])},
        SystemId.PROPELLING: {'allowed_actions': ['thruster_velocity', 'follow_navigation'],
            'max_speed_m_s': scene['cruise_speed_m_s'], 'max_duration_s': 10, 'frame': 'ship_body'},
        SystemId.ROBOT_ARMS: {'allowed_actions': ['arm_target'], 'frame': 'ship_body: X forward, Y port/left, Z up',
                             'arms': scene['arms'], 'modules': scene.get('ship_layout', {}).get('modules', [])},
    }[role]
    if role == SystemId.ROBOT_ARMS:
        capabilities['allowed_actions'].append('arm_service')
    if role == SystemId.PROPELLING and scene.get('physics'):
        capabilities['allowed_actions'].append('thruster_burn')
        capabilities['physics'] = {key: scene['physics'][key] for key in ('main_thrust_n', 'rcs_thrust_n', 'rcs_torque_nm', 'fuel_kg', 'main_isp_s', 'rcs_isp_s')}
        capabilities['velocity_semantics'] = 'Body-frame velocity goal converted once to a world vector at approval. Finite acceleration, automatic attitude alignment. 25 m/s nominal goal; actual speed can exceed it after impacts/burns.'
    example = {'assessment': 'No justified actuator change with the supplied evidence.', 'proposals': []}
    if role == SystemId.MAIN_JUDGING:
        example = {'summary': 'No supported beneficial action is available.', 'risk_analysis': [],
                   'approved_action_ids': [], 'combination_rationale': 'Hold; obtain a fresh observation.'}
    text = prompt_text(role)
    return {'id': role, 'name': LABELS[role], 'prompt': text,
            'prompt_revision': hashlib.sha256(text.encode()).hexdigest()[:16],
            'capabilities': capabilities, 'output_schema': output.model_json_schema(), 'example_json': example}


def model_prompt(role, scene):
    description = role_description(role, scene)
    return description['prompt'] + '\n\nCURRENT CAPABILITIES:\n' + json.dumps(description['capabilities']) + \
        '\n\nREQUIRED JSON SCHEMA:\n' + json.dumps(description['output_schema']) + \
        '\n\nEXAMPLE JSON (empty safe plan; use the actual supplied proposal IDs when reviewing proposals):\n' + json.dumps(description['example_json'])
