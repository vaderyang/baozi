import { LightningIcon, TrashIcon, ShapesIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { ComponentProps } from "../types";
import { NodeSelection } from "prosemirror-state";
import type { TranscriptSegment } from "../nodes/MeetingAICard";

type MeetingAICardProps = ComponentProps;

type TabType = "notes" | "transcript" | "summary";

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
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [audioLevel, setAudioLevel] = React.useState(0);

  const contentRef = React.useRef<HTMLDivElement>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioLevelIntervalRef = React.useRef<number | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const audioChunkIntervalRef = React.useRef<number | null>(null);
  const mockIntervalRef = React.useRef<number | null>(null);

  const transcript: TranscriptSegment[] = node.attrs.transcript || [];
  const isListening = node.attrs.listening || false;

  // Mount ProseMirror's contentDOM when available
  React.useEffect(() => {
    if (!contentRef.current || !contentDOM) {
      return;
    }
    if (contentDOM.parentElement !== contentRef.current) {
      contentRef.current.appendChild(contentDOM);
    }
  }, [contentDOM]);

  // Helper: get current node attrs from state to avoid stale props
  const getCurrentAttrs = () => {
    const pos = getPos();
    const nodeAtPos = view.state.doc.nodeAt(pos);
    // Fallback to props if not found (shouldn't happen in normal flow)
    return (nodeAtPos?.attrs as unknown) || node.attrs;
  };

  // Helper: append transcript segments while preserving other attrs
  const appendTranscriptSegments = (segments: TranscriptSegment[]) => {
    const pos = getPos();
    const { tr } = view.state;
    const currentAttrs = getCurrentAttrs();
    const currentTranscript: TranscriptSegment[] =
      currentAttrs.transcript || [];
    const newSegments = [...currentTranscript, ...segments];
    const transaction = tr.setNodeMarkup(pos, undefined, {
      ...currentAttrs,
      transcript: newSegments,
    });
    view.dispatch(transaction);
  };

  // Cleanup on unmount
  React.useEffect(
    () => () => {
      if (audioLevelIntervalRef.current) {
        window.clearInterval(audioLevelIntervalRef.current);
      }
      if (audioChunkIntervalRef.current) {
        window.clearInterval(audioChunkIntervalRef.current);
      }
      if (mockIntervalRef.current) {
        window.clearInterval(mockIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    },
    []
  );

  const handleStartListening = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Decide whether to use mock mode via query param
      const params = new URLSearchParams(window.location.search);
      const forceMock = params.get("mockMeetingAI") === "1";

      // Request microphone permission regardless (to drive the level meter UI)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          setAudioLevel(average / 255);
        }
      }, 100);

      // Update node attrs to listening state
      const startedAt = Date.now();
      {
        const pos = getPos();
        const { tr } = view.state;
        const currentAttrs = getCurrentAttrs();
        const transaction = tr.setNodeMarkup(pos, undefined, {
          ...currentAttrs,
          listening: true,
          startedAt,
        });
        view.dispatch(transaction);
      }

      // Mock streaming fallback (either forced or on ws failure)
      const startMockStreaming = () => {
        const script: { speaker: string; text: string; dur: number }[] = [
          { speaker: "Speaker 1", text: "Welcome to the meeting!", dur: 2500 },
          { speaker: "Speaker 2", text: "Great to be here.", dur: 1800 },
          {
            speaker: "Speaker 1",
            text: "Let's begin with updates.",
            dur: 2200,
          },
          { speaker: "Speaker 2", text: "Shipping is on track.", dur: 2000 },
          { speaker: "Speaker 1", text: "Any blockers?", dur: 1600 },
          {
            speaker: "Speaker 2",
            text: "No blockers from my side.",
            dur: 2200,
          },
        ];
        let idx = 0;
        let lastEnd = 0;
        mockIntervalRef.current = window.setInterval(() => {
          const nowElapsed = Date.now() - startedAt;
          const line = script[idx % script.length];
          const start = Math.max(lastEnd, nowElapsed);
          const end = start + line.dur;
          lastEnd = end;
          const seg = [
            {
              startMs: start,
              endMs: end,
              speaker: line.speaker,
              text: line.text,
            },
          ];

          // Stop mock streaming if listening turned off externally
          const currentAttrs = getCurrentAttrs();
          if (!currentAttrs.listening) {
            if (mockIntervalRef.current) {
              window.clearInterval(mockIntervalRef.current);
              mockIntervalRef.current = null;
            }
            return;
          }

          appendTranscriptSegments(seg);
          idx++;
        }, 1000);
      };

      if (forceMock) {
        startMockStreaming();
        setIsLoading(false);
        return;
      }

      // Attempt to connect real WebSocket
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${protocol}//${window.location.host}/meeting-ai`
        );
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "start" }));
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case "partial-transcript":
            case "final-transcript": {
              appendTranscriptSegments(message.segments as TranscriptSegment[]);
              break;
            }
            case "error":
              setError(message.message || "WebSocket error occurred");
              break;
            case "stopped":
              break;
          }
        };

        ws.onerror = () => {
          startMockStreaming();
        };

        audioChunkIntervalRef.current = window.setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const elapsedMs = Date.now() - startedAt;
            wsRef.current.send(
              JSON.stringify({
                type: "audio-chunk",
                data: new ArrayBuffer(512),
                timestampMs: elapsedMs,
              })
            );
          }
        }, 200);
      } catch {
        startMockStreaming();
      }

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
    // Stop audio chunk streaming
    if (audioChunkIntervalRef.current) {
      window.clearInterval(audioChunkIntervalRef.current);
      audioChunkIntervalRef.current = null;
    }

    // Stop mock streaming if active
    if (mockIntervalRef.current) {
      window.clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }

    // Send stop message to WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
      wsRef.current.close();
      wsRef.current = null;
    }

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
    const currentAttrs = getCurrentAttrs();
    const transaction = tr.setNodeMarkup(pos, undefined, {
      ...currentAttrs,
      listening: false,
    });
    view.dispatch(transaction);
  };

  const handleMark = () => {
    // Get current timestamp relative to recording start
    const now = Date.now();
    const startedAt = node.attrs.startedAt || now;
    const elapsedMs = now - startedAt;

    // Extract transcript segments from 3s before to 7s after current time
    const windowStart = Math.max(0, elapsedMs - 3000);
    const windowEnd = elapsedMs + 7000;

    const transcriptList: TranscriptSegment[] = node.attrs.transcript || [];
    const contextSegments = transcriptList.filter(
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
    if (isLoading) {
      return;
    }
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

      // Insert summary into Notes content, and persist summary in attrs
      const pos = getPos();
      const { tr } = view.state;

      // Create paragraphs for the summary (keep original Notes behavior)
      const summaryHeader = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text("## Meeting Summary\n\n")
      );
      const summaryParagraph = view.state.schema.nodes.paragraph.create(
        null,
        view.state.schema.text(summary + "\n\n")
      );

      const endPos = pos + node.nodeSize - 1;
      const currentAttrs = getCurrentAttrs();
      const transaction = tr
        .insert(endPos, [summaryHeader, summaryParagraph])
        .setNodeMarkup(pos, undefined, {
          ...currentAttrs,
          generated: true,
          summary,
        });

      view.dispatch(transaction);
      setActiveTab("summary");
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
          <TopControls>
            <LeftControls>
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
                  <AudioLevelIndicator>
                    <AudioLevelBar
                      style={{
                        width: `${Math.min(1, Math.max(0, audioLevel)) * 100}%`,
                      }}
                    />
                  </AudioLevelIndicator>
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
              <SummaryActions>
                <IconButton
                  type="button"
                  onClick={handleGenerateSummary}
                  title="Generate summary"
                  data-stop-prosemirror
                >
                  <ShapesIcon />
                </IconButton>
                <IconButton
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  title="Summary settings"
                  data-stop-prosemirror
                >
                  ⋯
                </IconButton>
                {menuOpen && (
                  <MenuPopover onMouseDown={(e) => e.stopPropagation()}>
                    <MenuGroup>
                      <MenuLabel>Language</MenuLabel>
                      <Select
                        value={getCurrentAttrs().summaryLanguage || "auto"}
                        onChange={(e) => {
                          const pos = getPos();
                          const { tr } = view.state;
                          const current = getCurrentAttrs();
                          view.dispatch(
                            tr.setNodeMarkup(pos, undefined, {
                              ...current,
                              summaryLanguage: e.target.value,
                            })
                          );
                        }}
                      >
                        <option value="auto">Auto</option>
                        <option value="en">English</option>
                        <option value="zh">Chinese</option>
                        <option value="ar">Arabic</option>
                        <option value="fr">French</option>
                        <option value="es">Spanish</option>
                        <option value="de">German</option>
                        <option value="ja">Japanese</option>
                      </Select>
                    </MenuGroup>
                    <MenuGroup>
                      <MenuLabel>Meeting Template</MenuLabel>
                      <Select
                        value={getCurrentAttrs().summaryTemplate || "auto"}
                        onChange={(e) => {
                          const pos = getPos();
                          const { tr } = view.state;
                          const current = getCurrentAttrs();
                          view.dispatch(
                            tr.setNodeMarkup(pos, undefined, {
                              ...current,
                              summaryTemplate: e.target.value,
                            })
                          );
                        }}
                      >
                        <option value="auto">Auto</option>
                        <option value="general">General Meeting</option>
                        <option value="1on1">1:1 Meeting</option>
                        <option value="sales">Sales Call</option>
                      </Select>
                    </MenuGroup>
                    <MenuDivider />
                    <MenuItem
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            formatTranscript()
                          );
                        } catch (_e) {
                          setError("Failed to copy transcript");
                        } finally {
                          setMenuOpen(false);
                        }
                      }}
                    >
                      Copy Transcript
                    </MenuItem>
                    <MenuItem
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          const seg: TranscriptSegment = {
                            startMs: 0,
                            endMs: 0,
                            speaker: "Speaker 1",
                            text,
                          };
                          appendTranscriptSegments([seg]);
                        } catch (_e) {
                          setError("Failed to paste transcript");
                        } finally {
                          setMenuOpen(false);
                        }
                      }}
                    >
                      Paste Transcript
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        const pos = getPos();
                        const { tr } = view.state;
                        const current = getCurrentAttrs();
                        view.dispatch(
                          tr.setNodeMarkup(pos, undefined, {
                            ...current,
                            transcript: [],
                          })
                        );
                        setMenuOpen(false);
                      }}
                    >
                      Clear Transcript
                    </MenuItem>
                  </MenuPopover>
                )}
              </SummaryActions>
            </LeftControls>
            <RightControls>
              <IconButton
                type="button"
                onClick={handleDelete}
                title="Delete this card"
                data-stop-prosemirror
              >
                <TrashIcon />
              </IconButton>
            </RightControls>
          </TopControls>

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
        <Tab
          active={activeTab === "summary"}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </Tab>
      </TabBar>

      <TabContent>
        {activeTab === "notes" ? (
          <ContentSection ref={contentRef} data-prosemirror-content>
            {/* ProseMirror contentDOM will be mounted here */}
          </ContentSection>
        ) : activeTab === "transcript" ? (
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
        ) : (
          <TranscriptSection>
            {getCurrentAttrs().summary ? (
              <TranscriptText>{getCurrentAttrs().summary}</TranscriptText>
            ) : (
              <EmptyState>
                Summary will appear here after generation.
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

const TopControls = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const LeftControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RightControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SummaryActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
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

const AudioLevelIndicator = styled.div`
  width: 60px;
  height: 24px;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  background: ${(props) => props.theme.secondaryBackground};
`;

const AudioLevelBar = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    #4caf50 0%,
    #8bc34a 50%,
    #ff9800 75%,
    #f44336 100%
  );
  transition: width 0.1s ease;
`;

const MenuPopover = styled.div`
  position: absolute;
  top: 36px;
  right: 0;
  min-width: 220px;
  background: ${(props) => props.theme.menuBackground};
  color: ${(props) => props.theme.text};
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 6px;
  box-shadow: ${(props) => props.theme.menuShadow};
  padding: 8px;
  z-index: 10;
`;

const MenuGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
`;

const MenuLabel = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.textSecondary};
`;

const Select = styled.select`
  padding: 6px 8px;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 4px;
  background: ${(props) => props.theme.background};
  color: ${(props) => props.theme.text};
`;

const MenuDivider = styled.div`
  height: 1px;
  background: ${(props) => props.theme.divider};
  margin: 8px 0;
`;

const MenuItem = styled.button`
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: ${(props) => props.theme.text};
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.secondaryBackground};
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
