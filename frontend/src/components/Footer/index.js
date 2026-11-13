import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';
import { API_ORIGIN } from '../../config/apiConfig';

const API_BASE_URL = API_ORIGIN;

const Footer = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email || !email.trim()) return;

    try {
      setLoading(true);
      setStatus({ type: '', message: '' });

      const response = await fetch(`${API_BASE_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus({
          type: 'success',
          message: data.message || 'Thank you for subscribing to KD-XX.'
        });
        setEmail('');
      } else {
        setStatus({
          type: 'error',
          message: data.message || 'Không thể đăng ký. Vui lòng kiểm tra lại email.'
        });
      }
    } catch (err) {
      console.error('Newsletter subscribe error:', err);
      setStatus({
        type: 'error',
        message: 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>Customer Service</h3>
          <p><a href="#contact">Contact Us</a></p>
          <p><a href="#size-guide">Size Guide</a></p>
          <p><a href="#shipping">Shipping & Returns</a></p>
          <p><a href="#care">Care Instructions</a></p>
        </div>
        <div className="footer-section">
          <h3>Company</h3>
          <p><Link to="/about" onClick={handleScrollToTop}>About KD-XX</Link></p>
          <p><a href="#careers">Careers</a></p>
          <p><a href="#press">Press</a></p>
          <p><a href="#stores">Stores</a></p>
        </div>
        <div className="footer-section">
          <h3>Connect</h3>
          <p>
            <a 
              href="https://www.instagram.com/zzkdzz_?igsh=MWxmanhramVvdDZzMw%3D%3D&utm_source=qr" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Instagram
            </a>
          </p>
          <p>
            <a 
              href="https://www.facebook.com/share/1JyomoxVvq/?mibextid=wwXIfr" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Facebook
            </a>
          </p>
          <p>
            <a 
              href="http://www.tiktok.com/@kdfrotf" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              TikTok
            </a>
          </p>
          <p>
            <a 
              href="https://youtube.com/@otfkd?si=FeFe9ndZK92QUgnu" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              YouTube
            </a>
          </p>
        </div>
        <div className="footer-section footer-newsletter-section">
          <h3>Newsletter</h3>
          <p className="footer-newsletter-intro">Be the first to access KD-XX launches and events</p>
          <form className="footer-newsletter-form" onSubmit={handleSubscribe}>
            <div className="footer-input-group">
              <input
                type="email"
                placeholder="Your Email*"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                aria-label="Your Email"
                className="footer-email-input"
              />
              <button 
                type="submit" 
                className="footer-subscribe-btn"
                disabled={loading || !email.trim()}
              >
                {loading ? 'SENDING...' : 'SIGN UP'}
              </button>
            </div>
            {status.message && (
              <p className={`footer-newsletter-feedback ${status.type}`}>
                {status.message}
              </p>
            )}
          </form>

          {/* ✅ Nút ABOUT chuyển từ Header xuống dưới phần Your Email của Newsletter */}
          <div className="footer-newsletter-about">
            <Link
              to="/about"
              className="footer-about-pill-btn"
              onClick={handleScrollToTop}
              title="Tìm hiểu về câu chuyện thương hiệu KD-XX"
            >
              <span>ABOUT KD-XX</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; 2026 KD-XX — MADE TRẦN ĐỨC MINH. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
