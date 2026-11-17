const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const accessoryStackingService = require('../services/accessoryStackingService');
const LuxuryAccessoryAdapter = require('../services/providers/LuxuryAccessoryAdapter');
const registry = require('../services/providers/TryOnProviderRegistry');

describe('KD-XX Level 6 — Luxury Anatomical Accessory Stacking Engine', () => {
  const dummyWidth = 768;
  const dummyHeight = 1024;
  const dummyHeadRoi = { x: 260, y: 100, width: 248, height: 260 };

  it('01. calculateAccessoryAnchor computes correct landmarks for Eyewear / Sunglasses', () => {
    const anchor = accessoryStackingService.calculateAccessoryAnchor({
      category: 'accessories',
      subCategory: 'sunglasses',
      width: dummyWidth,
      height: dummyHeight,
      headRoi: dummyHeadRoi
    });

    assert.equal(anchor.anchorName, 'FACE_EYES_BRIDGE');
    assert.ok(anchor.width > 150 && anchor.width < 250);
    assert.ok(anchor.y > dummyHeadRoi.y && anchor.y < dummyHeadRoi.y + dummyHeadRoi.height);
    assert.equal(anchor.zIndex, 50);
    assert.equal(anchor.hasDropShadow, true);
  });

  it('02. calculateAccessoryAnchor computes correct landmarks for Belts', () => {
    const anchor = accessoryStackingService.calculateAccessoryAnchor({
      category: 'accessories',
      subCategory: 'belts',
      width: dummyWidth,
      height: dummyHeight
    });

    assert.equal(anchor.anchorName, 'TORSO_WAISTLINE');
    assert.ok(anchor.y > dummyHeight * 0.40 && anchor.y < dummyHeight * 0.50);
    assert.ok(anchor.width > 200);
    assert.equal(anchor.zIndex, 25);
  });

  it('03. calculateAccessoryAnchor computes correct landmarks for Hats', () => {
    const anchor = accessoryStackingService.calculateAccessoryAnchor({
      category: 'accessories',
      subCategory: 'hats',
      width: dummyWidth,
      height: dummyHeight,
      headRoi: dummyHeadRoi
    });

    assert.equal(anchor.anchorName, 'HEAD_CROWN');
    assert.ok(anchor.y <= dummyHeadRoi.y + 10);
    assert.ok(anchor.width >= dummyHeadRoi.width);
  });

  it('04. calculateAccessoryAnchor computes correct landmarks for Bags & Crossbody', () => {
    const anchor = accessoryStackingService.calculateAccessoryAnchor({
      category: 'accessories',
      subCategory: 'bags',
      width: dummyWidth,
      height: dummyHeight
    });

    assert.equal(anchor.anchorName, 'HIP_FLANK_CROSSBODY');
    assert.ok(anchor.y >= dummyHeight * 0.48);
    assert.ok(anchor.x > dummyWidth * 0.5); // Right hip side
  });

  it('05. preprocessAccessoryImage keys out studio white background to transparent alpha', async () => {
    // Generate a 100x100 white square with a black accessory circle in center
    const svgWithWhiteBg = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#ffffff" />
        <circle cx="50" cy="50" r="30" fill="#111111" />
      </svg>
    `;
    const inputBuf = await sharp(Buffer.from(svgWithWhiteBg)).png().toBuffer();

    const processedBuf = await accessoryStackingService.preprocessAccessoryImage(inputBuf, {
      targetWidth: 100,
      targetHeight: 100
    });

    const meta = await sharp(processedBuf).metadata();
    assert.equal(meta.channels, 4);
    assert.equal(meta.hasAlpha, true);

    // Corner pixel should now be transparent (alpha == 0)
    const raw = await sharp(processedBuf).raw().toBuffer({ resolveWithObject: true });
    const cornerAlpha = raw.data[3];
    assert.equal(cornerAlpha, 0);

    // Center pixel should remain solid opaque (alpha > 200)
    const centerIndex = (50 * 100 + 50) * 4;
    const centerAlpha = raw.data[centerIndex + 3];
    assert.ok(centerAlpha > 200);
  });

  it('06. synthesizeContactShadow produces valid PNG buffer with soft alpha falloff', async () => {
    const shadow = await accessoryStackingService.synthesizeContactShadow({
      width: 120,
      height: 40,
      opacity: 0.35
    });

    const meta = await sharp(shadow).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 120);
    assert.equal(meta.height, 40);
  });

  it('07. stackAccessoryOntoBody composites accessory onto person photo with full telemetry', async () => {
    // Create base person image
    const personBuf = await sharp({
      create: { width: 300, height: 400, channels: 3, background: { r: 180, g: 180, b: 180 } }
    }).jpeg().toBuffer();

    // Create small accessory (sunglasses)
    const accSvg = `<svg width="80" height="30"><rect width="80" height="30" fill="#222222" rx="5"/></svg>`;
    const accBuf = await sharp(Buffer.from(accSvg)).png().toBuffer();

    const res = await accessoryStackingService.stackAccessoryOntoBody({
      personBuffer: personBuf,
      accessoryBuffer: accBuf,
      category: 'accessories',
      subCategory: 'sunglasses'
    });

    assert.ok(res.enhancedBuffer);
    assert.ok(Buffer.isBuffer(res.enhancedBuffer));
    assert.equal(res.telemetry.anchorName, 'FACE_EYES_BRIDGE');
    assert.equal(res.telemetry.hasDropShadow, true);
    assert.ok(res.telemetry.anchorCoordinates.width > 0);

    const outMeta = await sharp(res.enhancedBuffer).metadata();
    assert.equal(outMeta.width, 300);
    assert.equal(outMeta.height, 400);
  });

  it('08. LuxuryAccessoryAdapter executes try-on cleanly and returns Base64 result', async () => {
    const adapter = new LuxuryAccessoryAdapter({ accessoryStackingService });
    assert.equal(adapter.providerId, 'kdxx-luxury-accessories-v1');
    assert.equal(adapter.isAvailable(), true);
    assert.equal(adapter.areCredentialsConfigured(), true);

    const personBuf = await sharp({
      create: { width: 256, height: 320, channels: 3, background: { r: 190, g: 190, b: 190 } }
    }).jpeg().toBuffer();

    const accSvg = `<svg width="60" height="25"><rect width="60" height="25" fill="#111111"/></svg>`;
    const accBuf = await sharp(Buffer.from(accSvg)).png().toBuffer();

    const outcome = await adapter.executeTryOn({
      personBase64: personBuf.toString('base64'),
      productBase64: accBuf.toString('base64'),
      productContext: {
        catalogCategory: 'accessories',
        normalizedCategory: { subCategory: 'sunglasses' }
      }
    });

    assert.ok(outcome.resultBase64);
    assert.equal(outcome.httpStatus, 200);
    assert.equal(outcome.providerId, 'kdxx-luxury-accessories-v1');
    assert.equal(outcome.contextAdaptation.engine, 'KD_XX_LEVEL_6_ACCESSORY_STACKER');
    assert.equal(outcome.contextAdaptation.telemetry.anchorName, 'FACE_EYES_BRIDGE');
  });

  it('09. TryOnProviderRegistry evaluates LuxuryAccessoryAdapter when registered with allowSubmit: true', () => {
    const customRegistry = new (registry.constructor)();
    customRegistry.register(new LuxuryAccessoryAdapter({ accessoryStackingService }));

    const configsMap = new Map();
    configsMap.set('kdxx-luxury-accessories-v1', {
      providerId: 'kdxx-luxury-accessories-v1',
      isEnabled: true,
      categoryOverrides: { sunglasses: true, bags: true, eyewear: true, accessories: true }
    });

    const sunglassesRouting = customRegistry.evaluateCategorySupport({
      category: 'sunglasses',
      domain: 'accessories',
      subCategory: 'sunglasses',
      configsByProviderId: configsMap
    });

    assert.equal(sunglassesRouting.allowSubmit, true);
    assert.equal(sunglassesRouting.providerId, 'kdxx-luxury-accessories-v1');
    assert.equal(sunglassesRouting.status, 'VERIFIED');

    const bagsRouting = customRegistry.evaluateCategorySupport({
      category: 'bags',
      domain: 'accessories',
      subCategory: 'bags',
      configsByProviderId: configsMap
    });

    assert.equal(bagsRouting.allowSubmit, true);
    assert.equal(bagsRouting.providerId, 'kdxx-luxury-accessories-v1');
    assert.equal(bagsRouting.status, 'VERIFIED');
  });
});
