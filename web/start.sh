#!/bin/sh

echo "=== Starting deployment ==="

echo "Running Prisma migrations..."
./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma || {
  echo "Migration failed, but continuing..."
}

echo "Starting Next.js server..."
exec node server.js
