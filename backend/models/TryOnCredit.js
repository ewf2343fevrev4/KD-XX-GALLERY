const mongoose = require('mongoose');

const tryOnCreditSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  freeCreditsClaimed: {
    type: Boolean,
    default: false
  },
  membershipType: {
    type: String,
    enum: ['free', 'homie', 'admin'],
    default: 'free'
  },
  membershipExpiresAt: {
    type: Date,
    default: null
  },
  // Cached sum of valid remainingAmount across active lots
  totalAvailableCredits: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TryOnCredit', tryOnCreditSchema);
