import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductSelector from './ProductSelector';
import TryOnResultView from './TryOnResultView';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}), { virtual: true });

jest.mock('../../../services/api', () => ({
  getTryOnCatalog: jest.fn().mockResolvedValue({ success: true, data: [] }),
  getAllProducts: jest.fn().mockResolvedValue({ success: true, data: [] })
}));

describe('KD-XX Level 2 — Tuck-in vs Untucked Styling Frontend UI', () => {
  it('01. renders tuck style selector in Full Outfit mode and triggers onUpdateTuckStyle', async () => {
    const mockUpdateTuckStyle = jest.fn();
    const mockSlots = {
      top: {
        product: { _id: 'shirt-1', name: 'AMIRI Silk Bowling Shirt', category: 'shirts' }
      },
      bottom: {
        product: { _id: 'jeans-1', name: 'AMIRI Distressed Jeans', category: 'jeans' }
      }
    };

    render(
      <ProductSelector
        selectedProduct={null}
        onSelectProduct={jest.fn()}
        tryOnMode="full_outfit"
        fullOutfitSlots={mockSlots}
        tuckStyle="untucked"
        onUpdateTuckStyle={mockUpdateTuckStyle}
      />
    );

    expect(screen.getByTestId('vto-tuck-style-selector')).toBeInTheDocument();
    const tuckedBtn = screen.getByTestId('vto-tuck-btn-tucked');
    expect(tuckedBtn).not.toBeDisabled();

    fireEvent.click(tuckedBtn);
    expect(mockUpdateTuckStyle).toHaveBeenCalledWith('tucked');

    await waitFor(() => {
      expect(screen.queryByText(/Đang tải danh mục/i)).not.toBeInTheDocument();
    });
  });

  it('02. disables tuck-in button and displays fashion notice when top is an outerwear jacket', async () => {
    const mockSlots = {
      top: {
        product: { _id: 'jacket-1', name: 'AMIRI Leather Biker Jacket', category: 'jackets' }
      },
      bottom: {
        product: { _id: 'jeans-1', name: 'AMIRI Distressed Jeans', category: 'jeans' }
      }
    };

    render(
      <ProductSelector
        selectedProduct={null}
        onSelectProduct={jest.fn()}
        tryOnMode="full_outfit"
        fullOutfitSlots={mockSlots}
        tuckStyle="untucked"
        onUpdateTuckStyle={jest.fn()}
      />
    );

    const tuckedBtn = screen.getByTestId('vto-tuck-btn-tucked');
    expect(tuckedBtn).toBeDisabled();
    expect(screen.getByTestId('vto-outerwear-tuck-notice')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Đang tải danh mục/i)).not.toBeInTheDocument();
    });
  });

  it('03. renders tuck badge in TryOnResultView for Full Outfit results', () => {
    render(
      <TryOnResultView
        originalPhotoUrl="https://example.com/orig.jpg"
        resultPhotoUrl="https://example.com/res.jpg"
        product={{ name: 'AMIRI Silk Shirt' }}
        mode="FULL_OUTFIT"
        outfitItems={[
          { productName: 'AMIRI Silk Shirt' },
          { productName: 'AMIRI Jeans' }
        ]}
        tuckStyle="tucked"
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-123"
      />
    );

    const badge = screen.getByTestId('vto-result-tuck-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/Sơ vin \(Tuck-in\)/i);
  });
});
