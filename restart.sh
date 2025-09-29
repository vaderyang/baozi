#!/bin/bash

# Outline Wiki Restart Script
# This script stops and then starts the Outline application

echo "🔄 Restarting Outline Wiki..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stop the application first
echo "1️⃣ Stopping Outline..."
./stop.sh

echo ""
echo "2️⃣ Starting Outline..."
./start.sh

