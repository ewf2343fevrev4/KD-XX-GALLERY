const crypto = require('crypto');

const PROVIDER_VERIFICATION_STATUSES = [
  'VERIFIED',
  'LIMITED',
  'EXPERIMENTAL',
  'UNSUPPORTED',
  'NOT_CONFIGURED',
  'DEPRECATED'
];

const LIFECYCLE_STAGES = [
  'GA',
  'PREVIEW',
  'DEPRECATION_ANNOUNCED',
  'RETIRED',
  'NOT_INTEGRATED'
];

/**
 * Base contract for Virtual Try-On AI providers.
 * Decouples queue, credit safety, and category routing from vendor-specific payloads.
 */
class TryOnProviderAdapter {
  constructor({
    providerId,
    providerName = 'Unknown Provider',
    displayName,
    modelId,
    unitCostUsd = 0,
    region = 'global',
    authenticationMethod = 'None',
    requiredEnvVars = [],
    documentationUrl = ''
  }) {
    this.providerId = providerId;
    this.providerName = providerName;
    this.displayName = displayName || providerName;
    this.modelId = modelId;
    this.unitCostUsd = unitCostUsd;
    this.region = region;
    this.authenticationMethod = authenticationMethod;
    this.requiredEnvVars = Array.isArray(requiredEnvVars) ? requiredEnvVars : [];
    this.documentationUrl = documentationUrl;
  }

  /**
   * Check only whether required environment variables are present (boolean only — never reads or returns secret values).
   */
  areCredentialsConfigured() {
    if (this.requiredEnvVars.length === 0) return false;
    return this.requiredEnvVars.every(key => Boolean(process.env[key] && String(process.env[key]).trim()));
  }

  /**
   * Deterministic UTC check whether the model has reached or passed its official retirement date.
   * Rejects jobs automatically regardless of Admin toggle state.
   */
  isPastRetirement(now = new Date()) {
    const caps = this.getBaseCapabilities();
    if (!caps.retirementDate) return false;
    const retireMs = Date.parse(`${caps.retirementDate}T00:00:00.000Z`);
    if (Number.isNaN(retireMs)) return false;
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    return nowMs >= retireMs;
  }

  /**
   * Whether this provider is implemented and active for production traffic
   * @returns {boolean}
   */
  isAvailable() {
    return false;
  }

  getBaseCapabilities() {
    return {
      providerId: this.providerId,
      providerName: this.providerName,
      displayName: this.displayName,
      modelId: this.modelId,
      supportedCategories: [],
      supportedSubcategories: [],
      categoryCapabilities: {},
      inputRequirements: {
        requiredPersonPhoto: true,
        requiredProductImage: true,
        maxProductItems: 1,
        maxImageSize: '7MB Base64 inline',
        supportedImageFormats: ['image/jpeg', 'image/png']
      },
      outputRequirements: {
        formats: ['image/png', 'image/jpeg'],
        preservesPersonAspectRatio: true
      },
      maxImageSize: '7MB Base64 inline',
      supportedImageFormats: ['image/jpeg', 'image/png'],
      requiredPersonPhoto: true,
      requiredProductImage: true,
      supportsMultipleProducts: false,
      supportsFullOutfit: false,
      supportsPrompt: false,
      supportsReferenceImage: false,
      supportsProductDescription: false,
      supportsMultiItem: false,
      maxProductItems: 1,
      acceptedImageMimeTypes: ['image/jpeg', 'image/png'],
      maxInlineBytes: 7 * 1000 * 1000,
      region: this.region,
      authenticationMethod: this.authenticationMethod,
      requiredEnvVars: this.requiredEnvVars,
      estimatedCost: {
        currency: 'USD',
        unitCostUsd: this.unitCostUsd,
        basis: 'per_output_image'
      },
      documentationUrl: this.documentationUrl,
      verificationStatus: 'NOT_CONFIGURED',
      lifecycleStage: 'NOT_INTEGRATED',
      deprecationDate: null,
      retirementDate: null,
      lastVerifiedAt: '2026-11-12',
      limitations: ['Provider chưa được cấu hình hoặc chưa xác minh tài liệu API thực tế.'],
      isEnabledByDefault: false
    };
  }

  /**
   * Full capability matrix dynamically reflecting runtime clock retirement & credential checks.
   */
  getCapabilities(now = new Date()) {
    const base = this.getBaseCapabilities();
    const retired = Boolean(
      base.retirementDate &&
      !Number.isNaN(Date.parse(`${base.retirementDate}T00:00:00.000Z`)) &&
      (now instanceof Date ? now.getTime() : new Date(now).getTime()) >= Date.parse(`${base.retirementDate}T00:00:00.000Z`)
    );
    const available = !retired && this.isAvailable(now);

    return {
      ...base,
      available,
      isPastRetirement: retired,
      lifecycleStage: retired ? 'RETIRED' : base.lifecycleStage,
      effectiveVerificationStatus: retired ? 'DEPRECATED' : base.verificationStatus,
      credentialsConfigured: this.areCredentialsConfigured()
    };
  }

  /**
   * Estimated per-generation AI cost metadata
   */
  estimateCost({ sampleCount = 1 } = {}) {
    const count = Math.max(1, Number(sampleCount) || 1);
    return {
      currency: 'USD',
      unitCostUsd: this.unitCostUsd,
      estimatedTotalUsd: Number((this.unitCostUsd * count).toFixed(4))
    };
  }

  /**
   * Generate a correlation request ID before calling the remote provider API
   */
  generateRequestId(jobId = '') {
    const suffix = crypto.randomBytes(6).toString('hex');
    const shortJob = jobId ? String(jobId).slice(-8) : 'adhoc';
    return `${this.providerId}-${shortJob}-${Date.now()}-${suffix}`;
  }

  /**
   * Provider readiness & configuration check (safe: NEVER prints/returns secret values or makes billable calls)
   */
  async healthCheck(now = new Date()) {
    const caps = this.getCapabilities(now);
    return {
      ok: caps.available,
      providerId: this.providerId,
      providerName: this.providerName,
      displayName: this.displayName,
      modelId: this.modelId,
      available: caps.available,
      credentialsConfigured: caps.credentialsConfigured,
      requiredEnvVars: caps.requiredEnvVars,
      verificationStatus: caps.effectiveVerificationStatus,
      lifecycleStage: caps.lifecycleStage,
      deprecationDate: caps.deprecationDate,
      retirementDate: caps.retirementDate,
      isPastRetirement: caps.isPastRetirement,
      region: caps.region,
      authenticationMethod: caps.authenticationMethod,
      documentationUrl: caps.documentationUrl,
      lastVerifiedAt: caps.lastVerifiedAt,
      limitations: caps.limitations,
      estimatedCost: caps.estimatedCost,
      capabilities: caps
    };
  }

  /**
   * Normalize provider-specific error objects into uniform queue-compatible metadata
   */
  normalizeError(err) {
    const statusCode = Number(err?.statusCode) || 500;
    const code = err?.code || 'UNKNOWN_PROVIDER_ERROR';
    const isIndeterminateTimeout = code === 'AI_TIMEOUT';
    const isRetryable = code === 'QUOTA_EXCEEDED_RATE_LIMITED' || code === 'VERTEX_INTERNAL_SERVICE_ERROR';
    return {
      providerId: this.providerId,
      modelId: this.modelId,
      code,
      statusCode,
      message: err?.message || 'Unknown provider failure',
      isRetryable,
      isIndeterminateTimeout,
      providerRequestId: err?.vertexRequestId || err?.providerRequestId || null,
      durationMs: Number(err?.durationMs) || 0
    };
  }

  /**
   * Select which fields from an AI Product Context are supported by this provider.
   * Prevents leaking unsupported text prompts, raw HTML, or unverified fields into models.
   * @param {Object|null} productContext
   */
  adaptProductContext(productContext = null) {
    if (!productContext) {
      return {
        providerId: this.providerId,
        usesStructuredTextContext: false,
        usedFields: ['productBase64'],
        omittedFields: []
      };
    }

    const caps = this.getCapabilities();
    return {
      providerId: this.providerId,
      usesStructuredTextContext: Boolean(caps.supportsPrompt || caps.supportsProductDescription),
      usedFields: ['productImageReferences.primaryImageUrl'],
      omittedFields: caps.supportsPrompt ? [] : ['prompt', 'productDescription', 'verifiedVisualAttributes'],
      sku: productContext.sku || null,
      subCategory: productContext.category?.subCategory || 'unknown'
    };
  }

  /**
   * Execute a virtual try-on generation
   * @returns {Promise<Object>}
   */
  async executeTryOn() {
    const err = new Error(`Provider "${this.providerId}" chưa được cấu hình hoặc chưa được kích hoạt (NOT_IMPLEMENTED).`);
    err.code = 'NOT_IMPLEMENTED';
    err.statusCode = 501;
    err.providerId = this.providerId;
    throw err;
  }
}

module.exports = TryOnProviderAdapter;
module.exports.PROVIDER_VERIFICATION_STATUSES = PROVIDER_VERIFICATION_STATUSES;
module.exports.LIFECYCLE_STAGES = LIFECYCLE_STAGES;
