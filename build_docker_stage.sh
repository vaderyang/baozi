#!/usr/bin/env bash
set -euo pipefail

# 统一管理镜像版本
VERSION="stage"


docker image rm -f netis/house-outline:${VERSION}
docker image rm -f netis/house-outline-base:${VERSION}

# Format: YYYYMMDDHHmm
BUILD_TIME=$(date +"%Y%m%d%H%M")
echo "Building images with BUILD_TIME=${BUILD_TIME}"

docker build --pull \
  -f Dockerfile.base \
  -t netis/house-outline-base:${VERSION} \
  --build-arg APP_PATH=/opt/outline \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  .

docker build \
  -t netis/house-outline:${VERSION} \
  --build-arg APP_PATH=/opt/outline \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  .