const TryOnProviderAdapter = require('./TryOnProviderAdapter');
const tryOnAuthService = require('../tryOnAuthService');

const CLOTHING_SUBCATEGORIES = [
  'tops',
  't-shirts',
  'shirts',
  'hoodies',
  'jackets',
  'outerwear',
  'pants',
  'jeans',
  'shorts',
  'skirts',
  'dresses'
];

const FOOTWEAR_SUBCATEGORIES = ['sneakers', 'boots', 'loafers', 'sandals'];
const EYEWEAR_SUBCATEGORIES = ['eyewear', 'sunglasses'];
const ACCESSORIES_SUBCATEGORIES = [
  'bags',
  'belts',
  'hats',
  'jewelry',
  'necklaces',
  'rings',
  'watches',
  'wallets',
  'keychains',
  'socks',
  'other_accessories'
];

/**
 * Adapter for Google Cloud Vertex AI `virtual-try-on-001` (:predict endpoint).
 *
 * Phase 4 governance:
 * - verificationStatus: VERIFIED (Clothing single-item only, per Vertex AI Virtual Try-On API docs)
 * - lifecycleStage: DEPRECATION_ANNOUNCED (Deprecated 2026-09-14, Retirement 2027-03-15)
 * - Automatically rejects all new jobs once current clock reaches/exceeds 2027-03-15 UTC.
 * - Footwear is marked LIMITED and disabled by default (requires dedicated footwear validation).
 * - Eyewear & Accessories are UNSUPPORTED and strictly blocked.
 */
class VertexVto001Adapter extends TryOnProviderAdapter {
  constructor(options = {}) {
    const modelId = options.modelId || process.env.GCP_TRYON_MODEL || 'virtual-try-on-001';
    const location = options.location || process.env.GCP_LOCATION || 'us-central1';
    super({
      providerId: 'google-vertex-vto-001',
      providerName: 'Google Cloud Vertex AI',
      displayName: 'Google Cloud Vertex AI Virtual Try-On (v001)',
      modelId,
      unitCostUsd: 0.06,
      region: location,
      authenticationMethod: 'Google Cloud OAuth2 / ADC',
      requiredEnvVars: ['GCP_PROJECT_ID', 'GCP_LOCATION', 'GCP_TRYON_MODEL'],
      documentationUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/virtual-try-on-api'
    });
    this.projectId = options.projectId || process.env.GCP_PROJECT_ID || 'kdxx-tryon';
    this.location = location;
    this.timeoutMs = options.timeoutMs || parseInt(process.env.GCP_TRYON_TIMEOUT_MS, 10) || 55000;
    this.authService = options.authService || tryOnAuthService;
    this.fetchImpl = options.fetchImpl || null;
  }

  areCredentialsConfigured() {
    const hasProject = Boolean(this.projectId && String(this.projectId).trim());
    const hasExplicitOrAdc = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GCP_ACCESS_TOKEN ||
      process.env.GCP_PROJECT_ID
    );
    return hasProject && hasExplicitOrAdc;
  }

  isAvailable(now = new Date()) {
    if (this.isPastRetirement(now)) {
      return false;
    }
    return true;
  }

  getBaseCapabilities() {
    return {
      providerId: this.providerId,
      providerName: this.providerName,
      displayName: this.displayName,
      modelId: this.modelId,
      supportedCategories: ['clothing'],
      supportedSubcategories: [...CLOTHING_SUBCATEGORIES],
      limitedCategories: ['footwear'],
      experimentalCategories: ['shoes'],
      unsupportedCategories: ['eyewear', 'accessories'],
      categoryCapabilities: {
        clothing: {
          status: 'VERIFIED',
          isEnabledByDefault: true,
          subcategories: [...CLOTHING_SUBCATEGORIES],
          verificationSource: 'Google Cloud Vertex AI Virtual Try-On API docs (apparel single-item)',
          limitations: 'Chỉ hỗ trợ thử 1 trang phục mỗi lượt; không nhận text prompt hay productDescription.'
        },
        full_outfit: {
          status: 'LIMITED',
          isEnabledByDefault: false,
          subcategories: ['full_outfit'],
          verificationSource: 'KD-XX Phase 5 Architecture Audit (2-step sequential clothing orchestration)',
          limitations: 'Tắt mặc định: virtual-try-on-001 chỉ nhận 1 garment/lần nên Full Outfit (Áo + Quần) phải chạy tuần tự 2 bước (~2 credits) và cần benchmark thực tế trước khi Admin bật (ngừng phục vụ từ 2027-03-15).'
        },
        footwear: {
          status: 'LIMITED',
          isEnabledByDefault: false,
          subcategories: [...FOOTWEAR_SUBCATEGORIES],
          verificationSource: 'Vertex AI VTO / recontext_image preview docs',
          limitations: 'Tắt mặc định: dễ sai chi tiết mũi/đế giày và yêu cầu ảnh lộ rõ bàn chân; chờ provider chuyên biệt.'
        },
        eyewear: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          subcategories: [...EYEWEAR_SUBCATEGORIES],
          verificationSource: 'Google Cloud Vertex AI Virtual Try-On API docs',
          limitations: 'virtual-try-on-001 không hỗ trợ kính mắt / kính râm.'
        },
        accessories: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          subcategories: [...ACCESSORIES_SUBCATEGORIES],
          verificationSource: 'Google Cloud Vertex AI Virtual Try-On API docs',
          limitations: 'virtual-try-on-001 không hỗ trợ túi, thắt lưng, mũ, trang sức, đồng hồ, ví, móc khóa, tất.'
        }
      },
      inputRequirements: {
        requiredPersonPhoto: true,
        requiredProductImage: true,
        maxProductItems: 1,
        maxImageSize: '7 MB Base64 inline (tối đa 10 MB fetch tiền xử lý)',
        supportedImageFormats: ['image/jpeg', 'image/png']
      },
      outputRequirements: {
        formats: ['image/png', 'image/jpeg'],
        maxSamples: 4,
        preservesPersonAspectRatio: true
      },
      maxImageSize: '7 MB Base64 inline',
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
      region: this.location,
      authenticationMethod: 'Google Cloud OAuth2 / ADC (no hardcoded token)',
      requiredEnvVars: ['GCP_PROJECT_ID', 'GCP_LOCATION', 'GCP_TRYON_MODEL', 'GOOGLE_APPLICATION_CREDENTIALS (hoặc ADC)'],
      estimatedCost: {
        currency: 'USD',
        unitCostUsd: 0.06,
        commitmentRangeUsd: '0.048 - 0.054',
        basis: 'per_output_image'
      },
      documentationUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/virtual-try-on-api',
      verificationStatus: 'VERIFIED',
      lifecycleStage: 'DEPRECATION_ANNOUNCED',
      deprecationDate: '2026-09-14',
      retirementDate: '2027-03-15',
      lastVerifiedAt: '2026-11-12',
      limitations: [
        'Model đã công bố Deprecation từ 2026-09-14 và sẽ ngừng phục vụ (Retirement) ngày 2027-03-15.',
        'VERIFIED cho nhóm CLOTHING (Single Item). Không hỗ trợ Eyewear, Accessories hoặc Full Outfit đa lớp.',
        'Nhóm FOOTWEAR chỉ ở mức LIMITED và bị tắt mặc định theo chính sách KD-XX Phase 4.',
        'Không chấp nhận prompt chữ hoặc productDescription trong payload :predict.'
      ],
      isEnabledByDefault: true
    };
  }

  getEndpointUrl() {
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.modelId}:predict`;
  }

  sanitizeBase64(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const match = raw.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/);
    return (match ? match[1] : raw).trim().replace(/\s+/g, '');
  }

  /**
   * Build the exact request JSON conforming to Google Vertex AI virtual-try-on-001
   */
  buildPredictRequestBody({ personBase64, productBase64, sampleCount = 1 }) {
    const cleanPerson = this.sanitizeBase64(personBase64);
    const cleanProduct = this.sanitizeBase64(productBase64);

    if (!cleanPerson) {
      const err = new Error('Ảnh người dùng không hợp lệ hoặc dữ liệu base64 bị rỗng');
      err.code = 'INVALID_PERSON_IMAGE';
      err.statusCode = 400;
      throw err;
    }

    if (!cleanProduct) {
      const err = new Error('Ảnh sản phẩm không hợp lệ hoặc dữ liệu base64 bị rỗng');
      err.code = 'INVALID_PRODUCT_IMAGE';
      err.statusCode = 400;
      throw err;
    }

    return {
      instances: [
        {
          personImage: {
            image: {
              bytesBase64Encoded: cleanPerson
            }
          },
          productImages: [
            {
              image: {
                bytesBase64Encoded: cleanProduct
              }
            }
          ]
        }
      ],
      parameters: {
        sampleCount: Math.max(1, Math.min(Number(sampleCount) || 1, 4))
      }
    };
  }

  async healthCheck(now = new Date()) {
    const baseHealth = await super.healthCheck(now);
    return {
      ...baseHealth,
      projectId: this.projectId,
      location: this.location,
      endpoint: this.getEndpointUrl()
    };
  }

  classifyErrorCode(statusCode, message = '') {
    const msg = String(message || '').toLowerCase();
    if (statusCode === 400) {
      if (msg.includes('safety') || msg.includes('filter') || msg.includes('blocked')) {
        return 'SAFETY_POLICY_VIOLATION';
      }
      return 'INVALID_INPUT_ARGUMENTS';
    }
    if (statusCode === 401) return 'UNAUTHORIZED_ADC';
    if (statusCode === 403) return 'FORBIDDEN_IAM_PERMISSIONS';
    if (statusCode === 404) return 'MODEL_ENDPOINT_NOT_FOUND';
    if (statusCode === 429) return 'QUOTA_EXCEEDED_RATE_LIMITED';
    if (statusCode >= 500) return 'VERTEX_INTERNAL_SERVICE_ERROR';
    return 'UNKNOWN_API_ERROR';
  }

  /**
   * Explicitly omit text context fields on virtual-try-on-001 (:predict) because
   * Google's schema accepts image-only instances and does not support prompt/productDescription.
   */
  adaptProductContext(productContext = null) {
    return {
      providerId: this.providerId,
      modelId: this.modelId,
      usesStructuredTextContext: false,
      usedFields: ['productImageReferences.primaryImageUrl'],
      omittedFields: ['prompt', 'productDescription', 'verifiedVisualAttributes'],
      sku: productContext?.sku || null,
      subCategory: productContext?.category?.subCategory || 'unknown',
      note: 'virtual-try-on-001 uses image-only instances; verified text context retained on job snapshot only'
    };
  }

  async executeTryOn({ personBase64, productBase64, sampleCount = 1, clientRequestId, productContext = null, fetchImpl, authService, now } = {}) {
    if (this.isPastRetirement(now || new Date())) {
      const retireErr = new Error(
        `Model "${this.modelId}" đã hết hạn phục vụ từ ngày ${this.getCapabilities(now).retirementDate} (MODEL_RETIRED).`
      );
      retireErr.code = 'MODEL_RETIRED';
      retireErr.statusCode = 503;
      retireErr.providerId = this.providerId;
      throw retireErr;
    }

    const contextAdaptation = this.adaptProductContext(productContext);
    const requestBody = this.buildPredictRequestBody({ personBase64, productBase64, sampleCount });
    const activeAuth = authService || this.authService;
    const activeFetch = fetchImpl || this.fetchImpl || global.fetch;

    if (typeof activeFetch !== 'function') {
      const err = new Error('Fetch implementation unavailable for Vertex AI request');
      err.code = 'FETCH_UNAVAILABLE';
      err.statusCode = 500;
      throw err;
    }

    const token = await activeAuth.getAccessToken();
    const endpointUrl = this.getEndpointUrl();
    const startTime = Date.now();
    const correlationId = clientRequestId || this.generateRequestId();

    let response;
    try {
      response = await activeFetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Client-Request-Id': correlationId
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (networkErr) {
      const durationMs = Date.now() - startTime;
      if (networkErr.name === 'TimeoutError' || networkErr.name === 'AbortError' || networkErr.code === 'AI_TIMEOUT') {
        const timeoutError = new Error(`Google Cloud Vertex AI Try-On request timed out after ${this.timeoutMs / 1000}s`);
        timeoutError.code = 'AI_TIMEOUT';
        timeoutError.statusCode = 504;
        timeoutError.durationMs = Math.max(durationMs, this.timeoutMs);
        timeoutError.providerRequestId = correlationId;
        throw timeoutError;
      }
      const connError = new Error(`Network failure communicating with Google Cloud: ${networkErr.message}`);
      connError.code = 'NETWORK_ERROR';
      connError.statusCode = 502;
      connError.durationMs = durationMs;
      connError.providerRequestId = correlationId;
      throw connError;
    }

    const durationMs = Date.now() - startTime;
    const headerReqId = response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('x-goog-request-id')
      : undefined;
    const vertexRequestId = headerReqId || correlationId;

    if (!response.ok) {
      let errorBody = {};
      try {
        errorBody = await response.json();
      } catch (e) {
        try {
          errorBody = { message: await response.text() };
        } catch (_) {
          errorBody = {};
        }
      }

      const apiMessage = errorBody.error?.message || errorBody.message || response.statusText || 'Vertex API Error';
      const apiCode = errorBody.error?.code || response.status;
      const apiStatus = errorBody.error?.status || 'UNKNOWN';

      const error = new Error(`Google Cloud Virtual Try-On API error (${apiCode} ${apiStatus}): ${apiMessage}`);
      error.statusCode = response.status;
      error.code = this.classifyErrorCode(response.status, apiMessage);
      error.durationMs = durationMs;
      error.vertexRequestId = vertexRequestId;
      error.providerRequestId = vertexRequestId;
      error.details = errorBody;
      throw error;
    }

    const data = await response.json();
    if (!data.predictions || !Array.isArray(data.predictions) || data.predictions.length === 0) {
      const emptyErr = new Error('Google Cloud Vertex AI did not return any predictions in response');
      emptyErr.code = 'EMPTY_PREDICTIONS';
      emptyErr.statusCode = 502;
      emptyErr.durationMs = durationMs;
      emptyErr.vertexRequestId = vertexRequestId;
      throw emptyErr;
    }

    const firstPrediction = data.predictions[0];
    const resultBase64 = firstPrediction?.bytesBase64Encoded || firstPrediction?.image?.bytesBase64Encoded;

    if (!resultBase64 || typeof resultBase64 !== 'string' || resultBase64.length < 100) {
      const corruptedErr = new Error('Google Cloud Vertex AI response prediction missing valid bytesBase64Encoded image');
      corruptedErr.code = 'CORRUPTED_PREDICTION_OUTPUT';
      corruptedErr.statusCode = 502;
      corruptedErr.durationMs = durationMs;
      corruptedErr.vertexRequestId = vertexRequestId;
      throw corruptedErr;
    }

    return {
      resultBase64: this.sanitizeBase64(resultBase64),
      durationMs,
      vertexRequestId,
      providerRequestId: vertexRequestId,
      providerId: this.providerId,
      modelId: this.modelId,
      httpStatus: response.status,
      estimatedCostUsd: this.estimateCost({ sampleCount }).estimatedTotalUsd,
      contextAdaptation
    };
  }
}

module.exports = VertexVto001Adapter;
