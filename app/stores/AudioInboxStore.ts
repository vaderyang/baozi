import { action, computed, observable, runInAction } from "mobx";
import Collection from "~/models/Collection";
import Document from "~/models/Document";
import type RootStore from "./RootStore";

export interface FilterOptions {
  search?: string;
  status?: "all" | "transcribing" | "ready";
  sort?: "newest" | "oldest" | "longest" | "shortest";
}

/**
 * AudioInboxStore manages the Audio Inbox collection - a special private collection
 * where all new audio recordings are created before being archived to their final location.
 */
class AudioInboxStore {
  @observable
  inboxCollection: Collection | null = null;

  @observable
  isInitializing = false;

  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
  }

  /**
   * Ensures the Audio Inbox collection exists, creating it if necessary.
   * This is called automatically when needed.
   *
   * @returns The Audio Inbox collection
   */
  @action
  ensureInboxExists = async (): Promise<Collection> => {
    // If we already have the inbox collection loaded, return it
    if (this.inboxCollection) {
      return this.inboxCollection;
    }

    // Check if inbox already exists in the collections store
    const existingInbox = this.rootStore.collections.orderedData.find(
      (collection) =>
        collection.name === "Audio Inbox" || collection.icon === "inbox"
    );

    if (existingInbox) {
      runInAction(() => {
        this.inboxCollection = existingInbox;
      });
      return existingInbox;
    }

    // Create new Audio Inbox collection
    if (this.isInitializing) {
      // Wait for existing initialization to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isInitializing && this.inboxCollection) {
            clearInterval(checkInterval);
            resolve(this.inboxCollection);
          }
        }, 100);
      });
    }

    try {
      runInAction(() => {
        this.isInitializing = true;
      });

      const collection = await this.rootStore.collections.create({
        name: "Audio Inbox",
        icon: "inbox",
        permission: undefined, // undefined means private
        sharing: false,
      });

      runInAction(() => {
        this.inboxCollection = collection;
        this.isInitializing = false;
      });

      return collection;
    } catch (error) {
      runInAction(() => {
        this.isInitializing = false;
      });
      throw error;
    }
  };

  /**
   * Get documents in the Audio Inbox with optional filtering and sorting.
   *
   * @param options Filter and sort options
   * @returns Array of documents in the Audio Inbox
   */
  @action
  getInboxDocuments = async (options?: FilterOptions): Promise<Document[]> => {
    const inbox = await this.ensureInboxExists();

    // Get all documents in the inbox collection
    let documents = this.rootStore.documents
      .inCollection(inbox.id)
      .filter((doc) => !doc.isDeleted && !doc.isArchived);

    // Apply search filter
    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      documents = documents.filter(
        (doc) =>
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
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          break;
        case "oldest":
          documents.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          break;
        case "longest":
        case "shortest":
          // Duration sorting would require audio metadata
          // For now, fall back to newest
          documents.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          break;
        default:
          // Default to newest first
          documents.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      }
    } else {
      // Default to newest first (reverse chronological)
      documents.sort(
        (a, b) =>
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
   * Returns the count of unarchived documents in the Audio Inbox.
   */
  @computed
  get unarchivedCount(): number {
    if (!this.inboxCollection) {
      return 0;
    }

    return this.rootStore.documents
      .inCollection(this.inboxCollection.id)
      .filter((doc) => !doc.isDeleted && !doc.isArchived).length;
  }

  /**
   * Returns the most recent documents in the Audio Inbox (up to 5).
   */
  @computed
  get recentDocuments(): Document[] {
    if (!this.inboxCollection) {
      return [];
    }

    const documents = this.rootStore.documents
      .inCollection(this.inboxCollection.id)
      .filter((doc) => !doc.isDeleted && !doc.isArchived)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return documents.slice(0, 5);
  }
}

export default AudioInboxStore;
