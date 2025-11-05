import { action, computed, observable, runInAction } from "mobx";
import { AttachmentPreset } from "@shared/types";
import { client } from "~/utils/ApiClient";
import { uploadFile } from "~/utils/files";
import Logger from "~/utils/Logger";
import type RootStore from "./RootStore";

export interface InsertionPoint {
  documentId: string;
  position: number;
  nodeId: string;
}

export interface RecordingAttachmentMetadata {
  id: string;
  name: string;
  size: number;
}

export type RecordingStatus =
  | "idle"
  | "recording"
  | "paused"
  | "stopped"
  | "uploading"
  | "transcribing"
  | "completed"
  | "error";

/**
 * AudioRecorderStore manages the global state for audio recording sessions.
 *
 * State Persistence:
 * - All recording state persists across document navigation via MobX observables
 * - The insertionPoint maintains reference to the source document and position
 * - MediaRecorder and audio streams remain active during navigation
 * - Waveform data continues to update regardless of current document
 * - GlobalRecorderController visibility is determined by comparing activeDocumentId
 *   with sourceDocumentId
 */
class AudioRecorderStore {
  @observable
  isRecording = false;

  @observable
  isPaused = false;

  @observable
  startTime: number | null = null;

  @observable
  pausedDuration = 0;

  @observable
  pauseStartTime: number | null = null;

  @observable
  sourceDocumentId: string | null = null;

  @observable
  insertionPoint: InsertionPoint | null = null;

  @observable
  audioChunks: Blob[] = [];

  @observable
  mediaRecorder: MediaRecorder | null = null;

  @observable
  mediaStream: MediaStream | null = null;

  @observable
  audioContext: AudioContext | null = null;

  @observable
  analyser: AnalyserNode | null = null;

  @observable
  status: RecordingStatus = "idle";

  @observable
  error: string | null = null;

  @observable
  uploadProgress = 0;

  @observable
  currentJobId: string | null = null;

  @observable
  transcriptionResult: string | null = null;

  @observable
  lastAttachment: RecordingAttachmentMetadata | null = null;

  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    this.setupBeforeUnloadHandler();
  }

  /**
   * Set up beforeunload handler to warn users when leaving with active recording
   */
  private setupBeforeUnloadHandler = (): void => {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.handleBeforeUnload);
    }
  };

  /**
   * Handle beforeunload event to warn user about active recording
   */
  private handleBeforeUnload = (
    event: BeforeUnloadEvent
  ): string | undefined => {
    // Only show warning if recording is active
    if (this.isActive) {
      const message = "Recording in progress. Are you sure you want to leave?";
      event.preventDefault();
      event.returnValue = message; // For older browsers
      return message; // For modern browsers
    }
    return undefined;
  };

  /**
   * Clean up beforeunload handler
   */
  private removeBeforeUnloadHandler = (): void => {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.handleBeforeUnload);
    }
  };

  @computed
  get duration(): number {
    if (!this.startTime) {
      return 0;
    }

    const now = Date.now();
    const elapsed = now - this.startTime;
    return Math.max(0, elapsed - this.pausedDuration);
  }

  @computed
  get isActive(): boolean {
    return this.isRecording || this.isPaused;
  }

  @computed
  get canRecord(): boolean {
    return !this.isActive && typeof MediaRecorder !== "undefined";
  }

  /**
   * Generate a unique node ID for the recording placeholder
   */
  generateNodeId(): string {
    return `recording-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if the current insertion point is still valid
   * This will be used when inserting transcribed text to ensure the position still exists
   */
  @computed
  get hasValidInsertionPoint(): boolean {
    return this.insertionPoint !== null;
  }

  /**
   * Get the current insertion point
   */
  getInsertionPoint(): InsertionPoint | null {
    return this.insertionPoint;
  }

  @action
  startRecording = async (
    documentId: string,
    position: number,
    nodeId?: string
  ): Promise<void> => {
    if (this.isActive) {
      throw new Error("Recording already in progress");
    }

    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder API is not supported in this browser");
    }

    // Generate nodeId if not provided
    const recordingNodeId = nodeId || this.generateNodeId();

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      runInAction(() => {
        this.mediaStream = stream;
        this.sourceDocumentId = documentId;
        this.insertionPoint = {
          documentId,
          position,
          nodeId: recordingNodeId,
        };
        this.startTime = Date.now();
        this.pausedDuration = 0;
        this.pauseStartTime = null;
        this.audioChunks = [];
        this.isRecording = true;
        this.isPaused = false;
        this.status = "recording";
        this.error = null;
        this.transcriptionResult = null;
        this.lastAttachment = null;
      });

      // Initialize MediaRecorder with best available codec
      const mimeType = this.selectBestCodec();
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
      });

      // Collect audio chunks
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          runInAction(() => {
            this.audioChunks.push(event.data);
          });
        }
      };

      // Handle errors
      this.mediaRecorder.onerror = () => {
        const errorMessage = "Recording failed. Please try again.";
        runInAction(() => {
          this.error = errorMessage;
          this.status = "error";
        });

        // Stop recording and cleanup on error
        this.cleanup();
      };

      // Start recording
      this.mediaRecorder.start(1000); // Collect data every second

      // Set up audio analysis for waveform
      this.setupAudioAnalysis(stream);
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error ? error.message : "Failed to start recording";
        this.status = "error";
        this.cleanup();
      });
      throw error;
    }
  };

  @action
  pauseRecording = (): void => {
    if (!this.isRecording || this.isPaused) {
      return;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.isRecording = false;
      this.pauseStartTime = Date.now();
      this.status = "paused";
    }
  };

  @action
  resumeRecording = (): void => {
    if (!this.isPaused) {
      return;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.isRecording = true;
      this.status = "recording";

      // Update paused duration
      if (this.pauseStartTime) {
        this.pausedDuration += Date.now() - this.pauseStartTime;
        this.pauseStartTime = null;
      }
    }
  };

  @action
  stopRecording = async (): Promise<void> => {
    if (!this.mediaRecorder) {
      throw new Error("No active recording");
    }

    // Create a promise to wait for the recording to stop
    Logger.debug("audioRecorder", "stopRecording invoked", {
      mediaRecorderState: this.mediaRecorder.state,
      isRecording: this.isRecording,
      isPaused: this.isPaused,
    });

    const audioBlob = await new Promise<Blob>((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("No active recording"));
        return;
      }

      let resolved = false;
      const finalizeBlob = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        const blob = new Blob(this.audioChunks, {
          type: this.mediaRecorder?.mimeType || "audio/webm",
        });
        resolve(blob);
      };

      // Set up handler for when recording stops
      this.mediaRecorder.onstop = () => {
        if (this.mediaRecorder) {
          this.mediaRecorder.onstop = null;
        }
        finalizeBlob();
      };

      // Stop the recorder
      if (this.mediaRecorder.state === "inactive") {
        Logger.debug("audioRecorder", "MediaRecorder already inactive on stop");
        finalizeBlob();
      } else {
        try {
          Logger.debug("audioRecorder", "Calling MediaRecorder.stop()");
          this.mediaRecorder.stop();
        } catch (error) {
          Logger.error(
            "MediaRecorder stop failed",
            error instanceof Error ? error : new Error(String(error))
          );
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });

    runInAction(() => {
      this.status = "stopped";
      this.isRecording = false;
      this.isPaused = false;

      // Stop media stream tracks
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }

      // Close audio context
      if (this.audioContext) {
        this.audioContext.close();
      }
    });

    // Start upload and transcription flow asynchronously
    Logger.debug("audioRecorder", "Starting upload and transcription", {
      blobSize: audioBlob.size,
    });
    void this.uploadAndTranscribe(audioBlob);
  };

  @action
  cancelRecording = (): void => {
    // Stop MediaRecorder immediately if it's active
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    // Stop all media tracks to release microphone
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
    }

    // Discard all audio chunks and blob
    this.audioChunks = [];

    // Clean up and reset state
    this.cleanup();
  };

  @action
  setStatus = (status: RecordingStatus): void => {
    this.status = status;
  };

  @action
  setError = (error: string): void => {
    this.error = error;
    this.status = "error";
  };

  /**
   * Upload audio blob and start transcription
   */
  @action
  private uploadAndTranscribe = async (audioBlob: Blob): Promise<void> => {
    if (!this.insertionPoint) {
      throw new Error("No insertion point set");
    }

    try {
      // Update status to uploading
      runInAction(() => {
        this.status = "uploading";
        this.uploadProgress = 0;
      });

      // Upload the audio file
      const attachmentId = await this.uploadAudio(audioBlob);

      // Start transcription
      await this.startTranscription(attachmentId);
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error
            ? error.message
            : "Upload or transcription failed";
        this.status = "error";
      });
      throw error;
    }
  };

  /**
   * Upload audio blob to server
   */
  @action
  private uploadAudio = async (audioBlob: Blob): Promise<string> => {
    if (!this.sourceDocumentId) {
      throw new Error("No source document ID");
    }

    try {
      // Determine file extension based on mime type
      const mimeType = audioBlob.type || "audio/webm";
      let extension = ".webm";
      if (mimeType.includes("mp4")) {
        extension = ".mp4";
      } else if (mimeType.includes("wav")) {
        extension = ".wav";
      } else if (mimeType.includes("ogg")) {
        extension = ".ogg";
      }

      // Create a File object from the blob
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `recording-${timestamp}${extension}`;
      const file = new File([audioBlob], fileName, { type: mimeType });

      // Upload using existing uploadFile utility
      const attachment = await uploadFile(file, {
        documentId: this.sourceDocumentId,
        preset: AttachmentPreset.AudioTranscription,
        name: fileName,
        onProgress: (progress) => {
          runInAction(() => {
            this.uploadProgress = progress;
          });
        },
      });

      runInAction(() => {
        this.lastAttachment = {
          id: attachment.id,
          name: attachment.name || fileName,
          size:
            typeof attachment.size === "number" ? attachment.size : file.size,
        };
      });

      return attachment.id;
    } catch (error) {
      // Log error details for debugging

      // Preserve audio blob for retry by keeping audioChunks
      const errorMessage =
        error instanceof Error
          ? `Upload failed: ${error.message}`
          : "Upload failed. Please try again.";

      throw new Error(errorMessage);
    }
  };

  /**
   * Start transcription job
   */
  @action
  private startTranscription = async (attachmentId: string): Promise<void> => {
    if (!this.sourceDocumentId) {
      throw new Error("No source document ID");
    }

    try {
      runInAction(() => {
        this.status = "transcribing";
      });

      // Call transcriptions.create API
      const response = await client.post<{
        data: { jobId: string; status: string };
      }>("/transcriptions.create", {
        attachmentId,
        documentId: this.sourceDocumentId,
      });

      const jobId = response.data.jobId;

      runInAction(() => {
        this.currentJobId = jobId;
      });

      // Poll for transcription completion
      await this.pollTranscriptionStatus(jobId);
    } catch (error) {
      // Log error details for debugging

      // Preserve audio blob for retry by keeping audioChunks
      const errorMessage =
        error instanceof Error
          ? `Transcription failed: ${error.message}`
          : "Transcription failed. Please try again.";

      throw new Error(errorMessage);
    }
  };

  /**
   * Poll transcription job status until completion
   */
  @action
  private pollTranscriptionStatus = async (jobId: string): Promise<void> => {
    const maxAttempts = 120; // 10 minutes with 5 second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

      try {
        const response = await client.post<{
          data: {
            id: string;
            status: string;
            progress: number | null;
            error: string | null;
            result: { text: string } | null;
          };
        }>("/transcriptions.info", {
          jobId,
        });

        const job = response.data;

        if (job.status === "completed" && job.result) {
          // Transcription completed successfully
          await this.insertTranscribedText(job.result.text);
          return;
        } else if (job.status === "failed") {
          // Transcription failed - preserve error message from API
          const errorMessage = job.error || "Transcription failed";
          throw new Error(errorMessage);
        }

        // Continue polling if status is queued or processing
        attempts++;
      } catch (error) {
        // Log error for debugging

        runInAction(() => {
          this.error =
            error instanceof Error
              ? error.message
              : "Failed to check transcription status";
          this.status = "error";
        });
        throw error;
      }
    }

    // Timeout - log for debugging
    throw new Error("Transcription timed out. Please try again.");
  };

  /**
   * Insert transcribed text at the insertion point
   */
  @action
  private insertTranscribedText = async (text: string): Promise<void> => {
    if (!this.insertionPoint) {
      throw new Error("No insertion point");
    }

    runInAction(() => {
      this.transcriptionResult = text;
      this.status = "completed";
    });

    // The actual text insertion will be handled by the editor component
    // using the replaceRecordingPlaceholderWithText command
    // This is because we need access to the editor view which is not available in the store
  };

  /**
   * Retry upload and transcription after an error
   */
  @action
  retryUploadAndTranscription = async (): Promise<void> => {
    if (this.audioChunks.length === 0) {
      throw new Error("No audio data to retry");
    }

    // Recreate the audio blob from chunks
    const audioBlob = new Blob(this.audioChunks, {
      type: this.mediaRecorder?.mimeType || "audio/webm",
    });

    // Reset error state
    runInAction(() => {
      this.error = null;
      this.status = "uploading";
    });

    // Retry upload and transcription
    await this.uploadAndTranscribe(audioBlob);
  };

  @action
  finalizeRecordingSession = (): void => {
    this.cleanup();
  };

  @action
  private cleanup = (): void => {
    // Stop all media tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
    }

    // Reset state
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = null;
    this.pausedDuration = 0;
    this.pauseStartTime = null;
    this.sourceDocumentId = null;
    this.insertionPoint = null;
    this.audioChunks = [];
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.status = "idle";
    this.uploadProgress = 0;
    this.currentJobId = null;
    this.transcriptionResult = null;
    this.error = null;
    this.lastAttachment = null;
  };

  private selectBestCodec(): string {
    const codecs = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/wav",
    ];

    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) {
        return codec;
      }
    }

    return "";
  }

  private setupAudioAnalysis(stream: MediaStream): void {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      source.connect(analyser);

      runInAction(() => {
        this.audioContext = audioContext;
        this.analyser = analyser;
      });
    } catch {
      // Audio analysis is optional, silently fail
    }
  }

  /**
   * Destroy the store and clean up resources
   */
  destroy = (): void => {
    this.removeBeforeUnloadHandler();
    if (this.isActive) {
      this.cancelRecording();
    }
  };
}

export default AudioRecorderStore;
