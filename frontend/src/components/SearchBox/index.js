import React, { useState, useEffect, useRef } from 'react';
import './SearchBox.css';

const SearchBox = ({ onSearch, isSearchActive, setIsSearchActive }) => {
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const inputRef = useRef(null);

  // Handle search input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    onSearch(value);
  };

  // Handle search submit
  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(query);
    if (query.trim()) {
      setIsSearchActive(false);
    }
  };

  // Handle click outside to close search
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        if (!query.trim()) {
          setIsSearchActive(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [query, setIsSearchActive]);

  // Focus input when search becomes active
  useEffect(() => {
    if (isSearchActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchActive]);

  // Clear search
  const clearSearch = () => {
    setQuery('');
    onSearch('');
    setIsSearchActive(false);
  };

  return (
    <div className={`search-box ${isSearchActive ? 'active' : ''}`} ref={searchRef}>
      <form onSubmit={handleSubmit} className="search-form">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search products..."
          className="search-input"
        />
        {query && (
          <button type="button" className="clear-btn" onClick={clearSearch}>
            ×
          </button>
        )}
        <button type="submit" className="search-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
        </button>
      </form>
    </div>
  );
};

export default SearchBox;
