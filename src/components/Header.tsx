import './Header.css';

interface HeaderProps {
  onLogout: () => void;
  userEmail?: string;
}

export function Header({ onLogout, userEmail }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <h1>Memory Keeper</h1>
      </div>
      <div className="header-user">
        {userEmail && (
          <span className="user-email">{userEmail}</span>
        )}
        <button className="logout-btn" onClick={onLogout}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
