const mongoose = require('mongoose');

const tryOnCronLockSchema = new mongoose.Schema({
  lockName: {
    type: String,
    required: true,
    unique: true
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockedAt: {
    type: Date,
    default: null
  },
  lockedUntil: {
    type: Date,
    default: null
  },
  lockedBy: {
    type: String,
    default: ''
  },
  lastRunAt: {
    type: Date,
    default: null
  },
  lastRunDurationMs: {
    type: Number,
    default: 0
  },
  lastDeletedCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TryOnCronLock', tryOnCronLockSchema);
