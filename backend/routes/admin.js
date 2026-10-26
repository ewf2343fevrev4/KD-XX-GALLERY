const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/admin');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');

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
    if (error.name === 'CastError' || error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy sản phẩm' 
      });
    }
    console.error('❌ Get product error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server', 
      error: error.message 
    });
  }
});

// @route   POST /api/admin/products
// @desc    Tạo sản phẩm mới (hỗ trợ upload ảnh từ máy hoặc URL)
// @access  Private/Admin
router.post('/products', protect, admin, upload.array('images', 5), async (req, res) => {
  try {
    const { name, description, price, category, stock, brand, sizes, colors, featured } = req.body;

    if (!name || price === undefined || !category) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ: tên, giá, danh mục'
      });
    }

    let imageUrls = [];

    // 1. Upload ảnh lên Cloudinary nếu có files
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
    
    // 2. Thêm URL từ body nếu có
    if (req.body.images) {
      let bodyImgs = req.body.images;
      if (typeof bodyImgs === 'string') {
        try {
          bodyImgs = JSON.parse(bodyImgs);
        } catch (e) {
          bodyImgs = [bodyImgs];
        }
      }
      if (Array.isArray(bodyImgs)) {
        const validUrls = bodyImgs.filter(url => url && typeof url === 'string' && url.trim() !== '');
        imageUrls = [...imageUrls, ...validUrls];
      }
    }

    if (req.body.newImageUrl && typeof req.body.newImageUrl === 'string' && req.body.newImageUrl.trim()) {
      imageUrls.push(req.body.newImageUrl.trim());
    }

    imageUrls = Array.from(new Set(imageUrls.filter(url => Boolean(url))));

    let parsedSizes = [];
    if (sizes) {
      if (typeof sizes === 'string') {
        try {
          parsedSizes = JSON.parse(sizes);
        } catch (e) {
          parsedSizes = sizes.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (Array.isArray(sizes)) {
        parsedSizes = sizes;
      }
    }

    let parsedColors = [];
    if (colors) {
      if (typeof colors === 'string') {
        try {
          parsedColors = JSON.parse(colors);
        } catch (e) {
          parsedColors = colors.split(',').map(c => c.trim()).filter(Boolean);
        }
      } else if (Array.isArray(colors)) {
        parsedColors = colors;
      }
    }

    const numStock = parseInt(stock) || 0;
    const isFeatured = featured === true || featured === 'true';

    const product = await Product.create({
      name: name.trim(),
      description: description || '',
      price: parseFloat(price),
      category,
      images: imageUrls,
      image: imageUrls.length > 0 ? imageUrls[0] : '',
      stock: numStock,
      inStock: numStock > 0,
      brand: brand?.trim() || 'AMIRI',
      sizes: parsedSizes,
      colors: parsedColors,
      featured: isFeatured
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
// @desc    Cập nhật sản phẩm (hỗ trợ sửa thông tin & ảnh)
// @access  Private/Admin
router.put('/products/:id', protect, admin, upload.array('images', 5), async (req, res) => {
  try {
    const { name, description, price, category, stock, brand, sizes, colors, featured, inStock } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy sản phẩm' 
      });
    }

    // Xử lý danh sách ảnh
    let finalImages = [];
    
    // 1. Kiểm tra ảnh cũ được giữ lại hoặc URLs truyền qua body
    const bodyImagesSource = req.body.existingImages !== undefined ? req.body.existingImages : req.body.images;
    
    if (bodyImagesSource !== undefined) {
      let parsed = bodyImagesSource;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          parsed = [parsed];
        }
      }
      if (Array.isArray(parsed)) {
        finalImages = parsed.map(url => typeof url === 'string' ? url.trim() : '').filter(Boolean);
      } else if (typeof parsed === 'string' && parsed.trim()) {
        finalImages = [parsed.trim()];
      }
    } else if (!req.files || req.files.length === 0) {
      // Giữ nguyên ảnh hiện tại nếu client không gửi field ảnh và cũng không upload file mới
      finalImages = Array.isArray(product.images) && product.images.length > 0
        ? [...product.images]
        : (product.image ? [product.image] : []);
    }

    // 2. Nếu có URL mới nhập riêng (ví dụ field newImageUrl)
    if (req.body.newImageUrl && typeof req.body.newImageUrl === 'string' && req.body.newImageUrl.trim()) {
      const trimmedUrl = req.body.newImageUrl.trim();
      if (!finalImages.includes(trimmedUrl)) {
        finalImages.push(trimmedUrl);
      }
    }

    // 3. Upload các file ảnh mới lên Cloudinary nếu có
    if (req.files && req.files.length > 0) {
      console.log(`📤 Uploading ${req.files.length} new files to Cloudinary for product ${product._id}...`);
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
        finalImages.push(result.secure_url);
        console.log(`✅ Uploaded new image: ${result.secure_url}`);
      }
    }

    // Loại bỏ URL trùng lặp và rỗng
    finalImages = Array.from(new Set(finalImages.filter(url => url && typeof url === 'string' && url.trim() !== '')));

    // Cập nhật các trường
    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = parseFloat(price);
    if (category !== undefined) product.category = category;
    if (stock !== undefined) {
      product.stock = parseInt(stock) || 0;
      product.inStock = product.stock > 0;
    }
    if (inStock !== undefined) {
      product.inStock = inStock === true || inStock === 'true';
    }
    if (brand !== undefined) product.brand = brand.trim() || 'AMIRI';

    // sizes
    if (sizes !== undefined) {
      let parsedSizes = sizes;
      if (typeof parsedSizes === 'string') {
        try {
          parsedSizes = JSON.parse(parsedSizes);
        } catch (e) {
          parsedSizes = parsedSizes.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      if (Array.isArray(parsedSizes)) {
        product.sizes = parsedSizes;
      }
    }

    // colors
    if (colors !== undefined) {
      let parsedColors = colors;
      if (typeof parsedColors === 'string') {
        try {
          parsedColors = JSON.parse(parsedColors);
        } catch (e) {
          parsedColors = colors.split(',').map(c => c.trim()).filter(Boolean);
        }
      }
      if (Array.isArray(parsedColors)) {
        product.colors = parsedColors;
      }
    }

    // featured
    if (featured !== undefined) {
      product.featured = featured === true || featured === 'true';
    }

    // Gán images và image
    product.images = finalImages;
    product.image = finalImages.length > 0 ? finalImages[0] : '';

    const updatedProduct = await product.save();

    console.log(`✅ Product updated successfully: ${updatedProduct.name}`);

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
      // Idempotent restock: only restore stock once if not already restocked
      if (!order.isRestocked) {
        order.isRestocked = true;
        const itemsToRestock = order.items?.length ? order.items : (order.orderItems || []);
        for (const item of itemsToRestock) {
          const pId = item.product || item._id;
          if (pId && item.quantity > 0) {
            await Product.updateOne({ _id: pId }, { $inc: { stock: item.quantity } });
          }
        }
      }
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
// @desc    Lấy thống kê phân tích kinh doanh toàn diện
// @access  Private/Admin
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const [allUsers, allProducts, allOrders, allReviews] = await Promise.all([
      User.find({}).select('-password').lean(),
      Product.find({}).lean(),
      Order.find({}).populate('user', 'name email').sort({ createdAt: -1 }).lean(),
      Review.find({}).lean()
    ]);

    // 1. Users Breakdown
    const totalUsers = allUsers.length;
    const totalAdmins = allUsers.filter(u => u.role === 'admin').length;
    const regularUsers = totalUsers - totalAdmins;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsersThisWeek = allUsers.filter(u => new Date(u.createdAt) >= sevenDaysAgo).length;

    // 2. Orders & Revenue Breakdown
    const totalOrders = allOrders.length;
    const statusCounts = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0
    };
    let totalRevenue = 0;
    let paidOrdersCount = 0;
    let nonCancelledCount = 0;

    // Lookup map to guarantee fresh catalog images
    const productByIdMap = new Map();
    const productByNameMap = new Map();
    allProducts.forEach(prod => {
      if (prod._id) {
        productByIdMap.set(prod._id.toString(), prod);
      }
      if (prod.name) {
        productByNameMap.set(prod.name.trim().toLowerCase(), prod);
      }
    });

    const resolveItemImage = (item) => {
      if (!item) return '/placeholder.jpg';
      const prodId = item.product?._id?.toString() || item.product?.toString();
      const prodByName = item.name ? productByNameMap.get(item.name.trim().toLowerCase()) : null;
      const currentProd = (prodId ? productByIdMap.get(prodId) : null) || prodByName;

      if (currentProd) {
        const catalogImage = currentProd.image || (Array.isArray(currentProd.images) && currentProd.images[0]);
        if (catalogImage && typeof catalogImage === 'string' && catalogImage.trim() !== '') {
          return catalogImage;
        }
      }
      return item.image || item.product?.image || (Array.isArray(item.product?.images) && item.product.images[0]) || '/placeholder.jpg';
    };

    const productSalesMap = {};

    allOrders.forEach(order => {
      const status = (order.orderStatus || order.status || 'pending').toLowerCase();
      if (statusCounts[status] !== undefined) {
        statusCounts[status] += 1;
      } else {
        statusCounts.pending += 1;
      }

      const orderTotal = Number(order.totalPrice || order.total || 0);

      if (status !== 'cancelled') {
        totalRevenue += orderTotal;
        nonCancelledCount += 1;
      }

      if (order.isPaid) {
        paidOrdersCount += 1;
      }

      // Aggregate items sold
      const items = order.orderItems || order.items || [];
      if (Array.isArray(items) && status !== 'cancelled') {
        items.forEach(item => {
          const key = item.product?._id?.toString() || item.product?.toString() || item.name;
          if (!productSalesMap[key]) {
            productSalesMap[key] = {
              id: key,
              name: item.name || 'Sản phẩm',
              image: resolveItemImage(item),
              price: item.price || 0,
              unitsSold: 0,
              revenue: 0
            };
          }
          const qty = Number(item.quantity || 1);
          productSalesMap[key].unitsSold += qty;
          productSalesMap[key].revenue += (item.price || 0) * qty;
        });
      }
    });

    const averageOrderValue = nonCancelledCount > 0 
      ? (totalRevenue / nonCancelledCount).toFixed(2) 
      : '0.00';

    // Top selling products
    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
      .slice(0, 5);

    // 3. Products & Inventory Breakdown
    const totalProducts = allProducts.length;
    let inStockProducts = 0;
    let outOfStockProducts = 0;
    const lowStockList = [];
    const categoryCounts = {};

    allProducts.forEach(prod => {
      const stock = Number(prod.stock || 0);
      if (stock > 0) {
        inStockProducts += 1;
        if (stock <= 3) {
          lowStockList.push({
            _id: prod._id,
            name: prod.name,
            stock: stock,
            price: prod.price,
            image: prod.image || prod.images?.[0] || '/placeholder.jpg',
            category: prod.category,
            brand: prod.brand || 'AMIRI'
          });
        }
      } else {
        outOfStockProducts += 1;
        lowStockList.push({
          _id: prod._id,
          name: prod.name,
          stock: 0,
          price: prod.price,
          image: prod.image || prod.images?.[0] || '/placeholder.jpg',
          category: prod.category,
          brand: prod.brand || 'AMIRI'
        });
      }

      const cat = prod.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const categoryBreakdown = Object.entries(categoryCounts).map(([cat, count]) => ({
      category: cat,
      count,
      percentage: totalProducts > 0 ? Math.round((count / totalProducts) * 100) : 0
    }));

    // 4. Reviews & Rating Summary
    const totalReviews = allReviews.length;
    const approvedReviews = allReviews.filter(r => r.status === 'approved');
    let avgRating = 5.0;
    if (approvedReviews.length > 0) {
      const sumStars = approvedReviews.reduce((sum, r) => sum + (r.rating || 5), 0);
      avgRating = Math.round((sumStars / approvedReviews.length) * 10) / 10;
    }
    const reviewsWithPhotos = allReviews.filter(r => Array.isArray(r.images) && r.images.length > 0).length;

    // 5. Revenue Timelines (Daily 7 Days & Monthly)
    const dailyRevenueMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
      dailyRevenueMap[dateKey] = {
        date: dateKey,
        label: i === 0 ? 'Hôm nay' : dayLabel,
        revenue: 0,
        ordersCount: 0
      };
    }

    const monthlyRevenueMap = {};

    allOrders.forEach(order => {
      const status = (order.orderStatus || order.status || 'pending').toLowerCase();
      if (status !== 'cancelled' && order.createdAt) {
        const orderDate = new Date(order.createdAt);
        const orderDateKey = orderDate.toISOString().slice(0, 10);
        const monthKey = orderDate.toISOString().slice(0, 7);
        const monthLabel = `T${orderDate.getMonth() + 1}/${orderDate.getFullYear()}`;

        const orderTotal = Number(order.totalPrice || order.total || 0);

        if (dailyRevenueMap[orderDateKey]) {
          dailyRevenueMap[orderDateKey].revenue += orderTotal;
          dailyRevenueMap[orderDateKey].ordersCount += 1;
        }

        if (!monthlyRevenueMap[monthKey]) {
          monthlyRevenueMap[monthKey] = {
            date: monthKey,
            label: monthLabel,
            revenue: 0,
            ordersCount: 0
          };
        }
        monthlyRevenueMap[monthKey].revenue += orderTotal;
        monthlyRevenueMap[monthKey].ordersCount += 1;
      }
    });

    const revenueTimeline7d = Object.values(dailyRevenueMap);
    const revenueTimelineMonthly = Object.values(monthlyRevenueMap).sort((a, b) => a.date.localeCompare(b.date));

    // 6. Recent Orders Preview
    const recentOrders = allOrders.slice(0, 6).map(order => {
      const items = order.orderItems || order.items || [];
      const firstItem = items[0];
      return {
        _id: order._id,
        user: order.user ? { name: order.user.name, email: order.user.email } : { name: 'Khách lẻ', email: '' },
        total: Number(order.totalPrice || order.total || 0),
        status: order.orderStatus || order.status || 'pending',
        isPaid: Boolean(order.isPaid),
        itemsCount: items.length,
        firstItemImage: firstItem ? resolveItemImage(firstItem) : '/placeholder.jpg',
        createdAt: order.createdAt
      };
    });

    res.json({
      success: true,
      data: {
        // Core KPI
        totalRevenue: totalRevenue.toFixed(2),
        totalOrders,
        averageOrderValue,
        pendingOrders: statusCounts.pending + statusCounts.processing,
        paidOrdersCount,
        
        // Orders Breakdown
        statusCounts,
        
        // Users
        totalUsers,
        totalAdmins,
        regularUsers,
        newUsersThisWeek,

        // Products & Stock
        totalProducts,
        inStockProducts,
        outOfStockProducts,
        lowStockCount: lowStockList.length,
        lowStockList: lowStockList.slice(0, 6),
        categoryBreakdown,

        // Top Sellers
        topSellingProducts,

        // Reviews
        reviewStats: {
          totalReviews,
          averageRating: avgRating,
          reviewsWithPhotos
        },

        // Charts & Activity
        revenueTimeline: revenueTimeline7d,
        revenueTimeline7d,
        revenueTimelineMonthly,
        recentOrders
      }
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi server khi tính toán thống kê', 
      error: error.message 
    });
  }
});

module.exports = router;
