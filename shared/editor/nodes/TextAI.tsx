import { Token } from "markdown-it";
import { BotIcon } from "outline-icons";
import { wrappingInputRule } from "prosemirror-inputrules";
import { NodeSpec, Node as ProsemirrorNode, NodeType } from "prosemirror-model";
import { Command } from "prosemirror-state";
import * as React from "react";
import ReactDOM from "react-dom";
import { Primitive } from "utility-types";
import toggleWrap from "../commands/toggleWrap";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ComponentProps } from "../types";
import Node from "./Node";

export default class TextAI extends Node {
  get name() {
    return "text_ai";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        prompt: {
          default: "",
        },
        response: {
          default: "",
        },
        isLoading: {
          default: false,
        },
      },
      content: "paragraph*",
      group: "block",
      defining: true,
      draggable: true,
      parseDOM: [
        {
          tag: "div.text-ai-block",
          preserveWhitespace: "full",
          contentElement: (node: HTMLDivElement) =>
            node.querySelector("div.content") || node,
          getAttrs: (dom: HTMLDivElement) => ({
            prompt: dom.getAttribute("data-prompt") || "",
            response: dom.getAttribute("data-response") || "",
            isLoading: dom.getAttribute("data-loading") === "true",
          }),
        },
      ],
      toDOM: (node) => {
        let icon;
        if (typeof document !== "undefined") {
          const component = <BotIcon />;
          icon = document.createElement("div");
          icon.className = "icon";
          ReactDOM.render(component, icon);
        }

        return [
          "div",
          {
            class: "text-ai-block",
            "data-prompt": node.attrs.prompt,
            "data-response": node.attrs.response,
            "data-loading": node.attrs.isLoading,
          },
          ...(icon ? [icon] : []),
          ["div", { class: "content" }, 0],
        ];
      },
    };
  }

  component = (props: ComponentProps) => <TextAIComponent {...props} />;

  commands({ type }: { type: NodeType }) {
    return {
      text_ai: (attrs: Record<string, Primitive>) => toggleWrap(type, attrs),
      updateTextAI:
        (attrs: Record<string, Primitive>): Command =>
        (state, dispatch) => {
          const { tr, selection } = state;
          const { $from } = selection;
          const node = $from.node(-1);

          if (node?.type.name === this.name) {
            if (dispatch) {
              const transaction = tr.setNodeMarkup(
                $from.before(-1),
                undefined,
                {
                  ...node.attrs,
                  ...attrs,
                }
              );
              dispatch(transaction);
            }
            return true;
          }
          return false;
        },
    };
  }

  inputRules({ type }: { type: NodeType }) {
    return [wrappingInputRule(/^:::ai$/, type)];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("\n:::ai\n");
    if (node.attrs.prompt) {
      state.write(`prompt: ${node.attrs.prompt}\n`);
    }
    if (node.attrs.response) {
      state.write(`response: ${node.attrs.response}\n`);
    }
    state.renderContent(node);
    state.ensureNewLine();
    state.write(":::");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "text_ai",
      getAttrs: (tok: Token) => ({
        prompt: tok.attrGet("prompt") || "",
        response: tok.attrGet("response") || "",
        isLoading: false,
      }),
    };
  }
}

// Text AI Component
interface TextAIComponentProps extends ComponentProps {
  node: ProsemirrorNode;
  getPos: () => number;
}

const TextAIComponent: React.FC<TextAIComponentProps> = ({
  node,
  getPos,
  view,
}) => {
  const [prompt, setPrompt] = React.useState(node.attrs.prompt || "");
  const [response, setResponse] = React.useState(node.attrs.response || "");
  const [isLoading, setIsLoading] = React.useState(
    node.attrs.isLoading || false
  );

  const updateNode = React.useCallback(
    (attrs: Record<string, unknown>) => {
      const pos = getPos();
      const { tr } = view.state;
      const transaction = tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ...attrs,
      });
      view.dispatch(transaction);
    },
    [node.attrs, getPos, view]
  );

  const handlePromptChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompt = event.target.value;
      setPrompt(newPrompt);
      updateNode({ prompt: newPrompt });
    },
    [updateNode]
  );

  const handleGenerateResponse = React.useCallback(async () => {
    if (!prompt.trim()) {return;}

    setIsLoading(true);
    updateNode({ isLoading: true });

    try {
      // Simulate AI response generation
      // In a real implementation, this would call an AI API
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const mockResponse = `AI Response to: "${prompt}"\n\nThis is a simulated AI response. In a real implementation, this would be generated by an AI service based on your prompt.`;

      setResponse(mockResponse);
      updateNode({ response: mockResponse, isLoading: false });
    } catch (_error) {
      // Error generating AI response
      updateNode({ isLoading: false });
    } finally {
      setIsLoading(false);
    }
  }, [prompt, updateNode]);

  const handleClearResponse = React.useCallback(() => {
    setResponse("");
    updateNode({ response: "" });
  }, [updateNode]);

  return (
    <div
      className="text-ai-card"
      style={{
        border: "2px solid #e1e5e9",
        borderRadius: "8px",
        padding: "16px",
        margin: "16px 0",
        backgroundColor: "#f8f9fa",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}
      >
        <BotIcon style={{ marginRight: "8px", color: "#6366f1" }} />
        <h4 style={{ margin: 0, color: "#374151" }}>Text AI Assistant</h4>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label
          style={{
            display: "block",
            marginBottom: "4px",
            fontWeight: "500",
            color: "#374151",
          }}
        >
          Your Prompt:
        </label>
        <textarea
          value={prompt}
          onChange={handlePromptChange}
          placeholder="Enter your prompt here..."
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "14px",
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ marginBottom: "12px" }}>
        <button
          onClick={handleGenerateResponse}
          disabled={!prompt.trim() || isLoading}
          style={{
            backgroundColor: isLoading ? "#9ca3af" : "#6366f1",
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: "4px",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "500",
            marginRight: "8px",
          }}
        >
          {isLoading ? "Generating..." : "Generate Response"}
        </button>

        {response && (
          <button
            onClick={handleClearResponse}
            style={{
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
            }}
          >
            Clear Response
          </button>
        )}
      </div>

      {response && (
        <div style={{ marginTop: "12px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "4px",
              fontWeight: "500",
              color: "#374151",
            }}
          >
            AI Response:
          </label>
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              padding: "12px",
              whiteSpace: "pre-wrap",
              fontSize: "14px",
              lineHeight: "1.5",
              color: "#374151",
            }}
          >
            {response}
          </div>
        </div>
      )}
    </div>
  );
};
