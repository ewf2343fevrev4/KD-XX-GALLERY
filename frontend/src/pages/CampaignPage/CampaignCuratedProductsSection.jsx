import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCampaignCuratedProducts, getAllProducts } from '../../services/api';
import './CampaignCuratedProductsSection.css';

/**
 * Format price matching AMIRI VN display (e.g. 52.080.000 VND)
 */
const formatPrice = (price) => {
  if (price === undefined || price === null || price === '') return '';
  const val = Number(price);
  if (isNaN(val) || val <= 0) return '';
  // If price >= 100,000, assume VND
  // If price < 100,000, convert at standard USD -> VND (~25,400)
  const vndAmount = val >= 100000 ? Math.round(val) : Math.round(val * 25400);
  return `${vndAmount.toLocaleString('vi-VN')} VND`;
};

/**
 * Individual AMIRI-Exact Curated Product Column
 * - Full bleed studio panel
 * - Crisp small rectangular "+ Try-On" button at top-left
 * - Large product image centered against studio paper background
 * - Minimalist `<` and `>` hover navigation
 * - Bottom-right: clean "1 / 4" counter
 * - Bottom-left: product title and price
 */
const CuratedColumn = ({ product }) => {
  const navigate = useNavigate();
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  const productId = product?._id || product?.id;

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

  const handleColumnClick = (e) => {
    if (e.target.closest('.amiri-curated-col__tryon') || e.target.closest('.amiri-curated-col__arrow')) {
      return;
    }
    if (productId) {
      navigate(`/products/${productId}`);
    }
  };

  const handleTryOn = (e) => {
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
    <div 
      className="amiri-curated-col"
      onClick={handleColumnClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleColumnClick(e); }}
    >
      {/* Top Left "+ Try-On" Crisp Button */}
      <button 
        type="button" 
        className="amiri-curated-col__tryon"
        onClick={handleTryOn}
        title="Thử đồ ảo với Fit Lab"
      >
        <span className="amiri-curated-col__tryon-plus">+</span>
        <span>Try-On</span>
      </button>

      {/* Center Product Image */}
      <div className="amiri-curated-col__image-wrap">
        <img 
          src={currentImg} 
          alt={product?.name || 'AMIRI Product'} 
          className="amiri-curated-col__image"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = '/placeholder.jpg';
          }}
        />

        {/* Minimalist Image Switch Arrows */}
        {totalImages > 1 && (
          <>
            <button 
              type="button" 
              className="amiri-curated-col__arrow amiri-curated-col__arrow--left"
              onClick={handlePrevImg}
              aria-label="Previous image"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
            <button 
              type="button" 
              className="amiri-curated-col__arrow amiri-curated-col__arrow--right"
              onClick={handleNextImg}
              aria-label="Next image"
            >
              <ChevronRight size={20} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Bottom Info: Title & Price on Left, Counter on Right */}
      <div className="amiri-curated-col__bottom">
        <div className="amiri-curated-col__info">
          <p className="amiri-curated-col__name">
            {product?.name || 'AMIRI Luxury Item'}
          </p>
          <p className="amiri-curated-col__price">
            {formatPrice(product?.price)}
          </p>
        </div>

        <div className="amiri-curated-col__counter">
          {activeImgIndex + 1} / {totalImages}
        </div>
      </div>
    </div>
  );
};

/**
 * CampaignCuratedProductsSection
 * 100% Edge-to-Edge Full-Bleed AMIRI Layout
 * 
 * - Left 2 Columns: Best Sellers (highest purchase count)
 * - Right 2 Columns: Highlights (admin tagged featured/highlights)
 * - Zero margin, zero card padding, clean hairline dividers
 */
const CampaignCuratedProductsSection = () => {
  const [bestSellers, setBestSellers] = useState([]);
  const [featured, setFeatured] = useState([]);
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
          fallbackFromAll();
        }
      })
      .catch(() => {
        fallbackFromAll();
      });

    const fallbackFromAll = () => {
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

  // 2 visible items for left half, 2 visible items for right half
  const visibleBestSellers = useMemo(() => {
    if (bestSellers.length <= 2) return bestSellers;
    const start = bestSellersPage * 2;
    const slice = bestSellers.slice(start, start + 2);
    return slice.length >= 2 ? slice : bestSellers.slice(0, 2);
  }, [bestSellers, bestSellersPage]);

  const visibleFeatured = useMemo(() => {
    if (featured.length <= 2) return featured;
    const start = featuredPage * 2;
    const slice = featured.slice(start, start + 2);
    return slice.length >= 2 ? slice : featured.slice(0, 2);
  }, [featured, featuredPage]);

  const totalBSPages = Math.ceil(bestSellers.length / 2) || 1;
  const totalFeatPages = Math.ceil(featured.length / 2) || 1;

  return (
    <section className="amiri-curated-section" aria-label="Curated Fashion Showcase">
      
      {/* Edge-to-Edge Split Header Row */}
      <div className="amiri-curated-header-row">
        {/* Left Header: SHOP BEST SELLERS (Spans Columns 1 & 2) */}
        <div className="amiri-curated-header-half amiri-curated-header-half--left">
          <h2 className="amiri-curated-header-title">SHOP BEST SELLERS</h2>
          {totalBSPages > 1 && (
            <div className="amiri-curated-header-nav">
              <button 
                type="button" 
                className="amiri-curated-header-arrow"
                onClick={() => setBestSellersPage(p => (p - 1 + totalBSPages) % totalBSPages)}
                aria-label="Previous best sellers"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                type="button" 
                className="amiri-curated-header-arrow"
                onClick={() => setBestSellersPage(p => (p + 1) % totalBSPages)}
                aria-label="Next best sellers"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Right Header: SHOP HIGHLIGHTS (Spans Columns 3 & 4) */}
        <div className="amiri-curated-header-half amiri-curated-header-half--right">
          <h2 className="amiri-curated-header-title">SHOP HIGHLIGHTS</h2>
          {totalFeatPages > 1 && (
            <div className="amiri-curated-header-nav">
              <button 
                type="button" 
                className="amiri-curated-header-arrow"
                onClick={() => setFeaturedPage(p => (p - 1 + totalFeatPages) % totalFeatPages)}
                aria-label="Previous highlights"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                type="button" 
                className="amiri-curated-header-arrow"
                onClick={() => setFeaturedPage(p => (p + 1) % totalFeatPages)}
                aria-label="Next highlights"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4 Full-Bleed Edge-to-Edge Columns */}
      <div className="amiri-curated-grid">
        <CuratedColumn product={visibleBestSellers[0]} />
        <CuratedColumn product={visibleBestSellers[1]} />
        <CuratedColumn product={visibleFeatured[0]} />
        <CuratedColumn product={visibleFeatured[1]} />
      </div>

    </section>
  );
};

export default CampaignCuratedProductsSection;
