import React, { useState } from 'react';
import {
  Download,
  RotateCcw,
  Trash2,
  Sparkles,
  ExternalLink,
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TryOnResultView({
  originalPhotoUrl,
  resultPhotoUrl,
  product,
  mode = 'SINGLE_ITEM',
  outfitItems = [],
  resultQualityCheck = null,
  onReset,
  onDeleteAsset,
  assetId
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'side'
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const navigate = useNavigate();

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
                ? 'Kết Quả Full Outfit AI (2 Bước) Đã Sẵn Sàng'
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
            <img src={resultPhotoUrl} alt="AI Result" className="vto-result-img" />
          </div>
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 select-none max-w-2xl mx-auto w-full aspect-[3/4] max-h-[620px]">
          {/* Background: AI Result */}
          <img
            src={resultPhotoUrl}
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
