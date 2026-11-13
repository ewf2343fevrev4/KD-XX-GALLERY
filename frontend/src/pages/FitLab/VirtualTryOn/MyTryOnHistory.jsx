import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Search,
  RefreshCw,
  Trash2,
  Eye,
  SplitSquareHorizontal,
  Columns2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Ban,
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  ImageOff
} from 'lucide-react';
import { buildApiUrl, buildAssetUrl } from '../../../config/apiConfig';

const STATUS_FILTERS = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'COMPLETED', label: 'Hoàn tất' },
  { id: 'EXPIRED', label: 'Hết hạn (72h)' },
  { id: 'RECONCILIATION_REQUIRED', label: 'Đang đối soát' },
  { id: 'FAILED', label: 'Thất bại' },
  { id: 'CANCELLED', label: 'Đã hủy' }
];

const STATUS_META = {
  COMPLETED: { label: 'COMPLETED', text: 'Hoàn tất', tone: 'completed', Icon: CheckCircle2 },
  EXPIRED: { label: 'EXPIRED', text: 'Hết hạn ảnh (72h)', tone: 'expired', Icon: Clock },
  RECONCILIATION_REQUIRED: { label: 'RECONCILIATION_REQUIRED', text: 'Đang đối soát AI', tone: 'reconcile', Icon: AlertTriangle },
  FAILED: { label: 'FAILED', text: 'Thất bại', tone: 'failed', Icon: XCircle },
  CANCELLED: { label: 'CANCELLED', text: 'Đã hủy', tone: 'cancelled', Icon: Ban },
  QUEUED: { label: 'QUEUED', text: 'Đang chờ hàng đợi', tone: 'queued', Icon: Clock },
  PROCESSING: { label: 'PROCESSING', text: 'AI đang xử lý', tone: 'queued', Icon: RefreshCw },
  PENDING: { label: 'PENDING', text: 'Đang khởi tạo', tone: 'queued', Icon: Clock }
};

export function formatRemainingRetention(expiresAt, nowMs = Date.now()) {
  if (!expiresAt) return 'Chưa xác định';
  const expMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expMs)) return 'Chưa xác định';
  const diff = expMs - nowMs;
  if (diff <= 0) return 'Đã hết hạn (tự động xóa sau 72h)';

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) {
    return `Còn ${days} ngày ${hours} giờ`;
  }
  if (hours > 0) {
    return `Còn ${hours} giờ ${mins} phút`;
  }
  return `Còn ${Math.max(1, mins)} phút`;
}

function formatDateTimeVi(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function EmptyImageNotice({ imageMeta, kind, displayStatus }) {
  const isOriginal = kind === 'original';
  let title = isOriginal ? 'Không có ảnh gốc' : 'Chưa có ảnh kết quả';
  let sub = 'Không lưu ảnh giả lập';

  if (imageMeta?.status === 'EXPIRED' || (displayStatus === 'EXPIRED' && !isOriginal)) {
    title = isOriginal ? 'Ảnh gốc đã hết hạn (72h)' : 'Ảnh kết quả đã hết hạn (72h)';
    sub = 'Ảnh riêng tư đã bị xóa theo chính sách 72 giờ';
  } else if (imageMeta?.status === 'DELETED') {
    title = isOriginal ? 'Ảnh gốc đã được xóa sớm' : 'Ảnh kết quả đã được xóa sớm';
    sub = 'Đã xóa vĩnh viễn khỏi máy chủ KD-XX';
  } else if (!isOriginal && displayStatus === 'RECONCILIATION_REQUIRED') {
    title = 'Đang đối soát kết quả AI';
    sub = 'Hệ thống đang xác minh trạng thái với nhà cung cấp';
  } else if (!isOriginal && displayStatus === 'CANCELLED') {
    title = 'Phiên thử đồ đã hủy';
    sub = 'Chưa tạo ảnh kết quả & đã hoàn credit';
  } else if (!isOriginal && displayStatus === 'FAILED') {
    title = 'Phiên xử lý không thành công';
    sub = 'Không có ảnh kết quả khả dụng';
  }

  return (
    <div className="vto-history-empty-slot">
      <ImageOff size={20} />
      <span className="vto-history-empty-title">{title}</span>
      <span className="vto-history-empty-sub">{sub}</span>
    </div>
  );
}

export default function MyTryOnHistory({ token, refreshTrigger = 0, onBackToStudio }) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 6, total: 0, totalPages: 1, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [selectedItem, setSelectedItem] = useState(null);
  const [detailViewMode, setDetailViewMode] = useState('split'); // 'split' | 'side' | 'result' | 'original'
  const [sliderPosition, setSliderPosition] = useState(50);
  const [busyAction, setBusyAction] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadHistory = useCallback(async (targetPage = page, targetSearch = appliedSearch) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '6',
        status: statusFilter,
        category: categoryFilter
      });
      if (targetSearch.trim()) {
        params.set('search', targetSearch.trim());
      }

      const res = await fetch(buildApiUrl(`/tryon/history?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setItems(Array.isArray(json.data) ? json.data : []);
        if (json.pagination) {
          setPagination(json.pagination);
        }
      } else {
        setNotice({ type: 'error', text: json.message || 'Không thể tải lịch sử thử đồ.' });
      }
    } catch (e) {
      setNotice({ type: 'error', text: 'Lỗi kết nối máy chủ khi tải lịch sử thử đồ.' });
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter, categoryFilter, appliedSearch]);

  useEffect(() => {
    loadHistory(page, appliedSearch);
  }, [loadHistory, page, appliedSearch, refreshTrigger]);

  const handleOpenDetail = async (item) => {
    setSelectedItem(item);
    const hasOrig = Boolean(item.originalPreviewUrl);
    const hasRes = Boolean(item.resultPreviewUrl);
    if (hasOrig && hasRes) setDetailViewMode('split');
    else if (hasRes) setDetailViewMode('result');
    else if (hasOrig) setDetailViewMode('original');
    else setDetailViewMode('side');

    try {
      const res = await fetch(buildApiUrl(`/tryon/history/${item.jobId || item.id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setSelectedItem(json.data);
      }
    } catch (_) {
      // Keep card item snapshot if detail refresh hits transient error
    }
  };

  const handleDeleteAssetKind = async (jobId, kind) => {
    setBusyAction(true);
    try {
      const endpoint = kind === 'original'
        ? `/tryon/history/${jobId}/original-image`
        : `/tryon/history/${jobId}/result-image`;

      const res = await fetch(buildApiUrl(endpoint), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotice({
          type: 'success',
          text: json.message || (kind === 'original' ? 'Đã xóa ảnh gốc.' : 'Đã xóa ảnh kết quả.')
        });
        await loadHistory(page, appliedSearch);
        if (selectedItem && (selectedItem.jobId || selectedItem.id) === jobId) {
          const detailRes = await fetch(buildApiUrl(`/tryon/history/${jobId}`), {
            headers: { Authorization: `Bearer ${token}` }
          });
          const detailJson = await detailRes.json();
          if (detailRes.ok && detailJson.success) {
            setSelectedItem(detailJson.data);
          }
        }
      } else {
        setNotice({ type: 'error', text: json.message || 'Không thể xóa ảnh.' });
      }
    } catch (e) {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi xóa ảnh.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteHistoryItem = async (jobId) => {
    setBusyAction(true);
    try {
      const res = await fetch(buildApiUrl(`/tryon/history/${jobId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (selectedItem && (selectedItem.jobId || selectedItem.id) === jobId) {
          setSelectedItem(null);
        }
        setNotice({ type: 'success', text: 'Đã xóa mục lịch sử và giải phóng ảnh liên quan.' });
        await loadHistory(page, appliedSearch);
      } else {
        setNotice({ type: 'error', text: json.message || 'Không thể xóa mục lịch sử.' });
      }
    } catch (e) {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi xóa lịch sử.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearAllHistory = async () => {
    setBusyAction(true);
    try {
      const res = await fetch(buildApiUrl('/tryon/history'), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setConfirmClearAll(false);
        setSelectedItem(null);
        setPage(1);
        setNotice({
          type: 'success',
          text: json.message || 'Đã xóa toàn bộ lịch sử và ảnh thử đồ của bạn.'
        });
        await loadHistory(1, appliedSearch);
      } else {
        setNotice({ type: 'error', text: json.message || 'Không thể xóa toàn bộ lịch sử.' });
      }
    } catch (e) {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi xóa toàn bộ lịch sử.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleDownloadResult = async (item) => {
    if (!item?.resultPreviewUrl) return;
    const url = buildAssetUrl(item.resultPreviewUrl);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      const slug = (item.productSnapshot?.productName || 'kdxx-tryon').toLowerCase().replace(/\s+/g, '-');
      a.download = `${slug}-${String(item.jobId || item.id).slice(-6)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objUrl);
    } catch (_) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput);
  };

  return (
    <section className="vto-history-section" aria-label="My Try-On History">
      {/* Privacy & 72h Retention Banner */}
      <div className="vto-history-retention-banner">
        <div className="vto-history-retention-info">
          <div className="vto-history-icon-badge">
            <History size={20} />
          </div>
          <div>
            <h3>MY TRY-ON HISTORY • LỊCH SỬ THỬ ĐỒ RIÊNG TƯ</h3>
            <p>
              <ShieldCheck size={13} className="inline mr-1 text-emerald-400" />
              Ảnh gốc và ảnh kết quả lưu trữ riêng tư tối đa <strong>72 giờ</strong> kể từ lúc tạo, tự động xóa khi hết hạn và không gia hạn khi xem lại.
            </p>
          </div>
        </div>

        <div className="vto-history-header-actions">
          <button
            type="button"
            className="vto-secondary-action-btn"
            onClick={() => loadHistory(page, appliedSearch)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>

          {items.length > 0 && (
            <button
              type="button"
              className="vto-history-clear-btn"
              onClick={() => setConfirmClearAll(true)}
              disabled={busyAction}
            >
              <Trash2 size={14} />
              <span>Xóa toàn bộ</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirm Clear All Inline Modal */}
      {confirmClearAll && (
        <div className="vto-history-confirm-bar" role="alertdialog" aria-label="Xác nhận xóa toàn bộ lịch sử">
          <div className="text-xs text-red-100">
            <strong>Xác nhận xóa vĩnh viễn toàn bộ lịch sử &amp; ảnh riêng tư?</strong> Toàn bộ ảnh gốc và ảnh kết quả trên máy chủ KD-XX của bạn sẽ bị xóa ngay lập tức và không thể khôi phục.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="px-3.5 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
              onClick={handleClearAllHistory}
              disabled={busyAction}
            >
              Xác nhận xóa tất cả
            </button>
            <button
              type="button"
              className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 text-xs"
              onClick={() => setConfirmClearAll(false)}
              disabled={busyAction}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Feedback Notice */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between border ${
            notice.type === 'error'
              ? 'bg-red-950/60 border-red-500/40 text-red-200'
              : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            className="text-slate-400 hover:text-white underline ml-4"
            onClick={() => setNotice(null)}
          >
            Đóng
          </button>
        </div>
      )}

      {/* Search & Status Filters */}
      <div className="vto-history-controls">
        <form className="vto-history-search-form" onSubmit={handleSearchSubmit}>
          <Search size={15} className="vto-history-search-icon" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên sản phẩm, brand, SKU hoặc màu..."
            className="vto-history-search-input"
            aria-label="Tìm kiếm lịch sử thử đồ"
          />
          {searchInput && (
            <button
              type="button"
              className="text-slate-400 hover:text-white px-2 text-xs"
              onClick={() => {
                setSearchInput('');
                setAppliedSearch('');
                setPage(1);
              }}
            >
              Xóa
            </button>
          )}
          <button type="submit" className="vto-history-search-btn">
            Tìm
          </button>
        </form>

        <div className="vto-history-filter-row">
          <div className="vto-history-pills" role="tablist" aria-label="Lọc trạng thái">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`vto-history-pill ${statusFilter === f.id ? 'active' : ''}`}
                onClick={() => {
                  setStatusFilter(f.id);
                  setPage(1);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Lọc danh mục sản phẩm"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="vto-history-select"
          >
            <option value="all">Mọi danh mục</option>
            <option value="clothing">Clothing (Áo / Quần / Váy)</option>
            <option value="footwear">Footwear (Giày)</option>
            <option value="accessories">Accessories (Kính &amp; Phụ kiện)</option>
          </select>
        </div>
      </div>

      {/* Content Grid / Loading / Empty */}
      {loading ? (
        <div className="vto-history-empty-state">
          <RefreshCw size={24} className="animate-spin text-purple-400" />
          <p>Đang tải lịch sử thử đồ riêng tư của bạn...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="vto-history-empty-state">
          <History size={28} className="text-purple-400/80" />
          <h4>Chưa có phiên thử đồ nào khớp bộ lọc</h4>
          <p>
            Hãy tải ảnh trong tab <strong>Studio Thử Đồ AI</strong> để trải nghiệm và lưu phiên thử đồ trong 72 giờ.
          </p>
          {typeof onBackToStudio === 'function' && (
            <button type="button" className="vto-secondary-action-btn" onClick={onBackToStudio}>
              Quay lại Studio Thử Đồ
            </button>
          )}
        </div>
      ) : (
        <div className="vto-history-grid">
          {items.map((item) => {
            const snap = item.productSnapshot || {};
            const stMeta = STATUS_META[item.displayStatus] || STATUS_META[item.status] || STATUS_META.FAILED;
            const StatusIcon = stMeta.Icon;
            const origUrl = item.originalPreviewUrl ? buildAssetUrl(item.originalPreviewUrl) : null;
            const resUrl = item.resultPreviewUrl ? buildAssetUrl(item.resultPreviewUrl) : null;
            const retentionText = formatRemainingRetention(item.expiresAt, nowMs);
            const skuDisplay = snap.variantSku || snap.sku || 'Chưa có SKU';
            const categoryDisplay = snap.normalizedSubCategory && snap.normalizedSubCategory !== 'unknown'
              ? snap.normalizedSubCategory
              : (snap.catalogCategory || 'ready-to-wear');

            return (
              <article
                key={item.jobId || item.id}
                className="vto-history-card"
                data-testid={`history-card-${item.jobId || item.id}`}
              >
                {/* Header badge + expiry */}
                <div className="vto-history-card-head">
                  <span className={`vto-status-badge tone-${stMeta.tone}`}>
                    <StatusIcon size={12} />
                    <span>{stMeta.text}</span>
                  </span>
                  <span className={`vto-retention-pill ${item.isExpired ? 'expired' : ''}`}>
                    <Clock size={11} />
                    <span>{retentionText}</span>
                  </span>
                </div>

                {/* Dual Preview: Original & Result */}
                <div className="vto-history-thumbs">
                  <div className="vto-history-thumb-box">
                    <span className="vto-history-thumb-tag">Ảnh gốc</span>
                    {origUrl ? (
                      <img
                        src={origUrl}
                        alt={`Ảnh gốc - ${snap.productName || 'KD-XX'}`}
                        className="vto-history-thumb-img"
                        loading="lazy"
                      />
                    ) : (
                      <EmptyImageNotice
                        imageMeta={item.originalImage}
                        kind="original"
                        displayStatus={item.displayStatus}
                      />
                    )}
                  </div>

                  <div className="vto-history-thumb-box">
                    <span className="vto-history-thumb-tag ai">Kết quả AI</span>
                    {resUrl ? (
                      <img
                        src={resUrl}
                        alt={`Kết quả thử đồ - ${snap.productName || 'KD-XX'}`}
                        className="vto-history-thumb-img"
                        loading="lazy"
                      />
                    ) : (
                      <EmptyImageNotice
                        imageMeta={item.resultImage}
                        kind="result"
                        displayStatus={item.displayStatus}
                      />
                    )}
                  </div>
                </div>

                {/* Immutable Product Snapshot Metadata */}
                <div className="vto-history-card-body">
                  <div className="vto-history-meta-top">
                    <span className="vto-history-brand">{snap.brand || 'KD-XX'}</span>
                    <div className="flex items-center gap-1.5">
                      {item.mode === 'FULL_OUTFIT' && (
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 text-[9px] font-bold uppercase tracking-wider">
                          Full Outfit ({item.creditsCost || 2} Cr)
                        </span>
                      )}
                      <span className="vto-history-category-tag">{categoryDisplay}</span>
                    </div>
                  </div>
                  <h4 className="vto-history-product-title">{snap.productName || item.productName}</h4>

                  {item.mode === 'FULL_OUTFIT' && Array.isArray(item.outfitItems) && item.outfitItems.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {item.outfitItems.map((oi, idx) => (
                        <span
                          key={`${oi.productId || idx}`}
                          className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-slate-300"
                        >
                          {oi.slot}: {oi.productName}
                          {oi.variantColor ? ` (${oi.variantColor})` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.resultQualityCheck?.status === 'WARNING' && item.resultQualityCheck?.notes && (
                    <p className="text-[10px] text-amber-300/90 m-0">
                      {item.resultQualityCheck.notes}
                    </p>
                  )}

                  <dl className="vto-history-spec-list">
                    <div>
                      <dt>SKU</dt>
                      <dd>{skuDisplay}</dd>
                    </div>
                    <div>
                      <dt>Biến thể / Màu</dt>
                      <dd>
                        {[snap.variantColor, snap.variantSize].filter(Boolean).join(' • ') || 'Mặc định'}
                      </dd>
                    </div>
                    <div>
                      <dt>Ngày tạo</dt>
                      <dd>{formatDateTimeVi(item.createdAt)}</dd>
                    </div>
                  </dl>

                  {item.errorMessage && item.displayStatus !== 'COMPLETED' && (
                    <p className="vto-history-error-note">{item.errorMessage}</p>
                  )}
                </div>

                {/* Card Actions */}
                <div className="vto-history-card-actions">
                  <button
                    type="button"
                    className="vto-history-view-btn"
                    onClick={() => handleOpenDetail(item)}
                  >
                    <Eye size={14} />
                    <span>Xem &amp; So sánh</span>
                  </button>

                  <button
                    type="button"
                    className="vto-history-delete-icon-btn"
                    title="Xóa mục lịch sử này"
                    aria-label={`Xóa lịch sử ${snap.productName || ''}`}
                    onClick={() => handleDeleteHistoryItem(item.jobId || item.id)}
                    disabled={busyAction}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {pagination.total > 0 && (
        <div className="vto-history-pagination">
          <span className="text-xs text-slate-400">
            Trang <strong>{pagination.page}</strong> / {pagination.totalPages} • Tổng {pagination.total} phiên
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="vto-history-page-btn"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
              <span>Trước</span>
            </button>
            <button
              type="button"
              className="vto-history-page-btn"
              disabled={!pagination.hasMore || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <span>Sau</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Full-Size Compare & Detail Modal */}
      {selectedItem && (
        <div
          className="vto-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết phiên thử đồ"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedItem(null);
          }}
        >
          <div className="vto-history-detail-modal">
            <button
              type="button"
              className="vto-modal-close"
              aria-label="Đóng chi tiết"
              onClick={() => setSelectedItem(null)}
            >
              <X size={20} />
            </button>

            <div className="vto-history-detail-header">
              <div>
                <span className="vto-history-brand">
                  {selectedItem.productSnapshot?.brand || 'KD-XX'} •{' '}
                  {selectedItem.productSnapshot?.normalizedSubCategory || selectedItem.productSnapshot?.catalogCategory || 'ready-to-wear'}
                </span>
                <h3 className="text-lg font-bold text-white m-0 mt-1">
                  {selectedItem.productSnapshot?.productName || selectedItem.productName}
                </h3>
                <p className="text-xs text-slate-400 m-0 mt-1">
                  SKU: <strong className="text-slate-200">{selectedItem.productSnapshot?.variantSku || selectedItem.productSnapshot?.sku || 'Chưa có SKU'}</strong>
                  {selectedItem.productSnapshot?.variantColor ? ` • Màu: ${selectedItem.productSnapshot.variantColor}` : ''}
                  {' • '}
                  {formatRemainingRetention(selectedItem.expiresAt, nowMs)}
                </p>
              </div>

              {/* View mode toggles */}
              <div className="flex items-center flex-wrap gap-2 pr-8">
                {selectedItem.originalPreviewUrl && selectedItem.resultPreviewUrl && (
                  <button
                    type="button"
                    className={`vto-history-pill ${detailViewMode === 'split' ? 'active' : ''}`}
                    onClick={() => setDetailViewMode('split')}
                  >
                    <SplitSquareHorizontal size={13} className="inline mr-1" />
                    Trượt so sánh
                  </button>
                )}
                <button
                  type="button"
                  className={`vto-history-pill ${detailViewMode === 'side' ? 'active' : ''}`}
                  onClick={() => setDetailViewMode('side')}
                >
                  <Columns2 size={13} className="inline mr-1" />
                  Song song
                </button>
                {selectedItem.resultPreviewUrl && (
                  <button
                    type="button"
                    className={`vto-history-pill ${detailViewMode === 'result' ? 'active' : ''}`}
                    onClick={() => setDetailViewMode('result')}
                  >
                    Ảnh kết quả lớn
                  </button>
                )}
                {selectedItem.originalPreviewUrl && (
                  <button
                    type="button"
                    className={`vto-history-pill ${detailViewMode === 'original' ? 'active' : ''}`}
                    onClick={() => setDetailViewMode('original')}
                  >
                    Ảnh gốc lớn
                  </button>
                )}
              </div>
            </div>

            {/* Viewport */}
            <div className="vto-history-detail-stage">
              {detailViewMode === 'split' && selectedItem.originalPreviewUrl && selectedItem.resultPreviewUrl ? (
                <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 select-none w-full max-w-xl mx-auto aspect-[3/4] max-h-[520px]">
                  <img
                    src={buildAssetUrl(selectedItem.resultPreviewUrl)}
                    alt="Kết quả Try-On"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                  <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPosition}%` }}>
                    <img
                      src={buildAssetUrl(selectedItem.originalPreviewUrl)}
                      alt="Ảnh gốc"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      style={{ width: '100%', maxWidth: 'none' }}
                    />
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_#ffffff] flex items-center justify-center z-10"
                    style={{ left: `${sliderPosition}%` }}
                  >
                    <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-black shadow-lg">
                      ↔
                    </div>
                  </div>
                  <input
                    type="range"
                    aria-label="Thanh trượt so sánh ảnh gốc và kết quả"
                    min="0"
                    max="100"
                    value={sliderPosition}
                    onChange={(e) => setSliderPosition(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                  />
                </div>
              ) : detailViewMode === 'result' && selectedItem.resultPreviewUrl ? (
                <div className="vto-history-single-zoom">
                  <img
                    src={buildAssetUrl(selectedItem.resultPreviewUrl)}
                    alt="Kết quả AI kích thước lớn"
                    className="vto-result-img"
                  />
                </div>
              ) : detailViewMode === 'original' && selectedItem.originalPreviewUrl ? (
                <div className="vto-history-single-zoom">
                  <img
                    src={buildAssetUrl(selectedItem.originalPreviewUrl)}
                    alt="Ảnh gốc kích thước lớn"
                    className="vto-result-img"
                  />
                </div>
              ) : (
                <div className="vto-result-viewports">
                  <div className="vto-result-card">
                    <span className="vto-result-tag-badge">Ảnh Gốc Ban Đầu</span>
                    {selectedItem.originalPreviewUrl ? (
                      <img
                        src={buildAssetUrl(selectedItem.originalPreviewUrl)}
                        alt="Ảnh gốc"
                        className="vto-result-img"
                      />
                    ) : (
                      <div className="min-h-[280px] flex items-center justify-center">
                        <EmptyImageNotice
                          imageMeta={selectedItem.originalImage}
                          kind="original"
                          displayStatus={selectedItem.displayStatus}
                        />
                      </div>
                    )}
                  </div>
                  <div className="vto-result-card">
                    <span className="vto-result-tag-badge ai">Kết Quả KD-XX AI</span>
                    {selectedItem.resultPreviewUrl ? (
                      <img
                        src={buildAssetUrl(selectedItem.resultPreviewUrl)}
                        alt="Kết quả AI"
                        className="vto-result-img"
                      />
                    ) : (
                      <div className="min-h-[280px] flex items-center justify-center">
                        <EmptyImageNotice
                          imageMeta={selectedItem.resultImage}
                          kind="result"
                          displayStatus={selectedItem.displayStatus}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Detail Snapshot Metadata & Controls */}
            <div className="vto-history-detail-footer">
              <div className="flex items-center flex-wrap gap-2">
                {selectedItem.resultPreviewUrl && (
                  <button
                    type="button"
                    className="vto-primary-action-btn"
                    onClick={() => handleDownloadResult(selectedItem)}
                  >
                    <Download size={14} />
                    <span>Tải kết quả</span>
                  </button>
                )}

                {selectedItem.productSnapshot?.productId && (
                  <a
                    href={`/product/${selectedItem.productSnapshot.productId}`}
                    className="vto-secondary-action-btn"
                    style={{ textDecoration: 'none' }}
                  >
                    <ExternalLink size={14} />
                    <span>Xem sản phẩm</span>
                  </a>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-3">
                {selectedItem.originalImage?.isAvailable && (
                  <button
                    type="button"
                    className="vto-danger-btn"
                    disabled={busyAction}
                    onClick={() => handleDeleteAssetKind(selectedItem.jobId || selectedItem.id, 'original')}
                  >
                    <Trash2 size={13} />
                    <span>Xóa ảnh gốc</span>
                  </button>
                )}
                {selectedItem.resultImage?.isAvailable && (
                  <button
                    type="button"
                    className="vto-danger-btn"
                    disabled={busyAction}
                    onClick={() => handleDeleteAssetKind(selectedItem.jobId || selectedItem.id, 'result')}
                  >
                    <Trash2 size={13} />
                    <span>Xóa ảnh kết quả</span>
                  </button>
                )}
                <button
                  type="button"
                  className="vto-danger-btn"
                  disabled={busyAction}
                  onClick={() => handleDeleteHistoryItem(selectedItem.jobId || selectedItem.id)}
                >
                  <Trash2 size={13} />
                  <span>Xóa mục lịch sử</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
