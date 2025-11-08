import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, NodeSelection } from "prosemirror-state";
import * as React from "react";
import { Trans } from "react-i18next";
import styled from "styled-components";
import { Primitive } from "utility-types";
import { bytesToHumanReadable } from "../../utils/files";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ComponentProps } from "../types";
import AudioPlayer from "../components/AudioPlayer";
import FileExtension from "../components/FileExtension";
import Widget from "../components/Widget";
import Node from "./Node";
import { s } from "../../styles";

type SpeakerSegment = {
  spk: string;
  text: string;
  start?: number;
  end?: number;
};

type TimelineEntry = {
  id: string;
  start: number;
  end?: number;
  anchorIndex: number;
  summary: string;
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
        fileSize: {
          default: 0,
        },
        timelineEntries: {
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
            const timelineEntriesStr = dom.dataset.timelineEntries;
            return {
              transcript: dom.dataset.transcript || "",
              speakerSegments: speakerSegmentsStr
                ? JSON.parse(speakerSegmentsStr)
                : null,
              jobId: dom.dataset.jobId,
              attachmentId: dom.dataset.attachmentId,
              fileName: dom.dataset.fileName,
              fileSize: parseInt(dom.dataset.fileSize || "0", 10),
              timelineEntries: timelineEntriesStr
                ? JSON.parse(timelineEntriesStr)
                : null,
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
          "data-file-size": node.attrs.fileSize ?? 0,
          "data-timeline-entries": node.attrs.timelineEntries
            ? JSON.stringify(node.attrs.timelineEntries)
            : "",
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
    const { isSelected, isEditable, node } = props;
    const {
      transcript,
      speakerSegments,
      attachmentId,
      fileName,
      fileSize,
      timelineEntries: timelineEntriesAttr,
    } = node.attrs;
    const [activeTab, setActiveTab] = React.useState<
      "transcript" | "audio" | "metadata"
    >("transcript");
    const [activeTimelineId, setActiveTimelineId] = React.useState<
      string | null
    >(null);
    const transcriptPaneRef = React.useRef<HTMLDivElement | null>(null);
    const transcriptTextRef = React.useRef<HTMLDivElement | null>(null);
    const speakerSegmentRefs = React.useRef<Array<HTMLDivElement | null>>([]);

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const formatRangeLabel = (start: number, end?: number) => {
      const safeStart = Number.isFinite(start) ? start : 0;
      if (typeof end === "number" && Number.isFinite(end)) {
        return `${formatTime(safeStart)} - ${formatTime(end)}`;
      }
      return `${formatTime(safeStart)}+`;
    };

    const summarizeText = React.useCallback((text: string, limit = 160) => {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (!normalized) {
        return "";
      }
      return normalized.length > limit
        ? `${normalized.slice(0, limit).trim()}…`
        : normalized;
    }, []);

    const toSeconds = React.useCallback((value?: number) => {
      if (typeof value !== "number") {
        return undefined;
      }
      return value > 1000 ? value / 1000 : value;
    }, []);

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
        const startSeconds = toSeconds(segment.start);
        const endSeconds = toSeconds(segment.end);
        if (startSeconds !== undefined && endSeconds !== undefined) {
          stats[speaker].totalTime += endSeconds - startSeconds;
        }
      });

      return stats;
    }, [speakerSegments, toSeconds]);

    const timelineEntries = React.useMemo<TimelineEntry[]>(() => {
      if (
        Array.isArray(timelineEntriesAttr) &&
        timelineEntriesAttr.length > 0
      ) {
        return (timelineEntriesAttr as TimelineEntry[]).map((entry, index) => ({
          id: entry.id || `timeline-${index}`,
          start: typeof entry.start === "number" ? entry.start : 0,
          end: entry.end,
          anchorIndex:
            typeof entry.anchorIndex === "number" ? entry.anchorIndex : 0,
          summary: entry.summary || "",
        }));
      }

      if (speakerSegments && speakerSegments.length > 0) {
        const TIMELINE_CHUNK_SECONDS = 180;
        const APPROX_SEGMENT_SECONDS = 30;
        const entryMap = new Map<
          number,
          {
            id: string;
            start: number;
            end?: number;
            anchorIndex: number;
            texts: string[];
          }
        >();

        speakerSegments.forEach((segment, index) => {
          const startSeconds = toSeconds(segment.start);
          const endSeconds = toSeconds(segment.end);
          const safeStart =
            typeof startSeconds === "number"
              ? Math.max(startSeconds, 0)
              : index * APPROX_SEGMENT_SECONDS;
          const duration =
            typeof startSeconds === "number" && typeof endSeconds === "number"
              ? Math.max(endSeconds - startSeconds, 5)
              : APPROX_SEGMENT_SECONDS;
          const safeEnd = safeStart + duration;
          const chunkIndex = Math.floor(safeStart / TIMELINE_CHUNK_SECONDS);
          const chunkStart = Math.max(chunkIndex, 0) * TIMELINE_CHUNK_SECONDS;
          const existing = entryMap.get(chunkIndex);

          if (existing) {
            existing.end = Math.max(existing.end ?? safeEnd, safeEnd);
            existing.texts.push(segment.text);
          } else {
            entryMap.set(chunkIndex, {
              id: `timeline-${chunkIndex}`,
              start: chunkStart,
              end: safeEnd,
              anchorIndex: index,
              texts: [segment.text],
            });
          }
        });

        return Array.from(entryMap.values())
          .sort((a, b) => a.start - b.start)
          .map((entry) => ({
            id: entry.id,
            start: entry.start,
            end: Math.max(
              entry.end ?? entry.start,
              entry.start + TIMELINE_CHUNK_SECONDS
            ),
            anchorIndex: entry.anchorIndex,
            summary: summarizeText(entry.texts.join(" ")),
          }));
      }

      if (transcript) {
        return [
          {
            id: "timeline-full",
            start: 0,
            end: undefined,
            anchorIndex: 0,
            summary: summarizeText(transcript),
          },
        ];
      }

      return [];
    }, [
      speakerSegments,
      summarizeText,
      toSeconds,
      transcript,
      timelineEntriesAttr,
    ]);

    React.useEffect(() => {
      if (timelineEntries.length === 0) {
        setActiveTimelineId(null);
        return;
      }

      const alreadyActive = timelineEntries.some(
        (entry) => entry.id === activeTimelineId
      );

      if (!activeTimelineId || !alreadyActive) {
        setActiveTimelineId(timelineEntries[0].id);
      }
    }, [activeTimelineId, timelineEntries]);

    const scrollToAnchor = React.useCallback((anchorIndex: number) => {
      const container = transcriptPaneRef.current;
      if (!container) {
        return;
      }

      const target =
        speakerSegmentRefs.current[anchorIndex] ?? transcriptTextRef.current;

      if (!target) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offset =
        targetRect.top - containerRect.top + container.scrollTop - 16;

      container.scrollTo({
        top: Math.max(offset, 0),
        behavior: "smooth",
      });
    }, []);

    const handleTimelineSelect = React.useCallback(
      (entry: TimelineEntry) => {
        setActiveTimelineId(entry.id);
        scrollToAnchor(entry.anchorIndex);
      },
      [scrollToAnchor]
    );

    const registerSegmentRef = React.useCallback(
      (index: number, element: HTMLDivElement | null) => {
        speakerSegmentRefs.current[index] = element;
      },
      []
    );

    React.useEffect(() => {
      speakerSegmentRefs.current = [];
    }, [speakerSegments]);

    const audioUrl = attachmentId
      ? `/api/attachments.redirect?id=${attachmentId}`
      : null;
    const downloadLabel = fileName || "Audio recording";
    const formattedFileSize =
      typeof fileSize === "number" && fileSize > 0
        ? bytesToHumanReadable(fileSize)
        : undefined;

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
            <TranscriptPane ref={transcriptPaneRef}>
              {speakerSegments && speakerSegments.length > 0 ? (
                <SpeakerSegments>
                  {speakerSegments.map(
                    (segment: SpeakerSegment, index: number) => {
                      const startSeconds = toSeconds(segment.start);
                      const endSeconds = toSeconds(segment.end);
                      return (
                        <SpeakerSegment
                          key={index}
                          ref={(element) =>
                            registerSegmentRef(index, element)
                          }
                        >
                          <SpeakerLabel>
                            <Trans>Speaker</Trans> {segment.spk}
                          </SpeakerLabel>
                          <SegmentText>{segment.text}</SegmentText>
                          {typeof startSeconds === "number" &&
                            typeof endSeconds === "number" && (
                              <Timestamp>
                                {formatTime(startSeconds)} -{" "}
                                {formatTime(endSeconds)}
                              </Timestamp>
                            )}
                        </SpeakerSegment>
                      );
                    }
                  )}
                </SpeakerSegments>
              ) : (
                <TranscriptText ref={transcriptTextRef}>
                  {transcript}
                </TranscriptText>
              )}
            </TranscriptPane>
          )}

          {activeTab === "audio" && audioUrl && (
            <AudioWidgetWrapper>
              <Widget
                icon={
                  <AudioPlayer src={audioUrl} isEditable={isEditable}>
                    <FileExtension title={downloadLabel} />
                  </AudioPlayer>
                }
                title={downloadLabel}
                context={formattedFileSize}
                href={audioUrl}
                isSelected={isSelected}
                onMouseDown={this.handleSelect(props)}
                onClick={(event) => {
                  if (isEditable) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              />
            </AudioWidgetWrapper>
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

const TranscriptSplitView = styled.div`
  display: flex;
  gap: 24px;
`;

const TimelinePane = styled.div`
  flex: 0 0 35%;
  max-height: 500px;
  overflow-y: auto;
  padding-right: 12px;
  border-right: 1px solid ${s("divider")};
`;

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TimelineItem = styled.button<{ active: boolean }>`
  width: 100%;
  text-align: left;
  border: 1px solid ${(props) => (props.active ? s("accent") : s("divider"))};
  background: ${(props) => (props.active ? `${s("accent")}22` : "transparent")};
  color: ${s("text")};
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;

  &:hover {
    border-color: ${s("accent")};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${(props) => props.theme.accent}33;
  }
`;

const TimelineRange = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${s("textSecondary")};
  letter-spacing: 0.5px;
  text-transform: uppercase;
`;

const TimelineSummary = styled.div`
  font-size: 14px;
  line-height: 1.5;
  color: ${s("text")};
`;

const EmptyTimeline = styled.div`
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const TranscriptPane = styled.div`
  max-height: 500px;
  overflow-y: auto;

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

const AudioWidgetWrapper = styled.div`
  padding: 16px 0;
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
