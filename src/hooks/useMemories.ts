import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { db, storage } from '../firebase/config';
import type { Memory, MediaAttachment, MemoryInput } from '../types/Memory';

export function useMemories(userId: string | undefined) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setMemories([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'memories'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const memoriesData: Memory[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          memoriesData.push({
            id: doc.id,
            text: data.text,
            tags: data.tags || [],
            media: data.media || [],
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            userId: data.userId
          });
        });
        setMemories(memoriesData);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const uploadMedia = async (file: File, userId: string): Promise<MediaAttachment> => {
    const fileId = uuidv4();
    const extension = file.name.split('.').pop();
    const storagePath = `memories/${userId}/${fileId}.${extension}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    let type: 'image' | 'audio' | 'video' = 'image';
    if (file.type.startsWith('audio/')) type = 'audio';
    else if (file.type.startsWith('video/')) type = 'video';

    return {
      id: fileId,
      type,
      url,
      fileName: file.name,
      storagePath
    };
  };

  const addMemory = useCallback(async (input: MemoryInput) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const mediaAttachments: MediaAttachment[] = [];

      for (const file of input.mediaFiles) {
        const attachment = await uploadMedia(file, userId);
        mediaAttachments.push(attachment);
      }

      const now = Timestamp.now();
      await addDoc(collection(db, 'memories'), {
        text: input.text,
        tags: input.tags,
        media: mediaAttachments,
        createdAt: now,
        updatedAt: now,
        userId
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add memory';
      setError(message);
      throw err;
    }
  }, [userId]);

  const updateMemory = useCallback(async (
    memoryId: string,
    updates: Partial<Pick<Memory, 'text' | 'tags'>>,
    newMediaFiles?: File[]
  ) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const memoryRef = doc(db, 'memories', memoryId);
      const updateData: Record<string, unknown> = {
        ...updates,
        updatedAt: Timestamp.now()
      };

      if (newMediaFiles && newMediaFiles.length > 0) {
        const existingMemory = memories.find(m => m.id === memoryId);
        const existingMedia = existingMemory?.media || [];

        const newAttachments: MediaAttachment[] = [];
        for (const file of newMediaFiles) {
          const attachment = await uploadMedia(file, userId);
          newAttachments.push(attachment);
        }

        updateData.media = [...existingMedia, ...newAttachments];
      }

      await updateDoc(memoryRef, updateData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update memory';
      setError(message);
      throw err;
    }
  }, [userId, memories]);

  const deleteMemory = useCallback(async (memoryId: string) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const memory = memories.find(m => m.id === memoryId);
      if (memory) {
        for (const media of memory.media) {
          try {
            const storageRef = ref(storage, media.storagePath);
            await deleteObject(storageRef);
          } catch {
            // File may already be deleted
          }
        }
      }

      await deleteDoc(doc(db, 'memories', memoryId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete memory';
      setError(message);
      throw err;
    }
  }, [userId, memories]);

  const removeMedia = useCallback(async (memoryId: string, mediaId: string) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const memory = memories.find(m => m.id === memoryId);
      if (!memory) throw new Error('Memory not found');

      const mediaToRemove = memory.media.find(m => m.id === mediaId);
      if (mediaToRemove) {
        try {
          const storageRef = ref(storage, mediaToRemove.storagePath);
          await deleteObject(storageRef);
        } catch {
          // File may already be deleted
        }
      }

      const updatedMedia = memory.media.filter(m => m.id !== mediaId);
      await updateDoc(doc(db, 'memories', memoryId), {
        media: updatedMedia,
        updatedAt: Timestamp.now()
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove media';
      setError(message);
      throw err;
    }
  }, [userId, memories]);

  const searchMemories = useCallback((searchTerm: string): Memory[] => {
    if (!searchTerm.trim()) return memories;

    const term = searchTerm.toLowerCase();
    return memories.filter(memory =>
      memory.text.toLowerCase().includes(term) ||
      memory.tags.some(tag => tag.toLowerCase().includes(term))
    );
  }, [memories]);

  return {
    memories,
    loading,
    error,
    addMemory,
    updateMemory,
    deleteMemory,
    removeMedia,
    searchMemories
  };
}
