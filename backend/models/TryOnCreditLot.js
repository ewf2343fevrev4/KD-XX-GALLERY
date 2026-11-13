const mongoose = require('mongoose');

const tryOnCreditLotSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  lotType: {
    type: String,
    enum: ['free', 'homie', 'purchased', 'admin'],
    required: true
  },
  initialAmount: {
    type: Number,
    required: true,
    min: 1
  },
  remainingAmount: {
    type: Number,
    required: true,
    min: 0
  },
  reservedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Null for free (doesn't expire), or specific date for HOMIE/purchased
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sourceRef: {
    type: String, // e.g. orderId or transactionId
    default: ''
  }
}, {
  timestamps: true
});

tryOnCreditLotSchema.index({ user: 1, lotType: 1, expiresAt: 1 });

module.exports = mongoose.model('TryOnCreditLot', tryOnCreditLotSchema);
