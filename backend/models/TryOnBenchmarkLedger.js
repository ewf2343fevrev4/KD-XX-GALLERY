const mongoose = require('mongoose');

const tryOnBenchmarkLedgerSchema = new mongoose.Schema({
  recordType: {
    type: String,
    enum: ['CONTROL', 'STEP_RESERVATION'],
    required: true,
    index: true
  },
  // Singleton control record fields
  controlKey: {
    type: String,
    sparse: true,
    index: true
  },
  isEmergencyStopped: {
    type: Boolean,
    default: false
  },
  emergencyStoppedAt: {
    type: Date,
    default: null
  },
  emergencyStoppedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  emergencyReason: {
    type: String,
    default: ''
  },
  maxBudgetUsd: {
    type: Number,
    default: 0.20
  },
  totalReservedUsd: {
    type: Number,
    default: 0
  },
  totalCommittedUsd: {
    type: Number,
    default: 0
  },
  totalIndeterminateUsd: {
    type: Number,
    default: 0
  },

  // Per-step reservation fields
  operationKey: {
    type: String,
    sparse: true,
    unique: true,
    index: true
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnJob',
    index: true
  },
  stepIndex: {
    type: Number,
    default: 0
  },
  slot: {
    type: String,
    default: ''
  },
  providerId: {
    type: String,
    default: 'google-vertex-vto-001'
  },
  unitCostUsd: {
    type: Number,
    default: 0.06
  },
  status: {
    type: String,
    enum: [
      'RESERVED',
      'DISPATCHED',
      'COMPLETED',
      'INDETERMINATE_TIMEOUT',
      'CANCELLED_EMERGENCY',
      'FAILED_PRE_DISPATCH'
    ],
    default: 'RESERVED'
  },
  dispatchedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  error: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TryOnBenchmarkLedger', tryOnBenchmarkLedgerSchema);
