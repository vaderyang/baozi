#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Record voice to audio file for testing
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const RECORD_DURATION = 15; // seconds - enough time for both phrases
const OUTPUT_DIR = path.join(__dirname, "../test-audio");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "test-voice.wav");

console.log("🎤 Voice Recording for Testing");
console.log("═══════════════════════════════════════════════\n");
console.log(`⏱️  Recording Duration: ${RECORD_DURATION} seconds`);
console.log(`📁 Output File: ${OUTPUT_FILE}\n`);

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log("✅ Created output directory\n");
}

console.log("🎙️  Starting recording...");
console.log("💬 Please say the following:\n");
console.log('   1. "Nice to meet you."');
console.log('   2. "很高兴遇见你."\n');
console.log("📢 Recording will start in 2 seconds...\n");

// Give user time to prepare
setTimeout(() => {
  console.log("🔴 RECORDING NOW!\n");

  // Use ffmpeg to record audio
  // Save as WAV file with PCM 16-bit, 24kHz mono (compatible with OpenAI)
  const ffmpeg = spawn("ffmpeg", [
    "-f",
    "avfoundation", // macOS audio input
    "-i",
    ":0", // Default microphone
    "-ar",
    "24000", // Sample rate 24kHz
    "-ac",
    "1", // Mono
    "-t",
    RECORD_DURATION.toString(), // Duration
    "-y", // Overwrite output file
    OUTPUT_FILE,
  ]);

  let hasError = false;

  ffmpeg.stderr.on("data", (data) => {
    const msg = data.toString();
    // FFmpeg outputs progress to stderr
    if (msg.includes("size=") && msg.includes("time=")) {
      // Show progress
      const timeMatch = msg.match(/time=(\d+:\d+:\d+)/);
      if (timeMatch) {
        process.stdout.write(`\r⏺️  Recording: ${timeMatch[1]}   `);
      }
    } else if (msg.includes("Error") || msg.includes("error")) {
      console.error("\n❌ FFmpeg error:", msg);
      hasError = true;
    }
  });

  ffmpeg.on("error", (error) => {
    console.error("\n❌ Failed to start recording:", error.message);
    console.error("🔧 Make sure ffmpeg is installed: brew install ffmpeg");
    process.exit(1);
  });

  ffmpeg.on("close", (code) => {
    console.log("\n\n⏹️  Recording stopped\n");

    if (code !== 0 || hasError) {
      console.error("❌ Recording failed with exit code:", code);
      process.exit(1);
    }

    // Check if file was created
    if (fs.existsSync(OUTPUT_FILE)) {
      const stats = fs.statSync(OUTPUT_FILE);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      console.log("✅ Recording saved successfully!");
      console.log(`📁 File: ${OUTPUT_FILE}`);
      console.log(`📊 Size: ${sizeMB} MB`);
      console.log(`⏱️  Duration: ${RECORD_DURATION} seconds\n`);

      console.log("✨ You can now use this file for testing:");
      console.log(`   node scripts/test-with-audio-file.js ${OUTPUT_FILE}\n`);
    } else {
      console.error("❌ Output file was not created");
      process.exit(1);
    }
  });
}, 2000);

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\n⚠️  Recording interrupted");
  process.exit(0);
});
