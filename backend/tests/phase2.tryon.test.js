process.env.NODE_ENV = 'test';
process.env.TRYON_DISABLE_AUTO_WORKER = 'true';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const sharp = require('sharp');

const Product = require('../models/Product');
const ProductIntelligence = require('../models/ProductIntelligence');
const TryOnJob = require('../models/TryOnJob');
const TryOnImageAsset = require('../models/TryOnImageAsset');
const TryOnCredit = require('../models/TryOnCredit');
const TryOnCreditLot = require('../models/TryOnCreditLot');
const TryOnCreditLedger = require('../models/TryOnCreditLedger');
const User = require('../models/User');

const categoryTaxonomyService = require('../services/categoryTaxonomyService');
const productSourceService = require('../services/productSourceService');
const productImageIntelligenceService = require('../services/productImageIntelligenceService');
const productIntelligenceService = require('../services/productIntelligenceService');
const aiProductContextService = require('../services/aiProductContextService');
const VertexVto001Adapter = require('../services/providers/VertexVto001Adapter');
const GeminiImageEditAdapter = require('../services/providers/GeminiImageEditAdapter');
const tryOnStorageService = require('../services/tryOnStorageService');
const { TryOnQueueService } = require('../services/tryOnQueueService');
const { getProducts, getProductById, getProductTags } = require('../controllers/productController');
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
    Model.findOneAndUpdate = async (q, update = {}, opts = {}) => {
      const candidates = store.docs.filter(d => matchesQuery(d, q));
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
      if (update.$set) for (const [k, v] of Object.entries(update.$set)) setNested(target, k, v);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          setNested(target, k, Number(getNested(target, k) || 0) + v);
        }
      }
      await target.save();
      return target;
    };
    Model.countDocuments = async (q = {}) => store.docs.filter(d => matchesQuery(d, q)).length;
    return () => Object.assign(Model, originals);
  }
}

async function createGarmentTestPng({ width = 120, height = 160, fg = [20, 20, 24], bg = [248, 248, 248] } = {}) {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inBox = x >= 25 && x < width - 25 && y >= 20 && y < height - 20;
      const idx = (y * width + x) * 3;
      const col = inBox ? fg : bg;
      buf[idx] = col[0];
      buf[idx + 1] = col[1];
      buf[idx + 2] = col[2];
    }
  }
  return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function invokeRouterHandler(router, method, routePath, { body = {}, query = {}, params = {}, user = null } = {}) {
  return new Promise((resolve, reject) => {
    const layer = router.stack.find(
      l => l.route && l.route.path === routePath && l.route.methods[method.toLowerCase()]
    );
    if (!layer) return reject(new Error(`Route ${method} ${routePath} not found`));
    const handlers = layer.route.stack.map(s => s.handle);
    const handler = handlers[handlers.length - 1];
    const req = { body, query, params, user, headers: {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ statusCode: this.statusCode, body: payload }); return this; }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

describe('KD-XX Virtual Try-On Phase 2 — Product Intelligence & Catalog Integration', () => {
  let restores = [];
  let stores = {};
  let tmpStorageDir;
  let originalBaseDir;
  let localServer;
  let localPort;
  let validGarmentPng;
  let largeNoiseBuffer;

  before(async () => {
    tmpStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kdxx-phase2-storage-'));
    originalBaseDir = tryOnStorageService.baseStorageDir;
    tryOnStorageService.baseStorageDir = tmpStorageDir;
    validGarmentPng = await createGarmentTestPng({ fg: [20, 20, 25], bg: [248, 248, 248] });
    largeNoiseBuffer = Buffer.alloc(500 * 1024, 0xaa);

    localServer = http.createServer((req, res) => {
      if (req.url === '/official/bones-jacket.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          sku: 'AMOUDO1005-001',
          brand: 'AMIRI',
          name: 'BONES DOWN JACKET',
          color: 'Black',
          material: '100% Nylon Shell / Goose Down Fill',
          fit: 'Relaxed Cropped',
          shape: 'Puffer Down Jacket',
          pattern: 'Applique Bones',
          logoPosition: 'Left Chest',
          visualDetails: ['Leather bone appliques along sleeves', 'Stand collar'],
          images: [`http://official-brand.test:${localPort}/assets/jacket-valid.png`]
        }));
      }

      if (req.url === '/official/amiri-page.html') {
        const htmlWithJsonLd = `<!doctype html><html><head>
          <script type="application/ld+json">${JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: 'BONES DOWN JACKET',
            sku: 'AMOUDO1005-001',
            brand: { '@type': 'Brand', name: 'AMIRI' },
            color: 'Black',
            material: 'Italian Nylon',
            image: [`http://official-brand.test:${localPort}/assets/jacket-valid.png`]
          })}</script>
        </head><body><h1>Secret internal raw HTML tag should never reach AI</h1></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(htmlWithJsonLd);
      }

      if (req.url === '/retailer/bomber-match.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          sku: 'MK-M32MJ121',
          brand: 'Moose Knuckles',
          name: 'Moose Knuckles Original Ballistic Bomber',
          color: 'Black',
          material: 'Cotton/Nylon Water-Repellent Blend',
          fit: 'Regular Fit',
          images: [`http://trusted-retailer.test:${localPort}/assets/jacket-valid.png`]
        }));
      }

      if (req.url === '/retailer/bomber-conflict.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          sku: 'MK-M32MJ121',
          brand: 'Moose Knuckles',
          name: 'Moose Knuckles Original Ballistic Bomber',
          color: 'Black',
          material: '100% Faux Polyester',
          images: [`http://trusted-retailer.test:${localPort}/assets/jacket-valid.png`]
        }));
      }

      if (req.url === '/official/same-name-different-sku.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          sku: 'AMOUDO9999-999',
          brand: 'AMIRI',
          name: 'BONES DOWN JACKET',
          color: 'Black',
          material: 'Lambskin'
        }));
      }

      if (req.url === '/official/different-color.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          sku: 'AMOUDO1005-001',
          brand: 'AMIRI',
          name: 'BONES DOWN JACKET',
          color: 'Crimson Red',
          material: 'Velvet'
        }));
      }

      if (req.url === '/official/captcha-blocked') {
        res.writeHead(403, { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' });
        return res.end('<html><body>Verify you are human captcha</body></html>');
      }

      if (req.url === '/official/server-down') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end('{"error":"upstream unavailable"}');
      }

      if (req.url === '/official/redirect-trap') {
        res.writeHead(302, { Location: 'http://127.0.0.1/internal' });
        return res.end();
      }

      if (req.url === '/assets/jacket-valid.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': validGarmentPng.length });
        return res.end(validGarmentPng);
      }

      if (req.url === '/assets/wrong-mime.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html><body>not an image</body></html>');
      }

      if (req.url === '/assets/oversized.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': largeNoiseBuffer.length });
        return res.end(largeNoiseBuffer);
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise(resolve => localServer.listen(0, '127.0.0.1', resolve));
    localPort = localServer.address().port;
  });

  after(() => {
    tryOnStorageService.baseStorageDir = originalBaseDir;
    localServer?.close();
    try {
      fs.rmSync(tmpStorageDir, { recursive: true, force: true });
    } catch (_) {}
  });

  beforeEach(() => {
    productSourceService.cache.clear();
    productSourceService.domainRequests.clear();
    stores = {
      Product: new InMemoryModelStub([], () => ({ isActive: true })),
      ProductIntelligence: new InMemoryModelStub(['product']),
      TryOnJob: new InMemoryModelStub(['idempotencyKey'], () => ({ creditsCost: 1, priority: 1, timing: { queuedAt: new Date() } })),
      TryOnImageAsset: new InMemoryModelStub([], () => ({ isDeleted: false })),
      TryOnCredit: new InMemoryModelStub(['user']),
      TryOnCreditLot: new InMemoryModelStub([], () => ({ reservedAmount: 0, isActive: true })),
      TryOnCreditLedger: new InMemoryModelStub(['idempotencyKey']),
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
      stores.User.installOn(User)
    ];
  });

  afterEach(() => {
    restores.forEach(fn => fn());
  });

  const loopbackOpts = {
    allowHttpForTest: true,
    transport: http,
    dnsLookup: (host, opts, cb) => cb(null, '127.0.0.1', 4),
    extraOfficialHosts: ['official-brand.test'],
    extraRetailerHosts: ['trusted-retailer.test'],
    extraAllowedHosts: ['official-brand.test', 'trusted-retailer.test']
  };

  function getSafeTestServerAgent() {
    return new http.Agent({
      lookup: (_host, opts, cb) => {
        if (opts && opts.all) return cb(null, [{ address: '127.0.0.1', family: 4 }]);
        return cb(null, '127.0.0.1', 4);
      }
    });
  }

  it('1 & 6. Full-data product + Official brand match (JSON-LD strips HTML) reaches VERIFIED with high confidence', async () => {
    const product = await Product.create({
      name: 'BONES DOWN JACKET',
      sku: 'AMOUDO1005-001',
      brand: 'AMIRI',
      category: 'men',
      tags: ['Jackets', 'Outerwear'],
      colors: ['Black'],
      images: [`http://official-brand.test:${localPort}/assets/jacket-valid.png`],
      image: `http://official-brand.test:${localPort}/assets/jacket-valid.png`
    });

    const res = await productIntelligenceService.ingestExternalSource(
      product._id,
      `http://official-brand.test:${localPort}/official/amiri-page.html`,
      { ...loopbackOpts, agent: getSafeTestServerAgent() }
    );

    assert.equal(res.matchResult.productMatchingStatus, 'EXACT_SKU_MATCH');
    assert.equal(res.record.verificationStatus, 'VERIFIED');
    assert.ok(res.record.confidenceScore >= 0.85);
    assert.equal(res.record.attributes.material.value, 'Italian Nylon');
    assert.equal(res.record.normalizedCategory.subCategory, 'jackets');
    assert.equal(res.record.normalizedCategory.domain, 'clothing');
    assert.equal(JSON.stringify(res.record).includes('Secret internal raw HTML tag'), false);
  });

  it('2 & 14. Product missing SKU stays UNVERIFIED / never fabricates SKU or material from pixels', async () => {
    const prodNoSku = await Product.create({
      name: 'WOMEN\'S MA LONG SLEEVE MINI DRESS',
      brand: 'AMIRI',
      category: 'women',
      tags: ['Dresses'],
      colors: [],
      description: 'Váy body AMIRI 2026',
      image: `http://official-brand.test:${localPort}/assets/jacket-valid.png`,
      images: [`http://official-brand.test:${localPort}/assets/jacket-valid.png`]
    });

    const { record } = await productIntelligenceService.analyzeProductImages(prodNoSku._id, {
      ...loopbackOpts,
      agent: getSafeTestServerAgent()
    });

    assert.equal(record.variantInformation.skuMissing, true);
    assert.equal(record.flags.missingData, true);
    assert.notEqual(record.verificationStatus, 'VERIFIED');
    assert.equal(record.attributes.material.value, ''); // Never guessed from pixels!
    assert.equal(record.productImages[0].visualExtract.inferredMaterial, null);
    assert.equal(record.productImages[0].visualExtract.logoLocation, null);
    assert.equal(record.productImages[0].visualExtract.dominantColorName, 'Black');

    // External match with same name when KD-XX SKU is missing remains UNVERIFIED (does not blindly promote)
    const extRes = await productIntelligenceService.ingestExternalSource(
      prodNoSku._id,
      `http://official-brand.test:${localPort}/official/same-name-different-sku.json`,
      { ...loopbackOpts, agent: getSafeTestServerAgent() }
    );
    assert.equal(extRes.matchResult.skuMatch, false);
    assert.notEqual(extRes.record.verificationStatus, 'VERIFIED');
  });

  it('3 & 4. Multi-variant product selects right color/SKU variant and rejects cross-color mismatch', async () => {
    const prod = await Product.create({
      name: 'BONES DOWN JACKET',
      sku: 'AMOUDO1005',
      brand: 'AMIRI',
      category: 'men',
      colors: ['Black', 'White'],
      variants: [
        { sku: 'AMOUDO1005-BLK', color: 'Black', imageUrl: 'https://amiri.com/black.jpg' },
        { sku: 'AMOUDO1005-WHT', color: 'White', imageUrl: 'https://amiri.com/white.jpg' }
      ],
      image: 'https://amiri.com/black.jpg',
      images: ['https://amiri.com/black.jpg', 'https://amiri.com/white.jpg']
    });

    const intel = await productIntelligenceService.ensureBaselineForProduct(prod);
    assert.equal(intel.variantInformation.hasMultipleVariants, true);

    const ctxWhite = aiProductContextService.buildProductContext({
      product: prod,
      intelligence: intel,
      selectedVariant: { color: 'White' }
    });
    assert.equal(ctxWhite.variant.selectedSku, 'AMOUDO1005-WHT');
    assert.equal(ctxWhite.productImageReferences.primaryImageUrl, 'https://amiri.com/white.jpg');

    // Different color not in variants must be rejected
    assert.throws(
      () => aiProductContextService.buildProductContext({
        product: prod,
        intelligence: intel,
        selectedVariant: { sku: 'AMOUDO1005-BLK', color: 'Red' }
      }),
      err => err.code === 'VARIANT_COLOR_MISMATCH'
    );

    // External source with different color must NOT merge into single-color product
    const singleColorProd = await Product.create({
      name: 'BONES DOWN JACKET',
      sku: 'AMOUDO1005-001',
      brand: 'AMIRI',
      category: 'men',
      colors: ['Black'],
      image: `http://official-brand.test:${localPort}/assets/jacket-valid.png`,
      images: [`http://official-brand.test:${localPort}/assets/jacket-valid.png`]
    });
    const diffColorIngest = await productIntelligenceService.ingestExternalSource(
      singleColorProd._id,
      `http://official-brand.test:${localPort}/official/different-color.json`,
      { ...loopbackOpts, agent: getSafeTestServerAgent() }
    );
    assert.equal(diffColorIngest.matchResult.productMatchingStatus, 'COLOR_MISMATCH');
    assert.equal(diffColorIngest.record.verificationStatus, 'CONFLICT');
    assert.notEqual(diffColorIngest.record.attributes.material.value, 'Velvet');
  });

  it('5. Same product name with different SKU is flagged SKU_MISMATCH and NEVER merged', async () => {
    const prod = await Product.create({
      name: 'BONES DOWN JACKET',
      sku: 'AMOUDO1005-001',
      brand: 'AMIRI',
      category: 'men',
      colors: ['Black'],
      image: 'https://amiri.com/jacket.jpg',
      images: ['https://amiri.com/jacket.jpg']
    });

    const ingest = await productIntelligenceService.ingestExternalSource(
      prod._id,
      `http://official-brand.test:${localPort}/official/same-name-different-sku.json`,
      { ...loopbackOpts, agent: getSafeTestServerAgent() }
    );

    assert.equal(ingest.matchResult.productMatchingStatus, 'SKU_MISMATCH');
    assert.equal(ingest.matchResult.skuMatch, false);
    assert.equal(ingest.record.verificationStatus, 'CONFLICT');
    assert.equal(ingest.record.flags.skuVariantMismatch, true);
    assert.equal(ingest.record.attributes.material.value, '');
  });

  it('7 & 8. Trusted retailer source matches clean SKU and detects cross-source material conflict', async () => {
    const bomber = await Product.create({
      name: 'Moose Knuckles Original Ballistic Bomber',
      sku: 'MK-M32MJ121',
      brand: 'Moose Knuckles',
      category: 'men',
      tags: ['Jackets', 'Outerwear'],
      colors: ['Black'],
      image: `http://trusted-retailer.test:${localPort}/assets/jacket-valid.png`,
      images: [`http://trusted-retailer.test:${localPort}/assets/jacket-valid.png`]
    });

    const matchRes = await productIntelligenceService.ingestExternalSource(
      bomber._id,
      `http://trusted-retailer.test:${localPort}/retailer/bomber-match.json`,
      { ...loopbackOpts, agent: getSafeTestServerAgent() }
    );
    assert.equal(matchRes.sourceRecord.sourceType, 'trusted_retailer');
    assert.equal(matchRes.matchResult.productMatchingStatus, 'EXACT_SKU_MATCH');
    assert.equal(matchRes.record.verificationStatus, 'VERIFIED');
    assert.equal(matchRes.record.attributes.material.value, 'Cotton/Nylon Water-Repellent Blend');

    // Second source disagrees on material -> triggers CONFLICT & flags.hasConflicts
    const conflictRes = await productIntelligenceService.ingestExternalSource(
      bomber._id,
      `http://trusted-retailer.test:${localPort}/retailer/bomber-conflict.json`,
      { ...loopbackOpts, agent: getSafeTestServerAgent() }
    );
    assert.equal(conflictRes.record.verificationStatus, 'CONFLICT');
    assert.equal(conflictRes.record.flags.hasConflicts, true);
    assert.ok(conflictRes.record.conflicts.some(c => c.field === 'material' && !c.resolved));
  });

  it('9. Unreachable source or CAPTCHA/anti-bot block records failure safely without losing KD-XX/Admin data', async () => {
    const prod = await Product.create({
      name: 'CLASSIC MA SUNGLASSES',
      sku: 'AMIR-EYE-01',
      brand: 'AMIRI',
      category: 'accessories',
      tags: ['Sunglasses', 'Eyewear'],
      image: 'https://amiri.com/sunglasses.jpg',
      images: ['https://amiri.com/sunglasses.jpg']
    });

    await assert.rejects(
      () => productIntelligenceService.ingestExternalSource(
        prod._id,
        `http://official-brand.test:${localPort}/official/captcha-blocked`,
        { ...loopbackOpts, agent: getSafeTestServerAgent() }
      ),
      err => err.code === 'SOURCE_ACCESS_RESTRICTED'
    );

    await assert.rejects(
      () => productIntelligenceService.ingestExternalSource(
        prod._id,
        `http://official-brand.test:${localPort}/official/server-down`,
        { ...loopbackOpts, agent: getSafeTestServerAgent() }
      ),
      err => err.code === 'UPSTREAM_HTTP_ERROR'
    );

    const saved = await ProductIntelligence.findOne({ product: prod._id });
    assert.equal(saved.sourceRecords.some(s => s.verificationStatus === 'BLOCKED'), true);
    assert.equal(saved.sourceRecords.some(s => s.verificationStatus === 'FETCH_FAILED'), true);
    assert.equal(saved.normalizedCategory.subCategory, 'sunglasses');
  });

  it('10. Unsafe SSRF URLs, private IPs, DNS rebinding, disallowed domains & 302 redirects are blocked', async () => {
    const prod = await Product.create({
      name: 'BONES STACKED HOODIE',
      sku: 'AM-HD-01',
      brand: 'AMIRI',
      category: 'men',
      image: 'https://amiri.com/hoodie.jpg',
      images: ['https://amiri.com/hoodie.jpg']
    });

    // Metadata IP
    await assert.rejects(
      () => productIntelligenceService.ingestExternalSource(prod._id, 'http://169.254.169.254/latest/meta-data/'),
      err => err.code === 'UNTRUSTED_SOURCE_DOMAIN'
    );

    // Unverified external host directly at fetcher level
    await assert.rejects(
      () => productSourceService.fetchExternalSource('https://evil-untrusted-scraper.com/product.json'),
      err => err.code === 'UNTRUSTED_SOURCE_DOMAIN'
    );

    // DNS rebinding to private 10.0.0.5 on otherwise allowlisted host
    await assert.rejects(
      () => productSourceService.fetchExternalSource('https://amiri.com/products/fake.json', {
        dnsLookup: (_h, _o, cb) => cb(null, '10.0.0.5', 4)
      }),
      err => err.code === 'SSRF_FORBIDDEN_IP'
    );

    // HTTP 302 open redirect trap
    await assert.rejects(
      () => productSourceService.fetchExternalSource(
        `http://official-brand.test:${localPort}/official/redirect-trap`,
        { ...loopbackOpts, agent: getSafeTestServerAgent() }
      ),
      err => err.code === 'REDIRECT_BLOCKED'
    );
  });

  it('11, 12 & 13. Product image MIME spoofing, oversized stream, and missing image are handled cleanly', async () => {
    const prodWrongMime = await Product.create({
      name: 'Spoofed Image Item',
      brand: 'AMIRI',
      category: 'men',
      image: `http://official-brand.test:${localPort}/assets/wrong-mime.html`,
      images: [`http://official-brand.test:${localPort}/assets/wrong-mime.html`]
    });
    const rMime = await productIntelligenceService.analyzeProductImages(prodWrongMime._id, {
      ...loopbackOpts,
      agent: getSafeTestServerAgent()
    });
    assert.equal(rMime.inspected[0].isValidForTryOn, false);
    assert.match(rMime.inspected[0].lastError, /UNSUPPORTED_MIME_TYPE|HTML_SPOOFED/);
    assert.equal(rMime.record.flags.missingImages, true);

    const prodTooLarge = await Product.create({
      name: 'Oversized Image Item',
      brand: 'AMIRI',
      category: 'men',
      image: `http://official-brand.test:${localPort}/assets/oversized.png`,
      images: [`http://official-brand.test:${localPort}/assets/oversized.png`]
    });
    const rLarge = await productIntelligenceService.analyzeProductImages(prodTooLarge._id, {
      ...loopbackOpts,
      agent: getSafeTestServerAgent(),
      maxBytes: 64 * 1024 // 64KB cap for deterministic test against 500KB test image
    });
    assert.equal(rLarge.inspected[0].isValidForTryOn, false);
    assert.match(rLarge.inspected[0].lastError, /IMAGE_TOO_LARGE/);

    const prodNoImg = await Product.create({
      name: 'No Image Product',
      brand: 'AMIRI',
      category: 'men',
      image: '',
      images: []
    });
    const noImgIntel = await productIntelligenceService.ensureBaselineForProduct(prodNoImg);
    assert.equal(noImgIntel.flags.missingImages, true);

    // Queue submitJob must reject Product missing image BEFORE touching credits
    const userId = makeId();
    await TryOnCredit.create({ user: userId, totalAvailableCredits: 5 });
    const personAsset = await TryOnImageAsset.create({
      user: userId,
      type: 'user_upload',
      mimeType: 'image/png',
      storagePath: path.join(tmpStorageDir, 'u.png'),
      isDeleted: false,
      expiresAt: new Date(Date.now() + 86400000),
      qualityAnalysis: { status: 'READY' }
    });
    const queue = new TryOnQueueService({ autoStart: false });
    await assert.rejects(
      () => queue.submitJob({ userId, personImageAssetId: personAsset._id, productId: prodNoImg._id }),
      err => err.code === 'PRODUCT_IMAGE_MISSING' && err.statusCode === 400
    );
  });

  it('15. AI Product Context Builder + Provider Adapter separation omits unconfirmed fields and VTO prompts', async () => {
    const product = await Product.create({
      name: 'All Over Crystal MX1 Jean',
      sku: 'AMJ-MX1-009',
      brand: 'AMIRI',
      category: 'men',
      tags: ['Jeans', 'Ready-to-Wear'],
      colors: ['Black'],
      description: 'In italian stretch denim with crystals.',
      image: 'https://res.cloudinary.com/drzjx5fqv/image/upload/v1/jean.webp',
      images: ['https://res.cloudinary.com/drzjx5fqv/image/upload/v1/jean.webp']
    });

    const intel = await productIntelligenceService.ensureBaselineForProduct(product);
    const adminUserId = makeId();
    // Admin approves & sets verified attributes
    await productIntelligenceService.adminVerifyOrUpdate(product._id, adminUserId, {
      action: 'approve',
      reason: 'Xác minh chính hãng MX1 Jean',
      sku: 'AMJ-MX1-009',
      attributes: {
        color: 'Black',
        material: 'Italian Stretch Denim (92% Cotton, 6% Elastomultiester, 2% Elastane)',
        fit: 'Skinny Fit',
        logoPosition: 'Back leather patch & silver hardware'
      }
    });

    // Simulate AI source attempt AFTER Admin lock: locked fields must NOT be overwritten
    const updatedIntel = await ProductIntelligence.findOne({ product: product._id });
    assert.equal(updatedIntel.adminApproved, true);
    assert.ok(updatedIntel.adminLockedFields.includes('attributes.material'));

    const vtoAdapter = new VertexVto001Adapter({
      authService: { getAccessToken: async () => 'mock-token' },
      fetchImpl: async (_url, opts) => {
        const bodyObj = JSON.parse(opts.body);
        // Critical check: Vertex VTO-001 payload strictly omits prompt and productDescription
        assert.equal(bodyObj.instances[0].prompt, undefined);
        assert.equal(bodyObj.instances[0].productDescription, undefined);
        assert.equal(bodyObj.parameters.sampleCount, 1);
        return {
          ok: true,
          status: 200,
          headers: new Map([['x-goog-request-id', 'mock-req-id']]),
          json: async () => ({
            predictions: [{ bytesBase64Encoded: Buffer.from(validGarmentPng).toString('base64') }]
          })
        };
      }
    });

    const context = aiProductContextService.buildProductContext({
      product,
      intelligence: updatedIntel,
      providerCapabilities: vtoAdapter.getCapabilities()
    });
    assert.equal(context.category.subCategory, 'jeans');
    assert.equal(context.category.domain, 'clothing');
    assert.equal(context.verifiedVisualAttributes.material, 'Italian Stretch Denim (92% Cotton, 6% Elastomultiester, 2% Elastane)');
    assert.equal(context.sourceConfidence.verificationStatus, 'VERIFIED');

    const vtoAdaptation = vtoAdapter.adaptProductContext(context);
    assert.equal(vtoAdaptation.usesStructuredTextContext, false);
    assert.ok(vtoAdaptation.omittedFields.includes('prompt'));

    const geminiStub = new GeminiImageEditAdapter();
    assert.equal(geminiStub.isAvailable(), false);
    const geminiAdaptation = geminiStub.adaptProductContext(context);
    assert.equal(geminiAdaptation.usesStructuredTextContext, true);
    assert.ok(geminiAdaptation.structuredSummary.includes('AMIRI'));

    const vtoExec = await vtoAdapter.executeTryOn({
      personBase64: validGarmentPng.toString('base64'),
      productBase64: validGarmentPng.toString('base64'),
      productContext: context
    });
    assert.equal(vtoExec.contextAdaptation.usesStructuredTextContext, false);
  });

  it('16. TryOnJob saves full immutable productSnapshot end-to-end without calling real Google Predict', async () => {
    const userId = makeId();
    const adminId = makeId();
    await TryOnCredit.create({ user: userId, totalAvailableCredits: 5 });
    await TryOnCreditLot.create({
      user: userId,
      lotType: 'free',
      initialAmount: 5,
      remainingAmount: 5,
      reservedAmount: 0,
      expiresAt: new Date(Date.now() + 86400000)
    });

    const savedUserImg = await tryOnStorageService.saveImage({
      userId,
      buffer: validGarmentPng,
      mimeType: 'image/png',
      type: 'user_upload',
      originalFilename: 'me.png'
    });

    const product = await Product.create({
      name: 'Pebbled MA-1 Sneakers',
      sku: 'AM-MA1-WHT',
      brand: 'AMIRI',
      category: 'shoes',
      tags: ['Sneakers', 'Footwear'],
      colors: ['White', 'Black'],
      variants: [
        { sku: 'AM-MA1-WHT', color: 'White', imageUrl: `http://official-brand.test:${localPort}/assets/jacket-valid.png` },
        { sku: 'AM-MA1-BLK', color: 'Black', imageUrl: `http://official-brand.test:${localPort}/assets/jacket-valid.png` }
      ],
      image: `http://official-brand.test:${localPort}/assets/jacket-valid.png`,
      images: [`http://official-brand.test:${localPort}/assets/jacket-valid.png`]
    });

    await productIntelligenceService.adminVerifyOrUpdate(product._id, adminId, {
      action: 'approve',
      reason: 'Approved footwear specs',
      attributes: { material: '100% Calfskin Leather / Rubber Sole' }
    });

    let predictCalls = 0;
    const mockVirtualTryOn = {
      getActiveProvider: () => ({
        providerId: 'google-vertex-vto-001',
        modelId: 'virtual-try-on-001',
        generateRequestId: (jid) => `req-${jid}`,
        estimateCost: () => ({ estimatedTotalUsd: 0.06 }),
        getCapabilities: () => ({ modelId: 'virtual-try-on-001', supportsPrompt: false })
      }),
      predictTryOn: async ({ productContext }) => {
        predictCalls++;
        assert.equal(productContext.variant.selectedSku, 'AM-MA1-BLK');
        return {
          resultBase64: validGarmentPng.toString('base64'),
          providerRequestId: 'mock-done-1',
          providerId: 'google-vertex-vto-001',
          modelId: 'virtual-try-on-001',
          httpStatus: 200,
          estimatedCostUsd: 0.06
        };
      }
    };

    const queue = new TryOnQueueService({
      autoStart: false,
      virtualTryOnService: mockVirtualTryOn,
      fetchSafeRemoteImage: (u, opts) =>
        require('../utils/ssrfImageFetcher').fetchSafeRemoteImage(u, {
          ...opts,
          ...loopbackOpts,
          agent: getSafeTestServerAgent()
        })
    });

    const job = await queue.submitJob({
      userId,
      personImageAssetId: savedUserImg._id,
      productId: product._id,
      selectedVariant: { color: 'Black' }
    });

    assert.equal(job.status, 'QUEUED');
    assert.equal(job.productSnapshot.sku, 'AM-MA1-WHT');
    assert.equal(job.productSnapshot.variantSku, 'AM-MA1-BLK');
    assert.equal(job.productSnapshot.variantColor, 'Black');
    assert.equal(job.productSnapshot.normalizedSubCategory, 'sneakers');
    assert.equal(job.productSnapshot.normalizedDomain, 'footwear');
    assert.equal(job.productSnapshot.verificationStatus, 'VERIFIED');

    await queue.processNextJobs();
    await new Promise(r => setTimeout(r, 40));
    const finished = await TryOnJob.findById(job._id);
    assert.equal(finished.status, 'COMPLETED');
    assert.equal(predictCalls, 1);
  });

  it('17. Legacy Catalog APIs (GET /products, /products/:id, /products/tags) & new GET /tryon/catalog have zero regressions', async () => {
    const p1 = await Product.create({
      name: 'CLASSIC MA SUNGLASSES',
      brand: 'AMIRI',
      category: 'accessories',
      price: 550,
      tags: ['Sunglasses', 'Eyewear'],
      image: 'https://amiri.com/sg.jpg',
      images: ['https://amiri.com/sg.jpg']
    });
    await Product.create({
      name: 'BONES STACKED HOODIE',
      brand: 'AMIRI',
      category: 'men',
      price: 990,
      tags: ['Hoodies'],
      image: 'https://amiri.com/hd.jpg',
      images: ['https://amiri.com/hd.jpg']
    });

    const invokeCtrl = (fn, req = {}) => new Promise((resolve) => {
      const res = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(payload) { resolve({ statusCode: this.statusCode, body: payload }); return this; }
      };
      fn(req, res);
    });

    const allRes = await invokeCtrl(getProducts, {});
    assert.equal(allRes.statusCode, 200);
    assert.equal(allRes.body.length, 2);

    const byIdRes = await invokeCtrl(getProductById, { params: { id: p1._id } });
    assert.equal(byIdRes.statusCode, 200);
    assert.equal(byIdRes.body.name, 'CLASSIC MA SUNGLASSES');

    const tagsRes = await invokeCtrl(getProductTags, {});
    assert.equal(tagsRes.statusCode, 200);
    assert.equal(tagsRes.body.success, true);
    assert.ok(tagsRes.body.tags.includes('Sunglasses'));

    // New enriched Try-On catalog route works smoothly alongside legacy routes
    const vtoCatalog = await invokeRouterHandler(tryOnRoutes, 'get', '/catalog');
    assert.equal(vtoCatalog.statusCode, 200);
    assert.equal(vtoCatalog.body.success, true);
    assert.equal(vtoCatalog.body.data.length, 2);
    const sunglassesItem = vtoCatalog.body.data.find(x => x.name === 'CLASSIC MA SUNGLASSES');
    assert.equal(sunglassesItem.taxonomy.subCategory, 'sunglasses');
    assert.equal(sunglassesItem.taxonomy.tryOnSupportLevel, 'NEEDS_SPECIALIZED_PROVIDER');
  });

  it('Bonus. Canonical Taxonomy Mapper classifies all Clothing, Footwear & Accessories groups without mutating raw category', () => {
    const cases = [
      [{ category: 'men', name: 'Signature Tee' }, 't-shirts', 'clothing'],
      [{ category: 'men', name: 'Silk Bowling Shirt' }, 'shirts', 'clothing'],
      [{ category: 'men', name: 'Bones Stacked Hoodie' }, 'hoodies', 'clothing'],
      [{ category: 'men', name: 'Ballistic Jacket' }, 'jackets', 'clothing'],
      [{ category: 'men', name: 'Wool Trench Coat' }, 'outerwear', 'clothing'],
      [{ category: 'men', name: 'Tailored Wool Pants' }, 'pants', 'clothing'],
      [{ category: 'men', name: 'Crystal MX1 Jean' }, 'jeans', 'clothing'],
      [{ category: 'men', name: 'Mesh Basket Shorts' }, 'shorts', 'clothing'],
      [{ category: 'women', name: 'Croc Midi Skirt' }, 'skirts', 'clothing'],
      [{ category: 'women', name: 'Long Sleeve Mini Dress' }, 'dresses', 'clothing'],
      [{ category: 'shoes', name: 'MA-1 Sneakers' }, 'sneakers', 'footwear'],
      [{ category: 'shoes', name: 'Chelsea Boots' }, 'boots', 'footwear'],
      [{ category: 'shoes', name: 'Penny Loafers' }, 'loafers', 'footwear'],
      [{ category: 'shoes', name: 'Pool Sandals' }, 'sandals', 'footwear'],
      [{ category: 'accessories', name: 'Optical Eyewear Frame' }, 'eyewear', 'accessories'],
      [{ category: 'accessories', name: 'Classic MA Sunglasses' }, 'sunglasses', 'accessories'],
      [{ category: 'accessories', name: '2cm Chain Belt' }, 'belts', 'accessories'],
      [{ category: 'accessories', name: 'Bandana Leather Bag' }, 'bags', 'accessories'],
      [{ category: 'accessories', name: 'Croc Card Holder' }, 'wallets', 'accessories'],
      [{ category: 'accessories', name: 'Gold Chain Necklace' }, 'necklaces', 'accessories'],
      [{ category: 'accessories', name: 'Logo Signet Ring' }, 'rings', 'accessories'],
      [{ category: 'accessories', name: 'Silver Watch' }, 'watches', 'accessories'],
      [{ category: 'accessories', name: 'MA Logo Baseball Hat' }, 'hats', 'accessories']
    ];

    for (const [prod, expectedSub, expectedDomain] of cases) {
      const origCategory = prod.category;
      const mapped = categoryTaxonomyService.mapProductCategory(prod);
      assert.equal(mapped.subCategory, expectedSub, `Expected ${prod.name} -> ${expectedSub}`);
      assert.equal(mapped.domain, expectedDomain, `Expected ${prod.name} -> ${expectedDomain}`);
      assert.equal(prod.category, origCategory);
    }
  });
});
