const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/admin');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

const cloudinary = require('../config/cloudinary');
const upload = require('../middleware/upload');

// ==================== USER MANAGEMENT ====================

// @route   GET /api/admin/users
// @desc    Lấy danh sách tất cả users
// @access  Private/Admin
router.get('/users', protect, admin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   GET /api/admin/users/:id
// @desc    Lấy thông tin user theo ID
// @access  Private/Admin
router.get('/users/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy user' 
      });
    }

    res.json({ 
      success: true, 
      data: user 
    });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   PUT /api/admin/users/:id
// @desc    Cập nhật thông tin user
// @access  Private/Admin
router.put('/users/:id', protect, admin, async (req, res) => {
  try {
    const { name, email, role, phone, address, city, postalCode, country } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy user' 
      });
    }

    // Kiểm tra email trùng
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email đã được sử dụng'
        });
      }
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.role = role || user.role;
    user.phone = phone || user.phone;
    user.address = address || user.address;
    user.city = city || user.city;
    user.postalCode = postalCode || user.postalCode;
    user.country = country || user.country;

    const updatedUser = await user.save();

    res.json({
      success: true,
      message: 'Cập nhật user thành công',
      data: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        address: updatedUser.address,
        city: updatedUser.city,
        postalCode: updatedUser.postalCode,
        country: updatedUser.country
      }
    });
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Xóa user
// @access  Private/Admin
router.delete('/users/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy user' 
      });
    }

    // Không cho phép xóa chính mình
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ 
        success: false,
        message: 'Không thể xóa tài khoản của chính mình' 
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ 
      success: true, 
      message: 'Xóa user thành công' 
    });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// ==================== PRODUCT MANAGEMENT ====================

// @route   GET /api/admin/products
// @desc    Lấy danh sách tất cả products (có phân trang)
// @access  Private/Admin
router.get('/products', protect, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await Product.countDocuments();
    const products = await Product.find({})
      .limit(limit)
      .skip(skip)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: products.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: products
    });
  } catch (error) {
    console.error('❌ Get products error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   GET /api/admin/products/:id
// @desc    Lấy chi tiết product
// @access  Private/Admin
router.get('/products/:id', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy sản phẩm' 
      });
    }

    res.json({ 
      success: true, 
      data: product 
    });
  } catch (error) {
    console.error('❌ Get product error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   POST /api/admin/products
// @desc    Tạo sản phẩm mới (hỗ trợ upload ảnh từ máy)
// @access  Private/Admin
router.post('/products', protect, admin, upload.array('images', 5), async (req, res) => {
  try {
    const { name, description, price, category, stock, brand } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ: tên, giá, danh mục'
      });
    }

    let imageUrls = [];

    // Upload ảnh lên Cloudinary nếu có file
    if (req.files && req.files.length > 0) {
      console.log(`📤 Uploading ${req.files.length} files to Cloudinary...`);
      
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { 
              folder: 'amiri-products',
              resource_type: 'image'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(file.buffer);
        });
        
        imageUrls.push(result.secure_url);
        console.log(`✅ Uploaded: ${result.secure_url}`);
      }
    } 
    // Hoặc dùng URL từ body
    else if (req.body.images) {
      imageUrls = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
      imageUrls = imageUrls.filter(url => url && url.trim() !== '');
      console.log(`🔗 Using URLs from body: ${imageUrls.join(', ')}`);
    }

    const product = await Product.create({
      name,
      description: description || '',
      price: parseFloat(price),
      category,
      images: imageUrls,
      stock: parseInt(stock) || 0,
      brand: brand || 'AMIRI'
    });

    console.log(`✅ Product created: ${product.name}`);

    res.status(201).json({
      success: true,
      message: 'Tạo sản phẩm thành công',
      data: product
    });
  } catch (error) {
    console.error('❌ Add product error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   PUT /api/admin/products/:id
// @desc    Cập nhật sản phẩm
// @access  Private/Admin
router.put('/products/:id', protect, admin, upload.array('images', 5), async (req, res) => {
  try {
    const { name, description, price, category, stock, brand } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy sản phẩm' 
      });
    }

    let imageUrls = product.images; // Giữ ảnh cũ

    // Upload ảnh mới nếu có
    if (req.files && req.files.length > 0) {
      console.log(`📤 Uploading ${req.files.length} new images...`);
      imageUrls = [];
      
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { 
              folder: 'amiri-products',
              resource_type: 'image'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(file.buffer);
        });
        
        imageUrls.push(result.secure_url);
      }
    } 
    // Hoặc update từ body
    else if (req.body.images) {
      imageUrls = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
      imageUrls = imageUrls.filter(url => url && url.trim() !== '');
    }

    product.name = name || product.name;
    product.description = description || product.description;
    product.price = price !== undefined ? parseFloat(price) : product.price;
    product.category = category || product.category;
    product.images = imageUrls;
    product.stock = stock !== undefined ? parseInt(stock) : product.stock;
    product.brand = brand || product.brand;

    const updatedProduct = await product.save();

    res.json({
      success: true,
      message: 'Cập nhật sản phẩm thành công',
      data: updatedProduct
    });
  } catch (error) {
    console.error('❌ Update product error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   DELETE /api/admin/products/:id
// @desc    Xóa sản phẩm
// @access  Private/Admin
router.delete('/products/:id', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy sản phẩm' 
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ 
      success: true, 
      message: 'Xóa sản phẩm thành công' 
    });
  } catch (error) {
    console.error('❌ Delete product error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// ==================== ORDER MANAGEMENT ====================

// @route   GET /api/admin/orders
// @desc    Lấy tất cả đơn hàng (Admin)
// @access  Private/Admin
router.get('/orders', protect, admin, async (req, res) => {
  try {
    console.log('📦 Fetching all orders...');
    
    const orders = await Order.find({})
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${orders.length} orders`);

    // Helper function để convert về số an toàn
    const toNumber = (v) => {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (v === null || v === undefined) return 0;
      const n = parseFloat(v);
      return Number.isNaN(n) ? 0 : n;
    };

    // Transform data và populate product thủ công
    const transformedOrders = await Promise.all(orders.map(async (order) => {
      // ✅ FIX: Đọc items HOẶC orderItems (tương thích cả 2 schema)
      const populatedItems = await Promise.all(
        (order.items || order.orderItems || []).map(async (item) => {
          let productInfo = null;
          
          try {
            if (item.product) {
              productInfo = await Product.findById(item.product)
                .select('name images price brand')
                .lean();
            }
          } catch (err) {
            console.warn(`⚠️ Cannot populate product ${item.product}:`, err.message);
          }

          return {
            _id: item._id,
            product: productInfo ? {
              _id: productInfo._id,
              name: productInfo.name || item.name,
              brand: productInfo.brand,
              images: productInfo.images
            } : null,
            name: item.name,
            quantity: item.quantity || 0,
            price: toNumber(item.price),
            image: item.image,
            size: item.size,
            color: item.color
          };
        })
      );

      return {
        _id: order._id,
        user: order.user ? {
          name: order.user.name || 'N/A',
          email: order.user.email || 'N/A',
          phone: order.user.phone || 'N/A'
        } : { name: 'Deleted User', email: 'N/A', phone: 'N/A' },
        items: populatedItems,
        shippingAddress: order.shippingAddress || {},
        total: toNumber(order.totalPrice || order.total),
        subtotal: toNumber(order.itemsPrice || order.subtotal),
        tax: toNumber(order.taxPrice || order.tax),
        shipping: toNumber(order.shippingPrice || order.shipping),
        status: order.orderStatus || order.status || 'pending',
        paymentMethod: order.paymentMethod || 'Credit Card',
        isPaid: order.isPaid || false,
        isDelivered: order.isDelivered || false,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    }));

    console.log('✅ Orders transformed successfully');

    res.json({
      success: true,
      count: transformedOrders.length,
      data: transformedOrders
    });
  } catch (error) {
    console.error('❌ Get orders error:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server khi tải orders', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   GET /api/admin/orders/:id
// @desc    Lấy chi tiết đơn hàng
// @access  Private/Admin
router.get('/orders/:id', protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .lean();

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy đơn hàng' 
      });
    }

    const toNumber = (v) => {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (v === null || v === undefined) return 0;
      const n = parseFloat(v);
      return Number.isNaN(n) ? 0 : n;
    };

    // ✅ FIX: Đọc items HOẶC orderItems
    const populatedItems = await Promise.all(
      (order.items || order.orderItems || []).map(async (item) => {
        let productInfo = null;
        
        try {
          if (item.product) {
            productInfo = await Product.findById(item.product)
              .select('name images price brand')
              .lean();
          }
        } catch (err) {
          console.warn(`⚠️ Cannot populate product ${item.product}:`, err.message);
        }

        return {
          _id: item._id,
          product: productInfo ? {
            _id: productInfo._id,
            name: productInfo.name || item.name,
            brand: productInfo.brand,
            images: productInfo.images,
            price: productInfo.price
          } : null,
          name: item.name,
          quantity: item.quantity || 0,
          price: toNumber(item.price),
          image: item.image,
          size: item.size,
          color: item.color
        };
      })
    );

    const transformedOrder = {
      _id: order._id,
      user: order.user ? {
        name: order.user.name || 'N/A',
        email: order.user.email || 'N/A',
        phone: order.user.phone || 'N/A'
      } : { name: 'Deleted User', email: 'N/A', phone: 'N/A' },
      items: populatedItems,
      shippingAddress: {
        address: order.shippingAddress?.address || '',
        city: order.shippingAddress?.city || 'N/A',
        postalCode: order.shippingAddress?.postalCode || '00000',
        country: order.shippingAddress?.country || 'Vietnam',
        phone: order.shippingAddress?.phone || order.user?.phone || 'N/A'
      },
      subtotal: toNumber(order.itemsPrice || order.subtotal),
      tax: toNumber(order.taxPrice || order.tax),
      shipping: toNumber(order.shippingPrice || order.shipping),
      total: toNumber(order.totalPrice || order.total),
      status: order.orderStatus || order.status || 'pending',
      paymentMethod: order.paymentMethod || 'Credit Card',
      isPaid: order.isPaid || false,
      isDelivered: order.isDelivered || false,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };

    res.json({
      success: true,
      data: transformedOrder
    });
  } catch (error) {
    console.error('❌ Get order detail error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   PUT /api/admin/orders/:id/status
// @desc    Cập nhật trạng thái đơn hàng
// @access  Private/Admin
router.put('/orders/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy đơn hàng' 
      });
    }

    // ✅ Cập nhật cả 2 field để tương thích
    order.orderStatus = status;
    order.status = status;

    if (status === 'delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    } else if (status === 'cancelled') {
      order.isDelivered = false;
    }

    const updatedOrder = await order.save();

    res.json({
      success: true,
      message: `Cập nhật trạng thái thành "${status}" thành công`,
      data: updatedOrder
    });
  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   DELETE /api/admin/orders/:id
// @desc    Xóa đơn hàng
// @access  Private/Admin
router.delete('/orders/:id', protect, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy đơn hàng' 
      });
    }

    await Order.findByIdAndDelete(req.params.id);

    res.json({ 
      success: true, 
      message: 'Xóa đơn hàng thành công' 
    });
  } catch (error) {
    console.error('❌ Delete order error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// ==================== DASHBOARD STATS ====================

// @route   GET /api/admin/stats
// @desc    Lấy thống kê tổng quan
// @access  Private/Admin
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalAdmins = await User.countDocuments({ role: 'admin' });

    // Tính tổng doanh thu
    const orders = await Order.find({ 
      $or: [
        { orderStatus: { $ne: 'cancelled' } },
        { status: { $ne: 'cancelled' } }
      ]
    });
    
    const totalRevenue = orders.reduce((sum, order) => {
      return sum + (order.totalPrice || order.total || 0);
    }, 0);

    // Đơn hàng pending
    const pendingOrders = await Order.countDocuments({ 
      $or: [
        { orderStatus: { $in: ['pending', 'processing'] } },
        { status: { $in: ['pending', 'processing'] } }
      ]
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalAdmins,
        regularUsers: totalUsers - totalAdmins,
        totalRevenue: totalRevenue.toFixed(2),
        pendingOrders
      }
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

module.exports = router;