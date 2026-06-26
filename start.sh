#!/bin/bash
# Chain Analytics — Rebuilt Next.js Startup Script

# Navigate to script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=================================================="
echo "      Chain Analytics — Rebuilt Full-Stack App     "
echo "=================================================="
echo ""

# Ensure database exists and is seeded
if [ ! -f "data/chain_analytics.db" ]; then
  echo "[db] Database file data/chain_analytics.db not found. Initializing..."
  npx tsx scripts/update_labels.ts
  npx tsx scripts/update_sanctions.ts
  echo ""
fi

echo "Starting Next.js (Dashboard + API Router)..."
echo "  URL: http://localhost:3000"
echo "  API: http://localhost:3000/api/health"
echo "Press Ctrl+C to stop."
echo ""

npm run dev
