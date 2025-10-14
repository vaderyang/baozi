import http, { IncomingMessage } from "http";
import { Duplex } from "stream";
import Koa from "koa";
import WebSocket from "ws";
import env from "@server/env";
import { AuthenticationError } from "@server/errors";
import Logger from "@server/logging/Logger";
import Metrics from "@server/logging/Metrics";
import { User } from "@server/models";
import { getUserForJWT } from "@server/utils/jwt";
import cookie from "cookie";
import { OpenAIRealtimeClient } from "./openai-realtime";

type TranscriptSegment = {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
};

type ClientMessage =
  | { type: "start"; language?: string }
  | { type: "audio-chunk"; data: ArrayBuffer; timestampMs: number }
  | { type: "stop" }
  | { type: "mark"; timestampMs: number };

type ServerMessage =
  | { type: "partial-transcript"; segments: TranscriptSegment[] }
  | { type: "final-transcript"; segments: TranscriptSegment[] }
  | { type: "speaker-updates"; segments: TranscriptSegment[] }
  | { type: "error"; code: string; message: string }
  | { type: "stopped" }
  | { type: "connected" };

export default function init(
  _app: Koa,
  server: http.Server,
  _serviceNames: string[]
) {
  const path = "/meeting-ai";
  const wss = new WebSocket.Server({ noServer: true });

  wss.on("error", (err) => {
    Logger.error("Meeting AI WebSocket server error", err);
  });

  // Heartbeat to detect dead connections
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heartbeatInterval = setInterval(() => {
    // @ts-expect-error ws.Server#clients is a Set<WebSocket>
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        try {
          ws.terminate();
        } catch (_e) {
          /* ignore */
        }
        return;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (_e) {
        /* ignore */
      }
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  // Add upgrade handler for /meeting-ai path
  const upgradeListener = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => {
    if (req.url?.startsWith(path)) {
      Logger.debug(
        "websocket",
        `Meeting AI WebSocket upgrade request, socket destroyed: ${socket.destroyed}, readable: ${socket.readable}`
      );

      socket.on("error", (err) => {
        Logger.error("Meeting AI socket error during upgrade", err);
      });

      try {
        wss.handleUpgrade(req, socket, head, (ws) => {
          Logger.debug("websocket", `Meeting AI handleUpgrade callback called`);
          wss.emit("connection", ws, req);
        });
        Logger.debug(
          "websocket",
          `Meeting AI handleUpgrade called successfully`
        );
      } catch (err) {
        Logger.error("Meeting AI WebSocket upgrade failed", err);
        socket.end(`HTTP/1.1 500 Internal Server Error\r\n`);
      }
      return;
    }
  };

  server.on("upgrade", upgradeListener);

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    Logger.debug("websocket", `Meeting AI WebSocket connection established`);
    Metrics.increment("websockets.meeting_ai.connected");

    // Mark connection alive and set up pong handler for heartbeat
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ws as any).isAlive = true;
    ws.on("pong", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ws as any).isAlive = true;
    });

    let user: User | null = null;
    let openAIClient: OpenAIRealtimeClient | null = null;
    const transcriptSegments: TranscriptSegment[] = [];
    let sessionStartedAt = 0;

    // Authenticate the connection
    try {
      user = await authenticate(req);
      Logger.debug("websocket", `Meeting AI authenticated user ${user.id}`);

      // Send connected message
      const message: ServerMessage = { type: "connected" };
      ws.send(JSON.stringify(message));
    } catch (err) {
      Logger.error("Meeting AI WebSocket authentication failed", err);
      const errorMessage: ServerMessage = {
        type: "error",
        code: "AUTH_FAILED",
        message: "Authentication failed",
      };
      ws.send(JSON.stringify(errorMessage));
      ws.close();
      return;
    }

    ws.on("message", async (data: WebSocket.Data) => {
      try {
        // Control messages are JSON strings. Binary frames are raw PCM16 audio.
        if (typeof data === "string") {
          const message: ClientMessage = JSON.parse(data);

          switch (message.type) {
            case "start": {
              Logger.info("Meeting AI session started", {
                userId: user?.id,
                language: message.language,
              });

              // Check if OpenAI API key is configured
              if (!env.OPENAI_API_KEY) {
                const errorMessage: ServerMessage = {
                  type: "error",
                  code: "CONFIG_ERROR",
                  message: "OpenAI API key not configured",
                };
                ws.send(JSON.stringify(errorMessage));
                return;
              }

              // Initialize OpenAI Realtime client
              try {
                openAIClient = new OpenAIRealtimeClient(user?.id || "unknown", {
                  onTranscript: (segments) => {
                    // Store segments
                    transcriptSegments.push(...segments);

                    // Send to client
                    const response: ServerMessage = {
                      type: "partial-transcript",
                      segments,
                    };
                    ws.send(JSON.stringify(response));
                  },
                  onError: (error) => {
                    Logger.error("OpenAI Realtime error", error);
                    const errorMessage: ServerMessage = {
                      type: "error",
                      code: "OPENAI_ERROR",
                      message: error.message || "OpenAI Realtime API error",
                    };
                    ws.send(JSON.stringify(errorMessage));
                  },
                  onClose: () => {
                    Logger.info("OpenAI Realtime connection closed");
                  },
                });

                await openAIClient.connect(message.language);
                sessionStartedAt = Date.now();
                Logger.info("OpenAI Realtime client connected", {
                  userId: user?.id,
                });
              } catch (err) {
                Logger.error("Failed to connect to OpenAI Realtime", err);
                const errorMessage: ServerMessage = {
                  type: "error",
                  code: "OPENAI_CONNECTION_ERROR",
                  message: "Failed to connect to OpenAI Realtime API",
                };
                ws.send(JSON.stringify(errorMessage));
              }

              break;
            }

            case "stop": {
              Logger.info("Meeting AI session stopped", {
                userId: user?.id,
                totalSegments: transcriptSegments.length,
              });

              // Commit any pending audio and close OpenAI connection
              if (openAIClient) {
                openAIClient.commitAudio();

                // Wait a bit for final transcription
                setTimeout(() => {
                  const finalSegments =
                    openAIClient?.getFinalTranscript() || transcriptSegments;

                  // Send final transcript
                  const response: ServerMessage = {
                    type: "final-transcript",
                    segments: finalSegments,
                  };
                  ws.send(JSON.stringify(response));

                  const stoppedMessage: ServerMessage = { type: "stopped" };
                  ws.send(JSON.stringify(stoppedMessage));

                  // Close OpenAI connection
                  openAIClient?.close();
                  openAIClient = null;
                }, 500);
              } else {
                // No OpenAI client, just send what we have
                const response: ServerMessage = {
                  type: "final-transcript",
                  segments: transcriptSegments,
                };
                ws.send(JSON.stringify(response));

                const stoppedMessage: ServerMessage = { type: "stopped" };
                ws.send(JSON.stringify(stoppedMessage));
              }

              break;
            }

            case "mark": {
              Logger.info("Meeting AI mark created", {
                userId: user?.id,
                timestamp: message.timestampMs,
              });
              // Mark events are handled client-side for now
              break;
            }

            default:
              Logger.warn("Unknown Meeting AI message type", { message });
          }
        } else {
          // Binary audio frame received
          if (!openAIClient) {
            Logger.warn("Received binary audio before session start");
            return;
          }

          let arrayBuffer: ArrayBuffer | null = null;
          if (data instanceof ArrayBuffer) {
            arrayBuffer = data as ArrayBuffer;
          } else if (Array.isArray(data)) {
            // ws may provide Buffer[]
            const buf = Buffer.concat(data as Buffer[]);
            arrayBuffer = buf.buffer.slice(
              buf.byteOffset,
              buf.byteOffset + buf.byteLength
            );
          } else if (Buffer.isBuffer(data)) {
            const buf = data as Buffer;
            arrayBuffer = buf.buffer.slice(
              buf.byteOffset,
              buf.byteOffset + buf.byteLength
            );
          }

          if (arrayBuffer) {
            const elapsed = Math.max(0, Date.now() - sessionStartedAt);
            openAIClient.sendAudioChunk(arrayBuffer, elapsed);
          }
        }
      } catch (err) {
        Logger.error("Error processing Meeting AI message", err);
        const errorMessage: ServerMessage = {
          type: "error",
          code: "PROCESSING_ERROR",
          message: "Failed to process message",
        };
        ws.send(JSON.stringify(errorMessage));
      }
    });

    ws.on("close", () => {
      Logger.debug("websocket", `Meeting AI WebSocket connection closed`);
      Metrics.increment("websockets.meeting_ai.disconnected");

      // Clean up OpenAI connection
      if (openAIClient) {
        openAIClient.close();
        openAIClient = null;
      }
    });

    ws.on("error", (error) => {
      Logger.error("Meeting AI WebSocket error", error);
    });
  });
}

async function authenticate(req: IncomingMessage): Promise<User> {
  // Try cookie-based authentication first
  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};
  const { accessToken } = cookies;

  if (accessToken) {
    try {
      const user = await getUserForJWT(accessToken);
      if (user) {
        return user;
      }
    } catch (_err) {
      // Fall through to dev bypass
    }
  }

  // Dev mode: allow bypass with special header
  if (env.isDevelopment) {
    const devKey = req.headers["x-dev-api-key"];
    if (devKey === "dev_test_key") {
      Logger.info(
        "Dev mode: Using bypass authentication for Meeting AI WebSocket"
      );
      // Return a mock user for development
      // In a real implementation, you'd create or fetch a dev user
      const devUser = {
        id: "dev-user",
        name: "Dev User",
        email: "dev@test.local",
      } as unknown as User;
      return devUser;
    }
  }

  throw AuthenticationError("No valid authentication provided");
}
