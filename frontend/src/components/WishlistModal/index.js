import React from 'react';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';
import './WishlistModal.css';

const WishlistModal = ({ isOpen, onClose }) => {
  const { items, removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();

  const handleAddToCart = (product) => {
    addToCart(product);
  };

  const handleRemoveFromWishlist = (product) => {
    removeFromWishlist(product);
  };

  if (!isOpen) return null;

  return (
    <div className="wishlist-overlay" onClick={onClose}>
      <div className="wishlist-modal" onClick={e => e.stopPropagation()}>
        <div className="wishlist-header">
          <h2>My Wishlist</h2>
          <button className="wishlist-close" onClick={onClose}>×</button>
        </div>

        <div className="wishlist-content">
          {items.length === 0 ? (
            <div className="wishlist-empty">
              <svg className="empty-heart" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <h3>Your wishlist is empty</h3>
              <p>Add items you love to your wishlist. Review them anytime and easily move them to your cart.</p>
              <button className="continue-browsing" onClick={onClose}>
                Continue Browsing
              </button>
            </div>
          ) : (
            <>
              <div className="wishlist-items">
                {items.map((item) => (
                  <div key={item.id} className="wishlist-item">
                    <div className="wishlist-item-image">
                      <img src={item.image} alt={item.name} />
                    </div>
                    <div className="wishlist-item-details">
                      <h4>{item.name}</h4>
                      <p className="wishlist-item-price">${item.price}</p>
                      {item.description && (
                        <p className="wishlist-item-desc">{item.description}</p>
                      )}
                    </div>
                    <div className="wishlist-item-actions">
                      <button 
                        className="add-to-cart-btn"
                        onClick={() => handleAddToCart(item)}
                      >
                        Add to Cart
                      </button>
                      <button 
                        className="remove-from-wishlist"
                        onClick={() => handleRemoveFromWishlist(item)}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="wishlist-footer">
                <div className="wishlist-stats">
                  <p>{items.length} item(s) in your wishlist</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WishlistModal;