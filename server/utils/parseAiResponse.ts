export type ChatCompletionChoice = {
  text?: string;
  message?: {
    content?: unknown;
  };
};

const extractSegmentText = (segment: unknown): string => {
  if (segment === null || segment === undefined) {
    return "";
  }

  if (typeof segment === "string") {
    return segment;
  }

  const segmentObj = segment as Record<string, unknown>;
  const directText = segmentObj.text ?? segmentObj.content;
  if (typeof directText === "string") {
    return directText;
  }

  if (
    directText &&
    typeof directText === "object" &&
    typeof (directText as Record<string, unknown>).value === "string"
  ) {
    return (directText as Record<string, unknown>).value as string;
  }

  return "";
};

export const parseAiResponse = (
  choice?: ChatCompletionChoice | null
): string => {
  if (!choice) {
    return "";
  }

  const messageContent = choice.message?.content;

  if (Array.isArray(messageContent)) {
    return messageContent.map(extractSegmentText).join("");
  }

  if (typeof messageContent === "string") {
    return messageContent;
  }

  if (typeof choice.text === "string") {
    return choice.text;
  }

  return "";
};

export default parseAiResponse;
