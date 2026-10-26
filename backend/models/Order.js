const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  // Supports both orderItems and items for backward compatibility
  orderItems: [{
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    image: { type: String },
    price: { type: Number, required: true },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product'
    },
    size: String,
    color: String
  }],
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: { type: String, required: true },
    image: String,
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 }
  }],
  shippingAddress: {
    address: { type: String, required: true },
    city: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: 'Vietnam' }
  },
  paymentMethod: {
    type: String,
    required: true,
    default: 'cod'
  },
  paymentCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
    index: true
  },
  amountVND: {
    type: Number,
    default: 0
  },
  sepayTransaction: {
    id: { type: Number },
    gateway: { type: String },
    transactionDate: { type: Date },
    accountNumber: { type: String },
    subAccount: { type: String },
    referenceCode: { type: String },
    content: { type: String },
    transferType: { type: String },
    transferAmount: { type: Number },
    accumulated: { type: Number }
  },
  itemsPrice: {
    type: Number,
    default: 0.0
  },
  subtotal: {
    type: Number,
    default: 0.0
  },
  taxPrice: {
    type: Number,
    default: 0.0
  },
  tax: {
    type: Number,
    default: 0.0
  },
  shippingPrice: {
    type: Number,
    default: 0.0
  },
  shipping: {
    type: Number,
    default: 0.0
  },
  totalPrice: {
    type: Number,
    default: 0.0
  },
  total: {
    type: Number,
    default: 0.0
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
  deliveredAt: Date,
  isRestocked: {
    type: Boolean,
    default: false
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
