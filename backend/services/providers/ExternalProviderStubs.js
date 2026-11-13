const TryOnProviderAdapter = require('./TryOnProviderAdapter');

/**
 * Registered unconfigured vendor entries derived strictly from official API documentation.
 * Kept strictly inactive (isAvailable() === false, NOT_CONFIGURED) until real keys and adapters are configured.
 */
class FashnTryOnMaxStub extends TryOnProviderAdapter {
  constructor() {
    super({
      providerId: 'fashn-tryon-max-stub',
      providerName: 'FASHN AI',
      displayName: 'FASHN AI Try-On Max (tryon-max)',
      modelId: 'tryon-max',
      unitCostUsd: 0.075,
      region: 'global',
      authenticationMethod: 'Bearer API Key (FASHN_API_KEY — NOT_CONFIGURED)',
      requiredEnvVars: ['FASHN_API_KEY'],
      documentationUrl: 'https://docs.fashn.ai/'
    });
  }

  getBaseCapabilities() {
    return {
      ...super.getBaseCapabilities(),
      supportedCategories: ['clothing', 'footwear'],
      supportedSubcategories: [
        'tops', 't-shirts', 'shirts', 'hoodies', 'jackets', 'outerwear',
        'pants', 'jeans', 'shorts', 'skirts', 'dresses',
        'sneakers', 'boots', 'loafers', 'sandals',
        'bags', 'hats', 'jewelry'
      ],
      categoryCapabilities: {
        clothing: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'FASHN API official docs (tryon-max / tryon-v1.6)',
          limitations: 'Chưa cấu hình FASHN_API_KEY và chưa triển khai webhook/polling worker.'
        },
        footwear: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'FASHN API official docs (tryon-max supports shoes)',
          limitations: 'Chưa cấu hình FASHN_API_KEY và chưa kiểm chứng chất lượng thực tế trên catalog KD-XX.'
        },
        bags: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'FASHN API official docs (tryon-max)',
          limitations: 'Chưa cấu hình FASHN_API_KEY.'
        },
        hats: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'FASHN API official docs (tryon-max)',
          limitations: 'Chưa cấu hình FASHN_API_KEY.'
        },
        jewelry: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'FASHN API official docs (tryon-max)',
          limitations: 'Chưa cấu hình FASHN_API_KEY.'
        }
      },
      inputRequirements: {
        requiredPersonPhoto: true,
        requiredProductImage: true,
        maxProductItems: 1,
        maxImageSize: 'URL công khai hoặc Base64 data URI',
        supportedImageFormats: ['image/jpeg', 'image/png', 'image/webp']
      },
      estimatedCost: {
        currency: 'USD',
        unitCostUsd: 0.075,
        creditRange: '1-5 credits / image (0.075 - 0.375 USD tùy 1K/2K/4K)',
        basis: 'per_successful_output'
      },
      verificationStatus: 'NOT_CONFIGURED',
      lifecycleStage: 'NOT_INTEGRATED',
      lastVerifiedAt: '2026-11-12',
      limitations: [
        'NOT_CONFIGURED: Thiếu biến môi trường FASHN_API_KEY.',
        'Chưa tích hợp async polling /v1/run -> /v1/status/{id} vào production.'
      ]
    };
  }
}

class KlingKolorsVtoStub extends TryOnProviderAdapter {
  constructor() {
    super({
      providerId: 'kling-kolors-vto-stub',
      providerName: 'Kling AI / fal.ai',
      displayName: 'Kling Kolors Virtual Try-On v1.5',
      modelId: 'kolors-virtual-try-on-v1.5',
      unitCostUsd: 0.07,
      region: 'global',
      authenticationMethod: 'API Key (KLING_API_KEY hoặc FAL_KEY — NOT_CONFIGURED)',
      requiredEnvVars: ['KLING_API_KEY'],
      documentationUrl: 'https://fal.ai/'
    });
  }

  getBaseCapabilities() {
    return {
      ...super.getBaseCapabilities(),
      supportedCategories: ['clothing'],
      supportedSubcategories: ['tops', 't-shirts', 'shirts', 'hoodies', 'jackets', 'outerwear', 'pants', 'jeans', 'shorts', 'skirts', 'dresses'],
      categoryCapabilities: {
        clothing: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'Kling Kolors Virtual Try-On API docs',
          limitations: 'Chưa cấu hình KLING_API_KEY / FAL_KEY.'
        },
        footwear: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          limitations: 'Kolors v1.5 tối ưu cho trang phục thân trên/thân dưới, chưa hỗ trợ giày chuẩn xác.'
        },
        eyewear: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          limitations: 'Kolors v1.5 không hỗ trợ kính mắt.'
        }
      },
      verificationStatus: 'NOT_CONFIGURED',
      lifecycleStage: 'NOT_INTEGRATED',
      lastVerifiedAt: '2026-11-12',
      estimatedCost: {
        currency: 'USD',
        unitCostUsd: 0.07,
        basis: 'per_generation_fal_estimate'
      },
      limitations: [
        'NOT_CONFIGURED: Thiếu biến môi trường KLING_API_KEY (hoặc FAL_KEY).'
      ]
    };
  }
}

class BanubaEyewearArStub extends TryOnProviderAdapter {
  constructor() {
    super({
      providerId: 'banuba-eyewear-ar-stub',
      providerName: 'Banuba TINT / Face AR SDK',
      displayName: 'Banuba Face AR Eyewear (Client SDK)',
      modelId: 'banuba-face-ar-sdk',
      unitCostUsd: 0,
      region: 'on-device / web-sdk',
      authenticationMethod: 'Client Token License (BANUBA_CLIENT_TOKEN — NOT_CONFIGURED)',
      requiredEnvVars: ['BANUBA_CLIENT_TOKEN'],
      documentationUrl: 'https://www.banuba.com/'
    });
  }

  getBaseCapabilities() {
    return {
      ...super.getBaseCapabilities(),
      supportedCategories: ['eyewear'],
      supportedSubcategories: ['eyewear', 'sunglasses'],
      categoryCapabilities: {
        eyewear: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'Banuba Face AR SDK docs',
          limitations: 'Chưa cấu hình BANUBA_CLIENT_TOKEN và chưa tích hợp asset kính 3D.'
        }
      },
      verificationStatus: 'NOT_CONFIGURED',
      lifecycleStage: 'NOT_INTEGRATED',
      lastVerifiedAt: '2026-11-12',
      limitations: [
        'NOT_CONFIGURED: Thiếu biến môi trường BANUBA_CLIENT_TOKEN.'
      ]
    };
  }
}

module.exports = {
  FashnTryOnMaxStub,
  KlingKolorsVtoStub,
  BanubaEyewearArStub
};
