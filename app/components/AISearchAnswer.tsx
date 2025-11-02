import { observer } from "mobx-react";
import { SparklesIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import MarkdownIt from "markdown-it";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";
import { SearchParams } from "~/stores/DocumentsStore";
import LoadingIndicator from "./LoadingIndicator";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

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

  // Create a stable key for the search parameters to prevent unnecessary re-fetches
  const searchKey = React.useMemo(
    () =>
      JSON.stringify({
        query: searchParams.query,
        collectionId: searchParams.collectionId,
        userId: searchParams.userId,
        dateFilter: searchParams.dateFilter,
        statusFilter: searchParams.statusFilter,
      }),
    [
      searchParams.query,
      searchParams.collectionId,
      searchParams.userId,
      searchParams.dateFilter,
      searchParams.statusFilter,
    ]
  );

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
          collectionId: searchParams.collectionId || undefined,
          userId: searchParams.userId || undefined,
          dateFilter: searchParams.dateFilter || undefined,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  if (loading) {
    return (
      <Container>
        <Header>
          <Flex align="center" gap={8}>
            <AIIcon>
              <SparklesIcon size={16} />
            </AIIcon>
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
              <AIIcon>
                <SparklesIcon size={16} />
              </AIIcon>
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
            <AIIcon>
              <SparklesIcon size={16} />
            </AIIcon>
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
        <AnswerContent
          dangerouslySetInnerHTML={{
            __html: md.render(processedAnswer),
          }}
        />
        {result.sources.length > 0 && (
          <SourcesSection>
            <SourcesTitle>{t("Referenced documents")}:</SourcesTitle>
            <SourcesList>
              {result.sources.map((source) => (
                <SourceItem key={source.id}>
                  <SourceLink href={source.url}>{source.title}</SourceLink>
                </SourceItem>
              ))}
            </SourcesList>
          </SourcesSection>
        )}
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

const AIIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${s("textSecondary")};
`;

const Content = styled.div`
  padding: 16px;
`;

const AnswerContent = styled.div`
  font-size: 15px;
  line-height: 1.6;
  color: ${s("text")};

  p:first-child {
    margin-top: 0;
  }

  p:last-child {
    margin-bottom: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.25;
  }

  h1:first-child,
  h2:first-child,
  h3:first-child {
    margin-top: 0;
  }

  h1 {
    font-size: 1.8em;
  }

  h2 {
    font-size: 1.5em;
  }

  h3 {
    font-size: 1.25em;
  }

  ul,
  ol {
    padding-left: 2em;
    margin: 1em 0;
  }

  li {
    margin: 0.5em 0;
  }

  code {
    background: ${s("codeBackground")};
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
    font-family:
      "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
  }

  pre {
    background: ${s("codeBackground")};
    padding: 1em;
    border-radius: 4px;
    overflow-x: auto;
    margin: 1em 0;
  }

  pre code {
    background: none;
    padding: 0;
  }

  blockquote {
    border-left: 4px solid ${s("divider")};
    padding-left: 1em;
    margin: 1em 0;
    color: ${s("textSecondary")};
  }

  a {
    color: ${s("link")};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  th,
  td {
    border: 1px solid ${s("divider")};
    padding: 0.5em 1em;
    text-align: left;
  }

  th {
    background: ${s("sidebarBackground")};
    font-weight: 600;
  }

  hr {
    border: none;
    border-top: 1px solid ${s("divider")};
    margin: 2em 0;
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

const SourcesSection = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${s("divider")};
`;

const SourcesTitle = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: ${s("textSecondary")};
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SourcesList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SourceItem = styled.li`
  font-size: 13px;
`;

const SourceLink = styled.a`
  color: ${s("textSecondary")};
  text-decoration: none;
  display: flex;
  align-items: center;
  padding: 4px 0;
  transition: color 100ms ease-in-out;

  &:hover {
    color: ${s("text")};
    text-decoration: underline;
  }

  &:before {
    content: "→";
    margin-right: 8px;
    color: ${s("textTertiary")};
  }
`;

export default observer(AISearchAnswer);
