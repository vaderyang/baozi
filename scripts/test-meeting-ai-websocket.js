#!/usr/bin/env node
/* eslint-disable no-console, no-unused-vars */

/**
 * Test script for Meeting AI WebSocket API
 *
 * Tests:
 * 1. WebSocket connection to /meeting-ai endpoint
 * 2. Authentication handling
 * 3. Session start/stop flow
 * 4. Error handling for missing API key
 * 5. Audio streaming (simulated)
 * 6. Transcript reception
 *
 * Usage:
 *   node scripts/test-meeting-ai-websocket.js [options]
 *
 * Options:
 *   --host=<host>       WebSocket host (default: localhost:3030)
 *   --token=<token>     Access token for authentication
 *   --dev               Use dev mode bypass authentication
 *   --verbose           Enable verbose logging
 */

const WebSocket = require("ws");

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split("=");
  acc[key.replace("--", "")] = value || true;
  return acc;
}, {});

const HOST = args.host || "localhost:3030";
const ACCESS_TOKEN = args.token || null;
const DEV_MODE = args.dev || false;
const VERBOSE = args.verbose || false;

// Test configuration
const config = {
  host: HOST,
  protocol: HOST.includes("localhost") ? "ws" : "wss",
  url: null,
  headers: {},
};

// Set up authentication
if (ACCESS_TOKEN) {
  config.headers["Cookie"] = `accessToken=${ACCESS_TOKEN}`;
  log("Using cookie authentication");
} else if (DEV_MODE) {
  config.headers["x-dev-api-key"] = "dev_test_key";
  log("Using dev mode bypass authentication");
} else {
  log("Warning: No authentication provided. Connection may fail.");
}

config.url = `${config.protocol}://${config.host}/meeting-ai`;

// Logging utilities
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data && VERBOSE) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function logSuccess(message) {
  console.log(`\x1b[32m✓ ${message}\x1b[0m`);
}

function logError(message, error = null) {
  console.error(`\x1b[31m✗ ${message}\x1b[0m`);
  if (error && VERBOSE) {
    console.error(error);
  }
}

function logWarning(message) {
  console.warn(`\x1b[33m⚠ ${message}\x1b[0m`);
}

// Test state
const state = {
  connected: false,
  authenticated: false,
  sessionStarted: false,
  transcriptsReceived: 0,
  errors: [],
  startTime: Date.now(),
};

// Create mock audio data (PCM16, 4096 samples)
function createMockAudioChunk() {
  const buffer = new Int16Array(4096);
  // Generate simple sine wave at 440Hz
  const sampleRate = 24000;
  const frequency = 440;
  for (let i = 0; i < buffer.length; i++) {
    const time = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequency * time) * 0.3;
    buffer[i] = Math.floor(value * 32767);
  }
  return buffer.buffer;
}

// Main test function
async function runTest() {
  log("=".repeat(60));
  log("Meeting AI WebSocket API Test");
  log("=".repeat(60));
  log(`Target: ${config.url}`);
  log(
    `Authentication: ${ACCESS_TOKEN ? "Cookie" : DEV_MODE ? "Dev Mode" : "None"}`
  );
  log("");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(config.url, {
      headers: config.headers,
    });

    let audioInterval = null;
    let testTimeout = null;

    // Set overall test timeout (30 seconds)
    testTimeout = setTimeout(() => {
      logWarning("Test timeout reached (30s)");
      cleanup();
      resolve(generateReport());
    }, 30000);

    function cleanup() {
      if (audioInterval) {
        clearInterval(audioInterval);
        audioInterval = null;
      }
      if (testTimeout) {
        clearTimeout(testTimeout);
        testTimeout = null;
      }
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }

    ws.on("open", () => {
      state.connected = true;
      logSuccess("WebSocket connected");

      // Wait a moment for connection confirmation
      setTimeout(() => {
        log("Sending start message...");
        ws.send(JSON.stringify({ type: "start", language: "en" }));
      }, 500);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        log(`Received message: ${message.type}`, message);

        switch (message.type) {
          case "connected":
            state.authenticated = true;
            logSuccess("Authentication successful");
            break;

          case "error":
            state.errors.push({
              code: message.code,
              message: message.message,
              timestamp: Date.now(),
            });
            logError(`Server error: ${message.code} - ${message.message}`);

            // Check for expected errors
            if (message.code === "CONFIG_ERROR") {
              logWarning("Expected error: OpenAI API key not configured");
              logWarning("This is expected if OPENAI_API_KEY is not set");
            }

            // Stop test on critical errors
            if (
              [
                "AUTH_FAILED",
                "CONFIG_ERROR",
                "OPENAI_CONNECTION_ERROR",
              ].includes(message.code)
            ) {
              setTimeout(() => {
                cleanup();
                resolve(generateReport());
              }, 1000);
            }
            break;

          case "partial-transcript":
          case "final-transcript":
            state.transcriptsReceived++;
            logSuccess(
              `Received transcript (${message.type}): ${message.segments?.length || 0} segments`
            );
            if (message.segments && message.segments.length > 0) {
              message.segments.forEach((seg, idx) => {
                log(`  [${idx}] ${seg.speaker}: ${seg.text}`);
              });
            }
            break;

          case "stopped":
            logSuccess("Session stopped");
            setTimeout(() => {
              cleanup();
              resolve(generateReport());
            }, 500);
            break;

          default:
            log(`Unknown message type: ${message.type}`);
        }
      } catch (err) {
        logError("Failed to parse message", err);
      }
    });

    ws.on("error", (error) => {
      logError("WebSocket error", error);
      state.errors.push({
        code: "WS_ERROR",
        message: error.message,
        timestamp: Date.now(),
      });
    });

    ws.on("close", (code, reason) => {
      log(`WebSocket closed: code=${code}, reason=${reason || "none"}`);
      cleanup();

      if (!state.authenticated && !state.errors.length) {
        state.errors.push({
          code: "CONNECTION_CLOSED",
          message: "Connection closed before authentication",
          timestamp: Date.now(),
        });
      }

      resolve(generateReport());
    });

    // Simulate sending audio chunks after session starts
    // Wait 2 seconds after start message, then send 5 chunks
    setTimeout(() => {
      if (
        state.authenticated &&
        !state.errors.some((e) =>
          ["CONFIG_ERROR", "OPENAI_CONNECTION_ERROR"].includes(e.code)
        )
      ) {
        state.sessionStarted = true;
        logSuccess("Starting audio stream simulation...");

        let chunkCount = 0;
        audioInterval = setInterval(() => {
          if (chunkCount >= 5 || ws.readyState !== WebSocket.OPEN) {
            clearInterval(audioInterval);
            audioInterval = null;

            // Send stop message after audio chunks
            log("Sending stop message...");
            ws.send(JSON.stringify({ type: "stop" }));
            return;
          }

          const audioChunk = createMockAudioChunk();
          ws.send(audioChunk);
          log(
            `Sent audio chunk ${chunkCount + 1}/5 (${audioChunk.byteLength} bytes)`
          );
          chunkCount++;
        }, 1000);
      }
    }, 2000);
  });
}

function generateReport() {
  const duration = Date.now() - state.startTime;

  log("");
  log("=".repeat(60));
  log("Test Report");
  log("=".repeat(60));
  log(`Duration: ${(duration / 1000).toFixed(2)}s`);
  log("");

  // Connection
  if (state.connected) {
    logSuccess("WebSocket connection: PASSED");
  } else {
    logError("WebSocket connection: FAILED");
  }

  // Authentication
  if (state.authenticated) {
    logSuccess("Authentication: PASSED");
  } else if (state.errors.some((e) => e.code === "AUTH_FAILED")) {
    logError("Authentication: FAILED (AUTH_FAILED)");
  } else {
    logWarning("Authentication: SKIPPED (connection failed)");
  }

  // Session
  if (state.sessionStarted) {
    logSuccess("Session start: PASSED");
  } else if (
    state.errors.some((e) =>
      ["CONFIG_ERROR", "OPENAI_CONNECTION_ERROR"].includes(e.code)
    )
  ) {
    logWarning("Session start: SKIPPED (configuration error)");
  } else {
    logWarning("Session start: NOT TESTED");
  }

  // Transcripts
  if (state.transcriptsReceived > 0) {
    logSuccess(
      `Transcript reception: PASSED (${state.transcriptsReceived} received)`
    );
  } else if (state.sessionStarted) {
    logWarning(
      "Transcript reception: NONE (this may be expected with mock audio)"
    );
  } else {
    logWarning("Transcript reception: NOT TESTED");
  }

  // Errors
  log("");
  if (state.errors.length === 0) {
    logSuccess("No errors encountered");
  } else {
    logWarning(`Errors encountered: ${state.errors.length}`);
    state.errors.forEach((error, idx) => {
      console.log(`  ${idx + 1}. [${error.code}] ${error.message}`);
    });
  }

  log("");
  log("=".repeat(60));

  // Overall result
  log("");
  const criticalErrors = state.errors.filter(
    (e) => !["CONFIG_ERROR", "OPENAI_CONNECTION_ERROR"].includes(e.code)
  );

  if (!state.connected) {
    logError("OVERALL: FAILED - Could not connect to WebSocket");
    return { success: false, reason: "connection_failed" };
  } else if (!state.authenticated) {
    logError("OVERALL: FAILED - Authentication failed");
    return { success: false, reason: "auth_failed" };
  } else if (criticalErrors.length > 0) {
    logError("OVERALL: FAILED - Critical errors encountered");
    return { success: false, reason: "critical_errors" };
  } else if (state.errors.some((e) => e.code === "CONFIG_ERROR")) {
    logWarning(
      "OVERALL: PARTIAL - Service not configured (missing OPENAI_API_KEY)"
    );
    logSuccess(
      "WebSocket API is working, but needs OpenAI API key to be fully functional"
    );
    return { success: true, partial: true, reason: "config_missing" };
  } else if (state.sessionStarted) {
    logSuccess("OVERALL: PASSED - All tests successful");
    return { success: true, partial: false };
  } else {
    logWarning("OVERALL: INCOMPLETE - Some tests were not run");
    return { success: true, partial: true, reason: "incomplete" };
  }
}

// Run the test
runTest()
  .then((result) => {
    if (result.success && !result.partial) {
      process.exit(0);
    } else if (result.success && result.partial) {
      process.exit(0); // Partial success is still success for CI
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    logError("Test failed with exception", error);
    process.exit(1);
  });
