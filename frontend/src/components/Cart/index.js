import React, { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { createOrder } from '../../services/api';
import './Cart.css';

const Cart = () => {
  const { items, removeFromCart, updateQuantity, clearCart, getTotalPrice, getTotalItems, isOpen, toggleCart } = useCart();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
    } else {
      updateQuantity(productId, newQuantity);
    }
  };

  const handleCheckout = async () => {
    // Kiểm tra thông tin người dùng
    if (!user) {
      alert('Vui lòng đăng nhập để tiếp tục thanh toán!');
      return;
    }

    // Kiểm tra xem user có đầy đủ thông tin address và phone không
    const missingInfo = [];
    
    if (!user.address || user.address.trim() === '') {
      missingInfo.push('địa chỉ');
    }
    
    if (!user.phone || user.phone.trim() === '') {
      missingInfo.push('số điện thoại');
    }

    if (missingInfo.length > 0) {
      alert(`Vui lòng cập nhật đủ thông tin ${missingInfo.join(' và ')} tại trang Profile trước khi thanh toán!`);
      return;
    }

    // Kiểm tra giỏ hàng có sản phẩm không
    if (items.length === 0) {
      alert('Giỏ hàng trống!');
      return;
    }

    setIsProcessing(true);

    try {
      // Tính toán giá trị
      const itemsPrice = getTotalPrice();
      const taxPrice = itemsPrice * 0.1; // 10% thuế
      const shippingPrice = itemsPrice > 100 ? 0 : 10; // Free ship nếu > $100
      const totalPrice = itemsPrice + taxPrice + shippingPrice;

      // ✅ FIX: Đổi orderItems thành items và sửa tên các field
      const orderData = {
        items: items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          image: item.image || item.images?.[0] || '',
          price: item.price,
          product: item.id || item._id // ID của sản phẩm
        })),
        shippingAddress: {
          address: user.address,
          city: user.city || 'N/A',
          postalCode: user.postalCode || '00000',
          country: user.country || 'Vietnam'
        },
        paymentMethod: 'credit_card', // ✅ Đổi thành lowercase với underscore
        subtotal: itemsPrice,         // ✅ Đổi từ itemsPrice
        tax: taxPrice,                // ✅ Đổi từ taxPrice
        shipping: shippingPrice,      // ✅ Đổi từ shippingPrice
        total: totalPrice             // ✅ Đổi từ totalPrice
      };

      console.log('Sending order data:', orderData); // Debug

      // Lấy token từ localStorage
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!');
        setIsProcessing(false);
        return;
      }

      // Gọi API tạo order
      const result = await createOrder(token, orderData);

      if (result.success) {
        alert(`Đặt hàng thành công!\nMã đơn hàng: ${result.data.order._id}\nTổng tiền: $${totalPrice.toFixed(2)}`);
        clearCart(); // Xóa giỏ hàng
        toggleCart(); // Đóng cart
        
        // Optional: Chuyển hướng đến trang order detail
        // window.location.href = `/orders/${result.data.order._id}`;
      } else {
        alert(`Đặt hàng thất bại: ${result.error}`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Có lỗi xảy ra khi đặt hàng. Vui lòng thử lại!');
    } finally {
      setIsProcessing(false);
    }
  };

  // Tính toán để hiển thị
  const itemsPrice = getTotalPrice();
  const taxPrice = itemsPrice * 0.1;
  const shippingPrice = itemsPrice > 100 ? 0 : 10;
  const totalPrice = itemsPrice + taxPrice + shippingPrice;

  return (
    <>
      {/* Cart Icon */}
      <div className="cart-icon" onClick={toggleCart}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 7h-3V6c0-2.76-2.24-5-5-5S6 3.24 6 6v1H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM8 6c0-1.66 1.34-3 3-3s3 1.34 3 3v1H8V6zm11 15H5V9h2v1c0 .55.45 1 1 1s1-.45 1-1V9h6v1c0 .55.45 1 1 1s1-.45 1-1V9h2v12z"/>
        </svg>
        {getTotalItems() > 0 && (
          <span className="cart-badge">{getTotalItems()}</span>
        )}
      </div>

      {/* Cart Sidebar */}
      {isOpen && (
        <>
          <div className="cart-overlay" onClick={toggleCart}></div>
          <div className="cart-sidebar">
            <div className="cart-header">
              <h2>SHOPPING CART</h2>
              <button className="cart-close" onClick={toggleCart}>×</button>
            </div>

            <div className="cart-content">
              {items.length === 0 ? (
                <div className="cart-empty">
                  <p>Your cart is empty</p>
                  <button className="continue-shopping" onClick={toggleCart}>
                    Continue Shopping
                  </button>
                </div>
              ) : (
                <>
                  <div className="cart-items">
                    {items.map((item) => (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-image">
                          <img src={item.image || item.images?.[0]} alt={item.name} />
                        </div>
                        <div className="cart-item-details">
                          <h4>{item.name}</h4>
                          <p className="cart-item-price">${item.price}</p>
                          <div className="quantity-controls">
                            <button 
                              onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                              className="quantity-btn"
                            >
                              -
                            </button>
                            <span className="quantity">{item.quantity}</span>
                            <button 
                              onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                              className="quantity-btn"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="cart-item-total">
                          ${(item.price * item.quantity).toFixed(2)}
                        </div>
                        <button 
                          className="remove-item"
                          onClick={() => removeFromCart(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="cart-footer">
                    {/* Price Breakdown */}
                    <div className="price-breakdown">
                      <div className="price-row">
                        <span>Subtotal:</span>
                        <span>${itemsPrice.toFixed(2)}</span>
                      </div>
                      <div className="price-row">
                        <span>Tax (10%):</span>
                        <span>${taxPrice.toFixed(2)}</span>
                      </div>
                      <div className="price-row">
                        <span>Shipping:</span>
                        <span>{shippingPrice === 0 ? 'Free' : `$${shippingPrice.toFixed(2)}`}</span>
                      </div>
                      <div className="price-row total">
                        <span>Total:</span>
                        <span>${totalPrice.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="cart-actions">
                      <button 
                        className="clear-cart" 
                        onClick={clearCart}
                        disabled={isProcessing}
                      >
                        CLEAR CART
                      </button>
                      <button 
                        className="checkout-btn" 
                        onClick={handleCheckout}
                        disabled={isProcessing}
                      >
                        {isProcessing ? 'PROCESSING...' : 'CHECKOUT'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Cart;