import math
import pytest
from starship_sim.geometry import tracking_velocity, world_to_local


def test_navigation_velocity_uses_ship_frame_after_ship_rotates():
    # A ship facing world +Y needs local -Y thrust to travel toward world +X.
    orientation = {"x": 0, "y": 0, "z": math.sqrt(0.5), "w": math.sqrt(0.5)}
    assert world_to_local((2, 0, 0), orientation) == pytest.approx((0, -2, 0))


def test_identity_frame_preserves_velocity():
    assert world_to_local((1, -2, 3), {"x": 0, "y": 0, "z": 0, "w": 1}) == (1, -2, 3)


def test_tracking_restores_clearance_inside_stop_distance_and_limits_speed():
    velocity, arrived = tracking_velocity((10, 0, 0), (0, 0, 0), 25, 31, False)
    assert arrived and velocity[0] < 0
    velocity, _ = tracking_velocity((1000, 0, 0), (0, 30, 0), 25, 31, False)
    assert math.sqrt(sum(value * value for value in velocity)) == pytest.approx(25)


def test_tracking_holds_a_moving_planet_without_repeated_arrival_events():
    ship = [490., 0., 0.]
    arrived, transitions = False, 0
    distances = []
    for step in range(3000):
        t, omega, radius, dt = step * .05, .0146, 508, .05
        target = (radius * math.cos(omega * t), radius * math.sin(omega * t), 0.)
        target_velocity = (-radius * omega * math.sin(omega * t), radius * omega * math.cos(omega * t), 0.)
        delta = tuple(target[i] - ship[i] for i in range(3))
        velocity, next_arrived = tracking_velocity(delta, target_velocity, 25, 31, arrived)
        transitions += next_arrived != arrived
        arrived = next_arrived
        ship = [ship[i] + velocity[i] * dt for i in range(3)]
        if step > 1000:
            distances.append(math.dist(ship, target))
    assert transitions == 1
    assert min(distances) > 30 and max(distances) < 32
