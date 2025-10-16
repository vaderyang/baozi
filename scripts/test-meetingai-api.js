#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Test script for Meeting AI WebSocket API endpoint
 * Tests /meeting-ai endpoint with test audio file
 *
 * Usage:
 *   node scripts/test-meetingai-api.js [audio-file] [options]
 *
 * Options:
 *   --mock         Use mock mode (no real OpenAI API calls)
 *   --host         WebSocket host (default: localhost:3030)
 *   --language     Language code for transcription (e.g., en, zh)
 *
 * Examples:
 *   node scripts/test-meetingai-api.js
 *   node scripts/test-meetingai-api.js test-audio/test-voice.wav --mock
 *   node scripts/test-meetingai-api.js test-audio/test-voice.wav --language=en
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  audioFile:
    args.find((arg) => !arg.startsWith("--")) ||
    path.join(__dirname, "../test-audio/test-voice.wav"),
  mock: args.includes("--mock"),
  host:
    args.find((arg) => arg.startsWith("--host="))?.split("=")[1] ||
    "localhost:3030",
  language: args.find((arg) => arg.startsWith("--language="))?.split("=")[1], // undefined = auto-detect
};

const WS_URL = `ws://${options.host}/meeting-ai`;

console.log("🎤 Meeting AI API Test");
console.log("═══════════════════════════════════════════════\n");
console.log(`📁 Audio file: ${options.audioFile}`);
console.log(`📍 Endpoint: ${WS_URL}`);
console.log(`🌐 Language: ${options.language || "auto-detect"}`);
console.log(
  `${options.mock ? "🎭 Mode: MOCK" : "🔴 Mode: REAL (OpenAI API)"}\n`
);

// Check if audio file exists
if (!fs.existsSync(options.audioFile)) {
  console.error("❌ Audio file not found:", options.audioFile);
  console.error(
    "\nUsage: node scripts/test-meetingai-api.js [audio-file] [options]"
  );
  console.error("Options:");
  console.error("  --mock         Use mock mode");
  console.error("  --host=HOST    WebSocket host (default: localhost:3030)");
  console.error("  --language=LG  Language code (default: en)");
  process.exit(1);
}

// Test state
let ws = null;
let sessionStartTime = 0;
let transcriptSegments = [];
let finalTranscript = null;
let isConnected = false;
let isReady = false;
let connectionResolver = null;

/**
 * Connect to Meeting AI WebSocket
 */
async function connectToMeetingAI() {
  return new Promise((resolve, reject) => {
    console.log("🔌 Connecting to Meeting AI endpoint...\n");

    // Headers for authentication and mock mode
    const headers = {
      "x-dev-api-key": "dev_test_key", // Dev bypass authentication
    };

    if (options.mock) {
      headers["x-meetingai-mock"] = "1";
    }

    ws = new WebSocket(WS_URL, { headers });

    const timeout = setTimeout(() => {
      if (!isConnected) {
        console.error("❌ Connection timeout after 10 seconds");
        reject(new Error("Connection timeout"));
      }
    }, 10000);

    ws.on("open", () => {
      clearTimeout(timeout);
      console.log("✅ WebSocket connection established\n");
    });

    // Store the resolver for later use
    connectionResolver = resolve;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleServerMessage(message);
      } catch (err) {
        console.error("❌ Failed to parse server message:", err.message);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      console.error("❌ WebSocket error:", error.message);
      console.error("   Error details:", error);
      reject(error);
    });

    ws.on("close", (code, reason) => {
      clearTimeout(timeout);
      console.log(
        `\n🔌 Connection closed (code: ${code}, reason: ${reason || "N/A"})`
      );
    });
  });
}

/**
 * Handle messages from the server
 */
function handleServerMessage(message) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);

  switch (message.type) {
    case "connected":
      isConnected = true;
      console.log(`[${timestamp}] ✅ Connected - Server ready for session\n`);
      // Resolve the connection promise
      if (connectionResolver) {
        connectionResolver();
        connectionResolver = null;
      }
      break;

    case "ready":
      isReady = true;
      console.log(`[${timestamp}] 🟢 Server ready - Can start sending audio\n`);
      break;

    case "partial-transcript":
      if (message.segments && message.segments.length > 0) {
        message.segments.forEach((seg) => {
          transcriptSegments.push(seg);
          const duration = ((seg.endMs - seg.startMs) / 1000).toFixed(1);
          console.log(`[${timestamp}] 📝 Partial transcript:`);
          console.log(`   Speaker: ${seg.speaker}`);
          console.log(
            `   Time: ${(seg.startMs / 1000).toFixed(1)}s - ${(seg.endMs / 1000).toFixed(1)}s (${duration}s)`
          );
          console.log(`   Text: "${seg.text}"\n`);
        });
      }
      break;

    case "final-transcript":
      console.log(`[${timestamp}] 🎯 Final transcript received\n`);
      finalTranscript = message.segments;
      break;

    case "speaker-updates":
      console.log(`[${timestamp}] 👥 Speaker updates received\n`);
      break;

    case "stopped":
      console.log(`[${timestamp}] ⏹️  Session stopped\n`);
      break;

    case "error":
      console.error(`[${timestamp}] ❌ Server error:`);
      console.error(`   Code: ${message.code}`);
      console.error(`   Message: ${message.message}\n`);
      break;

    default:
      console.log(`[${timestamp}] 📨 Unknown message type: ${message.type}`);
  }
}

/**
 * Start a Meeting AI session
 */
async function startSession() {
  console.log("▶️  Starting Meeting AI session...\n");

  const startMessage = {
    type: "start",
    language: options.language,
  };

  ws.send(JSON.stringify(startMessage));
  sessionStartTime = Date.now();

  // Wait for 'ready' message before sending audio (real mode only)
  if (!options.mock) {
    console.log("⏳ Waiting for server ready signal...\n");
    await waitForReady();
  }
}

/**
 * Wait for server to be ready
 */
async function waitForReady() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (isReady) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!isReady) {
        console.warn("⚠️  Server ready timeout, proceeding anyway...\n");
      }
      resolve();
    }, 5000);
  });
}

/**
 * Send audio file to the server
 */
async function sendAudioFile() {
  console.log("📤 Sending audio file...\n");

  // Read audio file
  const audioBuffer = fs.readFileSync(options.audioFile);

  // Skip WAV header (44 bytes) if it's a standard WAV file
  const pcmData = audioBuffer.slice(44);

  // Calculate audio duration: bytes / (sample_rate * channels * bytes_per_sample)
  // Assume PCM16, 24kHz, mono (standard for Meeting AI)
  const audioDurationSec = pcmData.length / (24000 * 1 * 2);

  console.log(`📦 PCM data: ${pcmData.length} bytes`);
  console.log(`⏱️  Audio duration: ${audioDurationSec.toFixed(2)}s\n`);

  // Send audio in chunks to simulate real-time streaming
  const CHUNK_SIZE = 4800; // ~200ms of audio at 24kHz (24000 samples/sec * 0.2sec * 2 bytes/sample)
  let offset = 0;
  let chunkCount = 0;

  return new Promise((resolve) => {
    const sendInterval = setInterval(() => {
      if (offset >= pcmData.length) {
        clearInterval(sendInterval);
        console.log(
          `\n✅ Audio transmission complete (${chunkCount} chunks sent)\n`
        );
        resolve();
        return;
      }

      const chunk = pcmData.slice(offset, offset + CHUNK_SIZE);

      // Send as binary data (ArrayBuffer)
      try {
        ws.send(chunk);
        chunkCount++;
        offset += CHUNK_SIZE;

        // Progress indicator
        const progress = Math.min(
          100,
          Math.round((offset / pcmData.length) * 100)
        );
        process.stdout.write(`\r📊 Sending audio: ${progress}%   `);
      } catch (err) {
        console.error(`\n❌ Error sending chunk ${chunkCount}:`, err.message);
      }
    }, 200); // Send chunk every 200ms (matches chunk size for real-time simulation)
  });
}

/**
 * Stop the Meeting AI session
 */
async function stopSession() {
  console.log("⏹️  Stopping session...\n");

  const stopMessage = {
    type: "stop",
  };

  ws.send(JSON.stringify(stopMessage));

  // Wait for 'stopped' message
  await new Promise((resolve) => {
    setTimeout(resolve, 3000); // Wait up to 3 seconds for final transcript
  });
}

/**
 * Display test results
 */
function displayResults() {
  console.log("═══════════════════════════════════════════════");
  console.log("📊 Test Results");
  console.log("═══════════════════════════════════════════════\n");

  const totalDurationMs = Date.now() - sessionStartTime;
  const totalDurationSec = totalDurationMs / 1000;

  console.log(`⏱️  Total session duration: ${totalDurationSec.toFixed(2)}s\n`);

  // Display transcript segments
  const segments = finalTranscript || transcriptSegments;

  if (segments.length === 0) {
    console.log("⚠️  No transcript segments received\n");
    if (!options.mock) {
      console.log("💡 Suggestions:");
      console.log(
        "   - Check if OPENAI_API_KEY is configured in .env.development"
      );
      console.log("   - Verify the audio file contains speech");
      console.log("   - Try running with --mock flag to test connectivity\n");
    }
  } else {
    console.log(`✅ Received ${segments.length} transcript segment(s):\n`);

    segments.forEach((seg, i) => {
      const duration = ((seg.endMs - seg.startMs) / 1000).toFixed(1);
      console.log(
        `${i + 1}. [${(seg.startMs / 1000).toFixed(1)}s - ${(seg.endMs / 1000).toFixed(1)}s] (${duration}s)`
      );
      console.log(`   ${seg.speaker}: "${seg.text}"\n`);
    });

    // Combine all text
    const fullTranscript = segments.map((s) => s.text).join(" ");
    console.log("📄 Full transcript:");
    console.log(`   "${fullTranscript}"\n`);
  }

  console.log("═══════════════════════════════════════════════\n");
  console.log("✨ Test complete!\n");
}

/**
 * Main test flow
 */
async function runTest() {
  try {
    // Connect to WebSocket
    await connectToMeetingAI();

    // Start session
    await startSession();

    // In mock mode, wait for mock transcripts
    if (options.mock) {
      console.log(
        "⏳ Mock mode: waiting for simulated transcripts (5 seconds)...\n"
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      // Send audio file
      await sendAudioFile();

      // Wait a bit for processing
      console.log("⏳ Waiting for transcription to complete (5 seconds)...\n");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Stop session
    await stopSession();

    // Display results
    displayResults();

    // Close connection
    if (ws) {
      ws.close();
    }

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

// Run the test
runTest();
