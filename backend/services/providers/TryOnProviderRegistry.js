const VertexVto001Adapter = require('./VertexVto001Adapter');
const GeminiImageEditAdapter = require('./GeminiImageEditAdapter');
const EyewearProvider = require('./EyewearProvider');
const FootwearProvider = require('./FootwearProvider');
const AccessoriesProvider = require('./AccessoriesProvider');
const {
  FashnTryOnMaxStub,
  KlingKolorsVtoStub,
  BanubaEyewearArStub
} = require('./ExternalProviderStubs');

const CLOTHING_SET = new Set([
  'clothing',
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
  'dresses',
  'bottoms'
]);

const FOOTWEAR_SET = new Set([
  'footwear',
  'shoes',
  'sneakers',
  'boots',
  'loafers',
  'sandals'
]);

const EYEWEAR_SET = new Set(['eyewear', 'sunglasses', 'optical', 'optical_glasses']);

const ACCESSORY_GRANULAR_MAP = new Map([
  ['bags', 'bags'],
  ['belts', 'belts'],
  ['hats', 'hats'],
  ['jewelry', 'jewelry'],
  ['necklaces', 'jewelry'],
  ['rings', 'jewelry'],
  ['watches', 'watches'],
  ['wallets', 'wallets'],
  ['keychains', 'keychains'],
  ['socks', 'socks'],
  ['other_accessories', 'other_accessories'],
  ['accessories', 'other_accessories']
]);

const CATALOG_CATEGORY_TARGETS = [
  { key: 'clothing', label: 'Clothing (Áo, Quần, Áo khoác, Váy, Đầm)', domain: 'clothing', defaultSub: 'tops' },
  { key: 'full_outfit', label: 'Full Outfit (Top + Bottom Sequential — Benchmark Gated)', domain: 'clothing', defaultSub: 'full_outfit' },
  { key: 'footwear', label: 'Footwear (Sneakers, Boots, Loafers, Sandals)', domain: 'footwear', defaultSub: 'sneakers' },
  { key: 'eyewear', label: 'Eyewear (Kính râm, Kính gọng)', domain: 'accessories', defaultSub: 'eyewear' },
  { key: 'bags', label: 'Accessories — Bags (Túi xách)', domain: 'accessories', defaultSub: 'bags' },
  { key: 'hats', label: 'Accessories — Hats (Mũ / Nón)', domain: 'accessories', defaultSub: 'hats' },
  { key: 'jewelry', label: 'Accessories — Jewelry (Trang sức / Nhẫn / Dây chuyền)', domain: 'accessories', defaultSub: 'jewelry' },
  { key: 'watches', label: 'Accessories — Watches (Đồng hồ)', domain: 'accessories', defaultSub: 'watches' },
  { key: 'belts', label: 'Accessories — Belts (Thắt lưng)', domain: 'accessories', defaultSub: 'belts' },
  { key: 'wallets', label: 'Accessories — Wallets (Ví / Card Holder)', domain: 'accessories', defaultSub: 'wallets' },
  { key: 'keychains', label: 'Accessories — Keychains (Móc khóa)', domain: 'accessories', defaultSub: 'keychains' },
  { key: 'socks', label: 'Accessories — Socks (Tất)', domain: 'accessories', defaultSub: 'socks' }
];

function normalizeCategoryKey(category = '', domain = '') {
  const c = String(category || '').trim().toLowerCase();
  const d = String(domain || '').trim().toLowerCase();

  if (c === 'full_outfit' || c === 'full-outfit') return 'full_outfit';
  if (CLOTHING_SET.has(c) || d === 'clothing') return 'clothing';
  if (FOOTWEAR_SET.has(c) || d === 'footwear') return 'footwear';
  if (EYEWEAR_SET.has(c)) return 'eyewear';
  if (ACCESSORY_GRANULAR_MAP.has(c)) return ACCESSORY_GRANULAR_MAP.get(c);
  if (d === 'accessories') return 'other_accessories';
  return 'unknown';
}

class TryOnProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.defaultProviderId = process.env.TRYON_DEFAULT_PROVIDER || 'google-vertex-vto-001';

    this.register(new VertexVto001Adapter());
    this.register(new GeminiImageEditAdapter());
    this.register(new FootwearProvider());
    this.register(new EyewearProvider());
    this.register(new AccessoriesProvider());
    this.register(new FashnTryOnMaxStub());
    this.register(new KlingKolorsVtoStub());
    this.register(new BanubaEyewearArStub());
  }

  register(adapter) {
    if (!adapter || !adapter.providerId) {
      throw new Error('Cannot register TryOnProviderAdapter without providerId');
    }
    this.providers.set(adapter.providerId, adapter);
    return this;
  }

  getProvider(providerId) {
    return this.providers.get(providerId) || null;
  }

  getAllProviders() {
    return Array.from(this.providers.values());
  }

  getEffectiveProviderState(adapter, configDoc = null, now = new Date()) {
    const caps = adapter.getCapabilities(now);
    const retired = Boolean(caps.isPastRetirement);
    const statusOverride = configDoc?.verificationStatusOverride || null;
    const effectiveStatus = retired
      ? 'DEPRECATED'
      : statusOverride || caps.effectiveVerificationStatus || caps.verificationStatus;

    const isBaseAvailable = adapter.isAvailable(now);
    const isAdminEnabled = configDoc && typeof configDoc.isEnabled === 'boolean'
      ? configDoc.isEnabled
      : Boolean(caps.isEnabledByDefault);

    const cbOpen = configDoc?.circuitBreaker?.state === 'OPEN';
    const isEnabled =
      !retired &&
      effectiveStatus !== 'DEPRECATED' &&
      effectiveStatus !== 'NOT_CONFIGURED' &&
      effectiveStatus !== 'UNSUPPORTED' &&
      isBaseAvailable &&
      isAdminEnabled &&
      !cbOpen;

    return {
      adapter,
      caps,
      configDoc,
      retired,
      effectiveStatus,
      isBaseAvailable,
      isAdminEnabled,
      cbOpen,
      isEnabled
    };
  }

  getDefaultProvider(now = new Date(), configsByProviderId = new Map()) {
    const preferred = this.providers.get(this.defaultProviderId);
    if (preferred) {
      const state = this.getEffectiveProviderState(preferred, configsByProviderId.get(preferred.providerId), now);
      if (state.retired) {
        const err = new Error(
          `Model "${preferred.modelId}" đã hết hạn phục vụ từ ${state.caps.retirementDate} và bị từ chối tự động.`
        );
        err.code = 'MODEL_RETIRED';
        err.statusCode = 503;
        throw err;
      }
      if (state.isEnabled) {
        return preferred;
      }
    }

    for (const adapter of this.providers.values()) {
      const state = this.getEffectiveProviderState(adapter, configsByProviderId.get(adapter.providerId), now);
      if (state.isEnabled && (state.caps.supportedCategories || []).includes('clothing')) {
        return adapter;
      }
    }

    const err = new Error('Không có AI Try-On provider nào đang khả dụng cho danh mục Clothing');
    err.code = 'NO_AVAILABLE_PROVIDER';
    err.statusCode = 503;
    throw err;
  }

  /**
   * Evaluate category capability strictly WITHOUT dangerous fallback from unsupported categories
   * (eyewear / accessories / footwear / unknown) to Clothing defaults.
   */
  evaluateCategorySupport({ category = '', domain = '', subCategory = '', now = new Date(), configsByProviderId = new Map() } = {}) {
    const targetInput = subCategory && subCategory !== 'unknown' ? subCategory : category;
    const categoryKey = normalizeCategoryKey(targetInput, domain);
    const resolvedDomain = domain && domain !== 'unknown'
      ? String(domain).toLowerCase()
      : categoryKey === 'clothing'
        ? 'clothing'
        : categoryKey === 'footwear'
          ? 'footwear'
          : categoryKey === 'unknown'
            ? 'unknown'
            : 'accessories';

    if (categoryKey === 'unknown') {
      return {
        categoryKey: 'unknown',
        domain: resolvedDomain,
        subCategory: subCategory || 'unknown',
        status: 'UNSUPPORTED',
        allowSubmit: false,
        providerId: null,
        providerName: '',
        modelId: '',
        lifecycleStage: 'NOT_INTEGRATED',
        deprecationDate: null,
        retirementDate: null,
        isPastRetirement: false,
        limitations: ['Danh mục sản phẩm chưa được phân loại rõ ràng — không tự động suy đoán.'],
        reason: 'Danh mục sản phẩm chưa xác định hoặc cần Admin rà soát trước khi thử đồ AI.'
      };
    }

    // 1. Check Admin-designated default provider for this exact categoryKey first
    const candidates = [];
    for (const adapter of this.providers.values()) {
      const configDoc = configsByProviderId.get(adapter.providerId) || null;
      const state = this.getEffectiveProviderState(adapter, configDoc, now);
      const catCaps = state.caps.categoryCapabilities?.[categoryKey]
        || (categoryKey !== 'clothing' && categoryKey !== 'footwear' && categoryKey !== 'eyewear'
          ? state.caps.categoryCapabilities?.accessories
          : null);

      if (!catCaps) continue;

      const isAdminDefault = Array.isArray(configDoc?.defaultForCategories) &&
        configDoc.defaultForCategories.includes(categoryKey);
      const catOverride = configDoc?.categoryOverrides && typeof configDoc.categoryOverrides[categoryKey] === 'boolean'
        ? configDoc.categoryOverrides[categoryKey]
        : null;

      let catStatus = state.retired
        ? 'DEPRECATED'
        : state.effectiveStatus === 'DEPRECATED'
          ? 'DEPRECATED'
          : catCaps.status || state.effectiveStatus;

      const catEnabled = catOverride !== null ? catOverride : Boolean(catCaps.isEnabledByDefault);

      // Strict: NEVER enable UNSUPPORTED, NOT_CONFIGURED, EXPERIMENTAL, DEPRECATED, past retirement, or inactive stub
      const runnable =
        state.isEnabled &&
        catEnabled &&
        !state.retired &&
        (catStatus === 'VERIFIED' || catStatus === 'LIMITED');

      candidates.push({
        adapter,
        state,
        catCaps,
        catStatus,
        catEnabled,
        runnable,
        isAdminDefault
      });
    }

    // Sort priority: runnable > admin default > verified > non-retired > registered order
    const statusWeight = {
      VERIFIED: 5,
      LIMITED: 4,
      EXPERIMENTAL: 3,
      NOT_CONFIGURED: 2,
      DEPRECATED: 1,
      UNSUPPORTED: 0
    };
    candidates.sort((a, b) => {
      if (a.runnable !== b.runnable) return a.runnable ? -1 : 1;
      if (a.isAdminDefault !== b.isAdminDefault) return a.isAdminDefault ? -1 : 1;
      const wa = statusWeight[a.catStatus] ?? 0;
      const wb = statusWeight[b.catStatus] ?? 0;
      if (wa !== wb) return wb - wa;
      return a.adapter.providerId === this.defaultProviderId ? -1 : 1;
    });

    const chosen = candidates.find(c => c.runnable);
    if (chosen) {
      return {
        categoryKey,
        domain: resolvedDomain,
        subCategory: subCategory || categoryKey,
        status: chosen.catStatus,
        allowSubmit: true,
        providerId: chosen.adapter.providerId,
        providerName: chosen.caps?.providerName || chosen.adapter.providerName,
        modelId: chosen.adapter.modelId,
        lifecycleStage: chosen.state.caps.lifecycleStage,
        deprecationDate: chosen.state.caps.deprecationDate,
        retirementDate: chosen.state.caps.retirementDate,
        isPastRetirement: chosen.state.retired,
        limitations: [
          ...(chosen.catCaps.limitations ? [chosen.catCaps.limitations] : []),
          ...(chosen.state.caps.limitations || [])
        ],
        reason: chosen.catCaps.limitations || ''
      };
    }

    // Check if there is a non-runnable specialist/candidate so we report the truthful reason (DEPRECATED / NOT_CONFIGURED / LIMITED / EXPERIMENTAL / UNSUPPORTED)
    const nonUnsupported = candidates.filter(c => c.catStatus !== 'UNSUPPORTED');
    nonUnsupported.sort((a, b) => {
      if (a.state.retired !== b.state.retired) return a.state.retired ? -1 : 1;
      const aDefault = a.adapter.providerId === this.defaultProviderId || a.isAdminDefault;
      const bDefault = b.adapter.providerId === this.defaultProviderId || b.isAdminDefault;
      if (aDefault !== bDefault) return aDefault ? -1 : 1;
      const reasonWeight = {
        DEPRECATED: 5,
        LIMITED: 4,
        NOT_CONFIGURED: 3,
        EXPERIMENTAL: 2,
        VERIFIED: 1
      };
      return (reasonWeight[b.catStatus] || 0) - (reasonWeight[a.catStatus] || 0);
    });

    const bestNonRunnable = nonUnsupported[0] || candidates[0];
    if (!bestNonRunnable) {
      return {
        categoryKey,
        domain: resolvedDomain,
        subCategory: subCategory || categoryKey,
        status: 'UNSUPPORTED',
        blockCode: 'UNSUPPORTED_CATEGORY',
        allowSubmit: false,
        providerId: null,
        providerName: '',
        modelId: '',
        lifecycleStage: 'NOT_INTEGRATED',
        deprecationDate: null,
        retirementDate: null,
        isPastRetirement: false,
        limitations: ['Chưa có AI provider hỗ trợ danh mục này.'],
        reason: `Danh mục "${subCategory || categoryKey}" hiện không được hỗ trợ Virtual Try-On.`
      };
    }

    const { adapter, state, catCaps, catStatus, catEnabled } = bestNonRunnable;
    const codeMap = {
      DEPRECATED: 'MODEL_RETIRED',
      NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
      LIMITED: 'CATEGORY_DISABLED_LIMITED',
      EXPERIMENTAL: 'CATEGORY_EXPERIMENTAL_DISABLED',
      UNSUPPORTED: 'UNSUPPORTED_CATEGORY'
    };
    let blockCode = state.cbOpen ? 'PROVIDER_CIRCUIT_OPEN' : (codeMap[catStatus] || 'UNSUPPORTED_CATEGORY');
    let reason = catCaps.limitations || `Danh mục "${categoryKey}" chưa sẵn sàng cho Virtual Try-On.`;
    if (state.retired || catStatus === 'DEPRECATED') {
      blockCode = 'MODEL_RETIRED';
      reason = `Model "${adapter.modelId}" đã ngừng phục vụ (retirement: ${state.caps.retirementDate || 'N/A'}) và không thể tạo phiên mới.`;
    } else if (state.cbOpen) {
      reason = `Provider "${adapter.displayName}" đang tạm ngắt mạch bảo vệ do lỗi liên tiếp.`;
    } else if (catStatus === 'NOT_CONFIGURED') {
      reason = `Danh mục "${categoryKey}" chưa cấu hình AI provider (${adapter.requiredEnvVars.join(', ') || 'credentials'}).`;
    } else if (categoryKey === 'full_outfit' && !catEnabled) {
      blockCode = 'FULL_OUTFIT_PENDING_BENCHMARK';
      reason = 'Full Outfit (Áo + Quần) đang chờ nghiệm thu Benchmark với AI provider thật trước khi Admin kích hoạt.';
    } else if (catStatus === 'LIMITED') {
      reason = `Danh mục "${categoryKey}" đang ở mức LIMITED và được tắt mặc định để đảm bảo chất lượng hình ảnh.`;
    } else if (catStatus === 'EXPERIMENTAL') {
      reason = `Danh mục "${categoryKey}" đang ở mức EXPERIMENTAL và chưa bật cho người dùng.`;
    }

    return {
      categoryKey,
      domain: resolvedDomain,
      subCategory: subCategory || categoryKey,
      status: catStatus,
      blockCode,
      allowSubmit: false,
      providerId: adapter.providerId,
      providerName: state.caps.providerName || adapter.providerName,
      modelId: adapter.modelId,
      lifecycleStage: state.caps.lifecycleStage,
      deprecationDate: state.caps.deprecationDate,
      retirementDate: state.caps.retirementDate,
      isPastRetirement: state.retired,
      limitations: [
        ...(catCaps.limitations ? [catCaps.limitations] : []),
        ...(state.caps.limitations || [])
      ],
      reason
    };
  }

  /**
   * Strictly resolve an active, non-retired, verified/enabled adapter for the given category.
   * Rejects UNSUPPORTED / NOT_CONFIGURED / LIMITED(disabled) / EXPERIMENTAL(disabled) / DEPRECATED categories.
   */
  resolveForCategory(category = 'tops', options = {}) {
    const support = this.evaluateCategorySupport({
      category,
      domain: options.domain,
      subCategory: options.subCategory,
      now: options.now || new Date(),
      configsByProviderId: options.configsByProviderId || new Map()
    });

    if (!support.allowSubmit || !support.providerId) {
      const codeMap = {
        DEPRECATED: 'MODEL_RETIRED',
        NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
        LIMITED: 'CATEGORY_DISABLED_LIMITED',
        EXPERIMENTAL: 'CATEGORY_EXPERIMENTAL_DISABLED',
        UNSUPPORTED: 'UNSUPPORTED_CATEGORY'
      };
      const err = new Error(support.reason || `Danh mục "${category}" chưa được hỗ trợ Virtual Try-On.`);
      err.code = codeMap[support.status] || 'UNSUPPORTED_CATEGORY';
      err.statusCode = support.status === 'NOT_CONFIGURED' || support.status === 'DEPRECATED' ? 503 : 422;
      err.categorySupport = support;
      throw err;
    }

    return this.providers.get(support.providerId);
  }

  /**
   * Evaluate Full Outfit capability via Registry & Adapter Contract without hardcoding any single provider.
   * Priority 1: Native VERIFIED & enabled full-outfit adapter (supportsFullOutfit === true).
   * Priority 2: Controlled 2-step Sequential Orchestration over active CLOTHING provider (benchmark-gated).
   */
  evaluateFullOutfitCapability({ now = new Date(), configsByProviderId = new Map() } = {}) {
    const baseMeta = {
      mode: 'FULL_OUTFIT',
      requiredCredits: 2,
      maxItems: 2,
      supportedSlots: ['TOP', 'BOTTOM'],
      lockedSlots: ['FOOTWEAR', 'ACCESSORIES'],
      singleItemOnlySubcategories: ['dresses']
    };

    // 1. Check native multi-item/full-outfit provider first
    for (const adapter of this.providers.values()) {
      const configDoc = configsByProviderId.get(adapter.providerId) || null;
      const state = this.getEffectiveProviderState(adapter, configDoc, now);
      if (state.caps.supportsFullOutfit && state.isEnabled && !state.retired && state.effectiveStatus === 'VERIFIED') {
        const fullOverride = configDoc?.categoryOverrides?.full_outfit;
        if (fullOverride !== false) {
          return {
            ...baseMeta,
            categoryKey: 'full_outfit',
            strategy: 'NATIVE_FULL_OUTFIT',
            allowSubmit: true,
            blockCode: null,
            status: 'VERIFIED',
            providerId: adapter.providerId,
            providerName: state.caps.providerName || adapter.providerName,
            modelId: adapter.modelId,
            lifecycleStage: state.caps.lifecycleStage,
            deprecationDate: state.caps.deprecationDate,
            retirementDate: state.caps.retirementDate,
            isPastRetirement: false,
            limitations: state.caps.limitations || [],
            reason: 'Native Full Outfit provider đang hoạt động.'
          };
        }
      }
    }

    // 2. Fallback to Clothing sequential orchestration gated by full_outfit matrix + retirement checks
    const fullOutfitEval = this.evaluateCategorySupport({
      category: 'full_outfit',
      domain: 'clothing',
      subCategory: 'full_outfit',
      now,
      configsByProviderId
    });
    const clothingEval = this.evaluateCategorySupport({
      category: 'tops',
      domain: 'clothing',
      subCategory: 'tops',
      now,
      configsByProviderId
    });

    if (clothingEval.isPastRetirement || fullOutfitEval.isPastRetirement || clothingEval.status === 'DEPRECATED') {
      return {
        ...baseMeta,
        ...fullOutfitEval,
        strategy: 'SEQUENTIAL_CLOTHING_VTO',
        allowSubmit: false,
        status: 'DEPRECATED',
        blockCode: 'MODEL_RETIRED',
        isPastRetirement: true
      };
    }

    if (!clothingEval.allowSubmit) {
      return {
        ...baseMeta,
        ...clothingEval,
        categoryKey: 'full_outfit',
        strategy: 'SEQUENTIAL_CLOTHING_VTO',
        allowSubmit: false,
        blockCode: clothingEval.blockCode || 'NO_AVAILABLE_PROVIDER'
      };
    }

    if (!fullOutfitEval.allowSubmit) {
      return {
        ...baseMeta,
        ...fullOutfitEval,
        providerId: clothingEval.providerId,
        providerName: clothingEval.providerName,
        modelId: clothingEval.modelId,
        lifecycleStage: clothingEval.lifecycleStage,
        deprecationDate: clothingEval.deprecationDate,
        retirementDate: clothingEval.retirementDate,
        strategy: 'SEQUENTIAL_CLOTHING_VTO',
        allowSubmit: false,
        blockCode: fullOutfitEval.blockCode || 'FULL_OUTFIT_PENDING_BENCHMARK'
      };
    }

    return {
      ...baseMeta,
      ...fullOutfitEval,
      providerId: fullOutfitEval.providerId || clothingEval.providerId,
      providerName: fullOutfitEval.providerName || clothingEval.providerName,
      modelId: fullOutfitEval.modelId || clothingEval.modelId,
      strategy: 'SEQUENTIAL_CLOTHING_VTO',
      allowSubmit: true,
      blockCode: null
    };
  }

  buildCategoryMatrix(now = new Date(), configsByProviderId = new Map()) {
    return CATALOG_CATEGORY_TARGETS.map((target) => ({
      ...target,
      ...this.evaluateCategorySupport({
        domain: target.domain,
        subCategory: target.defaultSub,
        now,
        configsByProviderId
      })
    }));
  }

  async listProvidersHealth(now = new Date()) {
    const results = [];
    for (const adapter of this.providers.values()) {
      results.push(await adapter.healthCheck(now));
    }
    return results;
  }
}

module.exports = new TryOnProviderRegistry();
module.exports.TryOnProviderRegistry = TryOnProviderRegistry;
module.exports.normalizeCategoryKey = normalizeCategoryKey;
module.exports.CATALOG_CATEGORY_TARGETS = CATALOG_CATEGORY_TARGETS;
