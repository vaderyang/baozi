import { observer } from "mobx-react";
import { CloseIcon, WarningIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { css, keyframes } from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Tooltip from "~/components/Tooltip";
import { useDocumentContext } from "~/components/DocumentContext";
import useSpeechRecognition from "~/hooks/useSpeechRecognition";
import useStores from "~/hooks/useStores";
import type { RecordingStatus } from "~/stores/AudioRecorderStore";
import Logger from "~/utils/Logger";

const COMPACT_STATUS_SET: ReadonlySet<RecordingStatus> =
  new Set<RecordingStatus>([
    "recording",
    "paused",
    "uploading",
    "transcribing",
    "stopped",
  ]);

// Simple icon components for media controls
const PauseIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const PlayIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const StopIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

interface RecordingPlaceholderCardProps {
  nodeId: string;
  initialStatus: RecordingStatus;
  initialStartTime?: number | null;
}

/**
 * RecordingPlaceholderCard is an inline card component that displays the status
 * of an active audio recording session. It shows recording status, duration,
 * live transcript preview, and control buttons.
 *
 * State Persistence:
 * - The placeholder node persists in the ProseMirror document state
 * - When the user navigates away and returns, the component re-renders with
 *   the same nodeId and reconnects to the AudioRecorderStore
 * - Duration and live transcript continue updating via MobX observables and Web Speech API
 * - The component remains functional across document navigation
 */

const RecordingPlaceholderCard: React.FC<RecordingPlaceholderCardProps> =
  observer(({ nodeId, initialStatus, initialStartTime }) => {
    const { audioRecorder } = useStores();
    const { t, i18n } = useTranslation();
    const { editor } = useDocumentContext();
    const {
      transcript,
      interimTranscript,
      isSupported: isSpeechSupported,
      startListening,
      stopListening,
      pauseListening,
      resumeListening,
      resetTranscript,
    } = useSpeechRecognition({
      language: i18n.language,
    });
    const transcriptRef = React.useRef<HTMLDivElement>(null);
    const [displayDuration, setDisplayDuration] = React.useState(() => {
      if (initialStartTime) {
        return Math.max(0, Date.now() - initialStartTime);
      }
      return 0;
    });
    const [isStopPending, setIsStopPending] = React.useState(false);
    const hasMatchedRecordingRef = React.useRef(false);
    const hasReplacedWithStatusCardRef = React.useRef(false);
    const lastSyncedPlaceholderRef = React.useRef<{
      status: RecordingStatus;
      startTime: number | null;
    }>({
      status: initialStatus,
      startTime: initialStartTime ?? null,
    });

    const isMatchingRecording = audioRecorder.insertionPoint?.nodeId === nodeId;

    React.useEffect(() => {
      if (isMatchingRecording) {
        hasMatchedRecordingRef.current = true;
      }
    }, [isMatchingRecording]);

    React.useEffect(() => {
      Logger.debug("editor", "RecordingPlaceholderCard render", {
        nodeId,
        insertionPointNodeId: audioRecorder.insertionPoint?.nodeId,
        status: audioRecorder.status,
        isMatching: isMatchingRecording,
      });
    }, [
      audioRecorder.insertionPoint,
      audioRecorder.status,
      isMatchingRecording,
      nodeId,
    ]);

    React.useEffect(() => {
      if (!isMatchingRecording || !editor) {
        return;
      }

      const currentStatus = audioRecorder.status;
      const currentStartTime = audioRecorder.startTime ?? null;
      const lastSynced = lastSyncedPlaceholderRef.current;

      if (
        lastSynced.status === currentStatus &&
        lastSynced.startTime === currentStartTime
      ) {
        return;
      }

      editor.commands.updateRecordingPlaceholder?.({
        nodeId,
        updates: {
          status: currentStatus,
          startTime: currentStartTime,
        },
      });

      lastSyncedPlaceholderRef.current = {
        status: currentStatus,
        startTime: currentStartTime,
      };
    }, [
      audioRecorder.startTime,
      audioRecorder.status,
      editor,
      isMatchingRecording,
      nodeId,
    ]);

    React.useEffect(() => {
      if (
        hasMatchedRecordingRef.current &&
        isMatchingRecording &&
        audioRecorder.status === "idle" &&
        !audioRecorder.insertionPoint &&
        editor
      ) {
        editor.commands.removeRecordingPlaceholder({ nodeId });
      }
    }, [
      audioRecorder.status,
      audioRecorder.insertionPoint,
      editor,
      isMatchingRecording,
      nodeId,
    ]);

    React.useEffect(() => {
      if (isMatchingRecording) {
        const interval = window.setInterval(() => {
          setDisplayDuration(audioRecorder.duration);
        }, 1000);

        return () => window.clearInterval(interval);
      }

      if (initialStartTime) {
        const interval = window.setInterval(() => {
          setDisplayDuration(Math.max(0, Date.now() - initialStartTime));
        }, 1000);

        return () => window.clearInterval(interval);
      }

      return undefined;
    }, [audioRecorder, initialStartTime, isMatchingRecording]);

    React.useEffect(() => {
      if (
        !isMatchingRecording ||
        hasReplacedWithStatusCardRef.current ||
        !editor ||
        !editor.view ||
        !audioRecorder.currentJobId ||
        !audioRecorder.lastAttachment ||
        audioRecorder.status === "recording" ||
        audioRecorder.status === "paused"
      ) {
        return;
      }

      const { view } = editor;
      const { state, dispatch } = view;
      const { schema } = state;
      const statusCardType = schema.nodes.transcription_status_card;
      const placeholderType = schema.nodes.recording_placeholder;

      if (!statusCardType || !placeholderType) {
        return;
      }

      let replaced = false;
      const progressPercent = Math.min(
        100,
        Math.max(0, Math.round(audioRecorder.uploadProgress * 100))
      );
      const statusAttr =
        audioRecorder.status === "uploading" ? "queued" : "processing";

      state.doc.descendants((node, pos) => {
        if (node.type === placeholderType && node.attrs.nodeId === nodeId) {
          const statusCardNode = statusCardType.create({
            jobId: audioRecorder.currentJobId,
            fileName: audioRecorder.lastAttachment.name,
            fileSize: audioRecorder.lastAttachment.size,
            status: statusAttr,
            progress: Number.isFinite(progressPercent) ? progressPercent : 0,
            error: null,
          });

          const tr = state.tr.replaceWith(
            pos,
            pos + node.nodeSize,
            statusCardNode
          );
          dispatch(tr.scrollIntoView());
          replaced = true;
          return false;
        }
        return true;
      });

      if (replaced) {
        hasReplacedWithStatusCardRef.current = true;
      }
    }, [
      audioRecorder.currentJobId,
      audioRecorder.lastAttachment,
      audioRecorder.status,
      audioRecorder.uploadProgress,
      editor,
      isMatchingRecording,
      nodeId,
    ]);

    const preventDefault = React.useCallback((event: React.MouseEvent) => {
      event.preventDefault();
    }, []);

    const displayStatus: RecordingStatus = React.useMemo(
      () => (isMatchingRecording ? audioRecorder.status : initialStatus),
      [audioRecorder.status, initialStatus, isMatchingRecording]
    );

    const formatDuration = (ms: number): string => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    };

    const canControlRecording = isMatchingRecording;
    const isLongRecording = displayDuration > 60 * 60 * 1000;

    const handlePause = React.useCallback(() => {
      if (!canControlRecording) {
        return;
      }
      Logger.debug("editor", "RecordingPlaceholderCard pause clicked", {
        nodeId,
      });
      audioRecorder.pauseRecording();
      pauseListening();
    }, [audioRecorder, canControlRecording, nodeId, pauseListening]);

    const handleResume = React.useCallback(() => {
      if (!canControlRecording) {
        return;
      }
      Logger.debug("editor", "RecordingPlaceholderCard resume clicked", {
        nodeId,
      });
      audioRecorder.resumeRecording();
      resumeListening();
    }, [audioRecorder, canControlRecording, nodeId, resumeListening]);

    const handleStop = React.useCallback(async () => {
      if (!canControlRecording || isStopPending) {
        return;
      }

      setIsStopPending(true);
      Logger.debug("editor", "RecordingPlaceholderCard stop clicked", {
        nodeId,
        mediaRecorderState: audioRecorder.mediaRecorder?.state,
      });

      try {
        stopListening();
        await audioRecorder.stopRecording();
      } catch (error) {
        Logger.error("Failed to stop recording", error as Error);
        toast.error(t("Failed to stop recording. Please try again."));
      } finally {
        setIsStopPending(false);
      }
    }, [
      audioRecorder,
      canControlRecording,
      isStopPending,
      nodeId,
      stopListening,
      t,
    ]);

    const handleCancel = React.useCallback(() => {
      if (!canControlRecording) {
        return;
      }

      if (
        window.confirm(
          t(
            "Are you sure you want to cancel this recording? All audio will be lost."
          )
        )
      ) {
        Logger.debug("editor", "RecordingPlaceholderCard cancel clicked", {
          nodeId,
        });
        stopListening();
        resetTranscript();
        audioRecorder.cancelRecording();

        if (editor) {
          editor.commands.removeRecordingPlaceholder({ nodeId });
        }
      }
    }, [
      audioRecorder,
      canControlRecording,
      editor,
      nodeId,
      resetTranscript,
      stopListening,
      t,
    ]);

    const handleRetry = React.useCallback(async () => {
      if (!canControlRecording) {
        return;
      }

      try {
        await audioRecorder.retryUploadAndTranscription();
      } catch (error) {
        Logger.error(
          "Failed to retry upload and transcription",
          error as Error
        );
        toast.error(t("Failed to retry. Please try again."));
      }
    }, [audioRecorder, canControlRecording, t]);

    const getStatusDisplay = () => {
      switch (displayStatus) {
        case "recording":
          return { text: t("Recording"), showPulse: true };
        case "paused":
          return { text: t("Paused"), showPulse: false };
        case "uploading":
          return { text: t("Uploading..."), showPulse: false };
        case "transcribing":
          return { text: t("Transcribing..."), showPulse: false };
        case "stopped":
          return { text: t("Processing audio..."), showPulse: false };
        case "completed":
          return { text: t("Processing transcript..."), showPulse: false };
        case "error":
          return { text: t("Error"), showPulse: false };
        case "idle":
          return { text: t("Preparing microphone..."), showPulse: false };
        default:
          return { text: t("Recording"), showPulse: true };
      }
    };

    const statusDisplay = getStatusDisplay();
    const isRecording = displayStatus === "recording";
    const isPaused = displayStatus === "paused";
    const isError = displayStatus === "error";
    const isProcessing =
      displayStatus === "uploading" ||
      displayStatus === "transcribing" ||
      displayStatus === "stopped";

    const showControls = canControlRecording && (isRecording || isPaused);
    const showRetry = isError && canControlRecording;
    const isCompactLayout = COMPACT_STATUS_SET.has(displayStatus);
    const showTranscript = isRecording || isPaused;

    // Auto-scroll transcript to bottom to show latest text
    React.useEffect(() => {
      if (transcriptRef.current) {
        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
      }
    }, [transcript, interimTranscript]);

    // Start/stop speech recognition based on recording state
    React.useEffect(() => {
      if (isMatchingRecording && isRecording && isSpeechSupported) {
        startListening();
      }
      // Cleanup on unmount
      return () => {
        if (isMatchingRecording) {
          stopListening();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMatchingRecording, isRecording, isSpeechSupported]);

    return (
      <Container data-compact={isCompactLayout ? "true" : "false"}>
        <Header>
          <StatusSection>
            {statusDisplay.showPulse && <PulsingDot />}
            <StatusText>{statusDisplay.text}</StatusText>
            <Duration>{formatDuration(displayDuration)}</Duration>
            {isLongRecording && (
              <Tooltip
                content={t(
                  "Recording duration is long. Consider stopping soon."
                )}
                placement="top"
              >
                <WarningIconWrapper>
                  <WarningIcon size={16} />
                </WarningIconWrapper>
              </Tooltip>
            )}
          </StatusSection>
        </Header>

        {!canControlRecording && (
          <ReadOnlyHint>
            {t(
              "Recording controls are only available to the person capturing audio."
            )}
          </ReadOnlyHint>
        )}

        {showTranscript && (
          <TranscriptSection
            ref={transcriptRef}
            data-compact={isCompactLayout ? "true" : "false"}
            onMouseDown={preventDefault}
            suppressContentEditableWarning
          >
            {!isSpeechSupported ? (
              <TranscriptHint>
                {t("Live transcript preview not supported in this browser")}
              </TranscriptHint>
            ) : transcript || interimTranscript ? (
              <TranscriptText
                suppressContentEditableWarning
                key="transcript-text"
              >
                <span suppressContentEditableWarning>{transcript}</span>
                {interimTranscript && (
                  <InterimText suppressContentEditableWarning>
                    {interimTranscript}
                  </InterimText>
                )}
              </TranscriptText>
            ) : (
              <TranscriptHint>{t("Listening...")}</TranscriptHint>
            )}
          </TranscriptSection>
        )}

        {isError && audioRecorder.error && (
          <ErrorSection>
            <ErrorText>{audioRecorder.error}</ErrorText>
          </ErrorSection>
        )}

        {isProcessing && (
          <ProgressSection>
            <Spinner />
            <ProgressText>
              {displayStatus === "transcribing"
                ? t("Transcribing audio...")
                : t("Uploading audio...")}
            </ProgressText>
          </ProgressSection>
        )}

        {showControls || showRetry ? (
          <ButtonSection
            data-compact={isCompactLayout ? "true" : "false"}
            onMouseDown={preventDefault}
          >
            {showControls && (
              <>
                {isRecording ? (
                  <Button
                    onClick={handlePause}
                    neutral
                    type="button"
                    icon={<PauseIcon />}
                    aria-label={t("Pause Recording")}
                  >
                    {t("Pause")}
                  </Button>
                ) : (
                  <Button
                    onClick={handleResume}
                    neutral
                    type="button"
                    icon={<PlayIcon />}
                    aria-label={t("Resume Recording")}
                  >
                    {t("Continue")}
                  </Button>
                )}
                <Button
                  onClick={handleStop}
                  neutral
                  type="button"
                  icon={<StopIcon />}
                  aria-label={t("Stop Recording")}
                  disabled={isStopPending}
                >
                  {t("Stop")}
                </Button>
                <Button
                  onClick={handleCancel}
                  neutral
                  type="button"
                  icon={<CloseIcon />}
                  aria-label={t("Cancel Recording")}
                >
                  {t("Cancel")}
                </Button>
              </>
            )}

            {showRetry && (
              <Button onClick={handleRetry} neutral type="button">
                {t("Retry")}
              </Button>
            )}
          </ButtonSection>
        ) : null}
      </Container>
    );
  });
RecordingPlaceholderCard.displayName = "RecordingPlaceholderCard";

// Styled Components

const compactContainerStyles = css`
  height: 100px;
  min-height: 100px;
  max-height: 100px;
  padding: 8px 16px;
  gap: 8px;
  justify-content: space-between;
  overflow: hidden;
`;

const Container = styled.div`
  background: ${s("sidebarBackground")};
  border: 2px solid ${s("divider")};
  border-radius: 8px;
  padding: 12px 16px;
  margin: 16px 0;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition:
    height 0.2s ease,
    max-height 0.2s ease;

  &[data-compact="true"] {
    ${compactContainerStyles}
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex: 0 0 auto;
`;

const StatusSection = styled(Flex)`
  align-items: center;
  gap: 8px;
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
`;

const PulsingDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${s("danger")};
  animation: ${pulse} 1.5s ease-in-out infinite;
`;

const StatusText = styled.span`
  font-weight: 600;
  font-size: 14px;
  color: ${s("text")};
`;

const Duration = styled.span`
  font-family: ${s("fontFamilyMono")};
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const WarningIconWrapper = styled.span`
  display: flex;
  align-items: center;
  color: ${s("warning")};
`;

const compactTranscriptStyles = css`
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  width: 100%;
`;

const TranscriptSection = styled.div`
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 0 0 auto;
  min-height: 60px;
  max-height: 120px;
  background: ${s("background")};
  border-radius: 4px;
  padding: 8px 12px;
  box-sizing: border-box;
  overflow-y: auto;
  font-family: ${s("fontFamily")};
  font-size: 14px;
  line-height: 1.5;

  &[data-compact="true"] {
    ${compactTranscriptStyles}
  }
`;

const TranscriptText = styled.div`
  color: ${s("text")};
  word-wrap: break-word;
  white-space: pre-wrap;
`;

const InterimText = styled.span`
  color: ${s("textTertiary")};
  font-style: italic;
`;

const TranscriptHint = styled.div`
  color: ${s("textTertiary")};
  font-size: 13px;
  font-style: italic;
  text-align: center;
  padding: 8px 0;
`;

const ReadOnlyHint = styled.span`
  display: block;
  margin: 0;
  font-size: 12px;
  color: ${s("textSecondary")};
`;

const ErrorSection = styled.div`
  margin: 12px 0;
  padding: 8px 12px;
  background: ${(props) => props.theme.danger}15;
  border-left: 3px solid ${s("danger")};
  border-radius: 4px;
`;

const ErrorText = styled.span`
  font-size: 13px;
  color: ${s("danger")};
`;

const ButtonSection = styled(Flex).attrs({ contentEditable: "false" })`
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-start;
  flex: 0 0 auto;

  &[data-compact="true"] {
    flex-wrap: nowrap;
    overflow: hidden;
  }
`;

const ProgressSection = styled(Flex)`
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  overflow: hidden;
`;

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const Spinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid ${s("divider")};
  border-top-color: ${s("accent")};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const ProgressText = styled.span`
  font-size: 14px;
  color: ${s("textSecondary")};
`;

export default RecordingPlaceholderCard;
