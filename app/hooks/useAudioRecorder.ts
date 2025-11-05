import { useState, useCallback } from "react";
import useStores from "./useStores";

export interface UseAudioRecorderReturn {
  // State
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  status: string;

  // Actions
  startRecording: (
    documentId: string,
    position: number,
    nodeId: string
  ) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  cancelRecording: () => void;

  // Capabilities
  isSupported: boolean;
  hasPermission: boolean | null;
}

/**
 * Hook for managing audio recording with MediaRecorder API.
 * Integrates with AudioRecorderStore.
 */
export default function useAudioRecorder(): UseAudioRecorderReturn {
  const { audioRecorder } = useStores();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Check if MediaRecorder is supported
  const isSupported = typeof MediaRecorder !== "undefined";

  // Wrapped actions with permission tracking
  const startRecording = useCallback(
    async (documentId: string, position: number, nodeId: string) => {
      try {
        await audioRecorder.startRecording(documentId, position, nodeId);
        setHasPermission(true);
      } catch (error) {
        if (error instanceof Error) {
          if (
            error.name === "NotAllowedError" ||
            error.message.includes("denied")
          ) {
            setHasPermission(false);
            throw new Error("Microphone access denied");
          } else if (error.message.includes("not supported")) {
            throw new Error("Audio recording is not supported in this browser");
          } else if (error.name === "NotFoundError") {
            throw new Error("No microphone device found");
          }
        }
        throw error;
      }
    },
    [audioRecorder]
  );

  const pauseRecording = useCallback(() => {
    audioRecorder.pauseRecording();
  }, [audioRecorder]);

  const resumeRecording = useCallback(() => {
    audioRecorder.resumeRecording();
  }, [audioRecorder]);

  const stopRecording = useCallback(async () => {
    await audioRecorder.stopRecording();
  }, [audioRecorder]);

  const cancelRecording = useCallback(() => {
    audioRecorder.cancelRecording();
  }, [audioRecorder]);

  return {
    // State
    isRecording: audioRecorder.isRecording,
    isPaused: audioRecorder.isPaused,
    duration: audioRecorder.duration,
    error: audioRecorder.error,
    status: audioRecorder.status,

    // Actions
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,

    // Capabilities
    isSupported,
    hasPermission,
  };
}
