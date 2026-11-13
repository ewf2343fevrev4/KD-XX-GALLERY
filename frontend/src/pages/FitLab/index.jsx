import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import FitLabStudio from './FitLabStudio';
import StylingStudio from './StylingStudio';
import VirtualTryOnStudio from './VirtualTryOn/VirtualTryOnStudio';
import { Layers, LayoutGrid, Sparkles } from 'lucide-react';
import './FitLab.css';

export default function FitLabPage({ onSearch, selectedCategory, onCategoryChange }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const initialMode = modeParam === 'styling' ? 'styling' : modeParam === 'tryon' ? 'tryon' : 'canvas';
  const [activeMode, setActiveMode] = useState(initialMode);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (activeMode === 'canvas') {
      document.title = 'KD-XX FIT LAB — Mix & Match Canvas Studio';
    } else if (activeMode === 'styling') {
      document.title = 'KD-XX FIT LAB — 3-Row Styling Studio';
    } else if (activeMode === 'tryon') {
      document.title = 'KD-XX FIT LAB — Virtual Try-On AI (Google Cloud)';
    }
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
            <button
              type="button"
              className={`fit-lab-mode-btn ${activeMode === 'tryon' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('tryon')}
            >
              <Sparkles size={15} />
              <span>Virtual Try-On AI</span>
              <span className="fit-lab-mode-pill">AI</span>
            </button>
          </div>
        </div>

        {/* All studios maintain 100% independent state */}
        <div className={`fit-lab-view-wrapper ${activeMode === 'canvas' ? 'active' : 'hidden'}`}>
          <FitLabStudio />
        </div>

        <div className={`fit-lab-view-wrapper ${activeMode === 'styling' ? 'active' : 'hidden'}`}>
          <StylingStudio />
        </div>

        <div className={`fit-lab-view-wrapper ${activeMode === 'tryon' ? 'active' : 'hidden'}`}>
          <VirtualTryOnStudio />
        </div>
      </div>

      <Footer />
    </div>
  );
}
