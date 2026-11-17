import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TryOnResultView from './TryOnResultView';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}), { virtual: true });

describe('KD-XX Level 5 — AI Body Measurement & Size Recommendation UI', () => {
  const mockSizeRecommendation = {
    measurements: {
      referenceHeightCm: 174,
      referenceWeightKg: 66,
      estimatedMetrics: {
        shoulderWidthCm: 46,
        chestCircumferenceCm: 97,
        waistCircumferenceCm: 80,
        hipCircumferenceCm: 95,
        inseamLengthCm: 70,
        totalLegLengthCm: 101
      },
      proportions: {
        legToBodyRatio: 0.58,
        torsoToLegRatio: '42 : 58',
        vTaperIndex: 0.99
      },
      bodyShape: 'BALANCED_TRAPEZOID',
      bodyShapeLabel: 'Hình Thang Cân Đối (Standard Model)',
      bodyShapeDesc: 'Tỷ lệ vai ngực và thắt lưng hài hòa lý tưởng.'
    },
    itemRecommendations: [
      {
        productName: 'AMIRI Silk Bowling Shirt',
        slot: 'TOP',
        categoryGroup: 'Clothing Tops',
        recommendedSize: 'M',
        alternativeSize: 'L',
        fitSilhouette: 'Standard True-to-Size',
        sizeSystem: 'Alpha (S/M/L/XL)',
        fitAdvice: 'Dựa trên vòng ngực ~97cm và khung vai 46cm, size M sẽ mang lại độ vừa vặn hoàn hảo nhất.'
      },
      {
        productName: 'AMIRI MX1 Crystal Jean',
        slot: 'BOTTOM',
        categoryGroup: 'Clothing Bottoms',
        recommendedSize: '31',
        alternativeSize: '32',
        fitSilhouette: 'Stacked Skinny / Tapered Leg',
        sizeSystem: 'Denim Waist (28 - 36)',
        fitAdvice: 'Vòng eo ước tính ~80cm tương thích lý tưởng với quần size 31.'
      },
      {
        productName: 'AMIRI MA-1 Sneakers',
        slot: 'FOOTWEAR',
        categoryGroup: 'Footwear & Shoes',
        recommendedSize: '41',
        alternativeSize: '42',
        fitSilhouette: 'Chunky Padded Comfort (True-to-Size)',
        sizeSystem: 'European Sizing (EU)',
        fitAdvice: 'Khuyến nghị chọn size 41 EU để ôm vừa mu bàn chân.'
      }
    ],
    summary: {
      bodyShapeLabel: 'Hình Thang Cân Đối (Standard Model)',
      fitSummaryText: 'Vóc dáng Hình Thang Cân Đối với tỷ lệ chân dài 58% tổng chiều cao.',
      stylingTip: 'Tỷ lệ vai ngực và thắt lưng hài hòa lý tưởng.'
    }
  };

  it('01. renders Level 5 AI Body Fit card when sizeRecommendation is present', () => {
    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        sizeRecommendation={mockSizeRecommendation}
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    expect(screen.getByTestId('vto-level5-size-analyzer')).toBeInTheDocument();
    expect(screen.getByText(/Phân Tích Dáng & Gợi Ý Size May Đo/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Hình Thang Cân Đối \(Standard Model\)/i).length).toBeGreaterThan(0);
  });

  it('02. renders recommended sizes for Top (M), Bottom (31), and Footwear (41)', () => {
    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        sizeRecommendation={mockSizeRecommendation}
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    expect(screen.getByText('Size M')).toBeInTheDocument();
    expect(screen.getByText('Size 31')).toBeInTheDocument();
    expect(screen.getByText('Size 41')).toBeInTheDocument();
    expect(screen.getByText(/Vòng eo ước tính ~80cm/i)).toBeInTheDocument();
  });

  it('03. toggles anatomical metrics breakdown when clicking the details accordion', () => {
    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        sizeRecommendation={mockSizeRecommendation}
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    // Initially metrics details are collapsed
    expect(screen.queryByText('Khung Vai')).not.toBeInTheDocument();

    // Click toggle
    const toggleBtn = screen.getByText(/Xem thông số giải phẫu học ước tính/i);
    fireEvent.click(toggleBtn);

    // Metrics are now visible
    expect(screen.getByText('Khung Vai')).toBeInTheDocument();
    expect(screen.getByText('46 cm')).toBeInTheDocument();
    expect(screen.getByText('Vòng Ngực')).toBeInTheDocument();
    expect(screen.getByText('97 cm')).toBeInTheDocument();
    expect(screen.getByText('Vòng Eo')).toBeInTheDocument();
    expect(screen.getByText('80 cm')).toBeInTheDocument();
    expect(screen.getByText('Chiều Dài Chân')).toBeInTheDocument();
    expect(screen.getByText('101 cm')).toBeInTheDocument();
  });

  it('04. allows copying measurements to clipboard', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve())
      }
    });

    render(
      <TryOnResultView
        originalPhotoUrl="/images/orig.png"
        resultPhotoUrl="/images/res.png"
        mode="FULL_OUTFIT"
        sizeRecommendation={mockSizeRecommendation}
        onReset={jest.fn()}
        onDeleteAsset={jest.fn()}
        assetId="asset-res-123"
      />
    );

    const copyBtn = screen.getByRole('button', { name: /Sao chép số đo/i });
    fireEvent.click(copyBtn);

    await screen.findByText(/Đã sao chép số đo/i);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('SỐ ĐO CƠ THỂ & SIZE ĐỀ XUẤT KD-XX')
    );
  });
});
