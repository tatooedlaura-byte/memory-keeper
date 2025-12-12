import { useState, useEffect } from 'react';
import './SearchBar.css';

interface SearchBarProps {
  onSearch: (term: string) => void;
  totalCount: number;
  filteredCount: number;
}

export function SearchBar({ onSearch, totalCount, filteredCount }: SearchBarProps) {
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      onSearch(searchTerm);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchTerm, onSearch]);

  const isFiltered = searchTerm.trim() !== '';

  return (
    <div className="search-bar-container">
      <div className="search-bar">
        <span className="search-icon">Search</span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search memories by text or tag..."
        />
        {searchTerm && (
          <button
            className="clear-search"
            onClick={() => setSearchTerm('')}
          >
            x
          </button>
        )}
      </div>
      <div className="search-count">
        {isFiltered ? (
          <span>
            Found <strong>{filteredCount}</strong> of {totalCount} memories
          </span>
        ) : (
          <span>
            <strong>{totalCount}</strong> {totalCount === 1 ? 'memory' : 'memories'}
          </span>
        )}
      </div>
    </div>
  );
}
