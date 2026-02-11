#!/bin/sh

echo "=== Starting deployment ==="

echo "Running Prisma db push..."
prisma db push --schema=./prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || {
  echo "WARNING: db push failed, starting anyway..."
}

echo "Starting Next.js server..."
exec node server.js
