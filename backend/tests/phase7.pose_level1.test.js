const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const photoQualityService = require('../services/photoQualityService');
const { validatePersonImageForOutfit } = require('../services/fullOutfitValidator');

describe('KD-XX Level 1 — Human Pose & Anatomical Mass Validator (Full Body)', () => {
  it('01. validatePersonImageForOutfit blocks photo when poseAnalysis detects truncated lower body', () => {
    const mockPersonAsset = {
      width: 768,
      height: 1024,
      qualityAnalysis: {
        poseAnalysis: {
          isFullBodyDetected: false,
          poseScore: 50,
          zones: {
            upper: { status: 'PASSED', label: 'Đầu & Vai' },
            middle: { status: 'PASSED', label: 'Ngực & Thân trên' },
            lower: { status: 'FAILED', label: 'Hông, Chân & Mắt cá' }
          },
          recommendations: [
            'Ảnh chưa thấy rõ vùng chân và mắt cá chân. Hãy lùi lại để lấy ảnh toàn thân từ đầu đến chân.'
          ]
        }
      }
    };

    assert.throws(
      () => validatePersonImageForOutfit(mockPersonAsset),
      (err) => {
        assert.equal(err.code, 'FULL_BODY_PHOTO_REQUIRED');
        assert.equal(err.statusCode, 400);
        assert.ok(err.message.includes('vùng chân và mắt cá'));
        assert.equal(err.details.poseScore, 50);
        return true;
      }
    );
  });

  it('02. validatePersonImageForOutfit accepts photo when poseAnalysis detects valid full body', () => {
    const mockPersonAsset = {
      width: 768,
      height: 1024,
      qualityAnalysis: {
        poseAnalysis: {
          isFullBodyDetected: true,
          poseScore: 92,
          zones: {
            upper: { status: 'PASSED', label: 'Đầu & Vai' },
            middle: { status: 'PASSED', label: 'Ngực & Thân trên' },
            lower: { status: 'PASSED', label: 'Hông, Chân & Mắt cá' }
          },
          recommendations: ['Tư thế đứng toàn thân đạt chuẩn vàng cho Full Outfit!']
        }
      }
    };

    const res = validatePersonImageForOutfit(mockPersonAsset);
    assert.equal(res.valid, true);
    assert.equal(res.poseAnalysis.isFullBodyDetected, true);
    assert.equal(res.poseAnalysis.poseScore, 92);
  });

  it('03. analyzePoseAndAnatomy detects truncated lower body on simulated half-body portrait', async () => {
    // Generate a vertical canvas (200x300, white background) where only the upper 50% has foreground pixels
    const width = 200;
    const height = 300;
    const channels = 3;
    const data = Buffer.alloc(width * height * channels, 255); // Solid white bg

    // Draw foreground figure only in upper 50% (y from 20 to 140, x from 60 to 140)
    for (let y = 20; y < 140; y++) {
      for (let x = 60; x < 140; x++) {
        const idx = (y * width + x) * channels;
        data[idx] = 40;     // Dark dark grey torso
        data[idx + 1] = 40;
        data[idx + 2] = 40;
      }
    }

    const poseResult = photoQualityService.analyzePoseAndAnatomy(data, width, height, channels, height / width);
    assert.equal(poseResult.isFullBodyDetected, false);
    assert.ok(poseResult.issues.includes('LOWER_BODY_TRUNCATED'));
    assert.equal(poseResult.zones.lower.status, 'FAILED');
    assert.ok(poseResult.poseScore < 70);
  });

  it('04. analyzePoseAndAnatomy accepts simulated standing full body portrait', async () => {
    // Generate a vertical canvas (200x300, white background) with head, torso, and legs extending into bottom 15%
    const width = 200;
    const height = 300;
    const channels = 3;
    const data = Buffer.alloc(width * height * channels, 255); // Solid white bg

    // Draw full human figure from top (y=20) down to ankles/feet (y=285)
    for (let y = 20; y < 285; y++) {
      const halfWidth = y < 70 ? 25 : y < 160 ? 40 : 25; // head, torso, legs
      const mid = 100;
      for (let x = mid - halfWidth; x < mid + halfWidth; x++) {
        const idx = (y * width + x) * channels;
        data[idx] = 50;     // Dark silhouette
        data[idx + 1] = 50;
        data[idx + 2] = 50;
      }
    }

    const poseResult = photoQualityService.analyzePoseAndAnatomy(data, width, height, channels, height / width);
    assert.equal(poseResult.isFullBodyDetected, true);
    assert.equal(poseResult.zones.upper.status, 'PASSED');
    assert.equal(poseResult.zones.lower.status, 'PASSED');
    assert.ok(poseResult.poseScore >= 80);
  });
});
