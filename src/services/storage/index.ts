import type { StorageProvider } from './StorageProvider';
import type { StorageProviderType } from '../platform/types';
import { CloudKitProvider } from './CloudKitProvider';
import { GoogleDriveProvider } from './GoogleDriveProvider';

export type { StorageProvider, StorageErrorCode } from './StorageProvider';
export { StorageError } from './StorageProvider';
export { CloudKitProvider } from './CloudKitProvider';
export { GoogleDriveProvider } from './GoogleDriveProvider';

/**
 * Create a storage provider based on the provider type.
 */
export function createStorageProvider(
  type: StorageProviderType,
  _userId: string
): StorageProvider {
  switch (type) {
    case 'cloudkit':
      return new CloudKitProvider();
    case 'googledrive':
      return new GoogleDriveProvider();
    case 'firebase':
      // Firebase provider will be kept for migration
      throw new Error('Firebase storage provider not yet implemented for standalone use');
    default:
      throw new Error(`Unknown storage provider type: ${type}`);
  }
}

/**
 * Get the recommended storage provider for the current platform.
 */
export function getRecommendedStorageProvider(userId: string): StorageProvider {
  const { getPlatformInfo } = require('../platform');
  const platform = getPlatformInfo();

  return createStorageProvider(platform.recommendedBackend, userId);
}
