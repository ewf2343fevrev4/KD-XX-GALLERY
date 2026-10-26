import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import FitLabStudio from './FitLabStudio';
import StylingStudio from './StylingStudio';
import { Layers, LayoutGrid } from 'lucide-react';
import './FitLab.css';

export default function FitLabPage({ onSearch, selectedCategory, onCategoryChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'styling' ? 'styling' : 'canvas';
  const [activeMode, setActiveMode] = useState(initialMode);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    document.title = activeMode === 'canvas'
      ? 'KD-XX FIT LAB — Mix & Match Canvas Studio'
      : 'KD-XX FIT LAB — 3-Row Styling Studio';
  }, [activeMode]);

  const handleModeSwitch = (mode) => {
    setActiveMode(mode);
    setSearchParams({ mode });
  };

  return (
    <div className="fit-lab-page">
      <Header
        onSearch={onSearch}
        onCategoryChange={onCategoryChange}
        selectedCategory={selectedCategory}
      />

      <div className="fit-lab-container">
        {/* Studio Mode Selector */}
        <div className="fit-lab-mode-bar">
          <div className="fit-lab-mode-switch">
            <button
              type="button"
              className={`fit-lab-mode-btn ${activeMode === 'canvas' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('canvas')}
            >
              <LayoutGrid size={15} />
              <span>Canvas Studio</span>
            </button>
            <button
              type="button"
              className={`fit-lab-mode-btn ${activeMode === 'styling' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('styling')}
            >
              <Layers size={15} />
              <span>Styling Studio</span>
              <span className="fit-lab-mode-pill">New</span>
            </button>
          </div>
        </div>

        {/* Both studios maintain 100% independent state */}
        <div className={`fit-lab-view-wrapper ${activeMode === 'canvas' ? 'active' : 'hidden'}`}>
          <FitLabStudio />
        </div>

        <div className={`fit-lab-view-wrapper ${activeMode === 'styling' ? 'active' : 'hidden'}`}>
          <StylingStudio />
        </div>
      </div>

      <Footer />
    </div>
  );
}
