import type { AuthUser, AuthProviderType } from '../platform/types';

/**
 * Abstract interface for authentication providers.
 * Implementations: AppleAuthProvider, GoogleAuthProvider, FirebaseAuthProvider
 */
export interface AuthProvider {
  /**
   * The type of auth provider
   */
  readonly providerType: AuthProviderType;

  /**
   * Whether this provider supports email/password login
   * (Only Firebase does, Apple and Google use OAuth)
   */
  readonly supportsEmailPassword: boolean;

  /**
   * Sign in the user.
   * For Apple/Google, this triggers the OAuth flow.
   * For Firebase, use signInWithEmail instead.
   */
  signIn(): Promise<AuthUser>;

  /**
   * Sign in with email and password (Firebase only)
   */
  signInWithEmail?(email: string, password: string): Promise<AuthUser>;

  /**
   * Create a new account with email and password (Firebase only)
   */
  createAccount?(email: string, password: string): Promise<AuthUser>;

  /**
   * Sign out the current user
   */
  signOut(): Promise<void>;

  /**
   * Get the currently signed-in user, or null if not signed in
   */
  getCurrentUser(): Promise<AuthUser | null>;

  /**
   * Subscribe to auth state changes.
   * Returns an unsubscribe function.
   */
  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void;

  /**
   * Check if a user is currently signed in
   */
  isSignedIn(): Promise<boolean>;
}
