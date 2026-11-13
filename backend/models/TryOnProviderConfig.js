const mongoose = require('mongoose');

const providerAuditLogSchema = new mongoose.Schema({
  _id: false,
  action: { type: String, required: true },
  actorUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorEmail: { type: String, default: '' },
  actorRole: { type: String, default: 'admin' },
  summary: { type: String, default: '' },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now }
});

/**
 * Stores Admin-controlled governance state, per-category enablement overrides,
 * default routing selections, circuit-breaker telemetry & audit history for AI providers.
 * Never stores API keys, tokens, service account JSON, or credentials.
 */
const tryOnProviderConfigSchema = new mongoose.Schema({
  providerId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  isEnabled: {
    type: Boolean,
    default: null // null = defer to adapter baseline capability default
  },
  categoryOverrides: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  limitedCategoryApprovals: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  verificationStatusOverride: {
    type: String,
    enum: [
      null,
      'VERIFIED',
      'LIMITED',
      'EXPERIMENTAL',
      'UNSUPPORTED',
      'NOT_CONFIGURED',
      'DEPRECATED'
    ],
    default: null
  },
  defaultForCategories: [{ type: String }],
  lastError: {
    code: { type: String, default: '' },
    message: { type: String, default: '' },
    category: { type: String, default: '' },
    occurredAt: { type: Date, default: null }
  },
  circuitBreaker: {
    state: {
      type: String,
      enum: ['CLOSED', 'OPEN', 'HALF_OPEN'],
      default: 'CLOSED'
    },
    consecutiveFailures: { type: Number, default: 0 },
    failureThreshold: { type: Number, default: 5 },
    openedAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null }
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  auditLogs: [providerAuditLogSchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('TryOnProviderConfig', tryOnProviderConfigSchema);
