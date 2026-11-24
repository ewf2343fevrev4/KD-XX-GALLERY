import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sparkles, TrendingUp } from 'lucide-react';
import { getCampaignCuratedProducts, getAllProducts } from '../../services/api';
import './CampaignCuratedProductsSection.css';

/**
 * Format price intelligently:
 * If >= 100,000, price is already VND -> format with dot separator + ' VND'.
 * If < 100,000, price is USD -> convert to VND at 25,400 to match AMIRI VN display (e.g. 52.080.000 VND).
 */
const formatPriceVND = (price) => {
  if (price === undefined || price === null || price === '') return 'Liên hệ';
  const val = Number(price);
  if (isNaN(val) || val <= 0) return 'Liên hệ';
  const vndAmount = val >= 100000 ? Math.round(val) : Math.round(val * 25400);
  return `${vndAmount.toLocaleString('vi-VN')} VND`;
};

/**
 * Individual AMIRI-style Curated Product Card
 * - White studio card with subtle luxury purple glow on hover
 * - Top-left "+ Try-On" quick launch pill button
 * - Clean centered image with interactive carousel `< >` and bottom-right `1 / 4` counter
 * - Product title and formatted VND price
 */
const CuratedCard = ({ product, badgeText }) => {
  const navigate = useNavigate();
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  const productId = product?._id || product?.id;
  
  // Extract all images
  const images = useMemo(() => {
    if (!product) return ['/placeholder.jpg'];
    const list = [];
    if (Array.isArray(product.images) && product.images.length > 0) {
      list.push(...product.images.filter(Boolean));
    }
    if (product.image && !list.includes(product.image)) {
      list.push(product.image);
    }
    if (product.imageUrl && !list.includes(product.imageUrl)) {
      list.push(product.imageUrl);
    }
    return list.length > 0 ? list : ['/placeholder.jpg'];
  }, [product]);

  const totalImages = images.length;
  const currentImg = images[activeImgIndex] || images[0];

  const handleCardClick = (e) => {
    // If clicking on Try-On button or carousel controls, don't trigger general navigation
    if (e.target.closest('.curated-card__tryon-btn') || e.target.closest('.curated-card__nav-arrow')) {
      return;
    }
    if (productId) {
      navigate(`/products/${productId}`);
    }
  };

  const handleTryOnClick = (e) => {
    e.stopPropagation();
    if (productId) {
      navigate(`/fit-lab?product=${productId}`);
    } else {
      navigate('/fit-lab');
    }
  };

  const handlePrevImg = (e) => {
    e.stopPropagation();
    setActiveImgIndex((prev) => (prev - 1 + totalImages) % totalImages);
  };

  const handleNextImg = (e) => {
    e.stopPropagation();
    setActiveImgIndex((prev) => (prev + 1) % totalImages);
  };

  return (
    <article 
      className="curated-card" 
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleCardClick(e); }}
    >
      {/* Visual background surface */}
      <div className="curated-card__surface">
        {/* Top bar with Try-On Pill and optional Category badge */}
        <div className="curated-card__topbar">
          <button 
            type="button" 
            className="curated-card__tryon-btn"
            onClick={handleTryOnClick}
            title="Thử đồ ảo với Fit Lab"
          >
            <span className="curated-card__tryon-plus">+</span>
            <span className="curated-card__tryon-text">Try-On</span>
          </button>

          {badgeText && (
            <span className="curated-card__pill-tag">
              {badgeText}
            </span>
          )}
        </div>

        {/* Center Product Image Container */}
        <div className="curated-card__image-container">
          <img 
            src={currentImg} 
            alt={product?.name || 'Sản phẩm'} 
            className="curated-card__image"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = '/placeholder.jpg';
            }}
          />

          {/* Carousel arrows if more than 1 image */}
          {totalImages > 1 && (
            <>
              <button 
                type="button" 
                className="curated-card__nav-arrow curated-card__nav-arrow--left" 
                onClick={handlePrevImg}
                aria-label="Ảnh trước"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                type="button" 
                className="curated-card__nav-arrow curated-card__nav-arrow--right" 
                onClick={handleNextImg}
                aria-label="Ảnh sau"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Pagination Counter e.g. 1 / 4 */}
          <div className="curated-card__counter">
            {activeImgIndex + 1} / {totalImages}
          </div>
        </div>

        {/* Bottom Details */}
        <div className="curated-card__details">
          <h3 className="curated-card__name" title={product?.name}>
            {product?.name || 'AMIRI Luxury Item'}
          </h3>
          <p className="curated-card__price">
            {formatPriceVND(product?.price)}
          </p>
        </div>
      </div>
    </article>
  );
};

/**
 * CampaignCuratedProductsSection
 * Inspired by AMIRI Official Curated 4-Column Showcase
 * 
 * Layout:
 * - 2 columns on LEFT: Top products with highest purchase count (SHOP BEST SELLERS)
 * - 2 columns on RIGHT: Highlighted / featured products tagged in Admin (SHOP HIGHLIGHTS)
 * - Clean white background with subtle luxury purple glow, no lag, perfectly synchronized styling
 */
const CampaignCuratedProductsSection = () => {
  const [bestSellers, setBestSellers] = useState([]);
  const [featured, setFeatured] = useState([]);

  // Pagination index for 2-item windows (page 0 => items 0..1, page 1 => items 2..3)
  const [bestSellersPage, setBestSellersPage] = useState(0);
  const [featuredPage, setFeaturedPage] = useState(0);

  useEffect(() => {
    let isMounted = true;

    getCampaignCuratedProducts()
      .then((res) => {
        if (!isMounted) return;
        if (res?.success && (res.bestSellers || res.featured)) {
          setBestSellers(Array.isArray(res.bestSellers) ? res.bestSellers : []);
          setFeatured(Array.isArray(res.featured) ? res.featured : []);
        } else {
          // Fallback if endpoint returns unexpected format
          fallbackFromAllProducts();
        }
      })
      .catch((err) => {
        console.warn('Campaign curated API fetch error, using fallback:', err);
        fallbackFromAllProducts();
      });

    const fallbackFromAllProducts = () => {
      getAllProducts()
        .then((res) => {
          if (!isMounted) return;
          const prods = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
          if (prods.length > 0) {
            const feat = prods.filter(p => p.featured || (p.tags && p.tags.some(t => ['featured', 'nổi bật', 'hot'].includes(t.toLowerCase()))));
            const others = prods.filter(p => !feat.some(f => f._id === p._id));
            setFeatured(feat.length >= 2 ? feat : prods.slice(0, 4));
            setBestSellers(others.length >= 2 ? others : prods.slice(2, 6));
          }
        })
        .catch(() => {});
    };

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute currently visible items (2 for best sellers, 2 for featured)
  const visibleBestSellers = useMemo(() => {
    if (bestSellers.length <= 2) return bestSellers;
    const start = bestSellersPage * 2;
    const slice = bestSellers.slice(start, start + 2);
    if (slice.length < 2) {
      return bestSellers.slice(0, 2);
    }
    return slice;
  }, [bestSellers, bestSellersPage]);

  const visibleFeatured = useMemo(() => {
    if (featured.length <= 2) return featured;
    const start = featuredPage * 2;
    const slice = featured.slice(start, start + 2);
    if (slice.length < 2) {
      return featured.slice(0, 2);
    }
    return slice;
  }, [featured, featuredPage]);

  const totalBestSellerPages = Math.ceil(bestSellers.length / 2) || 1;
  const totalFeaturedPages = Math.ceil(featured.length / 2) || 1;

  const handleNextBestSellers = () => {
    setBestSellersPage((prev) => (prev + 1) % totalBestSellerPages);
  };
  const handlePrevBestSellers = () => {
    setBestSellersPage((prev) => (prev - 1 + totalBestSellerPages) % totalBestSellerPages);
  };

  const handleNextFeatured = () => {
    setFeaturedPage((prev) => (prev + 1) % totalFeaturedPages);
  };
  const handlePrevFeatured = () => {
    setFeaturedPage((prev) => (prev - 1 + totalFeaturedPages) % totalFeaturedPages);
  };

  return (
    <section className="campaign-curated-section" aria-label="Curated Fashion Showcase">
      <div className="campaign-curated-container">
        
        {/* Dual Section Headers (AMIRI Style Split) */}
        <div className="campaign-curated-headers">
          {/* Left Header: SHOP BEST SELLERS (Columns 1 & 2) */}
          <div className="campaign-curated-header-col campaign-curated-header-col--left">
            <div className="campaign-curated-header-title-wrap">
              <span className="campaign-curated-header-kicker">
                <TrendingUp size={14} className="campaign-curated-icon" /> MOST PURCHASED
              </span>
              <h2 className="campaign-curated-title">SHOP BEST SELLERS</h2>
            </div>

            {totalBestSellerPages > 1 && (
              <div className="campaign-curated-page-controls">
                <button 
                  type="button" 
                  className="campaign-curated-arrow-btn" 
                  onClick={handlePrevBestSellers}
                  aria-label="Trang trước Best Sellers"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="campaign-curated-page-text">
                  {bestSellersPage + 1} / {totalBestSellerPages}
                </span>
                <button 
                  type="button" 
                  className="campaign-curated-arrow-btn" 
                  onClick={handleNextBestSellers}
                  aria-label="Trang sau Best Sellers"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Right Header: SHOP HIGHLIGHTS (Columns 3 & 4) */}
          <div className="campaign-curated-header-col campaign-curated-header-col--right">
            <div className="campaign-curated-header-title-wrap">
              <span className="campaign-curated-header-kicker">
                <Sparkles size={14} className="campaign-curated-icon" /> ADMIN CURATED
              </span>
              <h2 className="campaign-curated-title">SHOP HIGHLIGHTS</h2>
            </div>

            {totalFeaturedPages > 1 && (
              <div className="campaign-curated-page-controls">
                <button 
                  type="button" 
                  className="campaign-curated-arrow-btn" 
                  onClick={handlePrevFeatured}
                  aria-label="Trang trước Highlights"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="campaign-curated-page-text">
                  {featuredPage + 1} / {totalFeaturedPages}
                </span>
                <button 
                  type="button" 
                  className="campaign-curated-arrow-btn" 
                  onClick={handleNextFeatured}
                  aria-label="Trang sau Highlights"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4-Column Showcase Grid */}
        <div className="campaign-curated-grid">
          {/* Column 1: Best Seller #1 */}
          <div className="campaign-curated-grid-col">
            {visibleBestSellers[0] ? (
              <CuratedCard product={visibleBestSellers[0]} badgeText="Top Ordered" />
            ) : (
              <div className="curated-card curated-card--skeleton" />
            )}
          </div>

          {/* Column 2: Best Seller #2 */}
          <div className="campaign-curated-grid-col">
            {visibleBestSellers[1] ? (
              <CuratedCard product={visibleBestSellers[1]} badgeText="Best Seller" />
            ) : (
              <div className="curated-card curated-card--skeleton" />
            )}
          </div>

          {/* Column 3: Highlight #1 */}
          <div className="campaign-curated-grid-col">
            {visibleFeatured[0] ? (
              <CuratedCard product={visibleFeatured[0]} badgeText="Featured" />
            ) : (
              <div className="curated-card curated-card--skeleton" />
            )}
          </div>

          {/* Column 4: Highlight #2 */}
          <div className="campaign-curated-grid-col">
            {visibleFeatured[1] ? (
              <CuratedCard product={visibleFeatured[1]} badgeText="Hot Tag" />
            ) : (
              <div className="curated-card curated-card--skeleton" />
            )}
          </div>
        </div>

      </div>
    </section>
  );
};

export default CampaignCuratedProductsSection;
