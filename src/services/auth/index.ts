import type { AuthProvider } from './AuthProvider';
import type { AuthProviderType } from '../platform/types';
import { AppleAuthProvider } from './AppleAuthProvider';
import { GoogleAuthProvider } from './GoogleAuthProvider';

export type { AuthProvider } from './AuthProvider';
export { AppleAuthProvider } from './AppleAuthProvider';
export { GoogleAuthProvider } from './GoogleAuthProvider';

/**
 * Create an auth provider based on the provider type.
 */
export function createAuthProvider(type: AuthProviderType): AuthProvider {
  switch (type) {
    case 'apple':
      return new AppleAuthProvider();
    case 'google':
      return new GoogleAuthProvider();
    case 'firebase':
      // Firebase provider will be added for migration support
      throw new Error('Firebase auth provider not yet implemented for standalone use');
    default:
      throw new Error(`Unknown auth provider type: ${type}`);
  }
}

/**
 * Get the recommended auth provider for the current platform.
 */
export function getRecommendedAuthProvider(): AuthProvider {
  // Import dynamically to avoid circular dependency
  const { getPlatformInfo } = require('../platform');
  const platform = getPlatformInfo();

  if (platform.isApplePlatform) {
    return new AppleAuthProvider();
  } else {
    return new GoogleAuthProvider();
  }
}
