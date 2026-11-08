"""Validated model output and the deterministic ownership/combination policy."""

import math
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat


class SystemId(StrEnum):
    MAIN_JUDGING = 'main_judging'
    ENERGY = 'energy'
    PROPELLING = 'propelling'
    ROBOT_ARMS = 'robot_arms'


SUBSYSTEMS = (SystemId.ENERGY, SystemId.PROPELLING, SystemId.ROBOT_ARMS)
LABELS = {'main_judging': 'Main Judging', 'energy': 'Energy', 'propelling': 'Propelling', 'robot_arms': 'Robot Arms'}


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_max_length=2000)


class Vector(Contract):
    x: FiniteFloat
    y: FiniteFloat
    z: FiniteFloat


class ThrusterVelocity(Contract):
    type: Literal['thruster_velocity']
    linear_m_s: Vector
    duration_s: FiniteFloat = Field(gt=0, le=10)


class FollowNavigation(Contract):
    type: Literal['follow_navigation']
    duration_s: FiniteFloat = Field(gt=0, le=10)


class SolarPanelTarget(Contract):
    type: Literal['solar_panel_target']
    panel_id: str = Field(min_length=1, max_length=100)
    target_rad: FiniteFloat


class ArmTarget(Contract):
    type: Literal['arm_target']
    arm_id: str = Field(min_length=1, max_length=100)
    targets: dict[str, FiniteFloat] = Field(min_length=1, max_length=20)


class ArmService(Contract):
    type: Literal['arm_service']
    arm_id: str = Field(min_length=1, max_length=100)
    component: Literal['hull', 'solar_panels', 'life_support', 'thrusters', 'electronics', 'robot_arms']
    duration_s: FiniteFloat = Field(gt=0, le=10)


Action = Annotated[ThrusterVelocity | FollowNavigation | SolarPanelTarget | ArmTarget | ArmService, Field(discriminator='type')]
OWNERS = {'thruster_velocity': SystemId.PROPELLING, 'follow_navigation': SystemId.PROPELLING,
          'solar_panel_target': SystemId.ENERGY, 'arm_target': SystemId.ROBOT_ARMS, 'arm_service': SystemId.ROBOT_ARMS}


class Proposal(Contract):
    title: str = Field(min_length=1, max_length=150)
    rationale: str = Field(min_length=1)
    expected_benefit: str = Field(min_length=1)
    risks: str = Field(min_length=1)
    confidence: FiniteFloat = Field(ge=0, le=1)
    actions: list[Action] = Field(min_length=1, max_length=8)


class SubsystemOutput(Contract):
    assessment: str = Field(min_length=1)
    proposals: list[Proposal] = Field(max_length=3)


class RiskReview(Contract):
    proposal_id: str = Field(min_length=1, max_length=100)
    decision: Literal['approve', 'partial', 'reject']
    damage_avoidance: str = Field(min_length=1)
    risks: str = Field(min_length=1)
    uncertainties: list[str] = Field(max_length=12)


class Judgement(Contract):
    summary: str = Field(min_length=1)
    risk_analysis: list[RiskReview] = Field(max_length=9)
    approved_action_ids: list[str] = Field(max_length=24)
    combination_rationale: str = Field(min_length=1)


class PolicyError(ValueError):
    pass


def validate_action(scene, system, action):
    if OWNERS[action.type] != system:
        raise PolicyError(f'{system} cannot propose {action.type}')
    if isinstance(action, ThrusterVelocity):
        speed = math.sqrt(sum(value * value for value in action.linear_m_s.model_dump().values()))
        if speed > scene['cruise_speed_m_s'] + 1e-9:
            raise PolicyError('Thruster velocity exceeds the configured ship speed limit')
    elif isinstance(action, SolarPanelTarget):
        panel = next((panel for panel in scene.get('solar_panels', []) if panel['id'] == action.panel_id), None)
        if not panel or not panel['lower_rad'] <= action.target_rad <= panel['upper_rad']:
            raise PolicyError('Unknown solar panel or target outside its limits')
    elif isinstance(action, (ArmTarget, ArmService)):
        arm = next((arm for arm in scene['arms'] if arm['id'] == action.arm_id), None)
        if not arm:
            raise PolicyError('Unknown robotic arm')
        if isinstance(action, ArmService):
            if action.component not in arm.get('maintenance', {}).get('components', []):
                raise PolicyError('This arm has no configured maintenance capability for that component')
            return
        for name, target in action.targets.items():
            bounds = arm['joints'].get(name)
            if not bounds or not bounds['lower_rad'] <= target <= bounds['upper_rad']:
                raise PolicyError('Unknown arm joint or target outside its limits')


def resources(action, scene=None):
    if isinstance(action, ArmService):
        arm = next(item for item in scene['arms'] if item['id'] == action.arm_id)
        return {f'arm:{action.arm_id}:{name}' for name in arm['joints']} | {f'maintenance:{action.arm_id}'}
    if isinstance(action, ArmTarget):
        return {f'arm:{action.arm_id}:{name}' for name in action.targets}
    if isinstance(action, SolarPanelTarget):
        return {f'solar_panel:{action.panel_id}'}
    return {'thrusters'}


def select_plan(scene, proposals, judgement):
    """Judge may combine submitted actions, but cannot invent or rewrite one."""
    if len(set(judgement.approved_action_ids)) != len(judgement.approved_action_ids):
        raise PolicyError('An approved action may only occur once')
    reviews = {item.proposal_id: item for item in judgement.risk_analysis}
    if len(reviews) != len(judgement.risk_analysis) or set(reviews) != {item['id'] for item in proposals}:
        raise PolicyError('Main Judging must assess every submitted proposal exactly once')
    actions = {action['id']: (proposal, action['action']) for proposal in proposals for action in proposal['actions']}
    selected, used = [], set()
    for identifier in judgement.approved_action_ids:
        if identifier not in actions:
            raise PolicyError('Main Judging referenced an unknown action')
        proposal, action = actions[identifier]
        validate_action(scene, proposal['system_id'], action)
        if used & resources(action, scene):
            raise PolicyError('Combined proposals contain conflicting actuator commands')
        used |= resources(action, scene)
        selected.append(action)
    approved_ids = set(judgement.approved_action_ids)
    for proposal in proposals:
        count = sum(action['id'] in approved_ids for action in proposal['actions'])
        expected = 'reject' if not count else 'approve' if count == len(proposal['actions']) else 'partial'
        if reviews[proposal['id']].decision != expected:
            raise PolicyError('Risk assessment and selected actions disagree')
    return selected
