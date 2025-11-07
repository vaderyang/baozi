import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, NodeSelection } from "prosemirror-state";
import * as React from "react";
import { Trans } from "react-i18next";
import styled from "styled-components";
import { Primitive } from "utility-types";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ComponentProps } from "../types";
import Node from "./Node";
import { s } from "../../styles";

type SpeakerSegment = {
  spk: string;
  text: string;
  start?: number;
  end?: number;
};

export default class TranscriptCard extends Node {
  get name() {
    return "transcript_card";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        transcript: {
          default: "",
        },
        speakerSegments: {
          default: null,
        },
        jobId: {
          default: null,
        },
      },
      group: "block",
      atom: true,
      selectable: true,
      draggable: true,
      parseDOM: [
        {
          tag: "div.transcript-card",
          getAttrs: (dom: HTMLDivElement) => {
            const speakerSegmentsStr = dom.dataset.speakerSegments;
            return {
              transcript: dom.dataset.transcript || "",
              speakerSegments: speakerSegmentsStr
                ? JSON.parse(speakerSegmentsStr)
                : null,
              jobId: dom.dataset.jobId,
            };
          },
        },
      ],
      toDOM: (node) => [
        "div",
        {
          class: "transcript-card",
          "data-transcript": node.attrs.transcript,
          "data-speaker-segments": node.attrs.speakerSegments
            ? JSON.stringify(node.attrs.speakerSegments)
            : "",
          "data-job-id": node.attrs.jobId,
        },
      ],
    };
  }

  handleSelect =
    ({ getPos }: ComponentProps) =>
    () => {
      const { view } = this.editor;
      const $pos = view.state.doc.resolve(getPos());
      const transaction = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(transaction);
    };

  component = (props: ComponentProps) => {
    const { isSelected, node } = props;
    const { transcript, speakerSegments } = node.attrs;

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
      <TranscriptContainer
        className={isSelected ? "ProseMirror-selectednode" : ""}
        onMouseDown={this.handleSelect(props)}
      >
        <TranscriptHeading>
          <Trans>Transcript</Trans>
        </TranscriptHeading>

        <ScrollableContent>
          {speakerSegments && speakerSegments.length > 0 ? (
            <SpeakerSegments>
              {speakerSegments.map((segment: SpeakerSegment, index: number) => (
                <SpeakerSegment key={index}>
                  <SpeakerLabel>
                    <Trans>Speaker</Trans> {segment.spk}
                  </SpeakerLabel>
                  <SegmentText>{segment.text}</SegmentText>
                  {segment.start !== undefined && segment.end !== undefined && (
                    <Timestamp>
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </Timestamp>
                  )}
                </SpeakerSegment>
              ))}
            </SpeakerSegments>
          ) : (
            <TranscriptText>{transcript}</TranscriptText>
          )}
        </ScrollableContent>
      </TranscriptContainer>
    );
  };

  commands({ type }: { type: NodeType }) {
    return {
      insertTranscriptCard:
        (attrs?: Record<string, Primitive>): Command =>
        (state, dispatch) => {
          const { tr } = state;
          const node = type.create(attrs);

          if (dispatch) {
            tr.replaceSelectionWith(node);
            dispatch(tr);
          }

          return true;
        },

      removeTranscriptCard:
        (attrs?: { jobId: string }): Command =>
        (state, dispatch) => {
          if (!attrs) {
            return false;
          }

          const { tr, doc } = state;
          let removed = false;

          doc.descendants((node, pos) => {
            if (node.type === type && node.attrs.jobId === attrs.jobId) {
              tr.delete(pos, pos + node.nodeSize);
              removed = true;
              return false;
            }
            return true;
          });

          if (dispatch && removed) {
            dispatch(tr);
          }

          return removed;
        },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.ensureNewLine();
    state.write("## Transcript\n\n");
    state.write("```\n");
    state.text(node.attrs.transcript);
    state.write("\n```\n\n");
    state.ensureNewLine();
  }

  parseMarkdown() {
    // Transcript cards are not parsed from markdown
    return undefined;
  }
}

// Styled Components

const TranscriptContainer = styled.div`
  margin: 24px 0;
  padding: 24px;
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  user-select: none;

  &.ProseMirror-selectednode {
    border-color: ${s("accent")};
    box-shadow: 0 0 0 2px ${(props) => props.theme.accent}33;
  }
`;

const TranscriptHeading = styled.h2`
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: ${s("text")};
`;

const ScrollableContent = styled.div`
  max-height: 500px;
  overflow-y: auto;

  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${s("divider")};
    border-radius: 4px;

    &:hover {
      background: ${s("textTertiary")};
    }
  }
`;

const TranscriptText = styled.div`
  font-size: 15px;
  line-height: 1.6;
  color: ${s("text")};
  white-space: pre-wrap;
`;

const SpeakerSegments = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SpeakerSegment = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SpeakerLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${s("textSecondary")};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SegmentText = styled.div`
  font-size: 15px;
  line-height: 1.6;
  color: ${s("text")};
`;

const Timestamp = styled.div`
  font-size: 12px;
  color: ${s("textTertiary")};
  font-family: ${s("fontFamilyMono")};
`;
