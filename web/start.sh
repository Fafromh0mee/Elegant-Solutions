#!/bin/sh
set -e

echo "=== Starting deployment ==="
echo "DATABASE_URL: ${DATABASE_URL:0:30}..." 

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma || {
  echo "Migration failed, but continuing..."
}

echo "Starting Next.js server..."
exec node server.js
