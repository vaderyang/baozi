#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Debug version of test script for Speaches Realtime API with audio file
 * Fixes timing and audio format issues
 */

const WebSocket = require("ws");
const fs = require("fs");

// Configuration
const AUDIO_FILE_PATH = "test-audio/test-voice.wav";
const REALTIME_API_URL = "ws://localhost:8080/v1/realtime";
const MODEL = "whisper-small";
const CHUNK_SIZE = 1024 * 16; // 16KB chunks - smaller for better streaming

console.log("🎤 Speaches Realtime API Audio File Transcription Test (DEBUG)");
console.log(
  "═════════════════════════════════════════════════════════════════\n"
);
console.log(`📍 Endpoint: ${REALTIME_API_URL}`);
console.log(`🤖 Model: ${MODEL}`);
console.log(`🎵 Audio File: ${AUDIO_FILE_PATH}\n`);

let ws = null;
let sessionStartTime = 0;
let transcriptSegments = [];
let transcriptionReceived = false;
let connectionClosed = false;

// Audio file data
let audioChunks = [];
let currentChunkIndex = 0;
let chunksSent = 0;

/**
 * Read and process WAV audio file properly
 */
function readAudioFile(filePath) {
  console.log("📖 Reading audio file...");

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    // Read the entire audio file
    const audioBuffer = fs.readFileSync(filePath);
    console.log(`📊 Raw file size: ${audioBuffer.length} bytes`);

    // Check WAV header
    if (audioBuffer.length < 44) {
      throw new Error("File too small to be a valid WAV file");
    }

    // Parse WAV header to verify format
    const riffHeader = audioBuffer.toString("ascii", 0, 4);
    const waveHeader = audioBuffer.toString("ascii", 8, 12);

    if (riffHeader !== "RIFF" || waveHeader !== "WAVE") {
      throw new Error("Not a valid WAV file");
    }

    // Get audio format info from WAV header
    const audioFormat = audioBuffer.readUInt16LE(20);
    const numChannels = audioBuffer.readUInt16LE(22);
    const sampleRate = audioBuffer.readUInt32LE(24);
    const bitsPerSample = audioBuffer.readUInt16LE(34);

    console.log(
      `🔍 WAV Format: ${audioFormat === 1 ? "PCM" : "Compressed"}, ${numChannels} channels, ${sampleRate}Hz, ${bitsPerSample}-bit`
    );

    // Skip WAV header (44 bytes) and get only audio data
    const audioData = audioBuffer.slice(44);
    console.log(`🎵 Audio data size: ${audioData.length} bytes`);

    // Convert to base64
    const audioBase64 = audioData.toString("base64");
    console.log(`📊 Base64 encoded size: ${audioBase64.length} characters`);

    // Split into chunks
    const chunks = [];
    for (let i = 0; i < audioBase64.length; i += CHUNK_SIZE) {
      chunks.push(audioBase64.substring(i, i + CHUNK_SIZE));
    }

    console.log(`✅ Audio file processed: ${chunks.length} chunks created\n`);

    return chunks;
  } catch (error) {
    console.error("❌ Failed to read audio file:", error.message);
    throw error;
  }
}

/**
 * Connect to Speaches Realtime API WebSocket
 */
function connectRealtimeAPI() {
  return new Promise((resolve, reject) => {
    const wsUrl = `${REALTIME_API_URL}?model=${MODEL}&intent=transcription`;

    console.log(`🔗 Connecting to: ${wsUrl}`);

    ws = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      reject(new Error("Connection timeout"));
    }, 15000); // Increased timeout

    ws.on("open", () => {
      clearTimeout(timeout);
      console.log("✅ WebSocket connection established\n");
      sessionStartTime = Date.now();

      // Configure session for transcription with explicit language
      const sessionConfig = {
        type: "session.update",
        session: {
          modalities: ["text"],
          instructions: "Please transcribe the audio accurately.",
          input_audio_transcription: {
            model: "whisper-1",
            language: "en",
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
      connectionClosed = true;
      console.log("\n🔌 Connection closed:", code, reason || "");
    });
  });
}

/**
 * Stream audio chunks to the server
 */
function streamAudioChunks() {
  return new Promise((resolve) => {
    console.log("📤 Starting audio streaming...");

    const chunkInterval = setInterval(() => {
      if (currentChunkIndex >= audioChunks.length) {
        // All chunks sent
        clearInterval(chunkInterval);
        console.log("✅ All audio chunks sent\n");
        resolve();
        return;
      }

      // Send audio chunk
      const chunk = audioChunks[currentChunkIndex];
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: chunk,
          })
        );

        chunksSent++;
        currentChunkIndex++;

        // Log progress every 10 chunks
        if (chunksSent % 10 === 0) {
          console.log(`📊 Sent ${chunksSent}/${audioChunks.length} chunks`);
        }
      }
    }, 50); // Faster streaming - 50ms between chunks
  });
}

/**
 * Commit audio buffer to trigger transcription
 */
function commitAudioBuffer() {
  return new Promise((resolve, reject) => {
    console.log("💾 Committing audio buffer...");

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "input_audio_buffer.commit",
        })
      );

      console.log("✅ Audio buffer committed\n");
      resolve();
    } else {
      reject(new Error("WebSocket not open"));
    }
  });
}

/**
 * Handle incoming events from the server
 */
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

    case "input_audio_buffer.transcription":
      console.log("📝 Buffer transcription:", event.transcription);
      transcriptionReceived = true;
      break;

    case "input_audio_buffer.committed":
      console.log("✅ Audio buffer committed - transcription starting");
      break;

    case "error":
      console.error("❌ API Error:", JSON.stringify(event.error, null, 2));
      break;

    default:
      // Log unknown events with more detail
      console.log("   Full event:", JSON.stringify(event, null, 2));
      break;
  }
}

/**
 * Handle transcription completion
 */
function handleTranscription(event) {
  const transcript = event.transcript;
  if (!transcript || !transcript.trim()) {
    console.log("⚠️  Empty transcription received");
    return;
  }

  const endMs = Date.now() - sessionStartTime;

  const segment = {
    text: transcript,
    duration: (endMs / 1000).toFixed(1) + "s",
  };

  transcriptSegments.push(segment);
  transcriptionReceived = true;

  console.log("\n🎯 TRANSCRIPTION COMPLETED:");
  console.log("   Text: " + transcript);
  console.log(`   Language: ${event.language || "unknown"}`);
  console.log(`   Time: ${segment.duration}\n`);
}

/**
 * Wait for transcription with timeout
 */
function waitForTranscription(timeoutMs = 60000) {
  // 60 second timeout
  return new Promise((resolve) => {
    console.log(
      `⏳ Waiting for transcription (timeout: ${timeoutMs / 1000}s)...`
    );

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (transcriptionReceived) {
        clearInterval(checkInterval);
        console.log("✅ Transcription received!\n");
        resolve(true);
      } else if (connectionClosed || Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        if (connectionClosed) {
          console.log("⚠️  Connection closed before transcription received\n");
        } else {
          console.log("⏰ Timeout waiting for transcription\n");
        }
        resolve(false);
      }
    }, 1000); // Check every second
  });
}

/**
 * Main test function
 */
async function main() {
  try {
    // Read and process audio file
    audioChunks = readAudioFile(AUDIO_FILE_PATH);

    // Connect to Realtime API
    await connectRealtimeAPI();

    // Wait for session to be configured
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Stream audio chunks
    await streamAudioChunks();

    // Commit audio buffer
    await commitAudioBuffer();

    // Wait for transcription to complete (with longer timeout)
    const transcriptionSuccess = await waitForTranscription(60000);

    // Show results
    console.log("\n═══════════════════════════════════════════════");
    console.log("📊 Transcription Results");
    console.log("═══════════════════════════════════════════════\n");

    if (transcriptSegments.length === 0) {
      console.log("⚠️  No transcription received");
      console.log("   - Check server logs for details");
      console.log("   - Ensure audio format is PCM 16-bit, 24kHz mono");
      console.log("   - Connection may have closed too early");
    } else {
      console.log(
        `✅ Received ${transcriptSegments.length} transcription(s):\n`
      );
      transcriptSegments.forEach((seg, i) => {
        console.log(`${i + 1}. ${seg.text}`);
        console.log(`   (at ${seg.duration})\n`);
      });
    }

    console.log("✨ Speaches Realtime API transcription test complete!\n");

    // Close connection
    if (ws) {
      ws.close();
    }

    process.exit(transcriptionSuccess ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);

    // Cleanup
    if (ws) {
      ws.close();
    }

    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n\n⚠️  Test interrupted by user");

  if (ws) {
    ws.close();
  }

  process.exit(0);
});

main();
