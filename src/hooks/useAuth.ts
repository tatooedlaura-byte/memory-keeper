import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlatform } from './usePlatform';
import { createAuthProvider, type AuthProvider } from '../services/auth';
import type { AuthUser, AuthProviderType } from '../services/platform/types';

interface UseAuthOptions {
  /**
   * Override the default auth provider.
   * If not specified, uses the recommended provider for the platform.
   */
  providerType?: AuthProviderType;
}

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  provider: AuthProvider;
  providerType: AuthProviderType;
  isAuthenticated: boolean;
  isApplePlatform: boolean;

  // Auth methods
  signIn: () => Promise<void>;
  signInWithEmail?: (email: string, password: string) => Promise<void>;
  createAccount?: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  // Legacy aliases for compatibility
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(options?: UseAuthOptions): UseAuthReturn {
  const platform = usePlatform();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine which provider to use
  const providerType: AuthProviderType = useMemo(() => {
    if (options?.providerType) {
      return options.providerType;
    }
    // Use Apple provider
    return 'apple';
  }, [options?.providerType]);

  // Create the auth provider
  const provider = useMemo(() => {
    return createAuthProvider(providerType);
  }, [providerType]);

  // Subscribe to auth state changes
  useEffect(() => {
    setLoading(true);

    const unsubscribe = provider.onAuthStateChanged((authUser) => {
      setUser(authUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [provider]);

  // Sign in using the provider's OAuth flow (Apple)
  const signIn = useCallback(async () => {
    setError(null);
    try {
      await provider.signIn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw err;
    }
  }, [provider]);

  // Sign in with email/password (only for Firebase provider)
  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!provider.signInWithEmail) {
        throw new Error('Email sign-in not supported by this provider');
      }
      setError(null);
      try {
        await provider.signInWithEmail(email, password);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sign in failed';
        setError(message);
        throw err;
      }
    },
    [provider]
  );

  // Create account with email/password (only for Firebase provider)
  const createAccount = useCallback(
    async (email: string, password: string) => {
      if (!provider.createAccount) {
        throw new Error('Account creation not supported by this provider');
      }
      setError(null);
      try {
        await provider.createAccount(email, password);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Account creation failed';
        setError(message);
        throw err;
      }
    },
    [provider]
  );

  // Sign out
  const signOut = useCallback(async () => {
    setError(null);
    try {
      await provider.signOut();
      setUser(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      throw err;
    }
  }, [provider]);

  // Legacy aliases for compatibility with existing code
  const login = signInWithEmail;
  const register = createAccount;
  const logout = signOut;

  return {
    user,
    loading,
    error,
    provider,
    providerType,
    isAuthenticated: !!user,
    isApplePlatform: platform.isApplePlatform,

    signIn,
    signInWithEmail: provider.supportsEmailPassword ? signInWithEmail : undefined,
    createAccount: provider.supportsEmailPassword ? createAccount : undefined,
    signOut,

    // Legacy aliases
    login,
    register,
    logout,
  };
}
