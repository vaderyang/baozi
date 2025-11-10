import { client } from "~/utils/ApiClient";

type SpeakerSegment = {
  spk: string | number;
  text: string;
};

const meetingTypePrompts: Record<string, string> = {
  auto: "Analyze the transcript to detect the meeting context and craft the most suitable summary format ",
  general: "Create a comprehensive summary of this meeting transcript ",
  "project-update":
    "Summarize this project update meeting, focusing on progress, change requests, risks/blockers, and next steps ",
  "decision-making":
    "Extract and summarize the key decisions made in this meeting, including rationale ",
  brainstorming:
    "Summarize the brainstorming session, highlighting key ideas and insights ",
  retrospective:
    "Create a retrospective summary covering what went well, what didn't, and action items ",
  interview:
    "Summarize this interview, highlighting key responses and insights ",
  training:
    "Summarize the training session, covering main topics and key takeaways ",
  "client-call":
    "Summarize this client call, focusing on requirements, feedback, opportunities, and outcomes ",
};

const languageInstructions: Record<string, string> = {
  auto: "using the dominant language present by speaker in the transcript (detect automatically)",
  en: "in English",
  zh: "in Chinese (中文)",
  ja: "in Japanese (日本語)",
  ko: "in Korean (한국어)",
  es: "in Spanish",
  fr: "in French",
  de: "in German",
  pt: "in Portuguese",
  ru: "in Russian",
  ar: "in Arabic",
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 5 * 60 * 1000;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type SummaryPromptOptions = {
  meetingType: string;
  summaryLanguage: string;
  customPrompt: string;
  formattedRecordingTime?: string | null;
};

const buildSummaryPrompt = ({
  meetingType,
  summaryLanguage,
  customPrompt,
  formattedRecordingTime,
}: SummaryPromptOptions): string => {
  const basePrompt = meetingTypePrompts[meetingType] ?? meetingTypePrompts.auto;
  const languageInstruction =
    languageInstructions[summaryLanguage] ?? languageInstructions.auto;

  let fullPrompt = `${basePrompt} ${languageInstruction}.`;
  if (customPrompt) {
    fullPrompt += ` ${customPrompt}`;
  }
  if (formattedRecordingTime) {
    fullPrompt += ` The session took place around ${formattedRecordingTime}; reflect this in the subject line.`;
  }
  fullPrompt +=
    " IMPORTANT: Your response MUST follow this exact structure:\n" +
    "1. First line: 'Subject: [A concise meeting title/name within 10 words without the date/time" +
    languageInstruction +
    ' e.g., "Product Roadmap Planning" or "Sprint Retrospective"]\'\n' +
    "2. Second line: 'Topic: [A natural, story-telling style sentence describing the key purpose and outcome of the meeting" +
    languageInstruction +
    ' e.g., "The team discussed the Q4 roadmap and decided to prioritize the mobile app launch over desktop features"]\'\n' +
    "3. Then provide the detailed summary using markdown formatting with headings, bullet points, and emphasis where appropriate.\n" +
    "The Topic line should tell the story of what happened, while the Subject line should be a brief title.";

  return fullPrompt;
};

const buildTranscriptText = (
  transcriptText?: string | null,
  speakerSegments?: SpeakerSegment[] | null
): string => {
  if (transcriptText && transcriptText.trim()) {
    return transcriptText.trim();
  }

  if (speakerSegments && speakerSegments.length > 0) {
    return speakerSegments
      .map((segment) => `Speaker ${segment.spk}: ${segment.text}`)
      .join("\n\n")
      .trim();
  }

  return "";
};

export type TranscriptSummaryResult = {
  summary: string;
  jobId: string;
};

export type TranscriptSummaryOptions = {
  documentId: string;
  transcriptText?: string | null;
  speakerSegments?: SpeakerSegment[] | null;
  meetingType?: string;
  summaryLanguage?: string;
  customPrompt?: string;
  insertPosition?: string;
  formattedRecordingTime?: string | null;
};

export const generateTranscriptSummary = async (
  options: TranscriptSummaryOptions
): Promise<TranscriptSummaryResult> => {
  const {
    documentId,
    transcriptText,
    speakerSegments,
    meetingType = "auto",
    summaryLanguage = "auto",
    customPrompt = "",
    insertPosition = "summary_tab",
    formattedRecordingTime,
  } = options;

  const context = buildTranscriptText(transcriptText, speakerSegments);
  if (!context) {
    throw new Error("Transcript text is required for summary generation");
  }

  const prompt = buildSummaryPrompt({
    meetingType,
    summaryLanguage,
    customPrompt,
    formattedRecordingTime,
  });

  const queueResult = await client.post<{
    data?: { jobId?: string; status?: string };
  }>("/ai.queueSummary", {
    prompt,
    context,
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
    throw new Error("Failed to queue summary generation");
  }

  const summary = await pollSummaryJob(jobId);
  return { summary, jobId };
};

const pollSummaryJob = async (jobId: string): Promise<string> => {
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > MAX_POLL_MS) {
      throw new Error("Summary generation timed out");
    }

    const statusResult = await client.post<{
      data?: {
        status?: string;
        result?: string | null;
        error?: string | null;
      };
    }>("/ai.summaryStatus", {
      jobId,
    });

    const status = statusResult.data?.status;
    const error = statusResult.data?.error;
    const result = statusResult.data?.result;

    if (status === "completed") {
      return (result ?? "").trim();
    }

    if (status === "failed") {
      throw new Error(error || "Summary generation failed");
    }

    if (status === "queued" || status === "processing") {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    throw new Error(`Unknown job status: ${status}`);
  }
};
