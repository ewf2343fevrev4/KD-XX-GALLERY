import React, { useState } from 'react';
import BrandShowcase from './BrandShowcase';
import WaterWaveBackground from './WaterWaveBackground';
import './Hero.css';

const Hero = ({ selectedBrand, onSelectBrand }) => {
  const [hoveredBrand, setHoveredBrand] = useState(null);

  const handleExploreClick = (e) => {
    e.preventDefault();
    const productsSection = document.getElementById('products-section');
    
    if (productsSection) {
      const elementPosition = productsSection.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - 150;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="hero" id="home">
      {/* ── Interactive Water Ripple & Color Wave Canvas Background ── */}
      <WaterWaveBackground activeTarget={hoveredBrand} />

      {/* ── 3D Circular Brand Universe Showcase (8 Logos) ── */}
      <BrandShowcase 
        onHoverBrand={setHoveredBrand}
        selectedBrand={selectedBrand}
        onSelectBrand={onSelectBrand}
      />

      {/* ── Preserved Central Hero Content ── */}
      <div className="hero-content">
        <h1 className="hero-title">KD-XX</h1>
        <p className="hero-subtitle">Luxury Streetwear Redefined</p>
        <a 
          href="#products-section" 
          className="cta-button"
          onClick={handleExploreClick}
        >
          Explore Collection
        </a>
      </div>
    </section>
  );
};

export default Hero;