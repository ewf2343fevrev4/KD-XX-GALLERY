const Product = require('../models/Product');
const ProductIntelligence = require('../models/ProductIntelligence');
const categoryTaxonomyService = require('./categoryTaxonomyService');
const productSourceService = require('./productSourceService');
const productImageIntelligenceService = require('./productImageIntelligenceService');

const CONSERVATIVE_MATERIAL_PATTERNS = [
  { regex: /\bstretch denim\b|\bitalian stretch denim\b|\bdenim\b/i, value: 'Cotton Stretch Denim' },
  { regex: /\b100%\s*silk\b|\bsilk twill\b/i, value: 'Silk' },
  { regex: /\bcashmere\b/i, value: 'Cashmere' },
  { regex: /\bcalfskin\b|\bda cá sấu\b|\bcroc embossed\b|\bleather\b/i, value: 'Leather' },
  { regex: /\bfleece\b|\bsheepskin\b|\blông cừu\b/i, value: 'Shearling / Fleece' },
  { regex: /\b100%\s*cotton\b|\bcotton jersey\b/i, value: 'Cotton' },
  { regex: /\bnylon\b|\bdown\b/i, value: 'Technical Nylon / Down' }
];

function extractExplicitMaterialFromDescription(description = '') {
  const text = String(description || '');
  for (const rule of CONSERVATIVE_MATERIAL_PATTERNS) {
    if (rule.regex.test(text)) {
      return rule.value;
    }
  }
  return '';
}

function getHostnameSafe(url = '') {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function buildVariantsFromProduct(product = {}) {
  const explicitVariants = Array.isArray(product.variants) ? product.variants : [];
  if (explicitVariants.length > 0) {
    return explicitVariants.map((v, idx) => ({
      sku: String(v.sku || product.sku || '').trim(),
      variantKey: `${String(v.color || 'default').toLowerCase()}-${String(v.sku || idx)}`,
      color: String(v.color || '').trim(),
      sizes: Array.isArray(v.sizes) ? v.sizes : [],
      imageUrl: String(v.imageUrl || (Array.isArray(v.images) && v.images[0]) || '').trim(),
      sourceUrl: '',
      verificationStatus: v.sku ? 'VERIFIED' : 'UNVERIFIED'
    }));
  }

  const colors = Array.isArray(product.colors) ? product.colors.filter(Boolean) : [];
  if (colors.length > 1) {
    return colors.map((col, idx) => ({
      sku: product.sku ? `${product.sku}-${String(col).toUpperCase().slice(0, 3)}` : '',
      variantKey: `${String(col).toLowerCase()}-${idx}`,
      color: String(col).trim(),
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      imageUrl: String(product.images?.[idx] || product.image || '').trim(),
      sourceUrl: '',
      verificationStatus: 'UNVERIFIED'
    }));
  }

  return [];
}

class ProductIntelligenceService {
  constructor(options = {}) {
    this.sourceService = options.sourceService || productSourceService;
    this.imageService = options.imageService || productImageIntelligenceService;
  }

  isFieldLocked(record, fieldPath) {
    if (!record || !Array.isArray(record.adminLockedFields)) return false;
    return record.adminLockedFields.includes(fieldPath) || record.adminLockedFields.includes('*');
  }

  recomputeGovernanceState(record, product = {}) {
    const now = Date.now();
    const locked = new Set(record.adminLockedFields || []);

    const rawImages = [];
    if (product.image) rawImages.push(product.image);
    if (Array.isArray(product.images)) {
      for (const u of product.images) {
        if (u && !rawImages.includes(u)) rawImages.push(u);
      }
    }

    const existingImgRecords = Array.isArray(record.productImages) ? record.productImages : [];
    const hasValidRecord = existingImgRecords.some(img => img && img.isValidForTryOn !== false);
    const missingImages =
      (rawImages.length === 0 && existingImgRecords.length === 0) ||
      (existingImgRecords.length > 0 && !hasValidRecord);

    const sku = String(record.sku || product.sku || '').trim();
    const skuMissing = !sku;

    const unresolvedConflicts = (record.conflicts || []).filter(c => !c.resolved);
    const hasConflicts = unresolvedConflicts.length > 0;
    const needsCategoryReview = Boolean(
      record.normalizedCategory?.needsReview &&
      !locked.has('normalizedCategory.subCategory') &&
      !record.adminApproved
    );

    const hasColor =
      Boolean(record.attributes?.color?.primary) ||
      (Array.isArray(record.attributes?.color?.catalogColors) && record.attributes.color.catalogColors.length > 0);
    const hasMaterial = Boolean(record.attributes?.material?.value);
    const missingData = skuMissing || !hasColor || !hasMaterial;

    const skuMismatchSource = (record.sourceRecords || []).some(
      s => s.productMatchingStatus === 'SKU_MISMATCH' || s.productMatchingStatus === 'COLOR_MISMATCH'
    );
    const hasVariantMismatch = (record.variantInformation?.variants || []).some(
      v => v.verificationStatus === 'COLOR_MISMATCH' || v.verificationStatus === 'SKU_CONFLICT'
    );
    const skuVariantMismatch = Boolean(skuMismatchSource || hasVariantMismatch || record.variantInformation?.skuMismatch);

    const staleDays = Number(record.staleAfterDays) || 30;
    const staleMs = staleDays * 24 * 60 * 60 * 1000;
    const verifiedSources = (record.sourceRecords || []).filter(
      s => s.sourceType !== 'kdxx_db' && s.verificationStatus === 'VERIFIED'
    );
    const lastVerifiedMs = record.lastVerifiedAt ? new Date(record.lastVerifiedAt).getTime() : 0;
    const staleSource = Boolean(
      (lastVerifiedMs > 0 && now - lastVerifiedMs > staleMs) ||
      verifiedSources.some(s => s.retrievalDate && now - new Date(s.retrievalDate).getTime() > staleMs)
    );

    // Verification status & confidence score
    let confidence = 0.25;
    if (!missingImages) confidence += 0.2;
    if (!skuMissing) confidence += 0.2;
    if (hasColor) confidence += 0.1;
    if (hasMaterial) confidence += 0.1;
    if (verifiedSources.length > 0) confidence += 0.15;
    if (record.adminApproved) confidence = Math.max(confidence, 0.92);
    if (hasConflicts) confidence = Math.min(confidence, 0.45);
    if (missingImages) confidence = Math.min(confidence, 0.35);

    confidence = Number(Math.max(0, Math.min(1, confidence)).toFixed(2));

    let verificationStatus = 'UNVERIFIED';
    if (hasConflicts || skuVariantMismatch) {
      verificationStatus = 'CONFLICT';
    } else if (needsCategoryReview) {
      verificationStatus = 'NEEDS_REVIEW';
    } else if (record.adminApproved || (verifiedSources.length > 0 && !skuMissing && !missingImages && !staleSource)) {
      verificationStatus = 'VERIFIED';
    } else if (staleSource) {
      verificationStatus = 'STALE';
    } else if (!missingImages && (hasColor || !skuMissing || verifiedSources.length > 0)) {
      verificationStatus = 'PARTIALLY_VERIFIED';
    }

    if (locked.has('verificationStatus') && record.verificationStatus === 'VERIFIED' && !hasConflicts) {
      verificationStatus = 'VERIFIED';
    }

    record.verificationStatus = verificationStatus;
    record.confidenceScore = confidence;
    if (!record.variantInformation) record.variantInformation = {};
    record.variantInformation.skuMissing = skuMissing;
    record.variantInformation.skuMismatch = skuVariantMismatch;

    record.flags = {
      missingData,
      unverified: verificationStatus !== 'VERIFIED',
      hasConflicts,
      needsReview: needsCategoryReview,
      missingImages,
      skuVariantMismatch,
      staleSource
    };

    if (!record.bestTryOnImageUrl) {
      record.bestTryOnImageUrl = this.imageService.selectBestTryOnImage(record.productImages) || rawImages[0] || '';
    }

    return record;
  }

  /**
   * Idempotently create or refresh KD-XX baseline intelligence for a Product without altering `Product` schema/data.
   */
  async ensureBaselineForProduct(productOrId, options = {}) {
    const product =
      typeof productOrId === 'object' && productOrId?._id
        ? productOrId
        : await Product.findById(productOrId);

    if (!product) {
      const err = new Error('Sản phẩm không tồn tại để khởi tạo Product Intelligence');
      err.code = 'PRODUCT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    let record = await ProductIntelligence.findOne({ product: product._id });
    const taxonomy = categoryTaxonomyService.mapProductCategory(product);
    const catalogColors = Array.isArray(product.colors) ? product.colors.filter(Boolean) : [];
    const catalogImages = [];
    if (product.image) catalogImages.push(product.image);
    if (Array.isArray(product.images)) {
      for (const u of product.images) {
        if (u && !catalogImages.includes(u)) catalogImages.push(u);
      }
    }

    const explicitMaterial = extractExplicitMaterialFromDescription(product.description);
    const builtVariants = buildVariantsFromProduct(product);

    if (!record) {
      const initialDoc = {
        product: product._id,
        sku: String(product.sku || '').trim(),
        brand: String(product.brand || 'AMIRI').trim(),
        productName: String(product.name || '').trim(),
        catalogCategory: String(product.category || '').trim(),
        normalizedCategory: {
          domain: taxonomy.domain,
          subCategory: taxonomy.subCategory,
          filterGroup: taxonomy.filterGroup,
          tryOnSupportLevel: taxonomy.tryOnSupportLevel,
          supportReason: taxonomy.supportReason,
          mappingSource: taxonomy.mappingSource,
          needsReview: Boolean(taxonomy.needsReview),
          conflictReason: taxonomy.conflictReason || ''
        },
        attributes: {
          color: {
            primary: catalogColors[0] || '',
            secondary: catalogColors[1] || '',
            catalogColors,
            confirmed: catalogColors.length === 1
          },
          material: {
            value: explicitMaterial,
            source: explicitMaterial ? 'KDXX_DESCRIPTION' : 'UNVERIFIED',
            confirmed: false
          },
          pattern: { value: '', detectedFromImage: false, confirmed: false },
          shape: { value: '', aspectRatio: 0, silhouette: '', confirmed: false },
          fit: { value: '', confirmed: false },
          visualDetails: [],
          logoPosition: { value: '', confirmed: false }
        },
        productImages: catalogImages.map((url, idx) => ({
          url,
          role: idx === 0 ? 'primary' : 'alternate',
          sourceType: 'kdxx_db',
          domain: getHostnameSafe(url),
          isVerified: false,
          isValidForTryOn: true
        })),
        bestTryOnImageUrl: catalogImages[0] || '',
        variantInformation: {
          hasMultipleVariants: builtVariants.length > 1 || catalogColors.length > 1,
          skuMissing: !String(product.sku || '').trim(),
          skuMismatch: false,
          variants: builtVariants
        },
        sourceRecords: [
          {
            sourceId: `kdxx-db-${product._id}`,
            sourceUrl: '',
            sourceType: 'kdxx_db',
            domain: 'kdxx.internal',
            retrievalDate: new Date(),
            productMatchingStatus: product.sku ? 'EXACT_SKU_MATCH' : 'NAME_ONLY_UNVERIFIED',
            skuMatch: Boolean(product.sku),
            variantMatch: true,
            verificationStatus: product.sku ? 'VERIFIED' : 'UNVERIFIED',
            trustScore: 0.75,
            extractedAttributes: {
              sku: String(product.sku || '').trim(),
              brand: String(product.brand || '').trim(),
              productName: String(product.name || '').trim(),
              color: catalogColors.join(', '),
              material: explicitMaterial,
              images: catalogImages,
              sizes: Array.isArray(product.sizes) ? product.sizes : []
            }
          }
        ],
        conflicts: [],
        adminLockedFields: [],
        adminApproved: false,
        auditLogs: [
          {
            action: 'BASELINE_INITIALIZED',
            actorRole: options.actorRole || 'system',
            summary: 'Khởi tạo hồ sơ Product Intelligence từ catalog KD-XX hiện có',
            timestamp: new Date()
          }
        ]
      };
      this.recomputeGovernanceState(initialDoc, product);
      record = await ProductIntelligence.create(initialDoc);
      return record;
    } else {
      // Refresh non-locked baseline fields cleanly
      if (!this.isFieldLocked(record, 'brand')) {
        record.brand = String(product.brand || record.brand || 'AMIRI').trim();
      }
      if (!this.isFieldLocked(record, 'productName')) {
        record.productName = String(product.name || record.productName || '').trim();
      }
      if (!this.isFieldLocked(record, 'sku') && product.sku && !record.sku) {
        record.sku = String(product.sku).trim();
      }
      if (!this.isFieldLocked(record, 'normalizedCategory.subCategory')) {
        record.catalogCategory = String(product.category || '').trim();
        record.normalizedCategory = {
          domain: taxonomy.domain,
          subCategory: taxonomy.subCategory,
          filterGroup: taxonomy.filterGroup,
          tryOnSupportLevel: taxonomy.tryOnSupportLevel,
          supportReason: taxonomy.supportReason,
          mappingSource: taxonomy.mappingSource,
          needsReview: Boolean(taxonomy.needsReview),
          conflictReason: taxonomy.conflictReason || ''
        };
      }
      if (!this.isFieldLocked(record, 'attributes.color') && catalogColors.length > 0 && !record.attributes?.color?.primary) {
        record.attributes.color.primary = catalogColors[0];
        record.attributes.color.catalogColors = catalogColors;
      }
      if (!this.isFieldLocked(record, 'attributes.material') && explicitMaterial && !record.attributes?.material?.value) {
        record.attributes.material = {
          value: explicitMaterial,
          source: 'KDXX_DESCRIPTION',
          confirmed: false
        };
      }
      if (!this.isFieldLocked(record, 'bestTryOnImageUrl') && (!record.productImages || record.productImages.length === 0) && catalogImages.length > 0) {
        record.productImages = catalogImages.map((url, idx) => ({
          url,
          role: idx === 0 ? 'primary' : 'alternate',
          sourceType: 'kdxx_db',
          domain: getHostnameSafe(url),
          isVerified: false,
          isValidForTryOn: true
        }));
        record.bestTryOnImageUrl = catalogImages[0];
      }
    }

    this.recomputeGovernanceState(record, product);
    await record.save();
    return record;
  }

  /**
   * Fetch one allowlisted official brand or trusted retailer source URL, validate SKU/color match,
   * detect conflicts, and update unverified/non-locked metadata safely.
   */
  async ingestExternalSource(productId, sourceUrl, options = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      const err = new Error('Không tìm thấy sản phẩm trong catalog');
      err.code = 'PRODUCT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const record = await this.ensureBaselineForProduct(product);
    let fetched = null;

    try {
      fetched = await this.sourceService.fetchExternalSource(sourceUrl, options);
    } catch (fetchErr) {
      const failureStatus = fetchErr.code === 'SOURCE_ACCESS_RESTRICTED' ? 'BLOCKED' : 'FETCH_FAILED';
      record.sourceRecords.push({
        sourceId: `ext-err-${Date.now()}`,
        sourceUrl: String(sourceUrl || ''),
        sourceType: options.sourceType || 'trusted_retailer',
        domain: getHostnameSafe(sourceUrl),
        retrievalDate: new Date(),
        productMatchingStatus: 'NOT_MATCHED',
        skuMatch: false,
        variantMatch: false,
        verificationStatus: failureStatus,
        trustScore: 0,
        failureReason: `${fetchErr.code || 'FETCH_ERROR'}: ${fetchErr.message}`
      });
      record.auditLogs.push({
        action: 'SOURCE_FETCH_FAILED',
        actorUser: options.actorUserId || null,
        actorRole: options.actorRole || 'system',
        summary: `Không thể truy xuất nguồn: ${fetchErr.code || fetchErr.message}`,
        sourceUrl: String(sourceUrl || ''),
        timestamp: new Date()
      });
      this.recomputeGovernanceState(record, product);
      await record.save();
      throw fetchErr;
    }

    // Match against effective product (preferring admin-verified sku on record if present)
    const effectiveProduct = {
      ...(typeof product.toObject === 'function' ? product.toObject() : product),
      sku: record.sku || product.sku || ''
    };
    const matchResult = this.sourceService.matchSourceAgainstProduct(
      effectiveProduct,
      fetched.extractedAttributes,
      options
    );

    const newSourceRecord = {
      sourceId: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sourceUrl: fetched.sourceUrl,
      sourceType: fetched.sourceType,
      domain: fetched.domain,
      retrievalDate: fetched.retrievalDate || new Date(),
      staleAfter: new Date(Date.now() + (record.staleAfterDays || 30) * 24 * 60 * 60 * 1000),
      productMatchingStatus: matchResult.productMatchingStatus,
      skuMatch: matchResult.skuMatch,
      variantMatch: matchResult.variantMatch,
      verificationStatus: matchResult.verificationStatus,
      trustScore: fetched.trustScore,
      extractedAttributes: fetched.extractedAttributes,
      failureReason: matchResult.verificationStatus === 'VERIFIED' ? '' : matchResult.reason
    };

    // Replace earlier record from the exact same URL if re-synced (unless marked UNTRUSTED)
    const existingIdx = record.sourceRecords.findIndex(
      s => s.sourceUrl === fetched.sourceUrl && s.verificationStatus !== 'UNTRUSTED'
    );
    if (existingIdx >= 0) {
      record.sourceRecords[existingIdx] = newSourceRecord;
    } else {
      record.sourceRecords.push(newSourceRecord);
    }

    // Detect conflicts across KD-XX + active external sources
    const detectedConflicts = this.sourceService.detectSourceConflicts(
      {
        sku: effectiveProduct.sku,
        colors: effectiveProduct.colors || (record.attributes?.color?.primary ? [record.attributes.color.primary] : []),
        material: record.attributes?.material?.value || '',
        brand: effectiveProduct.brand
      },
      record.sourceRecords
    );

    if (detectedConflicts.length > 0) {
      record.conflicts = detectedConflicts;
    }

    // Strictly ONLY apply non-conflicting attributes from VERIFIED EXACT_SKU_MATCH sources onto NON-LOCKED fields!
    const noFieldConflict = !detectedConflicts.some(c => !c.resolved);
    if (matchResult.verificationStatus === 'VERIFIED' && noFieldConflict) {
      const ext = fetched.extractedAttributes;
      if (!this.isFieldLocked(record, 'attributes.material') && ext.material) {
        record.attributes.material = {
          value: ext.material,
          source: fetched.sourceType === 'official_brand' ? 'BRAND_OFFICIAL' : 'TRUSTED_RETAILER',
          confirmed: true
        };
      }
      if (!this.isFieldLocked(record, 'attributes.color') && ext.color) {
        record.attributes.color.primary = ext.color;
        record.attributes.color.confirmed = true;
      }
      if (!this.isFieldLocked(record, 'attributes.fit') && ext.fit) {
        record.attributes.fit = { value: ext.fit, confirmed: true };
      }
      if (!this.isFieldLocked(record, 'attributes.pattern') && ext.pattern) {
        record.attributes.pattern = { value: ext.pattern, detectedFromImage: false, confirmed: true };
      }
      if (!this.isFieldLocked(record, 'attributes.logoPosition') && ext.logoPosition) {
        record.attributes.logoPosition = { value: ext.logoPosition, confirmed: true };
      }
      if (Array.isArray(ext.visualDetails) && ext.visualDetails.length > 0 && !this.isFieldLocked(record, 'attributes.visualDetails')) {
        const merged = Array.from(new Set([...(record.attributes.visualDetails || []), ...ext.visualDetails]));
        record.attributes.visualDetails = merged;
      }
      if (Array.isArray(ext.images) && ext.images.length > 0) {
        for (const imgUrl of ext.images) {
          if (!record.productImages.some(r => r.url === imgUrl)) {
            record.productImages.push({
              url: imgUrl,
              role: fetched.sourceType === 'official_brand' ? 'official' : 'alternate',
              sourceType: fetched.sourceType,
              domain: fetched.domain,
              isVerified: true,
              isValidForTryOn: true
            });
          }
        }
        if (!this.isFieldLocked(record, 'bestTryOnImageUrl')) {
          record.bestTryOnImageUrl = this.imageService.selectBestTryOnImage(record.productImages) || record.bestTryOnImageUrl;
        }
      }
      record.lastVerifiedAt = new Date();
    }

    record.auditLogs.push({
      action: 'SOURCE_INGESTED',
      actorUser: options.actorUserId || null,
      actorRole: options.actorRole || 'system',
      summary: `${fetched.sourceType} (${fetched.domain}) -> ${matchResult.productMatchingStatus} [${matchResult.verificationStatus}]`,
      sourceUrl: fetched.sourceUrl,
      timestamp: new Date()
    });

    this.recomputeGovernanceState(record, product);
    await record.save();
    return { record, matchResult, sourceRecord: newSourceRecord };
  }

  /**
   * Inspect product images safely via SSRF fetcher & RGB pixel extractor without guessing material or logos.
   */
  async analyzeProductImages(productId, options = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      const err = new Error('Không tìm thấy sản phẩm trong catalog');
      err.code = 'PRODUCT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const record = await this.ensureBaselineForProduct(product);
    const urlsToInspect = options.imageUrl
      ? [options.imageUrl]
      : record.productImages.map(i => i.url).filter(Boolean);

    const inspected = [];
    for (const url of urlsToInspect) {
      const result = await this.imageService.inspectProductImageUrl(
        url,
        { subCategory: record.normalizedCategory?.subCategory },
        options
      );
      inspected.push(result);

      const idx = record.productImages.findIndex(r => r.url === url);
      const imageEntry = {
        url,
        role: idx >= 0 ? record.productImages[idx].role : 'primary',
        sourceType: idx >= 0 ? record.productImages[idx].sourceType : 'kdxx_db',
        domain: result.domain || (idx >= 0 ? record.productImages[idx].domain : ''),
        isVerified: idx >= 0 ? record.productImages[idx].isVerified : false,
        isValidForTryOn: result.isValidForTryOn,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        width: result.width,
        height: result.height,
        aspectRatio: result.aspectRatio,
        checkedAt: result.checkedAt,
        lastError: result.lastError,
        visualExtract: result.visualExtract || undefined
      };

      if (idx >= 0) {
        record.productImages[idx] = imageEntry;
      } else {
        record.productImages.push(imageEntry);
      }
    }

    // Populate pixel visual hints ONLY on unlocked & unconfirmed fields (NEVER guess material composition!)
    const bestValid = inspected.find(i => i.isValidForTryOn && i.visualExtract);
    if (bestValid) {
      const vx = bestValid.visualExtract;
      if (!this.isFieldLocked(record, 'attributes.color') && !record.attributes.color.confirmed && vx.dominantColorName) {
        record.attributes.color.primary = record.attributes.color.primary || vx.dominantColorName;
        record.attributes.color.secondary = record.attributes.color.secondary || vx.secondaryColorName;
      }
      if (!this.isFieldLocked(record, 'attributes.pattern') && !record.attributes.pattern.confirmed && vx.patternHint) {
        record.attributes.pattern = { value: vx.patternHint, detectedFromImage: true, confirmed: false };
      }
      if (!this.isFieldLocked(record, 'attributes.shape') && !record.attributes.shape.confirmed && vx.shapeHint) {
        record.attributes.shape = {
          value: vx.shapeHint,
          aspectRatio: vx.aspectRatio,
          silhouette: vx.shapeHint,
          confirmed: false
        };
      }
    }

    if (!this.isFieldLocked(record, 'bestTryOnImageUrl')) {
      record.bestTryOnImageUrl = this.imageService.selectBestTryOnImage(record.productImages) || '';
    }

    record.auditLogs.push({
      action: 'IMAGE_INTELLIGENCE_ANALYZED',
      actorUser: options.actorUserId || null,
      actorRole: options.actorRole || 'system',
      summary: `Kiểm tra ${inspected.length} ảnh sản phẩm (${inspected.filter(i => i.isValidForTryOn).length} hợp lệ)`,
      timestamp: new Date()
    });

    this.recomputeGovernanceState(record, product);
    await record.save();
    return { record, inspected };
  }

  /**
   * Admin governance actions: approve, reject, mark_untrusted source, update_attributes (locks against AI overwrite).
   */
  async adminVerifyOrUpdate(productId, adminUserId, payload = {}) {
    const { action, reason = '', attributes = {}, sku, subCategory, sourceUrl, bestTryOnImageUrl } = payload;
    const product = await Product.findById(productId);
    if (!product) {
      const err = new Error('Không tìm thấy sản phẩm trong catalog');
      err.code = 'PRODUCT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const record = await this.ensureBaselineForProduct(product);
    const lockedSet = new Set(record.adminLockedFields || []);

    if (action === 'mark_untrusted' && sourceUrl) {
      const target = record.sourceRecords.find(s => s.sourceUrl === sourceUrl);
      if (!target) {
        const err = new Error('Không tìm thấy nguồn dữ liệu cần đánh dấu');
        err.code = 'SOURCE_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      target.verificationStatus = 'UNTRUSTED';
      target.trustScore = 0;
      target.failureReason = reason || 'Admin đánh dấu nguồn không đáng tin cậy';
      record.conflicts = this.sourceService.detectSourceConflicts(
        { sku: record.sku, colors: record.attributes?.color?.catalogColors || [], material: record.attributes?.material?.value || '', brand: record.brand },
        record.sourceRecords
      );
      record.auditLogs.push({
        action: 'ADMIN_MARKED_SOURCE_UNTRUSTED',
        actorUser: adminUserId,
        actorRole: 'admin',
        summary: reason || `Đánh dấu nguồn không đáng tin cậy: ${sourceUrl}`,
        sourceUrl,
        timestamp: new Date()
      });
    } else if (action === 'reject') {
      record.adminApproved = false;
      record.verificationStatus = 'UNVERIFIED';
      lockedSet.delete('verificationStatus');
      record.auditLogs.push({
        action: 'ADMIN_REJECTED',
        actorUser: adminUserId,
        actorRole: 'admin',
        summary: reason || 'Admin từ chối xác nhận thông tin sản phẩm',
        timestamp: new Date()
      });
    } else if (action === 'update_attributes' || action === 'approve') {
      if (sku !== undefined) {
        record.sku = String(sku).trim();
        lockedSet.add('sku');
        if (product.sku !== record.sku) {
          product.sku = record.sku;
        }
      }

      if (subCategory) {
        const taxonomy = categoryTaxonomyService.mapProductCategory(product, subCategory);
        record.normalizedCategory = {
          domain: taxonomy.domain,
          subCategory: taxonomy.subCategory,
          filterGroup: taxonomy.filterGroup,
          tryOnSupportLevel: taxonomy.tryOnSupportLevel,
          supportReason: taxonomy.supportReason,
          mappingSource: 'ADMIN',
          needsReview: false,
          conflictReason: ''
        };
        lockedSet.add('normalizedCategory.subCategory');
        product.subCategory = taxonomy.subCategory;
      }

      if (attributes && typeof attributes === 'object') {
        if (attributes.color !== undefined) {
          const primaryCol = typeof attributes.color === 'object' ? attributes.color.primary : attributes.color;
          const secCol = typeof attributes.color === 'object' ? attributes.color.secondary : record.attributes.color.secondary;
          record.attributes.color.primary = String(primaryCol || '').trim();
          record.attributes.color.secondary = String(secCol || '').trim();
          record.attributes.color.confirmed = true;
          lockedSet.add('attributes.color');
        }
        if (attributes.material !== undefined) {
          record.attributes.material = {
            value: String(attributes.material || '').trim(),
            source: 'ADMIN',
            confirmed: Boolean(String(attributes.material || '').trim())
          };
          lockedSet.add('attributes.material');
        }
        if (attributes.pattern !== undefined) {
          record.attributes.pattern = {
            value: String(attributes.pattern || '').trim(),
            detectedFromImage: false,
            confirmed: true
          };
          lockedSet.add('attributes.pattern');
        }
        if (attributes.shape !== undefined) {
          record.attributes.shape = {
            ...record.attributes.shape,
            value: String(attributes.shape || '').trim(),
            confirmed: true
          };
          lockedSet.add('attributes.shape');
        }
        if (attributes.fit !== undefined) {
          record.attributes.fit = {
            value: String(attributes.fit || '').trim(),
            confirmed: true
          };
          lockedSet.add('attributes.fit');
        }
        if (attributes.logoPosition !== undefined) {
          record.attributes.logoPosition = {
            value: String(attributes.logoPosition || '').trim(),
            confirmed: true
          };
          lockedSet.add('attributes.logoPosition');
        }
        if (Array.isArray(attributes.visualDetails)) {
          record.attributes.visualDetails = attributes.visualDetails.map(v => String(v).trim()).filter(Boolean);
          lockedSet.add('attributes.visualDetails');
        }
      }

      if (bestTryOnImageUrl) {
        record.bestTryOnImageUrl = String(bestTryOnImageUrl).trim();
        lockedSet.add('bestTryOnImageUrl');
      }

      if (action === 'approve') {
        record.adminApproved = true;
        record.approvedBy = adminUserId;
        record.lastVerifiedAt = new Date();
        record.conflicts = (record.conflicts || []).map(c => ({ ...c, resolved: true }));
        if (record.normalizedCategory) {
          record.normalizedCategory.needsReview = false;
          record.normalizedCategory.conflictReason = '';
        }
        lockedSet.add('verificationStatus');
      }

      if (sku !== undefined || subCategory) {
        await product.save();
      }
      record.auditLogs.push({
        action: action === 'approve' ? 'ADMIN_APPROVED' : 'ADMIN_UPDATED_ATTRIBUTES',
        actorUser: adminUserId,
        actorRole: 'admin',
        summary: reason || (action === 'approve' ? 'Admin xác nhận hồ sơ Product Intelligence' : 'Admin cập nhật & khóa thuộc tính sản phẩm'),
        changes: { sku, subCategory, attributes, bestTryOnImageUrl },
        timestamp: new Date()
      });
    } else {
      const err = new Error(`Hành động quản trị "${action}" không hợp lệ`);
      err.code = 'INVALID_ADMIN_ACTION';
      err.statusCode = 400;
      throw err;
    }

    record.adminLockedFields = Array.from(lockedSet);
    this.recomputeGovernanceState(record, product);
    await record.save();
    return record;
  }

  async syncAllCatalogProducts(options = {}) {
    const products = await Product.find({});
    const records = [];
    for (const p of products) {
      records.push(await this.ensureBaselineForProduct(p, options));
    }
    return records;
  }

  async listForAdmin({ filter = 'all', ensureSynced = true } = {}) {
    if (ensureSynced) {
      const productCount = await Product.countDocuments();
      const intelCount = await ProductIntelligence.countDocuments();
      if (intelCount < productCount) {
        await this.syncAllCatalogProducts({ actorRole: 'system_auto_sync' });
      }
    }

    const all = await ProductIntelligence.find({})
      .populate('product', 'name price category brand image images colors sizes sku')
      .sort({ updatedAt: -1 });

    const counts = {
      total: all.length,
      missing_data: all.filter(r => r.flags?.missingData).length,
      unverified: all.filter(r => r.flags?.unverified).length,
      needs_review: all.filter(r => r.flags?.needsReview || r.verificationStatus === 'NEEDS_REVIEW').length,
      conflict: all.filter(r => r.flags?.hasConflicts).length,
      missing_images: all.filter(r => r.flags?.missingImages).length,
      sku_mismatch: all.filter(r => r.flags?.skuVariantMismatch).length,
      stale: all.filter(r => r.flags?.staleSource).length,
      verified: all.filter(r => r.verificationStatus === 'VERIFIED').length
    };

    const filterMap = {
      missing_data: r => r.flags?.missingData,
      unverified: r => r.flags?.unverified,
      needs_review: r => r.flags?.needsReview || r.verificationStatus === 'NEEDS_REVIEW',
      conflict: r => r.flags?.hasConflicts,
      missing_images: r => r.flags?.missingImages,
      sku_mismatch: r => r.flags?.skuVariantMismatch,
      stale: r => r.flags?.staleSource,
      verified: r => r.verificationStatus === 'VERIFIED',
      all: () => true
    };

    const predicate = filterMap[filter] || filterMap.all;
    return {
      counts,
      items: all.filter(predicate)
    };
  }
}

module.exports = new ProductIntelligenceService();
module.exports.ProductIntelligenceService = ProductIntelligenceService;
module.exports.extractExplicitMaterialFromDescription = extractExplicitMaterialFromDescription;
