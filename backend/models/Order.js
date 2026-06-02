const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  orderItems: [{
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    image: { type: String }, // ❌ BỎ required: true
    price: { type: Number, required: true },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product'
    },
    size: String,
    color: String
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
    default: 'Credit Card'
  },
  itemsPrice: {
    type: Number,
    default: 0.0
  },
  taxPrice: {
    type: Number,
    default: 0.0
  },
  shippingPrice: {
    type: Number,
    default: 0.0
  },
  totalPrice: {
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
  orderStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);