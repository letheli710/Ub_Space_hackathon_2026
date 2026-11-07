import math
import pytest
from starship_sim.geometry import world_to_local


def test_navigation_velocity_uses_ship_frame_after_ship_rotates():
    # A ship facing world +Y needs local -Y thrust to travel toward world +X.
    orientation = {"x": 0, "y": 0, "z": math.sqrt(0.5), "w": math.sqrt(0.5)}
    assert world_to_local((2, 0, 0), orientation) == pytest.approx((0, -2, 0))


def test_identity_frame_preserves_velocity():
    assert world_to_local((1, -2, 3), {"x": 0, "y": 0, "z": 0, "w": 1}) == (1, -2, 3)
