import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TryOnResultView from './TryOnResultView';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}), { virtual: true });

jest.mock('../../../services/api', () => ({
  __esModule: true,
  default: {
    stackTryOnAccessory: jest.fn().mockResolvedValue({
      success: true,
      data: {
        resultPreviewUrl: '/images/stacked-result.png',
        stackedAccessories: [{ productName: 'Classic MA Sunglasses', slot: 'Kính Râm' }]
      }
    })
  }
}));

describe('KD-XX Level 6 — Luxury VIP Accessory Stacking UI', () => {
  it('01. renders Level 6 VIP Accessory card with all 4 luxury presets', () => {
    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    expect(screen.getByTestId('vto-level6-accessory-stacker')).toBeInTheDocument();
    expect(screen.getByText(/Phối Thêm Phụ Kiện Xa Xỉ \(KD-XX VIP Level 6\)/i)).toBeInTheDocument();
    expect(screen.getByText('Classic MA Sunglasses')).toBeInTheDocument();
    expect(screen.getByText('Bandana Leather Bag')).toBeInTheDocument();
    expect(screen.getByText('MA Leather Belt')).toBeInTheDocument();
    expect(screen.getByText('AMIRI Script Logo Hat')).toBeInTheDocument();
  });

  it('02. clicking an accessory preset triggers stacking and shows success notification', async () => {
    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        jobId="job-123"
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    const sunglassesBtn = screen.getByText('Classic MA Sunglasses');
    fireEvent.click(sunglassesBtn);

    await waitFor(() => {
      expect(screen.getByTestId('vto-stack-success')).toBeInTheDocument();
    });

    expect(screen.getByText(/Đã phối Kính Râm \(Classic MA Sunglasses\)/i)).toBeInTheDocument();
  });

  it('03. renders button to transition to Canvas Studio', () => {
    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    expect(screen.getByRole('button', { name: /Mở Trên Canvas Studio/i })).toBeInTheDocument();
  });
});
