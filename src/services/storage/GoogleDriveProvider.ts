import { v4 as uuidv4 } from 'uuid';
import type {
  Memory,
  MemoryInput,
  MediaAttachment,
  SyncResult,
} from '../platform/types';
import type { StorageProvider } from './StorageProvider';
import { StorageError } from './StorageProvider';
import { getGoogleAuthProvider } from '../auth/GoogleAuthProvider';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const MEMORIES_FILE_NAME = 'memories.json';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * Google Drive storage provider.
 * Stores memories in the app's private appDataFolder.
 */
export class GoogleDriveProvider implements StorageProvider {
  readonly providerType = 'googledrive' as const;
  readonly supportsRealTimeSync = false; // Drive doesn't have push notifications

  private userId: string | null = null;
  private initialized = false;
  private memories: Memory[] = [];
  private memoriesFileId: string | null = null;
  private changeListeners: Set<(memories: Memory[]) => void> = new Set();

  private async getAccessToken(): Promise<string> {
    // Try to get token, refreshing if needed
    let token = getGoogleAuthProvider().getAccessToken();
    if (!token) {
      console.log('[GoogleDrive] No token, trying to refresh...');
      token = await getGoogleAuthProvider().refreshAccessToken();
    }
    if (!token) {
      console.error('[GoogleDrive] No access token available');
      throw new StorageError(
        'Not authenticated with Google',
        'not_authenticated'
      );
    }
    return token;
  }

  async initialize(userId: string): Promise<void> {
    if (this.initialized && this.userId === userId) {
      return;
    }

    try {
      console.log('[GoogleDrive] Initializing for user:', userId);
      this.userId = userId;

      const token = await this.getAccessToken();
      console.log('[GoogleDrive] Got access token:', token ? 'yes' : 'no');

      // Find or create the memories.json file
      console.log('[GoogleDrive] Finding or creating memories file...');
      await this.findOrCreateMemoriesFile();
      console.log('[GoogleDrive] Memories file ID:', this.memoriesFileId);

      // Load existing memories
      console.log('[GoogleDrive] Loading memories...');
      await this.loadMemories();
      console.log('[GoogleDrive] Loaded', this.memories.length, 'memories');

      this.initialized = true;
      console.log('[GoogleDrive] Initialization complete');
    } catch (error) {
      console.error('[GoogleDrive] Initialization failed:', error);
      throw new StorageError(
        'Failed to initialize Google Drive storage',
        'not_initialized',
        error
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StorageError(
        'Google Drive not initialized. Call initialize() first.',
        'not_initialized'
      );
    }
  }

  private async findOrCreateMemoriesFile(): Promise<void> {
    const token = await this.getAccessToken();

    // Search for existing memories file
    const searchUrl = new URL(`${DRIVE_API_BASE}/files`);
    searchUrl.searchParams.set('spaces', 'appDataFolder');
    searchUrl.searchParams.set('q', `name='${MEMORIES_FILE_NAME}'`);
    searchUrl.searchParams.set('fields', 'files(id,name)');

    const searchResponse = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!searchResponse.ok) {
      throw new Error('Failed to search for memories file');
    }

    const searchResult: DriveFileList = await searchResponse.json();

    if (searchResult.files.length > 0) {
      this.memoriesFileId = searchResult.files[0].id;
    } else {
      // Create new memories file
      const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: MEMORIES_FILE_NAME,
          parents: ['appDataFolder'],
          mimeType: 'application/json',
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create memories file');
      }

      const newFile: DriveFile = await createResponse.json();
      this.memoriesFileId = newFile.id;

      // Initialize with empty array
      await this.saveMemories();
    }
  }

  private async loadMemories(): Promise<void> {
    if (!this.memoriesFileId) return;

    const token = await this.getAccessToken();
    const url = `${DRIVE_API_BASE}/files/${this.memoriesFileId}?alt=media`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 404) {
        this.memories = [];
        return;
      }
      throw new Error('Failed to load memories');
    }

    const text = await response.text();
    if (!text.trim()) {
      this.memories = [];
      return;
    }

    try {
      const data = JSON.parse(text);
      this.memories = (data.memories || []).map((m: Memory) => ({
        ...m,
        createdAt: new Date(m.createdAt),
        updatedAt: new Date(m.updatedAt),
      }));
    } catch {
      this.memories = [];
    }
  }

  private async saveMemories(): Promise<void> {
    if (!this.memoriesFileId) return;

    const token = await this.getAccessToken();
    const url = `${DRIVE_UPLOAD_BASE}/files/${this.memoriesFileId}?uploadType=media`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ memories: this.memories }),
    });

    if (!response.ok) {
      throw new Error('Failed to save memories');
    }
  }

  // MARK: - Memory CRUD

  async createMemory(input: MemoryInput): Promise<Memory> {
    console.log('[GoogleDrive] createMemory called');
    this.ensureInitialized();

    try {
      // Upload media files first
      const mediaAttachments: MediaAttachment[] = [];
      for (const file of input.mediaFiles) {
        console.log('[GoogleDrive] Uploading media:', file.name);
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

      console.log('[GoogleDrive] Saving memory to Drive...');
      this.memories = [memory, ...this.memories];
      await this.saveMemories();
      console.log('[GoogleDrive] Memory saved successfully');
      this.notifyListeners();

      return memory;
    } catch (error) {
      console.error('[GoogleDrive] createMemory failed:', error);
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
      const existingIndex = this.memories.findIndex((m) => m.id === memoryId);
      if (existingIndex === -1) {
        throw new StorageError('Memory not found', 'not_found');
      }

      const existing = this.memories[existingIndex];
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
        text: updates.text ?? existing.text,
        tags: updates.tags ?? existing.tags,
        media: mediaAttachments,
        updatedAt: new Date(),
      };

      this.memories[existingIndex] = updated;
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
        // Delete associated media files
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
      const token = await this.getAccessToken();
      const fileId = uuidv4();
      const fileName = `${fileId}_${file.name}`;

      // Create file metadata
      const metadata = {
        name: fileName,
        parents: ['appDataFolder'],
      };

      // Use multipart upload
      const boundary = '-------314159265358979323846';
      const delimiter = '\r\n--' + boundary + '\r\n';
      const closeDelimiter = '\r\n--' + boundary + '--';

      const metadataPart =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata);

      // Read file as array buffer
      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      // Build multipart body
      const encoder = new TextEncoder();
      const metadataBytes = encoder.encode(metadataPart);
      const contentTypeBytes = encoder.encode(
        delimiter + `Content-Type: ${file.type}\r\n\r\n`
      );
      const closeBytes = encoder.encode(closeDelimiter);

      const body = new Uint8Array(
        metadataBytes.length +
          contentTypeBytes.length +
          fileBytes.length +
          closeBytes.length
      );
      let offset = 0;
      body.set(metadataBytes, offset);
      offset += metadataBytes.length;
      body.set(contentTypeBytes, offset);
      offset += contentTypeBytes.length;
      body.set(fileBytes, offset);
      offset += fileBytes.length;
      body.set(closeBytes, offset);

      const response = await fetch(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`,
          },
          body: body,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to upload media');
      }

      const uploadedFile: DriveFile = await response.json();

      // Determine media type
      let mediaType: 'image' | 'audio' | 'video' = 'image';
      if (file.type.startsWith('audio/')) {
        mediaType = 'audio';
      } else if (file.type.startsWith('video/')) {
        mediaType = 'video';
      }

      return {
        id: fileId,
        type: mediaType,
        url: `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}?alt=media`,
        fileName: file.name,
        storagePath: uploadedFile.id,
      };
    } catch (error) {
      throw new StorageError('Failed to upload media', 'unknown', error);
    }
  }

  async deleteMedia(_mediaId: string, storagePath: string): Promise<void> {
    this.ensureInitialized();

    try {
      const token = await this.getAccessToken();
      const response = await fetch(`${DRIVE_API_BASE}/files/${storagePath}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to delete media');
      }
    } catch (error) {
      throw new StorageError('Failed to delete media', 'unknown', error);
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
    const memoryIndex = this.memories.findIndex((m) => m.id === memoryId);
    this.memories[memoryIndex] = { ...memory, media: updatedMedia };

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
    await this.loadMemories();
    this.notifyListeners();
    return this.memories;
  }

  async forceSync(): Promise<SyncResult> {
    await this.loadMemories();
    this.notifyListeners();
    return {
      success: true,
      uploaded: 0,
      downloaded: this.memories.length,
      conflicts: [],
      errors: [],
    };
  }

  // MARK: - Private Helpers

  private notifyListeners(): void {
    this.changeListeners.forEach((callback) => {
      try {
        callback(this.memories);
      } catch (error) {
        console.error('Change listener error:', error);
      }
    });
  }
}
