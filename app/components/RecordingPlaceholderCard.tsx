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
import useStores from "~/hooks/useStores";
import type { RecordingStatus } from "~/stores/AudioRecorderStore";
import Logger from "~/utils/Logger";
import AudioWaveform from "~/components/AudioWaveform";

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
    const { t } = useTranslation();
    const { editor } = useDocumentContext();
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

    // Mini waveform data buffer for the level meter
    const [waveformData, setWaveformData] = React.useState<Uint8Array>(
      () => new Uint8Array(0)
    );

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
      const computeDuration = () => {
        if (!isMatchingRecording || !audioRecorder.startTime) {
          return 0;
        }
        const now = Date.now();
        const pausedExtra =
          audioRecorder.isPaused && audioRecorder.pauseStartTime
            ? now - audioRecorder.pauseStartTime
            : 0;
        const elapsed =
          now -
          audioRecorder.startTime -
          audioRecorder.pausedDuration -
          pausedExtra;
        return Math.max(0, elapsed);
      };

      if (isMatchingRecording) {
        // Set initial duration immediately using store primitives
        setDisplayDuration(computeDuration());

        const interval = window.setInterval(() => {
          setDisplayDuration(computeDuration());
        }, 1000);

        return () => window.clearInterval(interval);
      }

      if (initialStartTime) {
        // Fallback for historical placeholders rendered from document state
        const calc = () => Math.max(0, Date.now() - initialStartTime);
        setDisplayDuration(calc());
        const interval = window.setInterval(() => {
          setDisplayDuration(calc());
        }, 1000);
        return () => window.clearInterval(interval);
      }

      return undefined;
    }, [
      isMatchingRecording,
      initialStartTime,
      audioRecorder.startTime,
      audioRecorder.pausedDuration,
      audioRecorder.isPaused,
      audioRecorder.pauseStartTime,
    ]);

    // Pull analyser data at ~10 FPS for the mini level meter (only when active card)
    React.useEffect(() => {
      if (!isMatchingRecording || !audioRecorder.analyser) {
        return undefined;
      }

      let cancelled = false;
      const analyser = audioRecorder.analyser;

      const tick = () => {
        if (cancelled) {
          return;
        }
        if (!audioRecorder.isPaused) {
          const buf = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(buf);
          setWaveformData(buf);
        }
      };

      // 50ms interval ≈ 20 FPS
      const id = window.setInterval(tick, 50);
      return () => {
        cancelled = true;
        window.clearInterval(id);
      };
    }, [isMatchingRecording, audioRecorder.analyser, audioRecorder.isPaused]);

    React.useEffect(() => {
      // Insert a status card once we have a job id, even if this placeholder is not the active insertion point.
      // This avoids losing the polling linkage when the recording session context changes quickly.
      if (
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
            autoSummary: audioRecorder.autoGenerateSummary,
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
      audioRecorder.autoGenerateSummary,
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
    }, [audioRecorder, canControlRecording, nodeId]);

    const handleResume = React.useCallback(() => {
      if (!canControlRecording) {
        return;
      }
      Logger.debug("editor", "RecordingPlaceholderCard resume clicked", {
        nodeId,
      });
      audioRecorder.resumeRecording();
    }, [audioRecorder, canControlRecording, nodeId]);

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
        await audioRecorder.stopRecording();
      } catch (error) {
        Logger.error("Failed to stop recording", error as Error);
        toast.error(t("Failed to stop recording. Please try again."));
      } finally {
        setIsStopPending(false);
      }
    }, [audioRecorder, canControlRecording, isStopPending, nodeId, t]);

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
        audioRecorder.cancelRecording();

        if (editor) {
          editor.commands.removeRecordingPlaceholder({ nodeId });
        }
      }
    }, [audioRecorder, canControlRecording, editor, nodeId, t]);

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

    return (
      <Container data-compact={isCompactLayout ? "true" : "false"}>
        <Header>
          <StatusSection>
            {statusDisplay.showPulse && <PulsingDot />}
            <StatusText>{statusDisplay.text}</StatusText>
            <Duration>{formatDuration(displayDuration)}</Duration>
            {canControlRecording &&
            (displayStatus === "recording" || displayStatus === "paused") &&
            audioRecorder.analyser ? (
              <LevelMeterWrapper>
                <AudioWaveform
                  data={waveformData}
                  width={120}
                  height={14}
                  isPaused={isPaused}
                />
              </LevelMeterWrapper>
            ) : null}
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

        {showControls && (
          <AutoSummaryOption onMouseDown={preventDefault}>
            <label>
              <input
                type="checkbox"
                checked={audioRecorder.autoGenerateSummary}
                onChange={(e) =>
                  audioRecorder.setAutoGenerateSummary(e.target.checked)
                }
                disabled={!canControlRecording}
              />
              <span>{t("Auto-generate summary")}</span>
            </label>
          </AutoSummaryOption>
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

const Container = styled.div.attrs({
  contentEditable: false,
  suppressContentEditableWarning: true,
})`
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

const LevelMeterWrapper = styled.div`
  width: 120px;
  height: 14px;
  margin-left: 8px;
  pointer-events: none;
  opacity: 0.9;
`;

const WarningIconWrapper = styled.span`
  display: flex;
  align-items: center;
  color: ${s("warning")};
`;

const AutoSummaryOption = styled.div`
  padding: 8px 0;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: ${s("text")};

    input[type="checkbox"] {
      cursor: pointer;
    }

    input[type="checkbox"]:disabled {
      cursor: not-allowed;
    }
  }

  label:has(input:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
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

const ButtonSection = styled(Flex).attrs({ contentEditable: false })`
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
