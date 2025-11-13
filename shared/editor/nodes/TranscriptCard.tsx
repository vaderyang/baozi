import copy from "copy-to-clipboard";
import MarkdownIt from "markdown-it";
import { CopyIcon } from "outline-icons";
import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, NodeSelection } from "prosemirror-state";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import { Primitive } from "utility-types";
import { bytesToHumanReadable } from "../../utils/files";
import { s } from "../../styles";
import AudioPlayer from "../components/AudioPlayer";
import FileExtension from "../components/FileExtension";
import Widget from "../components/Widget";
import normalizePastedMarkdown from "../lib/markdown/normalize";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ComponentProps } from "../types";
import Node from "./Node";

// Windows-style Maximize/Minimize icons
const MaximizeIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="3"
      y="3"
      width="10"
      height="10"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
);

const MinimizeIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <line
      x1="3"
      y1="13"
      x2="13"
      y2="13"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const getSummaryRenderer = (() => {
  let renderer: MarkdownIt | null = null;
  return () => {
    if (!renderer) {
      renderer = new MarkdownIt({
        html: false,
        linkify: true,
        typographer: true,
        breaks: false, // Disable automatic line breaks to reduce spacing
      });
    }
    return renderer;
  };
})();

// const stripHtmlTags = (html: string) => html.replace(/<[^>]*>/g, " ");

// const decodeHtmlEntities = (text: string) =>
//   text
//     .replace(/&nbsp;/g, " ")
//     .replace(/&amp;/g, "&")
//     .replace(/&quot;/g, '"')
//     .replace(/&#39;/g, "'")
//     .replace(/&lt;/g, "<")
//     .replace(/&gt;/g, ">")
//     .replace(/&#(\d+);/g, (_match, dec) =>
//       String.fromCharCode(Number.parseInt(dec, 10))
//     )
//     .replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
//       String.fromCharCode(Number.parseInt(hex, 16))
//     );

const normalizeDurationValue = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return undefined;
  }
  // If value is very large (>100000), assume it's in milliseconds and convert to seconds
  // This threshold allows recordings up to ~27 hours in seconds format
  return value > 5000 ? value / 1000 : value;
};

const VIEW_MODE_STORAGE_PREFIX = "transcript-card:view-mode";

const SUBJECT_LINE_PATTERNS = [
  /^(?:meeting\s+)?subject[:：]\s*(.+)$/i,
  /^(?:meeting\s+)?title[:：]\s*(.+)$/i,
  /^(?:meeting\s+)?topic[:：]\s*(.+)$/i,
];

const sanitizeSubjectLine = (line: string) =>
  line
    .replace(/^[-*]\s+/, "")
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .trim();

const extractSubjectFromSummary = (summaryMarkdown: string) => {
  if (!summaryMarkdown.trim()) {
    return null;
  }

  const lines = summaryMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const rawLine of lines) {
    const sanitized = sanitizeSubjectLine(rawLine);

    for (const pattern of SUBJECT_LINE_PATTERNS) {
      const match = sanitized.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    if (/^#+/.test(rawLine)) {
      const heading = sanitized;
      if (heading && !/meeting summary/i.test(heading)) {
        return heading;
      }
    }
  }

  return null;
};

const extractOneLineSummary = (summaryMarkdown: string): string => {
  if (!summaryMarkdown.trim()) {
    return "";
  }

  // Try to find a line that starts with "Topic:", "Summary:", or similar
  const lines = summaryMarkdown.split(/\r?\n/).map((line) => line.trim());

  const topicPatterns = [
    /^(?:topic|subject|about|regarding)[:：]\s*(.+)$/i,
    /^(?:meeting\s+)?(?:topic|subject)[:：]\s*(.+)$/i,
  ];

  for (const line of lines) {
    for (const pattern of topicPatterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  // If no topic line found, take first meaningful paragraph (skip headers and empty lines)
  for (const line of lines) {
    const cleaned = line
      .replace(/^#+\s*/, "") // Remove markdown headers
      .replace(/^[-*]\s+/, "") // Remove list markers
      .replace(/\*\*/g, "") // Remove bold markers
      .trim();

    if (
      cleaned &&
      cleaned.length > 10 &&
      !/^meeting summary$/i.test(cleaned) &&
      !cleaned.match(/^(topic|subject|about|regarding)[:：]/i)
    ) {
      // Take first sentence or first 120 chars
      const firstSentence = cleaned.match(/^[^.!?]+[.!?]/);
      if (firstSentence) {
        return firstSentence[0].trim();
      }
      return cleaned.length > 120
        ? cleaned.slice(0, 120).trim() + "…"
        : cleaned;
    }
  }

  return "";
};

const cleanSummaryForDisplay = (summaryMarkdown: string): string => {
  if (!summaryMarkdown.trim()) {
    return "";
  }

  const lines = summaryMarkdown.split(/\r?\n/);
  const cleanedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip lines that start with "Topic:" or "Subject:"
    if (trimmed.match(/^(?:topic|subject)[:：]/i)) {
      continue;
    }

    // Keep the line
    cleanedLines.push(line);
  }

  // Remove excessive blank lines (more than 2 consecutive)
  let result = cleanedLines.join("\n");

  // Replace 3 or more consecutive newlines with just 2
  result = result.replace(/\n{3,}/g, "\n\n");

  // Trim leading and trailing whitespace
  return result.trim();
};

const readStoredViewMode = (key: string) => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const persistViewMode = (key: string, value: "card" | "normal") => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (e.g., private browsing)
  }
};

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
        summaryMarkdown: {
          default: "",
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
        recordingStartedAt: {
          default: null,
        },
        recordingDuration: {
          default: null,
        },
      },
      group: "block",
      atom: true,
      selectable: true,
      draggable: false,
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
              summaryMarkdown: dom.dataset.summaryMarkdown || "",
              jobId: dom.dataset.jobId,
              attachmentId: dom.dataset.attachmentId,
              fileName: dom.dataset.fileName,
              fileSize: parseInt(dom.dataset.fileSize || "0", 10),
              timelineEntries: timelineEntriesStr
                ? JSON.parse(timelineEntriesStr)
                : null,
              recordingStartedAt: dom.dataset.recordingStartedAt || null,
              recordingDuration: dom.dataset.recordingDuration
                ? Number(dom.dataset.recordingDuration)
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
          "data-summary-markdown": node.attrs.summaryMarkdown || "",
          "data-job-id": node.attrs.jobId,
          "data-attachment-id": node.attrs.attachmentId || "",
          "data-file-name": node.attrs.fileName || "",
          "data-file-size": node.attrs.fileSize ?? 0,
          "data-timeline-entries": node.attrs.timelineEntries
            ? JSON.stringify(node.attrs.timelineEntries)
            : "",
          "data-recording-started-at": node.attrs.recordingStartedAt || "",
          "data-recording-duration": node.attrs.recordingDuration ?? "",
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

  handleDragStart =
    ({ getPos }: ComponentProps) =>
    (event: React.DragEvent) => {
      // Only allow dragging if the editor is editable
      if (!this.editor.isEditable) {
        event.preventDefault();
        return;
      }

      const { view } = this.editor;
      const pos = getPos();
      const $pos = view.state.doc.resolve(pos);
      const node = $pos.nodeAfter;

      if (!node) {
        event.preventDefault();
        return;
      }

      // Select the node for visual feedback
      const transaction = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(transaction);

      // Store drag information for the drop handler
      const dragData = {
        type: "transcript_card",
        pos,
        node: node.toJSON(),
      };

      // Set the drag data
      try {
        if (event.dataTransfer) {
          event.dataTransfer.setData(
            "application/json",
            JSON.stringify(dragData)
          );
          event.dataTransfer.setData("text/plain", "Transcript Card");
          event.dataTransfer.effectAllowed = "move";

          // Create a custom drag image
          const dragElement = event.currentTarget.cloneNode(
            true
          ) as HTMLElement;
          dragElement.style.transform = "rotate(2deg)";
          dragElement.style.opacity = "0.8";
          dragElement.style.width = "200px";
          dragElement.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";

          document.body.appendChild(dragElement);
          event.dataTransfer.setDragImage(dragElement, 100, 20);

          // Remove the drag image after a short delay
          setTimeout(() => {
            document.body.removeChild(dragElement);
          }, 100);
        }
      } catch (e) {
        // Fallback for browsers that don't support drag operations
        // eslint-disable-next-line no-console
        console.warn("Drag setup failed:", e);
      }
    };

  handleDragOver = () => (event: React.DragEvent) => {
    // Prevent default to allow drop
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  handleDrop =
    ({ getPos }: ComponentProps) =>
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!this.editor.isEditable) {
        return;
      }

      const { view } = this.editor;

      try {
        const dragDataStr = event.dataTransfer?.getData("application/json");
        if (!dragDataStr) {
          return;
        }

        const dragData = JSON.parse(dragDataStr);

        // Only handle transcript card drops
        if (dragData.type !== "transcript_card") {
          return;
        }

        // Don't handle drops on the same node
        if (dragData.pos === getPos()) {
          return;
        }

        const dropPos = getPos();
        const originalPos = dragData.pos;

        // Get the source and target nodes
        const $original = view.state.doc.resolve(originalPos);
        const originalNode = $original.nodeAfter;

        if (!originalNode) {
          return;
        }

        // Create a transaction to move the node
        const { tr } = view.state;

        // Delete the original node
        tr.delete(originalPos, originalPos + originalNode.nodeSize);

        // Determine the correct drop position (accounting for the deletion)
        const adjustedDropPos =
          originalPos < dropPos ? dropPos - originalNode.nodeSize : dropPos;

        // Insert at the new position
        tr.insert(adjustedDropPos, originalNode);

        // Dispatch the transaction
        const newTr = tr.scrollIntoView();
        view.dispatch(newTr);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Drop handling failed:", e);
      }
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
      summaryMarkdown: summaryMarkdownAttr,
      recordingStartedAt,
      recordingDuration: recordingDurationAttr,
      jobId,
    } = node.attrs;
    const { t } = useTranslation();
    const summaryMarkdown = summaryMarkdownAttr || "";

    // In read-only mode (shared links), hide interactive features
    // isEditable is false when the editor is readOnly
    const isReadOnlyView = !isEditable;

    const [activeTab, setActiveTab] = React.useState<
      "summary" | "generate" | "transcript" | "metadata"
    >("summary");
    const [activeTimelineId, setActiveTimelineId] = React.useState<
      string | null
    >(null);
    const transcriptPaneRef = React.useRef<HTMLDivElement | null>(null);
    const transcriptTextRef = React.useRef<HTMLDivElement | null>(null);
    const speakerSegmentRefs = React.useRef<Array<HTMLDivElement | null>>([]);

    // Summary tab state
    const [meetingType, setMeetingType] = React.useState<string>("auto");
    const [customPrompt, setCustomPrompt] = React.useState<string>("");
    const [summaryLanguage, setSummaryLanguage] =
      React.useState<string>("auto");
    const [insertPosition, setInsertPosition] =
      React.useState<string>("summary_tab");
    const viewModeStorageKey = React.useMemo(
      () =>
        `${VIEW_MODE_STORAGE_PREFIX}:${
          jobId ?? attachmentId ?? fileName ?? recordingStartedAt ?? "default"
        }`,
      [jobId, attachmentId, fileName, recordingStartedAt]
    );
    const [isCardView, setIsCardView] = React.useState<boolean>(() => {
      const stored = readStoredViewMode(viewModeStorageKey);
      return stored === "card";
    });
    const [isGenerating, setIsGenerating] = React.useState<boolean>(false);
    const [errorMessage, setErrorMessage] = React.useState<string>("");
    const isGeneratingRef = React.useRef<boolean>(false);
    const abortControllerRef = React.useRef<AbortController | null>(null);
    React.useEffect(() => {
      const stored = readStoredViewMode(viewModeStorageKey);
      if (stored === "card") {
        setIsCardView(true);
      } else if (stored === "normal") {
        setIsCardView(false);
      }
    }, [viewModeStorageKey]);

    React.useEffect(() => {
      persistViewMode(viewModeStorageKey, isCardView ? "card" : "normal");
    }, [isCardView, viewModeStorageKey]);

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const toSeconds = React.useCallback((value?: number) => {
      if (typeof value !== "number") {
        return undefined;
      }
      // If value is very large (>100000), assume it's in milliseconds and convert to seconds
      // This threshold allows recordings up to ~27 hours in seconds format
      return value > 100000 ? value / 1000 : value;
    }, []);

    const summarizeText = React.useCallback((text: string, limit = 160) => {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (!normalized) {
        return "";
      }
      return normalized.length > limit
        ? `${normalized.slice(0, limit).trim()}…`
        : normalized;
    }, []);

    const displaySummaryMarkdown = React.useMemo(
      () => cleanSummaryForDisplay(summaryMarkdown),
      [summaryMarkdown]
    );

    const summaryHtml = React.useMemo(() => {
      if (!displaySummaryMarkdown.trim()) {
        return "";
      }
      return getSummaryRenderer().render(displaySummaryMarkdown);
    }, [displaySummaryMarkdown]);

    // const summaryPlainText = React.useMemo(() => {
    //   if (!summaryHtml) {
    //     return "";
    //   }
    //   return decodeHtmlEntities(stripHtmlTags(summaryHtml))
    //     .replace(/\s+/g, " ")
    //     .trim();
    // }, [summaryHtml]);

    const oneLineSummary = React.useMemo(
      () => extractOneLineSummary(summaryMarkdown),
      [summaryMarkdown]
    );

    const summarySubjectFromContent = React.useMemo(
      () => extractSubjectFromSummary(summaryMarkdown),
      [summaryMarkdown]
    );

    const hasSummaryContent = summaryMarkdown.trim().length > 0;

    const recordingDurationSeconds = React.useMemo(() => {
      const normalizedAttr = normalizeDurationValue(recordingDurationAttr);
      if (normalizedAttr) {
        return normalizedAttr;
      }

      if (!speakerSegments || speakerSegments.length === 0) {
        return undefined;
      }

      let maxTimestamp = 0;
      speakerSegments.forEach((segment: SpeakerSegment) => {
        const endSeconds = toSeconds(segment.end);
        const startSeconds = toSeconds(segment.start);
        const candidate =
          typeof endSeconds === "number"
            ? endSeconds
            : typeof startSeconds === "number"
              ? startSeconds
              : undefined;
        if (typeof candidate === "number" && candidate > maxTimestamp) {
          maxTimestamp = candidate;
        }
      });

      return maxTimestamp > 0 ? maxTimestamp : undefined;
    }, [recordingDurationAttr, speakerSegments, toSeconds]);

    const formattedRecordingTime = React.useMemo(() => {
      if (!recordingStartedAt) {
        return null;
      }

      const date = new Date(recordingStartedAt);
      if (Number.isNaN(date.getTime())) {
        return null;
      }

      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    }, [recordingStartedAt]);

    const formattedRecordingLength = React.useMemo(() => {
      if (!recordingDurationSeconds) {
        return null;
      }
      return formatTime(recordingDurationSeconds);
    }, [recordingDurationSeconds]);

    const fallbackSubject = React.useMemo(() => {
      // Priority: 1. Meeting subject from summary, 2. Recording time, 3. Filename
      if (summarySubjectFromContent) {
        return summarySubjectFromContent;
      }
      if (formattedRecordingTime) {
        return `Meeting`;
      }
      if (fileName) {
        const baseName = fileName.replace(/\.[^/.]+$/, "");
        return baseName || fileName;
      }
      return "Meeting";
    }, [fileName, formattedRecordingTime, summarySubjectFromContent]);

    const summaryTitle = React.useMemo(() => {
      const baseSubject = summarySubjectFromContent ?? fallbackSubject;
      if (!formattedRecordingTime) {
        return baseSubject;
      }
      const normalizedBase = baseSubject.toLowerCase();
      const normalizedTime = formattedRecordingTime.toLowerCase();
      if (normalizedBase.includes(normalizedTime)) {
        return baseSubject;
      }
      return `${baseSubject} · ${formattedRecordingTime}`;
    }, [fallbackSubject, formattedRecordingTime, summarySubjectFromContent]);

    const handleCopySummaryMarkdown = React.useCallback(() => {
      if (!summaryMarkdown.trim()) {
        return;
      }
      const cleanedSummary = cleanSummaryForDisplay(summaryMarkdown);
      copy(cleanedSummary);
      toast.success("Summary copied");
    }, [summaryMarkdown]);

    const handleCopyTranscript = React.useCallback(() => {
      const transcriptSource =
        transcript && transcript.trim().length > 0
          ? transcript
          : speakerSegments?.map((segment) => segment.text).join("\n\n");
      if (!transcriptSource) {
        return;
      }
      copy(transcriptSource);
      toast.success("Transcript copied");
    }, [speakerSegments, transcript]);

    const renderAudioAttachment = (preventDownload = false) => {
      if (!audioUrl) {
        return null;
      }

      // In read-only view, always prevent download
      const shouldPreventDownload = preventDownload || isReadOnlyView;

      return (
        <Widget
          icon={
            <AudioPlayer src={audioUrl} isEditable={isEditable}>
              <FileExtension title={downloadLabel} />
            </AudioPlayer>
          }
          title={downloadLabel}
          context={fileSizeWithFormat}
          href={shouldPreventDownload ? undefined : audioUrl}
          isSelected={isSelected}
          onMouseDown={this.handleSelect(props)}
          onClick={(event) => {
            if (isEditable || shouldPreventDownload) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        />
      );
    };

    // const summaryPreviewText = React.useMemo(() => {
    //   if (summaryPlainText) {
    //     return summarizeText(summaryPlainText, 220);
    //   }

    //   if (transcript && transcript.trim()) {
    //     return summarizeText(transcript, 220);
    //   }

    //   if (speakerSegments && speakerSegments.length > 0) {
    //     const combined = speakerSegments.map((segment) => segment.text).join(" ");
    //     return summarizeText(combined, 220);
    //   }

    //   return "";
    // }, [speakerSegments, summarizeText, summaryPlainText, transcript]);

    const speakerCount = React.useMemo(() => {
      if (!speakerSegments || speakerSegments.length === 0) {
        return null;
      }
      return new Set(speakerSegments.map((segment) => segment.spk)).size;
    }, [speakerSegments]);

    const transcriptWordCount = React.useMemo(() => {
      const source =
        transcript && transcript.trim().length > 0
          ? transcript
          : speakerSegments?.map((segment) => segment.text).join(" ");
      if (!source) {
        return null;
      }
      const words = source.trim().split(/\s+/);
      return words.length;
    }, [speakerSegments, transcript]);

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

    // const scrollToAnchor = React.useCallback((anchorIndex: number) => {
    //   const container = transcriptPaneRef.current;
    //   if (!container) {
    //     return;
    //   }

    //   const target =
    //     speakerSegmentRefs.current[anchorIndex] ?? transcriptTextRef.current;

    //   if (!target) {
    //     return;
    //   }

    //   const containerRect = container.getBoundingClientRect();
    //   const targetRect = target.getBoundingClientRect();
    //   const offset =
    //     targetRect.top - containerRect.top + container.scrollTop - 16;

    //   container.scrollTo({
    //     top: Math.max(offset, 0),
    //     behavior: "smooth",
    //   });
    // }, []);

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
    const fileExtension = React.useMemo(() => {
      if (!fileName || !fileName.includes(".")) {
        return null;
      }
      const parts = fileName.split(".");
      const ext = parts.pop();
      return ext ? ext.toUpperCase() : null;
    }, [fileName]);
    const fileSizeWithFormat = React.useMemo(() => {
      if (formattedFileSize && fileExtension) {
        return `${formattedFileSize} · ${fileExtension}`;
      }
      if (formattedFileSize) {
        return formattedFileSize;
      }
      if (fileExtension) {
        return fileExtension;
      }
      return undefined;
    }, [fileExtension, formattedFileSize]);

    const handleGenerateSummary = React.useCallback(
      async (props: ComponentProps) => {
        if (!transcript && !speakerSegments) {
          return;
        }

        // Prevent multiple concurrent calls
        if (isGeneratingRef.current) {
          return;
        }

        isGeneratingRef.current = true;
        setIsGenerating(true);
        setErrorMessage(""); // Clear any previous errors

        try {
          // Build the transcript text from either raw transcript or speaker segments
          let transcriptText = transcript;
          if (!transcriptText && speakerSegments) {
            transcriptText = speakerSegments
              .map((segment) => `Speaker ${segment.spk}: ${segment.text}`)
              .join("\n\n");
          }

          // Get document ID from editor
          const documentId = this.editor.props.id;
          if (!documentId) {
            throw new Error("Document ID not available");
          }

          const { generateTranscriptSummary } = await import(
            "~/utils/transcriptSummary"
          );
          const { summary: summaryText, jobId: summaryJobId } =
            await generateTranscriptSummary({
              documentId,
              transcriptText,
              speakerSegments,
              meetingType,
              summaryLanguage,
              customPrompt,
              insertPosition,
              formattedRecordingTime,
            });

          if (!summaryText) {
            throw new Error("Summary generation returned empty result");
          }

          // eslint-disable-next-line no-console
          console.log("Summary generation completed with jobId:", summaryJobId);
          // eslint-disable-next-line no-console
          console.log("Generated summary length:", summaryText.length);

          // Create the summary markdown content
          const generatedSummaryMarkdown = `${summaryText.trim()}\n`;
          const normalizedSummaryMarkdown = normalizePastedMarkdown(
            generatedSummaryMarkdown
          );

          // Get the current position of the TranscriptCard
          const { view } = this.editor;
          const getPos = props.getPos;
          const currentPos = getPos();
          const nodeSize = props.node.nodeSize;
          const { state } = view;
          const tr = state.tr;
          const updatedAttrs = {
            ...props.node.attrs,
            summaryMarkdown: normalizedSummaryMarkdown,
          };

          tr.setNodeMarkup(currentPos, undefined, updatedAttrs);

          if (insertPosition === "summary_tab") {
            // eslint-disable-next-line no-console
            console.log("Updated summary content in Summary tab");
            view.dispatch(tr);
            setActiveTab("summary");
            return;
          }

          // Clean the summary for insertion (remove Topic/Subject lines)
          const cleanedForInsertion = cleanSummaryForDisplay(
            normalizedSummaryMarkdown
          );

          // Parse markdown into ProseMirror document fragment
          const parsedDoc = this.editor.parser.parse(cleanedForInsertion);
          if (!parsedDoc) {
            // eslint-disable-next-line no-console
            console.error("Failed to parse markdown");
            return;
          }

          // Insert the parsed content at the selected position
          const insertPos =
            insertPosition === "before" ? currentPos : currentPos + nodeSize;

          // Insert all nodes from the parsed document
          // We need to insert them in order, keeping track of the cumulative size
          let currentInsertPos = insertPos;
          parsedDoc.content.forEach((node) => {
            tr.insert(currentInsertPos, node);
            currentInsertPos += node.nodeSize;
          });

          // eslint-disable-next-line no-console
          console.log(
            "Dispatching transaction to insert summary at position:",
            insertPos
          );
          view.dispatch(tr);
        } catch (error: unknown) {
          // eslint-disable-next-line no-console
          console.error("Failed to generate summary:", error);

          // Determine error message based on error type
          let userMessage = "Failed to generate summary. Please try again.";
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (errorMessage.includes("timed out")) {
            userMessage =
              "Summary generation timed out. The AI is taking too long to respond. Please try again or try with a shorter transcript.";
          } else if (
            errorMessage.includes("NetworkError") ||
            errorMessage.includes("Failed to fetch")
          ) {
            userMessage =
              "Network error. Please check your connection and try again.";
          } else if (
            errorMessage.includes("401") ||
            errorMessage.includes("Unauthorized")
          ) {
            userMessage =
              "Authentication error. Please refresh the page and try again.";
          } else if (
            errorMessage.includes("403") ||
            errorMessage.includes("Forbidden")
          ) {
            userMessage =
              "Permission denied. You may not have access to AI features.";
          } else if (
            errorMessage.includes("400") ||
            errorMessage.includes("Bad Request")
          ) {
            userMessage =
              "Invalid request. The transcript may be too long or the AI configuration is incomplete.";
          } else if (
            errorMessage.includes("429") ||
            errorMessage.includes("rate limit")
          ) {
            userMessage =
              "Rate limit exceeded. Please wait a moment and try again.";
          } else if (
            errorMessage.includes("500") ||
            errorMessage.includes("503")
          ) {
            userMessage =
              "AI service is temporarily unavailable. Please try again in a few moments.";
          } else if (errorMessage) {
            userMessage = `Error: ${errorMessage}`;
          }

          setErrorMessage(userMessage);
        } finally {
          abortControllerRef.current = null;
          isGeneratingRef.current = false;
          setIsGenerating(false);
        }
      },
      [
        transcript,
        speakerSegments,
        meetingType,
        customPrompt,
        summaryLanguage,
        insertPosition,
        formattedRecordingTime,
      ]
    );

    const hasCollapsedStats =
      Boolean(formattedRecordingLength) ||
      speakerCount !== null ||
      Boolean(transcriptWordCount);

    const collapsedContent = (
      <CollapsedContainer>
        {oneLineSummary && (
          <CollapsedPreview>{oneLineSummary}</CollapsedPreview>
        )}
        {hasCollapsedStats && (
          <CollapsedStats>
            {formattedRecordingLength && (
              <CollapsedStat>
                <CollapsedStatLabel>
                  <Trans>Recording length</Trans>
                </CollapsedStatLabel>
                <CollapsedStatValue>
                  {formattedRecordingLength}
                </CollapsedStatValue>
              </CollapsedStat>
            )}
            {speakerCount !== null && (
              <CollapsedStat>
                <CollapsedStatLabel>
                  <Trans>Speakers</Trans>
                </CollapsedStatLabel>
                <CollapsedStatValue>{speakerCount}</CollapsedStatValue>
              </CollapsedStat>
            )}
            {transcriptWordCount && (
              <CollapsedStat>
                <CollapsedStatLabel>
                  <Trans>Words</Trans>
                </CollapsedStatLabel>
                <CollapsedStatValue>{transcriptWordCount}</CollapsedStatValue>
              </CollapsedStat>
            )}
          </CollapsedStats>
        )}
        {/* Hide audio attachment in read-only view */}
        {audioUrl && !isReadOnlyView && (
          <CollapsedAudioAttachment>
            <AudioAttachmentWrapper>
              {renderAudioAttachment(true)}
            </AudioAttachmentWrapper>
          </CollapsedAudioAttachment>
        )}
      </CollapsedContainer>
    );

    return (
      <TranscriptContainer
        className={isSelected ? "ProseMirror-selectednode" : ""}
        onDragOver={this.handleDragOver()}
        onDrop={this.handleDrop(props)}
      >
        <HeaderRow>
          {!isCardView ? (
            <TabBar>
              <DragHandle
                draggable={isEditable}
                onDragStart={this.handleDragStart(props)}
                title="Drag to move this transcript card"
              >
                ⋮⋮
              </DragHandle>
              <Tab
                active={activeTab === "summary"}
                onClick={() => setActiveTab("summary")}
              >
                <Trans>Summary</Trans>
              </Tab>
              {/* Hide Generate tab in read-only view */}
              {!isReadOnlyView && (
                <Tab
                  active={activeTab === "generate"}
                  onClick={() => setActiveTab("generate")}
                >
                  <Trans>Generate</Trans>
                </Tab>
              )}
              {/* Hide Transcript and Metadata tabs in read-only view */}
              {!isReadOnlyView && (
                <>
                  <Tab
                    active={activeTab === "transcript"}
                    onClick={() => setActiveTab("transcript")}
                  >
                    <Trans>Transcript</Trans>
                  </Tab>
                  <Tab
                    active={activeTab === "metadata"}
                    onClick={() => setActiveTab("metadata")}
                  >
                    <Trans>Metadata</Trans>
                  </Tab>
                </>
              )}
            </TabBar>
          ) : (
            <CollapsedHeader>
              <DragHandle
                draggable={isEditable}
                onDragStart={this.handleDragStart(props)}
                title="Drag to move this transcript card"
              >
                ⋮⋮
              </DragHandle>
              <CollapsedHeaderTitle>{summaryTitle}</CollapsedHeaderTitle>
            </CollapsedHeader>
          )}
          <CardControls>
            <ViewToggleButton
              type="button"
              aria-pressed={isCardView}
              aria-label={t(isCardView ? "Minimize view" : "Maximize view")}
              title={t(isCardView ? "Minimize view" : "Maximize view")}
              onClick={() => setIsCardView(!isCardView)}
            >
              {isCardView ? (
                <MaximizeIcon size={14} />
              ) : (
                <MinimizeIcon size={14} />
              )}
            </ViewToggleButton>
          </CardControls>
        </HeaderRow>

        {isCardView ? (
          collapsedContent
        ) : (
          <ScrollableContent>
            {activeTab === "summary" && (
              <SummaryTabContainer>
                {hasSummaryContent ? (
                  <>
                    <SummaryToolbar>
                      <SummaryToolbarTitle>{summaryTitle}</SummaryToolbarTitle>
                      {/* Hide copy buttons in read-only view */}
                      {!isReadOnlyView && (
                        <SummaryActions>
                          <SummaryActionButton
                            type="button"
                            onClick={handleCopySummaryMarkdown}
                            disabled={!hasSummaryContent}
                            title="Copy the summary"
                            aria-label={t("Copy summary")}
                          >
                            <CopyIcon size={16} />
                            <SummaryActionText>
                              <Trans>Summary</Trans>
                            </SummaryActionText>
                          </SummaryActionButton>
                          <SummaryActionButton
                            type="button"
                            onClick={handleCopyTranscript}
                            disabled={!transcriptWordCount}
                            title={t("Copy transcript")}
                            aria-label={t("Copy transcript")}
                          >
                            <CopyIcon size={16} />
                            <SummaryActionText>
                              <Trans>Transcript</Trans>
                            </SummaryActionText>
                          </SummaryActionButton>
                        </SummaryActions>
                      )}
                    </SummaryToolbar>
                    <SummaryPreview
                      dangerouslySetInnerHTML={{ __html: summaryHtml }}
                    />
                  </>
                ) : (
                  <EmptySummaryState>
                    <EmptySummaryTitle>
                      <Trans>No summary yet</Trans>
                    </EmptySummaryTitle>
                    <EmptySummaryText>
                      <Trans>
                        Use the Generate tab to create or regenerate a summary.
                      </Trans>
                    </EmptySummaryText>
                    <EmptySummaryButton
                      type="button"
                      onClick={() => setActiveTab("generate")}
                    >
                      <Trans>Go to Generate</Trans>
                    </EmptySummaryButton>
                  </EmptySummaryState>
                )}
              </SummaryTabContainer>
            )}

            {activeTab === "generate" && (
              <GenerateContainer>
                <GenerateSection>
                  <GenerateHeading>
                    <Trans>Generate Summary</Trans>
                  </GenerateHeading>
                  <GenerateForm>
                    <FormGroup>
                      <Label>
                        <Trans>Meeting Type</Trans>
                      </Label>
                      <Select
                        value={meetingType}
                        onChange={(e) => setMeetingType(e.target.value)}
                        onPointerDown={(e: React.PointerEvent) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onFocus={(e: React.FocusEvent) => {
                          e.stopPropagation();
                        }}
                        disabled={isGenerating}
                      >
                        <option value="auto">
                          {t("Auto Detect based on transcript")}
                        </option>
                        <option value="general">General Meeting</option>
                        <option value="project-update">Project Update</option>
                        <option value="decision-making">Decision Making</option>
                        <option value="brainstorming">Brainstorming</option>
                        <option value="retrospective">Retrospective</option>
                        <option value="interview">Interview</option>
                        <option value="training">Training</option>
                        <option value="client-call">Client Call</option>
                      </Select>
                    </FormGroup>

                    <FormGroup>
                      <Label>
                        <Trans>Summary Language</Trans>
                      </Label>
                      <Select
                        value={summaryLanguage}
                        onChange={(e) => setSummaryLanguage(e.target.value)}
                        onPointerDown={(e: React.PointerEvent) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onFocus={(e: React.FocusEvent) => {
                          e.stopPropagation();
                        }}
                        disabled={isGenerating}
                      >
                        <option value="auto">
                          {t(
                            "Language of the majority of the transcript (auto)"
                          )}
                        </option>
                        <option value="en">English</option>
                        <option value="zh">中文 (Chinese)</option>
                        <option value="ja">日本語 (Japanese)</option>
                        <option value="ko">한국어 (Korean)</option>
                        <option value="es">Español (Spanish)</option>
                        <option value="fr">Français (French)</option>
                        <option value="de">Deutsch (German)</option>
                        <option value="pt">Português (Portuguese)</option>
                        <option value="ru">Русский (Russian)</option>
                        <option value="ar">العربية (Arabic)</option>
                      </Select>
                    </FormGroup>

                    <FormGroup>
                      <Label>
                        <Trans>Custom Prompt</Trans>
                      </Label>
                      <TextArea
                        value={customPrompt}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                          setCustomPrompt(e.target.value)
                        }
                        onPointerDown={(e: React.PointerEvent) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onFocus={(e: React.FocusEvent) => {
                          e.stopPropagation();
                        }}
                        placeholder="Optional: Add specific instructions for the summary..."
                        disabled={isGenerating}
                        rows={4}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label>
                        <Trans>Insert Position</Trans>
                      </Label>
                      <Select
                        value={insertPosition}
                        onChange={(e) => setInsertPosition(e.target.value)}
                        onPointerDown={(e: React.PointerEvent) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        onFocus={(e: React.FocusEvent) => {
                          e.stopPropagation();
                        }}
                        disabled={isGenerating}
                      >
                        <option value="summary_tab">In Summary Tab</option>
                        <option value="before">Before Transcript Card</option>
                        <option value="after">After Transcript Card</option>
                      </Select>
                    </FormGroup>

                    {errorMessage && (
                      <ErrorMessage>{errorMessage}</ErrorMessage>
                    )}

                    <GenerateButton
                      onClick={() => handleGenerateSummary(props)}
                      disabled={
                        isGenerating || (!transcript && !speakerSegments)
                      }
                    >
                      {isGenerating ? (
                        <>
                          <Spinner />{" "}
                          <Trans>
                            Generating... (this may take a few minutes)
                          </Trans>
                        </>
                      ) : errorMessage ? (
                        <Trans>Retry</Trans>
                      ) : (
                        <Trans>(Re)Generate Summary</Trans>
                      )}
                    </GenerateButton>
                  </GenerateForm>
                </GenerateSection>
              </GenerateContainer>
            )}

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

            {activeTab === "metadata" && (
              <MetadataContainer>
                <MetadataSection>
                  <MetadataHeading>
                    <Trans>Recording Details</Trans>
                  </MetadataHeading>
                  <MetadataInfoGrid>
                    <MetadataInfoItem>
                      <MetadataLabel>
                        <Trans>Recording time</Trans>
                      </MetadataLabel>
                      <MetadataValue>
                        {formattedRecordingTime ? (
                          formattedRecordingTime
                        ) : (
                          <MetadataPlaceholder>
                            <Trans>Not available</Trans>
                          </MetadataPlaceholder>
                        )}
                      </MetadataValue>
                    </MetadataInfoItem>
                    <MetadataInfoItem>
                      <MetadataLabel>
                        <Trans>Recording length</Trans>
                      </MetadataLabel>
                      <MetadataValue>
                        {formattedRecordingLength ? (
                          formattedRecordingLength
                        ) : (
                          <MetadataPlaceholder>
                            <Trans>Not available</Trans>
                          </MetadataPlaceholder>
                        )}
                      </MetadataValue>
                    </MetadataInfoItem>
                    <MetadataInfoItem>
                      <MetadataLabel>
                        <Trans>File size</Trans>
                      </MetadataLabel>
                      <MetadataValue>
                        {formattedFileSize ? (
                          formattedFileSize
                        ) : (
                          <MetadataPlaceholder>
                            <Trans>Not available</Trans>
                          </MetadataPlaceholder>
                        )}
                      </MetadataValue>
                    </MetadataInfoItem>
                    <MetadataInfoItem>
                      <MetadataLabel>
                        <Trans>File type</Trans>
                      </MetadataLabel>
                      <MetadataValue>
                        {fileExtension ? (
                          fileExtension
                        ) : (
                          <MetadataPlaceholder>
                            <Trans>Not available</Trans>
                          </MetadataPlaceholder>
                        )}
                      </MetadataValue>
                    </MetadataInfoItem>
                  </MetadataInfoGrid>
                </MetadataSection>

                {audioUrl && (
                  <MetadataSection>
                    <MetadataHeading>
                      <Trans>Audio File</Trans>
                    </MetadataHeading>
                    <AudioAttachmentWrapper>
                      {renderAudioAttachment(true)}
                    </AudioAttachmentWrapper>
                  </MetadataSection>
                )}

                {speakerStats && (
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
                              <StatValue>
                                {formatTime(stats.totalTime)}
                              </StatValue>
                            </StatItem>
                          )}
                        </SpeakerStatDetails>
                      </SpeakerStat>
                    ))}
                  </MetadataSection>
                )}
              </MetadataContainer>
            )}
          </ScrollableContent>
        )}
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
    if (node.attrs.summaryMarkdown) {
      state.write(`${node.attrs.summaryMarkdown}\n\n`);
    }
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

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid ${s("divider")};
  background: ${s("backgroundSecondary")};
`;

const CardControls = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  align-self: center;
`;

const ViewToggleButton = styled.button`
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid ${s("divider")};
  background: transparent;
  color: ${s("textSecondary")};
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: ${s("accent")};
    background: ${s("accent")};
    color: #fff;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const TabBar = styled.div`
  display: flex;
  align-items: center;
  background: transparent;
  flex: 1;
  gap: 4px;
  padding: 0;
`;

const DragHandle = styled.div`
  padding: 12px 8px;
  color: ${s("textTertiary")};
  cursor: grab;
  font-size: 12px;
  letter-spacing: 1px;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  margin-right: 4px;
  transition: all 0.2s ease;

  &:hover {
    color: ${s("textSecondary")};
    background: ${s("background")};
  }

  &:active {
    cursor: grabbing;
  }
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

const MetadataInfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
`;

const MetadataInfoItem = styled.div`
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  padding: 12px 16px;
  background: ${s("background")};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const MetadataLabel = styled.div`
  font-size: 12px;
  letter-spacing: 0.5px;
  color: ${s("textSecondary")};
  text-transform: uppercase;
`;

const MetadataValue = styled.div`
  font-size: 15px;
  color: ${s("text")};
  font-weight: 500;
  word-break: break-word;
`;

const MetadataPlaceholder = styled.span`
  color: ${s("textTertiary")};
  font-weight: 400;
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

// Generate Summary Components
const GenerateContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const GenerateSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const GenerateHeading = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: ${s("text")};
`;

const GenerateForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

// Summary Tab Components
const SummaryTabContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SummaryToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const SummaryToolbarTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: ${s("text")};
`;

const SummaryActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const SummaryActionButton = styled.button`
  padding: 8px 12px;
  border: 1px solid ${s("divider")};
  background: ${s("background")};
  color: ${s("text")};
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover:not(:disabled) {
    background: ${s("backgroundSecondary")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SummaryPreview = styled.div`
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  padding: 16px;
  background: ${s("background")};
  font-size: 15px;
  line-height: 1.2;
  color: ${s("text")};
  max-height: 420px;
  overflow: auto;

  & h1,
  & h2,
  & h3,
  & h4,
  & h5,
  & h6 {
    margin-top: 0.2em;
    margin-bottom: 0.15em;
    line-height: 0.5;
  }

  & h1:first-child,
  & h2:first-child,
  & h3:first-child,
  & h4:first-child,
  & h5:first-child,
  & h6:first-child {
    margin-top: 0;
  }

  & h1:has(+ ul),
  & h2:has(+ ul),
  & h3:has(+ ul),
  & h4:has(+ ul),
  & h5:has(+ ul),
  & h6:has(+ ul),
  & h1:has(+ ol),
  & h2:has(+ ol),
  & h3:has(+ ol),
  & h4:has(+ ol),
  & h5:has(+ ol),
  & h6:has(+ ol) {
    margin-bottom: 0.05em;
  }

  & p {
    margin: 0 0 0.3em;
  }

  & p:last-child {
    margin-bottom: 0;
  }

  & p:empty {
    display: none;
  }

  & ul,
  & ol {
    padding-left: 20px;
    margin: 0 0 0.2em;
  }

  & li {
    margin-bottom: 0.1em;
  }

  & pre {
    background: ${s("backgroundSecondary")};
    padding: 5px;
    border-radius: 6px;
    overflow: auto;
    margin: 0.3em 0;
  }
`;

const SummaryActionText = styled.span`
  font-size: 12px;
  color: ${s("textSecondary")};
`;

const EmptySummaryState = styled.div`
  border: 1px dashed ${s("divider")};
  border-radius: 8px;
  padding: 32px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  background: ${s("background")};
`;

const EmptySummaryTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${s("text")};
`;

const EmptySummaryText = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${s("textSecondary")};
`;

const EmptySummaryButton = styled.button`
  padding: 10px 18px;
  border-radius: 6px;
  border: none;
  background: ${s("accent")};
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: ${s("accentHover")};
  }
`;

const AudioAttachmentWrapper = styled.div`
  padding: 8px 0;
`;

const CollapsedHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-height: 0;
`;

const CollapsedHeaderTitle = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
`;

const CollapsedContainer = styled.div`
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 110px;
  max-height: 150px;
`;

const CollapsedPreview = styled.div`
  margin: 0;
  color: ${s("textSecondary")};
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CollapsedStats = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const CollapsedStat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CollapsedStatLabel = styled.span`
  font-size: 11px;
  color: ${s("textSecondary")};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CollapsedStatValue = styled.span`
  font-size: 13px;
  color: ${s("text")};
  font-weight: 600;
`;

const CollapsedAudioAttachment = styled.div`
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  padding: 8px;
  background: ${s("backgroundSecondary")};

  ${AudioAttachmentWrapper} {
    padding: 0;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
`;

const Select = styled.select`
  padding: 8px 12px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  background: ${s("background")};
  color: ${s("text")};
  font-size: 14px;
  user-select: auto;
  pointer-events: auto;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${s("accent")};
    box-shadow: 0 0 0 2px ${(props) => props.theme.accent}33;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TextArea = styled.textarea`
  padding: 8px 12px;
  border: 1px solid ${s("divider")};
  border-radius: 6px;
  background: ${s("background")};
  color: ${s("text")};
  font-size: 14px;
  font-family: inherit;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${s("accent")};
    box-shadow: 0 0 0 2px ${(props) => props.theme.accent}33;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GenerateButton = styled.button`
  padding: 12px 24px;
  background: ${s("accent")};
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background: ${s("accentHover")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  padding: 12px 16px;
  background: ${s("danger")}22;
  border: 1px solid ${s("danger")};
  border-radius: 6px;
  color: ${s("danger")};
  font-size: 14px;
  line-height: 1.5;
`;

const Spinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;
