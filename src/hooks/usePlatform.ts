import { useMemo } from 'react';
import { getPlatformInfo, type PlatformInfo } from '../services/platform';

/**
 * Hook to get the current platform information.
 * Returns cached platform info (doesn't change during runtime).
 */
export function usePlatform(): PlatformInfo {
  return useMemo(() => getPlatformInfo(), []);
}
