import { observer } from "mobx-react";
import { SparklesIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import MarkdownIt from "markdown-it";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Text from "~/components/Text";

import { SearchParams } from "~/stores/DocumentsStore";
import LoadingIndicator from "./LoadingIndicator";

const md = new MarkdownIt({
  html: true,
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
  const { t, i18n } = useTranslation();
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
        language: i18n.language,
      }),
    [
      searchParams.query,
      searchParams.collectionId,
      searchParams.userId,
      searchParams.dateFilter,
      searchParams.statusFilter,
      i18n.language,
    ]
  );

  React.useEffect(() => {
    const fetchAIAnswer = async () => {
      if (!searchParams.query) {
        return;
      }

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const response = await fetch("/api/ai.search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            query: searchParams.query,
            collectionId: searchParams.collectionId || undefined,
            userId: searchParams.userId || undefined,
            dateFilter: searchParams.dateFilter || undefined,
            statusFilter: searchParams.statusFilter,
            maxDocuments: 5,
            language: i18n.language,
          }),
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let streamingSources: AISearchResult["sources"] = [];
        let streamingAnswer = "";

        setLoading(false);

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data: ")) {
              continue;
            }

            const jsonStr = trimmedLine.slice(6);
            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "sources") {
                streamingSources = event.sources;
                setResult({
                  answer: "",
                  sources: streamingSources,
                });
              } else if (event.type === "content") {
                streamingAnswer += event.content;
                setResult({
                  answer: streamingAnswer,
                  sources: streamingSources,
                });
              } else if (event.type === "error") {
                throw new Error(event.error || "Stream error");
              } else if (event.type === "done") {
                // Stream complete
                break;
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes("Stream error")) {
                throw e;
              }
              // Skip invalid JSON
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate AI answer. Please try again."
        );
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

  // First render markdown, then process document references to superscript links
  const renderedMarkdown = md.render(result.answer);
  const processedAnswer = renderedMarkdown.replace(
    /Document\s+(\d+)/g,
    (match, num) => {
      const index = parseInt(num, 10) - 1;
      if (index >= 0 && index < result.sources.length) {
        const source = result.sources[index];
        return `<sup><a href="${source.url}">[${num}]</a></sup>`;
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
            __html: processedAnswer,
          }}
        />
        {result.sources.length > 0 && (
          <SourcesSection>
            <SourcesTitle>{t("Referenced documents")}:</SourcesTitle>
            <SourcesList>
              {result.sources.map((source, index) => (
                <SourceItem key={source.id}>
                  <SourceNumber>{index + 1}.</SourceNumber>
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

  && sup {
    font-size: 0.75em !important;
    vertical-align: super !important;
    line-height: 0 !important;
    display: inline !important;

    a {
      color: ${s("link")};
      font-weight: 500;
      padding: 0 2px;
    }
  }

  && p sup,
  && div sup,
  && sup {
    font-size: 0.75em !important;
    vertical-align: super !important;
    line-height: 0 !important;
    display: inline !important;
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
  display: flex;
  align-items: flex-start;
  gap: 8px;
`;

const SourceNumber = styled.span`
  color: ${s("textTertiary")};
  font-weight: 500;
  min-width: 20px;
  flex-shrink: 0;
`;

const SourceLink = styled.a`
  color: ${s("textSecondary")};
  text-decoration: none;
  padding: 4px 0;
  transition: color 100ms ease-in-out;
  flex: 1;

  &:hover {
    color: ${s("text")};
    text-decoration: underline;
  }
`;

export default observer(AISearchAnswer);
