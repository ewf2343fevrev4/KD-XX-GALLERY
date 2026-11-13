const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, admin } = require('../middleware/authMiddleware');
const tryOnCreditService = require('../services/tryOnCreditService');
const tryOnStorageService = require('../services/tryOnStorageService');
const photoQualityService = require('../services/photoQualityService');
const tryOnQueueService = require('../services/tryOnQueueService');
const virtualTryOnService = require('../services/virtualTryOnService');
const cleanupProvider = require('../services/cleanupProvider');
const categoryTaxonomyService = require('../services/categoryTaxonomyService');
const productIntelligenceService = require('../services/productIntelligenceService');
const aiProductContextService = require('../services/aiProductContextService');
const tryOnHistoryService = require('../services/tryOnHistoryService');
const tryOnProviderConfigService = require('../services/tryOnProviderConfigService');
const tryOnUsageStatsService = require('../services/tryOnUsageStatsService');
const fullOutfitBenchmarkGate = require('../services/fullOutfitBenchmarkGate');
const providerRegistry = require('../services/providers/TryOnProviderRegistry');
const Product = require('../models/Product');
const ProductIntelligence = require('../models/ProductIntelligence');
const TryOnJob = require('../models/TryOnJob');
const TryOnCredit = require('../models/TryOnCredit');
const TryOnCreditLot = require('../models/TryOnCreditLot');
const TryOnCreditLedger = require('../models/TryOnCreditLedger');
const TryOnImageAsset = require('../models/TryOnImageAsset');

// In-memory upload buffer (max 10MB per specification)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ==========================================
// 1. PUBLIC STREAMING FOR SIGNED TOKENS
// ==========================================

/**
 * @route GET /api/tryon/images/:token
 * @desc Stream private image using signed temporary HMAC token
 * @access Public with valid cryptographic signed token
 */
router.get('/images/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const payload = tryOnStorageService.verifySignedToken(token);

    if (!payload) {
      return res.status(403).json({
        success: false,
        message: 'Liên kết ảnh đã hết hạn hoặc chữ ký bảo mật không hợp lệ'
      });
    }

    const { buffer, mimeType } = await tryOnStorageService.getImageBuffer(
      payload.assetId,
      payload.userId,
      false // Strictly verify asset ownership alongside HMAC signature, deletion & expiry
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// 2. AUTHENTICATED CUSTOMER TRY-ON ROUTES
// ==========================================

/**
 * @route GET /api/tryon/account
 * @desc Get customer try-on credit balance, active lots, and membership
 * @access Private (Customer)
 */
router.get('/account', protect, async (req, res) => {
  try {
    await tryOnCreditService.checkAndSyncMembership(req.user._id);
    const credit = await tryOnCreditService.getOrCreateAccount(req.user._id);
    const consumableLots = await tryOnCreditService.getConsumableLots(req.user._id);
    const isAdmin = req.user.role === 'admin' || credit.membershipType === 'admin';
    const categoryMatrix = await virtualTryOnService.getPublicCategoryMatrix().catch(() => []);
    let fullOutfitBenchmark = null;
    if (req.user.role === 'admin') {
      const benchEval = await fullOutfitBenchmarkGate
        .evaluateAdminAccess({ userId: req.user._id, userRole: req.user.role })
        .catch(() => ({ allowed: false }));
      if (benchEval?.allowed && benchEval.configSnapshot) {
        fullOutfitBenchmark = benchEval.configSnapshot;
      }
    }

    return res.json({
      success: true,
      data: {
        totalCredits: isAdmin ? 999999 : credit.totalAvailableCredits,
        isUnlimited: isAdmin,
        membershipType: isAdmin ? 'admin' : credit.membershipType,
        membershipExpiresAt: isAdmin ? null : credit.membershipExpiresAt,
        freeClaimed: credit.freeCreditsClaimed,
        categoryMatrix,
        fullOutfitBenchmark,
        lots: consumableLots.map(l => ({
          id: l._id,
          type: l.lotType,
          remaining: l.remainingAmount - l.reservedAmount,
          expiresAt: l.expiresAt
        }))
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route POST /api/tryon/upload-photo
 * @desc Upload full body customer photo with magic byte verification & quality analysis
 * @access Private (Customer)
 */
router.post('/upload-photo', protect, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn tệp hình ảnh để tải lên'
      });
    }

    // 1. Magic bytes & integrity inspection BEFORE charging rate limit quota
    const magicCheck = photoQualityService.validateMagicBytes(req.file.buffer, req.file.mimetype);
    if (!magicCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: magicCheck.error
      });
    }

    // 2. Rate limit: 10 valid uploads in 10 minutes (bypassed for admin owner)
    const rateCheck = tryOnQueueService.checkRateLimit('uploads', req.user._id, 10, 10, req.user.role === 'admin');
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, message: rateCheck.message });
    }

    // 2. Extract dimensions
    const { width, height } = photoQualityService.extractDimensions(req.file.buffer, magicCheck.detectedMime);

    // 3. Photo Quality Analyzer (8 luxury criteria)
    const qualityAnalysis = await photoQualityService.analyzePhotoQuality(req.file.buffer, magicCheck.detectedMime);

    // 4. Save to private storage
    const asset = await tryOnStorageService.saveImage({
      userId: req.user._id,
      buffer: req.file.buffer,
      mimeType: magicCheck.detectedMime,
      type: 'user_upload',
      originalFilename: req.file.originalname,
      width,
      height,
      qualityAnalysis
    });

    // 5. Generate signed preview token (30 mins)
    const signedToken = tryOnStorageService.generateSignedToken(asset._id, req.user._id, 1800);
    const previewUrl = `/api/tryon/images/${signedToken}`;

    return res.json({
      success: true,
      data: {
        assetId: asset._id,
        previewUrl,
        signedToken,
        width,
        height,
        fileSizeBytes: req.file.buffer.length,
        qualityAnalysis
      }
    });
  } catch (error) {
    console.error('Upload photo error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/capabilities
 * @desc Public read-only Category Support Matrix & non-secret AI capability summary
 * @access Public
 */
router.get('/capabilities', async (req, res) => {
  try {
    const [categoryMatrix, fullOutfitRouting] = await Promise.all([
      virtualTryOnService.getPublicCategoryMatrix(),
      typeof virtualTryOnService.resolveFullOutfitRouting === 'function'
        ? virtualTryOnService.resolveFullOutfitRouting()
        : Promise.resolve({ support: null })
    ]);
    return res.json({
      success: true,
      data: {
        categoryMatrix,
        fullOutfitCapability: fullOutfitRouting?.support || null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/catalog
 * @desc FIT LAB Try-On enriched product catalog (non-breaking wrapper over KD-XX Product DB)
 * @access Public
 */
router.get('/catalog', async (req, res) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 });
    const intelDocs = await ProductIntelligence.find({});
    const intelMap = new Map(intelDocs.map(doc => [String(doc.product), doc]));
    const configsByProviderId = await tryOnProviderConfigService.loadConfigsMap();
    const categoryMatrix = providerRegistry.buildCategoryMatrix(new Date(), configsByProviderId);

    const enriched = products.map((p) => {
      const intel = intelMap.get(String(p._id)) || null;
      const computedTax = categoryTaxonomyService.mapProductCategory(p);
      const taxonomy = intel?.normalizedCategory?.subCategory && intel.normalizedCategory.subCategory !== 'unknown'
        ? intel.normalizedCategory
        : computedTax;

      const evalSupport = providerRegistry.evaluateCategorySupport({
        category: p.category,
        domain: taxonomy.domain,
        subCategory: taxonomy.subCategory,
        configsByProviderId
      });

      const resolvedAdapter = evalSupport.providerId
        ? providerRegistry.getProvider(evalSupport.providerId)
        : null;
      const caps = resolvedAdapter && typeof resolvedAdapter.getCapabilities === 'function'
        ? resolvedAdapter.getCapabilities()
        : null;

      const needsReview = Boolean(
        intel?.verificationStatus === 'NEEDS_REVIEW' ||
        intel?.flags?.needsReview ||
        taxonomy?.needsReview ||
        computedTax?.needsReview
      );
      const hasConflicts = Boolean(
        intel?.verificationStatus === 'CONFLICT' ||
        intel?.flags?.hasConflicts
      );

      let allowSubmit = Boolean(evalSupport.allowSubmit);
      let blockCode = evalSupport.blockCode || null;
      let reason = evalSupport.reason || '';

      if (hasConflicts) {
        allowSubmit = false;
        blockCode = 'PRODUCT_INTELLIGENCE_CONFLICT';
        reason = 'Hồ sơ sản phẩm đang có xung đột dữ liệu (CONFLICT), tạm khóa Try-On chờ Admin xử lý.';
      } else if (needsReview) {
        allowSubmit = false;
        blockCode = 'PRODUCT_NEEDS_REVIEW';
        reason = taxonomy?.conflictReason || computedTax?.conflictReason || 'Danh mục sản phẩm cần Admin rà soát (NEEDS_REVIEW) trước khi bật Try-On.';
      }

      const context = aiProductContextService.buildProductContext({
        product: p,
        intelligence: intel,
        providerCapabilities: caps
      });

      return {
        _id: p._id,
        name: p.name,
        description: p.description,
        price: p.price,
        image: p.image,
        images: p.images,
        category: p.category,
        subCategory: p.subCategory || taxonomy.subCategory,
        sku: intel?.sku || p.sku || '',
        brand: p.brand,
        tags: p.tags,
        colors: p.colors,
        sizes: p.sizes,
        variants: intel?.variantInformation?.variants?.length ? intel.variantInformation.variants : (p.variants || []),
        inStock: p.inStock,
        taxonomy: {
          domain: taxonomy.domain,
          subCategory: taxonomy.subCategory,
          filterGroup: taxonomy.filterGroup,
          tryOnSupportLevel: taxonomy.tryOnSupportLevel,
          supportReason: taxonomy.supportReason,
          needsReview,
          conflictReason: taxonomy?.conflictReason || computedTax?.conflictReason || ''
        },
        categorySupport: {
          categoryKey: evalSupport.categoryKey,
          status: evalSupport.status,
          allowSubmit,
          blockCode,
          providerId: evalSupport.providerId,
          providerName: evalSupport.providerName,
          modelId: evalSupport.modelId,
          reason,
          limitations: evalSupport.limitations || [],
          lifecycleStage: evalSupport.lifecycleStage,
          deprecationDate: evalSupport.deprecationDate,
          retirementDate: evalSupport.retirementDate,
          needsReview,
          hasConflicts
        },
        intelligence: {
          verificationStatus: context.sourceConfidence.verificationStatus,
          confidenceScore: context.sourceConfidence.confidenceScore,
          bestTryOnImageUrl: context.productImageReferences.primaryImageUrl,
          verifiedVisualAttributes: context.verifiedVisualAttributes,
          knownLimitations: context.knownLimitations,
          hasConflicts,
          needsReview,
          skuMissing: !context.sku
        }
      };
    });

    return res.json({
      success: true,
      count: enriched.length,
      categoryMatrix,
      data: enriched
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/products/:id/context
 * @desc Build and preview AI Product Context for a catalog product & optional variant
 * @access Public (read-only metadata)
 */
router.get('/products/:id/context', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }
    const intelligence = await productIntelligenceService.ensureBaselineForProduct(product);
    const routing = await virtualTryOnService.resolveCategoryRouting({
      category: product.category,
      domain: intelligence?.normalizedCategory?.domain,
      subCategory: intelligence?.normalizedCategory?.subCategory
    });
    const { color, size, sku } = req.query;
    const requestedVariant = (color || size || sku) ? { color, size, sku } : null;
    const activeProvider = routing.adapter || null;

    const context = aiProductContextService.buildProductContext({
      product,
      intelligence,
      selectedVariant: requestedVariant,
      providerCapabilities: activeProvider ? activeProvider.getCapabilities() : null
    });

    return res.json({
      success: true,
      data: context,
      categorySupport: routing.support,
      providerAdaptation: activeProvider && typeof activeProvider.adaptProductContext === 'function'
        ? activeProvider.adaptProductContext(context)
        : null
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route POST /api/tryon/generate
 * @desc Create and enqueue a virtual try-on job
 * @access Private (Customer)
 */
router.post('/generate', protect, async (req, res) => {
  try {
    const { personImageAssetId, productId, selectedVariant = null, idempotencyKey } = req.body;

    if (!personImageAssetId || !productId) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin ảnh người dùng (personImageAssetId) hoặc sản phẩm (productId)'
      });
    }

    const job = await tryOnQueueService.submitJob({
      userId: req.user._id,
      personImageAssetId,
      productId,
      selectedVariant,
      idempotencyKey,
      userRole: req.user.role
    });

    return res.json({
      success: true,
      message: 'Yêu cầu thử đồ AI đã được đưa vào hàng đợi xử lý',
      data: {
        jobId: job._id,
        mode: job.mode || 'SINGLE_ITEM',
        creditsCost: job.creditsCost || 1,
        status: job.status,
        productName: job.productName,
        productSnapshot: job.productSnapshot || null,
        queuedAt: job.timing.queuedAt
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
      code: error.code
    });
  }
});

/**
 * @route POST /api/tryon/full-outfit/generate
 * @desc Create and enqueue a 2-piece Full Outfit try-on job (Top/Outerwear + Bottom/Pants/Jeans/Skirt).
 *       Server rejects DRESS, FOOTWEAR, ACCESSORIES, ignores client creditsCost, and blocks unapproved intermediate assets.
 * @access Private (Customer)
 */
router.post('/full-outfit/generate', protect, async (req, res) => {
  try {
    const { personImageAssetId, items, idempotencyKey } = req.body || {};

    if (!personImageAssetId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FULL_OUTFIT_PAYLOAD',
        message: 'Thiếu ảnh người dùng (personImageAssetId) hoặc danh sách sản phẩm Full Outfit (items).'
      });
    }

    const job = await tryOnQueueService.submitFullOutfitJob({
      userId: req.user._id,
      personImageAssetId,
      items,
      idempotencyKey,
      userRole: req.user.role
    });

    return res.json({
      success: true,
      message: 'Yêu cầu thử đồ Full Outfit (2 bước) đã được đưa vào hàng đợi xử lý',
      data: {
        jobId: job._id,
        mode: job.mode,
        creditsCost: job.creditsCost,
        status: job.status,
        productName: job.productName,
        outfitItems: job.outfitItems || [],
        executionSteps: (job.executionSteps || []).map(s => ({
          stepIndex: s.stepIndex,
          slot: s.slot,
          productName: s.productName,
          status: s.status
        })),
        productSnapshot: job.productSnapshot || null,
        queuedAt: job.timing?.queuedAt
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
      code: error.code
    });
  }
});

/**
 * @route GET /api/tryon/jobs/:id
 * @desc Get real-time status and result preview URL of a try-on job
 * @access Private (Customer)
 */
router.get('/jobs/:id', protect, async (req, res) => {
  try {
    const job = await TryOnJob.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('product', 'name price image brand');

    if (!job) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiên thử đồ' });
    }

    let resultPreviewUrl = null;
    if (job.status === 'COMPLETED' && job.resultImageAsset) {
      resultPreviewUrl = await tryOnStorageService.issueSignedUrlIfValid(
        job.resultImageAsset,
        req.user._id,
        1800
      );
    }

    const originalPreviewUrl = job.personImageAsset
      ? await tryOnStorageService.issueSignedUrlIfValid(job.personImageAsset, req.user._id, 1800)
      : null;

    return res.json({
      success: true,
      data: {
        jobId: job._id,
        mode: job.mode || 'SINGLE_ITEM',
        creditsCost: job.creditsCost || 1,
        status: job.status,
        productName: job.productSnapshot?.productName || job.productName,
        product: job.product,
        productSnapshot: job.productSnapshot || null,
        outfitItems: job.outfitItems || [],
        executionSteps: (job.executionSteps || []).map(s => ({
          stepIndex: s.stepIndex,
          slot: s.slot,
          product: s.product,
          productName: s.productName,
          providerId: s.providerId,
          status: s.status,
          errorCode: s.errorCode || '',
          errorMessage: s.errorMessage || '',
          completedAt: s.completedAt || null
        })),
        resultQualityCheck: job.resultQualityCheck || null,
        timing: job.timing,
        errorMessage: job.errorMessage,
        errorCode: job.errorCode,
        provider: job.provider,
        providerRequestId: job.providerRequestId,
        reconciliation: job.reconciliation,
        personImageAsset: job.personImageAsset || null,
        resultImageAsset: job.resultImageAsset || null,
        originalPreviewUrl,
        resultPreviewUrl
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/jobs
 * @desc Get customer's try-on job history (shared with /api/tryon/history)
 * @access Private (Customer)
 */
router.get('/jobs', protect, async (req, res) => {
  try {
    const result = await tryOnHistoryService.listUserHistory(req.user._id, req.query);
    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/history
 * @desc Paginated, filterable Try-On history for authenticated user (strict ownership + snapshot priority)
 * @access Private (Customer)
 */
router.get('/history', protect, async (req, res) => {
  try {
    const result = await tryOnHistoryService.listUserHistory(req.user._id, req.query);
    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/tryon/history
 * @desc Permanently clear all Try-On history entries & private images owned by authenticated user
 * @access Private (Customer)
 */
router.delete('/history', protect, async (req, res) => {
  try {
    const summary = await tryOnHistoryService.deleteAllUserHistory(req.user._id);
    return res.json({
      success: true,
      message: 'Đã xóa toàn bộ lịch sử và hình ảnh thử đồ của bạn khỏi máy chủ',
      data: summary
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route GET /api/tryon/history/:id
 * @desc Get single Try-On history record with immutable productSnapshot and non-expired signed URLs
 * @access Private (Owner only)
 */
router.get('/history/:id', protect, async (req, res) => {
  try {
    const item = await tryOnHistoryService.getHistoryItem(req.params.id, req.user._id);
    return res.json({ success: true, data: item });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route GET /api/tryon/history/:id/original-image
 * @desc Stream authenticated owner's private original uploaded image (enforces 72h expiry & deletion)
 * @access Private (Owner only)
 */
router.get('/history/:id/original-image', protect, async (req, res) => {
  try {
    const { buffer, mimeType } = await tryOnHistoryService.getPrivateHistoryImageBuffer(
      req.params.id,
      req.user._id,
      'original'
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route GET /api/tryon/history/:id/result-image
 * @desc Stream authenticated owner's private AI result image (enforces 72h expiry & deletion)
 * @access Private (Owner only)
 */
router.get('/history/:id/result-image', protect, async (req, res) => {
  try {
    const { buffer, mimeType } = await tryOnHistoryService.getPrivateHistoryImageBuffer(
      req.params.id,
      req.user._id,
      'result'
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/tryon/history/:id/original-image
 * @desc Early deletion of original person photo for a history item
 * @access Private (Owner only)
 */
router.delete('/history/:id/original-image', protect, async (req, res) => {
  try {
    const result = await tryOnHistoryService.deleteHistoryImage(req.params.id, req.user._id, 'original');
    return res.json({
      success: true,
      message: result.deleted ? 'Đã xóa ảnh gốc vĩnh viễn khỏi bộ nhớ riêng tư' : 'Ảnh gốc không còn tồn tại',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/tryon/history/:id/result-image
 * @desc Early deletion of AI result photo for a history item
 * @access Private (Owner only)
 */
router.delete('/history/:id/result-image', protect, async (req, res) => {
  try {
    const result = await tryOnHistoryService.deleteHistoryImage(req.params.id, req.user._id, 'result');
    return res.json({
      success: true,
      message: result.deleted ? 'Đã xóa ảnh kết quả vĩnh viễn khỏi bộ nhớ riêng tư' : 'Ảnh kết quả không còn tồn tại',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/tryon/history/:id
 * @desc Delete a single history record and its underlying private assets
 * @access Private (Owner only)
 */
router.delete('/history/:id', protect, async (req, res) => {
  try {
    const result = await tryOnHistoryService.deleteHistoryItem(req.params.id, req.user._id, {
      deleteOriginalIfUnused: req.query.deleteOriginal !== 'false'
    });
    return res.json({
      success: true,
      message: 'Đã xóa mục lịch sử thử đồ',
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route POST /api/tryon/jobs/:id/cancel
 * @desc Cancel a pending/queued job and trigger refund
 * @access Private (Customer)
 */
router.post('/jobs/:id/cancel', protect, async (req, res) => {
  try {
    const job = await tryOnQueueService.cancelJob(req.params.id, req.user._id);
    return res.json({
      success: true,
      message: 'Đã hủy phiên thử đồ thành công và hoàn trả lượt thử',
      data: { status: job.status }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/tryon/assets/:id
 * @desc Early deletion of customer uploaded or generated private photo
 * @access Private (Customer)
 */
router.delete('/assets/:id', protect, async (req, res) => {
  try {
    const deleted = await tryOnStorageService.deleteAsset(req.params.id, req.user._id, false);
    return res.json({
      success: true,
      message: deleted ? 'Đã xóa ảnh vĩnh viễn khỏi bộ nhớ máy chủ' : 'Ảnh không tồn tại'
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route POST /api/tryon/cleanup
 * @desc Request AI Cleanup (Separate provider interface)
 * @access Private (Customer)
 */
router.post('/cleanup', protect, async (req, res) => {
  try {
    const isAvailable = cleanupProvider.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({
        success: false,
        status: 'PROVIDER_NOT_CONFIGURED',
        message: 'Dịch vụ AI Cleanup hiện đang được cấu hình nhà cung cấp và chưa khả dụng. Để đảm bảo kết quả tốt nhất, ảnh gốc của bạn được giữ nguyên trạng.'
      });
    }

    return res.json({
      success: false,
      message: 'AI Cleanup provider pending configuration'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. ADMIN TRY-ON MANAGEMENT ROUTES
// ==========================================

/**
 * @route GET /api/tryon/admin/stats
 * @desc Administrative metrics for Virtual Try-On
 * @access Private (Admin only)
 */
router.get('/admin/stats', protect, admin, async (req, res) => {
  try {
    const totalJobs = await TryOnJob.countDocuments();
    const completedJobs = await TryOnJob.countDocuments({ status: 'COMPLETED' });
    const failedJobs = await TryOnJob.countDocuments({ status: 'FAILED' });
    const reconciliationJobs = await TryOnJob.countDocuments({ status: 'RECONCILIATION_REQUIRED' });
    const activeQueue = await TryOnJob.countDocuments({ status: { $in: ['QUEUED', 'PROCESSING'] } });
    const totalTryOnUsers = await TryOnCredit.countDocuments();
    const homieSubscribers = await TryOnCredit.countDocuments({ membershipType: 'homie' });

    return res.json({
      success: true,
      data: {
        totalJobs,
        completedJobs,
        failedJobs,
        reconciliationJobs,
        activeQueue,
        successRate: totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 100,
        totalTryOnUsers,
        homieSubscribers
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/admin/jobs
 * @desc List all customer try-on jobs with status filter
 * @access Private (Admin only)
 */
router.get('/admin/jobs', protect, admin, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const query = status ? { status } : {};

    const jobs = await TryOnJob.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .populate('user', 'name email role')
      .populate('product', 'name price image');

    return res.json({ success: true, count: jobs.length, data: jobs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/admin/ledgers
 * @desc Get audit ledger logs for credit transactions
 * @access Private (Admin only)
 */
router.get('/admin/ledgers', protect, admin, async (req, res) => {
  try {
    const ledgers = await TryOnCreditLedger.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('user', 'name email')
      .populate('adminUser', 'name email');

    return res.json({ success: true, count: ledgers.length, data: ledgers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/admin/providers
 * @desc Inspect registered AI Try-On providers, Category Matrix & real usage telemetry (no billable API call)
 * @access Private (Admin only)
 */
router.get('/admin/providers', protect, admin, async (req, res) => {
  try {
    const [registrySnapshot, usageStats] = await Promise.all([
      virtualTryOnService.healthCheck(),
      tryOnUsageStatsService.getProviderAndCategoryStats({ days: req.query.days || 30 })
    ]);
    return res.json({
      success: true,
      data: {
        ...registrySnapshot,
        usageStats
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route PUT /api/tryon/admin/providers/:providerId
 * @desc Admin update provider governance overrides & category matrix defaults (logged in auditLogs)
 * @access Private (Admin only)
 */
router.put('/admin/providers/:providerId', protect, admin, async (req, res) => {
  try {
    const body = req.body || {};
    const snapshot = await tryOnProviderConfigService.adminUpdateProviderConfig({
      providerId: req.params.providerId,
      adminUser: req.user,
      isEnabled: body.isEnabled,
      categoryOverrides: body.categoryOverrides,
      categoryApproval: body.categoryApproval,
      limitedCategoryApprovals: body.limitedCategoryApprovals,
      verificationStatusOverride: body.verificationStatusOverride,
      setAsDefaultForCategories: Array.isArray(body.setAsDefaultForCategories)
        ? body.setAsDefaultForCategories
        : body.setDefaultForCategory
          ? [body.setDefaultForCategory]
          : undefined,
      resetCircuitBreaker: Boolean(body.resetCircuitBreaker),
      reason: body.reason || ''
    });
    const usageStats = await tryOnUsageStatsService.getProviderAndCategoryStats({ days: req.query.days || 30 });
    return res.json({
      success: true,
      message: `Đã cập nhật cấu hình provider "${req.params.providerId}" và ghi nhận audit log.`,
      data: {
        ...snapshot,
        usageStats
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route POST /api/tryon/admin/jobs/:id/reconcile
 * @desc Admin inspection and settlement for RECONCILIATION_REQUIRED jobs
 * @access Private (Admin only)
 */
router.post('/admin/jobs/:id/reconcile', protect, admin, async (req, res) => {
  try {
    const { mode = 'manual', action, reason } = req.body || {};

    if (mode === 'auto' && !action) {
      const checkResult = await tryOnQueueService.reconcileJob(req.params.id);
      return res.json({
        success: true,
        message: checkResult.reconciled
          ? 'Đã đối soát tự động thành công'
          : 'Không thể tự động xác minh từ Google Cloud. Yêu cầu Admin quyết định thủ công.',
        data: checkResult
      });
    }

    const result = await tryOnQueueService.adminResolveReconciliation({
      jobId: req.params.id,
      adminUserId: req.user._id,
      action,
      reason
    });

    const settledCredits = result?.job?.creditsCost || 1;
    return res.json({
      success: true,
      message: action === 'refund'
        ? `Đã đối soát hoàn ${settledCredits} credit cho khách hàng và ghi nhận audit log`
        : `Đã đối soát chốt trừ ${settledCredits} credit thành công và ghi nhận audit log`,
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route POST /api/tryon/admin/adjust-credit
 * @desc Admin manually adjusts customer credits with required audit justification
 * @access Private (Admin only)
 */
router.post('/admin/adjust-credit', protect, admin, async (req, res) => {
  try {
    const { targetUserId, amount, reason, idempotencyKey } = req.body;

    if (!targetUserId || typeof amount !== 'number' || amount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu targetUserId hoặc số lượng credit (amount) không hợp lệ'
      });
    }

    const result = await tryOnCreditService.manualAdjustCredit({
      adminUserId: req.user._id,
      targetUserId,
      amount,
      reason,
      idempotencyKey
    });

    return res.json({
      success: true,
      message: `Đã điều chỉnh thành công ${amount > 0 ? '+' : ''}${amount} credit`,
      data: result
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/admin/benchmark/status
 * @desc Get real-time benchmark gate status, budget, reserved/committed spend & emergency stop state
 * @access Private (Admin only)
 */
router.get('/admin/benchmark/status', protect, admin, async (req, res) => {
  try {
    const summary = await fullOutfitBenchmarkGate.getBenchmarkSpendSummary();
    const config = fullOutfitBenchmarkGate.getConfiguration();
    return res.json({
      success: true,
      data: {
        ...summary,
        config
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route POST /api/tryon/admin/benchmark/stop
 * @desc In-flight Emergency Stop: immediately halts benchmark gate and blocks subsequent step dispatches
 * @access Private (Admin only)
 */
router.post('/admin/benchmark/stop', protect, admin, async (req, res) => {
  try {
    const { reason = 'Admin triggered emergency stop' } = req.body || {};
    await fullOutfitBenchmarkGate.disableImmediately({
      adminUserId: req.user._id,
      reason
    });
    const summary = await fullOutfitBenchmarkGate.getBenchmarkSpendSummary();
    return res.json({
      success: true,
      message: 'Đã kích hoạt dừng khẩn cấp Benchmark Mode trên toàn hệ thống.',
      data: summary
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route POST /api/tryon/admin/benchmark/reset
 * @desc Reset benchmark runtime state (clears emergency stop and spend counters)
 * @access Private (Admin only)
 */
router.post('/admin/benchmark/reset', protect, admin, async (req, res) => {
  try {
    await fullOutfitBenchmarkGate.resetRuntimeState();
    const summary = await fullOutfitBenchmarkGate.getBenchmarkSpendSummary();
    return res.json({
      success: true,
      message: 'Đã thiết lập lại trạng thái Benchmark Mode.',
      data: summary
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. ADMIN PRODUCT INTELLIGENCE ROUTES
// ==========================================

/**
 * @route GET /api/tryon/admin/product-intelligence
 * @desc List catalog products with Product Intelligence flags & filter queues
 * @access Private (Admin only)
 */
router.get('/admin/product-intelligence', protect, admin, async (req, res) => {
  try {
    const { filter = 'all' } = req.query;
    const data = await productIntelligenceService.listForAdmin({ filter });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route POST /api/tryon/admin/product-intelligence/sync-all
 * @desc Non-destructively initialize baseline Product Intelligence for existing KD-XX products
 * @access Private (Admin only)
 */
router.post('/admin/product-intelligence/sync-all', protect, admin, async (req, res) => {
  try {
    const records = await productIntelligenceService.syncAllCatalogProducts({ actorRole: 'admin' });
    return res.json({
      success: true,
      message: `Đã đồng bộ cơ sở dữ liệu Product Intelligence cho ${records.length} sản phẩm`,
      count: records.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/tryon/admin/product-intelligence/:productId
 * @desc Inspect detailed intelligence record, sources, conflicts, audit logs, and AI Context preview
 * @access Private (Admin only)
 */
router.get('/admin/product-intelligence/:productId', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }
    const intelligence = await productIntelligenceService.ensureBaselineForProduct(product);
    const activeProvider = virtualTryOnService.getActiveProvider({
      category: intelligence.normalizedCategory?.subCategory || product.category
    });
    const aiContextPreview = aiProductContextService.buildProductContext({
      product,
      intelligence,
      providerCapabilities: activeProvider.getCapabilities()
    });
    return res.json({
      success: true,
      data: {
        product,
        intelligence,
        aiContextPreview,
        providerAdaptation: typeof activeProvider.adaptProductContext === 'function'
          ? activeProvider.adaptProductContext(aiContextPreview)
          : null
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

/**
 * @route POST /api/tryon/admin/product-intelligence/:productId/ingest-source
 * @desc Safely ingest 1 verified brand/retailer source URL using SSRF & allowlist guards
 * @access Private (Admin only)
 */
router.post('/admin/product-intelligence/:productId/ingest-source', protect, admin, async (req, res) => {
  try {
    const { sourceUrl } = req.body || {};
    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp URL nguồn sản phẩm hợp lệ' });
    }

    const result = await productIntelligenceService.ingestExternalSource(req.params.productId, sourceUrl, {
      actorUserId: req.user._id,
      actorRole: 'admin'
    });

    return res.json({
      success: true,
      message: `Đã xử lý nguồn (${result.matchResult.productMatchingStatus})`,
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route POST /api/tryon/admin/product-intelligence/:productId/analyze-image
 * @desc Analyze product catalog/verified images using RGB pixels & MIME checks
 * @access Private (Admin only)
 */
router.post('/admin/product-intelligence/:productId/analyze-image', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
    }
    const result = await productIntelligenceService.analyzeProductImages(req.params.productId, {
      actorUserId: req.user._id,
      actorRole: 'admin'
    });
    return res.json({
      success: true,
      message: `Đã kiểm tra ${result.inspected.length} ảnh sản phẩm`,
      data: result
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

/**
 * @route POST /api/tryon/admin/product-intelligence/:productId/verify
 * @desc Admin approves, rejects, marks source untrusted, or updates locked attributes with audit trail
 * @access Private (Admin only)
 */
router.post('/admin/product-intelligence/:productId/verify', protect, admin, async (req, res) => {
  try {
    const record = await productIntelligenceService.adminVerifyOrUpdate(
      req.params.productId,
      req.user._id,
      req.body || {}
    );
    return res.json({
      success: true,
      message: 'Đã cập nhật hồ sơ Product Intelligence và lưu audit log',
      data: record
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.message
    });
  }
});

module.exports = router;
