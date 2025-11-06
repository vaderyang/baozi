import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import MarkdownIt from "markdown-it";
import { CopyIcon, CollapsedIcon, ExpandedIcon } from "outline-icons";
import Flex from "~/components/Flex";
import Text from "~/components/Text";
import { toast } from "sonner";
import Followups from "./Followups";

// Styled icon components for expand/collapse
const CollapseIcon = styled(CollapsedIcon)`
  transform: rotate(90deg);
`;

const ExpandIcon = styled(ExpandedIcon)`
  transform: rotate(270deg);
`;

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: true,
});

type DocumentReference = {
  id: string;
  title: string;
  url: string;
  collectionId: string | null;
};

type Props = {
  answer: string;
  sources: DocumentReference[];
  followups: string[];
  isStreaming: boolean;
  onCitationClick: (sourceId: string) => void;
  onFollowupClick?: (question: string) => void;
};

const COLLAPSE_THRESHOLD = 1000; // characters

function Answer({
  answer,
  sources,
  followups,
  isStreaming,
  onCitationClick,
  onFollowupClick,
}: Props) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [isCopied, setIsCopied] = React.useState(false);

  // Debug: Log when component renders
  React.useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Answer] Component rendered/updated:", {
        answerLength: answer?.length || 0,
        sourcesCount: sources?.length || 0,
        isStreaming,
        answerPreview: answer ? answer.substring(0, 50) : "empty",
      });
    }
  }, [answer, sources, isStreaming]);

  const isLongAnswer = answer.length > COLLAPSE_THRESHOLD;
  const shouldShowExpandButton = isLongAnswer && !isStreaming;

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setIsCopied(true);
      toast.success(t("Answer copied to clipboard"));
      setTimeout(() => setIsCopied(false), 2000);
    } catch (_error) {
      toast.error(t("Failed to copy answer"));
    }
  }, [answer, t]);

  const handleCitationClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      const href = event.currentTarget.getAttribute("href");
      if (href) {
        // Extract source ID from href
        const sourceIndex = parseInt(href.replace("#source-", ""), 10) - 1;
        if (sourceIndex >= 0 && sourceIndex < sources.length) {
          onCitationClick(sources[sourceIndex].id);
        }
      }
    },
    [sources, onCitationClick]
  );

  // Process markdown and add citation links
  const processedAnswer = React.useMemo(() => {
    // Ensure answer is a string
    const answerText = String(answer || "");

    // Debug log to verify answer is being received
    if (
      answerText &&
      answerText.length > 0 &&
      process.env.NODE_ENV === "development"
    ) {
      // eslint-disable-next-line no-console
      console.log("[Answer] Processing answer:", {
        answerLength: answerText.length,
        isStreaming,
        preview: answerText.substring(0, 100),
      });
    }

    if (!answerText) {
      return "";
    }

    const renderedMarkdown = md.render(answerText);
    // Replace "Document N" with superscript citation links
    return renderedMarkdown.replace(/Document\s+(\d+)/g, (match, num) => {
      const index = parseInt(num, 10) - 1;
      if (index >= 0 && index < sources.length) {
        return `<sup><a href="#source-${num}" class="citation-link" data-source-index="${index}">[${num}]</a></sup>`;
      }
      return match;
    });
  }, [answer, sources, isStreaming]);

  // Add click handlers to citation links after render
  React.useEffect(() => {
    const citationLinks = document.querySelectorAll(".citation-link");
    citationLinks.forEach((link) => {
      link.addEventListener(
        "click",
        handleCitationClick as unknown as EventListener
      );
    });

    return () => {
      citationLinks.forEach((link) => {
        link.removeEventListener(
          "click",
          handleCitationClick as unknown as EventListener
        );
      });
    };
  }, [processedAnswer, handleCitationClick]);

  return (
    <Container>
      <AnswerHeader>
        <Flex align="center" justify="space-between">
          <AnswerLabel type="secondary" size="small">
            {t("Answer")}
          </AnswerLabel>
          <ActionButtons>
            <ActionButton
              onClick={handleCopy}
              aria-label={t("Copy answer")}
              title={t("Copy answer")}
            >
              <CopyIcon size={16} />
              {isCopied && (
                <CopiedText size="xsmall">{t("Copied!")}</CopiedText>
              )}
            </ActionButton>
          </ActionButtons>
        </Flex>
      </AnswerHeader>

      <AnswerContent
        $isCollapsed={!isExpanded && shouldShowExpandButton}
        $isStreaming={isStreaming}
      >
        {answer && answer.length > 0 ? (
          <MarkdownContent
            dangerouslySetInnerHTML={{
              __html: processedAnswer,
            }}
          />
        ) : (
          <Text type="secondary" size="small">
            {t("Generating answer...")}
          </Text>
        )}
        {isStreaming && <StreamingCursor />}
      </AnswerContent>

      {shouldShowExpandButton && (
        <ExpandButton onClick={() => setIsExpanded(!isExpanded)}>
          <Flex align="center" gap={4}>
            {isExpanded ? (
              <>
                <CollapseIcon size={16} />
                <Text size="small">{t("Show less")}</Text>
              </>
            ) : (
              <>
                <ExpandIcon size={16} />
                <Text size="small">{t("Show more")}</Text>
              </>
            )}
          </Flex>
        </ExpandButton>
      )}

      {sources.length > 0 && (
        <SourcesSection>
          <SourcesTitle>{t("Sources")}:</SourcesTitle>
          <SourcesList>
            {sources.map((source, index) => (
              <SourceItem key={source.id} id={`source-${index + 1}`}>
                <SourceNumber>{index + 1}.</SourceNumber>
                <SourceLink
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.title}
                </SourceLink>
              </SourceItem>
            ))}
          </SourcesList>
        </SourcesSection>
      )}

      {!isStreaming && followups.length > 0 && onFollowupClick && (
        <Followups followups={followups} onFollowupClick={onFollowupClick} />
      )}
    </Container>
  );
}

const Container = styled.div`
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 12px;
  overflow: hidden;
`;

const AnswerHeader = styled.div`
  padding: 12px 16px;
  background: ${s("sidebarBackground")};
  border-bottom: 1px solid ${s("divider")};
`;

const AnswerLabel = styled(Text)`
  font-weight: 500;
`;

const ActionButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 6px 8px;
  cursor: pointer;
  color: ${s("textSecondary")};
  border-radius: 6px;
  transition: all 100ms ease-in-out;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const CopiedText = styled(Text)`
  color: ${s("accent")};
  font-weight: 500;
`;

const AnswerContent = styled.div<{
  $isCollapsed: boolean;
  $isStreaming: boolean;
}>`
  padding: 16px;
  position: relative;
  max-height: ${(props) => (props.$isCollapsed ? "400px" : "none")};
  overflow: ${(props) => (props.$isCollapsed ? "hidden" : "visible")};

  ${(props) =>
    props.$isCollapsed &&
    `
    &::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 80px;
      background: linear-gradient(transparent, ${s("background")});
      pointer-events: none;
    }
  `}
`;

const MarkdownContent = styled.div`
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

  sup {
    font-size: 0.75em;
    vertical-align: super;
    line-height: 0;

    a {
      color: ${s("link")};
      font-weight: 500;
      padding: 0 2px;
      cursor: pointer;
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

  strong {
    font-weight: 600;
  }

  em {
    font-style: italic;
  }
`;

const StreamingCursor = styled.span`
  display: inline-block;
  width: 8px;
  height: 16px;
  background: ${s("accent")};
  margin-left: 2px;
  animation: blink 1s infinite;
  vertical-align: text-bottom;

  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }
`;

const ExpandButton = styled.button`
  width: 100%;
  background: ${s("sidebarBackground")};
  border: none;
  border-top: 1px solid ${s("divider")};
  padding: 12px 16px;
  cursor: pointer;
  color: ${s("textSecondary")};
  transition: all 100ms ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }
`;

const SourcesSection = styled.div`
  padding: 16px;
  border-top: 1px solid ${s("divider")};
  background: ${s("sidebarBackground")};
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

export default Answer;
