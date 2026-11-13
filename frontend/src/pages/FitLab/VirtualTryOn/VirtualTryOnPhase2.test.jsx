import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductSelector from './ProductSelector';
import * as apiService from '../../../services/api';

jest.mock('../../../services/api', () => ({
  getTryOnCatalog: jest.fn(),
  getAllProducts: jest.fn()
}));

const MOCK_ENRICHED_CATALOG = [
  {
    _id: 'prod-jacket',
    name: 'BONES DOWN JACKET',
    brand: 'AMIRI',
    price: 3000,
    category: 'men',
    sku: 'AMOUDO1005-BLK',
    image: 'https://amiri.com/jacket.jpg',
    colors: ['Black', 'White'],
    variants: [
      { sku: 'AMOUDO1005-BLK', color: 'Black', imageUrl: 'https://amiri.com/jacket-blk.jpg' },
      { sku: 'AMOUDO1005-WHT', color: 'White', imageUrl: 'https://amiri.com/jacket-wht.jpg' }
    ],
    taxonomy: {
      domain: 'clothing',
      subCategory: 'jackets',
      filterGroup: 'tops',
      tryOnSupportLevel: 'DIRECT',
      supportReason: ''
    },
    intelligence: {
      verificationStatus: 'VERIFIED',
      confidenceScore: 0.94,
      bestTryOnImageUrl: 'https://amiri.com/jacket-blk.jpg'
    }
  },
  {
    _id: 'prod-sunglasses',
    name: 'CLASSIC MA SUNGLASSES',
    brand: 'AMIRI',
    price: 550,
    category: 'accessories',
    sku: '',
    image: 'https://amiri.com/sunglasses.jpg',
    colors: [],
    taxonomy: {
      domain: 'accessories',
      subCategory: 'sunglasses',
      filterGroup: 'eyewear',
      tryOnSupportLevel: 'NEEDS_SPECIALIZED_PROVIDER',
      supportReason: 'virtual-try-on-001 không hỗ trợ trực tiếp kính râm; cần Eyewear provider ở Phase 3+.'
    },
    intelligence: {
      verificationStatus: 'UNVERIFIED',
      confidenceScore: 0.45,
      bestTryOnImageUrl: 'https://amiri.com/sunglasses.jpg'
    }
  }
];

function SelectorHost() {
  const [selectedProduct, setSelectedProduct] = React.useState(null);
  const [selectedVariant, setSelectedVariant] = React.useState(null);
  return (
    <div>
      <ProductSelector
        selectedProduct={selectedProduct}
        selectedVariant={selectedVariant}
        onSelectProduct={(p, v) => {
          setSelectedProduct(p);
          setSelectedVariant(v || null);
        }}
      />
      <div data-testid="selected-summary">
        {selectedProduct ? `${selectedProduct._id}:${selectedVariant?.color || 'none'}:${selectedVariant?.sku || 'none'}` : 'empty'}
      </div>
    </div>
  );
}

describe('KD-XX Virtual Try-On Phase 2 — FIT LAB Product Selection & Catalog Regression', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('18a. Loads enriched tryon catalog, filters by eyewear taxonomy, and switches color variants cleanly', async () => {
    apiService.getTryOnCatalog.mockResolvedValueOnce({
      success: true,
      data: MOCK_ENRICHED_CATALOG
    });

    render(<SelectorHost />);

    await waitFor(() => {
      expect(screen.getAllByText('BONES DOWN JACKET').length).toBeGreaterThan(0);
    });

    // Initially picks first product and its first variant
    expect(screen.getByTestId('selected-summary')).toHaveTextContent('prod-jacket:Black:AMOUDO1005-BLK');

    // Switch color variant to White
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByTestId('selected-summary')).toHaveTextContent('prod-jacket:White:AMOUDO1005-WHT');

    // Filter to Eyewear tab -> shows Sunglasses with explicit support limitation note
    fireEvent.click(screen.getByRole('button', { name: 'Kính mắt' }));
    expect(screen.queryByText('BONES DOWN JACKET', { selector: 'h4' })).not.toBeInTheDocument();
    expect(screen.getByText('CLASSIC MA SUNGLASSES', { selector: 'h4' })).toBeInTheDocument();

    // Select Sunglasses -> displays Phase 2 limitation & SKU notice without breaking selection
    fireEvent.click(screen.getByText('CLASSIC MA SUNGLASSES', { selector: 'h4' }));
    await waitFor(() => {
      expect(screen.getByTestId('vto-selected-product-intel')).toHaveTextContent(/cần Eyewear provider ở Phase 3\+/i);
    });
  });

  it('18b. Falls back cleanly to legacy getAllProducts() when /tryon/catalog is unavailable', async () => {
    apiService.getTryOnCatalog.mockResolvedValueOnce({ success: false, error: 'Not found' });
    apiService.getAllProducts.mockResolvedValueOnce({
      success: true,
      data: [
        {
          _id: 'legacy-1',
          name: 'Legacy Silk Shirt',
          brand: 'AMIRI',
          category: 'men',
          price: 1200,
          image: 'https://amiri.com/shirt.jpg',
          tags: ['Shirts']
        }
      ]
    });

    render(<SelectorHost />);

    await waitFor(() => {
      expect(screen.getAllByText('Legacy Silk Shirt').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('selected-summary')).toHaveTextContent('legacy-1:none:none');
  });
});
