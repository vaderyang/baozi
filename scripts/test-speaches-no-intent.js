#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Test Speaches API WITHOUT intent=transcription parameter
 * Maybe this parameter is causing issues
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
const url = `ws://172.16.11.67:8000/v1/realtime?model=${encodeURIComponent(model)}`;

console.log("🧪 Speaches Test (NO intent parameter)");
console.log("═══════════════════════════════════════════════\n");
console.log(`📁 Audio: ${audioFile}`);
console.log(`🌐 URL: ${url}\n`);

let transcripts = [];

const ws = new WebSocket(url, {
  headers: { Authorization: "Bearer dummy-key" },
});

ws.on("open", () => {
  console.log("✅ Connected\n");

  // Try WITHOUT modalities setting
  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        input_audio_transcription: { model },
      },
    })
  );
});

ws.on("message", (data) => {
  const event = JSON.parse(data.toString());
  console.log(`📥 ${event.type}`);

  if (event.type === "session.updated") {
    setTimeout(sendAudio, 500);
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const text = event.transcript || "";
    transcripts.push(text);
    console.log(`   📝 Transcript: "${text}"`);
  }

  if (event.item?.content?.[0]?.transcript) {
    const text = event.item.content[0].transcript;
    transcripts.push(text);
    console.log(`   📝 Transcript: "${text}"`);
  }
});

ws.on("close", () => {
  console.log("\n═══════════════════════════════════════════════");
  console.log(`Transcripts received: ${transcripts.length}`);
  transcripts.forEach((t, i) => {
    console.log(`  ${i + 1}. "${t}"`);
  });
  console.log("═══════════════════════════════════════════════\n");
});

function sendAudio() {
  const audioBuffer = fs.readFileSync(audioFile);
  const pcmData = audioBuffer.slice(44);

  console.log("📤 Sending audio...\n");

  const CHUNK_SIZE = 4800;
  let offset = 0;

  const interval = setInterval(() => {
    if (offset >= pcmData.length) {
      clearInterval(interval);
      console.log("\n📤 Committing...");
      ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      setTimeout(() => ws.close(), 15000);
      return;
    }

    const chunk = pcmData.slice(offset, offset + CHUNK_SIZE);
    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: chunk.toString("base64"),
      })
    );

    offset += CHUNK_SIZE;
  }, 200);
}

setTimeout(() => ws.readyState === 1 && ws.close(), 30000);
