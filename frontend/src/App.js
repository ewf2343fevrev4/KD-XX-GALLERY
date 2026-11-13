import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { WishlistProvider } from './context/WishlistContext';
import Header from './components/Header';
import Hero from './components/Hero';
import ProductGrid from './components/ProductGrid';
import Footer from './components/Footer';
import About from './components/About/About'; // ✅ THÊM: Import About component
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminLogin from './pages/admin/AdminLogin';
import CampaignPage from './pages/CampaignPage';
import OAuthCallback from './pages/OAuthCallback';
import ProductDetailPage from './pages/ProductDetail';
import FitLabPage from './pages/FitLab';
import ChatWidget from './components/ChatWidget/ChatWidget';
import './styles/global.css';


// Component cho trang chủ
function HomePage({ 
  searchQuery, 
  onSearch, 
  products, 
  onProductsLoad, 
  selectedCategory, 
  onCategoryChange,
  selectedTag,
  onSelectTag,
  onClearTag,
  selectedBrand,
  onSelectBrand,
  onClearBrand
}) {
  useEffect(() => {
    if (selectedCategory && selectedCategory !== 'home') {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        const productsSection = document.getElementById('products-section') || document.getElementById('new-arrivals');
        if (productsSection) {
          clearInterval(timer);
          setTimeout(() => {
            const elementPosition = productsSection.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - 150;
            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth',
            });
          }, 60);
        } else if (attempts >= 50) {
          clearInterval(timer);
        }
      }, 50);
      return () => clearInterval(timer);
    }
  }, [selectedCategory]);

  // Cuộn mượt mà khi lọc theo Tag
  useEffect(() => {
    if (selectedTag) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        const productsSection = document.getElementById('products-section') || document.getElementById('new-arrivals');
        if (productsSection) {
          clearInterval(timer);
          setTimeout(() => {
            const elementPosition = productsSection.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - 150;
            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth',
            });
          }, 60);
        } else if (attempts >= 50) {
          clearInterval(timer);
        }
      }, 50);
      return () => clearInterval(timer);
    }
  }, [selectedTag]);

  const location = useLocation();

  // Đọc tag và category từ URL query parameters nếu có
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(location.search);
      const tagParam = params.get('tag');
      const catParam = params.get('category');
      if (tagParam && onSelectTag) {
        onSelectTag(tagParam, catParam || undefined);
      }
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="home-page">
      <Header 
        onSearch={onSearch}
        products={products}
        onCategoryChange={onCategoryChange}
        selectedCategory={selectedCategory}
        selectedTag={selectedTag}
        onSelectTag={onSelectTag}
      />
      <Hero 
        selectedBrand={selectedBrand}
        onSelectBrand={onSelectBrand}
      />
      <main className="main-content">
        <section id="new-arrivals">
          <ProductGrid 
            searchQuery={searchQuery}
            selectedCategory={selectedCategory}
            selectedTag={selectedTag}
            onClearTag={onClearTag}
            selectedBrand={selectedBrand}
            onClearBrand={onClearBrand}
            onProductsLoad={onProductsLoad}
          />
        </section>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('home');
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleProductsLoad = useCallback((loadedProducts) => {
    setProducts(loadedProducts);
  }, []);

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setSelectedTag(null);
    setSearchQuery('');
    if (category === 'home') {
      setSelectedBrand(null);
    }
  };

  const handleSelectTag = (tag, category = null) => {
    setSelectedTag(tag);
    setSearchQuery('');
    if (category && category !== 'all' && category !== 'home') {
      setSelectedCategory(category);
    } else {
      setSelectedCategory('all');
    }
    setSelectedBrand(null);
  };

  const handleClearTag = () => {
    setSelectedTag(null);
  };

  const handleSelectBrand = (brandLogo) => {
    // Nếu ấn lại đúng thương hiệu đang chọn -> Hủy chọn (toggle off) để hiển thị tất cả
    if (
      selectedBrand &&
      (selectedBrand.id === brandLogo.id || selectedBrand.name?.toLowerCase() === brandLogo.name?.toLowerCase())
    ) {
      setSelectedBrand(null);
    } else {
      setSelectedBrand(brandLogo);
      setSearchQuery('');
      // Nếu đang ở category cụ thể, đưa về 'home' để hiển thị toàn bộ sản phẩm của hãng đó
      if (selectedCategory !== 'home' && selectedCategory !== 'all') {
        setSelectedCategory('home');
      }

      // Cuộn trang mượt mà xuống khu vực sản phẩm
      setTimeout(() => {
        const productsSection = document.getElementById('products-section') || document.getElementById('new-arrivals');
        if (productsSection) {
          const elementPosition = productsSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - 120;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 80);
    }
  };

  const handleClearBrand = () => {
    setSelectedBrand(null);
  };

  return (
    <AuthProvider>
      <WishlistProvider>
        <CartProvider>
          <BrowserRouter>
            <div className="App">
              <Routes>
                {/* Trang mặc định khi chạy web (npm start / deploy): Campaign Landing Page */}
                <Route 
                  path="/" 
                  element={
                    <CampaignPage 
                      onSearch={handleSearch}
                      products={products}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                      selectedTag={selectedTag}
                      onSelectTag={handleSelectTag}
                    />
                  } 
                />

                {/* Route dự phòng cho Campaign Landing Page */}
                <Route 
                  path="/campaign" 
                  element={
                    <CampaignPage 
                      onSearch={handleSearch}
                      products={products}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                      selectedTag={selectedTag}
                      onSelectTag={handleSelectTag}
                    />
                  } 
                />

                {/* Route cho trang cửa hàng gốc (Store / Home) */}
                <Route 
                  path="/home" 
                  element={
                    <HomePage 
                      searchQuery={searchQuery}
                      onSearch={handleSearch}
                      products={products}
                      onProductsLoad={handleProductsLoad}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                      selectedTag={selectedTag}
                      onSelectTag={handleSelectTag}
                      onClearTag={handleClearTag}
                      selectedBrand={selectedBrand}
                      onSelectBrand={handleSelectBrand}
                      onClearBrand={handleClearBrand}
                    />
                  } 
                />
                <Route 
                  path="/store" 
                  element={
                    <HomePage 
                      searchQuery={searchQuery}
                      onSearch={handleSearch}
                      products={products}
                      onProductsLoad={handleProductsLoad}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                      selectedTag={selectedTag}
                      onSelectTag={handleSelectTag}
                      onClearTag={handleClearTag}
                      selectedBrand={selectedBrand}
                      onSelectBrand={handleSelectBrand}
                      onClearBrand={handleClearBrand}
                    />
                  } 
                />
                
                {/* ✅ THÊM: Route cho About page */}
                <Route path="/about" element={<About />} />

                {/* ✅ Route cho trang chi tiết sản phẩm (Product Detail) */}
                <Route 
                  path="/products/:id" 
                  element={
                    <ProductDetailPage 
                      onSearch={handleSearch}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                    />
                  } 
                />
                <Route 
                  path="/product/:id" 
                  element={
                    <ProductDetailPage 
                      onSearch={handleSearch}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                    />
                  } 
                />
                
                {/* Route cho OAuth Callback */}
                <Route path="/auth/callback" element={<OAuthCallback />} />

                {/* Route cho Admin Login */}
                <Route path="/admin/login" element={<AdminLogin />} />
                
                {/* Route cho KD-XX Fit Lab: Mix & Match Outfit Studio */}
                <Route 
                  path="/fit-lab" 
                  element={
                    <FitLabPage 
                      onSearch={handleSearch}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                    />
                  } 
                />

                {/* Route cho trang Admin Dashboard */}
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/intelligence" element={<AdminDashboard initialTab="intelligence" />} />
                <Route path="/admin/ai" element={<AdminDashboard initialTab="intelligence" />} />
              </Routes>

              {/* Floating Customer Support Chat Widget */}
              <ChatWidget />
            </div>
          </BrowserRouter>
        </CartProvider>
      </WishlistProvider>
    </AuthProvider>
  );
}

export default App;