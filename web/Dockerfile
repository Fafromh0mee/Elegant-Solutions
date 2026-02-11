FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm prisma generate
RUN pnpm build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install prisma CLI + tsx for prisma.config.ts
RUN npm install -g prisma@^7.3.0 tsx

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/migrate.mjs ./migrate.mjs

# Copy pg module for migration script
COPY --from=deps /app/node_modules/pg ./node_modules/pg
COPY --from=deps /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=deps /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=deps /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=deps /app/node_modules/pg-numeric ./node_modules/pg-numeric
COPY --from=deps /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=deps /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=deps /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=deps /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=deps /app/node_modules/postgres-range ./node_modules/postgres-range
COPY --from=deps /app/node_modules/obuf ./node_modules/obuf
COPY --from=deps /app/node_modules/split2 ./node_modules/split2

COPY --from=builder /app/start.sh ./
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "start.sh"]
