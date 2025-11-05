import { useEffect, useState, useCallback, useRef } from "react";
import useStores from "./useStores";

export interface UseAudioRecorderReturn {
  // State
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  waveformData: Uint8Array;
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
 * Provides waveform visualization data and integrates with AudioRecorderStore.
 */
export default function useAudioRecorder(): UseAudioRecorderReturn {
  const { audioRecorder } = useStores();
  const [waveformData, setWaveformData] = useState<Uint8Array>(
    new Uint8Array(128)
  );
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isUpdatingWaveform = useRef(false);

  // Check if MediaRecorder is supported
  const isSupported = typeof MediaRecorder !== "undefined";

  // Update waveform data at 30 FPS
  const updateWaveform = useCallback(() => {
    if (!audioRecorder.analyser || !audioRecorder.isRecording) {
      isUpdatingWaveform.current = false;
      return;
    }

    const bufferLength = audioRecorder.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    audioRecorder.analyser.getByteFrequencyData(dataArray);

    setWaveformData(dataArray);

    // Continue animation at 30 FPS (approximately every 33ms)
    animationFrameRef.current = window.requestAnimationFrame(updateWaveform);
  }, [audioRecorder]);

  // Start waveform updates when recording starts
  useEffect(() => {
    if (audioRecorder.isRecording && !isUpdatingWaveform.current) {
      isUpdatingWaveform.current = true;
      updateWaveform();
    }

    // Cleanup on unmount or when recording stops
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      isUpdatingWaveform.current = false;
    };
  }, [audioRecorder.isRecording, updateWaveform]);

  // Stop waveform updates when paused
  useEffect(() => {
    if (audioRecorder.isPaused && animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      isUpdatingWaveform.current = false;
    } else if (audioRecorder.isRecording && !isUpdatingWaveform.current) {
      isUpdatingWaveform.current = true;
      updateWaveform();
    }
  }, [audioRecorder.isPaused, audioRecorder.isRecording, updateWaveform]);

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
    setWaveformData(new Uint8Array(128));
  }, [audioRecorder]);

  const cancelRecording = useCallback(() => {
    audioRecorder.cancelRecording();
    // Reset waveform data
    setWaveformData(new Uint8Array(128));
  }, [audioRecorder]);

  return {
    // State
    isRecording: audioRecorder.isRecording,
    isPaused: audioRecorder.isPaused,
    duration: audioRecorder.duration,
    waveformData,
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
