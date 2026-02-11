#!/bin/sh

echo "=== Starting deployment ==="

echo "Running Prisma migrations..."
node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma 2>&1 || {
  echo "WARNING: Migration failed!"
  echo "Trying prisma db push as fallback..."
  node ./node_modules/prisma/build/index.js db push --schema=./prisma/schema.prisma --accept-data-loss 2>&1 || {
    echo "WARNING: db push also failed, starting anyway..."
  }
}

echo "Starting Next.js server..."
exec node server.js
