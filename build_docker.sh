#!/usr/bin/env bash
set -euo pipefail

# Format: YYYYMMDDHHmm
BUILD_TIME=$(date +"%Y%m%d%H%M")
echo "Building images with BUILD_TIME=${BUILD_TIME}"

docker build --pull \
  -f Dockerfile.base \
  -t netis/house-outline-base:1.0.1 \
  --build-arg APP_PATH=/opt/outline \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  .

docker build \
  -t netis/house-outline:1.0.1 \
  --build-arg APP_PATH=/opt/outline \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  .
