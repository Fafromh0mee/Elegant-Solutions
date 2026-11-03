#!/bin/sh
set -eu

echo "=== Starting deployment ==="

echo "Running Prisma migrate deploy..."
prisma migrate deploy --config ./prisma.runtime.config.ts

echo "Starting Next.js server..."
exec node server.js
