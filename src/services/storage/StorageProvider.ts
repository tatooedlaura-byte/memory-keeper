import type {
  Memory,
  MemoryInput,
  MediaAttachment,
  StorageProviderType,
  SyncResult,
} from '../platform/types';

/**
 * Abstract interface for storage providers.
 * Implementations: CloudKitProvider, GoogleDriveProvider, FirebaseStorageProvider
 */
export interface StorageProvider {
  /**
   * The type of storage provider
   */
  readonly providerType: StorageProviderType;

  /**
   * Whether this provider supports real-time sync (push notifications).
   * If false, use polling via fetchChanges().
   */
  readonly supportsRealTimeSync: boolean;

  /**
   * Initialize the storage provider for a user.
   * Must be called before any other operations.
   */
  initialize(userId: string): Promise<void>;

  // --- Memory CRUD Operations ---

  /**
   * Create a new memory.
   * Handles media upload internally.
   */
  createMemory(input: MemoryInput): Promise<Memory>;

  /**
   * Update an existing memory.
   * Can optionally add new media files.
   */
  updateMemory(
    memoryId: string,
    updates: Partial<Pick<Memory, 'text' | 'tags'>>,
    newMediaFiles?: File[]
  ): Promise<Memory>;

  /**
   * Delete a memory and its associated media.
   */
  deleteMemory(memoryId: string): Promise<void>;

  /**
   * Get all memories for the current user.
   */
  getMemories(): Promise<Memory[]>;

  /**
   * Get a single memory by ID.
   */
  getMemory(memoryId: string): Promise<Memory | null>;

  // --- Media Operations ---

  /**
   * Upload a media file and return the attachment info.
   */
  uploadMedia(file: File): Promise<MediaAttachment>;

  /**
   * Delete a media file.
   */
  deleteMedia(mediaId: string, storagePath: string): Promise<void>;

  /**
   * Remove a specific media attachment from a memory.
   */
  removeMediaFromMemory(memoryId: string, mediaId: string): Promise<void>;

  // --- Sync Operations ---

  /**
   * Subscribe to real-time changes (if supported).
   * Returns an unsubscribe function.
   * Only available if supportsRealTimeSync is true.
   */
  subscribeToChanges?(
    callback: (memories: Memory[]) => void
  ): () => void;

  /**
   * Fetch changes since last sync (for polling-based sync).
   * Use this when supportsRealTimeSync is false.
   */
  fetchChanges?(): Promise<Memory[]>;

  /**
   * Force a full sync with the cloud.
   */
  forceSync?(): Promise<SyncResult>;

  // --- Offline Support ---

  /**
   * Check if there are pending changes to sync.
   */
  hasPendingChanges?(): Promise<boolean>;

  /**
   * Get the number of pending changes.
   */
  getPendingChangesCount?(): Promise<number>;
}

/**
 * Error thrown when storage operations fail.
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export type StorageErrorCode =
  | 'not_initialized'
  | 'not_authenticated'
  | 'not_found'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'network_error'
  | 'sync_conflict'
  | 'unknown';
