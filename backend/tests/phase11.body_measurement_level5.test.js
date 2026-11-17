const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bodyMeasurementService = require('../services/bodyMeasurementService');

describe('KD-XX Level 5 — AI Body Measurement & Size Recommendation', () => {
  it('01. extractAnatomicalMeasurements calculates metrics and proportions cleanly', () => {
    const result = bodyMeasurementService.extractAnatomicalMeasurements({
      width: 600,
      height: 900,
      poseAnalysis: { isFullBodyDetected: true, zones: { upper: { status: 'NORMAL' }, middle: { status: 'NORMAL' } } }
    });

    assert.equal(typeof result.estimatedMetrics.shoulderWidthCm, 'number');
    assert.equal(typeof result.estimatedMetrics.chestCircumferenceCm, 'number');
    assert.equal(typeof result.estimatedMetrics.waistCircumferenceCm, 'number');
    assert.equal(typeof result.estimatedMetrics.hipCircumferenceCm, 'number');
    assert.equal(typeof result.estimatedMetrics.totalLegLengthCm, 'number');

    assert.ok(result.estimatedMetrics.shoulderWidthCm > 40 && result.estimatedMetrics.shoulderWidthCm < 55);
    assert.ok(result.estimatedMetrics.waistCircumferenceCm > 65 && result.estimatedMetrics.waistCircumferenceCm < 95);
    assert.ok(result.proportions.legToBodyRatio >= 0.50 && result.proportions.legToBodyRatio <= 0.65);
    assert.equal(typeof result.bodyShape, 'string');
    assert.ok(result.bodyShapeLabel.length > 0);
  });

  it('02. recommendSize suggests correct Alpha size for Tops / Hoodies / Jackets', () => {
    const measurements = bodyMeasurementService.extractAnatomicalMeasurements({ width: 600, height: 900 });
    const topRec = bodyMeasurementService.recommendSize({
      category: 'hoodies',
      measurements
    });

    assert.equal(topRec.slot, 'TOP');
    assert.ok(['S', 'M', 'L', 'XL'].includes(topRec.recommendedSize));
    assert.ok(topRec.fitAdvice.includes('vòng ngực'));
    assert.match(topRec.fitSilhouette, /Boxy Relaxed Fit/);
  });

  it('03. recommendSize suggests correct numeric waist size for Denim Jeans', () => {
    const measurements = bodyMeasurementService.extractAnatomicalMeasurements({ width: 600, height: 900 });
    const bottomRec = bodyMeasurementService.recommendSize({
      category: 'jeans',
      measurements
    });

    assert.equal(bottomRec.slot, 'BOTTOM');
    assert.ok(['28', '29', '30', '31', '32', '33', '34'].includes(bottomRec.recommendedSize));
    assert.ok(bottomRec.fitAdvice.includes('Vòng eo'));
  });

  it('04. recommendSize suggests correct European size for Footwear / Sneakers', () => {
    const measurements = bodyMeasurementService.extractAnatomicalMeasurements({ width: 600, height: 900 });
    const shoeRec = bodyMeasurementService.recommendSize({
      category: 'sneakers',
      measurements
    });

    assert.equal(shoeRec.slot, 'FOOTWEAR');
    assert.ok(['40', '41', '42', '43'].includes(shoeRec.recommendedSize));
    assert.equal(shoeRec.sizeSystem, 'European Sizing (EU)');
  });

  it('05. generateFullBodyProfileAndSizeAdvice generates comprehensive 3-piece Full Look advice', () => {
    const fullLookAdvice = bodyMeasurementService.generateFullBodyProfileAndSizeAdvice({
      width: 600,
      height: 900,
      poseAnalysis: { isFullBodyDetected: true },
      items: [
        { slot: 'TOP', category: 'hoodies', name: 'BONES STACKED HOODIE' },
        { slot: 'BOTTOM', category: 'jeans', name: 'All Over Crystal MX1 Jean' },
        { slot: 'FOOTWEAR', category: 'sneakers', name: 'Pebbled MA-1 Sneakers' }
      ]
    });

    assert.ok(fullLookAdvice.measurements);
    assert.equal(fullLookAdvice.itemRecommendations.length, 3);
    assert.equal(fullLookAdvice.itemRecommendations[0].slot, 'TOP');
    assert.equal(fullLookAdvice.itemRecommendations[1].slot, 'BOTTOM');
    assert.equal(fullLookAdvice.itemRecommendations[2].slot, 'FOOTWEAR');
    assert.ok(fullLookAdvice.summary.bodyShapeLabel.length > 0);
    assert.ok(fullLookAdvice.summary.fitSummaryText.includes('Vóc dáng'));
  });
});
