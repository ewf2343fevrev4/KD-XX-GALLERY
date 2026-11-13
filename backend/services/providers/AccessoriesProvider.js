const TryOnProviderAdapter = require('./TryOnProviderAdapter');

class AccessoriesProvider extends TryOnProviderAdapter {
  constructor() {
    super({
      providerId: 'accessories-provider-stub',
      providerName: 'Perfect Corp YouCam Bags & Jewelry (Planned)',
      displayName: 'Accessories Specialized Try-On (Bags / Earrings)',
      modelId: 'youcam-accessories-v2',
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
      supportedCategories: ['accessories'],
      supportedSubcategories: ['bags', 'jewelry'],
      categoryCapabilities: {
        bags: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'Perfect Corp YouCam API docs (/s2s/v2.0/task/bag)',
          limitations: 'Chưa cấu hình PERFECTCORP_API_KEY.'
        },
        jewelry: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          verificationSource: 'Perfect Corp YouCam API docs (/s2s/v2.0/task/2d-vto/earring)',
          limitations: 'Chưa cấu hình PERFECTCORP_API_KEY; nhẫn/dây chuyền nhỏ trên ảnh toàn thân vẫn UNSUPPORTED.'
        },
        hats: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          limitations: 'Cần provider hỗ trợ phụ kiện vùng đầu.'
        },
        watches: {
          status: 'NOT_CONFIGURED',
          isEnabledByDefault: false,
          limitations: 'Cần AR cổ tay chuyên biệt (như WANNA) + asset 3D.'
        },
        belts: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          limitations: 'Chưa có provider 2D đáng tin cậy bảo toàn khóa logo thắt lưng.'
        },
        wallets: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          limitations: 'Phụ kiện cầm tay chưa có luồng VTO xác minh.'
        },
        keychains: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          limitations: 'Móc khóa kích thước nhỏ chưa phù hợp VTO toàn thân.'
        },
        socks: {
          status: 'UNSUPPORTED',
          isEnabledByDefault: false,
          limitations: 'Tất chân chưa có provider VTO xác minh.'
        }
      },
      verificationStatus: 'NOT_CONFIGURED',
      lifecycleStage: 'NOT_INTEGRATED',
      lastVerifiedAt: '2026-11-12',
      isEnabledByDefault: false,
      limitations: [
        'NOT_CONFIGURED: Thiếu biến môi trường PERFECTCORP_API_KEY.',
        'Mỗi loại phụ kiện (bags, hats, jewelry, watches, belts, wallets, keychains, socks) có giới hạn riêng biệt.'
      ]
    };
  }
}

module.exports = AccessoriesProvider;
