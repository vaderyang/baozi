#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Test script for OpenAI Realtime API with microphone input
 * Mimics the meetingAI service to verify transcription functionality
 */

const WebSocket = require("ws");
const { spawn } = require("child_process");

const REALTIME_API_URL = "ws://172.16.11.67:8000/v1/realtime";
const MODEL = "gpt-4o-realtime-preview-2024-12-17";
const RECORD_DURATION = 10; // seconds

console.log("🎤 OpenAI Realtime API Voice Transcription Test");
console.log("═══════════════════════════════════════════════\n");
console.log(`📍 Endpoint: ${REALTIME_API_URL}`);
console.log(`🤖 Model: ${MODEL}`);
console.log(`⏱️  Recording Duration: ${RECORD_DURATION} seconds\n`);

let ws = null;
let sessionStartTime = 0;
let transcriptSegments = [];
let ffmpegProcess = null;

// Connect to OpenAI Realtime API
function connectRealtimeAPI() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`${REALTIME_API_URL}?model=${MODEL}`, {
      headers: {
        Authorization: "Bearer dummy-key",
        "OpenAI-Beta": "realtime=v1",
      },
    });

    const timeout = setTimeout(() => {
      reject(new Error("Connection timeout"));
    }, 10000);

    ws.on("open", () => {
      clearTimeout(timeout);
      console.log("✅ WebSocket connection established\n");
      sessionStartTime = Date.now();

      // Configure session for audio transcription
      const sessionConfig = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions:
            "You are a meeting transcription assistant. Transcribe the audio accurately.",
          voice: "alloy",
          input_audio_transcription: {
            model: "whisper-1",
          },
        },
      };

      ws.send(JSON.stringify(sessionConfig));
      resolve();
    });

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        handleRealtimeEvent(event);
      } catch (err) {
        console.error("❌ Failed to parse event:", err.message);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      console.error("❌ WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", (code, reason) => {
      console.log("\n🔌 Connection closed:", code, reason || "");
    });
  });
}

function handleRealtimeEvent(event) {
  // Log all events for debugging
  console.log(`📨 Event: ${event.type}`);

  switch (event.type) {
    case "session.created":
      console.log("✅ Session created");
      console.log(`   Session ID: ${event.session?.id || "N/A"}\n`);
      break;

    case "session.updated":
      console.log("✅ Session configured for transcription\n");
      break;

    case "input_audio_buffer.speech_started":
      console.log("🗣️  Speech detected by VAD");
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("🤫 Speech stopped");
      break;

    case "conversation.item.input_audio_transcription.completed":
      handleTranscription(event);
      break;

    case "input_audio_buffer.committed":
      console.log("✅ Audio buffer committed");
      break;

    case "response.audio_transcript.delta":
    case "response.audio_transcript.done":
    case "response.done":
      // Log but handle separately
      if (event.delta) {
        console.log("   Delta:", event.delta);
      }
      if (event.transcript) {
        console.log("   Transcript:", event.transcript);
      }
      break;

    case "error":
      console.error("❌ API Error:", JSON.stringify(event.error, null, 2));
      break;

    default:
      // Log unknown events
      break;
  }
}

function handleTranscription(event) {
  const transcript = event.transcript;
  if (!transcript || !transcript.trim()) {
    return;
  }

  const endMs = Date.now() - sessionStartTime;

  const segment = {
    text: transcript,
    duration: (endMs / 1000).toFixed(1) + "s",
  };

  transcriptSegments.push(segment);

  console.log("\n📝 Transcription:");
  console.log("   " + transcript);
  console.log(`   (at ${segment.duration})`);
}

// Start recording from microphone and stream to OpenAI
function startRecording() {
  return new Promise((resolve, reject) => {
    console.log("🎙️  Starting microphone recording...");
    console.log(`💬 Please speak for ${RECORD_DURATION} seconds...\n`);

    // Use ffmpeg to capture audio from default microphone
    // Output: PCM 16-bit, 24kHz mono (required by OpenAI Realtime API)
    ffmpegProcess = spawn("ffmpeg", [
      "-f",
      "avfoundation", // macOS audio input
      "-i",
      ":0", // Default microphone
      "-ar",
      "24000", // Sample rate 24kHz
      "-ac",
      "1", // Mono
      "-f",
      "s16le", // PCM 16-bit little-endian
      "-", // Output to stdout
    ]);

    let isRecording = true;
    let chunkCount = 0;

    ffmpegProcess.stdout.on("data", (chunk) => {
      if (!isRecording) {
        return;
      }

      // Send audio chunk to OpenAI
      if (ws && ws.readyState === WebSocket.OPEN) {
        const base64Audio = chunk.toString("base64");
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64Audio,
          })
        );

        // Commit every 30 chunks (~1 second of audio) to trigger transcription
        chunkCount++;
        if (chunkCount % 30 === 0) {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.commit",
            })
          );
          console.log("💾 Buffer committed");
        }
      }
    });

    ffmpegProcess.stderr.on("data", (data) => {
      // FFmpeg outputs logs to stderr, ignore most of them
      const msg = data.toString();
      if (msg.includes("Error") || msg.includes("error")) {
        console.error("FFmpeg error:", msg);
      }
    });

    ffmpegProcess.on("error", (error) => {
      console.error("❌ Failed to start recording:", error.message);
      console.error("\n🔧 Make sure ffmpeg is installed: brew install ffmpeg");
      reject(error);
    });

    // Stop recording after duration
    setTimeout(() => {
      isRecording = false;
      console.log("\n⏹️  Stopping recording...\n");

      // Commit the audio buffer
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.commit",
          })
        );
      }

      // Kill ffmpeg process
      if (ffmpegProcess) {
        ffmpegProcess.kill("SIGTERM");
      }

      // Wait a bit for final transcription
      setTimeout(() => {
        resolve();
      }, 2000);
    }, RECORD_DURATION * 1000);
  });
}

// Main function
async function main() {
  try {
    // Connect to Realtime API
    await connectRealtimeAPI();

    // Start recording
    await startRecording();

    // Show results
    console.log("\n═══════════════════════════════════════════════");
    console.log("📊 Transcription Results");
    console.log("═══════════════════════════════════════════════\n");

    if (transcriptSegments.length === 0) {
      console.log("⚠️  No transcription received");
      console.log("   - Try speaking louder or closer to the microphone");
      console.log("   - Check if VAD settings are appropriate");
    } else {
      console.log(`✅ Received ${transcriptSegments.length} segment(s):\n`);
      transcriptSegments.forEach((seg, i) => {
        console.log(`${i + 1}. ${seg.text}`);
        console.log(`   (at ${seg.duration})\n`);
      });
    }

    console.log("✨ OpenAI Realtime API transcription test complete!\n");

    // Close connection
    if (ws) {
      ws.close();
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);

    // Cleanup
    if (ffmpegProcess) {
      ffmpegProcess.kill("SIGTERM");
    }
    if (ws) {
      ws.close();
    }

    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n\n⚠️  Test interrupted by user");

  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGTERM");
  }
  if (ws) {
    ws.close();
  }

  process.exit(0);
});

main();
