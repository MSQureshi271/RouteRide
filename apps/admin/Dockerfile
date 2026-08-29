# ─── Stage 1: Dependency & Build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Enable Corepack and pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo configuration files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/config/package.json ./packages/config/
COPY packages/ui/package.json ./packages/ui/
COPY apps/admin/package.json ./apps/admin/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/contracts ./packages/contracts
COPY packages/config ./packages/config
COPY packages/ui ./packages/ui
COPY apps/admin ./apps/admin

# Build dependencies and Admin panel
RUN pnpm --filter @routeride/contracts build
RUN pnpm --filter @routeride/config build
RUN pnpm --filter @routeride/admin build

# ─── Stage 2: Hardened Next.js Production Runner ──────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_TELEMETRY_DISABLED=1

# Security: Create unprivileged nextjs user and group (UID 1001)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and standalone output
COPY --from=builder /app/apps/admin/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./.next/static

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "apps/admin/server.js"]
