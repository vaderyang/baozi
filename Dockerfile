ARG APP_PATH=/opt/outline

# ===========================
# Build stage
# ===========================
FROM node:22 AS builder

ARG APP_PATH
WORKDIR $APP_PATH

# Install build dependencies
RUN apt-get update && apt-get install -y cmake && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json yarn.lock ./
COPY patches ./patches

# Install all dependencies
ENV NODE_OPTIONS="--max-old-space-size=24000"
RUN yarn install --no-optional --frozen-lockfile --network-timeout 1000000 && \
    yarn cache clean

# Copy source code
COPY . .

# Build the application
ARG CDN_URL
RUN yarn build

# Remove dev dependencies and reinstall production only
RUN rm -rf node_modules && \
    yarn install --production=true --frozen-lockfile --network-timeout 1000000 && \
    yarn cache clean

# ===========================
# Production runtime stage
# ===========================
FROM node:22-slim AS runner

LABEL org.opencontainers.image.source="https://github.com/outline/outline"

ARG APP_PATH
WORKDIR $APP_PATH
ENV NODE_ENV=production
ENV PORT=6700

# Create a non-root user compatible with Debian and BusyBox based images
RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --ingroup nodejs nodejs && \
    mkdir -p /var/lib/outline && \
    chown -R nodejs:nodejs /var/lib/outline

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs $APP_PATH/build ./build
COPY --from=builder --chown=nodejs:nodejs $APP_PATH/server ./server
COPY --from=builder --chown=nodejs:nodejs $APP_PATH/public ./public
COPY --from=builder --chown=nodejs:nodejs $APP_PATH/.sequelizerc ./.sequelizerc
COPY --from=builder --chown=nodejs:nodejs $APP_PATH/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs $APP_PATH/package.json ./package.json

# Install wget for healthchecks
RUN apt-get update && \
    apt-get install -y wget && \
    rm -rf /var/lib/apt/lists/*

# Setup data directory for local file storage
ENV FILE_STORAGE_LOCAL_ROOT_DIR=/var/lib/outline/data
RUN mkdir -p "$FILE_STORAGE_LOCAL_ROOT_DIR" && \
    chown -R nodejs:nodejs "$FILE_STORAGE_LOCAL_ROOT_DIR" && \
    chmod 1777 "$FILE_STORAGE_LOCAL_ROOT_DIR"

VOLUME /var/lib/outline/data

USER nodejs

HEALTHCHECK --interval=1m CMD wget -qO- "http://localhost:${PORT:-6700}/_health" | grep -q "OK" || exit 1

EXPOSE 6700
CMD ["yarn", "start"]
