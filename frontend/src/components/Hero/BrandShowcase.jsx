import React, { useState, useEffect, useRef, useCallback } from 'react';
import './BrandShowcase.css';

/**
 * Exactly eight authentic fashion-brand logos arranged in a balanced circular orbit:
 * 1. AMIRI monogram
 * 2. Chrome Hearts cross-and-lettering emblem
 * 3. Hellstar flame-profile emblem
 * 4. Moncler cockerel emblem
 * 5. Nike Swoosh
 * 6. A Bathing Ape (BAPE) ape-head emblem
 * 7. Moose Knuckles emblem
 * 8. Trapstar Gothic 'T' cross emblem
 */
const BRAND_LOGOS = [
  {
    id: 'amiri',
    name: 'AMIRI',
    aliases: ['amiri'],
    subtitle: 'Monogram',
    src: '/brands/amiri.png',
    angle: 270, // 12 o'clock (Top)
  },
  {
    id: 'chrome-hearts',
    name: 'CHROME HEARTS',
    aliases: ['chrome hearts', 'chromehearts'],
    subtitle: 'Horseshoe Cross',
    src: '/brands/chrome-hearts.png',
    angle: 315, // 1:30 (Top-Right)
  },
  {
    id: 'hellstar',
    name: 'HELLSTAR',
    aliases: ['hellstar', 'hell star'],
    subtitle: 'Flame Profile',
    src: '/brands/hellstar.png',
    angle: 0, // 3 o'clock (Right)
  },
  {
    id: 'moncler',
    name: 'MONCLER',
    aliases: ['moncler'],
    subtitle: 'Cockerel Badge',
    src: '/brands/moncler.png',
    angle: 45, // 4:30 (Bottom-Right)
  },
  {
    id: 'nike',
    name: 'NIKE',
    aliases: ['nike'],
    subtitle: 'Swoosh',
    src: '/brands/nike.png',
    angle: 90, // 6 o'clock (Bottom)
  },
  {
    id: 'bape',
    name: 'A BATHING APE',
    aliases: ['bape', 'a bathing ape', 'abathingape'],
    subtitle: 'Ape Head',
    src: '/brands/bape.png',
    angle: 135, // 7:30 (Bottom-Left)
  },
  {
    id: 'moose-knuckles',
    name: 'MOOSE KNUCKLES',
    aliases: ['moose knuckles', 'mooseknuckles', 'moose-knuckles'],
    subtitle: 'Iconic Profile',
    src: '/brands/moose-knuckles.png',
    angle: 180, // 9 o'clock (Left)
  },
  {
    id: 'trapstar',
    name: 'TRAPSTAR',
    aliases: ['trapstar', 'trap star'],
    subtitle: 'Gothic Cross',
    src: '/brands/trapstar.png',
    angle: 225, // 10:30 (Top-Left)
  },
];

/**
 * Individual Brand Logo with mouse-follow 3D tilt, 360-degree rotation, and click filter
 */
const BrandLogoItem = ({ logo, x, y, onHover, onLeave, isSelected, onSelect }) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const cardRef = useRef(null);

  // Mouse-follow 3D tilt
  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;

    // Smooth restrained tilt (±14 deg max)
    setTilt({
      x: Math.round(-relY * 26 * 10) / 10,
      y: Math.round(relX * 26 * 10) / 10,
    });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    // Trigger full 360-degree rotation
    setIsSpinning(true);
    if (onHover) onHover(logo, x, y);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Smoothly return to flat resting position
    setTilt({ x: 0, y: 0 });
    if (onLeave) onLeave();
  };

  const handleAnimationEnd = () => {
    // Reset so next hover triggers a fresh 360 rotation cleanly
    setIsSpinning(false);
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSelect) {
      onSelect(logo);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onSelect) {
        onSelect(logo);
      }
    }
  };

  const handleTouchStart = () => {
    setIsHovered(true);
    setIsSpinning(true);
    if (onHover) onHover(logo, x, y);
    setTimeout(() => {
      setIsHovered(false);
      if (onLeave) onLeave();
    }, 1100);
  };

  return (
    <div
      className="brand-logo-anchor"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
      }}
    >
      <div
        ref={cardRef}
        className={`brand-logo-tilt ${isHovered ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`}
        style={{
          transform: isHovered
            ? `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(1.12, 1.12, 1)`
            : isSelected
            ? 'perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1.08, 1.08, 1)'
            : 'perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Lọc sản phẩm thương hiệu ${logo.name}`}
        aria-pressed={isSelected}
      >
        <div
          className={`brand-logo-spin ${isSpinning ? 'is-spinning' : ''}`}
          onAnimationEnd={handleAnimationEnd}
        >
          <div className={`brand-logo-card brand-logo-card--${logo.id}`}>
            <img
              src={logo.src}
              alt={`${logo.name} logo`}
              className="brand-logo-image"
              loading="eager"
              draggable="false"
            />
            <div className="brand-logo-glow" />
            {isSelected && (
              <span className="brand-selected-indicator" title="Đang lọc">
                ✓
              </span>
            )}
          </div>
        </div>

        <div className="brand-logo-tooltip">
          <span>{logo.name}</span>
          {isSelected && <span className="brand-tooltip-active"> (Đang lọc)</span>}
        </div>
      </div>
    </div>
  );
};

const BrandShowcase = ({ onHoverBrand, selectedBrand, onSelectBrand }) => {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  });

  const handleResize = useCallback(() => {
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const handleLogoHover = useCallback(
    (logo, x, y) => {
      if (onHoverBrand) {
        onHoverBrand({
          id: logo.id,
          name: logo.name,
          x: dimensions.width / 2 + x,
          y: dimensions.height / 2 + y,
        });
      }
    },
    [dimensions.width, dimensions.height, onHoverBrand]
  );

  const handleLogoLeave = useCallback(() => {
    if (onHoverBrand) {
      onHoverBrand(null);
    }
  }, [onHoverBrand]);

  // Compute responsive orbit radii that surround central content without overlap
  const getOrbitRadii = () => {
    const { width, height } = dimensions;

    if (width < 480) {
      // Extra small mobile portrait
      return {
        rx: Math.min(width * 0.38, 140),
        ry: Math.min(height * 0.28, 205),
      };
    } else if (width < 768) {
      // Mobile portrait
      return {
        rx: Math.min(width * 0.38, 160),
        ry: Math.min(height * 0.29, 220),
      };
    } else if (width < 992) {
      // Tablet
      return {
        rx: Math.min(width * 0.34, 250),
        ry: Math.min(height * 0.28, 200),
      };
    } else if (width < 1200) {
      // Small laptop
      return {
        rx: Math.min(width * 0.32, 330),
        ry: Math.min(height * 0.28, 225),
      };
    } else if (width < 1500) {
      // Standard desktop: guarantees clean clearance below header & above AMIRI title
      const maxRy = Math.min(height * 0.29, 245);
      return {
        rx: 380,
        ry: Math.max(maxRy, 215),
      };
    } else {
      // Ultra-wide desktop
      const maxRy = Math.min(height * 0.30, 265);
      return {
        rx: 420,
        ry: Math.max(maxRy, 230),
      };
    }
  };

  const { rx, ry } = getOrbitRadii();

  return (
    <div className="brand-showcase" aria-hidden="false">
      {/* Subtle decorative orbit ring guide */}
      <div
        className="brand-showcase__ring"
        style={{
          width: `${rx * 2}px`,
          height: `${ry * 2}px`,
        }}
      />

      {/* Exactly 8 Brand Logo positions around the central AMIRI content */}
      {BRAND_LOGOS.map((logo) => {
        const rad = (logo.angle * Math.PI) / 180;
        const x = Math.round(rx * Math.cos(rad));
        const y = Math.round(ry * Math.sin(rad));

        const isSelected = Boolean(
          selectedBrand && (
            (typeof selectedBrand === 'string' && (
              selectedBrand.toLowerCase() === logo.id.toLowerCase() ||
              selectedBrand.toLowerCase() === logo.name.toLowerCase()
            )) ||
            (typeof selectedBrand === 'object' && (
              selectedBrand.id === logo.id ||
              selectedBrand.name?.toLowerCase() === logo.name.toLowerCase()
            ))
          )
        );

        return (
          <BrandLogoItem
            key={logo.id}
            logo={logo}
            x={x}
            y={y}
            isSelected={isSelected}
            onSelect={onSelectBrand}
            onHover={handleLogoHover}
            onLeave={handleLogoLeave}
          />
        );
      })}
    </div>
  );
};

export default BrandShowcase;

