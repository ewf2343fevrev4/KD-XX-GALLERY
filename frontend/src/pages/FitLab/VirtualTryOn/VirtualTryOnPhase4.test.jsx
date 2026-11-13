import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VirtualTryOnStudio from './VirtualTryOnStudio';
import AdminVirtualTryOn from '../../admin/AdminVirtualTryOn';
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
jest.mock('./MyTryOnHistory', () => ({ onBackToStudio }) => (
  <div data-testid="my-tryon-history-view">
    <button type="button" onClick={onBackToStudio}>Quay Lại Studio</button>
  </div>
));
jest.mock('../../admin/AdminProductIntelligence', () => () => <div data-testid="admin-intel-panel" />);

jest.mock('./PhotoUploader', () => ({ onPhotoUploaded }) => (
  <button
    type="button"
    data-testid="mock-upload-photo"
    onClick={() =>
      onPhotoUploaded({
        assetId: 'asset-1',
        previewUrl: '/api/tryon/images/signed-1',
        qualityAnalysis: { status: 'READY', score: 96 }
      })
    }
  >
    Mock Upload
  </button>
));

const MOCK_CATALOG_PRODUCTS = [
  {
    _id: 'prod-clothing',
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
      providerName: 'Google Cloud Vertex AI',
      modelId: 'virtual-try-on-001',
      reason: 'Hỗ trợ thử đơn món trang phục qua Google Cloud virtual-try-on-001.'
    },
    intelligence: { verificationStatus: 'VERIFIED', confidenceScore: 0.95 }
  },
  {
    _id: 'prod-footwear',
    name: 'MA-1 SNEAKERS',
    brand: 'AMIRI',
    price: 990,
    category: 'shoes',
    taxonomy: { domain: 'footwear', subCategory: 'sneakers', filterGroup: 'shoes' },
    categorySupport: {
      categoryKey: 'footwear',
      status: 'LIMITED',
      allowSubmit: false,
      blockCode: 'CATEGORY_DISABLED_LIMITED',
      providerId: 'google-vertex-vto-001',
      modelId: 'virtual-try-on-001',
      reason: 'Danh mục "footwear" đang ở mức LIMITED và được tắt mặc định để đảm bảo chất lượng hình ảnh.'
    },
    intelligence: { verificationStatus: 'UNVERIFIED', confidenceScore: 0.5 }
  },
  {
    _id: 'prod-eyewear',
    name: 'CLASSIC MA SUNGLASSES',
    brand: 'AMIRI',
    price: 550,
    category: 'accessories',
    taxonomy: { domain: 'accessories', subCategory: 'sunglasses', filterGroup: 'eyewear' },
    categorySupport: {
      categoryKey: 'eyewear',
      status: 'NOT_CONFIGURED',
      allowSubmit: false,
      blockCode: 'PROVIDER_NOT_CONFIGURED',
      reason: 'Danh mục eyewear chưa cấu hình provider chuyên biệt (FITTINGBOX_API_KEY / BANUBA_CLIENT_TOKEN).'
    },
    intelligence: { verificationStatus: 'UNVERIFIED', confidenceScore: 0.45 }
  },
  {
    _id: 'prod-keychain',
    name: 'MA BANDANA KEYCHAIN',
    brand: 'AMIRI',
    price: 490,
    category: 'accessories',
    tags: ['Belts', 'Hardware', 'Keychains', 'Accessories'],
    taxonomy: {
      domain: 'accessories',
      subCategory: 'keychains',
      filterGroup: 'accessories',
      needsReview: true,
      conflictReason: 'Tags chứa nhiều danh mục xung đột (belts, keychains) so với tên sản phẩm.'
    },
    categorySupport: {
      categoryKey: 'keychains',
      status: 'UNSUPPORTED',
      allowSubmit: false,
      needsReview: true,
      reason: 'Tags chứa nhiều danh mục xung đột (belts, keychains) so với tên sản phẩm.'
    },
    intelligence: { verificationStatus: 'NEEDS_REVIEW', confidenceScore: 0.4 }
  },
  {
    _id: 'prod-deprecated',
    name: 'LEGACY SILK SHIRT',
    brand: 'AMIRI',
    price: 1200,
    category: 'men',
    taxonomy: { domain: 'clothing', subCategory: 'shirts', filterGroup: 'tops' },
    categorySupport: {
      categoryKey: 'clothing',
      status: 'DEPRECATED',
      allowSubmit: false,
      blockCode: 'MODEL_RETIRED',
      reason: 'Model "virtual-try-on-001" đã ngừng phục vụ (retirement: 2027-03-15).'
    },
    intelligence: { verificationStatus: 'VERIFIED', confidenceScore: 0.9 }
  }
];

describe('Phase 4 — Multi-Category Capabilities & Admin Provider UI', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    Storage.prototype.getItem = jest.fn(() => 'admin-jwt-token');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function setupStudioWithCatalog(products = MOCK_CATALOG_PRODUCTS) {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          totalCredits: 10,
          membershipType: 'free',
          categoryMatrix: []
        }
      })
    });
    apiService.getTryOnCatalog.mockResolvedValue({
      success: true,
      data: products
    });
  }

  it('01. Verified Clothing shows VERIFIED badge + virtual-try-on-001 and enables Generate button after upload', async () => {
    setupStudioWithCatalog();
    render(<VirtualTryOnStudio />);

    await waitFor(() => {
      expect(screen.getByTestId('vto-selected-capability-badge')).toHaveTextContent('VERIFIED');
    });
    expect(screen.getByTestId('vto-selected-product-intel')).toHaveTextContent(/virtual-try-on-001/);

    fireEvent.click(screen.getByTestId('mock-upload-photo'));
    const genBtn = screen.getByRole('button', { name: /Bắt Đầu Thử Đồ/i });
    expect(genBtn).not.toBeDisabled();
  });

  it('02. Footwear (LIMITED) displays warning banner and disables Generate button', async () => {
    setupStudioWithCatalog();
    render(<VirtualTryOnStudio />);

    await waitFor(() => expect(screen.getByText('MA-1 SNEAKERS')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-upload-photo'));
    fireEvent.click(screen.getByText('MA-1 SNEAKERS'));

    const banner = await screen.findByTestId('vto-category-support-banner');
    expect(banner).toHaveTextContent(/LIMITED/i);
    expect(screen.getByRole('button', { name: /Bắt Đầu Thử Đồ/i })).toBeDisabled();
  });

  it('03. Eyewear (NOT_CONFIGURED) displays capability banner and blocks submit', async () => {
    setupStudioWithCatalog();
    render(<VirtualTryOnStudio />);

    await waitFor(() => expect(screen.getByText('CLASSIC MA SUNGLASSES')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-upload-photo'));
    fireEvent.click(screen.getByText('CLASSIC MA SUNGLASSES'));

    const banner = await screen.findByTestId('vto-category-support-banner');
    expect(banner).toHaveTextContent(/NOT_CONFIGURED/i);
    expect(screen.getByRole('button', { name: /Bắt Đầu Thử Đồ/i })).toBeDisabled();
  });

  it('04. MA BANDANA KEYCHAIN (NEEDS_REVIEW) displays NEEDS_REVIEW badge and blocks submit', async () => {
    setupStudioWithCatalog();
    render(<VirtualTryOnStudio />);

    await waitFor(() => expect(screen.getByText('MA BANDANA KEYCHAIN')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-upload-photo'));
    fireEvent.click(screen.getByText('MA BANDANA KEYCHAIN'));

    const banner = await screen.findByTestId('vto-category-support-banner');
    expect(banner).toHaveTextContent(/NEEDS_REVIEW/i);
    expect(banner).toHaveTextContent(/belts, keychains/i);
    expect(screen.getByRole('button', { name: /Bắt Đầu Thử Đồ/i })).toBeDisabled();
  });

  it('05. DEPRECATED retired model blocks Generate button clearly', async () => {
    setupStudioWithCatalog();
    render(<VirtualTryOnStudio />);

    await waitFor(() => expect(screen.getByText('LEGACY SILK SHIRT')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-upload-photo'));
    fireEvent.click(screen.getByText('LEGACY SILK SHIRT'));

    const banner = await screen.findByTestId('vto-category-support-banner');
    expect(banner).toHaveTextContent(/DEPRECATED/i);
    expect(screen.getByRole('button', { name: /Bắt Đầu Thử Đồ/i })).toBeDisabled();
  });

  it('06. My Try-On History tab remains cleanly integrated in VirtualTryOnStudio', async () => {
    setupStudioWithCatalog();
    render(<VirtualTryOnStudio />);

    await waitFor(() => expect(screen.getAllByText('BONES DOWN JACKET').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: /My Try-On History/i }));
    expect(screen.getByTestId('my-tryon-history-view')).toBeInTheDocument();
  });

  it('07. AdminVirtualTryOn renders Deprecation warning, Category Matrix, zero fake usage & blocks unconfigured toggle', async () => {
    const mockRegistryPayload = {
      providers: [
        {
          providerId: 'google-vertex-vto-001',
          providerName: 'Google Cloud Vertex AI',
          displayName: 'Google Cloud Vertex AI Virtual Try-On (v001)',
          modelId: 'virtual-try-on-001',
          region: 'us-central1',
          available: true,
          baseAvailable: true,
          verificationStatus: 'VERIFIED',
          lifecycleStage: 'DEPRECATION_ANNOUNCED',
          deprecationDate: '2026-09-14',
          retirementDate: '2027-03-15',
          isPastRetirement: false,
          credentialsConfigured: true,
          requiredEnvVars: ['GCP_PROJECT_ID', 'GCP_LOCATION', 'GCP_TRYON_MODEL'],
          estimatedCost: { unitCostUsd: 0.06 },
          limitations: ['Clothing single-item only'],
          circuitBreaker: { state: 'CLOSED', consecutiveFailures: 0 }
        },
        {
          providerId: 'fashn-tryon-max-stub',
          providerName: 'FASHN AI',
          displayName: 'FASHN AI Try-On Max (tryon-max)',
          modelId: 'tryon-max',
          region: 'global',
          available: false,
          baseAvailable: false,
          verificationStatus: 'NOT_CONFIGURED',
          lifecycleStage: 'NOT_INTEGRATED',
          credentialsConfigured: false,
          requiredEnvVars: ['FASHN_API_KEY'],
          estimatedCost: { unitCostUsd: 0.075 },
          limitations: ['Not configured'],
          circuitBreaker: { state: 'CLOSED', consecutiveFailures: 0 }
        }
      ],
      categoryMatrix: [
        {
          key: 'clothing',
          label: 'Clothing (Áo, Quần, Áo khoác)',
          status: 'VERIFIED',
          allowSubmit: true,
          providerName: 'Google Cloud Vertex AI',
          modelId: 'virtual-try-on-001',
          retirementDate: '2027-03-15',
          reason: 'Verified Clothing single item.'
        },
        {
          key: 'footwear',
          label: 'Footwear (Sneakers)',
          status: 'LIMITED',
          allowSubmit: false,
          reason: 'Disabled by default.'
        }
      ],
      usageStats: {
        windowDays: 30,
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        failureRate: 0,
        totalEstimatedUsd: 0,
        byProvider: [],
        byCategory: []
      },
      auditLogs: []
    };

    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/tryon/admin/stats')) {
        return { ok: true, json: async () => ({ success: true, data: { totalJobs: 0 } }) };
      }
      if (String(url).includes('/tryon/admin/jobs')) {
        return { ok: true, json: async () => ({ success: true, data: [] }) };
      }
      if (String(url).includes('/tryon/admin/ledgers')) {
        return { ok: true, json: async () => ({ success: true, data: [] }) };
      }
      if (String(url).includes('/tryon/admin/providers') && !String(url).includes('/fashn')) {
        return { ok: true, json: async () => ({ success: true, data: mockRegistryPayload }) };
      }
      return { ok: true, json: async () => ({ success: true, data: mockRegistryPayload }) };
    });

    render(<AdminVirtualTryOn />);

    const depBanner = await screen.findByTestId('admin-vto-deprecation-warning');
    expect(depBanner).toHaveTextContent('2026-09-14');
    expect(depBanner).toHaveTextContent('2027-03-15');

    fireEvent.click(screen.getByRole('button', { name: /Quản Lý AI Providers/i }));

    const registry = await screen.findByTestId('admin-provider-registry');
    expect(registry).toHaveTextContent('FASHN_API_KEY');
    expect(registry).toHaveTextContent('Chưa có dữ liệu job mới');

    // NOT_CONFIGURED provider toggle button must remain disabled
    const activateBtns = screen.getAllByRole('button', { name: /Kích Hoạt Provider/i });
    expect(activateBtns[0]).toBeDisabled();
  });
});
