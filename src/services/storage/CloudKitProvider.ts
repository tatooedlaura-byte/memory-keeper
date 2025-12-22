import { registerPlugin } from '@capacitor/core';
import type {
  Memory,
  MemoryInput,
  MediaAttachment,
  SyncResult,
} from '../platform/types';
import type { StorageProvider } from './StorageProvider';
import { StorageError } from './StorageProvider';

// Define the native plugin interface
interface CloudKitPluginInterface {
  initialize(): Promise<{ success: boolean }>;
  saveMemory(options: {
    text: string;
    tags: string[];
    media: string;
  }): Promise<CloudKitRecord>;
  updateMemory(options: {
    id: string;
    text?: string;
    tags?: string[];
    media?: string;
  }): Promise<CloudKitRecord>;
  deleteMemory(options: { id: string }): Promise<{ success: boolean }>;
  fetchMemories(): Promise<{ memories: CloudKitRecord[] }>;
  uploadMedia(options: {
    data: string;
    fileName: string;
    mimeType: string;
  }): Promise<MediaAttachment>;
  deleteMedia(options: { storagePath: string }): Promise<{ success: boolean }>;
}

interface CloudKitRecord {
  id: string;
  cloudRecordId: string;
  text: string;
  tags: string[];
  media: string; // JSON string of MediaAttachment[]
  createdAt: string;
  updatedAt: string;
  cloudModificationDate?: string;
}

// Register the native plugin
const CloudKitNative = registerPlugin<CloudKitPluginInterface>('CloudKit');

/**
 * CloudKit storage provider for iOS/macOS.
 * Uses native CloudKit via Capacitor plugin.
 */
export class CloudKitProvider implements StorageProvider {
  readonly providerType = 'cloudkit' as const;
  readonly supportsRealTimeSync = true;

  private userId: string | null = null;
  private initialized = false;
  private memories: Memory[] = [];
  private changeListeners: Set<(memories: Memory[]) => void> = new Set();

  async initialize(userId: string): Promise<void> {
    if (this.initialized && this.userId === userId) {
      return;
    }

    try {
      await CloudKitNative.initialize();
      this.userId = userId;
      this.initialized = true;

      // Initial fetch
      await this.fetchAndNotify();
    } catch (error) {
      throw new StorageError(
        'Failed to initialize CloudKit',
        'not_initialized',
        error
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StorageError(
        'CloudKit not initialized. Call initialize() first.',
        'not_initialized'
      );
    }
  }

  // MARK: - Memory CRUD

  async createMemory(input: MemoryInput): Promise<Memory> {
    console.log('[CloudKit] createMemory called');
    this.ensureInitialized();

    try {
      // Upload media files first
      const mediaAttachments: MediaAttachment[] = [];
      for (const file of input.mediaFiles) {
        console.log('[CloudKit] Uploading media:', file.name);
        const attachment = await this.uploadMedia(file);
        mediaAttachments.push(attachment);
      }

      // Save memory record
      console.log('[CloudKit] Saving memory to CloudKit...');
      const record = await CloudKitNative.saveMemory({
        text: input.text,
        tags: input.tags,
        media: JSON.stringify(mediaAttachments),
      });
      console.log('[CloudKit] Memory saved, record:', record);

      const memory = this.recordToMemory(record);
      this.memories = [memory, ...this.memories];
      this.notifyListeners();

      return memory;
    } catch (error) {
      console.error('[CloudKit] createMemory failed:', error);
      throw new StorageError(
        'Failed to create memory',
        'unknown',
        error
      );
    }
  }

  async updateMemory(
    memoryId: string,
    updates: Partial<Pick<Memory, 'text' | 'tags'>>,
    newMediaFiles?: File[]
  ): Promise<Memory> {
    this.ensureInitialized();

    try {
      // Get existing memory for media
      const existing = this.memories.find((m) => m.id === memoryId);
      let mediaAttachments = existing?.media || [];

      // Upload new media if provided
      if (newMediaFiles && newMediaFiles.length > 0) {
        for (const file of newMediaFiles) {
          const attachment = await this.uploadMedia(file);
          mediaAttachments.push(attachment);
        }
      }

      const record = await CloudKitNative.updateMemory({
        id: memoryId,
        text: updates.text,
        tags: updates.tags,
        media: JSON.stringify(mediaAttachments),
      });

      const memory = this.recordToMemory(record);

      // Update local cache
      this.memories = this.memories.map((m) =>
        m.id === memoryId ? memory : m
      );
      this.notifyListeners();

      return memory;
    } catch (error) {
      throw new StorageError(
        'Failed to update memory',
        'unknown',
        error
      );
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    this.ensureInitialized();

    try {
      // Delete associated media first
      const memory = this.memories.find((m) => m.id === memoryId);
      if (memory) {
        for (const media of memory.media) {
          await this.deleteMedia(media.id, media.storagePath).catch(() => {
            // Ignore media deletion errors
          });
        }
      }

      await CloudKitNative.deleteMemory({ id: memoryId });

      // Update local cache
      this.memories = this.memories.filter((m) => m.id !== memoryId);
      this.notifyListeners();
    } catch (error) {
      throw new StorageError(
        'Failed to delete memory',
        'unknown',
        error
      );
    }
  }

  async getMemories(): Promise<Memory[]> {
    this.ensureInitialized();
    return this.memories;
  }

  async getMemory(memoryId: string): Promise<Memory | null> {
    this.ensureInitialized();
    return this.memories.find((m) => m.id === memoryId) || null;
  }

  // MARK: - Media Operations

  async uploadMedia(file: File): Promise<MediaAttachment> {
    this.ensureInitialized();

    try {
      // Convert file to base64
      const base64 = await this.fileToBase64(file);

      const result = await CloudKitNative.uploadMedia({
        data: base64,
        fileName: file.name,
        mimeType: file.type,
      });

      return result;
    } catch (error) {
      throw new StorageError(
        'Failed to upload media',
        'unknown',
        error
      );
    }
  }

  async deleteMedia(_mediaId: string, storagePath: string): Promise<void> {
    this.ensureInitialized();

    try {
      await CloudKitNative.deleteMedia({ storagePath });
    } catch (error) {
      throw new StorageError(
        'Failed to delete media',
        'unknown',
        error
      );
    }
  }

  async removeMediaFromMemory(memoryId: string, mediaId: string): Promise<void> {
    this.ensureInitialized();

    const memory = this.memories.find((m) => m.id === memoryId);
    if (!memory) {
      throw new StorageError('Memory not found', 'not_found');
    }

    const mediaToRemove = memory.media.find((m) => m.id === mediaId);
    if (mediaToRemove) {
      await this.deleteMedia(mediaId, mediaToRemove.storagePath).catch(() => {});
    }

    const updatedMedia = memory.media.filter((m) => m.id !== mediaId);

    await CloudKitNative.updateMemory({
      id: memoryId,
      media: JSON.stringify(updatedMedia),
    });

    // Update local cache
    this.memories = this.memories.map((m) =>
      m.id === memoryId ? { ...m, media: updatedMedia } : m
    );
    this.notifyListeners();
  }

  // MARK: - Sync Operations

  subscribeToChanges(callback: (memories: Memory[]) => void): () => void {
    this.changeListeners.add(callback);

    // Immediately call with current data
    callback(this.memories);

    return () => {
      this.changeListeners.delete(callback);
    };
  }

  async fetchChanges(): Promise<Memory[]> {
    return this.fetchAndNotify();
  }

  async forceSync(): Promise<SyncResult> {
    await this.fetchAndNotify();
    return {
      success: true,
      uploaded: 0,
      downloaded: this.memories.length,
      conflicts: [],
      errors: [],
    };
  }

  // MARK: - Private Helpers

  private async fetchAndNotify(): Promise<Memory[]> {
    try {
      const result = await CloudKitNative.fetchMemories();
      this.memories = result.memories.map((r) => this.recordToMemory(r));
      this.notifyListeners();
      return this.memories;
    } catch (error) {
      console.error('Failed to fetch memories:', error);
      return this.memories;
    }
  }

  private notifyListeners(): void {
    this.changeListeners.forEach((callback) => {
      try {
        callback(this.memories);
      } catch (error) {
        console.error('Change listener error:', error);
      }
    });
  }

  private recordToMemory(record: CloudKitRecord): Memory {
    let media: MediaAttachment[] = [];
    try {
      media = JSON.parse(record.media || '[]');
    } catch {
      media = [];
    }

    return {
      id: record.id,
      text: record.text || '',
      tags: record.tags || [],
      media,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      userId: this.userId || '',
    };
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
