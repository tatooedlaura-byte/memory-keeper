import { Capacitor } from '@capacitor/core';

export type Platform = 'ios' | 'macos' | 'android' | 'web';
export type StorageBackend = 'cloudkit' | 'googledrive';

export interface PlatformInfo {
  platform: Platform;
  isApplePlatform: boolean;
  isNative: boolean;
  recommendedBackend: StorageBackend;
  supportsRealTimeSync: boolean;
}

export function detectPlatform(): PlatformInfo {
  const capacitorPlatform = Capacitor.getPlatform();

  let platform: Platform;
  let isApplePlatform = false;
  let isNative = false;

  switch (capacitorPlatform) {
    case 'ios':
      platform = 'ios';
      isApplePlatform = true;
      isNative = true;
      break;
    case 'android':
      platform = 'android';
      isNative = true;
      break;
    case 'web':
    default:
      // Check if running on macOS Safari (could use CloudKit.js)
      const isMacOS = navigator.platform.toUpperCase().includes('MAC');
      if (isMacOS) {
        platform = 'macos';
        isApplePlatform = true;
      } else {
        platform = 'web';
      }
      break;
  }

  // Apple platforms use CloudKit, others use Google Drive
  const recommendedBackend: StorageBackend = isApplePlatform ? 'cloudkit' : 'googledrive';

  // CloudKit supports real-time sync via subscriptions, Google Drive requires polling
  const supportsRealTimeSync = isApplePlatform;

  return {
    platform,
    isApplePlatform,
    isNative,
    recommendedBackend,
    supportsRealTimeSync,
  };
}

// Singleton for the current platform info
let cachedPlatformInfo: PlatformInfo | null = null;

export function getPlatformInfo(): PlatformInfo {
  if (!cachedPlatformInfo) {
    cachedPlatformInfo = detectPlatform();
  }
  return cachedPlatformInfo;
}
