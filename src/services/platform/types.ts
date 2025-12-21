import type { Memory, MediaAttachment, MemoryInput } from '../../types/Memory';

// Re-export base types for convenience
export type { Memory, MediaAttachment, MemoryInput };

// Auth provider types
export type AuthProviderType = 'apple';

// User identity abstraction (works across all auth providers)
export interface AuthUser {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  provider: AuthProviderType;
}

// Storage provider types
export type StorageProviderType = 'cloudkit';

// Sync status for a memory
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

// Extended memory with cloud-specific metadata
export interface CloudMemory extends Memory {
  cloudRecordId?: string;        // CloudKit record ID or Drive file ID
  cloudModificationDate?: Date;  // For conflict detection
  syncStatus: SyncStatus;
  localOnly?: boolean;           // True if not yet uploaded
}

// Extended media attachment with cloud-specific data
export interface CloudMediaAttachment extends MediaAttachment {
  cloudFileId?: string;          // Drive file ID or CloudKit asset ID
  localPath?: string;            // Local cached file path
  uploadPending?: boolean;       // True if upload in progress
}

// Pending change for offline support
export interface PendingChange {
  id: string;
  type: 'create' | 'update' | 'delete';
  memoryId: string;
  data?: Partial<Memory>;
  mediaFiles?: string[];         // Local paths to upload
  timestamp: Date;
}

// Sync result
export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: Array<{
    local: Memory;
    remote: Memory;
  }>;
  errors: string[];
}

