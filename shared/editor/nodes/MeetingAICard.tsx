import { Token } from "markdown-it";
import { NodeSpec, Node as ProsemirrorNode, NodeType } from "prosemirror-model";
import { Command } from "prosemirror-state";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import meetingAICardRule from "../rules/meetingAICard";
import { ComponentProps } from "../types";
import ReactNode from "./ReactNode";
import MeetingAICardComponent from "../components/MeetingAICard";

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
};

export default class MeetingAICard extends ReactNode {
  get name() {
    return "meeting_ai_card";
  }

  get rulePlugins() {
    return [meetingAICardRule];
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        listening: {
          default: false,
        },
        generated: {
          default: false,
        },
        transcript: {
          default: [],
        },
        audioUrl: {
          default: "",
        },
        startedAt: {
          default: null,
        },
        summary: {
          default: "",
        },
        summaryLanguage: {
          default: "auto",
        },
        summaryTemplate: {
          default: "auto",
        },
      },
      content: "block+",
      group: "block",
      defining: true,
      draggable: true,
      selectable: true,
      parseDOM: [
        {
          tag: "div.meeting-ai-card",
          preserveWhitespace: "full",
          contentElement: (node: HTMLDivElement) => node,
          getAttrs: (dom: HTMLDivElement) => {
            const attrsData = dom.getAttribute("data-attrs");
            if (attrsData) {
              try {
                const attrs = JSON.parse(attrsData);
                return {
                  listening: attrs.listening || false,
                  generated: attrs.generated || false,
                  transcript: attrs.transcript || [],
                  audioUrl: attrs.audioUrl || "",
                  startedAt: attrs.startedAt || null,
                  summary: attrs.summary || "",
                  summaryLanguage: attrs.summaryLanguage || "auto",
                  summaryTemplate: attrs.summaryTemplate || "auto",
                };
              } catch (_e) {
                return {
                  listening: false,
                  generated: false,
                  transcript: [],
                  audioUrl: "",
                  startedAt: null,
                };
              }
            }
            return {
              listening: false,
              generated: false,
              transcript: [],
              audioUrl: "",
              startedAt: null,
              summary: "",
              summaryLanguage: "auto",
              summaryTemplate: "auto",
            };
          },
        },
      ],
      toDOM: (node) => {
        const attrs = {
          listening: node.attrs.listening,
          generated: node.attrs.generated,
          transcript: node.attrs.transcript,
          audioUrl: node.attrs.audioUrl,
          startedAt: node.attrs.startedAt,
          summary: node.attrs.summary,
          summaryLanguage: node.attrs.summaryLanguage,
          summaryTemplate: node.attrs.summaryTemplate,
        };
        return [
          "div",
          {
            class: "meeting-ai-card",
            "data-attrs": JSON.stringify(attrs),
          },
          0,
        ];
      },
    };
  }

  commands({ type }: { type: NodeType }) {
    return {
      meeting_ai_card: (): Command => (state, dispatch) => {
        if (dispatch) {
          // Create a meeting_ai_card node with an empty paragraph inside
          const paragraph = state.schema.nodes.paragraph.create();
          const meetingAICard = type.create(
            {
              listening: false,
              generated: false,
              transcript: [],
              audioUrl: "",
              startedAt: null,
              summary: "",
              summaryLanguage: "auto",
              summaryTemplate: "auto",
            },
            paragraph
          );

          const tr = state.tr.replaceSelectionWith(meetingAICard);
          dispatch(tr.scrollIntoView());
        }
        return true;
      },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    const attrs = {
      listening: node.attrs.listening || false,
      generated: node.attrs.generated || false,
      transcript: node.attrs.transcript || [],
      audioUrl: node.attrs.audioUrl || "",
      startedAt: node.attrs.startedAt || null,
      summary: node.attrs.summary || "",
      summaryLanguage: node.attrs.summaryLanguage || "auto",
      summaryTemplate: node.attrs.summaryTemplate || "auto",
    };

    state.write("\n```meeting-ai " + JSON.stringify(attrs) + "\n");
    state.renderContent(node);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "meeting_ai_card",
      getAttrs: (tok: Token) => {
        try {
          // Extract JSON from info string
          const infoMatch = tok.info.match(/meeting-ai\s+(\{.*\})/);
          if (infoMatch) {
            const attrs = JSON.parse(infoMatch[1]);
            return {
              listening: attrs.listening || false,
              generated: attrs.generated || false,
              transcript: attrs.transcript || [],
              audioUrl: attrs.audioUrl || "",
              startedAt: attrs.startedAt || null,
              summary: attrs.summary || "",
              summaryLanguage: attrs.summaryLanguage || "auto",
              summaryTemplate: attrs.summaryTemplate || "auto",
            };
          }
        } catch (_e) {
          // Parsing failed, use defaults
        }
        return {
          listening: false,
          generated: false,
          transcript: [],
          audioUrl: "",
          startedAt: null,
          summary: "",
          summaryLanguage: "auto",
          summaryTemplate: "auto",
        };
      },
    };
  }

  component(props: ComponentProps) {
    return <MeetingAICardComponent {...props} />;
  }
}
