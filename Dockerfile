ARG SPACE_ROS_IMAGE=osrf/space-ros:jazzy-2026.07.0
FROM ${SPACE_ROS_IMAGE}

USER root
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# This is the ROS/Gazebo pairing for Jazzy: Gazebo Harmonic (gz-sim 8).
RUN curl -fsSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \
      -o /usr/share/keyrings/ros-archive-keyring.gpg \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       ros-jazzy-ros-gz ros-jazzy-rmw-cyclonedds-cpp \
       ros-jazzy-tf2-msgs python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY requirements.lock ./
RUN python3 -m venv --system-site-packages /workspace/.venv \
    && /workspace/.venv/bin/python -m pip install --no-cache-dir -r requirements.lock
COPY starship_sim ./starship_sim
COPY tools ./tools
COPY worlds ./worlds
COPY config ./config
COPY docker ./docker
RUN chmod +x docker/*.sh \
    && /workspace/.venv/bin/python tools/generate_environment.py --check

ENV RMW_IMPLEMENTATION=rmw_cyclonedds_cpp \
    ROS_DOMAIN_ID=77 \
    GZ_PARTITION=starship_environment \
    PYTHONUNBUFFERED=1 \
    PYTHONNOUSERSITE=1 \
    API_PORT=8000
EXPOSE 8000
ENTRYPOINT ["/workspace/docker/entrypoint.sh"]
CMD ["/workspace/docker/start.sh"]
