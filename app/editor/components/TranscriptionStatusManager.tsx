import { autorun } from "mobx";
import * as React from "react";
import { toast } from "sonner";
import { TextSelection } from "prosemirror-state";
import { Node as ProsemirrorNode, Slice, Fragment } from "prosemirror-model";
import normalizePastedMarkdown from "@shared/editor/lib/markdown/normalize";
import Logger from "~/utils/Logger";
import { client } from "~/utils/ApiClient";
import useDictionary from "~/hooks/useDictionary";
import useStores from "~/hooks/useStores";
import { TranscriptionJobStatus } from "~/stores/TranscriptionJobsStore";
import { useEditor } from "./EditorContext";

type TranscriptionStatusEvent = {
  jobId: string;
  documentId: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress?: number;
  error?: string;
  result?: {
    text: string;
    speakerSegments?: Array<{
      spk: number;
      text: string;
      start?: number;
      end?: number;
      timestamp?: number[][];
    }>;
  };
  attachmentId?: string;
};

type Props = {
  documentId: string;
};

type FormattedSpeakerSegment = {
  spk: string;
  text: string;
  start?: number;
  end?: number;
};

type TimelineChunk = {
  id: string;
  start: number;
  end?: number;
  anchorIndex: number;
  segmentIndexes: number[];
  fallbackText: string;
};

type TimelineEntryPayload = {
  id: string;
  start: number;
  end?: number;
  anchorIndex: number;
  summary: string;
};

// Constants are no longer needed since AI handles segmentation dynamically
const TIMELINE_PROMPT =
  "You are analyzing a complete audio transcript to create an intelligent timeline with title-like summaries.\n" +
  "Your task:\n" +
  "1. Read the entire transcript carefully to understand the conversation flow\n" +
  "2. Identify 3-8 distinct topics or phases in the conversation\n" +
  "3. For each topic, determine the appropriate start and end time\n" +
  "4. Generate a concise title-like summary (max 30 words) for each topic\n\n" +
  "!!! CRITICAL: YOU MUST GENERATE MULTIPLE ENTRIES !!!\n" +
  "- Minimum 3 timeline entries, maximum 8 entries\n" +
  "- Each entry MUST represent a different topic/conversation phase\n" +
  "- DO NOT create a single entry called \"完整录音内容\" or similar\n" +
  "- Break the conversation into natural topic segments\n\n" +
  "Segmentation guidelines:\n" +
  "- Look for topic changes, speaker transitions, discussion shifts\n" +
  "- Group related discussion points together\n" +
  "- Each segment should be 2-10 minutes of conversation\n" +
  "- Create boundaries at natural conversation pauses\n\n" +
  "Summary requirements:\n" +
  "- Use the same language as the transcript\n" +
  "- Each summary must be a title-like phrase, NOT a description\n" +
  "- Focus on the main topic/theme, not conversation details\n" +
  "- Maximum 30 words per summary\n\n" +
  "Good examples:\n" +
  "- \"讨论产品新功能的设计方案\"\n" +
  "- \"分析市场数据并制定策略\"\n" +
  "- \"解决技术实现中的关键问题\"\n" +
  "- \"确定项目时间和资源分配\"\n\n" +
  "Bad examples (STRICTLY AVOID):\n" +
  "- \"Speaker A says..., then Speaker B responds...\"\n" +
  "- \"这段对话包含了关于...\"\n" +
  "- \"完整录音内容\"\n" +
  "- \"Full Transcript — Complete audio recording content\"\n" +
  "- Copy-pasting actual transcript text\n\n" +
  "Output format: JSON array with timeline entries\n" +
  "Each entry must have: id (format: timeline-N), summary, startTime (seconds), endTime (seconds)\n" +
  "Example: [{\"id\": \"timeline-0\", \"summary\": \"讨论项目进展和下一步计划\", \"startTime\": 0, \"endTime\": 180}, {\"id\": \"timeline-1\", \"summary\": \"分析技术方案和可行性\", \"startTime\": 180, \"endTime\": 360}]\n\n" +
  "Complete transcript:\n";

const normalizeTimestampValue = (value?: number) => {
  if (typeof value !== "number") {
    return undefined;
  }
  return value > 1000 ? value / 1000 : value;
};

const buildTimelineChunks = (
  segments?: FormattedSpeakerSegment[] | null,
  transcript?: string
): TimelineChunk[] => {
  // For AI-driven timeline generation, we create a single chunk containing the full transcript
  // The AI model will handle all segmentation and topic identification
  if (segments && segments.length > 0) {
    // Combine all segments with their timing information for AI processing
    const fullText = segments
      .map((segment, index) => {
        const timestamp = typeof segment.start === "number"
          ? `[${Math.floor(segment.start / 60)}:${(segment.start % 60).toString().padStart(2, '0')}] `
          : `[Segment ${index + 1}] `;
        return `${timestamp}Speaker ${segment.spk}: ${segment.text}`;
      })
      .join('\n\n');

    return [
      {
        id: "timeline-full",
        start: 0,
        end: undefined,
        anchorIndex: 0,
        segmentIndexes: segments.map((_, index) => index),
        fallbackText: fullText,
      },
    ];
  }

  if (transcript) {
    return [
      {
        id: "timeline-full",
        start: 0,
        end: undefined,
        anchorIndex: 0,
        segmentIndexes: [],
        fallbackText: transcript,
      },
    ];
  }

  return [];
};

const summarizeTimelineChunks = async (
  chunks: TimelineChunk[],
  segments: FormattedSpeakerSegment[],
  transcript: string,
  jobId: string
): Promise<TimelineEntryPayload[]> => {
  if (chunks.length === 0) {
    return [];
  }

  const mainChunk = chunks[0]; // We now have only one chunk with full transcript
  const fullText = mainChunk.fallbackText.replace(/\s+/g, " ").trim();

  if (!fullText) {
    Logger.warn("No transcript text available for timeline summarization", { jobId });
    return [];
  }

  try {
    Logger.info("editor", "Using AI-driven timeline segmentation", {
      jobId,
      transcriptLength: fullText.length,
      hasSpeakerSegments: segments.length > 0,
    });

    // Build the complete prompt with full transcript
    const completePrompt = TIMELINE_PROMPT + fullText + "\n\nGenerate timeline summary:";

    const response = await client.post<{ data: { text?: string } }>(
      "/ai.generate",
      {
        prompt: completePrompt,
        context: fullText, // Send full transcript as context
        purpose: "primary", // Use primary model for intelligent analysis
      },
      { retry: false }
    );

    const aiResponse = response?.data?.text?.trim();
    let aiResults: Array<{ id: string; summary: string; startTime: number; endTime?: number }> = [];

    if (aiResponse) {
      try {
        // Parse AI-generated timeline with timestamps
        const parsed = JSON.parse(aiResponse);
        if (Array.isArray(parsed)) {
          aiResults = parsed.filter(item =>
            item.id &&
            item.summary &&
            typeof item.startTime === 'number'
          );
          Logger.info("editor", "Successfully parsed AI timeline response", {
            jobId,
            segmentsGenerated: aiResults.length,
          });
        } else {
          Logger.warn("AI response is not a valid array", {
            jobId,
            response: aiResponse.slice(0, 500)
          });
        }
      } catch (parseError) {
        Logger.warn("Failed to parse AI timeline response, using fallback segmentation", {
          jobId,
          response: aiResponse.slice(0, 300),
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });

        // Fallback: Create multiple timeline entries based on content analysis
        if (segments.length > 0) {
          // Create segments based on content and speaker changes
          const minSegmentLength = 5; // Minimum 5 segments
          const entries: any[] = [];

          // Strategy 1: Group by speakers if multiple speakers
          const speakers = [...new Set(segments.map(s => s.spk))];
          if (speakers.length > 1) {
            speakers.forEach((speaker, index) => {
              const speakerSegments = segments.filter(s => s.spk === speaker);
              if (speakerSegments.length > 0) {
                const startTime = typeof speakerSegments[0].start === 'number'
                  ? speakerSegments[0].start
                  : index * 60;
                const endTime = typeof speakerSegments[speakerSegments.length - 1].end === 'number'
                  ? speakerSegments[speakerSegments.length - 1].end
                  : startTime + 120;

                const topic = speakerSegments[0]?.text.split(' ').slice(0, 6).join(' ') || `Speaker ${speaker}讨论`;

                entries.push({
                  id: `timeline-${index}`,
                  summary: topic,
                  startTime,
                  endTime
                });
              }
            });
          }

          // Strategy 2: If still not enough entries, create time-based segments
          if (entries.length < minSegmentLength && segments.length > 0) {
            const segmentGroups = Math.max(Math.ceil(segments.length / 3), minSegmentLength);
            const groupSize = Math.ceil(segments.length / segmentGroups);

            for (let i = 0; i < segmentGroups; i++) {
              const startIdx = i * groupSize;
              const endIdx = Math.min(startIdx + groupSize, segments.length);
              const groupSegments = segments.slice(startIdx, endIdx);

              const startTime = typeof groupSegments[0]?.start === 'number'
                ? groupSegments[0].start
                : i * 120;
              const endTime = typeof groupSegments[groupSegments.length - 1]?.end === 'number'
                ? groupSegments[groupSegments.length - 1].end
                : startTime + 120;

              const topic = groupSegments[0]?.text.split(' ').slice(0, 8).join(' ') || `讨论主题${i + 1}`;

              if (!entries.find(e => Math.abs(e.startTime - startTime) < 60)) {
                entries.push({
                  id: `timeline-${i}`,
                  summary: topic,
                  startTime,
                  endTime
                });
              }
            }
          }

          aiResults = entries.length > 0 ? entries : [{
            id: "timeline-0",
            summary: "会议讨论内容",
            startTime: 0,
            endTime: segments.length > 0 ? Math.max(...segments.map(s => s.end || 0)) : undefined,
          }];
        } else {
          // Fallback for transcript without speaker segments
          const words = transcript.split(' ');
          const segmentSize = Math.max(Math.floor(words.length / 4), 20); // 4 segments minimum

          aiResults = [];
          for (let i = 0; i < 4; i++) {
            const startIdx = i * segmentSize;
            const endIdx = Math.min((i + 1) * segmentSize, words.length);
            const segmentWords = words.slice(startIdx, endIdx);

            if (segmentWords.length > 0) {
              const topic = segmentWords.slice(0, 8).join(' ');
              const startTime = i * 120;
              const endTime = (i + 1) * 120;

              aiResults.push({
                id: `timeline-${i}`,
                summary: topic,
                startTime,
                endTime
              });
            }
          }

          if (aiResults.length === 0) {
            aiResults = [{
              id: "timeline-0",
              summary: "录音内容概要",
              startTime: 0,
              endTime: undefined,
            }];
          }
        }
      }
    }

    // Convert AI results to TimelineEntryPayload format
    const results: TimelineEntryPayload[] = aiResults.map((item, index) => {
      // Find the appropriate anchor index based on the start time
      let anchorIndex = 0;
      if (segments.length > 0 && typeof item.startTime === 'number') {
        // Find the segment closest to this start time
        anchorIndex = segments.findIndex((seg, idx) => {
          const segStart = typeof seg.start === 'number' ? seg.start : idx * 30;
          return segStart >= item.startTime;
        });
        if (anchorIndex === -1) anchorIndex = segments.length - 1;
        if (anchorIndex < 0) anchorIndex = 0;
      }

      return {
        id: item.id,
        start: item.startTime,
        end: item.endTime,
        anchorIndex: anchorIndex,
        summary: item.summary,
      };
    });

    // Sort by start time
    results.sort((a, b) => a.start - b.start);

    Logger.info("editor", "AI-driven timeline summarization completed", {
      jobId,
      segmentsGenerated: results.length,
      totalDuration: results.length > 0 ? Math.max(...results.map(r => r.end || 0)) : 0,
    });

    return results;
  } catch (error) {
    Logger.error("Failed to generate AI-driven timeline", error as Error, {
      jobId,
      transcriptLength: fullText.length,
    });

    // Fallback: Create simple timeline based on available data
    const fallbackResults: TimelineEntryPayload[] = [];

    if (segments.length > 0) {
      // Use segments as fallback
      const segmentGroups = Math.min(Math.ceil(segments.length / 3), 8); // Group segments, max 8 groups
      const groupSize = Math.ceil(segments.length / segmentGroups);

      for (let i = 0; i < segmentGroups; i++) {
        const startIdx = i * groupSize;
        const endIdx = Math.min(startIdx + groupSize, segments.length);
        const groupSegments = segments.slice(startIdx, endIdx);

        const startTime = typeof groupSegments[0]?.start === 'number'
          ? groupSegments[0].start
          : startIdx * 30;
        const endTime = typeof groupSegments[groupSegments.length - 1]?.end === 'number'
          ? groupSegments[groupSegments.length - 1].end
          : undefined;

        // Generate a simple title based on the first few words
        const firstWords = groupSegments[0]?.text.split(' ').slice(0, 8).join(' ') || '';
        const title = firstWords || `段落 ${i + 1}`;

        fallbackResults.push({
          id: `timeline-${i}`,
          start: startTime,
          end: endTime,
          anchorIndex: startIdx,
          summary: title,
        });
      }
    } else {
      // Single fallback entry
      fallbackResults.push({
        id: "timeline-0",
        start: 0,
        end: undefined,
        anchorIndex: 0,
        summary: transcript.slice(0, 50) + (transcript.length > 50 ? "..." : ""),
      });
    }

    return fallbackResults;
  }
};

/**
 * TranscriptionStatusManager polls for transcription status updates every 5 seconds
 * and manages the lifecycle of TranscriptionStatusCard nodes in the editor.
 */
export function TranscriptionStatusManager({ documentId }: Props) {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { audioRecorder, transcriptionJobs } = useStores();
  const editorRef = React.useRef(editor);
  const isMountedRef = React.useRef(true);
  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const [pendingJobsLoaded, setPendingJobsLoaded] = React.useState(false);
  const [, setHasActiveTasks] = React.useState(false);
  const processedCompletedJobsRef = React.useRef(new Set<string>());
  const processingJobsRef = React.useRef(new Set<string>());

  // Keep editor ref up to date and track mount status
  React.useEffect(() => {
    editorRef.current = editor;
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, [editor]);

  const formatTranscriptText = React.useCallback(
    (result: TranscriptionStatusEvent["result"]): string => {
      if (!result || !result.text) {
        Logger.warn("Cannot format transcript: missing result or text");
        return "";
      }

      const originalTextLength = result.text.length;
      let formattedText = result.text.trim();
      let formatMethod = "none";

      // If speaker segments are available, format them with speaker labels
      if (result.speakerSegments && result.speakerSegments.length > 0) {
        formatMethod = "speaker_segments";
        const uniqueSpeakers = new Set(
          result.speakerSegments.map((seg) => seg.spk)
        );

        Logger.info("editor", "Formatting transcript with speaker segments", {
          segmentCount: result.speakerSegments.length,
          uniqueSpeakerCount: uniqueSpeakers.size,
          uniqueSpeakers: Array.from(uniqueSpeakers),
          originalTextLength,
        });

        formattedText = result.speakerSegments
          .map((segment) => {
            // Use the spk number from the segment (e.g., 0, 1, 2)
            const speakerLabel = `spk ${segment.spk}`;
            return `${speakerLabel}: ${segment.text.trim()}`;
          })
          .join("\n\n");
      } else if (/speaker \d+:/gi.test(formattedText)) {
        formatMethod = "speaker_labels_in_text";
        Logger.info(
          "editor",
          "Formatting transcript with speaker labels in text",
          {
            originalTextLength,
          }
        );

        // If the text already contains speaker labels, format them on separate lines
        formattedText = formattedText.replace(
          /speaker \d+:/gi,
          (match: string, offset: number) =>
            offset === 0 ? match : `\n\n${match}`
        );
      } else {
        formatMethod = "sentence_breaks";
        Logger.info("editor", "Formatting transcript with sentence breaks", {
          originalTextLength,
        });

        // For transcripts without speaker labels, add line breaks after sentences
        formattedText = formattedText
          // Add line break after Chinese/Japanese periods, question marks, and exclamation marks
          .replace(/([。！？])\s*/g, "$1\n\n")
          // Add line break after English periods, question marks, and exclamation marks
          .replace(/([.!?])\s+/g, "$1\n\n")
          // Remove multiple consecutive newlines
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      Logger.info("editor", "Transcript formatting completed", {
        formatMethod,
        originalLength: originalTextLength,
        formattedLength: formattedText.length,
        lineCount: formattedText.split("\n").length,
      });

      return formattedText;
    },
    []
  );

  const replaceStatusCardWithTranscript = React.useCallback(
    async (
      jobId: string,
      result: TranscriptionStatusEvent["result"],
      attachmentId?: string,
      options?: {
        sourceType?: "recording" | "upload" | "url";
        autoSummary?: boolean;
      }
    ) => {
      if (processedCompletedJobsRef.current.has(jobId)) {
        Logger.info("editor", "Skipping already processed job", { jobId });
        return;
      }

      if (processingJobsRef.current.has(jobId)) {
        Logger.info("editor", "Transcription job already in progress", {
          jobId,
        });
        return;
      }

      processingJobsRef.current.add(jobId);
      const markJobProcessed = () => {
        processedCompletedJobsRef.current.add(jobId);
      };

      Logger.info("editor", "Attempting to replace status card", {
        jobId,
        hasResult: !!result,
        hasAttachment: !!attachmentId,
      });

      try {
        // Check if component is still mounted
        if (!isMountedRef.current) {
          Logger.debug(
            "editor",
            "Component unmounted, skipping status card replacement",
            {
              jobId,
            }
          );
          return;
        }

        const { view, pasteParser } = editorRef.current;
        if (!view || !result) {
          Logger.warn("Cannot replace status card: missing view or result", {
            hasView: !!view,
            hasResult: !!result,
          });
          return;
        }

        const locateStatusCard = (docToSearch: ProsemirrorNode) => {
          let info:
            | {
                pos: number;
                node: ProsemirrorNode;
                fileName: string;
                fileSize: number;
              }
            | undefined;

          docToSearch.descendants((node, pos) => {
            if (
              node.type.name === "transcription_status_card" &&
              node.attrs.jobId === jobId
            ) {
              info = {
                pos,
                node,
                fileName:
                  node.attrs.fileName || dictionary.audioFile || "audio",
                fileSize: node.attrs.fileSize || 0,
              };
              return false;
            }
            return true;
          });

          return info;
        };

        // Find the status card node by jobId
        const initialDoc = view.state.doc;
        let cardInfo = locateStatusCard(initialDoc);

        if (!cardInfo) {
          const docSnapshot = view.state.doc;

          // For File Attachment AI Notes, the status card might not be found because
          // the attachment was replaced and the polling started before the replacement
          // We should still process the transcription result
          Logger.warn("Status card not found for completed transcription", {
            jobId,
            documentNodeCount: docSnapshot.content.childCount,
            attachmentId: attachmentId,
            sourceType: options?.sourceType,
            willContinueProcessing: true,
          });

          // For attachment-based transcriptions that can't find the status card,
          // we should still process the result and insert the content at the end
          if (attachmentId && options?.sourceType !== "recording") {
            Logger.info("editor", "Processing attachment-based transcription without status card", {
              jobId,
              attachmentId,
            });
          } else if (options?.sourceType === "recording") {
            Logger.info("editor", "Recording transcription - will insert at end of document", {
              jobId,
            });
          } else {
            // For other cases, try to find status card again with a delay
            // This handles race conditions where the status card was just created
            setTimeout(() => {
              const retryCardInfo = locateStatusCard(view.state.doc);
              if (retryCardInfo) {
                Logger.info("editor", "Found status card on retry", {
                  jobId,
                  position: retryCardInfo.pos,
                });
                void replaceStatusCardWithTranscript(jobId, result, attachmentId, options);
              } else {
                Logger.warn("editor", "Status card still not found on retry, giving up", {
                  jobId,
                });
              }
            }, 1000);
            return;
          }
        } else {
          Logger.info("editor", "Found status card, preparing to replace", {
            jobId,
            position: cardInfo.pos,
            fileName: cardInfo.fileName,
          });
        }

        const summaryCardNode = cardInfo?.node ?? null;
        const fileName =
          cardInfo?.fileName ||
          dictionary.audioFile ||
          dictionary.audio ||
          "Audio recording";
        const fileSize = cardInfo?.fileSize || 0;

        // Check if this is an attachment replacement scenario
        // For File Attachment AI Notes, we need to detect this even without finding the status card
        const wasAttachmentReplacement =
          (summaryCardNode?.attrs?.skipAttachmentLink === false) ||
          (attachmentId && options?.sourceType !== "recording");

        // Format the transcript text
        const formattedText = formatTranscriptText(result);

        if (!formattedText) {
          Logger.warn("No transcript text - removing status card", { jobId });

          // Remove the status card for empty transcripts if it exists
          if (cardInfo) {
            const { state, dispatch } = view;
            const position = cardInfo.pos;
            const nodeSize = cardInfo.node.nodeSize;
            const transaction = state.tr.deleteRange(
              position,
              position + nodeSize
            );
            dispatch(transaction.scrollIntoView());
          }

          if (isMountedRef.current) {
            toast.info("No speech detected in recording");
          }
          markJobProcessed();
          return;
        }

        // Build content to insert based on auto-summary mode
        // When auto-summary is enabled: Summary + TranscriptCard
        // When auto-summary is disabled: TranscriptCard only
        let summaryMarkdown = "";

        // Generate AI summary if enabled (either from recorder or from card node)
        const shouldGenerateSummary =
          options?.autoSummary ??
          summaryCardNode?.attrs?.autoSummary ??
          audioRecorder.autoGenerateSummary;

        if (shouldGenerateSummary) {
          try {
            Logger.info("editor", "** Generating AI summary for transcript", {
              jobId,
              fromRecorder: audioRecorder.autoGenerateSummary,
              fromCardNode: summaryCardNode?.attrs?.autoSummary ?? false,
            });

            const prompt =
              "CRITICAL RULES:\n" +
              "1. ONLY use information from the provided transcript below - DO NOT add any external information or make up content\n" +
              "2. If the transcript is too short or unclear, simply state that the content is insufficient for a summary\n" +
              "3. Use the same language as the transcript (default to Chinese/zh-CN if unclear)\n" +
              "4. Design an appropriate format based on the transcript content (e.g., meeting minutes, interview notes, personal memo)\n" +
              "5. If the transcript only contains a single sentence or question, just restate it clearly without elaboration\n\n" +
              "Summarize the following transcript:";
            const response = await client.post<{ data: { text?: string } }>(
              "/ai.generate",
              {
                prompt,
                context: formattedText,
              },
              { retry: false }
            );

            const summary = response?.data?.text?.trim();
            if (summary) {
              summaryMarkdown = `${summary}\n\n`;
              Logger.info("editor", "AI summary generated successfully", {
                jobId,
                summaryLength: summary.length,
              });
            } else {
              Logger.warn("AI summary generation returned empty result", {
                jobId,
              });
            }
          } catch (error) {
            Logger.error("Failed to generate AI summary", error as Error, {
              jobId,
            });
            // Continue without summary - don't block transcript insertion
          }
        }

        // Build nodes array to insert
        const nodesToInsert: ProsemirrorNode[] = [];

        // Add summary first if generated
        if (summaryMarkdown) {
          const normalizedSummary = normalizePastedMarkdown(summaryMarkdown);
          const summaryContent = pasteParser.parse(normalizedSummary);
          if (summaryContent) {
            summaryContent.content.forEach((node) => {
              nodesToInsert.push(node);
            });
            Logger.info("editor", "Added summary nodes", {
              jobId,
              summaryLength: summaryMarkdown.length,
              nodeCount: summaryContent.content.childCount,
            });
          }
        }

        // Re-insert attachment if it was replaced (for File Attachment AI Notes)
        if (wasAttachmentReplacement && attachmentId) {
          const attachmentType = view.state.schema.nodes.attachment;
          if (attachmentType) {
            // Try to find the original attachment in the document to preserve its properties
            let originalAttachment: ProsemirrorNode | null = null;
            view.state.doc.descendants((node) => {
              if (node.type.name === "attachment" &&
                  (node.attrs.id === attachmentId ||
                   (node.attrs.href && node.attrs.href.includes(attachmentId)))) {
                originalAttachment = node;
                return false;
              }
              return true;
            });

            // Use original attachment properties if found, otherwise create with defaults
            const attachmentNode = attachmentType.create({
              id: attachmentId,
              href: originalAttachment?.attrs?.href || `/api/attachments.redirect?id=${attachmentId}`,
              title: originalAttachment?.attrs?.title || fileName || "Audio file",
              size: originalAttachment?.attrs?.size || fileSize,
              contentType: originalAttachment?.attrs?.contentType || "audio/mpeg",
            });

            nodesToInsert.push(attachmentNode);
            Logger.info("editor", "Re-inserted attachment node for AI Notes", {
              jobId,
              attachmentId,
              fileName,
              originalFound: !!originalAttachment,
              attachmentTitle: attachmentNode.attrs.title,
            });
          }
        }

        // Prepare speaker segments with normalized timestamps
        const normalizedSpeakerSegments =
          result.speakerSegments?.map((segment) => ({
            spk: String(segment.spk),
            text: segment.text,
            start: normalizeTimestampValue(segment.start),
            end: normalizeTimestampValue(segment.end),
          })) ?? null;

        // Timeline summary feature has been disabled
        let timelineEntries: TimelineEntryPayload[] | null = null;

        // Create TranscriptCard node instead of markdown heading + code block
        const transcriptCardType = view.state.schema.nodes.transcript_card;
        if (transcriptCardType) {
          const transcriptCard = transcriptCardType.create({
            transcript: formattedText,
            speakerSegments: normalizedSpeakerSegments || null,
            jobId,
            attachmentId: attachmentId || null,
            fileName: fileName || null,
            fileSize,
            timelineEntries: timelineEntries || null,
          });

          nodesToInsert.push(transcriptCard);

          Logger.info("editor", "Created TranscriptCard node", {
            jobId,
            hasSpeakerSegments: !!normalizedSpeakerSegments,
            speakerSegmentCount: normalizedSpeakerSegments?.length || 0,
            transcriptLength: formattedText.length,
            timelineEntryCount: timelineEntries?.length || 0,
            wasAttachmentReplacement,
            reinsertedAttachment: wasAttachmentReplacement && !!attachmentId,
          });
        } else {
          Logger.error("transcript_card node type not found in schema", {
            jobId,
          });
          return;
        }

        // Create slice from nodes
        const slice = new Slice(Fragment.from(nodesToInsert), 0, 0);

        Logger.info("editor", "Built content slice with TranscriptCard", {
          jobId,
          nodeCount: nodesToInsert.length,
          sliceSize: slice.content.size,
          hasAttachment: !!attachmentId,
          hasSummary: !!summaryMarkdown,
        });

        // Replace the status card with the transcript content
        const { state, dispatch } = view;
        let tr = state.tr;

        // For File Attachment AI Notes, we preserve the attachment and don't remove it
        // The attachment will be re-inserted before the TranscriptCard
        // Only remove duplicate attachments if this is NOT an attachment replacement scenario
        if (attachmentId && !wasAttachmentReplacement) {
          const attachmentsToRemove: Array<{ from: number; to: number }> = [];
          const extractAttachmentId = (node: ProsemirrorNode) => {
            if (node.attrs.id) {
              return node.attrs.id as string;
            }

            if (node.attrs.href && typeof node.attrs.href === "string") {
              try {
                const url = new URL(
                  node.attrs.href as string,
                  window.location.origin
                );
                return url.searchParams.get("id");
              } catch (_error) {
                return null;
              }
            }

            return null;
          };

          tr.doc.descendants((node, pos) => {
            if (node.type.name !== "attachment") {
              return true;
            }
            const nodeAttachmentId = extractAttachmentId(node);
            if (nodeAttachmentId === attachmentId) {
              attachmentsToRemove.push({ from: pos, to: pos + node.nodeSize });
            }
            return true;
          });

          attachmentsToRemove
            .sort((a, b) => b.from - a.from)
            .forEach(({ from, to }) => {
              tr.delete(from, to);
            });

          Logger.debug("editor", "Removed duplicate attachments for standard transcription", {
            jobId,
            attachmentId,
            removedCount: attachmentsToRemove.length,
          });
        }

        const latestDoc = tr.doc;
        cardInfo = locateStatusCard(latestDoc) ?? cardInfo;

        const { pos: position, node: cardNode } = cardInfo ?? {
          pos: latestDoc.content.size,
          node: null,
        };
        const nodeSize = cardNode?.nodeSize ?? 0;

        tr = cardNode
          ? tr.replaceRange(position, position + nodeSize, slice)
          : tr.replaceRange(position, position, slice);

        // Set selection at the beginning of the inserted content (summary start)
        // This allows the user to immediately start editing the summary
        const insertionStart = position;
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertionStart), 1));

        dispatch(
          tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste")
        );

        Logger.info(
          "editor",
          "Successfully replaced status card with TranscriptCard",
          {
            jobId,
            insertionStart,
            cursorPosition: "summary_start",
            wasAttachmentReplacement,
            reinsertedAttachment: wasAttachmentReplacement && !!attachmentId,
            hasSummary: !!summaryMarkdown,
            nodeCount: nodesToInsert.length,
          }
        );

        // Only mark job as processed if we found and replaced the status card
        // For attachment-based transcriptions without a status card, don't mark as processed
        // to allow the normal polling flow to handle it
        if (cardInfo) {
          markJobProcessed();
        }

        if (isMountedRef.current) {
          toast.success(
            dictionary.audioFileTranscribedSuccessfully ||
              "Transcription completed"
          );
        }
      } finally {
        processingJobsRef.current.delete(jobId);
      }
    },
    [audioRecorder, dictionary, formatTranscriptText]
  );

  const handleRetryTranscription = React.useCallback(async (jobId: string) => {
    try {
      const response = await client.post<{
        data: { jobId: string; status: string };
      }>("/transcriptions.retry", {
        jobId,
      });

      const newJobId = response.data.jobId;

      // Update the status card with the new job ID
      const { view, commands } = editorRef.current;
      if (view && commands.updateTranscriptionStatus) {
        commands.updateTranscriptionStatus({
          jobId,
          updates: {
            jobId: newJobId,
            status: "queued",
            progress: 0,
            error: null,
          },
        });
      }

      if (isMountedRef.current) {
        toast.success("Retrying transcription...");
      }
    } catch (error) {
      Logger.error("Failed to retry transcription", error as Error);
      if (isMountedRef.current) {
        toast.error("Failed to retry transcription");
      }
    }
  }, []);

  const handleCancelTranscription = React.useCallback(
    async (jobId: string) => {
      try {
        await client.post("/transcriptions.cancel", {
          jobId,
        });

        // Remove the status card from the editor
        const { commands } = editorRef.current;
        if (commands.removeTranscriptionStatusCard) {
          commands.removeTranscriptionStatusCard({ jobId });
        }

        if (isMountedRef.current) {
          toast.success("Transcription cancelled");
        }
      } catch (error) {
        Logger.error("Failed to cancel transcription", error as Error);

        // Check if the job is already completed
        try {
          const response = await client.post<{
            data: {
              id: string;
              status:
                | "queued"
                | "processing"
                | "completed"
                | "failed"
                | "cancelled";
              result: {
                text: string;
                speakerSegments?: Array<{
                  spk: number;
                  text: string;
                  start?: number;
                  end?: number;
                  timestamp?: number[][];
                }>;
              } | null;
              attachmentId?: string;
            };
          }>("/transcriptions.info", {
            jobId,
          });

          const job = response.data;

          if (job.status === "completed" && job.result) {
            // Job is already completed, replace the status card with the transcript
            Logger.info(
              "editor",
              "Job already completed, replacing status card",
              {
                jobId,
              }
            );
            void replaceStatusCardWithTranscript(
              jobId,
              job.result,
              job.attachmentId
            );
            if (isMountedRef.current) {
              toast.info("Transcription already completed");
            }
          } else if (job.status === "cancelled") {
            // Job is already cancelled, just remove the card
            const { commands } = editorRef.current;
            if (commands.removeTranscriptionStatusCard) {
              commands.removeTranscriptionStatusCard({ jobId });
            }
            if (isMountedRef.current) {
              toast.info("Transcription already cancelled");
            }
          } else {
            if (isMountedRef.current) {
              toast.error("Failed to cancel transcription");
            }
          }
        } catch (_infoError) {
          if (isMountedRef.current) {
            toast.error("Failed to cancel transcription");
          }
        }
      }
    },
    [replaceStatusCardWithTranscript]
  );

  // React to completed jobs stored client-side (covers fast jobs without cards)
  React.useEffect(() => {
    const dispose = autorun(() => {
      const jobs = transcriptionJobs.getJobsForDocument(documentId);
      jobs.forEach((job) => {
        if (
          job.sourceType !== "recording" ||
          !job.result ||
          job.status !== TranscriptionJobStatus.Completed ||
          processedCompletedJobsRef.current.has(job.id) ||
          processingJobsRef.current.has(job.id)
        ) {
          return;
        }

        Logger.info("editor", "Processing completed recording job", {
          jobId: job.id,
          documentId,
        });
        void replaceStatusCardWithTranscript(
          job.id,
          job.result,
          job.attachmentId,
          {
            sourceType: job.sourceType,
            autoSummary: job.autoSummary,
          }
        );
      });
    });

    return () => dispose();
  }, [documentId, transcriptionJobs, replaceStatusCardWithTranscript]);

  // Load pending transcription jobs on document load
  React.useEffect(() => {
    const loadPendingJobs = async () => {
      if (!documentId || pendingJobsLoaded) {
        return;
      }

      try {
        const response = await client.post<{
          data: Array<{
            id: string;
            status: "queued" | "processing";
            progress: number | null;
            error: string | null;
            fileName: string;
            fileSize: number;
          }>;
        }>("/transcriptions.list", {
          documentId,
        });

        const pendingJobs = response.data;

        if (!isMountedRef.current) {
          return;
        }

        if (pendingJobs.length === 0) {
          setPendingJobsLoaded(true);
          return;
        }

        // Insert status cards for each pending job
        const { view, commands } = editorRef.current;
        if (view && commands.insertTranscriptionStatusCard) {
          // Check if status cards already exist in the document
          const existingJobIds = new Set<string>();
          view.state.doc.descendants((node) => {
            if (
              node.type.name === "transcription_status_card" &&
              node.attrs.jobId
            ) {
              existingJobIds.add(node.attrs.jobId);
            }
            return true;
          });

          // Insert status cards for jobs that don't already have cards
          for (const job of pendingJobs) {
            if (!existingJobIds.has(job.id)) {
              // Insert at the end of the document
              const { state, dispatch } = view;
              const { tr, doc } = state;
              const endPos = doc.content.size;

              const node =
                view.state.schema.nodes.transcription_status_card.create({
                  jobId: job.id,
                  fileName: job.fileName,
                  fileSize: job.fileSize,
                  status: job.status,
                  progress: job.progress || 0,
                  error: job.error,
                });

              tr.insert(endPos, node);
              dispatch(tr);

              Logger.info("editor", "Inserted status card for pending job", {
                jobId: job.id,
                status: job.status,
              });
            }
          }
        }

        if (isMountedRef.current) {
          setPendingJobsLoaded(true);
        }
      } catch (error) {
        Logger.error(
          "Failed to load pending transcription jobs",
          error as Error
        );
        if (isMountedRef.current) {
          setPendingJobsLoaded(true);
        }
      }
    };

    void loadPendingJobs();
  }, [documentId, pendingJobsLoaded]);

  // Poll for status updates every 5 seconds
  React.useEffect(() => {
    // Don't set up polling if document not loaded yet
    if (!documentId || !pendingJobsLoaded) {
      return undefined;
    }

    const pollStatusUpdates = async () => {
      try {
        // Check if component is still mounted before polling
        if (!isMountedRef.current) {
          return;
        }

        const { view } = editorRef.current;
        if (!view) {
          return;
        }

        // Find all status card nodes in the document
        const statusCards: Array<{ jobId: string; pos: number }> = [];
        view.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "transcription_status_card" &&
            node.attrs.jobId
          ) {
            statusCards.push({ jobId: node.attrs.jobId, pos });
          }
          return true;
        });

        // If no status cards, check if there are any pending jobs that need cards
        if (statusCards.length === 0) {
          try {
            const response = await client.post<{
              data: Array<{
                id: string;
                status: "queued" | "processing";
                progress: number | null;
                error: string | null;
                fileName: string;
                fileSize: number;
              }>;
            }>("/transcriptions.list", {
              documentId,
            });

            const pendingJobs = response.data;

            // If there are pending jobs without status cards, insert them
            if (pendingJobs.length > 0) {
              Logger.info(
                "editor",
                "Found pending jobs without status cards, inserting them",
                {
                  documentId,
                  count: pendingJobs.length,
                  jobIds: pendingJobs.map((j) => j.id),
                }
              );

              const { state, dispatch } = view;
              const { tr, doc } = state;
              const endPos = doc.content.size;

              // Insert all pending job cards at the end of the document
              let currentPos = endPos;
              for (const job of pendingJobs) {
                const node =
                  view.state.schema.nodes.transcription_status_card.create({
                    jobId: job.id,
                    fileName: job.fileName,
                    fileSize: job.fileSize,
                    status: job.status,
                    progress: job.progress || 0,
                    error: job.error,
                  });

                tr.insert(currentPos, node);
                currentPos += node.nodeSize;
              }

              dispatch(tr);

              // Update active tasks state
              if (isMountedRef.current) {
                setHasActiveTasks(true);
              }
            } else {
              // No status cards and no pending jobs - keep polling in case a new recording starts
              Logger.info(
                "editor",
                "No pending transcription tasks found, continuing to poll",
                { documentId }
              );

              if (isMountedRef.current) {
                setHasActiveTasks(false);
              }
            }
          } catch (error) {
            // Silently log errors to avoid noise
            Logger.debug(
              "editor",
              "Failed to check for pending jobs without cards",
              {
                error: (error as Error).message,
              }
            );
          }
          return;
        }

        // We have status cards, so we have active tasks
        if (isMountedRef.current) {
          setHasActiveTasks(true);
        }

        // Check the actual status of each job
        Logger.debug("editor", "Polling status for cards", {
          documentId,
          cardCount: statusCards.length,
          jobIds: statusCards.map((c) => c.jobId),
        });

        for (const card of statusCards) {
          try {
            const response = await client.post<{
              data: {
                id: string;
                status:
                  | "queued"
                  | "processing"
                  | "completed"
                  | "failed"
                  | "cancelled";
                progress: number | null;
                error: string | null;
                result: {
                  text: string;
                  speakerSegments?: Array<{
                    spk: number;
                    text: string;
                    start?: number;
                    end?: number;
                    timestamp?: number[][];
                  }>;
                } | null;
                attachmentId?: string;
              };
            }>("/transcriptions.info", {
              jobId: card.jobId,
            });

            const job = response.data;

            Logger.debug("editor", "Received job status", {
              jobId: job.id,
              status: job.status,
              hasResult: !!job.result,
              attachmentId: job.attachmentId,
            });

            // Check if still mounted before handling status
            if (!isMountedRef.current) {
              return;
            }

            // Handle the job based on its actual status
            if (job.status === "completed" && job.result) {
              Logger.info("editor", "Job completed, replacing status card", {
                jobId: job.id,
                hasResult: !!job.result,
                hasAttachment: !!job.attachmentId,
                textLength: job.result.text?.length || 0,
                speakerSegmentCount: job.result.speakerSegments?.length || 0,
              });
              void replaceStatusCardWithTranscript(
                job.id,
                job.result,
                job.attachmentId
              );
            } else if (job.status === "failed") {
              Logger.info("editor", "Job failed, updating status card", {
                jobId: job.id,
              });
              const { commands } = editorRef.current;
              if (commands.updateTranscriptionStatus) {
                commands.updateTranscriptionStatus({
                  jobId: job.id,
                  updates: {
                    status: "failed",
                    error:
                      job.error ||
                      dictionary.transcriptionFailed ||
                      "Transcription failed",
                  },
                });
              }
            } else if (job.status === "cancelled") {
              Logger.info("editor", "Job cancelled, removing status card", {
                jobId: job.id,
              });
              const { commands } = editorRef.current;
              if (commands.removeTranscriptionStatusCard) {
                commands.removeTranscriptionStatusCard({ jobId: job.id });
              }
            } else if (job.status === "processing" || job.status === "queued") {
              // Update progress for active jobs
              const { commands } = editorRef.current;
              if (commands.updateTranscriptionStatus) {
                commands.updateTranscriptionStatus({
                  jobId: job.id,
                  updates: {
                    status: job.status,
                    progress: job.progress || 0,
                    error: null,
                  },
                });
              }
            }
          } catch (_error) {
            // Silently log individual job polling errors to avoid noise
            // Job might have been deleted or user lost access
          }
        }
      } catch (error) {
        // Log general polling errors
        Logger.error("Failed to poll transcription status", error as Error);
      }
    };

    // Start polling function
    const startPolling = () => {
      // Clear any existing interval first
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      Logger.info("editor", "Starting transcription status polling", {
        documentId,
      });

      // Poll immediately
      void pollStatusUpdates();

      // Set up polling interval (every 5 seconds)
      pollingIntervalRef.current = setInterval(() => {
        void pollStatusUpdates();
      }, 5000);
    };

    // Start polling on mount
    startPolling();

    return () => {
      if (pollingIntervalRef.current) {
        Logger.info(
          "editor",
          "Stopping transcription status polling (cleanup)",
          {
            documentId,
          }
        );
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [
    documentId,
    pendingJobsLoaded,
    dictionary,
    replaceStatusCardWithTranscript,
  ]);

  // Register command handlers for retry and cancel
  React.useEffect(() => {
    const { commands } = editor;

    // Override the retry command to actually call the API
    const originalRetry = commands.retryTranscription;
    commands.retryTranscription = (attrs?: { jobId: string }) => {
      if (attrs?.jobId) {
        void handleRetryTranscription(attrs.jobId);
      }
      return () => true;
    };

    // Override the cancel command to actually call the API
    const originalCancel = commands.cancelTranscription;
    commands.cancelTranscription = (attrs?: { jobId: string }) => {
      if (attrs?.jobId) {
        void handleCancelTranscription(attrs.jobId);
      }
      return () => true;
    };

    return () => {
      // Restore original commands on cleanup
      if (originalRetry) {
        commands.retryTranscription = originalRetry;
      }
      if (originalCancel) {
        commands.cancelTranscription = originalCancel;
      }
    };
  }, [editor, handleRetryTranscription, handleCancelTranscription]);

  // This component doesn't render anything
  return null;
}

export default TranscriptionStatusManager;
