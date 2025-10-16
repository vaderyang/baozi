#!/usr/bin/env node

/* eslint-disable no-console */

const WebSocket = require("ws");

const model = "Systran/faster-distil-whisper-large-v3";
const url = `ws://172.16.11.67:8000/v1/realtime?model=${encodeURIComponent(model)}&intent=transcription&language=auto`;

console.log("Testing Speaches WebSocket connection");
console.log("URL:", url);
console.log("");

const ws = new WebSocket(url, {
  headers: {
    Authorization: "Bearer dummy-key",
  },
});

let messageCount = 0;

ws.on("open", () => {
  console.log("✅ WebSocket OPEN");
  console.log("   Ready state:", ws.readyState);
  console.log("");

  // Send session update
  const sessionUpdate = {
    type: "session.update",
    session: {
      modalities: ["text"],
      input_audio_transcription: {
        model: "whisper-1",
      },
    },
  };

  console.log("📤 Sending session.update...");
  ws.send(JSON.stringify(sessionUpdate));
});

ws.on("message", (data) => {
  messageCount++;
  try {
    const event = JSON.parse(data.toString());
    console.log(`📥 Message ${messageCount}: ${event.type}`);
    if (event.type === "error") {
      console.error("   Error details:", JSON.stringify(event.error, null, 2));
    }

    if (event.type === "session.created" || event.type === "session.updated") {
      console.log("   Ready state after session:", ws.readyState);

      // Try sending audio
      setTimeout(() => {
        console.log("");
        console.log("📤 Sending test audio chunk...");
        console.log("   Ready state before send:", ws.readyState);

        const testAudio = Buffer.alloc(4800).toString("base64");
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: testAudio,
          })
        );

        console.log("✅ Audio chunk sent successfully");
        console.log("   Ready state after send:", ws.readyState);

        // Close after test
        setTimeout(() => {
          console.log("");
          console.log("Closing connection...");
          ws.close();
        }, 1000);
      }, 500);
    }
  } catch (err) {
    console.error("Failed to parse message:", err.message);
  }
});

ws.on("error", (error) => {
  console.error("❌ WebSocket ERROR:", error.message);
  console.error("   Full error:", error);
});

ws.on("close", (code, reason) => {
  console.log("");
  console.log("🔌 WebSocket CLOSED");
  console.log("   Code:", code);
  console.log("   Reason:", reason.toString() || "N/A");
  console.log("   Messages received:", messageCount);
});

// Timeout
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log("");
    console.log("⏰ Timeout - closing");
    ws.close();
  }
  process.exit(0);
}, 10000);
