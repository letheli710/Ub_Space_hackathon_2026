"""Coordinate conversion shared by the autonomous environment flight model."""


def world_to_local(vector, orientation):
    """Rotate a world-frame vector by the inverse of a unit quaternion."""
    x, y, z = vector
    qx, qy, qz, qw = (-orientation["x"], -orientation["y"], -orientation["z"], orientation["w"])
    tx, ty, tz = (2 * (qy * z - qz * y), 2 * (qz * x - qx * z), 2 * (qx * y - qy * x))
    return (x + qw * tx + qy * tz - qz * ty,
            y + qw * ty + qz * tx - qx * tz,
            z + qw * tz + qx * ty - qy * tx)
