"""Canonical joint units and coupled-joint conversion shared by API, AI and ROS."""


def limits(joint):
    return (joint['lower_limit'], joint['upper_limit']) if 'lower_limit' in joint else (joint['lower_rad'], joint['upper_rad'])


def joint_names(joint):
    return [joint['joint_name'], *joint.get('coupled_joint_names', [])]


def physical_target(joint, value):
    return value * joint.get('scale', 1.) + joint.get('offset', 0.)


def measured_value(joint, samples):
    values = [samples.get(name) for name in joint_names(joint)]
    if any(value is None for value in values):
        return None
    return (sum(values) / len(values) - joint.get('offset', 0.)) / joint.get('scale', 1.)
