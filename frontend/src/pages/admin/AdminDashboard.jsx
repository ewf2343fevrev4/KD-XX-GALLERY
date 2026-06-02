import React, { useState, useEffect } from 'react';
import { Users, Package, Shield, TrendingUp, Plus, X } from 'lucide-react';

export default function AdminDashboard() {
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
  const [activeTab, setActiveTab] = useState('stats');
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    brand: '',
    description: '',
    images: ['']
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);

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

  const StatCard = ({ icon: Icon, label, value, bgColor }) => (
    <div className={`${bgColor} rounded-lg p-6 text-white shadow-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-90">{label}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <Icon size={40} className="opacity-50" />
      </div>
    </div>
  );

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/admin/login';
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    
    if (files.length > 0) {
      setNewProduct({...newProduct, images: ['']});
    }
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
    if (!newProduct.name || !newProduct.category || !newProduct.price) {
      alert('⚠️ Vui lòng điền đầy đủ: Tên, Category và Giá');
      return;
    }

    const imageUrl = newProduct.images[0]?.trim();
    if (!imageUrl && selectedFiles.length === 0) {
      alert('⚠️ Vui lòng nhập URL hình ảnh hoặc chọn file từ máy');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append('name', newProduct.name);
        formData.append('category', newProduct.category);
        formData.append('price', parseFloat(newProduct.price));
        formData.append('stock', parseInt(newProduct.stock) || 0);
        formData.append('brand', newProduct.brand || 'AMIRI');
        formData.append('description', newProduct.description || '');
        
        selectedFiles.forEach(file => {
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
          alert('✅ Thêm sản phẩm thành công!');
          setProducts([...products, data.data]);
          setStats(prev => ({ ...prev, totalProducts: prev.totalProducts + 1 }));
          setShowAddProductModal(false);
          setNewProduct({ name: '', category: '', price: '', stock: '', brand: '', description: '', images: [''] });
          setSelectedFiles([]);
        } else {
          alert(`❌ Lỗi: ${data.message || 'Không thể thêm sản phẩm'}`);
        }
      } else {
        const productData = {
          name: newProduct.name,
          category: newProduct.category,
          price: parseFloat(newProduct.price),
          stock: parseInt(newProduct.stock) || 0,
          brand: newProduct.brand || 'AMIRI',
          description: newProduct.description || '',
          images: [imageUrl]
        };

        const response = await fetch(`${API_BASE_URL}/api/admin/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(productData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
          alert('✅ Thêm sản phẩm thành công!');
          setProducts([...products, data.data]);
          setStats(prev => ({ ...prev, totalProducts: prev.totalProducts + 1 }));
          setShowAddProductModal(false);
          setNewProduct({ name: '', category: '', price: '', stock: '', brand: '', description: '', images: [''] });
        } else {
          alert(`❌ Lỗi: ${data.message || 'Không thể thêm sản phẩm'}`);
        }
      }
    } catch (err) {
      console.error('Add product error:', err);
      alert('❌ Có lỗi xảy ra khi thêm sản phẩm');
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

        <div className="flex gap-4 mb-8 border-b">
          {['stats', 'users', 'products', 'orders'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium capitalize transition ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'stats' && 'Thống Kê'}
              {tab === 'users' && 'Quản Lý Users'}
              {tab === 'products' && 'Quản Lý Products'}
              {tab === 'orders' && 'Quản Lý Orders'}
            </button>
          ))}
        </div>

        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard icon={Users} label="Tổng Users" value={stats.totalUsers} bgColor="bg-blue-500" />
            <StatCard icon={Package} label="Tổng Sản phẩm" value={stats.totalProducts} bgColor="bg-green-500" />
            <StatCard icon={Shield} label="Admins" value={stats.totalAdmins} bgColor="bg-purple-500" />
            <StatCard icon={TrendingUp} label="Users thường" value={stats.regularUsers} bgColor="bg-orange-500" />
          </div>
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
                onClick={() => setShowAddProductModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                Thêm sản phẩm
              </button>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-500">Đang tải...</div>
            ) : products.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tên</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Giá</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Stock</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Brand</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => (
                      <tr key={product._id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">{product.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{product.category}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">${product.price}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{product.stock || 0}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{product.brand || '-'}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleDeleteProduct(product._id, product.name)}
                            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
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
                           '💵 COD'}
                          {order.isPaid && <div className="text-xs text-green-600">✓ Đã thanh toán</div>}
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
      </div>

      {showAddProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-bold">Thêm Sản Phẩm Mới</h3>
              <button onClick={() => setShowAddProductModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tên sản phẩm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="VD: Nike Air Max 2024"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Chọn Category --</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                    <option value="accessories">Accessories</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                  <input
                    type="text"
                    value={newProduct.brand}
                    onChange={(e) => setNewProduct({...newProduct, brand: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="VD: AMIRI, Nike..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Giá (USD) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="VD: 199.99"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Số lượng trong kho</label>
                  <input
                    type="number"
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct({...newProduct, stock: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="VD: 100"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL Hình ảnh <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={newProduct.images[0] || ''}
                    onChange={(e) => {
                      setNewProduct({...newProduct, images: [e.target.value]});
                      setSelectedFiles([]);
                    }}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="https://example.com/image.jpg"
                    disabled={selectedFiles.length > 0}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    💡 Nhập URL hình ảnh từ nguồn bên ngoài (VD: Imgur, Cloudinary...)
                  </p>
                </div>

                <div className="md:col-span-2">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      📁 HOẶC chọn ảnh từ máy tính:
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      disabled={newProduct.images[0]?.trim() !== ''}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {selectedFiles.length > 0 && (
                      <div className="mt-2 text-sm text-green-600 font-medium">
                        ✅ Đã chọn {selectedFiles.length} ảnh: {selectedFiles.map(f => f.name).join(', ')}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      💡 Chọn ảnh từ ổ C, D, E... của bạn (tối đa 5 ảnh, mỗi ảnh &lt; 5MB)
                    </p>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mô tả</label>
                  <textarea
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows="4"
                    placeholder="Mô tả chi tiết về sản phẩm..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleAddProduct}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Thêm sản phẩm
                </button>
                <button
                  onClick={() => setShowAddProductModal(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Hủy
                </button>
              </div>
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

