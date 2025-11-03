#!/usr/bin/env bash
set -euo pipefail

# Config
APP_PATH=${APP_PATH:-/opt/outline}
COMPOSE_DIR="."
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"

# Static image definitions (keep in sync with docker-compose.yml)
IMAGE_APP="netis/house-outline:1.0.1"
IMAGE_BASE="netis/house-outline-base:1.0.1"

# Format: YYYYMMDDHHmm
BUILD_TIME=$(date +"%Y%m%d%H%M")
echo "Building images with BUILD_TIME=${BUILD_TIME}, APP_PATH=${APP_PATH}"

# Build base image (fresh)
docker build --pull --no-cache \
  -f ../Dockerfile.base \
  -t "${IMAGE_BASE}" \
  --build-arg APP_PATH="${APP_PATH}" \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  ..

# Build app image against the freshly built base
docker build --no-cache \
  -f ../Dockerfile \
  -t "${IMAGE_APP}" \
  --build-arg BASE_IMAGE="${IMAGE_BASE}" \
  --build-arg APP_PATH="${APP_PATH}" \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  ..

echo "Build complete: ${IMAGE_APP}. Now forcing replacement of any running containers using this image."

# Stop and remove any running containers using the old image tag
CONTAINERS=$(docker ps -q --filter "ancestor=${IMAGE_APP}" || true)
if [ -n "${CONTAINERS}" ]; then
  echo "Stopping and removing containers: ${CONTAINERS}"
  docker rm -f ${CONTAINERS}
else
  echo "No running containers found for image ${IMAGE_APP}"
fi

# Check if other services are running, start all if needed
if [ -f "${COMPOSE_DIR}/docker-compose.yml" ]; then
  echo "Checking service status..."
  
  # Check if any compose services are running
  RUNNING_SERVICES=""
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    RUNNING_SERVICES=$(cd "${COMPOSE_DIR}" && docker compose ps --services --filter "status=running" 2>/dev/null || echo "")
  elif command -v docker-compose >/dev/null 2>&1; then
    RUNNING_SERVICES=$(cd "${COMPOSE_DIR}" && docker-compose ps --services --filter "status=running" 2>/dev/null || echo "")
  fi
  
  if [ -z "$RUNNING_SERVICES" ]; then
    echo "No services running. Starting all services..."
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      (cd "${COMPOSE_DIR}" && docker compose up -d)
    elif command -v docker-compose >/dev/null 2>&1; then
      (cd "${COMPOSE_DIR}" && docker-compose up -d)
    else
      echo "Warning: docker compose is not available. Skipped compose-based deploy."
    fi
  else
    echo "Other services are running. Restarting outline service only..."
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      (cd "${COMPOSE_DIR}" && docker compose up -d --no-deps --force-recreate outline)
    elif command -v docker-compose >/dev/null 2>&1; then
      (cd "${COMPOSE_DIR}" && docker-compose up -d --no-deps --force-recreate outline)
    else
      echo "Warning: docker compose is not available. Skipped compose-based redeploy."
    fi
  fi
else
  echo "Compose file not found. If containers were started manually, please restart them using ${IMAGE_APP}."
fi

echo "Pruning dangling images to remove old, untagged layers..."
docker image prune -f || true

echo "Replacement finished."