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
const TryOnBenchmarkLedger = require('../models/TryOnBenchmarkLedger');
const User = require('../models/User');

const { TryOnProviderRegistry } = require('../services/providers/TryOnProviderRegistry');
const VertexVto001Adapter = require('../services/providers/VertexVto001Adapter');
const { TryOnProviderConfigService } = require('../services/tryOnProviderConfigService');
const { VirtualTryOnService } = require('../services/virtualTryOnService');
const tryOnCreditService = require('../services/tryOnCreditService');
const { TryOnQueueService } = require('../services/tryOnQueueService');
const { FullOutfitBenchmarkGate } = require('../services/fullOutfitBenchmarkGate');
const tryOnRoutes = require('../routes/tryOnRoutes');

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
      const lteArgs = cond.$lte;
      if (lteArgs && lteArgs[0]?.$add) {
        const [f1, f2] = lteArgs[0].$add;
        const v1 = Number(doc[f1.replace(/^\$/, '')] || 0);
        const v2 = Number(f2);
        const maxVal = typeof lteArgs[1] === 'string' && lteArgs[1].startsWith('$')
          ? Number(doc[lteArgs[1].replace(/^\$/, '')] || 0)
          : Number(lteArgs[1]);
        if (!(v1 + v2 <= maxVal + 0.0001)) return false;
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
  constructor(uniqueFields = []) {
    this.docs = [];
    this.uniqueFields = uniqueFields;
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

  find(query = {}) {
    const res = this.docs.filter(d => matchesQuery(d, query)).map(d => this.wrap({ ...d }));
    return this._makeQuery(res);
  }

  findOne(query = {}) {
    const found = this.docs.find(d => matchesQuery(d, query));
    const wrapped = found ? this.wrap({ ...found }) : null;
    return {
      select: () => Promise.resolve(wrapped),
      populate: () => Promise.resolve(wrapped),
      lean: () => Promise.resolve(wrapped),
      then: (res, rej) => Promise.resolve(wrapped).then(res, rej)
    };
  }

  findById(id) {
    const found = this.docs.find(d => String(d._id) === String(id));
    const wrapped = found ? this.wrap({ ...found }) : null;
    return {
      select: () => Promise.resolve(wrapped),
      populate: () => Promise.resolve(wrapped),
      lean: () => Promise.resolve(wrapped),
      then: (res, rej) => Promise.resolve(wrapped).then(res, rej)
    };
  }

  async countDocuments(query = {}) {
    return this.docs.filter(d => matchesQuery(d, query)).length;
  }

  async create(data) {
    const items = Array.isArray(data) ? data : [data];
    const created = [];
    for (const raw of items) {
      const copy = { ...raw };
      if (!copy._id) copy._id = makeId();
      for (const uf of this.uniqueFields) {
        if (copy[uf] != null && this.docs.some(d => d[uf] === copy[uf])) {
          const err = new Error(`E11000 duplicate key error on ${uf}`);
          err.code = 11000;
          throw err;
        }
      }
      copy.createdAt = copy.createdAt || new Date();
      copy.updatedAt = new Date();
      this.docs.push(copy);
      created.push(this.wrap(copy));
    }
    return Array.isArray(data) ? created : created[0];
  }

  async findOneAndUpdate(query, update, options = {}) {
    let doc = this.docs.find(d => matchesQuery(d, query));
    let wasInserted = false;
    if (!doc && options.upsert) {
      wasInserted = true;
      doc = { _id: makeId(), createdAt: new Date() };
      for (const [qk, qv] of Object.entries(query)) {
        if (!qk.startsWith('$')) setNested(doc, qk, qv);
      }
      this.docs.push(doc);
    }
    if (!doc) return null;

    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) setNested(doc, k, v);
    }
    if (update.$setOnInsert && wasInserted) {
      for (const [k, v] of Object.entries(update.$setOnInsert)) setNested(doc, k, v);
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        const cur = Number(getNested(doc, k) || 0);
        setNested(doc, k, Number((cur + v).toFixed(4)));
      }
    }
    doc.updatedAt = new Date();
    return this.wrap({ ...doc });
  }
}

function createPatternPng({ width = 64, height = 64, rgbBase = [50, 50, 50], stripeRgb = [200, 200, 200] } = {}) {
  const channels = 3;
  const buf = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const isStripe = (y % 8) < 4;
    const color = isStripe ? stripeRgb : rgbBase;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      buf[idx] = color[0];
      buf[idx + 1] = color[1];
      buf[idx + 2] = color[2];
    }
  }
  return sharp(buf, { raw: { width, height, channels } }).png().toBuffer();
}

function createMemoryStorageDouble(imageAssetStub) {
  const bufferStore = new Map();
  return {
    async saveImage({ userId, buffer, mimeType = 'image/png', type = 'user_upload', originalFilename = '' }) {
      const id = makeId();
      const doc = await imageAssetStub.create({
        _id: id,
        user: userId,
        type,
        mimeType,
        originalFilename,
        isDeleted: false,
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000)
      });
      bufferStore.set(String(id), Buffer.from(buffer));
      return doc;
    },
    async getImageBuffer(assetId, userId) {
      const doc = await imageAssetStub.findById(assetId);
      if (!doc || doc.isDeleted) throw new Error('Asset missing');
      if (String(doc.user) !== String(userId)) throw new Error('Forbidden');
      const b = bufferStore.get(String(assetId));
      if (!b) throw new Error('Buffer not found');
      return { buffer: b, mimeType: doc.mimeType || 'image/png', asset: doc };
    },
    async deleteAsset(assetId, userId) {
      const doc = await imageAssetStub.findById(assetId);
      if (!doc || String(doc.user) !== String(userId)) return false;
      doc.isDeleted = true;
      bufferStore.delete(String(assetId));
      return true;
    },
    generateSignedToken(assetId, userId, ttlSeconds) {
      return `sig_${assetId}_${userId}_${ttlSeconds}`;
    },
    async issueSignedUrlIfValid(assetId, userId) {
      return `/api/tryon/images/sig_${assetId}_${userId}`;
    }
  };
}

async function invokeRouterHandler(router, method, urlPath, { params = {}, query = {}, body = {}, user = null } = {}) {
  const layer = router.stack.find(l => {
    if (!l.route) return false;
    const mMatch = Boolean(l.route.methods[method.toLowerCase()]);
    if (!mMatch) return false;
    const rPath = l.route.path;
    if (rPath === urlPath) return true;
    const regex = new RegExp('^' + rPath.replace(/:[a-zA-Z0-9_]+/g, '([^/]+)') + '$');
    return regex.test(urlPath);
  });

  if (!layer) throw new Error(`No route found for ${method.toUpperCase()} ${urlPath}`);

  const req = {
    method: method.toUpperCase(),
    originalUrl: urlPath,
    url: urlPath,
    params,
    query,
    body,
    user,
    headers: {}
  };
  let statusCode = 200;
  let responseBody = null;
  const res = {
    status(code) { statusCode = code; return res; },
    json(data) { responseBody = data; return res; },
    setHeader() { return res; }
  };

  const routeHandlers = layer.route.stack.map(s => s.handle);
  const targetHandler = routeHandlers[routeHandlers.length - 1];
  return new Promise((resolve, reject) => {
    try {
      const p = targetHandler(req, res, (err) => {
        if (err) reject(err);
        else resolve({ statusCode, body: responseBody });
      });
      if (p && typeof p.then === 'function') {
        p.then(() => resolve({ statusCode, body: responseBody })).catch(reject);
      } else {
        resolve({ statusCode, body: responseBody });
      }
    } catch (e) {
      reject(e);
    }
  });
}

describe('Phase 6.1 — Benchmark Cost Control & In-Flight Emergency Stop', () => {
  let stores;
  let originalFns;

  beforeEach(() => {
    stores = {
      Product: new InMemoryModelStub(),
      ProductIntelligence: new InMemoryModelStub(['product']),
      TryOnJob: new InMemoryModelStub(['idempotencyKey']),
      TryOnImageAsset: new InMemoryModelStub(),
      TryOnCredit: new InMemoryModelStub(['user']),
      TryOnCreditLot: new InMemoryModelStub(),
      TryOnCreditLedger: new InMemoryModelStub(['idempotencyKey']),
      TryOnCreditSettlement: new InMemoryModelStub(['operationKey']),
      TryOnProviderConfig: new InMemoryModelStub(['providerId']),
      TryOnBenchmarkLedger: new InMemoryModelStub(['controlKey', 'operationKey']),
      User: new InMemoryModelStub(['email'])
    };

    originalFns = {
      Product: { find: Product.find, findOne: Product.findOne, findById: Product.findById, create: Product.create },
      ProductIntelligence: { find: ProductIntelligence.find, findOne: ProductIntelligence.findOne, create: ProductIntelligence.create },
      TryOnJob: { find: TryOnJob.find, findOne: TryOnJob.findOne, findById: TryOnJob.findById, create: TryOnJob.create, countDocuments: TryOnJob.countDocuments },
      TryOnImageAsset: { find: TryOnImageAsset.find, findOne: TryOnImageAsset.findOne, findById: TryOnImageAsset.findById, create: TryOnImageAsset.create },
      TryOnCredit: { find: TryOnCredit.find, findOne: TryOnCredit.findOne, findById: TryOnCredit.findById, create: TryOnCredit.create, findOneAndUpdate: TryOnCredit.findOneAndUpdate },
      TryOnCreditLot: { find: TryOnCreditLot.find, findOne: TryOnCreditLot.findOne, findById: TryOnCreditLot.findById, create: TryOnCreditLot.create, findOneAndUpdate: TryOnCreditLot.findOneAndUpdate },
      TryOnCreditLedger: { find: TryOnCreditLedger.find, findOne: TryOnCreditLedger.findOne, create: TryOnCreditLedger.create },
      TryOnCreditSettlement: { find: TryOnCreditSettlement.find, findOne: TryOnCreditSettlement.findOne, create: TryOnCreditSettlement.create, findOneAndUpdate: TryOnCreditSettlement.findOneAndUpdate },
      TryOnProviderConfig: { find: TryOnProviderConfig.find, findOne: TryOnProviderConfig.findOne, create: TryOnProviderConfig.create, findOneAndUpdate: TryOnProviderConfig.findOneAndUpdate },
      TryOnBenchmarkLedger: { find: TryOnBenchmarkLedger.find, findOne: TryOnBenchmarkLedger.findOne, create: TryOnBenchmarkLedger.create, findOneAndUpdate: TryOnBenchmarkLedger.findOneAndUpdate },
      User: { find: User.find, findOne: User.findOne, findById: User.findById, create: User.create }
    };

    for (const [modelName, modelObj] of Object.entries({
      Product, ProductIntelligence, TryOnJob, TryOnImageAsset, TryOnCredit,
      TryOnCreditLot, TryOnCreditLedger, TryOnCreditSettlement, TryOnProviderConfig,
      TryOnBenchmarkLedger, User
    })) {
      const store = stores[modelName];
      modelObj.find = store.find.bind(store);
      modelObj.findOne = store.findOne.bind(store);
      if (modelObj.findById) modelObj.findById = store.findById.bind(store);
      if (modelObj.countDocuments) modelObj.countDocuments = store.countDocuments.bind(store);
      if (modelObj.create) modelObj.create = store.create.bind(store);
      if (modelObj.findOneAndUpdate) modelObj.findOneAndUpdate = store.findOneAndUpdate.bind(store);
    }
  });

  afterEach(() => {
    for (const [modelName, modelObj] of Object.entries({
      Product, ProductIntelligence, TryOnJob, TryOnImageAsset, TryOnCredit,
      TryOnCreditLot, TryOnCreditLedger, TryOnCreditSettlement, TryOnProviderConfig,
      TryOnBenchmarkLedger, User
    })) {
      Object.assign(modelObj, originalFns[modelName]);
    }
  });

  it('COST GUARD 1: Estimates and reserves spend accurately across a 2-step Full Outfit benchmark ($0.12 USD total)', async () => {
    const adminId = makeId();
    await User.create({ _id: adminId, name: 'Admin', email: 'admin@kdxx.test', role: 'admin' });
    await TryOnCredit.create({ user: adminId, membershipType: 'admin', totalAvailableCredits: 999999 });
    await TryOnCreditLot.create({ user: adminId, lotType: 'admin', remainingAmount: 999999, reservedAmount: 0, isActive: true });

    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.20'
      })
    });
    await gate.resetRuntimeState();

    const topProduct = await Product.create({ name: 'AMIRI HOODIE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/h.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/j.png' });
    await ProductIntelligence.create({ product: topProduct._id, taxonomy: { domain: 'clothing', subCategory: 'hoodies', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });

    const origPng = await createPatternPng({ rgbBase: [30, 30, 30] });
    const step0Png = await createPatternPng({ rgbBase: [50, 100, 180] });
    const step1Png = await createPatternPng({ rgbBase: [180, 50, 50] });

    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId: adminId, type: 'person_photo', buffer: origPng });

    let callCount = 0;
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async () => {
      callCount += 1;
      return {
        resultBase64: (callCount === 1 ? step0Png : step1Png).toString('base64'),
        mimeType: 'image/png',
        providerRequestId: `vto-req-${callCount}`,
        estimatedCostUsd: 0.06
      };
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.set('google-vertex-vto-001', mockAdapter);
    const vtoService = new VirtualTryOnService({ registry, providerConfigService: new TryOnProviderConfigService({ registry }) });

    const queue = new TryOnQueueService({
      virtualTryOnService: vtoService,
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      benchmarkGate: gate,
      fetchSafeRemoteImage: async () => ({ buffer: origPng, contentType: 'image/png' })
    });
    queue.processNextJobs = async () => {};

    const job = await queue.submitFullOutfitJob({
      userId: adminId,
      userRole: 'admin',
      personImageAssetId: personAsset._id,
      items: [{ productId: topProduct._id }, { productId: bottomProduct._id }],
      idempotencyKey: 'bench-cost-01'
    });

    assert.equal(job.benchmark.isBenchmark, true);
    await queue.executeJob(job);

    assert.equal(job.status, 'COMPLETED');
    assert.equal(callCount, 2);
    assert.equal(job.aiProviderDetails.estimatedCostUsd, 0.12);
    assert.equal(job.aiProviderDetails.confirmedBillingCostUsd, null);

    const spendSummary = await gate.getBenchmarkSpendSummary();
    assert.equal(spendSummary.totalReservedUsd, 0.12);
    assert.equal(spendSummary.totalCommittedUsd, 0.12);
    assert.equal(spendSummary.remainingBudgetUsd, 0.08); // 0.20 - 0.12 = 0.08
    assert.equal(spendSummary.confirmedBillingCostUsd, null);
  });

  it('COST GUARD 2: Programmatically blocks step dispatch when cumulative reservation would exceed $0.20 USD ceiling', async () => {
    const adminId = makeId();
    await User.create({ _id: adminId, name: 'Admin', email: 'admin@kdxx.test', role: 'admin' });
    await TryOnCredit.create({ user: adminId, membershipType: 'admin', totalAvailableCredits: 999999 });
    await TryOnCreditLot.create({ user: adminId, lotType: 'admin', remainingAmount: 999999, reservedAmount: 0, isActive: true });

    // Set budget strictly at 0.15 USD so 2 calls (0.12) pass, but a 3rd call (0.18 > 0.15) is blocked
    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.15'
      })
    });
    await gate.resetRuntimeState();

    const jobId1 = makeId();
    const jobId2 = makeId();

    // Step 0 ($0.06) -> fits
    const r1 = await gate.reserveStepSpend({ jobId: jobId1, stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true });
    assert.equal(r1.allowed, true);
    assert.equal(r1.totalReservedUsd, 0.06);

    // Step 1 ($0.06) -> 0.12 <= 0.15 -> fits
    const r2 = await gate.reserveStepSpend({ jobId: jobId1, stepIndex: 1, slot: 'TOP', unitCostUsd: 0.06, isBenchmark: true });
    assert.equal(r2.allowed, true);
    assert.equal(r2.totalReservedUsd, 0.12);

    // Another step ($0.06) -> 0.12 + 0.06 = 0.18 > 0.15 -> BLOCKED!
    const r3 = await gate.reserveStepSpend({ jobId: jobId2, stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true });
    assert.equal(r3.allowed, false);
    assert.equal(r3.code, 'BENCHMARK_BUDGET_EXCEEDED');

    await assert.rejects(
      () => gate.assertDispatchAllowed({ jobId: jobId2, stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true }),
      err => err.code === 'BENCHMARK_BUDGET_EXCEEDED' && err.isBudgetExceeded === true
    );
  });

  it('COST GUARD 3: Idempotent step reservation prevents double-charging on internal retry or recovery', async () => {
    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.20'
      })
    });
    await gate.resetRuntimeState();

    const jobId = makeId();

    // 1st reservation
    const r1 = await gate.reserveStepSpend({ jobId, stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true });
    assert.equal(r1.allowed, true);
    assert.equal(r1.totalReservedUsd, 0.06);

    // Duplicate call with same jobId and stepIndex
    const r2 = await gate.reserveStepSpend({ jobId, stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true });
    assert.equal(r2.allowed, true);
    assert.equal(r2.alreadyReserved, true);

    const summary = await gate.getBenchmarkSpendSummary();
    assert.equal(summary.totalReservedUsd, 0.06); // Strictly NOT 0.12!
  });

  it('COST GUARD 4: AI_TIMEOUT maintains indeterminate cost in reservation and does NOT release budget', async () => {
    const adminId = makeId();
    await User.create({ _id: adminId, name: 'Admin', email: 'admin@kdxx.test', role: 'admin' });
    await TryOnCredit.create({ user: adminId, membershipType: 'admin', totalAvailableCredits: 999999 });
    await TryOnCreditLot.create({ user: adminId, lotType: 'admin', remainingAmount: 999999, reservedAmount: 0, isActive: true });

    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.20'
      })
    });
    await gate.resetRuntimeState();

    const topProduct = await Product.create({ name: 'AMIRI HOODIE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/t.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/b.png' });
    await ProductIntelligence.create({ product: topProduct._id, normalizedCategory: { domain: 'clothing', subCategory: 'hoodies', filterGroup: 'tops' }, taxonomy: { domain: 'clothing', subCategory: 'hoodies', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, normalizedCategory: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });

    const origPng = await createPatternPng({ rgbBase: [30, 30, 30] });
    const step0Png = await createPatternPng({ rgbBase: [50, 100, 180] });

    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId: adminId, type: 'person_photo', buffer: origPng });

    let callCount = 0;
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async () => {
      callCount += 1;
      if (callCount === 2) {
        const err = new Error('Google Vertex AI Try-On request timed out after 30s');
        err.code = 'AI_TIMEOUT';
        throw err;
      }
      return {
        resultBase64: step0Png.toString('base64'),
        mimeType: 'image/png',
        providerRequestId: `vto-req-${callCount}`,
        estimatedCostUsd: 0.06
      };
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.set('google-vertex-vto-001', mockAdapter);
    const vtoService = new VirtualTryOnService({ registry, providerConfigService: new TryOnProviderConfigService({ registry }) });

    const queue = new TryOnQueueService({
      virtualTryOnService: vtoService,
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      benchmarkGate: gate,
      fetchSafeRemoteImage: async () => ({ buffer: origPng, contentType: 'image/png' })
    });
    queue.processNextJobs = async () => {};

    const job = await queue.submitFullOutfitJob({
      userId: adminId,
      userRole: 'admin',
      personImageAssetId: personAsset._id,
      items: [{ productId: topProduct._id }, { productId: bottomProduct._id }],
      idempotencyKey: 'bench-timeout-01'
    });

    await queue.executeJob(job);

    assert.equal(job.status, 'RECONCILIATION_REQUIRED');
    assert.equal(callCount, 2);

    const spendSummary = await gate.getBenchmarkSpendSummary();
    assert.equal(spendSummary.totalReservedUsd, 0.12); // Both steps remain reserved
    assert.equal(spendSummary.totalCommittedUsd, 0.06); // Step 0 committed
    assert.equal(spendSummary.totalIndeterminateUsd, 0.06); // Step 1 held in indeterminate spend
    assert.equal(spendSummary.remainingBudgetUsd, 0.08); // 0.20 - 0.12 = 0.08
  });

  it('EMERGENCY STOP 1: In-flight emergency stop after Step 1 immediately blocks Step 2 dispatch, preserves Step 1 output, and moves job to RECONCILIATION_REQUIRED', async () => {
    const adminId = makeId();
    await User.create({ _id: adminId, name: 'Admin', email: 'admin@kdxx.test', role: 'admin' });
    await TryOnCredit.create({ user: adminId, membershipType: 'admin', totalAvailableCredits: 999999 });
    await TryOnCreditLot.create({ user: adminId, lotType: 'admin', remainingAmount: 999999, reservedAmount: 0, isActive: true });

    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.20'
      })
    });
    await gate.resetRuntimeState();

    const topProduct = await Product.create({ name: 'AMIRI HOODIE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/t.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/b.png' });
    await ProductIntelligence.create({ product: topProduct._id, normalizedCategory: { domain: 'clothing', subCategory: 'hoodies', filterGroup: 'tops' }, taxonomy: { domain: 'clothing', subCategory: 'hoodies', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, normalizedCategory: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });

    const origPng = await createPatternPng({ rgbBase: [30, 30, 30] });
    const step0Png = await createPatternPng({ rgbBase: [50, 100, 180] });

    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId: adminId, type: 'person_photo', buffer: origPng });

    let callCount = 0;
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async () => {
      callCount += 1;
      if (callCount === 1) {
        // Step 0 completes, and IMMEDIATELY Admin hits the emergency kill-switch!
        await gate.disableImmediately({ adminUserId: adminId, reason: 'Admin killed benchmark in-flight between Step 1 and Step 2' });
      }
      return {
        resultBase64: step0Png.toString('base64'),
        mimeType: 'image/png',
        providerRequestId: `vto-req-${callCount}`,
        estimatedCostUsd: 0.06
      };
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.set('google-vertex-vto-001', mockAdapter);
    const vtoService = new VirtualTryOnService({ registry, providerConfigService: new TryOnProviderConfigService({ registry }) });

    const queue = new TryOnQueueService({
      virtualTryOnService: vtoService,
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      benchmarkGate: gate,
      fetchSafeRemoteImage: async () => ({ buffer: origPng, contentType: 'image/png' })
    });
    queue.processNextJobs = async () => {};

    const job = await queue.submitFullOutfitJob({
      userId: adminId,
      userRole: 'admin',
      personImageAssetId: personAsset._id,
      items: [{ productId: topProduct._id }, { productId: bottomProduct._id }],
      idempotencyKey: 'bench-stop-inflight'
    });

    await queue.executeJob(job);

    // Strictly 1 provider call made (Step 2 was NEVER dispatched!)
    assert.equal(callCount, 1);
    assert.equal(job.status, 'RECONCILIATION_REQUIRED');
    assert.equal(job.errorCode, 'EMERGENCY_STOPPED');
    assert.equal(job.reconciliation.state, 'EMERGENCY_STOPPED_UNSETTLED');

    // Step 0 remains COMPLETED with valid private output asset preserved
    assert.equal(job.executionSteps[0].status, 'COMPLETED');
    assert.ok(job.executionSteps[0].outputAssetId);
    const intermediateCheck = await mockStorage.getImageBuffer(job.executionSteps[0].outputAssetId, adminId);
    assert.ok(intermediateCheck.buffer);

    // Step 1 was blocked before dispatch
    assert.equal(job.executionSteps[1].status, 'FAILED');
    assert.equal(job.executionSteps[1].errorCode, 'EMERGENCY_STOPPED');
    assert.equal(job.executionSteps[1].dispatchedAt, null);
  });

  it('EMERGENCY STOP 2: Pre-dispatch emergency stop blocks Step 0 dispatch completely (0 provider calls)', async () => {
    const adminId = makeId();
    await User.create({ _id: adminId, name: 'Admin', email: 'admin@kdxx.test', role: 'admin' });
    await TryOnCredit.create({ user: adminId, membershipType: 'admin', totalAvailableCredits: 999999 });
    await TryOnCreditLot.create({ user: adminId, lotType: 'admin', remainingAmount: 999999, reservedAmount: 0, isActive: true });

    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.20'
      })
    });
    await gate.resetRuntimeState();

    const topProduct = await Product.create({ name: 'AMIRI HOODIE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/t.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/b.png' });
    await ProductIntelligence.create({ product: topProduct._id, normalizedCategory: { domain: 'clothing', subCategory: 'hoodies', filterGroup: 'tops' }, taxonomy: { domain: 'clothing', subCategory: 'hoodies', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, normalizedCategory: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });

    const origPng = await createPatternPng({ rgbBase: [30, 30, 30] });
    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId: adminId, type: 'person_photo', buffer: origPng });

    let callCount = 0;
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async () => {
      callCount += 1;
      return { resultBase64: origPng.toString('base64'), mimeType: 'image/png' };
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.set('google-vertex-vto-001', mockAdapter);
    const vtoService = new VirtualTryOnService({ registry, providerConfigService: new TryOnProviderConfigService({ registry }) });

    const queue = new TryOnQueueService({
      virtualTryOnService: vtoService,
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      benchmarkGate: gate,
      fetchSafeRemoteImage: async () => ({ buffer: origPng, contentType: 'image/png' })
    });
    queue.processNextJobs = async () => {};

    const job = await queue.submitFullOutfitJob({
      userId: adminId,
      userRole: 'admin',
      personImageAssetId: personAsset._id,
      items: [{ productId: topProduct._id }, { productId: bottomProduct._id }],
      idempotencyKey: 'bench-stop-pre0'
    });

    // Emergency stop called BEFORE executeJob is invoked
    await gate.disableImmediately({ adminUserId: adminId, reason: 'Killed before Step 0 dispatch' });

    await queue.executeJob(job);

    assert.equal(callCount, 0); // Strictly ZERO AI calls!
    assert.equal(job.status, 'RECONCILIATION_REQUIRED');
    assert.equal(job.errorCode, 'EMERGENCY_STOPPED');
    assert.equal(job.executionSteps[0].status, 'FAILED');
    assert.equal(job.executionSteps[0].dispatchedAt, null);
  });

  it('EMERGENCY STOP 3: Process restart while in emergency stop state does NOT auto-dispatch to AI', async () => {
    const adminId = makeId();
    await User.create({ _id: adminId, name: 'Admin', email: 'admin@kdxx.test', role: 'admin' });
    await TryOnCredit.create({ user: adminId, membershipType: 'admin', totalAvailableCredits: 999999 });
    const lot = await TryOnCreditLot.create({ user: adminId, lotType: 'admin', remainingAmount: 999999, reservedAmount: 2, isActive: true });

    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.20'
      })
    });
    await gate.disableImmediately({ adminUserId: adminId, reason: 'Persistent emergency stop' });

    const foJobId = makeId();
    await TryOnJob.create({
      _id: foJobId,
      user: adminId,
      mode: 'FULL_OUTFIT',
      status: 'RECONCILIATION_REQUIRED',
      errorCode: 'EMERGENCY_STOPPED',
      reconciliation: { state: 'EMERGENCY_STOPPED_UNSETTLED', requiresManualAdmin: true },
      creditLot: lot._id,
      creditsCost: 2
    });

    const queue = new TryOnQueueService({
      virtualTryOnService: {},
      tryOnStorageService: {},
      tryOnCreditService,
      benchmarkGate: gate
    });

    const summary = await queue.recoverStuckJobs();
    assert.equal(summary.requeued, 0); // Does NOT auto-queue or auto-dispatch

    const refreshed = await TryOnJob.findById(foJobId);
    assert.equal(refreshed.status, 'RECONCILIATION_REQUIRED');
  });

  it('CONCURRENCY: Multiple workers cannot exceed 0.20 USD budget ceiling simultaneously', async () => {
    const gate = new FullOutfitBenchmarkGate({
      getEnv: () => ({
        NODE_ENV: 'development',
        TRYON_FULL_OUTFIT_BENCHMARK_ENABLED: 'true',
        TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD: '0.20'
      })
    });
    await gate.resetRuntimeState();

    // 5 concurrent workers trying to reserve 0.06 USD each (3 * 0.06 = 0.18 fits; 4th and 5th exceed 0.20)
    const attempts = await Promise.all([
      gate.reserveStepSpend({ jobId: makeId(), stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true }),
      gate.reserveStepSpend({ jobId: makeId(), stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true }),
      gate.reserveStepSpend({ jobId: makeId(), stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true }),
      gate.reserveStepSpend({ jobId: makeId(), stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true }),
      gate.reserveStepSpend({ jobId: makeId(), stepIndex: 0, slot: 'BOTTOM', unitCostUsd: 0.06, isBenchmark: true })
    ]);

    const allowedCount = attempts.filter(a => a.allowed === true).length;
    const blockedCount = attempts.filter(a => a.allowed === false && a.code === 'BENCHMARK_BUDGET_EXCEEDED').length;

    assert.equal(allowedCount, 3); // 3 * 0.06 = 0.18 <= 0.20
    assert.equal(blockedCount, 2); // 4th and 5th rejected

    const summary = await gate.getBenchmarkSpendSummary();
    assert.equal(summary.totalReservedUsd, 0.18);
    assert.ok(summary.totalReservedUsd <= 0.20);
  });

  it('ADMIN BENCHMARK API: GET /api/tryon/admin/benchmark/status and POST /api/tryon/admin/benchmark/stop operate cleanly', async () => {
    const adminId = makeId();
    await User.create({ _id: adminId, name: 'Admin User', email: 'ad@kdxx.test', role: 'admin' });

    // Test GET /api/tryon/admin/benchmark/status
    const stResp = await invokeRouterHandler(tryOnRoutes, 'get', '/admin/benchmark/status', {
      user: { _id: adminId, role: 'admin' }
    });
    assert.equal(stResp.statusCode, 200);
    assert.equal(stResp.body.success, true);
    assert.equal(typeof stResp.body.data.maxBudgetUsd, 'number');
    assert.equal(stResp.body.data.confirmedBillingCostUsd, null);

    // Test POST /api/tryon/admin/benchmark/stop
    const stopResp = await invokeRouterHandler(tryOnRoutes, 'post', '/admin/benchmark/stop', {
      user: { _id: adminId, role: 'admin' },
      body: { reason: 'Test emergency halt via route' }
    });
    assert.equal(stopResp.statusCode, 200);
    assert.equal(stopResp.body.success, true);
    assert.equal(stopResp.body.data.isEmergencyStopped, true);
  });
});
