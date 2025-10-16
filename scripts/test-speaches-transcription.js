#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Test Speaches /v1/audio/transcriptions endpoint (standard Whisper API)
 * This is a simpler HTTP POST endpoint that should work more reliably
 */

const fs = require("fs");
const FormData = require("form-data");
const http = require("http");

const audioFile =
  process.argv[2] || "test-audio/recording-2025-10-16T03-34-05-213Z.wav";
const model = process.argv[3] || "whisper-1";

if (!fs.existsSync(audioFile)) {
  console.error("❌ Audio file not found:", audioFile);
  process.exit(1);
}

console.log("🎤 Speaches Transcription API Test");
console.log("═══════════════════════════════════════════════\n");
console.log(`📁 Audio file: ${audioFile}`);
console.log(`🤖 Model: ${model}`);
console.log(`📍 Endpoint: http://172.16.11.67:8000/v1/audio/transcriptions\n`);

// Create form data
const form = new FormData();
form.append("file", fs.createReadStream(audioFile));
form.append("model", model);
// Note: Do NOT send language parameter, Speaches auto-detects when omitted
form.append("response_format", "verbose_json"); // Get detailed response

console.log("📤 Sending transcription request...\n");

const options = {
  hostname: "172.16.11.67",
  port: 8000,
  path: "/v1/audio/transcriptions",
  method: "POST",
  headers: form.getHeaders(),
};

const req = http.request(options, (res) => {
  console.log(`📥 Response status: ${res.statusCode}\n`);

  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    try {
      const result = JSON.parse(data);

      console.log("═══════════════════════════════════════════════");
      console.log("📊 Transcription Result");
      console.log("═══════════════════════════════════════════════\n");

      if (result.text) {
        console.log("✅ SUCCESS!\n");
        console.log(`📝 Text: "${result.text}"\n`);

        if (result.language) {
          console.log(`🌐 Detected language: ${result.language}`);
        }

        if (result.duration) {
          console.log(`⏱️  Duration: ${result.duration.toFixed(2)}s`);
        }

        if (result.segments && result.segments.length > 0) {
          console.log(`\n📑 Segments (${result.segments.length}):`);
          result.segments.forEach((seg, i) => {
            console.log(
              `\n  ${i + 1}. [${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s]`
            );
            console.log(`     "${seg.text}"`);
          });
        }

        console.log("\n═══════════════════════════════════════════════\n");
        console.log("✨ Transcription successful!\n");
        process.exit(0);
      } else if (result.error) {
        console.log("❌ ERROR from API:");
        console.log(JSON.stringify(result.error, null, 2));
        console.log("");
        process.exit(1);
      } else {
        console.log("⚠️  Unexpected response format:");
        console.log(JSON.stringify(result, null, 2));
        console.log("");
        process.exit(1);
      }
    } catch (err) {
      console.error("❌ Failed to parse response:", err.message);
      console.error("Raw response:", data);
      process.exit(1);
    }
  });
});

req.on("error", (error) => {
  console.error("❌ Request failed:", error.message);
  process.exit(1);
});

// Send the form data
form.pipe(req);
