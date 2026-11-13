const mongoose = require('mongoose');

const sourceRecordSchema = new mongoose.Schema({
  _id: false,
  sourceId: { type: String, required: true },
  sourceUrl: { type: String, default: '' },
  sourceType: {
    type: String,
    enum: ['kdxx_db', 'official_brand', 'trusted_retailer', 'admin_manual'],
    required: true
  },
  domain: { type: String, default: '' },
  retrievalDate: { type: Date, default: Date.now },
  staleAfter: { type: Date, default: null },
  productMatchingStatus: {
    type: String,
    enum: [
      'EXACT_SKU_MATCH',
      'URL_SKU_MATCH',
      'BRAND_NAME_COLOR_MATCH',
      'NAME_ONLY_UNVERIFIED',
      'COLOR_MISMATCH',
      'SKU_MISMATCH',
      'NOT_MATCHED'
    ],
    default: 'NAME_ONLY_UNVERIFIED'
  },
  skuMatch: { type: Boolean, default: false },
  variantMatch: { type: Boolean, default: false },
  verificationStatus: {
    type: String,
    enum: ['VERIFIED', 'UNVERIFIED', 'CONFLICT', 'UNTRUSTED', 'FETCH_FAILED', 'BLOCKED', 'REJECTED'],
    default: 'UNVERIFIED'
  },
  trustScore: { type: Number, min: 0, max: 1, default: 0 },
  extractedAttributes: {
    sku: { type: String, default: '' },
    brand: { type: String, default: '' },
    productName: { type: String, default: '' },
    color: { type: String, default: '' },
    material: { type: String, default: '' },
    fit: { type: String, default: '' },
    shape: { type: String, default: '' },
    pattern: { type: String, default: '' },
    logoPosition: { type: String, default: '' },
    visualDetails: [{ type: String }],
    images: [{ type: String }],
    sizes: [{ type: String }]
  },
  failureReason: { type: String, default: '' }
});

const productImageRecordSchema = new mongoose.Schema({
  _id: false,
  url: { type: String, required: true },
  role: {
    type: String,
    enum: ['primary', 'alternate', 'official', 'flatlay', 'model_shot'],
    default: 'primary'
  },
  sourceType: { type: String, default: 'kdxx_db' },
  domain: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  isValidForTryOn: { type: Boolean, default: true },
  mimeType: { type: String, default: '' },
  sizeBytes: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  aspectRatio: { type: Number, default: 0 },
  checkedAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
  visualExtract: {
    dominantColorName: { type: String, default: '' },
    dominantRgb: [{ type: Number }],
    secondaryColorName: { type: String, default: '' },
    secondaryRgb: [{ type: Number }],
    patternHint: { type: String, default: '' },
    shapeHint: { type: String, default: '' },
    logoLocation: { type: String, default: null }, // Always null from pixel analyzer alone
    visibleMaterialCharacteristics: { type: String, default: '' }, // Pixel luminance shading only, never composition guess
    distinctiveVisualDetails: [{ type: String }],
    hasCleanLightBackground: { type: Boolean, default: false }
  }
});

const variantRecordSchema = new mongoose.Schema({
  _id: false,
  sku: { type: String, default: '' },
  variantKey: { type: String, default: '' },
  color: { type: String, default: '' },
  sizes: [{ type: String }],
  imageUrl: { type: String, default: '' },
  sourceUrl: { type: String, default: '' },
  verificationStatus: {
    type: String,
    enum: ['VERIFIED', 'UNVERIFIED', 'REJECTED', 'COLOR_MISMATCH', 'SKU_CONFLICT'],
    default: 'UNVERIFIED'
  }
});

const auditLogSchema = new mongoose.Schema({
  _id: false,
  action: { type: String, required: true },
  actorUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorRole: { type: String, default: 'system' },
  summary: { type: String, default: '' },
  changes: { type: mongoose.Schema.Types.Mixed, default: null },
  sourceUrl: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

/**
 * Companion Product Intelligence collection (1-to-1 with Product).
 * Keeps legacy Product catalog schema & endpoints untouched and backward-compatible.
 */
const productIntelligenceSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    unique: true,
    index: true
  },
  sku: { type: String, trim: true, default: '', index: true },
  brand: { type: String, trim: true, default: '' },
  productName: { type: String, trim: true, default: '' },
  catalogCategory: { type: String, trim: true, default: '' },

  normalizedCategory: {
    domain: {
      type: String,
      enum: ['clothing', 'footwear', 'accessories', 'unknown'],
      default: 'unknown'
    },
    subCategory: { type: String, default: 'unknown', index: true },
    filterGroup: { type: String, default: 'all' },
    tryOnSupportLevel: {
      type: String,
      enum: ['DIRECT', 'EXPERIMENTAL', 'NEEDS_SPECIALIZED_PROVIDER', 'UNSUPPORTED'],
      default: 'EXPERIMENTAL'
    },
    supportReason: { type: String, default: '' },
    mappingSource: {
      type: String,
      enum: ['EXPLICIT', 'TAGS', 'NAME_HEURISTIC', 'ADMIN', 'UNCLASSIFIED'],
      default: 'UNCLASSIFIED'
    },
    needsReview: { type: Boolean, default: false },
    conflictReason: { type: String, default: '' }
  },

  attributes: {
    color: {
      primary: { type: String, default: '' },
      secondary: { type: String, default: '' },
      catalogColors: [{ type: String }],
      confirmed: { type: Boolean, default: false }
    },
    material: {
      value: { type: String, default: '' },
      source: {
        type: String,
        enum: ['KDXX_DESCRIPTION', 'BRAND_OFFICIAL', 'TRUSTED_RETAILER', 'ADMIN', 'UNVERIFIED'],
        default: 'UNVERIFIED'
      },
      confirmed: { type: Boolean, default: false }
    },
    pattern: {
      value: { type: String, default: '' },
      detectedFromImage: { type: Boolean, default: false },
      confirmed: { type: Boolean, default: false }
    },
    shape: {
      value: { type: String, default: '' },
      aspectRatio: { type: Number, default: 0 },
      silhouette: { type: String, default: '' },
      confirmed: { type: Boolean, default: false }
    },
    fit: {
      value: { type: String, default: '' },
      confirmed: { type: Boolean, default: false }
    },
    visualDetails: [{ type: String }],
    logoPosition: {
      value: { type: String, default: '' },
      confirmed: { type: Boolean, default: false }
    }
  },

  productImages: [productImageRecordSchema],
  bestTryOnImageUrl: { type: String, default: '' },

  variantInformation: {
    hasMultipleVariants: { type: Boolean, default: false },
    skuMissing: { type: Boolean, default: true },
    skuMismatch: { type: Boolean, default: false },
    variants: [variantRecordSchema]
  },

  sourceRecords: [sourceRecordSchema],

  verificationStatus: {
    type: String,
    enum: ['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW', 'CONFLICT', 'STALE'],
    default: 'UNVERIFIED',
    index: true
  },
  confidenceScore: { type: Number, min: 0, max: 1, default: 0 },
  lastVerifiedAt: { type: Date, default: null },
  staleAfterDays: { type: Number, default: 30 },

  conflicts: [{
    _id: false,
    field: { type: String, default: '' },
    kdxxValue: { type: mongoose.Schema.Types.Mixed, default: null },
    externalValues: [{ type: mongoose.Schema.Types.Mixed }],
    detectedAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false }
  }],

  flags: {
    missingData: { type: Boolean, default: false },
    unverified: { type: Boolean, default: true },
    hasConflicts: { type: Boolean, default: false },
    needsReview: { type: Boolean, default: false },
    missingImages: { type: Boolean, default: false },
    skuVariantMismatch: { type: Boolean, default: false },
    staleSource: { type: Boolean, default: false }
  },

  // Fields confirmed or edited by Admin — automated AI / source sync must NEVER overwrite these
  adminLockedFields: [{ type: String }],
  adminApproved: { type: Boolean, default: false },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  auditLogs: [auditLogSchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

productIntelligenceSchema.virtual('productId').get(function () {
  return this.product;
});

productIntelligenceSchema.index({ 'flags.hasConflicts': 1, 'flags.unverified': 1 });

module.exports = mongoose.model('ProductIntelligence', productIntelligenceSchema);
