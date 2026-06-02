import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import AuthModal from '../AuthModal';
import WishlistModal from '../WishlistModal';
import ProfileModal from '../ProfileModal';
import './UserMenu.css';

const UserMenu = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // ✅ DEBUG: Log khi user thay đổi
  useEffect(() => {
    console.log('👤 UserMenu - user changed:', user);
  }, [user]);

  const handleUserIconClick = () => {
    if (isAuthenticated) {
      setShowUserMenu(!showUserMenu);
    } else {
      setShowAuthModal(true);
    }
  };

  const handleProfileClick = () => {
    setShowProfile(true);
    setShowUserMenu(false);
  };

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
  };

  return (
    <>
      <div className="user-menu-container">
        <div className="user-icon" onClick={handleUserIconClick}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>

        {/* User dropdown menu */}
        {showUserMenu && isAuthenticated && (
          <div className="user-dropdown">
            <div className="user-info">
              <h4>Hello, {user?.name || 'User'}</h4>
              <p>{user?.email || ''}</p>
            </div>
            <div className="user-menu-items">
              <button onClick={handleProfileClick}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                Profile
              </button>
              <button onClick={handleLogout} className="logout-btn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                </svg>
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Overlay to close menu */}
      {showUserMenu && <div className="menu-overlay" onClick={() => setShowUserMenu(false)}></div>}

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />

      {/* Profile Modal */}
      <ProfileModal 
        isOpen={showProfile} 
        onClose={() => setShowProfile(false)} 
      />
    </>
  );
};

export default UserMenu;