const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = mongoose.model('User');

// Helper to generate a unique readable payment code (e.g. KDX8F29A)
function generatePaymentCode(prefix = 'KDX') {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${result}`;
}

// Middleware to verify JWT token
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

// Create new order (Authoritative server-side price calculation & atomic inventory reservation)
router.post('/', verifyToken, async (req, res) => {
  let session = null;
  const deductedItems = []; // For compensating rollback if standalone mode

  try {
    const { items, shippingAddress, paymentMethod } = req.body;

    console.log('Creating order for user:', req.user._id);

    // 1. Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Giỏ hàng trống hoặc danh sách sản phẩm không hợp lệ' });
    }

    // 2. Validate shipping address
    if (!shippingAddress || typeof shippingAddress !== 'object' || !shippingAddress.address?.trim()) {
      return res.status(400).json({ message: 'Địa chỉ giao hàng là bắt buộc' });
    }

    // 3. Validate each item & aggregate quantities per unique product
    const aggregatedQty = new Map(); // productIdStr -> totalQuantity
    const validatedItems = [];

    for (const item of items) {
      const rawId = item.product || item._id;
      if (!rawId || !mongoose.Types.ObjectId.isValid(rawId)) {
        return res.status(400).json({ message: 'Mã sản phẩm không hợp lệ' });
      }

      const productIdStr = String(rawId);
      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
        return res.status(400).json({ message: 'Số lượng sản phẩm phải là số nguyên dương từ 1 đến 99' });
      }

      aggregatedQty.set(productIdStr, (aggregatedQty.get(productIdStr) || 0) + quantity);
      validatedItems.push({
        productIdStr,
        quantity,
        size: typeof item.size === 'string' ? item.size.trim() : '',
        color: typeof item.color === 'string' ? item.color.trim() : ''
      });
    }

    // 4. Query all unique products from MongoDB
    const uniqueIds = Array.from(aggregatedQty.keys());
    const dbProducts = await Product.find({ _id: { $in: uniqueIds } });

    if (dbProducts.length !== uniqueIds.length) {
      return res.status(404).json({ message: 'Một hoặc nhiều sản phẩm không tồn tại trong hệ thống' });
    }

    const productMap = new Map();
    for (const p of dbProducts) {
      productMap.set(p._id.toString(), p);
    }

    // 5. Pre-check stock & calculate authoritative prices
    let calculatedSubtotal = 0;
    const processedItems = [];
    const processedOrderItems = [];

    for (const item of validatedItems) {
      const product = productMap.get(item.productIdStr);
      const requiredTotal = aggregatedQty.get(item.productIdStr);

      if (typeof product.stock === 'number' && product.stock < requiredTotal) {
        return res.status(400).json({
          message: `Sản phẩm "${product.name}" không đủ số lượng trong kho (chỉ còn ${product.stock} sản phẩm)`
        });
      }

      const unitPrice = Number(product.price) || 0;
      calculatedSubtotal += unitPrice * item.quantity;

      const itemImage = product.image || (Array.isArray(product.images) && product.images[0]) || '';

      processedItems.push({
        product: product._id,
        name: product.name,
        image: itemImage,
        price: unitPrice,
        quantity: item.quantity
      });

      processedOrderItems.push({
        product: product._id,
        name: product.name,
        image: itemImage,
        price: unitPrice,
        quantity: item.quantity,
        size: item.size,
        color: item.color
      });
    }

    // Authoritative financial calculations
    calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;
    const calculatedTax = Math.round(calculatedSubtotal * 0.1 * 100) / 100; // 10% VAT
    const calculatedShipping = calculatedSubtotal > 100 ? 0 : 10; // Free ship if subtotal > $100
    const calculatedTotal = Math.round((calculatedSubtotal + calculatedTax + calculatedShipping) * 100) / 100;

    const exchangeRate = Number(process.env.USD_VND_EXCHANGE_RATE) || 25400;
    const amountVND = Math.round(calculatedTotal * exchangeRate);
    const prefix = process.env.SEPAY_PAYMENT_PREFIX || 'KDX';

    // 6. Attempt execution with MongoDB Multi-Document Transaction
    let useTransaction = false;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (sessionErr) {
      useTransaction = false;
      if (session) {
        try { session.endSession(); } catch (_) {}
        session = null;
      }
    }

    let createdOrder = null;

    if (useTransaction) {
      try {
        // Atomic stock deduction with transaction session
        for (const [productIdStr, totalQty] of aggregatedQty.entries()) {
          const updated = await Product.findOneAndUpdate(
            { _id: productIdStr, stock: { $gte: totalQty } },
            { $inc: { stock: -totalQty } },
            { session, new: true }
          );
          if (!updated) {
            const p = productMap.get(productIdStr);
            await session.abortTransaction();
            return res.status(400).json({
              message: `Sản phẩm "${p ? p.name : 'được chọn'}" không đủ số lượng trong kho`
            });
          }
        }

        // Generate guaranteed unique payment code
        let paymentCode = generatePaymentCode(prefix);
        let existing = await Order.findOne({ paymentCode }).session(session);
        let attempts = 0;
        while (existing && attempts < 10) {
          paymentCode = generatePaymentCode(prefix);
          existing = await Order.findOne({ paymentCode }).session(session);
          attempts++;
        }

        const orderData = {
          user: req.user._id,
          items: processedItems,
          orderItems: processedOrderItems,
          shippingAddress: {
            address: shippingAddress.address,
            city: shippingAddress.city || 'N/A',
            postalCode: shippingAddress.postalCode || '00000',
            country: shippingAddress.country || 'Vietnam'
          },
          paymentMethod: paymentMethod || 'cod',
          paymentCode,
          amountVND,
          subtotal: calculatedSubtotal,
          itemsPrice: calculatedSubtotal,
          tax: calculatedTax,
          taxPrice: calculatedTax,
          shipping: calculatedShipping,
          shippingPrice: calculatedShipping,
          total: calculatedTotal,
          totalPrice: calculatedTotal,
          status: 'pending',
          orderStatus: 'pending',
          isPaid: false,
          isDelivered: false,
          isRestocked: false
        };

        const [savedOrder] = await Order.create([orderData], { session });
        await session.commitTransaction();
        createdOrder = savedOrder;
      } catch (txError) {
        await session.abortTransaction();
        throw txError;
      }
    } else {
      // Standalone fallback: Atomic single-document update + compensating rollback with retry
      for (const [productIdStr, totalQty] of aggregatedQty.entries()) {
        const updated = await Product.findOneAndUpdate(
          { _id: productIdStr, stock: { $gte: totalQty } },
          { $inc: { stock: -totalQty } },
          { new: true }
        );
        if (!updated) {
          // Rollback already deducted products
          for (const d of deductedItems) {
            await Product.updateOne({ _id: d.productId }, { $inc: { stock: d.qty } });
          }
          const p = productMap.get(productIdStr);
          return res.status(400).json({
            message: `Sản phẩm "${p ? p.name : 'được chọn'}" không đủ số lượng trong kho`
          });
        }
        deductedItems.push({ productId: productIdStr, qty: totalQty });
      }

      try {
        let paymentCode = generatePaymentCode(prefix);
        let existing = await Order.findOne({ paymentCode });
        let attempts = 0;
        while (existing && attempts < 10) {
          paymentCode = generatePaymentCode(prefix);
          existing = await Order.findOne({ paymentCode });
          attempts++;
        }

        const orderData = {
          user: req.user._id,
          items: processedItems,
          orderItems: processedOrderItems,
          shippingAddress: {
            address: shippingAddress.address,
            city: shippingAddress.city || 'N/A',
            postalCode: shippingAddress.postalCode || '00000',
            country: shippingAddress.country || 'Vietnam'
          },
          paymentMethod: paymentMethod || 'cod',
          paymentCode,
          amountVND,
          subtotal: calculatedSubtotal,
          itemsPrice: calculatedSubtotal,
          tax: calculatedTax,
          taxPrice: calculatedTax,
          shipping: calculatedShipping,
          shippingPrice: calculatedShipping,
          total: calculatedTotal,
          totalPrice: calculatedTotal,
          status: 'pending',
          orderStatus: 'pending',
          isPaid: false,
          isDelivered: false,
          isRestocked: false
        };

        createdOrder = await Order.create(orderData);
      } catch (createErr) {
        // Compensating rollback with retry
        for (const d of deductedItems) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await Product.updateOne({ _id: d.productId }, { $inc: { stock: d.qty } });
              break;
            } catch (rbErr) {
              if (attempt === 2) console.error('CRITICAL: Stock rollback failed for', d.productId, rbErr);
            }
          }
        }
        throw createErr;
      }
    }

    // Populate product details for client response
    await createdOrder.populate('items.product');

    console.log('Order created successfully:', createdOrder._id, 'PaymentCode:', createdOrder.paymentCode, 'AmountVND:', amountVND);

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        ...createdOrder.toObject(),
        paymentCode: createdOrder.paymentCode,
        amountVND
      }
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      message: 'Server error while creating order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (session) {
      try { session.endSession(); } catch (_) {}
    }
  }
});

// Check order payment status (public / polling from checkout modal)
router.get('/:id/payment-status', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const order = await Order.findById(id).select('isPaid paidAt status orderStatus paymentMethod paymentCode amountVND total totalPrice sepayTransaction');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      orderId: order._id,
      isPaid: Boolean(order.isPaid),
      paidAt: order.paidAt,
      status: order.orderStatus || order.status,
      paymentCode: order.paymentCode,
      amountVND: order.amountVND,
      sepayTransaction: order.sepayTransaction || null
    });
  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({ success: false, message: 'Server error while checking payment status' });
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
    order.orderStatus = status;
    
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
