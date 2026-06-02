import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom'; // ✅ THÊM: Import Link và useLocation
import { useWishlist } from '../../context/WishlistContext';
import Cart from '../Cart';
import SearchBox from '../SearchBox';
import UserMenu from '../UserMenu';
import WishlistModal from '../WishlistModal';
import './Header.css';

const Header = ({ onSearch, products, onCategoryChange, selectedCategory }) => {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const { items: wishlistItems } = useWishlist();
  const location = useLocation(); // ✅ THÊM: Để check current path

  const handleNavClick = (e, hash, category = null) => {
    e.preventDefault();
    
    // Nếu click vào category (Men/Women/Accessories/New Arrivals)
    if (category) {
      onCategoryChange(category);
      
      // Scroll đến products section (trừ khi click Home)
      if (category !== 'home') {
        const productsSection = document.getElementById('products-section');
        if (productsSection) {
          const elementPosition = productsSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - 150;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }
      return;
    }
    
    // Xử lý các link khác (Home, About)
    if (!hash) return;
    const el = document.querySelector(hash);
    if (!el) return;
    
    const headerEl = document.querySelector('.header');
    const headerHeight = headerEl ? headerEl.offsetHeight : 0;
    const extraOffset = 0;
    const top = el.getBoundingClientRect().top + window.pageYOffset - (headerHeight + extraOffset);
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const handleSearchIconClick = () => setIsSearchActive(true);
  const handleWishlistClick = () => setShowWishlist(true);

  const wishlistItemCount = wishlistItems.length;

  return (
    <>
      <header className="header">
        <div className="nav-container">
          <Link to="/" className="logo-text"> {/* ✅ ĐỔI: từ <a> thành <Link> */}
            <div className="logo">AMIRI</div>
            <div className="logo-subtitle">MADE TRẦN ĐỨC MINH</div>
          </Link>
          
          <nav>
            <ul className="nav-menu">
              {/* Home */}
              <li className="nav-item">
                <Link
                  to="/"
                  onClick={(e) => {
                    if (location.pathname === '/') {
                      e.preventDefault();
                      handleNavClick(e, '#home');
                      onCategoryChange('home');
                    } else {
                      onCategoryChange('home');
                    }
                  }}
                  className={selectedCategory === 'home' && location.pathname === '/' ? 'active' : ''}
                >
                  Home
                </Link>
              </li>
              
              {/* New Arrivals */}
              <li className="nav-item">
                <Link
                  to="/"
                  onClick={(e) => {
                    if (location.pathname === '/') {
                      e.preventDefault();
                      handleNavClick(e, null, 'all');
                    } else {
                      onCategoryChange('all');
                    }
                  }}
                  className={selectedCategory === 'all' && location.pathname === '/' ? 'active' : ''}
                >
                  New Arrivals
                </Link>
              </li>
              
              {/* Men */}
              <li className="nav-item">
                <Link
                  to="/"
                  onClick={(e) => {
                    if (location.pathname === '/') {
                      e.preventDefault();
                      handleNavClick(e, null, 'men');
                    } else {
                      onCategoryChange('men');
                    }
                  }}
                  className={selectedCategory === 'men' && location.pathname === '/' ? 'active' : ''}
                >
                  Men
                </Link>
              </li>
              
              {/* Women */}
              <li className="nav-item">
                <Link
                  to="/"
                  onClick={(e) => {
                    if (location.pathname === '/') {
                      e.preventDefault();
                      handleNavClick(e, null, 'women');
                    } else {
                      onCategoryChange('women');
                    }
                  }}
                  className={selectedCategory === 'women' && location.pathname === '/' ? 'active' : ''}
                >
                  Women
                </Link>
              </li>
              
              {/* Accessories */}
              <li className="nav-item">
                <Link
                  to="/"
                  onClick={(e) => {
                    if (location.pathname === '/') {
                      e.preventDefault();
                      handleNavClick(e, null, 'accessories');
                    } else {
                      onCategoryChange('accessories');
                    }
                  }}
                  className={selectedCategory === 'accessories' && location.pathname === '/' ? 'active' : ''}
                >
                  Accessories
                </Link>
              </li>
              
              {/* ✅ About - Link đến trang About */}
              <li className="nav-item">
                <Link 
                  to="/about"
                  className={location.pathname === '/about' ? 'active' : ''}
                >
                  About
                </Link>
              </li>
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
                <path d="M15.5 14h-.79l-.28-.27C15.41 
                12.59 16 11.11 16 9.5 16 5.91 13.09 
                3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 
                16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 
                4.99L20.49 19l-4.99-5zm-6 0C7.01 
                14 5 11.99 5 9.5S7.01 5 9.5 5 
                14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            ) : (
              <SearchBox 
                onSearch={onSearch}
                products={products}
                isSearchActive={isSearchActive}
                setIsSearchActive={setIsSearchActive}
              />
            )}
            
            <div className="wishlist-icon-container" onClick={handleWishlistClick}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 
                15.36 2 12.28 2 8.5 2 5.42 4.42 
                3 7.5 3c1.74 0 3.41.81 4.5 
                2.09C13.09 3.81 14.76 3 16.5 
                3 19.58 3 22 5.42 22 8.5c0 
                3.78-3.4 6.86-8.55 11.54L12 
                21.35z"/>
              </svg>
              {wishlistItemCount > 0 && (
                <span className="wishlist-badge">{wishlistItemCount}</span>
              )}
            </div>
            
            <UserMenu />
            <Cart />
          </div>
        </div>
      </header>

      <WishlistModal 
        isOpen={showWishlist}
        onClose={() => setShowWishlist(false)}
      />
    </>
  );
};

export default Header;