import { observer } from "mobx-react";
import { CloseIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled, { keyframes } from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Tooltip from "~/components/Tooltip";
import useStores from "~/hooks/useStores";
import history from "~/utils/history";
import { documentPath } from "~/utils/routeHelpers";

// Simple icon components for media controls
const StopIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

/**
 * GlobalRecorderController is a floating controller that appears when the user
 * navigates away from the document where recording was started. It provides
 * quick access to recording controls and navigation back to the source document.
 */
const GlobalRecorderController: React.FC = observer(() => {
  const { audioRecorder, documents, ui } = useStores();
  const { t } = useTranslation();
  const [displayDuration, setDisplayDuration] = React.useState(0);

  // Update duration every second using store primitives (avoid mobx computed caching)
  React.useEffect(() => {
    if (!audioRecorder.isActive) {
      return;
    }

    const computeDuration = () => {
      if (!audioRecorder.startTime) {return 0;}
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

    setDisplayDuration(computeDuration());
    const interval = setInterval(() => {
      setDisplayDuration(computeDuration());
    }, 1000);

    return () => clearInterval(interval);
  }, [
    audioRecorder.isActive,
    audioRecorder.startTime,
    audioRecorder.pausedDuration,
    audioRecorder.isPaused,
    audioRecorder.pauseStartTime,
  ]);

  // Format duration as MM:SS
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Determine if controller should be visible
  // Show only when recording is active AND user is not on source document
  // This ensures the controller appears when navigating away from the recording
  // and hides when returning to the source document (where the placeholder card is visible)
  const isVisible = React.useMemo(() => {
    if (!audioRecorder.isActive || !audioRecorder.sourceDocumentId) {
      return false;
    }

    // Hide if user is on the source document
    // The ui.activeDocumentId is updated by the router when navigating between documents
    return ui.activeDocumentId !== audioRecorder.sourceDocumentId;
  }, [
    audioRecorder.isActive,
    audioRecorder.sourceDocumentId,
    ui.activeDocumentId,
  ]);

  // Get source document
  const sourceDocument = React.useMemo(() => {
    if (!audioRecorder.sourceDocumentId) {
      return null;
    }
    return documents.get(audioRecorder.sourceDocumentId);
  }, [audioRecorder.sourceDocumentId, documents]);

  // Handle navigation to source document
  const handleNavigateToSource = React.useCallback(() => {
    if (!sourceDocument) {
      return;
    }

    history.push(documentPath(sourceDocument));

    // TODO: Scroll to recording placeholder if needed
    // This will be implemented when we have access to the editor instance
  }, [sourceDocument]);

  // Handle stop recording
  const handleStop = React.useCallback(() => {
    // TODO: Implement stop and upload flow in task 9
    audioRecorder.stopRecording();
  }, [audioRecorder]);

  // Handle cancel recording
  const handleCancel = React.useCallback(() => {
    if (
      window.confirm(
        t(
          "Are you sure you want to cancel this recording? All audio will be lost."
        )
      )
    ) {
      // Cancel the recording (stops MediaRecorder, releases resources, resets state)
      audioRecorder.cancelRecording();

      // The placeholder will be removed automatically by the RecordingPlaceholderCard
      // component when it detects that the recording is no longer active
    }
  }, [audioRecorder, t]);

  if (!isVisible) {
    return null;
  }

  const isRecording = audioRecorder.status === "recording";
  const isPaused = audioRecorder.status === "paused";
  const statusText = isPaused ? t("Paused") : t("Recording");
  const documentTitle = sourceDocument?.title || t("Untitled");

  return (
    <Container>
      <Tooltip
        content={t("Recording in") + ` "${documentTitle}"`}
        placement="left"
      >
        <IndicatorButton
          onClick={handleNavigateToSource}
          $isRecording={isRecording}
        >
          <PulsingRing $isRecording={isRecording} />
          <MicrophoneIcon>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </MicrophoneIcon>
        </IndicatorButton>
      </Tooltip>

      <ExpandedControls>
        <StatusSection>
          <StatusText>{statusText}</StatusText>
          <Duration>{formatDuration(displayDuration)}</Duration>
        </StatusSection>

        <DocumentInfo onClick={handleNavigateToSource}>
          <DocumentTitle>{documentTitle}</DocumentTitle>
          <ViewDocumentText>{t("View Document")}</ViewDocumentText>
        </DocumentInfo>

        <ButtonSection>
          <StopButton onClick={handleStop} neutral icon={<StopIcon />}>
            {t("Stop")}
          </StopButton>
          <CancelButton onClick={handleCancel} neutral icon={<CloseIcon />}>
            {t("Cancel")}
          </CancelButton>
        </ButtonSection>
      </ExpandedControls>
    </Container>
  );
});

GlobalRecorderController.displayName = "GlobalRecorderController";

// Styled Components

const Container = styled.div`
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;

  &:hover {
    gap: 16px;
  }

  @media print {
    display: none;
  }
`;

const pulse = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.7;
  }
`;

const ringPulse = keyframes`
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
`;

const IndicatorButton = styled.button<{ $isRecording: boolean }>`
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${(props) =>
    props.$isRecording ? s("danger") : s("textSecondary")};
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
  animation: ${(props) => (props.$isRecording ? pulse : "none")} 1.5s
    ease-in-out infinite;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const PulsingRing = styled.div<{ $isRecording: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  border: 2px solid ${s("danger")};
  animation: ${(props) => (props.$isRecording ? ringPulse : "none")} 2s ease-out
    infinite;
  pointer-events: none;
`;

const MicrophoneIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
`;

const ExpandedControls = styled.div`
  background: ${s("sidebarBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 280px;
  opacity: 0;
  transform: translateX(20px);
  pointer-events: none;
  transition: all 0.3s ease;

  ${Container}:hover & {
    opacity: 1;
    transform: translateX(0);
    pointer-events: all;
  }
`;

const StatusSection = styled(Flex)`
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid ${s("divider")};
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
  margin-left: auto;
`;

const DocumentInfo = styled.div`
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: background 0.2s ease;

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

const DocumentTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ViewDocumentText = styled.div`
  font-size: 12px;
  color: ${s("accent")};
`;

const ButtonSection = styled(Flex)`
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid ${s("divider")};
`;

const StopButton = styled(Button)`
  flex: 1;
`;

const CancelButton = styled(Button)`
  flex: 1;
`;

export default GlobalRecorderController;
