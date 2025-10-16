#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Simplified test using conversation.item.create + response.create
 * to test transcription functionality
 */

const WebSocket = require("ws");
const { spawn } = require("child_process");

const REALTIME_API_URL = "ws://172.16.11.67:8000/v1/realtime";
const MODEL = "gpt-4o-realtime-preview-2024-12-17";
const RECORD_DURATION = 5; // seconds

console.log("🎤 OpenAI Realtime API Transcription Test (via response.create)");
console.log("═══════════════════════════════════════════════\n");

let ws = null;
let audioBuffer = [];
let ffmpegProcess = null;

function connectRealtimeAPI() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`${REALTIME_API_URL}?model=${MODEL}`, {
      headers: {
        Authorization: "Bearer dummy-key",
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("open", () => {
      console.log("✅ Connected to Realtime API\n");

      // Simple session config
      const sessionConfig = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: "Transcribe the audio input.",
          voice: "alloy",
        },
      };

      ws.send(JSON.stringify(sessionConfig));
      resolve();
    });

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        console.log(`📨 ${event.type}`);

        if (event.type === "error") {
          console.error("❌ Error:", JSON.stringify(event.error, null, 2));
        }

        if (event.type === "response.audio_transcript.delta") {
          console.log("📝 Transcript delta:", event.delta);
        }

        if (event.type === "response.audio_transcript.done") {
          console.log("\n✅ Full transcript:", event.transcript);
        }

        if (
          event.type === "conversation.item.input_audio_transcription.completed"
        ) {
          console.log("\n✅ Input transcription:", event.transcript);
        }
      } catch (err) {
        console.error("Parse error:", err.message);
      }
    });

    ws.on("error", reject);
  });
}

function recordAudio() {
  return new Promise((resolve, reject) => {
    console.log(`🎙️  Recording for ${RECORD_DURATION} seconds...`);
    console.log("💬 Please speak now!\n");

    ffmpegProcess = spawn("ffmpeg", [
      "-f",
      "avfoundation",
      "-i",
      ":0",
      "-ar",
      "24000",
      "-ac",
      "1",
      "-f",
      "s16le",
      "-",
    ]);

    ffmpegProcess.stdout.on("data", (chunk) => {
      audioBuffer.push(chunk);
    });

    ffmpegProcess.stderr.on("data", () => {
      /* ignore logs */
    });

    ffmpegProcess.on("error", (error) => {
      console.error("❌ FFmpeg error:", error.message);
      reject(error);
    });

    setTimeout(() => {
      ffmpegProcess.kill("SIGTERM");
      console.log("⏹️  Recording complete\n");
      resolve();
    }, RECORD_DURATION * 1000);
  });
}

async function main() {
  try {
    await connectRealtimeAPI();
    await recordAudio();

    // Combine all audio chunks
    const fullAudio = Buffer.concat(audioBuffer);
    const base64Audio = fullAudio.toString("base64");

    console.log(`📦 Captured ${fullAudio.length} bytes of audio`);
    console.log("📤 Sending to API...\n");

    // Create conversation item with audio
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_audio",
              audio: base64Audio,
            },
          ],
        },
      })
    );

    // Request response which will trigger transcription
    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text"],
        },
      })
    );

    // Wait for transcription
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("\n✨ Test complete\n");
    ws.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    if (ffmpegProcess) {
      ffmpegProcess.kill("SIGTERM");
    }
    if (ws) {
      ws.close();
    }
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  console.log("\n\n⚠️  Interrupted");
  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGTERM");
  }
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

main();
