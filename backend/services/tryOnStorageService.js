const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TryOnImageAsset = require('../models/TryOnImageAsset');
const TryOnCronLock = require('../models/TryOnCronLock');
const { getTryOnSigningSecret } = require('../utils/jwtConfig');

class TryOnStorageService {
  constructor() {
    this.baseStorageDir = path.join(__dirname, '..', 'storage', 'tryon', 'private');
    this.signingSecret = getTryOnSigningSecret();
    const rawHours = parseInt(process.env.TRYON_RETENTION_HOURS, 10);
    const rawDays = parseInt(process.env.TRYON_RETENTION_DAYS, 10) || 3;
    this.retentionHours = Math.min(72, Math.max(1, Number.isFinite(rawHours) ? rawHours : rawDays * 24));
    this.retentionDays = this.retentionHours / 24;
    this.isCleaningLocal = false;
    this.initStorageDirectory();
  }

  /**
   * Strict path containment validation using path.resolve and trailing path.sep
   * Prevents directory traversal (../) and sibling directory prefix bypass (/private_evil).
   * @param {string} targetPath
   * @returns {boolean}
   */
  isPathInsideStorage(targetPath) {
    if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) {
      return false;
    }

    const resolvedBase = path.resolve(this.baseStorageDir);
    const resolvedTarget = path.resolve(targetPath);
    const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;

    if (process.platform === 'win32') {
      return resolvedTarget.toLowerCase().startsWith(baseWithSep.toLowerCase());
    }
    return resolvedTarget.startsWith(baseWithSep);
  }

  initStorageDirectory() {
    if (!fs.existsSync(this.baseStorageDir)) {
      fs.mkdirSync(this.baseStorageDir, { recursive: true });
    }
  }

  getUserStorageDir(userId) {
    const safeUserSegment = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUserSegment) {
      throw new Error('INVALID_USER_STORAGE_DIR');
    }
    const userDir = path.join(this.baseStorageDir, safeUserSegment);
    if (!this.isPathInsideStorage(userDir)) {
      const err = new Error('Đường dẫn lưu trữ không hợp lệ');
      err.statusCode = 403;
      err.code = 'INVALID_STORAGE_PATH';
      throw err;
    }
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  /**
   * Save uploaded or generated buffer to private storage
   * @param {Object} options
   * @param {string|ObjectId} options.userId
   * @param {Buffer} options.buffer
   * @param {string} options.mimeType
   * @param {'user_upload'|'cleanup_processed'|'tryon_result'} options.type
   * @param {string} [options.originalFilename]
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {Object} [options.qualityAnalysis]
   * @returns {Promise<TryOnImageAsset>}
   */
  async saveImage({
    userId,
    buffer,
    mimeType,
    type,
    originalFilename = '',
    width = 0,
    height = 0,
    qualityAnalysis = null
  }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('Dữ liệu buffer hình ảnh rỗng hoặc không hợp lệ');
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const filename = `${type}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const userDir = this.getUserStorageDir(userId);
    const absolutePath = path.join(userDir, filename);

    fs.writeFileSync(absolutePath, buffer);

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + this.retentionHours * 60 * 60 * 1000);

    const asset = await TryOnImageAsset.create({
      user: userId,
      type,
      originalFilename,
      storagePath: absolutePath,
      mimeType,
      fileSizeBytes: buffer.length,
      sha256,
      width,
      height,
      qualityAnalysis: qualityAnalysis || undefined,
      createdAt,
      expiresAt
    });

    return asset;
  }

  /**
   * Generate temporary signed access token for streaming image securely
   * @param {string} assetId
   * @param {string} userId
   * @param {number} [expiresInSeconds=1800] - 30 minutes default
   * @returns {string} Signed token
   */
  generateSignedToken(assetId, userId, expiresInSeconds = 1800) {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${assetId}:${userId}:${expires}`;
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');
    return Buffer.from(`${payload}:${signature}`).toString('base64url');
  }

  /**
   * Verify signed token and return payload
   * @param {string} signedToken
   * @returns {{assetId: string, userId: string, expires: number}|null}
   */
  verifySignedToken(signedToken) {
    try {
      const decoded = Buffer.from(signedToken, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length !== 4) return null;

      const [assetId, userId, expiresStr, signature] = parts;
      const expires = parseInt(expiresStr, 10);

      if (Date.now() / 1000 > expires) {
        return null; // Expired
      }

      const expectedPayload = `${assetId}:${userId}:${expires}`;
      const expectedSig = crypto
        .createHmac('sha256', this.signingSecret)
        .update(expectedPayload)
        .digest('hex');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }

      return { assetId, userId, expires };
    } catch (e) {
      return null;
    }
  }

  /**
   * Generate signed URL only if the underlying asset exists, belongs to user, is not deleted, and is not expired.
   * @param {string|ObjectId} assetId
   * @param {string|ObjectId} userId
   * @param {number} [expiresInSeconds=1800]
   * @returns {Promise<string|null>}
   */
  async issueSignedUrlIfValid(assetId, userId, expiresInSeconds = 1800) {
    if (!assetId) return null;
    const asset = await TryOnImageAsset.findById(assetId).select('user isDeleted expiresAt');
    if (!asset || asset.isDeleted) {
      return null;
    }
    const nowMs = Date.now();
    let effectiveTtl = expiresInSeconds;
    if (asset.expiresAt) {
      const remainingSeconds = Math.floor((new Date(asset.expiresAt).getTime() - nowMs) / 1000);
      if (remainingSeconds <= 0) {
        return null;
      }
      effectiveTtl = Math.min(expiresInSeconds, remainingSeconds);
    }
    if (effectiveTtl <= 0) {
      return null;
    }
    if (userId && asset.user.toString() !== userId.toString()) {
      return null;
    }
    const token = this.generateSignedToken(asset._id.toString(), asset.user.toString(), effectiveTtl);
    return `/api/tryon/images/${token}`;
  }

  /**
   * Retrieve image buffer from private storage with strict path containment, ownership & expiry enforcement
   * @param {string} assetId
   * @param {string} requestUserId
   * @param {boolean} [isAdmin=false]
   * @returns {Promise<{buffer: Buffer, mimeType: string, asset: TryOnImageAsset}>}
   */
  async getImageBuffer(assetId, requestUserId, isAdmin = false) {
    const asset = await TryOnImageAsset.findById(assetId);
    if (!asset || asset.isDeleted) {
      const err = new Error('Không tìm thấy hình ảnh hoặc ảnh đã bị xóa');
      err.statusCode = 404;
      err.code = 'ASSET_DELETED_OR_MISSING';
      throw err;
    }

    if (!isAdmin && (!requestUserId || asset.user.toString() !== requestUserId.toString())) {
      const err = new Error('Bạn không có quyền truy cập hình ảnh riêng tư này');
      err.statusCode = 403;
      err.code = 'ASSET_FORBIDDEN';
      throw err;
    }

    if (!this.isPathInsideStorage(asset.storagePath)) {
      const err = new Error('Đường dẫn tệp không nằm trong vùng lưu trữ bảo mật');
      err.statusCode = 403;
      err.code = 'PATH_TRAVERSAL_BLOCKED';
      throw err;
    }

    if (asset.expiresAt && new Date(asset.expiresAt) <= new Date()) {
      const err = new Error('Hình ảnh đã hết hạn lưu trữ (tối đa 72 giờ)');
      err.statusCode = 404;
      err.code = 'ASSET_EXPIRED';
      throw err;
    }

    const resolvedPath = path.resolve(asset.storagePath);
    if (!fs.existsSync(resolvedPath)) {
      const err = new Error('Tập tin ảnh không còn tồn tại trên bộ nhớ');
      err.statusCode = 404;
      err.code = 'FILE_NOT_FOUND';
      throw err;
    }

    const realBase = fs.realpathSync(this.baseStorageDir);
    const realFile = fs.realpathSync(resolvedPath);
    const realBaseWithSep = realBase.endsWith(path.sep) ? realBase : realBase + path.sep;
    const isRealContained = process.platform === 'win32'
      ? realFile.toLowerCase().startsWith(realBaseWithSep.toLowerCase())
      : realFile.startsWith(realBaseWithSep);

    if (!isRealContained) {
      const err = new Error('Phát hiện symlink/đường dẫn vượt ngoài thư mục lưu trữ');
      err.statusCode = 403;
      err.code = 'PATH_TRAVERSAL_BLOCKED';
      throw err;
    }

    const buffer = fs.readFileSync(realFile);
    return { buffer, mimeType: asset.mimeType, asset };
  }

  /**
   * Delete asset early at user request (strict ownership + path containment + idempotent)
   * @param {string} assetId
   * @param {string} userId
   * @param {boolean} [isAdmin=false]
   * @returns {Promise<boolean>}
   */
  async deleteAsset(assetId, userId, isAdmin = false) {
    const asset = await TryOnImageAsset.findById(assetId);
    if (!asset) return false;

    if (!isAdmin && (!userId || asset.user.toString() !== userId.toString())) {
      const err = new Error('Bạn không có quyền xóa tài nguyên này');
      err.statusCode = 403;
      err.code = 'ASSET_FORBIDDEN';
      throw err;
    }

    if (!this.isPathInsideStorage(asset.storagePath)) {
      const err = new Error('Đường dẫn tệp vượt ngoài vùng lưu trữ cho phép');
      err.statusCode = 403;
      err.code = 'PATH_TRAVERSAL_BLOCKED';
      throw err;
    }

    if (asset.isDeleted) {
      return true;
    }

    const resolvedPath = path.resolve(asset.storagePath);
    if (fs.existsSync(resolvedPath)) {
      try {
        fs.unlinkSync(resolvedPath);
      } catch (e) {
        console.warn('Could not unlink storage file:', resolvedPath, e.message);
      }
    }

    asset.isDeleted = true;
    asset.deletedAt = new Date();
    await asset.save();
    return true;
  }

  /**
   * Periodic retention cleanup worker (deletes records and files older than 72 hours / retentionDays)
   * Idempotent, resilient per-item processing, strict path traversal safety
   * @param {number} [batchLimit=100]
   * @returns {Promise<{deletedCount: number, failedCount: number}>}
   */
  async cleanupExpiredAssets(batchLimit = 100) {
    const now = new Date();
    let deletedCount = 0;
    let failedCount = 0;
    const maxBatches = 20;

    for (let pass = 0; pass < maxBatches; pass++) {
      const expiredAssets = await TryOnImageAsset.find({
        expiresAt: { $lt: now },
        isDeleted: false
      }).limit(batchLimit);

      if (!expiredAssets || expiredAssets.length === 0) {
        break;
      }

      let claimedInPass = 0;
      for (const asset of expiredAssets) {
        try {
          // Atomic mark barrier so concurrent/repeat runs are strictly idempotent
          const claimed = await TryOnImageAsset.findOneAndUpdate(
            { _id: asset._id, isDeleted: false },
            { $set: { isDeleted: true, deletedAt: now } },
            { new: true }
          );
          if (!claimed) {
            continue;
          }
          claimedInPass++;

          const isSafePath = this.isPathInsideStorage(asset.storagePath);
          if (isSafePath) {
            const resolvedPath = path.resolve(asset.storagePath);
            if (fs.existsSync(resolvedPath)) {
              try {
                fs.unlinkSync(resolvedPath);
              } catch (unlinkErr) {
                console.warn(`⚠️ [TryOn Cleanup] Warning: could not unlink file for asset #${asset._id}:`, unlinkErr.message);
              }
            }
          } else {
            console.warn(`🚨 [TryOn Cleanup] Blocked unsafe storagePath outside base directory for asset #${asset._id}`);
          }

          deletedCount++;
        } catch (assetErr) {
          failedCount++;
          console.error(`❌ [TryOn Cleanup] Failed to cleanup asset #${asset._id}:`, assetErr.message);
        }
      }

      if (expiredAssets.length < batchLimit || claimedInPass === 0) {
        break;
      }
    }

    if (deletedCount > 0 || failedCount > 0) {
      console.log(`🧹 [TryOn Storage Cleanup] Purged ${deletedCount} expired assets (${failedCount} failed) at ${now.toISOString()}`);
    }

    return { deletedCount, failedCount };
  }

  /**
   * Run cleanup with Distributed Lock (Singleton guarantee across multiple processes/servers)
   * @param {number} [batchLimit=100]
   * @returns {Promise<{deletedCount: number, failedCount?: number, skipped?: boolean, reason?: string}>}
   */
  async cleanupExpiredAssetsWithLock(batchLimit = 100) {
    if (this.isCleaningLocal) {
      return { skipped: true, reason: 'LOCAL_ALREADY_RUNNING', deletedCount: 0 };
    }

    const now = new Date();
    const leaseMs = 5 * 60 * 1000; // 5-minute lease
    const workerId = `${process.pid}_${Date.now()}`;

    let acquiredLock = false;
    try {
      this.isCleaningLocal = true;

      // 1. Ensure lock document exists without upsert race
      await TryOnCronLock.updateOne(
        { lockName: 'expired_assets_cleanup' },
        {
          $setOnInsert: {
            lockName: 'expired_assets_cleanup',
            isLocked: false,
            lockedUntil: null
          }
        },
        { upsert: true }
      );

      // 2. Acquire distributed lock conditionally (no upsert to prevent E11000)
      const lock = await TryOnCronLock.findOneAndUpdate(
        {
          lockName: 'expired_assets_cleanup',
          $or: [
            { isLocked: false },
            { lockedUntil: null },
            { lockedUntil: { $lt: now } }
          ]
        },
        {
          $set: {
            isLocked: true,
            lockedAt: now,
            lockedUntil: new Date(now.getTime() + leaseMs),
            lockedBy: workerId
          }
        },
        { new: true }
      );

      // Verify lease ownership - if null, another worker currently holds the lock
      if (!lock || lock.lockedBy !== workerId) {
        return { skipped: true, reason: 'DISTRIBUTED_LOCK_HELD', deletedCount: 0 };
      }

      acquiredLock = true;
      const startTime = Date.now();

      // Perform batch cleanup
      const result = await this.cleanupExpiredAssets(batchLimit);

      // Release lock and update metrics
      await TryOnCronLock.findOneAndUpdate(
        { lockName: 'expired_assets_cleanup', lockedBy: workerId },
        {
          $set: {
            isLocked: false,
            lastRunAt: new Date(),
            lastRunDurationMs: Date.now() - startTime,
            lastDeletedCount: result.deletedCount
          }
        }
      );

      return result;
    } catch (err) {
      console.error('❌ [TryOn Storage Cleanup] Scheduler error:', err.message);
      if (acquiredLock) {
        await TryOnCronLock.findOneAndUpdate(
          { lockName: 'expired_assets_cleanup', lockedBy: workerId },
          { $set: { isLocked: false } }
        ).catch(() => {});
      }
      return { deletedCount: 0, error: err.message };
    } finally {
      this.isCleaningLocal = false;
    }
  }
}

module.exports = new TryOnStorageService();
