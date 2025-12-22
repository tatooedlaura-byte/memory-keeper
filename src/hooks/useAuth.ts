import { useState, useEffect, useCallback, useRef } from 'react';
import { Preferences } from '@capacitor/preferences';
import { usePlatform } from './usePlatform';
import { createAuthProvider, type AuthProvider } from '../services/auth';
import type { AuthUser, AuthProviderType } from '../services/platform/types';

const AUTH_PROVIDER_KEY = 'auth_provider_type';

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  providerType: AuthProviderType | null;
  isAuthenticated: boolean;
  isApplePlatform: boolean;

  // Auth methods
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail?: (email: string, password: string) => Promise<void>;
  createAccount?: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const platform = usePlatform();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerType, setProviderType] = useState<AuthProviderType | null>(null);

  const providerRef = useRef<AuthProvider | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Restore saved provider on mount
  useEffect(() => {
    async function restoreProvider() {
      try {
        const saved = await Preferences.get({ key: AUTH_PROVIDER_KEY });
        if (saved.value) {
          const type = saved.value as AuthProviderType;
          const provider = createAuthProvider(type);
          providerRef.current = provider;
          setProviderType(type);

          // Subscribe to auth state
          unsubscribeRef.current = provider.onAuthStateChanged((authUser) => {
            setUser(authUser);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to restore auth provider:', err);
        setLoading(false);
      }
    }

    restoreProvider();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const switchToProvider = useCallback(async (type: AuthProviderType) => {
    // Clean up previous provider
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const provider = createAuthProvider(type);
    providerRef.current = provider;
    setProviderType(type);

    // Subscribe to new provider
    unsubscribeRef.current = provider.onAuthStateChanged((authUser) => {
      setUser(authUser);
    });

    // Save provider choice
    await Preferences.set({ key: AUTH_PROVIDER_KEY, value: type });

    return provider;
  }, []);

  const signInWithApple = useCallback(async () => {
    setError(null);
    try {
      const provider = await switchToProvider('apple');
      await provider.signIn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw err;
    }
  }, [switchToProvider]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const provider = await switchToProvider('google');
      await provider.signIn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw err;
    }
  }, [switchToProvider]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      if (providerRef.current) {
        await providerRef.current.signOut();
      }
      setUser(null);
      setProviderType(null);
      await Preferences.remove({ key: AUTH_PROVIDER_KEY });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      throw err;
    }
  }, []);

  return {
    user,
    loading,
    error,
    providerType,
    isAuthenticated: !!user,
    isApplePlatform: platform.isApplePlatform,

    signInWithApple,
    signInWithGoogle,
    signOut,
  };
}
