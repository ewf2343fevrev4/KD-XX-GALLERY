process.env.NODE_ENV = 'test';
process.env.TRYON_DISABLE_AUTO_WORKER = 'true';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const sharp = require('sharp');

const Product = require('../models/Product');
const ProductIntelligence = require('../models/ProductIntelligence');
const TryOnJob = require('../models/TryOnJob');
const TryOnImageAsset = require('../models/TryOnImageAsset');
const TryOnCredit = require('../models/TryOnCredit');
const TryOnCreditLot = require('../models/TryOnCreditLot');
const TryOnCreditLedger = require('../models/TryOnCreditLedger');
const TryOnCreditSettlement = require('../models/TryOnCreditSettlement');
const TryOnProviderConfig = require('../models/TryOnProviderConfig');
const User = require('../models/User');

const { TryOnProviderRegistry } = require('../services/providers/TryOnProviderRegistry');
const VertexVto001Adapter = require('../services/providers/VertexVto001Adapter');
const GeminiImageEditAdapter = require('../services/providers/GeminiImageEditAdapter');
const { TryOnProviderConfigService } = require('../services/tryOnProviderConfigService');
const { VirtualTryOnService } = require('../services/virtualTryOnService');
const tryOnCreditService = require('../services/tryOnCreditService');
const { TryOnQueueService } = require('../services/tryOnQueueService');
const { FullOutfitBenchmarkGate } = require('../services/fullOutfitBenchmarkGate');
const fullOutfitBenchmarkGate = require('../services/fullOutfitBenchmarkGate');
const tryOnUsageStatsService = require('../services/tryOnUsageStatsService');
const tryOnRoutes = require('../routes/tryOnRoutes');
const singletonQueueService = require('../services/tryOnQueueService');

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
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
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
      if ('$ne' in cond && String(val) === String(cond.$ne)) return false;
      if ('$gt' in cond) {
        if (val instanceof Date || cond.$gt instanceof Date) {
          if (!(val != null && new Date(val).getTime() > new Date(cond.$gt).getTime())) return false;
        } else if (!(Number(val) > Number(cond.$gt))) {
          return false;
        }
      }
      if ('$gte' in cond) {
        if (val instanceof Date || cond.$gte instanceof Date) {
          if (!(val != null && new Date(val).getTime() >= new Date(cond.$gte).getTime())) return false;
        } else if (!(Number(val) >= Number(cond.$gte))) {
          return false;
        }
      }
      if ('$lt' in cond) {
        if (val instanceof Date || cond.$lt instanceof Date) {
          if (!(val != null && new Date(val).getTime() < new Date(cond.$lt).getTime())) return false;
        } else if (!(Number(val) < Number(cond.$lt))) {
          return false;
        }
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
    raw.markModified = function () {};
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
      limit(n) { list = list.slice(0, n); return queryObj; },
      select() { return queryObj; },
      populate() { return queryObj; },
      lean() { return Promise.resolve(list); },
      then(res, rej) { return Promise.resolve(list).then(res, rej); }
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
        lean: () => Promise.resolve(found),
        then: (res, rej) => Promise.resolve(found).then(res, rej)
      };
    };
    Model.findById = (id) => {
      const found = store.docs.find(d => String(d._id) === String(id)) || null;
      return {
        select: () => Promise.resolve(found),
        populate: () => Promise.resolve(found),
        lean: () => Promise.resolve(found),
        then: (res, rej) => Promise.resolve(found).then(res, rej)
      };
    };
    Model.create = async (payload) => {
      if (Array.isArray(payload)) {
        const out = [];
        for (const item of payload) {
          const defaults = typeof store.defaultFactory === 'function' ? store.defaultFactory() : {};
          out.push(await store.wrap({ ...defaults, ...item }).save());
        }
        return out;
      }
      const defaults = typeof store.defaultFactory === 'function' ? store.defaultFactory() : {};
      const wrapped = store.wrap({ ...defaults, ...payload });
      return wrapped.save();
    };
    Model.findOneAndUpdate = async (q, update, opts = {}) => {
      const matches = store.docs.filter(d => matchesQuery(d, q));
      if (matches.length === 0) {
        if (opts.upsert) {
          const defaults = typeof store.defaultFactory === 'function' ? store.defaultFactory() : {};
          const setPayload = { ...(update.$set || {}) };
          const created = store.wrap({ ...defaults, ...q, ...setPayload });
          return created.save();
        }
        return null;
      }
      const target = matches[0];
      const setPayload = { ...(update.$set || {}) };
      for (const [k, v] of Object.entries(update)) {
        if (!k.startsWith('$')) setPayload[k] = v;
      }
      for (const [k, v] of Object.entries(setPayload)) {
        if (k.includes('.')) setNested(target, k, v);
        else target[k] = v;
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          const cur = Number(getNested(target, k) || 0);
          if (k.includes('.')) setNested(target, k, cur + v);
          else target[k] = cur + v;
        }
      }
      await target.save();
      return target;
    };
    Model.countDocuments = async (q = {}) => store.docs.filter(d => matchesQuery(d, q)).length;
    return () => Object.assign(Model, originals);
  }
}

async function createPatternPng({ width = 160, height = 240, rgbBase = [40, 60, 120], stripeRgb = [220, 180, 70] } = {}) {
  const stripe = await sharp({
    create: { width: Math.max(16, Math.floor(width / 2)), height: Math.max(16, Math.floor(height / 3)), channels: 3, background: { r: stripeRgb[0], g: stripeRgb[1], b: stripeRgb[2] } }
  }).png().toBuffer();

  return sharp({
    create: { width, height, channels: 3, background: { r: rgbBase[0], g: rgbBase[1], b: rgbBase[2] } }
  })
    .composite([{ input: stripe, top: 20, left: 20 }])
    .png()
    .toBuffer();
}

function createMemoryStorageDouble(assetModelStore) {
  const buffers = new Map();
  return {
    buffers,
    generateSignedToken(assetId, userId, type) {
      return `tok_${String(assetId)}_${String(userId)}_${type}`;
    },
    async saveImage({ userId, type = 'tryon_result', buffer, mimeType = 'image/png', retentionHours = 72 }) {
      const cappedHours = Math.min(72, Math.max(1, Number(retentionHours || 72)));
      const expiresAt = new Date(Date.now() + cappedHours * 3600 * 1000);
      const doc = await TryOnImageAsset.create({
        user: userId,
        type,
        mimeType,
        sizeBytes: buffer.length,
        status: 'ACTIVE',
        isDeleted: false,
        expiresAt,
        storageKey: `mem_${makeId()}`
      });
      buffers.set(String(doc._id), buffer);
      return doc;
    },
    async getImageBuffer(assetId, userId, skipOwnership = false) {
      const asset = assetModelStore.docs.find(d => String(d._id) === String(assetId));
      if (!asset || asset.isDeleted) {
        const err = new Error('Ảnh đã bị xóa hoặc hết hạn.');
        err.statusCode = 404;
        throw err;
      }
      if (!skipOwnership && String(asset.user) !== String(userId)) {
        const err = new Error('Không có quyền truy cập ảnh này.');
        err.statusCode = 403;
        throw err;
      }
      return { buffer: buffers.get(String(asset._id)), mimeType: asset.mimeType || 'image/png', asset };
    }
  };
}

async function invokeRouterHandler(router, method, pathPattern, { params = {}, query = {}, body = {}, user = null } = {}) {
  const layer = router.stack.find(l => l.route && l.route.path === pathPattern && l.route.methods[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${pathPattern} not found`);
  const handlers = layer.route.stack.map(s => s.handle);
  const targetHandler = handlers[handlers.length - 1];

  return new Promise((resolve, reject) => {
    const req = { params, query, body, user, headers: {} };
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return res; },
      json(payload) { resolve({ statusCode, body: payload }); return res; }
    };
    Promise.resolve(targetHandler(req, res, (err) => {
      if (err) reject(err);
    })).catch(reject);
  });
}

describe('Phase 5.5 — Remediation Regression Suite (Gaps 1-5, Zero Paid AI Calls)', () => {
  let restores = [];
  let stores = {};
  let origVertexExecute = null;
  let savedBenchmarkEnv = {};

  const BENCH_ENV_KEYS = [
    'TRYON_FULL_OUTFIT_BENCHMARK_ENABLED',
    'TRYON_FULL_OUTFIT_BENCHMARK_ALLOWED_ENVS',
    'TRYON_FULL_OUTFIT_BENCHMARK_MAX_JOBS',
    'TRYON_FULL_OUTFIT_BENCHMARK_WINDOW_MINUTES',
    'TRYON_FULL_OUTFIT_BENCHMARK_EXPIRES_AT',
    'TRYON_FULL_OUTFIT_BENCHMARK_STARTED_AT',
    'TRYON_FULL_OUTFIT_BENCHMARK_RATE_MAX',
    'TRYON_FULL_OUTFIT_BENCHMARK_RATE_WINDOW_MINUTES',
    'GCP_PROJECT_ID',
    'NODE_ENV'
  ];

  beforeEach(() => {
    origVertexExecute = VertexVto001Adapter.prototype.executeTryOn;
    VertexVto001Adapter.prototype.executeTryOn = async function () {
      throw new Error('REAL_VERTEX_CALL_FORBIDDEN_IN_TESTS');
    };

    for (const k of BENCH_ENV_KEYS) {
      savedBenchmarkEnv[k] = process.env[k];
      if (k !== 'NODE_ENV') delete process.env[k];
    }
    process.env.GCP_PROJECT_ID = 'kdxx-test-proj';
    fullOutfitBenchmarkGate.resetRuntimeState();

    stores = {
      Product: new InMemoryModelStub(),
      ProductIntelligence: new InMemoryModelStub(['product']),
      TryOnJob: new InMemoryModelStub([], () => ({
        status: 'QUEUED',
        mode: 'SINGLE_ITEM',
        creditsCost: 1,
        outfitItems: [],
        executionSteps: [],
        creditReservations: [],
        timing: { queuedAt: new Date() },
        aiProviderDetails: {},
        reconciliation: { state: 'NONE', requiresManualAdmin: false }
      })),
      TryOnImageAsset: new InMemoryModelStub([], () => ({ isDeleted: false, status: 'ACTIVE' })),
      TryOnCredit: new InMemoryModelStub(['user'], () => ({ membershipType: 'free', totalAvailableCredits: 0 })),
      TryOnCreditLot: new InMemoryModelStub([], () => ({ reservedAmount: 0, isActive: true })),
      TryOnCreditLedger: new InMemoryModelStub(['idempotencyKey']),
      TryOnCreditSettlement: new InMemoryModelStub(['operationKey']),
      TryOnProviderConfig: new InMemoryModelStub(['providerId']),
      User: new InMemoryModelStub(['email'])
    };

    restores = [
      stores.Product.installOn(Product),
      stores.ProductIntelligence.installOn(ProductIntelligence),
      stores.TryOnJob.installOn(TryOnJob),
      stores.TryOnImageAsset.installOn(TryOnImageAsset),
      stores.TryOnCredit.installOn(TryOnCredit),
      stores.TryOnCreditLot.installOn(TryOnCreditLot),
      stores.TryOnCreditLedger.installOn(TryOnCreditLedger),
      stores.TryOnCreditSettlement.installOn(TryOnCreditSettlement),
      stores.TryOnProviderConfig.installOn(TryOnProviderConfig),
      stores.User.installOn(User)
    ];
  });

  afterEach(() => {
    VertexVto001Adapter.prototype.executeTryOn = origVertexExecute;
    for (const r of restores) r();
    fullOutfitBenchmarkGate.resetRuntimeState();
    for (const k of BENCH_ENV_KEYS) {
      if (savedBenchmarkEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedBenchmarkEnv[k];
    }
  });

  // =========================================================
  // GAP 1: ADMIN-ONLY BENCHMARK GATE (P0)
  // =========================================================
  it('GAP 1.1: Benchmark Mode defaults OFF; rejects both user & admin and ignores spoofed client role/benchmarkMode', async () => {
    const adminId = makeId();
    const userId = makeId();
    await User.create({ _id: adminId, name: 'Owner', email: 'admin@kdxx.test', role: 'admin' });
    await User.create({ _id: userId, name: 'Client', email: 'user@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 5 });
    await TryOnCreditLot.create({ user: userId, lotType: 'free', initialAmount: 5, remainingAmount: 5, isActive: true });

    const topProduct = await Product.create({ name: 'AMIRI TEE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/tee.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/jeans.png' });
    await ProductIntelligence.create({ product: topProduct._id, taxonomy: { domain: 'clothing', subCategory: 't-shirts', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });

    const adminAsset = await TryOnImageAsset.create({ user: adminId, type: 'person_photo', mimeType: 'image/png', expiresAt: new Date(Date.now() + 3600 * 1000) });
    const userAsset = await TryOnImageAsset.create({ user: userId, type: 'person_photo', mimeType: 'image/png', expiresAt: new Date(Date.now() + 3600 * 1000) });

    // User spoof attempt with benchmarkMode: true, role: 'admin', userId: adminId, creditsCost: 0
    const userSpoof = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
      user: { _id: userId, role: 'user' },
      body: {
        personImageAssetId: String(userAsset._id),
        items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
        benchmarkMode: true,
        role: 'admin',
        userId: String(adminId),
        creditsCost: 0
      }
    });
    assert.equal(userSpoof.statusCode, 400);
    assert.equal(userSpoof.body.code, 'FULL_OUTFIT_PENDING_BENCHMARK');

    // Admin with Benchmark Mode OFF (default)
    const adminOff = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
      user: { _id: adminId, role: 'admin' },
      body: {
        personImageAssetId: String(adminAsset._id),
        items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
        benchmarkMode: true
      }
    });
    assert.equal(adminOff.statusCode, 400);
    assert.equal(adminOff.body.code, 'FULL_OUTFIT_BENCHMARK_DISABLED');

    // Public capabilities remains locked
    const capResp = await invokeRouterHandler(tryOnRoutes, 'get', '/capabilities');
    assert.equal(capResp.body.data.fullOutfitCapability.allowSubmit, false);
    assert.equal(capResp.body.data.fullOutfitCapability.blockCode, 'FULL_OUTFIT_PENDING_BENCHMARK');
  });

  it('GAP 1.2: Admin-only Benchmark Gate enforces env allowlist, expiry window, max jobs, dedicated rate limit, instant disable & provider lifecycle/credits', async () => {
    const adminId = makeId();
    const userId = makeId();
    await User.create({ _id: adminId, name: 'Owner', email: 'admin2@kdxx.test', role: 'admin' });
    await User.create({ _id: userId, name: 'Client', email: 'user2@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 5 });
    await TryOnCreditLot.create({ user: userId, lotType: 'free', initialAmount: 5, remainingAmount: 5, isActive: true });

    const topProduct = await Product.create({ name: 'AMIRI JACKET', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/j.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/jn.png' });
    const shoesProduct = await Product.create({ name: 'AMIRI SNEAKERS', brand: 'AMIRI', category: 'shoes', image: 'https://cdn.example.com/s.png' });
    await ProductIntelligence.create({ product: topProduct._id, taxonomy: { domain: 'clothing', subCategory: 'jackets', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: shoesProduct._id, taxonomy: { domain: 'footwear', subCategory: 'sneakers' }, verificationStatus: 'VERIFIED' });

    const adminAsset = await TryOnImageAsset.create({ user: adminId, type: 'person_photo', mimeType: 'image/png', expiresAt: new Date(Date.now() + 3600 * 1000) });
    const userAsset = await TryOnImageAsset.create({ user: userId, type: 'person_photo', mimeType: 'image/png', expiresAt: new Date(Date.now() + 3600 * 1000) });

    // Enable benchmark in backend env
    process.env.TRYON_FULL_OUTFIT_BENCHMARK_ENABLED = 'true';
    process.env.TRYON_FULL_OUTFIT_BENCHMARK_MAX_JOBS = '3';
    process.env.TRYON_FULL_OUTFIT_BENCHMARK_RATE_MAX = '2';

    const origProcessNextJobs = singletonQueueService.processNextJobs;
    singletonQueueService.processNextJobs = async () => {};
    try {
      // A) Production environment rejected by default
      process.env.NODE_ENV = 'production';
      const prodAttempt = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: adminId, role: 'admin' },
        body: {
          personImageAssetId: String(adminAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }]
        }
      });
      assert.equal(prodAttempt.statusCode, 403);
      assert.equal(prodAttempt.body.code, 'BENCHMARK_ENV_NOT_ALLOWED');

      process.env.NODE_ENV = 'test';

      // B) Normal user is STILL blocked even while Admin Benchmark is active
      const userBlocked = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: userId, role: 'user' },
        body: {
          personImageAssetId: String(userAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }]
        }
      });
      assert.equal(userBlocked.statusCode, 400);
      assert.equal(userBlocked.body.code, 'FULL_OUTFIT_PENDING_BENCHMARK');

      const userAcct = await invokeRouterHandler(tryOnRoutes, 'get', '/account', { user: { _id: userId, role: 'user' } });
      assert.equal(userAcct.body.data.fullOutfitBenchmark, null);

      const adminAcct = await invokeRouterHandler(tryOnRoutes, 'get', '/account', { user: { _id: adminId, role: 'admin' } });
      assert.equal(adminAcct.body.data.fullOutfitBenchmark.canSubmit, true);

      // C) Benchmark mode still enforces locked categories (FOOTWEAR) & credit policy (2 credits)
      await assert.rejects(
        () => singletonQueueService.submitFullOutfitJob({
          userId: adminId,
          userRole: 'admin',
          personImageAssetId: adminAsset._id,
          items: [{ productId: topProduct._id }, { productId: shoesProduct._id }]
        }),
        err => err.code === 'FULL_OUTFIT_FOOTWEAR_LOCKED'
      );

      // D) Submit 2 Admin benchmark jobs (hits rate limit = 2)
      const b1 = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: adminId, role: 'admin' },
        body: {
          personImageAssetId: String(adminAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          idempotencyKey: 'bench-1'
        }
      });
      assert.equal(b1.statusCode, 200);
      assert.equal(b1.body.data.creditsCost, 2);
      assert.equal(stores.TryOnJob.docs.find(j => String(j._id) === String(b1.body.data.jobId)).benchmark.isBenchmark, true);

      const b2 = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: adminId, role: 'admin' },
        body: {
          personImageAssetId: String(adminAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          idempotencyKey: 'bench-2'
        }
      });
      assert.equal(b2.statusCode, 200);

      // 3rd rapid call hits benchmark rate limit even for Admin!
      const bRateErr = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: adminId, role: 'admin' },
        body: {
          personImageAssetId: String(adminAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          idempotencyKey: 'bench-3-rate'
        }
      });
      assert.equal(bRateErr.statusCode, 429);
      assert.equal(bRateErr.body.code, 'BENCHMARK_RATE_LIMIT_EXCEEDED');

      // Clear rate limit hits, then verify MAX_JOBS cap (already 2, add 1 -> reaches max=3)
      fullOutfitBenchmarkGate.rateLimitHits.clear();
      const b3 = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: adminId, role: 'admin' },
        body: {
          personImageAssetId: String(adminAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          idempotencyKey: 'bench-3-cap'
        }
      });
      assert.equal(b3.statusCode, 200);

      const b4Cap = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: adminId, role: 'admin' },
        body: {
          personImageAssetId: String(adminAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          idempotencyKey: 'bench-4-cap'
        }
      });
      assert.equal(b4Cap.statusCode, 429);
      assert.equal(b4Cap.body.code, 'BENCHMARK_MAX_JOBS_EXCEEDED');

      // E) Expired window
      const gateWithExpiredEnv = new FullOutfitBenchmarkGate({
        getEnv: () => ({
          NODE_ENV: 'test',
          TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
          TRYON_FULL_OUTFIT_BENCHMARK_EXPIRES_AT: '2026-11-12T00:00:00.000Z'
        })
      });
      const expCheck = await gateWithExpiredEnv.evaluateAdminAccess({
        userId: adminId,
        userRole: 'admin',
        now: new Date('2026-11-12T10:00:00.000Z')
      });
      assert.equal(expCheck.allowed, false);
      assert.equal(expCheck.blockCode, 'BENCHMARK_WINDOW_EXPIRED');

      // F) Retired provider (2027-03-15) CANNOT be bypassed by benchmark mode
      const reg = new TryOnProviderRegistry();
      reg.providers.clear();
      const adapter = new VertexVto001Adapter({ projectId: 'test', location: 'us-central1', modelId: 'virtual-try-on-001' });
      adapter.areCredentialsConfigured = () => true;
      reg.register(adapter);
      const vtoRetired = new VirtualTryOnService({ registry: reg, providerConfigService: new TryOnProviderConfigService() });
      const retiredRouting = await vtoRetired.resolveFullOutfitRouting({ now: new Date('2027-03-15T00:00:00.000Z') });
      assert.equal(retiredRouting.support.blockCode, 'MODEL_RETIRED');

      // G) Instant backend kill switch disables immediately
      fullOutfitBenchmarkGate.disableImmediately();
      const killedResp = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: adminId, role: 'admin' },
        body: {
          personImageAssetId: String(adminAsset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          idempotencyKey: 'bench-killed'
        }
      });
      assert.equal(killedResp.statusCode, 400);
      assert.equal(killedResp.body.code, 'FULL_OUTFIT_BENCHMARK_DISABLED');
    } finally {
      singletonQueueService.processNextJobs = origProcessNextJobs;
    }
  });

  // =========================================================
  // GAP 2: MULTI-LOT COMMIT / REFUND ATOMICITY (ALL 6 SCENARIOS)
  // =========================================================
  it('GAP 2.1 & 2.5: Two-lot commit succeeds atomically & idempotency retry produces 0 duplicate ledgers/mutations', async () => {
    const userId = makeId();
    const jobId = makeId();
    await User.create({ _id: userId, name: 'Split User', email: 'split@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'homie', totalAvailableCredits: 2 });
    const lot1 = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 1, remainingAmount: 1, reservedAmount: 0, isActive: true, expiresAt: null
    });
    const lot2 = await TryOnCreditLot.create({
      user: userId, lotType: 'homie', initialAmount: 1, remainingAmount: 1, reservedAmount: 0, isActive: true, expiresAt: new Date(Date.now() + 86400000)
    });

    const reserveRes = await tryOnCreditService.reserveCredit(userId, jobId, 2);
    assert.equal(reserveRes.allocations.length, 2);

    const commitRes = await tryOnCreditService.commitCredit(userId, jobId, reserveRes.allocations, 2);
    assert.equal(commitRes.alreadyCommitted, false);
    assert.equal(commitRes.balanceAfter, 0);
    assert.equal(lot1.remainingAmount, 0);
    assert.equal(lot1.reservedAmount, 0);
    assert.equal(lot1.isActive, false);
    assert.equal(lot2.remainingAmount, 0);
    assert.equal(lot2.reservedAmount, 0);

    const retryRes = await tryOnCreditService.commitCredit(userId, jobId, reserveRes.allocations, 2);
    assert.equal(retryRes.alreadyCommitted, true);
    const ledgers = await TryOnCreditLedger.find({ job: jobId, transactionType: 'COMMIT' });
    assert.equal(ledgers.length, 2);
  });

  it('GAP 2.2: Multi-lot commit failure on lot 2 cleanly rolls back lot 1, leaves non-negative balances & 0 ledgers', async () => {
    const userId = makeId();
    const jobId = makeId();
    await User.create({ _id: userId, name: 'Rollback Commit', email: 'rb1@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'homie', totalAvailableCredits: 3 });
    const lot1 = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 1, remainingAmount: 1, reservedAmount: 1, isActive: true
    });
    const lot2 = await TryOnCreditLot.create({
      user: userId, lotType: 'homie', initialAmount: 2, remainingAmount: 2, reservedAmount: 0, isActive: true, expiresAt: new Date(Date.now() + 86400000)
    });

    const allocs = [
      { lotId: lot1._id, amount: 1 },
      { lotId: lot2._id, amount: 1 } // Lot 2 lacks reservedAmount -> fails on step 2 after lot 1 was updated!
    ];

    await assert.rejects(
      () => tryOnCreditService.commitCredit(userId, jobId, allocs, 2),
      err => err.code === 'INVALID_RESERVATION_COMMIT'
    );

    assert.equal(lot1.remainingAmount, 1);
    assert.equal(lot1.reservedAmount, 1);
    assert.equal(lot1.isActive, true);
    assert.equal(lot2.remainingAmount, 2);
    assert.equal(lot2.reservedAmount, 0);

    const ledgers = await TryOnCreditLedger.find({ job: jobId, transactionType: 'COMMIT' });
    assert.equal(ledgers.length, 0);

    const settlement = await TryOnCreditSettlement.findOne({ operationKey: `COMMIT_${jobId}` });
    assert.equal(settlement.status, 'ROLLED_BACK');
  });

  it('GAP 2.3: Multi-lot refund failure on lot 2 rolls back lot 1, and double-failure escalates to RECONCILIATION_REQUIRED', async () => {
    const userId = makeId();
    const jobA = makeId();
    await User.create({ _id: userId, name: 'Rollback Refund', email: 'rb2@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'homie', totalAvailableCredits: 3 });
    const lot1 = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 2, remainingAmount: 2, reservedAmount: 1, isActive: true
    });
    const lot2 = await TryOnCreditLot.create({
      user: userId, lotType: 'homie', initialAmount: 2, remainingAmount: 2, reservedAmount: 0, isActive: true, expiresAt: new Date(Date.now() + 86400000)
    });

    await assert.rejects(
      () => tryOnCreditService.refundCredit(userId, jobA, [{ lotId: lot1._id, amount: 1 }, { lotId: lot2._id, amount: 1 }], 'Step 2 error', 2),
      err => err.code === 'INVALID_RESERVATION_REFUND'
    );
    assert.equal(lot1.reservedAmount, 1);
    assert.equal((await TryOnCreditLedger.find({ job: jobA, transactionType: 'REFUND' })).length, 0);

    // Double failure: step 2 fails AND rollback step 1 also fails -> RECONCILIATION_REQUIRED
    const jobB = makeId();
    const origUpdate = TryOnCreditLot.findOneAndUpdate;
    let callIdx = 0;
    TryOnCreditLot.findOneAndUpdate = async (q, u, o) => {
      callIdx += 1;
      if (callIdx === 1) return origUpdate(q, u, o); // Lot 1 refund applied
      throw new Error('DB_WRITE_FAILURE_SIMULATED'); // Fail Lot 2 AND fail Lot 1 rollback!
    };
    try {
      await assert.rejects(
        () => tryOnCreditService.refundCredit(userId, jobB, [{ lotId: lot1._id, amount: 1 }, { lotId: lot2._id, amount: 1 }], 'Fail', 2),
        err => err.code === 'CREDIT_RECONCILIATION_REQUIRED'
      );
      const settlementB = await TryOnCreditSettlement.findOne({ operationKey: `REFUND_${jobB}` });
      assert.equal(settlementB.status, 'RECONCILIATION_REQUIRED');
      assert.equal(settlementB.requiresReconciliation, true);
    } finally {
      TryOnCreditLot.findOneAndUpdate = origUpdate;
    }
  });

  it('GAP 2.4 & Mongo Transaction: Concurrent commits settle strictly once even with extra reservation capacity, and Mongo transaction aborts atomically on error', async () => {
    const userId = makeId();
    const job1 = makeId();
    await User.create({ _id: userId, name: 'Concurrent', email: 'conc@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 10 });
    // Two active reservations share lot1 so reservedAmount is 2 while remainingAmount is 10
    const lot1 = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 10, remainingAmount: 10, reservedAmount: 2, isActive: true
    });

    const [r1, r2] = await Promise.all([
      tryOnCreditService.commitCredit(userId, job1, lot1._id, 1),
      tryOnCreditService.commitCredit(userId, job1, lot1._id, 1)
    ]);

    assert.equal(r1.success, true);
    assert.equal(r2.success, true);
    assert.equal(Number(r1.alreadyCommitted) + Number(r2.alreadyCommitted), 1);
    assert.equal(lot1.remainingAmount, 9);
    assert.equal(lot1.reservedAmount, 1);
    assert.equal((await TryOnCreditLedger.find({ job: job1, transactionType: 'COMMIT' })).length, 1);

    // Mocked MongoDB Replica Set Transaction path (commit + abort safety)
    const jobTxAbort = makeId();
    const txLot1 = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 2, remainingAmount: 2, reservedAmount: 1, isActive: true
    });
    const txLot2MissingReserve = await TryOnCreditLot.create({
      user: userId, lotType: 'purchased', initialAmount: 2, remainingAmount: 2, reservedAmount: 0, isActive: true
    });
    const fakeSessionAbort = {
      async withTransaction(fn) {
        const snapshot = JSON.parse(JSON.stringify(stores.TryOnCreditLot.docs));
        try {
          await fn();
        } catch (err) {
          // Simulate MongoDB native transaction abort restoring snapshot!
          for (const snap of snapshot) {
            const cur = stores.TryOnCreditLot.docs.find(d => String(d._id) === String(snap._id));
            if (cur) {
              cur.remainingAmount = snap.remainingAmount;
              cur.reservedAmount = snap.reservedAmount;
            }
          }
          throw err;
        }
      },
      async endSession() {}
    };

    await assert.rejects(
      () => tryOnCreditService.commitCredit(
        userId,
        jobTxAbort,
        [{ lotId: txLot1._id, amount: 1 }, { lotId: txLot2MissingReserve._id, amount: 1 }],
        2,
        { sessionRunner: async () => fakeSessionAbort }
      ),
      err => err.code === 'INVALID_RESERVATION_COMMIT'
    );
    assert.equal(txLot1.remainingAmount, 2);
    assert.equal(txLot1.reservedAmount, 1);
  });

  it('GAP 2.6: Server restart mid-update resumes checkpointed settlement without double-charging lot 1', async () => {
    const userId = makeId();
    const jobId = makeId();
    await User.create({ _id: userId, name: 'Crash Recovery', email: 'crash@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'homie', totalAvailableCredits: 0 });
    // Simulate state right after lot1 was already decremented (remaining 1 -> 0, reserved 1 -> 0) and lot2 is still pending!
    const lot1 = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 1, remainingAmount: 0, reservedAmount: 0, isActive: false
    });
    const lot2 = await TryOnCreditLot.create({
      user: userId, lotType: 'homie', initialAmount: 1, remainingAmount: 1, reservedAmount: 1, isActive: true, expiresAt: new Date(Date.now() + 86400000)
    });

    await TryOnCreditSettlement.create({
      operationKey: `COMMIT_${jobId}`,
      operationType: 'COMMIT',
      user: userId,
      job: jobId,
      status: 'IN_PROGRESS',
      executionMode: 'COMPENSATING',
      steps: [
        { lotId: lot1._id, amount: 1, state: 'APPLIED', appliedAt: new Date() },
        { lotId: lot2._id, amount: 1, state: 'PENDING' }
      ],
      leaseExpiresAt: new Date(Date.now() - 60000)
    });

    const recSummary = await tryOnCreditService.recoverIncompleteSettlements();
    assert.equal(recSummary.resumedCompleted, 1);
    assert.equal(lot1.remainingAmount, 0); // NOT double-decremented!
    assert.equal(lot2.remainingAmount, 0);
    assert.equal(lot2.reservedAmount, 0);

    const settlement = await TryOnCreditSettlement.findOne({ operationKey: `COMMIT_${jobId}` });
    assert.equal(settlement.status, 'COMPLETED');
    const ledgers = await TryOnCreditLedger.find({ job: jobId, transactionType: 'COMMIT' });
    assert.equal(ledgers.length, 2);
  });

  // =========================================================
  // GAP 3: CATEGORY OVERRIDE GOVERNANCE (P1)
  // =========================================================
  it('GAP 3: Blocks EXPERIMENTAL, NOT_CONFIGURED, UNSUPPORTED, disabled & retired overrides; enforces approval evidence on LIMITED; allows VERIFIED', async () => {
    const adminUser = { _id: makeId(), email: 'gov@kdxx.test', role: 'admin' };
    const registry = new TryOnProviderRegistry();

    const vertex = new VertexVto001Adapter({ projectId: 'test', location: 'us-central1', modelId: 'virtual-try-on-001' });
    vertex.areCredentialsConfigured = () => true;
    // Add an EXPERIMENTAL category to verify admin governance explicitly blocks EXPERIMENTAL even on a configured provider
    const origGetBase = vertex.getBaseCapabilities.bind(vertex);
    vertex.getBaseCapabilities = () => {
      const caps = origGetBase();
      return {
        ...caps,
        categoryCapabilities: {
          ...caps.categoryCapabilities,
          beta_exp: { status: 'EXPERIMENTAL', isEnabledByDefault: false, limitations: 'Experimental only' }
        }
      };
    };

    const geminiStub = new GeminiImageEditAdapter();
    registry.register(vertex);
    registry.register(geminiStub);

    const cfgService = new TryOnProviderConfigService({ registry });

    // 1. Block UNSUPPORTED (eyewear)
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'google-vertex-vto-001',
        adminUser,
        categoryOverrides: { eyewear: true }
      }),
      err => err.code === 'CANNOT_ENABLE_UNSUPPORTED_CATEGORY'
    );

    // 2. Block EXPERIMENTAL (even on an available provider) & verify Registry never runs raw DB EXPERIMENTAL override
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'google-vertex-vto-001',
        adminUser,
        categoryOverrides: { beta_exp: true }
      }),
      err => err.code === 'CANNOT_ENABLE_EXPERIMENTAL_CATEGORY'
    );
    const fakeConfigs = new Map([[
      'google-vertex-vto-001',
      { providerId: 'google-vertex-vto-001', isEnabled: true, categoryOverrides: { beta_exp: true } }
    ]]);
    const rawExpEval = registry.evaluateCategorySupport({ category: 'beta_exp', subCategory: 'beta_exp', configsByProviderId: fakeConfigs });
    assert.equal(rawExpEval.allowSubmit, false);

    // 3. Block NOT_CONFIGURED / stub provider (Gemini / Fashn)
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'gemini-image-edit-stub',
        adminUser,
        categoryOverrides: { eyewear: true }
      }),
      err => err.code === 'CANNOT_ENABLE_UNCONFIGURED_PROVIDER'
    );
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'fashn-tryon-max-stub',
        adminUser,
        categoryOverrides: { clothing: true }
      }),
      err => err.code === 'CANNOT_ENABLE_UNCONFIGURED_PROVIDER'
    );

    // 4. Block enabling category when provider is disabled
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'google-vertex-vto-001',
        adminUser,
        isEnabled: false,
        categoryOverrides: { clothing: true }
      }),
      err => err.code === 'CANNOT_ENABLE_CATEGORY_ON_DISABLED_PROVIDER'
    );

    // 5. Block retired model (2027-03-15) & lifecycle override attempt
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'google-vertex-vto-001',
        adminUser,
        categoryOverrides: { clothing: true },
        now: new Date('2027-03-15T00:00:00Z')
      }),
      err => err.code === 'CANNOT_ENABLE_RETIRED_PROVIDER'
    );
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'google-vertex-vto-001',
        adminUser,
        verificationStatusOverride: 'VERIFIED',
        now: new Date('2027-03-15T00:00:00Z')
      }),
      err => err.code === 'CANNOT_OVERRIDE_RETIRED_PROVIDER'
    );

    // 6. VERIFIED category allowed cleanly
    await cfgService.adminUpdateProviderConfig({
      providerId: 'google-vertex-vto-001',
      adminUser,
      isEnabled: true,
      categoryOverrides: { clothing: true },
      reason: 'Verify clothing remains allowed'
    });

    // 7. LIMITED category rejected WITHOUT structured approval evidence, allowed ONLY WITH evidence
    await assert.rejects(
      () => cfgService.adminUpdateProviderConfig({
        providerId: 'google-vertex-vto-001',
        adminUser,
        categoryOverrides: { full_outfit: true }
      }),
      err => err.code === 'LIMITED_CATEGORY_APPROVAL_REQUIRED'
    );

    await cfgService.adminUpdateProviderConfig({
      providerId: 'google-vertex-vto-001',
      adminUser,
      categoryOverrides: { full_outfit: true },
      categoryApproval: {
        category: 'full_outfit',
        benchmarkPassed: true,
        limitationsAcknowledged: true,
        benchmarkJobIds: ['bm-job-1', 'bm-job-2'],
        evidenceSummary: 'Controlled benchmark BM-01..BM-04 passed all 6 visual criteria.'
      },
      reason: 'Approved Full Outfit after controlled benchmark'
    });

    const savedCfg = await TryOnProviderConfig.findOne({ providerId: 'google-vertex-vto-001' });
    assert.equal(savedCfg.categoryOverrides.full_outfit, true);
    assert.equal(savedCfg.limitedCategoryApprovals.full_outfit.benchmarkPassed, true);
    assert.deepEqual(savedCfg.limitedCategoryApprovals.full_outfit.benchmarkJobIds, ['bm-job-1', 'bm-job-2']);
  });

  // =========================================================
  // GAP 4: API CALL & COST TELEMETRY (P1)
  // =========================================================
  it('GAP 4: Tracks step-level API calls & distinguishes Estimated vs Confirmed Billing (null) vs Unknown/Timeout cost', async () => {
    const userId = makeId();
    await User.create({ _id: userId, name: 'Telemetry User', email: 'tel@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 10 });
    await TryOnCreditLot.create({ user: userId, lotType: 'free', initialAmount: 10, remainingAmount: 10, isActive: true });

    const topProduct = await Product.create({ name: 'AMIRI TEE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/t.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/j.png' });
    await ProductIntelligence.create({ product: topProduct._id, taxonomy: { domain: 'clothing', subCategory: 't-shirts', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });

    await TryOnProviderConfig.create({
      providerId: 'mock-vto-tel',
      isEnabled: true,
      categoryOverrides: { full_outfit: true, clothing: true }
    });

    const origPng = await createPatternPng({ rgbBase: [30, 30, 30], stripeRgb: [220, 40, 40] });
    const step0Png = await createPatternPng({ rgbBase: [40, 100, 190], stripeRgb: [230, 200, 50] });
    const step1Png = await createPatternPng({ rgbBase: [160, 70, 50], stripeRgb: [60, 220, 170] });
    const garmentPng = await createPatternPng({ width: 120, height: 120 });

    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId, type: 'person_photo', buffer: origPng });

    let mode = 'SUCCESS';
    let callCount = 0;
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.providerId = 'mock-vto-tel';
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async () => {
      callCount += 1;
      if (mode === 'STEP2_TIMEOUT' && callCount === 2) {
        const err = new Error('Vertex timed out on Step 2');
        err.code = 'AI_TIMEOUT';
        throw err;
      }
      return {
        resultBase64: (callCount % 2 === 1 ? step0Png : step1Png).toString('base64'),
        mimeType: 'image/png',
        providerRequestId: `req-${callCount}`,
        estimatedCostUsd: 0.06
      };
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.clear();
    registry.register(mockAdapter);
    const vtoService = new VirtualTryOnService({ registry, providerConfigService: new TryOnProviderConfigService({ registry }) });
    const queue = new TryOnQueueService({
      virtualTryOnService: vtoService,
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      fetchSafeRemoteImage: async () => ({ buffer: garmentPng, contentType: 'image/png' })
    });
    queue.processNextJobs = async () => {};

    // Job 1: Complete 2-step Full Outfit ($0.12 estimated across 2 API calls)
    const jobOk = await queue.submitFullOutfitJob({
      userId,
      personImageAssetId: personAsset._id,
      items: [{ productId: topProduct._id }, { productId: bottomProduct._id }],
      idempotencyKey: 'tel-ok-1'
    });
    await queue.executeJob(jobOk);
    assert.equal(jobOk.status, 'COMPLETED');
    assert.equal(jobOk.aiProviderDetails.providerCallsCount, 2);
    assert.equal(jobOk.aiProviderDetails.successfulCallsCount, 2);
    assert.equal(jobOk.aiProviderDetails.estimatedCostUsd, 0.12);
    assert.equal(jobOk.aiProviderDetails.confirmedBillingCostUsd, null);
    assert.equal(jobOk.executionSteps[0].costStatus, 'ESTIMATED');
    assert.equal(jobOk.executionSteps[1].costStatus, 'ESTIMATED');

    // Job 2: Step 1 succeeds ($0.06), Step 2 times out after dispatch ($0.06 pending reconciliation, NO retry!)
    callCount = 0;
    mode = 'STEP2_TIMEOUT';
    const jobTimeout = await queue.submitFullOutfitJob({
      userId,
      personImageAssetId: personAsset._id,
      items: [{ productId: topProduct._id }, { productId: bottomProduct._id }],
      idempotencyKey: 'tel-to-2'
    });
    await queue.executeJob(jobTimeout);
    assert.equal(callCount, 2); // Strictly 2 dispatches, NO retry after timeout!
    assert.equal(jobTimeout.status, 'RECONCILIATION_REQUIRED');
    assert.equal(jobTimeout.executionSteps[0].costStatus, 'ESTIMATED');
    assert.equal(jobTimeout.executionSteps[0].estimatedCostUsd, 0.06);
    assert.equal(jobTimeout.executionSteps[1].costStatus, 'UNKNOWN_PENDING_RECONCILIATION');
    assert.equal(jobTimeout.executionSteps[1].estimatedCostUsd, 0);
    assert.equal(jobTimeout.executionSteps[1].pendingReconciliationCostUsd, 0.06);
    assert.equal(jobTimeout.reconciliation.pendingCostUsd, 0.06);
    assert.equal(jobTimeout.reconciliation.costStatus, 'PARTIAL_UNKNOWN');
    assert.equal(jobTimeout.aiProviderDetails.confirmedBillingCostUsd, null);

    const stats = await tryOnUsageStatsService.getProviderAndCategoryStats({ days: 30 });
    assert.equal(stats.totalJobs, 2);
    assert.equal(stats.totalProviderCalls, 4);
    assert.equal(stats.successfulCalls, 3);
    assert.equal(stats.failedCalls, 0);
    assert.equal(stats.timeoutIndeterminateCalls, 1);
    assert.equal(stats.costBreakdown.estimatedCostUsd, 0.18);
    assert.equal(stats.costBreakdown.unknownPendingReconciliationCostUsd, 0.06);
    assert.equal(stats.costBreakdown.confirmedBillingCostUsd, null);
    assert.equal(stats.costBreakdown.billingIntegrationActive, false);

    // Job 3: Single Item timeout (ensures Single Item telemetry also tracks call & unknown pending cost without retry)
    callCount = 0;
    mode = 'STEP2_TIMEOUT'; // Reuse adapter, trigger AI_TIMEOUT when callCount === 2? Wait: set callCount = 1 so next call hits 2!
    callCount = 1;
    const singleTimeout = await queue.submitJob({
      userId,
      personImageAssetId: personAsset._id,
      productId: topProduct._id,
      idempotencyKey: 'tel-single-to-3'
    });
    await queue.executeJob(singleTimeout);
    assert.equal(singleTimeout.status, 'RECONCILIATION_REQUIRED');
    assert.equal(singleTimeout.aiProviderDetails.costStatus, 'UNKNOWN_PENDING_RECONCILIATION');
    assert.equal(singleTimeout.aiProviderDetails.estimatedCostUsd, 0);
    assert.equal(singleTimeout.aiProviderDetails.unknownReconciliationCostUsd, 0.06);
    assert.equal(singleTimeout.aiProviderDetails.indeterminateCallsCount, 1);

    const statsAfterSingle = await tryOnUsageStatsService.getProviderAndCategoryStats({ days: 30 });
    assert.equal(statsAfterSingle.totalJobs, 3);
    assert.equal(statsAfterSingle.totalProviderCalls, 5);
    assert.equal(statsAfterSingle.timeoutIndeterminateCalls, 2);
    assert.equal(statsAfterSingle.costBreakdown.estimatedCostUsd, 0.18);
    assert.equal(statsAfterSingle.costBreakdown.unknownPendingReconciliationCostUsd, 0.12);
    assert.equal(statsAfterSingle.costBreakdown.confirmedBillingCostUsd, null);
  });

  // =========================================================
  // GAP 5: RECONCILIATION MESSAGE DYNAMIC CREDIT COUNT (P2)
  // =========================================================
  it('GAP 5: Admin reconcile endpoint returns dynamic refunded/committed credit count (no hardcoded 1 credit)', async () => {
    const userId = makeId();
    const adminId = makeId();
    await User.create({ _id: userId, name: 'Customer', email: 'c@kdxx.test', role: 'user' });
    await User.create({ _id: adminId, name: 'Admin', email: 'a@kdxx.test', role: 'admin' });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 5 });
    const lot = await TryOnCreditLot.create({
      user: userId, lotType: 'free', initialAmount: 5, remainingAmount: 5, reservedAmount: 0, isActive: true
    });

    const foJobId = makeId();
    const res = await tryOnCreditService.reserveCredit(userId, foJobId, 2);
    await TryOnJob.create({
      _id: foJobId,
      user: userId,
      mode: 'FULL_OUTFIT',
      creditsCost: 2,
      status: 'RECONCILIATION_REQUIRED',
      personImageAsset: makeId(),
      product: makeId(),
      productImageUrl: 'https://cdn.example.com/j.png',
      creditLot: res.lotId,
      creditReservations: res.allocations.map(a => ({ lot: a.lotId, lotType: a.lotType, amount: a.amount })),
      reconciliation: { state: 'AI_TIMEOUT_UNVERIFIED', requiresManualAdmin: true }
    });

    const resp = await invokeRouterHandler(tryOnRoutes, 'post', '/admin/jobs/:id/reconcile', {
      params: { id: String(foJobId) },
      user: { _id: adminId, role: 'admin' },
      body: { action: 'refund', reason: 'Confirmed no Vertex output rendered' }
    });
    assert.equal(resp.statusCode, 200);
    assert.match(resp.body.message, /hoàn 2 credit/i);
    assert.equal(resp.body.message.includes('hoàn 1 credit'), false);
    assert.equal(lot.reservedAmount, 0);
    assert.equal(lot.remainingAmount, 5);
  });
});
