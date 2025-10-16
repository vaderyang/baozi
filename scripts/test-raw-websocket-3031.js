#!/usr/bin/env node
/* eslint-disable no-console */

const net = require("net");
const crypto = require("crypto");

const port = 3031;
const host = "localhost";

const key = crypto.randomBytes(16).toString("base64");

const request = [
  "GET /meeting-ai HTTP/1.1",
  `Host: ${host}:${port}`,
  "Upgrade: websocket",
  "Connection: Upgrade",
  "Sec-WebSocket-Key: " + key,
  "Sec-WebSocket-Version: 13",
  "x-dev-api-key: dev_test_key",
  "",
  "",
].join("\r\n");

console.log("Sending upgrade request...");
console.log(request);

const socket = net.createConnection(port, host, () => {
  socket.write(request);
});

let responseData = "";
socket.on("data", (data) => {
  responseData += data.toString();
  console.log("Received data:");
  console.log(responseData);

  if (responseData.includes("\r\n\r\n")) {
    console.log("Full response received");
    socket.end();
  }
});

socket.on("end", () => {
  console.log("Socket closed");
  process.exit(0);
});

socket.on("error", (err) => {
  console.log("Socket error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log("Timeout - no response received");
  socket.end();
  process.exit(1);
}, 3000);
