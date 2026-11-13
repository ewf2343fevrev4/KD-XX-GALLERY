import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { resolveApiConfig, buildApiUrl, buildAssetUrl } from '../../../config/apiConfig';
import VirtualTryOnStudio from './VirtualTryOnStudio';

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'user-1', name: 'KD Client', role: 'user' },
    token: 'mock-jwt-token',
    isAuthenticated: true
  })
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
        assetId: 'asset-1',
        previewUrl: '/api/tryon/images/signed-1',
        qualityAnalysis: { status: 'READY', score: 95 }
      })
    }
  >
    Mock Upload
  </button>
));

jest.mock('./ProductSelector', () => ({ onSelectProduct }) => (
  <button
    type="button"
    data-testid="mock-select-product"
    onClick={() =>
      onSelectProduct({
        _id: 'prod-1',
        name: 'AMIRI Bomber Jacket',
        price: 2500
      })
    }
  >
    Mock Select Product
  </button>
));

describe('KD-XX Virtual Try-On Phase 1 — Frontend Config & Reconciliation UI', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('16. resolveApiConfig falls back cleanly to local dev origin when REACT_APP_API_URL is unset', () => {
    const devCfg = resolveApiConfig('');
    expect(devCfg.origin).toBe('http://localhost:5000');
    expect(devCfg.apiBaseUrl).toBe('http://localhost:5000/api');
    expect(devCfg.isCustomEnv).toBe(false);
    expect(buildApiUrl('/tryon/account')).toBe('http://localhost:5000/api/tryon/account');
    expect(buildAssetUrl('/api/tryon/images/tok123')).toBe('http://localhost:5000/api/tryon/images/tok123');
  });

  it('17. resolveApiConfig supports custom production domain with or without /api suffix', () => {
    const originOnly = resolveApiConfig('https://api.kdxx.luxury/');
    expect(originOnly.origin).toBe('https://api.kdxx.luxury');
    expect(originOnly.apiBaseUrl).toBe('https://api.kdxx.luxury/api');
    expect(originOnly.isCustomEnv).toBe(true);

    const withApi = resolveApiConfig('https://shop-api.example.com/api/');
    expect(withApi.origin).toBe('https://shop-api.example.com');
    expect(withApi.apiBaseUrl).toBe('https://shop-api.example.com/api');
  });

  it('stops loading spinner cleanly on RECONCILIATION_REQUIRED and supports manual status re-check', async () => {
    global.fetch
      // 1. Initial GET /api/tryon/account
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { totalCredits: 5, membershipType: 'free', isUnlimited: false }
        })
      })
      // 2. POST /api/tryon/generate -> QUEUED
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { jobId: 'job-rec-001', status: 'QUEUED', productName: 'AMIRI Bomber Jacket' }
        })
      })
      // 3. First timer poll GET /api/tryon/jobs/job-rec-001 -> RECONCILIATION_REQUIRED
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            jobId: 'job-rec-001',
            status: 'RECONCILIATION_REQUIRED',
            providerRequestId: 'vto-req-timeout-01',
            errorMessage: 'Yêu cầu tới Google Cloud vượt quá thời gian phản hồi. Hệ thống đang đối soát trạng thái.'
          }
        })
      })
      // 4. Manual click "Kiểm Tra Lại Trạng Thái" -> Resolved to FAILED with refund
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            jobId: 'job-rec-001',
            status: 'FAILED',
            errorMessage: '[Admin đối soát — Hoàn credit] Timeout confirmed in GCP logs'
          }
        })
      })
      // 5. Refresh account balance after refund
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { totalCredits: 5, membershipType: 'free', isUnlimited: false }
        })
      });

    render(<VirtualTryOnStudio />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('mock-upload-photo'));
    fireEvent.click(screen.getByTestId('mock-select-product'));
    fireEvent.click(screen.getByRole('button', { name: /Bắt Đầu Thử Đồ/i }));

    await waitFor(() => {
      expect(screen.getByText(/Đang Trong Hàng Đợi AI/i)).toBeInTheDocument();
    });

    // Advance 2500ms polling timer -> transitions into RECONCILIATION_REQUIRED
    await act(async () => {
      jest.advanceTimersByTime(2600);
    });

    await waitFor(() => {
      expect(screen.getByTestId('vto-reconciliation-banner')).toBeInTheDocument();
    });
    expect(screen.getByText(/Đang Đối Soát Trạng Thái Xử Lý AI/i)).toBeInTheDocument();
    // Spinner stopped cleanly (neither queued nor processing banner text active)
    expect(screen.queryByText(/Đang Trong Hàng Đợi AI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Cloud AI Đang Xử Lý/i)).not.toBeInTheDocument();

    // User clicks manual re-check button
    fireEvent.click(screen.getByRole('button', { name: /Kiểm Tra Lại Trạng Thái/i }));

    await waitFor(() => {
      expect(screen.getByText(/Timeout confirmed in GCP logs/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('vto-reconciliation-banner')).not.toBeInTheDocument();
  });
});
