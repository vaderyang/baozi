import WebSocket from "ws";
import env from "@server/env";
import Logger from "@server/logging/Logger";

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
};

type RealtimeEventHandler = {
  onTranscript: (segments: TranscriptSegment[]) => void;
  onError: (error: Error) => void;
  onClose: () => void;
};

export class OpenAIRealtimeClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private transcriptBuffer: TranscriptSegment[] = [];
  private currentSegmentStartMs = 0;
  private sessionStartTime = 0;
  private speakerMap = new Map<string, number>();
  private speakerCount = 0;

  constructor(
    private userId: string,
    private handler: RealtimeEventHandler
  ) {}

  async connect(): Promise<void> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const model = env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
    const url = `wss://api.openai.com/v1/realtime?model=${model}`;

    Logger.info("Connecting to OpenAI Realtime API", {
      userId: this.userId,
      model,
    });

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      this.ws.on("open", () => {
        Logger.info("OpenAI Realtime connection established", {
          userId: this.userId,
        });

        this.sessionStartTime = Date.now();

        // Configure session for audio input
        this.sendSessionUpdate();
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleRealtimeEvent(event);
        } catch (err) {
          Logger.error("Failed to parse OpenAI Realtime event", err);
        }
      });

      this.ws.on("error", (error) => {
        Logger.error("OpenAI Realtime WebSocket error", error, {
          userId: this.userId,
        });
        reject(error);
        this.handler.onError(error as Error);
      });

      this.ws.on("close", (code, reason) => {
        Logger.info("OpenAI Realtime connection closed", {
          userId: this.userId,
          code,
          reason: reason.toString(),
        });
        this.handler.onClose();
      });
    });
  }

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Configure session for audio transcription
    const config = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions:
          "You are a meeting transcription assistant. Transcribe the audio accurately with speaker identification.",
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };

    this.ws.send(JSON.stringify(config));
    Logger.debug("Sent OpenAI Realtime session configuration");
  }

  sendAudioChunk(audioData: ArrayBuffer, _timestampMs: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      Logger.warn("Cannot send audio chunk: WebSocket not open");
      return;
    }

    // Convert ArrayBuffer to base64
    const buffer = Buffer.from(audioData);
    const base64Audio = buffer.toString("base64");

    const event = {
      type: "input_audio_buffer.append",
      audio: base64Audio,
    };

    this.ws.send(JSON.stringify(event));
  }

  commitAudio(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const event = {
      type: "input_audio_buffer.commit",
    };

    this.ws.send(JSON.stringify(event));
    Logger.debug("Committed audio buffer to OpenAI");
  }

  private handleRealtimeEvent(event: Record<string, any>): void {
    switch (event.type) {
      case "session.created":
        this.sessionId = event.session?.id;
        Logger.info("OpenAI Realtime session created", {
          sessionId: this.sessionId,
          userId: this.userId,
        });
        break;

      case "session.updated":
        Logger.debug("OpenAI Realtime session updated");
        break;

      case "conversation.item.created":
        // New conversation item (turn) started
        this.currentSegmentStartMs = Date.now() - this.sessionStartTime;
        break;

      case "conversation.item.input_audio_transcription.completed":
        // Transcription of user audio completed
        this.handleTranscription(event);
        break;

      case "response.audio_transcript.delta":
        // Partial transcript from AI response (not user input)
        // We can use this for assistant responses if needed
        break;

      case "response.audio_transcript.done":
        // Complete transcript from AI response
        break;

      case "input_audio_buffer.speech_started":
        Logger.debug("Speech detected by OpenAI VAD");
        this.currentSegmentStartMs = Date.now() - this.sessionStartTime;
        break;

      case "input_audio_buffer.speech_stopped":
        Logger.debug("Speech stopped by OpenAI VAD");
        break;

      case "error":
        Logger.error("OpenAI Realtime API error", event.error);
        this.handler.onError(
          new Error(event.error?.message || "Unknown OpenAI error")
        );
        break;

      default:
        // Log other event types for debugging
        Logger.debug("OpenAI Realtime event", { type: event.type });
    }
  }

  private handleTranscription(event: Record<string, any>): void {
    const transcript = event.transcript;
    if (!transcript || !transcript.trim()) {
      return;
    }

    const endMs = Date.now() - this.sessionStartTime;

    // Simple speaker identification based on turn-taking
    // In a real implementation, you might use voice characteristics or external diarization
    const speakerId = event.item_id || "default";
    let speakerNumber = this.speakerMap.get(speakerId);

    if (speakerNumber === undefined) {
      this.speakerCount++;
      speakerNumber = this.speakerCount;
      this.speakerMap.set(speakerId, speakerNumber);
    }

    const segment: TranscriptSegment = {
      startMs: this.currentSegmentStartMs,
      endMs,
      speaker: `Speaker ${speakerNumber}`,
      text: transcript,
    };

    this.transcriptBuffer.push(segment);

    Logger.info("Transcript segment received", {
      userId: this.userId,
      speaker: segment.speaker,
      text: segment.text.substring(0, 50),
      duration: endMs - this.currentSegmentStartMs,
    });

    // Emit the segment to the client
    this.handler.onTranscript([segment]);

    // Update start time for next segment
    this.currentSegmentStartMs = endMs;
  }

  getFinalTranscript(): TranscriptSegment[] {
    return [...this.transcriptBuffer];
  }

  close(): void {
    if (this.ws) {
      Logger.info("Closing OpenAI Realtime connection", {
        userId: this.userId,
        sessionId: this.sessionId,
        totalSegments: this.transcriptBuffer.length,
      });

      // Send close event
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close(1000, "Client closed connection");
        }
      } catch (err) {
        Logger.error("Error closing OpenAI Realtime connection", err);
      }

      this.ws = null;
    }
  }
}
