from copy import deepcopy
import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from starship_sim.physics import ImpactCommand
from starship_sim.ai.contracts import ThrusterBurn, PolicyError, SystemId, validate_action
from starship_sim.environment import build_environment
from starship_sim.spacecraft import SpacecraftState

ROOT = Path(__file__).resolve().parents[1]
SCENE = json.loads((ROOT/'config/scene.json').read_text())


@pytest.mark.parametrize('field,value', [('mass_kg', 0), ('mass_kg', 5001), ('radius_m', .01),
    ('speed_m_s', 151), ('speed_m_s', float('inf')), ('direction_body', [0,0,0]), ('direction_body', [1,2])])
def test_invalid_impacts_are_rejected(field, value):
    with pytest.raises(ValidationError): ImpactCommand.model_validate({'target_id':'command',field:value})


def test_impact_direction_is_normalized():
    assert ImpactCommand(target_id='command', direction_body=[0,0,-5]).direction_body == (0,0,-1)


def test_burn_requires_propelling_authority_and_bounded_throttle():
    action = ThrusterBurn(type='thruster_burn', linear_throttle=dict(x=.4,y=.1,z=0), angular_throttle=dict(x=0,y=0,z=.2), duration_s=2)
    validate_action(SCENE, SystemId.PROPELLING, action)
    with pytest.raises(PolicyError): validate_action(SCENE, SystemId.ENERGY, action)
    action.linear_throttle.x = 1
    with pytest.raises(PolicyError): validate_action(SCENE, SystemId.PROPELLING, action)


def test_structural_failure_limits_health_and_disables_abstract_repair():
    state = SpacecraftState(SCENE)
    state.apply_physics({'sim_time_s':1, 'detached_links':['module_engine','solar_port'],
        'bonds':[{'id':'module_engine','broken':True,'broken_at_sim_time_s':1,'peak_utilization':2}]})
    assert state.metrics['thruster_efficiency_pct'] == 0
    assert state.health_ceilings['solar_panel_health_pct'] == 50
    assert state.metrics['hull_integrity_pct'] < 100
    assert state.propulsion_factor() == 1  # RCS bus survives main-engine separation.
    state.metrics['thruster_efficiency_pct'] = 100
    state.apply_physics(state.physics)
    assert state.metrics['thruster_efficiency_pct'] == 0
    assert len(state.events) == 1


@pytest.mark.parametrize('change', ['missing_joint', 'zero_area', 'bad_normal'])
def test_bad_bonds_fail_before_native_launch(change):
    profile = json.loads((ROOT/'config/environment.json').read_text())
    bond = profile['physics']['bonds'][0]
    if change == 'missing_joint': bond['joint_name'] = 'missing'
    if change == 'zero_area': bond['area_m2'] = 0
    if change == 'bad_normal': bond['normal_local'] = [0,0,0]
    with pytest.raises(ValueError): build_environment(ROOT, profile)
