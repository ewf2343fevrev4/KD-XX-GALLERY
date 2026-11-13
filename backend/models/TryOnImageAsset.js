const mongoose = require('mongoose');

const tryOnImageAssetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['user_upload', 'cleanup_processed', 'tryon_result', 'tryon_intermediate'],
    required: true
  },
  originalFilename: {
    type: String,
    default: ''
  },
  // Absolute or relative path inside private storage
  storagePath: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  fileSizeBytes: {
    type: Number,
    required: true
  },
  sha256: {
    type: String,
    required: true
  },
  width: {
    type: Number,
    default: 0
  },
  height: {
    type: Number,
    default: 0
  },
  qualityAnalysis: {
    status: {
      type: String,
      enum: ['READY', 'NEEDS_IMPROVEMENT', 'REJECTED', 'PENDING'],
      default: 'PENDING'
    },
    score: {
      type: Number,
      default: 0
    },
    issues: [{
      code: String,
      message: String
    }],
    suggestions: [String]
  },
  // Auto-deletion deadline: max 3 days retention
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

tryOnImageAssetSchema.index({ user: 1, isDeleted: 1, createdAt: -1 });

module.exports = mongoose.model('TryOnImageAsset', tryOnImageAssetSchema);
