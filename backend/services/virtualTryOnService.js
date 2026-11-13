const providerRegistry = require('./providers/TryOnProviderRegistry');
const providerConfigService = require('./tryOnProviderConfigService');

/**
 * Facade delegating Virtual Try-On execution through the registered AI provider adapters
 * with strict Category Capability checks and Admin governance overrides.
 */
class VirtualTryOnService {
  constructor(options = {}) {
    this.registry = options.registry || providerRegistry;
    this.providerConfigService = options.providerConfigService || providerConfigService;
  }

  getRegistry() {
    return this.registry;
  }

  /**
   * Resolve category support strictly without falling back from unsupported categories to Clothing defaults.
   */
  async resolveCategoryRouting({ category = '', domain = '', subCategory = '', now = new Date() } = {}) {
    const configsByProviderId = await this.providerConfigService.loadConfigsMap();
    const support = this.registry.evaluateCategorySupport({
      category,
      domain,
      subCategory,
      now,
      configsByProviderId
    });
    const adapter = support.allowSubmit && support.providerId
      ? this.registry.getProvider(support.providerId)
      : null;

    return { support, adapter, configsByProviderId };
  }

  async resolveFullOutfitRouting({ now = new Date() } = {}) {
    const configsByProviderId = await this.providerConfigService.loadConfigsMap();
    const support = typeof this.registry.evaluateFullOutfitCapability === 'function'
      ? this.registry.evaluateFullOutfitCapability({ now, configsByProviderId })
      : this.registry.evaluateCategorySupport({ category: 'full_outfit', domain: 'clothing', subCategory: 'full_outfit', now, configsByProviderId });
    const adapter = support.allowSubmit && support.providerId
      ? this.registry.getProvider(support.providerId)
      : null;

    return { support, adapter, configsByProviderId };
  }

  async getPublicCategoryMatrix(now = new Date()) {
    const configsMap = await this.providerConfigService.loadConfigsMap();
    return this.registry.buildCategoryMatrix(now, configsMap);
  }

  getActiveProvider({ providerId, category, domain, subCategory, now = new Date(), configsByProviderId } = {}) {
    if (providerId) {
      const explicit = this.registry.getProvider(providerId);
      if (explicit && explicit.isPastRetirement(now)) {
        const caps = explicit.getCapabilities(now);
        const err = new Error(
          `Model "${explicit.modelId}" đã ngừng phục vụ từ ngày ${caps.retirementDate} (MODEL_RETIRED).`
        );
        err.code = 'MODEL_RETIRED';
        err.statusCode = 503;
        throw err;
      }
      if (explicit && explicit.isAvailable(now)) {
        return explicit;
      }
      if (explicit && !explicit.isAvailable(now)) {
        const err = new Error(`Provider "${providerId}" hiện chưa khả dụng (chưa cấu hình hoặc đang tắt)`);
        err.code = 'PROVIDER_NOT_CONFIGURED';
        err.statusCode = 503;
        throw err;
      }
    }

    if (category || subCategory || domain) {
      return this.registry.resolveForCategory(subCategory || category, {
        domain,
        subCategory,
        now,
        configsByProviderId
      });
    }

    return this.registry.getDefaultProvider(now, configsByProviderId);
  }

  getEndpointUrl() {
    const provider = this.getActiveProvider();
    return typeof provider.getEndpointUrl === 'function' ? provider.getEndpointUrl() : '';
  }

  getCapabilities(options = {}) {
    return this.getActiveProvider(options).getCapabilities(options.now);
  }

  sanitizeBase64(raw) {
    const provider = this.getActiveProvider();
    if (typeof provider.sanitizeBase64 === 'function') {
      return provider.sanitizeBase64(raw);
    }
    if (!raw || typeof raw !== 'string') return '';
    const match = raw.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/);
    return (match ? match[1] : raw).trim().replace(/\s+/g, '');
  }

  async healthCheck(now = new Date()) {
    return this.providerConfigService.getAdminRegistrySnapshot(now);
  }

  /**
   * Invoke configured AI Try-On provider adapter
   */
  async predictTryOn({ personBase64, productBase64, sampleCount = 1, providerId, category, domain, subCategory, clientRequestId, productContext = null, fetchImpl, authService, now } = {}) {
    const configsByProviderId = await this.providerConfigService.loadConfigsMap();
    const provider = this.getActiveProvider({
      providerId,
      category,
      domain,
      subCategory,
      now,
      configsByProviderId
    });
    return provider.executeTryOn({
      personBase64,
      productBase64,
      sampleCount,
      clientRequestId,
      productContext,
      fetchImpl,
      authService,
      now
    });
  }
}

module.exports = new VirtualTryOnService();
module.exports.VirtualTryOnService = VirtualTryOnService;
