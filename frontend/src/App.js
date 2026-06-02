import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import './styles/global.css';

// Component cho trang chủ
function HomePage({ searchQuery, onSearch, products, onProductsLoad, selectedCategory, onCategoryChange }) {
  return (
    <>
      <Header 
        onSearch={onSearch}
        products={products}
        onCategoryChange={onCategoryChange}
        selectedCategory={selectedCategory}
      />
      <Hero />
      <main className="main-content">
        <section id="new-arrivals">
          <ProductGrid 
            searchQuery={searchQuery}
            selectedCategory={selectedCategory}
            onProductsLoad={onProductsLoad}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('home');

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleProductsLoad = (loadedProducts) => {
    setProducts(loadedProducts);
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setSearchQuery('');
  };

  return (
    <AuthProvider>
      <WishlistProvider>
        <CartProvider>
          <BrowserRouter>
            <div className="App">
              <Routes>
                {/* Route cho trang chủ */}
                <Route 
                  path="/" 
                  element={
                    <HomePage 
                      searchQuery={searchQuery}
                      onSearch={handleSearch}
                      products={products}
                      onProductsLoad={handleProductsLoad}
                      selectedCategory={selectedCategory}
                      onCategoryChange={handleCategoryChange}
                    />
                  } 
                />
                
                {/* ✅ THÊM: Route cho About page */}
                <Route path="/about" element={<About />} />
                
                {/* Route cho Admin Login */}
                <Route path="/admin/login" element={<AdminLogin />} />
                
                {/* Route cho trang Admin Dashboard */}
                <Route path="/admin" element={<AdminDashboard />} />
              </Routes>
            </div>
          </BrowserRouter>
        </CartProvider>
      </WishlistProvider>
    </AuthProvider>
  );
}

export default App;