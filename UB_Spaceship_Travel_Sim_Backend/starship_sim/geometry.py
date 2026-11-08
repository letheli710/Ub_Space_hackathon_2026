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


def compose_pose(parent, local):
    q, r = parent['orientation'], local['orientation']
    rotated = world_to_local(tuple(local['position'][a] for a in 'xyz'), {**q, **{a: -q[a] for a in 'xyz'}})
    x, y, z, w = [q[a] for a in 'xyzw']
    i, j, k, s = [r[a] for a in 'xyzw']
    return {'position': {a: parent['position'][a] + rotated[index] for index, a in enumerate('xyz')},
            'orientation': dict(x=w*i+x*s+y*k-z*j, y=w*j-x*k+y*s+z*i,
                                z=w*k+x*j-y*i+z*s, w=w*s-x*i-y*j-z*k)}


def relative_pose(world, reference):
    q = reference['orientation']
    inverse = {**q, **{a: -q[a] for a in 'xyz'}}
    delta = tuple(world['position'][a] - reference['position'][a] for a in 'xyz')
    position = dict(zip('xyz', world_to_local(delta, q)))
    orientation = compose_pose({'position': dict(x=0, y=0, z=0), 'orientation': inverse},
                               {'position': dict(x=0, y=0, z=0), 'orientation': world['orientation']})['orientation']
    return {'position': position, 'orientation': orientation}


def measured_world_pose(transforms, frame_id, world_frame='world', trail=()):
    item = transforms.get(frame_id)
    if item is None or frame_id in trail: return None
    pose = {key: item[key] for key in ('position', 'orientation')}
    parent = item.get('parent_frame_id', '')
    if not parent or parent in {'world', world_frame} or parent.startswith('world::'): return pose
    parent_pose = measured_world_pose(transforms, parent, world_frame, (*trail, frame_id))
    return compose_pose(parent_pose, pose) if parent_pose else None
