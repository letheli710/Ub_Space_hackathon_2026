#!/usr/bin/env bash
set -eo pipefail
source /opt/ros/jazzy/setup.bash
source "${SPACEROS_DIR:-/opt/ros/spaceros}/setup.bash"
export PATH="/workspace/.venv/bin:${PATH}"
exec "$@"
