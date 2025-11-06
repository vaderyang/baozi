import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import type Document from "~/models/Document";
import Flex from "~/components/Flex";
import Time from "~/components/Time";

interface AudioInboxDocumentCardProps {
  document: Document;
}

type TranscriptionStatus = "transcribing" | "completed" | "failed";

const AudioInboxDocumentCard = observer(function _AudioInboxDocumentCard({
  document,
}: AudioInboxDocumentCardProps) {
  const { t } = useTranslation();
  const history = useHistory();

  const handleClick = () => {
    history.push(document.path);
  };

  // TODO: Get transcription status from TranscriptionJobsStore
  // For now, we'll show a placeholder status
  const transcriptionStatus: TranscriptionStatus = "completed";

  // TODO: Get audio duration from document metadata
  // For now, we'll show a placeholder
  const duration = null;

  const getStatusLabel = (status: TranscriptionStatus) => {
    if (status === "transcribing") {
      return t("Transcribing...");
    }
    if (status === "completed") {
      return t("Ready");
    }
    if (status === "failed") {
      return t("Failed");
    }
    return "";
  };

  const getStatusColor = (status: TranscriptionStatus) => {
    if (status === "transcribing") {
      return "#4E5BA6"; // accent color
    }
    if (status === "completed") {
      return "#2BC18A"; // success color
    }
    if (status === "failed") {
      return "#E74C3C"; // danger color
    }
    return "#9E9E9E"; // textSecondary color
  };

  return (
    <Card onClick={handleClick}>
      <CardContent>
        <CardHeader>
          <DocumentIcon>🎙️</DocumentIcon>
          <DocumentTitle>{document.titleWithDefault}</DocumentTitle>
        </CardHeader>
        <CardMeta>
          <MetaItem>
            <Time dateTime={document.createdAt} addSuffix />
          </MetaItem>
          {duration && (
            <MetaItem>
              <span>{duration}</span>
            </MetaItem>
          )}
          <StatusBadge color={getStatusColor(transcriptionStatus)}>
            {getStatusLabel(transcriptionStatus)}
          </StatusBadge>
        </CardMeta>
      </CardContent>
    </Card>
  );
});

const Card = styled.div`
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.1s ease-in-out;

  &:hover {
    border-color: ${s("accent")};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`;

const CardContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const CardHeader = styled(Flex)`
  align-items: center;
  gap: 12px;
`;

const DocumentIcon = styled.span`
  font-size: 24px;
  line-height: 1;
`;

const DocumentTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${s("text")};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardMeta = styled(Flex)`
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const MetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const StatusBadge = styled.span<{ color: string }>`
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  background: ${(props) => props.color}15;
  color: ${(props) => props.color};
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
`;

export default AudioInboxDocumentCard;
