import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWishlist } from '../../context/WishlistContext';
import { getProductTags } from '../../services/api';
import Cart from '../Cart';
import SearchBox from '../SearchBox';
import UserMenu from '../UserMenu';
import WishlistModal from '../WishlistModal';
import './Header.css';

/**
 * Navigation items configuration
 * - Home: Normal navigation. Hovering over Home NEVER opens the mega menu.
 * - Other items: Hovering smoothly slides / expands the header mega menu dropdown.
 */
const NAV_ITEMS = [
  { id: 'home', label: 'Home', path: '/home', isHome: true, category: 'home' },
  { id: 'new-arrivals', label: 'New Arrivals', category: 'all', isHome: false },
  { id: 'men', label: 'Men', category: 'men', isHome: false },
  { id: 'women', label: 'Women', category: 'women', isHome: false },
  { id: 'accessories', label: 'Accessories', category: 'accessories', isHome: false },
  { id: 'fit-lab', label: 'Fit Lab', path: '/fit-lab', isHome: false },
  { id: 'shoes', label: 'Shoes', category: 'shoes', isHome: false },
];

const Header = ({
  onSearch,
  products = [],
  onCategoryChange,
  selectedCategory,
  selectedTag,
  onSelectTag,
}) => {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [serverTags, setServerTags] = useState({ tags: [], byCategory: {} });

  const closeTimerRef = useRef(null);
  const { items: wishlistItems } = useWishlist();
  const location = useLocation();
  const navigate = useNavigate();

  // Scroll detection for sticky header frosted effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch product tags directly from API on mount for instant synchronization
  useEffect(() => {
    let isMounted = true;
    getProductTags()
      .then((res) => {
        if (isMounted && res?.success) {
          setServerTags(res);
        }
      })
      .catch((err) => {
        console.warn('Tags API load error:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Close mega menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveDropdown(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reactive compilation of tags: combines server tags + live products prop
  const tagsByCategory = useMemo(() => {
    const map = {
      all: new Set(serverTags.byCategory?.all || []),
      men: new Set(serverTags.byCategory?.men || []),
      women: new Set(serverTags.byCategory?.women || []),
      accessories: new Set(serverTags.byCategory?.accessories || []),
      shoes: new Set(serverTags.byCategory?.shoes || []),
    };

    if (Array.isArray(products)) {
      products.forEach((p) => {
        const cat = (p.category || '').toLowerCase().trim();
        if (Array.isArray(p.tags)) {
          p.tags.forEach((t) => {
            if (t && typeof t === 'string' && t.trim()) {
              const clean = t.trim();
              map.all.add(clean);
              if (map[cat]) map[cat].add(clean);
            }
          });
        }
      });
    }

    return {
      all: Array.from(map.all),
      men: Array.from(map.men),
      women: Array.from(map.women),
      accessories: Array.from(map.accessories),
      shoes: Array.from(map.shoes),
    };
  }, [products, serverTags]);

  // Timer helpers for smooth hover transitions without flickering
  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const startCloseTimer = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 160);
  };

  // Nav item hover events
  const handleNavMouseEnter = (item) => {
    clearCloseTimer();
    // Rule: "trừ nút home để bình thường còn lại khi hover vào sẽ trượt mở rộng header ra"
    if (item.isHome) {
      setActiveDropdown(null);
    } else {
      setActiveDropdown(item.id);
    }
  };

  const handleNavMouseLeave = () => {
    startCloseTimer();
  };

  const handleDropdownMouseEnter = () => {
    clearCloseTimer();
  };

  const handleDropdownMouseLeave = () => {
    startCloseTimer();
  };

  // Navigation click handlers
  const handleCategoryClick = (category) => {
    setActiveDropdown(null);
    if (onCategoryChange) {
      onCategoryChange(category);
    }
    if (location.pathname !== '/home') {
      navigate(`/home?category=${category}`);
    } else {
      const productsSection =
        document.getElementById('products-section') ||
        document.getElementById('new-arrivals');
      if (productsSection) {
        const elementPosition = productsSection.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - 150;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    }
  };

  const handleTagClick = (tag, category = null) => {
    setActiveDropdown(null);
    if (onSelectTag) {
      onSelectTag(tag, category);
    }
    if (location.pathname !== '/home') {
      navigate(
        `/home?tag=${encodeURIComponent(tag)}${
          category ? `&category=${category}` : ''
        }`
      );
    } else {
      if (typeof window !== 'undefined') {
        const url = `/home?tag=${encodeURIComponent(tag)}${
          category && category !== 'all' ? `&category=${category}` : ''
        }`;
        window.history.replaceState(null, '', url);
      }
      const productsSection =
        document.getElementById('products-section') ||
        document.getElementById('new-arrivals');
      if (productsSection) {
        const elementPosition = productsSection.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - 150;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    }
  };

  const handleNavClick = (e, hash, category = null) => {
    e.preventDefault();
    setActiveDropdown(null);

    if (category) {
      onCategoryChange(category);
      if (category !== 'home') {
        const productsSection =
          document.getElementById('products-section') ||
          document.getElementById('new-arrivals');
        if (productsSection) {
          const elementPosition = productsSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - 150;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth',
          });
        }
      }
      return;
    }

    if (!hash) return;
    const el = document.querySelector(hash);
    if (!el) return;

    const headerEl = document.querySelector('.header');
    const headerHeight = headerEl ? headerEl.offsetHeight : 0;
    const top = el.getBoundingClientRect().top + window.pageYOffset - headerHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // Smart dynamic auto-arranging layout: distributes tags into 1, 2, 3 or 4 balanced columns
  const getTagColumns = (tagsList = []) => {
    const unique = Array.from(new Set(tagsList.filter(Boolean)));
    const total = unique.length;
    if (total === 0) return [];
    if (total <= 5) return [unique];
    if (total <= 10) {
      const mid = Math.ceil(total / 2);
      return [unique.slice(0, mid), unique.slice(mid)];
    }
    if (total <= 18) {
      const size = Math.ceil(total / 3);
      return [
        unique.slice(0, size),
        unique.slice(size, size * 2),
        unique.slice(size * 2),
      ];
    }
    const size = Math.ceil(total / 4);
    return [
      unique.slice(0, size),
      unique.slice(size, size * 2),
      unique.slice(size * 2, size * 3),
      unique.slice(size * 3),
    ];
  };

  // Dropdown content generator based on active menu item
  const getDropdownConfig = (menuId) => {
    switch (menuId) {
      case 'new-arrivals':
        return {
          title: 'NEW ARRIVALS / DROPS',
          category: 'all',
          discoverTitle: 'KHÁM PHÁ',
          discoverLinks: [
            { label: 'Tất cả sản phẩm mới', type: 'category', value: 'all' },
            { label: "Men's New In", type: 'category', value: 'men' },
            { label: "Women's New In", type: 'category', value: 'women' },
            { label: 'Accessories & Shoes', type: 'category', value: 'accessories' },
            { label: 'Pre-Fall 2026 Capsule', type: 'tag', value: 'Pre-Fall 2026' },
            { label: 'Winter Drop', type: 'tag', value: 'Winter Capsule' },
          ],
          tags:
            tagsByCategory.all.length > 0
              ? tagsByCategory.all
              : [
                  'Pre-Fall 2026',
                  'Winter Capsule',
                  'Jackets',
                  'Outerwear',
                  'Hoodies',
                  'Sweatshirts',
                  'Dresses',
                  'Skirts',
                  'Sunglasses',
                  'Belts',
                  'Sneakers',
                  'Card Holders',
                ],
          editorial: {
            eyebrow: 'KD-XX® SEASONAL DROP',
            title: 'PRE-FALL 2026 CAPSULE',
            description: 'A new expression of luxury streetwear & drip culture.',
            image: '/brands/amiri.png',
            cta: 'Khám phá bộ sưu tập',
            action: () => handleCategoryClick('all'),
          },
        };

      case 'men':
        return {
          title: "MEN'S COLLECTION",
          category: 'men',
          discoverTitle: 'KHÁM PHÁ',
          discoverLinks: [
            { label: 'Tất cả đồ Nam (View All)', type: 'category', value: 'men' },
            { label: 'Hàng mới về (New In)', type: 'tag', value: 'Winter Capsule', cat: 'men' },
            { label: 'Bán chạy nhất (Best Sellers)', type: 'tag', value: 'Ready-to-Wear', cat: 'men' },
            { label: 'Bộ sưu tập Camo Edition', type: 'tag', value: 'Camo Edition', cat: 'men' },
          ],
          tags:
            tagsByCategory.men.length > 0
              ? tagsByCategory.men
              : [
                  'Jackets',
                  'Outerwear',
                  'Hoodies',
                  'Sweatshirts',
                  'Ready-to-Wear',
                  'Winter Capsule',
                  'Camo Edition',
                  'Denim',
                  'Tees',
                ],
          editorial: {
            eyebrow: "MEN'S RUNWAY",
            title: 'OBSIDIAN OUTERWEAR',
            description: 'Biểu tượng phong cách đường phố đương đại với kỹ thuật may đo đỉnh cao.',
            image: '/brands/amiri.png',
            cta: 'Xem toàn bộ Men',
            action: () => handleCategoryClick('men'),
          },
        };

      case 'women':
        return {
          title: "WOMEN'S COLLECTION",
          category: 'women',
          discoverTitle: 'KHÁM PHÁ',
          discoverLinks: [
            { label: 'Tất cả đồ Nữ (View All)', type: 'category', value: 'women' },
            { label: 'Váy & Đầm dạ tiệc', type: 'tag', value: 'Dresses', cat: 'women' },
            { label: 'Chân váy da dập nổi', type: 'tag', value: 'Skirts', cat: 'women' },
            { label: 'Pre-Fall 2026 Capsule', type: 'tag', value: 'Pre-Fall 2026', cat: 'women' },
          ],
          tags:
            tagsByCategory.women.length > 0
              ? tagsByCategory.women
              : [
                  'Dresses',
                  'Skirts',
                  'Ready-to-Wear',
                  'Leather',
                  'Pre-Fall 2026',
                  'Tops',
                  'Denim',
                ],
          editorial: {
            eyebrow: "WOMEN'S COUTURE",
            title: 'TAILORED SILHOUETTES',
            description: 'Vẻ đẹp thanh lịch quyến rũ kết hợp tinh thần streetwear tự do.',
            image: '/brands/amiri.png',
            cta: 'Xem toàn bộ Women',
            action: () => handleCategoryClick('women'),
          },
        };

      case 'accessories':
        return {
          title: 'ACCESSORIES VAULT',
          category: 'accessories',
          discoverTitle: 'KHÁM PHÁ',
          discoverLinks: [
            { label: 'Tất cả phụ kiện (View All)', type: 'category', value: 'accessories' },
            { label: 'Kính râm gọng Gold (Eyewear)', type: 'tag', value: 'Sunglasses', cat: 'accessories' },
            { label: 'Thắt lưng dây xích cao cấp', type: 'tag', value: 'Belts', cat: 'accessories' },
            { label: 'Ví & Card Holders', type: 'tag', value: 'Card Holders', cat: 'accessories' },
            { label: 'Móc khóa & Phụ kiện nhỏ', type: 'tag', value: 'Keychains', cat: 'accessories' },
          ],
          tags:
            tagsByCategory.accessories.length > 0
              ? tagsByCategory.accessories
              : [
                  'Sunglasses',
                  'Eyewear',
                  'Belts',
                  'Hardware',
                  'Card Holders',
                  'Leather Goods',
                  'Keychains',
                  'Accessories',
                  'Socks',
                  'Essentials',
                ],
          editorial: {
            eyebrow: 'ACCESSORIES VAULT',
            title: 'HARDWARE & LEATHER',
            description: 'Chi tiết kim loại mạ vàng và chất liệu da cao cấp định hình đẳng cấp.',
            image: '/brands/amiri.png',
            cta: 'Khám phá phụ kiện',
            action: () => handleCategoryClick('accessories'),
          },
        };

      case 'shoes':
        return {
          title: 'FOOTWEAR LAB',
          category: 'shoes',
          discoverTitle: 'KHÁM PHÁ',
          discoverLinks: [
            { label: 'Tất cả giày (All Footwear)', type: 'category', value: 'shoes' },
            { label: 'Sneakers MA-1 Runners', type: 'tag', value: 'Sneakers', cat: 'shoes' },
            { label: 'Giày da Streetwear Kicks', type: 'tag', value: 'Footwear', cat: 'shoes' },
          ],
          tags:
            tagsByCategory.shoes.length > 0
              ? tagsByCategory.shoes
              : [
                  'Sneakers',
                  'Footwear',
                  'MA-1 Runners',
                  'Boots',
                  'Skate Shoes',
                ],
          editorial: {
            eyebrow: 'FOOTWEAR ARCHITECTURE',
            title: 'PEBBLED MA-1 RUNNERS',
            description: 'Đế đệm cao cấp và chất liệu da hạt tinh xảo cho từng bước chuyển động.',
            image: '/brands/amiri.png',
            cta: 'Xem bộ sưu tập Giày',
            action: () => handleCategoryClick('shoes'),
          },
        };

      case 'fit-lab':
        return {
          title: 'FIT LAB STUDIO',
          category: null,
          discoverTitle: 'STUDIO TÍNH NĂNG',
          discoverLinks: [
            { label: '2D Mix & Match Studio', type: 'fit-lab', path: '/fit-lab?mode=canvas' },
            { label: '3-Row Styling Studio', type: 'fit-lab', path: '/fit-lab?mode=styling' },
            { label: 'KD-XX Virtual Try-On AI', type: 'fit-lab', path: '/fit-lab?mode=tryon' },
          ],
          tags: [
            'Mix & Match',
            'Avatar Styling',
            'Outerwear',
            'Denim',
            'Sneakers',
            'Layering',
            'Streetwear Outfits',
          ],
          editorial: {
            eyebrow: 'AI VIRTUAL FITTING',
            title: '2D MIX & MATCH STUDIO',
            description: 'Kéo thả, kết hợp trang phục và xem trước outfit trực quan trên người mẫu ảo.',
            image: '/brands/amiri.png',
            cta: 'Trải nghiệm Fit Lab ngay',
            action: () => {
              navigate('/fit-lab');
              setActiveDropdown(null);
            },
          },
        };

      default:
        return null;
    }
  };

  const dropdownConfig = activeDropdown ? getDropdownConfig(activeDropdown) : null;
  const tagColumns = dropdownConfig ? getTagColumns(dropdownConfig.tags) : [];

  const handleSearchIconClick = () => setIsSearchActive(true);
  const handleWishlistClick = () => setShowWishlist(true);

  const wishlistItemCount = wishlistItems.length;

  return (
    <>
      <header
        className={`header ${isScrolled ? 'is-scrolled' : ''} ${
          activeDropdown ? 'is-expanded' : ''
        }`}
      >
        <div className="nav-container">
          <Link
            to="/"
            className="logo-text"
            onClick={() => {
              setActiveDropdown(null);
              if (location.pathname === '/' || location.pathname === '/campaign') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            <img
              src="/logo.png"
              alt="KD-XX Logo"
              className="logo-badge-icon"
            />
            <div className="logo-text-wrapper">
              <div className="logo">KD-XX</div>
              <div className="logo-subtitle">MADE TRẦN ĐỨC MINH</div>
            </div>
          </Link>

          <nav>
            <ul className="nav-menu">
              {NAV_ITEMS.map((item) => {
                const isItemActive = (() => {
                  if (location.pathname === '/fit-lab') {
                    return item.id === 'fit-lab';
                  }

                  if (location.pathname === '/home' || location.pathname === '/') {
                    if (selectedTag) {
                      if (selectedCategory && selectedCategory !== 'home') {
                        return !item.isHome && item.category === selectedCategory;
                      }
                      return item.id === 'new-arrivals';
                    }

                    if (item.isHome) {
                      return !selectedCategory || selectedCategory === 'home';
                    }

                    if (item.category) {
                      return selectedCategory === item.category;
                    }

                    return false;
                  }

                  return Boolean(item.path && !item.isHome && location.pathname === item.path);
                })();

                const isDropdownHovered = activeDropdown === item.id;

                return (
                  <li
                    key={item.id}
                    className={`nav-item ${isDropdownHovered ? 'is-mega-active' : ''}`}
                    onMouseEnter={() => handleNavMouseEnter(item)}
                    onMouseLeave={handleNavMouseLeave}
                  >
                    <Link
                      to={item.path || '/home'}
                      onClick={(e) => {
                        if (item.isHome) {
                          if (location.pathname === '/home') {
                            e.preventDefault();
                            handleNavClick(e, '#home');
                            onCategoryChange('home');
                          } else {
                            onCategoryChange('home');
                          }
                        } else if (item.category) {
                          if (location.pathname === '/home') {
                            e.preventDefault();
                            handleNavClick(e, null, item.category);
                          } else {
                            onCategoryChange(item.category);
                          }
                        }
                      }}
                      className={`${isItemActive ? 'active' : ''} ${
                        isDropdownHovered ? 'hover-expanded' : ''
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="nav-icons">
            {!isSearchActive ? (
              <svg
                className="nav-icon search-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                onClick={handleSearchIconClick}
              >
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            ) : (
              <SearchBox
                onSearch={onSearch}
                isSearchActive={isSearchActive}
                setIsSearchActive={setIsSearchActive}
              />
            )}

            <div className="wishlist-icon-container" onClick={handleWishlistClick}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              {wishlistItemCount > 0 && (
                <span className="wishlist-badge">{wishlistItemCount}</span>
              )}
            </div>

            <UserMenu />
            <Cart />
          </div>
        </div>

        {/* ── AMIRI-STYLE SLIDING MEGA MENU EXPANSION DRAWER ── */}
        <div
          className={`mega-menu-drawer ${activeDropdown ? 'is-open' : ''}`}
          onMouseEnter={handleDropdownMouseEnter}
          onMouseLeave={handleDropdownMouseLeave}
          aria-hidden={!activeDropdown}
        >
          {dropdownConfig && (
            <div className="mega-menu-inner">
              <div className="mega-menu-container">
                {/* Column 1: KHÁM PHÁ (Discover Links) */}
                <div className="mega-menu-col mega-menu-discover-col">
                  <h4 className="mega-menu-heading">{dropdownConfig.discoverTitle}</h4>
                  <ul className="mega-menu-list">
                    {dropdownConfig.discoverLinks.map((link, idx) => (
                      <li key={idx} className="mega-menu-item">
                        <button
                          type="button"
                          className="mega-menu-link mega-menu-link--primary"
                          onClick={() => {
                            if (link.type === 'category') {
                              handleCategoryClick(link.value);
                            } else if (link.type === 'tag') {
                              handleTagClick(link.value, link.cat);
                            } else if (link.type === 'fit-lab') {
                              navigate(link.path);
                              setActiveDropdown(null);
                            }
                          }}
                        >
                          <span className="mega-menu-pip" />
                          <span>{link.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Columns 2+: TAGS PHÂN LOẠI (Auto-arranged dynamically!) */}
                {tagColumns.length > 0 && (
                  <div className="mega-menu-tags-wrapper">
                    <div className="mega-menu-tags-header">
                      <h4 className="mega-menu-heading">PHÂN LOẠI THEO NHÃN (TAGS)</h4>
                    </div>
                    <div
                      className="mega-menu-tags-grid"
                      style={{
                        gridTemplateColumns: `repeat(${tagColumns.length}, minmax(130px, 1fr))`,
                      }}
                    >
                      {tagColumns.map((colTags, colIdx) => (
                        <ul key={colIdx} className="mega-menu-list">
                          {colTags.map((tag) => {
                            const isTagActive =
                              selectedTag &&
                              selectedTag.toLowerCase().trim() ===
                                tag.toLowerCase().trim();

                            return (
                              <li key={tag} className="mega-menu-item">
                                <button
                                  type="button"
                                  className={`mega-menu-link ${
                                    isTagActive ? 'is-tag-selected' : ''
                                  }`}
                                  onClick={() =>
                                    handleTagClick(tag, dropdownConfig.category)
                                  }
                                >
                                  <span className="mega-menu-pip" />
                                  <span>{tag}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ))}
                    </div>
                  </div>
                )}

                {/* Column Last: EDITORIAL FEATURED CARD */}
                {dropdownConfig.editorial && (
                  <div className="mega-menu-col mega-menu-editorial-col">
                    <div className="mega-menu-card">
                      {dropdownConfig.editorial.image && (
                        <div className="mega-menu-card-img-wrap">
                          <img
                            src={dropdownConfig.editorial.image}
                            alt={dropdownConfig.editorial.title}
                            className="mega-menu-card-img"
                            onError={(e) => {
                              e.target.src = '/logo.png';
                            }}
                          />
                          <div className="mega-menu-card-overlay" />
                        </div>
                      )}
                      <div className="mega-menu-card-body">
                        <span className="mega-menu-card-eyebrow">
                          {dropdownConfig.editorial.eyebrow}
                        </span>
                        <h5 className="mega-menu-card-title">
                          {dropdownConfig.editorial.title}
                        </h5>
                        <p className="mega-menu-card-desc">
                          {dropdownConfig.editorial.description}
                        </p>
                        <button
                          type="button"
                          onClick={dropdownConfig.editorial.action}
                          className="mega-menu-card-btn"
                        >
                          {dropdownConfig.editorial.cta} →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Dim backdrop when mega menu is expanded */}
      <div
        className={`mega-menu-backdrop ${activeDropdown ? 'is-active' : ''}`}
        onClick={() => setActiveDropdown(null)}
        aria-hidden="true"
      />

      <WishlistModal isOpen={showWishlist} onClose={() => setShowWishlist(false)} />
    </>
  );
};

export default Header;
