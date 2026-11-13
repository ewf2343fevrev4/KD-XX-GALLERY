import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VirtualTryOnStudio from './VirtualTryOnStudio';
import MyTryOnHistory from './MyTryOnHistory';
import * as apiService from '../../../services/api';

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'user-1', name: 'KD Client', role: 'user' },
    token: 'mock-jwt-token',
    isAuthenticated: true
  })
}));

jest.mock('../../../services/api', () => ({
  getTryOnCatalog: jest.fn(),
  getAllProducts: jest.fn()
}));

jest.mock('../../../components/AuthModal', () => () => null);
jest.mock('./HomieModal', () => () => null);
jest.mock('./TryOnResultView', () => () => <div data-testid="tryon-result-view" />);

jest.mock('./PhotoUploader', () => ({ onPhotoUploaded }) => (
  <button
    type="button"
    data-testid="mock-upload-photo"
    onClick={() =>
      onPhotoUploaded({
        assetId: 'asset-person-1',
        previewUrl: '/api/tryon/images/signed-person-1',
        qualityAnalysis: { status: 'READY', score: 95 }
      })
    }
  >
    Mock Upload
  </button>
));

const FULL_OUTFIT_CATALOG = [
  {
    _id: 'prod-top',
    name: 'BONES DOWN JACKET',
    brand: 'AMIRI',
    price: 3000,
    category: 'men',
    sku: 'AMOUDO1005-BLK',
    image: 'https://amiri.com/jacket.jpg',
    taxonomy: { domain: 'clothing', subCategory: 'jackets', filterGroup: 'tops' },
    categorySupport: {
      categoryKey: 'clothing',
      status: 'VERIFIED',
      allowSubmit: true,
      providerId: 'google-vertex-vto-001',
      modelId: 'virtual-try-on-001',
      reason: 'Hỗ trợ clothing.'
    },
    intelligence: { verificationStatus: 'VERIFIED', confidenceScore: 0.96 }
  },
  {
    _id: 'prod-bottom',
    name: 'STACKED DENIM JEANS',
    brand: 'AMIRI',
    price: 1290,
    category: 'men',
    sku: 'AMDNMJ1001-IND',
    image: 'https://amiri.com/jeans.jpg',
    taxonomy: { domain: 'clothing', subCategory: 'jeans', filterGroup: 'bottoms' },
    categorySupport: {
      categoryKey: 'clothing',
      status: 'VERIFIED',
      allowSubmit: true,
      providerId: 'google-vertex-vto-001',
      modelId: 'virtual-try-on-001',
      reason: 'Hỗ trợ clothing.'
    },
    intelligence: { verificationStatus: 'VERIFIED', confidenceScore: 0.94 }
  },
  {
    _id: 'prod-dress',
    name: 'SILK MIDI DRESS',
    brand: 'AMIRI',
    price: 2450,
    category: 'women',
    sku: 'AMWDRS1001',
    image: 'https://amiri.com/dress.jpg',
    taxonomy: { domain: 'clothing', subCategory: 'dresses', filterGroup: 'dresses' },
    categorySupport: {
      categoryKey: 'clothing',
      status: 'VERIFIED',
      allowSubmit: true,
      providerId: 'google-vertex-vto-001',
      modelId: 'virtual-try-on-001',
      reason: 'Single-item only.'
    },
    intelligence: { verificationStatus: 'VERIFIED', confidenceScore: 0.9 }
  },
  {
    _id: 'prod-shoes',
    name: 'MA-1 SNEAKERS',
    brand: 'AMIRI',
    price: 990,
    category: 'shoes',
    sku: 'AMSHOE1001',
    image: 'https://amiri.com/shoes.jpg',
    taxonomy: { domain: 'footwear', subCategory: 'sneakers', filterGroup: 'shoes' },
    categorySupport: {
      categoryKey: 'footwear',
      status: 'LIMITED',
      allowSubmit: false,
      blockCode: 'CATEGORY_DISABLED_LIMITED',
      reason: 'Footwear đang tắt mặc định.'
    },
    intelligence: { verificationStatus: 'VERIFIED', confidenceScore: 0.85 }
  },
  {
    _id: 'prod-glasses',
    name: 'CLASSIC MA SUNGLASSES',
    brand: 'AMIRI',
    price: 550,
    category: 'accessories',
    sku: 'AMEYE1001',
    image: 'https://amiri.com/glasses.jpg',
    taxonomy: { domain: 'accessories', subCategory: 'sunglasses', filterGroup: 'eyewear' },
    categorySupport: {
      categoryKey: 'eyewear',
      status: 'NOT_CONFIGURED',
      allowSubmit: false,
      blockCode: 'PROVIDER_NOT_CONFIGURED',
      reason: 'Eyewear chưa cấu hình provider.'
    },
    intelligence: { verificationStatus: 'VERIFIED', confidenceScore: 0.88 }
  }
];

function setupMocks({ fullOutfitAllowSubmit = false, blockCode = 'FULL_OUTFIT_PENDING_BENCHMARK', totalCredits = 10 } = {}) {
  apiService.getTryOnCatalog.mockResolvedValue({
    success: true,
    data: FULL_OUTFIT_CATALOG
  });

  global.fetch.mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/tryon/account')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            totalCredits,
            membershipType: 'free',
            categoryMatrix: [
              {
                key: 'full_outfit',
                label: 'Full Outfit (Top + Bottom)',
                status: fullOutfitAllowSubmit ? 'VERIFIED' : 'LIMITED',
                allowSubmit: fullOutfitAllowSubmit,
                blockCode: fullOutfitAllowSubmit ? null : blockCode,
                requiredCredits: 2,
                reason: fullOutfitAllowSubmit
                  ? 'Full Outfit Sequential đã được Admin duyệt benchmark.'
                  : 'Full Outfit đang chờ nghiệm thu Benchmark trước khi mở sử dụng.'
              }
            ],
            fullOutfitCapability: {
              mode: 'FULL_OUTFIT',
              allowSubmit: fullOutfitAllowSubmit,
              status: fullOutfitAllowSubmit ? 'VERIFIED' : 'LIMITED',
              blockCode: fullOutfitAllowSubmit ? null : blockCode,
              requiredCredits: 2,
              maxItems: 2,
              reason: fullOutfitAllowSubmit
                ? 'Full Outfit Sequential đã được Admin duyệt benchmark.'
                : 'Full Outfit đang chờ nghiệm thu Benchmark trước khi mở sử dụng.'
            }
          }
        })
      };
    }

    if (u.includes('/tryon/full-outfit/generate')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            jobId: 'job-fo-1',
            mode: 'FULL_OUTFIT',
            creditsCost: 2,
            status: 'QUEUED'
          }
        })
      };
    }

    if (u.includes('/tryon/jobs/job-fo-1')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            jobId: 'job-fo-1',
            mode: 'FULL_OUTFIT',
            creditsCost: 2,
            status: 'PROCESSING',
            executionSteps: [
              { stepIndex: 0, slot: 'BOTTOM', status: 'COMPLETED' },
              { stepIndex: 1, slot: 'TOP', status: 'PROCESSING' }
            ]
          }
        })
      };
    }

    if (u.includes('/tryon/history')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'hist-fo-1',
              jobId: 'hist-fo-1',
              mode: 'FULL_OUTFIT',
              creditsCost: 2,
              status: 'COMPLETED',
              displayStatus: 'COMPLETED',
              isExpired: false,
              productName: 'Full Outfit: STACKED DENIM JEANS + BONES DOWN JACKET',
              productBrand: 'AMIRI',
              category: 'jackets',
              createdAt: '2026-11-12T10:00:00.000Z',
              expiresAt: '2026-11-15T10:00:00.000Z',
              remainingMs: 71 * 3600 * 1000,
              originalPreviewUrl: '/api/tryon/images/orig-fo-1',
              resultPreviewUrl: '/api/tryon/images/res-fo-1',
              originalImage: { assetId: 'a-orig-fo-1', status: 'AVAILABLE', isAvailable: true },
              resultImage: { assetId: 'a-res-fo-1', status: 'AVAILABLE', isAvailable: true },
              productSnapshot: {
                productId: 'prod-bottom',
                productName: 'Full Outfit: STACKED DENIM JEANS + BONES DOWN JACKET',
                brand: 'AMIRI',
                sku: 'AMDNMJ1001-IND',
                variantColor: 'Indigo + Black',
                normalizedDomain: 'clothing',
                normalizedSubCategory: 'jackets'
              },
              outfitItems: [
                { slot: 'BOTTOM', productName: 'STACKED DENIM JEANS', productBrand: 'AMIRI', productSku: 'AMDNMJ1001-IND', color: 'Indigo' },
                { slot: 'TOP', productName: 'BONES DOWN JACKET', productBrand: 'AMIRI', productSku: 'AMOUDO1005-BLK', color: 'Black' }
              ],
              resultQualityCheck: {
                status: 'WARNING',
                notes: 'Phát hiện dấu hiệu sai lệch cần lưu ý ở kết quả ghép tuần tự (ASPECT_RATIO_DRIFT).'
              }
            }
          ],
          pagination: { page: 1, limit: 6, total: 1, totalPages: 1, hasMore: false }
        })
      };
    }

    return {
      ok: true,
      json: async () => ({ success: true, data: {} })
    };
  });
}

describe('Phase 5 — Full Outfit UI, Slot Guards & History Badges', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    Storage.prototype.getItem = jest.fn(() => 'mock-jwt-token');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('01. Switching to Full Outfit renders 2-piece slot tray, locked Footwear/Accessories notice & blocks gated benchmark submit', async () => {
    setupMocks({ fullOutfitAllowSubmit: false, blockCode: 'FULL_OUTFIT_PENDING_BENCHMARK' });
    render(<VirtualTryOnStudio />);

    await waitFor(() => expect(screen.getByTestId('vto-mode-full-outfit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('vto-mode-full-outfit'));

    expect(screen.getByTestId('vto-full-outfit-slots')).toBeInTheDocument();
    expect(screen.getByTestId('vto-outfit-slot-top')).toBeInTheDocument();
    expect(screen.getByTestId('vto-outfit-slot-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('vto-locked-footwear-slot')).toBeInTheDocument();
    expect(screen.getByTestId('vto-full-outfit-gate-banner')).toHaveTextContent(/Benchmark/i);

    fireEvent.click(screen.getByTestId('mock-upload-photo'));
    fireEvent.click(screen.getByText('STACKED DENIM JEANS'));

    const genBtn = screen.getByRole('button', { name: /Full Outfit \(2 Credits\)/i });
    expect(genBtn).toBeDisabled();
  });

  it('02. Full Outfit rejects DRESS, FOOTWEAR & ACCESSORIES selections and submits Top + Bottom when benchmark is approved', async () => {
    setupMocks({ fullOutfitAllowSubmit: true, totalCredits: 10 });
    render(<VirtualTryOnStudio />);

    await waitFor(() => expect(screen.getByTestId('vto-mode-full-outfit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('vto-mode-full-outfit'));
    fireEvent.click(screen.getByTestId('mock-upload-photo'));

    // DRESS is blocked in Full Outfit
    fireEvent.click(screen.getByText('SILK MIDI DRESS'));
    expect(screen.getByText(/thuộc nhóm Đầm liền thân \(DRESS\)/i)).toBeInTheDocument();

    // FOOTWEAR & SUNGLASSES are locked in Full Outfit
    fireEvent.click(screen.getByText('MA-1 SNEAKERS'));
    expect(screen.getByText(/thuộc nhóm Giày đang bị khóa trong Full Outfit/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('CLASSIC MA SUNGLASSES'));
    expect(screen.getByText(/thuộc nhóm Phụ kiện đang bị khóa trong Full Outfit/i)).toBeInTheDocument();

    // Select Top + Bottom (BONES DOWN JACKET is auto-filled or clicked; select STACKED DENIM JEANS)
    fireEvent.click(screen.getAllByText('BONES DOWN JACKET')[0]);
    fireEvent.click(screen.getAllByText('STACKED DENIM JEANS')[0]);

    expect(screen.getByTestId('vto-outfit-slot-top')).toHaveTextContent(/BONES DOWN JACKET/i);
    expect(screen.getByTestId('vto-outfit-slot-bottom')).toHaveTextContent(/STACKED DENIM JEANS/i);

    const genBtn = screen.getByRole('button', { name: /Full Outfit \(2 Credits\)/i });
    await waitFor(() => expect(genBtn).not.toBeDisabled());
    fireEvent.click(genBtn);

    await waitFor(() => {
      const foCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('/tryon/full-outfit/generate'));
      expect(foCalls.length).toBe(1);
      const sentBody = JSON.parse(foCalls[0][1].body);
      expect(sentBody.personImageAssetId).toBe('asset-person-1');
      expect(sentBody.items).toHaveLength(2);
    });
  });

  it('03. MyTryOnHistory renders Full Outfit (2 Cr) badge, outfitItems chips and quality check warning', async () => {
    setupMocks({ fullOutfitAllowSubmit: true });
    render(<MyTryOnHistory token="mock-jwt-token" onBackToStudio={jest.fn()} />);

    await waitFor(() => expect(screen.getByText(/Full Outfit \(2 Cr\)/i)).toBeInTheDocument());
    expect(screen.getByText(/BOTTOM: STACKED DENIM JEANS/i)).toBeInTheDocument();
    expect(screen.getByText(/TOP: BONES DOWN JACKET/i)).toBeInTheDocument();
    expect(screen.getByText(/ASPECT_RATIO_DRIFT/i)).toBeInTheDocument();
  });
});
