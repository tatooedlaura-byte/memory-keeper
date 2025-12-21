import type { StorageProvider } from './StorageProvider';
import type { StorageProviderType } from '../platform/types';
import { CloudKitProvider } from './CloudKitProvider';

export type { StorageProvider, StorageErrorCode } from './StorageProvider';
export { StorageError } from './StorageProvider';
export { CloudKitProvider } from './CloudKitProvider';

/**
 * Create a storage provider based on the provider type.
 */
export function createStorageProvider(
  type: StorageProviderType,
  _userId: string
): StorageProvider {
  switch (type) {
    case 'cloudkit':
    default:
      return new CloudKitProvider();
  }
}

/**
 * Get the recommended storage provider for the current platform.
 */
export function getRecommendedStorageProvider(userId: string): StorageProvider {
  return createStorageProvider('cloudkit', userId);
}
