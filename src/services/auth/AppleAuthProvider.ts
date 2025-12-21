import { registerPlugin } from '@capacitor/core';
import type { AuthProvider } from './AuthProvider';
import type { AuthUser } from '../platform/types';

// Use our CloudKit plugin which includes Sign in with Apple
interface CloudKitPluginInterface {
  signInWithApple(): Promise<{ user: AuthUser }>;
  getCurrentUser(): Promise<{ user: AuthUser | null }>;
  signOut(): Promise<{ success: boolean }>;
}

const CloudKitNative = registerPlugin<CloudKitPluginInterface>('CloudKit');

/**
 * Apple Sign-In authentication provider.
 * Uses our native CloudKit plugin for Sign in with Apple.
 */
export class AppleAuthProvider implements AuthProvider {
  readonly providerType = 'apple' as const;
  readonly supportsEmailPassword = false;

  private authStateListeners: Set<(user: AuthUser | null) => void> = new Set();
  private currentUser: AuthUser | null = null;

  async signIn(): Promise<AuthUser> {
    try {
      const result = await CloudKitNative.signInWithApple();
      this.currentUser = result.user;
      this.notifyListeners(result.user);
      return result.user;
    } catch (error) {
      console.error('Apple Sign-In failed:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await CloudKitNative.signOut();
    this.currentUser = null;
    this.notifyListeners(null);
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    try {
      const result = await CloudKitNative.getCurrentUser();
      this.currentUser = result.user;
      return result.user;
    } catch {
      return null;
    }
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    this.authStateListeners.add(callback);

    // Immediately call with current state
    this.getCurrentUser().then((user) => {
      callback(user);
    });

    return () => {
      this.authStateListeners.delete(callback);
    };
  }

  async isSignedIn(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  private notifyListeners(user: AuthUser | null): void {
    this.authStateListeners.forEach((callback) => {
      try {
        callback(user);
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    });
  }
}
