import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Heart, 
  ShoppingBag, 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  AlertCircle, 
  Share2, 
  X, 
  ShieldCheck, 
  Truck, 
  RotateCcw, 
  Sparkles, 
  Ruler,
  ChevronDown,
  ChevronUp,
  Star,
  Footprints,
  Shirt,
  Scissors,
  Info,
  Maximize2
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { getProductById, getAllProducts } from '../../services/api';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import ProductCard from '../../components/ProductCard';
import ProductReviewsSection from './ProductReviewsSection';
import './ProductDetail.css';

export default function ProductDetailPage({ 
  onSearch, 
  selectedCategory, 
  onCategoryChange 
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart, toggleCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  // State
  const [product, setProduct] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Gallery state
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Variant & purchase state
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [validationError, setValidationError] = useState('');
  const [addedToCartFeedback, setAddedToCartFeedback] = useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [sizeGuideTab, setSizeGuideTab] = useState('shoes');
  const [copiedLink, setCopiedLink] = useState(false);

  // Accordion state
  const [accordion, setAccordion] = useState({
    details: true,
    care: false,
    shipping: false
  });

  // Reviews stats state
  const [reviewsStats, setReviewsStats] = useState({
    averageRating: 5.0,
    totalReviews: 0
  });

  const handleStatsUpdate = useCallback((newStats) => {
    if (!newStats) return;
    setReviewsStats(prev => {
      if (
        prev.averageRating === newStats.averageRating &&
        prev.totalReviews === newStats.totalReviews
      ) {
        return prev;
      }
      return {
        averageRating: newStats.averageRating,
        totalReviews: newStats.totalReviews
      };
    });
  }, []);

  const scrollToReviews = () => {
    const el = document.getElementById('customer-reviews-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const sizeSelectorRef = useRef(null);
  const colorSelectorRef = useRef(null);

  // Scroll to top and load product on ID change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setLoading(true);
    setError(null);
    setSelectedImageIndex(0);
    setSelectedSize('');
    setSelectedColor('');
    setQuantity(1);
    setValidationError('');
    setAddedToCartFeedback(false);

    let isMounted = true;

    const fetchProductData = async () => {
      try {
        const [prodRes, catalogRes] = await Promise.all([
          getProductById(id),
          getAllProducts()
        ]);

        if (!isMounted) return;

        if (prodRes && prodRes.success && prodRes.data) {
          const prodData = prodRes.data;
          setProduct(prodData);

          // Pre-select first color if available
          const parsedColors = parseArrayField(prodData.colors);
          if (parsedColors.length > 0) {
            setSelectedColor(parsedColors[0]);
          }

          // Pre-select first size if only 1 size
          const parsedSizes = parseArrayField(prodData.sizes);
          if (parsedSizes.length === 1) {
            setSelectedSize(parsedSizes[0]);
          }

          // Initialize reviews stats from product
          setReviewsStats({
            averageRating: prodData.rating || 5.0,
            totalReviews: prodData.numReviews || 0
          });
        } else {
          setError(prodRes?.error || 'Sản phẩm không tồn tại hoặc đã bị xóa');
        }

        if (catalogRes && catalogRes.success && Array.isArray(catalogRes.data)) {
          setCatalog(catalogRes.data);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error fetching product detail:', err);
        setError('Không thể tải thông tin sản phẩm. Vui lòng kiểm tra kết nối.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (id) {
      fetchProductData();
    } else {
      setError('Mã sản phẩm không hợp lệ');
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Helper to parse arrays (sizes, colors)
  function parseArrayField(field) {
    if (!field) return [];
    if (Array.isArray(field)) return field.filter(Boolean);
    if (typeof field === 'string') {
      try {
        const parsed = JSON.parse(field);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {
        return field.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [field.trim()].filter(Boolean);
    }
    return [];
  }

  // Collect all valid images
  const allImages = useMemo(() => {
    if (!product) return ['/placeholder.jpg'];
    const list = [];

    if (Array.isArray(product.images) && product.images.length > 0) {
      product.images.forEach(url => {
        if (url && typeof url === 'string' && url.trim() && !list.includes(url.trim())) {
          list.push(url.trim());
        }
      });
    }

    if (product.image && typeof product.image === 'string' && product.image.trim() && !list.includes(product.image.trim())) {
      list.unshift(product.image.trim());
    }

    if (product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim() && !list.includes(product.imageUrl.trim())) {
      list.unshift(product.imageUrl.trim());
    }

    return list.length > 0 ? list : ['/placeholder.jpg'];
  }, [product]);

  // Sizes & Colors list
  const availableSizes = useMemo(() => parseArrayField(product?.sizes), [product]);
  const availableColors = useMemo(() => parseArrayField(product?.colors), [product]);

  // Product Category Helpers
  const isShoeProduct = useMemo(() => {
    if (!product) return false;
    const cat = String(product.category || '').toLowerCase();
    if (cat === 'shoes') return true;
    if (availableSizes.some(s => /^(3[5-9]|4[0-8])$/.test(String(s).trim()))) return true;
    if (/giày|shoe|sneaker|runner|loafer|boot|slide|sandal|derby/i.test(product.name || '')) return true;
    return false;
  }, [product, availableSizes]);

  const isPantsProduct = useMemo(() => {
    if (!product || isShoeProduct) return false;
    const cat = String(product.category || '').toLowerCase();
    if (cat === 'pants') return true;
    if (availableSizes.some(s => /^(2[8-9]|3[0-8])$/.test(String(s).trim()))) return true;
    if (/jean|pant|trouser|quần/i.test(product.name || '')) return true;
    return false;
  }, [product, availableSizes, isShoeProduct]);

  // Stock status
  const currentStock = typeof product?.stock === 'number' ? product.stock : 0;
  const isOutOfStock = currentStock <= 0 || product?.inStock === false;
  const isLowStock = !isOutOfStock && currentStock > 0 && currentStock <= 5;

  // Wishlist state
  const productId = product?._id || product?.id;
  const isWishlisted = isInWishlist(productId);

  // Related products
  const relatedProducts = useMemo(() => {
    if (!product || !catalog.length) return [];
    
    // First priority: same category, excluding current product
    let list = catalog.filter(p => 
      (p._id || p.id) !== productId && 
      p.category && 
      p.category.toLowerCase() === product.category?.toLowerCase()
    );

    // If fewer than 4, append others
    if (list.length < 4) {
      const others = catalog.filter(p => 
        (p._id || p.id) !== productId && 
        !list.some(item => (item._id || item.id) === (p._id || p.id))
      );
      list = [...list, ...others];
    }

    return list.slice(0, 4);
  }, [product, catalog, productId]);

  // Gallery handlers
  const handlePrevImage = (e) => {
    e?.stopPropagation?.();
    setSelectedImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  };

  const handleNextImage = (e) => {
    e?.stopPropagation?.();
    setSelectedImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  };

  // Quantity handlers
  const handleQuantityMinus = () => {
    setQuantity(prev => Math.max(1, prev - 1));
  };

  const handleQuantityPlus = () => {
    if (currentStock > 0 && quantity >= currentStock) {
      setValidationError(`Chỉ còn ${currentStock} sản phẩm trong kho`);
      return;
    }
    setQuantity(prev => prev + 1);
  };

  // Add to cart handler
  const handleAddToCart = () => {
    setValidationError('');

    if (isOutOfStock) {
      setValidationError('Sản phẩm hiện đang tạm hết hàng.');
      return;
    }

    if (availableSizes.length > 0 && !selectedSize) {
      setValidationError('Vui lòng chọn Kích cỡ (Size) trước khi thêm vào giỏ hàng.');
      sizeSelectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (availableColors.length > 0 && !selectedColor) {
      setValidationError('Vui lòng chọn Màu sắc (Color) trước khi thêm vào giỏ hàng.');
      colorSelectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Call Cart Context
    addToCart({
      ...product,
      id: productId,
      productId: productId,
      size: selectedSize || '',
      color: selectedColor || '',
      quantity: quantity,
      image: allImages[selectedImageIndex] || allImages[0]
    });

    setAddedToCartFeedback(true);
    setTimeout(() => {
      setAddedToCartFeedback(false);
    }, 2500);

    // Open Cart drawer for instant confirmation
    toggleCart();
  };

  // Wishlist handler
  const handleWishlistToggle = () => {
    const productData = {
      ...product,
      id: productId,
      productId: productId,
      image: allImages[0]
    };

    if (isWishlisted) {
      removeFromWishlist(productData);
    } else {
      addToWishlist(productData);
    }
  };

  // Share link handler
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product?.name || 'KD-XX — Luxury Streetwear',
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Toggle accordion item
  const toggleAccordion = (key) => {
    setAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ──────────────────────────────────────────────
  // 1. LOADING STATE
  // ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="product-detail-page">
        <Header 
          onSearch={onSearch}
          products={catalog}
          selectedCategory={selectedCategory}
          onCategoryChange={onCategoryChange}
        />
        <div className="detail-loading-wrapper">
          <div className="detail-skeleton-grid">
            <div className="detail-skeleton-gallery">
              <div className="skeleton-main-image skeleton-shimmer"></div>
              <div className="skeleton-thumbs">
                <div className="skeleton-thumb skeleton-shimmer"></div>
                <div className="skeleton-thumb skeleton-shimmer"></div>
                <div className="skeleton-thumb skeleton-shimmer"></div>
              </div>
            </div>
            <div className="detail-skeleton-info">
              <div className="skeleton-line skeleton-brand skeleton-shimmer"></div>
              <div className="skeleton-line skeleton-title skeleton-shimmer"></div>
              <div className="skeleton-line skeleton-price skeleton-shimmer"></div>
              <div className="skeleton-box skeleton-shimmer" style={{ height: '70px', marginTop: '20px' }}></div>
              <div className="skeleton-box skeleton-shimmer" style={{ height: '54px', marginTop: '30px' }}></div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // 2. ERROR / NOT FOUND STATE
  // ──────────────────────────────────────────────
  if (error || !product) {
    return (
      <div className="product-detail-page">
        <Header 
          onSearch={onSearch}
          products={catalog}
          selectedCategory={selectedCategory}
          onCategoryChange={onCategoryChange}
        />
        <main className="detail-error-container">
          <div className="detail-error-card">
            <div className="error-icon-circle">
              <AlertCircle size={44} className="text-purple-400" />
            </div>
            <span className="error-eyebrow">KD-XX ARCHIVE</span>
            <h1 className="error-title">SẢN PHẨM KHÔNG TỒN TẠI</h1>
            <p className="error-desc">
              {error || 'Sản phẩm bạn đang tìm kiếm không tồn tại, đã ngưng phát hành hoặc đường dẫn chưa chính xác.'}
            </p>
            <div className="error-actions">
              <button onClick={() => navigate('/home')} className="btn-luxury-primary">
                <ArrowLeft size={18} />
                QUAY LẠI CỬA HÀNG
              </button>
              <button onClick={() => navigate('/campaign')} className="btn-luxury-secondary">
                XEM BỘ SƯU TẬP
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // 3. MAIN PRODUCT DETAIL VIEW
  // ──────────────────────────────────────────────
  return (
    <div className="product-detail-page">
      <Header 
        onSearch={onSearch}
        products={catalog}
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
      />

      {/* Main Container */}
      <main className="detail-main-container">
        {/* Breadcrumb Navigation */}
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/home" className="breadcrumb-item">HOME</Link>
          <span className="breadcrumb-sep">/</span>
          <Link 
            to="/home" 
            onClick={() => onCategoryChange && onCategoryChange(product.category || 'all')}
            className="breadcrumb-item uppercase"
          >
            {product.category || 'COLLECTION'}
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current uppercase truncate">{product.name}</span>
        </nav>

        {/* 2-Column Luxury Layout */}
        <div className="detail-content-grid">
          {/* ================= LEFT COLUMN: GALLERY ================= */}
          <section className="detail-gallery-column">
            <div className="detail-gallery-wrapper">
              {/* Vertical Thumbnail Strip (Desktop) */}
              {allImages.length > 1 && (
                <div className="gallery-thumbnail-strip">
                  {allImages.map((img, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`gallery-thumb-btn ${selectedImageIndex === index ? 'active' : ''}`}
                      onClick={() => setSelectedImageIndex(index)}
                      aria-label={`View image ${index + 1}`}
                    >
                      <img 
                        src={img} 
                        alt={`${product.name} thumb ${index + 1}`}
                        onError={(e) => { e.target.src = '/placeholder.jpg'; }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Main Image Stage */}
              <div className="gallery-main-stage">
                {/* Badges */}
                <div className="gallery-badges">
                  <span className="badge-brand">{product.brand || 'AMIRI'}</span>
                  {product.featured && (
                    <span className="badge-featured">
                      <Sparkles size={12} /> NỔI BẬT
                    </span>
                  )}
                  {isOutOfStock && (
                    <span className="badge-stock badge-soldout">HẾT HÀNG</span>
                  )}
                  {isLowStock && (
                    <span className="badge-stock badge-low">CHỈ CÒN {currentStock}</span>
                  )}
                </div>

                {/* Main Image with Zoom Trigger */}
                <div 
                  className="gallery-main-viewport"
                  onClick={() => setIsLightboxOpen(true)}
                  title="Nhấn để phóng to ảnh"
                >
                  <img 
                    src={allImages[selectedImageIndex]} 
                    alt={product.name}
                    className="gallery-main-img"
                    onError={(e) => { e.target.src = '/placeholder.jpg'; }}
                  />
                  <div className="gallery-zoom-hint">
                    <Maximize2 size={13} strokeWidth={1.75} />
                    <span>Xem ảnh lớn</span>
                  </div>
                </div>

                {/* Arrow navigation if multiple images */}
                {allImages.length > 1 && (
                  <>
                    <button 
                      type="button" 
                      className="gallery-nav-arrow arrow-prev"
                      onClick={handlePrevImage}
                      aria-label="Previous image"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button 
                      type="button" 
                      className="gallery-nav-arrow arrow-next"
                      onClick={handleNextImage}
                      aria-label="Next image"
                    >
                      <ChevronRight size={22} />
                    </button>
                    <div className="gallery-counter">
                      {selectedImageIndex + 1} / {allImages.length}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Mobile Horizontal Thumbnail Bar */}
            {allImages.length > 1 && (
              <div className="gallery-mobile-thumbs">
                {allImages.map((img, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`mobile-thumb-btn ${selectedImageIndex === index ? 'active' : ''}`}
                    onClick={() => setSelectedImageIndex(index)}
                  >
                    <img 
                      src={img} 
                      alt="" 
                      onError={(e) => { e.target.src = '/placeholder.jpg'; }}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ================= RIGHT COLUMN: PRODUCT INFO ================= */}
          <section className="detail-info-column">
            {/* Brand & Meta */}
            <div className="detail-header-block">
              <div className="detail-brand-row">
                <span className="detail-brand-tag">{product.brand || 'AMIRI'}</span>
                <button 
                  type="button"
                  className="btn-share"
                  onClick={handleShare}
                  title="Chia sẻ sản phẩm"
                >
                  <Share2 size={17} />
                  <span>{copiedLink ? 'Đã sao chép link!' : 'Chia sẻ'}</span>
                </button>
              </div>

              <h1 className="detail-product-title">{product.name}</h1>

              {/* Star Rating Summary Pill */}
              <div className="detail-rating-summary-row">
                <button
                  type="button"
                  onClick={scrollToReviews}
                  className="detail-rating-pill"
                  title="Xem đánh giá & hình ảnh feedback từ khách hàng"
                >
                  <div className="rating-pill-stars">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={14}
                        fill={star <= Math.round(reviewsStats.averageRating || 5) ? '#f59e0b' : 'none'}
                        stroke="#f59e0b"
                        className={star <= Math.round(reviewsStats.averageRating || 5) ? 'text-amber-500' : 'text-gray-300'}
                      />
                    ))}
                  </div>
                  <span className="rating-pill-score">
                    {Number(reviewsStats.averageRating || 5.0).toFixed(1)}
                  </span>
                  <span className="rating-pill-count">
                    ({reviewsStats.totalReviews || 0} đánh giá)
                  </span>
                  <span className="rating-pill-link">
                    Xem feedback & ảnh thực tế →
                  </span>
                </button>
              </div>

              {/* Price & Stock status */}
              <div className="detail-price-row">
                <div className="detail-price">
                  ${Number(product.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="detail-stock-indicator">
                  {isOutOfStock ? (
                    <span className="stock-pill stock-out">
                      <span className="status-dot dot-red"></span>
                      Hết hàng
                    </span>
                  ) : isLowStock ? (
                    <span className="stock-pill stock-low">
                      <span className="status-dot dot-amber"></span>
                      Sắp hết: Còn {currentStock} sản phẩm
                    </span>
                  ) : (
                    <span className="stock-pill stock-in">
                      <span className="status-dot dot-green"></span>
                      Còn hàng ({currentStock} sản phẩm)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="detail-divider"></div>

            {/* Color Selector (if available) */}
            {availableColors.length > 0 && (
              <div className="detail-prop-block" ref={colorSelectorRef}>
                <div className="detail-prop-header">
                  <span className="detail-prop-label">MÀU SẮC (COLOR)</span>
                  <span className="detail-prop-value">{selectedColor || 'Chưa chọn'}</span>
                </div>
                <div className="detail-color-options">
                  {availableColors.map(color => {
                    const isSelected = selectedColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        className={`detail-color-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedColor(color);
                          setValidationError('');
                        }}
                      >
                        <span 
                          className="detail-color-swatch" 
                          style={{
                            backgroundColor: color.toLowerCase() === 'white' ? '#f5f5f5' : color.toLowerCase() === 'black' ? '#111115' : color.toLowerCase()
                          }}
                        />
                        <span className="detail-color-name">{color}</span>
                        {isSelected && <Check size={13} className="detail-color-check" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size Selector (if available) */}
            {availableSizes.length > 0 && (
              <div className="detail-prop-block" ref={sizeSelectorRef}>
                <div className="detail-prop-header">
                  <div className="detail-prop-label-group">
                    <span className="detail-prop-label">
                      {isShoeProduct ? 'KÍCH CỠ GIÀY (SHOE SIZE - EU)' : isPantsProduct ? 'KÍCH CỠ QUẦN (WAIST SIZE)' : 'KÍCH CỠ (SIZE)'}
                    </span>
                    <span className="detail-prop-value">
                      {selectedSize ? (isShoeProduct ? `EU ${selectedSize}` : selectedSize) : 'Vui lòng chọn'}
                    </span>
                  </div>
                  <button 
                    type="button" 
                    className="detail-size-guide-btn"
                    onClick={() => {
                      if (isShoeProduct) setSizeGuideTab('shoes');
                      else if (isPantsProduct) setSizeGuideTab('pants');
                      else setSizeGuideTab('clothing');
                      setIsSizeGuideOpen(true);
                    }}
                  >
                    <Ruler size={13} />
                    <span>{isShoeProduct ? 'Bảng size giày' : isPantsProduct ? 'Bảng size quần' : 'Bảng size'}</span>
                  </button>
                </div>
                <div className="detail-size-grid">
                  {availableSizes.map(size => {
                    const isSelected = selectedSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={isOutOfStock}
                        className={`detail-size-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedSize(size);
                          setValidationError('');
                        }}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="detail-prop-block">
              <div className="detail-prop-header">
                <span className="detail-prop-label">SỐ LƯỢNG (QUANTITY)</span>
                <span className="detail-prop-value">
                  {isOutOfStock ? (
                    <span className="text-red-500 font-semibold">Hết hàng</span>
                  ) : (
                    <span>Còn {currentStock} cái</span>
                  )}
                </span>
              </div>
              <div className="detail-qty-row">
                <div className={`detail-qty-picker ${isOutOfStock ? 'disabled' : ''}`}>
                  <button 
                    type="button" 
                    onClick={handleQuantityMinus}
                    disabled={quantity <= 1 || isOutOfStock}
                    aria-label="Giảm số lượng"
                  >
                    -
                  </button>
                  <span className="detail-qty-num">{quantity}</span>
                  <button 
                    type="button" 
                    onClick={handleQuantityPlus}
                    disabled={isOutOfStock || (currentStock > 0 && quantity >= currentStock)}
                    aria-label="Tăng số lượng"
                  >
                    +
                  </button>
                </div>
                <div className="detail-qty-note">
                  {isOutOfStock ? (
                    <span className="qty-msg-danger">Hiện tại sản phẩm đã hết hàng</span>
                  ) : (
                    <span className="qty-msg-muted">Tối đa {currentStock} sản phẩm / đơn hàng</span>
                  )}
                </div>
              </div>
            </div>

            {/* Validation Error Banner */}
            {validationError && (
              <div className="detail-validation-alert">
                <AlertCircle size={16} />
                <span>{validationError}</span>
              </div>
            )}

            {/* Actions: Add to Cart + Wishlist */}
            <div className="detail-action-group">
              <button
                type="button"
                className={`detail-btn-add-to-cart ${isOutOfStock ? 'btn-disabled' : ''} ${addedToCartFeedback ? 'btn-success' : ''}`}
                onClick={handleAddToCart}
                disabled={isOutOfStock}
              >
                {addedToCartFeedback ? (
                  <>
                    <Check size={20} className="animate-bounce" />
                    <span>ĐÃ THÊM VÀO GIỎ HÀNG ✓</span>
                  </>
                ) : isOutOfStock ? (
                  <span>TẠM HẾT HÀNG</span>
                ) : (
                  <>
                    <ShoppingBag size={19} />
                    <span>THÊM VÀO GIỎ HÀNG • ${(Number(product.price || 0) * quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className={`detail-btn-wishlist ${isWishlisted ? 'active' : ''}`}
                onClick={handleWishlistToggle}
                title={isWishlisted ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích'}
                aria-label="Wishlist toggle"
              >
                <Heart size={20} fill={isWishlisted ? 'currentColor' : 'none'} />
              </button>
            </div>

            {/* Luxury Service Highlights */}
            <div className="luxury-perks-box">
              <div className="perk-item">
                <div className="perk-icon-wrapper">
                  <Truck size={17} strokeWidth={1.5} />
                </div>
                <div className="perk-text-content">
                  <span className="perk-title">GIAO HÀNG MIỄN PHÍ TOÀN CẦU</span>
                  <p className="perk-desc">Áp dụng cho mọi đơn hàng giá trị trên $100</p>
                </div>
              </div>
              <div className="perk-item">
                <div className="perk-icon-wrapper">
                  <ShieldCheck size={17} strokeWidth={1.5} />
                </div>
                <div className="perk-text-content">
                  <span className="perk-title">100% CHÍNH HÃNG AUTHENTIC</span>
                  <p className="perk-desc">Sản phẩm thuộc thương hiệu {product.brand || 'AMIRI'} cao cấp</p>
                </div>
              </div>
              <div className="perk-item">
                <div className="perk-icon-wrapper">
                  <RotateCcw size={17} strokeWidth={1.5} />
                </div>
                <div className="perk-text-content">
                  <span className="perk-title">ĐỔI TRẢ TRONG 14 NGÀY</span>
                  <p className="perk-desc">Hỗ trợ đổi trả miễn phí khi còn nguyên tem mác</p>
                </div>
              </div>
            </div>

            {/* Description & Accordions */}
            <div className="detail-accordions">
              {/* 1. Description / Details */}
              <div className="accordion-item">
                <button 
                  type="button" 
                  className="accordion-header"
                  onClick={() => toggleAccordion('details')}
                >
                  <span>MÔ TẢ & CHI TIẾT SẢN PHẨM</span>
                  {accordion.details ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
                </button>
                {accordion.details && (
                  <div className="accordion-content">
                    <p className="product-description-text">
                      {product.description || 'Sản phẩm cao cấp được thiết kế và sản xuất tỉ mỉ theo tiêu chuẩn xa xỉ, phong cách streetwear thời thượng của thương hiệu AMIRI.'}
                    </p>
                    <div className="product-specs-grid">
                      <div className="spec-row">
                        <span className="spec-label">THƯƠNG HIỆU</span>
                        <span className="spec-value">{product.brand || 'AMIRI'}</span>
                      </div>
                      <div className="spec-row">
                        <span className="spec-label">DANH MỤC</span>
                        <span className="spec-value">{product.category ? product.category.toUpperCase() : 'FASHION'}</span>
                      </div>
                      {availableSizes.length > 0 && (
                        <div className="spec-row">
                          <span className="spec-label">KÍCH CỠ KHẢ DỤNG</span>
                          <span className="spec-value">{availableSizes.join(' · ')}</span>
                        </div>
                      )}
                      {availableColors.length > 0 && (
                        <div className="spec-row">
                          <span className="spec-label">MÀU SẮC</span>
                          <span className="spec-value">{availableColors.join(' · ')}</span>
                        </div>
                      )}
                      <div className="spec-row">
                        <span className="spec-label">TÌNH TRẠNG KHO</span>
                        <span className="spec-value">{currentStock > 0 ? `Sẵn sàng giao (${currentStock} sản phẩm)` : 'Tạm hết hàng'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Care instructions */}
              <div className="accordion-item">
                <button 
                  type="button" 
                  className="accordion-header"
                  onClick={() => toggleAccordion('care')}
                >
                  <span>HƯỚNG DẪN BẢO QUẢN & GIẶT LÀ</span>
                  {accordion.care ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
                </button>
                {accordion.care && (
                  <div className="accordion-content">
                    <ul className="care-guidelines">
                      <li>Khuyến khích giặt khô chuyên dụng (Dry clean only) để giữ form dáng vải cao cấp.</li>
                      <li>Không sử dụng chất tẩy rửa mạnh hoặc thuốc tẩy chứa clo.</li>
                      <li>Ủi ở nhiệt độ thấp mặt trong của sản phẩm (dưới 110°C).</li>
                      <li>Bảo quản nơi khô ráo, thoáng mát, sử dụng móc áo chuyên dụng.</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* 3. Shipping & returns */}
              <div className="accordion-item">
                <button 
                  type="button" 
                  className="accordion-header"
                  onClick={() => toggleAccordion('shipping')}
                >
                  <span>CHÍNH SÁCH VẬN CHUYỂN & ĐỔI TRẢ</span>
                  {accordion.shipping ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
                </button>
                {accordion.shipping && (
                  <div className="accordion-content">
                    <p>
                      Mọi đơn hàng được đóng gói trong hộp quà cao cấp chuẩn phong cách KD-XX. 
                      Đơn hàng nội địa được giao nhanh từ 1-3 ngày làm việc. Đơn hàng quốc tế từ 3-7 ngày.
                      Khách hàng được quyền kiểm tra sản phẩm trước khi thanh toán và đổi trả trong vòng 14 ngày kể từ ngày nhận hàng.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ================= CUSTOMER REVIEWS & RATINGS SECTION ================= */}
        <ProductReviewsSection
          productId={product._id}
          productName={product.name}
          productBrand={product.brand || 'AMIRI'}
          availableSizes={availableSizes}
          availableColors={availableColors}
          selectedSize={selectedSize}
          selectedColor={selectedColor}
          onStatsUpdate={handleStatsUpdate}
        />

        {/* ================= RELATED PRODUCTS SECTION ================= */}
        {relatedProducts.length > 0 && (
          <section className="detail-related-section">
            <div className="related-section-header">
              <span className="related-eyebrow">CURATED COLLECTION</span>
              <h2 className="related-title">SẢN PHẨM TƯƠNG TỰ CÓ THỂ BẠN THÍCH</h2>
              <div className="related-divider"></div>
            </div>

            <div className="related-products-grid">
              {relatedProducts.map(relProduct => (
                <ProductCard key={relProduct._id || relProduct.id} product={relProduct} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ================= LIGHTBOX MODAL ================= */}
      {isLightboxOpen && (
        <div className="lightbox-backdrop" onClick={() => setIsLightboxOpen(false)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button 
              type="button" 
              className="lightbox-close-btn"
              onClick={() => setIsLightboxOpen(false)}
              aria-label="Close lightbox"
            >
              <X size={28} />
            </button>

            {allImages.length > 1 && (
              <>
                <button 
                  type="button" 
                  className="lightbox-arrow arrow-left"
                  onClick={handlePrevImage}
                  aria-label="Previous image"
                >
                  <ChevronLeft size={36} />
                </button>
                <button 
                  type="button" 
                  className="lightbox-arrow arrow-right"
                  onClick={handleNextImage}
                  aria-label="Next image"
                >
                  <ChevronRight size={36} />
                </button>
              </>
            )}

            <div className="lightbox-image-wrap">
              <img 
                src={allImages[selectedImageIndex]} 
                alt={product.name}
                className="lightbox-img"
              />
            </div>

            {/* Bottom thumbnail strip in lightbox */}
            {allImages.length > 1 && (
              <div className="lightbox-thumbs">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`lightbox-thumb ${selectedImageIndex === idx ? 'active' : ''}`}
                    onClick={() => setSelectedImageIndex(idx)}
                  >
                    <img src={img} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= SIZE GUIDE MODAL ================= */}
      {isSizeGuideOpen && (
        <div className="size-guide-backdrop" onClick={() => setIsSizeGuideOpen(false)}>
          <div className="size-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="size-guide-header">
              <div>
                <h3 className="size-guide-title">BẢNG KÍCH CỠ CHUẨN (SIZE GUIDE)</h3>
                <p className="size-guide-sub">Thông số đo chuẩn cho bộ sưu tập KD-XX / AMIRI</p>
              </div>
              <button 
                type="button"
                className="size-guide-close"
                onClick={() => setIsSizeGuideOpen(false)}
                aria-label="Đóng bảng size"
              >
                <X size={22} />
              </button>
            </div>

            {/* Size Guide Navigation Tabs */}
            <div className="size-guide-tabs">
              <button
                type="button"
                className={`size-guide-tab-btn ${sizeGuideTab === 'shoes' ? 'active' : ''}`}
                onClick={() => setSizeGuideTab('shoes')}
              >
                <Footprints size={15} strokeWidth={1.75} />
                <span>GIÀY DÉP (FOOTWEAR - EU / US)</span>
              </button>
              <button
                type="button"
                className={`size-guide-tab-btn ${sizeGuideTab === 'clothing' ? 'active' : ''}`}
                onClick={() => setSizeGuideTab('clothing')}
              >
                <Shirt size={15} strokeWidth={1.75} />
                <span>QUẦN ÁO (CLOTHING - XS-XXL)</span>
              </button>
              <button
                type="button"
                className={`size-guide-tab-btn ${sizeGuideTab === 'pants' ? 'active' : ''}`}
                onClick={() => setSizeGuideTab('pants')}
              >
                <Scissors size={15} strokeWidth={1.75} />
                <span>QUẦN JEANS / SỐ (PANTS)</span>
              </button>
            </div>

            <div className="size-guide-body">
              {sizeGuideTab === 'shoes' && (
                <>
                  <table className="size-table">
                    <thead>
                      <tr>
                        <th>SIZE EU</th>
                        <th>US MEN</th>
                        <th>US WOMEN</th>
                        <th>UK</th>
                        <th>CHIỀU DÀI CHÂN (CM)</th>
                        <th>ĐỘ VỪA VẶN</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td><strong>38</strong></td><td>5.5</td><td>7.0</td><td>5.0</td><td>24.0 cm</td><td>True to size</td></tr>
                      <tr><td><strong>39</strong></td><td>6.5</td><td>8.0</td><td>6.0</td><td>24.5 cm</td><td>True to size</td></tr>
                      <tr><td><strong>40</strong></td><td>7.0</td><td>8.5</td><td>6.5</td><td>25.0 cm</td><td>True to size</td></tr>
                      <tr><td><strong>41</strong></td><td>8.0</td><td>9.5</td><td>7.5</td><td>26.0 cm</td><td>True to size</td></tr>
                      <tr><td><strong>42</strong></td><td>8.5</td><td>10.0</td><td>8.0</td><td>26.5 cm</td><td>True to size</td></tr>
                      <tr><td><strong>43</strong></td><td>9.5</td><td>11.0</td><td>9.0</td><td>27.5 cm</td><td>True to size</td></tr>
                      <tr><td><strong>44</strong></td><td>10.0</td><td>11.5</td><td>9.5</td><td>28.0 cm</td><td>True to size</td></tr>
                      <tr><td><strong>45</strong></td><td>11.0</td><td>12.5</td><td>10.5</td><td>29.0 cm</td><td>True to size</td></tr>
                      <tr><td><strong>46</strong></td><td>12.0</td><td>13.5</td><td>11.5</td><td>30.0 cm</td><td>True to size</td></tr>
                    </tbody>
                  </table>
                  <div className="size-guide-tips">
                    <p className="size-guide-tip-title">
                      <Info size={14} strokeWidth={1.75} />
                      <strong>Hướng dẫn đo kích cỡ bàn chân chuẩn xác:</strong>
                    </p>
                    <ul style={{ paddingLeft: '20px', marginTop: '6px', listStyleType: 'disc' }}>
                      <li>Đặt bàn chân lên một tờ giấy trắng, gót chân tì nhẹ vào mép tường phẳng.</li>
                      <li>Dùng bút vạch dấu ở đầu ngón chân dài nhất và đo khoảng cách từ mép gót đến vạch (đơn vị: cm).</li>
                      <li><em>Lưu ý:</em> Dòng Sneaker AMIRI Skel-Top / Runner có form ôm chân thể thao. Nếu bạn có mu bàn chân dày hoặc bàn chân bè ngang, hãy cân nhắc chọn tăng 0.5 - 1 size để có độ thoải mái tối đa khi mang kèm tất (vớ).</li>
                    </ul>
                  </div>
                </>
              )}

              {sizeGuideTab === 'clothing' && (
                <>
                  <table className="size-table">
                    <thead>
                      <tr>
                        <th>SIZE</th>
                        <th>VÒNG NGỰC (CHEST - CM)</th>
                        <th>VÒNG EO (WAIST - CM)</th>
                        <th>DÀI ÁO (LENGTH - CM)</th>
                        <th>CHIỀU CAO PHÙ HỢP</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td><strong>XS</strong></td><td>90 - 94</td><td>72 - 76</td><td>68</td><td>1m60 - 1m68</td></tr>
                      <tr><td><strong>S</strong></td><td>94 - 98</td><td>76 - 80</td><td>70</td><td>1m65 - 1m73</td></tr>
                      <tr><td><strong>M</strong></td><td>98 - 104</td><td>80 - 86</td><td>72</td><td>1m70 - 1m78</td></tr>
                      <tr><td><strong>L</strong></td><td>104 - 110</td><td>86 - 92</td><td>74</td><td>1m75 - 1m83</td></tr>
                      <tr><td><strong>XL</strong></td><td>110 - 116</td><td>92 - 98</td><td>76</td><td>1m80 - 1m88</td></tr>
                      <tr><td><strong>XXL</strong></td><td>116 - 122</td><td>98 - 104</td><td>78</td><td>1m85 - 1m95</td></tr>
                    </tbody>
                  </table>
                  <div className="size-guide-tips">
                    <p className="size-guide-tip-title">
                      <Info size={14} strokeWidth={1.75} />
                      <em>Lưu ý: Nếu phân vân giữa 2 kích cỡ, chúng tôi khuyên bạn nên chọn kích cỡ lớn hơn để có form dáng streetwear thoải mái chuẩn phong cách AMIRI.</em>
                    </p>
                  </div>
                </>
              )}

              {sizeGuideTab === 'pants' && (
                <>
                  <table className="size-table">
                    <thead>
                      <tr>
                        <th>SIZE</th>
                        <th>VÒNG EO (WAIST - INCH / CM)</th>
                        <th>VÒNG MÔNG (HIP - CM)</th>
                        <th>DÀI ĐÁY / INSEAM (CM)</th>
                        <th>CÂN NẶNG THAM KHẢO</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td><strong>28</strong></td><td>28" (71 - 74 cm)</td><td>88 - 92 cm</td><td>81 cm</td><td>48 - 55 kg</td></tr>
                      <tr><td><strong>29</strong></td><td>29" (74 - 76 cm)</td><td>92 - 95 cm</td><td>81 cm</td><td>53 - 60 kg</td></tr>
                      <tr><td><strong>30</strong></td><td>30" (76 - 79 cm)</td><td>95 - 98 cm</td><td>82 cm</td><td>58 - 65 kg</td></tr>
                      <tr><td><strong>31</strong></td><td>31" (79 - 82 cm)</td><td>98 - 101 cm</td><td>82 cm</td><td>63 - 70 kg</td></tr>
                      <tr><td><strong>32</strong></td><td>32" (82 - 85 cm)</td><td>101 - 104 cm</td><td>83 cm</td><td>68 - 75 kg</td></tr>
                      <tr><td><strong>33</strong></td><td>33" (85 - 88 cm)</td><td>104 - 107 cm</td><td>83 cm</td><td>73 - 80 kg</td></tr>
                      <tr><td><strong>34</strong></td><td>34" (88 - 92 cm)</td><td>107 - 111 cm</td><td>84 cm</td><td>78 - 85 kg</td></tr>
                      <tr><td><strong>36</strong></td><td>36" (92 - 97 cm)</td><td>111 - 116 cm</td><td>84 cm</td><td>85 - 95 kg</td></tr>
                    </tbody>
                  </table>
                  <div className="size-guide-tips">
                    <p className="size-guide-tip-title">
                      <Info size={14} strokeWidth={1.75} />
                      <em>Quần jeans AMIRI thường may bằng chất liệu denim cao cấp pha sợi co giãn (stretch). Chọn đúng size vòng eo (waist inch) theo thắt lưng của bạn để có form ôm chân skinny hoặc slim chuẩn.</em>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

