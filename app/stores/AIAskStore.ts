import { action, computed, observable, runInAction } from "mobx";
import { v4 as uuidv4 } from "uuid";
import {
  DateFilter,
  StatusFilter,
  AIAskSearchStrategy,
  AIAskSearchProgress,
} from "@shared/types";
import { CSRF } from "@shared/constants";
import { getCookie } from "tiny-cookie";
import RootStore from "./RootStore";

export type ConversationTurn = {
  id: string;
  question: string;
  answer: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    collectionId: string | null;
  }>;
  followups: string[];
  timestamp: Date;
  searchStrategy?: AIAskSearchStrategy;
  searchComplete?: boolean;
  totalDocuments?: number;
};

export type ErrorType =
  | "network"
  | "no_results"
  | "permission"
  | "llm"
  | "timeout"
  | "unknown";

export type ErrorState = {
  type: ErrorType;
  message: string;
  retryable: boolean;
  suggestions?: string[];
};

export type SearchFilters = {
  collectionId?: string;
  userId?: string;
  documentId?: string;
  dateFilter?: DateFilter;
  statusFilter?: StatusFilter[];
};

export default class AIAskStore {
  @observable
  conversation: ConversationTurn[] = [];

  @observable
  activeDocumentId: string | null = null;

  @observable
  sessionId: string;

  @observable
  isStreaming = false;

  @observable
  currentStreamingAnswer = "";

  @observable
  currentStreamingSources: ConversationTurn["sources"] = [];

  @observable
  currentStreamingQuestion = "";

  @observable
  error: ErrorState | null = null;

  @observable
  isLoadingPhase: "searching" | "generating" | null = null;

  @observable
  startTime: number | null = null;

  @observable
  filters: SearchFilters = {};

  @observable
  searchStrategy: AIAskSearchStrategy | null = null;

  @observable
  searchProgress: Map<string, AIAskSearchProgress> = new Map();

  rootStore: RootStore;

  private abortController: AbortController | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    this.sessionId = uuidv4();
  }

  @computed
  get currentTurn(): ConversationTurn | undefined {
    return this.conversation[this.conversation.length - 1];
  }

  @computed
  get conversationHistory(): Array<{ question: string; answer: string }> {
    // Return last 10 turns for API
    return this.conversation.slice(-10).map((turn) => ({
      question: turn.question,
      answer: turn.answer,
    }));
  }

  @action
  setFilters(filters: SearchFilters) {
    this.filters = filters;
  }

  @action
  setActiveDocument(documentId: string | null) {
    this.activeDocumentId = documentId;
  }

  @action
  clearConversation() {
    this.conversation = [];
    this.sessionId = uuidv4();
    this.activeDocumentId = null;
    this.error = null;
    this.currentStreamingAnswer = "";
    this.currentStreamingSources = [];
    this.currentStreamingQuestion = "";
    this.isLoadingPhase = null;
    this.startTime = null;
    this.searchStrategy = null;
    this.searchProgress.clear();
  }

  @action
  clearError() {
    this.error = null;
  }

  @action
  cancelStreaming() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isStreaming = false;
    this.currentStreamingAnswer = "";
    this.currentStreamingSources = [];
    this.currentStreamingQuestion = "";
    this.isLoadingPhase = null;
    this.startTime = null;
    this.searchStrategy = null;
    this.searchProgress.clear();
  }

  @computed
  get elapsedTime(): number {
    if (!this.startTime) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  @computed
  get showEstimatedTime(): boolean {
    return this.isStreaming && this.elapsedTime > 5000;
  }

  @computed
  get isSearchComplete(): boolean {
    if (!this.searchStrategy) {
      return false;
    }
    // Check if all keywords have completed their search
    const allKeywordsComplete = this.searchStrategy.keywords.every(
      (keyword) => {
        const progress = this.searchProgress.get(keyword);
        return progress && progress.status === "complete";
      }
    );
    return allKeywordsComplete;
  }

  @action
  async submitQuestion(question: string): Promise<void> {
    if (!question.trim() || this.isStreaming) {
      return;
    }

    this.isStreaming = true;
    this.error = null;
    this.currentStreamingAnswer = "";
    this.currentStreamingSources = [];
    this.currentStreamingQuestion = question;
    this.isLoadingPhase = "searching";
    this.startTime = Date.now();
    this.searchStrategy = null;
    this.searchProgress.clear();

    // Create abort controller for this request
    this.abortController = new AbortController();

    // Set up timeout (30 seconds)
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        this.abortController.abort();
        runInAction(() => {
          this.error = {
            type: "timeout",
            message:
              "This is taking longer than expected. Please try a more specific question.",
            retryable: true,
          };
        });
      }
    }, 30000);

    try {
      const { user } = this.rootStore.auth;
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get language from user preferences or browser
      const language = user.language || navigator.language;

      // Get CSRF token for authentication
      const csrfToken = getCookie(CSRF.cookieName);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };

      // Add CSRF token to headers
      if (csrfToken) {
        headers[CSRF.headerName] = csrfToken;
      }

      const response = await fetch("/api/ai.ask", {
        method: "POST",
        headers,
        credentials: "same-origin",
        signal: this.abortController.signal,
        body: JSON.stringify({
          query: question,
          sessionId: this.sessionId,
          conversationHistory: this.conversationHistory,
          language,
          maxDocuments: 5,
          ...this.filters,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle different HTTP error codes
        if (response.status === 403) {
          throw {
            type: "permission",
            message:
              "You don't have permission to access the requested documents.",
            retryable: false,
          };
        } else if (response.status === 429) {
          throw {
            type: "llm",
            message: "Too many requests. Please wait a moment and try again.",
            retryable: true,
          };
        } else if (response.status >= 500) {
          throw {
            type: "llm",
            message:
              "The AI service is temporarily unavailable. Please try again.",
            retryable: true,
          };
        } else {
          throw {
            type: "unknown",
            message: `Request failed with status ${response.status}`,
            retryable: true,
          };
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw {
          type: "network",
          message: "No response body received from server.",
          retryable: true,
        };
      }

      await this.handleStreamEvent(reader, question);
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          // User cancelled, don't set error
          return;
        }

        // Network error
        runInAction(() => {
          this.error = {
            type: "network",
            message:
              "Unable to connect. Please check your connection and try again.",
            retryable: true,
          };
        });
      } else if (
        typeof error === "object" &&
        error !== null &&
        "type" in error
      ) {
        // Structured error from our code
        runInAction(() => {
          this.error = error as ErrorState;
        });
      } else {
        // Unknown error
        runInAction(() => {
          this.error = {
            type: "unknown",
            message: "An unexpected error occurred. Please try again.",
            retryable: true,
          };
        });
      }
    } finally {
      runInAction(() => {
        this.isStreaming = false;
        this.abortController = null;
        this.isLoadingPhase = null;
        this.startTime = null;
      });
    }
  }

  @action
  private async handleStreamEvent(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    question: string
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    let streamingAnswer = "";
    let streamingSources: ConversationTurn["sources"] = [];
    let streamingFollowups: string[] = [];
    let hasReceivedContent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) {
            continue;
          }

          const jsonStr = trimmedLine.slice(6);
          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "search_strategy") {
              // Handle search strategy event
              runInAction(() => {
                this.searchStrategy = {
                  keywords: event.keywords,
                  timestamp: new Date(),
                  usedFallback: event.usedFallback,
                };
              });
            } else if (event.type === "search_progress") {
              // Handle search progress event
              runInAction(() => {
                this.searchProgress.set(event.keyword, {
                  keyword: event.keyword,
                  resultCount: event.resultCount,
                  status: event.status,
                });
              });
            } else if (event.type === "search_complete") {
              // Handle search complete event
              runInAction(() => {
                if (this.currentTurn) {
                  this.currentTurn.searchComplete = true;
                  this.currentTurn.totalDocuments = event.totalDocuments;
                }
              });
            } else if (event.type === "warning") {
              // Handle warning event (non-fatal issues)
              // Warning received but don't stop the stream
              // Could optionally show a toast notification here
              // For now, just log it
            } else if (event.type === "sources") {
              streamingSources = event.sources;
              runInAction(() => {
                this.currentStreamingSources = streamingSources;
                this.isLoadingPhase = "generating";
              });

              // Check if no sources found
              if (streamingSources.length === 0) {
                throw {
                  type: "no_results",
                  message:
                    "I couldn't find any documents related to your question.",
                  retryable: false,
                  suggestions: [
                    "Try using different keywords",
                    "Check if you have access to the relevant documents",
                    "Broaden your search terms",
                  ],
                };
              }
            } else if (event.type === "content") {
              hasReceivedContent = true;
              streamingAnswer += event.content;
              runInAction(() => {
                this.currentStreamingAnswer = streamingAnswer;
              });
            } else if (event.type === "followups") {
              streamingFollowups = event.followups;
            } else if (event.type === "error") {
              // Handle error event from server
              const errorMessage = event.error || "Stream error";
              const errorCode = event.code || "unknown";
              const suggestions = event.suggestions || [];

              if (errorCode === "no_results") {
                throw {
                  type: "no_results",
                  message: errorMessage,
                  retryable: false,
                  suggestions:
                    suggestions.length > 0
                      ? suggestions
                      : [
                          "Try using different keywords",
                          "Check if you have access to the relevant documents",
                          "Broaden your search terms",
                        ],
                };
              } else if (errorCode === "permission_denied") {
                throw {
                  type: "permission",
                  message: errorMessage,
                  retryable: false,
                };
              } else if (errorCode === "llm_error") {
                throw {
                  type: "llm",
                  message: errorMessage,
                  retryable: true,
                };
              } else {
                throw {
                  type: "unknown",
                  message: errorMessage,
                  retryable: true,
                };
              }
            } else if (event.type === "done") {
              // Stream complete, add to conversation
              runInAction(() => {
                this.conversation.push({
                  id: uuidv4(),
                  question,
                  answer: streamingAnswer,
                  sources: streamingSources,
                  followups: streamingFollowups,
                  timestamp: new Date(),
                  searchStrategy: this.searchStrategy || undefined,
                  searchComplete: true,
                  totalDocuments: this.searchStrategy
                    ? Array.from(this.searchProgress.values()).reduce(
                        (sum, p) => sum + p.resultCount,
                        0
                      )
                    : undefined,
                });
                this.currentStreamingAnswer = "";
                this.currentStreamingSources = [];
                this.currentStreamingQuestion = "";
                this.isLoadingPhase = null;
              });
              break;
            }
          } catch (e) {
            if (
              typeof e === "object" &&
              e !== null &&
              "type" in e &&
              "message" in e
            ) {
              throw e;
            }
            // Skip invalid JSON
          }
        }
      }

      // If stream ended without content, treat as no results
      if (!hasReceivedContent && streamingSources.length === 0) {
        throw {
          type: "no_results",
          message: "I couldn't find any documents related to your question.",
          retryable: false,
          suggestions: [
            "Try using different keywords",
            "Check if you have access to the relevant documents",
            "Broaden your search terms",
          ],
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  @action
  submitFollowup(followupQuestion: string) {
    return this.submitQuestion(followupQuestion);
  }
}
