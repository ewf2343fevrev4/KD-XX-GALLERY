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
const fullOutfitValidator = require('../services/fullOutfitValidator');
const { TryOnProviderRegistry } = require('../services/providers/TryOnProviderRegistry');
const VertexVto001Adapter = require('../services/providers/VertexVto001Adapter');
const { TryOnProviderConfigService } = require('../services/tryOnProviderConfigService');
const { VirtualTryOnService } = require('../services/virtualTryOnService');
const tryOnCreditService = require('../services/tryOnCreditService');
const { TryOnQueueService } = require('../services/tryOnQueueService');
const { TryOnHistoryService } = require('../services/tryOnHistoryService');
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
      if ('$lte' in cond) {
        if (val instanceof Date || cond.$lte instanceof Date) {
          if (!(val != null && new Date(val).getTime() <= new Date(cond.$lte).getTime())) return false;
        } else if (!(Number(val) <= Number(cond.$lte))) {
          return false;
        }
      }
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
        if (v !== undefined && v !== null && v !== '') {
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
      const defaults = typeof store.defaultFactory === 'function' ? store.defaultFactory() : {};
      const wrapped = store.wrap({ ...defaults, ...payload });
      return wrapped.save();
    };
    Model.findOneAndUpdate = async (q, update) => {
      const matches = store.docs.filter(d => matchesQuery(d, q));
      if (matches.length === 0) return null;
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
    retentionHours: 72,
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
      if (!asset || asset.isDeleted || asset.status === 'DELETED') {
        const err = new Error('Ảnh đã bị xóa hoặc hết hạn.');
        err.statusCode = 404;
        err.code = 'ASSET_DELETED';
        throw err;
      }
      if (!skipOwnership && String(asset.user) !== String(userId)) {
        const err = new Error('Không có quyền truy cập ảnh này.');
        err.statusCode = 403;
        throw err;
      }
      const buffer = buffers.get(String(asset._id));
      if (!buffer) {
        const err = new Error('Không tìm thấy dữ liệu ảnh.');
        err.statusCode = 404;
        throw err;
      }
      return { buffer, mimeType: asset.mimeType || 'image/png', asset };
    },
    async deleteAsset(assetId, userId, skipOwnership = false) {
      const asset = assetModelStore.docs.find(d => String(d._id) === String(assetId));
      if (!asset || asset.isDeleted || asset.status === 'DELETED') return false;
      if (!skipOwnership && String(asset.user) !== String(userId)) return false;
      asset.status = 'DELETED';
      asset.isDeleted = true;
      asset.deletedAt = new Date();
      buffers.delete(String(asset._id));
      return true;
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

describe('Phase 5 — Full Outfit Virtual Try-On, Multi-Lot Credits & Sequential Safeguards (Mocked AI / Zero Paid Calls)', () => {
  let restores = [];
  let stores = {};

  let origVertexExecute = null;

  beforeEach(() => {
    origVertexExecute = VertexVto001Adapter.prototype.executeTryOn;
    VertexVto001Adapter.prototype.executeTryOn = async function () {
      throw new Error('REAL_VERTEX_CALL_BLOCKED_IN_TEST');
    };
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
        aiProviderDetails: {}
      })),
      TryOnImageAsset: new InMemoryModelStub([], () => ({ isDeleted: false, status: 'ACTIVE' })),
      TryOnCredit: new InMemoryModelStub(['user'], () => ({ membershipType: 'free', totalAvailableCredits: 0 })),
      TryOnCreditLot: new InMemoryModelStub([], () => ({ reservedAmount: 0, isActive: true })),
      TryOnCreditLedger: new InMemoryModelStub(['idempotencyKey']),
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

  afterEach(async () => {
    await new Promise(resolve => setImmediate(resolve));
    if (origVertexExecute) {
      VertexVto001Adapter.prototype.executeTryOn = origVertexExecute;
      origVertexExecute = null;
    }
    for (const restore of restores) restore();
    restores = [];
  });

  it('01. Milestone 5.0 Taxonomy Fix: "với" does not misclassify Bomber as socks, "vớ" matches socks, eyewear compatible', () => {
    const bomber = categoryTaxonomyService.mapProductCategory({
      name: 'Moose Knuckles Original Ballistic Bomber',
      description: 'Áo khoác lông vũ cao cấp với phần cổ lông tháo rời và khóa kéo kim loại.',
      category: 'men',
      tags: ['Jackets', 'Outerwear']
    });
    assert.equal(bomber.domain, 'clothing');
    assert.equal(bomber.subCategory, 'jackets');
    assert.equal(bomber.needsReview, false);

    const sunglasses = categoryTaxonomyService.mapProductCategory({
      name: 'Classic MA Sunglasses',
      description: 'Gọng kính Acetate tinh xảo với tròng chống tia UV.',
      category: 'accessories',
      tags: ['Sunglasses', 'Eyewear']
    });
    assert.equal(sunglasses.domain, 'accessories');
    assert.equal(sunglasses.subCategory, 'sunglasses');
    assert.equal(sunglasses.needsReview, false);

    const actualSocks = categoryTaxonomyService.mapProductCategory({
      name: 'Nike Vớ Cổ Cao',
      description: 'Vớ thể thao co giãn thoáng khí.',
      category: 'accessories',
      tags: []
    });
    assert.equal(actualSocks.subCategory, 'socks');

    const tatCaShirt = categoryTaxonomyService.mapProductCategory({
      name: 'Áo thun cho tất cả mùa',
      description: 'Áo thun cotton 100% nhẹ nhàng.',
      category: 'men',
      tags: []
    });
    assert.equal(tatCaShirt.subCategory, 't-shirts');
    assert.equal(categoryTaxonomyService.areSubcategoriesCompatible('sunglasses', 'eyewear'), true);
  });

  it('02. Registry Full Outfit capability: gated OFF by default, opens after benchmark enable, hard-stops on 2027-03-15', () => {
    const registry = new TryOnProviderRegistry();
    const adapter = new VertexVto001Adapter({
      projectId: 'test-proj',
      location: 'us-central1',
      modelId: 'virtual-try-on-001'
    });
    adapter.areCredentialsConfigured = () => true;
    registry.register(adapter);

    const defaultCap = registry.evaluateFullOutfitCapability({
      now: new Date('2026-11-12T10:00:00Z'),
      configsByProviderId: new Map()
    });
    assert.equal(defaultCap.allowSubmit, false);
    assert.equal(defaultCap.blockCode, 'FULL_OUTFIT_PENDING_BENCHMARK');
    assert.equal(defaultCap.requiredCredits, 2);
    assert.equal(defaultCap.maxItems, 2);

    const adminEnabledCap = registry.evaluateFullOutfitCapability({
      now: new Date('2026-11-12T10:00:00Z'),
      configsByProviderId: new Map([[
        'google-vertex-vto-001',
        {
          providerId: 'google-vertex-vto-001',
          isEnabled: true,
          categoryOverrides: {
            full_outfit: true
          }
        }
      ]])
    });
    assert.equal(adminEnabledCap.allowSubmit, true);
    assert.equal(adminEnabledCap.blockCode, null);
    assert.equal(adminEnabledCap.strategy, 'SEQUENTIAL_CLOTHING_VTO');

    const retiredCap = registry.evaluateFullOutfitCapability({
      now: new Date('2027-03-15T00:00:00Z'),
      configsByProviderId: new Map([[
        'google-vertex-vto-001',
        {
          providerId: 'google-vertex-vto-001',
          isEnabled: true,
          categoryOverrides: {
            full_outfit: true
          }
        }
      ]])
    });
    assert.equal(retiredCap.allowSubmit, false);
    assert.equal(retiredCap.blockCode, 'MODEL_RETIRED');
  });

  it('03. fullOutfitValidator enforces 2 unique items (1 TOP + 1 BOTTOM), locks DRESS/FOOTWEAR/ACCESSORIES/CONFLICT & orders BOTTOM -> TOP', () => {
    const topItem = {
      product: { _id: makeId(), name: 'BONES DOWN JACKET' },
      taxonomy: { domain: 'clothing', subCategory: 'jackets', filterGroup: 'tops' },
      intelligence: { verificationStatus: 'VERIFIED' },
      productImageUrl: '/images/jacket.jpg'
    };
    const bottomItem = {
      product: { _id: makeId(), name: 'STACKED DENIM JEANS' },
      taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' },
      intelligence: { verificationStatus: 'VERIFIED' },
      productImageUrl: '/images/jeans.jpg'
    };

    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([topItem]),
      (err) => err.code === 'INVALID_OUTFIT_COUNT'
    );
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([topItem, topItem]),
      (err) => err.code === 'DUPLICATE_OUTFIT_PRODUCT'
    );
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([
        topItem,
        {
          product: { _id: makeId(), name: 'SECOND SHIRT' },
          taxonomy: { domain: 'clothing', subCategory: 'shirts', filterGroup: 'tops' },
          intelligence: { verificationStatus: 'VERIFIED' },
          productImageUrl: '/images/shirt.jpg'
        }
      ]),
      (err) => err.code === 'DUPLICATE_OUTFIT_SLOT'
    );
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([
        bottomItem,
        {
          product: { _id: makeId(), name: 'SILK MIDI DRESS' },
          taxonomy: { domain: 'clothing', subCategory: 'dresses', filterGroup: 'dresses' },
          intelligence: { verificationStatus: 'VERIFIED' },
          productImageUrl: '/images/dress.jpg'
        }
      ]),
      (err) => err.code === 'DRESS_SINGLE_ITEM_ONLY'
    );
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([
        topItem,
        {
          product: { _id: makeId(), name: 'MA-1 SNEAKERS' },
          taxonomy: { domain: 'footwear', subCategory: 'sneakers', filterGroup: 'shoes' },
          intelligence: { verificationStatus: 'VERIFIED' },
          productImageUrl: '/images/shoes.jpg'
        }
      ]),
      (err) => err.code === 'FULL_OUTFIT_FOOTWEAR_LOCKED'
    );
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([
        topItem,
        {
          product: { _id: makeId(), name: 'MA SUNGLASSES' },
          taxonomy: { domain: 'accessories', subCategory: 'sunglasses', filterGroup: 'eyewear' },
          intelligence: { verificationStatus: 'VERIFIED' },
          productImageUrl: '/images/sunglasses.jpg'
        }
      ]),
      (err) => err.code === 'FULL_OUTFIT_ACCESSORIES_LOCKED'
    );
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([
        topItem,
        { ...bottomItem, intelligence: { verificationStatus: 'CONFLICT' } }
      ]),
      (err) => err.code === 'PRODUCT_INTELLIGENCE_CONFLICT'
    );

    const validated = fullOutfitValidator.validateFullOutfitSelection([topItem, bottomItem]);
    assert.equal(validated.creditsCost, 2);
    assert.equal(validated.orderedSteps[0].slot, 'BOTTOM');
    assert.equal(validated.orderedSteps[0].stepOrder, 0);
    assert.equal(validated.orderedSteps[1].slot, 'TOP');
    assert.equal(validated.orderedSteps[1].stepOrder, 1);

    // Full-body portrait guard for outfits with bottoms (jeans/pants)
    const validFullBody = fullOutfitValidator.validatePersonImageForOutfit({ width: 768, height: 1024 });
    assert.equal(validFullBody.valid, true);

    assert.throws(
      () => fullOutfitValidator.validatePersonImageForOutfit({ width: 1200, height: 1354 }),
      err => err.code === 'FULL_BODY_PHOTO_REQUIRED' && err.statusCode === 400
    );
  });

  it('04. inspectFullOutfitResultQuality catches flat blank outputs and >8% aspect-ratio drift while passing varied outputs', async () => {
    const orig = await createPatternPng({ width: 160, height: 240, rgbBase: [30, 30, 30], stripeRgb: [200, 50, 50] });
    const mid = await createPatternPng({ width: 160, height: 240, rgbBase: [50, 120, 180], stripeRgb: [240, 220, 40] });
    const finalOk = await createPatternPng({ width: 160, height: 240, rgbBase: [180, 90, 60], stripeRgb: [40, 220, 180] });

    const passRes = await fullOutfitValidator.inspectFullOutfitResultQuality({
      originalBuffer: orig,
      intermediateBuffer: mid,
      finalBuffer: finalOk
    });
    assert.equal(passRes.status, 'PASSED');
    assert.equal(passRes.warnings.length, 0);

    const blankBuf = await sharp({
      create: { width: 160, height: 240, channels: 3, background: { r: 128, g: 128, b: 128 } }
    }).png().toBuffer();
    const blankRes = await fullOutfitValidator.inspectFullOutfitResultQuality({
      originalBuffer: orig,
      intermediateBuffer: mid,
      finalBuffer: blankBuf
    });
    assert.equal(blankRes.status, 'FAILED');
    assert.equal(blankRes.warnings.includes('FLAT_OR_BLANK_OUTPUT'), true);

    const driftedBuf = await createPatternPng({ width: 240, height: 240, rgbBase: [180, 90, 60], stripeRgb: [40, 220, 180] });
    const driftRes = await fullOutfitValidator.inspectFullOutfitResultQuality({
      originalBuffer: orig,
      intermediateBuffer: mid,
      finalBuffer: driftedBuf
    });
    assert.equal(driftRes.status, 'WARNING');
    assert.equal(driftRes.warnings.includes('ASPECT_RATIO_DRIFT'), true);
  });

  it('05. tryOnCreditService multi-lot reserve (1 Free + 1 Purchased), race rollback, idempotent commit & full 2-credit refund', async () => {
    const userId = makeId();
    const jobId = makeId();
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 2 });

    const freeLot = await TryOnCreditLot.create({
      user: userId,
      lotType: 'free',
      initialAmount: 1,
      remainingAmount: 1,
      reservedAmount: 0,
      isActive: true,
      expiresAt: null
    });
    const paidLot = await TryOnCreditLot.create({
      user: userId,
      lotType: 'purchased',
      initialAmount: 1,
      remainingAmount: 1,
      reservedAmount: 0,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000)
    });

    const reserveRes = await tryOnCreditService.reserveCredit(userId, jobId, 2);
    assert.equal(reserveRes.allocations.length, 2);
    assert.equal(freeLot.reservedAmount, 1);
    assert.equal(paidLot.reservedAmount, 1);

    const commitRes = await tryOnCreditService.commitCredit(userId, jobId, reserveRes.allocations, 2);
    assert.equal(commitRes.success, true);
    assert.equal(freeLot.remainingAmount, 0);
    assert.equal(paidLot.remainingAmount, 0);

    const dupCommit = await tryOnCreditService.commitCredit(userId, jobId, reserveRes.allocations, 2);
    assert.equal(dupCommit.alreadyCommitted, true);

    // Separate job with failure -> full 2-credit refund across 2 lots
    const job2Id = makeId();
    const lotA = await TryOnCreditLot.create({ user: userId, lotType: 'free', initialAmount: 1, remainingAmount: 1, reservedAmount: 0, isActive: true, expiresAt: null });
    const lotB = await TryOnCreditLot.create({ user: userId, lotType: 'purchased', initialAmount: 1, remainingAmount: 1, reservedAmount: 0, isActive: true, expiresAt: null });

    const r2 = await tryOnCreditService.reserveCredit(userId, job2Id, 2);
    assert.equal(r2.allocations.length, 2);
    const refRes = await tryOnCreditService.refundCredit(userId, job2Id, r2.allocations, 'STEP2_ERROR', 2);
    assert.equal(refRes.success, true);
    assert.equal(lotA.reservedAmount, 0);
    assert.equal(lotA.remainingAmount, 1);
    assert.equal(lotB.reservedAmount, 0);
    assert.equal(lotB.remainingAmount, 1);

    // Race condition on 2nd lot -> compensates & rolls back 1st lot's reservedAmount cleanly
    const origFindOneAndUpdate = TryOnCreditLot.findOneAndUpdate;
    let updateStep = 0;
    TryOnCreditLot.findOneAndUpdate = async (q, u, opts) => {
      updateStep++;
      if (updateStep === 2) return null; // Simulate concurrent drain on 2nd lot
      return origFindOneAndUpdate(q, u, opts);
    };
    const jobRaceId = makeId();
    await assert.rejects(
      () => tryOnCreditService.reserveCredit(userId, jobRaceId, 2),
      (err) => err.code === 'CREDIT_RACE_CONDITION'
    );
    TryOnCreditLot.findOneAndUpdate = origFindOneAndUpdate;
    assert.equal(lotA.reservedAmount, 0);

    // Insufficient credits (only 1 remaining) -> rejects without partial reservation
    const job3Id = makeId();
    lotB.remainingAmount = 0;
    lotB.isActive = false;
    await lotB.save();

    await assert.rejects(
      () => tryOnCreditService.reserveCredit(userId, job3Id, 2),
      (err) => err.code === 'INSUFFICIENT_CREDITS'
    );
    assert.equal(lotA.reservedAmount, 0);
  });

  it('06. Sequential Full Outfit execution passes intermediate image (TTL <= 72h), runs quality check, commits 2 credits & cleans up intermediate on delete', async () => {
    const userId = makeId();
    await User.create({ _id: userId, name: 'Test User', email: 'vto5@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 3 });
    await TryOnCreditLot.create({ user: userId, lotType: 'free', initialAmount: 3, remainingAmount: 3, reservedAmount: 0, isActive: true, expiresAt: null });

    const topProduct = await Product.create({ name: 'AMIRI LEATHER BOMBER', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/bomber.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI DISTRESSED JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/jeans.png' });
    await ProductIntelligence.create({
      product: topProduct._id,
      taxonomy: { domain: 'clothing', subCategory: 'jackets', filterGroup: 'tops' },
      verificationStatus: 'VERIFIED'
    });
    await ProductIntelligence.create({
      product: bottomProduct._id,
      taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' },
      verificationStatus: 'VERIFIED'
    });

    await TryOnProviderConfig.create({
      providerId: 'mock-vto-seq',
      isEnabled: true,
      categoryOverrides: { full_outfit: true, clothing: true }
    });

    const origPng = await createPatternPng({ width: 160, height: 240, rgbBase: [30, 30, 30], stripeRgb: [220, 60, 60] });
    const step0Png = await createPatternPng({ width: 160, height: 240, rgbBase: [40, 100, 190], stripeRgb: [230, 200, 50] });
    const step1Png = await createPatternPng({ width: 160, height: 240, rgbBase: [160, 70, 50], stripeRgb: [60, 220, 170] });
    const garmentPng = await createPatternPng({ width: 120, height: 120, rgbBase: [100, 100, 100], stripeRgb: [250, 250, 250] });

    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId, type: 'person_photo', buffer: origPng });

    const adapterCalls = [];
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.providerId = 'mock-vto-seq';
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async ({ personBase64 }) => {
      const personBuf = Buffer.from(personBase64, 'base64');
      adapterCalls.push({ isStep0Input: Buffer.compare(personBuf, step0Png) === 0, stepCall: adapterCalls.length + 1 });
      if (adapterCalls.length === 1) {
        return { resultBase64: step0Png.toString('base64'), mimeType: 'image/png', providerRequestId: 'req-step-0', estimatedCostUsd: 0.06 };
      }
      return { resultBase64: step1Png.toString('base64'), mimeType: 'image/png', providerRequestId: 'req-step-1', estimatedCostUsd: 0.06 };
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.clear();
    registry.register(mockAdapter);
    const cfgService = new TryOnProviderConfigService();
    const vtoService = new VirtualTryOnService({ registry, providerConfigService: cfgService });
    const historySvc = new TryOnHistoryService({ storageService: mockStorage });
    const queueSvc = new TryOnQueueService({
      virtualTryOnService: vtoService,
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      fetchSafeRemoteImage: async () => ({ buffer: garmentPng, contentType: 'image/png' })
    });
    queueSvc.processNextJobs = async () => {};

    const job = await queueSvc.submitFullOutfitJob({
      userId,
      personImageAssetId: personAsset._id,
      items: [
        { productId: topProduct._id },
        { productId: bottomProduct._id }
      ],
      idempotencyKey: 'fo-seq-e2e-1'
    });

    assert.equal(job.mode, 'FULL_OUTFIT');
    assert.equal(job.creditsCost, 2);
    assert.equal(job.executionSteps[0].slot, 'BOTTOM');
    assert.equal(job.executionSteps[1].slot, 'TOP');

    await queueSvc.executeJob(job);

    assert.equal(job.status, 'COMPLETED');
    assert.equal(adapterCalls.length, 2);
    assert.equal(adapterCalls[0].isStep0Input, false);
    // Step 2 input equals Step 1 intermediate output buffer
    assert.equal(adapterCalls[1].isStep0Input, true);
    assert.equal(job.resultQualityCheck.status, 'PASSED');

    const intermediateAsset = stores.TryOnImageAsset.docs.find(a => a.type === 'tryon_intermediate');
    assert.ok(intermediateAsset, 'Expected private tryon_intermediate asset');
    assert.equal(String(intermediateAsset.user), String(userId));
    assert.ok(new Date(intermediateAsset.expiresAt).getTime() - Date.now() <= 72 * 3600 * 1000 + 2000);

    const historyRes = await historySvc.listUserHistory(userId, {});
    assert.equal(historyRes.items.length, 1);
    assert.equal(historyRes.items[0].mode, 'FULL_OUTFIT');
    assert.equal(historyRes.items[0].creditsCost, 2);
    assert.equal(historyRes.items[0].outfitItems.length, 2);
    assert.equal(historyRes.items[0].resultQualityCheck.status, 'PASSED');

    await historySvc.deleteHistoryItem(job._id, userId, { deleteOriginalIfUnused: true });
    assert.equal(intermediateAsset.status, 'DELETED');
  });

  it('07. Step 2 failure preserves Step 1 COMPLETED state & outputAssetId while refunding full 2 credits', async () => {
    const userId = makeId();
    const creditLot = await TryOnCreditLot.create({ user: userId, lotType: 'purchased', initialAmount: 2, remainingAmount: 2, reservedAmount: 0, isActive: true, expiresAt: null });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 2 });

    const topProduct = await Product.create({ name: 'SILK BOWLING SHIRT', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/shirt.png' });
    const bottomProduct = await Product.create({ name: 'WOOL PLEATED TROUSERS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/pants.png' });
    await ProductIntelligence.create({ product: topProduct._id, taxonomy: { domain: 'clothing', subCategory: 'shirts', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, taxonomy: { domain: 'clothing', subCategory: 'pants', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });
    await TryOnProviderConfig.create({ providerId: 'mock-vto-fail2', isEnabled: true, categoryOverrides: { full_outfit: true, clothing: true } });

    const origPng = await createPatternPng({ width: 160, height: 240 });
    const step0Png = await createPatternPng({ width: 160, height: 240, rgbBase: [80, 140, 200] });
    const garmentPng = await createPatternPng({ width: 100, height: 100 });

    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId, type: 'person_photo', buffer: origPng });

    let callCount = 0;
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.providerId = 'mock-vto-fail2';
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async () => {
      callCount++;
      if (callCount === 1) return { resultBase64: step0Png.toString('base64'), mimeType: 'image/png', providerRequestId: 'req-s0', estimatedCostUsd: 0.06 };
      const err = new Error('Upstream AI error on step 2');
      err.code = 'STEP2_UPSTREAM_FAIL';
      err.statusCode = 502;
      throw err;
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.clear();
    registry.register(mockAdapter);
    const queueSvc = new TryOnQueueService({
      virtualTryOnService: new VirtualTryOnService({ registry, providerConfigService: new TryOnProviderConfigService() }),
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      fetchSafeRemoteImage: async () => ({ buffer: garmentPng, contentType: 'image/png' })
    });
    queueSvc.processNextJobs = async () => {};

    const job = await queueSvc.submitFullOutfitJob({
      userId,
      personImageAssetId: personAsset._id,
      items: [{ productId: topProduct._id }, { productId: bottomProduct._id }],
      idempotencyKey: 'fo-step2-fail'
    });

    await queueSvc.executeJob(job);

    assert.equal(job.status, 'FAILED');
    assert.equal(job.executionSteps[0].status, 'COMPLETED');
    assert.ok(job.executionSteps[0].outputAssetId, 'Step 1 completed intermediate asset should remain recorded');
    assert.equal(job.executionSteps[1].status, 'FAILED');
    assert.equal(creditLot.remainingAmount, 2);
    assert.equal(creditLot.reservedAmount, 0);
  });

  it('08. Crash recovery: mid-flight step -> RECONCILIATION_REQUIRED (no re-call); clean crash between Step 1 & Step 2 -> resumes Step 2 only', async () => {
    const userId = makeId();
    const creditLot = await TryOnCreditLot.create({ user: userId, lotType: 'purchased', initialAmount: 4, remainingAmount: 4, reservedAmount: 0, isActive: true, expiresAt: null });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 4 });

    const origPng = await createPatternPng({ width: 160, height: 240, rgbBase: [20, 40, 80] });
    const step0Png = await createPatternPng({ width: 160, height: 240, rgbBase: [60, 140, 210] });
    const step1Png = await createPatternPng({ width: 160, height: 240, rgbBase: [190, 90, 50] });
    const garmentPng = await createPatternPng({ width: 100, height: 100 });

    const mockStorage = createMemoryStorageDouble(stores.TryOnImageAsset);
    const personAsset = await mockStorage.saveImage({ userId, type: 'person_photo', buffer: origPng });
    const interAsset = await mockStorage.saveImage({ userId, type: 'tryon_intermediate', buffer: step0Png });

    const topProduct = await Product.create({ name: 'LOGO HOODIE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/hoodie.png' });
    const bottomProduct = await Product.create({ name: 'CARGO PANTS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/cargo.png' });
    await TryOnProviderConfig.create({ providerId: 'mock-vto-rec', isEnabled: true, categoryOverrides: { full_outfit: true, clothing: true } });

    const adapterCalls = [];
    const mockAdapter = new VertexVto001Adapter({ projectId: 'test-proj', location: 'us-central1', modelId: 'virtual-try-on-001' });
    mockAdapter.providerId = 'mock-vto-rec';
    mockAdapter.areCredentialsConfigured = () => true;
    mockAdapter.executeTryOn = async ({ personBase64 }) => {
      const personBuf = Buffer.from(personBase64, 'base64');
      adapterCalls.push({ isStep0Buffer: Buffer.compare(personBuf, step0Png) === 0 });
      return { resultBase64: step1Png.toString('base64'), mimeType: 'image/png', providerRequestId: 'req-resumed-1', estimatedCostUsd: 0.06 };
    };

    const registry = new TryOnProviderRegistry();
    registry.providers.clear();
    registry.register(mockAdapter);
    const queueSvc = new TryOnQueueService({
      virtualTryOnService: new VirtualTryOnService({ registry, providerConfigService: new TryOnProviderConfigService() }),
      tryOnStorageService: mockStorage,
      tryOnCreditService,
      fetchSafeRemoteImage: async () => ({ buffer: garmentPng, contentType: 'image/png' })
    });

    // Job A: Mid-flight crash while Step 2 already dispatched -> must go RECONCILIATION_REQUIRED
    const midJobId = makeId();
    const resA = await tryOnCreditService.reserveCredit(userId, midJobId, 2);
    const midJob = await TryOnJob.create({
      _id: midJobId,
      user: userId,
      personImageAsset: personAsset._id,
      product: bottomProduct._id,
      mode: 'FULL_OUTFIT',
      creditsCost: 2,
      creditLot: resA.lotId,
      creditReservations: resA.allocations.map(a => ({ lot: a.lotId, lotType: a.lotType, amount: a.amount })),
      status: 'PROCESSING',
      provider: 'mock-vto-rec',
      outfitItems: [
        { slot: 'BOTTOM', product: bottomProduct._id, productName: 'CARGO PANTS', productImageUrl: 'https://cdn.example.com/cargo.png', categoryKey: 'clothing', taxonomyDomain: 'clothing', taxonomySubCategory: 'pants' },
        { slot: 'TOP', product: topProduct._id, productName: 'LOGO HOODIE', productImageUrl: 'https://cdn.example.com/hoodie.png', categoryKey: 'clothing', taxonomyDomain: 'clothing', taxonomySubCategory: 'hoodies' }
      ],
      executionSteps: [
        { stepOrder: 0, slot: 'BOTTOM', product: bottomProduct._id, productName: 'CARGO PANTS', providerId: 'mock-vto-rec', status: 'COMPLETED', dispatchedAt: new Date(), outputAssetId: interAsset._id },
        { stepOrder: 1, slot: 'TOP', product: topProduct._id, productName: 'LOGO HOODIE', providerId: 'mock-vto-rec', status: 'PROCESSING', dispatchedAt: new Date(), providerRequestId: 'inflight-2' }
      ]
    });

    // Job B: Clean crash after Step 1 saved outputAssetId, before Step 2 dispatched
    const resumeJobId = makeId();
    const resB = await tryOnCreditService.reserveCredit(userId, resumeJobId, 2);
    const resumeJob = await TryOnJob.create({
      _id: resumeJobId,
      user: userId,
      personImageAsset: personAsset._id,
      product: bottomProduct._id,
      mode: 'FULL_OUTFIT',
      creditsCost: 2,
      creditLot: resB.lotId,
      creditReservations: resB.allocations.map(a => ({ lot: a.lotId, lotType: a.lotType, amount: a.amount })),
      status: 'PROCESSING',
      provider: 'mock-vto-rec',
      outfitItems: midJob.outfitItems,
      executionSteps: [
        { stepOrder: 0, slot: 'BOTTOM', product: bottomProduct._id, productName: 'CARGO PANTS', providerId: 'mock-vto-rec', status: 'COMPLETED', dispatchedAt: new Date(), outputAssetId: interAsset._id },
        { stepOrder: 1, slot: 'TOP', product: topProduct._id, productName: 'LOGO HOODIE', providerId: 'mock-vto-rec', status: 'PENDING', dispatchedAt: null }
      ]
    });

    const summary = await queueSvc.recoverStuckJobs();
    assert.equal(summary.movedToReconciliation, 1);
    assert.equal(summary.requeued, 1);
    assert.equal(midJob.status, 'RECONCILIATION_REQUIRED');
    assert.equal(resumeJob.status, 'QUEUED');

    // Resuming Job B must skip Step 0 and only invoke AI once (for Step 1 TOP) using Step 0 intermediate output!
    await queueSvc.executeJob(resumeJob);
    assert.equal(resumeJob.status, 'COMPLETED');
    assert.equal(adapterCalls.length, 1);
    assert.equal(adapterCalls[0].isStep0Buffer, true);
    assert.equal(creditLot.remainingAmount, 2);
  });

  it('09. POST /api/tryon/full-outfit/generate rejects gated benchmark & ignores client creditsCost override when enabled', async () => {
    const userId = makeId();
    await User.create({ _id: userId, name: 'Route Tester', email: 'route5@kdxx.test', role: 'user' });
    await TryOnCredit.create({ user: userId, membershipType: 'free', totalAvailableCredits: 3 });
    await TryOnCreditLot.create({ user: userId, lotType: 'free', initialAmount: 3, remainingAmount: 3, reservedAmount: 0, isActive: true, expiresAt: null });

    const topProduct = await Product.create({ name: 'AMIRI TEE', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/tee.png' });
    const bottomProduct = await Product.create({ name: 'AMIRI JEANS', brand: 'AMIRI', category: 'men', image: 'https://cdn.example.com/jeans.png' });
    await ProductIntelligence.create({ product: topProduct._id, taxonomy: { domain: 'clothing', subCategory: 't-shirts', filterGroup: 'tops' }, verificationStatus: 'VERIFIED' });
    await ProductIntelligence.create({ product: bottomProduct._id, taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }, verificationStatus: 'VERIFIED' });

    const asset = await TryOnImageAsset.create({ user: userId, type: 'person_photo', mimeType: 'image/png', status: 'ACTIVE', isDeleted: false, expiresAt: new Date(Date.now() + 72 * 3600 * 1000) });

    // Prevent singleton worker loop from actually executing AI during route test
    const origProcessNextJobs = singletonQueueService.processNextJobs;
    const prevProjectId = process.env.GCP_PROJECT_ID;
    process.env.GCP_PROJECT_ID = 'kdxx-test-proj';
    singletonQueueService.processNextJobs = async () => {};
    try {
      // 1) Default state: FULL_OUTFIT_PENDING_BENCHMARK -> 400
      const blockedResp = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: userId, role: 'user' },
        body: {
          personImageAssetId: String(asset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          creditsCost: 0
        }
      });
      assert.equal(blockedResp.statusCode, 400);
      assert.equal(blockedResp.body.code, 'FULL_OUTFIT_PENDING_BENCHMARK');

      // 2) Enable benchmark approval -> accepts and forces server creditsCost = 2 despite client sending 99/0
      await TryOnProviderConfig.create({
        providerId: 'google-vertex-vto-001',
        isEnabled: true,
        categoryOverrides: { full_outfit: true, clothing: true }
      });

      const okResp = await invokeRouterHandler(tryOnRoutes, 'post', '/full-outfit/generate', {
        user: { _id: userId, role: 'user' },
        body: {
          personImageAssetId: String(asset._id),
          items: [{ productId: String(topProduct._id) }, { productId: String(bottomProduct._id) }],
          creditsCost: 99,
          idempotencyKey: 'route-fo-1'
        }
      });
      assert.equal(okResp.statusCode, 200);
      assert.equal(okResp.body.data.mode, 'FULL_OUTFIT');
      assert.equal(okResp.body.data.creditsCost, 2);
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      singletonQueueService.processNextJobs = origProcessNextJobs;
      if (prevProjectId === undefined) delete process.env.GCP_PROJECT_ID;
      else process.env.GCP_PROJECT_ID = prevProjectId;
    }
  });
});
