import { LightningIcon, TrashIcon, ShapesIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { ComponentProps } from "../types";
import { NodeSelection } from "prosemirror-state";
import type { TranscriptSegment } from "../nodes/MeetingAICard";

type MeetingAICardProps = ComponentProps;

type TabType = "transcript" | "summary";

export default function MeetingAICard({
  node,
  isSelected,
  isEditable,
  theme,
  getPos,
  view,
  contentDOM,
  pasteParser,
}: MeetingAICardProps) {
  const [isHover, setIsHover] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabType>("summary");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showLangMenu, setShowLangMenu] = React.useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = React.useState(false);
  const [audioLevel, setAudioLevel] = React.useState(0);

  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);

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

  // Mount ProseMirror's contentDOM when available (and keep it mounted)
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
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Start audio level monitoring (RMS of time domain for more natural levels)
      const timeData = new Uint8Array(analyser.fftSize);
      const levelRef = { current: 0 };
      const GAIN = 3.0; // makeup gain to better match system indicator
      const SMOOTH = 0.6; // EMA smoothing
      audioLevelIntervalRef.current = window.setInterval(() => {
        const a = analyserRef.current;
        if (!a) {return;}
        a.getByteTimeDomainData(timeData);
        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128; // -1..1
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        const level = Math.min(1, rms * GAIN);
        const smooth = SMOOTH * levelRef.current + (1 - SMOOTH) * level;
        levelRef.current = smooth;
        setAudioLevel(smooth);
      }, 80);

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

      // Attempt to connect real WebSocket and stream PCM16 audio
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${protocol}//${window.location.host}/meeting-ai`
        );
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        // Helper to convert Float32 [-1,1] to 16-bit PCM little-endian
        const floatTo16BitPCM = (input: Float32Array) => {
          const output = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          return output;
        };

        let processor: ScriptProcessorNode | null = null;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "start" }));

          // Begin capturing and streaming audio frames
          if (audioContextRef.current && mediaStreamRef.current) {
            const sourceNode = audioContextRef.current.createMediaStreamSource(
              mediaStreamRef.current
            );
            processor = audioContextRef.current.createScriptProcessor(
              4096,
              1,
              1
            );
            processor.onaudioprocess = (e) => {
              const channelData = e.inputBuffer.getChannelData(0);
              const pcm = floatTo16BitPCM(channelData);
              try {
                if (
                  wsRef.current &&
                  wsRef.current.readyState === WebSocket.OPEN
                ) {
                  // Send as binary frame
                  wsRef.current.send(pcm.buffer);
                }
              } catch (_sendErr) {
                // Swallow send errors and rely on onerror to fallback
              }
            };
            // Keep the processor active
            sourceNode.connect(processor);
            processor.connect(audioContextRef.current.destination);
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            switch (message.type) {
              case "partial-transcript":
              case "final-transcript": {
                appendTranscriptSegments(
                  message.segments as TranscriptSegment[]
                );
                break;
              }
              case "error":
                setError(message.message || "WebSocket error occurred");
                break;
              case "stopped":
                break;
            }
          } catch (_e) {
            // Ignore non-JSON frames (binary audio echoes won't be sent from server)
          }
        };

        ws.onerror = () => {
          // Cleanup processor if created
          try {
            processor?.disconnect();
          } catch (_err) {
            /* ignore disconnect error */
          }
          processor = null;
          startMockStreaming();
        };
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
    // Stop any periodic timers
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
      try {
        wsRef.current.send(JSON.stringify({ type: "stop" }));
      } catch (_err) {
        /* ignore send on close */
      }
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
      try {
        void audioContextRef.current.close();
      } catch (_err) {
        /* ignore close error */
      }
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

      // Compose transcript as plain text
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

      // Build an instruction prompt for the summary subject and structure
      const { summaryLanguage, summaryTemplate } = getCurrentAttrs();
      const langPart =
        summaryLanguage && summaryLanguage !== "auto"
          ? `Write in ${summaryLanguage} language.`
          : "";
      const templatePart =
        summaryTemplate && summaryTemplate !== "auto"
          ? `Use the ${summaryTemplate} meeting style.`
          : "";

      const prompt = `You are a meeting assistant. Create a clear, concise meeting summary in Markdown.
- The first line must be a single H1 Subject that best captures the meeting topic.
- Then include sections with headings such as: Highlights, Decisions, Action Items (with assignees and due dates), Risks, and Next Steps. Use lists where appropriate.
- Be concise and avoid repetition. ${langPart} ${templatePart}

The following is the meeting transcript:`;

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
        body: JSON.stringify({ transcript: transcriptText, prompt }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate summary: ${response.statusText}`);
      }

      const data = await response.json();
      const summaryMd = data.data?.summary || "";

      if (!summaryMd) {
        throw new Error("No summary returned from API");
      }

      // Prepare parsed nodes for summary
      const pos = getPos();
      const { tr } = view.state;

      const nodes: unknown[] = [];
      const nodesSchema = view.state.schema.nodes as Record<string, unknown>;
      const paragraph = nodesSchema.paragraph as unknown as {
        create: (attrs: unknown, content?: unknown) => unknown;
      };

      // Parse markdown into nodes if a pasteParser is available; fallback to paragraphs
      let parsedNodes: unknown[] = [];
      if (
        pasteParser &&
        typeof (pasteParser as unknown as { parse: (s: string) => unknown })
          .parse === "function"
      ) {
        try {
          const parser = pasteParser as unknown as {
            parse: (s: string) => { content: { content: unknown[] } };
          };
          const parsed = parser.parse(summaryMd);
          parsedNodes = parsed.content.content;
        } catch (_e) {
          parsedNodes = [];
        }
      }

      if (parsedNodes.length === 0) {
        const blocks = summaryMd
          .split(/\n\n+/)
          .map((b) => b.trim())
          .filter(Boolean);
        for (const b of blocks) {
          nodes.push(
            paragraph.create(null, view.state.schema.text(b)) as unknown
          );
        }
      } else {
        nodes.push(...parsedNodes);
      }

      // Replace entire content with new parsed summary (no Notes)
      const startContent = pos + 1;
      const endContent = pos + node.nodeSize - 1;
      const transaction = tr
        .replaceWith(startContent, endContent, nodes)
        .setNodeMarkup(pos, undefined, {
          ...getCurrentAttrs(),
          generated: true,
        })
        .setMeta("addToHistory", true);

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
    // Do not select when clicking any interactive elements or editor content
    const targetEl = ev.target as HTMLElement;
    if (
      targetEl.closest("[data-prosemirror-content]") ||
      targetEl.closest("[data-stop-prosemirror]")
    ) {
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

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const inMenu = !!target.closest("[data-meeting-ai-menu]");
      const inButton = !!target.closest("[data-meeting-ai-menu-button]");
      if (!inMenu && !inButton) {
        setMenuOpen(false);
        setShowLangMenu(false);
        setShowTemplateMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Helpers to show current selections in labels
  const langMap: Record<string, string> = {
    auto: "Auto",
    en: "English",
    zh: "Chinese",
    ar: "Arabic",
    fr: "French",
    es: "Spanish",
    de: "German",
    ja: "Japanese",
  };
  const templateMap: Record<string, string> = {
    auto: "Auto",
    general: "General",
    "1on1": "1:1",
    sales: "Sales",
  };
  const currentLangLabel =
    langMap[getCurrentAttrs().summaryLanguage || "auto"] || "Auto";
  const currentTemplateLabel =
    templateMap[getCurrentAttrs().summaryTemplate || "auto"] || "Auto";

  // Show editor content only in Summary tab
  React.useEffect(() => {
    if (!contentRef.current) {
      return;
    }
    const root = contentRef.current;
    const pmRoot = (root.firstElementChild as HTMLElement) || root;
    const blocks = Array.from(pmRoot.children).filter(
      (el) => el.nodeType === 1
    ) as HTMLElement[];
    const visible = activeTab === "summary";
    blocks.forEach((el) => (el.style.display = visible ? "" : "none"));
  }, [activeTab]);

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
                        height: `${Math.min(1, Math.max(0, audioLevel)) * 100}%`,
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
                <NeutralButton
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleGenerateSummary}
                  title="Generate summary"
                  data-stop-prosemirror
                >
                  <ShapesIcon />
                  <span style={{ marginLeft: 6 }}>Generate Summary</span>
                </NeutralButton>
                <IconButton
                  ref={menuButtonRef}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setMenuOpen((v) => !v)}
                  title="Summary settings"
                  data-stop-prosemirror
                  data-meeting-ai-menu-button
                >
                  ⋯
                </IconButton>
                {menuOpen && (
                  <MenuPopover
                    ref={menuRef}
                    data-meeting-ai-menu
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <MenuGroup>
                      <MenuRow
                        onClick={() => {
                          setShowLangMenu(!showLangMenu);
                          setShowTemplateMenu(false);
                        }}
                      >
                        <MenuIcon>A</MenuIcon>
                        <MenuText>{`Language (${currentLangLabel})`}</MenuText>
                        <MenuArrow>›</MenuArrow>
                      </MenuRow>
                      {showLangMenu && (
                        <Submenu>
                          {[
                            { val: "auto", label: "Auto" },
                            { val: "en", label: "English" },
                            { val: "zh", label: "Chinese" },
                            { val: "ar", label: "Arabic" },
                            { val: "fr", label: "French" },
                            { val: "es", label: "Spanish" },
                            { val: "de", label: "German" },
                            { val: "ja", label: "Japanese" },
                          ].map((opt) => (
                            <MenuRow
                              key={opt.val}
                              onClick={() => {
                                const pos = getPos();
                                const { tr } = view.state;
                                const current = getCurrentAttrs();
                                view.dispatch(
                                  tr.setNodeMarkup(pos, undefined, {
                                    ...current,
                                    summaryLanguage: opt.val,
                                  })
                                );
                                setShowLangMenu(false);
                                setMenuOpen(true);
                              }}
                            >
                              <MenuCheck>
                                {getCurrentAttrs().summaryLanguage === opt.val
                                  ? "✓"
                                  : ""}
                              </MenuCheck>
                              <MenuText>{opt.label}</MenuText>
                            </MenuRow>
                          ))}
                        </Submenu>
                      )}
                    </MenuGroup>

                    <MenuGroup>
                      <MenuRow
                        onClick={() => {
                          setShowTemplateMenu(!showTemplateMenu);
                          setShowLangMenu(false);
                        }}
                      >
                        <MenuIcon>
                          <ShapesIcon />
                        </MenuIcon>
                        <MenuText>{`Template (${currentTemplateLabel})`}</MenuText>
                        <MenuArrow>›</MenuArrow>
                      </MenuRow>
                      {showTemplateMenu && (
                        <Submenu>
                          {[
                            { val: "auto", label: "Auto" },
                            { val: "general", label: "General" },
                            { val: "1on1", label: "1:1" },
                            { val: "sales", label: "Sales" },
                          ].map((opt) => (
                            <MenuRow
                              key={opt.val}
                              onClick={() => {
                                const pos = getPos();
                                const { tr } = view.state;
                                const current = getCurrentAttrs();
                                view.dispatch(
                                  tr.setNodeMarkup(pos, undefined, {
                                    ...current,
                                    summaryTemplate: opt.val,
                                  })
                                );
                                setShowTemplateMenu(false);
                                setMenuOpen(true);
                              }}
                            >
                              <MenuCheck>
                                {getCurrentAttrs().summaryTemplate === opt.val
                                  ? "✓"
                                  : ""}
                              </MenuCheck>
                              <MenuText>{opt.label}</MenuText>
                            </MenuRow>
                          ))}
                        </Submenu>
                      )}
                    </MenuGroup>

                    <MenuDivider />

                    <MenuRow
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
                      <MenuIcon>⧉</MenuIcon>
                      <MenuText>Copy Transcript</MenuText>
                    </MenuRow>

                    <MenuRow
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
                      <MenuIcon>⤶</MenuIcon>
                      <MenuText>Paste Transcript</MenuText>
                    </MenuRow>

                    <MenuRow
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
                      <MenuIcon>⌫</MenuIcon>
                      <MenuText>Clear Transcript</MenuText>
                    </MenuRow>
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
          data-stop-prosemirror
          onMouseDown={(e) => e.preventDefault()}
          active={activeTab === "transcript"}
          onClick={() => setActiveTab("transcript")}
        >
          Transcript
        </Tab>
        <Tab
          data-stop-prosemirror
          onMouseDown={(e) => e.preventDefault()}
          active={activeTab === "summary"}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </Tab>
      </TabBar>

      <TabContent>
        {activeTab === "transcript" && (
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
        <ContentSection
          ref={contentRef}
          data-prosemirror-content
          style={{ display: activeTab === "summary" ? "block" : "none" }}
        />
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
  overflow: visible;

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

const NeutralButton = styled(ActionButton)`
  background: ${(props) => props.theme.background};
  border: 1px solid ${(props) => props.theme.divider};
  color: ${(props) => props.theme.text};

  &:hover:not(:disabled) {
    background: ${(props) => props.theme.secondaryBackground};
  }
`;

const AudioLevelIndicator = styled.div`
  width: 10px;
  height: 36px;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 3px;
  overflow: hidden;
  position: relative;
  background: ${(props) => props.theme.secondaryBackground};
`;

const AudioLevelBar = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: #00c853; /* fixed vivid green */
  transition: height 0.08s ease;
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
  z-index: 2000;
`;

const MenuGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  position: relative;
`;

const MenuDivider = styled.div`
  height: 1px;
  background: ${(props) => props.theme.divider};
  margin: 8px 0;
`;

const MenuRow = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: ${(props) => props.theme.text};
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;

  &:hover {
    background: ${(props) => props.theme.secondaryBackground};
  }
`;

const MenuIcon = styled.span`
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const MenuText = styled.span`
  flex: 1;
`;

const MenuArrow = styled.span`
  color: ${(props) => props.theme.textSecondary};
  margin-right: 10px;
`;

const MenuCheck = styled.span`
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const Submenu = styled.div`
  position: absolute;
  top: 0;
  left: 100%;
  min-width: 200px;
  background: ${(props) => props.theme.menuBackground};
  color: ${(props) => props.theme.text};
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 6px;
  box-shadow: ${(props) => props.theme.menuShadow};
  padding: 6px;
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
  min-height: 20px;
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
