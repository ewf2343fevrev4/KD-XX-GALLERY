import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Zap,
  Lock,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  History,
  Layers
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import AuthModal from '../../../components/AuthModal';
import PhotoUploader from './PhotoUploader';
import ProductSelector from './ProductSelector';
import TryOnResultView from './TryOnResultView';
import MyTryOnHistory from './MyTryOnHistory';
import HomieModal from './HomieModal';
import {
  evaluateFrontendCategorySupport,
  evaluateFullOutfitSupport,
  SUPPORT_STATUS_META
} from './categorySupportHelper';
import { buildApiUrl, buildAssetUrl } from '../../../config/apiConfig';
import './VirtualTryOnStudio.css';

export default function VirtualTryOnStudio() {
  const { user, token, isAuthenticated } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeSubView, setActiveSubView] = useState('studio'); // 'studio' | 'history'
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [accountData, setAccountData] = useState(null);
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [tryOnMode, setTryOnMode] = useState('single'); // 'single' | 'full_outfit'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [fullOutfitSlots, setFullOutfitSlots] = useState({ top: null, bottom: null });
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [currentJob, setCurrentJob] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showHomieModal, setShowHomieModal] = useState(false);
  const pollTimerRef = useRef(null);

  // Load tryon credits & lots on mount or auth change
  useEffect(() => {
    if (isAuthenticated && token) {
      loadAccountData();
    }
  }, [isAuthenticated, token]);

  const loadAccountData = async () => {
    try {
      const res = await fetch(buildApiUrl('/tryon/account'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setAccountData(json.data);
      }
    } catch (e) {
      console.error('Failed to load try-on account data:', e);
    }
  };

  const pollJobStatusOnce = async (jobId) => {
    if (!jobId) return;
    const res = await fetch(buildApiUrl(`/tryon/jobs/${jobId}`), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setCurrentJob(json.data);
      const nextStatus = json.data.status;
      if (nextStatus === 'COMPLETED') {
        setIsGenerating(false);
        loadAccountData();
      } else if (nextStatus === 'FAILED' || nextStatus === 'CANCELLED') {
        setIsGenerating(false);
        setErrorMessage(json.data.errorMessage || 'Phiên thử đồ không thành công.');
        loadAccountData();
      } else if (nextStatus === 'RECONCILIATION_REQUIRED') {
        setIsGenerating(false);
      }
    }
  };

  // Poll job status while actively queued/processing; stop spinning immediately on RECONCILIATION_REQUIRED
  useEffect(() => {
    const activeStatus = currentJob?.status;
    if (
      currentJob?.jobId &&
      (activeStatus === 'QUEUED' || activeStatus === 'PROCESSING' || activeStatus === 'PENDING')
    ) {
      pollTimerRef.current = setTimeout(async () => {
        try {
          await pollJobStatusOnce(currentJob.jobId);
        } catch (e) {
          console.error('Job polling error:', e);
        }
      }, 2500);

      return () => {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      };
    }
  }, [currentJob, token]);

  const handleUpdateOutfitSlot = (slotKey, prod, variant = null) => {
    setFullOutfitSlots((prev) => ({
      ...prev,
      [slotKey]: prod ? { product: prod, variant } : null
    }));
    setErrorMessage(null);
  };

  const handleStartTryOn = async () => {
    if (!uploadedPhoto?.assetId) {
      setErrorMessage('Vui lòng tải lên ảnh toàn thân của bạn trước.');
      return;
    }

    if (!consentAccepted) {
      setErrorMessage('Vui lòng đồng ý với điều khoản gửi ảnh tới Google Cloud để tiếp tục.');
      return;
    }

    if (tryOnMode === 'full_outfit') {
      const fullOutfitGate = evaluateFullOutfitSupport(accountData);
      if (!fullOutfitGate.allowSubmit) {
        setErrorMessage(fullOutfitGate.reason || 'Full Outfit hiện đang chờ nghiệm thu benchmark với provider thật.');
        return;
      }
      if (!fullOutfitSlots?.top?.product?._id || !fullOutfitSlots?.bottom?.product?._id) {
        setErrorMessage('Vui lòng chọn đủ 1 Áo/Áo khoác và 1 Quần/Chân váy cho Full Outfit.');
        return;
      }

      setErrorMessage(null);
      setIsGenerating(true);
      try {
        const res = await fetch(buildApiUrl('/tryon/full-outfit/generate'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            personImageAssetId: uploadedPhoto.assetId,
            items: [
              {
                productId: fullOutfitSlots.bottom.product._id,
                ...(fullOutfitSlots.bottom.variant ? { selectedVariant: fullOutfitSlots.bottom.variant } : {})
              },
              {
                productId: fullOutfitSlots.top.product._id,
                ...(fullOutfitSlots.top.variant ? { selectedVariant: fullOutfitSlots.top.variant } : {})
              }
            ],
            idempotencyKey: `FULL_${Date.now()}_${uploadedPhoto.assetId}`
          })
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setCurrentJob(json.data);
        } else {
          setIsGenerating(false);
          setErrorMessage(json.message || 'Không thể tạo phiên Full Outfit.');
        }
      } catch (e) {
        setIsGenerating(false);
        setErrorMessage('Lỗi kết nối máy chủ khi tạo phiên Full Outfit.');
      }
      return;
    }

    if (!selectedProduct?._id) {
      setErrorMessage('Vui lòng chọn 1 sản phẩm KD-XX trong danh mục để thử.');
      return;
    }

    const supportCheck = evaluateFrontendCategorySupport(selectedProduct, accountData?.categoryMatrix || []);
    if (!supportCheck.allowSubmit) {
      setErrorMessage(supportCheck.reason || 'Danh mục sản phẩm này hiện chưa sẵn sàng cho AI Try-On.');
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const res = await fetch(buildApiUrl('/tryon/generate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          personImageAssetId: uploadedPhoto.assetId,
          productId: selectedProduct._id,
          ...(selectedVariant ? { selectedVariant } : {}),
          idempotencyKey: `TRY_${Date.now()}_${uploadedPhoto.assetId}`
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setCurrentJob(json.data);
      } else {
        setIsGenerating(false);
        setErrorMessage(json.message || 'Không thể tạo phiên thử đồ.');
      }
    } catch (e) {
      setIsGenerating(false);
      setErrorMessage('Lỗi kết nối máy chủ khi tạo phiên thử đồ.');
    }
  };

  const handleCancelJob = async () => {
    if (!currentJob?.jobId) return;
    try {
      const res = await fetch(buildApiUrl(`/tryon/jobs/${currentJob.jobId}/cancel`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setCurrentJob(null);
        setIsGenerating(false);
        loadAccountData();
      } else {
        setErrorMessage(json.message || 'Không thể hủy phiên thử đồ vào lúc này.');
      }
    } catch (e) {
      console.error('Error cancelling job:', e);
      setErrorMessage('Lỗi kết nối khi yêu cầu hủy phiên thử đồ.');
    }
  };

  const handleDeleteAsset = async (assetId) => {
    if (!assetId) return;
    await fetch(buildApiUrl(`/tryon/assets/${assetId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
  };

  // 1. Unauthenticated View
  if (!isAuthenticated) {
    return (
      <div className="vto-container">
        <div className="vto-auth-gate">
          <div className="vto-auth-icon">
            <Lock size={32} />
          </div>

          <h2 className="vto-auth-title">KD-XX VIRTUAL TRY-ON AI</h2>

          <p className="vto-auth-desc">
            Trải nghiệm phòng thử đồ ảo AI độc quyền từ <strong>Google Cloud Vertex AI</strong>.
            Đăng nhập hoặc đăng ký tài khoản để nhận ngay <strong className="text-purple-300">10 lượt thử đồ miễn phí</strong> và xem trang phục KD-XX trực tiếp trên phom dáng của bạn.
          </p>

          <button
            type="button"
            className="vto-auth-login-btn"
            onClick={() => setShowAuthModal(true)}
          >
            <span>Đăng Nhập / Đăng Ký Để Thử Đồ AI</span>
            <ArrowRight size={16} />
          </button>
        </div>

        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </div>
    );
  }

  // 2. Completed Result View (inside studio tab)
  if (activeSubView === 'studio' && currentJob?.status === 'COMPLETED' && currentJob.resultPreviewUrl) {
    return (
      <div className="vto-container">
        <div className="flex justify-end">
          <button
            type="button"
            className="vto-history-nav-btn"
            onClick={() => {
              setHistoryRefreshKey((k) => k + 1);
              setActiveSubView('history');
            }}
          >
            <History size={14} />
            <span>My Try-On History</span>
          </button>
        </div>

        <TryOnResultView
          originalPhotoUrl={buildAssetUrl(uploadedPhoto?.previewUrl)}
          resultPhotoUrl={buildAssetUrl(currentJob.resultPreviewUrl)}
          product={selectedProduct}
          mode={currentJob.mode || 'SINGLE_ITEM'}
          outfitItems={currentJob.outfitItems || []}
          resultQualityCheck={currentJob.resultQualityCheck || null}
          assetId={currentJob.resultImageAsset}
          onDeleteAsset={handleDeleteAsset}
          onReset={() => {
            setCurrentJob(null);
            setIsGenerating(false);
          }}
        />
      </div>
    );
  }

  const isQualityReady = uploadedPhoto?.qualityAnalysis?.status !== 'REJECTED';
  const isAdmin = user?.role === 'admin' || accountData?.membershipType === 'admin' || accountData?.isUnlimited;
  const requiredCredits = tryOnMode === 'full_outfit' ? 2 : 1;
  const hasCredits = isAdmin || (accountData?.totalCredits || 0) >= requiredCredits;
  const selectedCategorySupport = selectedProduct
    ? evaluateFrontendCategorySupport(selectedProduct, accountData?.categoryMatrix || [])
    : null;
  const isCategorySupported = !selectedCategorySupport || selectedCategorySupport.allowSubmit !== false;
  const selectedSupportMeta = selectedCategorySupport
    ? SUPPORT_STATUS_META[selectedCategorySupport.displayStatus] || SUPPORT_STATUS_META.UNSUPPORTED
    : null;
  const fullOutfitSupport = evaluateFullOutfitSupport(accountData);
  const isFullOutfitSlotsReady = Boolean(fullOutfitSlots?.top?.product?._id && fullOutfitSlots?.bottom?.product?._id);

  return (
    <div className="vto-container">
      {/* Top Status & Credit Bar */}
      <div className="vto-top-bar">
        <div className="vto-brand-badge">
          <div className="vto-ai-icon-wrap">
            <Sparkles size={22} />
          </div>
          <div className="vto-title-block">
            <h2>
              <span>KD-XX VIRTUAL TRY-ON</span>
              <span className="vto-provider-tag">Google Cloud</span>
            </h2>
            <p>Phòng Thử Đồ Ảo AI Độc Quyền Dựa Trên Ảnh Chụp Thật</p>
          </div>
        </div>

        <div className="vto-credit-actions">
          <div className="vto-subview-switch" role="tablist" aria-label="Chế độ Try-On">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubView === 'studio'}
              className={`vto-subview-btn ${activeSubView === 'studio' ? 'active' : ''}`}
              onClick={() => setActiveSubView('studio')}
            >
              <Sparkles size={13} />
              <span>Studio</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubView === 'history'}
              className={`vto-subview-btn ${activeSubView === 'history' ? 'active' : ''}`}
              onClick={() => {
                setHistoryRefreshKey((k) => k + 1);
                setActiveSubView('history');
              }}
            >
              <History size={13} />
              <span>My Try-On History</span>
            </button>
          </div>

          <div className="vto-credit-pill">
            <span className="vto-credit-count">
              {isAdmin ? '∞ VÔ HẠN' : (accountData?.totalCredits ?? '...')}
            </span>
            <span className="vto-credit-label">
              {isAdmin ? 'CHỦ SỞ HỮU / ADMIN' : (accountData?.membershipType === 'homie' ? 'HOMIE CREDITS' : 'LƯỢT THỬ FREE')}
            </span>
          </div>

          {isAdmin ? (
            <div
              className="vto-homie-btn"
              style={{
                cursor: 'default',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.4) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                color: '#6ee7b7'
              }}
              title="Đặc quyền Chủ sở hữu: Token vĩnh viễn, không giới hạn tốc độ và ưu tiên cao nhất"
            >
              <Zap size={14} />
              <span>Admin VIP Pass</span>
            </div>
          ) : (
            <button
              type="button"
              className="vto-homie-btn"
              onClick={() => setShowHomieModal(true)}
            >
              <Zap size={14} />
              <span>{accountData?.membershipType === 'homie' ? 'Gói HOMIE' : 'Nâng Cấp HOMIE'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-view: My Try-On History OR Virtual Try-On Studio Workspace */}
      {activeSubView === 'history' ? (
        <MyTryOnHistory
          token={token}
          refreshTrigger={historyRefreshKey}
          onBackToStudio={() => setActiveSubView('studio')}
        />
      ) : (
        <>
          {/* Reconciliation Notice (Stops infinite loading spinner & allows safe status check) */}
      {currentJob?.status === 'RECONCILIATION_REQUIRED' && (
        <div
          className="p-4 bg-amber-950/50 border border-amber-500/40 rounded-2xl text-amber-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          data-testid="vto-reconciliation-banner"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-300 uppercase tracking-wider">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span>Đang Đối Soát Trạng Thái Xử Lý AI</span>
            </div>
            <p className="text-amber-100/90 m-0">
              {currentJob.errorMessage ||
                'Yêu cầu tới Google Cloud vượt quá thời gian phản hồi. Hệ thống đang đối soát trạng thái trước khi hoàn hoặc chốt credit.'}
            </p>
            {currentJob.jobId && (
              <p className="text-[11px] text-amber-200/70 font-mono m-0">
                Mã phiên: #{String(currentJob.jobId).slice(-8)}
                {currentJob.providerRequestId ? ` • Ref: ${currentJob.providerRequestId}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30 font-semibold transition-colors"
              onClick={() => pollJobStatusOnce(currentJob.jobId)}
            >
              Kiểm Tra Lại Trạng Thái
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white"
              onClick={() => {
                setCurrentJob(null);
                setIsGenerating(false);
              }}
            >
              Phiên Mới
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-red-950/60 border border-red-500/40 rounded-2xl text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-white text-xs underline"
            onClick={() => setErrorMessage(null)}
          >
            Đóng
          </button>
        </div>
      )}

      {/* Mode Switcher: Single Item vs Full Outfit */}
      <div
        className="p-3 bg-white/[0.03] border border-white/10 rounded-2xl flex flex-wrap items-center justify-between gap-3"
        data-testid="vto-mode-selector"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="vto-mode-single"
            onClick={() => {
              setTryOnMode('single');
              setErrorMessage(null);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              tryOnMode === 'single'
                ? 'bg-purple-600 text-white border border-purple-400'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:text-white'
            }`}
          >
            <Sparkles size={14} />
            <span>Single Item (1 Credit)</span>
          </button>
          <button
            type="button"
            data-testid="vto-mode-full-outfit"
            onClick={() => {
              setTryOnMode('full_outfit');
              setErrorMessage(null);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              tryOnMode === 'full_outfit'
                ? 'bg-purple-600 text-white border border-purple-400'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:text-white'
            }`}
          >
            <Layers size={14} />
            <span>Full Outfit: Áo + Quần (2 Credits)</span>
          </button>
        </div>

        <span className="text-[11px] text-slate-400">
          {tryOnMode === 'full_outfit'
            ? 'Xử lý tuần tự 2 bước • Yêu cầu ảnh toàn thân rõ áo, quần & hông'
            : 'Thử nhanh 1 sản phẩm trang phục (Áo / Quần / Đầm)'}
        </span>
      </div>

      {/* Full Outfit Benchmark / Lifecycle Gate Banner */}
      {tryOnMode === 'full_outfit' && !fullOutfitSupport.allowSubmit && (
        <div
          data-testid="vto-full-outfit-gate-banner"
          className="p-4 rounded-2xl border bg-amber-950/40 border-amber-500/40 text-amber-100 text-xs flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-amber-300">
            <AlertTriangle size={15} className="shrink-0" />
            <span>Full Outfit Đang Khóa ({fullOutfitSupport.displayStatus || 'LIMITED'})</span>
          </div>
          <p className="m-0 leading-relaxed">{fullOutfitSupport.reason}</p>
        </div>
      )}

      {/* Main 2-Column Workspace */}
      <div className="vto-workspace-grid">
        {/* Left Column: Photo Uploader */}
        <PhotoUploader
          uploadedPhoto={uploadedPhoto}
          onPhotoUploaded={(data) => {
            setUploadedPhoto(data);
            setErrorMessage(null);
          }}
          onPhotoRemoved={() => {
            setUploadedPhoto(null);
            setCurrentJob(null);
          }}
          token={token}
        />

        {/* Right Column: Product Selector */}
        <ProductSelector
          selectedProduct={selectedProduct}
          selectedVariant={selectedVariant}
          categoryMatrix={accountData?.categoryMatrix || []}
          tryOnMode={tryOnMode}
          fullOutfitSlots={fullOutfitSlots}
          onUpdateOutfitSlot={handleUpdateOutfitSlot}
          onSelectProduct={(p, variant = null) => {
            setSelectedProduct(p);
            setSelectedVariant(variant);
            setErrorMessage(null);
          }}
        />
      </div>

      {/* Category Support / Provider Capability Gate Banner (Single Item) */}
      {tryOnMode === 'single' && selectedCategorySupport && !selectedCategorySupport.allowSubmit && (
        <div
          data-testid="vto-category-support-banner"
          className={`p-4 rounded-2xl border text-xs flex flex-col gap-1.5 ${
            selectedSupportMeta?.bannerClass || 'bg-amber-950/40 border-amber-500/40 text-amber-100'
          }`}
        >
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
            <AlertTriangle size={15} className="shrink-0" />
            <span>
              Danh mục đang khóa Try-On ({selectedCategorySupport.displayStatus})
            </span>
          </div>
          <p className="m-0 leading-relaxed opacity-90">{selectedCategorySupport.reason}</p>
          {Array.isArray(selectedCategorySupport.limitations) && selectedCategorySupport.limitations.length > 0 && (
            <div className="text-[11px] opacity-80">
              {selectedCategorySupport.limitations.filter(Boolean)[0]}
            </div>
          )}
        </div>
      )}

      {/* Bottom Action & Generation Bar */}
      <div className="vto-action-panel">
        <div className="vto-consent-box">
          <input
            type="checkbox"
            id="vto-consent"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="vto-consent-checkbox"
          />
          <label htmlFor="vto-consent" className="vto-consent-text">
            Tôi đồng ý gửi ảnh đã tải lên tới nhà cung cấp AI (Google Cloud Vertex AI) để xử lý trang phục. Ảnh được lưu trữ bảo mật trong khu vực riêng tư và tự động xóa sau tối đa 3 ngày.
          </label>
        </div>

        <div className="flex items-center gap-3">
          {isGenerating && (
            <button
              type="button"
              className="px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 hover:text-white"
              onClick={handleCancelJob}
            >
              Hủy Hàng Đợi
            </button>
          )}

          <button
            type="button"
            className="vto-generate-btn"
            disabled={
              !uploadedPhoto ||
              !isQualityReady ||
              (tryOnMode === 'full_outfit'
                ? (!isFullOutfitSlotsReady || !fullOutfitSupport.allowSubmit)
                : (!selectedProduct || !isCategorySupported)) ||
              !hasCredits ||
              isGenerating ||
              currentJob?.status === 'RECONCILIATION_REQUIRED'
            }
            onClick={handleStartTryOn}
          >
            {isGenerating ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>
                  {tryOnMode === 'full_outfit' || currentJob?.mode === 'FULL_OUTFIT'
                    ? (() => {
                        const steps = currentJob?.executionSteps || [];
                        const doneCount = steps.filter((s) => s.status === 'COMPLETED').length;
                        return currentJob?.status === 'QUEUED'
                          ? 'Đang Trong Hàng Đợi Full Outfit...'
                          : `Đang Xử Lý Full Outfit (Bước ${Math.min(2, doneCount + 1)}/2)...`;
                      })()
                    : currentJob?.status === 'QUEUED'
                      ? 'Đang Trong Hàng Đợi AI...'
                      : 'Google Cloud AI Đang Xử Lý...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>
                  {tryOnMode === 'full_outfit'
                    ? (isAdmin ? 'Thử Full Outfit (Đặc Quyền Admin)' : 'Thử Full Outfit (2 Credits)')
                    : (isAdmin ? 'Bắt Đầu Thử Đồ (Đặc Quyền Admin)' : 'Bắt Đầu Thử Đồ (1 Credit)')}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
        </>
      )}

      {/* Homie Membership Modal */}
      <HomieModal
        isOpen={showHomieModal}
        onClose={() => setShowHomieModal(false)}
        user={user}
        onSuccess={() => {
          loadAccountData();
        }}
      />
    </div>
  );
}
