#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Test Speaches Realtime API with pre-recorded audio file
 * Uses transcription-only mode as per Speaches documentation
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

// Configuration
const REALTIME_API_URL = "ws://172.16.11.67:8000/v1/realtime";
const TRANSCRIPTION_MODEL = process.argv[3] || "whisper-1"; // Default model
const AUDIO_FILE =
  process.argv[2] || path.join(__dirname, "../test-audio/test-voice.wav");

console.log("🎤 Speaches Realtime API Audio File Test");
console.log("═══════════════════════════════════════════════\n");
console.log(`📁 Audio File: ${AUDIO_FILE}`);
console.log(`📍 Endpoint: ${REALTIME_API_URL}`);
console.log(`🤖 Model: ${TRANSCRIPTION_MODEL}\n`);

// Check if file exists
if (!fs.existsSync(AUDIO_FILE)) {
  console.error("❌ Audio file not found:", AUDIO_FILE);
  console.error("Usage: node test-with-audio-file.js <path-to-audio-file>");
  process.exit(1);
}

let ws = null;
let transcriptions = [];
let performanceMetrics = [];
let sessionStartTime = 0;

async function testTranscription() {
  // Read audio file
  console.log("📖 Reading audio file...");
  const audioBuffer = fs.readFileSync(AUDIO_FILE);

  // Convert WAV to raw PCM16 24kHz mono
  // Skip WAV header (44 bytes) if it's a standard WAV file
  const pcmData = audioBuffer.slice(44);

  // Calculate audio duration: bytes / (sample_rate * channels * bytes_per_sample)
  // PCM16 = 2 bytes per sample, 24kHz, mono
  const audioDurationSeconds = pcmData.length / (24000 * 1 * 2);

  console.log(`📦 Audio data: ${pcmData.length} bytes`);
  console.log(
    `⏱️  Audio duration: ${audioDurationSeconds.toFixed(2)} seconds\n`
  );

  return new Promise((resolve, reject) => {
    // Use transcription-only mode as per Speaches documentation
    // Note: Do NOT send language=auto, Speaches doesn't support it. Omit for auto-detection.
    const wsUrl = `${REALTIME_API_URL}?model=${encodeURIComponent(TRANSCRIPTION_MODEL)}&intent=transcription`;

    console.log("🔌 Connecting to Realtime API...");
    ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: "Bearer dummy-key",
      },
    });

    const timeout = setTimeout(() => {
      console.error("❌ Connection timeout");
      reject(new Error("Connection timeout"));
    }, 10000);

    let isSessionReady = false;

    ws.on("open", () => {
      clearTimeout(timeout);
      sessionStartTime = Date.now();
      console.log("✅ Connected to Realtime API\n");

      // Session config - enable input_audio_transcription
      const sessionConfig = {
        type: "session.update",
        session: {
          modalities: ["text"], // Text only for transcription
          input_audio_transcription: {
            model: TRANSCRIPTION_MODEL,
          },
        },
      };

      ws.send(JSON.stringify(sessionConfig));
    });

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        handleEvent(event);
      } catch (err) {
        console.error("❌ Failed to parse event:", err.message);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      console.error("❌ WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", () => {
      console.log("\n🔌 Connection closed");
      resolve();
    });

    // Wait for session to be ready, then send audio
    const waitForSession = setInterval(() => {
      if (!isSessionReady) {
        return;
      }

      clearInterval(waitForSession);
      console.log("📤 Sending audio data...\n");

      // Send audio in chunks (simulating streaming)
      const CHUNK_SIZE = 4800; // ~200ms of audio at 24kHz
      let offset = 0;

      const sendInterval = setInterval(() => {
        if (offset >= pcmData.length) {
          clearInterval(sendInterval);

          // Commit the audio buffer to trigger transcription
          console.log("✅ Audio sent, committing buffer...\n");
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.commit",
            })
          );

          // Wait for transcription to complete
          console.log("⏳ Waiting for transcription (20s)...");
          setTimeout(() => {
            console.log("⏰ Timeout reached, closing connection");
            ws.close();
          }, 20000);

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

        offset += CHUNK_SIZE;
        process.stdout.write(
          `\r📊 Progress: ${Math.min(100, Math.round((offset / pcmData.length) * 100))}%   `
        );
      }, 200); // Send chunk every 200ms
    }, 100); // Check every 100ms
  });
}

function handleEvent(event) {
  const eventType = event.type;

  // Log ALL events for debugging
  console.log(`📨 Event: ${eventType}`);
  if (eventType === "error") {
    console.log("   Details:", JSON.stringify(event, null, 2));
  }

  // Handle important events
  switch (eventType) {
    case "session.created":
      console.log("✅ Session created");
      console.log(`   Session ID: ${event.session?.id || "N/A"}\n`);
      break;

    case "session.updated":
      console.log("✅ Session configured\n");
      isSessionReady = true;
      break;

    case "input_audio_buffer.speech_started": {
      console.log("\n🗣️  Speech detected");
      const speechStartTime = Date.now();
      if (!event._startTime) {
        event._startTime = speechStartTime;
      }
      break;
    }

    case "input_audio_buffer.speech_stopped":
      console.log("🤫 Speech stopped");
      break;

    case "input_audio_buffer.committed":
      console.log("✅ Audio buffer committed\n");
      break;

    case "conversation.item.created":
      console.log("📝 Conversation item created");
      console.log("   Full event:", JSON.stringify(event, null, 2));
      break;

    case "conversation.item.input_audio_transcription.completed": {
      const transcript = event.transcript;
      if (transcript && transcript.trim()) {
        const transcriptionCompleteTime = Date.now();
        const totalProcessingTime =
          transcriptionCompleteTime - sessionStartTime;

        transcriptions.push({
          text: transcript,
          processingTimeMs: totalProcessingTime,
        });

        performanceMetrics.push({
          transcript: transcript,
          processingTimeMs: totalProcessingTime,
          processingTimeSec: (totalProcessingTime / 1000).toFixed(2),
        });

        console.log("\n📝 Transcription received:");
        console.log('   "' + transcript + '"');
        console.log(
          `   ⚡ Processing time: ${(totalProcessingTime / 1000).toFixed(2)}s`
        );
      }
      break;
    }

    case "error":
      console.error("\n❌ API Error:", JSON.stringify(event.error, null, 2));
      break;

    default:
      // Silently ignore other events
      break;
  }
}

async function main() {
  try {
    await testTranscription();

    // Show results
    console.log("\n═══════════════════════════════════════════════");
    console.log("📊 Transcription Results");
    console.log("═══════════════════════════════════════════════\n");

    if (transcriptions.length === 0) {
      console.log("⚠️  No transcription received");
      console.log("   - Check if the audio file is valid");
      console.log("   - Verify the transcription model is available");
      console.log("   - Try with a different audio file");
    } else {
      console.log(`✅ Received ${transcriptions.length} transcription(s):\n`);
      transcriptions.forEach((item, i) => {
        console.log(`${i + 1}. "${item.text}"`);
        console.log(
          `   Processing time: ${(item.processingTimeMs / 1000).toFixed(2)}s\n`
        );
      });

      // Performance summary
      console.log("═══════════════════════════════════════════════");
      console.log("⚡ Performance Summary");
      console.log("═══════════════════════════════════════════════\n");

      // Calculate audio duration from file
      const audioBuffer = fs.readFileSync(AUDIO_FILE);
      const pcmData = audioBuffer.slice(44);
      const audioDurationSec = pcmData.length / (24000 * 1 * 2);

      console.log(`🎵 Total audio duration: ${audioDurationSec.toFixed(2)}s`);

      if (performanceMetrics.length > 0) {
        const avgProcessingTime =
          performanceMetrics.reduce((sum, m) => sum + m.processingTimeMs, 0) /
          performanceMetrics.length;
        const avgProcessingTimeSec = avgProcessingTime / 1000;
        const rtf = avgProcessingTimeSec / audioDurationSec; // Real-time factor

        console.log(
          `⏱️  Average processing time: ${avgProcessingTimeSec.toFixed(2)}s`
        );
        console.log(`📊 Real-time factor (RTF): ${rtf.toFixed(2)}x`);

        if (rtf < 1.0) {
          console.log(
            `✅ Faster than real-time! (${(1 / rtf).toFixed(2)}x speed)`
          );
        } else {
          console.log(`⚠️  Slower than real-time (${rtf.toFixed(2)}x)`);
        }
      }
      console.log("");
    }

    console.log("✨ Test complete!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    if (ws) {
      ws.close();
    }
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\n⚠️  Test interrupted");
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

main();
