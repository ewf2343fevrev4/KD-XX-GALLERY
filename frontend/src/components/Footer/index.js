import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>Customer Service</h3>
          <p><a href="#">Contact Us</a></p>
          <p><a href="#">Size Guide</a></p>
          <p><a href="#">Shipping & Returns</a></p>
          <p><a href="#">Care Instructions</a></p>
        </div>
        <div className="footer-section">
          <h3>Company</h3>
          <p><a href="#">About Amiri</a></p>
          <p><a href="#">Careers</a></p>
          <p><a href="#">Press</a></p>
          <p><a href="#">Stores</a></p>
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
        <div className="footer-section">
          <h3>Newsletter</h3>
          <p>Subscribe to receive updates on new arrivals and exclusive events.</p>
          <p><a href="#" style={{color: 'white', fontWeight: '600'}}>Subscribe Now</a></p>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; 2025 AMIRI. All rights reserved. Made with ❤️ by Trần Đức Minh</p>
      </div>
    </footer>
  );
};

export default Footer;