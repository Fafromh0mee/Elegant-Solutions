#!/bin/sh

echo "=== Starting deployment ==="

echo "Running database migration..."
NODE_PATH=./migrate_modules node migrate.mjs 2>&1 || {
  echo "WARNING: Migration had issues, starting anyway..."
}

echo "Starting Next.js server..."
exec node server.js
