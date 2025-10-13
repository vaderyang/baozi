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

  // Add upgrade handler for /meeting-ai path
  const upgradeListener = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => {
    if (req.url?.startsWith(path)) {
      Logger.debug("websocket", `Meeting AI WebSocket upgrade request`);

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return;
    }
  };

  server.on("upgrade", upgradeListener);

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    Logger.debug("websocket", `Meeting AI WebSocket connection established`);
    Metrics.increment("websockets.meeting_ai.connected");

    let user: User | null = null;
    let openAIWs: WebSocket | null = null;
    const transcriptSegments: TranscriptSegment[] = [];

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
        const message: ClientMessage = JSON.parse(data.toString());

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

            // For now, send mock transcript segments for testing
            // TODO: Connect to OpenAI Realtime API
            Logger.warn(
              "OpenAI Realtime integration not yet implemented, using mock data"
            );

            // Simulate receiving transcript after a delay
            setTimeout(() => {
              const mockSegments: TranscriptSegment[] = [
                {
                  startMs: 0,
                  endMs: 3000,
                  speaker: "Speaker 1",
                  text: "Welcome to the meeting!",
                },
              ];

              transcriptSegments.push(...mockSegments);

              const response: ServerMessage = {
                type: "partial-transcript",
                segments: mockSegments,
              };
              ws.send(JSON.stringify(response));
            }, 2000);

            break;
          }

          case "audio-chunk": {
            // TODO: Forward audio chunk to OpenAI Realtime API
            Logger.debug("websocket", "Received audio chunk", {
              userId: user?.id,
              size: message.data.byteLength,
              timestamp: message.timestampMs,
            });

            // For now, simulate periodic transcript updates
            if (Math.random() > 0.95) {
              const mockSegment: TranscriptSegment = {
                startMs: message.timestampMs - 1000,
                endMs: message.timestampMs,
                speaker: `Speaker ${Math.floor(Math.random() * 2) + 1}`,
                text: "This is a simulated transcript segment.",
              };

              transcriptSegments.push(mockSegment);

              const response: ServerMessage = {
                type: "partial-transcript",
                segments: [mockSegment],
              };
              ws.send(JSON.stringify(response));
            }

            break;
          }

          case "stop": {
            Logger.info("Meeting AI session stopped", {
              userId: user?.id,
              totalSegments: transcriptSegments.length,
            });

            // Close OpenAI connection if exists
            if (openAIWs) {
              openAIWs.close();
              openAIWs = null;
            }

            // Send final transcript
            const response: ServerMessage = {
              type: "final-transcript",
              segments: transcriptSegments,
            };
            ws.send(JSON.stringify(response));

            const stoppedMessage: ServerMessage = { type: "stopped" };
            ws.send(JSON.stringify(stoppedMessage));

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
      if (openAIWs) {
        openAIWs.close();
        openAIWs = null;
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
