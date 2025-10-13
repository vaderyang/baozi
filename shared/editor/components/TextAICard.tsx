import { SettingsIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { ComponentProps } from "../types";

type TextAICardProps = ComponentProps;

export default function TextAICard({
  node,
  isSelected,
  isEditable,
  theme,
  getPos,
  view,
}: TextAICardProps) {
  const [isHover, setIsHover] = React.useState(false);
  const [showPrompt, setShowPrompt] = React.useState(!node.attrs.generated);
  const [prompt, setPrompt] = React.useState(node.attrs.prompt || "");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const contentRef = React.useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // We'll use the ApiClient in the next step
      // For now, just create placeholder logic
      const response = await fetch("/api/ai.generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate: ${response.statusText}`);
      }

      const data = await response.json();
      const generatedText = data.data?.text || "";

      // Split generated text into paragraphs
      const paragraphs = generatedText
        .split(/\n\n+/)
        .filter((p) => p.trim())
        .map((p) => p.trim());

      // Replace node content with new paragraphs
      const pos = getPos();
      const { tr } = view.state;
      const { paragraph } = view.state.schema.nodes;

      // Create paragraph nodes from the generated text
      const nodes = paragraphs.map((text) =>
        paragraph.create(null, view.state.schema.text(text))
      );

      // If no content, add an empty paragraph
      if (nodes.length === 0) {
        nodes.push(paragraph.create());
      }

      // Replace the node's content
      const start = pos + 1;
      const end = pos + node.nodeSize - 1;

      const transaction = tr
        .replaceWith(start, end, nodes)
        .setNodeMarkup(pos, undefined, {
          ...node.attrs,
          prompt,
          generated: true,
        })
        .setMeta("addToHistory", true);

      view.dispatch(transaction);

      // Collapse the prompt
      setShowPrompt(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate content"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingsClick = () => {
    setShowPrompt(!showPrompt);
  };

  const showBorder =
    !node.attrs.generated || isHover || isSelected || showPrompt;

  return (
    <Wrapper
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      showBorder={showBorder}
      theme={theme}
    >
      {isEditable && (
        <ButtonGroup>
          {node.attrs.generated && (
            <IconButton
              type="button"
              onClick={handleSettingsClick}
              title="Settings"
            >
              <SettingsIcon />
            </IconButton>
          )}
          {(showPrompt || !node.attrs.generated) && (
            <GenerateButton
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? "Generating..." : "Generate"}
            </GenerateButton>
          )}
        </ButtonGroup>
      )}

      {(showPrompt || !node.attrs.generated) && isEditable && (
        <PromptSection>
          <PromptLabel>Prompt</PromptLabel>
          <PromptInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt here..."
            rows={3}
            disabled={isLoading}
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </PromptSection>
      )}

      <ContentSection
        ref={contentRef}
        contentEditable={false}
        suppressContentEditableWarning
      >
        <div data-content-dom />
      </ContentSection>
    </Wrapper>
  );
}

const Wrapper = styled.div<{ showBorder: boolean }>`
  position: relative;
  padding: 16px;
  margin: 8px 0;
  border-radius: 8px;
  transition: all 0.2s ease;

  ${(props) =>
    props.showBorder &&
    `
    border: 1px solid ${props.theme.divider};
    box-shadow: 0 0 0 2px ${props.theme.primary}15;
  `}
`;

const ButtonGroup = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 8px;
  z-index: 1;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) => props.theme.background};
  border-radius: 4px;
  cursor: pointer;
  color: ${(props) => props.theme.textSecondary};
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => props.theme.secondaryBackground};
    color: ${(props) => props.theme.text};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const GenerateButton = styled.button`
  padding: 6px 12px;
  border: 1px solid ${(props) => props.theme.primary};
  background: ${(props) => props.theme.primary};
  color: ${(props) => props.theme.white};
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PromptSection = styled.div`
  margin-bottom: 16px;
`;

const PromptLabel = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${(props) => props.theme.textSecondary};
  margin-bottom: 8px;
`;

const PromptInput = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 60px;
  background: ${(props) => props.theme.background};
  color: ${(props) => props.theme.text};

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  margin-top: 8px;
  padding: 8px 12px;
  background: ${(props) => props.theme.danger}15;
  color: ${(props) => props.theme.danger};
  border-radius: 4px;
  font-size: 13px;
`;

const ContentSection = styled.div`
  /* Content will be rendered here by ProseMirror */
  min-height: 20px;

  > div[data-content-dom] {
    /* Ensure content is editable and looks like normal document text */
  }
`;
