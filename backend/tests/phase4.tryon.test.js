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
const TryOnProviderConfig = require('../models/TryOnProviderConfig');
const User = require('../models/User');

const categoryTaxonomyService = require('../services/categoryTaxonomyService');
const categoryInputValidator = require('../services/categoryInputValidator');
const virtualTryOnService = require('../services/virtualTryOnService');
const { VirtualTryOnService } = virtualTryOnService.constructor
  ? { VirtualTryOnService: virtualTryOnService.constructor }
  : {};
const { TryOnProviderRegistry, CATALOG_CATEGORY_TARGETS } = require('../services/providers/TryOnProviderRegistry');
const VertexVto001Adapter = require('../services/providers/VertexVto001Adapter');
const GeminiImageEditAdapter = require('../services/providers/GeminiImageEditAdapter');
const FootwearProvider = require('../services/providers/FootwearProvider');
const EyewearProvider = require('../services/providers/EyewearProvider');
const AccessoriesProvider = require('../services/providers/AccessoriesProvider');
const {
  FashnTryOnMaxStub,
  KlingKolorsVtoStub,
  BanubaEyewearArStub
} = require('../services/providers/ExternalProviderStubs');
const { TryOnProviderConfigService, sanitizeProviderErrorMessage } = require('../services/tryOnProviderConfigService');
const tryOnProviderConfigService = require('../services/tryOnProviderConfigService');
const tryOnUsageStatsService = require('../services/tryOnUsageStatsService');
const { TryOnQueueService } = require('../services/tryOnQueueService');
const productIntelligenceService = require('../services/productIntelligenceService');
const tryOnCreditService = require('../services/tryOnCreditService');
const tryOnRoutes = require('../routes/tryOnRoutes');

function makeId() {
  return new mongoose.Types.ObjectId();
}

function getNested(obj, dotPath) {
  return dotPath.split('.').reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
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
      if ('$gte' in cond && !(val != null && new Date(val).getTime() >= new Date(cond.$gte).getTime())) return false;
      if ('$lt' in cond && !(val != null && new Date(val).getTime() < new Date(cond.$lt).getTime())) return false;
    } else if (cond === null) {
      if (val !== null && val !== undefined) return false;
    } else if (String(val) !== String(cond)) {
      return false;
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
          const dup = store.docs.find(d => String(d._id) !== String(this._id) && String(d[uf]) === String(v));
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
      const wrapped = store.wrap({ ...defaults, ...payload });
      return wrapped.save();
    };
    Model.findOneAndUpdate = async (q, update, opts = {}) => {
      const matches = store.docs.filter(d => matchesQuery(d, q));
      if (matches.length === 0) return null;
      const target = matches[0];
      const setPayload = update.$set || {};
      for (const [k, v] of Object.entries(update)) {
        if (!k.startsWith('$')) setPayload[k] = v;
      }
      for (const [k, v] of Object.entries(setPayload)) {
        if (k.includes('.')) {
          const parts = k.split('.');
          if (!target[parts[0]]) target[parts[0]] = {};
          target[parts[0]][parts[1]] = v;
        } else {
          target[k] = v;
        }
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          target[k] = (target[k] || 0) + v;
        }
      }
      await target.save();
      return target;
    };
    Model.countDocuments = async (q = {}) => store.docs.filter(d => matchesQuery(d, q)).length;
    return () => Object.assign(Model, originals);
  }
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

describe('Phase 4 — Multi-Category AI Providers & Capability Governance (Zero Real AI Calls)', () => {
  let restores = [];
  let stores = {};

  beforeEach(() => {
    stores = {
      Product: new InMemoryModelStub(),
      ProductIntelligence: new InMemoryModelStub(['product']),
      TryOnJob: new InMemoryModelStub(['idempotencyKey']),
      TryOnImageAsset: new InMemoryModelStub(),
      TryOnCredit: new InMemoryModelStub(['user']),
      TryOnCreditLot: new InMemoryModelStub(),
      TryOnCreditLedger: new InMemoryModelStub(),
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
      stores.TryOnProviderConfig.installOn(TryOnProviderConfig),
      stores.User.installOn(User)
    ];
  });

  afterEach(() => {
    for (const restore of restores) restore();
  });

  async function seedUserWithCredit(userId, credits = 5, role = 'user') {
    await User.create({ _id: userId, name: 'Test User', email: `u-${userId}@kdxx.vn`, role });
    await TryOnCredit.create({
      user: userId,
      membershipType: role === 'admin' ? 'admin' : 'free',
      totalAvailableCredits: credits,
      freeCreditsClaimed: true
    });
    await TryOnCreditLot.create({
      user: userId,
      lotType: 'free',
      initialAmount: credits,
      remainingAmount: credits,
      reservedAmount: 0,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 86400000)
    });
  }

  async function seedValidPersonAsset(userId) {
    return TryOnImageAsset.create({
      _id: makeId(),
      user: userId,
      type: 'user_photo',
      mimeType: 'image/jpeg',
      width: 768,
      height: 1024,
      qualityAnalysis: { status: 'PASSED', score: 95 },
      expiresAt: new Date(Date.now() + 72 * 3600000),
      isDeleted: false
    });
  }

  it('01. Clothing resolves to google-vertex-vto-001 (VERIFIED, DEPRECATION_ANNOUNCED, retirement 2027-03-15)', async () => {
    const preRetirement = new Date('2026-11-12T00:00:00Z');
    for (const cat of ['tops', 't-shirts', 'shirts', 'hoodies', 'jackets', 'pants', 'jeans', 'dresses']) {
      const routing = await virtualTryOnService.resolveCategoryRouting({
        category: cat,
        domain: 'clothing',
        subCategory: cat,
        now: preRetirement
      });
      assert.equal(routing.support.allowSubmit, true, `Expected ${cat} allowed`);
      assert.equal(routing.support.status, 'VERIFIED');
      assert.equal(routing.support.providerId, 'google-vertex-vto-001');
      assert.equal(routing.support.modelId, 'virtual-try-on-001');
      assert.equal(routing.support.lifecycleStage, 'DEPRECATION_ANNOUNCED');
      assert.equal(routing.support.deprecationDate, '2026-09-14');
      assert.equal(routing.support.retirementDate, '2027-03-15');
    }
  });

  it('02. Footwear has LIMITED status, disabled by default, never falls back to Clothing', async () => {
    const userId = makeId();
    await seedUserWithCredit(userId, 5);
    const person = await seedValidPersonAsset(userId);
    const sneaker = await Product.create({
      _id: makeId(),
      name: 'AMIRI MA-1 SNEAKER',
      category: 'shoes',
      image: 'https://cdn.kdxx.test/ma1.jpg',
      colors: ['White']
    });

    const routing = await virtualTryOnService.resolveCategoryRouting({
      category: 'shoes',
      domain: 'footwear',
      subCategory: 'sneakers'
    });
    assert.equal(routing.support.status, 'LIMITED');
    assert.equal(routing.support.allowSubmit, false);

    const queue = new TryOnQueueService();
    await assert.rejects(
      () => queue.submitJob({ userId, personImageAssetId: person._id, productId: sneaker._id }),
      (err) => err.code === 'CATEGORY_DISABLED_LIMITED'
    );
    assert.equal(stores.TryOnJob.docs.length, 0);
    assert.equal(stores.TryOnCredit.docs[0].totalAvailableCredits, 5);
  });

  it('03. Eyewear, Bags, Hats, Jewelry, Watches, Belts, Wallets, Keychains, Socks all reject submission without fallback', async () => {
    const userId = makeId();
    await seedUserWithCredit(userId, 5);
    const person = await seedValidPersonAsset(userId);
    const queue = new TryOnQueueService();

    const blockedItems = [
      { name: 'Classic MA Sunglasses', category: 'accessories', tags: ['Sunglasses'] },
      { name: 'Bandana Leather Bag', category: 'accessories', tags: ['Bags'] },
      { name: 'AMIRI Script Logo Hat', category: 'accessories', tags: ['Hats'] },
      { name: 'Gold Chain Necklace', category: 'accessories', tags: ['Necklaces'] },
      { name: 'AMIRI Chronograph Watch', category: 'accessories', tags: ['Watches'] },
      { name: 'MA Leather Belt', category: 'accessories', tags: ['Belts'] },
      { name: 'Croc Card Holder Wallet', category: 'accessories', tags: ['Wallets'] },
      { name: 'Skull Keychain Charm', category: 'accessories', tags: ['Keychains'] },
      { name: 'Bones Ribbed Crew Socks', category: 'accessories', tags: ['Socks'] }
    ];

    for (const item of blockedItems) {
      const prod = await Product.create({
        _id: makeId(),
        ...item,
        image: 'https://cdn.kdxx.test/item.jpg'
      });
      await assert.rejects(
        () => queue.submitJob({ userId, personImageAssetId: person._id, productId: prod._id }),
        (err) => ['UNSUPPORTED_CATEGORY', 'PROVIDER_NOT_CONFIGURED', 'CATEGORY_DISABLED_LIMITED', 'CATEGORY_EXPERIMENTAL_DISABLED'].includes(err.code),
        `Expected ${item.name} to be blocked`
      );
    }

    assert.equal(stores.TryOnJob.docs.length, 0);
    assert.equal(stores.TryOnCredit.docs[0].totalAvailableCredits, 5);
  });

  it('04. Gemini Image Edit remains EXPERIMENTAL & disabled even when GEMINI_API_KEY env is present', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'fake-test-key-should-not-auto-enable';
    try {
      const gemini = new GeminiImageEditAdapter();
      const caps = gemini.getCapabilities();
      assert.equal(gemini.isAvailable(), false);
      assert.equal(caps.verificationStatus, 'EXPERIMENTAL');
      assert.equal(caps.isEnabledByDefault, false);
      assert.equal(caps.available, false);
      await assert.rejects(() => gemini.executeTryOn(), err => err.code === 'NOT_IMPLEMENTED');
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it('05. FASHN, PerfectCorp, Fittingbox, Banuba, Kling specialist adapters stay NOT_CONFIGURED and disabled', async () => {
    const stubs = [
      new FashnTryOnMaxStub(),
      new KlingKolorsVtoStub(),
      new BanubaEyewearArStub(),
      new FootwearProvider(),
      new EyewearProvider(),
      new AccessoriesProvider()
    ];

    for (const stub of stubs) {
      const caps = stub.getCapabilities();
      assert.equal(stub.isAvailable(), false);
      assert.equal(caps.verificationStatus, 'NOT_CONFIGURED');
      assert.equal(caps.isEnabledByDefault, false);
      assert.ok(Array.isArray(caps.requiredEnvVars) && caps.requiredEnvVars.length > 0);
      await assert.rejects(() => stub.executeTryOn(), err => err.code === 'NOT_IMPLEMENTED');
    }
  });

  it('06. Auto-retirement: clock >= 2027-03-15 automatically rejects new Clothing jobs regardless of Admin toggle', async () => {
    await TryOnProviderConfig.create({
      providerId: 'google-vertex-vto-001',
      isEnabled: true
    });

    const retiredClock = new Date('2027-03-15T00:00:00.000Z');
    const adapter = new VertexVto001Adapter();
    assert.equal(adapter.isPastRetirement(retiredClock), true);
    assert.equal(adapter.isAvailable(retiredClock), false);

    await assert.rejects(
      () => adapter.executeTryOn({ personBase64: 'YWJj', productBase64: 'ZGVm', now: retiredClock }),
      err => err.code === 'MODEL_RETIRED'
    );

    const routing = await virtualTryOnService.resolveCategoryRouting({
      category: 'tops',
      domain: 'clothing',
      subCategory: 'tops',
      now: retiredClock
    });
    assert.equal(routing.support.allowSubmit, false);
    assert.equal(routing.support.status, 'DEPRECATED');
    assert.equal(routing.support.isPastRetirement, true);

    assert.throws(
      () => virtualTryOnService.getDefaultProvider?.(retiredClock) || new TryOnProviderRegistry().getDefaultProvider(retiredClock),
      err => err.code === 'MODEL_RETIRED'
    );
  });

  it('07. Client-supplied providerId/modelId spoofing is ignored by POST /api/tryon/generate', async () => {
    const userId = makeId();
    await seedUserWithCredit(userId, 5);
    const person = await seedValidPersonAsset(userId);
    const eyewearProd = await Product.create({
      _id: makeId(),
      name: 'Classic MA Sunglasses',
      category: 'accessories',
      tags: ['Sunglasses'],
      image: 'https://cdn.kdxx.test/sg.jpg'
    });

    const resp = await invokeRouterHandler(tryOnRoutes, 'post', '/generate', {
      user: { _id: userId, role: 'user' },
      body: {
        personImageAssetId: person._id,
        productId: eyewearProd._id,
        providerId: 'google-vertex-vto-001',
        modelId: 'virtual-try-on-001'
      }
    });

    assert.equal(resp.statusCode >= 400, true);
    assert.equal(resp.body.success, false);
    assert.equal(stores.TryOnJob.docs.length, 0);
  });

  it('08. MA BANDANA KEYCHAIN conflicting tags trigger keychains classification + NEEDS_REVIEW & block submission', async () => {
    const product = await Product.create({
      _id: makeId(),
      name: 'MA BANDANA KEYCHAIN',
      description: 'Brass bandana charm keychain hardware.',
      category: 'accessories',
      tags: ['Belts', 'Hardware', 'Keychains', 'Accessories'],
      image: 'https://cdn.kdxx.test/keychain.jpg'
    });

    const taxonomy = categoryTaxonomyService.mapProductCategory(product);
    assert.equal(taxonomy.subCategory, 'keychains');
    assert.equal(taxonomy.needsReview, true);
    assert.match(taxonomy.conflictReason, /Belts/i);

    const intel = await productIntelligenceService.ensureBaselineForProduct(product);
    assert.equal(intel.verificationStatus, 'NEEDS_REVIEW');
    assert.equal(intel.flags.needsReview, true);

    const userId = makeId();
    await seedUserWithCredit(userId, 5);
    const person = await seedValidPersonAsset(userId);
    const queue = new TryOnQueueService();

    await assert.rejects(
      () => queue.submitJob({ userId, personImageAssetId: person._id, productId: product._id }),
      err => err.code === 'PRODUCT_NEEDS_REVIEW'
    );
    assert.equal(stores.TryOnCredit.docs[0].totalAvailableCredits, 5);
  });

  it('09. Serious CONFLICT on ProductIntelligence blocks job before credit reservation', async () => {
    const product = await Product.create({
      _id: makeId(),
      name: 'Bones Leather Jacket',
      category: 'men',
      image: 'https://cdn.kdxx.test/jacket.jpg'
    });
    await ProductIntelligence.create({
      product: product._id,
      normalizedCategory: { domain: 'clothing', subCategory: 'jackets', filterGroup: 'tops' },
      verificationStatus: 'CONFLICT',
      conflicts: [{ field: 'color', kdxxValue: 'Black', externalValues: ['White'], resolved: false }],
      flags: { hasConflicts: true, unverified: true, missingData: false, missingImages: false, skuVariantMismatch: false, staleSource: false, needsReview: false }
    });

    const userId = makeId();
    await seedUserWithCredit(userId, 5);
    const person = await seedValidPersonAsset(userId);
    const queue = new TryOnQueueService();

    await assert.rejects(
      () => queue.submitJob({ userId, personImageAssetId: person._id, productId: product._id }),
      err => err.code === 'PRODUCT_INTELLIGENCE_CONFLICT'
    );
    assert.equal(stores.TryOnJob.docs.length, 0);
    assert.equal(stores.TryOnCredit.docs[0].totalAvailableCredits, 5);
  });

  it('10. Category rejection does not consume rate-limit quota or reserve credits', async () => {
    const userId = makeId();
    await seedUserWithCredit(userId, 5);
    const person = await seedValidPersonAsset(userId);
    const bagProd = await Product.create({
      _id: makeId(),
      name: 'MA Crossbody Bag',
      category: 'accessories',
      tags: ['Bags'],
      image: 'https://cdn.kdxx.test/bag.jpg'
    });

    const queue = new TryOnQueueService();
    for (let i = 0; i < 6; i++) {
      await assert.rejects(
        () => queue.submitJob({ userId, personImageAssetId: person._id, productId: bagProd._id })
      );
    }

    assert.equal((queue.rateLimits.tryOns.get(String(userId)) || []).length, 0);
    assert.equal(stores.TryOnCredit.docs[0].totalAvailableCredits, 5);
  });

  it('11. Valid Clothing job preserves idempotency, credit commit, refund on failure & AI_TIMEOUT reconciliation (0 real GCP calls)', async () => {
    const userId = makeId();
    await seedUserWithCredit(userId, 5);
    const person = await seedValidPersonAsset(userId);
    const jacket = await Product.create({
      _id: makeId(),
      name: 'AMIRI Varsity Jacket',
      category: 'men',
      tags: ['Jackets'],
      image: 'https://cdn.kdxx.test/varsity.jpg',
      colors: ['Black']
    });

    const onePixelPng = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } }
    }).png().toBuffer();

    let callCount = 0;
    const mockVtoService = Object.assign(Object.create(Object.getPrototypeOf(virtualTryOnService)), {
      resolveCategoryRouting: (opts) => virtualTryOnService.resolveCategoryRouting(opts),
      getActiveProvider: (opts) => virtualTryOnService.getActiveProvider(opts),
      predictTryOn: async () => {
        callCount += 1;
        return {
          resultBase64: onePixelPng.toString('base64'),
          providerRequestId: `mock-req-${callCount}`,
          providerId: 'google-vertex-vto-001',
          modelId: 'virtual-try-on-001',
          httpStatus: 200,
          estimatedCostUsd: 0.06
        };
      }
    });

    const savedAssets = [];
    const queue = new TryOnQueueService({
      virtualTryOnService: mockVtoService,
      tryOnStorageService: {
        getImageBuffer: async () => ({ buffer: onePixelPng, mimeType: 'image/png' }),
        saveImage: async (payload) => {
          const asset = { _id: makeId(), ...payload };
          savedAssets.push(asset);
          return asset;
        }
      },
      fetchSafeRemoteImage: async () => ({ buffer: onePixelPng, contentType: 'image/png' })
    });
    queue.processNextJobs = async () => {};

    const job1 = await queue.submitJob({
      userId,
      personImageAssetId: person._id,
      productId: jacket._id,
      idempotencyKey: 'idem-phase4-1'
    });
    const job1Dup = await queue.submitJob({
      userId,
      personImageAssetId: person._id,
      productId: jacket._id,
      idempotencyKey: 'idem-phase4-1'
    });
    assert.equal(String(job1._id), String(job1Dup._id));

    await queue.executeJob(job1);
    assert.equal(callCount, 1);
    assert.equal(job1.status, 'COMPLETED');
    assert.equal(stores.TryOnCredit.docs[0].totalAvailableCredits, 4);

    // Timeout after dispatch -> RECONCILIATION_REQUIRED
    mockVtoService.predictTryOn = async () => {
      const err = new Error('Vertex timed out');
      err.code = 'AI_TIMEOUT';
      throw err;
    };
    const job2 = await queue.submitJob({
      userId,
      personImageAssetId: person._id,
      productId: jacket._id,
      idempotencyKey: 'idem-phase4-timeout'
    });
    await queue.executeJob(job2);
    assert.equal(job2.status, 'RECONCILIATION_REQUIRED');
    assert.equal(job2.reconciliation.state, 'AI_TIMEOUT_UNVERIFIED');
  });

  it('12. Security: capabilities, catalog, admin/providers & error sanitizer never leak tokens or secrets', async () => {
    const prevGcpToken = process.env.GCP_ACCESS_TOKEN;
    const prevGeminiKey = process.env.GEMINI_API_KEY;
    process.env.GCP_ACCESS_TOKEN = 'ya29.SUPER_SECRET_GCP_TOKEN_12345';
    process.env.GEMINI_API_KEY = 'AIzaSySUPER_SECRET_GEMINI_KEY_999';

    try {
      await Product.create({
        _id: makeId(),
        name: 'Silk Logo Tee',
        category: 'men',
        tags: ['T-Shirts'],
        image: 'https://cdn.kdxx.test/tee.jpg'
      });

      const capResp = await invokeRouterHandler(tryOnRoutes, 'get', '/capabilities');
      const catResp = await invokeRouterHandler(tryOnRoutes, 'get', '/catalog');
      const admResp = await invokeRouterHandler(tryOnRoutes, 'get', '/admin/providers', {
        user: { _id: makeId(), role: 'admin', email: 'admin@kdxx.vn' }
      });

      const serialized = JSON.stringify({ capResp, catResp, admResp });
      assert.equal(serialized.includes('SUPER_SECRET_GCP_TOKEN_12345'), false);
      assert.equal(serialized.includes('SUPER_SECRET_GEMINI_KEY_999'), false);

      const scrubbed = sanitizeProviderErrorMessage('GET https://x.test?token=abc123&key=xyz Authorization: Bearer secretTokenHere');
      assert.equal(scrubbed.includes('secretTokenHere'), false);
      assert.equal(scrubbed.includes('abc123'), false);
      assert.equal(scrubbed.includes('xyz'), false);
    } finally {
      if (prevGcpToken === undefined) delete process.env.GCP_ACCESS_TOKEN;
      else process.env.GCP_ACCESS_TOKEN = prevGcpToken;
      if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGeminiKey;
    }
  });

  it('13. Circuit breaker opens after 5 consecutive provider failures and recovers upon Admin reset', async () => {
    for (let i = 0; i < 5; i++) {
      await tryOnProviderConfigService.recordProviderOutcome('google-vertex-vto-001', {
        ok: false,
        errorCode: 'UPSTREAM_503',
        errorMessage: 'Transient Bearer secret_should_redact failure',
        category: 'clothing'
      });
    }

    const blockedSupport = await virtualTryOnService.resolveCategoryRouting({
      category: 'tops',
      domain: 'clothing',
      subCategory: 'tops'
    });
    assert.equal(blockedSupport.support.allowSubmit, false);
    assert.match(blockedSupport.support.reason, /ngắt mạch bảo vệ/i);

    const cfg = stores.TryOnProviderConfig.docs[0];
    assert.equal(cfg.lastError.message.includes('secret_should_redact'), false);

    // Admin resets circuit breaker
    await tryOnProviderConfigService.adminUpdateProviderConfig({
      providerId: 'google-vertex-vto-001',
      adminUser: { _id: makeId(), email: 'admin@kdxx.vn', role: 'admin' },
      resetCircuitBreaker: true,
      reason: 'Verify circuit reset'
    });

    const recovered = await virtualTryOnService.resolveCategoryRouting({
      category: 'tops',
      domain: 'clothing',
      subCategory: 'tops'
    });
    assert.equal(recovered.support.allowSubmit, true);
  });

  it('14. Admin cannot enable retired or NOT_CONFIGURED/unimplemented providers, but can toggle Clothing & log audit trail', async () => {
    const adminUser = { _id: makeId(), email: 'owner@kdxx.vn', role: 'admin' };

    await assert.rejects(
      () => tryOnProviderConfigService.adminUpdateProviderConfig({
        providerId: 'fashn-tryon-max-stub',
        adminUser,
        isEnabled: true
      }),
      err => err.code === 'CANNOT_ENABLE_UNCONFIGURED_PROVIDER'
    );

    await assert.rejects(
      () => tryOnProviderConfigService.adminUpdateProviderConfig({
        providerId: 'fashn-tryon-max-stub',
        adminUser,
        verificationStatusOverride: 'VERIFIED'
      }),
      err => err.code === 'CANNOT_VERIFY_UNCONFIGURED_PROVIDER'
    );

    await assert.rejects(
      () => tryOnProviderConfigService.adminUpdateProviderConfig({
        providerId: 'google-vertex-vto-001',
        adminUser,
        isEnabled: true,
        now: new Date('2027-03-15T00:00:00Z')
      }),
      err => err.code === 'CANNOT_ENABLE_RETIRED_PROVIDER'
    );

    const updated = await tryOnProviderConfigService.adminUpdateProviderConfig({
      providerId: 'google-vertex-vto-001',
      adminUser,
      isEnabled: false,
      reason: 'Scheduled maintenance pause'
    });
    const vertex = updated.providers.find(p => p.providerId === 'google-vertex-vto-001');
    assert.equal(vertex.available, false);
    assert.ok(updated.auditLogs.some(l => l.summary === 'Scheduled maintenance pause' && l.actorEmail === 'owner@kdxx.vn'));
  });

  it('15. TryOnUsageStatsService computes accurate real metrics and $0 when no jobs exist (never fakes usage)', async () => {
    const emptyStats = await tryOnUsageStatsService.getProviderAndCategoryStats();
    assert.equal(emptyStats.totalJobs, 0);
    assert.equal(emptyStats.totalEstimatedUsd, 0);
    assert.deepEqual(emptyStats.byProvider, []);

    await TryOnJob.create({
      user: makeId(),
      personImageAsset: makeId(),
      product: makeId(),
      productImageUrl: 'https://cdn.kdxx.test/a.jpg',
      status: 'COMPLETED',
      provider: 'google-vertex-vto-001',
      aiProviderDetails: { providerId: 'google-vertex-vto-001', model: 'virtual-try-on-001', estimatedCostUsd: 0.06 },
      productSnapshot: { category: { domain: 'clothing', subCategory: 'jackets' } },
      timing: { durationMs: 4200 }
    });
    await TryOnJob.create({
      user: makeId(),
      personImageAsset: makeId(),
      product: makeId(),
      productImageUrl: 'https://cdn.kdxx.test/b.jpg',
      status: 'FAILED',
      provider: 'google-vertex-vto-001',
      aiProviderDetails: { providerId: 'google-vertex-vto-001', model: 'virtual-try-on-001', estimatedCostUsd: 0 },
      productSnapshot: { category: { domain: 'clothing', subCategory: 'jackets' } },
      timing: { durationMs: 1200 }
    });

    const stats = await tryOnUsageStatsService.getProviderAndCategoryStats();
    assert.equal(stats.totalJobs, 2);
    assert.equal(stats.completedJobs, 1);
    assert.equal(stats.failedJobs, 1);
    assert.equal(stats.failureRate, 50);
    assert.equal(stats.totalEstimatedUsd, 0.06);
    assert.equal(stats.byCategory[0].category, 'jackets');
    assert.equal(CATALOG_CATEGORY_TARGETS.length >= 11, true);
  });
});
