#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Test Speaches API directly with audio file
 * This bypasses our backend to isolate issues
 */

const WebSocket = require("ws");
const fs = require("fs");

const audioFile =
  process.argv[2] || "test-audio/recording-2025-10-16T03-34-05-213Z.wav";

if (!fs.existsSync(audioFile)) {
  console.error("❌ Audio file not found:", audioFile);
  process.exit(1);
}

const model = "whisper-1";
const url = `ws://172.16.11.67:8000/v1/realtime?model=${encodeURIComponent(model)}&intent=transcription`;
// Note: Do NOT send language=auto, Speaches doesn't support it. Omit language for auto-detection.

console.log("🧪 Direct Speaches API Test");
console.log("═══════════════════════════════════════════════\n");
console.log(`📁 Audio file: ${audioFile}`);
console.log(`🌐 Speaches URL: ${url}`);
console.log(`🎯 Model: ${model}`);
console.log(`🗣️  Language: auto-detect\n`);

let messageCount = 0;
let hasReceivedTranscript = false;
let sessionCreated = false;
let sessionUpdated = false;

const ws = new WebSocket(url, {
  headers: {
    Authorization: "Bearer dummy-key",
  },
});

ws.on("open", () => {
  console.log("✅ WebSocket OPEN\n");

  // Send session configuration
  const sessionConfig = {
    type: "session.update",
    session: {
      modalities: ["text"],
      input_audio_transcription: {
        model: model,
      },
    },
  };

  console.log("📤 Sending session.update...");
  ws.send(JSON.stringify(sessionConfig));
});

ws.on("message", (data) => {
  messageCount++;
  try {
    const event = JSON.parse(data.toString());
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);

    console.log(`\n[${timestamp}] 📥 Event #${messageCount}: ${event.type}`);

    switch (event.type) {
      case "session.created":
        sessionCreated = true;
        console.log("   Session ID:", event.session?.id);
        break;

      case "session.updated":
        sessionUpdated = true;
        console.log("   ✅ Session configured");

        // Now send the audio
        setTimeout(() => {
          sendAudio();
        }, 500);
        break;

      case "conversation.item.created":
        console.log("   Item ID:", event.item?.id);
        console.log("   Has content:", !!event.item?.content);
        if (event.item?.content?.[0]) {
          console.log("   Content type:", event.item.content[0].type);
          console.log(
            "   Transcript:",
            JSON.stringify(event.item.content[0].transcript)
          );
          if (event.item.content[0].transcript) {
            hasReceivedTranscript = true;
            console.log(
              '\n   🎉 TRANSCRIPT RECEIVED: "' +
                event.item.content[0].transcript +
                '"'
            );
          }
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        hasReceivedTranscript = true;
        console.log("   🎉 TRANSCRIPTION COMPLETED");
        console.log("   Transcript:", JSON.stringify(event.transcript));
        break;

      case "input_audio_buffer.speech_started":
        console.log("   🎤 Speech detected by VAD");
        break;

      case "input_audio_buffer.speech_stopped":
        console.log("   🛑 Speech stopped by VAD");
        break;

      case "input_audio_buffer.committed":
        console.log("   ✅ Audio buffer committed");
        break;

      case "error":
        console.log("   ❌ ERROR:", event.error?.message || "Unknown error");
        console.log("   Full error:", JSON.stringify(event.error, null, 2));
        break;

      default:
        console.log(
          "   Details:",
          JSON.stringify(event, null, 2).substring(0, 200)
        );
    }
  } catch (err) {
    console.error("Failed to parse message:", err.message);
  }
});

ws.on("error", (error) => {
  console.error("\n❌ WebSocket ERROR:", error.message);
});

ws.on("close", (code, reason) => {
  console.log("\n═══════════════════════════════════════════════");
  console.log("🔌 WebSocket CLOSED");
  console.log(`   Code: ${code}`);
  console.log(`   Reason: ${reason.toString() || "N/A"}`);
  console.log(`   Total messages: ${messageCount}`);
  console.log(`   Session created: ${sessionCreated ? "✅" : "❌"}`);
  console.log(`   Session updated: ${sessionUpdated ? "✅" : "❌"}`);
  console.log(`   Transcript received: ${hasReceivedTranscript ? "✅" : "❌"}`);
  console.log("═══════════════════════════════════════════════\n");

  if (!hasReceivedTranscript) {
    console.log("❌ FAILED: No transcript received from Speaches");
    console.log("\n💡 Possible issues:");
    console.log("   - Speaches model not detecting speech in audio");
    console.log("   - Audio language not matching model capabilities");
    console.log("   - Speaches API configuration issue");
    console.log("   - Audio content is background noise, not speech");
  } else {
    console.log("✅ SUCCESS: Speaches successfully transcribed the audio");
  }

  process.exit(hasReceivedTranscript ? 0 : 1);
});

function sendAudio() {
  console.log("\n📤 Sending audio data...");

  // Read audio file
  const audioBuffer = fs.readFileSync(audioFile);

  // Skip WAV header (44 bytes)
  const pcmData = audioBuffer.slice(44);

  console.log(`   Total PCM data: ${pcmData.length} bytes`);
  console.log(
    `   Duration: ${(pcmData.length / (24000 * 2)).toFixed(2)} seconds`
  );

  // Send in chunks
  const CHUNK_SIZE = 4800; // 200ms at 24kHz
  let offset = 0;
  let chunksSent = 0;

  const sendInterval = setInterval(() => {
    if (offset >= pcmData.length) {
      clearInterval(sendInterval);
      console.log(`\n   ✅ Sent ${chunksSent} audio chunks`);

      // Commit the audio buffer
      console.log("\n📤 Committing audio buffer...");
      ws.send(
        JSON.stringify({
          type: "input_audio_buffer.commit",
        })
      );

      // Wait for transcription, then close
      setTimeout(() => {
        console.log("\n⏰ Timeout - closing connection...");
        ws.close();
      }, 15000); // Wait 15 seconds for transcription

      return;
    }

    const chunk = pcmData.slice(offset, offset + CHUNK_SIZE);
    const base64Audio = chunk.toString("base64");

    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      })
    );

    chunksSent++;
    offset += CHUNK_SIZE;

    // Progress
    if (chunksSent % 10 === 0) {
      const progress = Math.min(
        100,
        Math.round((offset / pcmData.length) * 100)
      );
      process.stdout.write(`\r   Progress: ${progress}%   `);
    }
  }, 200); // Send every 200ms
}

// Timeout safety
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log("\n⏰ Overall timeout - closing");
    ws.close();
  }
}, 30000); // 30 second overall timeout
