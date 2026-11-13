import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VirtualTryOnStudio from './VirtualTryOnStudio';

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'user-a', name: 'KD Client', role: 'user' },
    token: 'mock-jwt-token',
    isAuthenticated: true
  })
}));

jest.mock('../../../components/AuthModal', () => () => null);
jest.mock('./HomieModal', () => () => null);
jest.mock('./PhotoUploader', () => () => <div data-testid="mock-photo-uploader" />);
jest.mock('./ProductSelector', () => () => <div data-testid="mock-product-selector" />);
jest.mock('./TryOnResultView', () => () => <div data-testid="tryon-result-view" />);

const now = Date.now();
const MOCK_HISTORY_ITEMS = [
  {
    id: 'job-completed-1',
    jobId: 'job-completed-1',
    status: 'COMPLETED',
    displayStatus: 'COMPLETED',
    createdAt: new Date(now - 3600 * 1000).toISOString(),
    expiresAt: new Date(now + 71 * 3600 * 1000).toISOString(),
    remainingMs: 71 * 3600 * 1000,
    isExpired: false,
    productSnapshot: {
      productId: 'prod-100',
      productName: 'BONES DOWN JACKET',
      brand: 'AMIRI',
      sku: 'AMOUDO1005-001',
      variantSku: 'AMOUDO1005-BLK',
      variantColor: 'Black',
      variantSize: 'M',
      normalizedDomain: 'clothing',
      normalizedSubCategory: 'jackets'
    },
    originalPreviewUrl: '/api/tryon/images/orig-tok-1',
    resultPreviewUrl: '/api/tryon/images/res-tok-1',
    originalImage: { assetId: 'a-orig-1', status: 'AVAILABLE', isAvailable: true },
    resultImage: { assetId: 'a-res-1', status: 'AVAILABLE', isAvailable: true }
  },
  {
    id: 'job-expired-2',
    jobId: 'job-expired-2',
    status: 'COMPLETED',
    displayStatus: 'EXPIRED',
    createdAt: new Date(now - 75 * 3600 * 1000).toISOString(),
    expiresAt: new Date(now - 3 * 3600 * 1000).toISOString(),
    remainingMs: 0,
    isExpired: true,
    productSnapshot: {
      productId: 'prod-200',
      productName: 'EXPIRED VARSITY JACKET',
      brand: 'AMIRI',
      sku: 'AM-OLD-72H',
      variantSku: 'AM-OLD-72H',
      variantColor: 'Navy',
      normalizedDomain: 'clothing',
      normalizedSubCategory: 'outerwear'
    },
    originalPreviewUrl: null,
    resultPreviewUrl: null,
    originalImage: { assetId: 'a-orig-2', status: 'EXPIRED', isAvailable: false, isExpired: true },
    resultImage: { assetId: 'a-res-2', status: 'EXPIRED', isAvailable: false, isExpired: true }
  },
  {
    id: 'job-rec-3',
    jobId: 'job-rec-3',
    status: 'RECONCILIATION_REQUIRED',
    displayStatus: 'RECONCILIATION_REQUIRED',
    createdAt: new Date(now - 1200 * 1000).toISOString(),
    expiresAt: new Date(now + 71 * 3600 * 1000).toISOString(),
    remainingMs: 71 * 3600 * 1000,
    isExpired: false,
    productSnapshot: {
      productId: 'prod-300',
      productName: 'CRYSTAL MX1 JEAN',
      brand: 'AMIRI',
      sku: 'AM-MX1-REC',
      variantSku: 'AM-MX1-REC',
      variantColor: 'Black',
      normalizedDomain: 'clothing',
      normalizedSubCategory: 'jeans'
    },
    originalPreviewUrl: '/api/tryon/images/orig-tok-3',
    resultPreviewUrl: null,
    originalImage: { assetId: 'a-orig-3', status: 'AVAILABLE', isAvailable: true },
    resultImage: { assetId: null, status: 'NONE', isAvailable: false },
    errorMessage: 'Yêu cầu đang chờ đối soát với Google Cloud'
  },
  {
    id: 'job-can-4',
    jobId: 'job-can-4',
    status: 'CANCELLED',
    displayStatus: 'CANCELLED',
    createdAt: new Date(now - 600 * 1000).toISOString(),
    expiresAt: new Date(now + 71 * 3600 * 1000).toISOString(),
    remainingMs: 71 * 3600 * 1000,
    isExpired: false,
    productSnapshot: {
      productId: 'prod-400',
      productName: 'SILK BOWLING SHIRT',
      brand: 'AMIRI',
      sku: 'AM-CAN-04',
      variantSku: 'AM-CAN-04',
      variantColor: 'Cream',
      normalizedDomain: 'clothing',
      normalizedSubCategory: 'shirts'
    },
    originalPreviewUrl: '/api/tryon/images/orig-tok-4',
    resultPreviewUrl: null,
    originalImage: { assetId: 'a-orig-4', status: 'AVAILABLE', isAvailable: true },
    resultImage: { assetId: null, status: 'NONE', isAvailable: false },
    errorMessage: 'Người dùng đã hủy phiên thử đồ'
  }
];

describe('KD-XX Virtual Try-On Phase 3 — My Try-On History UI & Interactions', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (url, opts = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/tryon/account')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { totalCredits: 8, membershipType: 'free', isUnlimited: false } })
        };
      }
      if (urlStr.includes('/tryon/history/job-completed-1') && (!opts.method || opts.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: MOCK_HISTORY_ITEMS[0] })
        };
      }
      if (urlStr.includes('/tryon/history/job-completed-1/result-image') && opts.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ success: true, message: 'Đã xóa ảnh kết quả vĩnh viễn khỏi bộ nhớ riêng tư', data: { deleted: true } })
        };
      }
      if (urlStr.includes('/tryon/history') && opts.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ success: true, message: 'Đã xóa toàn bộ lịch sử và hình ảnh thử đồ của bạn khỏi máy chủ', data: { clearedJobsCount: 4 } })
        };
      }
      if (urlStr.includes('/tryon/history')) {
        const query = urlStr.split('?')[1] || '';
        const sp = new URLSearchParams(query);
        const page = Number(sp.get('page') || 1);
        const status = sp.get('status') || 'ALL';
        const filtered = status === 'ALL'
          ? MOCK_HISTORY_ITEMS
          : MOCK_HISTORY_ITEMS.filter(i => i.displayStatus === status || i.status === status);
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: filtered,
            pagination: {
              page,
              limit: 6,
              total: filtered.length,
              totalPages: 2,
              hasMore: page === 1 && status === 'ALL'
            }
          })
        };
      }
      return { ok: true, json: async () => ({ success: true, data: {} }) };
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders My Try-On History cards with snapshot metadata, expired state, compare modal, delete & clear-all controls', async () => {
    render(<VirtualTryOnStudio />);

    // Switch to My Try-On History tab
    const historyTab = await screen.findByRole('tab', { name: /My Try-On History/i });
    fireEvent.click(historyTab);

    // Cards render immutable productSnapshot details
    await waitFor(() => {
      expect(screen.getByText('BONES DOWN JACKET')).toBeInTheDocument();
    });
    expect(screen.getByText('AMOUDO1005-BLK')).toBeInTheDocument();
    expect(screen.getByText(/Black • M/i)).toBeInTheDocument();
    expect(screen.getByText('EXPIRED VARSITY JACKET')).toBeInTheDocument();
    expect(screen.getByText('CRYSTAL MX1 JEAN')).toBeInTheDocument();
    expect(screen.getByText('SILK BOWLING SHIRT')).toBeInTheDocument();

    // Expired item shows honest 72h expiry state (no fake/broken result img)
    expect(screen.getByText(/Ảnh kết quả đã hết hạn \(72h\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Hết hạn ảnh \(72h\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Đang đối soát AI/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Đã hủy/i).length).toBeGreaterThanOrEqual(1);

    // Open Compare / Detail Modal on first card
    const viewButtons = screen.getAllByRole('button', { name: /Xem & So sánh/i });
    fireEvent.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Chi tiết phiên thử đồ/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Trượt so sánh/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ảnh kết quả lớn/i })).toBeInTheDocument();

    // Delete result image inside modal triggers DELETE endpoint cleanly
    fireEvent.click(screen.getByRole('button', { name: /Xóa ảnh kết quả/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tryon/history/job-completed-1/result-image'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    // Close modal and trigger Pagination "Sau"
    fireEvent.click(screen.getByRole('button', { name: /Đóng chi tiết/i }));
    fireEvent.click(screen.getByRole('button', { name: /Sau/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.any(Object)
      );
    });

    // Trigger "Xóa toàn bộ" confirmation bar -> confirm
    fireEvent.click(screen.getByRole('button', { name: /Xóa toàn bộ/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận xóa tất cả/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tryon\/history$/),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
