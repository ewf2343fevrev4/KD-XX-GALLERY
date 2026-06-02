import React from 'react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import './ProductCard.css';

const ProductCard = ({ product }) => {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  
  // ✅ FIX: Dùng _id từ MongoDB thay vì id
  const productId = product._id || product.id;
  
  // ✅ FIX: Lấy ảnh từ images array hoặc image field
  const productImage = product.images?.[0] || product.image || product.imageUrl || '/placeholder.jpg';
  
  const isWishlisted = isInWishlist(productId);

  const handleAddToCart = () => {
    // ✅ Đảm bảo pass đúng product object với _id
    addToCart({
      ...product,
      id: productId,
      image: productImage
    });
  };

  const handleWishlistToggle = () => {
    const productData = {
      ...product,
      id: productId,
      image: productImage
    };
    
    if (isWishlisted) {
      removeFromWishlist(productData);
    } else {
      addToWishlist(productData);
    }
  };

  return (
    <div className="product-card">
      <div className="product-image">
        <img 
          src={productImage} 
          alt={product.name}
          onError={(e) => {
            e.target.src = '/placeholder.jpg'; // Fallback nếu ảnh lỗi
          }}
        />
        
        {/* Wishlist heart button */}
        <button 
          className={`wishlist-btn ${isWishlisted ? 'active' : ''}`}
          onClick={handleWishlistToggle}
        >
          <svg 
            viewBox="0 0 24 24" 
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 
              2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
              C13.09 3.81 14.76 3 16.5 3 
              19.58 3 22 5.42 22 8.5
              c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>

      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        <p className="product-price">${product.price}</p>
        {product.description && (
          <p className="product-description">{product.description}</p>
        )}
        <button className="add-to-cart" onClick={handleAddToCart}>
          Add to Cart
        </button>
      </div>
    </div>
  );
};

export default ProductCard;