import { LightningIcon, TrashIcon, ShapesIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { ComponentProps } from "../types";
import type { TranscriptSegment } from "../nodes/MeetingAICard";

type MeetingAICardProps = ComponentProps;

type TabType = "notes" | "transcript";

export default function MeetingAICard({
  node,
  isSelected,
  isEditable,
  theme,
  getPos,
  view,
  contentDOM,
}: MeetingAICardProps) {
  const [isHover, setIsHover] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabType>("notes");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [audioLevel, setAudioLevel] = React.useState(0);

  const contentRef = React.useRef<HTMLDivElement>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioLevelIntervalRef = React.useRef<number | null>(null);

  const transcript: TranscriptSegment[] = node.attrs.transcript || [];
  const isListening = node.attrs.listening || false;
  const hasGenerated = node.attrs.generated || false;

  // Mount ProseMirror's contentDOM when available
  React.useEffect(() => {
    if (!contentRef.current || !contentDOM) {
      return;
    }
    if (contentDOM.parentElement !== contentRef.current) {
      contentRef.current.appendChild(contentDOM);
    }
  }, [contentDOM]);

  // Cleanup on unmount
  React.useEffect(
    () => () => {
      if (audioLevelIntervalRef.current) {
        window.clearInterval(audioLevelIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    },
    []
  );

  const handleStartListening = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = stream;

      // Set up Web Audio for level meter
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(analyser);

      // Start audio level monitoring
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      audioLevelIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average =
            dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          setAudioLevel(average / 255); // Normalize to 0-1
        }
      }, 100);

      // Update node attrs to listening state
      const pos = getPos();
      const { tr } = view.state;
      const transaction = tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        listening: true,
        startedAt: Date.now(),
      });
      view.dispatch(transaction);

      setIsLoading(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to access microphone. Please check permissions."
      );
      setIsLoading(false);
    }
  };

  const handleStopListening = () => {
    // Stop all audio streams
    if (audioLevelIntervalRef.current) {
      window.clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setAudioLevel(0);

    // Update node attrs to stopped state
    const pos = getPos();
    const { tr } = view.state;
    const transaction = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      listening: false,
    });
    view.dispatch(transaction);
  };

  const handleMark = () => {
    // Get current timestamp relative to recording start
    const now = Date.now();
    const startedAt = node.attrs.startedAt || now;
    const elapsedMs = now - startedAt;

    // Extract transcript segments from 3s before to 7s after
    const windowStart = Math.max(0, elapsedMs - 3000);
    const windowEnd = elapsedMs + 7000;

    const contextSegments = transcript.filter(
      (seg) => seg.endMs >= windowStart && seg.startMs <= windowEnd
    );

    // Format time as HH:MM:SS
    const formatTime = (ms: number) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const mm = String(minutes % 60).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      const hh = String(hours).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    };

    const timeStr = formatTime(elapsedMs);

    let markText: string;
    if (contextSegments.length > 0) {
      const contextText = contextSegments.map((seg) => seg.text).join(" ");
      markText = `[${timeStr}] marked '${contextText}'\n\n`;
    } else {
      markText = `[${timeStr}] marked\n\n`;
    }

    // Append to Notes content (inside the card's contentDOM)
    const pos = getPos();
    const { tr } = view.state;

    // Create a paragraph with the mark text
    const paragraph = view.state.schema.nodes.paragraph.create(
      null,
      view.state.schema.text(markText)
    );

    // Insert at the end of the card's content
    const endPos = pos + node.nodeSize - 1;
    const transaction = tr.insert(endPos, paragraph);
    view.dispatch(transaction);
  };

  const handleGenerateSummary = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Format transcript as plain text
      const transcriptText = transcript
        .map((seg) => {
          const time = new Date(seg.startMs).toISOString().substr(11, 8);
          return `[${time}] ${seg.speaker}:\n${seg.text}\n\n`;
        })
        .join("");

      if (!transcriptText.trim()) {
        setError("No transcript available to summarize");
        setIsLoading(false);
        return;
      }

      // Get CSRF token from cookie
      const csrfToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("csrfToken="))
        ?.split("=")[1];

      const response = await fetch("/api/ai.meetingSummary", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ transcript: transcriptText }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate summary: ${response.statusText}`);
      }

      const data = await response.json();
      const summary = data.data?.summary || "";

      if (!summary) {
        throw new Error("No summary returned from API");
      }

      // Insert summary into Notes content
      const pos = getPos();
      const { tr } = view.state;

      // Create paragraphs for the summary
      const summaryHeader = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text("## Meeting Summary\n\n")
      );
      const summaryParagraph = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text(summary + "\n\n")
      );

      const endPos = pos + node.nodeSize - 1;
      const transaction = tr
        .insert(endPos, [summaryHeader, summaryParagraph])
        .setNodeMarkup(pos, undefined, {
          ...node.attrs,
          generated: true,
        });

      view.dispatch(transaction);
      setIsLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate summary"
      );
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    const { state, dispatch } = view;
    const pos = getPos();
    const tr = state.tr
      .delete(pos, pos + node.nodeSize)
      .setMeta("addToHistory", true);
    dispatch(tr);
  };

  const handleSelectNode: React.MouseEventHandler<HTMLDivElement> = (ev) => {
    // Only select when clicking the card chrome, not the inner editor content
    const inContent = (ev.target as HTMLElement)?.closest(
      "[data-prosemirror-content]"
    );
    if (inContent) {
      return;
    }
    const { state, dispatch } = view;
    const $pos = state.doc.resolve(getPos());
    // @ts-expect-error NodeSelection is available at runtime
    const { NodeSelection } = require("prosemirror-state");
    const tr = state.tr.setSelection(new NodeSelection($pos));
    dispatch(tr);
  };

  const showBorder = isHover || isSelected || isListening;

  const formatTranscript = () =>
    transcript
      .map((seg) => {
        const time = new Date(seg.startMs).toISOString().substr(11, 8);
        return `[${time}] ${seg.speaker}:\n${seg.text}\n\n`;
      })
      .join("");

  return (
    <Wrapper
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onMouseDown={handleSelectNode}
      data-stop-prosemirror
      showBorder={showBorder}
      theme={theme}
    >
      {isEditable && (
        <>
          <ButtonGroup>
            {(isHover || isSelected) && (
              <IconButton
                type="button"
                onClick={handleDelete}
                title="Delete this card"
                data-stop-prosemirror
              >
                <TrashIcon />
              </IconButton>
            )}
            {isListening ? (
              <ActionButton
                type="button"
                onClick={handleStopListening}
                data-stop-prosemirror
              >
                Stop listening
              </ActionButton>
            ) : (
              <ActionButton
                type="button"
                onClick={handleStartListening}
                disabled={isLoading}
                data-stop-prosemirror
              >
                <LightningIcon size={16} />
                {isLoading ? "Starting..." : "Start listening"}
              </ActionButton>
            )}
            {isListening && (
              <>
                <AudioLevelIndicator level={audioLevel} />
                <IconButton
                  type="button"
                  onClick={handleMark}
                  title="Mark this moment"
                  data-stop-prosemirror
                >
                  📌
                </IconButton>
              </>
            )}
            {!isListening && transcript.length > 0 && (
              <IconButton
                type="button"
                onClick={handleGenerateSummary}
                disabled={isLoading || hasGenerated}
                title="Generate summary"
                data-stop-prosemirror
              >
                <ShapesIcon />
              </IconButton>
            )}
          </ButtonGroup>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </>
      )}

      <TabBar>
        <Tab
          active={activeTab === "notes"}
          onClick={() => setActiveTab("notes")}
        >
          Notes
        </Tab>
        <Tab
          active={activeTab === "transcript"}
          onClick={() => setActiveTab("transcript")}
        >
          Transcript
        </Tab>
      </TabBar>

      <TabContent>
        {activeTab === "notes" ? (
          <ContentSection ref={contentRef} data-prosemirror-content>
            {/* ProseMirror contentDOM will be mounted here */}
          </ContentSection>
        ) : (
          <TranscriptSection>
            {transcript.length > 0 ? (
              <TranscriptText>{formatTranscript()}</TranscriptText>
            ) : (
              <EmptyState>
                {isListening
                  ? "Listening... Transcript will appear here."
                  : "No transcript yet. Start listening to record."}
              </EmptyState>
            )}
          </TranscriptSection>
        )}
      </TabContent>
    </Wrapper>
  );
}

const Wrapper = styled.div<{ showBorder: boolean }>`
  position: relative;
  padding: 16px;
  margin: 8px 0;
  border-radius: 8px;
  transition: all 0.2s ease;
  overflow: hidden;

  ${(props) =>
    props.showBorder &&
    `
    border: 1px solid ${props.theme.divider};
    box-shadow: 0 0 0 2px ${props.theme.primary}15;
  `}
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) => props.theme.background};
  border-radius: 4px;
  cursor: pointer;
  color: ${(props) => props.theme.textSecondary};
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: ${(props) => props.theme.secondaryBackground};
    color: ${(props) => props.theme.text};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #001f3f;
  background: #001f3f;
  color: ${(props) => props.theme.white};
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const AudioLevelIndicator = styled.div<{ level: number }>`
  width: 60px;
  height: 24px;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  background: ${(props) => props.theme.secondaryBackground};

  &::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: ${(props) => props.level * 100}%;
    background: linear-gradient(
      90deg,
      #4caf50 0%,
      #8bc34a 50%,
      #ff9800 75%,
      #f44336 100%
    );
    transition: width 0.1s ease;
  }
`;

const ErrorMessage = styled.div`
  margin-top: 8px;
  padding: 8px 12px;
  background: ${(props) => props.theme.danger}15;
  color: ${(props) => props.theme.danger};
  border-radius: 4px;
  font-size: 13px;
`;

const TabBar = styled.div`
  display: flex;
  gap: 4px;
  border-bottom: 1px solid ${(props) => props.theme.divider};
  margin-bottom: 12px;
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${(props) => (props.active ? props.theme.primary : "transparent")};
  color: ${(props) =>
    props.active ? props.theme.primary : props.theme.textSecondary};
  font-size: 14px;
  font-weight: ${(props) => (props.active ? "600" : "400")};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: ${(props) => props.theme.text};
  }
`;

const TabContent = styled.div`
  min-height: 100px;
`;

const ContentSection = styled.div`
  /* ProseMirror content will be rendered here */
  min-height: 80px;
`;

const TranscriptSection = styled.div`
  padding: 12px;
  background: ${(props) => props.theme.secondaryBackground};
  border-radius: 4px;
  min-height: 80px;
  max-height: 400px;
  overflow-y: auto;
`;

const TranscriptText = styled.pre`
  font-family: ${(props) => props.theme.fontFamilyMono};
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  color: ${(props) => props.theme.text};
`;

const EmptyState = styled.div`
  text-align: center;
  color: ${(props) => props.theme.textTertiary};
  font-size: 14px;
  padding: 20px;
`;
