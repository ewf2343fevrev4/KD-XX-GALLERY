const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const faceIdentity = require('../services/faceIdentityService');

describe('KD-XX Level 4 — Face & Skin Identity Preservation / Super-Resolution', () => {
  // Helper to create test full-body image (600x900 px)
  async function createTestImage(w = 600, h = 900, color = { r: 240, g: 240, b: 245 }) {
    return await sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: color
      }
    })
      .jpeg()
      .toBuffer();
  }

  it('01. calculateHeadROI computes correct anatomical head & neck bounding box', () => {
    const roi = faceIdentity.calculateHeadROI({ width: 600, height: 900 });

    assert.equal(roi.top, 0);
    assert.ok(roi.height >= Math.floor(900 * 0.28));
    assert.ok(roi.height <= Math.floor(900 * 0.35));
    assert.ok(roi.left > 0);
    assert.ok(roi.left + roi.width <= 600);
    assert.equal(roi.collarRatio, 0.78);
  });

  it('02. extractHeadROI extracts real face region without dimension loss', async () => {
    const originalBuffer = await createTestImage(600, 900);
    const roi = faceIdentity.calculateHeadROI({ width: 600, height: 900 });

    const headBuffer = await faceIdentity.extractHeadROI(originalBuffer, roi);
    assert.ok(Buffer.isBuffer(headBuffer));

    const meta = await sharp(headBuffer).metadata();
    assert.equal(meta.width, roi.width);
    assert.equal(meta.height, roi.height);
  });

  it('03. createNecklineFeatherMaskBuffer produces solid 255 on face and soft falloff at collar', () => {
    const width = 100;
    const height = 100;
    const mask = faceIdentity.createNecklineFeatherMaskBuffer(width, height, {
      collarStartRatio: 0.75,
      collarEndRatio: 0.95
    });

    assert.equal(mask.length, width * height * 4);

    // Mid-face (y=30, x=50) should be 100% solid (alpha = 255)
    const midFaceIdx = (30 * width + 50) * 4 + 3;
    assert.equal(mask[midFaceIdx], 255);

    // Collar transition zone (y=85, x=50) should have intermediate alpha
    const collarIdx = (85 * width + 50) * 4 + 3;
    const collarAlpha = mask[collarIdx];
    assert.ok(collarAlpha > 0 && collarAlpha < 255);

    // Deep collar zone (y=98, x=50) should be 0 (revealing AI garment)
    const deepCollarIdx = (98 * width + 50) * 4 + 3;
    assert.equal(mask[deepCollarIdx], 0);
  });

  it('04. blendFaceIdentity overlays original head onto fitted body cleanly', async () => {
    const originalBuffer = await createTestImage(600, 900, { r: 255, g: 220, b: 200 }); // skin-toned
    const fittedBuffer = await createTestImage(600, 900, { r: 40, g: 40, b: 60 });     // dark garment

    const headRoi = faceIdentity.calculateHeadROI({ width: 600, height: 900 });
    const blended = await faceIdentity.blendFaceIdentity({
      originalBuffer,
      fittedBodyBuffer: fittedBuffer,
      headRoi
    });

    assert.ok(Buffer.isBuffer(blended));
    const meta = await sharp(blended).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 900);
  });

  it('05. enhanceSuperResolutionClarity applies unsharp sharpening convolution cleanly', async () => {
    const testBuffer = await createTestImage(600, 900);
    const sharpened = await faceIdentity.enhanceSuperResolutionClarity(testBuffer);

    assert.ok(Buffer.isBuffer(sharpened));
    const meta = await sharp(sharpened).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 900);
    assert.equal(meta.format, 'jpeg');
  });

  it('06. preserveIdentityAndEnhance runs full Level 4 Face Lock + Super-Resolution pipeline', async () => {
    const originalBuffer = await createTestImage(600, 900, { r: 255, g: 220, b: 200 });
    const fittedBuffer = await createTestImage(600, 900, { r: 50, g: 50, b: 70 });

    const result = await faceIdentity.preserveIdentityAndEnhance({
      originalBuffer,
      fittedBuffer,
      options: {
        enableFaceLock: true,
        enableSuperResolution: true,
        poseAnalysis: { zones: { upper: { status: 'NORMAL' } } }
      }
    });

    assert.ok(Buffer.isBuffer(result.enhancedBuffer));
    assert.ok(result.headRoi);
    assert.equal(result.telemetry.mode, 'FACE_IDENTITY_AND_SUPER_RESOLUTION_V4');
    assert.equal(result.telemetry.faceLockApplied, true);
    assert.equal(result.telemetry.superResolutionApplied, true);
    assert.equal(result.telemetry.dimensions.width, 600);
    assert.equal(result.telemetry.dimensions.height, 900);
  });
});
