const TryOnProviderAdapter = require('./TryOnProviderAdapter');

class FootwearProvider extends TryOnProviderAdapter {
  constructor() {
    super({
      providerId: 'footwear-provider-stub',
      providerName: 'Perfect Corp YouCam Footwear (Planned)',
      displayName: 'Footwear Specialized Try-On (Perfect Corp / Shoes Transfer)',
      modelId: 'youcam-shoes-transfer-v2',
      unitCostUsd: 0,
      region: 'global',
      authenticationMethod: 'Bearer API Key (PERFECTCORP_API_KEY — NOT_CONFIGURED)',
      requiredEnvVars: ['PERFECTCORP_API_KEY'],
      documentationUrl: 'https://yce.makeupar.com/'
    });
  }

  isAvailable() {
    return false;
  }

  getBaseCapabilities() {
    return {
      ...super.getBaseCapabilities(),
      supportedCategories: ['footwear'],
      supportedSubcategories: ['sneakers', 'boots', 'loafers', 'sandals'],
      categoryCapabilities: {
        footwear: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          subcategories: ['sneakers', 'boots', 'loafers', 'sandals'],
          verificationSource: 'Perfect Corp YouCam API docs (/s2s/v2.0/task/shoes-transfer)',
          limitations: 'Chưa cấu hình PERFECTCORP_API_KEY và chưa tích hợp polling client thực tế.'
        }
      },
      inputRequirements: {
        requiredPersonPhoto: true,
        requiredProductImage: true,
        maxProductItems: 1,
        maxImageSize: '10 MB HTTPS / File API',
        supportedImageFormats: ['image/jpeg', 'image/png']
      },
      estimatedCost: {
        currency: 'USD',
        unitCostUsd: 0,
        basis: 'enterprise_api_plan_unconfigured'
      },
      verificationStatus: 'NOT_CONFIGURED',
      lifecycleStage: 'NOT_INTEGRATED',
      lastVerifiedAt: '2026-11-12',
      isEnabledByDefault: false,
      limitations: [
        'NOT_CONFIGURED: Thiếu biến môi trường PERFECTCORP_API_KEY.',
        'Cần ảnh toàn thân/hạ thân thấy rõ bàn chân để ghép giày.'
      ]
    };
  }
}

module.exports = FootwearProvider;
