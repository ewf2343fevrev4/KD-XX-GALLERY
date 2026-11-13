import { API_BASE_URL } from '../config/apiConfig';

// ==================== GENERIC CALL ====================
const apiCall = async (endpoint, token) => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {}
    });

    const data = await response.json();

    if (response.ok) {
      // ✅ FIX: Nếu data đã là array, wrap nó trong object
      // Nếu data đã là object với message/error, giữ nguyên
      if (Array.isArray(data)) {
        return { success: true, data };
      }
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'API call failed' };
    }
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== PRODUCT API ====================
export const getAllProducts = () => apiCall('/products');
export const getTryOnCatalog = () => apiCall('/tryon/catalog');
export const getProductById = (id) => apiCall(`/products/${id}`);
export const getProductsByCategory = (category) => apiCall(`/products/category/${category}`);
export const getProductTags = () => apiCall('/products/tags');

// ==================== USER API ====================
export const getUserProfile = (token) => apiCall('/users/profile', token);

export const updateUserProfile = async (token, userData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Update failed' };
    }
  } catch (error) {
    console.error('Update Profile Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== CART API ====================
export const getCart = (token) => apiCall('/users/cart', token);

export const addToCartApi = async (token, productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/cart/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ productId })
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Add to cart failed' };
    }
  } catch (error) {
    console.error('Add to Cart Error:', error);
    return { success: false, error: 'Network error' };
  }
};

export const removeFromCartApi = async (token, productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/cart/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ productId })
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Remove from cart failed' };
    }
  } catch (error) {
    console.error('Remove from Cart Error:', error);
    return { success: false, error: 'Network error' };
  }
};

export const clearCartApi = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/cart/clear`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Clear cart failed' };
    }
  } catch (error) {
    console.error('Clear Cart Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== WISHLIST API ====================
export const getWishlist = (token) => apiCall('/users/wishlist', token);

export const addToWishlistApi = async (token, productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/wishlist/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ productId })
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Add to wishlist failed' };
    }
  } catch (error) {
    console.error('Add to Wishlist Error:', error);
    return { success: false, error: 'Network error' };
  }
};

export const removeFromWishlistApi = async (token, productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/wishlist/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ productId })
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Remove from wishlist failed' };
    }
  } catch (error) {
    console.error('Remove from Wishlist Error:', error);
    return { success: false, error: 'Network error' };
  }
};

export const clearWishlistApi = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/wishlist/clear`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Clear wishlist failed' };
    }
  } catch (error) {
    console.error('Clear Wishlist Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== ORDER API (USER) ====================
export const createOrder = async (token, orderData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(orderData)
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Create order failed' };
    }
  } catch (error) {
    console.error('Create Order Error:', error);
    return { success: false, error: 'Network error' };
  }
};

export const getMyOrders = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/myorders`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Get orders failed' };
    }
  } catch (error) {
    console.error('Get Orders Error:', error);
    return { success: false, error: 'Network error' };
  }
};

export const getOrderById = async (token, orderId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Get order failed' };
    }
  } catch (error) {
    console.error('Get Order Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== SEPAY PAYMENT API ====================

// Get SePay VietQR payment info
export const getSepayQrInfo = async (orderId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sepay/qr-info/${orderId}`);
    const data = await response.json();
    if (response.ok && data.success) {
      return { success: true, data: data.data };
    }
    return { success: false, error: data.message || 'Failed to fetch QR payment info' };
  } catch (error) {
    console.error('Get SePay QR info error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Check order payment status (real-time polling fallback)
export const getOrderPaymentStatus = async (orderId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/${orderId}/payment-status`);
    const data = await response.json();
    if (response.ok && data.success) {
      return { success: true, data };
    }
    return { success: false, error: data.message || 'Failed to fetch payment status' };
  } catch (error) {
    console.error('Get payment status error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== ADMIN API ====================

// Admin - Get Dashboard Stats
export const getAdminStats = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/stats`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      const stats = (data && data.data !== undefined) ? data.data : data;
      return { success: true, data: stats };
    } else {
      return { success: false, error: data.message || 'Get stats failed' };
    }
  } catch (error) {
    console.error('Get Stats Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== ADMIN - USERS ====================

// Admin - Get All Users
export const getAllUsers = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Get users failed' };
    }
  } catch (error) {
    console.error('Get Users Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Get User by ID
export const getUserById = async (token, userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Get user failed' };
    }
  } catch (error) {
    console.error('Get User Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Update User
export const updateUser = async (token, userId, userData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Update user failed' };
    }
  } catch (error) {
    console.error('Update User Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Delete User
export const deleteUser = async (token, userId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Delete user failed' };
    }
  } catch (error) {
    console.error('Delete User Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== ADMIN - PRODUCTS ====================

// Admin - Get All Products (with pagination)
export const getAdminProducts = async (token, page = 1, limit = 10) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/products?page=${page}&limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Get products failed' };
    }
  } catch (error) {
    console.error('Get Products Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Add New Product
export const addProduct = async (token, productData) => {
  try {
    const isFormData = productData instanceof FormData;
    const headers = {
      Authorization: `Bearer ${token}`
    };
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE_URL}/admin/products`, {
      method: 'POST',
      headers,
      body: isFormData ? productData : JSON.stringify(productData)
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Add product failed' };
    }
  } catch (error) {
    console.error('Add Product Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Update Product
export const updateProduct = async (token, productId, productData) => {
  try {
    const isFormData = productData instanceof FormData;
    const headers = {
      Authorization: `Bearer ${token}`
    };
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
      method: 'PUT',
      headers,
      body: isFormData ? productData : JSON.stringify(productData)
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Update product failed' };
    }
  } catch (error) {
    console.error('Update Product Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Delete Product
export const deleteProduct = async (token, productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Delete product failed' };
    }
  } catch (error) {
    console.error('Delete Product Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== ADMIN - ORDERS ====================

// Admin - Get All Orders
export const getAdminOrders = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/orders`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Get orders failed' };
    }
  } catch (error) {
    console.error('Get Admin Orders Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Get Order by ID
export const getAdminOrderById = async (token, orderId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Get order failed' };
    }
  } catch (error) {
    console.error('Get Admin Order Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Update Order Status
export const updateOrderStatus = async (token, orderId, status) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Update order status failed' };
    }
  } catch (error) {
    console.error('Update Order Status Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// Admin - Delete Order
export const deleteOrder = async (token, orderId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/orders/${orderId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, data };
    } else {
      return { success: false, error: data.message || 'Delete order failed' };
    }
  } catch (error) {
    console.error('Delete Order Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== CAMPAIGN MEDIA / ADS API ====================
export const getCampaignMedia = async () => {
  const res = await apiCall('/campaign-media');
  if (res?.success && res.data) {
    const unwrapped = res.data.data ? res.data.data : res.data;
    return { success: true, data: unwrapped };
  }
  return res;
};

export const getAdminCampaignMedia = async (token) => {
  const res = await apiCall('/campaign-media/admin', token);
  if (res?.success && res.data) {
    const unwrapped = res.data.data ? res.data.data : res.data;
    return { success: true, data: unwrapped };
  }
  return res;
};

export const updateAdminCampaignMedia = async (token, mediaData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/campaign-media/admin`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(mediaData)
    });
    const data = await response.json();
    if (response.ok) {
      return { success: true, data: data.data };
    } else {
      return { success: false, error: data.message || 'Update campaign media failed' };
    }
  } catch (error) {
    console.error('Update Campaign Media Error:', error);
    return { success: false, error: 'Network error' };
  }
};

export const uploadCampaignMediaFile = async (token, file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/campaign-media/admin/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    const data = await response.json();
    if (response.ok && data.success) {
      return { success: true, url: data.url, resourceType: data.resourceType };
    } else {
      return { success: false, error: data.message || 'Upload failed' };
    }
  } catch (error) {
    console.error('Upload Campaign File Error:', error);
    return { success: false, error: 'Network error' };
  }
};

// ==================== REVIEWS & RATINGS API ====================
export const getProductReviews = async (productId, params = {}) => {
  try {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/reviews/product/${productId}?${query}` : `/reviews/product/${productId}`;
    const res = await fetch(`${API_BASE_URL}${endpoint}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('getProductReviews error:', err);
    return { success: false, error: 'Network error' };
  }
};

export const createProductReview = async (productId, formData, token = null) => {
  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/reviews/product/${productId}`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('createProductReview error:', err);
    return { success: false, error: 'Network error' };
  }
};

export const likeProductReview = async (reviewId, token = null) => {
  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/reviews/${reviewId}/like`, {
      method: 'POST',
      headers
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('likeProductReview error:', err);
    return { success: false, error: 'Network error' };
  }
};

export const getAdminReviews = async (token, params = {}) => {
  try {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/reviews/admin/all?${query}` : `/reviews/admin/all`;
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('getAdminReviews error:', err);
    return { success: false, error: 'Network error' };
  }
};

export const updateAdminReview = async (token, reviewId, updateData) => {
  try {
    const res = await fetch(`${API_BASE_URL}/reviews/admin/${reviewId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updateData)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('updateAdminReview error:', err);
    return { success: false, error: 'Network error' };
  }
};

export const deleteAdminReview = async (token, reviewId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/reviews/admin/${reviewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('deleteAdminReview error:', err);
    return { success: false, error: 'Network error' };
  }
};

// ==================== KD-XX INTELLIGENCE / AI OPERATIONS CENTER ====================

export const getAITasks = async (token) => {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai/tasks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('getAITasks error:', err);
    return { success: false, message: 'Lỗi mạng khi tải danh sách tác vụ AI' };
  }
};

export const runAITask = async (token, taskId, params = {}) => {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai/tasks/${taskId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('runAITask error:', err);
    return { success: false, message: 'Lỗi mạng khi kết nối trung tâm điều hành AI' };
  }
};

export const getAITaskHistory = async (token, limit = 15) => {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai/history?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('getAITaskHistory error:', err);
    return { success: false, message: 'Lỗi mạng khi tải lịch sử tác vụ AI' };
  }
};

export const getAITaskLogById = async (token, logId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/ai/history/${logId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('getAITaskLogById error:', err);
    return { success: false, message: 'Lỗi mạng khi tải chi tiết tác vụ' };
  }
};

// ==================== EXPORT DEFAULT ====================
export default {
  // Products
  getAllProducts,
  getProductById,
  getProductsByCategory,
  
  // User
  getUserProfile,
  updateUserProfile,
  
  // Cart
  getCart,
  addToCartApi,
  removeFromCartApi,
  clearCartApi,
  
  // Wishlist
  getWishlist,
  addToWishlistApi,
  removeFromWishlistApi,
  clearWishlistApi,
  
  // Orders (User)
  createOrder,
  getMyOrders,
  getOrderById,
  getSepayQrInfo,
  getOrderPaymentStatus,
  
  // Admin - Stats
  getAdminStats,
  
  // Admin - Users
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  
  // Admin - Products
  getAdminProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  
  // Admin - Orders
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  deleteOrder,

  // Campaign Media
  getCampaignMedia,
  getAdminCampaignMedia,
  updateAdminCampaignMedia,
  uploadCampaignMediaFile,

  // Reviews
  getProductReviews,
  createProductReview,
  likeProductReview,
  getAdminReviews,
  updateAdminReview,
  deleteAdminReview,

  // KD-XX Intelligence AI Operations
  getAITasks,
  runAITask,
  getAITaskHistory,
  getAITaskLogById,

  // KD-XX Virtual Try-On AI Module
  getTryOnAccount: (token) => apiCall('/tryon/account', token),
  getTryOnJob: (token, id) => apiCall(`/tryon/jobs/${id}`, token),
  getTryOnAdminStats: (token) => apiCall('/tryon/admin/stats', token),
  getTryOnAdminJobs: (token, status) => apiCall(`/tryon/admin/jobs${status ? `?status=${status}` : ''}`, token),
  getTryOnAdminLedgers: (token) => apiCall('/tryon/admin/ledgers', token)
};