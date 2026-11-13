import React from 'react';
import './About.css';

const About = () => {
  return (
    <div className="about-page">
      {/* Hero Section */}
      <section className="about-hero">
        <div className="about-hero-content">
          <h1 className="about-title">ABOUT AMIRI</h1>
          <p className="about-subtitle">Redefining Luxury Streetwear Since 2014</p>
        </div>
      </section>

      {/* Story Section */}
      <section className="about-section">
        <div className="about-container">
          <div className="about-content">
            <h2 className="section-heading">OUR STORY</h2>
            <p className="about-text">
              Founded in Los Angeles, AMIRI represents the convergence of high fashion and streetwear culture. 
              Our brand embodies the rebellious spirit of rock 'n' roll while maintaining an unwavering commitment 
              to craftsmanship and luxury.
            </p>
            <p className="about-text">
              Each piece is meticulously crafted, combining premium materials with contemporary design to create 
              clothing that transcends trends and defines a lifestyle.
            </p>
            <p className="about-text">
              (Trang web này được tạo ra bởi 1 người hâm mộ AMIRI - Trần Đức Minh, nhằm mục đích học tập và tham khảo. 
              Nó không phải là trang web chính thức của thương hiệu AMIRI.)
            </p>
            <p className="about-text">
              (Mọi thông tin về thương hiệu, sản phẩm và hình ảnh đều thuộc về AMIRI và các bên liên quan.
              Trang web này không bán sản phẩm và không liên quan đến AMIRI dưới bất kỳ hình thức nào.
              Vui lòng truy cập trang web chính thức của AMIRI để biết thêm chi tiết.)
            </p>
            <p className="about-text">
              I HOPE YOU ENJOY THIS WEBSITE!
            </p>
            <p className="about-text">
              I LOVE AMIRI ❤️
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="about-section about-values">
        <div className="about-container">
          <h2 className="section-heading">OUR VALUES</h2>
          <div className="values-grid">
            <div className="value-card">
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                </svg>
              </div>
              <h3>Quality</h3>
              <p>Premium materials and exceptional craftsmanship in every piece</p>
            </div>

            <div className="value-card">
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <h3>Authenticity</h3>
              <p>True to our roots, genuine in our expression</p>
            </div>

            <div className="value-card">
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <h3>Innovation</h3>
              <p>Pushing boundaries while respecting tradition</p>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="about-section about-mission">
        <div className="about-container">
          <div className="mission-content">
            <h2 className="section-heading">OUR MISSION</h2>
            <p className="mission-text">
              To create timeless pieces that empower individuals to express their unique identity. 
              We believe fashion is more than clothing—it's a statement, a lifestyle, and an art form.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="about-section about-contact">
        <div className="about-container">
          <h2 className="section-heading">GET IN TOUCH</h2>
          <div className="contact-info">
            <div className="contact-item">
              <h3>Visit Us</h3>
              <p>Los Angeles, California</p>
              <p>United States</p>
            </div>
            <div className="contact-item">
              <h3>Email</h3>
              <p>info@amiri.com</p>
              <p>support@amiri.com</p>
            </div>
            <div className="contact-item">
              <h3>Follow Us</h3>
              <div className="social-links">
                <a href="#instagram" className="social-link">Instagram</a>
                <a href="#facebook" className="social-link">Facebook</a>
                <a href="#twitter" className="social-link">Twitter</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;