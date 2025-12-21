import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase/config';
import type { MigrationProgress } from '../platform/types';
import { migrationService } from './MigrationService';
import { CloudKitProvider } from '../storage/CloudKitProvider';
import './MigrationUI.css';

interface MigrationUIProps {
  newUserId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function MigrationUI({
  newUserId,
  onComplete,
  onCancel,
}: MigrationUIProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'login' | 'confirm' | 'migrating' | 'done'>('login');
  const [memoryCount, setMemoryCount] = useState(0);
  const [progress, setProgress] = useState<MigrationProgress>({
    status: 'idle',
    totalItems: 0,
    completedItems: 0,
  });
  const [firebaseUserId, setFirebaseUserId] = useState<string | null>(null);

  const handleFirebaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      setFirebaseUserId(result.user.uid);

      // Check how many memories exist
      const { memoryCount } = await migrationService.checkMigrationNeeded(result.user.uid);
      setMemoryCount(memoryCount);
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleMigrate = async () => {
    if (!firebaseUserId) return;

    setStep('migrating');
    migrationService.setProgressCallback(setProgress);

    const targetProvider = new CloudKitProvider();

    const result = await migrationService.performFullMigration(
      firebaseUserId,
      targetProvider,
      newUserId
    );

    if (result.success) {
      setStep('done');
      setTimeout(onComplete, 2000);
    } else {
      setError(result.error || 'Migration failed');
      setStep('confirm');
    }
  };

  const percentage = progress.totalItems > 0
    ? Math.round((progress.completedItems / progress.totalItems) * 100)
    : 0;

  return (
    <div className="migration-container">
      <div className="migration-card">
        {step === 'login' && (
          <>
            <h2>Import from Firebase</h2>
            <p>Sign in with your old Firebase account to import your memories.</p>
            <form onSubmit={handleFirebaseLogin}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '8px', border: '1px solid #ddd' }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #ddd' }}
              />
              {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
              <button type="submit" className="migration-button">
                Sign In & Check
              </button>
              <button type="button" className="migration-button secondary" onClick={onCancel}>
                Cancel
              </button>
            </form>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2>Ready to Import</h2>
            <p>Found <strong>{memoryCount}</strong> memories to import.</p>
            <p>They will be copied to your iCloud account.</p>
            {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
            <button className="migration-button" onClick={handleMigrate}>
              Start Import
            </button>
            <button className="migration-button secondary" onClick={onCancel}>
              Cancel
            </button>
          </>
        )}

        {step === 'migrating' && (
          <>
            <h2>Importing Memories...</h2>
            <div className="migration-progress-bar">
              <div className="migration-progress-fill" style={{ width: `${percentage}%` }}></div>
            </div>
            <p>{progress.currentItem || 'Starting...'}</p>
            <p>{progress.completedItems} of {progress.totalItems}</p>
          </>
        )}

        {step === 'done' && (
          <>
            <h2>Import Complete!</h2>
            <p>Your memories are now in your iCloud.</p>
          </>
        )}
      </div>
    </div>
  );
}
