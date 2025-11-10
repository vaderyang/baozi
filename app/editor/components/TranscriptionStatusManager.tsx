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

type TimelineEntryPayload = {
  id: string;
  start: number;
  end?: number;
  anchorIndex: number;
  summary: string;
};

const normalizeTimestampValue = (value?: number) => {
  if (typeof value !== "number") {
    return undefined;
  }
  // If value is very large (>100000), assume it's in milliseconds and convert to seconds
  // This threshold allows recordings up to ~27 hours in seconds format
  return value > 1000 ? value / 1000 : value;
};

/**
 * TranscriptionStatusManager polls for transcription status updates every 5 seconds
 * and manages the lifecycle of TranscriptionStatusCard nodes in the editor.
 */
export function TranscriptionStatusManager({ documentId }: Props) {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { audioRecorder, transcriptionJobs, documents } = useStores();
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

        const { view } = editorRef.current;
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
            Logger.info(
              "editor",
              "Processing attachment-based transcription without status card",
              {
                jobId,
                attachmentId,
              }
            );
          } else if (options?.sourceType === "recording") {
            Logger.info(
              "editor",
              "Recording transcription - will insert at end of document",
              {
                jobId,
              }
            );
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
                void replaceStatusCardWithTranscript(
                  jobId,
                  result,
                  attachmentId,
                  options
                );
              } else {
                Logger.warn(
                  "editor",
                  "Status card still not found on retry, giving up",
                  {
                    jobId,
                  }
                );
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
        const isRecordingSource = options?.sourceType === "recording";
        const wasAttachmentReplacement =
          !isRecordingSource &&
          (summaryCardNode?.attrs?.skipAttachmentLink === false ||
            (attachmentId && options?.sourceType !== "recording"));

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

        // Prepare speaker segments with normalized timestamps
        const normalizedSpeakerSegments =
          result.speakerSegments?.map((segment) => ({
            spk: String(segment.spk),
            text: segment.text,
            start: normalizeTimestampValue(segment.start),
            end: normalizeTimestampValue(segment.end),
          })) ?? null;

        const documentRecord = documents.get(documentId);
        const recordingStartedAtIso = (() => {
          const createdAt = documentRecord?.createdAt;
          if (!createdAt) {
            return null;
          }
          const date = new Date(createdAt);
          return Number.isNaN(date.getTime()) ? null : date.toISOString();
        })();

        const derivedDurationFromSegments = normalizedSpeakerSegments
          ? normalizedSpeakerSegments.reduce((max, segment) => {
              const candidate =
                typeof segment.end === "number"
                  ? segment.end
                  : typeof segment.start === "number"
                    ? segment.start
                    : 0;
              return candidate > max ? candidate : max;
            }, 0)
          : 0;

        const durationFromDocument = normalizeTimestampValue(
          documentRecord?.audioMetadata?.duration
        );

        const recordingDurationSeconds =
          durationFromDocument ??
          (derivedDurationFromSegments > 0
            ? derivedDurationFromSegments
            : null);

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
            Logger.info(
              "editor",
              "** Queueing AI summary generation for transcript",
              {
                jobId,
                fromRecorder: audioRecorder.autoGenerateSummary,
                fromCardNode: summaryCardNode?.attrs?.autoSummary ?? false,
              }
            );

            const formattedRecordingTime =
              recordingStartedAtIso &&
              Number.isFinite(Date.parse(recordingStartedAtIso))
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(recordingStartedAtIso))
                : null;

            const { generateTranscriptSummary } = await import(
              "~/utils/transcriptSummary"
            );
            const { summary, jobId: summaryJobId } =
              await generateTranscriptSummary({
                documentId,
                transcriptText: formattedText,
                speakerSegments: normalizedSpeakerSegments,
                meetingType: "auto",
                summaryLanguage: "auto",
                customPrompt: "",
                insertPosition: "summary_tab",
                formattedRecordingTime,
              });

            if (summary) {
              summaryMarkdown = `${summary}\n\n`;
              Logger.info("editor", "AI summary generated successfully", {
                jobId,
                summaryJobId,
                summaryLength: summary.length,
              });
            } else {
              Logger.warn("AI summary generation returned empty result", {
                jobId,
                summaryJobId,
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
        const summaryMarkdownForCard = summaryMarkdown
          ? normalizePastedMarkdown(summaryMarkdown)
          : "";

        if (summaryMarkdownForCard) {
          Logger.info("editor", "Attached summary to transcript card", {
            jobId,
            summaryLength: summaryMarkdownForCard.length,
          });
        }

        // Re-insert attachment if it was replaced (for File Attachment AI Notes)
        if (wasAttachmentReplacement && attachmentId) {
          const attachmentType = view.state.schema.nodes.attachment;
          if (attachmentType) {
            // Try to find the original attachment in the document to preserve its properties
            let originalAttachment: ProsemirrorNode | null = null;
            view.state.doc.descendants((node) => {
              if (
                node.type.name === "attachment" &&
                (node.attrs.id === attachmentId ||
                  (node.attrs.href && node.attrs.href.includes(attachmentId)))
              ) {
                originalAttachment = node;
                return false;
              }
              return true;
            });

            // Use original attachment properties if found, otherwise create with defaults
            const attachmentNode = attachmentType.create({
              id: attachmentId,
              href:
                originalAttachment?.attrs?.href ||
                `/api/attachments.redirect?id=${attachmentId}`,
              title:
                originalAttachment?.attrs?.title || fileName || "Audio file",
              size: originalAttachment?.attrs?.size || fileSize,
              contentType:
                originalAttachment?.attrs?.contentType || "audio/mpeg",
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
            summaryMarkdown: summaryMarkdownForCard,
            recordingStartedAt: recordingStartedAtIso,
            recordingDuration: recordingDurationSeconds,
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
          hasSummary: !!summaryMarkdownForCard,
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

          Logger.debug(
            "editor",
            "Removed duplicate attachments for standard transcription",
            {
              jobId,
              attachmentId,
              removedCount: attachmentsToRemove.length,
            }
          );
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
            hasSummary: !!summaryMarkdownForCard,
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
    [audioRecorder, dictionary, documents, formatTranscriptText, documentId]
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
              autoSummary?: boolean;
            };
          }>("/transcriptions.info", {
            jobId,
          });

          const job = response.data;
          const jobRecord = transcriptionJobs.getJob(jobId);
          const sourceType = jobRecord?.sourceType;

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
              job.attachmentId,
              {
                sourceType,
                autoSummary: job.autoSummary ?? false,
              }
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
    [replaceStatusCardWithTranscript, transcriptionJobs]
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
            autoSummary?: boolean;
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
                  autoSummary: job.autoSummary ?? false,
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
                autoSummary?: boolean;
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
                    autoSummary: job.autoSummary ?? false,
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
                autoSummary?: boolean;
              };
            }>("/transcriptions.info", {
              jobId: card.jobId,
            });

            const job = response.data;
            const jobRecord = transcriptionJobs.getJob(job.id);
            const sourceType = jobRecord?.sourceType;

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
                job.attachmentId,
                {
                  sourceType,
                  autoSummary: job.autoSummary ?? false,
                }
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
    transcriptionJobs,
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
