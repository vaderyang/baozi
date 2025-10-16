#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Deep analysis of audio file to verify format and content
 */

const fs = require("fs");

const audioFile =
  process.argv[2] || "test-audio/recording-2025-10-16T03-34-05-213Z.wav";

if (!fs.existsSync(audioFile)) {
  console.error("❌ Audio file not found:", audioFile);
  process.exit(1);
}

console.log("🔍 Deep Audio Analysis");
console.log("═══════════════════════════════════════════════\n");
console.log(`📁 File: ${audioFile}\n`);

// Read file
const data = fs.readFileSync(audioFile);
console.log(`📦 Total file size: ${data.length} bytes\n`);

// Parse WAV header
console.log("📋 WAV Header Analysis:");
console.log("─────────────────────────────────────────────");

const riffSignature = data.slice(0, 4).toString();
const fileSize = data.readUInt32LE(4);
const waveSignature = data.slice(8, 12).toString();
const fmtSignature = data.slice(12, 16).toString();
const fmtSize = data.readUInt32LE(16);
const audioFormat = data.readUInt16LE(20);
const numChannels = data.readUInt16LE(22);
const sampleRate = data.readUInt32LE(24);
const byteRate = data.readUInt32LE(28);
const blockAlign = data.readUInt16LE(32);
const bitsPerSample = data.readUInt16LE(34);
const dataSignature = data.slice(36, 40).toString();
const dataSize = data.readUInt32LE(40);

console.log(
  `RIFF signature: "${riffSignature}" ${riffSignature === "RIFF" ? "✅" : "❌"}`
);
console.log(
  `File size: ${fileSize + 8} bytes ${fileSize + 8 === data.length ? "✅" : "⚠️ " + data.length}`
);
console.log(
  `WAVE signature: "${waveSignature}" ${waveSignature === "WAVE" ? "✅" : "❌"}`
);
console.log(
  `fmt signature: "${fmtSignature}" ${fmtSignature === "fmt " ? "✅" : "❌"}`
);
console.log(`fmt size: ${fmtSize} bytes ${fmtSize === 16 ? "✅" : "⚠️"}`);
console.log(
  `Audio format: ${audioFormat} ${audioFormat === 1 ? "(PCM ✅)" : "❌ Not PCM"}`
);
console.log(
  `Channels: ${numChannels} ${numChannels === 1 ? "(mono ✅)" : "⚠️ Not mono"}`
);
console.log(
  `Sample rate: ${sampleRate} Hz ${sampleRate === 24000 ? "✅" : "⚠️ Not 24kHz"}`
);
console.log(
  `Byte rate: ${byteRate} bytes/sec ${byteRate === (sampleRate * numChannels * bitsPerSample) / 8 ? "✅" : "❌"}`
);
console.log(
  `Block align: ${blockAlign} ${blockAlign === (numChannels * bitsPerSample) / 8 ? "✅" : "❌"}`
);
console.log(
  `Bits per sample: ${bitsPerSample} ${bitsPerSample === 16 ? "✅" : "⚠️ Not 16-bit"}`
);
console.log(
  `data signature: "${dataSignature}" ${dataSignature === "data" ? "✅" : "❌"}`
);
console.log(`Data size: ${dataSize} bytes\n`);

// Extract PCM data
const pcmData = data.slice(44);
const samples = new Int16Array(
  pcmData.buffer,
  pcmData.byteOffset,
  pcmData.byteLength / 2
);

console.log("🎵 Audio Content Analysis:");
console.log("─────────────────────────────────────────────");
console.log(`Total samples: ${samples.length}`);

const durationSec = samples.length / sampleRate;
console.log(`Duration: ${durationSec.toFixed(2)} seconds`);
console.log(`Expected duration: ${(dataSize / byteRate).toFixed(2)} seconds\n`);

// Analyze amplitude
let sumSquares = 0;
let maxAbs = 0;
let minVal = Infinity;
let maxVal = -Infinity;
let nonZeroCount = 0;
let clippedCount = 0;

for (let i = 0; i < samples.length; i++) {
  const val = samples[i];
  sumSquares += val * val;
  maxAbs = Math.max(maxAbs, Math.abs(val));
  minVal = Math.min(minVal, val);
  maxVal = Math.max(maxVal, val);
  if (val !== 0) {
    nonZeroCount++;
  }
  if (Math.abs(val) >= 32767) {
    clippedCount++;
  }
}

const rms = Math.sqrt(sumSquares / samples.length);
const maxPossible = 32767;

console.log("📊 Amplitude Statistics:");
console.log("─────────────────────────────────────────────");
console.log(
  `RMS level: ${rms.toFixed(2)} (${((rms / maxPossible) * 100).toFixed(2)}% of max)`
);
console.log(
  `Peak level: ${maxAbs} (${((maxAbs / maxPossible) * 100).toFixed(2)}% of max)`
);
console.log(`Min value: ${minVal}`);
console.log(`Max value: ${maxVal}`);
console.log(
  `Non-zero samples: ${nonZeroCount} (${((nonZeroCount / samples.length) * 100).toFixed(2)}%)`
);
console.log(
  `Clipped samples: ${clippedCount} (${((clippedCount / samples.length) * 100).toFixed(4)}%)\n`
);

// Signal quality assessment
console.log("✨ Signal Quality Assessment:");
console.log("─────────────────────────────────────────────");

if (maxAbs < 100) {
  console.log("❌ CRITICAL: Audio is essentially silent (peak < 100)");
} else if (rms < 100) {
  console.log("⚠️  WARNING: Audio is very quiet (RMS < 100)");
} else if (rms < 500) {
  console.log("⚠️  Audio is quiet (RMS < 500) - may affect transcription");
} else if (rms > 10000) {
  console.log("⚠️  Audio is very loud (RMS > 10000)");
} else {
  console.log("✅ Audio level is reasonable");
}

if (clippedCount > samples.length * 0.01) {
  console.log("⚠️  WARNING: Significant clipping detected (>1% of samples)");
} else if (clippedCount > 0) {
  console.log("⚠️  Minor clipping detected");
} else {
  console.log("✅ No clipping detected");
}

if (nonZeroCount < samples.length * 0.5) {
  console.log("⚠️  WARNING: More than 50% of samples are zero");
} else {
  console.log("✅ Good signal density");
}

// Analyze waveform patterns
console.log("\n🌊 Waveform Pattern Analysis:");
console.log("─────────────────────────────────────────────");

// Split into 10 segments and analyze each
const segmentSize = Math.floor(samples.length / 10);
console.log(`Analyzing 10 segments of ${segmentSize} samples each:\n`);

for (let seg = 0; seg < 10; seg++) {
  const start = seg * segmentSize;
  const end = Math.min(start + segmentSize, samples.length);
  let segSum = 0;
  let segMax = 0;

  for (let i = start; i < end; i++) {
    const val = Math.abs(samples[i]);
    segSum += val * val;
    segMax = Math.max(segMax, val);
  }

  const segRms = Math.sqrt(segSum / (end - start));
  const segTime = (start / sampleRate).toFixed(1);
  const bars = Math.floor((segRms / maxPossible) * 50);
  const bar = "█".repeat(bars) + "░".repeat(50 - bars);

  console.log(
    `[${segTime}s] ${bar} RMS:${segRms.toFixed(0).padStart(5)} Peak:${segMax.toString().padStart(5)}`
  );
}

console.log("\n═══════════════════════════════════════════════");
console.log("✨ Analysis Complete\n");

// Final verdict
console.log("🎯 Final Verdict:");
console.log("─────────────────────────────────────────────");
const isCorrectFormat =
  riffSignature === "RIFF" &&
  waveSignature === "WAVE" &&
  audioFormat === 1 &&
  numChannels === 1 &&
  sampleRate === 24000 &&
  bitsPerSample === 16;

const hasGoodContent =
  maxAbs >= 100 &&
  rms >= 100 &&
  nonZeroCount > samples.length * 0.5 &&
  clippedCount < samples.length * 0.01;

if (isCorrectFormat && hasGoodContent) {
  console.log(
    "✅ Audio format is CORRECT for Speaches (24kHz, mono, 16-bit PCM)"
  );
  console.log("✅ Audio content appears VALID with clear signal");
  console.log("\n💡 Recommendation: Audio should work with Speaches.");
  console.log("   If transcription still fails, the issue is likely:");
  console.log("   - Speech recognition model not detecting language/speech");
  console.log("   - Speaches API configuration issue");
  console.log("   - Network/encoding issue in transmission");
} else {
  if (!isCorrectFormat) {
    console.log("❌ Audio format is INCORRECT");
  }
  if (!hasGoodContent) {
    console.log("❌ Audio content appears INVALID or too quiet");
  }
}

console.log("\n");
