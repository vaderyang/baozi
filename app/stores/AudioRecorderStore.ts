import { action, computed, observable, runInAction } from "mobx";
import { AttachmentPreset } from "@shared/types";
import { uploadFile } from "~/utils/files";
import Logger from "~/utils/Logger";
import * as audioRecovery from "~/utils/audioRecovery";
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

export interface RecordingMarker {
  timestamp: number;
  label?: string;
}

export interface ActiveSession {
  documentId: string;
  sessionId: string;
  startTime: number;
  isPaused: boolean;
  markers: RecordingMarker[];
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

  @observable
  autoGenerateSummary = true;

  @observable
  markers: RecordingMarker[] = [];

  @observable
  isMinimized = false;

  @observable
  realtimeTranscript = "";

  @observable
  sessionId: string | null = null;

  @observable
  chunkSaveInterval: number | null = null;

  @observable
  lastChunkIndex = 0;

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

  /**
   * Get the active recording session
   */
  @computed
  get activeSession(): ActiveSession | null {
    if (!this.sourceDocumentId || !this.sessionId || !this.startTime) {
      return null;
    }

    return {
      documentId: this.sourceDocumentId,
      sessionId: this.sessionId,
      startTime: this.startTime,
      isPaused: this.isPaused,
      markers: this.markers,
    };
  }

  @action
  startRecording = async (
    documentId: string,
    position: number,
    nodeId?: string
  ): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log("[AudioRecorderStore] startRecording called:", {
      documentId,
      position,
      nodeId,
      isActive: this.isActive,
    });

    if (this.isActive) {
      // eslint-disable-next-line no-console
      console.error("[AudioRecorderStore] Recording already in progress");
      throw new Error("Recording already in progress");
    }

    if (typeof MediaRecorder === "undefined") {
      // eslint-disable-next-line no-console
      console.error("[AudioRecorderStore] MediaRecorder API not supported");
      throw new Error("MediaRecorder API is not supported in this browser");
    }

    // Generate nodeId if not provided
    const recordingNodeId = nodeId || this.generateNodeId();

    // Generate a unique session ID
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // eslint-disable-next-line no-console
    console.log("[AudioRecorderStore] Requesting microphone permission...");

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // eslint-disable-next-line no-console
      console.log(
        "[AudioRecorderStore] Microphone permission granted, stream obtained"
      );

      // eslint-disable-next-line no-console
      console.log("[AudioRecorderStore] Setting recording state...");

      runInAction(() => {
        this.mediaStream = stream;
        this.sourceDocumentId = documentId;
        this.sessionId = newSessionId;
        this.insertionPoint = {
          documentId,
          position,
          nodeId: recordingNodeId,
        };
        this.startTime = Date.now();
        this.pausedDuration = 0;
        this.pauseStartTime = null;
        this.audioChunks = [];
        this.markers = [];
        this.isRecording = true;
        this.isPaused = false;
        this.status = "recording";
        this.error = null;
        this.transcriptionResult = null;
        this.lastAttachment = null;
        this.isMinimized = false;
        this.realtimeTranscript = "";
      });

      // Initialize audio analysis for level meter
      this.setupAudioAnalysis(stream);

      // Initialize MediaRecorder with best available codec
      const mimeType = this.selectBestCodec();
      // eslint-disable-next-line no-console
      console.log(
        "[AudioRecorderStore] Creating MediaRecorder with mimeType:",
        mimeType
      );
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
      // eslint-disable-next-line no-console
      console.log("[AudioRecorderStore] Starting MediaRecorder...");
      this.mediaRecorder.start(1000); // Collect data every second
      // eslint-disable-next-line no-console
      console.log(
        "[AudioRecorderStore] MediaRecorder started successfully, isActive:",
        this.isActive
      );

      // Start saving chunks to IndexedDB every 10 seconds
      if (audioRecovery.isIndexedDBSupported()) {
        this.startChunkSaving();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[AudioRecorderStore] Failed to start recording:", error);
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
    Logger.debug("store", "stopRecording invoked", {
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
        Logger.debug("store", "MediaRecorder already inactive on stop");
        finalizeBlob();
      } else {
        try {
          Logger.debug("store", "Calling MediaRecorder.stop()");
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

      // Stop chunk saving
      this.stopChunkSaving();

      // Stop media stream tracks
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }

      // Close audio context
      if (this.audioContext) {
        this.audioContext.close();
      }
    });

    // Clean up IndexedDB chunks for this session
    if (this.sessionId) {
      void audioRecovery.deleteSession(this.sessionId);
    }

    // Start upload and transcription flow asynchronously
    Logger.debug("store", "Starting upload and transcription", {
      blobSize: audioBlob.size,
    });
    void this.uploadAndTranscribe(audioBlob);
  };

  @action
  cancelRecording = (): void => {
    // Stop chunk saving
    this.stopChunkSaving();

    // Clean up IndexedDB chunks for this session
    if (this.sessionId) {
      void audioRecovery.deleteSession(this.sessionId);
    }

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

  @action
  setAutoGenerateSummary = (value: boolean): void => {
    this.autoGenerateSummary = value;
  };

  /**
   * Add a marker at the current recording timestamp
   */
  @action
  addMarker = (label?: string): void => {
    if (!this.isActive) {
      return;
    }

    const marker: RecordingMarker = {
      timestamp: this.duration,
      label,
    };

    this.markers.push(marker);
  };

  /**
   * Minimize the Recording Studio (show Global Recording Control instead)
   */
  @action
  minimizeStudio = (): void => {
    if (!this.isActive) {
      return;
    }

    this.isMinimized = true;
  };

  /**
   * Reopen the Recording Studio (hide Global Recording Control)
   */
  @action
  reopenStudio = (): void => {
    this.isMinimized = false;
  };

  /**
   * Update the realtime transcript text
   */
  @action
  setRealtimeTranscript = (text: string): void => {
    this.realtimeTranscript = text;
  };

  /**
   * Start saving audio chunks to IndexedDB every 10 seconds
   */
  @action
  private startChunkSaving = (): void => {
    if (this.chunkSaveInterval) {
      return;
    }

    const interval = window.setInterval(() => {
      void this.saveCurrentChunks();
    }, 10000); // Save every 10 seconds

    this.chunkSaveInterval = interval;
  };

  /**
   * Stop saving chunks to IndexedDB
   */
  @action
  private stopChunkSaving = (): void => {
    if (this.chunkSaveInterval) {
      window.clearInterval(this.chunkSaveInterval);
      this.chunkSaveInterval = null;
    }
  };

  /**
   * Save current audio chunks to IndexedDB
   */
  @action
  private saveCurrentChunks = async (): Promise<void> => {
    if (
      !this.sessionId ||
      !this.sourceDocumentId ||
      this.audioChunks.length === 0
    ) {
      return;
    }

    try {
      // Save each new chunk
      for (let i = this.lastChunkIndex; i < this.audioChunks.length; i++) {
        const chunk: audioRecovery.RecordingChunk = {
          sessionId: this.sessionId,
          documentId: this.sourceDocumentId,
          chunkIndex: i,
          blob: this.audioChunks[i],
          timestamp: Date.now(),
          duration: this.duration,
        };

        await audioRecovery.saveChunk(chunk);
      }

      runInAction(() => {
        this.lastChunkIndex = this.audioChunks.length;
      });
    } catch (error) {
      // Silently fail - chunk saving is optional
      Logger.error(
        "Failed to save audio chunks",
        error instanceof Error ? error : new Error(String(error))
      );
    }
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

      // Create transcription job using TranscriptionJobsStore
      const job = await this.rootStore.transcriptionJobs.createJob(
        attachmentId,
        this.sourceDocumentId,
        {
          sourceType: "recording",
          autoSummary: this.autoGenerateSummary,
        }
      );

      runInAction(() => {
        this.currentJobId = job.id;
      });

      // Poll for transcription completion
      await this.pollTranscriptionStatus(job.id);
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
        // Get job from TranscriptionJobsStore
        const job = this.rootStore.transcriptionJobs.getJob(jobId);

        if (!job) {
          throw new Error("Transcription job not found");
        }

        if (job.status === "completed") {
          // Transcription completed successfully (even if empty)
          await this.insertTranscribedText(job.result?.text || "");
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

    // eslint-disable-next-line no-console
    console.log(
      "[AudioRecorderStore] Transcription completed, text length:",
      text.length
    );

    runInAction(() => {
      this.transcriptionResult = text;
      this.status = "completed";
    });

    // Update document audioMetadata to exit Recording Studio mode
    // This will cause the Document component to show the editor instead of Recording Studio
    const document = this.rootStore.documents.get(
      this.insertionPoint.documentId
    );
    if (document) {
      // eslint-disable-next-line no-console
      console.log(
        "[AudioRecorderStore] Updating document audioMetadata to exit Recording Studio mode"
      );
      // eslint-disable-next-line no-console
      console.log(
        "[AudioRecorderStore] Current audioMetadata:",
        JSON.stringify(document.audioMetadata)
      );

      const updatedDoc = await document.save({
        audioMetadata: {
          ...document.audioMetadata,
          sourceType: "upload", // Change from "recording" to "upload" to exit Recording Studio mode
        },
      });

      // eslint-disable-next-line no-console
      console.log(
        "[AudioRecorderStore] Document updated, new audioMetadata:",
        JSON.stringify(updatedDoc.audioMetadata)
      );

      // eslint-disable-next-line no-console
      console.log(
        "[AudioRecorderStore] Document updated locally, final audioMetadata:",
        JSON.stringify(document.audioMetadata)
      );
    }

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
    // Stop chunk saving
    this.stopChunkSaving();

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
    this.sessionId = null;
    this.insertionPoint = null;
    this.audioChunks = [];
    this.markers = [];
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
    this.autoGenerateSummary = true;
    this.isMinimized = false;
    this.realtimeTranscript = "";
    this.chunkSaveInterval = null;
    this.lastChunkIndex = 0;
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
   * Check for incomplete recordings on app load
   */
  @action
  checkForIncompleteRecordings = async (): Promise<
    audioRecovery.RecoverySession[]
  > => {
    if (!audioRecovery.isIndexedDBSupported()) {
      return [];
    }

    try {
      const sessions = await audioRecovery.getIncompleteSessions();
      return sessions;
    } catch (error) {
      Logger.error(
        "Failed to check for incomplete recordings",
        error instanceof Error ? error : new Error(String(error))
      );
      return [];
    }
  };

  /**
   * Recover a recording from IndexedDB
   */
  @action
  recoverRecording = async (sessionId: string): Promise<void> => {
    try {
      const { blob } = await audioRecovery.reconstructAudio(sessionId);

      // Get the session info
      const sessions = await audioRecovery.getIncompleteSessions();
      const session = sessions.find((s) => s.sessionId === sessionId);

      if (!session) {
        throw new Error("Session not found");
      }

      // Set up state for upload
      runInAction(() => {
        this.sourceDocumentId = session.documentId;
        this.sessionId = sessionId;
        this.status = "uploading";
      });

      // Upload and transcribe the recovered audio
      await this.uploadAndTranscribe(blob);

      // Clean up IndexedDB
      await audioRecovery.deleteSession(sessionId);
    } catch (error) {
      runInAction(() => {
        this.error =
          error instanceof Error
            ? error.message
            : "Failed to recover recording";
        this.status = "error";
      });
      throw error;
    }
  };

  /**
   * Discard a recovered recording
   */
  @action
  discardRecoveredRecording = async (sessionId: string): Promise<void> => {
    try {
      await audioRecovery.deleteSession(sessionId);
    } catch (error) {
      Logger.error(
        "Failed to discard recovered recording",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };

  /**
   * Clean up old chunks from IndexedDB
   */
  @action
  cleanupOldChunks = async (): Promise<void> => {
    if (!audioRecovery.isIndexedDBSupported()) {
      return;
    }

    try {
      await audioRecovery.cleanupOldChunks();
    } catch (error) {
      Logger.error(
        "Failed to cleanup old chunks",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };

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
