import { v4 as uuidv4 } from 'uuid';
import type {
  Memory,
  MemoryInput,
  MediaAttachment,
  SyncResult,
} from '../platform/types';
import type { StorageProvider } from './StorageProvider';
import { StorageError } from './StorageProvider';

const MEMORIES_FILE_NAME = 'memories.json';
const MEDIA_FOLDER_NAME = 'media';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface MemoriesData {
  version: number;
  lastModified: string;
  memories: Memory[];
}

/**
 * Google Drive storage provider for Android/Web.
 * Stores data in user's own Google Drive (appDataFolder).
 */
export class GoogleDriveProvider implements StorageProvider {
  readonly providerType = 'googledrive' as const;
  readonly supportsRealTimeSync = false;

  private userId: string | null = null;
  private initialized = false;
  private accessToken: string | null = null;
  private memories: Memory[] = [];
  private memoriesFileId: string | null = null;
  private mediaFolderId: string | null = null;
  private changeListeners: Set<(memories: Memory[]) => void> = new Set();

  private readonly API_BASE = 'https://www.googleapis.com/drive/v3';
  private readonly UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

  async initialize(userId: string): Promise<void> {
    if (this.initialized && this.userId === userId) {
      return;
    }

    // Get access token from GoogleAuthProvider
    const token = await this.getAccessToken();
    if (!token) {
      throw new StorageError(
        'Not authenticated with Google',
        'not_authenticated'
      );
    }

    this.accessToken = token;
    this.userId = userId;

    // Ensure media folder exists
    await this.ensureMediaFolder();

    // Load existing memories
    await this.loadMemories();

    this.initialized = true;
  }

  private async getAccessToken(): Promise<string | null> {
    // Import dynamically to avoid circular dependency
    const { GoogleAuthProvider } = await import('../auth/GoogleAuthProvider');
    const provider = new GoogleAuthProvider();
    return provider.getAccessToken();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StorageError(
        'Google Drive not initialized. Call initialize() first.',
        'not_initialized'
      );
    }
  }

  // MARK: - Drive API Helpers

  private async apiRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const response = await fetch(`${this.API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Drive API error: ${response.status} - ${error}`);
    }

    return response;
  }

  private async findFile(name: string, parentId?: string): Promise<DriveFile | null> {
    let query = `name='${name}' and trashed=false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    } else {
      query += ` and 'appDataFolder' in parents`;
    }

    const response = await this.apiRequest(
      `/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)`
    );

    const data = await response.json();
    return data.files?.[0] || null;
  }

  private async createFolder(name: string): Promise<string> {
    const metadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['appDataFolder'],
    };

    const response = await this.apiRequest('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });

    const data = await response.json();
    return data.id;
  }

  private async ensureMediaFolder(): Promise<void> {
    const folder = await this.findFile(MEDIA_FOLDER_NAME);
    if (folder) {
      this.mediaFolderId = folder.id;
    } else {
      this.mediaFolderId = await this.createFolder(MEDIA_FOLDER_NAME);
    }
  }

  // MARK: - Memories File Operations

  private async loadMemories(): Promise<void> {
    const file = await this.findFile(MEMORIES_FILE_NAME);

    if (!file) {
      // No memories file yet, start fresh
      this.memories = [];
      return;
    }

    this.memoriesFileId = file.id;

    // Download file content
    const response = await this.apiRequest(
      `/files/${file.id}?alt=media`
    );

    const data: MemoriesData = await response.json();
    this.memories = data.memories.map((m) => ({
      ...m,
      createdAt: new Date(m.createdAt),
      updatedAt: new Date(m.updatedAt),
    }));
  }

  private async saveMemories(): Promise<void> {
    const data: MemoriesData = {
      version: 1,
      lastModified: new Date().toISOString(),
      memories: this.memories,
    };

    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: 'application/json' });

    if (this.memoriesFileId) {
      // Update existing file
      await fetch(
        `${this.UPLOAD_BASE}/files/${this.memoriesFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: blob,
        }
      );
    } else {
      // Create new file
      const metadata = {
        name: MEMORIES_FILE_NAME,
        parents: ['appDataFolder'],
      };

      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      form.append('file', blob);

      const response = await fetch(
        `${this.UPLOAD_BASE}/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: form,
        }
      );

      const result = await response.json();
      this.memoriesFileId = result.id;
    }
  }

  // MARK: - Memory CRUD

  async createMemory(input: MemoryInput): Promise<Memory> {
    this.ensureInitialized();

    try {
      // Upload media files first
      const mediaAttachments: MediaAttachment[] = [];
      for (const file of input.mediaFiles) {
        const attachment = await this.uploadMedia(file);
        mediaAttachments.push(attachment);
      }

      const now = new Date();
      const memory: Memory = {
        id: uuidv4(),
        text: input.text,
        tags: input.tags,
        media: mediaAttachments,
        createdAt: now,
        updatedAt: now,
        userId: this.userId || '',
      };

      this.memories = [memory, ...this.memories];
      await this.saveMemories();
      this.notifyListeners();

      return memory;
    } catch (error) {
      throw new StorageError('Failed to create memory', 'unknown', error);
    }
  }

  async updateMemory(
    memoryId: string,
    updates: Partial<Pick<Memory, 'text' | 'tags'>>,
    newMediaFiles?: File[]
  ): Promise<Memory> {
    this.ensureInitialized();

    try {
      const index = this.memories.findIndex((m) => m.id === memoryId);
      if (index === -1) {
        throw new StorageError('Memory not found', 'not_found');
      }

      const existing = this.memories[index];
      let mediaAttachments = [...existing.media];

      // Upload new media if provided
      if (newMediaFiles && newMediaFiles.length > 0) {
        for (const file of newMediaFiles) {
          const attachment = await this.uploadMedia(file);
          mediaAttachments.push(attachment);
        }
      }

      const updated: Memory = {
        ...existing,
        ...updates,
        media: mediaAttachments,
        updatedAt: new Date(),
      };

      this.memories[index] = updated;
      await this.saveMemories();
      this.notifyListeners();

      return updated;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('Failed to update memory', 'unknown', error);
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    this.ensureInitialized();

    try {
      const memory = this.memories.find((m) => m.id === memoryId);
      if (memory) {
        // Delete associated media
        for (const media of memory.media) {
          await this.deleteMedia(media.id, media.storagePath).catch(() => {});
        }
      }

      this.memories = this.memories.filter((m) => m.id !== memoryId);
      await this.saveMemories();
      this.notifyListeners();
    } catch (error) {
      throw new StorageError('Failed to delete memory', 'unknown', error);
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
      const fileId = uuidv4();
      const extension = file.name.split('.').pop() || '';
      const fileName = `${fileId}.${extension}`;

      // Determine media type
      let mediaType: 'image' | 'audio' | 'video' = 'image';
      if (file.type.startsWith('audio/')) mediaType = 'audio';
      else if (file.type.startsWith('video/')) mediaType = 'video';

      // Upload to media folder
      const metadata = {
        name: fileName,
        parents: [this.mediaFolderId],
      };

      const form = new FormData();
      form.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      form.append('file', file);

      const response = await fetch(
        `${this.UPLOAD_BASE}/files?uploadType=multipart&fields=id,webContentLink`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: form,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to upload file');
      }

      const result = await response.json();

      return {
        id: fileId,
        type: mediaType,
        url: `https://www.googleapis.com/drive/v3/files/${result.id}?alt=media`,
        fileName: file.name,
        storagePath: result.id, // Use Drive file ID as storage path
      };
    } catch (error) {
      throw new StorageError('Failed to upload media', 'unknown', error);
    }
  }

  async deleteMedia(_mediaId: string, storagePath: string): Promise<void> {
    this.ensureInitialized();

    try {
      // storagePath is the Drive file ID
      await this.apiRequest(`/files/${storagePath}`, {
        method: 'DELETE',
      });
    } catch (error) {
      // Ignore errors (file might not exist)
      console.warn('Failed to delete media:', error);
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
    const index = this.memories.findIndex((m) => m.id === memoryId);
    this.memories[index] = {
      ...memory,
      media: updatedMedia,
      updatedAt: new Date(),
    };

    await this.saveMemories();
    this.notifyListeners();
  }

  // MARK: - Sync Operations

  subscribeToChanges(callback: (memories: Memory[]) => void): () => void {
    this.changeListeners.add(callback);
    callback(this.memories);

    return () => {
      this.changeListeners.delete(callback);
    };
  }

  async fetchChanges(): Promise<Memory[]> {
    this.ensureInitialized();

    try {
      await this.loadMemories();
      this.notifyListeners();
      return this.memories;
    } catch (error) {
      console.error('Failed to fetch changes:', error);
      return this.memories;
    }
  }

  async forceSync(): Promise<SyncResult> {
    await this.fetchChanges();
    return {
      success: true,
      uploaded: 0,
      downloaded: this.memories.length,
      conflicts: [],
      errors: [],
    };
  }

  // MARK: - Helpers

  private notifyListeners(): void {
    this.changeListeners.forEach((callback) => {
      try {
        callback(this.memories);
      } catch (error) {
        console.error('Change listener error:', error);
      }
    });
  }

  /**
   * Get a download URL for a media file.
   * Requires the access token to be passed as a header.
   */
  getAuthenticatedMediaUrl(storagePath: string): {
    url: string;
    headers: Record<string, string>;
  } {
    return {
      url: `https://www.googleapis.com/drive/v3/files/${storagePath}?alt=media`,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    };
  }
}
