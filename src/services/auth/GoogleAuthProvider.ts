import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { AuthProvider } from './AuthProvider';
import type { AuthUser } from '../platform/types';

const TOKEN_KEY = 'google_auth_token';
const USER_KEY = 'google_auth_user';

// Native plugin interface
interface GoogleAuthPluginInterface {
  signIn(): Promise<GoogleAuthResult>;
  signOut(): Promise<{ success: boolean }>;
  getCurrentUser(): Promise<GoogleAuthResult | { user: null }>;
  getAccessToken(): Promise<{ accessToken: string }>;
}

interface GoogleAuthResult {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  accessToken: string;
}

// Register native plugin
const GoogleAuthNative = registerPlugin<GoogleAuthPluginInterface>('GoogleAuth');

// Web-based Google Identity Services (fallback for web)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string; expires_in: number }) => void;
            error_callback?: (error: { type: string; message: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
          revoke: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

/**
 * Google Sign-In authentication provider.
 * Uses native SDK on iOS, Google Identity Services on web.
 */
export class GoogleAuthProvider implements AuthProvider {
  readonly providerType = 'google' as const;
  readonly supportsEmailPassword = false;

  private authStateListeners: Set<(user: AuthUser | null) => void> = new Set();
  private currentUser: AuthUser | null = null;
  private accessToken: string | null = null;
  private isNative: boolean;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.restoreSession().catch(console.error);
  }

  private async restoreSession(): Promise<void> {
    try {
      if (this.isNative) {
        // Try to restore native session
        const result = await GoogleAuthNative.getCurrentUser();
        if ('id' in result && result.id) {
          this.accessToken = result.accessToken;
          this.currentUser = {
            id: result.id,
            email: result.email,
            displayName: result.displayName,
            photoURL: result.photoURL,
            provider: 'google',
          };
          this.notifyListeners(this.currentUser);
        }
      } else {
        // Web: restore from preferences
        const [tokenResult, userResult] = await Promise.all([
          Preferences.get({ key: TOKEN_KEY }),
          Preferences.get({ key: USER_KEY }),
        ]);

        if (tokenResult.value && userResult.value) {
          this.accessToken = tokenResult.value;
          this.currentUser = JSON.parse(userResult.value);

          // Verify token is still valid
          const isValid = await this.verifyToken();
          if (!isValid) {
            await this.clearSession();
          }
        }
      }
    } catch (error) {
      console.error('Failed to restore Google session:', error);
    }
  }

  private async verifyToken(): Promise<boolean> {
    if (!this.accessToken) return false;

    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${this.accessToken}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async saveSession(token: string, user: AuthUser): Promise<void> {
    await Promise.all([
      Preferences.set({ key: TOKEN_KEY, value: token }),
      Preferences.set({ key: USER_KEY, value: JSON.stringify(user) }),
    ]);
  }

  private async clearSession(): Promise<void> {
    this.accessToken = null;
    this.currentUser = null;
    await Promise.all([
      Preferences.remove({ key: TOKEN_KEY }),
      Preferences.remove({ key: USER_KEY }),
    ]);
  }

  async signIn(): Promise<AuthUser> {
    if (this.isNative) {
      return this.signInNative();
    } else {
      return this.signInWeb();
    }
  }

  private async signInNative(): Promise<AuthUser> {
    try {
      const result = await GoogleAuthNative.signIn();

      this.accessToken = result.accessToken;

      const user: AuthUser = {
        id: result.id,
        email: result.email,
        displayName: result.displayName,
        photoURL: result.photoURL,
        provider: 'google',
      };

      this.currentUser = user;
      await this.saveSession(result.accessToken, user);
      this.notifyListeners(user);

      return user;
    } catch (error) {
      console.error('Native Google Sign-In failed:', error);
      throw error;
    }
  }

  private async signInWeb(): Promise<AuthUser> {
    await this.loadGoogleIdentityServices();

    if (!GOOGLE_CLIENT_ID) {
      throw new Error('Google Client ID not configured');
    }

    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services not available');
    }

    return new Promise((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
        callback: async (response) => {
          try {
            this.accessToken = response.access_token;

            const userInfo = await this.fetchUserInfo(response.access_token);

            const user: AuthUser = {
              id: userInfo.sub,
              email: userInfo.email,
              displayName: userInfo.name,
              photoURL: userInfo.picture,
              provider: 'google',
            };

            this.currentUser = user;
            await this.saveSession(response.access_token, user);
            this.notifyListeners(user);
            resolve(user);
          } catch (error) {
            reject(error);
          }
        },
        error_callback: (error) => {
          reject(new Error(error.message || 'Google Sign-In failed'));
        },
      });

      client.requestAccessToken();
    });
  }

  private async loadGoogleIdentityServices(): Promise<void> {
    if (window.google?.accounts?.oauth2) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  private async fetchUserInfo(accessToken: string): Promise<{
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return response.json();
  }

  async signOut(): Promise<void> {
    if (this.isNative) {
      await GoogleAuthNative.signOut();
    } else if (this.accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(this.accessToken);
    }

    await this.clearSession();
    this.notifyListeners(null);
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    await this.restoreSession();
    return this.currentUser;
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    this.authStateListeners.add(callback);

    this.getCurrentUser().then((user) => {
      callback(user);
    });

    return () => {
      this.authStateListeners.delete(callback);
    };
  }

  async isSignedIn(): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;
    return this.verifyToken();
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.isNative) {
      try {
        const result = await GoogleAuthNative.getAccessToken();
        this.accessToken = result.accessToken;
        return result.accessToken;
      } catch {
        return null;
      }
    }
    return this.accessToken;
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

// Singleton instance for token access from GoogleDriveProvider
let googleAuthInstance: GoogleAuthProvider | null = null;

export function getGoogleAuthProvider(): GoogleAuthProvider {
  if (!googleAuthInstance) {
    googleAuthInstance = new GoogleAuthProvider();
  }
  return googleAuthInstance;
}
