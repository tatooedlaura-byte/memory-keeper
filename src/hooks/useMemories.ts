import { useState, useEffect, useCallback, useRef } from 'react';
import { CloudKitProvider } from '../services/storage/CloudKitProvider';
import type { StorageProvider } from '../services/storage/StorageProvider';
import type { Memory, MemoryInput } from '../types/Memory';

export function useMemories(userId: string | undefined) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<StorageProvider | null>(null);

  // Get or create the storage provider
  const getProvider = useCallback((): StorageProvider => {
    if (!providerRef.current) {
      providerRef.current = new CloudKitProvider();
    }
    return providerRef.current;
  }, []);

  useEffect(() => {
    if (!userId) {
      setMemories([]);
      setLoading(false);
      return;
    }

    setMemories([]);
    setLoading(true);

    let unsubscribe: (() => void) | null = null;

    const initializeAndLoad = async () => {
      try {
        const provider = getProvider();
        await provider.initialize(userId);

        const initialMemories = await provider.getMemories();
        const processed = initialMemories.map((m) => ({
          ...m,
          createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt),
          updatedAt: m.updatedAt instanceof Date ? m.updatedAt : new Date(m.updatedAt),
        }));
        processed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setMemories(processed);
        setLoading(false);

        unsubscribe = provider.subscribeToChanges?.((updatedMemories) => {
          const processed = updatedMemories.map((m) => ({
            ...m,
            createdAt: m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt),
            updatedAt: m.updatedAt instanceof Date ? m.updatedAt : new Date(m.updatedAt),
          }));
          processed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          setMemories(processed);
        }) ?? null;
      } catch (err) {
        console.error('Failed to initialize storage:', err);
        setError(err instanceof Error ? err.message : 'Failed to load memories');
        setLoading(false);
      }
    };

    initializeAndLoad();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId, getProvider]);

  const addMemory = useCallback(async (input: MemoryInput) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const provider = getProvider();
      await provider.createMemory(input);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add memory';
      setError(message);
      throw err;
    }
  }, [userId, getProvider]);

  const updateMemory = useCallback(async (
    memoryId: string,
    updates: Partial<Pick<Memory, 'text' | 'tags'>>,
    newMediaFiles?: File[]
  ) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const provider = getProvider();
      await provider.updateMemory(memoryId, updates, newMediaFiles);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update memory';
      setError(message);
      throw err;
    }
  }, [userId, getProvider]);

  const deleteMemory = useCallback(async (memoryId: string) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const provider = getProvider();
      await provider.deleteMemory(memoryId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete memory';
      setError(message);
      throw err;
    }
  }, [userId, getProvider]);

  const removeMedia = useCallback(async (memoryId: string, mediaId: string) => {
    if (!userId) throw new Error('User not authenticated');
    setError(null);

    try {
      const provider = getProvider();
      await provider.removeMediaFromMemory(memoryId, mediaId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove media';
      setError(message);
      throw err;
    }
  }, [userId, getProvider]);

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
