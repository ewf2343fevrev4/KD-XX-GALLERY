const mongoose = require('mongoose');

const tryOnCreditLedgerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  lot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnCreditLot',
    default: null
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnJob',
    default: null
  },
  transactionType: {
    type: String,
    enum: [
      'GRANT_FREE',
      'PURCHASE_PACKAGE',
      'HOMIE_SUBSCRIPTION',
      'ADMIN_UNLIMITED',
      'RESERVE',
      'COMMIT',
      'REFUND',
      'MANUAL_ADJUSTMENT',
      'EXPIRE'
    ],
    required: true
  },
  amount: {
    type: Number,
    required: true // can be positive or negative
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  adminUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  idempotencyKey: {
    type: String,
    sparse: true,
    unique: true
  }
}, {
  timestamps: true
});

tryOnCreditLedgerSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('TryOnCreditLedger', tryOnCreditLedgerSchema);
