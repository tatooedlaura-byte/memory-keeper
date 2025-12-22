import './LandingPage.css';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="landing-container">
      <div className="landing-content">
        <div className="landing-icon">M</div>
        <h1 className="landing-title">Memory Keeper</h1>
        <p className="landing-tagline">
          Capture and preserve your precious moments, safely stored in the cloud.
        </p>

        <div className="landing-features">
          <div className="feature">
            <span className="feature-icon">*</span>
            <span>Photos, audio & video</span>
          </div>
          <div className="feature">
            <span className="feature-icon">*</span>
            <span>Organize with tags</span>
          </div>
          <div className="feature">
            <span className="feature-icon">*</span>
            <span>Synced across devices</span>
          </div>
        </div>

        <div className="landing-buttons">
          <button className="landing-cta" onClick={onGetStarted}>
            Get Started
          </button>
          <button className="landing-login" onClick={onGetStarted}>
            Log In
          </button>
        </div>

        <p className="landing-privacy">
          Your memories stay private and secure
        </p>
      </div>
    </div>
  );
}
