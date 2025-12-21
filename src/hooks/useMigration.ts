import { useState, useEffect, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';
import { migrationService } from '../services/migration';

const MIGRATION_COMPLETED_KEY = 'migration_completed';
const MIGRATION_SKIPPED_KEY = 'migration_skipped';

interface UseMigrationReturn {
  needsMigration: boolean;
  checking: boolean;
  memoryCount: number;
  markCompleted: () => Promise<void>;
  markSkipped: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useMigration(firebaseUserId: string | undefined): UseMigrationReturn {
  const [checking, setChecking] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);

  useEffect(() => {
    async function check() {
      if (!firebaseUserId) {
        setChecking(false);
        setNeedsMigration(false);
        return;
      }

      // Check if migration was already completed or skipped
      const [completed, skipped] = await Promise.all([
        Preferences.get({ key: MIGRATION_COMPLETED_KEY }),
        Preferences.get({ key: MIGRATION_SKIPPED_KEY }),
      ]);

      if (completed.value === 'true' || skipped.value === 'true') {
        setChecking(false);
        setNeedsMigration(false);
        return;
      }

      // Check Firebase for data
      const { needed, memoryCount } = await migrationService.checkMigrationNeeded(
        firebaseUserId
      );

      setMemoryCount(memoryCount);
      setNeedsMigration(needed);
      setChecking(false);
    }

    check();
  }, [firebaseUserId]);

  const markCompleted = useCallback(async () => {
    await Preferences.set({ key: MIGRATION_COMPLETED_KEY, value: 'true' });
    setNeedsMigration(false);
  }, []);

  const markSkipped = useCallback(async () => {
    await Preferences.set({ key: MIGRATION_SKIPPED_KEY, value: 'true' });
    setNeedsMigration(false);
  }, []);

  const reset = useCallback(async () => {
    await Promise.all([
      Preferences.remove({ key: MIGRATION_COMPLETED_KEY }),
      Preferences.remove({ key: MIGRATION_SKIPPED_KEY }),
    ]);
    setNeedsMigration(true);
  }, []);

  return {
    needsMigration,
    checking,
    memoryCount,
    markCompleted,
    markSkipped,
    reset,
  };
}
