import React, { useState, useEffect, useMemo } from 'react';
import ProductCard from '../ProductCard';
import { getAllProducts } from '../../services/api';
import './ProductGrid.css';

const ProductGrid = ({ 
  searchQuery, 
  selectedCategory = 'home', 
  selectedBrand = null, 
  onClearBrand, 
  onProductsLoad 
}) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch products từ MongoDB một lần khi component mount
  useEffect(() => {
    let isMounted = true;
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await getAllProducts();

        if (isMounted) {
          if (response.success && Array.isArray(response.data)) {
            setProducts(response.data);
            if (onProductsLoad) {
              onProductsLoad(response.data);
            }
          } else {
            setProducts([]);
            setError(response.error || 'No products found in database.');
          }
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        if (isMounted) {
          setProducts([]);
          setError('Failed to load products. Please check your connection.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ Filter products dựa trên brand, category VÀ search query
  const filteredProducts = useMemo(() => {
    let result = products;

    // 1. Lọc theo thương hiệu (nếu có chọn logo hãng)
    if (selectedBrand) {
      const brandName = (typeof selectedBrand === 'string' ? selectedBrand : selectedBrand.name || '').toLowerCase().trim();
      const brandId = (typeof selectedBrand === 'object' ? selectedBrand.id || '' : '').toLowerCase().trim();
      const aliases = (
        typeof selectedBrand === 'object' && Array.isArray(selectedBrand.aliases)
          ? selectedBrand.aliases
          : []
      ).map(a => a.toLowerCase().trim());

      result = result.filter(product => {
        const pBrand = (product.brand || '').toLowerCase().trim();
        const pName = (product.name || '').toLowerCase().trim();

        // So khớp trực tiếp theo product.brand
        if (pBrand) {
          if (pBrand === brandName) return true;
          if (brandName && (pBrand.includes(brandName) || brandName.includes(pBrand))) return true;
          if (brandId && pBrand.replace(/\s+/g, '-').includes(brandId)) return true;
          for (const alias of aliases) {
            if (pBrand.includes(alias) || alias.includes(pBrand)) return true;
          }
        }

        // Dự phòng nếu brand nằm trong tên sản phẩm
        if (brandName && pName.includes(brandName)) return true;
        for (const alias of aliases) {
          if (pName.includes(alias)) return true;
        }

        return false;
      });
    }
    
    // 2. Lọc theo category (trừ 'home' và 'all' thì hiển thị tất cả)
    if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'home') {
      const targetCat = selectedCategory.toLowerCase().trim();
      result = result.filter(product => {
        const prodCat = (product.category || '').toLowerCase().trim();
        if (prodCat === targetCat) return true;

        // Hỗ trợ đặc biệt cho tag/category 'shoes'
        if (targetCat === 'shoes') {
          if (prodCat === 'shoe' || prodCat.includes('shoe') || prodCat.includes('sneaker') || prodCat.includes('boot')) {
            return true;
          }
          if (Array.isArray(product.tags) && product.tags.some(t => {
            const tagLower = (t || '').toLowerCase().trim();
            return tagLower === 'shoes' || tagLower === 'shoe' || tagLower.includes('shoe') || tagLower.includes('sneaker') || tagLower.includes('boot');
          })) {
            return true;
          }
          if (typeof product.tags === 'string') {
            const tagsLower = product.tags.toLowerCase();
            return tagsLower.includes('shoe') || tagsLower.includes('sneaker') || tagsLower.includes('boot');
          }
        }
        return false;
      });
    }
    
    // 3. Lọc theo search query
    if (searchQuery?.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(product =>
        (product.name?.toLowerCase() || '').includes(q) ||
        (product.category?.toLowerCase() || '').includes(q) ||
        (product.description?.toLowerCase() || '').includes(q) ||
        (product.brand?.toLowerCase() || '').includes(q)
      );
    }
    
    return result;
  }, [searchQuery, selectedCategory, selectedBrand, products]);

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
      {/* ✅ Hiển thị Brand Filter Banner nếu đang chọn hãng */}
      {selectedBrand ? (
        <div className="brand-active-filter-banner fade-in">
          <div className="brand-active-filter-badge">
            <span className="brand-active-label">BỘ SƯU TẬP THƯƠNG HIỆU</span>
            <h2 className="section-title brand-active-title">
              {typeof selectedBrand === 'string' ? selectedBrand : selectedBrand.name}
            </h2>
            <div className="brand-active-meta">
              <span className="brand-count-tag">
                {filteredProducts.length} SẢN PHẨM
              </span>
              <button 
                type="button"
                className="brand-clear-filter-btn"
                onClick={onClearBrand}
                title="Xóa bộ lọc để xem tất cả sản phẩm"
              >
                <span className="clear-icon">✕</span> XÓA LỌC / HIỂN THỊ TẤT CẢ
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ✅ Category title động */}
          {selectedCategory === 'men' && <h2 className="section-title">MEN</h2>}
          {selectedCategory === 'women' && <h2 className="section-title">WOMEN</h2>}
          {selectedCategory === 'accessories' && <h2 className="section-title">ACCESSORIES</h2>}
          {selectedCategory === 'shoes' && <h2 className="section-title">SHOES</h2>}
          {(selectedCategory === 'all' || selectedCategory === 'home') && !searchQuery && (
            <h2 className="section-title">NEW ARRIVALS</h2>
          )}
        </>
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
      ) : selectedBrand ? (
        <div className="no-products fade-in brand-empty-state">
          <div className="brand-empty-icon">✧</div>
          <h3>CHƯA CÓ SẢN PHẨM</h3>
          <p>
            Hiện chưa có sản phẩm nào thuộc thương hiệu{' '}
            <strong>{typeof selectedBrand === 'string' ? selectedBrand : selectedBrand.name}</strong>.
          </p>
          <button 
            type="button" 
            className="retry-button brand-reset-btn"
            onClick={onClearBrand}
          >
            XEM TẤT CẢ SẢN PHẨM
          </button>
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
