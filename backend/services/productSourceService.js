const {
  fetchSafeRemoteDocument,
  isHostnameInAllowlist
} = require('../utils/ssrfImageFetcher');

const OFFICIAL_BRAND_HOSTS = new Set([
  'amiri.com',
  'www.amiri.com'
]);

const TRUSTED_RETAILER_HOSTS = new Set([
  'club21.com',
  'www.club21.com',
  'farfetch.com',
  'www.farfetch.com',
  'ssense.com',
  'www.ssense.com',
  'holtrenfrew.com',
  'www.holtrenfrew.com',
  'neimanmarcus.com',
  'www.neimanmarcus.com',
  'reversible.com',
  'www.reversible.com'
]);

const COLOR_SYNONYMS = {
  black: ['black', 'noir', 'onyx', 'đen', 'blk'],
  white: ['white', 'blanc', 'ivory', 'off-white', 'trắng', 'wht'],
  grey: ['grey', 'gray', 'charcoal', 'slate', 'xám'],
  blue: ['blue', 'navy', 'cobalt', 'indigo', 'denim', 'xanh'],
  red: ['red', 'crimson', 'burgundy', 'bordeaux', 'đỏ'],
  green: ['green', 'olive', 'camo', 'khaki', 'sage', 'xanh rêu'],
  brown: ['brown', 'tan', 'camel', 'cognac', 'chestnut', 'nâu'],
  gold: ['gold', 'yellow', 'brass', 'vàng'],
  beige: ['beige', 'cream', 'sand', 'ecru', 'kem'],
  pink: ['pink', 'rose', 'hồng'],
  purple: ['purple', 'violet', 'tím']
};

function getConfiguredHostSets(extraOfficial = [], extraRetailers = []) {
  const official = new Set(OFFICIAL_BRAND_HOSTS);
  const retailer = new Set(TRUSTED_RETAILER_HOSTS);

  if (process.env.ALLOWED_OFFICIAL_BRAND_HOSTS) {
    process.env.ALLOWED_OFFICIAL_BRAND_HOSTS.split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
      .forEach(h => official.add(h));
  }

  if (process.env.ALLOWED_RETAILER_HOSTS) {
    process.env.ALLOWED_RETAILER_HOSTS.split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
      .forEach(h => retailer.add(h));
  }

  (extraOfficial || []).map(h => String(h).trim().toLowerCase()).filter(Boolean).forEach(h => official.add(h));
  (extraRetailers || []).map(h => String(h).trim().toLowerCase()).filter(Boolean).forEach(h => retailer.add(h));

  return { official, retailer };
}

function normalizeSku(sku = '') {
  return String(sku || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function normalizeName(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeColorGroup(rawColor = '') {
  const c = String(rawColor || '').trim().toLowerCase();
  if (!c) return '';
  for (const [group, terms] of Object.entries(COLOR_SYNONYMS)) {
    if (terms.some(t => c.includes(t))) {
      return group;
    }
  }
  return c;
}

function parseMetaTags(html = '') {
  const meta = {};
  const tagRegex = /<meta\b[^>]*>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[0];
    const nameMatch = tag.match(/(?:property|name)=["']([^"']+)["']/i);
    const contentMatch = tag.match(/content=["']([^"']*)["']/i);
    if (nameMatch && contentMatch) {
      meta[nameMatch[1].toLowerCase()] = contentMatch[1].trim();
    }
  }
  return meta;
}

function parseJsonLdProducts(html = '') {
  const results = [];
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed];
      for (const item of items) {
        const t = String(item?.['@type'] || '').toLowerCase();
        if (t.includes('product')) {
          results.push(item);
        }
      }
    } catch (_) {
      // Ignore malformed third-party JSON-LD blocks
    }
  }
  return results;
}

/**
 * Extract normalized structured attributes from safe JSON / JSON-LD / HTML metadata.
 * NEVER returns or retains raw HTML payloads so downstream AI builders stay HTML-free.
 */
function extractStructuredSourcePayload(rawText = '', mimeType = '', sourceUrl = '') {
  let obj = null;

  if (mimeType.includes('json') || rawText.trimStart().startsWith('{')) {
    try {
      obj = JSON.parse(rawText);
    } catch (_) {
      obj = null;
    }
  }

  if (!obj && mimeType.includes('html')) {
    const ldProducts = parseJsonLdProducts(rawText);
    if (ldProducts.length > 0) {
      obj = ldProducts[0];
    } else {
      const meta = parseMetaTags(rawText);
      obj = {
        name: meta['og:title'] || meta['twitter:title'] || '',
        brand: meta['product:brand'] || '',
        color: meta['product:color'] || '',
        material: meta['product:material'] || '',
        sku: meta['product:retailer_item_id'] || meta['sku'] || '',
        image: meta['og:image'] ? [meta['og:image']] : []
      };
    }
  }

  if (!obj || typeof obj !== 'object') {
    const err = new Error('Không trích xuất được dữ liệu sản phẩm có cấu trúc từ nguồn');
    err.code = 'UNSTRUCTURED_SOURCE_DATA';
    err.statusCode = 422;
    throw err;
  }

  const brandVal = typeof obj.brand === 'object' ? obj.brand?.name || '' : obj.brand || '';
  const rawImages = Array.isArray(obj.image)
    ? obj.image
    : Array.isArray(obj.images)
      ? obj.images
      : obj.image
        ? [obj.image]
        : obj.imageUrl
          ? [obj.imageUrl]
          : [];

  return {
    sku: String(obj.sku || obj.mpn || obj.productID || '').trim(),
    brand: String(brandVal || '').trim(),
    productName: String(obj.name || obj.title || '').trim(),
    color: String(obj.color || '').trim(),
    material: String(obj.material || '').trim(),
    fit: String(obj.fit || '').trim(),
    shape: String(obj.shape || '').trim(),
    pattern: String(obj.pattern || '').trim(),
    logoPosition: String(obj.logoPosition || '').trim(),
    visualDetails: Array.isArray(obj.visualDetails) ? obj.visualDetails.map(String) : [],
    images: rawImages.map(img => (typeof img === 'object' ? img.url || '' : String(img || ''))).filter(Boolean),
    sizes: Array.isArray(obj.sizes) ? obj.sizes.map(String) : [],
    sourceUrl
  };
}

class ProductSourceService {
  constructor(options = {}) {
    this.documentFetcher = options.fetchSafeRemoteDocument || fetchSafeRemoteDocument;
    this.cacheTtlMs = options.cacheTtlMs ?? 15 * 60 * 1000;
    this.maxRequestsPerDomainWindow = options.maxRequestsPerDomainWindow ?? 10;
    this.rateWindowMs = options.rateWindowMs ?? 60 * 1000;
    this.cache = new Map(); // sourceUrl -> { expiresAt, payload, mimeType, hostname, sourceType }
    this.domainRequests = new Map(); // hostname -> timestamps[]
  }

  classifySourceHost(hostname = '', options = {}) {
    const lower = String(hostname || '').trim().toLowerCase();
    const { official, retailer } = getConfiguredHostSets(
      options.extraOfficialHosts,
      options.extraRetailerHosts
    );

    if (isHostnameInAllowlist(lower, official)) {
      return { sourceType: 'official_brand', trustScore: 0.95 };
    }
    if (isHostnameInAllowlist(lower, retailer)) {
      return { sourceType: 'trusted_retailer', trustScore: 0.85 };
    }
    return null;
  }

  enforceDomainRateLimit(hostname) {
    const now = Date.now();
    const recent = (this.domainRequests.get(hostname) || []).filter(t => now - t < this.rateWindowMs);
    if (recent.length >= this.maxRequestsPerDomainWindow) {
      const err = new Error(`Vượt giới hạn tần suất truy xuất nguồn (${this.maxRequestsPerDomainWindow}/phút) cho ${hostname}`);
      err.code = 'SOURCE_RATE_LIMIT_EXCEEDED';
      err.statusCode = 429;
      throw err;
    }
    recent.push(now);
    this.domainRequests.set(hostname, recent);
  }

  /**
   * Fetch and parse a single verified brand/retailer source URL using Phase 1 SSRF & anti-bypass guards.
   */
  async fetchExternalSource(sourceUrl, options = {}) {
    let parsedUrl;
    try {
      parsedUrl = new URL(String(sourceUrl || '').trim());
    } catch (_) {
      const err = new Error('URL nguồn sản phẩm không hợp lệ');
      err.code = 'INVALID_URL';
      err.statusCode = 400;
      throw err;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const classification = this.classifySourceHost(hostname, options);
    if (!classification && !options.allowedHosts) {
      const err = new Error(`Tên miền nguồn "${hostname}" không nằm trong danh sách brand/retailer được xác minh`);
      err.code = 'UNTRUSTED_SOURCE_DOMAIN';
      err.statusCode = 403;
      throw err;
    }

    const cacheKey = parsedUrl.toString();
    const cached = !options.bypassCache && this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached, fromCache: true };
    }

    this.enforceDomainRateLimit(hostname);

    const allowedHosts = options.allowedHosts || new Set([
      ...getConfiguredHostSets(options.extraOfficialHosts, options.extraRetailerHosts).official,
      ...getConfiguredHostSets(options.extraOfficialHosts, options.extraRetailerHosts).retailer
    ]);

    const doc = await this.documentFetcher(cacheKey, {
      maxBytes: options.maxBytes || 2 * 1024 * 1024,
      timeoutMs: options.timeoutMs || 10000,
      allowedHosts,
      allowHttpForTest: options.allowHttpForTest,
      transport: options.transport,
      agent: options.agent,
      dnsLookup: options.dnsLookup
    });

    const extracted = extractStructuredSourcePayload(doc.text, doc.mimeType, cacheKey);
    const result = {
      sourceUrl: cacheKey,
      domain: hostname,
      sourceType: classification?.sourceType || options.sourceType || 'trusted_retailer',
      trustScore: classification?.trustScore ?? 0.85,
      retrievalDate: new Date(),
      extractedAttributes: extracted,
      fromCache: false,
      expiresAt: Date.now() + this.cacheTtlMs
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Strict product, SKU, and color variant matcher.
   * - Never assumes identical names share the same SKU.
   * - Never merges two different color versions.
   */
  matchSourceAgainstProduct(product = {}, externalAttributes = {}, options = {}) {
    const productSku = normalizeSku(product.sku || '');
    const extSku = normalizeSku(externalAttributes.sku || '');
    const productBrand = normalizeName(product.brand || '');
    const extBrand = normalizeName(externalAttributes.brand || '');
    const productTitle = normalizeName(product.name || '');
    const extTitle = normalizeName(externalAttributes.productName || '');

    const targetColorRaw = options.targetColor || (Array.isArray(product.colors) && product.colors.length === 1 ? product.colors[0] : '');
    const catalogColorGroups = new Set([
      ...(Array.isArray(product.colors) ? product.colors : []).map(normalizeColorGroup),
      normalizeColorGroup(targetColorRaw)
    ].filter(Boolean));
    const extColorGroup = normalizeColorGroup(externalAttributes.color || '');

    const brandMatches = !extBrand || !productBrand || extBrand.includes(productBrand) || productBrand.includes(extBrand);
    const nameMatches = Boolean(productTitle && extTitle && (extTitle === productTitle || extTitle.includes(productTitle) || productTitle.includes(extTitle)));

    if (!brandMatches) {
      return {
        productMatchingStatus: 'NOT_MATCHED',
        skuMatch: false,
        variantMatch: false,
        verificationStatus: 'REJECTED',
        reason: `Thương hiệu không khớp: "${externalAttributes.brand}" vs "${product.brand}"`
      };
    }

    // 1. SKU comparison when both records carry an explicit SKU
    if (productSku && extSku) {
      if (productSku !== extSku) {
        return {
          productMatchingStatus: 'SKU_MISMATCH',
          skuMatch: false,
          variantMatch: false,
          verificationStatus: 'CONFLICT',
          reason: `SKU không khớp (${productSku} ≠ ${extSku}) dù tên sản phẩm có thể giống nhau`
        };
      }

      // Same SKU, check color version consistency if both declare color
      if (catalogColorGroups.size > 0 && extColorGroup && !catalogColorGroups.has(extColorGroup)) {
        return {
          productMatchingStatus: 'COLOR_MISMATCH',
          skuMatch: true,
          variantMatch: false,
          verificationStatus: 'CONFLICT',
          reason: `Phiên bản màu không khớp (${externalAttributes.color} vs ${Array.from(catalogColorGroups).join('/')})`
        };
      }

      return {
        productMatchingStatus: 'EXACT_SKU_MATCH',
        skuMatch: true,
        variantMatch: true,
        verificationStatus: 'VERIFIED',
        reason: `Khớp chính xác SKU ${productSku}`
      };
    }

    // 2. Color mismatch without SKU confirmation -> block merging two color editions
    if (catalogColorGroups.size > 0 && extColorGroup && !catalogColorGroups.has(extColorGroup)) {
      return {
        productMatchingStatus: 'COLOR_MISMATCH',
        skuMatch: false,
        variantMatch: false,
        verificationStatus: 'CONFLICT',
        reason: `Màu sắc nguồn ngoài (${externalAttributes.color}) khác với phiên bản KD-XX (${product.colors.join(', ')})`
      };
    }

    // 3. KD-XX lacks SKU: even if name matches, NEVER auto-verify without SKU match or Admin confirmation
    if (nameMatches) {
      return {
        productMatchingStatus: 'NAME_ONLY_UNVERIFIED',
        skuMatch: false,
        variantMatch: false,
        verificationStatus: 'UNVERIFIED',
        reason: productSku
          ? 'Nguồn ngoài thiếu SKU để xác nhận chính xác'
          : 'Sản phẩm KD-XX thiếu SKU — chỉ khớp theo tên, giữ UNVERIFIED chờ xác minh SKU/Admin'
      };
    }

    return {
      productMatchingStatus: 'NOT_MATCHED',
      skuMatch: false,
      variantMatch: false,
      verificationStatus: 'UNVERIFIED',
      reason: 'Không đủ căn cứ khớp SKU/tên sản phẩm'
    };
  }

  /**
   * Detect cross-source disagreements (e.g. Official Brand vs Trusted Retailer vs KD-XX Catalog).
   */
  detectSourceConflicts(kdxxBaseline = {}, sourceRecords = []) {
    const conflicts = [];
    const activeSources = (sourceRecords || []).filter(
      s => s && s.sourceType !== 'kdxx_db' && s.verificationStatus !== 'REJECTED' && s.verificationStatus !== 'UNTRUSTED' && s.verificationStatus !== 'FETCH_FAILED' && s.verificationStatus !== 'BLOCKED'
    );

    // Check explicit matching-stage conflicts first
    for (const src of activeSources) {
      if (src.productMatchingStatus === 'SKU_MISMATCH' || src.productMatchingStatus === 'COLOR_MISMATCH') {
        conflicts.push({
          field: src.productMatchingStatus === 'SKU_MISMATCH' ? 'sku' : 'color',
          kdxxValue: src.productMatchingStatus === 'SKU_MISMATCH' ? kdxxBaseline.sku : (kdxxBaseline.colors || []).join(', '),
          externalValues: [{
            sourceType: src.sourceType,
            domain: src.domain,
            value: src.productMatchingStatus === 'SKU_MISMATCH' ? src.extractedAttributes?.sku : src.extractedAttributes?.color
          }],
          detectedAt: new Date(),
          resolved: false
        });
      }
    }

    // Check attribute disagreements across verified / candidate external sources
    const checkFields = ['material', 'color', 'sku'];
    for (const field of checkFields) {
      const valuesMap = new Map(); // normalizedValue -> Set/Array of { sourceType, domain, raw }
      for (const src of activeSources) {
        if (src.productMatchingStatus === 'NOT_MATCHED') continue;
        const rawVal = src.extractedAttributes?.[field];
        if (!rawVal || !String(rawVal).trim()) continue;
        const normKey = field === 'color'
          ? normalizeColorGroup(rawVal)
          : String(rawVal).trim().toLowerCase();
        if (!valuesMap.has(normKey)) valuesMap.set(normKey, []);
        valuesMap.get(normKey).push({
          sourceType: src.sourceType,
          domain: src.domain,
          value: String(rawVal).trim()
        });
      }

      if (valuesMap.size > 1) {
        conflicts.push({
          field,
          kdxxValue: kdxxBaseline[field] || null,
          externalValues: Array.from(valuesMap.values()).flat(),
          detectedAt: new Date(),
          resolved: false
        });
      }
    }

    return conflicts;
  }
}

module.exports = new ProductSourceService();
module.exports.ProductSourceService = ProductSourceService;
module.exports.extractStructuredSourcePayload = extractStructuredSourcePayload;
module.exports.normalizeSku = normalizeSku;
module.exports.normalizeColorGroup = normalizeColorGroup;
module.exports.OFFICIAL_BRAND_HOSTS = OFFICIAL_BRAND_HOSTS;
module.exports.TRUSTED_RETAILER_HOSTS = TRUSTED_RETAILER_HOSTS;
