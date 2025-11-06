/**
 * Audio Recovery System using IndexedDB
 *
 * This module provides functionality to save audio chunks during recording
 * and recover them in case of browser crash or unexpected closure.
 */

const DB_NAME = "outline-audio-recovery";
const STORE_NAME = "recording-chunks";
const DB_VERSION = 1;
const CHUNK_RETENTION_DAYS = 7;

export interface RecordingChunk {
  sessionId: string;
  documentId: string;
  chunkIndex: number;
  blob: Blob;
  timestamp: number;
  duration: number; // Cumulative duration at this chunk
}

export interface RecoverySession {
  sessionId: string;
  documentId: string;
  chunks: RecordingChunk[];
  totalDuration: number;
  lastSaved: number;
}

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, {
          keyPath: ["sessionId", "chunkIndex"],
        });

        // Create indexes for efficient querying
        objectStore.createIndex("sessionId", "sessionId", { unique: false });
        objectStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

/**
 * Save an audio chunk to IndexedDB
 */
export async function saveChunk(chunk: RecordingChunk): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(chunk);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error("Failed to save chunk"));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Get all chunks for a specific session
 */
export async function getSessionChunks(
  sessionId: string
): Promise<RecordingChunk[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      const chunks = request.result as RecordingChunk[];
      // Sort by chunk index
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      resolve(chunks);
    };

    request.onerror = () => {
      reject(new Error("Failed to retrieve chunks"));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Get all incomplete recording sessions
 */
export async function getIncompleteSessions(): Promise<RecoverySession[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const allChunks = request.result as RecordingChunk[];

      // Group chunks by session
      const sessionMap = new Map<string, RecordingChunk[]>();
      for (const chunk of allChunks) {
        if (!sessionMap.has(chunk.sessionId)) {
          sessionMap.set(chunk.sessionId, []);
        }
        sessionMap.get(chunk.sessionId)!.push(chunk);
      }

      // Convert to RecoverySession objects
      const sessions: RecoverySession[] = [];
      for (const [sessionId, chunks] of sessionMap.entries()) {
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        const lastChunk = chunks[chunks.length - 1];

        sessions.push({
          sessionId,
          documentId: chunks[0].documentId,
          chunks,
          totalDuration: lastChunk.duration,
          lastSaved: lastChunk.timestamp,
        });
      }

      resolve(sessions);
    };

    request.onerror = () => {
      reject(new Error("Failed to retrieve sessions"));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Delete all chunks for a specific session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.openCursor(sessionId);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    request.onerror = () => {
      reject(new Error("Failed to delete session"));
    };

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Reconstruct audio blob from chunks
 */
export async function reconstructAudio(
  sessionId: string
): Promise<{ blob: Blob; duration: number }> {
  const chunks = await getSessionChunks(sessionId);

  if (chunks.length === 0) {
    throw new Error("No chunks found for session");
  }

  // Combine all blobs
  const blobs = chunks.map((chunk) => chunk.blob);
  const combinedBlob = new Blob(blobs, {
    type: chunks[0].blob.type || "audio/webm",
  });

  const lastChunk = chunks[chunks.length - 1];

  return {
    blob: combinedBlob,
    duration: lastChunk.duration,
  };
}

/**
 * Clean up old chunks (older than CHUNK_RETENTION_DAYS)
 */
export async function cleanupOldChunks(): Promise<number> {
  const db = await openDatabase();
  const cutoffTime = Date.now() - CHUNK_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

    let deletedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };

    request.onerror = () => {
      reject(new Error("Failed to cleanup old chunks"));
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(deletedCount);
    };
  });
}

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== "undefined";
}
