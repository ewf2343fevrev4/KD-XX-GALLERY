const TryOnProviderAdapter = require('./TryOnProviderAdapter');
const accessoryStackingService = require('../accessoryStackingService');

class LuxuryAccessoryAdapter extends TryOnProviderAdapter {
  constructor(options = {}) {
    super({
      providerId: 'kdxx-luxury-accessories-v1',
      providerName: 'KD-XX Luxury Anatomical Accessory Stacker (Level 6 VIP)',
      displayName: 'KD-XX VIP Accessory Stacking Engine',
      modelId: 'anatomical-anchor-stacker-v1',
      unitCostUsd: 0,
      region: 'local',
      authenticationMethod: 'Native Built-in Engine',
      requiredEnvVars: [],
      documentationUrl: 'https://kd-xx-gallery.amiri.internal/docs/level6-accessory-stacking'
    });

    this.stackingService = options.accessoryStackingService || accessoryStackingService;
  }

  isAvailable() {
    return true;
  }

  areCredentialsConfigured() {
    return true;
  }

  getBaseCapabilities() {
    return {
      ...super.getBaseCapabilities(),
      providerId: this.providerId,
      providerName: this.providerName,
      displayName: this.displayName,
      modelId: this.modelId,
      supportedCategories: ['accessories', 'eyewear'],
      supportedSubcategories: [
        'eyewear',
        'sunglasses',
        'optical',
        'glasses',
        'bags',
        'handbags',
        'crossbody',
        'wallets',
        'clutches',
        'cardholder',
        'belts',
        'hats',
        'caps',
        'jewelry',
        'necklaces',
        'keychains',
        'other_accessories'
      ],
      categoryCapabilities: {
        eyewear: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Anatomical Facial Landmark Stacker',
          limitations: 'Yêu cầu ảnh chụp rõ mặt để căn chỉnh sống mũi và đồng tử.'
        },
        sunglasses: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Anatomical Facial Landmark Stacker',
          limitations: 'Yêu cầu ảnh chụp rõ mặt để căn chỉnh sống mũi.'
        },
        bags: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Hip & Shoulder Crossbody Stacker',
          limitations: 'Ướm tự nhiên bên hông phải hoặc đeo chéo thân người.'
        },
        wallets: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Hand & Flank Landmark Stacker',
          limitations: 'Ướm tại vị trí cổ tay hoặc cầm tay.'
        },
        belts: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Torso Waistline Stacker',
          limitations: 'Yêu cầu ảnh rõ vùng thắt lưng và cạp quần.'
        },
        hats: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Head Crown Landmark Stacker',
          limitations: 'Yêu cầu ảnh thấy rõ đỉnh đầu và trán.'
        },
        jewelry: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Neck & Clavicle Stacker',
          limitations: 'Khuyên tai/nhẫn nhỏ ưu tiên chế độ cận cảnh.'
        },
        necklaces: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Neck & Clavicle Stacker',
          limitations: 'Đặt trên xương quai xanh và cổ áo.'
        },
        keychains: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Belt-loop Accessory Stacker',
          limitations: 'Treo tại đỉa quần hoặc cạnh túi xách.'
        },
        accessories: {
          status: 'VERIFIED',
          isEnabledByDefault: false,
          verificationSource: 'KD-XX Level 6 Luxury Accessory Engine',
          limitations: 'Tự động bóc nền và tổng hợp bóng mờ tự nhiên.'
        }
      },
      verificationStatus: 'VERIFIED',
      lifecycleStage: 'GA',
      lastVerifiedAt: new Date().toISOString().split('T')[0],
      isEnabledByDefault: false,
      limitations: []
    };
  }

  async executeTryOn({
    personBase64,
    productBase64,
    sampleCount = 1,
    clientRequestId,
    productContext = null
  } = {}) {
    const startTime = Date.now();
    const correlationId = clientRequestId || this.generateRequestId();

    if (!personBase64 || !productBase64) {
      throw new Error('Dữ liệu Base64 người hoặc phụ kiện rỗng.');
    }

    const personBuffer = Buffer.from(personBase64, 'base64');
    const accessoryBuffer = Buffer.from(productBase64, 'base64');

    const category = productContext?.normalizedCategory?.subCategory ||
      productContext?.catalogCategory ||
      productContext?.normalizedDomain ||
      'accessories';

    const subCategory = productContext?.normalizedCategory?.subCategory || category;

    const stackResult = await this.stackingService.stackAccessoryOntoBody({
      personBuffer,
      accessoryBuffer,
      category,
      subCategory,
      poseAnalysis: productContext?.poseAnalysis || null
    });

    const durationMs = Date.now() - startTime;
    const resultBase64 = stackResult.enhancedBuffer.toString('base64');

    return {
      resultBase64,
      durationMs,
      vertexRequestId: correlationId,
      providerRequestId: correlationId,
      providerId: this.providerId,
      modelId: this.modelId,
      httpStatus: 200,
      estimatedCostUsd: 0,
      contextAdaptation: {
        engine: 'KD_XX_LEVEL_6_ACCESSORY_STACKER',
        telemetry: stackResult.telemetry
      }
    };
  }
}

module.exports = LuxuryAccessoryAdapter;
