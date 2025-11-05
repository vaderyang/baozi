import { useCallback, useEffect, useRef, useState } from "react";

// Extend Window interface for webkit support
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export interface UseSpeechRecognitionOptions {
  language?: string;
}

export interface UseSpeechRecognitionReturn {
  // State
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  isSupported: boolean;
  error: string | null;

  // Methods
  startListening: () => void;
  stopListening: () => void;
  pauseListening: () => void;
  resumeListening: () => void;
  resetTranscript: () => void;
}

/**
 * Hook for managing Web Speech API (SpeechRecognition) for live transcript preview.
 * Provides real-time speech-to-text with interim results during audio recording.
 * Supports multiple languages based on user's locale.
 */
export default function useSpeechRecognition(
  options?: UseSpeechRecognitionOptions
): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isPausedRef = useRef(false);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check browser support on mount
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionAPI);
  }, []);

  // Initialize recognition instance
  const initRecognition = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      return null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;

    // Use provided language or detect from navigator
    const detectedLang =
      typeof navigator !== "undefined" ? navigator.language : "en-US";

    // Convert language format from underscore to hyphen (e.g., zh_CN -> zh-CN)
    // Web Speech API expects BCP 47 language tags with hyphens
    const providedLang = options?.language?.replace("_", "-");
    recognition.lang = providedLang || detectedLang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;

        if (result.isFinal) {
          final += transcriptText + " ";
        } else {
          interim += transcriptText;
        }
      }

      if (final) {
        setTranscript((prev) => prev + final);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Handle recoverable errors by restarting
      if (
        event.error === "no-speech" ||
        event.error === "audio-capture" ||
        event.error === "network"
      ) {
        // These are recoverable, just log and continue
        setError(null);
        return;
      }

      // For other errors, set error state
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setError("Microphone access denied for speech recognition");
      } else if (event.error === "aborted") {
        // Aborted is normal when stopping, ignore
        setError(null);
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }

      setIsListening(false);
    };

    recognition.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (isListening && !isPausedRef.current && recognitionRef.current) {
        // Small delay before restart to avoid rapid cycling
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch (err) {
            // Ignore if already started
            if (
              err instanceof Error &&
              !err.message.includes("already started")
            ) {
              setError(err.message);
              setIsListening(false);
            }
          }
        }, 100);
      } else {
        setIsListening(false);
      }
    };

    return recognition;
  }, [isListening]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser");
      return;
    }

    try {
      if (!recognitionRef.current) {
        recognitionRef.current = initRecognition();
      }

      if (recognitionRef.current) {
        isPausedRef.current = false;
        setError(null);
        recognitionRef.current.start();
        setIsListening(true);
      }
    } catch (err) {
      // Ignore if already started
      if (err instanceof Error && !err.message.includes("already started")) {
        setError(err.message);
      } else {
        setIsListening(true);
      }
    }
  }, [initRecognition, isSupported]);

  const stopListening = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore errors on stop
      }
      recognitionRef.current = null;
    }

    isPausedRef.current = false;
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const pauseListening = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    isPausedRef.current = true;
    setIsListening(false);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore errors on stop
      }
    }

    setInterimTranscript("");
  }, []);

  const resumeListening = useCallback(() => {
    if (!isPausedRef.current) {
      return;
    }

    isPausedRef.current = false;
    setError(null);

    try {
      if (!recognitionRef.current) {
        recognitionRef.current = initRecognition();
      }

      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      }
    } catch (err) {
      // Ignore if already started
      if (err instanceof Error && !err.message.includes("already started")) {
        setError(err.message);
      } else {
        setIsListening(true);
      }
    }
  }, [initRecognition]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore errors on cleanup
        }
        recognitionRef.current = null;
      }
    },
    []
  );

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    resetTranscript,
  };
}
