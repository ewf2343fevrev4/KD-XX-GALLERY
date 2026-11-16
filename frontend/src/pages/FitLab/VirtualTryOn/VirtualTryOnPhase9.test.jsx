import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductSelector from './ProductSelector';
import TryOnResultView from './TryOnResultView';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}), { virtual: true });

const mockProductsList = [
  {
    _id: 'shirt-101',
    name: 'AMIRI Silk Bowling Shirt',
    category: 'men',
    taxonomy: { domain: 'clothing', subCategory: 'shirts', filterGroup: 'tops' }
  },
  {
    _id: 'jeans-201',
    name: 'AMIRI MX1 Distressed Jean',
    category: 'men',
    taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' }
  },
  {
    _id: 'shoes-301',
    name: 'AMIRI MA-1 Leather Sneakers',
    category: 'shoes',
    taxonomy: { domain: 'footwear', subCategory: 'sneakers', filterGroup: 'shoes' }
  }
];

jest.mock('../../../services/api', () => ({
  getTryOnCatalog: jest.fn(),
  getAllProducts: jest.fn()
}));

const api = require('../../../services/api');

describe('KD-XX Level 3 — 3-Piece Full Look Frontend UI', () => {
  beforeEach(() => {
    api.getTryOnCatalog.mockResolvedValue({ success: true, data: mockProductsList });
    api.getAllProducts.mockResolvedValue({ success: true, data: mockProductsList });
  });

  it('01. renders 3 slot trays (Top, Bottom, Footwear) in Full Outfit mode', async () => {
    const mockSlots = {
      top: { product: mockProductsList[0] },
      bottom: { product: mockProductsList[1] },
      footwear: null
    };

    render(
      <ProductSelector
        selectedProduct={null}
        onSelectProduct={jest.fn()}
        tryOnMode="full_outfit"
        fullOutfitSlots={mockSlots}
        tuckStyle="untucked"
      />
    );

    expect(screen.getByTestId('vto-outfit-slot-top')).toBeInTheDocument();
    expect(screen.getByTestId('vto-outfit-slot-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('vto-outfit-slot-footwear')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('AMIRI MA-1 Leather Sneakers')).toBeInTheDocument();
    });
  });

  it('02. clicking a shoe in catalog fills slot 3 (footwear) via onUpdateOutfitSlot', async () => {
    const mockUpdateSlot = jest.fn();
    const mockSelectProduct = jest.fn();

    const mockSlots = {
      top: { product: mockProductsList[0] },
      bottom: { product: mockProductsList[1] },
      footwear: null
    };

    render(
      <ProductSelector
        selectedProduct={null}
        onSelectProduct={mockSelectProduct}
        tryOnMode="full_outfit"
        fullOutfitSlots={mockSlots}
        onUpdateOutfitSlot={mockUpdateSlot}
        tuckStyle="untucked"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('AMIRI MA-1 Leather Sneakers')).toBeInTheDocument();
    });

    const shoeCard = screen.getByText('AMIRI MA-1 Leather Sneakers').closest('.vto-product-card');
    fireEvent.click(shoeCard);

    expect(mockUpdateSlot).toHaveBeenCalledWith(
      'footwear',
      expect.objectContaining({ _id: 'shoes-301' }),
      null
    );
  });

  it('03. renders Full Look 3 Món badge in TryOnResultView when footwear item is present', () => {
    const outfitItems = [
      { slot: 'BOTTOM', productName: 'AMIRI MX1 Jeans' },
      { slot: 'TOP', productName: 'AMIRI Silk Bowling Shirt' },
      { slot: 'FOOTWEAR', productName: 'AMIRI MA-1 Sneakers' }
    ];

    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        outfitItems={outfitItems}
        tuckStyle="untucked"
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    expect(screen.getByTestId('vto-result-footwear-badge')).toBeInTheDocument();
    expect(screen.getByText(/Full Look 3 Món \(Kèm Giày\)/i)).toBeInTheDocument();
  });
});
