const TryOnProviderAdapter = require('./TryOnProviderAdapter');

class EyewearProvider extends TryOnProviderAdapter {
  constructor() {
    super({
      providerId: 'eyewear-provider-stub',
      providerName: 'Fittingbox / Banuba Eyewear AR (Planned)',
      displayName: 'Eyewear Specialized AR / VTO (Fittingbox / Banuba)',
      modelId: 'unconfigured-eyewear-ar',
      unitCostUsd: 0,
      region: 'global',
      authenticationMethod: 'Vendor SDK License / API Key (FITTINGBOX_API_KEY / BANUBA_CLIENT_TOKEN — NOT_CONFIGURED)',
      requiredEnvVars: ['FITTINGBOX_API_KEY'],
      documentationUrl: 'https://www.fittingbox.com/'
    });
  }

  isAvailable() {
    return false;
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
          subcategories: ['eyewear', 'sunglasses'],
          verificationSource: 'Fittingbox & Banuba Eyewear VTO SDK official docs',
          limitations: 'Chưa cấu hình FITTINGBOX_API_KEY / BANUBA_CLIENT_TOKEN và cần dữ liệu khung 3D/AR SDK.'
        }
      },
      verificationStatus: 'NOT_CONFIGURED',
      lifecycleStage: 'NOT_INTEGRATED',
      lastVerifiedAt: '2026-11-12',
      isEnabledByDefault: false,
      limitations: [
        'NOT_CONFIGURED: Thiếu credentials (FITTINGBOX_API_KEY hoặc BANUBA_CLIENT_TOKEN).',
        'Thử kính chuẩn xác đòi hỏi facial landmark & dữ liệu gọng 3D chuyên biệt.'
      ]
    };
  }
}

module.exports = EyewearProvider;
