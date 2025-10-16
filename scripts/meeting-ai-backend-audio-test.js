#!/usr/bin/env node
/* eslint-disable no-console, no-empty, no-unused-vars, curly */

/*
  Meeting AI backend audio test
  - Streams an existing PCM16 mono 24kHz file to ws://<host>/meeting-ai
  - Mimics the frontend (8192-sample chunk cadence), prints partial/final transcripts

  Defaults
    file: tmp/mic_test_24k_mono.pcm
    host: localhost:3030
    rate: 24000
    chunk: 8192 samples

  Auth
    --dev    send x-dev-api-key: dev_test_key header
    --token=YOUR_ACCESS_TOKEN  send Cookie: accessToken=...

  Usage examples
    node scripts/meeting-ai-backend-audio-test.js --dev
    node scripts/meeting-ai-backend-audio-test.js --host=localhost:3031 --file=tmp/mic_test_24k_mono.pcm
*/

const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

// Parse args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.split("=");
  acc[k.replace(/^--/, "")] = v === undefined ? true : v;
  return acc;
}, {});

const HOST = args.host || "localhost:3030";
const PCM_PATH =
  args.file ||
  path.join(process.cwd(), "tests/fixtures/audio/mic_test_24k_mono.pcm");
const SAMPLE_RATE = parseInt(args.rate || "24000", 10);
const SAMPLES_PER_CHUNK = parseInt(args.chunk || "8192", 10);
const USE_DEV = !!args.dev;
const ACCESS_TOKEN = args.token || null;
const LANGUAGE = args.lang || "auto";

async function run() {
  if (!fs.existsSync(PCM_PATH)) {
    console.error(`[err] PCM file not found: ${PCM_PATH}`);
    process.exit(1);
  }

  const pcm = fs.readFileSync(PCM_PATH);
  const url = `ws://${HOST}/meeting-ai`;

  const headers = {};
  if (ACCESS_TOKEN) headers["Cookie"] = `accessToken=${ACCESS_TOKEN}`;
  else if (USE_DEV) headers["x-dev-api-key"] = "dev_test_key";

  console.log(`[ws] Connecting to ${url} ...`);
  const ws = new WebSocket(url, { headers, perMessageDeflate: false });

  let connected = false;
  let ready = false;
  let streaming = false;
  let offset = 0;
  let timer = null;
  let transcripts = [];

  function stopStreaming() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    streaming = false;
  }

  ws.on("open", () => {
    connected = true;
    console.log("[ws] open");
    // ask server to start session; we will wait for 'ready' before streaming
    ws.send(JSON.stringify({ type: "start", language: LANGUAGE }));
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case "connected":
          console.log("[ws] connected (auth ok)");
          break;
        case "ready":
          console.log("[ws] ready (server prepared)");
          ready = true;
          if (!streaming) beginStreaming();
          break;
        case "partial-transcript":
          if (Array.isArray(msg.segments)) {
            msg.segments.forEach((s) => {
              console.log(`[partial] ${s.speaker}: ${s.text}`);
              transcripts.push(s);
            });
          }
          break;
        case "final-transcript":
          console.log("[final] segments:", msg.segments?.length || 0);
          break;
        case "stopped":
          console.log("[ws] stopped");
          break;
        case "error":
          console.error("[ws] error", msg.code, "-", msg.message);
          break;
        default:
          // console.log('[ws] evt', msg.type);
          break;
      }
    } catch (_) {
      // ignore non-JSON
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`[ws] close code=${code} reason=${reason || ""}`);
    stopStreaming();
    printSummary();
    process.exit(0);
  });

  ws.on("error", (err) => {
    console.error("[ws] error", err.message || err);
  });

  function beginStreaming() {
    if (streaming) return;
    streaming = true;

    const BYTES_PER_SAMPLE = 2;
    const CHUNK_BYTES = SAMPLES_PER_CHUNK * BYTES_PER_SAMPLE;
    const intervalMs = Math.max(
      30,
      Math.round((SAMPLES_PER_CHUNK / SAMPLE_RATE) * 1000)
    );
    console.log(
      `[ws] streaming ${pcm.length} bytes in ${CHUNK_BYTES}-byte chunks (~${intervalMs}ms)`
    );

    timer = setInterval(() => {
      if (offset >= pcm.length) {
        stopStreaming();
        console.log("[ws] sending stop");
        try {
          ws.send(JSON.stringify({ type: "stop" }));
        } catch (_) {}
        return;
      }
      const end = Math.min(offset + CHUNK_BYTES, pcm.length);
      const chunk = pcm.subarray(offset, end);
      offset = end;
      try {
        ws.send(chunk);
      } catch (e) {
        console.error("[ws] send error", e.message || e);
        stopStreaming();
      }
    }, intervalMs);
  }

  function printSummary() {
    const text = transcripts.map((s) => s.text).join(" ");
    console.log("\n=== Transcript (merged) ===");
    console.log(text || "(empty)");
  }

  // Safety timeout
  setTimeout(() => {
    console.log("[ws] timeout; closing");
    try {
      ws.close(1000, "timeout");
    } catch (_) {}
  }, 30000);
}

run().catch((e) => {
  console.error("[fatal]", e.message || e);
  process.exit(1);
});
