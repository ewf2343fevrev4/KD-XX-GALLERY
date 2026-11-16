const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateFullOutfitSelection } = require('../services/fullOutfitValidator');

describe('KD-XX Level 2 — Tuck-in vs Untucked Styling Engine (Full Outfit)', () => {
  const shirtEntry = {
    product: { _id: 'prod-shirt-01', name: 'AMIRI Silk Bowling Shirt' },
    productImageUrl: 'https://cdn.example.com/shirt.jpg',
    taxonomy: { domain: 'clothing', subCategory: 'shirts' }
  };

  const jacketEntry = {
    product: { _id: 'prod-jacket-01', name: 'AMIRI Leather Biker Jacket' },
    productImageUrl: 'https://cdn.example.com/jacket.jpg',
    taxonomy: { domain: 'clothing', subCategory: 'jackets' }
  };

  const jeansEntry = {
    product: { _id: 'prod-jeans-01', name: 'AMIRI MX1 Distressed Jeans' },
    productImageUrl: 'https://cdn.example.com/jeans.jpg',
    taxonomy: { domain: 'clothing', subCategory: 'jeans' }
  };

  it('01. Untucked mode orders BOTTOM at step 0 and TOP at step 1 for natural hemline drape', () => {
    const result = validateFullOutfitSelection([shirtEntry, jeansEntry], { tuckStyle: 'untucked' });

    assert.equal(result.tuckStyle, 'untucked');
    assert.equal(result.orderedSteps.length, 2);
    assert.equal(result.orderedSteps[0].slot, 'BOTTOM');
    assert.equal(result.orderedSteps[0].stepOrder, 0);
    assert.equal(result.orderedSteps[0].tuckRole, 'base_bottom');
    assert.equal(result.orderedSteps[1].slot, 'TOP');
    assert.equal(result.orderedSteps[1].stepOrder, 1);
    assert.equal(result.orderedSteps[1].tuckRole, 'draping_top');
  });

  it('02. Tucked mode orders TOP at step 0 and BOTTOM at step 1 so waistband wraps tucked shirt', () => {
    const result = validateFullOutfitSelection([shirtEntry, jeansEntry], { tuckStyle: 'tucked' });

    assert.equal(result.tuckStyle, 'tucked');
    assert.equal(result.orderedSteps.length, 2);
    assert.equal(result.orderedSteps[0].slot, 'TOP');
    assert.equal(result.orderedSteps[0].stepOrder, 0);
    assert.equal(result.orderedSteps[0].tuckRole, 'inner_tucked');
    assert.equal(result.orderedSteps[1].slot, 'BOTTOM');
    assert.equal(result.orderedSteps[1].stepOrder, 1);
    assert.equal(result.orderedSteps[1].tuckRole, 'outer_waistband');
  });

  it('03. Outerwear (Jackets/Hoodies) automatically falls back to untucked with fashion guidance', () => {
    const result = validateFullOutfitSelection([jacketEntry, jeansEntry], { tuckStyle: 'tucked' });

    assert.equal(result.tuckStyle, 'untucked');
    assert.ok(result.tuckNotes.includes('áo khoác/áo ngoài'));
    assert.equal(result.orderedSteps[0].slot, 'BOTTOM');
    assert.equal(result.orderedSteps[1].slot, 'TOP');
  });

  it('04. Defaults cleanly to untucked when tuckStyle is omitted (backward compatibility)', () => {
    const result = validateFullOutfitSelection([shirtEntry, jeansEntry]);

    assert.equal(result.tuckStyle, 'untucked');
    assert.equal(result.orderedSteps[0].slot, 'BOTTOM');
    assert.equal(result.orderedSteps[1].slot, 'TOP');
  });
});
