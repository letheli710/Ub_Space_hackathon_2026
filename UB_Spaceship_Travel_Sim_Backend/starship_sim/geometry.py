"""Coordinate conversion shared by the autonomous environment flight model."""

import math


def tracking_velocity(delta, destination_velocity, cruise_speed, stop_distance, was_arrived):
    """Follow a moving target and restore stand-off distance on either side."""
    distance = math.sqrt(sum(value * value for value in delta))
    tolerance = max(.1, min(1., stop_distance * .02))
    arrived = distance <= stop_distance + tolerance * (3 if was_arrived else 1)
    radial = max(-cruise_speed, min(cruise_speed, (distance - stop_distance) * .5))
    velocity = tuple(destination_velocity[i] + (value / distance * radial if distance else 0.) for i, value in enumerate(delta))
    magnitude = math.sqrt(sum(value * value for value in velocity))
    scale = min(1., cruise_speed / magnitude) if magnitude else 1.
    return tuple(value * scale for value in velocity), arrived


def world_to_local(vector, orientation):
    """Rotate a world-frame vector by the inverse of a unit quaternion."""
    x, y, z = vector
    qx, qy, qz, qw = (-orientation["x"], -orientation["y"], -orientation["z"], orientation["w"])
    tx, ty, tz = (2 * (qy * z - qz * y), 2 * (qz * x - qx * z), 2 * (qx * y - qy * x))
    return (x + qw * tx + qy * tz - qz * ty,
            y + qw * ty + qz * tx - qx * tz,
            z + qw * tz + qx * ty - qy * tx)
