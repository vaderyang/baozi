#!/usr/bin/env node
/* eslint-disable no-console, no-unused-vars */

const http = require("http");

const options = {
  hostname: "localhost",
  port: 3030,
  path: "/meeting-ai",
  headers: {
    Connection: "Upgrade",
    Upgrade: "websocket",
    "Sec-WebSocket-Version": "13",
    "Sec-WebSocket-Key": Buffer.from("test-key-123456").toString("base64"),
    "x-dev-api-key": "dev_test_key",
  },
};

const req = http.request(options);

req.on("upgrade", (res, socket, head) => {
  console.log("✓ Upgrade successful!");
  console.log("Status:", res.statusCode);
  console.log("Headers:", res.headers);

  // Send a message
  socket.write("test");

  socket.on("data", (data) => {
    console.log("Data received:", data.toString());
  });

  socket.on("end", () => {
    console.log("Connection ended");
    process.exit(0);
  });
});

req.on("response", (res) => {
  console.log("✗ Got HTTP response instead of upgrade");
  console.log("Status:", res.statusCode);
  console.log("Headers:", res.headers);
  res.on("data", (chunk) => {
    console.log("Body:", chunk.toString());
  });
  res.on("end", () => {
    process.exit(1);
  });
});

req.on("error", (err) => {
  console.log("✗ Request error:", err.message);
  process.exit(1);
});

req.end();

console.log(
  "Attempting WebSocket upgrade to ws://localhost:3030/meeting-ai..."
);
