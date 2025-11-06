import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import LoadingIndicator from "~/components/LoadingIndicator";
import Text from "~/components/Text";
import AIArchiveSuggestion from "~/components/AIArchiveSuggestion";
import useStores from "~/hooks/useStores";
import {
  TranscriptionJob,
  TranscriptionJobStatus,
} from "~/stores/TranscriptionJobsStore";

type Props = {
  documentId: string;
};

/**
 * AudioTranscript displays the transcription status and result for an audio document.
 * It shows:
 * - Processing status with progress indicator
 * - Completed transcript with speaker segments
 * - Error message with retry button on failure
 * - AI Archive Suggestions when transcription is complete
 */
function AudioTranscript({ documentId }: Props) {
  const { transcriptionJobs, documents } = useStores();
  const { t } = useTranslation();
  const [job, setJob] = React.useState<TranscriptionJob | null>(null);
  const [suggestions, setSuggestions] = React.useState<
    Array<{
      targetId: string;
      targetType: "collection" | "document";
      targetName: string;
      reason: string;
      confidence: number;
    }>
  >([]);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);

  const document = documents.get(documentId);

  const loadArchiveSuggestions = React.useCallback(async () => {
    if (!document || loadingSuggestions) {return;}

    // Check if suggestions already exist in document metadata
    if (
      document.audioMetadata?.aiArchiveSuggestion?.suggestions &&
      document.audioMetadata.aiArchiveSuggestion.suggestions.length > 0
    ) {
      setSuggestions(document.audioMetadata.aiArchiveSuggestion.suggestions);
      return;
    }

    setLoadingSuggestions(true);
    try {
      const response = await fetch("/api/audio.archive-suggestion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.data.suggestions || []);
      }
    } catch (_error) {
      // Silently fail - suggestions are optional
    } finally {
      setLoadingSuggestions(false);
    }
  }, [document, documentId, loadingSuggestions]);

  React.useEffect(() => {
    // Get the latest job for this document
    const jobs = transcriptionJobs.getJobsForDocument(documentId);
    if (jobs.length > 0) {
      // Sort by creation time (assuming newer jobs have higher IDs)
      const latestJob = jobs[jobs.length - 1];
      setJob(latestJob);

      // Load suggestions when transcription completes
      if (
        latestJob.status === TranscriptionJobStatus.Completed &&
        document &&
        !suggestions.length &&
        !loadingSuggestions
      ) {
        void loadArchiveSuggestions();
      }
    }
  }, [
    documentId,
    transcriptionJobs,
    transcriptionJobs.jobs,
    document,
    suggestions.length,
    loadingSuggestions,
    loadArchiveSuggestions,
  ]);

  const handleRetry = React.useCallback(async () => {
    if (job) {
      try {
        await transcriptionJobs.retryJob(job.id);
      } catch (_error) {
        // Error will be reflected in job status
      }
    }
  }, [job, transcriptionJobs]);

  const handleAcceptSuggestion = React.useCallback(
    async (targetId: string, targetType: "collection" | "document") => {
      const response = await fetch("/api/audio.accept-suggestion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
          targetId,
          targetType,
        }),
      });

      if (response.ok) {
        // Reload document to reflect changes
        if (document) {
          await document.fetch();
        }
        setSuggestions([]);
      }
    },
    [documentId, document]
  );

  const handleDismissSuggestions = React.useCallback(async () => {
    if (!document) {return;}

    // Update document metadata to mark suggestions as dismissed
    await document.save({
      audioMetadata: {
        ...document.audioMetadata,
        aiArchiveSuggestion: {
          suggestions:
            document.audioMetadata?.aiArchiveSuggestion?.suggestions || [],
          status: "dismissed",
          acceptedSuggestionId:
            document.audioMetadata?.aiArchiveSuggestion?.acceptedSuggestionId,
        },
      },
    });
    setSuggestions([]);
  }, [document]);

  if (!job) {
    return null;
  }

  // Show processing status
  if (
    job.status === TranscriptionJobStatus.Queued ||
    job.status === TranscriptionJobStatus.Processing
  ) {
    return (
      <TranscriptContainer>
        <Flex column gap={12} align="center">
          <LoadingIndicator />
          <Text type="secondary">
            {job.status === TranscriptionJobStatus.Queued
              ? t("Transcription queued...")
              : t("Transcribing your recording...")}
          </Text>
          {job.progress !== null && job.progress > 0 && (
            <ProgressBar>
              <ProgressFill progress={job.progress} />
            </ProgressBar>
          )}
        </Flex>
      </TranscriptContainer>
    );
  }

  // Show error with retry button
  if (job.status === TranscriptionJobStatus.Failed) {
    return (
      <TranscriptContainer>
        <Flex column gap={12}>
          <Text type="danger">{t("Transcription failed")}</Text>
          {job.error && <Text type="secondary">{job.error}</Text>}
          <Button onClick={handleRetry}>{t("Retry")}</Button>
        </Flex>
      </TranscriptContainer>
    );
  }

  // Show completed transcript
  if (job.status === TranscriptionJobStatus.Completed && job.result) {
    const { text, speakerSegments } = job.result;

    return (
      <>
        {/* Show AI Archive Suggestions */}
        {document && suggestions.length > 0 && (
          <AIArchiveSuggestion
            document={document}
            suggestions={suggestions}
            onAccept={handleAcceptSuggestion}
            onDismiss={handleDismissSuggestions}
          />
        )}

        <TranscriptContainer>
          <TranscriptHeading>{t("Transcript")}</TranscriptHeading>

          {speakerSegments && speakerSegments.length > 0 ? (
            <SpeakerSegments>
              {speakerSegments.map((segment, index) => (
                <SpeakerSegment key={index}>
                  <SpeakerLabel>
                    {t("Speaker")} {segment.spk}
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
            <TranscriptText>{text}</TranscriptText>
          )}
        </TranscriptContainer>
      </>
    );
  }

  return null;
}

/**
 * Format time in seconds to MM:SS format
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const TranscriptContainer = styled.div`
  margin: 24px 0;
  padding: 24px;
  background: ${s("background")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
`;

const TranscriptHeading = styled.h2`
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: ${s("text")};
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
  font-family: monospace;
`;

const ProgressBar = styled.div`
  width: 100%;
  max-width: 300px;
  height: 4px;
  background: ${s("divider")};
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ progress: number }>`
  height: 100%;
  width: ${(props) => props.progress}%;
  background: ${(props) => props.theme.accent};
  transition: width 0.3s ease;
`;

export default observer(AudioTranscript);
