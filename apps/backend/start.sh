#!/bin/sh
set -e

echo "🎬 Starting tuning-movie backend..."

# Check if database exists
if [ ! -f "/app/apps/backend/data/tuning-movie.db" ]; then
  echo "📦 Database not found, initializing..."

  # Run seed to create and populate database
  cd /app/apps/backend
  DATABASE_URL="/app/apps/backend/data/tuning-movie.db" node dist/db/seed.js

  echo "✅ Database initialized and seeded"
else
  echo "✅ Database already exists"
fi

echo "🚀 Starting server..."
DATABASE_URL="/app/apps/backend/data/tuning-movie.db" exec node /app/apps/backend/dist/index.js
