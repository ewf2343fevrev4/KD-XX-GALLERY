const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Order Schema
const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    image: String,
    price: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      default: 1
    }
  }],
  shippingAddress: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true }
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['credit_card', 'paypal', 'cod'],
    default: 'cod'
  },
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  tax: {
    type: Number,
    required: true,
    default: 0
  },
  shipping: {
    type: Number,
    required: true,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  paidAt: Date,
  isDelivered: {
    type: Boolean,
    default: false
  },
  deliveredAt: Date
}, {
  timestamps: true
});

const Order = mongoose.model('Order', orderSchema);

// Middleware to verify JWT token
const jwt = require('jsonwebtoken');
const User = mongoose.model('User');

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ========== ROUTES ==========

// Create new order
router.post('/', verifyToken, async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, subtotal, tax, shipping, total } = req.body;

    console.log('Creating order for user:', req.user._id);

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    if (!shippingAddress) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    const order = await Order.create({
      user: req.user._id,
      items,
      shippingAddress,
      paymentMethod: paymentMethod || 'cod',
      subtotal: subtotal || 0,
      tax: tax || 0,
      shipping: shipping || 0,
      total: total || 0,
      status: 'pending',
      isPaid: false,
      isDelivered: false
    });

    // Populate product details
    await order.populate('items.product');

    console.log('Order created successfully:', order._id);

    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      message: 'Server error while creating order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's orders
router.get('/myorders', verifyToken, async (req, res) => {
  try {
    console.log('Fetching orders for user:', req.user._id);
    
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product')
      .sort({ createdAt: -1 });
    
    res.json({
      orders
    });
    
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching orders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get order by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Fetching order:', id);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }
    
    const order = await Order.findById(id).populate('items.product');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if order belongs to user (or user is admin)
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }
    
    res.json({
      order
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update order status (admin only)
router.put('/:id/status', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }
    
    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    order.status = status;
    
    if (status === 'delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }
    
    await order.save();
    
    res.json({
      message: 'Order status updated',
      order
    });
    
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ 
      message: 'Server error while updating order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;