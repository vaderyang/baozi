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
      await audioRecorder.stopRecording();

      // Update document audioMetadata to mark recording as completed
      // This will cause the Document component to show the editor instead of Recording Studio
      if (document) {
        await document.save({
          audioMetadata: {
            ...document.audioMetadata,
            sourceType: "upload", // Change from "recording" to "upload" to exit Recording Studio mode
          },
        });
      }

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

  if (!audioRecorder.isActive) {
    // Show a loading/waiting state instead of null
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

  return (
    <StudioContainer>
      <StudioHeader>
        <TitleInput
          type="text"
          placeholder={t("Untitled Recording")}
          value={title}
          onChange={handleTitleChange}
          autoFocus
        />
        <MinimizeButton onClick={handleMinimize} neutral>
          <CollapsedIcon />
        </MinimizeButton>
      </StudioHeader>

      <StudioContent>
        <RecordingIndicator $isPaused={audioRecorder.isPaused}>
          <RecordingDot $isPaused={audioRecorder.isPaused} />
          {audioRecorder.isPaused ? t("Paused") : t("Recording")}
        </RecordingIndicator>

        <DurationDisplay>
          {formatDuration(audioRecorder.duration)}
        </DurationDisplay>

        <WaveformContainer>
          <AudioWaveform
            data={waveformData}
            isPaused={audioRecorder.isPaused}
          />
        </WaveformContainer>

        {audioRecorder.realtimeTranscript && (
          <TranscriptPanel>
            <TranscriptLabel>{t("Real-time Transcript")}</TranscriptLabel>
            <TranscriptText>{audioRecorder.realtimeTranscript}</TranscriptText>
          </TranscriptPanel>
        )}

        {audioRecorder.markers.length > 0 && (
          <MarkersPanel>
            <MarkersLabel>{t("Markers")}</MarkersLabel>
            <MarkersList>
              {audioRecorder.markers.map((marker, index) => (
                <MarkerItem key={index}>
                  <PinIcon size={16} />
                  <span>{formatDuration(marker.timestamp)}</span>
                  {marker.label && <span>- {marker.label}</span>}
                </MarkerItem>
              ))}
            </MarkersList>
          </MarkersPanel>
        )}
      </StudioContent>

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
  overflow: hidden;
`;

const StudioHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid ${s("divider")};
  background: ${s("sidebarBackground")};
`;

const TitleInput = styled(Input)`
  flex: 1;
  font-size: 18px;
  font-weight: 500;
  border: none;
  background: transparent;

  &:focus {
    border: 1px solid ${s("inputBorderFocused")};
    background: ${s("background")};
  }
`;

const MinimizeButton = styled(Button)`
  margin-left: 16px;
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

const RecordingIndicator = styled.div<{ $isPaused: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: ${(props) => (props.$isPaused ? s("textSecondary") : s("accent"))};
  margin-bottom: 16px;
`;

const RecordingDot = styled.div<{ $isPaused: boolean }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${(props) => (props.$isPaused ? s("textSecondary") : "#ff0000")};
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

const DurationDisplay = styled.div`
  font-size: 48px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${s("text")};
  margin-bottom: 32px;
  font-family:
    "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New",
    monospace;
`;

const WaveformContainer = styled.div`
  width: 100%;
  max-width: 800px;
  height: 200px;
  background: ${s("sidebarBackground")};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
`;

const TranscriptPanel = styled.div`
  width: 100%;
  max-width: 800px;
  background: ${s("sidebarBackground")};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
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
  max-height: 120px;
  overflow-y: auto;
`;

const MarkersPanel = styled.div`
  width: 100%;
  max-width: 800px;
  background: ${s("sidebarBackground")};
  border-radius: 12px;
  padding: 24px;
`;

const MarkersLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: ${s("textSecondary")};
  margin-bottom: 12px;
  letter-spacing: 0.5px;
`;

const MarkersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MarkerItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${s("text")};

  svg {
    color: ${s("accent")};
  }
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
