const mongoose = require('mongoose');

const tryOnSubscriptionPaymentSchema = new mongoose.Schema({
  sepayTransactionId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true
  },
  paymentCode: {
    type: String,
    required: true,
    index: true
  },
  amountVND: {
    type: Number,
    required: true
  },
  gateway: {
    type: String,
    default: ''
  },
  transactionDate: {
    type: Date,
    default: Date.now
  },
  accountNumber: {
    type: String,
    default: ''
  },
  subAccount: {
    type: String,
    default: ''
  },
  referenceCode: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    default: ''
  },
  transferType: {
    type: String,
    default: 'in'
  },
  status: {
    type: String,
    enum: [
      'pending',
      'processing',
      'completed',
      'underpaid',
      'failed',
      'rejected',
      'user_not_found',
      'ambiguous_user'
    ],
    default: 'pending'
  },
  membershipGranted: {
    type: Boolean,
    default: false
  },
  grantedAt: {
    type: Date,
    default: null
  },
  failureReason: {
    type: String,
    default: ''
  },
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

tryOnSubscriptionPaymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('TryOnSubscriptionPayment', tryOnSubscriptionPaymentSchema);
