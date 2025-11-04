import * as React from "react";
import { toast } from "sonner";
import { TextSelection } from "prosemirror-state";
import { Node as ProsemirrorNode } from "prosemirror-model";
import normalizePastedMarkdown from "@shared/editor/lib/markdown/normalize";
import Logger from "~/utils/Logger";
import { client } from "~/utils/ApiClient";
import useDictionary from "~/hooks/useDictionary";
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
  const editorRef = React.useRef(editor);
  const [pendingJobsLoaded, setPendingJobsLoaded] = React.useState(false);

  // Keep editor ref up to date
  React.useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const formatTranscriptText = React.useCallback(
    (result: TranscriptionStatusEvent["result"]): string => {
      if (!result || !result.text) {
        return "";
      }

      let formattedText = result.text.trim();

      // If speaker segments are available, format them with speaker labels
      if (result.speakerSegments && result.speakerSegments.length > 0) {
        formattedText = result.speakerSegments
          .map((segment) => {
            // Use the spk number from the segment (e.g., 0, 1, 2)
            const speakerLabel = `spk ${segment.spk}`;
            return `${speakerLabel}: ${segment.text.trim()}`;
          })
          .join("\n\n");
      } else if (/speaker \d+:/gi.test(formattedText)) {
        // If the text already contains speaker labels, format them on separate lines
        formattedText = formattedText.replace(
          /speaker \d+:/gi,
          (match: string, offset: number) =>
            offset === 0 ? match : `\n\n${match}`
        );
      } else {
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

      return formattedText;
    },
    []
  );

  const replaceStatusCardWithTranscript = React.useCallback(
    (
      jobId: string,
      result: TranscriptionStatusEvent["result"],
      attachmentId?: string
    ) => {
      const { view, pasteParser } = editorRef.current;
      if (!view || !result) {
        return;
      }

      const { state, dispatch } = view;
      const { doc, tr, schema } = state;

      // Find the status card node by jobId
      let cardInfo:
        | {
            pos: number;
            node: ProsemirrorNode;
            fileName: string;
            fileSize: number;
          }
        | undefined;

      doc.descendants((node, pos) => {
        if (
          node.type.name === "transcription_status_card" &&
          node.attrs.jobId === jobId
        ) {
          cardInfo = {
            pos,
            node,
            fileName: node.attrs.fileName || "audio",
            fileSize: node.attrs.fileSize || 0,
          };
          return false;
        }
        return true;
      });

      if (!cardInfo) {
        Logger.warn("Status card not found for completed transcription");
        return;
      }

      const { pos: position, node: cardNode, fileName, fileSize } = cardInfo;
      const nodeSize = cardNode.nodeSize;

      // Format the transcript text
      const formattedText = formatTranscriptText(result);

      if (!formattedText) {
        Logger.warn("No transcript text to insert");
        return;
      }

      // Build content to insert: audio attachment (if available) + transcript
      let contentMarkdown = "";

      // Add audio attachment if attachmentId is provided and attachment node type exists
      // Use the correct markdown format for attachments: [title size](href)
      if (attachmentId && schema.nodes.attachment) {
        const attachmentUrl = `/api/attachments.redirect?id=${attachmentId}`;
        contentMarkdown += `[${fileName} ${fileSize}](${attachmentUrl})\n\n`;
      }

      // Add transcript heading and code block
      const transcriptHeading = dictionary.transcript || "Transcript";
      contentMarkdown += `## ${transcriptHeading}\n\n\`\`\`\n${formattedText}\n\`\`\`\n\n`;

      // Parse the markdown into ProseMirror nodes
      const transcriptContent = pasteParser.parse(
        normalizePastedMarkdown(contentMarkdown)
      );

      if (transcriptContent) {
        const slice = transcriptContent.slice(0);

        // Replace the status card with the transcript content
        const transaction = tr.replaceRange(
          position,
          position + nodeSize,
          slice
        );

        // Set selection after the inserted content
        const insertionEnd = Math.min(
          transaction.doc.content.size,
          position + slice.content.size
        );
        transaction.setSelection(
          TextSelection.near(transaction.doc.resolve(insertionEnd), -1)
        );

        dispatch(
          transaction
            .scrollIntoView()
            .setMeta("paste", true)
            .setMeta("uiEvent", "paste")
        );

        toast.success(
          dictionary.audioFileTranscribedSuccessfully ||
            "Transcription completed"
        );
      } else {
        Logger.warn("Failed to parse transcript markdown");
      }
    },
    [dictionary, formatTranscriptText]
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

      toast.success("Retrying transcription...");
    } catch (error) {
      Logger.error("Failed to retry transcription", error as Error);
      toast.error("Failed to retry transcription");
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

        toast.success("Transcription cancelled");
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
            replaceStatusCardWithTranscript(
              jobId,
              job.result,
              job.attachmentId
            );
            toast.info("Transcription already completed");
          } else if (job.status === "cancelled") {
            // Job is already cancelled, just remove the card
            const { commands } = editorRef.current;
            if (commands.removeTranscriptionStatusCard) {
              commands.removeTranscriptionStatusCard({ jobId });
            }
            toast.info("Transcription already cancelled");
          } else {
            toast.error("Failed to cancel transcription");
          }
        } catch (_infoError) {
          toast.error("Failed to cancel transcription");
        }
      }
    },
    [replaceStatusCardWithTranscript]
  );

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

        setPendingJobsLoaded(true);
      } catch (error) {
        Logger.error(
          "Failed to load pending transcription jobs",
          error as Error
        );
        setPendingJobsLoaded(true);
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

        // If no status cards, no need to poll
        if (statusCards.length === 0) {
          return;
        }

        // Check the actual status of each job
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

            // Handle the job based on its actual status
            if (job.status === "completed" && job.result) {
              Logger.info("editor", "Job completed, replacing status card", {
                jobId: job.id,
              });
              replaceStatusCardWithTranscript(
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

    // Poll immediately on mount
    void pollStatusUpdates();

    // Set up polling interval (every 5 seconds)
    const intervalId = setInterval(() => {
      void pollStatusUpdates();
    }, 5000);

    return () => {
      clearInterval(intervalId);
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
