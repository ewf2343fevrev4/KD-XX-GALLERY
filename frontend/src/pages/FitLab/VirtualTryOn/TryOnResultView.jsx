import React, { useState, useEffect } from 'react';
import {
  Download,
  RotateCcw,
  Trash2,
  Sparkles,
  ExternalLink,
  Check,
  Ruler,
  Copy,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TryOnResultView({
  originalPhotoUrl,
  resultPhotoUrl,
  product,
  mode = 'SINGLE_ITEM',
  outfitItems = [],
  resultQualityCheck = null,
  tuckStyle = 'untucked',
  sizeRecommendation = null,
  bodyMeasurements = null,
  jobId = null,
  stackedAccessories = [],
  onReset,
  onDeleteAsset,
  assetId
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'side'
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showMetricsDetails, setShowMetricsDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentResultUrl, setCurrentResultUrl] = useState(resultPhotoUrl);
  const navigate = useNavigate();

  useEffect(() => {
    setCurrentResultUrl(resultPhotoUrl);
  }, [resultPhotoUrl]);

  const handleDownload = async () => {
    try {
      const res = await fetch(resultPhotoUrl);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kdxx-tryon-${product?.name ? product.name.replace(/\s+/g, '-').toLowerCase() : 'result'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      window.open(resultPhotoUrl, '_blank');
    }
  };

  const handleDeleteEarly = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa vĩnh viễn ảnh phiên thử đồ này khỏi máy chủ sớm?')) return;
    setIsDeleting(true);
    try {
      await onDeleteAsset(assetId);
      setDeleteSuccess(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  const recommendation = sizeRecommendation || (bodyMeasurements ? { measurements: bodyMeasurements } : null);
  const measurements = recommendation?.measurements || bodyMeasurements;
  const itemRecs = recommendation?.itemRecommendations || [];
  const summary = recommendation?.summary || {};

  const handleCopyMeasurements = () => {
    if (!measurements) return;
    const lines = [
      `📐 SỐ ĐO CƠ THỂ & SIZE ĐỀ XUẤT KD-XX:`,
      `• Phom dáng: ${measurements.bodyShapeLabel || 'Chuẩn'}`,
      measurements.estimatedMetrics ? `• Vai: ${measurements.estimatedMetrics.shoulderWidthCm}cm | Ngực: ${measurements.estimatedMetrics.chestCircumferenceCm}cm | Eo: ${measurements.estimatedMetrics.waistCircumferenceCm}cm | Hông: ${measurements.estimatedMetrics.hipCircumferenceCm}cm` : null,
      itemRecs.length > 0 ? `• Đề xuất: ${itemRecs.map(i => `${i.productName}: Size ${i.recommendedSize}`).join(', ')}` : null
    ].filter(Boolean).join('\n');

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(lines).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {});
    }
  };

  return (
    <div className="vto-result-container">
      {/* Top Banner */}
      <div className="flex items-center justify-between flex-wrap gap-4 p-4 bg-purple-950/30 border border-purple-500/30 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider m-0">
              {mode === 'FULL_OUTFIT'
                ? (Array.isArray(outfitItems) && outfitItems.length > 2
                    ? 'Kết Quả Full Look AI (3 Bước: Áo + Quần + Giày) Đã Sẵn Sàng'
                    : 'Kết Quả Full Outfit AI (2 Bước) Đã Sẵn Sàng')
                : 'Kết Quả Thử Đồ Google Cloud AI Đã Sẵn Sàng'}
            </h3>
            <p className="text-xs text-slate-300 m-0">
              {mode === 'FULL_OUTFIT' && Array.isArray(outfitItems) && outfitItems.length > 0 ? (
                <>
                  Đã ghép bộ trang phục{' '}
                  <strong className="text-white">
                    {outfitItems.map((i) => i.productName).filter(Boolean).join(' + ')}
                  </strong>{' '}
                  lên phom dáng của bạn.
                </>
              ) : (
                <>
                  Đã ghép trang phục <strong className="text-white">{product?.name}</strong> lên phom dáng của bạn.
                </>
              )}
            </p>
            {mode === 'FULL_OUTFIT' && (
              <div className="mt-1 flex items-center flex-wrap gap-1.5">
                {tuckStyle && (
                  <div data-testid="vto-result-tuck-badge">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-500/30">
                      <Sparkles size={11} className="text-purple-400" />
                      <span>
                        Phong cách:{' '}
                        <strong className="text-white">
                          {tuckStyle === 'tucked' ? 'Sơ vin (Tuck-in)' : 'Thả áo ngoài (Untucked)'}
                        </strong>
                      </span>
                    </span>
                  </div>
                )}
                {Array.isArray(outfitItems) && outfitItems.some(i => i.slot === 'FOOTWEAR') && (
                  <div data-testid="vto-result-footwear-badge">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950/70 text-emerald-200 border border-emerald-500/40">
                      <span>👟 Full Look 3 Món (Kèm Giày)</span>
                    </span>
                  </div>
                )}
              </div>
            )}
            {resultQualityCheck?.status === 'WARNING' && resultQualityCheck?.notes && (
              <p className="text-[11px] text-amber-300 mt-1 mb-0" data-testid="vto-quality-warning">
                Lưu ý kiểm tra chất lượng: {resultQualityCheck.notes}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
              viewMode === 'split' ? 'bg-white text-black' : 'bg-white/5 text-slate-300 hover:text-white'
            }`}
            onClick={() => setViewMode('split')}
          >
            Trượt So Sánh (Split)
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
              viewMode === 'side' ? 'bg-white text-black' : 'bg-white/5 text-slate-300 hover:text-white'
            }`}
            onClick={() => setViewMode('side')}
          >
            Song Song (Side-by-Side)
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      {viewMode === 'side' ? (
        <div className="vto-result-viewports">
          <div className="vto-result-card">
            <span className="vto-result-tag-badge">Ảnh Gốc Ban Đầu</span>
            <img src={originalPhotoUrl} alt="Original" className="vto-result-img" />
          </div>
          <div className="vto-result-card">
            <span className="vto-result-tag-badge ai">KD-XX Virtual Try-On</span>
            <img src={currentResultUrl || resultPhotoUrl} alt="AI Result" className="vto-result-img" />
          </div>
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 select-none max-w-2xl mx-auto w-full aspect-[3/4] max-h-[620px]">
          {/* Background: AI Result */}
          <img
            src={currentResultUrl || resultPhotoUrl}
            alt="AI Result"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Foreground: Original Photo (Clipped) */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${sliderPosition}%` }}
          >
            <img
              src={originalPhotoUrl}
              alt="Original"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={{ width: '100%', maxWidth: 'none' }}
            />
          </div>

          {/* Slider Line & Handle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_#ffffff] cursor-ew-resize flex items-center justify-center z-10"
            style={{ left: `${sliderPosition}%` }}
          >
            <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-black shadow-lg">
              ↔
            </div>
          </div>

          {/* Range Slider for drag */}
          <input
            type="range"
            min="0"
            max="100"
            value={sliderPosition}
            onChange={(e) => setSliderPosition(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
          />

          {/* Labels */}
          <span className="absolute bottom-4 left-4 z-10 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-bold text-white uppercase tracking-wider border border-white/10">
            Ảnh Gốc
          </span>
          <span className="absolute bottom-4 right-4 z-10 px-3 py-1 rounded-full bg-purple-950/80 backdrop-blur-md text-[10px] font-bold text-purple-200 uppercase tracking-wider border border-purple-500/40">
            KD-XX Try-On
          </span>
        </div>
      )}

      {/* KD-XX Level 5: AI Body Measurement & Size Recommendation Engine */}
      {measurements && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900/50 to-indigo-950/40 border border-purple-500/30" data-testid="vto-level5-size-analyzer">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                <Ruler size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider m-0">
                    Phân Tích Dáng & Gợi Ý Size May Đo (AI Level 5)
                  </h4>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {measurements.bodyShapeLabel || 'Phom Dáng Tiêu Chuẩn'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 m-0">
                  {summary.fitSummaryText || measurements.bodyShapeDesc || 'Phân tích phom dáng giải phẫu học dựa trên tỷ lệ ảnh đứng toàn thân.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyMeasurements}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Đã sao chép số đo' : 'Sao chép số đo'}</span>
            </button>
          </div>

          {/* Recommended Sizes Grid */}
          {itemRecs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 my-3">
              {itemRecs.map((rec, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-black/40 border border-purple-500/20 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium mb-1">
                      <span>{rec.slot === 'TOP' ? 'Áo / Khoác' : rec.slot === 'BOTTOM' ? 'Quần / Váy' : rec.slot === 'FOOTWEAR' ? 'Giày / Sneaker' : 'Sản Phẩm'}</span>
                      <span className="text-purple-400">{rec.sizeSystem || ''}</span>
                    </div>
                    <div className="text-xs font-bold text-white truncate mb-2" title={rec.productName}>
                      {rec.productName}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-lg font-black text-purple-300 tracking-wide">
                        Size {rec.recommendedSize}
                      </span>
                      {rec.alternativeSize && (
                        <span className="text-[11px] text-slate-400">
                          (Dự phòng: {rec.alternativeSize})
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 m-0 line-clamp-2">
                      {rec.fitAdvice}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible Anatomy Metrics Details */}
          <div className="mt-2 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setShowMetricsDetails(!showMetricsDetails)}
              className="flex items-center justify-between w-full text-left text-xs text-purple-300 hover:text-purple-200 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Info size={12} />
                <span>Xem thông số giải phẫu học ước tính (Vai, Ngực, Eo, Chiều dài chân)</span>
              </span>
              {showMetricsDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showMetricsDetails && measurements.estimatedMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-3 pt-2">
                <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Khung Vai</div>
                  <div className="text-sm font-bold text-white mt-0.5">{measurements.estimatedMetrics.shoulderWidthCm} cm</div>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Vòng Ngực</div>
                  <div className="text-sm font-bold text-white mt-0.5">{measurements.estimatedMetrics.chestCircumferenceCm} cm</div>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Vòng Eo</div>
                  <div className="text-sm font-bold text-white mt-0.5">{measurements.estimatedMetrics.waistCircumferenceCm} cm</div>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Vòng Hông</div>
                  <div className="text-sm font-bold text-white mt-0.5">{measurements.estimatedMetrics.hipCircumferenceCm} cm</div>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Dài Inseam</div>
                  <div className="text-sm font-bold text-white mt-0.5">{measurements.estimatedMetrics.inseamLengthCm} cm</div>
                </div>
                <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Chiều Dài Chân</div>
                  <div className="text-sm font-bold text-white mt-0.5">{measurements.estimatedMetrics.totalLegLengthCm} cm</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="vto-result-actions-bar">
        <div className="vto-result-buttons">
          <button
            type="button"
            className="vto-primary-action-btn"
            onClick={handleDownload}
          >
            <Download size={15} />
            <span>Tải Ảnh Về (HD PNG)</span>
          </button>

          <button
            type="button"
            className="vto-secondary-action-btn"
            onClick={onReset}
          >
            <RotateCcw size={15} />
            <span>Thử Sản Phẩm Khác</span>
          </button>

          <button
            type="button"
            className="vto-secondary-action-btn"
            onClick={() => navigate('/fit-lab?mode=canvas')}
          >
            <Sparkles size={15} />
            <span>Mở Trên Canvas Studio</span>
          </button>

          {product?._id && (
            <button
              type="button"
              className="vto-secondary-action-btn"
              onClick={() => navigate(`/product/${product._id}`)}
            >
              <ExternalLink size={15} />
              <span>Xem Chi Tiết Mua Hàng</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {deleteSuccess ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check size={14} /> Đã xóa ảnh khỏi máy chủ
            </span>
          ) : (
            <button
              type="button"
              className="vto-danger-btn"
              onClick={handleDeleteEarly}
              disabled={isDeleting}
            >
              <Trash2 size={13} />
              <span>{isDeleting ? 'Đang xóa...' : 'Xóa ảnh kết quả sớm'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
