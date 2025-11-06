import { action, computed } from "mobx";
import Document from "~/models/Document";
import type RootStore from "./RootStore";

export interface FilterOptions {
  search?: string;
  status?: "all" | "transcribing" | "ready";
  sort?: "newest" | "oldest" | "longest" | "shortest";
}

/**
 * AudioInboxStore manages audio documents in Drafts.
 * Audio recordings are created as drafts before being archived to their final location.
 */
class AudioInboxStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
  }

  /**
   * Ensures drafts are loaded. Audio recordings use the Drafts collection.
   * This is called automatically when needed.
   */
  @action
  ensureInboxExists = async (): Promise<void> => {
    // Audio recordings use Drafts, so just ensure drafts are fetched
    await this.rootStore.documents.fetchDrafts();
  };

  /**
   * Get audio documents in Drafts with optional filtering and sorting.
   *
   * @param options Filter and sort options
   * @returns Array of audio documents in Drafts
   */
  @action
  getInboxDocuments = async (options?: FilterOptions): Promise<Document[]> => {
    await this.ensureInboxExists();

    // Get all draft documents that have audio metadata (indicating they're audio recordings)
    let documents = this.rootStore.documents
      .drafts()
      .filter(
        (doc: Document) =>
          !doc.isDeleted && !doc.isArchived && doc.audioMetadata
      );

    // Apply search filter
    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      documents = documents.filter(
        (doc: Document) =>
          doc.title.toLowerCase().includes(searchLower) ||
          doc
            .getSummary()
            .content?.some((block: unknown) =>
              JSON.stringify(block).toLowerCase().includes(searchLower)
            )
      );
    }

    // Apply status filter
    if (options?.status && options.status !== "all") {
      if (options.status === "transcribing") {
        // Filter for documents that are currently being transcribed
        // This would require checking transcription job status
        // Placeholder - will be implemented with transcription jobs
        documents = documents.filter(() => false);
      } else if (options.status === "ready") {
        // Filter for documents ready to archive (transcription complete)
        // Placeholder - will be implemented with transcription jobs
        documents = documents.filter(() => true);
      }
    }

    // Apply sorting
    if (options?.sort) {
      switch (options.sort) {
        case "newest":
          documents.sort(
            (a: Document, b: Document) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          break;
        case "oldest":
          documents.sort(
            (a: Document, b: Document) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          break;
        case "longest":
        case "shortest":
          // Duration sorting would require audio metadata
          // For now, fall back to newest
          documents.sort(
            (a: Document, b: Document) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          break;
        default:
          // Default to newest first
          documents.sort(
            (a: Document, b: Document) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      }
    } else {
      // Default to newest first (reverse chronological)
      documents.sort(
        (a: Document, b: Document) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return documents;
  };

  /**
   * Move a document from the Audio Inbox to a target collection or as a child of another document.
   *
   * @param documentId The ID of the document to move
   * @param targetId The ID of the target collection or document
   * @param targetType Whether the target is a collection or document
   */
  @action
  moveDocumentFromInbox = async (
    documentId: string,
    targetId: string,
    targetType: "collection" | "document"
  ): Promise<void> => {
    const document = this.rootStore.documents.get(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    if (targetType === "collection") {
      // Move to collection
      await document.move({
        collectionId: targetId,
        parentDocumentId: undefined,
      });
    } else {
      // Move as child of document
      const targetDocument = this.rootStore.documents.get(targetId);
      if (!targetDocument) {
        throw new Error("Target document not found");
      }

      await document.move({
        collectionId: targetDocument.collectionId,
        parentDocumentId: targetId,
      });
    }
  };

  /**
   * Returns the count of unarchived audio documents in Drafts.
   */
  @computed
  get unarchivedCount(): number {
    return this.rootStore.documents
      .drafts()
      .filter(
        (doc: Document) =>
          !doc.isDeleted && !doc.isArchived && doc.audioMetadata
      ).length;
  }

  /**
   * Returns the most recent audio documents in Drafts (up to 5).
   */
  @computed
  get recentDocuments(): Document[] {
    const documents = this.rootStore.documents
      .drafts()
      .filter(
        (doc: Document) =>
          !doc.isDeleted && !doc.isArchived && doc.audioMetadata
      )
      .sort(
        (a: Document, b: Document) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return documents.slice(0, 5);
  }
}

export default AudioInboxStore;
