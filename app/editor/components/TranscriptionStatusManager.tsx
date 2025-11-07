import { autorun } from "mobx";
import * as React from "react";
import { toast } from "sonner";
import { TextSelection } from "prosemirror-state";
import { Node as ProsemirrorNode, Slice } from "prosemirror-model";
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
      Logger.info("editor", "Attempting to replace status card", {
        jobId,
        hasResult: !!result,
        hasAttachment: !!attachmentId,
      });

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
              fileName: node.attrs.fileName || dictionary.audioFile || "audio",
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
        if (options?.sourceType === "recording") {
          Logger.warn(
            "Status card not found for completed recording, falling back to insertion",
            {
              jobId,
              documentNodeCount: docSnapshot.content.childCount,
            }
          );
        } else {
          Logger.warn("Status card not found for completed transcription", {
            jobId,
            documentNodeCount: docSnapshot.content.childCount,
          });
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

      // Format the transcript text
      const formattedText = formatTranscriptText(result);

      if (!formattedText) {
        Logger.warn("No transcript text - removing status card", { jobId });
        // Remove the status card for empty transcripts
        const transaction = tr.deleteRange(position, position + nodeSize);
        dispatch(transaction.scrollIntoView());

        if (isMountedRef.current) {
          toast.info("No speech detected in recording");
        }
        return;
      }

      // Build content to insert based on auto-summary mode
      // When auto-summary is enabled: Summary + Audio Attachment + Collapsed Transcript
      // When auto-summary is disabled: Audio Attachment + Transcript
      let contentMarkdown = "";
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

      // Add summary first if generated
      if (summaryMarkdown) {
        contentMarkdown += summaryMarkdown;
        Logger.info("editor", "Added summary to markdown", {
          jobId,
          summaryLength: summaryMarkdown.length,
        });
      }

      // Add audio attachment if attachmentId is provided, attachment node type exists,
      // and skipAttachmentLink flag is not set (to avoid duplicates when transcribing existing attachments)
      // Use the correct markdown format for attachments: [title size](href)
      if (
        attachmentId &&
        view.state.schema.nodes.attachment &&
        summaryCardNode &&
        !summaryCardNode.attrs?.skipAttachmentLink
      ) {
        const attachmentUrl = `/api/attachments.redirect?id=${attachmentId}`;
        contentMarkdown += `[${fileName} ${fileSize}](${attachmentUrl})\n\n`;
        Logger.info("editor", "Added audio attachment to markdown", {
          jobId,
          attachmentId,
          fileName,
          fileSize,
          attachmentUrl,
          currentMarkdownLength: contentMarkdown.length,
        });
      } else {
        Logger.info("editor", "Skipping audio attachment", {
          jobId,
          hasAttachmentId: !!attachmentId,
          hasAttachmentNodeType: !!schema.nodes.attachment,
          skipAttachmentLink:
            summaryCardNode?.attrs?.skipAttachmentLink ?? false,
        });
      }

      // Add transcript heading and code block
      // Always use a regular heading - we'll set collapsed attribute programmatically if needed
      const transcriptHeading = dictionary.transcript || "Transcript";
      contentMarkdown += `## ${transcriptHeading}\n\n\`\`\`\n${formattedText}\n\`\`\`\n\n`;

      Logger.info("editor", "Built markdown content for transcript", {
        jobId,
        markdownLength: contentMarkdown.length,
        hasAttachment: !!attachmentId,
        hasSummary: !!summaryMarkdown,
        transcriptHeading,
        formattedTextLength: formattedText.length,
        markdownPreview: contentMarkdown.substring(0, 200),
      });

      // Parse the markdown into ProseMirror nodes
      const normalizeStartTime = Date.now();
      const normalizedMarkdown = normalizePastedMarkdown(contentMarkdown);
      const normalizeDuration = Date.now() - normalizeStartTime;

      Logger.debug("editor", "Normalized markdown", {
        jobId,
        normalizeDurationMs: normalizeDuration,
        originalLength: contentMarkdown.length,
        normalizedLength: normalizedMarkdown.length,
      });

      const parseStartTime = Date.now();
      const transcriptContent = pasteParser.parse(normalizedMarkdown);
      const parseDuration = Date.now() - parseStartTime;

      if (transcriptContent) {
        let slice = transcriptContent.slice(0);

        // If auto-summary is enabled, find the transcript heading and set it to collapsed
        if (shouldGenerateSummary) {
          const nodes: ProsemirrorNode[] = [];
          slice.content.forEach((node) => {
            // Check if this is the transcript heading
            if (
              node.type.name === "heading" &&
              node.textContent === transcriptHeading
            ) {
              // Create a new heading node with collapsed attribute set to true
              nodes.push(
                node.type.create(
                  { ...node.attrs, collapsed: true },
                  node.content,
                  node.marks
                )
              );
            } else {
              nodes.push(node);
            }
          });
          // Create a new slice with the modified content
          const newContent = schema.nodes.doc.create(null, nodes).content;
          slice = new Slice(newContent, slice.openStart, slice.openEnd);
        }

        Logger.info("editor", "Parsed transcript content successfully", {
          jobId,
          parseDurationMs: parseDuration,
          sliceSize: slice.content.size,
          sliceChildCount: slice.content.childCount,
          contentMarkdownLength: contentMarkdown.length,
          collapsedHeading: shouldGenerateSummary,
        });

        // Replace the status card with the transcript content
        const { state, dispatch } = view;
        const latestDoc = state.doc;
        cardInfo = locateStatusCard(latestDoc) ?? cardInfo;

        const { pos: position, node: cardNode } = cardInfo ?? {
          pos: latestDoc.content.size,
          node: null,
        };
        const nodeSize = cardNode?.nodeSize ?? 0;

        const { tr, schema } = state;
        const transaction = cardNode
          ? tr.replaceRange(position, position + nodeSize, slice)
          : tr.replaceRange(position, position, slice);

        // Set selection at the beginning of the inserted content (summary start)
        // This allows the user to immediately start editing the summary
        const insertionStart = position;
        transaction.setSelection(
          TextSelection.near(transaction.doc.resolve(insertionStart), 1)
        );

        dispatch(
          transaction
            .scrollIntoView()
            .setMeta("paste", true)
            .setMeta("uiEvent", "paste")
        );

        Logger.info(
          "editor",
          "Successfully replaced status card with transcript",
          {
            jobId,
            insertionStart,
            cursorPosition: "summary_start",
          }
        );

        if (isMountedRef.current) {
          toast.success(
            dictionary.audioFileTranscribedSuccessfully ||
              "Transcription completed"
          );
        }
      } else {
        Logger.warn("Failed to parse transcript markdown", {
          jobId,
          contentMarkdownLength: contentMarkdown.length,
          contentMarkdownPreview: contentMarkdown.substring(0, 100),
        });
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
          processedCompletedJobsRef.current.has(job.id)
        ) {
          return;
        }

        processedCompletedJobsRef.current.add(job.id);
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
