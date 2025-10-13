#!/bin/bash

# Quick rebuild script for server-side changes

echo "Rebuilding server..."
yarn build:server

echo ""
echo "✅ Server rebuilt!"
echo ""
echo "Restart the application with:"
echo "  ./scripts/start.sh"
