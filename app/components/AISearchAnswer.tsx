import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";
import { SearchParams } from "~/stores/DocumentsStore";
import LoadingIndicator from "./LoadingIndicator";
import Editor from "./Editor";

type AISearchResult = {
  answer: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    collectionId: string | null;
  }>;
};

type Props = {
  searchParams: SearchParams;
  onClose?: () => void;
};

function AISearchAnswer({ searchParams, onClose }: Props) {
  const { t } = useTranslation();
  const [result, setResult] = React.useState<AISearchResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchAIAnswer = async () => {
      if (!searchParams.query) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await client.post("/ai.search", {
          query: searchParams.query,
          collectionId: searchParams.collectionId,
          userId: searchParams.userId,
          dateFilter: searchParams.dateFilter,
          statusFilter: searchParams.statusFilter,
          maxDocuments: 5,
        });

        if (response?.data) {
          setResult(response.data);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate AI answer. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchAIAnswer();
  }, [searchParams]);

  if (loading) {
    return (
      <Container>
        <Header>
          <Flex align="center" gap={8}>
            <AIBadge>AI</AIBadge>
            <Text type="secondary" size="small">
              {t("Generating answer")}...
            </Text>
          </Flex>
        </Header>
        <Content>
          <LoadingIndicator />
        </Content>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Header>
          <Flex align="center" gap={8} justify="space-between">
            <Flex align="center" gap={8}>
              <AIBadge>AI</AIBadge>
              <Text type="secondary" size="small">
                {t("AI Answer")}
              </Text>
            </Flex>
            {onClose && (
              <CloseButton onClick={onClose} aria-label={t("Close")}>
                ×
              </CloseButton>
            )}
          </Flex>
        </Header>
        <Content>
          <ErrorText type="secondary">{error}</ErrorText>
        </Content>
      </Container>
    );
  }

  if (!result) {
    return null;
  }

  // Process the answer to convert document references to proper links
  const processedAnswer = result.answer.replace(
    /\[([^\]]+)\]\(([a-f0-9-]{36})\)/g,
    (match, title, docId) => {
      const source = result.sources.find((s) => s.id === docId);
      if (source) {
        return `[${title}](${source.url})`;
      }
      return match;
    }
  );

  return (
    <Container>
      <Header>
        <Flex align="center" gap={8} justify="space-between">
          <Flex align="center" gap={8}>
            <AIBadge>AI</AIBadge>
            <Text type="secondary" size="small">
              {t("AI Answer")}
            </Text>
          </Flex>
          {onClose && (
            <CloseButton onClick={onClose} aria-label={t("Close")}>
              ×
            </CloseButton>
          )}
        </Flex>
      </Header>
      <Content>
        <AnswerContent>
          <Editor value={processedAnswer} readOnly grow />
        </AnswerContent>
      </Content>
    </Container>
  );
}

const Container = styled.div`
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  margin-bottom: 24px;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 12px 16px;
  background: ${(props) => props.theme.sidebarBackground};
  border-bottom: 1px solid ${s("divider")};
`;

const AIBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Content = styled.div`
  padding: 16px;
`;

const AnswerContent = styled.div`
  font-size: 15px;
  line-height: 1.6;

  p:first-child {
    margin-top: 0;
  }

  p:last-child {
    margin-bottom: 0;
  }
`;

const ErrorText = styled(Text)`
  color: ${(props) => props.theme.danger};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: ${s("textSecondary")};
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 100ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

export default observer(AISearchAnswer);
