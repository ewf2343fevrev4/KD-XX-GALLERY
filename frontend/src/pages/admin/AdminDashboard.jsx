import React, { useState, useEffect, useMemo } from 'react';
import { Plus, X, Edit2, Trash2, Image as ImageIcon, Check, Loader2, MessageSquare, Mail, Film, Star, Sparkles, Tag } from 'lucide-react';
import AdminChatInbox from './AdminChatInbox';
import AdminNewsletter from './AdminNewsletter';
import AdminCampaignAdsManager from './AdminCampaignAdsManager';
import AdminReviewsManager from './AdminReviewsManager';
import AdminAnalyticsDashboard from './AdminAnalyticsDashboard';
import AdminAIOperations from './AdminAIOperations';
import AdminVirtualTryOn from './AdminVirtualTryOn';

const AVAILABLE_CATEGORIES = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'clothing', label: 'Clothing' },
];

export const SIZE_PRESETS = [
  {
    id: 'shoes',
    label: 'Giày dép EU (Shoes)',
    icon: '👟',
    matchCategories: ['shoes'],
    sizes: ['38', '39', '40', '41', '42', '43', '44', '45', '46']
  },
  {
    id: 'clothing',
    label: 'Quần áo chữ (Clothing)',
    icon: '👔',
    matchCategories: ['clothing', 'men', 'women'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
  },
  {
    id: 'pants',
    label: 'Quần Jeans / Quần số (Pants)',
    icon: '👖',
    matchCategories: [],
    sizes: ['28', '29', '30', '31', '32', '33', '34', '36', '38']
  },
  {
    id: 'accessories',
    label: 'Phụ kiện (Accessories)',
    icon: '🎒',
    matchCategories: ['accessories'],
    sizes: ['One Size', 'Free Size']
  }
];

function getSuggestedSizePreset(category = '', existingSizes = []) {
  const cat = String(category || '').toLowerCase();
  if (cat === 'shoes' || (Array.isArray(existingSizes) && existingSizes.some(s => /^(3[5-9]|4[0-9])$/.test(String(s).trim())))) {
    return 'shoes';
  }
  if (cat === 'accessories') return 'accessories';
  return 'clothing';
}

function ProductSizeSelector({ category, selectedSizes = [], onChangeSizes }) {
  const [activeTab, setActiveTab] = useState(() => getSuggestedSizePreset(category, selectedSizes));
  const [customInput, setCustomInput] = useState('');

  // Switch tab if category changes
  useEffect(() => {
    const suggested = getSuggestedSizePreset(category, selectedSizes);
    setActiveTab(suggested);
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPreset = SIZE_PRESETS.find(p => p.id === activeTab) || SIZE_PRESETS[0];

  const handleToggleSize = (size) => {
    if (selectedSizes.includes(size)) {
      onChangeSizes(selectedSizes.filter(s => s !== size));
    } else {
      onChangeSizes([...selectedSizes, size]);
    }
  };

  const handleSelectAllPreset = () => {
    const combined = Array.from(new Set([...selectedSizes, ...currentPreset.sizes]));
    onChangeSizes(combined);
  };

  const handleDeselectAllPreset = () => {
    onChangeSizes(selectedSizes.filter(s => !currentPreset.sizes.includes(s)));
  };

  const handleClearAll = () => {
    onChangeSizes([]);
  };

  const handleAddCustomSize = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (selectedSizes.includes(trimmed)) {
      alert(`⚠️ Kích cỡ "${trimmed}" đã có trong danh sách!`);
      return;
    }
    onChangeSizes([...selectedSizes, trimmed]);
    setCustomInput('');
  };

  const handleRemoveSize = (sizeToRemove) => {
    onChangeSizes(selectedSizes.filter(s => s !== sizeToRemove));
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
      {/* Header and tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div>
          <label className="block text-sm font-semibold text-gray-900">
            Kích cỡ sản phẩm (Product Sizes)
          </label>
          <span className="text-[11px] text-gray-500">
            Chọn bộ kích cỡ mẫu (Giày, Áo, Quần) hoặc tự nhập kích cỡ riêng
          </span>
        </div>
        
        {/* Preset Selector Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200 shadow-2xs overflow-x-auto">
          {SIZE_PRESETS.map(preset => {
            const isActive = activeTab === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setActiveTab(preset.id)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preset Sizes Button Grid */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">
            {currentPreset.icon} Chọn nhanh {currentPreset.label}:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllPreset}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              + Chọn tất cả
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={handleDeselectAllPreset}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
            >
              Bỏ chọn nhóm này
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {currentPreset.sizes.map(size => {
            const isSelected = selectedSizes.includes(size);
            return (
              <button
                key={size}
                type="button"
                onClick={() => handleToggleSize(size)}
                className={`min-w-[42px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span>{size}</span>
                {isSelected && <span className="text-[10px]">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom size input */}
      <div className="pt-2 border-t border-slate-200/70 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomSize();
              }
            }}
            placeholder="Nhập kích cỡ tùy chỉnh (VD: 37, 42.5, US 9.5, Over-sized...)"
            className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={handleAddCustomSize}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
        >
          + Thêm size
        </button>
      </div>

      {/* Selected sizes tags overview */}
      <div className="pt-2 border-t border-slate-200/70">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-800">
            Kích cỡ đang áp dụng ({selectedSizes.length}):
          </span>
          {selectedSizes.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-red-600 hover:text-red-800 hover:underline cursor-pointer"
            >
              Xóa hết
            </button>
          )}
        </div>

        {selectedSizes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedSizes.map(size => (
              <span
                key={size}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-bold"
              >
                <span>{size}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSize(size)}
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-blue-200 text-blue-600 hover:text-blue-900 cursor-pointer ml-0.5"
                  title={`Xóa size ${size}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-amber-600 font-medium italic">
            ⚠️ Chưa chọn kích cỡ nào. Khách hàng sẽ không thể chọn size khi mua hàng!
          </p>
        )}
      </div>
    </div>
  );
}

const DEFAULT_SUGGESTED_TAGS = [
  'Denim', 'Tees', 'Hoodies', 'Outerwear', 'Jackets',
  'Sweatshirts', 'Dresses', 'Skirts', 'Sunglasses',
  'Belts', 'Sneakers', 'Card Holders', 'Keychains',
  'Socks', 'Caps', 'Pre-Fall 2026', 'Winter Capsule', 'Limited Edition'
];

function ProductTagManager({ tags = [], onChangeTags, suggestedTags = [] }) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = (tagToAdd) => {
    const trimmed = (tagToAdd || inputValue).trim();
    if (!trimmed) return;
    if (tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setInputValue('');
      return;
    }
    onChangeTags([...tags, trimmed]);
    setInputValue('');
  };

  const handleRemove = (tagToRemove) => {
    onChangeTags(tags.filter(t => t !== tagToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const combinedSuggestions = Array.from(new Set([...suggestedTags, ...DEFAULT_SUGGESTED_TAGS]));
  const availableSuggestions = combinedSuggestions.filter(
    s => !tags.some(t => t.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="bg-purple-50/40 border border-purple-200/80 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between border-b border-purple-100 pb-2">
        <label className="block text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Tag size={16} className="text-purple-600" />
          Tags phân loại (Mega Menu Tags)
        </label>
        <span className="text-[11px] text-purple-700 font-medium bg-purple-100/80 px-2 py-0.5 rounded-full">
          Tự động đồng bộ lên Header
        </span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tag (VD: Denim, Hoodies, Tees, Winter Drop...) rồi nhấn Enter"
          className="flex-1 px-3.5 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
        <button
          type="button"
          onClick={() => handleAdd()}
          className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-2xs shrink-0"
        >
          <Plus size={15} /> Thêm Tag
        </button>
      </div>

      {/* Selected tags */}
      {tags.length > 0 ? (
        <div>
          <span className="text-[11px] font-semibold text-gray-700 block mb-1.5">
            Tag đang gán cho sản phẩm ({tags.length}):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-purple-700 border border-purple-300 rounded-md text-xs font-bold shadow-2xs"
              >
                <span>#{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(tag)}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-purple-100 text-purple-600 hover:text-red-600 transition-colors cursor-pointer"
                  title="Xóa tag này"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 italic">
          Chưa có tag nào. Hãy thêm tag để sản phẩm xuất hiện trong các mục phân loại của Header.
        </p>
      )}

      {/* Quick suggestions */}
      {availableSuggestions.length > 0 && (
        <div className="pt-2 border-t border-purple-100/80">
          <span className="text-[11px] text-gray-500 font-medium block mb-1">
            Gợi ý nhanh (bấm để thêm):
          </span>
          <div className="flex flex-wrap gap-1">
            {availableSuggestions.slice(0, 10).map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => handleAdd(sug)}
                className="px-2 py-0.5 bg-white hover:bg-purple-100 text-gray-600 hover:text-purple-700 rounded text-[11px] font-medium border border-gray-200 transition-colors cursor-pointer"
              >
                + {sug}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard({ initialTab }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProducts: 0,
    totalAdmins: 0,
    regularUsers: 0
  });
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const allAvailableTags = useMemo(() => {
    return Array.from(new Set(
      products.flatMap(p => Array.isArray(p.tags) ? p.tags : []).filter(Boolean)
    ));
  }, [products]);

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      return initialTab || searchParams.get('tab') || 'stats';
    } catch (e) {
      return initialTab || 'stats';
    }
  });
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    brand: 'AMIRI',
    description: '',
    newImageUrl: '',
    images: [],
    sizes: [],
    colors: '',
    tags: [],
    featured: false
  });
  const [selectedAddFiles, setSelectedAddFiles] = useState([]);
  const [addFilePreviews, setAddFilePreviews] = useState([]);
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  // State cho chức năng Chỉnh Sửa Sản Phẩm (Edit Product)
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedEditFiles, setSelectedEditFiles] = useState([]);
  const [editFilePreviews, setEditFilePreviews] = useState([]);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);

  const API_BASE_URL = 'http://localhost:5000';

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!storedToken) {
      window.location.href = '/admin/login';
      return;
    }

    try {
      const user = JSON.parse(userStr || '{}');
      
      if (user.role !== 'admin') {
        alert('⛔ Bạn không có quyền truy cập trang Admin!');
        window.location.href = '/admin/login';
        return;
      }
    } catch (err) {
      console.error('Error parsing user:', err);
      window.location.href = '/admin/login';
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Chưa đăng nhập');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        }
      } catch (err) {
        setError(`Lỗi khi tải stats: ${err.message}`);
        console.error('Stats error:', err);
      }
    };

    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab !== 'users') return;

    const fetchUsers = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Chưa đăng nhập');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setUsers(data.data);
        }
      } catch (err) {
        setError(`Lỗi khi tải users: ${err.message}`);
        console.error('Users error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'products') return;

    const fetchProducts = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');

        const response = await fetch(`${API_BASE_URL}/api/admin/products`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setProducts(data.data);
        }
      } catch (err) {
        setError(`Lỗi khi tải products: ${err.message}`);
        console.error('Products error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [activeTab]);

// AdminDashboard.jsx - trong useEffect orders
useEffect(() => {
  if (activeTab !== 'orders') return;

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      console.log('🔥 Calling API: /api/admin/orders');  // ✅ DEBUG

      const response = await fetch(`${API_BASE_URL}/api/admin/orders`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('🔥 Response status:', response.status);  // ✅ DEBUG

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // ✅✅✅ DEBUG - IN RA DATA NHẬN ĐƯỢC
      console.log('🔥 Full API Response:', data);
      console.log('🔥 Orders array:', data.data);
      console.log('🔥 First order:', data.data?.[0]);
      console.log('🔥 First order items:', data.data?.[0]?.items);
      
      if (data.success) {
        setOrders(data.data);
        console.log('✅ Orders set successfully, count:', data.data.length);  // ✅ DEBUG
      }
    } catch (err) {
      setError(`Lỗi khi tải orders: ${err.message}`);
      console.error('❌ Orders error:', err);
    } finally {
      setLoading(false);
    }
  };

  fetchOrders();
}, [activeTab]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/admin/login';
  };

  // Helper functions cho modal Thêm Sản Phẩm Mới (Add Product)
  const handleResetAddProduct = () => {
    addFilePreviews.forEach(url => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    setNewProduct({
      name: '',
      category: '',
      price: '',
      stock: '',
      brand: 'AMIRI',
      description: '',
      newImageUrl: '',
      images: [],
      sizes: [],
      colors: '',
      tags: [],
      featured: false
    });
    setSelectedAddFiles([]);
    setAddFilePreviews([]);
    setIsAddingProduct(false);
  };

  const handleAddImageUrlToNew = () => {
    if (!newProduct.newImageUrl || !newProduct.newImageUrl.trim()) return;
    const url = newProduct.newImageUrl.trim();
    if (newProduct.images.includes(url)) {
      alert('⚠️ URL ảnh này đã có trong danh sách!');
      return;
    }
    setNewProduct(prev => ({
      ...prev,
      images: [...prev.images, url],
      newImageUrl: ''
    }));
  };

  const handleRemoveAddImage = (indexToRemove) => {
    setNewProduct(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== indexToRemove)
    }));
  };

  const handleAddFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = [];
    const validPreviews = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`⚠️ File "${file.name}" vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn!`);
        continue;
      }
      validFiles.push(file);
      validPreviews.push(URL.createObjectURL(file));
    }

    setSelectedAddFiles(prev => [...prev, ...validFiles]);
    setAddFilePreviews(prev => [...prev, ...validPreviews]);
    e.target.value = '';
  };

  const handleRemoveAddFile = (indexToRemove) => {
    if (addFilePreviews[indexToRemove]) {
      URL.revokeObjectURL(addFilePreviews[indexToRemove]);
    }
    setSelectedAddFiles(prev => prev.filter((_, i) => i !== indexToRemove));
    setAddFilePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const handleDeleteUser = async (userId, userName) => {
    const confirmed = window.confirm(
      `⚠️ Bạn có chắc chắn muốn xóa user "${userName}"?\n\nHành động này không thể hoàn tác!`
    );
    
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ Xóa user thành công!');
        setUsers(users.filter(user => user._id !== userId));
        setStats(prev => ({
          ...prev,
          totalUsers: prev.totalUsers - 1,
          regularUsers: prev.regularUsers - 1
        }));
      } else {
        alert(`❌ Lỗi: ${data.message || 'Không thể xóa user'}`);
      }
    } catch (err) {
      console.error('Delete user error:', err);
      alert('❌ Có lỗi xảy ra khi xóa user');
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.name.trim()) {
      alert('⚠️ Vui lòng nhập tên sản phẩm');
      return;
    }

    if (!newProduct.category) {
      alert('⚠️ Vui lòng chọn danh mục (Category)');
      return;
    }

    if (newProduct.price === '' || isNaN(parseFloat(newProduct.price))) {
      alert('⚠️ Vui lòng nhập giá hợp lệ');
      return;
    }

    // Tự động thêm newImageUrl nếu user đã nhập vào ô mà chưa kịp ấn "Thêm URL"
    let allUrlImages = [...(newProduct.images || [])];
    if (newProduct.newImageUrl && newProduct.newImageUrl.trim()) {
      const extra = newProduct.newImageUrl.trim();
      if (!allUrlImages.includes(extra)) {
        allUrlImages.push(extra);
      }
    }

    const totalImages = allUrlImages.length + selectedAddFiles.length;
    if (totalImages === 0) {
      const confirmNoImg = window.confirm('⚠️ Bạn chưa thêm hình ảnh nào cho sản phẩm. Bạn có muốn tiếp tục tạo sản phẩm không có ảnh?');
      if (!confirmNoImg) return;
    }

    try {
      setIsAddingProduct(true);
      const token = localStorage.getItem('token');

      const formData = new FormData();
      formData.append('name', newProduct.name.trim());
      formData.append('category', newProduct.category);
      formData.append('price', parseFloat(newProduct.price));
      formData.append('stock', parseInt(newProduct.stock) || 0);
      formData.append('brand', newProduct.brand?.trim() || 'AMIRI');
      formData.append('description', newProduct.description || '');
      formData.append('featured', Boolean(newProduct.featured));
      formData.append('sizes', JSON.stringify(newProduct.sizes || []));

      let colorsArray = [];
      if (typeof newProduct.colors === 'string') {
        colorsArray = newProduct.colors.split(',').map(c => c.trim()).filter(Boolean);
      } else if (Array.isArray(newProduct.colors)) {
        colorsArray = newProduct.colors;
      }
      formData.append('colors', JSON.stringify(colorsArray));
      formData.append('tags', JSON.stringify(newProduct.tags || []));
      formData.append('images', JSON.stringify(allUrlImages));

      selectedAddFiles.forEach(file => {
        formData.append('images', file);
      });

      const response = await fetch(`${API_BASE_URL}/api/admin/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ Thêm sản phẩm mới thành công!');
        setProducts(prev => [data.data, ...prev]);
        setStats(prev => ({ ...prev, totalProducts: prev.totalProducts + 1 }));
        handleResetAddProduct();
        setShowAddProductModal(false);
      } else {
        alert(`❌ Lỗi: ${data.message || 'Không thể thêm sản phẩm'}`);
      }
    } catch (err) {
      console.error('Add product error:', err);
      alert('❌ Có lỗi xảy ra khi thêm sản phẩm');
    } finally {
      setIsAddingProduct(false);
    }
  };

  const handleDeleteProduct = async (productId, productName) => {
    const confirmed = window.confirm(
      `⚠️ Bạn có chắc chắn muốn xóa sản phẩm "${productName}"?\n\nHành động này không thể hoàn tác!`
    );
    
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_BASE_URL}/api/admin/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ Xóa sản phẩm thành công!');
        setProducts(products.filter(product => product._id !== productId));
        setStats(prev => ({
          ...prev,
          totalProducts: prev.totalProducts - 1
        }));
      } else {
        alert(`❌ Lỗi: ${data.message || 'Không thể xóa sản phẩm'}`);
      }
    } catch (err) {
      console.error('Delete product error:', err);
      alert('❌ Có lỗi xảy ra khi xóa sản phẩm');
    }
  };

  // ==================== EDIT PRODUCT HANDLERS ====================
  const handleOpenEditModal = (product) => {
    let currentImgs = [];
    if (Array.isArray(product.images) && product.images.length > 0) {
      currentImgs = [...product.images];
    } else if (product.image) {
      currentImgs = [product.image];
    } else if (product.imageUrl) {
      currentImgs = [product.imageUrl];
    }

    setEditingProduct({
      _id: product._id,
      name: product.name || '',
      category: product.category || 'men',
      price: product.price !== undefined ? product.price : '',
      stock: product.stock !== undefined ? product.stock : 0,
      brand: product.brand || 'AMIRI',
      description: product.description || '',
      existingImages: currentImgs,
      newImageUrl: '',
      sizes: Array.isArray(product.sizes) ? [...product.sizes] : [],
      colors: Array.isArray(product.colors) ? product.colors.join(', ') : (product.colors || ''),
      tags: Array.isArray(product.tags) ? [...product.tags] : (typeof product.tags === 'string' ? product.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
      featured: Boolean(product.featured)
    });
    setSelectedEditFiles([]);
    setEditFilePreviews([]);
    setShowEditProductModal(true);
  };

  const handleRemoveExistingImage = (indexToRemove) => {
    setEditingProduct(prev => ({
      ...prev,
      existingImages: prev.existingImages.filter((_, i) => i !== indexToRemove)
    }));
  };

  const handleAddImageUrlToEdit = () => {
    if (!editingProduct?.newImageUrl || !editingProduct.newImageUrl.trim()) return;
    const url = editingProduct.newImageUrl.trim();
    if (editingProduct.existingImages.includes(url)) {
      alert('⚠️ URL ảnh này đã có trong danh sách!');
      return;
    }
    setEditingProduct(prev => ({
      ...prev,
      existingImages: [...prev.existingImages, url],
      newImageUrl: ''
    }));
  };

  const handleEditFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = [];
    const validPreviews = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`⚠️ File "${file.name}" vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn!`);
        continue;
      }
      validFiles.push(file);
      validPreviews.push(URL.createObjectURL(file));
    }

    setSelectedEditFiles(prev => [...prev, ...validFiles]);
    setEditFilePreviews(prev => [...prev, ...validPreviews]);
    e.target.value = '';
  };

  const handleRemoveEditFile = (indexToRemove) => {
    if (editFilePreviews[indexToRemove]) {
      URL.revokeObjectURL(editFilePreviews[indexToRemove]);
    }
    setSelectedEditFiles(prev => prev.filter((_, i) => i !== indexToRemove));
    setEditFilePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct?.name || !editingProduct.name.trim()) {
      alert('⚠️ Vui lòng nhập tên sản phẩm');
      return;
    }
    if (!editingProduct?.category) {
      alert('⚠️ Vui lòng chọn danh mục');
      return;
    }
    if (editingProduct.price === '' || isNaN(parseFloat(editingProduct.price))) {
      alert('⚠️ Vui lòng nhập giá hợp lệ');
      return;
    }

    const totalImages = (editingProduct.existingImages?.length || 0) + (selectedEditFiles.length || 0);
    if (totalImages === 0 && !editingProduct.newImageUrl?.trim()) {
      const confirmNoImg = window.confirm('⚠️ Sản phẩm chưa có hình ảnh nào. Bạn có chắc chắn muốn lưu mà không có ảnh?');
      if (!confirmNoImg) return;
    }

    try {
      setIsSavingProduct(true);
      const token = localStorage.getItem('token');

      const formData = new FormData();
      formData.append('name', editingProduct.name.trim());
      formData.append('category', editingProduct.category);
      formData.append('price', parseFloat(editingProduct.price));
      formData.append('stock', parseInt(editingProduct.stock) || 0);
      formData.append('brand', editingProduct.brand?.trim() || 'AMIRI');
      formData.append('description', editingProduct.description || '');
      formData.append('featured', Boolean(editingProduct.featured));
      formData.append('sizes', JSON.stringify(editingProduct.sizes || []));
      
      let colorsArray = [];
      if (typeof editingProduct.colors === 'string') {
        colorsArray = editingProduct.colors.split(',').map(c => c.trim()).filter(Boolean);
      } else if (Array.isArray(editingProduct.colors)) {
        colorsArray = editingProduct.colors;
      }
      formData.append('colors', JSON.stringify(colorsArray));
      formData.append('tags', JSON.stringify(editingProduct.tags || []));

      let keptImages = [...(editingProduct.existingImages || [])];
      if (editingProduct.newImageUrl && editingProduct.newImageUrl.trim()) {
        const extraUrl = editingProduct.newImageUrl.trim();
        if (!keptImages.includes(extraUrl)) {
          keptImages.push(extraUrl);
        }
      }
      formData.append('existingImages', JSON.stringify(keptImages));

      selectedEditFiles.forEach(file => {
        formData.append('images', file);
      });

      const response = await fetch(`${API_BASE_URL}/api/admin/products/${editingProduct._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ Cập nhật sản phẩm thành công!');
        setProducts(prev => prev.map(p => p._id === data.data._id ? data.data : p));
        setShowEditProductModal(false);
        setEditingProduct(null);
        setSelectedEditFiles([]);
        setEditFilePreviews([]);
      } else {
        alert(`❌ Lỗi: ${data.message || 'Không thể cập nhật sản phẩm'}`);
      }
    } catch (err) {
      console.error('Update product error:', err);
      alert('❌ Có lỗi xảy ra khi cập nhật sản phẩm');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_BASE_URL}/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ Cập nhật trạng thái đơn hàng thành công!');
        setOrders(orders.map(order => 
          order._id === orderId ? { ...order, status: newStatus } : order
        ));
        if (selectedOrder && selectedOrder._id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: newStatus });
        }
      } else {
        alert(`❌ Lỗi: ${data.message || 'Không thể cập nhật trạng thái'}`);
      }
    } catch (err) {
      console.error('Update order status error:', err);
      alert('❌ Có lỗi xảy ra khi cập nhật trạng thái');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    const confirmed = window.confirm(
      `⚠️ Bạn có chắc chắn muốn xóa đơn hàng này?\n\nHành động này không thể hoàn tác!`
    );
    
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_BASE_URL}/api/admin/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ Xóa đơn hàng thành công!');
        setOrders(orders.filter(order => order._id !== orderId));
        setShowOrderDetailModal(false);
      } else {
        alert(`❌ Lỗi: ${data.message || 'Không thể xóa đơn hàng'}`);
      }
    } catch (err) {
      console.error('Delete order error:', err);
      alert('❌ Có lỗi xảy ra khi xóa đơn hàng');
    }
  };

  const getStatusBadgeClass = (status) => {
    const classes = {
      'pending': 'bg-yellow-100 text-yellow-800',
      'processing': 'bg-blue-100 text-blue-800',
      'shipped': 'bg-purple-100 text-purple-800',
      'delivered': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status) => {
    const texts = {
      'pending': 'Chờ xử lý',
      'processing': 'Đang xử lý',
      'shipped': 'Đã gửi hàng',
      'delivered': 'Đã giao hàng',
      'cancelled': 'Đã hủy'
    };
    return texts[status] || status;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Quản lý website AMIRI</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Đăng xuất
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="flex gap-4 mb-8 border-b overflow-x-auto">
          {['stats', 'intelligence', 'virtual-tryon', 'users', 'products', 'orders', 'reviews', 'support', 'newsletter', 'campaign-ads'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium capitalize transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'stats' && 'Thống Kê'}
              {tab === 'intelligence' && (
                <span className="flex items-center gap-1.5 font-bold text-indigo-600">
                  <Sparkles size={16} className="text-indigo-500 animate-pulse" />
                  <span>KD-XX Intelligence</span>
                </span>
              )}
              {tab === 'virtual-tryon' && (
                <span className="flex items-center gap-1.5 font-bold text-purple-600">
                  <Sparkles size={16} className="text-purple-500" />
                  <span>Virtual Try-On AI</span>
                </span>
              )}
              {tab === 'users' && 'Quản Lý Users'}
              {tab === 'products' && 'Quản Lý Products'}
              {tab === 'orders' && 'Quản Lý Orders'}
              {tab === 'reviews' && (
                <span className="flex items-center gap-2">
                  <Star size={16} />
                  <span>Quản Lý Đánh Giá</span>
                </span>
              )}
              {tab === 'newsletter' && (
                <span className="flex items-center gap-2">
                  <Mail size={16} />
                  <span>Email Marketing</span>
                </span>
              )}
              {tab === 'support' && (
                <span className="flex items-center gap-2">
                  <MessageSquare size={16} />
                  <span>Tin Nhắn Hỗ Trợ</span>
                  {supportUnreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                      {supportUnreadCount}
                    </span>
                  )}
                </span>
              )}
              {tab === 'campaign-ads' && (
                <span className="flex items-center gap-2">
                  <Film size={16} />
                  <span>Quảng Cáo Campaign</span>
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'stats' && (
          <AdminAnalyticsDashboard onNavigateTab={(tab) => setActiveTab(tab)} />
        )}

        {activeTab === 'intelligence' && (
          <AdminAIOperations />
        )}

        {activeTab === 'virtual-tryon' && (
          <AdminVirtualTryOn />
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h2 className="text-lg font-semibold">Danh sách Users ({users.length})</h2>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-500">Đang tải...</div>
            ) : users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tên</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Phone</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ngày tạo</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user._id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">{user.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{user.phone || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {user.role !== 'admin' ? (
                            <button
                              onClick={() => handleDeleteUser(user._id, user.name)}
                              className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                            >
                              Xóa
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400">Không thể xóa</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500">Không có dữ liệu users</div>
            )}
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Danh sách Products ({products.length})</h2>
              <button
                onClick={() => {
                  handleResetAddProduct();
                  setShowAddProductModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer text-sm font-semibold"
              >
                <Plus size={18} />
                Thêm sản phẩm mới
              </button>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-500">Đang tải...</div>
            ) : products.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 w-20">Ảnh</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tên sản phẩm</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Giá</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Kho</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Brand</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => {
                      const mainImg = product.images?.[0] || product.image || product.imageUrl || '';
                      const isOutOfStock = (product.stock || 0) <= 0;
                      return (
                        <tr key={product._id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-center">
                            <div className="w-14 h-14 mx-auto rounded-lg border border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center shadow-sm">
                              {mainImg ? (
                                <img
                                  src={mainImg}
                                  alt={product.name}
                                  className="w-full h-full object-cover transition-transform duration-200 hover:scale-110"
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = 'https://via.placeholder.com/60?text=AMIRI';
                                  }}
                                />
                              ) : (
                                <ImageIcon size={22} className="text-gray-400" />
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                            <div className="flex items-center gap-2">
                              <span>{product.name}</span>
                              {product.featured && (
                                <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                                  ★ Nổi bật
                                </span>
                              )}
                            </div>
                            {product.sizes && product.sizes.length > 0 && (
                              <div className="mt-1 flex gap-1 flex-wrap">
                                {product.sizes.map(size => (
                                  <span key={size} className="text-[10px] px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                                    {size}
                                  </span>
                                ))}
                              </div>
                            )}
                            {Array.isArray(product.tags) && product.tags.length > 0 && (
                              <div className="mt-1 flex gap-1 flex-wrap">
                                {product.tags.map(tag => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-medium">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
                              {product.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-gray-900">
                            ${Number(product.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                              isOutOfStock
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isOutOfStock ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                              {isOutOfStock ? 'Hết hàng' : `${product.stock} tồn`}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                            {product.brand || 'AMIRI'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleOpenEditModal(product)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                title="Chỉnh sửa sản phẩm"
                              >
                                <Edit2 size={14} />
                                Sửa
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product._id, product.name)}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                title="Xóa sản phẩm"
                              >
                                <Trash2 size={14} />
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500">
                Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để bắt đầu!
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h2 className="text-lg font-semibold">Danh sách Đơn hàng ({orders.length})</h2>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-500">Đang tải...</div>
            ) : orders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Mã đơn</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Khách hàng</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Sản phẩm</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tổng tiền</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Trạng thái</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Thanh toán</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ngày đặt</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <tr key={order._id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">
                          #{order._id.slice(-8)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {order.user?.name || 'N/A'}
                          <div className="text-xs text-gray-500">{order.user?.email || ''}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
  {order.items && order.items.length > 0 ? (
    <div>
      <div className="font-semibold">{order.items.length} món</div>
      <div className="text-xs text-gray-500 max-w-xs truncate">
        {order.items.map((item, idx) => {
          const productName = item.name || item.product?.name || 'Sản phẩm';
          return idx < 2 ? productName : null;
        }).filter(Boolean).join(', ')}
        {order.items.length > 2 ? '...' : ''}
      </div>
    </div>
  ) : (
    <div className="text-sm text-gray-500">Chưa có sản phẩm</div>
  )}
</td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">
                          {
                            (() => {
                              const raw = order.total !== undefined ? order.total : (order.totalPrice !== undefined ? order.totalPrice : order.subtotal !== undefined ? order.subtotal : 0);
                              const n = Number(raw) || 0;
                              return `$${n.toFixed(2)}`;
                            })()
                          }
                        </td>
<td className="px-6 py-4 text-sm">
  <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusBadgeClass(order.status)}`}>
    {getStatusText(order.status)}
  </span>
</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {order.paymentMethod === 'credit_card' ? '💳 Thẻ' : 
                           order.paymentMethod === 'paypal' ? '🅿️ PayPal' : 
                           order.paymentMethod === 'sepay' ? '⚡ SePay VietQR' :
                           '💵 COD'}
                          {order.isPaid ? (
                            <div className="text-xs text-green-600 font-semibold">✓ Đã thanh toán</div>
                          ) : (
                            <div className="text-xs text-amber-600">Chưa thanh toán</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowOrderDetailModal(true);
                            }}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500">Chưa có đơn hàng nào</div>
            )}
          </div>
        )}

        {activeTab === 'support' && (
          <AdminChatInbox onUnreadChange={setSupportUnreadCount} />
        )}

        {activeTab === 'reviews' && (
          <AdminReviewsManager />
        )}

        {activeTab === 'newsletter' && (
          <AdminNewsletter />
        )}

        {activeTab === 'campaign-ads' && (
          <AdminCampaignAdsManager />
        )}
      </div>

      {/* ==================== MODAL THÊM SẢN PHẨM MỚI ==================== */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10 shadow-xs">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                    <Plus size={18} />
                  </span>
                  Thêm Sản Phẩm Mới
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Nhập đầy đủ thông tin, kích cỡ, màu sắc và hình ảnh để sản phẩm đồng bộ chuẩn xác
                </p>
              </div>
              <button 
                onClick={() => {
                  if (isAddingProduct) return;
                  handleResetAddProduct();
                  setShowAddProductModal(false);
                }} 
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Row 1: Tên & Brand */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Tên sản phẩm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: BONES DOWN JACKET"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Thương hiệu (Brand)
                  </label>
                  <input
                    type="text"
                    value={newProduct.brand}
                    onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: AMIRI"
                  />
                </div>
              </div>

              {/* Row 2: Danh mục, Giá, Số lượng kho */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Danh mục <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm capitalize bg-white cursor-pointer"
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {AVAILABLE_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Giá (USD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: 750"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Số lượng trong kho
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: 25"
                  />
                </div>
              </div>

              {/* Featured toggle */}
              <div className="flex items-center gap-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                <input
                  type="checkbox"
                  id="addFeatured"
                  checked={Boolean(newProduct.featured)}
                  onChange={(e) => setNewProduct({ ...newProduct, featured: e.target.checked })}
                  className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="addFeatured" className="text-sm font-medium text-amber-900 cursor-pointer select-none">
                  Đánh dấu là <span className="font-bold">Sản phẩm nổi bật</span> (Hiển thị ưu tiên trên trang chủ)
                </label>
              </div>

              {/* Sizes picker */}
              <div>
                <ProductSizeSelector
                  category={newProduct.category}
                  selectedSizes={newProduct.sizes || []}
                  onChangeSizes={(updatedSizes) => setNewProduct(prev => ({ ...prev, sizes: updatedSizes }))}
                />
              </div>

              {/* Colors */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  Màu sắc (Colors)
                </label>
                <input
                  type="text"
                  value={newProduct.colors}
                  onChange={(e) => setNewProduct({ ...newProduct, colors: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="VD: Black, White, Indigo, Vintage Grey (phân cách bằng dấu phẩy)"
                />
              </div>

              {/* Tags phân loại (Mega Menu Tags) */}
              <div>
                <ProductTagManager
                  tags={newProduct.tags || []}
                  onChangeTags={(tags) => setNewProduct(prev => ({ ...prev, tags }))}
                  suggestedTags={allAvailableTags}
                />
              </div>

              {/* IMAGE MANAGEMENT SECTION */}
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <ImageIcon size={18} className="text-blue-600" />
                    Quản lý Hình ảnh Sản phẩm
                  </h4>
                  <span className="text-xs text-gray-500 font-medium">
                    Tổng: {(newProduct.images?.length || 0) + selectedAddFiles.length} ảnh
                  </span>
                </div>

                {/* Added Images Gallery */}
                {newProduct.images && newProduct.images.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      Ảnh URL đã thêm ({newProduct.images.length}):
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {newProduct.images.map((imgUrl, idx) => (
                        <div key={idx} className="relative group aspect-square rounded-xl border border-gray-200 overflow-hidden bg-white shadow-xs">
                          <img
                            src={imgUrl}
                            alt={`Preview ${idx}`}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=Error'; }}
                          />
                          {idx === 0 && (
                            <span className="absolute top-1.5 left-1.5 bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                              Ảnh chính
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveAddImage(idx)}
                            className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 cursor-pointer"
                            title="Xóa ảnh này"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add image via URL */}
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    🔗 Thêm ảnh qua đường dẫn URL:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newProduct.newImageUrl || ''}
                      onChange={(e) => setNewProduct({ ...newProduct, newImageUrl: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddImageUrlToNew();
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
                      placeholder="https://amiri.com/.../image.jpg"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrlToNew}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer active:scale-95"
                    >
                      Thêm URL
                    </button>
                  </div>
                </div>

                {/* Upload new images from computer */}
                <div className="bg-white p-3 rounded-lg border border-dashed border-gray-300">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    📁 HOẶC tải ảnh từ máy tính (tự động upload lên Cloudinary):
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAddFileSelect}
                    className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />

                  {/* Previews of newly chosen files */}
                  {addFilePreviews.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-emerald-700 mb-1.5">
                        ✅ Sẵn sàng tải lên {addFilePreviews.length} ảnh từ máy tính:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {addFilePreviews.map((previewUrl, idx) => (
                          <div key={idx} className="relative group aspect-square rounded-xl border border-emerald-300 overflow-hidden bg-white shadow-xs">
                            <img
                              src={previewUrl}
                              alt={`New file preview ${idx}`}
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-1 left-1 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                              Từ máy
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAddFile(idx)}
                              className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 cursor-pointer"
                              title="Bỏ chọn ảnh này"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  Mô tả sản phẩm
                </label>
                <textarea
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  rows="3"
                  placeholder="Mô tả chi tiết về sản phẩm..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-3 justify-end items-center z-10">
              <button
                type="button"
                onClick={() => {
                  if (isAddingProduct) return;
                  handleResetAddProduct();
                  setShowAddProductModal(false);
                }}
                disabled={isAddingProduct}
                className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAddProduct}
                disabled={isAddingProduct}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-semibold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 active:scale-98"
              >
                {isAddingProduct ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang thêm sản phẩm...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Thêm sản phẩm</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL CHỈNH SỬA SẢN PHẨM ==================== */}
      {showEditProductModal && editingProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10 shadow-xs">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                    <Edit2 size={18} />
                  </span>
                  Chỉnh Sửa Sản Phẩm
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
                  Mã ID: {editingProduct._id} — {editingProduct.name}
                </p>
              </div>
              <button 
                onClick={() => {
                  if (isSavingProduct) return;
                  setShowEditProductModal(false);
                  setEditingProduct(null);
                }} 
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Row 1: Tên & Brand */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Tên sản phẩm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: MA COURT HIGH SNEAKER"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Thương hiệu (Brand)
                  </label>
                  <input
                    type="text"
                    value={editingProduct.brand}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: AMIRI"
                  />
                </div>
              </div>

              {/* Row 2: Danh mục, Giá, Số lượng kho */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Danh mục <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm capitalize bg-white cursor-pointer"
                  >
                    {AVAILABLE_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Giá (USD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: 750"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Số lượng trong kho
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingProduct.stock}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="VD: 25"
                  />
                </div>
              </div>

              {/* Featured toggle */}
              <div className="flex items-center gap-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                <input
                  type="checkbox"
                  id="editFeatured"
                  checked={Boolean(editingProduct.featured)}
                  onChange={(e) => setEditingProduct({ ...editingProduct, featured: e.target.checked })}
                  className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="editFeatured" className="text-sm font-medium text-amber-900 cursor-pointer select-none">
                  Đánh dấu là <span className="font-bold">Sản phẩm nổi bật</span> (Hiển thị ưu tiên trên trang chủ)
                </label>
              </div>

              {/* Sizes picker */}
              <div>
                <ProductSizeSelector
                  category={editingProduct.category}
                  selectedSizes={editingProduct.sizes || []}
                  onChangeSizes={(updatedSizes) => setEditingProduct(prev => ({ ...prev, sizes: updatedSizes }))}
                />
              </div>

              {/* Colors */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  Màu sắc (Colors)
                </label>
                <input
                  type="text"
                  value={editingProduct.colors}
                  onChange={(e) => setEditingProduct({ ...editingProduct, colors: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="VD: Black, White, Indigo, Vintage Grey (phân cách bằng dấu phẩy)"
                />
              </div>

              {/* Tags phân loại (Mega Menu Tags) */}
              <div>
                <ProductTagManager
                  tags={editingProduct.tags || []}
                  onChangeTags={(tags) => setEditingProduct(prev => ({ ...prev, tags }))}
                  suggestedTags={allAvailableTags}
                />
              </div>

              {/* IMAGE MANAGEMENT SECTION */}
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <ImageIcon size={18} className="text-blue-600" />
                    Quản lý Hình ảnh Sản phẩm
                  </h4>
                  <span className="text-xs text-gray-500 font-medium">
                    Tổng: {(editingProduct.existingImages?.length || 0) + selectedEditFiles.length} ảnh
                  </span>
                </div>

                {/* Existing Images Gallery */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    Ảnh hiện có trong hệ thống ({editingProduct.existingImages?.length || 0}):
                  </p>
                  {editingProduct.existingImages && editingProduct.existingImages.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {editingProduct.existingImages.map((imgUrl, idx) => (
                        <div key={idx} className="relative group aspect-square rounded-xl border border-gray-200 overflow-hidden bg-white shadow-xs">
                          <img
                            src={imgUrl}
                            alt={`Product preview ${idx}`}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=Error'; }}
                          />
                          {idx === 0 && (
                            <span className="absolute top-1.5 left-1.5 bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                              Ảnh chính
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingImage(idx)}
                            className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 cursor-pointer"
                            title="Xóa ảnh này"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-lg text-xs text-amber-800">
                      ⚠️ Sản phẩm chưa có ảnh nào được lưu. Hãy thêm URL hoặc tải ảnh từ máy tính.
                    </div>
                  )}
                </div>

                {/* Add image via URL */}
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    🔗 Thêm ảnh qua đường dẫn URL:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={editingProduct.newImageUrl || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, newImageUrl: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddImageUrlToEdit();
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
                      placeholder="https://amiri.com/.../image.jpg"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrlToEdit}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer active:scale-95"
                    >
                      Thêm URL
                    </button>
                  </div>
                </div>

                {/* Upload new images from computer */}
                <div className="bg-white p-3 rounded-lg border border-dashed border-gray-300">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    📁 HOẶC tải thêm ảnh mới từ máy tính (tự động upload lên Cloudinary):
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleEditFileSelect}
                    className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />

                  {/* Previews of newly chosen files */}
                  {editFilePreviews.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-emerald-700 mb-1.5">
                        ✅ Sẵn sàng tải lên {editFilePreviews.length} ảnh mới:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {editFilePreviews.map((previewUrl, idx) => (
                          <div key={idx} className="relative group aspect-square rounded-xl border border-emerald-300 overflow-hidden bg-white shadow-xs">
                            <img
                              src={previewUrl}
                              alt={`New file preview ${idx}`}
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-1 left-1 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                              Mới
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEditFile(idx)}
                              className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 cursor-pointer"
                              title="Bỏ chọn ảnh này"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  Mô tả sản phẩm
                </label>
                <textarea
                  value={editingProduct.description}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  rows="3"
                  placeholder="Mô tả chi tiết về sản phẩm..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex gap-3 justify-end items-center z-10">
              <button
                type="button"
                onClick={() => {
                  if (isSavingProduct) return;
                  setShowEditProductModal(false);
                  setEditingProduct(null);
                }}
                disabled={isSavingProduct}
                className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleUpdateProduct}
                disabled={isSavingProduct}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-semibold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isSavingProduct ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Đang lưu thay đổi...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Lưu Thay Đổi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOrderDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-bold">Chi tiết đơn hàng #{selectedOrder._id.slice(-8)}</h3>
              <button 
                onClick={() => setShowOrderDetailModal(false)} 
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-3">Thông tin khách hàng</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Tên:</span> {selectedOrder.user?.name || selectedOrder.shippingAddress?.fullName || 'N/A'}</p>
                    <p><span className="font-medium">Email:</span> {selectedOrder.user?.email || 'N/A'}</p>
                    <p><span className="font-medium">SĐT:</span> {selectedOrder.shippingAddress?.phone || selectedOrder.user?.phone || 'N/A'}</p>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-3">Địa chỉ giao hàng</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Địa chỉ:</span> {selectedOrder.shippingAddress?.address || selectedOrder.shippingAddress?.street || 'N/A'}</p>
                    <p><span className="font-medium">Thành phố:</span> {selectedOrder.shippingAddress?.city || 'N/A'}</p>
                    {selectedOrder.shippingAddress?.state && <p><span className="font-medium">Tỉnh/Bang:</span> {selectedOrder.shippingAddress.state}</p>}
                    {selectedOrder.shippingAddress?.postalCode && <p><span className="font-medium">Mã bưu điện:</span> {selectedOrder.shippingAddress.postalCode}</p>}
                    <p><span className="font-medium">Quốc gia:</span> {selectedOrder.shippingAddress?.country || 'N/A'}</p>
                  </div>
                </div>

                {/* Thông tin thanh toán SePay & Gateway */}
                <div className="bg-gray-50 p-4 rounded-lg md:col-span-2">
                  <h4 className="font-semibold text-gray-900 mb-3">Chi tiết thanh toán</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-gray-500 block">Phương thức:</span>
                      <span className="font-semibold text-gray-900">
                        {selectedOrder.paymentMethod === 'sepay' ? '⚡ Chuyển khoản SePay (VietQR)' :
                         selectedOrder.paymentMethod === 'credit_card' ? '💳 Thẻ tín dụng' :
                         selectedOrder.paymentMethod === 'paypal' ? '🅿️ PayPal' : '💵 COD'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">Trạng thái:</span>
                      <span className={`font-bold ${selectedOrder.isPaid ? 'text-green-600' : 'text-amber-600'}`}>
                        {selectedOrder.isPaid ? '✓ Đã thanh toán' : '⏳ Chưa thanh toán'}
                      </span>
                    </div>
                    {selectedOrder.paymentCode && (
                      <div>
                        <span className="text-xs text-gray-500 block">Mã chuyển khoản:</span>
                        <span className="font-mono font-bold text-blue-600">{selectedOrder.paymentCode}</span>
                      </div>
                    )}
                    {selectedOrder.amountVND > 0 && (
                      <div>
                        <span className="text-xs text-gray-500 block">Số tiền VND:</span>
                        <span className="font-mono font-bold text-gray-900">
                          {Number(selectedOrder.amountVND).toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    )}
                    {selectedOrder.sepayTransaction && (
                      <>
                        <div>
                          <span className="text-xs text-gray-500 block">Ngân hàng:</span>
                          <span className="font-semibold text-gray-800">{selectedOrder.sepayTransaction.gateway || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block">Mã tham chiếu SePay:</span>
                          <span className="font-mono text-xs text-gray-700">{selectedOrder.sepayTransaction.referenceCode || selectedOrder.sepayTransaction.id}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-3">Sản phẩm</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Sản phẩm</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Số lượng</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Giá</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
  {selectedOrder.items && selectedOrder.items.length > 0 ? (
    selectedOrder.items.map((item, index) => (
      <tr key={index} className="border-t">
        <td className="px-4 py-3 text-sm text-gray-900">
          <div className="font-medium">
            {item.name || item.product?.name || 'Sản phẩm không xác định'}
          </div>
          {item.product?.brand && (
            <div className="text-xs text-gray-500">{item.product.brand}</div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 text-center">
          {item.quantity || 0}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 text-right">
          ${Number(item.price || item.product?.price || 0).toFixed(2)}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
          ${(Number(item.quantity || 0) * Number(item.price || item.product?.price || 0)).toFixed(2)}
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan="4" className="px-4 py-6 text-center text-sm text-gray-500">
        Không có sản phẩm trong đơn hàng này
      </td>
    </tr>
  )}
</tbody>
                  </table>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Tạm tính:</span>
                    <span className="font-medium">${Number(selectedOrder.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Thuế:</span>
                    <span className="font-medium">${Number(selectedOrder.tax || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Phí vận chuyển:</span>
                    <span className="font-medium">${Number(selectedOrder.shipping || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="font-bold text-base">Tổng cộng:</span>
                    <span className="font-bold text-lg text-blue-600">
                      ${Number(selectedOrder.total || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cập nhật trạng thái đơn hàng
                </label>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => handleUpdateOrderStatus(selectedOrder._id, e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="pending">Chờ xử lý</option>
                  <option value="processing">Đang xử lý</option>
                  <option value="shipped">Đã gửi hàng</option>
                  <option value="delivered">Đã giao hàng</option>
                  <option value="cancelled">Đã hủy</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDeleteOrder(selectedOrder._id)}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Xóa đơn hàng
                </button>
                <button
                  onClick={() => setShowOrderDetailModal(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

