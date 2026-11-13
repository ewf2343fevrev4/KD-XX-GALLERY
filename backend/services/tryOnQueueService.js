const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const TryOnJob = require('../models/TryOnJob');
const TryOnImageAsset = require('../models/TryOnImageAsset');
const TryOnCreditLot = require('../models/TryOnCreditLot');
const TryOnCreditLedger = require('../models/TryOnCreditLedger');
const Product = require('../models/Product');
const virtualTryOnService = require('./virtualTryOnService');
const tryOnStorageService = require('./tryOnStorageService');
const tryOnCreditService = require('./tryOnCreditService');
const tryOnImageService = require('./tryOnImageService');
const productIntelligenceService = require('./productIntelligenceService');
const aiProductContextService = require('./aiProductContextService');
const categoryTaxonomyService = require('./categoryTaxonomyService');
const categoryInputValidator = require('./categoryInputValidator');
const fullOutfitValidator = require('./fullOutfitValidator');
const fullOutfitBenchmarkGate = require('./fullOutfitBenchmarkGate');
const providerConfigService = require('./tryOnProviderConfigService');
const ProductIntelligence = require('../models/ProductIntelligence');
const TryOnProviderConfig = require('../models/TryOnProviderConfig');
const {
  fetchSafeRemoteImage,
  inspectImageBufferSignature,
  TRYON_DOWNLOAD_ALLOWED_MIME_TYPES
} = require('../utils/ssrfImageFetcher');

function isProductIntelligenceQueryable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    ProductIntelligence.findOne !== mongoose.Model.findOne
  );
}

function isProviderConfigQueryable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    TryOnProviderConfig.findOne !== mongoose.Model.findOne
  );
}

const PUBLIC_FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend', 'public');
const MAX_PRODUCT_DOWNLOAD_BYTES = 10 * 1024 * 1024;

class TryOnQueueService {
  constructor(options = {}) {
    this.isProcessing = false;
    this.maxConcurrentWorkers = options.maxConcurrentWorkers || 2;
    this.activeWorkers = 0;
    this.pollIntervalMs = options.pollIntervalMs || 1500;
    this.timer = null;

    // Dependency overrides for isolated unit tests
    this.virtualTryOn = options.virtualTryOnService || virtualTryOnService;
    this.storageService = options.tryOnStorageService || tryOnStorageService;
    this.creditService = options.tryOnCreditService || tryOnCreditService;
    this.imageService = options.tryOnImageService || tryOnImageService;
    this.remoteFetcher = options.fetchSafeRemoteImage || fetchSafeRemoteImage;
    this.intelligenceService = options.productIntelligenceService || productIntelligenceService;
    this.contextService = options.aiProductContextService || aiProductContextService;
    this.inputValidator = options.categoryInputValidator || categoryInputValidator;
    this.benchmarkGate = options.benchmarkGate || fullOutfitBenchmarkGate;
    this.providerConfigService = options.providerConfigService || providerConfigService;

    // Rate limiting in-memory trackers (sliding 10 minutes window)
    this.rateLimits = {
      uploads: new Map(), // userId -> timestamps[]
      tryOns: new Map(),  // userId -> timestamps[]
      cleanups: new Map() // userId -> timestamps[]
    };

    const autoStart =
      options.autoStart !== undefined
        ? options.autoStart
        : process.env.NODE_ENV !== 'test' && process.env.TRYON_DISABLE_AUTO_WORKER !== 'true';

    if (autoStart) {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        this.recoverStuckJobs();
      } else if (mongoose.connection && typeof mongoose.connection.once === 'function') {
        mongoose.connection.once('connected', () => {
          this.recoverStuckJobs();
        });
      }
      this.startWorkerLoop();
    }
  }

  cleanOldTimestamps(map, windowMs = 10 * 60 * 1000) {
    const now = Date.now();
    for (const [key, timestamps] of map.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        map.delete(key);
      } else {
        map.set(key, valid);
      }
    }
  }

  peekRateLimit(type, userId, maxAllowed, windowMinutes = 10, isAdmin = false) {
    if (isAdmin) return { allowed: true };
    const map = this.rateLimits[type];
    if (!map) return { allowed: true };

    const windowMs = windowMinutes * 60 * 1000;
    const now = Date.now();
    const timestamps = (map.get(String(userId)) || []).filter(t => now - t < windowMs);
    map.set(String(userId), timestamps);

    if (timestamps.length >= maxAllowed) {
      return {
        allowed: false,
        message: `Bạn đã thực hiện quá giới hạn ${maxAllowed} lượt ${type} trong ${windowMinutes} phút. Vui lòng thử lại sau ít phút.`
      };
    }

    return { allowed: true };
  }

  recordRateLimitHit(type, userId, isAdmin = false) {
    if (isAdmin) return;
    const map = this.rateLimits[type];
    if (!map) return;
    const timestamps = map.get(String(userId)) || [];
    timestamps.push(Date.now());
    map.set(String(userId), timestamps);
  }

  checkRateLimit(type, userId, maxAllowed, windowMinutes = 10, isAdmin = false) {
    const check = this.peekRateLimit(type, userId, maxAllowed, windowMinutes, isAdmin);
    if (!check.allowed) {
      return check;
    }
    this.recordRateLimitHit(type, userId, isAdmin);
    return { allowed: true };
  }

  /**
   * Submit a new try-on job with strict validation BEFORE consuming rate-limit quota
   * and atomic credit reservation BEFORE entering QUEUED.
   * Enriches the job with an immutable Phase 2 AI Product Context & Product Snapshot.
   */
  async submitJob({ userId, personImageAssetId, productId, selectedVariant = null, idempotencyKey = '', userRole = 'user' }) {
    const isAdmin = userRole === 'admin';

    // 1. Idempotency check
    if (idempotencyKey) {
      const existing = await TryOnJob.findOne({ idempotencyKey, user: userId });
      if (existing) {
        return existing;
      }
    }

    // 2. Validate Person Image Asset BEFORE charging rate limits
    const personAsset = await TryOnImageAsset.findOne({
      _id: personImageAssetId,
      user: userId,
      isDeleted: false
    });

    if (!personAsset) {
      const err = new Error('Ảnh người dùng không tồn tại hoặc đã bị xóa');
      err.code = 'PERSON_IMAGE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (personAsset.expiresAt && new Date(personAsset.expiresAt) < new Date()) {
      const err = new Error('Ảnh người dùng đã hết hạn lưu trữ (tối đa 72 giờ). Vui lòng tải lại ảnh.');
      err.code = 'PERSON_IMAGE_EXPIRED';
      err.statusCode = 410;
      throw err;
    }

    if (personAsset.qualityAnalysis?.status === 'REJECTED') {
      const err = new Error('Ảnh người dùng bị từ chối do không đạt tiêu chuẩn chất lượng (mờ, quá tối hoặc không thấy người).');
      err.code = 'PERSON_IMAGE_REJECTED';
      err.statusCode = 400;
      throw err;
    }

    // 3. Validate Product, Product Intelligence baseline & AI Product Context
    const product = await Product.findById(productId);
    if (!product) {
      const err = new Error('Sản phẩm KD-XX không tồn tại trong danh mục');
      err.code = 'PRODUCT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    let intelligence = null;
    if (isProductIntelligenceQueryable()) {
      intelligence = await this.intelligenceService.ensureBaselineForProduct(product, { actorRole: 'tryon_job_submit' });
    }

    const taxonomy = intelligence?.normalizedCategory?.subCategory && intelligence.normalizedCategory.subCategory !== 'unknown'
      ? intelligence.normalizedCategory
      : categoryTaxonomyService.mapProductCategory(product);

    let providerAdapter = null;
    let providerCapabilities = null;
    let routingSupport = null;

    if (typeof this.virtualTryOn.resolveCategoryRouting === 'function') {
      if (intelligence?.verificationStatus === 'CONFLICT' || intelligence?.flags?.hasConflicts) {
        const err = new Error('Sản phẩm đang có xung đột dữ liệu nghiêm trọng (CONFLICT). Cần Admin xử lý trước khi tạo Try-On.');
        err.code = 'PRODUCT_INTELLIGENCE_CONFLICT';
        err.statusCode = 400;
        throw err;
      }

      if (intelligence?.verificationStatus === 'NEEDS_REVIEW' || intelligence?.flags?.needsReview || taxonomy?.needsReview) {
        const err = new Error(
          taxonomy?.conflictReason ||
          intelligence?.normalizedCategory?.conflictReason ||
          'Danh mục sản phẩm đang chờ Admin rà soát (NEEDS_REVIEW) trước khi cho phép Try-On.'
        );
        err.code = 'PRODUCT_NEEDS_REVIEW';
        err.statusCode = 400;
        throw err;
      }

      const routing = await this.virtualTryOn.resolveCategoryRouting({
        category: taxonomy.subCategory || product.category,
        domain: taxonomy.domain,
        subCategory: taxonomy.subCategory
      });
      routingSupport = routing.support;

      if (!routing.support.allowSubmit || !routing.adapter) {
        const err = new Error(routing.support.reason || 'Danh mục sản phẩm này hiện chưa hỗ trợ Virtual Try-On.');
        err.code = routing.support.blockCode || 'UNSUPPORTED_CATEGORY';
        err.statusCode = ['DEPRECATED', 'NOT_CONFIGURED'].includes(routing.support.status) ? 503 : 400;
        throw err;
      }
      providerAdapter = routing.adapter;
      providerCapabilities = typeof providerAdapter.getCapabilities === 'function'
        ? providerAdapter.getCapabilities()
        : null;
    } else {
      const preliminaryCategory = taxonomy.subCategory || product.category;
      providerAdapter = this.virtualTryOn.getActiveProvider({ category: preliminaryCategory });
      providerCapabilities = typeof providerAdapter.getCapabilities === 'function'
        ? providerAdapter.getCapabilities()
        : null;
    }

    const productContext = this.contextService.buildProductContext({
      product,
      intelligence,
      selectedVariant,
      providerCapabilities
    });
    const productSnapshot = this.contextService.toJobProductSnapshot(productContext);
    const productImageUrl = productSnapshot.imageUrlUsed || product.image || (Array.isArray(product.images) && product.images[0]) || '';

    if (!productImageUrl) {
      const err = new Error('Sản phẩm được chọn chưa có ảnh trang phục để AI thử đồ');
      err.code = 'PRODUCT_IMAGE_MISSING';
      err.statusCode = 400;
      throw err;
    }

    if (routingSupport) {
      const inputCheck = this.inputValidator.validate({
        category: product.category,
        domain: taxonomy.domain,
        subCategory: taxonomy.subCategory,
        routingSupport,
        personAsset,
        product,
        intelligence,
        productImageUrl
      });
      if (!inputCheck.valid) {
        const err = new Error(inputCheck.message || 'Ảnh đầu vào hoặc hồ sơ sản phẩm không đáp ứng điều kiện danh mục.');
        err.code = inputCheck.code || 'CATEGORY_INPUT_INVALID';
        err.statusCode = 400;
        throw err;
      }
    }

    // 4. Check active/queued count limit (max 2 per regular account)
    if (!isAdmin) {
      const activeJobsCount = await TryOnJob.countDocuments({
        user: userId,
        status: { $in: ['PENDING', 'QUEUED', 'PROCESSING'] }
      });

      if (activeJobsCount >= 2) {
        const err = new Error('Tài khoản hiện có tối đa 2 yêu cầu đang trong hàng đợi xử lý. Vui lòng chờ hoàn tất phiên trước.');
        err.code = 'MAX_ACTIVE_JOBS_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }
    }

    // 5. Check membership priority & credit availability BEFORE consuming rate limit
    await this.creditService.checkAndSyncMembership(userId);
    const creditAccount = await this.creditService.getOrCreateAccount(userId);
    let priority = 1;
    if (isAdmin || creditAccount.membershipType === 'admin') {
      priority = 99;
    } else if (creditAccount.membershipType === 'homie') {
      const isHomieActive = creditAccount.membershipExpiresAt && new Date(creditAccount.membershipExpiresAt) > new Date();
      priority = isHomieActive ? 10 : 1;
    }

    if (!isAdmin && creditAccount.membershipType !== 'admin') {
      const availableCredits = await this.creditService.recalculateAvailableBalance(userId);
      if (availableCredits < 1) {
        const err = new Error('Tài khoản của bạn không đủ lượt thử đồ AI (Credit). Vui lòng nâng cấp HOMIE hoặc nạp thêm lượt thử.');
        err.code = 'INSUFFICIENT_CREDITS';
        err.statusCode = 402;
        throw err;
      }
    }

    // 6. Enforce tryOns rate limit ONLY AFTER input, asset, product & credit validation pass
    if (!isAdmin) {
      const rateCheck = this.peekRateLimit('tryOns', userId, 5, 10, false);
      if (!rateCheck.allowed) {
        const err = new Error(rateCheck.message);
        err.code = 'RATE_LIMIT_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }
    }

    // 7. Create Job in PENDING status with immutable productSnapshot
    const job = await TryOnJob.create({
      user: userId,
      status: 'PENDING',
      priority,
      personImageAsset: personAsset._id,
      product: product._id,
      productImageUrl,
      productName: product.name,
      productSnapshot,
      creditsCost: 1,
      provider: providerAdapter.providerId,
      aiProviderDetails: {
        providerId: providerAdapter.providerId,
        model: providerAdapter.modelId,
        httpStatus: 0
      },
      idempotencyKey: idempotencyKey || undefined,
      timing: { queuedAt: new Date() }
    });

    // 8. Two-phase atomic credit reservation BEFORE job can enter QUEUED
    try {
      const reservation = await this.creditService.reserveCredit(userId, job._id, 1);
      if (!reservation || !reservation.lotId) {
        const resErr = new Error('Không thể tạo tạm giữ credit hợp lệ cho phiên thử đồ');
        resErr.code = 'INVALID_RESERVATION_DATA';
        resErr.statusCode = 500;
        throw resErr;
      }
      job.creditLot = reservation.lotId;
      if (Array.isArray(reservation.allocations) && reservation.allocations.length > 0) {
        job.creditReservations = reservation.allocations.map(a => ({
          lot: a.lotId,
          lotType: a.lotType || 'unknown',
          amount: a.amount || 1
        }));
      }
      job.status = 'QUEUED';
      await job.save();
    } catch (creditErr) {
      if (!job.timing) job.timing = {};
      job.status = 'FAILED';
      job.errorMessage = creditErr.message;
      job.errorCode = creditErr.code || 'CREDIT_ERROR';
      job.timing.completedAt = new Date();
      await job.save();
      throw creditErr;
    }

    // Record successful tryOns quota consumption
    this.recordRateLimitHit('tryOns', userId, isAdmin);

    // Trigger queue processing tick
    setImmediate(() => this.processNextJobs());
    return job;
  }

  /**
   * Submit a validated 2-piece Full Outfit try-on job (1 Top/Outerwear + 1 Bottom/Pants/Jeans/Skirt).
   * Enforces:
   *  - Registry/Adapter routing only (no hardcoded provider) & benchmark/retirement gate
   *  - Server-computed 2-credit cost (ignores any client creditsCost or intermediate image inputs)
   *  - Multi-lot reservation support
   */
  async submitFullOutfitJob({ userId, personImageAssetId, items = [], idempotencyKey = '', userRole = 'user' }) {
    const isAdmin = userRole === 'admin';

    if (idempotencyKey) {
      const existing = await TryOnJob.findOne({ idempotencyKey, user: userId });
      if (existing) {
        return existing;
      }
    }

    // 1. Resolve Full Outfit capability via Provider Registry & Adapter Contract (never hardcoded)
    let benchmarkRunMeta = null;
    if (typeof this.virtualTryOn.resolveFullOutfitRouting === 'function') {
      const routing = await this.virtualTryOn.resolveFullOutfitRouting();
      if (!routing?.support?.allowSubmit || !routing?.adapter) {
        const blockCode = routing?.support?.blockCode || 'FULL_OUTFIT_PENDING_BENCHMARK';

        if (blockCode === 'FULL_OUTFIT_PENDING_BENCHMARK') {
          const benchEval = await this.benchmarkGate.evaluateAdminAccess({ userId, userRole });
          if (!benchEval.allowed) {
            const err = new Error(benchEval.message || routing?.support?.reason || 'Full Outfit Virtual Try-On hiện chưa mở.');
            err.code = benchEval.blockCode;
            err.statusCode = benchEval.statusCode || 400;
            throw err;
          }

          // Benchmark Mode MUST still obey underlying provider lifecycle (2027-03-15 retirement, CB, credentials)
          if (typeof this.virtualTryOn.resolveCategoryRouting === 'function') {
            const clothingRouting = await this.virtualTryOn.resolveCategoryRouting({
              category: 'tops',
              domain: 'clothing',
              subCategory: 'tops'
            });
            if (!clothingRouting?.support?.allowSubmit || !clothingRouting?.adapter) {
              const govErr = new Error(
                clothingRouting?.support?.reason || 'AI Provider nền cho Clothing hiện không khả dụng để chạy Benchmark.'
              );
              govErr.code = clothingRouting?.support?.blockCode || 'PROVIDER_NOT_CONFIGURED';
              govErr.statusCode = ['MODEL_RETIRED', 'PROVIDER_NOT_CONFIGURED', 'NO_AVAILABLE_PROVIDER'].includes(govErr.code) ? 503 : 400;
              throw govErr;
            }
          }

          benchmarkRunMeta = {
            isBenchmark: true,
            triggeredByAdmin: userId,
            env: benchEval.configSnapshot?.currentEnv || '',
            startedAt: new Date()
          };
        } else {
          const err = new Error(
            routing?.support?.reason ||
            'Full Outfit Virtual Try-On hiện chưa mở cho người dùng (chờ nghiệm thu benchmark hoặc model đã hết hạn).'
          );
          err.code = blockCode;
          err.statusCode = ['MODEL_RETIRED', 'PROVIDER_NOT_CONFIGURED', 'NO_AVAILABLE_PROVIDER'].includes(err.code) ? 503 : 400;
          throw err;
        }
      }
    }

    // 2. Validate Person Image Asset (private, owned, valid, not expired <= 72h)
    const personAsset = await TryOnImageAsset.findOne({
      _id: personImageAssetId,
      user: userId,
      isDeleted: false
    });
    if (!personAsset) {
      const err = new Error('Ảnh người dùng không tồn tại hoặc đã bị xóa');
      err.code = 'PERSON_IMAGE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    if (personAsset.expiresAt && new Date(personAsset.expiresAt) < new Date()) {
      const err = new Error('Ảnh người dùng đã hết hạn lưu trữ (tối đa 72 giờ). Vui lòng tải lại ảnh.');
      err.code = 'PERSON_IMAGE_EXPIRED';
      err.statusCode = 410;
      throw err;
    }
    if (personAsset.qualityAnalysis?.status === 'REJECTED') {
      const err = new Error('Ảnh người dùng bị từ chối do không đạt tiêu chuẩn chất lượng.');
      err.code = 'PERSON_IMAGE_REJECTED';
      err.statusCode = 400;
      throw err;
    }

    // 2b. Validate full-body portrait requirement specifically for Full Outfit (must show legs/waist for bottoms)
    fullOutfitValidator.validatePersonImageForOutfit(personAsset);

    // 3. Load and enrich each requested catalog item
    if (!Array.isArray(items) || items.length !== 2) {
      const err = new Error(
        Array.isArray(items) && items.length > 2
          ? 'Full Outfit hiện chỉ hỗ trợ tối đa 2 sản phẩm (1 Áo/Áo khoác + 1 Quần/Chân váy). Giày và Phụ kiện đang bị khóa.'
          : 'Full Outfit yêu cầu đúng 2 sản phẩm gồm 1 Áo/Áo khoác và 1 Quần/Chân váy.'
      );
      err.code = 'INVALID_OUTFIT_COUNT';
      err.statusCode = 400;
      throw err;
    }

    const enrichedEntries = [];
    for (const rawItem of items) {
      const productId = rawItem?.productId;
      const selectedVariant = rawItem?.selectedVariant || null;
      const product = productId ? await Product.findById(productId) : null;
      if (!product) {
        const err = new Error('Một sản phẩm trong Full Outfit không tồn tại trong danh mục KD-XX.');
        err.code = 'PRODUCT_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      let intelligence = null;
      if (isProductIntelligenceQueryable()) {
        intelligence = await this.intelligenceService.ensureBaselineForProduct(product, { actorRole: 'tryon_full_outfit_submit' });
      }
      const taxonomy = intelligence?.normalizedCategory?.subCategory && intelligence.normalizedCategory.subCategory !== 'unknown'
        ? intelligence.normalizedCategory
        : categoryTaxonomyService.mapProductCategory(product);

      const routing = typeof this.virtualTryOn.resolveCategoryRouting === 'function'
        ? await this.virtualTryOn.resolveCategoryRouting({
            category: taxonomy.subCategory || product.category,
            domain: taxonomy.domain,
            subCategory: taxonomy.subCategory
          })
        : {
            support: null,
            adapter: this.virtualTryOn.getActiveProvider({ category: taxonomy.subCategory || product.category })
          };

      const adapter = routing.adapter || null;
      const adapterCaps = adapter && typeof adapter.getCapabilities === 'function' ? adapter.getCapabilities() : null;
      const productContext = this.contextService.buildProductContext({
        product,
        intelligence,
        selectedVariant,
        providerCapabilities: adapterCaps
      });
      const productSnapshot = this.contextService.toJobProductSnapshot(productContext);
      const productImageUrl = productSnapshot.imageUrlUsed || product.image || (Array.isArray(product.images) && product.images[0]) || '';

      enrichedEntries.push({
        product,
        intelligence,
        taxonomy,
        routingSupport: routing.support,
        adapter,
        productSnapshot,
        productImageUrl
      });
    }

    // 4. Validate Full Outfit slot combination, DRESS exclusion, FOOTWEAR/ACCESSORIES lock & step ordering
    const { orderedSteps, creditsCost } = fullOutfitValidator.validateFullOutfitSelection(enrichedEntries);

    // Ensure every resolved step is backed by an active non-retired provider via Registry
    for (const step of orderedSteps) {
      if (step.routingSupport && (!step.routingSupport.allowSubmit || !step.adapter)) {
        const err = new Error(step.routingSupport.reason || `Danh mục của "${step.product.name}" chưa khả dụng.`);
        err.code = step.routingSupport.blockCode || 'UNSUPPORTED_CATEGORY';
        err.statusCode = ['MODEL_RETIRED', 'PROVIDER_NOT_CONFIGURED'].includes(step.routingSupport.status) ? 503 : 400;
        throw err;
      }
      if (!step.adapter) {
        step.adapter = this.virtualTryOn.getActiveProvider({
          category: step.taxonomy.subCategory || step.product.category,
          domain: step.taxonomy.domain,
          subCategory: step.taxonomy.subCategory
        });
      }
      if (step.routingSupport) {
        const inputCheck = this.inputValidator.validate({
          category: step.product.category,
          domain: step.taxonomy.domain,
          subCategory: step.taxonomy.subCategory,
          routingSupport: step.routingSupport,
          personAsset,
          product: step.product,
          intelligence: step.intelligence,
          productImageUrl: step.productImageUrl
        });
        if (!inputCheck.valid) {
          const err = new Error(inputCheck.message || 'Ảnh đầu vào không đáp ứng điều kiện Full Outfit.');
          err.code = inputCheck.code || 'CATEGORY_INPUT_INVALID';
          err.statusCode = 400;
          throw err;
        }
      }
    }

    // 5. Active queue limit (max 2 concurrent active jobs per non-admin account)
    if (!isAdmin) {
      const activeJobsCount = await TryOnJob.countDocuments({
        user: userId,
        status: { $in: ['PENDING', 'QUEUED', 'PROCESSING'] }
      });
      if (activeJobsCount >= 2) {
        const err = new Error('Tài khoản hiện có tối đa 2 yêu cầu đang trong hàng đợi xử lý.');
        err.code = 'MAX_ACTIVE_JOBS_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }
    }

    // 6. Membership priority & credit check (>= server creditsCost = 2)
    await this.creditService.checkAndSyncMembership(userId);
    const creditAccount = await this.creditService.getOrCreateAccount(userId);
    let priority = 1;
    if (isAdmin || creditAccount.membershipType === 'admin') {
      priority = 99;
    } else if (creditAccount.membershipType === 'homie') {
      const isHomieActive = creditAccount.membershipExpiresAt && new Date(creditAccount.membershipExpiresAt) > new Date();
      priority = isHomieActive ? 10 : 1;
    }

    if (!isAdmin && creditAccount.membershipType !== 'admin') {
      const availableCredits = await this.creditService.recalculateAvailableBalance(userId);
      if (availableCredits < creditsCost) {
        const err = new Error(`Full Outfit cần ${creditsCost} credits nhưng tài khoản chỉ còn ${availableCredits} credits khả dụng.`);
        err.code = 'INSUFFICIENT_CREDITS';
        err.statusCode = 402;
        throw err;
      }

      const rateCheck = this.peekRateLimit('tryOns', userId, 5, 10, false);
      if (!rateCheck.allowed) {
        const err = new Error(rateCheck.message);
        err.code = 'RATE_LIMIT_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }
    }

    // 7. Persist PENDING Full Outfit Job with outfitItems + executionSteps
    const primaryStep = orderedSteps[0];
    const topStep = orderedSteps.find(s => s.slot === 'TOP') || orderedSteps[1];
    const bottomStep = orderedSteps.find(s => s.slot === 'BOTTOM') || orderedSteps[0];
    const combinedName = `${topStep.product.name} + ${bottomStep.product.name}`;

    const outfitItems = orderedSteps.map(s => ({
      slot: s.slot,
      stepOrder: s.stepOrder,
      product: s.product._id,
      productImageUrl: s.productImageUrl,
      productName: s.product.name,
      productSnapshot: s.productSnapshot
    }));

    const executionSteps = orderedSteps.map(s => ({
      stepIndex: s.stepOrder,
      slot: s.slot,
      product: s.product._id,
      productName: s.product.name,
      providerId: s.adapter.providerId,
      modelId: s.adapter.modelId,
      status: 'PENDING'
    }));

    const combinedLimitations = Array.from(new Set([
      ...(topStep.productSnapshot?.knownLimitations || []),
      ...(bottomStep.productSnapshot?.knownLimitations || []),
      'Full Outfit xử lý tuần tự 2 bước (Quần/Váy -> Áo/Áo khoác); ảnh kết quả cần kiểm tra chất lượng trước khi mở rộng sử dụng.'
    ]));

    const combinedSnapshot = {
      ...(topStep.productSnapshot || {}),
      productName: combinedName,
      normalizedDomain: 'clothing',
      normalizedSubCategory: 'full_outfit',
      knownLimitations: combinedLimitations,
      contextGeneratedAt: new Date()
    };

    const job = await TryOnJob.create({
      user: userId,
      mode: 'FULL_OUTFIT',
      status: 'PENDING',
      priority,
      personImageAsset: personAsset._id,
      product: primaryStep.product._id,
      productImageUrl: primaryStep.productImageUrl,
      productName: combinedName,
      productSnapshot: combinedSnapshot,
      outfitItems,
      executionSteps,
      creditsCost,
      provider: primaryStep.adapter.providerId,
      aiProviderDetails: {
        providerId: primaryStep.adapter.providerId,
        model: primaryStep.adapter.modelId,
        httpStatus: 0
      },
      ...(benchmarkRunMeta ? { benchmark: benchmarkRunMeta } : {}),
      idempotencyKey: idempotencyKey || undefined,
      timing: { queuedAt: new Date() }
    });

    // 8. Reserve 2 credits atomically (supports split across multiple lots)
    try {
      const reservation = await this.creditService.reserveCredit(userId, job._id, creditsCost);
      if (!reservation || !reservation.lotId) {
        const resErr = new Error('Không thể tạo tạm giữ credit hợp lệ cho phiên Full Outfit');
        resErr.code = 'INVALID_RESERVATION_DATA';
        resErr.statusCode = 500;
        throw resErr;
      }
      job.creditLot = reservation.lotId;
      job.creditReservations = Array.isArray(reservation.allocations) && reservation.allocations.length > 0
        ? reservation.allocations.map(a => ({
            lot: a.lotId,
            lotType: a.lotType || 'unknown',
            amount: a.amount || 1
          }))
        : [{ lot: reservation.lotId, lotType: reservation.lotType || 'unknown', amount: creditsCost }];
      job.status = 'QUEUED';
      await job.save();
    } catch (creditErr) {
      if (!job.timing) job.timing = {};
      job.status = 'FAILED';
      job.errorMessage = creditErr.message;
      job.errorCode = creditErr.code || 'CREDIT_ERROR';
      job.timing.completedAt = new Date();
      await job.save();
      throw creditErr;
    }

    if (benchmarkRunMeta && typeof this.benchmarkGate?.recordBenchmarkHit === 'function') {
      this.benchmarkGate.recordBenchmarkHit(userId);
    } else {
      this.recordRateLimitHit('tryOns', userId, isAdmin);
    }
    setImmediate(() => this.processNextJobs());
    return job;
  }

  /**
   * Fetch product image buffer with full SSRF, DNS-rebinding, redirect, size, MIME, magic-bytes
   * and Vertex inline limit preprocessing.
   */
  async fetchProductImageBuffer(imageUrl, options = {}) {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      const err = new Error('Đường dẫn ảnh sản phẩm rỗng');
      err.code = 'PRODUCT_IMAGE_MISSING';
      err.statusCode = 400;
      throw err;
    }

    const trimmedUrl = imageUrl.trim();
    const convertUnsupportedFormats = options.convertUnsupportedFormats !== false;
    let rawBuffer;

    if (trimmedUrl.startsWith('data:image/')) {
      const commaIdx = trimmedUrl.indexOf(',');
      if (commaIdx === -1) {
        const err = new Error('Dữ liệu data URL ảnh sản phẩm không hợp lệ');
        err.code = 'INVALID_PRODUCT_IMAGE';
        err.statusCode = 400;
        throw err;
      }
      const base64Payload = trimmedUrl.slice(commaIdx + 1);
      rawBuffer = Buffer.from(base64Payload, 'base64');
      const sig = inspectImageBufferSignature(rawBuffer);
      if (sig.isHtmlOrTextSpoof || !sig.isImage) {
        const err = new Error('Nội dung data URL không phải tệp ảnh hợp lệ');
        err.code = sig.isHtmlOrTextSpoof ? 'HTML_SPOOFED_AS_IMAGE' : 'MAGIC_BYTES_MISMATCH';
        err.statusCode = 415;
        throw err;
      }
    } else if (trimmedUrl.startsWith('/')) {
      // Safe public frontend path resolution with strict traversal containment
      const normalizedRel = trimmedUrl.replace(/^\/+/, '');
      const resolvedPublic = path.resolve(PUBLIC_FRONTEND_DIR, normalizedRel);
      const baseWithSep = PUBLIC_FRONTEND_DIR.endsWith(path.sep)
        ? PUBLIC_FRONTEND_DIR
        : PUBLIC_FRONTEND_DIR + path.sep;
      const isContained = process.platform === 'win32'
        ? resolvedPublic.toLowerCase().startsWith(baseWithSep.toLowerCase())
        : resolvedPublic.startsWith(baseWithSep);

      if (!isContained) {
        const err = new Error('Đường dẫn ảnh nội bộ không hợp lệ');
        err.code = 'PATH_TRAVERSAL_BLOCKED';
        err.statusCode = 403;
        throw err;
      }
      if (!fs.existsSync(resolvedPublic)) {
        const err = new Error('Không tìm thấy tệp ảnh sản phẩm nội bộ');
        err.code = 'PRODUCT_IMAGE_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      rawBuffer = fs.readFileSync(resolvedPublic);
    } else {
      const downloaded = await this.remoteFetcher(trimmedUrl, {
        maxBytes: options.maxDownloadBytes || MAX_PRODUCT_DOWNLOAD_BYTES,
        timeoutMs: options.timeoutMs || 15000,
        allowedMimeTypes: options.allowedMimeTypes || TRYON_DOWNLOAD_ALLOWED_MIME_TYPES,
        allowedHosts: options.allowedHosts,
        extraAllowedHosts: options.extraAllowedHosts,
        allowHttpForTest: options.allowHttpForTest,
        transport: options.transport,
        agent: options.agent,
        dnsLookup: options.dnsLookup,
        verifyMagicBytes: true
      });

      if (
        !convertUnsupportedFormats &&
        downloaded.mimeType !== 'image/jpeg' &&
        downloaded.mimeType !== 'image/png'
      ) {
        const err = new Error(`Model hiện tại chỉ chấp nhận JPEG/PNG, nhận được ${downloaded.mimeType}`);
        err.code = 'UNSUPPORTED_MODEL_FORMAT';
        err.statusCode = 415;
        throw err;
      }

      rawBuffer = downloaded.buffer;
    }

    // Preprocess into guaranteed JPEG/PNG within Vertex 7 MB Base64 budget (preserving aspect ratio)
    const preprocessed = await this.imageService.preprocessForTryOn(rawBuffer, options.preprocessOptions || {});
    return preprocessed.buffer;
  }

  _getCreditAllocations(job) {
    if (Array.isArray(job?.creditReservations) && job.creditReservations.length > 0) {
      return job.creditReservations.map(r => ({
        lotId: r.lot || r.lotId,
        lotType: r.lotType || 'unknown',
        amount: r.amount || 1
      }));
    }
    return job?.creditLot || null;
  }

  _hasCreditReservation(job) {
    return Boolean(
      job?.creditLot ||
      (Array.isArray(job?.creditReservations) && job.creditReservations.length > 0)
    );
  }

  /**
   * Verify job actually holds an active credit reservation before invoking AI
   */
  async verifyJobHasValidReservation(job) {
    if (!job || !this._hasCreditReservation(job)) {
      return { valid: false, reason: 'Thiếu thông tin creditLot tạm giữ' };
    }

    const existingCommit = await TryOnCreditLedger.findOne({ idempotencyKey: `COMMIT_${job._id}` });
    if (existingCommit) {
      return { valid: false, reason: 'Job đã được chốt trừ credit trước đó', code: 'ALREADY_COMMITTED' };
    }

    const existingRefund = await TryOnCreditLedger.findOne({ idempotencyKey: `REFUND_${job._id}` });
    if (existingRefund) {
      return { valid: false, reason: 'Job đã được hoàn tiền trước đó', code: 'ALREADY_REFUNDED' };
    }

    if (Array.isArray(job.creditReservations) && job.creditReservations.length > 0) {
      let totalReservedForJob = 0;
      for (const alloc of job.creditReservations) {
        const lot = await TryOnCreditLot.findById(alloc.lot);
        if (!lot) {
          return { valid: false, reason: `Không tìm thấy lô credit #${alloc.lot}` };
        }
        if ((lot.reservedAmount || 0) < (alloc.amount || 1)) {
          return { valid: false, reason: `Lô credit #${alloc.lot} không đủ reservedAmount (${lot.reservedAmount})` };
        }
        totalReservedForJob += (alloc.amount || 1);
      }
      if (totalReservedForJob < (job.creditsCost || 1)) {
        return { valid: false, reason: `Tổng số credit tạm giữ (${totalReservedForJob}) nhỏ hơn chi phí phiên (${job.creditsCost})` };
      }
      return { valid: true, allocations: job.creditReservations };
    }

    const lot = await TryOnCreditLot.findById(job.creditLot);
    if (!lot) {
      return { valid: false, reason: `Không tìm thấy lô credit #${job.creditLot}` };
    }

    if ((lot.reservedAmount || 0) < (job.creditsCost || 1)) {
      return { valid: false, reason: `Lô credit #${job.creditLot} không có đủ reservedAmount (${lot.reservedAmount})` };
    }

    return { valid: true, lot };
  }

  /**
   * Process next queued jobs ONLY if they hold a non-null creditLot reservation
   */
  async processNextJobs() {
    if (this.activeWorkers >= this.maxConcurrentWorkers) return;

    const job = await TryOnJob.findOneAndUpdate(
      { status: 'QUEUED', creditLot: { $ne: null } },
      {
        $set: {
          status: 'PROCESSING',
          'timing.startedAt': new Date()
        }
      },
      {
        sort: { priority: -1, 'timing.queuedAt': 1 },
        new: true
      }
    );

    if (!job) return;

    this.activeWorkers++;
    this.executeJob(job).finally(() => {
      this.activeWorkers--;
      setImmediate(() => this.processNextJobs());
    });
  }

  /**
   * Execute single or Full Outfit job through configured AI provider adapter(s)
   */
  async executeJob(job) {
    if (job?.mode === 'FULL_OUTFIT') {
      return this.executeFullOutfitJob(job);
    }

    const startTime = Date.now();
    let providerAdapter = null;

    try {
      providerAdapter = this.virtualTryOn.getActiveProvider({ providerId: job.provider });

      // 0. Guarantee job has valid reservation BEFORE touching AI or storage
      const reservationCheck = await this.verifyJobHasValidReservation(job);
      if (!reservationCheck.valid) {
        const resErr = new Error(reservationCheck.reason || 'Thiếu xác thực tạm giữ credit hợp lệ');
        resErr.code = reservationCheck.code || 'MISSING_CREDIT_RESERVATION';
        resErr.statusCode = 402;
        throw resErr;
      }

      // 1. Load person image via secure storage service & preprocess purely in memory (never mutates original)
      const { buffer: personBuffer } = await this.storageService.getImageBuffer(job.personImageAsset, job.user, true);
      const personPrepared = await this.imageService.preprocessForTryOn(personBuffer);

      // 2. Load & preprocess product image safely via SSRF guard + 7MB Base64 limit
      const rawProductBuffer = await this.fetchProductImageBuffer(job.productImageUrl);
      const productPrepared = await this.imageService.preprocessForTryOn(rawProductBuffer);
      const productBuffer = productPrepared.buffer;
      const productBase64 = productPrepared.base64;

      // 3. Persist correlation ID & pre-dispatch timestamp BEFORE external AI call
      const clientRequestId = providerAdapter.generateRequestId(job._id);
      const unitEstimateUsd = providerAdapter.estimateCost({ sampleCount: 1 })?.estimatedTotalUsd || 0;
      job.provider = providerAdapter.providerId;
      job.providerRequestId = clientRequestId;
      job.aiProviderDetails = {
        providerId: providerAdapter.providerId,
        model: providerAdapter.modelId,
        httpStatus: 0,
        dispatchedAt: new Date(),
        estimatedCostUsd: 0,
        confirmedBillingCostUsd: null,
        unknownReconciliationCostUsd: 0,
        costStatus: 'NONE',
        providerCallsCount: 1,
        successfulCallsCount: 0,
        failedCallsCount: 0,
        indeterminateCallsCount: 0
      };
      await job.save();

      // 4. Rebuild structured AI Product Context (never sends unconfirmed prompts to VTO-001) & call AI Provider Adapter
      let executionProductContext = null;
      if (job.product && isProductIntelligenceQueryable()) {
        try {
          const [prodDoc, intelDoc] = await Promise.all([
            Product.findById(job.product),
            ProductIntelligence.findOne({ product: job.product })
          ]);
          if (prodDoc) {
            const snap = job.productSnapshot || {};
            const variantArg = (snap.variantColor || snap.variantSku || snap.variantSize)
              ? { sku: snap.variantSku, color: snap.variantColor, size: snap.variantSize }
              : null;
            executionProductContext = this.contextService.buildProductContext({
              product: prodDoc,
              intelligence: intelDoc,
              selectedVariant: variantArg,
              providerCapabilities: typeof providerAdapter.getCapabilities === 'function'
                ? providerAdapter.getCapabilities()
                : null
            });
          }
        } catch (_) {
          // Graceful fallback: execute with validated image URL even if optional enrichment lookup fails
        }
      }

      const tryOnResult = await this.virtualTryOn.predictTryOn({
        personBase64: personPrepared.base64,
        productBase64,
        sampleCount: 1,
        providerId: providerAdapter.providerId,
        clientRequestId,
        productContext: executionProductContext
      });

      // 5. Save result image to private storage
      const resultBuffer = Buffer.from(tryOnResult.resultBase64, 'base64');
      const resultAsset = await this.storageService.saveImage({
        userId: job.user,
        buffer: resultBuffer,
        mimeType: 'image/png',
        type: 'tryon_result',
        originalFilename: `tryon_${job.productName || 'kdxx'}.png`
      });

      // 6. Commit reserved credit strictly once
      await this.creditService.commitCredit(job.user, job._id, this._getCreditAllocations(job), job.creditsCost);

      // 7. Mark job COMPLETED
      const durationMs = Date.now() - startTime;
      if (!job.timing) job.timing = {};
      job.status = 'COMPLETED';
      job.resultImageAsset = resultAsset._id;
      job.providerRequestId = tryOnResult.providerRequestId || clientRequestId;
      job.timing.completedAt = new Date();
      job.timing.durationMs = durationMs;
      const stepCostUsd = tryOnResult.estimatedCostUsd ?? providerAdapter.estimateCost({ sampleCount: 1 })?.estimatedTotalUsd ?? 0;
      job.aiProviderDetails = {
        providerId: tryOnResult.providerId || providerAdapter.providerId,
        model: tryOnResult.modelId || providerAdapter.modelId,
        httpStatus: tryOnResult.httpStatus || 200,
        dispatchedAt: job.aiProviderDetails.dispatchedAt,
        estimatedCostUsd: stepCostUsd,
        confirmedBillingCostUsd: null,
        unknownReconciliationCostUsd: 0,
        costStatus: stepCostUsd > 0 ? 'ESTIMATED' : 'NONE',
        providerCallsCount: 1,
        successfulCallsCount: 1,
        failedCallsCount: 0,
        indeterminateCallsCount: 0
      };
      await job.save();
      if (isProviderConfigQueryable()) {
        await this.providerConfigService.recordProviderOutcome(providerAdapter.providerId, { ok: true }).catch(() => {});
      }
    } catch (err) {
      console.error(`❌ Virtual Try-On Job #${job._id} failed:`, err.message);
      const durationMs = Date.now() - startTime;
      if (!job.timing) job.timing = {};
      const normalized = providerAdapter && typeof providerAdapter.normalizeError === 'function'
        ? providerAdapter.normalizeError(err)
        : {
            code: err.code || 'EXECUTION_ERROR',
            statusCode: err.statusCode || 500,
            isIndeterminateTimeout: err.code === 'AI_TIMEOUT',
            providerId: job.provider || 'google-vertex-vto-001',
            modelId: job.aiProviderDetails?.model || 'virtual-try-on-001'
          };

      const wasDispatched = Boolean(job.aiProviderDetails?.dispatchedAt);
      const isIndeterminateTimeout = wasDispatched && (err.code === 'AI_TIMEOUT' || normalized.isIndeterminateTimeout);
      const potentialCallCostUsd = providerAdapter?.estimateCost?.({ sampleCount: 1 })?.estimatedTotalUsd || 0.06;

      if (isIndeterminateTimeout) {
        job.status = 'RECONCILIATION_REQUIRED';
        job.errorMessage = 'Yêu cầu tới Google Cloud vượt quá thời gian phản hồi. Hệ thống đang đối soát trạng thái trước khi xử lý credit.';
        job.reconciliation = {
          state: 'AI_TIMEOUT_UNVERIFIED',
          requiresManualAdmin: true,
          reason: err.message || 'Upstream AI request timed out',
          pendingCostUsd: potentialCallCostUsd,
          costStatus: 'UNKNOWN_PENDING_RECONCILIATION',
          detectedAt: new Date()
        };
      } else if (err.code === 'CREDIT_RECONCILIATION_REQUIRED') {
        job.status = 'RECONCILIATION_REQUIRED';
        job.errorMessage = err.message;
        job.reconciliation = {
          state: 'UNVERIFIABLE',
          requiresManualAdmin: true,
          reason: err.message,
          pendingCostUsd: 0,
          costStatus: 'NONE',
          detectedAt: new Date()
        };
      } else {
        job.status = 'FAILED';
        job.errorMessage = err.message;
        const missingReservation =
          err.code === 'MISSING_CREDIT_RESERVATION' ||
          err.code === 'ALREADY_COMMITTED' ||
          err.code === 'ALREADY_REFUNDED';
        if (this._hasCreditReservation(job) && !missingReservation) {
          try {
            await this.creditService.refundCredit(job.user, job._id, this._getCreditAllocations(job), err.message, job.creditsCost);
          } catch (rfErr) {
            if (rfErr.code === 'CREDIT_RECONCILIATION_REQUIRED') {
              job.status = 'RECONCILIATION_REQUIRED';
              job.reconciliation = {
                state: 'UNVERIFIABLE',
                requiresManualAdmin: true,
                reason: rfErr.message,
                pendingCostUsd: 0,
                costStatus: 'NONE',
                detectedAt: new Date()
              };
            } else {
              throw rfErr;
            }
          }
        }
      }

      job.errorCode = normalized.code || err.code || 'EXECUTION_ERROR';
      job.timing.completedAt = new Date();
      job.timing.durationMs = durationMs;
      job.aiProviderDetails = {
        providerId: normalized.providerId || job.aiProviderDetails?.providerId || 'google-vertex-vto-001',
        model: normalized.modelId || job.aiProviderDetails?.model || 'virtual-try-on-001',
        httpStatus: normalized.statusCode || err.statusCode || 500,
        dispatchedAt: job.aiProviderDetails?.dispatchedAt || null,
        estimatedCostUsd: 0,
        confirmedBillingCostUsd: null,
        unknownReconciliationCostUsd: isIndeterminateTimeout ? potentialCallCostUsd : 0,
        costStatus: isIndeterminateTimeout ? 'UNKNOWN_PENDING_RECONCILIATION' : 'NONE',
        providerCallsCount: wasDispatched ? 1 : 0,
        successfulCallsCount: 0,
        failedCallsCount: (wasDispatched && !isIndeterminateTimeout) ? 1 : 0,
        indeterminateCallsCount: isIndeterminateTimeout ? 1 : 0
      };
      await job.save();
      if (isProviderConfigQueryable() && providerAdapter?.providerId) {
        await this.providerConfigService.recordProviderOutcome(providerAdapter.providerId, {
          ok: false,
          errorCode: job.errorCode,
          errorMessage: err.message,
          category: job.productSnapshot?.category?.subCategory || ''
        }).catch(() => {});
      }
    }
  }

  _summarizeFullOutfitTelemetry(job, providerAdapter = null) {
    const steps = Array.isArray(job?.executionSteps) ? job.executionSteps : [];
    let providerCallsCount = 0;
    let successfulCallsCount = 0;
    let failedCallsCount = 0;
    let indeterminateCallsCount = 0;
    let estimatedCostUsd = 0;
    let unknownReconciliationCostUsd = 0;

    for (const s of steps) {
      const wasDispatched = Boolean(
        s.dispatchedAt || s.providerRequestId || s.status === 'COMPLETED' || s.status === 'RECONCILIATION_REQUIRED'
      );
      if (wasDispatched) {
        providerCallsCount += 1;
        if (s.status === 'COMPLETED') {
          successfulCallsCount += 1;
        } else if (s.status === 'RECONCILIATION_REQUIRED') {
          indeterminateCallsCount += 1;
        } else if (s.status === 'FAILED') {
          failedCallsCount += 1;
        }
      }
      estimatedCostUsd += Number(s.estimatedCostUsd || 0);
      unknownReconciliationCostUsd += Number(s.pendingReconciliationCostUsd || 0);
    }

    let costStatus = 'NONE';
    if (unknownReconciliationCostUsd > 0 && estimatedCostUsd > 0) {
      costStatus = 'PARTIAL_UNKNOWN';
    } else if (unknownReconciliationCostUsd > 0) {
      costStatus = 'UNKNOWN_PENDING_RECONCILIATION';
    } else if (estimatedCostUsd > 0) {
      costStatus = 'ESTIMATED';
    }

    return {
      providerId: providerAdapter?.providerId || job?.aiProviderDetails?.providerId || job?.provider || 'google-vertex-vto-001',
      model: providerAdapter?.modelId || job?.aiProviderDetails?.model || '',
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      confirmedBillingCostUsd: null,
      unknownReconciliationCostUsd: Number(unknownReconciliationCostUsd.toFixed(4)),
      costStatus,
      providerCallsCount,
      successfulCallsCount,
      failedCallsCount,
      indeterminateCallsCount
    };
  }

  /**
   * Execute a validated 2-piece Full Outfit sequential job via Provider Registry & Adapter contract.
   * Preserves completed step state, stores intermediate private assets (<= 72h TTL), inspects output quality,
   * never re-runs already dispatched steps, and refunds full 2 credits if Step 2 fails.
   */
  async executeFullOutfitJob(job) {
    const startTime = Date.now();
    let currentStepIndex = -1;
    let currentStepDispatchStartMs = 0;
    let currentProviderAdapter = null;
    let totalEstimatedUsd = 0;
    const isBenchmarkJob = Boolean(job?.benchmark?.isBenchmark);

    try {
      const reservationCheck = await this.verifyJobHasValidReservation(job);
      if (!reservationCheck.valid) {
        const resErr = new Error(reservationCheck.reason || 'Thiếu xác thực tạm giữ credit hợp lệ');
        resErr.code = reservationCheck.code || 'MISSING_CREDIT_RESERVATION';
        resErr.statusCode = 402;
        throw resErr;
      }

      if (!Array.isArray(job.outfitItems) || job.outfitItems.length !== 2) {
        const err = new Error('Dữ liệu outfitItems của phiên Full Outfit không hợp lệ.');
        err.code = 'INVALID_OUTFIT_ITEMS';
        err.statusCode = 400;
        throw err;
      }

      if (!Array.isArray(job.executionSteps) || job.executionSteps.length !== 2) {
        job.executionSteps = job.outfitItems.map((item, idx) => ({
          stepIndex: idx,
          slot: item.slot,
          product: item.product,
          productName: item.productName,
          providerId: job.provider,
          modelId: job.aiProviderDetails?.model || '',
          dispatchedAt: null,
          status: 'PENDING'
        }));
      }

      const { buffer: originalRawBuffer } = await this.storageService.getImageBuffer(job.personImageAsset, job.user, true);
      const originalPrepared = await this.imageService.preprocessForTryOn(originalRawBuffer);

      let currentPersonBuffer = originalPrepared.buffer;
      let currentPersonBase64 = originalPrepared.base64;
      let currentInputAssetId = job.personImageAsset;
      let intermediateBuffer = null;
      let finalResultBuffer = null;

      for (let i = 0; i < job.outfitItems.length; i++) {
        currentStepIndex = i;
        const item = job.outfitItems[i];
        const stepRecord = job.executionSteps[i];
        if (typeof stepRecord.estimatedCostUsd === 'number') {
          totalEstimatedUsd += stepRecord.estimatedCostUsd;
        }

        // Resumption safeguard: never re-run an already completed step with a valid private output asset
        if (stepRecord.status === 'COMPLETED' && stepRecord.outputAssetId) {
          const { buffer: existingStepBuf } = await this.storageService.getImageBuffer(stepRecord.outputAssetId, job.user, true);
          const stepPrepared = await this.imageService.preprocessForTryOn(existingStepBuf);
          currentPersonBuffer = stepPrepared.buffer;
          currentPersonBase64 = stepPrepared.base64;
          currentInputAssetId = stepRecord.outputAssetId;
          if (i === 0) intermediateBuffer = stepPrepared.buffer;
          if (i === 1) finalResultBuffer = stepPrepared.buffer;
          continue;
        }

        // Dispatch safeguard: never blindly re-dispatch an indeterminate step after restart
        if (stepRecord.dispatchedAt && stepRecord.status !== 'PENDING') {
          const err = new Error(`Bước ${i + 1} (${item.slot}) đã gửi yêu cầu tới AI trước đó; chuyển sang đối soát.`);
          err.code = 'STEP_ALREADY_DISPATCHED';
          err.isIndeterminateTimeout = true;
          err.statusCode = 409;
          throw err;
        }

        const stepCategory = item.productSnapshot?.normalizedSubCategory || (item.slot === 'BOTTOM' ? 'pants' : 'tops');
        currentProviderAdapter = this.virtualTryOn.getActiveProvider({
          providerId: stepRecord.providerId || job.provider,
          category: stepCategory,
          domain: 'clothing',
          subCategory: stepCategory
        });

        const rawProductBuffer = await this.fetchProductImageBuffer(item.productImageUrl);
        const productPrepared = await this.imageService.preprocessForTryOn(rawProductBuffer);
        const productBuffer = productPrepared.buffer;
        const productBase64 = productPrepared.base64;

        const stepClientRequestId = typeof currentProviderAdapter.generateRequestId === 'function'
          ? currentProviderAdapter.generateRequestId(`${job._id}_step${i}`)
          : `${job._id}_step${i}_${Date.now()}`;

        const stepUnitCost = currentProviderAdapter?.estimateCost?.({ sampleCount: 1 })?.estimatedTotalUsd ?? 0.06;

        // Phase 6.1: Cost Guard & Emergency Stop check immediately before EVERY step dispatch
        if (isBenchmarkJob) {
          await this.benchmarkGate.assertDispatchAllowed({
            jobId: job._id,
            stepIndex: i,
            slot: item.slot,
            providerId: currentProviderAdapter.providerId,
            unitCostUsd: stepUnitCost,
            isBenchmark: true
          });
        }

        currentStepDispatchStartMs = Date.now();
        stepRecord.status = 'PROCESSING';
        stepRecord.providerId = currentProviderAdapter.providerId;
        stepRecord.modelId = currentProviderAdapter.modelId;
        stepRecord.providerRequestId = stepClientRequestId;
        stepRecord.dispatchedAt = new Date();
        stepRecord.inputAssetId = currentInputAssetId;
        stepRecord.estimatedCostUsd = 0;
        stepRecord.confirmedCostUsd = null;
        stepRecord.pendingReconciliationCostUsd = 0;
        stepRecord.costStatus = 'NONE';

        if (isBenchmarkJob) {
          await this.benchmarkGate.recordStepDispatched({ jobId: job._id, stepIndex: i });
        }

        const preDispatchSummary = this._summarizeFullOutfitTelemetry(job, currentProviderAdapter);
        job.provider = currentProviderAdapter.providerId;
        job.providerRequestId = stepClientRequestId;
        job.aiProviderDetails = {
          ...preDispatchSummary,
          httpStatus: 0,
          dispatchedAt: stepRecord.dispatchedAt
        };
        await job.save();

        const stepResult = await this.virtualTryOn.predictTryOn({
          personBase64: currentPersonBase64,
          productBase64,
          sampleCount: 1,
          providerId: currentProviderAdapter.providerId,
          clientRequestId: stepClientRequestId,
          productContext: item.productSnapshot || null
        });

        const stepOutputBuffer = Buffer.from(stepResult.resultBase64, 'base64');
        const isFinalStep = i === job.outfitItems.length - 1;
        const savedAsset = await this.storageService.saveImage({
          userId: job.user,
          buffer: stepOutputBuffer,
          mimeType: 'image/png',
          type: isFinalStep ? 'tryon_result' : 'tryon_intermediate',
          originalFilename: isFinalStep
            ? `tryon_fulloutfit_${job._id}.png`
            : `tryon_step${i + 1}_${item.slot.toLowerCase()}_${job._id}.png`
        });

        const stepCostUsd = stepResult.estimatedCostUsd ?? currentProviderAdapter.estimateCost({ sampleCount: 1 })?.estimatedTotalUsd ?? 0;

        stepRecord.status = 'COMPLETED';
        stepRecord.providerRequestId = stepResult.providerRequestId || stepClientRequestId;
        stepRecord.completedAt = new Date();
        stepRecord.durationMs = Math.max(0, Date.now() - currentStepDispatchStartMs);
        stepRecord.outputAssetId = savedAsset._id;
        stepRecord.httpStatus = stepResult.httpStatus || 200;
        stepRecord.estimatedCostUsd = stepCostUsd;
        stepRecord.confirmedCostUsd = null;
        stepRecord.pendingReconciliationCostUsd = 0;
        stepRecord.costStatus = stepCostUsd > 0 ? 'ESTIMATED' : 'NONE';
        await job.save();

        if (isBenchmarkJob) {
          await this.benchmarkGate.recordStepOutcome({
            jobId: job._id,
            stepIndex: i,
            ok: true,
            unitCostUsd: stepCostUsd
          });
        }

        if (!isFinalStep) {
          const nextPrepared = await this.imageService.preprocessForTryOn(stepOutputBuffer);
          intermediateBuffer = nextPrepared.buffer;
          currentPersonBuffer = nextPrepared.buffer;
          currentPersonBase64 = nextPrepared.base64;
          currentInputAssetId = savedAsset._id;
        } else {
          finalResultBuffer = stepOutputBuffer;
          job.resultImageAsset = savedAsset._id;
        }
      }

      // Mandatory post-generation visual/structural quality inspection
      job.resultQualityCheck = await fullOutfitValidator.inspectFullOutfitResultQuality({
        originalBuffer: originalPrepared.buffer,
        intermediateBuffer,
        finalBuffer: finalResultBuffer
      });

      if (job.resultQualityCheck.status === 'FAILED') {
        const qErr = new Error(job.resultQualityCheck.notes || 'Ảnh kết quả Full Outfit không vượt qua kiểm tra chất lượng tối thiểu.');
        qErr.code = 'QUALITY_CHECK_FAILED';
        qErr.statusCode = 422;
        throw qErr;
      }

      // Commit full server-computed 2 credits strictly once
      await this.creditService.commitCredit(job.user, job._id, this._getCreditAllocations(job), job.creditsCost);

      const durationMs = Date.now() - startTime;
      if (!job.timing) job.timing = {};
      job.status = 'COMPLETED';
      job.timing.completedAt = new Date();
      job.timing.durationMs = durationMs;
      const finalTelemetry = this._summarizeFullOutfitTelemetry(job, currentProviderAdapter);
      job.aiProviderDetails = {
        ...finalTelemetry,
        httpStatus: 200,
        dispatchedAt: job.aiProviderDetails?.dispatchedAt || new Date()
      };
      await job.save();

      if (isProviderConfigQueryable() && currentProviderAdapter?.providerId) {
        await this.providerConfigService.recordProviderOutcome(currentProviderAdapter.providerId, { ok: true }).catch(() => {});
      }
    } catch (err) {
      console.error(`❌ Full Outfit Job #${job._id} failed at step ${currentStepIndex}:`, err.message);
      const durationMs = Date.now() - startTime;
      if (!job.timing) job.timing = {};

      const normalized = currentProviderAdapter && typeof currentProviderAdapter.normalizeError === 'function'
        ? currentProviderAdapter.normalizeError(err)
        : {
            code: err.code || 'EXECUTION_ERROR',
            statusCode: err.statusCode || 500,
            isIndeterminateTimeout: err.code === 'AI_TIMEOUT' || Boolean(err.isIndeterminateTimeout),
            providerId: job.provider || 'google-vertex-vto-001',
            modelId: job.aiProviderDetails?.model || ''
          };

      const failingStep = currentStepIndex >= 0 && Array.isArray(job.executionSteps)
        ? job.executionSteps[currentStepIndex]
        : null;
      const stepDispatched = Boolean(failingStep?.dispatchedAt);
      const isIndeterminate = (Boolean(err.isIndeterminateTimeout || normalized.isIndeterminateTimeout) && stepDispatched) ||
        err.code === 'CREDIT_RECONCILIATION_REQUIRED';
      const stepUnitCost = currentProviderAdapter?.estimateCost?.({ sampleCount: 1 })?.estimatedTotalUsd ?? 0.06;
      const isEmergencyStop = Boolean(err.isEmergencyStop || err.code === 'BENCHMARK_EMERGENCY_STOPPED');
      const isBudgetExceeded = Boolean(err.isBudgetExceeded || err.code === 'BENCHMARK_BUDGET_EXCEEDED');

      if (isEmergencyStop || isBudgetExceeded) {
        if (failingStep && failingStep.status !== 'COMPLETED') {
          failingStep.status = 'FAILED';
          failingStep.errorCode = isEmergencyStop ? 'EMERGENCY_STOPPED' : 'BENCHMARK_BUDGET_EXCEEDED';
          failingStep.errorMessage = isEmergencyStop
            ? 'Bước này bị dừng khẩn cấp bởi Admin trước khi gửi yêu cầu tới AI.'
            : 'Bước này bị dừng do đạt ngưỡng ngân sách Benchmark (0.20 USD).';
          failingStep.httpStatus = isEmergencyStop ? 409 : 429;
          failingStep.dispatchedAt = null;
          failingStep.completedAt = new Date();
          failingStep.durationMs = 0;
          failingStep.estimatedCostUsd = 0;
          failingStep.confirmedCostUsd = null;
          failingStep.pendingReconciliationCostUsd = 0;
          failingStep.costStatus = 'NONE';
        }

        const recSummary = this._summarizeFullOutfitTelemetry(job, currentProviderAdapter);
        job.status = 'RECONCILIATION_REQUIRED';
        job.errorCode = isEmergencyStop ? 'EMERGENCY_STOPPED' : 'BENCHMARK_BUDGET_EXCEEDED';
        job.errorMessage = isEmergencyStop
          ? `Phiên Benchmark bị dừng khẩn cấp bởi Admin tại Bước ${currentStepIndex + 1} (${failingStep?.slot || 'OUTFIT'}).`
          : `Phiên Benchmark chạm giới hạn ngân sách an toàn tại Bước ${currentStepIndex + 1} (${failingStep?.slot || 'OUTFIT'}).`;
        job.reconciliation = {
          state: isEmergencyStop ? 'EMERGENCY_STOPPED_UNSETTLED' : 'BUDGET_EXCEEDED_UNSETTLED',
          requiresManualAdmin: true,
          reason: job.errorMessage,
          pendingCostUsd: recSummary.unknownReconciliationCostUsd,
          costStatus: recSummary.costStatus,
          detectedAt: new Date()
        };

        if (isBenchmarkJob && !stepDispatched) {
          await this.benchmarkGate.recordStepOutcome({
            jobId: job._id,
            stepIndex: currentStepIndex,
            ok: false,
            isIndeterminate: false,
            error: job.errorMessage,
            unitCostUsd: stepUnitCost
          }).catch(() => {});
        }
      } else if (failingStep && failingStep.status !== 'COMPLETED') {
        failingStep.status = isIndeterminate ? 'RECONCILIATION_REQUIRED' : 'FAILED';
        failingStep.errorCode = normalized.code || err.code || 'EXECUTION_ERROR';
        failingStep.errorMessage = err.message;
        failingStep.httpStatus = normalized.statusCode || err.statusCode || 500;
        failingStep.completedAt = new Date();
        failingStep.durationMs = currentStepDispatchStartMs ? Math.max(0, Date.now() - currentStepDispatchStartMs) : 0;
        failingStep.estimatedCostUsd = 0;
        failingStep.confirmedCostUsd = null;
        if (isIndeterminate && stepDispatched) {
          failingStep.pendingReconciliationCostUsd = stepUnitCost;
          failingStep.costStatus = 'UNKNOWN_PENDING_RECONCILIATION';
        } else {
          failingStep.pendingReconciliationCostUsd = 0;
          failingStep.costStatus = 'NONE';
        }
      }

      if (isEmergencyStop || isBudgetExceeded) {
        // Handled above: job status is already set to RECONCILIATION_REQUIRED with exact audit snapshot
      } else if (isIndeterminate) {
        if (isBenchmarkJob) {
          await this.benchmarkGate.recordStepOutcome({
            jobId: job._id,
            stepIndex: currentStepIndex,
            ok: false,
            isIndeterminate: true,
            error: err.message,
            unitCostUsd: stepUnitCost
          }).catch(() => {});
        }

        const recSummary = this._summarizeFullOutfitTelemetry(job, currentProviderAdapter);
        job.status = 'RECONCILIATION_REQUIRED';
        job.errorMessage = err.code === 'CREDIT_RECONCILIATION_REQUIRED'
          ? err.message
          : `Bước ${currentStepIndex + 1} (${failingStep?.slot || 'OUTFIT'}) vượt thời gian phản hồi từ AI. Phiên đang chờ đối soát.`;
        job.reconciliation = {
          state: err.code === 'CREDIT_RECONCILIATION_REQUIRED' ? 'UNVERIFIABLE' : 'AI_TIMEOUT_UNVERIFIED',
          requiresManualAdmin: true,
          reason: err.message || 'Upstream Full Outfit step timed out',
          pendingCostUsd: recSummary.unknownReconciliationCostUsd,
          costStatus: recSummary.costStatus,
          detectedAt: new Date()
        };
      } else {
        if (isBenchmarkJob && !stepDispatched) {
          await this.benchmarkGate.recordStepOutcome({
            jobId: job._id,
            stepIndex: currentStepIndex,
            ok: false,
            isIndeterminate: false,
            error: err.message,
            unitCostUsd: stepUnitCost
          }).catch(() => {});
        }

        job.status = 'FAILED';
        job.errorMessage = err.message;
        const missingReservation =
          err.code === 'MISSING_CREDIT_RESERVATION' ||
          err.code === 'ALREADY_COMMITTED' ||
          err.code === 'ALREADY_REFUNDED';
        // Product policy: full 2-credit refund whenever complete Full Outfit image is not delivered
        if (this._hasCreditReservation(job) && !missingReservation) {
          try {
            await this.creditService.refundCredit(
              job.user,
              job._id,
              this._getCreditAllocations(job),
              err.message,
              job.creditsCost
            );
          } catch (rfErr) {
            if (rfErr.code === 'CREDIT_RECONCILIATION_REQUIRED') {
              job.status = 'RECONCILIATION_REQUIRED';
              job.errorMessage = rfErr.message;
              job.reconciliation = {
                state: 'UNVERIFIABLE',
                requiresManualAdmin: true,
                reason: rfErr.message,
                pendingCostUsd: 0,
                costStatus: 'NONE',
                detectedAt: new Date()
              };
            } else {
              throw rfErr;
            }
          }
        }
      }

      const failTelemetry = this._summarizeFullOutfitTelemetry(job, currentProviderAdapter);
      if (!isEmergencyStop && !isBudgetExceeded) {
        job.errorCode = normalized.code || err.code || 'EXECUTION_ERROR';
      }
      job.timing.completedAt = new Date();
      job.timing.durationMs = durationMs;
      job.aiProviderDetails = {
        ...failTelemetry,
        providerId: normalized.providerId || failTelemetry.providerId,
        model: normalized.modelId || failTelemetry.model,
        httpStatus: normalized.statusCode || err.statusCode || 500,
        dispatchedAt: job.aiProviderDetails?.dispatchedAt || null
      };
      await job.save();
    }
  }

  /**
   * Cancel job by user if still queued or stuck > 15 minutes
   */
  async cancelJob(jobId, userId) {
    const job = await TryOnJob.findOne({ _id: jobId, user: userId });
    if (!job) {
      const err = new Error('Không tìm thấy phiên thử đồ');
      err.statusCode = 404;
      throw err;
    }

    if (job.status === 'COMPLETED') {
      const err = new Error('Phiên thử đồ đã hoàn tất, không thể hủy');
      err.statusCode = 400;
      throw err;
    }

    if (job.status === 'RECONCILIATION_REQUIRED') {
      const err = new Error('Phiên thử đồ đang ở trạng thái đối soát với Google Cloud. Không thể hủy thủ công lúc này.');
      err.code = 'JOB_IN_RECONCILIATION';
      err.statusCode = 409;
      throw err;
    }

    if (job.status === 'PROCESSING') {
      const waitedMs = Date.now() - new Date(job.timing.queuedAt).getTime();
      if (waitedMs < 15 * 60 * 1000) {
        const err = new Error('Phiên thử đồ đang được AI xử lý trên Google Cloud. Vui lòng chờ trong giây lát.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (!job.timing) job.timing = {};
    job.status = 'CANCELLED';
    job.errorMessage = 'Người dùng đã hủy phiên thử đồ';
    job.timing.completedAt = new Date();
    await job.save();

    if (this._hasCreditReservation(job)) {
      await this.creditService.refundCredit(
        userId,
        job._id,
        this._getCreditAllocations(job),
        'Người dùng hủy phiên',
        job.creditsCost
      );
    }

    return job;
  }

  /**
   * Safe recovery for jobs interrupted by server restart.
   * - PENDING without valid credit reservation -> FAILED (never auto-queued!)
   * - PROCESSING after provider dispatch -> RECONCILIATION_REQUIRED (never blindly re-calls AI or auto-refunds!)
   * - PROCESSING crashed strictly before provider dispatch with valid reservation -> QUEUED
   */
  async recoverStuckJobs() {
    const summary = {
      requeued: 0,
      failedMissingReservation: 0,
      movedToReconciliation: 0,
      repairedCompleted: 0,
      repairedFailed: 0
    };

    try {
      if (typeof this.creditService.recoverIncompleteSettlements === 'function') {
        await this.creditService.recoverIncompleteSettlements().catch(() => {});
      }

      const stuckJobs = await TryOnJob.find({
        status: { $in: ['PROCESSING', 'PENDING'] }
      });

      for (const job of stuckJobs) {
        if (!job.timing) job.timing = {};
        if (job.status === 'PENDING') {
          const reservationCheck = await this.verifyJobHasValidReservation(job);
          if (reservationCheck.valid) {
            console.log(`⚠️ [Recovery] Re-queueing PENDING job #${job._id} with valid credit reservation #${job.creditLot}`);
            job.status = 'QUEUED';
            await job.save();
            summary.requeued++;
          } else {
            console.warn(`🛡️ [Recovery] Rejecting PENDING job #${job._id} without valid credit reservation: ${reservationCheck.reason}`);
            job.status = 'FAILED';
            job.errorCode = 'RESERVATION_MISSING_ON_BOOT';
            job.errorMessage = 'Phiên xử lý bị gián đoạn trước khi hoàn tất giữ credit hợp lệ.';
            job.timing.completedAt = new Date();
            await job.save();
            summary.failedMissingReservation++;
          }
          continue;
        }

        if (job.status === 'PROCESSING') {
          const existingCommit = await TryOnCreditLedger.findOne({ idempotencyKey: `COMMIT_${job._id}` });
          if (existingCommit && job.resultImageAsset) {
            job.status = 'COMPLETED';
            job.timing.completedAt = job.timing.completedAt || new Date();
            await job.save();
            summary.repairedCompleted++;
            continue;
          }

          const existingRefund = await TryOnCreditLedger.findOne({ idempotencyKey: `REFUND_${job._id}` });
          if (existingRefund) {
            job.status = 'FAILED';
            job.timing.completedAt = job.timing.completedAt || new Date();
            await job.save();
            summary.repairedFailed++;
            continue;
          }

          const isFullOutfit = job.mode === 'FULL_OUTFIT' && Array.isArray(job.executionSteps) && job.executionSteps.length > 0;
          const midFlightStep = isFullOutfit
            ? job.executionSteps.find(s => s.status === 'PROCESSING' && (s.dispatchedAt || s.providerRequestId))
            : null;
          const wasDispatched = isFullOutfit
            ? Boolean(midFlightStep)
            : Boolean(job.aiProviderDetails?.dispatchedAt || job.providerRequestId);

          if (wasDispatched) {
            if (midFlightStep) {
              midFlightStep.status = 'RECONCILIATION_REQUIRED';
              midFlightStep.errorCode = 'RESTART_MID_FLIGHT';
              midFlightStep.errorMessage = 'Server khởi động lại trong lúc bước này đang chờ AI phản hồi.';
              midFlightStep.estimatedCostUsd = 0;
              midFlightStep.confirmedCostUsd = null;
              midFlightStep.pendingReconciliationCostUsd = midFlightStep.pendingReconciliationCostUsd || 0.06;
              midFlightStep.costStatus = 'UNKNOWN_PENDING_RECONCILIATION';
            }
            console.warn(`🔎 [Recovery] PROCESSING job #${job._id} was interrupted mid-flight (req=${midFlightStep?.providerRequestId || job.providerRequestId}). Moving to RECONCILIATION_REQUIRED.`);
            job.status = 'RECONCILIATION_REQUIRED';
            job.errorCode = 'RESTART_MID_FLIGHT';
            job.errorMessage = 'Hệ thống khởi động lại khi đang chờ phản hồi từ nhà cung cấp AI. Phiên đang được đối soát trạng thái trước khi xử lý credit.';
            job.timing.completedAt = new Date();
            if (isFullOutfit) {
              const recSummary = this._summarizeFullOutfitTelemetry(job);
              job.aiProviderDetails = {
                ...recSummary,
                httpStatus: job.aiProviderDetails?.httpStatus || 0,
                dispatchedAt: job.aiProviderDetails?.dispatchedAt || midFlightStep?.dispatchedAt || new Date()
              };
              job.reconciliation = {
                state: 'UNVERIFIED_AFTER_RESTART',
                requiresManualAdmin: true,
                reason: 'Worker terminated after dispatching AI request; provider outcome unknown.',
                pendingCostUsd: recSummary.unknownReconciliationCostUsd,
                costStatus: recSummary.costStatus,
                detectedAt: new Date()
              };
            } else {
              const pendingUsd = job.reconciliation?.pendingCostUsd || 0.06;
              job.aiProviderDetails = {
                ...(job.aiProviderDetails || {}),
                estimatedCostUsd: 0,
                confirmedBillingCostUsd: null,
                unknownReconciliationCostUsd: pendingUsd,
                costStatus: 'UNKNOWN_PENDING_RECONCILIATION',
                providerCallsCount: 1,
                indeterminateCallsCount: 1
              };
              job.reconciliation = {
                state: 'UNVERIFIED_AFTER_RESTART',
                requiresManualAdmin: true,
                reason: 'Worker terminated after dispatching AI request; provider outcome unknown.',
                pendingCostUsd: pendingUsd,
                costStatus: 'UNKNOWN_PENDING_RECONCILIATION',
                detectedAt: new Date()
              };
            }
            await job.save();
            summary.movedToReconciliation++;
          } else {
            const reservationCheck = await this.verifyJobHasValidReservation(job);
            if (reservationCheck.valid) {
              console.log(`⚠️ [Recovery] PROCESSING job #${job._id} failed prior to AI dispatch. Safely re-queueing.`);
              job.status = 'QUEUED';
              await job.save();
              summary.requeued++;
            } else {
              job.status = 'FAILED';
              job.errorCode = 'RESERVATION_MISSING_ON_BOOT';
              job.errorMessage = 'Phiên xử lý thiếu tạm giữ credit hợp lệ sau khởi động lại.';
              job.timing.completedAt = new Date();
              await job.save();
              summary.failedMissingReservation++;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error recovering stuck try-on jobs:', e.message);
    }

    return summary;
  }

  /**
   * Automated or pluggable verification hook for RECONCILIATION_REQUIRED jobs.
   * Never retries AI prediction and never auto-refunds if outcome is unverifiable.
   */
  async reconcileJob(jobId, providerVerifier = null) {
    const job = await TryOnJob.findById(jobId);
    if (!job) {
      const err = new Error('Không tìm thấy phiên thử đồ để đối soát');
      err.statusCode = 404;
      throw err;
    }

    if (job.status !== 'RECONCILIATION_REQUIRED') {
      return { status: job.status, reconciled: false, reason: 'Job không ở trạng thái RECONCILIATION_REQUIRED', job };
    }

    let verification;
    if (typeof providerVerifier === 'function') {
      verification = await providerVerifier(job);
    } else {
      verification = {
        outcome: 'UNVERIFIABLE',
        reason: 'Google Cloud virtual-try-on-001 sync :predict không hỗ trợ truy vấn lại kết quả sau timeout; cần Admin kiểm tra trước khi chốt hoặc hoàn credit.'
      };
    }

    const now = new Date();

    if (verification.outcome === 'PROVIDER_UNPROCESSED') {
      const claimed = await TryOnJob.findOneAndUpdate(
        { _id: job._id, status: 'RECONCILIATION_REQUIRED' },
        {
          $set: {
            status: 'FAILED',
            errorMessage: `[Đối soát tự động — Nhà cung cấp chưa xử lý] ${verification.reason || 'Chưa nhận yêu cầu'}`,
            'reconciliation.state': 'PROVIDER_UNPROCESSED',
            'reconciliation.requiresManualAdmin': false,
            'reconciliation.verifiedAt': now,
            'reconciliation.resolvedAt': now,
            'reconciliation.resolutionAction': 'refund',
            'reconciliation.resolutionNote': verification.reason || 'Verified unprocessed at provider'
          }
        },
        { new: true }
      );

      if (!claimed) {
        return { status: 'CONFLICT', reconciled: false, job: await TryOnJob.findById(job._id) };
      }

      if (this._hasCreditReservation(claimed)) {
        await this.creditService.refundCredit(
          claimed.user,
          claimed._id,
          this._getCreditAllocations(claimed),
          verification.reason || 'Provider confirmed unprocessed',
          claimed.creditsCost
        );
      }

      return { status: claimed.status, outcome: 'PROVIDER_UNPROCESSED', reconciled: true, job: claimed };
    }

    if (verification.outcome === 'PROVIDER_PROCESSED' && verification.resultBase64) {
      const claimed = await TryOnJob.findOneAndUpdate(
        { _id: job._id, status: 'RECONCILIATION_REQUIRED' },
        {
          $set: {
            status: 'COMPLETED',
            errorMessage: '',
            'reconciliation.state': 'PROVIDER_PROCESSED',
            'reconciliation.requiresManualAdmin': false,
            'reconciliation.verifiedAt': now,
            'reconciliation.resolvedAt': now,
            'reconciliation.resolutionAction': 'commit',
            'reconciliation.resolutionNote': verification.reason || 'Verified processed with recovered result'
          }
        },
        { new: true }
      );

      if (!claimed) {
        return { status: 'CONFLICT', reconciled: false, job: await TryOnJob.findById(job._id) };
      }

      const resultBuffer = Buffer.from(verification.resultBase64, 'base64');
      const resultAsset = await this.storageService.saveImage({
        userId: claimed.user,
        buffer: resultBuffer,
        mimeType: 'image/png',
        type: 'tryon_result',
        originalFilename: `tryon_reconciled_${claimed.productName || 'kdxx'}.png`
      });
      claimed.resultImageAsset = resultAsset._id;
      await claimed.save();

      if (this._hasCreditReservation(claimed)) {
        await this.creditService.commitCredit(claimed.user, claimed._id, this._getCreditAllocations(claimed), claimed.creditsCost);
      }

      return { status: claimed.status, outcome: 'PROVIDER_PROCESSED', reconciled: true, job: claimed };
    }

    // UNVERIFIABLE -> remain in RECONCILIATION_REQUIRED and flag for Admin manual handling
    job.reconciliation = {
      ...(job.reconciliation || {}),
      state: 'UNVERIFIABLE',
      requiresManualAdmin: true,
      verifiedAt: now,
      reason: verification.reason || 'Cannot verify upstream provider status automatically'
    };
    await job.save();

    return {
      status: job.status,
      outcome: 'UNVERIFIABLE',
      reconciled: false,
      requiresManualAdmin: true,
      job
    };
  }

  /**
   * Admin manual resolution for RECONCILIATION_REQUIRED jobs with strict once-only atomic settlement
   */
  async adminResolveReconciliation({ jobId, adminUserId, action, reason }) {
    if (action !== 'refund' && action !== 'commit') {
      const err = new Error('Hành động đối soát chỉ chấp nhận "refund" hoặc "commit"');
      err.code = 'INVALID_RECONCILE_ACTION';
      err.statusCode = 400;
      throw err;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      const err = new Error('Vui lòng nhập lý do đối soát tối thiểu 5 ký tự để ghi nhận audit log');
      err.code = 'INVALID_RECONCILE_REASON';
      err.statusCode = 400;
      throw err;
    }

    const cleanReason = reason.trim();
    const now = new Date();
    const existingJob = await TryOnJob.findById(jobId);

    if (!existingJob) {
      const err = new Error('Không tìm thấy phiên thử đồ');
      err.code = 'JOB_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (existingJob.status !== 'RECONCILIATION_REQUIRED') {
      const err = new Error(`Phiên #${jobId} hiện ở trạng thái "${existingJob.status}" và đã được xử lý đối soát trước đó.`);
      err.code = 'JOB_ALREADY_RESOLVED';
      err.statusCode = 409;
      throw err;
    }

    const targetStatus = action === 'refund'
      ? 'FAILED'
      : (existingJob.resultImageAsset ? 'COMPLETED' : 'FAILED');
    const targetReconcileState = action === 'refund' ? 'RESOLVED_REFUNDED' : 'RESOLVED_COMMITTED';
    const targetErrorMessage = action === 'refund'
      ? `[Admin đối soát — Hoàn credit] ${cleanReason}`
      : (existingJob.resultImageAsset ? '' : `[Admin đối soát — Đã chốt trừ credit] ${cleanReason}`);

    const lockedJob = await TryOnJob.findOneAndUpdate(
      { _id: jobId, status: 'RECONCILIATION_REQUIRED' },
      {
        $set: {
          status: targetStatus,
          errorCode: action === 'refund' ? 'RECONCILED_REFUND' : 'RECONCILED_COMMIT',
          errorMessage: targetErrorMessage,
          'reconciliation.state': targetReconcileState,
          'reconciliation.requiresManualAdmin': false,
          'reconciliation.resolvedAt': now,
          'reconciliation.resolvedBy': adminUserId,
          'reconciliation.resolutionAction': action,
          'reconciliation.resolutionNote': cleanReason
        }
      },
      { new: true }
    );

    if (!lockedJob) {
      const err = new Error('Phiên đã được đối soát bởi một quản trị viên khác');
      err.code = 'JOB_ALREADY_RESOLVED';
      err.statusCode = 409;
      throw err;
    }

    let creditResult = null;
    if (this._hasCreditReservation(lockedJob)) {
      const allocs = this._getCreditAllocations(lockedJob);
      if (action === 'refund') {
        creditResult = await this.creditService.refundCredit(
          lockedJob.user,
          lockedJob._id,
          allocs,
          cleanReason,
          lockedJob.creditsCost,
          {
            adminUserId,
            auditReason: `[Admin đối soát hoàn ${lockedJob.creditsCost} credit] Phiên #${String(lockedJob._id).slice(-6)}: ${cleanReason}`
          }
        );
      } else {
        creditResult = await this.creditService.commitCredit(
          lockedJob.user,
          lockedJob._id,
          allocs,
          lockedJob.creditsCost,
          {
            adminUserId,
            reason: `[Admin đối soát chốt ${lockedJob.creditsCost} credit] Phiên #${String(lockedJob._id).slice(-6)}: ${cleanReason}`
          }
        );
      }
    }

    return {
      job: lockedJob,
      action,
      creditResult
    };
  }

  startWorkerLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.processNextJobs();
      this.cleanOldTimestamps(this.rateLimits.uploads);
      this.cleanOldTimestamps(this.rateLimits.tryOns);
      this.cleanOldTimestamps(this.rateLimits.cleanups);
    }, this.pollIntervalMs);
  }

  stopWorkerLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = new TryOnQueueService();
module.exports.TryOnQueueService = TryOnQueueService;
