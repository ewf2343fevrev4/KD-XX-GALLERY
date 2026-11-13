const mongoose = require('mongoose');

const settlementStepSchema = new mongoose.Schema({
  _id: false,
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnCreditLot',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  state: {
    type: String,
    enum: ['PENDING', 'APPLIED', 'ROLLED_BACK', 'ROLLBACK_FAILED'],
    default: 'PENDING'
  },
  appliedAt: { type: Date, default: null },
  rolledBackAt: { type: Date, default: null },
  error: { type: String, default: '' }
});

/**
 * Durable operation log for multi-lot credit commit & refund settlements.
 * Enables atomic locking, MongoDB transactions when supported, and deterministic
 * idempotent compensating rollback + crash recovery on standalone topologies.
 */
const tryOnCreditSettlementSchema = new mongoose.Schema({
  operationKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  operationType: {
    type: String,
    enum: ['COMMIT', 'REFUND'],
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnJob',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: [
      'IN_PROGRESS',
      'COMPLETED',
      'ROLLING_BACK',
      'ROLLED_BACK',
      'RECONCILIATION_REQUIRED'
    ],
    default: 'IN_PROGRESS',
    index: true
  },
  executionMode: {
    type: String,
    enum: ['TRANSACTION', 'COMPENSATING'],
    default: 'COMPENSATING'
  },
  steps: [settlementStepSchema],
  reason: { type: String, default: '' },
  auditReason: { type: String, default: '' },
  adminUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  requiresReconciliation: {
    type: Boolean,
    default: false
  },
  lastError: {
    type: String,
    default: ''
  },
  leaseExpiresAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

tryOnCreditSettlementSchema.index({ job: 1, operationType: 1 });

module.exports = mongoose.model('TryOnCreditSettlement', tryOnCreditSettlementSchema);
