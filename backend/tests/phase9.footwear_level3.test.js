const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fullOutfitValidator = require('../services/fullOutfitValidator');

describe('KD-XX Level 3 — 3-Piece Full Look (Top + Bottom + Footwear)', () => {
  const topShirt = {
    product: { _id: 'shirt-101', name: 'AMIRI Silk Bowling Shirt' },
    taxonomy: { domain: 'clothing', subCategory: 'shirts', filterGroup: 'tops' },
    intelligence: { verificationStatus: 'VERIFIED' },
    productImageUrl: 'https://cdn.example.com/shirt.jpg'
  };

  const topJacket = {
    product: { _id: 'jacket-102', name: 'AMIRI Leather Biker Jacket' },
    taxonomy: { domain: 'clothing', subCategory: 'jackets', filterGroup: 'tops' },
    intelligence: { verificationStatus: 'VERIFIED' },
    productImageUrl: 'https://cdn.example.com/jacket.jpg'
  };

  const bottomJeans = {
    product: { _id: 'jeans-201', name: 'AMIRI MX1 Distressed Jean' },
    taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' },
    intelligence: { verificationStatus: 'VERIFIED' },
    productImageUrl: 'https://cdn.example.com/jeans.jpg'
  };

  const footwearSneakers = {
    product: { _id: 'shoes-301', name: 'AMIRI MA-1 Leather Sneakers' },
    taxonomy: { domain: 'footwear', subCategory: 'sneakers', filterGroup: 'shoes' },
    intelligence: { verificationStatus: 'VERIFIED' },
    productImageUrl: 'https://cdn.example.com/sneakers.jpg'
  };

  it('01. validates 3-piece Full Look (Untucked): Bottom (0) -> Top (1) -> Footwear (2) with 3 credits', () => {
    const result = fullOutfitValidator.validateFullOutfitSelection(
      [topShirt, bottomJeans, footwearSneakers],
      { tuckStyle: 'untucked' }
    );

    assert.equal(result.creditsCost, 3);
    assert.equal(result.tuckStyle, 'untucked');
    assert.equal(result.hasFootwear, true);
    assert.equal(result.orderedSteps.length, 3);

    // Step 0: Bottom
    assert.equal(result.orderedSteps[0].slot, 'BOTTOM');
    assert.equal(result.orderedSteps[0].stepOrder, 0);
    assert.equal(result.orderedSteps[0].tuckRole, 'base_bottom');

    // Step 1: Top
    assert.equal(result.orderedSteps[1].slot, 'TOP');
    assert.equal(result.orderedSteps[1].stepOrder, 1);
    assert.equal(result.orderedSteps[1].tuckRole, 'draping_top');

    // Step 2: Footwear
    assert.equal(result.orderedSteps[2].slot, 'FOOTWEAR');
    assert.equal(result.orderedSteps[2].stepOrder, 2);
    assert.equal(result.orderedSteps[2].tuckRole, 'grounded_footwear');
  });

  it('02. validates 3-piece Full Look (Tucked): Top (0) -> Bottom (1) -> Footwear (2) with 3 credits', () => {
    const result = fullOutfitValidator.validateFullOutfitSelection(
      [topShirt, bottomJeans, footwearSneakers],
      { tuckStyle: 'tucked' }
    );

    assert.equal(result.creditsCost, 3);
    assert.equal(result.tuckStyle, 'tucked');
    assert.equal(result.hasFootwear, true);
    assert.equal(result.orderedSteps.length, 3);

    // Step 0: Top (tucked into waistband)
    assert.equal(result.orderedSteps[0].slot, 'TOP');
    assert.equal(result.orderedSteps[0].stepOrder, 0);
    assert.equal(result.orderedSteps[0].tuckRole, 'inner_tucked');

    // Step 1: Bottom (wraps around shirt waist)
    assert.equal(result.orderedSteps[1].slot, 'BOTTOM');
    assert.equal(result.orderedSteps[1].stepOrder, 1);
    assert.equal(result.orderedSteps[1].tuckRole, 'outer_waistband');

    // Step 2: Footwear (grounded over feet)
    assert.equal(result.orderedSteps[2].slot, 'FOOTWEAR');
    assert.equal(result.orderedSteps[2].stepOrder, 2);
    assert.equal(result.orderedSteps[2].tuckRole, 'grounded_footwear');
  });

  it('03. Outerwear Jacket in 3-piece look automatically falls back to untucked with footwear at step 2', () => {
    const result = fullOutfitValidator.validateFullOutfitSelection(
      [topJacket, bottomJeans, footwearSneakers],
      { tuckStyle: 'tucked' }
    );

    assert.equal(result.creditsCost, 3);
    assert.equal(result.tuckStyle, 'untucked');
    assert.match(result.tuckNotes, /tự động áp dụng kiểu Thả áo ngoài/);
    assert.equal(result.orderedSteps[0].slot, 'BOTTOM');
    assert.equal(result.orderedSteps[1].slot, 'TOP');
    assert.equal(result.orderedSteps[2].slot, 'FOOTWEAR');
  });

  it('04. rejects invalid 3-piece combinations (missing pants, multiple shoes, or accessories)', () => {
    // 2 Shoes + 1 Shirt (missing pants)
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([topShirt, footwearSneakers, {
        product: { _id: 'shoes-302', name: 'AMIRI Skel Top Low' },
        taxonomy: { domain: 'footwear', subCategory: 'sneakers', filterGroup: 'shoes' },
        intelligence: { verificationStatus: 'VERIFIED' },
        productImageUrl: 'https://cdn.example.com/skel.jpg'
      }]),
      err => err.code === 'DUPLICATE_OUTFIT_SLOT'
    );

    // 1 Top + 1 Bottom + 1 Belt (accessories not allowed in full outfit)
    assert.throws(
      () => fullOutfitValidator.validateFullOutfitSelection([topShirt, bottomJeans, {
        product: { _id: 'belt-401', name: 'AMIRI Leather Belt' },
        taxonomy: { domain: 'accessories', subCategory: 'belts', filterGroup: 'accessories' },
        intelligence: { verificationStatus: 'VERIFIED' },
        productImageUrl: 'https://cdn.example.com/belt.jpg'
      }]),
      err => err.code === 'FULL_OUTFIT_ACCESSORIES_LOCKED'
    );
  });
});
