#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Test script for OpenAI Realtime API
 * Verifies the service at http://172.16.11.67:8000/v1 is ready
 */

const WebSocket = require("ws");

const REALTIME_API_URL = "ws://172.16.11.67:8000/v1/realtime";
const MODEL = "gpt-4o-realtime-preview-2024-12-17";

console.log("🔍 Testing OpenAI Realtime API...");
console.log(`📍 Endpoint: ${REALTIME_API_URL}`);
console.log(`🤖 Model: ${MODEL}\n`);

// Test WebSocket connection
const ws = new WebSocket(`${REALTIME_API_URL}?model=${MODEL}`, {
  headers: {
    Authorization: "Bearer dummy-key",
    "OpenAI-Beta": "realtime=v1",
  },
});

let isConnected = false;
const timeout = setTimeout(() => {
  if (!isConnected) {
    console.error("❌ Connection timeout after 10 seconds");
    ws.close();
    process.exit(1);
  }
}, 10000);

ws.on("open", () => {
  isConnected = true;
  clearTimeout(timeout);
  console.log("✅ WebSocket connection established");

  // Send a session.update event to configure the session
  const sessionConfig = {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: "You are a helpful assistant.",
      voice: "alloy",
    },
  };

  console.log("📤 Sending session configuration...");
  ws.send(JSON.stringify(sessionConfig));
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`📥 Received: ${message.type}`);

    if (message.type === "session.created") {
      console.log("✅ Session created successfully");
      console.log(`   Session ID: ${message.session?.id || "N/A"}`);
      console.log(`   Model: ${message.session?.model || "N/A"}`);
      console.log("\n✨ OpenAI Realtime API service is ready!\n");
      ws.close();
      process.exit(0);
    } else if (message.type === "session.updated") {
      console.log("✅ Session updated successfully");
    } else if (message.type === "error") {
      console.error("❌ Error from server:", message.error);
      ws.close();
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Failed to parse message:", err.message);
  }
});

ws.on("error", (error) => {
  clearTimeout(timeout);
  console.error("❌ WebSocket error:", error.message);
  console.error("\n🔧 Possible issues:");
  console.error("   - Service is not running at http://172.16.11.67:8000");
  console.error("   - Network connectivity issues");
  console.error("   - Firewall blocking the connection");
  process.exit(1);
});

ws.on("close", (code, reason) => {
  clearTimeout(timeout);
  if (!isConnected) {
    console.error("❌ Connection closed before establishing");
    console.error(`   Code: ${code}, Reason: ${reason || "N/A"}`);
    process.exit(1);
  }
});
