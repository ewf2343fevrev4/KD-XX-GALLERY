const mongoose = require('mongoose');

const tryOnCleanupQuotaSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  monthYear: {
    type: String, // 'YYYY-MM' according to Asia/Ho_Chi_Minh
    required: true,
    index: true
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  reservedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxAllowed: {
    type: Number,
    default: 2 // Free: 2, HOMIE: 10
  }
}, {
  timestamps: true
});

tryOnCleanupQuotaSchema.index({ user: 1, monthYear: 1 }, { unique: true });

module.exports = mongoose.model('TryOnCleanupQuota', tryOnCleanupQuotaSchema);
