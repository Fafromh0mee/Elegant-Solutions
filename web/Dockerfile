FROM node:22.13-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global pnpm@11.20.0 && pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ./node_modules/.bin/prisma generate
RUN ./node_modules/.bin/next build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Prisma CLI for the explicit, non-destructive migrate-deploy startup step.
RUN npm install -g prisma@7.3.0 && \
    mkdir -p /app/node_modules && \
    ln -s "$(npm root --global)/prisma" /app/node_modules/prisma

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.runtime.config.ts ./prisma.runtime.config.ts

COPY --from=builder /app/start.sh ./
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=Asia/Bangkok

CMD ["sh", "start.sh"]
