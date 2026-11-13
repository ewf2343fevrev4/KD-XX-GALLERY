process.env.NODE_ENV = 'test';
process.env.TRYON_DISABLE_AUTO_WORKER = 'true';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

const TryOnJob = require('../models/TryOnJob');
const TryOnImageAsset = require('../models/TryOnImageAsset');
const TryOnCredit = require('../models/TryOnCredit');
const TryOnCreditLot = require('../models/TryOnCreditLot');
const TryOnCreditLedger = require('../models/TryOnCreditLedger');
const Product = require('../models/Product');
const User = require('../models/User');

const tryOnCreditService = require('../services/tryOnCreditService');
const tryOnStorageService = require('../services/tryOnStorageService');
const { TryOnQueueService } = require('../services/tryOnQueueService');
const tryOnImageService = require('../services/tryOnImageService');
const photoQualityService = require('../services/photoQualityService');
const virtualTryOnService = require('../services/virtualTryOnService');
const { TryOnProviderRegistry } = require('../services/providers/TryOnProviderRegistry');
const VertexVto001Adapter = require('../services/providers/VertexVto001Adapter');
const GeminiImageEditAdapter = require('../services/providers/GeminiImageEditAdapter');
const EyewearProvider = require('../services/providers/EyewearProvider');
const FootwearProvider = require('../services/providers/FootwearProvider');
const AccessoriesProvider = require('../services/providers/AccessoriesProvider');
const { protect, admin } = require('../middleware/authMiddleware');
const { getJwtSecret } = require('../utils/jwtConfig');

// =============================================================================
// Lightweight In-Memory Store to Stub Mongoose Models Without Touching Live Atlas
// =============================================================================
function makeId() {
  return new mongoose.Types.ObjectId();
}

function getNested(obj, dotPath) {
  return dotPath.split('.').reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
}

function setNested(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function matchesQuery(doc, query = {}) {
  for (const [k, cond] of Object.entries(query)) {
    if (k === '$or') {
      if (!cond.some(sub => matchesQuery(doc, sub))) return false;
      continue;
    }
    if (k === '$expr') {
      // Specific support for { $gte: [{ $subtract: ['$remainingAmount', '$reservedAmount'] }, amount] }
      const gteArgs = cond.$gte;
      if (gteArgs && gteArgs[0]?.$subtract) {
        const [f1, f2] = gteArgs[0].$subtract;
        const v1 = Number(doc[f1.replace(/^\$/, '')] || 0);
        const v2 = Number(doc[f2.replace(/^\$/, '')] || 0);
        if (!(v1 - v2 >= gteArgs[1])) return false;
      }
      continue;
    }

    const val = getNested(doc, k);
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !mongoose.Types.ObjectId.isValid(cond)) {
      if ('$in' in cond && !cond.$in.map(String).includes(String(val))) return false;
      if ('$ne' in cond) {
        if (cond.$ne === null) {
          if (val === null || val === undefined) return false;
        } else if (String(val) === String(cond.$ne)) return false;
      }
      if ('$gt' in cond) {
        const dv = val instanceof Date ? val.getTime() : Number(val);
        const cv = cond.$gt instanceof Date ? cond.$gt.getTime() : Number(cond.$gt);
        if (!(val != null && dv > cv)) return false;
      }
      if ('$gte' in cond) {
        const dv = val instanceof Date ? val.getTime() : Number(val);
        const cv = cond.$gte instanceof Date ? cond.$gte.getTime() : Number(cond.$gte);
        if (!(val != null && dv >= cv)) return false;
      }
      if ('$lt' in cond) {
        const dv = val instanceof Date ? val.getTime() : Number(val);
        const cv = cond.$lt instanceof Date ? cond.$lt.getTime() : Number(cond.$lt);
        if (!(val != null && dv < cv)) return false;
      }
    } else if (cond === null) {
      if (val !== null && val !== undefined) return false;
    } else {
      if (String(val) !== String(cond)) return false;
    }
  }
  return true;
}

class InMemoryModelStub {
  constructor(uniqueFields = [], defaultFactory = null) {
    this.docs = [];
    this.uniqueFields = uniqueFields;
    this.defaultFactory = defaultFactory;
  }

  wrap(raw) {
    if (!raw) return null;
    const store = this;
    if (!raw._id) raw._id = makeId();
    raw.save = async function () {
      for (const uf of store.uniqueFields) {
        const v = this[uf];
        if (v !== undefined && v !== null) {
          const dup = store.docs.find(d => String(d._id) !== String(this._id) && d[uf] === v);
          if (dup) {
            const err = new Error(`E11000 duplicate key on ${uf}: ${v}`);
            err.code = 11000;
            throw err;
          }
        }
      }
      if (!this.createdAt) this.createdAt = new Date();
      this.updatedAt = new Date();
      const idx = store.docs.findIndex(d => String(d._id) === String(this._id));
      if (idx === -1) store.docs.push(this);
      else store.docs[idx] = this;
      return this;
    };
    return raw;
  }

  _makeQuery(initialList) {
    let list = [...initialList];
    const queryObj = {
      sort(sortSpec) {
        list.sort((a, b) => {
          for (const [k, dir] of Object.entries(sortSpec)) {
            const va = getNested(a, k);
            const vb = getNested(b, k);
            const na = va instanceof Date ? va.getTime() : (va ?? 0);
            const nb = vb instanceof Date ? vb.getTime() : (vb ?? 0);
            if (na !== nb) return (na < nb ? -1 : 1) * dir;
          }
          return 0;
        });
        return queryObj;
      },
      limit(n) {
        list = list.slice(0, n);
        return queryObj;
      },
      select() { return queryObj; },
      populate() { return queryObj; },
      then(resolve, reject) {
        return Promise.resolve(list).then(resolve, reject);
      }
    };
    return queryObj;
  }

  installOn(Model) {
    const store = this;
    const originals = {
      find: Model.find,
      findOne: Model.findOne,
      findById: Model.findById,
      create: Model.create,
      findOneAndUpdate: Model.findOneAndUpdate,
      countDocuments: Model.countDocuments
    };

    Model.find = (q = {}) => store._makeQuery(store.docs.filter(d => matchesQuery(d, q)));
    Model.findOne = (q = {}) => {
      const found = store.docs.find(d => matchesQuery(d, q)) || null;
      return {
        select: () => Promise.resolve(found),
        populate: () => Promise.resolve(found),
        then: (res, rej) => Promise.resolve(found).then(res, rej)
      };
    };
    Model.findById = (id) => {
      const found = store.docs.find(d => String(d._id) === String(id)) || null;
      return {
        select: () => Promise.resolve(found),
        populate: () => Promise.resolve(found),
        then: (res, rej) => Promise.resolve(found).then(res, rej)
      };
    };
    Model.create = async (payload) => {
      const defaults = typeof store.defaultFactory === 'function' ? store.defaultFactory() : {};
      const doc = store.wrap({
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defaults,
        ...structuredCloneIfSafe(payload)
      });
      await doc.save();
      return doc;
    };
    Model.findOneAndUpdate = async (q, update = {}, opts = {}) => {
      let candidates = store.docs.filter(d => matchesQuery(d, q));
      if (opts.sort) {
        candidates.sort((a, b) => {
          for (const [k, dir] of Object.entries(opts.sort)) {
            const va = getNested(a, k);
            const vb = getNested(b, k);
            const na = va instanceof Date ? va.getTime() : (va ?? 0);
            const nb = vb instanceof Date ? vb.getTime() : (vb ?? 0);
            if (na !== nb) return (na < nb ? -1 : 1) * dir;
          }
          return 0;
        });
      }
      const target = candidates[0];
      if (!target) return null;
      if (update.$set) {
        for (const [k, v] of Object.entries(update.$set)) setNested(target, k, v);
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          const cur = Number(getNested(target, k) || 0);
          setNested(target, k, cur + v);
        }
      }
      await target.save();
      return target;
    };
    Model.countDocuments = async (q = {}) => store.docs.filter(d => matchesQuery(d, q)).length;

    return () => Object.assign(Model, originals);
  }
}

function structuredCloneIfSafe(obj) {
  const out = { ...obj };
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId)) {
      out[k] = { ...v };
    }
  }
  return out;
}

async function createSampleImageBuffer({ width = 800, height = 1000, r = 128, g = 128, b = 128, format = 'jpeg', noise = true }) {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const offset = noise ? ((x + y) % 25) - 12 : 0;
      raw[idx] = Math.max(0, Math.min(255, r + offset));
      raw[idx + 1] = Math.max(0, Math.min(255, g + offset));
      raw[idx + 2] = Math.max(0, Math.min(255, b + offset));
    }
  }
  const pipeline = sharp(raw, { raw: { width, height, channels } });
  if (format === 'png') return pipeline.png().toBuffer();
  if (format === 'webp') return pipeline.webp({ quality: 90 }).toBuffer();
  return pipeline.jpeg({ quality: 90 }).toBuffer();
}

// =============================================================================
// TEST SUITE: PHASE 1 CORE HARDENING & PROVIDER ARCHITECTURE (20 SCENARIOS)
// =============================================================================
describe('KD-XX Virtual Try-On Phase 1 — Core Hardening & Provider Architecture', () => {
  let tempStorageDir;
  let originalBaseDir;
  let restorers = [];
  let stores = {};

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdxx-tryon-test-'));
    originalBaseDir = tryOnStorageService.baseStorageDir;
    tryOnStorageService.baseStorageDir = tempStorageDir;

    stores = {
      jobs: new InMemoryModelStub([], () => ({ creditsCost: 1, priority: 1, timing: { queuedAt: new Date() } })),
      assets: new InMemoryModelStub([], () => ({ isDeleted: false })),
      credits: new InMemoryModelStub(['user']),
      lots: new InMemoryModelStub([], () => ({ reservedAmount: 0, isActive: true })),
      ledgers: new InMemoryModelStub(['idempotencyKey']),
      products: new InMemoryModelStub(),
      users: new InMemoryModelStub()
    };

    restorers = [
      stores.jobs.installOn(TryOnJob),
      stores.assets.installOn(TryOnImageAsset),
      stores.credits.installOn(TryOnCredit),
      stores.lots.installOn(TryOnCreditLot),
      stores.ledgers.installOn(TryOnCreditLedger),
      stores.products.installOn(Product),
      stores.users.installOn(User)
    ];
  });

  afterEach(() => {
    restorers.forEach(r => r());
    restorers = [];
    tryOnStorageService.baseStorageDir = originalBaseDir;
    fs.rmSync(tempStorageDir, { recursive: true, force: true });
  });

  async function seedUserAndCredits(role = 'user', initialCredits = 10, lotType = 'free') {
    const userId = makeId();
    await User.create({ _id: userId, name: 'Test User', email: `${userId}@test.kdxx`, role });
    await TryOnCredit.create({
      user: userId,
      totalAvailableCredits: initialCredits,
      freeCreditsClaimed: true,
      membershipType: role === 'admin' ? 'admin' : lotType === 'homie' ? 'homie' : 'free',
      membershipExpiresAt: lotType === 'homie' ? new Date(Date.now() + 20 * 86400 * 1000) : null
    });
    const lot = await TryOnCreditLot.create({
      user: userId,
      lotType,
      initialAmount: initialCredits,
      remainingAmount: initialCredits,
      reservedAmount: 0,
      expiresAt: new Date(Date.now() + 25 * 86400 * 1000),
      isActive: true
    });
    return { userId, lot };
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 1: PENDING job without credit reservation
  // ---------------------------------------------------------------------------
  it('1. recoverStuckJobs() marks PENDING without credit reservation FAILED and never dispatches AI', async () => {
    const userId = makeId();
    const unreservedJob = await TryOnJob.create({
      user: userId,
      status: 'PENDING',
      creditLot: null,
      personImageAsset: makeId(),
      product: makeId(),
      productImageUrl: 'https://amiri.com/sample.jpg',
      creditsCost: 1
    });

    let aiCallCount = 0;
    const queue = new TryOnQueueService({
      autoStart: false,
      virtualTryOnService: {
        getActiveProvider: () => ({
          providerId: 'google-vertex-vto-001',
          modelId: 'virtual-try-on-001',
          generateRequestId: () => 'req-test',
          estimateCost: () => ({ estimatedTotalUsd: 0.06 }),
          normalizeError: (e) => ({ code: e.code || 'ERR', statusCode: 500 })
        }),
        predictTryOn: async () => { aiCallCount++; return { resultBase64: 'AAA' }; }
      }
    });

    const summary = await queue.recoverStuckJobs();
    assert.equal(summary.failedMissingReservation, 1);
    assert.equal(summary.requeued, 0);

    const updated = await TryOnJob.findById(unreservedJob._id);
    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.errorCode, 'RESERVATION_MISSING_ON_BOOT');

    // Also prove executeJob directly refuses unreserved jobs
    updated.creditLot = null;
    await queue.executeJob(updated);
    assert.equal(aiCallCount, 0);
    assert.equal(updated.status, 'FAILED');
    assert.equal(updated.errorCode, 'MISSING_CREDIT_RESERVATION');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Valid job lifecycle with reserve -> AI -> commit
  // ---------------------------------------------------------------------------
  it('2. Valid credit reservation flows cleanly through QUEUED -> COMPLETED -> single COMMIT ledger', async () => {
    const { userId, lot } = await seedUserAndCredits('user', 5, 'free');
    const personBuf = await createSampleImageBuffer({ width: 800, height: 1000, r: 120, g: 120, b: 120 });
    const prodBuf = await createSampleImageBuffer({ width: 600, height: 800, r: 40, g: 40, b: 90, format: 'png' });
    const outPng = await createSampleImageBuffer({ width: 800, height: 1000, r: 100, g: 110, b: 120, format: 'png' });

    const personAsset = await tryOnStorageService.saveImage({
      userId, buffer: personBuf, mimeType: 'image/jpeg', type: 'user_upload'
    });
    const prod = await Product.create({
      _id: makeId(), name: 'AMIRI Bone Tee', category: 'tops',
      image: `data:image/png;base64,${prodBuf.toString('base64')}`
    });

    let predictCalls = 0;
    const queue = new TryOnQueueService({
      autoStart: false,
      virtualTryOnService: {
        getActiveProvider: () => ({
          providerId: 'google-vertex-vto-001',
          modelId: 'virtual-try-on-001',
          generateRequestId: (id) => `vto-${id}`,
          estimateCost: () => ({ estimatedTotalUsd: 0.06 }),
          normalizeError: (e) => ({ code: e.code || 'ERR', statusCode: 500 })
        }),
        predictTryOn: async () => {
          predictCalls++;
          return { resultBase64: outPng.toString('base64'), providerRequestId: 'gcp-req-123', httpStatus: 200 };
        }
      }
    });

    const job = await queue.submitJob({ userId, personImageAssetId: personAsset._id, productId: prod._id });
    assert.equal(job.status, 'QUEUED');
    assert.equal(String(job.creditLot), String(lot._id));

    await queue.processNextJobs();
    await new Promise(r => setTimeout(r, 40));

    const done = await TryOnJob.findById(job._id);
    assert.equal(predictCalls, 1);
    assert.equal(done.status, 'COMPLETED');
    assert.ok(done.resultImageAsset);
    assert.equal(lot.remainingAmount, 4);
    assert.equal(lot.reservedAmount, 0);

    const commits = await TryOnCreditLedger.find({ job: job._id, transactionType: 'COMMIT' });
    assert.equal(commits.length, 1);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3: PROCESSING after restart
  // ---------------------------------------------------------------------------
  it('3. recoverStuckJobs() moves mid-flight PROCESSING job to RECONCILIATION_REQUIRED and only re-queues pre-dispatch jobs', async () => {
    const { userId, lot } = await seedUserAndCredits('user', 3, 'free');
    lot.reservedAmount = 2;
    await lot.save();

    const midFlightJob = await TryOnJob.create({
      user: userId,
      status: 'PROCESSING',
      creditLot: lot._id,
      personImageAsset: makeId(),
      product: makeId(),
      productImageUrl: 'https://amiri.com/a.jpg',
      providerRequestId: 'req-already-sent',
      aiProviderDetails: { dispatchedAt: new Date() },
      creditsCost: 1
    });

    const preDispatchJob = await TryOnJob.create({
      user: userId,
      status: 'PROCESSING',
      creditLot: lot._id,
      personImageAsset: makeId(),
      product: makeId(),
      productImageUrl: 'https://amiri.com/b.jpg',
      providerRequestId: null,
      aiProviderDetails: { dispatchedAt: null },
      creditsCost: 1
    });

    const queue = new TryOnQueueService({ autoStart: false });
    const summary = await queue.recoverStuckJobs();

    assert.equal(summary.movedToReconciliation, 1);
    assert.equal(summary.requeued, 1);

    const midReloaded = await TryOnJob.findById(midFlightJob._id);
    assert.equal(midReloaded.status, 'RECONCILIATION_REQUIRED');
    assert.equal(midReloaded.reconciliation.state, 'UNVERIFIED_AFTER_RESTART');
    assert.equal(midReloaded.reconciliation.requiresManualAdmin, true);

    const preReloaded = await TryOnJob.findById(preDispatchJob._id);
    assert.equal(preReloaded.status, 'QUEUED');

    // Neither auto-refunded
    const refunds = await TryOnCreditLedger.find({ transactionType: 'REFUND' });
    assert.equal(refunds.length, 0);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 4: RECONCILIATION_REQUIRED verification & Admin resolve + audit log
  // ---------------------------------------------------------------------------
  it('4. RECONCILIATION_REQUIRED stays held if UNVERIFIABLE and settles once by Admin with audit log', async () => {
    const { userId, lot } = await seedUserAndCredits('user', 5, 'free');
    const adminId = makeId();

    const job = await TryOnJob.create({
      user: userId,
      status: 'PENDING',
      personImageAsset: makeId(),
      product: makeId(),
      productImageUrl: 'https://amiri.com/c.jpg',
      creditsCost: 1
    });
    const res = await tryOnCreditService.reserveCredit(userId, job._id, 1);
    job.creditLot = res.lotId;
    job.status = 'RECONCILIATION_REQUIRED';
    job.providerRequestId = 'gcp-timeout-777';
    await job.save();

    const queue = new TryOnQueueService({ autoStart: false });

    // Default verification cannot verify sync :predict outcome -> holds in RECONCILIATION_REQUIRED
    const autoCheck = await queue.reconcileJob(job._id);
    assert.equal(autoCheck.outcome, 'UNVERIFIABLE');
    assert.equal(autoCheck.requiresManualAdmin, true);
    assert.equal((await TryOnJob.findById(job._id)).status, 'RECONCILIATION_REQUIRED');

    // Admin resolves via refund with audit justification
    const settled = await queue.adminResolveReconciliation({
      jobId: job._id,
      adminUserId: adminId,
      action: 'refund',
      reason: 'Verified in GCP logs that prediction timed out before completion'
    });

    assert.equal(settled.job.status, 'FAILED');
    assert.equal(settled.job.reconciliation.state, 'RESOLVED_REFUNDED');
    assert.equal(String(settled.job.reconciliation.resolvedBy), String(adminId));
    assert.equal(lot.reservedAmount, 0);
    assert.equal(lot.remainingAmount, 5);

    // Ledger contains adminUser attribution
    const refundLedgers = await TryOnCreditLedger.find({ job: job._id, transactionType: 'REFUND' });
    assert.equal(refundLedgers.length, 1);
    assert.equal(String(refundLedgers[0].adminUser), String(adminId));

    // Re-settling by a second Admin fails cleanly with 409 CONFLICT
    await assert.rejects(
      () => queue.adminResolveReconciliation({
        jobId: job._id,
        adminUserId: adminId,
        action: 'commit',
        reason: 'Second admin attempt should be blocked'
      }),
      err => err.code === 'JOB_ALREADY_RESOLVED' && err.statusCode === 409
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Duplicate Refund Idempotency & Post-Commit Exclusion
  // ---------------------------------------------------------------------------
  it('5. Duplicate refund is idempotent and refundCredit rejects already-committed jobs', async () => {
    const { userId, lot } = await seedUserAndCredits('user', 5, 'free');
    const job1 = makeId();
    const job2 = makeId();
    await tryOnCreditService.reserveCredit(userId, job1, 1);
    await tryOnCreditService.reserveCredit(userId, job2, 1);
    assert.equal(lot.reservedAmount, 2);

    const r1 = await tryOnCreditService.refundCredit(userId, job1, lot._id, 'Network fail', 1);
    const r2 = await tryOnCreditService.refundCredit(userId, job1, lot._id, 'Duplicate retry', 1);
    assert.equal(r1.alreadyRefunded, false);
    assert.equal(r2.alreadyRefunded, true);
    assert.equal(lot.reservedAmount, 1);
    assert.equal((await TryOnCreditLedger.find({ job: job1, transactionType: 'REFUND' })).length, 1);

    await tryOnCreditService.commitCredit(userId, job2, lot._id, 1);
    await assert.rejects(
      () => tryOnCreditService.refundCredit(userId, job2, lot._id, 'Late timeout retry', 1),
      err => err.code === 'CREDIT_ALREADY_COMMITTED'
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Duplicate Commit Idempotency & Post-Refund Exclusion
  // ---------------------------------------------------------------------------
  it('6. Duplicate commit is idempotent and commitCredit rejects already-refunded jobs', async () => {
    const { userId, lot } = await seedUserAndCredits('user', 5, 'free');
    const job1 = makeId();
    const job2 = makeId();
    await tryOnCreditService.reserveCredit(userId, job1, 1);
    await tryOnCreditService.reserveCredit(userId, job2, 1);

    const c1 = await tryOnCreditService.commitCredit(userId, job1, lot._id, 1);
    const c2 = await tryOnCreditService.commitCredit(userId, job1, lot._id, 1);
    assert.equal(c1.alreadyCommitted, false);
    assert.equal(c2.alreadyCommitted, true);
    assert.equal(lot.reservedAmount, 1);
    assert.equal(lot.remainingAmount, 4);
    assert.equal((await TryOnCreditLedger.find({ job: job1, transactionType: 'COMMIT' })).length, 1);

    await tryOnCreditService.refundCredit(userId, job2, lot._id, 'Cancelled', 1);
    await assert.rejects(
      () => tryOnCreditService.commitCredit(userId, job2, lot._id, 1),
      err => err.code === 'CREDIT_ALREADY_REFUNDED'
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Provider timeout normalization triggers RECONCILIATION_REQUIRED
  // ---------------------------------------------------------------------------
  it('7. Adapter AI_TIMEOUT moves dispatched job to RECONCILIATION_REQUIRED without refund', async () => {
    const { userId, lot } = await seedUserAndCredits('user', 2, 'free');
    const personBuf = await createSampleImageBuffer({ width: 700, height: 900 });
    const prodBuf = await createSampleImageBuffer({ width: 700, height: 900 });
    const personAsset = await tryOnStorageService.saveImage({
      userId, buffer: personBuf, mimeType: 'image/jpeg', type: 'user_upload'
    });
    const prod = await Product.create({
      _id: makeId(), name: 'AMIRI Denim', category: 'bottoms',
      image: `data:image/jpeg;base64,${prodBuf.toString('base64')}`
    });

    const adapter = new VertexVto001Adapter({
      timeoutMs: 25,
      authService: { getAccessToken: async () => 'mock-token' },
      fetchImpl: async () => {
        const err = new Error('The operation timed out');
        err.name = 'TimeoutError';
        throw err;
      }
    });

    const queue = new TryOnQueueService({
      autoStart: false,
      virtualTryOnService: {
        getActiveProvider: () => adapter,
        predictTryOn: (params) => adapter.executeTryOn(params)
      }
    });

    const job = await queue.submitJob({ userId, personImageAssetId: personAsset._id, productId: prod._id });
    await queue.processNextJobs();
    await new Promise(r => setTimeout(r, 60));

    const updated = await TryOnJob.findById(job._id);
    assert.equal(updated.status, 'RECONCILIATION_REQUIRED');
    assert.equal(updated.errorCode, 'AI_TIMEOUT');
    assert.equal(updated.reconciliation.state, 'AI_TIMEOUT_UNVERIFIED');
    assert.equal(lot.reservedAmount, 1); // Credit stays safely reserved
    assert.equal((await TryOnCreditLedger.find({ transactionType: 'REFUND' })).length, 0);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 8-11: fetchProductImageBuffer SSRF, Redirect, Size Limit & Spoof
  // ---------------------------------------------------------------------------
  it('8. fetchProductImageBuffer blocks disallowed host, cloud metadata IP & DNS rebinding', async () => {
    const queue = new TryOnQueueService({ autoStart: false });
    await assert.rejects(
      () => queue.fetchProductImageBuffer('https://evil.untrusted-cdn.com/shirt.jpg'),
      err => err.code === 'SSRF_FORBIDDEN_HOST'
    );
    await assert.rejects(
      () => queue.fetchProductImageBuffer('https://169.254.169.254/latest/meta-data/'),
      err => err.code === 'SSRF_DIRECT_IP'
    );
    await assert.rejects(
      () => queue.fetchProductImageBuffer('https://amiri.com/img.png', {
        dnsLookup: (_host, opts, cb) => cb(null, opts && opts.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4)
      }),
      err => err.code === 'SSRF_FORBIDDEN_IP'
    );
  });

  it('9. fetchProductImageBuffer blocks unsafe HTTP 301/302 redirects', async () => {
    const queue = new TryOnQueueService({ autoStart: false });
    const server = http.createServer((_req, res) => {
      res.writeHead(302, { Location: 'https://169.254.169.254/secret' });
      res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const localMockAgent = new http.Agent({
      lookup: (_host, opts, cb) => cb(null, opts && opts.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4)
    });
    try {
      await assert.rejects(
        () => queue.fetchProductImageBuffer(`http://amiri.com:${port}/redirect.png`, {
          allowHttpForTest: true,
          transport: http,
          agent: localMockAgent
        }),
        err => err.code === 'REDIRECT_BLOCKED'
      );
    } finally {
      server.close();
    }
  });

  it('10. fetchProductImageBuffer rejects oversized remote image stream cleanly', async () => {
    const queue = new TryOnQueueService({ autoStart: false });
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.alloc(1024 * 60, 0xaa));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const localMockAgent = new http.Agent({
      lookup: (_host, opts, cb) => cb(null, opts && opts.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4)
    });
    try {
      await assert.rejects(
        () => queue.fetchProductImageBuffer(`http://amiri.com:${port}/huge.png`, {
          allowHttpForTest: true,
          transport: http,
          agent: localMockAgent,
          maxDownloadBytes: 10 * 1024
        }),
        err => err.code === 'IMAGE_TOO_LARGE'
      );
    } finally {
      server.close();
    }
  });

  it('11. fetchProductImageBuffer rejects wrong MIME & HTML spoofed as image, accepts valid CDN PNG', async () => {
    const queue = new TryOnQueueService({ autoStart: false });
    const validPng = await createSampleImageBuffer({ width: 200, height: 200, format: 'png' });
    let responseHandler = (_req, res) => res.end();
    const server = http.createServer((req, res) => responseHandler(req, res));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const localMockAgent = new http.Agent({
      lookup: (_host, opts, cb) => cb(null, opts && opts.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4)
    });
    try {
      responseHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(Buffer.from('<!DOCTYPE html><html><body>Fake</body></html>'));
      };
      await assert.rejects(
        () => queue.fetchProductImageBuffer(`http://amiri.com:${port}/fake.jpg`, {
          allowHttpForTest: true,
          transport: http,
          agent: localMockAgent
        }),
        err => err.code === 'HTML_SPOOFED_AS_IMAGE'
      );

      responseHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(Buffer.from('<svg></svg>'));
      };
      await assert.rejects(
        () => queue.fetchProductImageBuffer(`http://amiri.com:${port}/icon.svg`, {
          allowHttpForTest: true,
          transport: http,
          agent: localMockAgent
        }),
        err => err.code === 'UNSUPPORTED_MIME_TYPE'
      );

      responseHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(validPng);
      };
      const downloaded = await queue.fetchProductImageBuffer(`http://amiri.com:${port}/real.png`, {
        allowHttpForTest: true,
        transport: http,
        agent: localMockAgent
      });
      assert.ok(Buffer.isBuffer(downloaded) && downloaded.length > 0);
    } finally {
      server.close();
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 12: Image preprocessing (7MB Base64 limit, format conversion, aspect ratio, bombs)
  // ---------------------------------------------------------------------------
  it('12. TryOnImageService compresses raw<7MB whose Base64>7MB, converts WebP preserving ratio, blocks bombs & preserves original', async () => {
    // 1200x1600 noisy PNG is ~5.76 MB raw (< 7MB raw) yet ~7.68 MB Base64 (> 7MB inline Vertex limit!)
    const noisyBuf = await sharp(crypto.randomBytes(1200 * 1600 * 3), {
      raw: { width: 1200, height: 1600, channels: 3 }
    }).png().toBuffer();
    const origSha = crypto.createHash('sha256').update(noisyBuf).digest('hex');
    assert.ok(noisyBuf.length > 5 * 1024 * 1024 && Buffer.byteLength(noisyBuf.toString('base64'), 'utf8') > 7 * 1000 * 1000);

    const prepCompressed = await tryOnImageService.preprocessForTryOn(noisyBuf);
    assert.ok(prepCompressed.base64Bytes <= 7 * 1000 * 1000);
    assert.equal(prepCompressed.transformed, true);
    assert.equal(prepCompressed.mimeType, 'image/jpeg');
    const ratioDiff = Math.abs((prepCompressed.width / prepCompressed.height) - (1200 / 1600));
    assert.ok(ratioDiff < 0.02, `Expected aspect ratio preserved, got diff ${ratioDiff}`);
    assert.equal(crypto.createHash('sha256').update(noisyBuf).digest('hex'), origSha);

    const webpBuf = await createSampleImageBuffer({ width: 600, height: 900, format: 'webp' });
    const prepWebp = await tryOnImageService.preprocessForTryOn(webpBuf);
    assert.ok(prepWebp.mimeType === 'image/jpeg' || prepWebp.mimeType === 'image/png');
    assert.equal(prepWebp.originalFormat, 'webp');
    assert.equal(prepWebp.width, 600);
    assert.equal(prepWebp.height, 900);

    // AVIF images report metadata.format === 'heif' in Sharp/libvips — must convert cleanly to JPEG
    const avifBuf = await sharp(
      Buffer.alloc(320 * 480 * 3, 220),
      { raw: { width: 320, height: 480, channels: 3 } }
    ).avif().toBuffer();
    const prepAvif = await tryOnImageService.preprocessForTryOn(avifBuf);
    assert.equal(prepAvif.mimeType, 'image/jpeg');
    assert.equal(prepAvif.originalFormat, 'heif');
    assert.equal(prepAvif.width, 320);
    assert.equal(prepAvif.height, 480);
    assert.equal(prepAvif.transformed, true);

    const largeCanvas = await createSampleImageBuffer({ width: 2000, height: 2000, noise: false, format: 'png' });
    await assert.rejects(
      () => tryOnImageService.preprocessForTryOn(largeCanvas, { maxInputPixels: 1000 * 1000 }),
      err => err.code === 'DECOMPRESSION_BOMB'
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 13-15: Private Storage Path Traversal, Deleted/Expired Signed URLs & Ownership
  // ---------------------------------------------------------------------------
  it('13. Private storage strictly blocks path traversal and sibling directory prefix bypass', async () => {
    const ownerId = makeId();
    const imgBuf = await createSampleImageBuffer({ width: 400, height: 600, format: 'png' });
    const siblingDir = `${path.resolve(tempStorageDir)}_evil`;

    assert.equal(tryOnStorageService.isPathInsideStorage(path.join(tempStorageDir, '..', '..', 'etc', 'passwd')), false);
    assert.equal(tryOnStorageService.isPathInsideStorage(path.join(siblingDir, 'leak.png')), false);

    fs.mkdirSync(siblingDir, { recursive: true });
    const externalSecretFile = path.join(siblingDir, 'do-not-delete.png');
    fs.writeFileSync(externalSecretFile, imgBuf);

    try {
      const evilAsset = await TryOnImageAsset.create({
        user: ownerId,
        type: 'user_upload',
        storagePath: externalSecretFile,
        mimeType: 'image/png',
        fileSizeBytes: imgBuf.length,
        sha256: 'abc',
        expiresAt: new Date(Date.now() - 1000),
        isDeleted: false
      });

      await assert.rejects(
        () => tryOnStorageService.getImageBuffer(evilAsset._id, ownerId, false),
        err => err.code === 'PATH_TRAVERSAL_BLOCKED' && err.statusCode === 403
      );
      await assert.rejects(
        () => tryOnStorageService.deleteAsset(evilAsset._id, ownerId, false),
        err => err.code === 'PATH_TRAVERSAL_BLOCKED' && err.statusCode === 403
      );

      const cleanupRun1 = await tryOnStorageService.cleanupExpiredAssets(50);
      assert.equal(cleanupRun1.deletedCount, 1);
      assert.equal(fs.existsSync(externalSecretFile), true);
      const cleanupRun2 = await tryOnStorageService.cleanupExpiredAssets(50);
      assert.equal(cleanupRun2.deletedCount, 0);
    } finally {
      fs.rmSync(siblingDir, { recursive: true, force: true });
    }
  });

  it('14. Private storage rejects expired signed tokens and omits/blocks deleted & expired assets', async () => {
    const ownerId = makeId();
    const imgBuf = await createSampleImageBuffer({ width: 400, height: 600, format: 'png' });
    const asset = await tryOnStorageService.saveImage({
      userId: ownerId, buffer: imgBuf, mimeType: 'image/png', type: 'user_upload'
    });

    const expiredToken = tryOnStorageService.generateSignedToken(asset._id, ownerId, -10);
    assert.equal(tryOnStorageService.verifySignedToken(expiredToken), null);

    assert.ok(await tryOnStorageService.issueSignedUrlIfValid(asset._id, ownerId));
    await tryOnStorageService.deleteAsset(asset._id, ownerId, false);
    assert.equal(await tryOnStorageService.issueSignedUrlIfValid(asset._id, ownerId), null);
    await assert.rejects(
      () => tryOnStorageService.getImageBuffer(asset._id, ownerId, false),
      err => err.statusCode === 404 && err.code === 'ASSET_DELETED_OR_MISSING'
    );
  });

  it('15. Private storage blocks cross-user read and delete access with 403', async () => {
    const ownerId = makeId();
    const attackerId = makeId();
    const imgBuf = await createSampleImageBuffer({ width: 400, height: 600, format: 'png' });
    const asset = await tryOnStorageService.saveImage({
      userId: ownerId, buffer: imgBuf, mimeType: 'image/png', type: 'user_upload'
    });

    await assert.rejects(
      () => tryOnStorageService.getImageBuffer(asset._id, attackerId, false),
      err => err.statusCode === 403 && err.code === 'ASSET_FORBIDDEN'
    );
    await assert.rejects(
      () => tryOnStorageService.deleteAsset(asset._id, attackerId, false),
      err => err.statusCode === 403 && err.code === 'ASSET_FORBIDDEN'
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 16: PhotoQualityService RGB luminance (Dark, Bright, Normal)
  // ---------------------------------------------------------------------------
  it('16. PhotoQualityService computes true RGB pixel luminance on dark, overexposed & well-lit portraits', async () => {
    const darkBuf = await createSampleImageBuffer({ width: 800, height: 1000, r: 14, g: 16, b: 18, noise: false });
    const brightBuf = await createSampleImageBuffer({ width: 800, height: 1000, r: 248, g: 249, b: 250, noise: false });
    const normalBuf = await createSampleImageBuffer({ width: 800, height: 1000, r: 120, g: 130, b: 140, noise: true });

    const darkRes = await photoQualityService.analyzePhotoQuality(darkBuf, 'image/jpeg');
    const brightRes = await photoQualityService.analyzePhotoQuality(brightBuf, 'image/jpeg');
    const normalRes = await photoQualityService.analyzePhotoQuality(normalBuf, 'image/jpeg');

    assert.ok(darkRes.issues.some(i => i.code === 'LOW_LIGHTING'));
    assert.ok(darkRes.metrics.meanLuma < 65);

    assert.ok(brightRes.issues.some(i => i.code === 'OVEREXPOSURE'));
    assert.ok(brightRes.metrics.meanLuma > 225);

    assert.equal(normalRes.issues.some(i => i.code === 'LOW_LIGHTING' || i.code === 'OVEREXPOSURE'), false);
    assert.equal(normalRes.status, 'READY');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 17: Provider Adapter Contract, Vertex Schema Lock & Stubs
  // ---------------------------------------------------------------------------
  it('17. VertexVto001Adapter strictly omits prompt/productDescription and future stubs report unavailable', async () => {
    const adapter = new VertexVto001Adapter({
      authService: { getAccessToken: async () => 'mock-oauth-token' },
      fetchImpl: async (_url, opts) => {
        const body = JSON.parse(opts.body);
        const instance = body.instances[0];
        assert.equal(Object.prototype.hasOwnProperty.call(instance, 'prompt'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(instance, 'productDescription'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(body.parameters, 'prompt'), false);
        assert.equal(body.parameters.sampleCount, 1);
        return {
          ok: true,
          status: 200,
          headers: new Map([['x-goog-request-id', 'req-schema-ok']]),
          json: async () => ({
            predictions: [{ bytesBase64Encoded: 'A'.repeat(160) }]
          })
        };
      }
    });

    const out = await adapter.executeTryOn({ personBase64: 'cGVyc29u', productBase64: 'cHJvZHVjdA==' });
    assert.equal(out.vertexRequestId, 'req-schema-ok');
    assert.equal(out.providerId, 'google-vertex-vto-001');

    const registry = new TryOnProviderRegistry();
    assert.equal(registry.getDefaultProvider().providerId, 'google-vertex-vto-001');

    for (const StubClass of [GeminiImageEditAdapter, EyewearProvider, FootwearProvider, AccessoriesProvider]) {
      const stub = new StubClass();
      assert.equal(stub.isAvailable(), false);
      await assert.rejects(() => stub.executeTryOn(), err => err.code === 'NOT_IMPLEMENTED');
    }

    assert.equal(virtualTryOnService.getActiveProvider({ category: 'tops' }).providerId, 'google-vertex-vto-001');
    assert.throws(
      () => virtualTryOnService.getActiveProvider({ category: 'eyewear' }),
      err => ['PROVIDER_NOT_CONFIGURED', 'UNSUPPORTED_CATEGORY', 'CATEGORY_EXPERIMENTAL_DISABLED'].includes(err.code)
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 18: Auth middleware (deleted user 401, non-admin 403, unified JWT secret) + rate-limit ordering & idempotency
  // ---------------------------------------------------------------------------
  it('18. Auth middleware returns 401 on deleted user & 403 on non-admin; validation errors do not burn rate limit; package/adjust idempotency', async () => {
    const validUserId = makeId();
    const deletedUserId = makeId();
    await User.create({ _id: validUserId, name: 'Regular User', email: 'u@kdxx.vn', role: 'user' });

    const callProtect = (token) => new Promise(resolve => {
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ statusCode: this.statusCode, payload, nextCalled: false }); }
      };
      protect(req, res, () => resolve({ statusCode: 200, req, nextCalled: true }));
    });

    // Deleted user fails with 401
    const deletedJwt = jwt.sign({ id: deletedUserId }, getJwtSecret());
    const delRes = await callProtect(deletedJwt);
    assert.equal(delRes.statusCode, 401);
    assert.equal(delRes.nextCalled, false);

    // Valid non-admin user passes protect but fails admin with 403 (not 401)
    const userJwt = jwt.sign({ id: validUserId }, getJwtSecret());
    const okProtect = await callProtect(userJwt);
    assert.equal(okProtect.nextCalled, true);

    await new Promise(resolve => {
      const res = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(payload) {
          assert.equal(this.statusCode, 403);
          assert.ok(payload.message);
          resolve();
        }
      };
      admin(okProtect.req, res, () => assert.fail('Non-admin must not pass admin middleware'));
    });

    // Rate limit ordering: repeated invalid submissions never burn tryOns quota
    const queue = new TryOnQueueService({ autoStart: false });
    for (let i = 0; i < 6; i++) {
      await assert.rejects(
        () => queue.submitJob({ userId: validUserId, personImageAssetId: makeId(), productId: makeId() }),
        err => err.code === 'PERSON_IMAGE_NOT_FOUND'
      );
    }
    assert.equal((queue.rateLimits.tryOns.get(String(validUserId)) || []).length, 0);

    // Purchase package & Admin adjustment deterministic idempotency
    // Note: new account automatically receives 10 welcome free credits, then +20 package +5 manual = 35
    await tryOnCreditService.grantPurchasedPackage(validUserId, 20, 'PACK_20', 'ORD_999');
    await tryOnCreditService.grantPurchasedPackage(validUserId, 20, 'PACK_20', 'ORD_999');
    const pkgLedgers = await TryOnCreditLedger.find({ user: validUserId, transactionType: 'PURCHASE_PACKAGE' });
    assert.equal(pkgLedgers.length, 1);

    const adj1 = await tryOnCreditService.manualAdjustCredit({
      adminUserId: makeId(), targetUserId: validUserId, amount: 5,
      reason: 'Customer support goodwill', idempotencyKey: 'KEY_ADJ_01'
    });
    const adj2 = await tryOnCreditService.manualAdjustCredit({
      adminUserId: makeId(), targetUserId: validUserId, amount: 5,
      reason: 'Customer support goodwill', idempotencyKey: 'KEY_ADJ_01'
    });
    assert.equal(adj1.newBalance, 35);
    assert.equal(adj2.alreadyProcessed, true);
    assert.equal((await TryOnCreditLedger.find({ user: validUserId, transactionType: 'MANUAL_ADJUSTMENT' })).length, 1);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 19: Queue priority (HOMIE > Free), active limit & idempotency
  // ---------------------------------------------------------------------------
  it('19. Queue picks HOMIE priority over older Free job and enforces max 2 active jobs', async () => {
    const freeCtx = await seedUserAndCredits('user', 5, 'free');
    const homieCtx = await seedUserAndCredits('user', 5, 'homie');
    const sampleBuf = await createSampleImageBuffer({ width: 600, height: 800 });

    const freeAsset = await tryOnStorageService.saveImage({ userId: freeCtx.userId, buffer: sampleBuf, mimeType: 'image/jpeg', type: 'user_upload' });
    const homieAsset = await tryOnStorageService.saveImage({ userId: homieCtx.userId, buffer: sampleBuf, mimeType: 'image/jpeg', type: 'user_upload' });
    const prod = await Product.create({ _id: makeId(), name: 'AMIRI Jacket', category: 'outerwear', image: 'https://amiri.com/j.jpg' });

    const queue = new TryOnQueueService({ autoStart: false });
    const processedOrder = [];
    queue.executeJob = async (job) => { processedOrder.push(String(job._id)); };

    const freeJob1 = await queue.submitJob({ userId: freeCtx.userId, personImageAssetId: freeAsset._id, productId: prod._id, idempotencyKey: 'FREE_1' });
    // Duplicate idempotencyKey returns same job cleanly
    const dupFree = await queue.submitJob({ userId: freeCtx.userId, personImageAssetId: freeAsset._id, productId: prod._id, idempotencyKey: 'FREE_1' });
    assert.equal(String(dupFree._id), String(freeJob1._id));

    await queue.submitJob({ userId: freeCtx.userId, personImageAssetId: freeAsset._id, productId: prod._id, idempotencyKey: 'FREE_2' });
    // 3rd active job for regular user blocked cleanly
    await assert.rejects(
      () => queue.submitJob({ userId: freeCtx.userId, personImageAssetId: freeAsset._id, productId: prod._id, idempotencyKey: 'FREE_3' }),
      err => err.code === 'MAX_ACTIVE_JOBS_EXCEEDED'
    );

    const homieJob = await queue.submitJob({ userId: homieCtx.userId, personImageAssetId: homieAsset._id, productId: prod._id, idempotencyKey: 'HOMIE_1' });
    assert.equal(homieJob.priority, 10);

    await queue.processNextJobs();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(processedOrder[0], String(homieJob._id));
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 20: FIFO Expiry Lot Consumption & Credit Balance Invariant
  // ---------------------------------------------------------------------------
  it('20. FIFO consumes earliest-expiring credit lot first and keeps available balance invariant accurate', async () => {
    const userId = makeId();
    await User.create({ _id: userId, name: 'FIFO User', email: 'fifo@kdxx.vn', role: 'user' });
    await TryOnCredit.create({ user: userId, totalAvailableCredits: 4, freeCreditsClaimed: true, membershipType: 'free' });

    const expiringSoon = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 1, remainingAmount: 1, reservedAmount: 0,
      expiresAt: new Date(Date.now() + 2 * 86400 * 1000), isActive: true
    });
    const expiringLater = await TryOnCreditLot.create({
      user: userId, lotType: 'purchased', initialAmount: 3, remainingAmount: 3, reservedAmount: 0,
      expiresAt: new Date(Date.now() + 60 * 86400 * 1000), isActive: true
    });

    const jobA = makeId();
    const resA = await tryOnCreditService.reserveCredit(userId, jobA, 1);
    assert.equal(String(resA.lotId), String(expiringSoon._id));
    assert.equal(await tryOnCreditService.recalculateAvailableBalance(userId), 3);

    await tryOnCreditService.commitCredit(userId, jobA, resA.lotId, 1);
    assert.equal(expiringSoon.isActive, false);
    assert.equal(expiringSoon.remainingAmount, 0);

    const jobB = makeId();
    const resB = await tryOnCreditService.reserveCredit(userId, jobB, 1);
    assert.equal(String(resB.lotId), String(expiringLater._id));
    await tryOnCreditService.refundCredit(userId, jobB, resB.lotId, 'Cancelled by user', 1);
    assert.equal(await tryOnCreditService.recalculateAvailableBalance(userId), 3);
  });
});
