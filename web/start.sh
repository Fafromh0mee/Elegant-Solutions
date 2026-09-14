#!/bin/sh

echo "=== Starting deployment ==="

echo "Running Prisma db push..."
prisma db push --url "$DATABASE_URL" --schema ./prisma/schema.prisma --accept-data-loss 2>&1 || {
  echo "WARNING: db push failed, starting anyway..."
}

echo "Starting Next.js server..."
exec node server.js
