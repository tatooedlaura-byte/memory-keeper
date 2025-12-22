import { useState, useEffect, useCallback, useRef } from 'react';
import { CloudKitProvider } from '../services/storage/CloudKitProvider';
import { GoogleDriveProvider } from '../services/storage/GoogleDriveProvider';
import type { StorageProvider } from '../services/storage/StorageProvider';
import type { Memory, MemoryInput, AuthProviderType } from '../services/platform/types';

export function useMemories(userId: string | undefined, authProviderType: AuthProviderType | null) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<StorageProvider | null>(null);
  const currentProviderTypeRef = useRef<AuthProviderType | null>(null);

  // Get or create the storage provider based on auth provider
  const getProvider = useCallback((authType: AuthProviderType): StorageProvider => {
    console.log('[useMemories] getProvider called with authType:', authType);

    // If we already have a provider for this type, reuse it
    if (providerRef.current && currentProviderTypeRef.current === authType) {
      console.log('[useMemories] Reusing existing provider');
      return providerRef.current;
    }

    // Create new provider based on auth type
    // Apple → CloudKit, Google → Google Drive
    if (authType === 'google') {
      console.log('[useMemories] Creating GoogleDriveProvider');
      providerRef.current = new GoogleDriveProvider();
    } else {
      console.log('[useMemories] Creating CloudKitProvider');
      providerRef.current = new CloudKitProvider();
    }
    currentProviderTypeRef.current = authType;

    return providerRef.current;
  }, []);

  useEffect(() => {
    if (!userId || !authProviderType) {
      setMemories([]);
      setLoading(false);
      return;
    }

    setMemories([]);
    setLoading(true);

    let unsubscribe: (() => void) | null = null;

    const initializeAndLoad = async () => {
      try {
        const provider = getProvider(authProviderType);
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
  }, [userId, authProviderType, getProvider]);

  const addMemory = useCallback(async (input: MemoryInput) => {
    console.log('[useMemories] addMemory called, authProviderType:', authProviderType);
    if (!userId || !authProviderType) throw new Error('User not authenticated');
    if (loading) throw new Error('Still loading, please wait');
    setError(null);

    try {
      const provider = getProvider(authProviderType);
      // Ensure provider is initialized before creating memory
      console.log('[useMemories] Ensuring provider is initialized...');
      await provider.initialize(userId);
      console.log('[useMemories] Calling provider.createMemory...');
      await provider.createMemory(input);
      console.log('[useMemories] Memory created successfully');
    } catch (err: unknown) {
      console.error('[useMemories] addMemory failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to add memory';
      setError(message);
      throw err;
    }
  }, [userId, authProviderType, getProvider, loading]);

  const updateMemory = useCallback(async (
    memoryId: string,
    updates: Partial<Pick<Memory, 'text' | 'tags'>>,
    newMediaFiles?: File[]
  ) => {
    if (!userId || !authProviderType) throw new Error('User not authenticated');
    setError(null);

    try {
      const provider = getProvider(authProviderType);
      await provider.updateMemory(memoryId, updates, newMediaFiles);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update memory';
      setError(message);
      throw err;
    }
  }, [userId, authProviderType, getProvider]);

  const deleteMemory = useCallback(async (memoryId: string) => {
    if (!userId || !authProviderType) throw new Error('User not authenticated');
    setError(null);

    try {
      const provider = getProvider(authProviderType);
      await provider.deleteMemory(memoryId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete memory';
      setError(message);
      throw err;
    }
  }, [userId, authProviderType, getProvider]);

  const removeMedia = useCallback(async (memoryId: string, mediaId: string) => {
    if (!userId || !authProviderType) throw new Error('User not authenticated');
    setError(null);

    try {
      const provider = getProvider(authProviderType);
      await provider.removeMediaFromMemory(memoryId, mediaId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove media';
      setError(message);
      throw err;
    }
  }, [userId, authProviderType, getProvider]);

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
