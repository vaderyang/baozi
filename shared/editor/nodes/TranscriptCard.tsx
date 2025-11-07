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
        attachmentId: {
          default: null,
        },
        fileName: {
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
              attachmentId: dom.dataset.attachmentId,
              fileName: dom.dataset.fileName,
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
          "data-attachment-id": node.attrs.attachmentId || "",
          "data-file-name": node.attrs.fileName || "",
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
    const { transcript, speakerSegments, attachmentId, fileName } = node.attrs;
    const [activeTab, setActiveTab] = React.useState<
      "transcript" | "audio" | "metadata"
    >("transcript");
    const [isPlaying, setIsPlaying] = React.useState(false);
    const audioRef = React.useRef<HTMLAudioElement>(null);

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const togglePlayPause = () => {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
      }
    };

    // Calculate speaker statistics
    const speakerStats = React.useMemo(() => {
      if (!speakerSegments || speakerSegments.length === 0) {
        return null;
      }

      const stats: Record<
        string,
        { count: number; totalTime: number; segments: SpeakerSegment[] }
      > = {};

      speakerSegments.forEach((segment: SpeakerSegment) => {
        const speaker = `Speaker ${segment.spk}`;
        if (!stats[speaker]) {
          stats[speaker] = { count: 0, totalTime: 0, segments: [] };
        }
        stats[speaker].count += 1;
        stats[speaker].segments.push(segment);
        if (segment.start !== undefined && segment.end !== undefined) {
          stats[speaker].totalTime += segment.end - segment.start;
        }
      });

      return stats;
    }, [speakerSegments]);

    const audioUrl = attachmentId
      ? `/api/attachments.redirect?id=${attachmentId}`
      : null;

    return (
      <TranscriptContainer
        className={isSelected ? "ProseMirror-selectednode" : ""}
        onMouseDown={this.handleSelect(props)}
      >
        <TabBar>
          <Tab
            active={activeTab === "transcript"}
            onClick={() => setActiveTab("transcript")}
          >
            <Trans>Transcript</Trans>
          </Tab>
          {audioUrl && (
            <Tab
              active={activeTab === "audio"}
              onClick={() => setActiveTab("audio")}
            >
              <Trans>Audio</Trans>
            </Tab>
          )}
          {speakerStats && (
            <Tab
              active={activeTab === "metadata"}
              onClick={() => setActiveTab("metadata")}
            >
              <Trans>Metadata</Trans>
            </Tab>
          )}
        </TabBar>

        <ScrollableContent>
          {activeTab === "transcript" && (
            <>
              {speakerSegments && speakerSegments.length > 0 ? (
                <SpeakerSegments>
                  {speakerSegments.map(
                    (segment: SpeakerSegment, index: number) => (
                      <SpeakerSegment key={index}>
                        <SpeakerLabel>
                          <Trans>Speaker</Trans> {segment.spk}
                        </SpeakerLabel>
                        <SegmentText>{segment.text}</SegmentText>
                        {segment.start !== undefined &&
                          segment.end !== undefined && (
                            <Timestamp>
                              {formatTime(segment.start)} -{" "}
                              {formatTime(segment.end)}
                            </Timestamp>
                          )}
                      </SpeakerSegment>
                    )
                  )}
                </SpeakerSegments>
              ) : (
                <TranscriptText>{transcript}</TranscriptText>
              )}
            </>
          )}

          {activeTab === "audio" && audioUrl && (
            <AudioPlayer>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
              />
              <AudioControls>
                <PlayPauseButton onClick={togglePlayPause}>
                  {isPlaying ? "⏸" : "▶"}
                </PlayPauseButton>
                <AudioFileName>{fileName || "Audio recording"}</AudioFileName>
              </AudioControls>
            </AudioPlayer>
          )}

          {activeTab === "metadata" && speakerStats && (
            <MetadataContainer>
              <MetadataSection>
                <MetadataHeading>
                  <Trans>Speaker Statistics</Trans>
                </MetadataHeading>
                {Object.entries(speakerStats).map(([speaker, stats]) => (
                  <SpeakerStat key={speaker}>
                    <SpeakerStatHeader>{speaker}</SpeakerStatHeader>
                    <SpeakerStatDetails>
                      <StatItem>
                        <StatLabel>
                          <Trans>Segments</Trans>:
                        </StatLabel>
                        <StatValue>{stats.count}</StatValue>
                      </StatItem>
                      {stats.totalTime > 0 && (
                        <StatItem>
                          <StatLabel>
                            <Trans>Total time</Trans>:
                          </StatLabel>
                          <StatValue>{formatTime(stats.totalTime)}</StatValue>
                        </StatItem>
                      )}
                    </SpeakerStatDetails>
                  </SpeakerStat>
                ))}
              </MetadataSection>
            </MetadataContainer>
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
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  user-select: none;
  overflow: hidden;

  &.ProseMirror-selectednode {
    border-color: ${s("accent")};
    box-shadow: 0 0 0 2px ${(props) => props.theme.accent}33;
  }
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${s("divider")};
  background: ${s("backgroundSecondary")};
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => (props.active ? s("accent") : s("textSecondary"))};
  background: ${(props) => (props.active ? s("background") : "transparent")};
  border: none;
  border-bottom: 2px solid
    ${(props) => (props.active ? s("accent") : "transparent")};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: ${s("text")};
    background: ${s("background")};
  }
`;

const ScrollableContent = styled.div`
  max-height: 500px;
  overflow-y: auto;
  padding: 24px;

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

// Audio Player Components
const AudioPlayer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AudioControls = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const PlayPauseButton = styled.button`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: ${s("accent")};
  color: ${s("accentText")};
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.9;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const AudioFileName = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
`;

// Metadata Components
const MetadataContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const MetadataSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const MetadataHeading = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: ${s("text")};
`;

const SpeakerStat = styled.div`
  padding: 16px;
  background: ${s("backgroundSecondary")};
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SpeakerStatHeader = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${s("text")};
`;

const SpeakerStatDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
`;

const StatLabel = styled.span`
  color: ${s("textSecondary")};
`;

const StatValue = styled.span`
  color: ${s("text")};
  font-weight: 500;
`;
