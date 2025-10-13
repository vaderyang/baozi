import { SettingsIcon, TrashIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { Node as PMNode } from "prosemirror-model";
import { ComponentProps } from "../types";

type TextAICardProps = ComponentProps;

export default function TextAICard({
  node,
  isSelected,
  isEditable,
  theme,
  getPos,
  view,
  contentDOM,
  pasteParser,
}: TextAICardProps) {
  const [isHover, setIsHover] = React.useState(false);
  const [showPrompt, setShowPrompt] = React.useState(!node.attrs.generated);
  const [prompt, setPrompt] = React.useState(node.attrs.prompt || "");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const contentRef = React.useRef<HTMLDivElement>(null);

  // Mount ProseMirror's contentDOM when available
  React.useEffect(() => {
    if (!contentRef.current || !contentDOM) {
      return;
    }
    if (contentDOM.parentElement !== contentRef.current) {
      contentRef.current.appendChild(contentDOM);
    }
  }, [contentDOM]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get CSRF token from cookie
      const csrfToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("csrfToken="))
        ?.split("=")[1];

      const response = await fetch("/api/ai.generate", {
        method: "POST",
        credentials: "same-origin", // Include cookies
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate: ${response.statusText}`);
      }

      const data = await response.json();
      const generatedText = data.data?.text || "";

      // Prefer full Markdown parsing if a paste parser is available
      const pos = getPos();
      const { tr } = view.state;

      let nodes: PMNode[] = [];
      if (pasteParser) {
        const parsedDoc = pasteParser.parse(generatedText);
        nodes = parsedDoc.content.content as PMNode[];
      } else {
        // Fallback: Split generated text into blocks by double newlines
        const { paragraph, heading } = view.state.schema.nodes;
        const blocks = generatedText
          .split(/\n\n+/)
          .map((b) => b.trim())
          .filter(Boolean);

        if (blocks.length > 0) {
          const first = blocks[0];
          const headingMatch = first.match(/^#\s+(.+)/);
          if (heading && headingMatch) {
            nodes.push(
              view.state.schema.nodes.heading.create(
                { level: 1 },
                view.state.schema.text(headingMatch[1].trim())
              )
            );
          } else {
            nodes.push(paragraph.create(null, view.state.schema.text(first)));
          }

          for (let i = 1; i < blocks.length; i++) {
            nodes.push(
              paragraph.create(null, view.state.schema.text(blocks[i]))
            );
          }
        }

        if (nodes.length === 0) {
          nodes.push(paragraph.create());
        }
      }
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

  const handleSelectNode: React.MouseEventHandler<HTMLDivElement> = (ev) => {
    // Only select when clicking the card chrome, not the inner editor content
    const inContent = (ev.target as HTMLElement)?.closest(
      "[data-prosemirror-content]"
    );
    if (inContent) {
      return;
    }
    const { state, dispatch } = view;
    const $pos = state.doc.resolve(getPos());
    // @ts-expect-error NodeSelection is available at runtime
    const { NodeSelection } = require("prosemirror-state");
    const tr = state.tr.setSelection(new NodeSelection($pos));
    dispatch(tr);
  };

  const handleDelete = () => {
    const { state, dispatch } = view;
    const pos = getPos();
    const tr = state.tr
      .delete(pos, pos + node.nodeSize)
      .setMeta("addToHistory", true);
    dispatch(tr);
  };

  const showBorder =
    !node.attrs.generated || isHover || isSelected || showPrompt;

  return (
    <Wrapper
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onMouseDown={handleSelectNode}
      data-stop-prosemirror
      showBorder={showBorder}
      theme={theme}
    >
      {isEditable && (
        <ButtonGroup>
          {(isHover || isSelected) && (
            <IconButton
              type="button"
              onClick={handleDelete}
              title="Delete"
              data-stop-prosemirror
            >
              <TrashIcon />
            </IconButton>
          )}
          {node.attrs.generated && (isHover || isSelected) && (
            <IconButton
              type="button"
              onClick={handleSettingsClick}
              title="Settings"
              data-stop-prosemirror
            >
              <SettingsIcon />
            </IconButton>
          )}
          {(showPrompt || !node.attrs.generated) && (
            <GenerateButton
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              data-stop-prosemirror
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

      <ContentSection ref={contentRef}>
        {/* ProseMirror contentDOM will be mounted here */}
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
  overflow: hidden;

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
  border: 1px solid #001f3f; /* Navy blue */
  background: #001f3f; /* Navy blue */
  color: ${(props) => props.theme.white};
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
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
  max-width: 100%;
  box-sizing: border-box;
  display: block;
  margin: 0;
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
