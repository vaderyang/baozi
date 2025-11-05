import { action, computed, observable, runInAction } from "mobx";
import { v4 as uuidv4 } from "uuid";
import { DateFilter, StatusFilter } from "@shared/types";
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
  error: string | null = null;

  @observable
  filters: SearchFilters = {};

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

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      const { user } = this.rootStore.auth;
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get language from user preferences or browser
      const language = user.language || navigator.language;

      const response = await fetch("/api/ai.ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
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

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      await this.handleStreamEvent(reader, question);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          // User cancelled, don't set error
          return;
        }
        runInAction(() => {
          this.error =
            error.message || "Failed to get AI answer. Please try again.";
        });
      }
    } finally {
      runInAction(() => {
        this.isStreaming = false;
        this.abortController = null;
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

            if (event.type === "sources") {
              streamingSources = event.sources;
              runInAction(() => {
                this.currentStreamingSources = streamingSources;
              });
            } else if (event.type === "content") {
              streamingAnswer += event.content;
              runInAction(() => {
                this.currentStreamingAnswer = streamingAnswer;
              });
            } else if (event.type === "followups") {
              streamingFollowups = event.followups;
            } else if (event.type === "error") {
              throw new Error(event.error || "Stream error");
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
                });
                this.currentStreamingAnswer = "";
                this.currentStreamingSources = [];
              });
              break;
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes("Stream error")) {
              throw e;
            }
            // Skip invalid JSON
          }
        }
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
