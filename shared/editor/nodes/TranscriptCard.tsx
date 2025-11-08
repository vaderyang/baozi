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
        type: 'transcript_card',
        pos,
        node: node.toJSON()
      };

      // Set the drag data
      try {
        if (event.dataTransfer) {
          event.dataTransfer.setData('application/json', JSON.stringify(dragData));
          event.dataTransfer.setData('text/plain', 'Transcript Card');
          event.dataTransfer.effectAllowed = 'move';

          // Create a custom drag image
          const dragElement = event.currentTarget.cloneNode(true) as HTMLElement;
          dragElement.style.transform = 'rotate(2deg)';
          dragElement.style.opacity = '0.8';
          dragElement.style.width = '200px';
          dragElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

          document.body.appendChild(dragElement);
          event.dataTransfer.setDragImage(dragElement, 100, 20);

          // Remove the drag image after a short delay
          setTimeout(() => {
            document.body.removeChild(dragElement);
          }, 100);
        }
      } catch (e) {
        // Fallback for browsers that don't support drag operations
        console.warn('Drag setup failed:', e);
      }
    };

  handleDragOver =
    () =>
    (event: React.DragEvent) => {
      // Prevent default to allow drop
      event.preventDefault();
      if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
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
        const dragDataStr = event.dataTransfer?.getData('application/json');
        if (!dragDataStr) {return;}

        const dragData = JSON.parse(dragDataStr);

        // Only handle transcript card drops
        if (dragData.type !== 'transcript_card') {return;}

        // Don't handle drops on the same node
        if (dragData.pos === getPos()) {return;}

        const dropPos = getPos();
        const originalPos = dragData.pos;

        // Get the source and target nodes
        const $original = view.state.doc.resolve(originalPos);
        const originalNode = $original.nodeAfter;

        if (!originalNode) {return;}

        // Create a transaction to move the node
        const { tr } = view.state;

        // Delete the original node
        tr.delete(originalPos, originalPos + originalNode.nodeSize);

        // Determine the correct drop position (accounting for the deletion)
        const adjustedDropPos = originalPos < dropPos ? dropPos - originalNode.nodeSize : dropPos;

        // Insert at the new position
        tr.insert(adjustedDropPos, originalNode);

        // Dispatch the transaction
        const newTr = tr.scrollIntoView();
        view.dispatch(newTr);

      } catch (e) {
        console.warn('Drop handling failed:', e);
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
    } = node.attrs;
    const [activeTab, setActiveTab] = React.useState<
      "transcript" | "audio" | "metadata" | "summary"
    >("transcript");
    const [activeTimelineId, setActiveTimelineId] = React.useState<
      string | null
    >(null);
    const transcriptPaneRef = React.useRef<HTMLDivElement | null>(null);
    const transcriptTextRef = React.useRef<HTMLDivElement | null>(null);
    const speakerSegmentRefs = React.useRef<Array<HTMLDivElement | null>>([]);

    // Summary tab state
    const [meetingType, setMeetingType] = React.useState<string>("general");
    const [customPrompt, setCustomPrompt] = React.useState<string>("");
    const [summaryLanguage, setSummaryLanguage] = React.useState<string>("en");
    const [insertPosition, setInsertPosition] = React.useState<string>("after");
    const [isGenerating, setIsGenerating] = React.useState<boolean>(false);
    const [errorMessage, setErrorMessage] = React.useState<string>("");
    const isGeneratingRef = React.useRef<boolean>(false);
    const abortControllerRef = React.useRef<AbortController | null>(null);

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

    const handleGenerateSummary = React.useCallback(async (props: ComponentProps) => {
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
            .join('\n\n');
        }

        // Build the prompt based on meeting type, language, and custom prompt
        const meetingTypePrompts = {
          'general': 'Create a comprehensive summary of this meeting transcript',
          'project-update': 'Summarize this project update meeting, focusing on progress, blockers, and next steps',
          'decision-making': 'Extract and summarize the key decisions made in this meeting, including rationale',
          'brainstorming': 'Summarize the brainstorming session, highlighting key ideas and insights',
          'retrospective': 'Create a retrospective summary covering what went well, what didn\'t, and action items',
          'interview': 'Summarize this interview, highlighting key responses and insights',
          'training': 'Summarize the training session, covering main topics and key takeaways',
          'client-call': 'Summarize this client call, focusing on requirements, feedback, and outcomes'
        };

        const languageInstructions = {
          'en': 'in English',
          'zh': 'in Chinese (中文)',
          'ja': 'in Japanese (日本語)',
          'ko': 'in Korean (한국어)',
          'es': 'in Spanish',
          'fr': 'in French',
          'de': 'in German',
          'pt': 'in Portuguese',
          'ru': 'in Russian',
          'ar': 'in Arabic',
        };

        const basePrompt = meetingTypePrompts[meetingType as keyof typeof meetingTypePrompts] || meetingTypePrompts.general;
        const languageInstruction = languageInstructions[summaryLanguage as keyof typeof languageInstructions] || languageInstructions.en;

        let fullPrompt = `${basePrompt} ${languageInstruction}`;
        if (customPrompt) {
          fullPrompt += `. ${customPrompt}`;
        }
        fullPrompt += '. Use markdown formatting with headings, bullet points, and emphasis where appropriate.';

        // Get document ID from editor
        const documentId = this.editor.props.id;
        if (!documentId) {
          throw new Error('Document ID not available');
        }

        // Queue the AI summary generation job
        const { client } = await import('~/utils/ApiClient');

        const queueResult = await client.post('/ai.queueSummary', {
          prompt: fullPrompt,
          context: transcriptText,
          metadata: {
            documentId,
            language: summaryLanguage,
            meetingType,
            insertPosition,
            customPrompt,
          },
        });

        const jobId = queueResult.data?.jobId;
        if (!jobId) {
          throw new Error('Failed to queue summary generation');
        }

        console.log('Summary generation queued with jobId:', jobId);

        // Poll for job status
        const pollInterval = 2000; // Poll every 2 seconds
        const maxPollTime = 5 * 60 * 1000; // 5 minutes max
        const startTime = Date.now();

        const pollStatus = async (): Promise<any> => {
          if (Date.now() - startTime > maxPollTime) {
            throw new Error('Summary generation timed out');
          }

          const statusResult = await client.post('/ai.summaryStatus', {
            jobId,
          });

          const status = statusResult.data?.status;
          const error = statusResult.data?.error;
          const result = statusResult.data?.result;

          console.log('Job status:', status);

          if (status === 'completed') {
            return result;
          } else if (status === 'failed') {
            throw new Error(error || 'Summary generation failed');
          } else if (status === 'queued' || status === 'processing') {
            // Continue polling
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            return pollStatus();
          } else {
            throw new Error(`Unknown job status: ${status}`);
          }
        };

        const summaryText = await pollStatus();
        console.log('Generated summary length:', summaryText.length);

        // Get the current position of the TranscriptCard
        const { view } = this.editor;
        const getPos = props.getPos;
        const currentPos = getPos();
        const nodeSize = props.node.nodeSize;

        // Create the summary markdown content
        const summaryMarkdown = `## Meeting Summary\n\n${summaryText}\n\n---\n\n`;

        // Parse the markdown to create proper ProseMirror nodes
        const { state } = view;
        const tr = state.tr;

        // Parse markdown into ProseMirror document fragment
        const parsedDoc = this.editor.parser.parse(summaryMarkdown);
        if (!parsedDoc) {
          console.error('Failed to parse markdown');
          return;
        }

        // Insert the parsed content at the selected position
        const insertPos = insertPosition === 'before' ? currentPos : currentPos + nodeSize;

        // Insert all nodes from the parsed document
        // We need to insert them in order, keeping track of the cumulative size
        let currentInsertPos = insertPos;
        parsedDoc.content.forEach((node) => {
          tr.insert(currentInsertPos, node);
          currentInsertPos += node.nodeSize;
        });

        console.log('Dispatching transaction to insert summary at position:', insertPos);
        view.dispatch(tr);

    } catch (error: unknown) {
      console.error('Failed to generate summary:', error);

      // Determine error message based on error type
      let userMessage = "Failed to generate summary. Please try again.";
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('timed out')) {
        userMessage = "Summary generation timed out. The AI is taking too long to respond. Please try again or try with a shorter transcript.";
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
        userMessage = "Network error. Please check your connection and try again.";
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        userMessage = "Authentication error. Please refresh the page and try again.";
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        userMessage = "Permission denied. You may not have access to AI features.";
      } else if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
        userMessage = "Invalid request. The transcript may be too long or the AI configuration is incomplete.";
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        userMessage = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (errorMessage.includes('500') || errorMessage.includes('503')) {
        userMessage = "AI service is temporarily unavailable. Please try again in a few moments.";
      } else if (errorMessage) {
        userMessage = `Error: ${errorMessage}`;
      }

      setErrorMessage(userMessage);
    } finally {
      abortControllerRef.current = null;
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
    }, [transcript, speakerSegments, meetingType, customPrompt, summaryLanguage, insertPosition]);

    return (
      <TranscriptContainer
        className={isSelected ? "ProseMirror-selectednode" : ""}
        onDragOver={this.handleDragOver()}
        onDrop={this.handleDrop(props)}
      >
        <TabBar>
          <DragHandle
            draggable={isEditable}
            onDragStart={this.handleDragStart(props)}
            title="Drag to move this transcript card"
          >
            ⋮⋮
          </DragHandle>
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
          <Tab
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
          >
            <Trans>Summary</Trans>
          </Tab>
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

          {activeTab === "summary" && (
            <SummaryContainer>
              <SummarySection>
                <SummaryHeading>
                  <Trans>Generate Summary</Trans>
                </SummaryHeading>
                <SummaryForm>
                  <FormGroup>
                    <Label>
                      <Trans>Meeting Type</Trans>
                    </Label>
                    <Select
                      value={meetingType}
                      onChange={(e) => setMeetingType(e.target.value)}
                      disabled={isGenerating}
                    >
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
                      disabled={isGenerating}
                    >
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
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomPrompt(e.target.value)}
                      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      onFocus={(e: React.FocusEvent) => e.stopPropagation()}
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
                      disabled={isGenerating}
                    >
                      <option value="before">Before Transcript Card</option>
                      <option value="after">After Transcript Card</option>
                    </Select>
                  </FormGroup>

                  {errorMessage && (
                    <ErrorMessage>
                      {errorMessage}
                    </ErrorMessage>
                  )}

                  <GenerateButton
                    onClick={() => handleGenerateSummary(props)}
                    disabled={isGenerating || (!transcript && !speakerSegments)}
                  >
                    {isGenerating ? (
                      <>
                        <Spinner /> <Trans>Generating... (this may take a few minutes)</Trans>
                      </>
                    ) : errorMessage ? (
                      <Trans>Retry</Trans>
                    ) : (
                      <Trans>(Re)Generate Summary</Trans>
                    )}
                  </GenerateButton>
                </SummaryForm>
              </SummarySection>
            </SummaryContainer>
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
  align-items: center;
  border-bottom: 1px solid ${s("divider")};
  background: ${s("backgroundSecondary")};
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

// Summary Components
const SummaryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const SummarySection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SummaryHeading = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: ${s("text")};
`;

const SummaryForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
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
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
