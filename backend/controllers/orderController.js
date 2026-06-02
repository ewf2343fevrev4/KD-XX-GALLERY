const Order = require('../models/Order');
const Product = require('../models/Product');

// @desc    Tạo đơn hàng mới
// @route   POST /api/orders
// @access  Private (cần đăng nhập)
const createOrder = async (req, res) => {
  try {
    const {
      items,  // ✅ Nhận items từ frontend
      shippingAddress,
      paymentMethod,
      subtotal,
      tax,
      shipping,
      total
    } = req.body;

    // Kiểm tra có sản phẩm không
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    // Tạo order mới
    const order = new Order({
      user: req.user._id,
      items,  // ✅ Lưu vào field items
      shippingAddress,
      paymentMethod,
      subtotal,
      tax,
      shipping,
      total
    });

    const createdOrder = await order.save();

    // Giảm stock của sản phẩm (optional)
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (product && product.stock) {
        product.stock -= item.quantity;
        await product.save();
      }
    }

    res.status(201).json(createdOrder);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Lấy danh sách đơn hàng của user
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product', 'name images price brand')  // ✅ items thay vì orderItems
      .sort({ createdAt: -1 });
    
    res.json(orders);
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Lấy chi tiết 1 đơn hàng
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('items.product', 'name images price brand');  // ✅ items thay vì orderItems

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Kiểm tra order có thuộc về user này không (hoặc là admin)
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== ADMIN FUNCTIONS ====================

// @desc    Lấy TẤT CẢ đơn hàng (Admin)
// @route   GET /api/admin/orders
// @access  Private/Admin
const getAllOrdersAdmin = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate({
        path: 'items.product',  // ✅ ĐỔI orderItems → items
        select: 'name images price description category stock brand'
      })
      .sort({ createdAt: -1 });

    console.log('📦 Total orders found:', orders.length);
    if (orders.length > 0) {
      console.log('📦 First order raw:', JSON.stringify(orders[0], null, 2));
    }

    // ✅ MAP field names để khớp với frontend
    const mappedOrders = orders.map(order => {
      const mapped = {
        _id: order._id,
        user: order.user,
        items: order.items ? order.items.map(item => ({  // ✅ ĐỔI orderItems → items
          _id: item._id,
          product: item.product,
          name: item.name,
          image: item.image,
          price: item.price,
          quantity: item.quantity,
          size: item.size,
          color: item.color
        })) : [],
        shippingAddress: {
          fullName: order.user?.name || 'N/A',
          phone: order.user?.phone || order.shippingAddress?.phone || 'N/A',
          address: order.shippingAddress?.address || 'N/A',
          city: order.shippingAddress?.city || 'N/A',
          state: order.shippingAddress?.state || '',
          postalCode: order.shippingAddress?.postalCode || '00000',
          country: order.shippingAddress?.country || 'Vietnam'
        },
        paymentMethod: order.paymentMethod?.toLowerCase().replace(/\s+/g, '_') || 'cod',
        subtotal: order.subtotal || 0,  // ✅ Đọc từ field subtotal
        tax: order.tax || 0,            // ✅ Đọc từ field tax
        shipping: order.shipping || 0,  // ✅ Đọc từ field shipping
        total: order.total || 0,        // ✅ Đọc từ field total
        status: order.status || 'pending',  // ✅ Đọc từ field status
        isPaid: order.isPaid || false,
        isDelivered: order.isDelivered || false,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
      
      return mapped;
    });

    console.log('📦 Mapped orders:', mappedOrders.length);
    if (mappedOrders.length > 0) {
      console.log('📦 First mapped order:', JSON.stringify(mappedOrders[0], null, 2));
    }

    res.json({
      success: true,
      data: mappedOrders,
      message: 'Lấy danh sách orders thành công'
    });
  } catch (error) {
    console.error('Get all orders admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy orders',
      error: error.message
    });
  }
};

// @desc    Cập nhật trạng thái đơn hàng (Admin)
// @route   PUT /api/admin/orders/:id/status
// @access  Private/Admin
const updateOrderStatusAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy order'
      });
    }

    // ✅ Cập nhật status (không phải orderStatus)
    order.status = status;
    
    if (status === 'delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }

    await order.save();

    res.json({
      success: true,
      data: order,
      message: `Cập nhật trạng thái thành "${status}" thành công`
    });
  } catch (error) {
    console.error('Update order status admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật trạng thái',
      error: error.message
    });
  }
};

// @desc    Xóa đơn hàng (Admin)
// @route   DELETE /api/admin/orders/:id
// @access  Private/Admin
const deleteOrderAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy order'
      });
    }

    await Order.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Xóa order thành công',
      deletedOrderId: id
    });
  } catch (error) {
    console.error('Delete order admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa order',
      error: error.message
    });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrdersAdmin,
  updateOrderStatusAdmin,
  deleteOrderAdmin
};