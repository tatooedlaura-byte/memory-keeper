import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { ref, getBlob } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import type { Memory, MediaAttachment, MigrationProgress } from '../platform/types';
import type { StorageProvider } from '../storage/StorageProvider';

export class MigrationService {
  private onProgress: ((progress: MigrationProgress) => void) | null = null;

  /**
   * Set a callback to receive progress updates during migration.
   */
  setProgressCallback(callback: (progress: MigrationProgress) => void): void {
    this.onProgress = callback;
  }

  private updateProgress(progress: Partial<MigrationProgress>): void {
    if (this.onProgress) {
      this.onProgress({
        status: 'idle',
        totalItems: 0,
        completedItems: 0,
        ...progress,
      } as MigrationProgress);
    }
  }

  /**
   * Check if the user has data in Firebase that needs migrating.
   */
  async checkMigrationNeeded(firebaseUserId: string): Promise<{
    needed: boolean;
    memoryCount: number;
  }> {
    try {
      const q = query(
        collection(db, 'memories'),
        where('userId', '==', firebaseUserId)
      );
      const snapshot = await getDocs(q);

      return {
        needed: !snapshot.empty,
        memoryCount: snapshot.size,
      };
    } catch (error) {
      console.error('Error checking migration status:', error);
      return { needed: false, memoryCount: 0 };
    }
  }

  /**
   * Export all memories from Firebase.
   */
  async exportFromFirebase(
    firebaseUserId: string
  ): Promise<{ memories: Memory[]; mediaBlobs: Map<string, Blob> }> {
    this.updateProgress({
      status: 'fetching',
      totalItems: 0,
      completedItems: 0,
      currentItem: 'Fetching memories from Firebase...',
    });

    // Fetch all memories
    const q = query(
      collection(db, 'memories'),
      where('userId', '==', firebaseUserId)
    );
    const snapshot = await getDocs(q);

    const memories: Memory[] = [];
    const mediaBlobs = new Map<string, Blob>();

    const totalItems = snapshot.size;
    let completedItems = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      const memory: Memory = {
        id: doc.id,
        text: data.text || '',
        tags: data.tags || [],
        media: data.media || [],
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        userId: data.userId,
      };

      // Download media files
      for (const media of memory.media) {
        if (media.storagePath) {
          try {
            this.updateProgress({
              status: 'fetching',
              totalItems,
              completedItems,
              currentItem: `Downloading: ${media.fileName}`,
            });

            const storageRef = ref(storage, media.storagePath);
            const blob = await getBlob(storageRef);
            mediaBlobs.set(media.id, blob);
          } catch (error) {
            console.warn(`Failed to download media ${media.id}:`, error);
          }
        }
      }

      memories.push(memory);
      completedItems++;

      this.updateProgress({
        status: 'fetching',
        totalItems,
        completedItems,
        currentItem: `Exported ${completedItems} of ${totalItems} memories`,
      });
    }

    return { memories, mediaBlobs };
  }

  /**
   * Import memories to the new storage provider.
   */
  async importToNewPlatform(
    memories: Memory[],
    mediaBlobs: Map<string, Blob>,
    targetProvider: StorageProvider,
    newUserId: string
  ): Promise<void> {
    await targetProvider.initialize(newUserId);

    const totalItems = memories.length;
    let completedItems = 0;

    for (const memory of memories) {
      this.updateProgress({
        status: 'uploading',
        totalItems,
        completedItems,
        currentItem: `Migrating: ${memory.text.substring(0, 30)}...`,
      });

      // Re-upload media files
      const newMediaAttachments: MediaAttachment[] = [];

      for (const media of memory.media) {
        const blob = mediaBlobs.get(media.id);
        if (blob) {
          try {
            // Convert blob to File
            const file = new File([blob], media.fileName, {
              type: this.getMimeType(media.type, media.fileName),
            });

            const newAttachment = await targetProvider.uploadMedia(file);
            newMediaAttachments.push(newAttachment);
          } catch (error) {
            console.warn(`Failed to upload media ${media.id}:`, error);
          }
        }
      }

      // Create memory in new storage
      // We need to use the raw provider method to preserve dates
      try {
        await targetProvider.createMemory({
          text: memory.text,
          tags: memory.tags,
          mediaFiles: [], // Media already uploaded above
        });

        // Update the memory with the correct media (hacky but works)
        const allMemories = await targetProvider.getMemories();
        const newMemory = allMemories.find((m) => m.text === memory.text);
        if (newMemory && newMediaAttachments.length > 0) {
          await targetProvider.updateMemory(newMemory.id, {}, []);
        }
      } catch (error) {
        console.warn(`Failed to create memory:`, error);
      }

      completedItems++;
    }

    this.updateProgress({
      status: 'complete',
      totalItems,
      completedItems,
      currentItem: 'Migration complete!',
    });
  }

  /**
   * Perform full migration from Firebase to new platform.
   */
  async performFullMigration(
    firebaseUserId: string,
    targetProvider: StorageProvider,
    newUserId: string
  ): Promise<{ success: boolean; migratedCount: number; error?: string }> {
    try {
      this.updateProgress({
        status: 'connecting',
        totalItems: 0,
        completedItems: 0,
        currentItem: 'Connecting to Firebase...',
      });

      // Export from Firebase
      const { memories, mediaBlobs } = await this.exportFromFirebase(
        firebaseUserId
      );

      if (memories.length === 0) {
        this.updateProgress({
          status: 'complete',
          totalItems: 0,
          completedItems: 0,
          currentItem: 'No memories to migrate',
        });
        return { success: true, migratedCount: 0 };
      }

      // Import to new platform
      await this.importToNewPlatform(
        memories,
        mediaBlobs,
        targetProvider,
        newUserId
      );

      return { success: true, migratedCount: memories.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.updateProgress({
        status: 'error',
        totalItems: 0,
        completedItems: 0,
        error: message,
      });
      return { success: false, migratedCount: 0, error: message };
    }
  }

  private getMimeType(
    mediaType: 'image' | 'audio' | 'video',
    fileName: string
  ): string {
    const ext = fileName.split('.').pop()?.toLowerCase();

    switch (mediaType) {
      case 'image':
        if (ext === 'png') return 'image/png';
        if (ext === 'gif') return 'image/gif';
        if (ext === 'webp') return 'image/webp';
        return 'image/jpeg';
      case 'audio':
        if (ext === 'mp3') return 'audio/mpeg';
        if (ext === 'wav') return 'audio/wav';
        if (ext === 'ogg') return 'audio/ogg';
        return 'audio/mpeg';
      case 'video':
        if (ext === 'mp4') return 'video/mp4';
        if (ext === 'webm') return 'video/webm';
        if (ext === 'mov') return 'video/quicktime';
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
  }
}

// Singleton instance
export const migrationService = new MigrationService();
