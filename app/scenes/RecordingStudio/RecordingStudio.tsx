import { observer } from "mobx-react";
import { CloseIcon, CollapsedIcon, PinIcon } from "outline-icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import AudioWaveform from "~/components/AudioWaveform";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Input from "~/components/Input";
import Switch from "~/components/Switch";
import useStores from "~/hooks/useStores";

interface RecordingStudioProps {
  documentId: string;
  onMinimize?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

const RecordingStudio = observer(function _RecordingStudio({
  documentId,
  onMinimize,
  onComplete,
  onCancel,
}: RecordingStudioProps) {
  const { t } = useTranslation();
  const { audioRecorder, documents } = useStores();
  const history = useHistory();
  const [title, setTitle] = useState("");
  const [waveformData, setWaveformData] = useState<Uint8Array>(
    new Uint8Array(128)
  );
  const animationFrameRef = useRef<number>();

  const document = documents.get(documentId);

  // Debug logging
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[RecordingStudio] Component mounted/updated:", {
      documentId,
      isActive: audioRecorder.isActive,
      isRecording: audioRecorder.isRecording,
      isPaused: audioRecorder.isPaused,
      status: audioRecorder.status,
      sourceDocumentId: audioRecorder.sourceDocumentId,
      documentAudioMetadata: document?.audioMetadata,
    });
  }, [
    documentId,
    audioRecorder.isActive,
    audioRecorder.isRecording,
    audioRecorder.isPaused,
    audioRecorder.status,
    audioRecorder.sourceDocumentId,
    document?.audioMetadata,
  ]);

  // Update waveform visualization
  useEffect(() => {
    if (!audioRecorder.analyser || !audioRecorder.isRecording) {
      return;
    }

    const updateWaveform = () => {
      if (!audioRecorder.analyser) {
        return;
      }

      const bufferLength = audioRecorder.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      audioRecorder.analyser.getByteTimeDomainData(dataArray);
      setWaveformData(dataArray);

      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    };

    updateWaveform();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioRecorder.analyser, audioRecorder.isRecording]);

  // Ensure the floating controller appears if the user navigates away mid-recording
  useEffect(
    () => () => {
      if (audioRecorder.isActive && !audioRecorder.isMinimized) {
        audioRecorder.minimizeStudio();
      }
    },
    [audioRecorder]
  );

  // Format duration as MM:SS
  const formatDuration = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const handlePauseResume = () => {
    if (audioRecorder.isPaused) {
      audioRecorder.resumeRecording();
    } else {
      audioRecorder.pauseRecording();
    }
  };

  const handleStop = async () => {
    try {
      // Stop recording and start upload/transcription
      // The audioRecorder.stopRecording() will handle:
      // 1. Stop MediaRecorder
      // 2. Upload audio blob
      // 3. Create transcription job
      // 4. Poll for transcription completion
      await audioRecorder.stopRecording();

      // Don't change audioMetadata.sourceType here!
      // It should remain "recording" until transcription is complete
      // The transcription completion handler will update it

      onComplete?.();
    } catch (_error) {
      // Error is handled by the store
    }
  };

  const handleCancel = () => {
    audioRecorder.cancelRecording();
    onCancel?.();

    // Delete the document if it was created for this recording
    if (document) {
      void document.delete();
    }

    // Navigate back
    history.goBack();
  };

  const handleMinimize = () => {
    audioRecorder.minimizeStudio();
    onMinimize?.();
    history.goBack();
  };

  const handleAddMarker = () => {
    audioRecorder.addMarker();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    // Update document title in real-time
    if (document && newTitle) {
      void document.save({ title: newTitle });
    }
  };

  // Show different states based on audioRecorder status
  if (!audioRecorder.isActive) {
    // Check if we're in upload/transcription phase
    if (audioRecorder.status === "uploading") {
      return (
        <StudioContainer>
          <StudioContent>
            <div style={{ textAlign: "center", padding: "48px" }}>
              <h2>{t("Uploading recording...")}</h2>
              <p>{audioRecorder.uploadProgress}%</p>
            </div>
          </StudioContent>
        </StudioContainer>
      );
    }

    if (audioRecorder.status === "transcribing") {
      return (
        <StudioContainer>
          <StudioContent>
            <div style={{ textAlign: "center", padding: "48px" }}>
              <h2>{t("Transcribing audio...")}</h2>
              <p>{t("This may take a few minutes")}</p>
            </div>
          </StudioContent>
        </StudioContainer>
      );
    }

    if (audioRecorder.status === "completed") {
      return (
        <StudioContainer>
          <StudioContent>
            <div style={{ textAlign: "center", padding: "48px" }}>
              <h2>{t("Transcription complete!")}</h2>
              <p>{t("Loading document...")}</p>
            </div>
          </StudioContent>
        </StudioContainer>
      );
    }

    // Default: waiting to start recording
    return (
      <StudioContainer>
        <StudioContent>
          <div style={{ textAlign: "center", padding: "48px" }}>
            <h2>{t("Starting recording...")}</h2>
            <p>{t("Please allow microphone access when prompted")}</p>
          </div>
        </StudioContent>
      </StudioContainer>
    );
  }

  const statusLabel = audioRecorder.isPaused ? t("Paused") : t("Recording");
  const statusHint = audioRecorder.isPaused
    ? t("Microphone input is paused")
    : t("Microphone is live and capturing audio");

  return (
    <StudioContainer>
      <StudioHeader>
        <HeaderInfo>
          <LiveBadge $isPaused={audioRecorder.isPaused}>
            <RecordingDot $isPaused={audioRecorder.isPaused} />
            {statusLabel}
          </LiveBadge>
          <TitleInput
            type="text"
            placeholder={t("Untitled Recording")}
            value={title}
            onChange={handleTitleChange}
            autoFocus
          />
          <HeaderMeta>
            <HeaderMetaItem>
              {document?.path ?? t("New audio document")}
            </HeaderMetaItem>
            <HeaderMetaItem>
              {t("Session")} · {documentId.slice(0, 8).toUpperCase()}
            </HeaderMetaItem>
          </HeaderMeta>
        </HeaderInfo>
        <HeaderActions>
          <HeaderActionButton onClick={handleMinimize} neutral>
            <CollapsedIcon />
            {t("Hide studio")}
          </HeaderActionButton>
        </HeaderActions>
      </StudioHeader>

      <StudioBody>
        <PrimaryPane>
          <PrimaryCard>
            <StatusHeader>
              <StatusCopy>
                <StatusLabel>{t("Recording status")}</StatusLabel>
                <StatusValue>{statusLabel}</StatusValue>
                <StatusHint>{statusHint}</StatusHint>
              </StatusCopy>
              <DurationPill>
                {formatDuration(audioRecorder.duration)}
              </DurationPill>
            </StatusHeader>

            <WaveformContainer>
              <AudioWaveform
                data={waveformData}
                isPaused={audioRecorder.isPaused}
              />
            </WaveformContainer>

            {audioRecorder.realtimeTranscript && (
              <TranscriptPanel>
                <TranscriptLabel>{t("Live transcript")}</TranscriptLabel>
                <TranscriptText>
                  {audioRecorder.realtimeTranscript}
                </TranscriptText>
              </TranscriptPanel>
            )}
          </PrimaryCard>

          {audioRecorder.markers.length > 0 && (
            <MarkersPanel>
              <MarkersLabel>
                <PinIcon size={16} />
                {t("Markers")}
              </MarkersLabel>
              <MarkersList>
                {audioRecorder.markers.map((marker, index) => (
                  <MarkerItem key={index}>
                    <span>{formatDuration(marker.timestamp)}</span>
                    {marker.label && <span>- {marker.label}</span>}
                  </MarkerItem>
                ))}
              </MarkersList>
            </MarkersPanel>
          )}
        </PrimaryPane>

        <SidebarPane>
          <SidebarCard>
            <SidebarTitle>{t("AI assistance")}</SidebarTitle>
            <SidebarDescription>
              {t(
                "Drop a polished AI summary ahead of your transcript as soon as transcription finishes."
              )}
            </SidebarDescription>
            <SummarySwitchRow>
              <Switch
                id="auto-summary-toggle"
                checked={audioRecorder.autoGenerateSummary}
                onChange={(checked) =>
                  audioRecorder.setAutoGenerateSummary(checked)
                }
              />
              <SummaryCopy>
                <SummaryLabel>{t("Auto-generate summary")}</SummaryLabel>
                <SummaryNote>
                  {t(
                    "Adds a concise recap with key takeaways and suggested structure automatically."
                  )}
                </SummaryNote>
              </SummaryCopy>
            </SummarySwitchRow>
          </SidebarCard>

          <SidebarCard>
            <SidebarTitle>{t("Session details")}</SidebarTitle>
            <DetailsList>
              <DetailsRow>
                <DetailsLabel>{t("Elapsed time")}</DetailsLabel>
                <DetailsValue>
                  {formatDuration(audioRecorder.duration)}
                </DetailsValue>
              </DetailsRow>
              <DetailsRow>
                <DetailsLabel>{t("Markers placed")}</DetailsLabel>
                <DetailsValue>{audioRecorder.markers.length}</DetailsValue>
              </DetailsRow>
              <DetailsRow>
                <DetailsLabel>{t("Status")}</DetailsLabel>
                <DetailsValue>{statusHint}</DetailsValue>
              </DetailsRow>
            </DetailsList>
          </SidebarCard>
        </SidebarPane>
      </StudioBody>

      <StudioControls>
        <ControlButton onClick={handleCancel} neutral>
          <CloseIcon />
          {t("Cancel")}
        </ControlButton>

        <ControlButton onClick={handleAddMarker} neutral>
          <PinIcon />
          {t("Mark")}
        </ControlButton>

        <PrimaryControlButton onClick={handlePauseResume}>
          {audioRecorder.isPaused ? <PlayIconSvg /> : <PauseIconSvg />}
          {audioRecorder.isPaused ? t("Resume") : t("Pause")}
        </PrimaryControlButton>

        <StopButton onClick={handleStop} danger>
          <StopIcon />
          {t("Stop")}
        </StopButton>
      </StudioControls>
    </StudioContainer>
  );
});

const StudioContainer = styled.div`
  width: 100%;
  min-height: 100vh;
  background: ${s("background")};
  display: flex;
  flex-direction: column;
`;

const StudioHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px 32px;
  border-bottom: 1px solid ${s("divider")};
  background: ${s("sidebarBackground")};
  gap: 16px;
`;

const HeaderInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const LiveBadge = styled.div<{ $isPaused: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: ${(props) =>
    props.$isPaused ? s("textSecondary")(props) : s("accent")(props)};
`;

const RecordingDot = styled.div<{ $isPaused: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(props) =>
    props.$isPaused ? s("textSecondary")(props) : "#ff3b30"};
  animation: ${(props) =>
    props.$isPaused ? "none" : "pulse 1.5s ease-in-out infinite"};

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.1);
    }
  }
`;

const TitleInput = styled(Input)`
  font-size: 24px;
  font-weight: 600;
  border: none;
  background: transparent;
  padding: 0;

  &:focus {
    border: none;
    background: transparent;
    box-shadow: none;
  }
`;

const HeaderMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: ${s("textSecondary")};
  font-size: 13px;
`;

const HeaderMetaItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const HeaderActionButton = styled(Button)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const StudioBody = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 32px;
  padding: 32px;
  flex: 1;
  background: ${s("background")};

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const PrimaryPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const SidebarPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const PrimaryCard = styled.div`
  background: ${s("sidebarBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 16px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const SidebarCard = styled(PrimaryCard)`
  padding: 24px;
`;

const StatusHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
`;

const StatusCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatusLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${s("textSecondary")};
`;

const StatusValue = styled.div`
  font-size: 28px;
  font-weight: 600;
  color: ${s("text")};
`;

const StatusHint = styled.div`
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const DurationPill = styled.div`
  font-variant-numeric: tabular-nums;
  font-size: 32px;
  font-weight: 600;
  color: ${s("text")};
  padding: 8px 16px;
  border-radius: 999px;
  background: ${s("background")};
  border: 1px solid ${s("divider")};
`;

const WaveformContainer = styled.div`
  width: 100%;
  height: 200px;
  background: ${s("background")};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${s("divider")};
`;

const TranscriptPanel = styled.div`
  width: 100%;
  background: ${s("background")};
  border-radius: 12px;
  border: 1px solid ${s("divider")};
  padding: 24px;
`;

const TranscriptLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: ${s("textSecondary")};
  margin-bottom: 12px;
  letter-spacing: 0.5px;
`;

const TranscriptText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${s("text")};
  max-height: 140px;
  overflow-y: auto;
`;

const MarkersPanel = styled(SidebarCard)`
  flex-direction: column;
`;

const MarkersLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: ${s("textSecondary")};
  letter-spacing: 0.5px;
`;

const MarkersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
`;

const MarkerItem = styled.div`
  display: flex;
  gap: 8px;
  font-size: 14px;
  color: ${s("text")};
`;

const SidebarTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${s("text")};
`;

const SidebarDescription = styled.p`
  margin: 8px 0 16px;
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const SummarySwitchRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const SummaryCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SummaryLabel = styled.div`
  font-weight: 600;
  color: ${s("text")};
`;

const SummaryNote = styled.div`
  font-size: 13px;
  color: ${s("textSecondary")};
`;

const DetailsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DetailsRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: ${s("text")};
`;

const DetailsLabel = styled.span`
  color: ${s("textSecondary")};
`;

const DetailsValue = styled.span`
  font-weight: 600;
`;

const StudioContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  overflow-y: auto;
`;

const StudioControls = styled(Flex)`
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 24px;
  border-top: 1px solid ${s("divider")};
  background: ${s("sidebarBackground")};
`;

const ControlButton = styled(Button)`
  min-width: 120px;
  height: 44px;
  font-size: 16px;
`;

const PrimaryControlButton = styled(Button)`
  min-width: 140px;
  height: 48px;
  font-size: 16px;
`;

const StopButton = styled(Button)`
  min-width: 120px;
  height: 44px;
  font-size: 16px;
`;

const StopIcon = styled.div`
  width: 12px;
  height: 12px;
  background: currentColor;
  border-radius: 2px;
`;

// Custom Play Icon SVG
const PlayIconSvg = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 2.5v11l10-5.5L3 2.5z" />
  </svg>
);

// Custom Pause Icon SVG
const PauseIconSvg = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2h3v12H4V2zm5 0h3v12H9V2z" />
  </svg>
);

export default RecordingStudio;
