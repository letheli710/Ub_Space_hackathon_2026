#!/usr/bin/env bash
# Run explicitly as root inside the existing Ubuntu WSL distribution.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo 'Run as root: wsl -d Ubuntu -u root -- bash tools/setup_docker_wsl.sh' >&2
  exit 1
fi
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
systemctl start docker
docker version
docker compose version
