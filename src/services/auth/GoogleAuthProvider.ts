import { Preferences } from '@capacitor/preferences';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AuthProvider } from './AuthProvider';
import type { AuthUser } from '../platform/types';

const GOOGLE_USER_KEY = 'google_auth_user';
const GOOGLE_ACCESS_TOKEN_KEY = 'google_access_token';

// Google OAuth configuration
// You'll need to set these up in Google Cloud Console
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// CloudKit plugin interface for native iOS Google sign-in
interface CloudKitPluginInterface {
  signInWithGoogle(options: { clientId: string }): Promise<{
    user: {
      id: string;
      email?: string;
      displayName?: string;
      photoURL?: string;
      provider: string;
    };
    accessToken: string;
  }>;
}

const CloudKitPlugin = registerPlugin<CloudKitPluginInterface>('CloudKit');

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string; error?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

/**
 * Google Sign-In authentication provider.
 * Uses Google Identity Services for web authentication.
 * Access token is used for Google Drive API access.
 */
export class GoogleAuthProvider implements AuthProvider {
  readonly providerType = 'google' as const;
  readonly supportsEmailPassword = false;

  private authStateListeners: Set<(user: AuthUser | null) => void> = new Set();
  private currentUser: AuthUser | null = null;
  private accessToken: string | null = null;
  private gsiLoaded: boolean = false;

  constructor() {
    this.loadGoogleIdentityServices();
  }

  private async loadGoogleIdentityServices(): Promise<void> {
    if (this.gsiLoaded) return;

    return new Promise((resolve) => {
      if (window.google?.accounts?.oauth2) {
        this.gsiLoaded = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.gsiLoaded = true;
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  async signIn(): Promise<AuthUser> {
    // Use native sign-in on iOS
    if (Capacitor.getPlatform() === 'ios') {
      return this.signInNative();
    }

    // Web-based sign-in for other platforms
    await this.loadGoogleIdentityServices();

    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services not loaded');
    }

    if (!GOOGLE_CLIENT_ID) {
      throw new Error('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in .env');
    }

    return new Promise((resolve, reject) => {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: async (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }

          try {
            this.accessToken = response.access_token;
            await this.persistAccessToken(response.access_token);

            // Fetch user info from Google
            const userInfo = await this.fetchUserInfo(response.access_token);
            const user: AuthUser = {
              id: userInfo.sub,
              email: userInfo.email,
              displayName: userInfo.name,
              photoURL: userInfo.picture,
              provider: 'google',
            };

            await this.persistUser(user);
            this.currentUser = user;
            this.notifyListeners(user);
            resolve(user);
          } catch (error) {
            reject(error);
          }
        },
      });

      tokenClient.requestAccessToken();
    });
  }

  private async signInNative(): Promise<AuthUser> {
    const clientId = GOOGLE_IOS_CLIENT_ID || GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('Google Client ID not configured. Set VITE_GOOGLE_IOS_CLIENT_ID in .env');
    }

    const result = await CloudKitPlugin.signInWithGoogle({ clientId });

    const user: AuthUser = {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
      provider: 'google',
    };

    this.accessToken = result.accessToken;
    await this.persistAccessToken(result.accessToken);
    await this.persistUser(user);
    this.currentUser = user;
    this.notifyListeners(user);

    return user;
  }

  async signOut(): Promise<void> {
    // Revoke the token if we have one
    if (this.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${this.accessToken}`, {
          method: 'POST',
        });
      } catch {
        // Ignore revoke errors
      }
    }

    await Preferences.remove({ key: GOOGLE_USER_KEY });
    await Preferences.remove({ key: GOOGLE_ACCESS_TOKEN_KEY });
    this.currentUser = null;
    this.accessToken = null;
    this.notifyListeners(null);
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Try to restore from storage
    const stored = await this.loadStoredUser();
    if (stored) {
      this.currentUser = stored;
      this.accessToken = await this.loadStoredAccessToken();
      return stored;
    }

    return null;
  }

  /**
   * Get the current access token for API calls.
   * May trigger a re-auth if token is expired.
   */
  async getAccessToken(): Promise<string | null> {
    if (this.accessToken) {
      // TODO: Check if token is expired and refresh if needed
      return this.accessToken;
    }

    const stored = await this.loadStoredAccessToken();
    if (stored) {
      this.accessToken = stored;
      return stored;
    }

    return null;
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

  private async fetchUserInfo(accessToken: string): Promise<{
    sub: string;
    email: string;
    name: string;
    picture: string;
  }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return response.json();
  }

  private async persistUser(user: AuthUser): Promise<void> {
    await Preferences.set({
      key: GOOGLE_USER_KEY,
      value: JSON.stringify(user),
    });
  }

  private async loadStoredUser(): Promise<AuthUser | null> {
    const result = await Preferences.get({ key: GOOGLE_USER_KEY });
    if (result.value) {
      try {
        return JSON.parse(result.value) as AuthUser;
      } catch {
        return null;
      }
    }
    return null;
  }

  private async persistAccessToken(token: string): Promise<void> {
    await Preferences.set({
      key: GOOGLE_ACCESS_TOKEN_KEY,
      value: token,
    });
  }

  private async loadStoredAccessToken(): Promise<string | null> {
    const result = await Preferences.get({ key: GOOGLE_ACCESS_TOKEN_KEY });
    return result.value || null;
  }
}
