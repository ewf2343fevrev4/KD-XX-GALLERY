import React, { useState, useEffect, useRef } from 'react';
import './SearchBox.css';

const SearchBox = ({ onSearch, products, isSearchActive, setIsSearchActive }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);

  // Filter suggestions based on query
  useEffect(() => {
    if (query.length > 0) {
      const filtered = products
        .filter(product => {
          const name = product?.name || "";
          const category = product?.category || "";
          return (
            name.toLowerCase().includes(query.toLowerCase()) ||
            category.toLowerCase().includes(query.toLowerCase())
          );
        })
        .slice(0, 5); // Limit to 5 suggestions

      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query, products]);

  // Handle search input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    onSearch(value);
  };

  // Handle suggestion click
  const handleSuggestionClick = (product) => {
    setQuery(product?.name || "");
    onSearch(product?.name || "");
    setShowSuggestions(false);
    setIsSearchActive(false);
  };

  // Handle search submit
  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(query);
    setShowSuggestions(false);
    if (query.trim()) {
      setIsSearchActive(false);
    }
  };

  // Handle click outside to close search
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
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
    setShowSuggestions(false);
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

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="suggestions-dropdown">
          {suggestions.map((product, index) => (
            <div
              key={product?.id || index}
              className="suggestion-item"
              onClick={() => handleSuggestionClick(product)}
            >
              <div className="suggestion-image">
                {product?.image && <img src={product.image} alt={product?.name || "Product"} />}
              </div>
              <div className="suggestion-details">
                <h4>{product?.name || "Unnamed product"}</h4>
                <p>${product?.price ?? "N/A"}</p>
                <span className="suggestion-category">{product?.category || "Unknown"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results message */}
      {showSuggestions && query && suggestions.length === 0 && (
        <div className="suggestions-dropdown">
          <div className="no-results">
            <p>No products found for "{query}"</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBox;
