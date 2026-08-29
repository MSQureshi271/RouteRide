# ─── Stage 1: Build & Prune ───────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Enable Corepack and pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo configuration files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json ./apps/api/

# Install all dependencies for build
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/contracts ./packages/contracts
COPY packages/config ./packages/config
COPY apps/api ./apps/api

# Build packages and API
RUN pnpm --filter @routeride/contracts build
RUN pnpm --filter @routeride/config build
RUN pnpm --filter @routeride/api prisma:emit
RUN pnpm --filter @routeride/api build

# Prune dev dependencies for lean production deployment
RUN pnpm --filter @routeride/api --prod deploy /app/pruned

# ─── Stage 2: Hardened Production Runner ───────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Security: Run as unprivileged built-in node user (UID 1000)
USER node

# Copy pruned production deployment from builder
COPY --chown=node:node --from=builder /app/pruned ./
COPY --chown=node:node --from=builder /app/apps/api/dist ./dist
COPY --chown=node:node --from=builder /app/apps/api/src/generated ./src/generated

# Port exposure
EXPOSE 3000

# Health check probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Application startup
CMD ["node", "dist/main.js"]
