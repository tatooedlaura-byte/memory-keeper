import type { AuthProvider } from './AuthProvider';
import type { AuthProviderType } from '../platform/types';
import { AppleAuthProvider } from './AppleAuthProvider';
import { getGoogleAuthProvider } from './GoogleAuthProvider';

export type { AuthProvider } from './AuthProvider';
export { AppleAuthProvider } from './AppleAuthProvider';
export { GoogleAuthProvider, getGoogleAuthProvider } from './GoogleAuthProvider';

/**
 * Create an auth provider based on the provider type.
 */
export function createAuthProvider(type: AuthProviderType): AuthProvider {
  switch (type) {
    case 'google':
      return getGoogleAuthProvider();
    case 'apple':
    default:
      return new AppleAuthProvider();
  }
}

/**
 * Get the recommended auth provider for the current platform.
 */
export function getRecommendedAuthProvider(): AuthProvider {
  return new AppleAuthProvider();
}
