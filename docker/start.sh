#!/usr/bin/env bash
set -eo pipefail
cd /workspace

# Fail visibly if a binary ROS installation accidentally replaced Space ROS.
python -c 'import os, rclpy; assert rclpy.__file__.startswith(os.environ["SPACEROS_DIR"]), rclpy.__file__; print("Using Space ROS:", rclpy.__file__, flush=True)'
gz sdf -k worlds/deep_space.sdf

pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  wait || true
}
trap cleanup EXIT INT TERM

gz sim -s -r -v 3 worlds/deep_space.sdf &
pids+=("$!")
ros2 run ros_gz_bridge parameter_bridge \
  /world/deep_space/control@ros_gz_interfaces/srv/ControlWorld \
  --ros-args -p config_file:=/workspace/config/bridge.yaml &
pids+=("$!")
python -m starship_sim &
pids+=("$!")

# Any process exiting stops the stack; a dead simulator must not leave a
# healthy-looking API behind. Docker init also reaps orphaned children.
set +e
wait -n "${pids[@]}"
status=$?
if [ "$status" -eq 0 ]; then status=1; fi
exit "$status"
