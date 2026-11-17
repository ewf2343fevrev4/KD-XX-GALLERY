const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const footwearEnhancer = require('../services/footwearEnhancerService');

describe('KD-XX Level 3.5 — Feet ROI Zoom & Local Footwear Fidelity Enhancer', () => {
  // Helper to create a dummy test full-body image (600x900 px)
  async function createTestImage(w = 600, h = 900) {
    return await sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: { r: 240, g: 240, b: 245 }
      }
    })
      .jpeg()
      .toBuffer();
  }

  it('01. calculateFeetROI computes correct bounding box and 512x512 target resolution', () => {
    const roi = footwearEnhancer.calculateFeetROI({ width: 600, height: 900 });

    assert.equal(typeof roi.top, 'number');
    assert.equal(typeof roi.left, 'number');
    assert.equal(typeof roi.width, 'number');
    assert.equal(typeof roi.height, 'number');

    // Feet ROI should be in lower quarter
    assert.ok(roi.top >= Math.floor(900 * 0.75));
    assert.ok(roi.top + roi.height <= 900);
    assert.ok(roi.left + roi.width <= 600);
    assert.equal(roi.targetWidth, 512);
    assert.equal(roi.targetHeight, 512);
  });

  it('02. extractFeetROI extracts sub-region and resizes to 512x512 with 15x pixel budget zoom', async () => {
    const testBuffer = await createTestImage(600, 900);
    const roi = footwearEnhancer.calculateFeetROI({ width: 600, height: 900 });

    const feetZoomBuffer = await footwearEnhancer.extractFeetROI(testBuffer, roi);
    assert.ok(Buffer.isBuffer(feetZoomBuffer));
    assert.ok(feetZoomBuffer.length > 0);

    const meta = await sharp(feetZoomBuffer).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.format, 'png');
  });

  it('03. createFeatherMaskBuffer produces soft alpha gradient at top hemline and solid base', () => {
    const width = 100;
    const height = 100;
    const mask = footwearEnhancer.createFeatherMaskBuffer(width, height, { featherTopPx: 20 });

    assert.equal(mask.length, width * height * 4);

    // Top row (y=0) should be fully transparent (alpha = 0)
    const topAlpha = mask[3];
    assert.equal(topAlpha, 0);

    // Mid-top row (y=10) should have intermediate alpha (~127)
    const midTopIdx = (10 * width + 50) * 4 + 3;
    const midTopAlpha = mask[midTopIdx];
    assert.ok(midTopAlpha > 0 && midTopAlpha < 255);

    // Bottom center (y=80, x=50) should be fully opaque (alpha = 255)
    const bottomIdx = (80 * width + 50) * 4 + 3;
    assert.equal(mask[bottomIdx], 255);
  });

  it('04. synthesizeContactShadow generates natural dark contact shadow beneath feet', async () => {
    const shadowBuffer = await footwearEnhancer.synthesizeContactShadow(200, 150);

    assert.ok(Buffer.isBuffer(shadowBuffer));
    const meta = await sharp(shadowBuffer).metadata();
    assert.equal(meta.width, 200);
    assert.equal(meta.height, 150);
    assert.equal(meta.channels, 4); // RGBA
  });

  it('05. compositeFeetROIToFullBody preserves original full-body dimensions and blends cleanly', async () => {
    const originalBuffer = await createTestImage(600, 900);
    const roi = footwearEnhancer.calculateFeetROI({ width: 600, height: 900 });
    const feetZoomBuffer = await footwearEnhancer.extractFeetROI(originalBuffer, roi);

    const compositedBuffer = await footwearEnhancer.compositeFeetROIToFullBody({
      fullBodyBuffer: originalBuffer,
      feetRoiBuffer: feetZoomBuffer,
      roi,
      applyContactShadow: true
    });

    assert.ok(Buffer.isBuffer(compositedBuffer));
    const meta = await sharp(compositedBuffer).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 900);
    assert.equal(meta.format, 'jpeg');
  });

  it('06. enhanceFootwearFidelity executes end-to-end Level 3.5 enhancement with full telemetry', async () => {
    const originalBuffer = await createTestImage(600, 900);

    const result = await footwearEnhancer.enhanceFootwearFidelity({
      fullBodyBuffer: originalBuffer,
      poseAnalysis: { zones: { lower: { status: 'NORMAL' } } }
    });

    assert.ok(Buffer.isBuffer(result.enhancedBuffer));
    assert.ok(result.roi);
    assert.equal(result.telemetry.mode, 'FEET_ROI_HIGH_FIDELITY_V3_5');
    assert.equal(result.telemetry.contactShadowApplied, true);
    assert.equal(result.telemetry.featheringApplied, true);
    assert.equal(result.telemetry.originalDimensions.width, 600);
    assert.equal(result.telemetry.originalDimensions.height, 900);
  });
});
