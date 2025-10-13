#!/bin/bash

# Test script for AI API endpoint
# This uses the dev mode bypass authentication

echo "🧪 Testing AI API endpoint..."
echo ""

# Test with a simple prompt
curl -X POST http://localhost:3030/api/ai.generate \
  -H "Content-Type: application/json" \
  -H "X-Dev-API-Key: dev_test_key" \
  -d '{
    "prompt": "Write a haiku about programming"
  }' \
  | jq .

echo ""
echo "✅ Test complete!"
