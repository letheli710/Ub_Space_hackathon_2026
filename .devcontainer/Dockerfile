FROM tiryoh/ros2-desktop-vnc:humble

USER root
RUN apt-get update && apt-get install -y \
    ros-humble-rosbridge-server \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs