#!/usr/bin/env node
/* eslint-disable no-console, no-empty, no-unused-vars */

/*
  OpenAI Realtime mic test (macOS focus)
  - Records ~6 seconds of microphone audio (16-bit PCM, mono, 24kHz)
  - Sends it to OpenAI Realtime via WebSocket replicating backend flow
  - Prints the transcribed text so you can verify EN/中文 recognition

  Requirements:
  - Environment variable: OPENAI_API_KEY
  - macOS with ffmpeg installed (brew install ffmpeg). If not found, script will try sox.

  Usage:
    OPENAI_API_KEY=... node scripts/openai-realtime-mic-test.js
*/

const fs = require("fs");
const { spawnSync, spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const DURATION_SEC = 6; // Say "Nice to meet you" and "很高兴遇见你" within this time
const SAMPLE_RATE = 24000;
const DEFAULT_DIR = path.join(process.cwd(), "tests/fixtures/audio");
const TMP_DIR = path.join(process.cwd(), "tmp");
const WAV_PATH = path.join(DEFAULT_DIR, "mic_test_24k_mono.wav");
const PCM_PATH = path.join(DEFAULT_DIR, "mic_test_24k_mono.pcm");

function ensureTmp() {
  if (!fs.existsSync(DEFAULT_DIR))
    {fs.mkdirSync(DEFAULT_DIR, { recursive: true });}
  if (!fs.existsSync(TMP_DIR)) {fs.mkdirSync(TMP_DIR, { recursive: true });}
}

function hasCmd(cmd) {
  const r = spawnSync(
    "bash",
    ["-lc", `command -v ${cmd} >/dev/null 2>&1 && echo yes || echo no`],
    { encoding: "utf8" }
  );
  return (r.stdout || "").trim() === "yes";
}

function recordWithFfmpegMac() {
  // Use avfoundation default input (:0). Some systems might need index changes.
  // Capture raw s16le and also produce a wav copy for later reference.
  // We record PCM directly to file; we also generate WAV via a second pass.
  console.log("[rec] Using ffmpeg (avfoundation) for ~6s... Please speak now");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "avfoundation",
    "-i",
    ":0",
    "-t",
    String(DURATION_SEC),
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "1",
    "-f",
    "s16le",
    PCM_PATH,
  ];
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0)
    {throw new Error(
      "ffmpeg recording failed. Try allowing mic permission or adjusting input index."
    );}

  // Create WAV from PCM for convenience (in tests/fixtures/audio)
  const conv = spawnSync(
    "ffmpeg",
    [
      "-f",
      "s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "1",
      "-i",
      PCM_PATH,
      "-y",
      WAV_PATH,
    ],
    { stdio: "inherit" }
  );
  if (conv.status !== 0) {
    console.warn("[rec] Failed to write WAV file, continuing with PCM only");
  }
}

function recordWithSoxMac() {
  // sox -d -r 24000 -c 1 -b 16 -e signed-integer out.wav trim 0 6
  console.log("[rec] Using sox (coreaudio) for ~6s... Please speak now");
  const r = spawnSync(
    "sox",
    [
      "-t",
      "coreaudio",
      "default",
      "-r",
      String(SAMPLE_RATE),
      "-c",
      "1",
      "-b",
      "16",
      "-e",
      "signed-integer",
      WAV_PATH,
      "trim",
      "0",
      String(DURATION_SEC),
    ],
    { stdio: "inherit" }
  );
  if (r.status !== 0) {throw new Error("sox recording failed");}

  // Convert to raw PCM s16le
  const conv = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      WAV_PATH,
      "-f",
      "s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "1",
      "-y",
      PCM_PATH,
    ],
    { stdio: "inherit" }
  );
  if (conv.status !== 0) {throw new Error("ffmpeg conversion to PCM failed");}
}

async function recordMic() {
  ensureTmp();
  if (fs.existsSync(PCM_PATH)) {fs.unlinkSync(PCM_PATH);}
  if (fs.existsSync(WAV_PATH)) {fs.unlinkSync(WAV_PATH);}

  const isMac = process.platform === "darwin";
  if (!isMac)
    {throw new Error("This script currently targets macOS with ffmpeg/sox.");}

  if (hasCmd("ffmpeg")) {
    recordWithFfmpegMac();
  } else if (hasCmd("sox")) {
    recordWithSoxMac();
  } else {
    throw new Error(
      "Neither ffmpeg nor sox found. Please install ffmpeg (brew install ffmpeg)."
    );
  }

  if (!fs.existsSync(PCM_PATH))
    {throw new Error("Recording did not produce PCM file");}
  console.log(
    `[rec] Saved: ${PCM_PATH}${fs.existsSync(WAV_PATH) ? `, ${WAV_PATH}` : ""}`
  );
}

function base64OfFile(p) {
  const buf = fs.readFileSync(p);
  return buf.toString("base64");
}

async function sendToOpenAIRealtime({ streamLikeFrontend = true } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {throw new Error("OPENAI_API_KEY env not set");}

  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
  const url = `wss://api.openai.com/v1/realtime?model=${model}`;

  console.log(`[ws] Connecting to ${url}`);
  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  console.log("[ws] Connected. Configuring session...");
  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    })
  );

  const pcm = fs.readFileSync(PCM_PATH);
  if (!streamLikeFrontend) {
    // Single append
    const b64 = pcm.toString("base64");
    console.log("[ws] Sending single audio buffer...");
    ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
  } else {
    // Stream in 8192-sample (16384-byte) chunks to emulate frontend
    const BYTES_PER_SAMPLE = 2; // s16le
    const SAMPLES_PER_CHUNK = 8192;
    const CHUNK_BYTES = SAMPLES_PER_CHUNK * BYTES_PER_SAMPLE;
    const intervalMs = Math.round((SAMPLES_PER_CHUNK / SAMPLE_RATE) * 1000);
    console.log(
      `[ws] Streaming ${pcm.length} bytes in ${CHUNK_BYTES}-byte chunks (~${intervalMs}ms cadence)...`
    );

    let offset = 0;
    await new Promise((res) => {
      const timer = setInterval(
        () => {
          if (offset >= pcm.length) {
            clearInterval(timer);
            res();
            return;
          }
          const end = Math.min(offset + CHUNK_BYTES, pcm.length);
          const chunkB64 = pcm.subarray(offset, end).toString("base64");
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: chunkB64,
            })
          );
          offset = end;
        },
        Math.max(30, intervalMs)
      );
    });
  }

  console.log("[ws] Committing audio...");
  ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

  console.log("[ws] Requesting transcription response...");
  ws.send(
    JSON.stringify({
      type: "response.create",
      response: { modalities: ["text"] },
    })
  );

  return await new Promise((resolve) => {
    let transcript = "";
    const done = () => {
      try {
        ws.close(1000, "done");
      } catch (_) {}
      resolve({ transcript });
    };

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (
          msg.type ===
            "conversation.item.input_audio_transcription.completed" &&
          msg.transcript
        ) {
          transcript += (transcript ? " " : "") + msg.transcript;
          console.log("[ws] +", msg.transcript);
        } else if (msg.type === "response.completed") {
          console.log("[ws] response completed");
          done();
        } else if (msg.type === "error") {
          console.error("[ws] error", msg);
          done();
        }
      } catch (_) {
        // ignore non-JSON
      }
    });

    // safety timeout
    setTimeout(done, 20000);
  });
}

(async () => {
  try {
    // If the PCM file already exists, skip recording and stream it like the frontend.
    const useExisting = fs.existsSync(PCM_PATH);
    if (!useExisting) {
      await recordMic();
    } else {
      console.log("[rec] Reusing existing PCM file:", PCM_PATH);
    }

    const { transcript } = await sendToOpenAIRealtime({
      streamLikeFrontend: true,
    });
    console.log("\n=== Final transcript ===");
    console.log(transcript || "(empty)");
    console.log("\nExpected phrases:");
    console.log("- Nice to meet you");
    console.log("- 很高兴遇见你");
  } catch (err) {
    console.error("[fatal]", err.message || err);
    process.exit(1);
  }
})();
