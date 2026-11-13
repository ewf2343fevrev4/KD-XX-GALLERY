const categoryTaxonomyService = require('./categoryTaxonomyService');
const { normalizeColorGroup, normalizeSku } = require('./productSourceService');

/**
 * Resolves a customer-selected variant (if any) strictly against known catalog variants & colors.
 * Prevents cross-color or cross-SKU mixing.
 */
function resolveSelectedVariant(product = {}, intelligence = null, requestedVariant = null) {
  const variants = intelligence?.variantInformation?.variants?.length
    ? intelligence.variantInformation.variants
    : Array.isArray(product.variants)
      ? product.variants
      : [];

  const catalogColors = Array.isArray(product.colors) ? product.colors.filter(Boolean) : [];
  const hasMultipleVariants = variants.length > 1 || catalogColors.length > 1;

  if (!requestedVariant || (typeof requestedVariant === 'object' && Object.keys(requestedVariant).length === 0)) {
    return {
      selectedSku: String(intelligence?.sku || product.sku || '').trim(),
      selectedColor: catalogColors.length === 1 ? catalogColors[0] : (intelligence?.attributes?.color?.primary || ''),
      selectedSize: '',
      selectedImageUrl: '',
      hasMultipleVariants,
      variantMatched: !hasMultipleVariants,
      conflictReason: ''
    };
  }

  const reqSku = normalizeSku(requestedVariant.sku || '');
  const reqColor = String(requestedVariant.color || '').trim();
  const reqColorGroup = normalizeColorGroup(reqColor);
  const reqSize = String(requestedVariant.size || '').trim();

  if (variants.length > 0) {
    let matched = null;
    if (reqSku) {
      matched = variants.find(v => normalizeSku(v.sku) === reqSku);
      if (matched && reqColorGroup && matched.color && normalizeColorGroup(matched.color) !== reqColorGroup) {
        const err = new Error(`Màu sắc "${reqColor}" không khớp với phiên bản SKU ${matched.sku} (${matched.color})`);
        err.code = 'VARIANT_COLOR_MISMATCH';
        err.statusCode = 400;
        throw err;
      }
    }

    if (!matched && reqColorGroup) {
      matched = variants.find(v => normalizeColorGroup(v.color) === reqColorGroup);
    }

    if (!matched && reqSku) {
      const baseSku = normalizeSku(intelligence?.sku || product.sku || '');
      if (baseSku && baseSku !== reqSku) {
        const err = new Error(`SKU biến thể "${requestedVariant.sku}" không thuộc sản phẩm này`);
        err.code = 'VARIANT_SKU_MISMATCH';
        err.statusCode = 400;
        throw err;
      }
    }

    if (matched) {
      return {
        selectedSku: matched.sku || String(intelligence?.sku || product.sku || '').trim(),
        selectedColor: matched.color || reqColor,
        selectedSize: reqSize,
        selectedImageUrl: matched.imageUrl || '',
        hasMultipleVariants,
        variantMatched: true,
        conflictReason: ''
      };
    }
  }

  if (catalogColors.length > 0 && reqColorGroup) {
    const matchedColor = catalogColors.find(c => normalizeColorGroup(c) === reqColorGroup);
    if (!matchedColor) {
      const err = new Error(`Phiên bản màu "${reqColor}" không tồn tại trong danh sách màu hợp lệ (${catalogColors.join(', ')})`);
      err.code = 'VARIANT_COLOR_MISMATCH';
      err.statusCode = 400;
      throw err;
    }
    return {
      selectedSku: reqSku || String(intelligence?.sku || product.sku || '').trim(),
      selectedColor: matchedColor,
      selectedSize: reqSize,
      selectedImageUrl: '',
      hasMultipleVariants,
      variantMatched: true,
      conflictReason: ''
    };
  }

  return {
    selectedSku: reqSku || String(intelligence?.sku || product.sku || '').trim(),
    selectedColor: reqColor,
    selectedSize: reqSize,
    selectedImageUrl: '',
    hasMultipleVariants,
    variantMatched: Boolean(reqColor || reqSku),
    conflictReason: ''
  };
}

class AiProductContextService {
  /**
   * Build clean, structured, provider-agnostic Product Context for Virtual Try-On AI providers.
   * Never exposes raw HTML or unverified external guesses as confirmed product truth.
   */
  buildProductContext({ product, intelligence = null, selectedVariant = null, providerCapabilities = null } = {}) {
    if (!product || !product._id) {
      const err = new Error('Không thể tạo AI Product Context khi thiếu sản phẩm');
      err.code = 'PRODUCT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const taxonomy = intelligence?.normalizedCategory?.subCategory && intelligence.normalizedCategory.subCategory !== 'unknown'
      ? intelligence.normalizedCategory
      : categoryTaxonomyService.mapProductCategory(product);

    const variantInfo = resolveSelectedVariant(product, intelligence, selectedVariant);
    const baseSku = String(intelligence?.sku || product.sku || '').trim();
    const sku = variantInfo.selectedSku || baseSku;

    const fallbackImageUrl = product.image || (Array.isArray(product.images) && product.images[0]) || '';
    const primaryImageUrl = variantInfo.selectedImageUrl || intelligence?.bestTryOnImageUrl || fallbackImageUrl;

    const validAlternateUrls = (intelligence?.productImages || [])
      .filter(img => img && img.url && img.url !== primaryImageUrl && img.isValidForTryOn !== false)
      .map(img => img.url);

    const catalogAlternates = (Array.isArray(product.images) ? product.images : [])
      .filter(u => u && u !== primaryImageUrl && !validAlternateUrls.includes(u));

    const verifiedImages = (intelligence?.productImages || []).find(i => i.url === primaryImageUrl);

    const attrs = intelligence?.attributes || {};
    const verifiedColor = variantInfo.selectedColor
      ? { primary: variantInfo.selectedColor, secondary: '', confirmed: true }
      : attrs.color?.confirmed
        ? { primary: attrs.color.primary, secondary: attrs.color.secondary || '', confirmed: true }
        : { primary: null, secondary: null, confirmed: false };

    const verifiedMaterial = attrs.material?.confirmed ? attrs.material.value : null;
    const verifiedPattern = attrs.pattern?.confirmed ? attrs.pattern.value : null;
    const verifiedShape = attrs.shape?.confirmed ? attrs.shape.value : null;
    const verifiedFit = attrs.fit?.confirmed ? attrs.fit.value : null;
    const verifiedLogoPos = attrs.logoPosition?.confirmed ? attrs.logoPosition.value : null;
    const verifiedVisualDetails = Array.isArray(attrs.visualDetails) ? attrs.visualDetails : [];

    const verifiedSources = (intelligence?.sourceRecords || [])
      .filter(s => s && (s.verificationStatus === 'VERIFIED' || s.sourceType === 'kdxx_db'))
      .map(s => ({
        sourceType: s.sourceType,
        domain: s.domain || 'kdxx.internal',
        sourceUrl: s.sourceUrl || '',
        verificationStatus: s.verificationStatus
      }));

    const knownLimitations = [];
    if (!sku) {
      knownLimitations.push('Sản phẩm chưa có SKU chính thức — kết quả chỉ mang tính tham chiếu theo tên/ảnh catalog.');
    }
    if (!intelligence || intelligence.verificationStatus !== 'VERIFIED') {
      knownLimitations.push('Thuộc tính chi tiết chưa được xác minh đầy đủ từ nguồn chính thức/Admin.');
    }
    if (intelligence?.flags?.hasConflicts) {
      knownLimitations.push('Phát hiện mâu thuẫn dữ liệu giữa các nguồn — giữ nguyên thuộc tính đã xác nhận, chờ Admin rà soát.');
    }
    if (variantInfo.hasMultipleVariants && !selectedVariant) {
      knownLimitations.push('Sản phẩm có nhiều phiên bản màu/biến thể nhưng chưa chọn biến thể cụ thể; sử dụng ảnh mặc định catalog.');
    }
    if (taxonomy.supportReason && taxonomy.tryOnSupportLevel !== 'DIRECT') {
      knownLimitations.push(taxonomy.supportReason);
    }
    if (providerCapabilities && providerCapabilities.supportsPrompt === false) {
      knownLimitations.push(`Model ${providerCapabilities.modelId || 'hiện tại'} chỉ nhận đầu vào hình ảnh (không gửi prompt mô tả chữ).`);
    }

    return {
      schemaVersion: '2.0',
      generatedAt: new Date().toISOString(),
      productIdentity: {
        productId: String(product._id),
        baseSku: baseSku || null,
        productName: intelligence?.productName || product.name || '',
        brand: intelligence?.brand || product.brand || 'KD-XX',
        catalogCategory: product.category || ''
      },
      sku: sku || null,
      variant: {
        selectedSku: sku || null,
        selectedColor: variantInfo.selectedColor || null,
        selectedSize: variantInfo.selectedSize || null,
        hasMultipleVariants: variantInfo.hasMultipleVariants,
        variantMatched: variantInfo.variantMatched
      },
      category: {
        domain: taxonomy.domain,
        subCategory: taxonomy.subCategory,
        filterGroup: taxonomy.filterGroup,
        tryOnSupportLevel: taxonomy.tryOnSupportLevel
      },
      verifiedVisualAttributes: {
        color: verifiedColor,
        material: verifiedMaterial,
        pattern: verifiedPattern,
        shape: verifiedShape,
        fit: verifiedFit,
        logoPosition: verifiedLogoPos,
        visualDetails: verifiedVisualDetails
      },
      unverifiedObservations: {
        catalogColorHint: attrs.color?.primary || (Array.isArray(product.colors) ? product.colors[0] : null) || null,
        catalogMaterialHint: !verifiedMaterial && attrs.material?.value ? `${attrs.material.value} (chưa xác minh SKU)` : null,
        imagePixelColor: verifiedImages?.visualExtract?.dominantColorName || null,
        imagePixelPattern: verifiedImages?.visualExtract?.patternHint || null
      },
      productImageReferences: {
        primaryImageUrl,
        selectedVariantImageUrl: variantInfo.selectedImageUrl || null,
        verifiedAlternateUrls: [...validAlternateUrls, ...catalogAlternates].slice(0, 6),
        imageCount: 1 + validAlternateUrls.length + catalogAlternates.length,
        mimeValidated: Boolean(verifiedImages?.isValidForTryOn),
        width: verifiedImages?.width || 0,
        height: verifiedImages?.height || 0,
        aspectRatio: verifiedImages?.aspectRatio || 0
      },
      sourceConfidence: {
        verificationStatus: intelligence?.verificationStatus || 'UNVERIFIED',
        confidenceScore: intelligence?.confidenceScore ?? 0.25,
        lastVerifiedAt: intelligence?.lastVerifiedAt || null,
        adminApproved: Boolean(intelligence?.adminApproved),
        verifiedSources
      },
      knownLimitations
    };
  }

  /**
   * Compact snapshot stored on `TryOnJob.productSnapshot` for permanent auditability.
   */
  toJobProductSnapshot(productContext = {}) {
    return {
      productId: productContext.productIdentity?.productId || null,
      sku: productContext.productIdentity?.baseSku || productContext.sku || '',
      brand: productContext.productIdentity?.brand || '',
      productName: productContext.productIdentity?.productName || '',
      catalogCategory: productContext.productIdentity?.catalogCategory || '',
      normalizedDomain: productContext.category?.domain || 'unknown',
      normalizedSubCategory: productContext.category?.subCategory || 'unknown',
      variantSku: productContext.variant?.selectedSku || '',
      variantColor: productContext.variant?.selectedColor || '',
      variantSize: productContext.variant?.selectedSize || '',
      imageUrlUsed: productContext.productImageReferences?.primaryImageUrl || '',
      verificationStatus: productContext.sourceConfidence?.verificationStatus || 'UNVERIFIED',
      confidenceScore: productContext.sourceConfidence?.confidenceScore ?? 0,
      sourceTypesUsed: Array.from(
        new Set((productContext.sourceConfidence?.verifiedSources || []).map(s => s.sourceType).filter(Boolean))
      ),
      sourceUrlsUsed: (productContext.sourceConfidence?.verifiedSources || [])
        .map(s => s.sourceUrl)
        .filter(Boolean),
      knownLimitations: Array.isArray(productContext.knownLimitations) ? productContext.knownLimitations : [],
      contextGeneratedAt: productContext.generatedAt ? new Date(productContext.generatedAt) : new Date()
    };
  }
}

module.exports = new AiProductContextService();
module.exports.AiProductContextService = AiProductContextService;
module.exports.resolveSelectedVariant = resolveSelectedVariant;
