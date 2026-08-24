#!/bin/bash
set -e

echo "🚀 Starting screen-share infrastructure..."

# Start coturn TURN server in background
echo "📡 Starting coturn TURN server..."
turnserver -c /app/coturn.conf &
COTURN_PID=$!

# Wait a moment for coturn to start
sleep 2

# Check if coturn started successfully
if kill -0 $COTURN_PID 2>/dev/null; then
    echo "✅ coturn started successfully (PID: $COTURN_PID)"
else
    echo "⚠️  coturn failed to start, continuing with STUN only"
fi

# Start the signaling server
echo "🌐 Starting signaling server..."
exec node dist/index.js
