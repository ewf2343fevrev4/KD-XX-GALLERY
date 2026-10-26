import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { createOrder } from '../../services/api';
import SepayPaymentModal from './SepayPaymentModal';
import './Cart.css';

const Cart = () => {
  const { items, removeFromCart, updateQuantity, clearCart, getTotalPrice, getTotalItems, isOpen, toggleCart } = useCart();
  const { user, token: authToken } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('sepay'); // 'sepay' | 'cod' | 'credit_card'
  const [createdSepayOrder, setCreatedSepayOrder] = useState(null);
  const [showSepayModal, setShowSepayModal] = useState(false);

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

      const orderData = {
        items: items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          image: item.image || item.images?.[0] || '',
          price: item.price,
          product: item.productId || item._id || item.id, // ID của sản phẩm
          size: item.size || '',
          color: item.color || ''
        })),
        shippingAddress: {
          address: user.address,
          city: user.city || 'N/A',
          postalCode: user.postalCode || '00000',
          country: user.country || 'Vietnam'
        },
        paymentMethod: paymentMethod, // 'sepay' | 'cod' | 'credit_card'
        subtotal: itemsPrice,
        tax: taxPrice,
        shipping: shippingPrice,
        total: totalPrice
      };

      console.log('Sending order data:', orderData);

      // Lấy token từ AuthContext hoặc localStorage
      const token = authToken || localStorage.getItem('token');
      
      if (!token) {
        alert('Phiên đăng nhập đã hết hạn hoặc chưa đăng nhập. Vui lòng bấm vào icon tài khoản ở góc trên bên phải để đăng nhập lại!');
        setIsProcessing(false);
        return;
      }

      // Gọi API tạo order
      const result = await createOrder(token, orderData);

      if (result.success && result.data?.order) {
        const order = result.data.order;

        if (paymentMethod === 'sepay') {
          // Mở modal VietQR SePay để khách quét mã
          setCreatedSepayOrder(order);
          setShowSepayModal(true);
        } else {
          alert(`Đặt hàng thành công!\nMã đơn hàng: ${order._id}\nTổng tiền: $${totalPrice.toFixed(2)}`);
          clearCart();
          toggleCart();
        }
      } else {
        alert(`Đặt hàng thất bại: ${result.error || 'Vui lòng kiểm tra lại thông tin'}`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Có lỗi xảy ra khi đặt hàng. Vui lòng thử lại!');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSepaySuccess = () => {
    clearCart();
  };

  const handleCloseSepayModal = () => {
    setShowSepayModal(false);
    clearCart();
    toggleCart();
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
      {isOpen && typeof document !== 'undefined' && createPortal(
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
                          {(item.size || item.color) && (
                            <div style={{ fontSize: '11px', color: '#888', margin: '2px 0 4px' }}>
                              {item.size ? `Size: ${item.size}` : ''}
                              {item.size && item.color ? ' • ' : ''}
                              {item.color ? `Color: ${item.color}` : ''}
                            </div>
                          )}
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

                    {/* Payment Method Selector */}
                    <div className="payment-method-selector">
                      <label className="payment-method-label">Phương thức thanh toán:</label>
                      <div className="payment-options">
                        <button 
                          type="button"
                          className={`payment-opt-btn ${paymentMethod === 'sepay' ? 'active' : ''}`}
                          onClick={() => setPaymentMethod('sepay')}
                        >
                          <span className="opt-icon">⚡</span>
                          <span>Chuyển khoản SePay (VietQR Tự động)</span>
                        </button>
                        <button 
                          type="button"
                          className={`payment-opt-btn ${paymentMethod === 'cod' ? 'active' : ''}`}
                          onClick={() => setPaymentMethod('cod')}
                        >
                          <span className="opt-icon">📦</span>
                          <span>COD (Thanh toán khi nhận hàng)</span>
                        </button>
                        <button 
                          type="button"
                          className={`payment-opt-btn ${paymentMethod === 'credit_card' ? 'active' : ''}`}
                          onClick={() => setPaymentMethod('credit_card')}
                        >
                          <span className="opt-icon">💳</span>
                          <span>Thẻ quốc tế (Credit Card)</span>
                        </button>
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
                        {isProcessing 
                          ? 'PROCESSING...' 
                          : paymentMethod === 'sepay' 
                          ? 'THANH TOÁN SEPAY QR' 
                          : 'CHECKOUT'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* SePay VietQR Payment Modal */}
      {showSepayModal && (
        <SepayPaymentModal
          isOpen={showSepayModal}
          onClose={handleCloseSepayModal}
          order={createdSepayOrder}
          onPaymentSuccess={handleSepaySuccess}
        />
      )}
    </>
  );
};

export default Cart;
