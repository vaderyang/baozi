import { observer } from "mobx-react";
import { WarningIcon } from "outline-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import useStores from "~/hooks/useStores";
import type { RecoverySession } from "~/utils/audioRecovery";

/**
 * AudioRecoveryNotification displays a notification when incomplete recordings
 * are detected in IndexedDB, allowing the user to recover or discard them.
 */
const AudioRecoveryNotification = observer(
  function _AudioRecoveryNotification() {
    const { t } = useTranslation();
    const { audioRecorder } = useStores();
    const [sessions, setSessions] = useState<RecoverySession[]>([]);
    const [isRecovering, setIsRecovering] = useState(false);

    const checkForRecordings = async () => {
      const incompleteSessions =
        await audioRecorder.checkForIncompleteRecordings();
      setSessions(incompleteSessions);
    };

    useEffect(() => {
      // Check for incomplete recordings on mount
      void checkForRecordings();

      // Clean up old chunks
      void audioRecorder.cleanupOldChunks();
    }, [audioRecorder, checkForRecordings]);

    const handleRecover = async (sessionId: string) => {
      setIsRecovering(true);
      try {
        await audioRecorder.recoverRecording(sessionId);
        // Remove the recovered session from the list
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      } catch (_error) {
        // Error is handled by the store
      } finally {
        setIsRecovering(false);
      }
    };

    const handleDiscard = async (sessionId: string) => {
      await audioRecorder.discardRecoveredRecording(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    };

    const formatDuration = (milliseconds: number): string => {
      const totalSeconds = Math.floor(milliseconds / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const formatDate = (timestamp: number): string => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 60) {
        return t("{{count}} minutes ago", { count: diffMins });
      }

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) {
        return t("{{count}} hours ago", { count: diffHours });
      }

      return date.toLocaleDateString();
    };

    if (sessions.length === 0) {
      return null;
    }

    return (
      <Container>
        {sessions.map((session) => (
          <NotificationCard key={session.sessionId}>
            <IconWrapper>
              <WarningIcon size={24} />
            </IconWrapper>
            <Content>
              <Title>{t("Incomplete recording found")}</Title>
              <Description>
                {t("Duration: {{duration}}", {
                  duration: formatDuration(session.totalDuration),
                })}
                {" • "}
                {formatDate(session.lastSaved)}
              </Description>
            </Content>
            <Actions>
              <Button
                onClick={() => handleRecover(session.sessionId)}
                disabled={isRecovering}
              >
                {t("Recover")}
              </Button>
              <Button
                onClick={() => handleDiscard(session.sessionId)}
                neutral
                disabled={isRecovering}
              >
                {t("Discard")}
              </Button>
            </Actions>
          </NotificationCard>
        ))}
      </Container>
    );
  }
);

const Container = styled.div`
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;

  @media print {
    display: none;
  }
`;

const NotificationCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background: ${s("sidebarBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${s("sidebarBackground")};
  color: ${s("warning")};
  flex-shrink: 0;
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${s("text")};
  margin-bottom: 4px;
`;

const Description = styled.div`
  font-size: 13px;
  color: ${s("textSecondary")};
`;

const Actions = styled(Flex)`
  gap: 8px;
  flex-shrink: 0;
`;

export default AudioRecoveryNotification;
