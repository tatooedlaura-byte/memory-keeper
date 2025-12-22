import { useState } from 'react';
import './AuthForm.css';

interface AuthFormProps {
  onSignInWithApple: () => Promise<void>;
  onSignInWithGoogle: () => Promise<void>;
  onSignInWithEmail?: (email: string, password: string) => Promise<void>;
  onRegister?: (email: string, password: string) => Promise<void>;
  error: string | null;
  onBack?: () => void;
}

export function AuthForm({
  onSignInWithApple,
  onSignInWithGoogle,
  onSignInWithEmail,
  onRegister,
  error,
  onBack,
}: AuthFormProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAppleSignIn = async () => {
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onSignInWithApple();
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onSignInWithGoogle();
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Please fill in all fields');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin && onSignInWithEmail) {
        await onSignInWithEmail(email, password);
      } else if (!isLogin && onRegister) {
        await onRegister(email, password);
      }
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Memory Keeper</h1>
          <p>Your private space for cherished memories</p>
        </div>

        {!showEmailForm ? (
          <div className="auth-oauth">
            <button
              className="oauth-button apple"
              onClick={handleAppleSignIn}
              disabled={isSubmitting}
            >
              <span className="oauth-icon"></span>
              <span>Sign in with Apple</span>
            </button>

            <button
              className="oauth-button google"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
            >
              <span className="oauth-icon">G</span>
              <span>Sign in with Google</span>
            </button>

            <p className="auth-storage-note">
              Apple uses iCloud, Google uses Google Drive
            </p>

            {(onSignInWithEmail || onRegister) && (
              <>
                <div className="auth-divider">
                  <span>or</span>
                </div>
                <button
                  className="email-toggle"
                  onClick={() => setShowEmailForm(true)}
                >
                  Continue with Email
                </button>
              </>
            )}

            {(localError || error) && (
              <div className="error-message">{localError || error}</div>
            )}

            {onBack && (
              <button type="button" className="back-button" onClick={onBack}>
                Back
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                className={`auth-tab ${isLogin ? 'active' : ''}`}
                onClick={() => setIsLogin(true)}
              >
                Sign In
              </button>
              <button
                className={`auth-tab ${!isLogin ? 'active' : ''}`}
                onClick={() => setIsLogin(false)}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={isSubmitting}
                />
              </div>

              {!isLogin && (
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {(localError || error) && (
                <div className="error-message">{localError || error}</div>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? 'Please wait...'
                  : isLogin
                  ? 'Sign In'
                  : 'Create Account'}
              </button>

              <button
                type="button"
                className="back-button"
                onClick={() => setShowEmailForm(false)}
              >
                Back to Sign In Options
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
