const mongoose = require('mongoose');
const TryOnJob = require('../models/TryOnJob');
const TryOnImageAsset = require('../models/TryOnImageAsset');
const tryOnStorageService = require('./tryOnStorageService');

function toValidDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

class TryOnHistoryService {
  constructor(options = {}) {
    this.storageService = options.storageService || tryOnStorageService;
    this.defaultSignedTtlSeconds = options.signedTtlSeconds || 1800; // 30 minutes max
  }

  /**
   * Build immutable product snapshot summary strictly from TryOnJob.productSnapshot first.
   * Never overwrites historical product details with current live Product catalog values.
   */
  buildProductSnapshotSummary(job = {}) {
    const snap = job.productSnapshot || {};
    const hasSnapshotName = Boolean(snap.productName && String(snap.productName).trim());

    return {
      productId: snap.productId ? String(snap.productId) : (job.product ? String(job.product) : null),
      productName: hasSnapshotName ? snap.productName : (job.productName || 'Sản phẩm KD-XX'),
      brand: snap.brand || 'KD-XX',
      sku: snap.sku || '',
      variantSku: snap.variantSku || snap.sku || '',
      variantColor: snap.variantColor || '',
      variantSize: snap.variantSize || '',
      catalogCategory: snap.catalogCategory || '',
      normalizedDomain: snap.normalizedDomain || 'unknown',
      normalizedSubCategory: snap.normalizedSubCategory || 'unknown',
      imageUrlUsed: snap.imageUrlUsed || job.productImageUrl || '',
      verificationStatus: snap.verificationStatus || 'UNVERIFIED',
      confidenceScore: typeof snap.confidenceScore === 'number' ? snap.confidenceScore : 0,
      sourceTypesUsed: Array.isArray(snap.sourceTypesUsed) ? snap.sourceTypesUsed : [],
      sourceUrlsUsed: Array.isArray(snap.sourceUrlsUsed) ? snap.sourceUrlsUsed : [],
      knownLimitations: Array.isArray(snap.knownLimitations) ? snap.knownLimitations : [],
      contextGeneratedAt: snap.contextGeneratedAt || job.createdAt || null
    };
  }

  /**
   * Inspect an underlying TryOnImageAsset without extending expiresAt or logging signed tokens.
   */
  inspectAssetForHistory(asset, ownerUserId, now = new Date()) {
    if (!asset || !asset._id) {
      return {
        assetId: null,
        status: 'NONE',
        isAvailable: false,
        isExpired: false,
        isDeleted: false,
        createdAt: null,
        expiresAt: null,
        remainingMs: 0,
        signedUrl: null
      };
    }

    if (String(asset.user) !== String(ownerUserId)) {
      return {
        assetId: null,
        status: 'FORBIDDEN',
        isAvailable: false,
        isExpired: false,
        isDeleted: false,
        createdAt: null,
        expiresAt: null,
        remainingMs: 0,
        signedUrl: null
      };
    }

    const createdAt = toValidDate(asset.createdAt);
    const expiresAt = toValidDate(asset.expiresAt);
    const nowMs = now.getTime();
    const expiredByClock = Boolean(expiresAt && expiresAt.getTime() <= nowMs);
    const remainingMs = expiresAt ? Math.max(0, expiresAt.getTime() - nowMs) : 0;

    if (asset.isDeleted) {
      return {
        assetId: String(asset._id),
        status: expiredByClock ? 'EXPIRED' : 'DELETED',
        isAvailable: false,
        isExpired: expiredByClock,
        isDeleted: true,
        createdAt,
        expiresAt,
        deletedAt: toValidDate(asset.deletedAt),
        remainingMs: 0,
        signedUrl: null
      };
    }

    if (expiredByClock) {
      return {
        assetId: String(asset._id),
        status: 'EXPIRED',
        isAvailable: false,
        isExpired: true,
        isDeleted: false,
        createdAt,
        expiresAt,
        deletedAt: null,
        remainingMs: 0,
        signedUrl: null
      };
    }

    const ttlSeconds = expiresAt
      ? Math.min(this.defaultSignedTtlSeconds, Math.floor(remainingMs / 1000))
      : this.defaultSignedTtlSeconds;

    if (ttlSeconds <= 0) {
      return {
        assetId: String(asset._id),
        status: 'EXPIRED',
        isAvailable: false,
        isExpired: true,
        isDeleted: false,
        createdAt,
        expiresAt,
        deletedAt: null,
        remainingMs: 0,
        signedUrl: null
      };
    }

    const token = this.storageService.generateSignedToken(
      String(asset._id),
      String(ownerUserId),
      ttlSeconds
    );

    return {
      assetId: String(asset._id),
      status: 'AVAILABLE',
      isAvailable: true,
      isExpired: false,
      isDeleted: false,
      createdAt,
      expiresAt,
      deletedAt: null,
      remainingMs,
      signedUrl: `/api/tryon/images/${token}`
    };
  }

  deriveDisplayStatus(job, originalMeta, resultMeta) {
    if (job.status === 'COMPLETED') {
      if (resultMeta.isExpired || (!job.resultImageAsset && originalMeta.isExpired)) {
        return 'EXPIRED';
      }
      return 'COMPLETED';
    }
    return job.status;
  }

  formatHistoryItem(job, assetMap, userId, now = new Date()) {
    const personAsset = job.personImageAsset ? assetMap.get(String(job.personImageAsset)) || null : null;
    const resultAsset = job.resultImageAsset ? assetMap.get(String(job.resultImageAsset)) || null : null;

    const originalImage = this.inspectAssetForHistory(personAsset, userId, now);
    const resultImage = this.inspectAssetForHistory(resultAsset, userId, now);

    const createdAt = toValidDate(job.createdAt) || toValidDate(job.timing?.queuedAt) || now;
    const maxRetentionMs = this.storageService.retentionHours * 60 * 60 * 1000;
    const defaultDeadline = new Date(createdAt.getTime() + maxRetentionMs);

    const effectiveExpiresAt =
      resultImage.expiresAt ||
      originalImage.expiresAt ||
      defaultDeadline;

    const remainingMs = Math.max(0, effectiveExpiresAt.getTime() - now.getTime());
    const isExpired =
      remainingMs <= 0 ||
      resultImage.isExpired ||
      (!job.resultImageAsset && originalImage.isExpired);

    const displayStatus = this.deriveDisplayStatus(job, originalImage, resultImage);
    const snapshot = this.buildProductSnapshotSummary(job);

    const outfitItems = Array.isArray(job.outfitItems) && job.outfitItems.length > 0
      ? job.outfitItems.map(item => ({
          slot: item.slot,
          stepOrder: item.stepOrder,
          productId: item.product ? String(item.product) : null,
          productName: item.productSnapshot?.productName || item.productName || 'Sản phẩm KD-XX',
          brand: item.productSnapshot?.brand || 'KD-XX',
          sku: item.productSnapshot?.sku || '',
          variantColor: item.productSnapshot?.variantColor || '',
          subCategory: item.productSnapshot?.normalizedSubCategory || '',
          imageUrlUsed: item.productSnapshot?.imageUrlUsed || item.productImageUrl || ''
        }))
      : [];

    const executionSteps = Array.isArray(job.executionSteps) && job.executionSteps.length > 0
      ? job.executionSteps.map(s => ({
          stepIndex: s.stepIndex,
          slot: s.slot,
          productName: s.productName || '',
          status: s.status,
          providerId: s.providerId || '',
          errorCode: s.errorCode || '',
          errorMessage: s.errorMessage || '',
          completedAt: s.completedAt || null
        }))
      : [];

    return {
      id: String(job._id),
      jobId: String(job._id),
      mode: job.mode || 'SINGLE_ITEM',
      creditsCost: job.creditsCost || 1,
      status: job.status,
      jobStatus: job.status,
      displayStatus,
      createdAt,
      queuedAt: job.timing?.queuedAt || createdAt,
      completedAt: job.timing?.completedAt || null,
      durationMs: job.timing?.durationMs || 0,
      expiresAt: effectiveExpiresAt,
      remainingMs,
      isExpired,
      productName: snapshot.productName,
      product: snapshot.productId ? { _id: snapshot.productId, name: snapshot.productName, brand: snapshot.brand } : null,
      productSnapshot: snapshot,
      outfitItems,
      executionSteps,
      resultQualityCheck: job.resultQualityCheck || null,
      originalImageAsset: originalImage.assetId,
      resultImageAsset: resultImage.assetId,
      originalPreviewUrl: originalImage.signedUrl,
      resultPreviewUrl: job.status === 'COMPLETED' ? resultImage.signedUrl : null,
      originalPrivateEndpoint: originalImage.isAvailable ? `/api/tryon/history/${job._id}/original-image` : null,
      resultPrivateEndpoint: (job.status === 'COMPLETED' && resultImage.isAvailable)
        ? `/api/tryon/history/${job._id}/result-image`
        : null,
      originalImage,
      resultImage,
      errorMessage: job.errorMessage || '',
      errorCode: job.errorCode || '',
      provider: job.provider || 'google-vertex-vto-001',
      providerRequestId: job.providerRequestId || null,
      reconciliation: job.reconciliation || { state: 'NONE', requiresManualAdmin: false }
    };
  }

  /**
   * List authenticated user's try-on history with search, status/category filter & pagination.
   */
  async listUserHistory(userId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 12));
    const statusFilter = String(query.status || 'ALL').trim().toUpperCase();
    const categoryFilter = String(query.category || 'ALL').trim().toLowerCase();
    const search = String(query.search || '').trim().toLowerCase();
    const now = new Date();

    const rawJobs = await TryOnJob.find({
      user: userId,
      historyDeleted: { $ne: true }
    })
      .sort({ createdAt: -1 })
      .limit(500);

    const assetIdSet = new Set();
    for (const j of rawJobs) {
      if (j.personImageAsset) assetIdSet.add(String(j.personImageAsset));
      if (j.resultImageAsset) assetIdSet.add(String(j.resultImageAsset));
    }

    let assetMap = new Map();
    if (assetIdSet.size > 0) {
      const assets = await TryOnImageAsset.find({
        _id: { $in: Array.from(assetIdSet) },
        user: userId
      });
      assetMap = new Map(assets.map(a => [String(a._id), a]));
    }

    let formatted = rawJobs.map(j => this.formatHistoryItem(j, assetMap, userId, now));

    if (statusFilter && statusFilter !== 'ALL') {
      formatted = formatted.filter(item => {
        if (statusFilter === 'EXPIRED') {
          return item.displayStatus === 'EXPIRED' || item.isExpired;
        }
        return item.displayStatus === statusFilter || item.status === statusFilter;
      });
    }

    if (categoryFilter && categoryFilter !== 'all') {
      formatted = formatted.filter(item => {
        const snap = item.productSnapshot || {};
        return (
          String(snap.normalizedDomain || '').toLowerCase() === categoryFilter ||
          String(snap.normalizedSubCategory || '').toLowerCase() === categoryFilter ||
          String(snap.catalogCategory || '').toLowerCase() === categoryFilter
        );
      });
    }

    if (search) {
      formatted = formatted.filter(item => {
        const snap = item.productSnapshot || {};
        const outfitText = (item.outfitItems || [])
          .flatMap(o => [o.productName, o.brand, o.sku, o.variantColor, o.subCategory])
          .filter(Boolean);
        const haystack = [
          snap.productName,
          snap.brand,
          snap.sku,
          snap.variantSku,
          snap.variantColor,
          snap.normalizedSubCategory,
          item.displayStatus,
          item.mode,
          ...outfitText
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    const total = formatted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * limit;
    const items = formatted.slice(startIdx, startIdx + limit);

    return {
      items,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasMore: safePage < totalPages
      }
    };
  }

  async loadOwnedJobOrThrow(jobId, userId) {
    if (!jobId || (typeof jobId === 'string' && !mongoose.Types.ObjectId.isValid(jobId) && !/^[a-f0-9]{24}$/i.test(jobId))) {
      const err = new Error('Mã phiên thử đồ không hợp lệ');
      err.code = 'INVALID_JOB_ID';
      err.statusCode = 400;
      throw err;
    }

    const job = await TryOnJob.findById(jobId);
    if (!job || job.historyDeleted) {
      const err = new Error('Không tìm thấy mục lịch sử thử đồ');
      err.code = 'HISTORY_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (String(job.user) !== String(userId)) {
      const err = new Error('Bạn không có quyền truy cập lịch sử thử đồ của người dùng khác');
      err.code = 'HISTORY_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    return job;
  }

  async getHistoryItem(jobId, userId) {
    const job = await this.loadOwnedJobOrThrow(jobId, userId);
    const assetIds = [job.personImageAsset, job.resultImageAsset].filter(Boolean);
    const assets = assetIds.length > 0
      ? await TryOnImageAsset.find({ _id: { $in: assetIds }, user: userId })
      : [];
    const assetMap = new Map(assets.map(a => [String(a._id), a]));
    return this.formatHistoryItem(job, assetMap, userId, new Date());
  }

  async getPrivateHistoryImageBuffer(jobId, userId, kind = 'result') {
    const job = await this.loadOwnedJobOrThrow(jobId, userId);
    const assetId = kind === 'original' ? job.personImageAsset : job.resultImageAsset;
    if (!assetId) {
      const err = new Error(kind === 'original' ? 'Không có ảnh gốc cho phiên này' : 'Phiên này chưa có ảnh kết quả');
      err.code = 'IMAGE_NOT_AVAILABLE';
      err.statusCode = 404;
      throw err;
    }

    return this.storageService.getImageBuffer(String(assetId), userId, false);
  }

  async deleteHistoryImage(jobId, userId, kind = 'result') {
    const job = await this.loadOwnedJobOrThrow(jobId, userId);
    const assetId = kind === 'original' ? job.personImageAsset : job.resultImageAsset;
    if (!assetId) {
      return { deleted: false, kind };
    }
    const deleted = await this.storageService.deleteAsset(String(assetId), userId, false);
    return { deleted: Boolean(deleted), kind, assetId: String(assetId) };
  }

  async deleteHistoryItem(jobId, userId, { deleteOriginalIfUnused = true } = {}) {
    const job = await this.loadOwnedJobOrThrow(jobId, userId);
    const now = new Date();

    job.historyDeleted = true;
    job.historyDeletedAt = now;
    await job.save();

    let resultDeleted = false;
    let originalDeleted = false;

    if (job.resultImageAsset) {
      resultDeleted = await this.storageService.deleteAsset(String(job.resultImageAsset), userId, false);
    }

    if (Array.isArray(job.executionSteps)) {
      for (const step of job.executionSteps) {
        if (step?.outputAssetId && String(step.outputAssetId) !== String(job.resultImageAsset || '')) {
          await this.storageService.deleteAsset(String(step.outputAssetId), userId, false).catch(() => {});
        }
      }
    }

    if (job.personImageAsset && deleteOriginalIfUnused) {
      const remainingUsingSameOriginal = await TryOnJob.find({
        user: userId,
        personImageAsset: job.personImageAsset,
        historyDeleted: { $ne: true }
      }).limit(1);

      if (!remainingUsingSameOriginal || remainingUsingSameOriginal.length === 0) {
        originalDeleted = await this.storageService.deleteAsset(String(job.personImageAsset), userId, false);
      }
    }

    return {
      deletedJobId: String(job._id),
      resultDeleted,
      originalDeleted
    };
  }

  async deleteAllUserHistory(userId) {
    const now = new Date();
    const userJobs = await TryOnJob.find({
      user: userId,
      historyDeleted: { $ne: true }
    }).limit(500);

    let clearedJobsCount = 0;
    for (const job of userJobs) {
      job.historyDeleted = true;
      job.historyDeletedAt = now;
      await job.save();
      clearedJobsCount++;
    }

    const userAssets = await TryOnImageAsset.find({
      user: userId,
      isDeleted: false
    }).limit(1000);

    let deletedAssetsCount = 0;
    for (const asset of userAssets) {
      const ok = await this.storageService.deleteAsset(String(asset._id), userId, false);
      if (ok) deletedAssetsCount++;
    }

    return {
      clearedJobsCount,
      deletedAssetsCount
    };
  }
}

module.exports = new TryOnHistoryService();
module.exports.TryOnHistoryService = TryOnHistoryService;
