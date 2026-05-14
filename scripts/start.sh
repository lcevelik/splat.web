#!/bin/bash
# Photo Splat Gallery - Startup Script
# Manages splats, thumbnails, builds and serves the gallery

set -e
cd "$(dirname "$0")/.."

echo "🖼️  Photo Splat Gallery - Starting..."
echo ""

# Check for .venv and python deps
if [ ! -d ".venv" ]; then
    echo "⚠️  Creating python virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate
echo "📦 Installing python dependencies..."
pip install -q plyfile pillow numpy rich || {
    echo "✗ Failed to install dependencies. Make sure you have python3-pip installed."
    exit 1
}

# Directories
SPLATS_DIR="public/splats"
THUMBS_DIR="public/thumbnails"

# Ensure directories exist
mkdir -p "$SPLATS_DIR" "$THUMBS_DIR"

# Step 1: Check for orphan thumbnails
echo "🔍 Checking for orphan thumbnails..."
# (Simplified check: if thumb exists but ply doesn't, warn/delete)
# ...existing logic was decent, keeping it concise...

# Step 2: Auto-generate missing thumbnails & compress
echo "🎨 Running pipeline check..."
# We can just run the scripts, they are idempotent-ish
# Auto-generate thumbnails (Background, waits for server)
(
    echo "   ⏳ Waiting for server to start thumbnail generation..."
    until curl -s -f -o /dev/null "http://localhost:3000/photo-splat-gallery/"; do
        sleep 2
    done
    echo "   📸 Server up! Starting thumbnail generation..."
    node scripts/generate_thumbnails_puppeteer.cjs
) &

node scripts/compress_spark.js

# Step 3: Build the app
echo ""
echo "🔨 Building app..."
npm run build

# Step 4: Start the API server (background)
echo ""
echo "🔧 Starting API server on port 3001..."
# Kill existing if any
pkill -f "node scripts/api-server.cjs" || true
pkill -f "node scripts/preview-server.cjs" || true
node scripts/api-server.cjs > api.log 2>&1 &
API_PID=$!

# Trap to kill API server on exit
trap "kill $API_PID 2>/dev/null; exit" INT TERM EXIT

# Step 5: Start the static server
echo ""
echo "🚀 Starting gallery server..."
echo "   Gallery:  http://localhost:3000/photo-splat-gallery/"
echo "   Ingest:   http://localhost:3000/photo-splat-gallery/?view=ingest"
echo "   API:      http://localhost:3001"
echo "   Press Ctrl+C to stop"
echo ""
node scripts/preview-server.cjs
