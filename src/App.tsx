import { useState, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useMemories } from './hooks/useMemories';
import { LandingPage } from './components/LandingPage';
import { AuthForm } from './components/AuthForm';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { MemoryCard } from './components/MemoryCard';
import { NewMemoryForm } from './components/NewMemoryForm';
import type { Memory } from './types/Memory';
import './App.css';

function App() {
  const {
    user,
    loading: authLoading,
    error: authError,
    providerType,
    signInWithApple,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const {
    memories,
    loading: memoriesLoading,
    addMemory,
    updateMemory,
    deleteMemory,
    removeMedia,
    searchMemories,
  } = useMemories(user?.id, providerType);

  const [filteredMemories, setFilteredMemories] = useState<Memory[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showLanding, setShowLanding] = useState(true);

  const handleSearch = useCallback(
    (term: string) => {
      if (term.trim()) {
        setFilteredMemories(searchMemories(term));
        setIsSearching(true);
      } else {
        setFilteredMemories([]);
        setIsSearching(false);
      }
    },
    [searchMemories]
  );

  const displayMemories = isSearching ? filteredMemories : memories;

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    if (showLanding) {
      return <LandingPage onGetStarted={() => setShowLanding(false)} />;
    }

    return (
      <AuthForm
        onSignInWithApple={signInWithApple}
        onSignInWithGoogle={signInWithGoogle}
        error={authError}
        onBack={() => setShowLanding(true)}
      />
    );
  }

  return (
    <div className="app">
      <div className="app-container">
        <Header onLogout={signOut} userEmail={user.email} />

        <SearchBar
          onSearch={handleSearch}
          totalCount={memories.length}
          filteredCount={filteredMemories.length}
        />

        {memoriesLoading ? (
          <div className="memories-loading">
            <div className="loading-spinner"></div>
            <p>Loading your memories...</p>
          </div>
        ) : displayMemories.length > 0 ? (
          <div className="memories-list">
            {displayMemories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onUpdate={updateMemory}
                onDelete={deleteMemory}
                onRemoveMedia={removeMedia}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {isSearching ? (
              <>
                <div className="empty-icon">?</div>
                <h2>No memories found</h2>
                <p>Try searching for different keywords or tags</p>
              </>
            ) : (
              <>
                <div className="empty-icon">+</div>
                <h2>Start Your Memory Collection</h2>
                <p>Tap the button below to capture your first memory</p>
              </>
            )}
          </div>
        )}

        <NewMemoryForm onSubmit={addMemory} />
      </div>
    </div>
  );
}

export default App;
