import React, { useState, useEffect, useMemo } from 'react';
import ProductCard from '../ProductCard';
import { getAllProducts } from '../../services/api';
import './ProductGrid.css';

const ProductGrid = ({ searchQuery, selectedCategory = 'home', onProductsLoad }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch products từ MongoDB khi component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await getAllProducts();

        if (response.success && Array.isArray(response.data)) {
          setProducts(response.data);
          if (onProductsLoad) {
            onProductsLoad(response.data);
          }
        } else {
          setProducts([]);
          setError(response.error || 'No products found in database.');
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        setProducts([]);
        setError('Failed to load products. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // ✅ Filter products dựa trên search query VÀ category
  const filteredProducts = useMemo(() => {
    let result = products;
    
    // Lọc theo category (trừ 'home' và 'all' thì hiển thị tất cả)
    if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'home') {
      result = result.filter(product => 
        product.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }
    
    // Lọc theo search query
    if (searchQuery?.trim()) {
      result = result.filter(product =>
        (product.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (product.category?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (product.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (product.brand?.toLowerCase() || '').includes(searchQuery.toLowerCase())
      );
    }
    
    return result;
  }, [searchQuery, selectedCategory, products]);

  // Loading UI
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Loading Products...</div>
      </div>
    );
  }

  // Error UI
  if (error && error.includes('connection')) {
    return (
      <div className="error-container">
        <p className="error-message">{error}</p>
        <button 
          className="retry-button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div id="products-section" className="product-container">
      {/* ✅ Category title động */}
      {selectedCategory === 'men' && <h2 className="section-title">MEN</h2>}
      {selectedCategory === 'women' && <h2 className="section-title">WOMEN</h2>}
      {selectedCategory === 'accessories' && <h2 className="section-title">ACCESSORIES</h2>}
      {(selectedCategory === 'all' || selectedCategory === 'home') && !searchQuery && (
        <h2 className="section-title">NEW ARRIVALS</h2>
      )}

      {/* Search results info */}
      {searchQuery && (
        <div className="search-results-info fade-in">
          <p>
            {filteredProducts.length > 0 
              ? `Found ${filteredProducts.length} result(s) for "${searchQuery}"`
              : `No results found for "${searchQuery}"`
            }
          </p>
        </div>
      )}

      {/* Product grid */}
      {filteredProducts.length > 0 ? (
        <div className="product-grid">
          {filteredProducts.map((product, index) => (
            <div 
              key={product._id || `product-${index}`}
              className="product-item"
              style={{ animationDelay: `${Math.min(index * 0.1, 0.8)}s` }}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      ) : !searchQuery ? (
        <div className="no-products fade-in">
          <h3>No products available yet</h3>
          <p>Products added from admin panel will appear here automatically.</p>
        </div>
      ) : null}
    </div>
  );
};

export default ProductGrid;