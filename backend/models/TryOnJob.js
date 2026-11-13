const mongoose = require('mongoose');

const tryOnJobSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: [
      'PENDING',
      'QUEUED',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'RECONCILIATION_REQUIRED'
    ],
    default: 'PENDING',
    index: true
  },
  priority: {
    type: Number,
    default: 1, // HOMIE = 10, Free = 1
    index: true
  },
  mode: {
    type: String,
    enum: ['SINGLE_ITEM', 'FULL_OUTFIT'],
    default: 'SINGLE_ITEM',
    index: true
  },
  personImageAsset: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnImageAsset',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productImageUrl: {
    type: String,
    required: true
  },
  productName: {
    type: String,
    default: ''
  },
  outfitItems: [{
    _id: false,
    slot: { type: String, enum: ['TOP', 'BOTTOM'], required: true },
    stepOrder: { type: Number, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productImageUrl: { type: String, required: true },
    productName: { type: String, default: '' },
    productSnapshot: { type: mongoose.Schema.Types.Mixed, default: null }
  }],
  executionSteps: [{
    _id: false,
    stepIndex: { type: Number, required: true },
    slot: { type: String, enum: ['TOP', 'BOTTOM'], required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' },
    providerId: { type: String, default: '' },
    modelId: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED'],
      default: 'PENDING'
    },
    providerRequestId: { type: String, default: null },
    dispatchedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    inputAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'TryOnImageAsset', default: null },
    outputAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'TryOnImageAsset', default: null },
    httpStatus: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },
    confirmedCostUsd: { type: Number, default: null },
    pendingReconciliationCostUsd: { type: Number, default: 0 },
    costStatus: {
      type: String,
      enum: ['NONE', 'ESTIMATED', 'UNKNOWN_PENDING_RECONCILIATION', 'CONFIRMED_BILLING'],
      default: 'NONE'
    },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' }
  }],
  resultImageAsset: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnImageAsset',
    default: null
  },
  creditLot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TryOnCreditLot',
    default: null
  },
  creditReservations: [{
    _id: false,
    lot: { type: mongoose.Schema.Types.ObjectId, ref: 'TryOnCreditLot', required: true },
    lotType: { type: String, default: 'unknown' },
    amount: { type: Number, required: true }
  }],
  creditsCost: {
    type: Number,
    default: 1
  },
  resultQualityCheck: {
    status: {
      type: String,
      enum: ['NOT_CHECKED', 'PASSED', 'WARNING', 'FAILED'],
      default: 'NOT_CHECKED'
    },
    warnings: [{ type: String }],
    notes: { type: String, default: '' },
    checkedAt: { type: Date, default: null },
    metrics: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  idempotencyKey: {
    type: String,
    sparse: true,
    index: true
  },
  errorMessage: {
    type: String,
    default: ''
  },
  errorCode: {
    type: String,
    default: ''
  },
  timing: {
    queuedAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 }
  },
  provider: {
    type: String,
    default: 'google-vertex-vto-001'
  },
  providerRequestId: {
    type: String,
    default: null,
    index: true
  },
  aiProviderDetails: {
    providerId: { type: String, default: 'google-vertex-vto-001' },
    model: { type: String, default: 'virtual-try-on-001' },
    httpStatus: { type: Number, default: 0 },
    dispatchedAt: { type: Date, default: null },
    estimatedCostUsd: { type: Number, default: 0 },
    confirmedBillingCostUsd: { type: Number, default: null },
    unknownReconciliationCostUsd: { type: Number, default: 0 },
    costStatus: {
      type: String,
      enum: ['NONE', 'ESTIMATED', 'PARTIAL_UNKNOWN', 'UNKNOWN_PENDING_RECONCILIATION', 'CONFIRMED_BILLING'],
      default: 'NONE'
    },
    providerCallsCount: { type: Number, default: 0 },
    successfulCallsCount: { type: Number, default: 0 },
    failedCallsCount: { type: Number, default: 0 },
    indeterminateCallsCount: { type: Number, default: 0 }
  },
  reconciliation: {
    state: {
      type: String,
      enum: [
        'NONE',
        'UNVERIFIED_AFTER_RESTART',
        'AI_TIMEOUT_UNVERIFIED',
        'PROVIDER_PROCESSED',
        'PROVIDER_UNPROCESSED',
        'UNVERIFIABLE',
        'RESOLVED_REFUNDED',
        'RESOLVED_COMMITTED'
      ],
      default: 'NONE'
    },
    requiresManualAdmin: { type: Boolean, default: false },
    reason: { type: String, default: '' },
    pendingCostUsd: { type: Number, default: 0 },
    costStatus: {
      type: String,
      enum: ['NONE', 'ESTIMATED', 'PARTIAL_UNKNOWN', 'UNKNOWN_PENDING_RECONCILIATION', 'CONFIRMED_BILLING'],
      default: 'NONE'
    },
    detectedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionAction: { type: String, enum: ['', 'refund', 'commit'], default: '' },
    resolutionNote: { type: String, default: '' }
  },
  benchmark: {
    isBenchmark: { type: Boolean, default: false, index: true },
    triggeredByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    env: { type: String, default: '' },
    startedAt: { type: Date, default: null }
  },
  // Immutable product & intelligence snapshot recorded when the job was submitted
  productSnapshot: {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    sku: { type: String, default: '' },
    brand: { type: String, default: '' },
    productName: { type: String, default: '' },
    catalogCategory: { type: String, default: '' },
    normalizedDomain: { type: String, default: '' },
    normalizedSubCategory: { type: String, default: '' },
    variantSku: { type: String, default: '' },
    variantColor: { type: String, default: '' },
    variantSize: { type: String, default: '' },
    imageUrlUsed: { type: String, default: '' },
    verificationStatus: { type: String, default: 'UNVERIFIED' },
    confidenceScore: { type: Number, default: 0 },
    sourceTypesUsed: [{ type: String }],
    sourceUrlsUsed: [{ type: String }],
    knownLimitations: [{ type: String }],
    contextGeneratedAt: { type: Date, default: null }
  },
  historyDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  historyDeletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

tryOnJobSchema.index({ user: 1, status: 1 });
tryOnJobSchema.index({ user: 1, createdAt: -1 });
tryOnJobSchema.index({ user: 1, historyDeleted: 1, createdAt: -1 });
tryOnJobSchema.index({ status: 1, priority: -1, 'timing.queuedAt': 1 });
tryOnJobSchema.index({ status: 1, priority: -1, createdAt: 1 });

module.exports = mongoose.model('TryOnJob', tryOnJobSchema);
