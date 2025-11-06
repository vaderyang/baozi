import * as React from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Document from "~/models/Document";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import { toast } from "sonner";

type Suggestion = {
  targetId: string;
  targetType: "collection" | "document";
  targetName: string;
  reason: string;
  confidence: number;
};

type Props = {
  document: Document;
  suggestions: Suggestion[];
  onDismiss: () => void;
  onAccept: (targetId: string, targetType: "collection" | "document") => void;
};

const AIArchiveSuggestion: React.FC<Props> = observer(
  ({ document, suggestions, onDismiss, onAccept }) => {
    const { t } = useTranslation();
    const { dialogs } = useStores();
    const [isAccepting, setIsAccepting] = React.useState(false);
    const [isDismissing, setIsDismissing] = React.useState(false);

    // Don't show if no suggestions or already accepted/dismissed
    if (
      !suggestions ||
      suggestions.length === 0 ||
      document.audioMetadata?.aiArchiveSuggestion?.status === "accepted" ||
      document.audioMetadata?.aiArchiveSuggestion?.status === "dismissed"
    ) {
      return null;
    }

    const handleAccept = async (
      targetId: string,
      targetType: "collection" | "document"
    ) => {
      setIsAccepting(true);
      try {
        await onAccept(targetId, targetType);
        toast.success(t("Document moved successfully"));
      } catch (_error) {
        toast.error(t("Failed to move document"));
      } finally {
        setIsAccepting(false);
      }
    };

    const handleCreateNewCollection = () => {
      dialogs.openModal({
        title: t("Create new collection"),
        content: (
          <div>
            {/* This would be a form to create a new collection */}
            <p>{t("Create a new collection for this recording")}</p>
          </div>
        ),
      });
    };

    const handleKeepInInbox = async () => {
      setIsDismissing(true);
      try {
        await onDismiss();
        toast.success(t("Kept in Audio Inbox"));
      } catch (_error) {
        toast.error(t("Failed to update document"));
      } finally {
        setIsDismissing(false);
      }
    };

    const handleDismiss = async () => {
      setIsDismissing(true);
      try {
        await onDismiss();
      } catch (_error) {
        toast.error(t("Failed to dismiss suggestions"));
      } finally {
        setIsDismissing(false);
      }
    };

    return (
      <Container>
        <Header>
          <Title>✨ {t("AI Archive Suggestions")}</Title>
          <Subtitle>
            {t(
              "Based on the content, here are some places to organize this recording"
            )}
          </Subtitle>
        </Header>

        <SuggestionsContainer>
          {suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.targetId}>
              <SuggestionHeader>
                <SuggestionTitle>
                  {suggestion.targetType === "collection" ? "📁" : "📄"}{" "}
                  {suggestion.targetName}
                </SuggestionTitle>
                <ConfidenceBadge confidence={suggestion.confidence}>
                  {Math.round(suggestion.confidence * 100)}% match
                </ConfidenceBadge>
              </SuggestionHeader>
              <SuggestionReason>{suggestion.reason}</SuggestionReason>
              <Button
                onClick={() =>
                  handleAccept(suggestion.targetId, suggestion.targetType)
                }
                disabled={isAccepting || isDismissing}
                neutral
              >
                {t("Move Here")}
              </Button>
            </SuggestionCard>
          ))}
        </SuggestionsContainer>

        <ActionsContainer>
          <Button
            onClick={handleCreateNewCollection}
            disabled={isAccepting || isDismissing}
            neutral
          >
            {t("Create New Collection")}
          </Button>
          <Button
            onClick={handleKeepInInbox}
            disabled={isAccepting || isDismissing}
            neutral
          >
            {t("Keep in Inbox")}
          </Button>
          <Button
            onClick={handleDismiss}
            disabled={isAccepting || isDismissing}
            neutral
          >
            {t("Dismiss")}
          </Button>
        </ActionsContainer>
      </Container>
    );
  }
);

const Container = styled.div`
  background: ${s("sidebarBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
`;

const Header = styled.div`
  margin-bottom: 16px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: ${s("text")};
`;

const Subtitle = styled(Text)`
  font-size: 14px;
  color: ${s("textTertiary")};
  margin: 0;
`;

const SuggestionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
`;

const SuggestionCard = styled.div`
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  padding: 16px;
  transition: border-color 0.2s;

  &:hover {
    border-color: ${(props) => props.theme.accent};
  }
`;

const SuggestionHeader = styled(Flex)`
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const SuggestionTitle = styled.div`
  font-size: 16px;
  font-weight: 500;
  color: ${s("text")};
`;

const ConfidenceBadge = styled.span<{ confidence: number }>`
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: ${(props) =>
    props.confidence > 0.7
      ? "#10b981"
      : props.confidence > 0.5
        ? "#f59e0b"
        : s("textTertiary")};
  color: white;
  font-weight: 500;
`;

const SuggestionReason = styled(Text)`
  font-size: 14px;
  color: ${s("textSecondary")};
  margin: 0 0 12px 0;
  line-height: 1.5;
`;

const ActionsContainer = styled(Flex)`
  gap: 8px;
  flex-wrap: wrap;
`;

export default AIArchiveSuggestion;
