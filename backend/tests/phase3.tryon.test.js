process.env.NODE_ENV = 'test';
process.env.TRYON_DISABLE_AUTO_WORKER = 'true';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const sharp = require('sharp');

const TryOnJob = require('../models/TryOnJob');
const TryOnImageAsset = require('../models/TryOnImageAsset');
const TryOnCronLock = require('../models/TryOnCronLock');
const Product = require('../models/Product');
const User = require('../models/User');

const tryOnStorageService = require('../services/tryOnStorageService');
const tryOnHistoryService = require('../services/tryOnHistoryService');
const { TryOnCleanupScheduler } = require('../services/tryOnCleanupScheduler');
const tryOnRoutes = require('../routes/tryOnRoutes');
const { getJwtSecret } = require('../utils/jwtConfig');

function makeId() {
  return new mongoose.Types.ObjectId();
}

function getNested(obj, keyPath) {
  if (!obj) return undefined;
  return keyPath.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

function setNested(obj, keyPath, val) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

function matchesQuery(doc, query = {}) {
  for (const [k, cond] of Object.entries(query)) {
    if (k === '$or') {
      if (!cond.some(sub => matchesQuery(doc, sub))) return false;
      continue;
    }
    const val = getNested(doc, k);
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !mongoose.Types.ObjectId.isValid(cond)) {
      if ('$in' in cond && !cond.$in.map(String).includes(String(val))) return false;
      if ('$ne' in cond && String(val) === String(cond.$ne)) return false;
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

function structuredCloneSafe(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(obj);
  if (Array.isArray(obj)) return obj.map(structuredCloneSafe);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = structuredCloneSafe(v);
  }
  return out;
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
      updateOne: Model.updateOne,
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
        ...defaults,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...structuredCloneSafe(payload)
      });
      await doc.save();
      return doc;
    };
    Model.updateOne = async (q = {}, update = {}, opts = {}) => {
      const existing = store.docs.find(d => matchesQuery(d, q));
      if (existing) {
        if (update.$set) for (const [k, v] of Object.entries(update.$set)) setNested(existing, k, v);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (opts.upsert) {
        const doc = store.wrap({
          createdAt: new Date(),
          updatedAt: new Date(),
          ...structuredCloneSafe(update.$setOnInsert || {}),
          ...structuredCloneSafe(update.$set || {})
        });
        await doc.save();
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    };
    Model.findOneAndUpdate = async (q, update = {}, opts = {}) => {
      const target = store.docs.find(d => matchesQuery(d, q));
      if (!target) return null;
      if (update.$set) for (const [k, v] of Object.entries(update.$set)) setNested(target, k, v);
      target.updatedAt = new Date();
      return target;
    };
    Model.countDocuments = async (q = {}) => store.docs.filter(d => matchesQuery(d, q)).length;

    return () => {
      for (const [k, fn] of Object.entries(originals)) {
        Model[k] = fn;
      }
    };
  }
}

async function createSamplePng(rgb = [30, 30, 30]) {
  return sharp({
    create: { width: 120, height: 160, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } }
  }).png().toBuffer();
}

function invokeRouter(router, method, routePath, { params = {}, query = {}, body = {}, headers = {} } = {}) {
  const layer = router.stack.find(
    l => l.route && l.route.path === routePath && l.route.methods[method.toLowerCase()]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  }
  const handlers = layer.route.stack.map(s => s.handle);

  return new Promise((resolve, reject) => {
    const req = {
      method: method.toUpperCase(),
      url: routePath,
      params,
      query,
      body,
      headers: { ...headers }
    };
    const resHeaders = {};
    let settled = false;
    const res = {
      statusCode: 200,
      setHeader(k, v) { resHeaders[String(k).toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        if (!settled) {
          settled = true;
          resolve({ statusCode: this.statusCode, headers: resHeaders, body: payload });
        }
        return this;
      },
      send(payload) {
        if (!settled) {
          settled = true;
          resolve({ statusCode: this.statusCode, headers: resHeaders, body: payload });
        }
        return this;
      }
    };

    let idx = 0;
    const next = (err) => {
      if (err) return reject(err);
      const fn = handlers[idx++];
      if (!fn) return;
      try {
        const ret = fn(req, res, next);
        if (ret && typeof ret.then === 'function') {
          ret.catch(reject);
        }
      } catch (syncErr) {
        reject(syncErr);
      }
    };
    next();
  });
}

describe('KD-XX Virtual Try-On Phase 3 — My Try-On History & 72h Image Retention', () => {
  let tmpStorageDir;
  let originalBaseDir;
  let restores = [];
  let stores = {};
  let userA;
  let userB;
  let authHeaderA;
  let authHeaderB;
  let origPng;
  let resultPng;

  before(async () => {
    tmpStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdxx-phase3-storage-'));
    originalBaseDir = tryOnStorageService.baseStorageDir;
    tryOnStorageService.baseStorageDir = tmpStorageDir;
    origPng = await createSamplePng([20, 40, 80]);
    resultPng = await createSamplePng([140, 60, 190]);
  });

  after(() => {
    tryOnStorageService.baseStorageDir = originalBaseDir;
    try {
      fs.rmSync(tmpStorageDir, { recursive: true, force: true });
    } catch (_) {}
  });

  beforeEach(async () => {
    stores = {
      TryOnJob: new InMemoryModelStub(['idempotencyKey'], () => ({
        creditsCost: 1,
        priority: 1,
        historyDeleted: false,
        historyDeletedAt: null,
        timing: { queuedAt: new Date() }
      })),
      TryOnImageAsset: new InMemoryModelStub([], () => ({ isDeleted: false })),
      TryOnCronLock: new InMemoryModelStub(['lockName']),
      Product: new InMemoryModelStub(),
      User: new InMemoryModelStub(['email'])
    };
    restores = [
      stores.TryOnJob.installOn(TryOnJob),
      stores.TryOnImageAsset.installOn(TryOnImageAsset),
      stores.TryOnCronLock.installOn(TryOnCronLock),
      stores.Product.installOn(Product),
      stores.User.installOn(User)
    ];

    userA = await User.create({ name: 'Client A', email: 'clienta@kdxx.test', role: 'user', password: 'x' });
    userB = await User.create({ name: 'Client B', email: 'clientb@kdxx.test', role: 'user', password: 'x' });
    authHeaderA = { authorization: `Bearer ${jwt.sign({ id: String(userA._id) }, getJwtSecret(), { expiresIn: '1h' })}` };
    authHeaderB = { authorization: `Bearer ${jwt.sign({ id: String(userB._id) }, getJwtSecret(), { expiresIn: '1h' })}` };
  });

  afterEach(() => {
    restores.forEach(fn => fn());
  });

  async function seedJob({ owner, status = 'COMPLETED', ageMs = 0, name = 'BONES DOWN JACKET', sku = 'AMOUDO1005-BLK', color = 'Black', subCategory = 'jackets' }) {
    const createdAt = new Date(Date.now() - ageMs);
    const expiresAt = new Date(createdAt.getTime() + 72 * 60 * 60 * 1000);

    const origAsset = await tryOnStorageService.saveImage({
      userId: owner._id,
      buffer: origPng,
      mimeType: 'image/png',
      type: 'user_upload',
      originalFilename: 'person.png'
    });
    origAsset.createdAt = createdAt;
    origAsset.expiresAt = expiresAt;
    await origAsset.save();

    let resAsset = null;
    if (status === 'COMPLETED') {
      resAsset = await tryOnStorageService.saveImage({
        userId: owner._id,
        buffer: resultPng,
        mimeType: 'image/png',
        type: 'tryon_result',
        originalFilename: 'result.png'
      });
      resAsset.createdAt = createdAt;
      resAsset.expiresAt = expiresAt;
      await resAsset.save();
    }

    const prod = await Product.create({
      name,
      sku,
      brand: 'AMIRI',
      category: 'men',
      price: 2500,
      image: 'https://amiri.com/item.jpg'
    });

    const job = await TryOnJob.create({
      user: owner._id,
      status,
      personImageAsset: origAsset._id,
      resultImageAsset: resAsset ? resAsset._id : null,
      product: prod._id,
      productImageUrl: 'https://amiri.com/item.jpg',
      productName: name,
      createdAt,
      timing: {
        queuedAt: createdAt,
        startedAt: createdAt,
        completedAt: status === 'QUEUED' ? null : createdAt,
        durationMs: status === 'COMPLETED' ? 4200 : 0
      },
      reconciliation: status === 'RECONCILIATION_REQUIRED'
        ? { state: 'AI_TIMEOUT_UNVERIFIED', requiresManualAdmin: true, reason: 'Timeout' }
        : { state: 'NONE', requiresManualAdmin: false },
      errorMessage: status === 'CANCELLED' ? 'Người dùng đã hủy phiên thử đồ' : '',
      productSnapshot: {
        productId: prod._id,
        sku,
        brand: 'AMIRI',
        productName: name,
        catalogCategory: 'men',
        normalizedDomain: 'clothing',
        normalizedSubCategory: subCategory,
        variantSku: sku,
        variantColor: color,
        variantSize: 'L',
        imageUrlUsed: 'https://amiri.com/item.jpg',
        verificationStatus: 'VERIFIED',
        confidenceScore: 0.95,
        sourceTypesUsed: ['official_brand'],
        contextGeneratedAt: createdAt
      }
    });

    return { job, origAsset, resAsset, prod };
  }

  it('1 & 2. User A sees only own history and is strictly blocked (403) from accessing/deleting User B history & assets', async () => {
    const jobA = await seedJob({ owner: userA, name: 'Jacket Of A', sku: 'SKU-A1' });
    const jobB = await seedJob({ owner: userB, name: 'Secret Jacket Of B', sku: 'SKU-B1' });

    // Even if User A spoofs query userId=userB, backend strictly scopes by req.user._id
    const resListA = await invokeRouter(tryOnRoutes, 'get', '/history', {
      headers: authHeaderA,
      query: { userId: String(userB._id) }
    });
    assert.equal(resListA.statusCode, 200);
    assert.equal(resListA.body.data.length, 1);
    assert.equal(resListA.body.data[0].productSnapshot.productName, 'Jacket Of A');

    // Cross-user history detail -> 403
    const crossDetail = await invokeRouter(tryOnRoutes, 'get', '/history/:id', {
      headers: authHeaderA,
      params: { id: String(jobB.job._id) }
    });
    assert.equal(crossDetail.statusCode, 403);

    // Cross-user original & result private image endpoints -> 403
    const crossOrig = await invokeRouter(tryOnRoutes, 'get', '/history/:id/original-image', {
      headers: authHeaderA,
      params: { id: String(jobB.job._id) }
    });
    assert.equal(crossOrig.statusCode, 403);

    const crossRes = await invokeRouter(tryOnRoutes, 'get', '/history/:id/result-image', {
      headers: authHeaderA,
      params: { id: String(jobB.job._id) }
    });
    assert.equal(crossRes.statusCode, 403);

    // Cross-user delete history/assets -> 403, User B data stays intact
    const crossDel = await invokeRouter(tryOnRoutes, 'delete', '/history/:id', {
      headers: authHeaderA,
      params: { id: String(jobB.job._id) }
    });
    assert.equal(crossDel.statusCode, 403);

    const crossDelAsset = await invokeRouter(tryOnRoutes, 'delete', '/assets/:id', {
      headers: authHeaderA,
      params: { id: String(jobB.resAsset._id) }
    });
    assert.equal(crossDelAsset.statusCode, 403);
    assert.equal((await TryOnJob.findById(jobB.job._id)).historyDeleted, false);
    assert.equal(fs.existsSync(jobB.resAsset.storagePath), true);
  });

  it('3. History displays immutable productSnapshot even if live Product catalog changes later', async () => {
    const { prod, job } = await seedJob({
      owner: userA,
      name: 'ORIGINAL BANDANA JACKET',
      sku: 'AM-ORIG-001',
      color: 'Obsidian Black'
    });

    // Mutate current catalog product after try-on job was created
    prod.name = 'RENAMED NEW SEASON JACKET';
    prod.sku = 'AM-NEW-999';
    prod.brand = 'OTHER BRAND';
    await prod.save();

    const detail = await invokeRouter(tryOnRoutes, 'get', '/history/:id', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.data.productSnapshot.productName, 'ORIGINAL BANDANA JACKET');
    assert.equal(detail.body.data.productSnapshot.sku, 'AM-ORIG-001');
    assert.equal(detail.body.data.productSnapshot.variantColor, 'Obsidian Black');
    assert.equal(detail.body.data.productSnapshot.brand, 'AMIRI');
  });

  it('4 & 5. Original & result private images stream cleanly via private endpoints and signed URLs without extending 72h expiry', async () => {
    const { job, origAsset, resAsset } = await seedJob({ owner: userA });
    const initialOrigExp = new Date(origAsset.expiresAt).getTime();
    const initialResExp = new Date(resAsset.expiresAt).getTime();

    // Strict 72h cap check
    assert.ok(initialOrigExp - new Date(origAsset.createdAt).getTime() <= 72 * 60 * 60 * 1000);
    assert.ok(initialResExp - new Date(resAsset.createdAt).getTime() <= 72 * 60 * 60 * 1000);

    const detail = await invokeRouter(tryOnRoutes, 'get', '/history/:id', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(detail.statusCode, 200);
    assert.ok(detail.body.data.originalPreviewUrl.startsWith('/api/tryon/images/'));
    assert.ok(detail.body.data.resultPreviewUrl.startsWith('/api/tryon/images/'));
    assert.ok(detail.body.data.remainingMs > 0);

    // Private streaming endpoints
    const origStream = await invokeRouter(tryOnRoutes, 'get', '/history/:id/original-image', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(origStream.statusCode, 200);
    assert.equal(origStream.headers['cache-control'], 'private, no-store');
    assert.equal(Buffer.compare(origStream.body, origPng), 0);

    const resStream = await invokeRouter(tryOnRoutes, 'get', '/history/:id/result-image', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(resStream.statusCode, 200);
    assert.equal(Buffer.compare(resStream.body, resultPng), 0);

    // Signed URL token streaming also works
    const token = detail.body.data.resultPreviewUrl.split('/').pop();
    const tokenStream = await invokeRouter(tryOnRoutes, 'get', '/images/:token', {
      params: { token }
    });
    assert.equal(tokenStream.statusCode, 200);
    assert.equal(Buffer.compare(tokenStream.body, resultPng), 0);

    // Expiry timestamp must NEVER be extended when viewed
    assert.equal(new Date((await TryOnImageAsset.findById(origAsset._id)).expiresAt).getTime(), initialOrigExp);
    assert.equal(new Date((await TryOnImageAsset.findById(resAsset._id)).expiresAt).getTime(), initialResExp);
  });

  it('6, 7 & 11. Early deletion of original image, result image, and deleted-asset access rejection', async () => {
    const { job, origAsset, resAsset } = await seedJob({ owner: userA });
    const beforeDetail = await invokeRouter(tryOnRoutes, 'get', '/history/:id', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    const oldResultToken = beforeDetail.body.data.resultPreviewUrl.split('/').pop();

    // Delete original image early
    const delOrig = await invokeRouter(tryOnRoutes, 'delete', '/history/:id/original-image', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(delOrig.statusCode, 200);
    assert.equal(delOrig.body.data.deleted, true);
    assert.equal(fs.existsSync(origAsset.storagePath), false);

    // Original streaming now returns 404, while result still works
    const afterDelOrig = await invokeRouter(tryOnRoutes, 'get', '/history/:id/original-image', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(afterDelOrig.statusCode, 404);
    assert.equal((await invokeRouter(tryOnRoutes, 'get', '/history/:id/result-image', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    })).statusCode, 200);

    // Delete result image early
    const delRes = await invokeRouter(tryOnRoutes, 'delete', '/history/:id/result-image', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(delRes.statusCode, 200);
    assert.equal(fs.existsSync(resAsset.storagePath), false);

    // Old signed token and detail response never expose deleted image
    const staleTokenRes = await invokeRouter(tryOnRoutes, 'get', '/images/:token', {
      params: { token: oldResultToken }
    });
    assert.equal(staleTokenRes.statusCode, 404);

    const afterDetail = await invokeRouter(tryOnRoutes, 'get', '/history/:id', {
      headers: authHeaderA,
      params: { id: String(job._id) }
    });
    assert.equal(afterDetail.body.data.originalPreviewUrl, null);
    assert.equal(afterDetail.body.data.resultPreviewUrl, null);
    assert.equal(afterDetail.body.data.originalImage.status, 'DELETED');
    assert.equal(afterDetail.body.data.resultImage.status, 'DELETED');
  });

  it('8. Delete all history wipes all User A jobs & files immediately while preserving User B', async () => {
    const a1 = await seedJob({ owner: userA, name: 'Item A1' });
    const a2 = await seedJob({ owner: userA, name: 'Item A2', status: 'FAILED' });
    const b1 = await seedJob({ owner: userB, name: 'Item B1' });

    const clearAll = await invokeRouter(tryOnRoutes, 'delete', '/history', {
      headers: authHeaderA
    });
    assert.equal(clearAll.statusCode, 200);
    assert.equal(clearAll.body.data.clearedJobsCount, 2);

    // All files of User A removed
    assert.equal(fs.existsSync(a1.origAsset.storagePath), false);
    assert.equal(fs.existsSync(a1.resAsset.storagePath), false);
    assert.equal(fs.existsSync(a2.origAsset.storagePath), false);

    // User A list is now empty
    const listA = await invokeRouter(tryOnRoutes, 'get', '/history', { headers: authHeaderA });
    assert.equal(listA.body.data.length, 0);

    // User B files and history are 100% untouched
    assert.equal(fs.existsSync(b1.origAsset.storagePath), true);
    assert.equal(fs.existsSync(b1.resAsset.storagePath), true);
    const listB = await invokeRouter(tryOnRoutes, 'get', '/history', { headers: authHeaderB });
    assert.equal(listB.body.data.length, 1);
  });

  it('9 & 10. Expired (>72h) images & expired signed URLs are blocked and labeled EXPIRED cleanly', async () => {
    // 73 hours old job/assets -> expired before scheduler even runs
    const old = await seedJob({
      owner: userA,
      ageMs: 73 * 60 * 60 * 1000,
      name: 'Expired Bomber'
    });

    // Directly test expired signed token rejection
    const expiredToken = tryOnStorageService.generateSignedToken(String(old.resAsset._id), String(userA._id), -30);
    const expTokenRes = await invokeRouter(tryOnRoutes, 'get', '/images/:token', {
      params: { token: expiredToken }
    });
    assert.equal(expTokenRes.statusCode, 403);

    // issueSignedUrlIfValid must return null on expired asset
    assert.equal(await tryOnStorageService.issueSignedUrlIfValid(old.resAsset._id, userA._id, 1800), null);

    // History lists item cleanly as EXPIRED with null URLs (no fake image)
    const histRes = await invokeRouter(tryOnRoutes, 'get', '/history', {
      headers: authHeaderA,
      query: { status: 'EXPIRED' }
    });
    assert.equal(histRes.statusCode, 200);
    assert.equal(histRes.body.data.length, 1);
    assert.equal(histRes.body.data[0].displayStatus, 'EXPIRED');
    assert.equal(histRes.body.data[0].originalPreviewUrl, null);
    assert.equal(histRes.body.data[0].resultPreviewUrl, null);

    // Private endpoints block expired assets with 404
    const getExpOrig = await invokeRouter(tryOnRoutes, 'get', '/history/:id/original-image', {
      headers: authHeaderA,
      params: { id: String(old.job._id) }
    });
    assert.equal(getExpOrig.statusCode, 404);
    assert.equal(getExpOrig.body.code, 'ASSET_EXPIRED');
  });

  it('12. Cleanup after server restart purges expired files idempotently while keeping EXPIRED metadata & fresh files', async () => {
    const expired = await seedJob({ owner: userA, ageMs: 74 * 60 * 60 * 1000, name: 'Old 74h Item' });
    const fresh = await seedJob({ owner: userA, ageMs: 1 * 60 * 60 * 1000, name: 'Fresh 1h Item' });

    assert.equal(fs.existsSync(expired.origAsset.storagePath), true);
    assert.equal(fs.existsSync(expired.resAsset.storagePath), true);

    // Simulate booting a fresh scheduler after server restart
    const schedulerAfterRestart = new TryOnCleanupScheduler({ initialDelayMs: 5 });
    const sweep1 = await schedulerAfterRestart.runSweep('post_restart_boot');
    assert.equal(sweep1.success, true);
    assert.equal(sweep1.deletedCount, 2);

    // Expired files deleted from disk; fresh files untouched
    assert.equal(fs.existsSync(expired.origAsset.storagePath), false);
    assert.equal(fs.existsSync(expired.resAsset.storagePath), false);
    assert.equal(fs.existsSync(fresh.origAsset.storagePath), true);
    assert.equal(fs.existsSync(fresh.resAsset.storagePath), true);

    // Second sweep is strictly idempotent
    const sweep2 = await schedulerAfterRestart.runSweep('idempotent_repeat');
    assert.equal(sweep2.deletedCount, 0);

    // History still retains EXPIRED job metadata after file purge
    const histRes = await invokeRouter(tryOnRoutes, 'get', '/history', { headers: authHeaderA });
    assert.equal(histRes.body.data.length, 2);
    const expCard = histRes.body.data.find(d => d.jobId === String(expired.job._id));
    assert.equal(expCard.displayStatus, 'EXPIRED');
    assert.equal(expCard.resultPreviewUrl, null);
    assert.equal(expCard.originalPreviewUrl, null);
    schedulerAfterRestart.stop();
  });

  it('13, 14 & 15. RECONCILIATION_REQUIRED, CANCELLED states & pagination + search work cleanly', async () => {
    await seedJob({ owner: userA, status: 'RECONCILIATION_REQUIRED', name: 'Amiri Varsity', sku: 'AM-REC-01', ageMs: 1000 });
    await seedJob({ owner: userA, status: 'CANCELLED', name: 'Silk Shirt Cancelled', sku: 'AM-CAN-02', ageMs: 2000 });
    await seedJob({ owner: userA, status: 'COMPLETED', name: 'Denim Jeans 1', sku: 'AM-DNM-03', ageMs: 3000 });
    await seedJob({ owner: userA, status: 'COMPLETED', name: 'Denim Jeans 2', sku: 'AM-DNM-04', ageMs: 4000 });

    // Status filter: RECONCILIATION_REQUIRED
    const recRes = await invokeRouter(tryOnRoutes, 'get', '/history', {
      headers: authHeaderA,
      query: { status: 'RECONCILIATION_REQUIRED' }
    });
    assert.equal(recRes.body.data.length, 1);
    assert.equal(recRes.body.data[0].displayStatus, 'RECONCILIATION_REQUIRED');
    assert.equal(recRes.body.data[0].resultPreviewUrl, null);

    // Status filter: CANCELLED
    const canRes = await invokeRouter(tryOnRoutes, 'get', '/history', {
      headers: authHeaderA,
      query: { status: 'CANCELLED' }
    });
    assert.equal(canRes.body.data.length, 1);
    assert.equal(canRes.body.data[0].displayStatus, 'CANCELLED');
    assert.equal(canRes.body.data[0].resultPreviewUrl, null);

    // Pagination limit=2, page 1 & page 2
    const p1 = await invokeRouter(tryOnRoutes, 'get', '/history', {
      headers: authHeaderA,
      query: { page: '1', limit: '2' }
    });
    assert.equal(p1.body.data.length, 2);
    assert.equal(p1.body.pagination.total, 4);
    assert.equal(p1.body.pagination.totalPages, 2);
    assert.equal(p1.body.pagination.hasMore, true);

    const p2 = await invokeRouter(tryOnRoutes, 'get', '/history', {
      headers: authHeaderA,
      query: { page: '2', limit: '2' }
    });
    assert.equal(p2.body.data.length, 2);
    assert.equal(p2.body.pagination.hasMore, false);
    assert.notEqual(p1.body.data[0].jobId, p2.body.data[0].jobId);

    // Search by SKU
    const searchRes = await invokeRouter(tryOnRoutes, 'get', '/jobs', {
      headers: authHeaderA,
      query: { search: 'AM-DNM-03' }
    });
    assert.equal(searchRes.body.data.length, 1);
    assert.equal(searchRes.body.data[0].productSnapshot.productName, 'Denim Jeans 1');
  });
});
