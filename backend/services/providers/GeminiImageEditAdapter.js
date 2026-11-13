const TryOnProviderAdapter = require('./TryOnProviderAdapter');

/**
 * Experimental Adapter Stub for Gemini Image Generation / Editing (`gemini-2.5-flash-image`).
 *
 * Phase 4 governance (STRICT):
 * - verificationStatus: EXPERIMENTAL
 * - isEnabledByDefault: false
 * - isAvailable() strictly returns false and NEVER auto-activates just because GEMINI_API_KEY exists.
 * - Never calls external Gemini Image API until explicitly implemented, verified, and enabled.
 */
class GeminiImageEditAdapter extends TryOnProviderAdapter {
  constructor() {
    super({
      providerId: 'gemini-image-edit-stub',
      providerName: 'Google Gemini Multimodal Image',
      displayName: 'Gemini Image Edit Adapter (Experimental Stub)',
      modelId: process.env.GCP_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
      unitCostUsd: 0.039,
      region: 'global',
      authenticationMethod: 'Gemini API Key (GEMINI_API_KEY) / Vertex AI',
      requiredEnvVars: ['GEMINI_API_KEY'],
      documentationUrl: 'https://ai.google.dev/gemini-api/docs/image-generation'
    });
  }

  isAvailable() {
    return false;
  }

  getBaseCapabilities() {
    return {
      ...super.getBaseCapabilities(),
      supportedCategories: [],
      supportedSubcategories: [],
      categoryCapabilities: {
        clothing: {
          status: 'EXPERIMENTAL',
          isEnabledByDefault: false,
          limitations: 'Model chỉnh sửa ảnh đa năng, chưa kiểm chứng độ giữ form & chi tiết SKU bằng VTON chuyên dụng.'
        },
        footwear: {
          status: 'EXPERIMENTAL',
          isEnabledByDefault: false,
          limitations: 'Chưa xác minh bảo toàn chi tiết mũi/đế/logo giày.'
        },
        eyewear: {
          status: 'EXPERIMENTAL',
          isEnabledByDefault: false,
          limitations: 'Chưa xác minh tỉ lệ gọng kính theo facial landmarks.'
        },
        accessories: {
          status: 'EXPERIMENTAL',
          isEnabledByDefault: false,
          limitations: 'Chưa kiểm chứng độ chính xác kích thước & logo khi ghép phụ kiện.'
        }
      },
      inputRequirements: {
        requiredPersonPhoto: true,
        requiredProductImage: true,
        maxProductItems: 3,
        maxImageSize: 'Theo giới hạn inline/Files API Gemini',
        supportedImageFormats: ['image/jpeg', 'image/png', 'image/webp']
      },
      maxProductItems: 3,
      supportsMultipleProducts: true,
      supportsFullOutfit: true,
      supportsPrompt: true,
      supportsReferenceImage: true,
      supportsProductDescription: true,
      supportsMultiItem: true,
      estimatedCost: {
        currency: 'USD',
        unitCostUsd: 0.039,
        basis: 'token_image_output_estimate'
      },
      verificationStatus: 'EXPERIMENTAL',
      lifecycleStage: 'PREVIEW',
      lastVerifiedAt: '2026-11-12',
      isEnabledByDefault: false,
      limitations: [
        'EXPERIMENTAL & TẮT MẶC ĐỊNH: Không tự kích hoạt dù GEMINI_API_KEY đã tồn tại trong .env.',
        'Chưa triển khai gọi API thật và chưa được phép cho người dùng sử dụng ở Phase 4.',
        'Gemini Image Edit là model sinh/chỉnh sửa ảnh tổng quát, chưa đảm bảo bảo toàn tuyệt đối logo/SKU.'
      ]
    };
  }

  adaptProductContext(productContext = null) {
    if (!productContext) return super.adaptProductContext(null);
    const attrs = productContext.verifiedVisualAttributes || {};
    const summaryParts = [];
    if (productContext.productIdentity?.brand) summaryParts.push(`Brand: ${productContext.productIdentity.brand}`);
    if (attrs.color?.primary && attrs.color.confirmed) summaryParts.push(`Color: ${attrs.color.primary}`);
    if (attrs.material) summaryParts.push(`Material: ${attrs.material}`);
    if (attrs.fit) summaryParts.push(`Fit: ${attrs.fit}`);
    if (attrs.logoPosition) summaryParts.push(`Logo Position: ${attrs.logoPosition}`);

    return {
      providerId: this.providerId,
      modelId: this.modelId,
      usesStructuredTextContext: true,
      usedFields: ['productImageReferences', 'verifiedVisualAttributes', 'sku', 'knownLimitations'],
      omittedFields: ['rawHtml'],
      structuredSummary: summaryParts.join(' | '),
      sku: productContext.sku || null,
      subCategory: productContext.category?.subCategory || 'unknown'
    };
  }
}

module.exports = GeminiImageEditAdapter;
