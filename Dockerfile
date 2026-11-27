# syntax=docker/dockerfile:1.7
# ==============================================================================
# AliBros Logistics — Multi-Stage Production Dockerfile (Next.js Standalone)
# Target platforms: Cloud.ru Evolution Container Apps, Yandex Cloud Serverless
# Containers, Timeweb Cloud App Platform / VPS, Selectel Cloud
# ==============================================================================

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install OpenSSL & CA certificates required by Prisma query engine and HTTPS
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# Stage 1: Install dependencies & generate Prisma Client
# ------------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ------------------------------------------------------------------------------
# Stage 2: Build Next.js standalone bundle (NO runtime secrets baked into image)
# ------------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG APP_GIT_COMMIT=unknown
ARG NEXT_IMAGE_UNOPTIMIZED=false
ARG NEXT_ALLOWED_ACTION_ORIGINS=""

ENV NODE_ENV=production
ENV NEXT_OUTPUT_STANDALONE=true
ENV NEXT_IMAGE_UNOPTIMIZED=${NEXT_IMAGE_UNOPTIMIZED}
ENV NEXT_ALLOWED_ACTION_ORIGINS=${NEXT_ALLOWED_ACTION_ORIGINS}
ENV APP_GIT_COMMIT=${APP_GIT_COMMIT}

RUN npm run build

# ------------------------------------------------------------------------------
# Stage 3: Minimal non-root production runner
# ------------------------------------------------------------------------------
FROM base AS runner

ARG APP_GIT_COMMIT=unknown

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV KEEP_ALIVE_TIMEOUT=15000
ENV SHUTDOWN_TIMEOUT_MS=15000
ENV APP_GIT_COMMIT=${APP_GIT_COMMIT}

# Create non-root system user
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Install sharp in an isolated prefix so standalone node_modules is never pruned or rewritten
RUN npm install --omit=dev --prefix /tmp/sharp sharp \
  && npm cache clean --force

# Copy standalone Next.js output, static assets, public files, Prisma schema, and entrypoint
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts/standalone-server.mjs ./scripts/standalone-server.mjs

# Merge sharp into standalone node_modules and ensure Next.js image cache directory is writable
RUN cp -rn /tmp/sharp/node_modules/. /app/node_modules/ \
  && rm -rf /tmp/sharp \
  && mkdir -p /app/.next/cache \
  && chown -R nextjs:nodejs /app/node_modules /app/.next/cache

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Exec form ensures Node receives SIGTERM directly as PID 1 for graceful shutdown
CMD ["node", "scripts/standalone-server.mjs"]
