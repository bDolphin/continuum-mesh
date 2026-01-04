#!/bin/bash
# Startup script for Continuum Mesh - runs daemon and opens extension in Chrome

set -e

PROJECT_DIR="/Users/bhuvanaguru/Documents/gitWorkspace/continuum-mesh"
DAEMON_DIR="$PROJECT_DIR/daemon"
EXTENSION_DIR="$PROJECT_DIR/extension"

echo "🚀 Starting Continuum Mesh..."
echo ""

# Check if daemon is running
if pgrep -f "python.*main.py" > /dev/null; then
    echo "✅ Daemon already running"
else
    echo "📦 Starting daemon on port 2789..."
    cd "$DAEMON_DIR"
    
    # Install requirements if needed
    if [ ! -d "venv" ]; then
        echo "📝 Installing Python dependencies..."
        python3 -m venv venv
        source venv/bin/activate
        pip install -q -r requirements.txt
    else
        source venv/bin/activate
    fi
    
    # Start daemon in background
    python main.py > daemon.log 2>&1 &
    DAEMON_PID=$!
    echo "✅ Daemon started (PID: $DAEMON_PID)"
    
    # Wait for daemon to be ready
    sleep 2
    
    # Check if daemon is accessible
    if curl -s http://localhost:2789/health > /dev/null 2>&1 || curl -s http://localhost:2789/store > /dev/null 2>&1; then
        echo "✅ Daemon is accessible"
    else
        echo "⚠️  Daemon may not be ready yet, but started"
    fi
fi

echo ""
echo "📋 Checking extension..."
echo "✅ Extension directory: $EXTENSION_DIR"
echo ""

echo "🌐 Opening Chrome..."
echo "📝 Remember to:"
echo "  1. Go to chrome://extensions"
echo "  2. Enable 'Developer Mode'"
echo "  3. Click 'Load unpacked' and select $EXTENSION_DIR"
echo "  4. OR if already loaded, toggle off/on to reload"
echo ""

echo "📊 Testing Extension:"
echo "  1. Open DevTools (F12 or Cmd+Option+J)"
echo "  2. Click 'Service Worker' inspector for background.js logs"
echo "  3. Go to any website and trigger store/recall"
echo "  4. Watch console for emoji-prefixed logs:"
echo "     📥 = Message received"
echo "     📤 = Response sent"
echo "     ✅ = Success"
echo "     ❌ = Error"
echo ""

echo "📝 For more details, see TESTING_GUIDE.md"
echo ""

# Optional: Open Chrome if available
if command -v open > /dev/null; then
    open -a "Google Chrome" > /dev/null 2>&1 || true
fi

echo "✅ Setup complete!"
echo ""
echo "Daemon logs: $DAEMON_DIR/daemon.log"
echo "Test guide: $PROJECT_DIR/TESTING_GUIDE.md"
