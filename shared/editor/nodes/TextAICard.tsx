import { Token } from "markdown-it";
import { NodeSpec, Node as ProsemirrorNode, NodeType } from "prosemirror-model";
import { Command } from "prosemirror-state";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import textAICardRule from "../rules/textAICard";
import { ComponentProps } from "../types";
import ReactNode from "./ReactNode";
import TextAICardComponent from "../components/TextAICard";

export default class TextAICard extends ReactNode {
  get name() {
    return "text_ai_card";
  }

  get rulePlugins() {
    return [textAICardRule];
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        prompt: {
          default: "",
        },
        generated: {
          default: false,
        },
      },
      content: "block+",
      group: "block",
      defining: true,
      draggable: true,
      selectable: false,
      isolating: true,
      parseDOM: [
        {
          tag: "div.text-ai-card",
          preserveWhitespace: "full",
          contentElement: (node: HTMLDivElement) => node,
          getAttrs: (dom: HTMLDivElement) => {
            const attrsData = dom.getAttribute("data-attrs");
            if (attrsData) {
              try {
                const attrs = JSON.parse(attrsData);
                return {
                  prompt: attrs.prompt || "",
                  generated: attrs.generated || false,
                };
              } catch (_e) {
                return { prompt: "", generated: false };
              }
            }
            return { prompt: "", generated: false };
          },
        },
      ],
      toDOM: (node) => {
        const attrs = {
          prompt: node.attrs.prompt,
          generated: node.attrs.generated,
        };
        return [
          "div",
          {
            class: "text-ai-card",
            "data-attrs": JSON.stringify(attrs),
          },
          0,
        ];
      },
    };
  }

  commands({ type }: { type: NodeType }) {
    return {
      text_ai_card: (): Command => (state, dispatch) => {
        if (dispatch) {
          // Create a text_ai_card node with an empty paragraph inside
          const paragraph = state.schema.nodes.paragraph.create();
          const textAICard = type.create(
            { prompt: "", generated: false },
            paragraph
          );

          const tr = state.tr.replaceSelectionWith(textAICard);
          dispatch(tr.scrollIntoView());
        }
        return true;
      },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    const attrs = {
      prompt: node.attrs.prompt || "",
      generated: node.attrs.generated || false,
    };

    state.write("\n```text-ai " + JSON.stringify(attrs) + "\n");
    state.renderContent(node);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "text_ai_card",
      getAttrs: (tok: Token) => {
        try {
          // Extract JSON from info string
          const infoMatch = tok.info.match(/text-ai\s+(\{.*\})/);
          if (infoMatch) {
            const attrs = JSON.parse(infoMatch[1]);
            return {
              prompt: attrs.prompt || "",
              generated: attrs.generated || false,
            };
          }
        } catch (_e) {
          // Parsing failed, use defaults
        }
        return { prompt: "", generated: false };
      },
    };
  }

  component(props: ComponentProps) {
    return <TextAICardComponent {...props} />;
  }
}
