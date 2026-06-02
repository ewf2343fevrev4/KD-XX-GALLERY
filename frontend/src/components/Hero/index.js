import React from 'react';
import './Hero.css';

const Hero = () => {
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
      <div className="hero-content">
        <h1 className="hero-title">AMIRI</h1>
        <p className="hero-subtitle">Luxury Streetwear Redefined</p>
        <a 
          href="#products-section" 
          className="cta-button"
          onClick={handleExploreClick}
        >
          Explore Collection
        </a>
      </div>
      
      {/* Floating Elements */}
      <div className="floating-element floating-1"></div>
      <div className="floating-element floating-2"></div>
      <div className="floating-element floating-3"></div>
    </section>
  );
};

export default Hero;