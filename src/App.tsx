import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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

  const handleExport = useCallback(async () => {
    if (memories.length === 0) {
      alert('No memories to export');
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalMemories: memories.length,
      memories: memories.map((m) => ({
        id: m.id,
        text: m.text,
        tags: m.tags,
        media: m.media,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const fileName = `memory-keeper-backup-${new Date().toISOString().split('T')[0]}.json`;

    if (Capacitor.isNativePlatform()) {
      try {
        console.log('[Export] Writing file...');
        // Write file to cache directory
        const result = await Filesystem.writeFile({
          path: fileName,
          data: jsonString,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        console.log('[Export] File written to:', result.uri);

        // Share the file
        console.log('[Export] Opening share sheet...');
        await Share.share({
          title: 'Memory Keeper Backup',
          url: result.uri,
          dialogTitle: 'Save your backup',
        });
        console.log('[Export] Share complete');
      } catch (error: any) {
        console.error('[Export] Error:', error?.message || error);
        alert(`Export failed: ${error?.message || 'Unknown error'}`);
      }
    } else {
      // Web fallback
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, [memories]);

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
        showAppleSignIn={Capacitor.isNativePlatform()}
      />
    );
  }

  return (
    <div className="app">
      <div className="app-container">
        <Header onLogout={signOut} onExport={handleExport} userEmail={user.email} />

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
