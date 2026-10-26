import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import coupleOutfitImg from '../../assets/couple-outfit.jpg';
import homieOutfitImg from '../../assets/homie-outfit.jpg';
import './EditorialShowcaseSection.css';

const DEFAULT_LEFT = [
  {
    imageUrl: coupleOutfitImg,
    eyebrow: 'WINTER CAPSULE · CO-ORD',
    title: 'COUPLE OUTFIT',
    description: 'High-altitude alpine glamour meets coordinated dark luxury. Sculpted high-shine puffers, plush fur finishes, and an effortless synchronized silhouette designed for two.'
  }
];

const DEFAULT_RIGHT = [
  {
    imageUrl: homieOutfitImg,
    eyebrow: 'STREET CULTURE · BROTHERHOOD',
    title: 'OUTFIT WITH HOMIE',
    description: 'Unfiltered urban presence and bonded brotherhood. Layered technical tracksuits, statement iced chains, and authentic street silhouettes rooted in the pulse of modern streetwear.'
  }
];

/**
 * ShowcaseColumn
 * Independent Column with diagonal bottom-right to top-left transition
 * Runs independently on its own timer & state.
 */
function ShowcaseColumn({ items = [], side = 'left', autoInterval = 4500 }) {
  const safeItems = Array.isArray(items) && items.length > 0 
    ? items 
    : (side === 'left' ? DEFAULT_LEFT : DEFAULT_RIGHT);
  const total = safeItems.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(null);
  const [direction, setDirection] = useState('next'); // 'next' (bottom-right to top-left) | 'prev'
  const [isAnimating, setIsAnimating] = useState(false);

  const isAnimatingRef = useRef(false);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;

  // Auto reset index if items length changes
  useEffect(() => {
    if (currentIndex >= total) {
      setCurrentIndex(0);
    }
  }, [total, currentIndex]);

  const goToNext = useCallback(() => {
    if (total <= 1 || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setIsAnimating(true);
    setDirection('next');

    const curr = currentIndexRef.current;
    const next = (curr + 1) % total;
    setPrevIndex(curr);
    setCurrentIndex(next);

    setTimeout(() => {
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setPrevIndex(null);
    }, 950);
  }, [total]);

  const goToPrev = useCallback(() => {
    if (total <= 1 || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setIsAnimating(true);
    setDirection('prev');

    const curr = currentIndexRef.current;
    const prev = (curr - 1 + total) % total;
    setPrevIndex(curr);
    setCurrentIndex(prev);

    setTimeout(() => {
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setPrevIndex(null);
    }, 950);
  }, [total]);

  const goToIndex = useCallback((targetIndex) => {
    if (total <= 1 || isAnimatingRef.current || targetIndex === currentIndexRef.current) return;
    isAnimatingRef.current = true;
    setIsAnimating(true);
    const curr = currentIndexRef.current;
    setDirection(targetIndex > curr ? 'next' : 'prev');
    setPrevIndex(curr);
    setCurrentIndex(targetIndex);

    setTimeout(() => {
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setPrevIndex(null);
    }, 950);
  }, [total]);

  // Robust Auto-slide Interval
  useEffect(() => {
    if (total <= 1) return;

    const timer = setInterval(() => {
      goToNext();
    }, autoInterval);

    return () => clearInterval(timer);
  }, [total, autoInterval, goToNext]);

  const currentItem = safeItems[currentIndex] || safeItems[0];
  const prevItem = prevIndex !== null ? safeItems[prevIndex] : null;

  return (
    <article className={`editorial-card editorial-card--${side} ${total > 1 ? 'has-multiple' : ''}`}>
      {/* Viewport for diagonal transition */}
      <div className="editorial-card__slider-viewport">
        {/* Outgoing previous slide */}
        {prevItem && isAnimating && (
          <div 
            key={`prev-${prevIndex}`} 
            className={`editorial-card__slide is-exiting direction-${direction}`}
          >
            <div className="editorial-card__image-wrap">
              <img 
                src={prevItem.imageUrl} 
                alt={prevItem.title} 
                className="editorial-card__image"
                onError={(e) => {
                  e.target.src = side === 'left' ? coupleOutfitImg : homieOutfitImg;
                }}
              />
              <div className="editorial-card__overlay" />
            </div>
          </div>
        )}

        {/* Current active slide */}
        <div 
          key={`curr-${currentIndex}`} 
          className={`editorial-card__slide is-active ${isAnimating ? `is-entering direction-${direction}` : ''}`}
        >
          <div className="editorial-card__image-wrap">
            <img 
              src={currentItem.imageUrl} 
              alt={currentItem.title} 
              className="editorial-card__image"
              onError={(e) => {
                e.target.src = side === 'left' ? coupleOutfitImg : homieOutfitImg;
              }}
            />
            <div className="editorial-card__overlay" />
          </div>
        </div>
      </div>

      {/* Editorial Content Block */}
      <div className={`editorial-card__content ${isAnimating ? 'text-transition' : ''}`}>
        <span className="editorial-card__eyebrow">
          {currentItem.eyebrow || (side === 'left' ? 'WINTER CAPSULE · CO-ORD' : 'STREET CULTURE · BROTHERHOOD')}
        </span>
        <h3 className="editorial-card__title">{currentItem.title}</h3>
        <p className="editorial-card__description" style={{ whiteSpace: 'pre-line' }}>
          {currentItem.description}
        </p>
      </div>

      {/* Independent Navigation Controls & Indicator when multiple photos exist */}
      {total > 1 && (
        <div className="editorial-card__controls">
          <div className="editorial-card__counter">
            <span className="current-num">{String(currentIndex + 1).padStart(2, '0')}</span>
            <span className="slash">/</span>
            <span className="total-num">{String(total).padStart(2, '0')}</span>
          </div>

          {/* Clickable indicator dots for direct jump */}
          <div className="editorial-card__dots">
            {safeItems.map((_, dotIdx) => (
              <button
                key={dotIdx}
                type="button"
                className={`editorial-dot ${dotIdx === currentIndex ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); goToIndex(dotIdx); }}
                aria-label={`Chuyển tới ảnh ${dotIdx + 1}`}
                title={`Ảnh ${dotIdx + 1}`}
              />
            ))}
          </div>

          <div className="editorial-card__nav-buttons">
            <button 
              type="button" 
              className="editorial-nav-btn prev-btn" 
              onClick={(e) => { e.stopPropagation(); goToPrev(); }}
              aria-label="Previous Outfit Image"
              title="Ảnh trước"
            >
              <ChevronUp size={18} />
            </button>
            <button 
              type="button" 
              className="editorial-nav-btn next-btn" 
              onClick={(e) => { e.stopPropagation(); goToNext(); }}
              aria-label="Next Outfit Image"
              title="Ảnh tiếp theo (Chuyển chéo)"
            >
              <ChevronDown size={18} />
            </button>
          </div>

          {/* Independent Auto-slide Progress Bar */}
          <div className="editorial-card__progress-wrap">
            <div 
              key={currentIndex}
              className="editorial-card__progress-bar is-running"
              style={{ animationDuration: `${autoInterval}ms` }}
            />
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * EditorialShowcaseSection
 * Ultra-clean full-bleed 2-column showcase inspired by AMIRI official website.
 * Left & Right sides move up/down independently with diagonal transition.
 */
const EditorialShowcaseSection = ({ showcaseLeft = [], showcaseRight = [] }) => {
  return (
    <section 
      className="campaign-editorial-showcase" 
      id="editorial-curations"
      aria-label="Editorial Outfits Showcase"
    >
      <div className="campaign-editorial-showcase__grid">
        {/* Left Column - Independent 4.8s interval */}
        <ShowcaseColumn 
          items={showcaseLeft} 
          side="left" 
          autoInterval={4800} 
        />

        {/* Right Column - Independent 5.8s interval */}
        <ShowcaseColumn 
          items={showcaseRight} 
          side="right" 
          autoInterval={5800} 
        />
      </div>
    </section>
  );
};

export default EditorialShowcaseSection;
