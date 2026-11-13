import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Image as ImageIcon,
  Link2,
  Lock,
  History
} from 'lucide-react';
import { buildApiUrl } from '../../config/apiConfig';

const FILTER_OPTIONS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'missing_data', label: 'Chưa có thông tin' },
  { id: 'unverified', label: 'Chưa xác minh' },
  { id: 'conflict', label: 'Mâu thuẫn nguồn' },
  { id: 'missing_images', label: 'Thiếu / Lỗi ảnh' },
  { id: 'sku_mismatch', label: 'Lệch SKU / Variant' },
  { id: 'stale', label: 'Nguồn đã cũ' },
  { id: 'verified', label: 'Đã xác minh' }
];

export default function AdminProductIntelligence() {
  const [filter, setFilter] = useState('all');
  const [counts, setCounts] = useState({});
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(null);

  const [selectedProductId, setSelectedProductId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Forms in detail panel
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formMaterial, setFormMaterial] = useState('');
  const [formPattern, setFormPattern] = useState('');
  const [formShape, setFormShape] = useState('');
  const [formFit, setFormFit] = useState('');
  const [formLogoPos, setFormLogoPos] = useState('');
  const [auditReason, setAuditReason] = useState('');

  const token = localStorage.getItem('token');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/tryon/admin/product-intelligence?filter=${filter}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setCounts(json.data.counts || {});
        setItems(json.data.items || []);
      } else {
        setNotice({ type: 'error', text: json.message || 'Không thể tải danh sách Product Intelligence' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối máy chủ khi tải Product Intelligence' });
    } finally {
      setLoading(false);
    }
  }, [filter, token]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (productId) => {
    if (!productId) return;
    setSelectedProductId(productId);
    setDetailLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/tryon/admin/product-intelligence/${productId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setDetailData(json.data);
        const intel = json.data.intelligence || {};
        setFormSku(intel.sku || '');
        setFormSubCategory(intel.normalizedCategory?.subCategory || '');
        setFormColor(intel.attributes?.color?.primary || '');
        setFormMaterial(intel.attributes?.material?.value || '');
        setFormPattern(intel.attributes?.pattern?.value || '');
        setFormShape(intel.attributes?.shape?.value || '');
        setFormFit(intel.attributes?.fit?.value || '');
        setFormLogoPos(intel.attributes?.logoPosition?.value || '');
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Không thể tải chi tiết Product Intelligence' });
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const handleSyncAll = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch(buildApiUrl('/tryon/admin/product-intelligence/sync-all'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotice({ type: 'success', text: json.message });
        loadList();
      } else {
        setNotice({ type: 'error', text: json.message || 'Không thể đồng bộ dữ liệu' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi đồng bộ catalog' });
    } finally {
      setSyncing(false);
    }
  };

  const handleIngestSource = async (e) => {
    e.preventDefault();
    if (!selectedProductId || !sourceUrlInput.trim()) return;
    setNotice(null);
    try {
      const res = await fetch(buildApiUrl(`/tryon/admin/product-intelligence/${selectedProductId}/ingest-source`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sourceUrl: sourceUrlInput.trim() })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotice({ type: 'success', text: json.message });
        setSourceUrlInput('');
        loadDetail(selectedProductId);
        loadList();
      } else {
        setNotice({ type: 'error', text: json.message || 'Từ chối / không thể tải nguồn sản phẩm' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi truy xuất nguồn ngoài' });
    }
  };

  const handleAnalyzeImages = async () => {
    if (!selectedProductId) return;
    setNotice(null);
    try {
      const res = await fetch(buildApiUrl(`/tryon/admin/product-intelligence/${selectedProductId}/analyze-image`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotice({ type: 'success', text: json.message });
        loadDetail(selectedProductId);
        loadList();
      } else {
        setNotice({ type: 'error', text: json.message || 'Không thể phân tích ảnh sản phẩm' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi phân tích ảnh' });
    }
  };

  const handleVerifyAction = async (action, extraBody = {}) => {
    if (!selectedProductId) return;
    setNotice(null);
    try {
      const body = {
        action,
        reason: auditReason.trim() || `Admin thực hiện ${action}`,
        ...extraBody
      };
      const res = await fetch(buildApiUrl(`/tryon/admin/product-intelligence/${selectedProductId}/verify`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotice({ type: 'success', text: json.message });
        setAuditReason('');
        loadDetail(selectedProductId);
        loadList();
      } else {
        setNotice({ type: 'error', text: json.message || 'Thao tác thất bại' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối khi cập nhật xác minh' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Sync */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Database size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 m-0 uppercase tracking-wider">
              Quản Trị Product Intelligence & Catalog Taxonomy
            </h3>
            <p className="text-xs text-gray-500 m-0 mt-0.5">
              Xác minh SKU, nguồn thương hiệu, phân tích ảnh và bảo vệ thuộc tính đã Admin khóa khỏi ghi đè AI.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSyncAll}
          disabled={syncing}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          <span>{syncing ? 'Đang Đồng Bộ...' : 'Đồng Bộ Catalog KD-XX'}</span>
        </button>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Filter Queue Pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const countKey = opt.id === 'all' ? 'total' : opt.id;
          const isActive = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                isActive
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label} ({counts[countKey] ?? 0})
            </button>
          );
        })}
      </div>

      {/* Product Intelligence Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-semibold border-b">
              <tr>
                <th className="p-3.5">Sản Phẩm</th>
                <th className="p-3.5">SKU / Variant</th>
                <th className="p-3.5">Taxonomy & Hỗ Trợ AI</th>
                <th className="p-3.5">Trạng Thái & Độ Tin Cậy</th>
                <th className="p-3.5">Cảnh Báo Dữ Liệu</th>
                <th className="p-3.5">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">Đang tải dữ liệu...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">Không có sản phẩm nào trong bộ lọc này.</td>
                </tr>
              ) : (
                items.map((item) => {
                  const prodId = item.product?._id || item.product;
                  return (
                    <tr key={item._id} className="hover:bg-gray-50/80">
                      <td className="p-3.5 font-semibold text-gray-900">
                        <div>{item.productName || item.product?.name}</div>
                        <div className="text-[11px] font-normal text-gray-400">{item.brand} • Raw: {item.catalogCategory}</div>
                      </td>
                      <td className="p-3.5 font-mono text-[11px]">
                        {item.sku ? (
                          <span className="text-indigo-700 font-bold">{item.sku}</span>
                        ) : (
                          <span className="text-amber-600">Thiếu SKU</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-gray-800">
                          {item.normalizedCategory?.domain} / {item.normalizedCategory?.subCategory}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {item.normalizedCategory?.tryOnSupportLevel}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.verificationStatus === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.verificationStatus === 'CONFLICT'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.verificationStatus} ({Math.round((item.confidenceScore || 0) * 100)}%)
                        </span>
                      </td>
                      <td className="p-3.5 space-x-1">
                        {item.flags?.missingImages && <span className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-[10px]">Lỗi/Thiếu ảnh</span>}
                        {item.flags?.hasConflicts && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">Mâu thuẫn</span>}
                        {item.flags?.skuVariantMismatch && <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-[10px]">Lệch SKU/Màu</span>}
                        {item.flags?.staleSource && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">Nguồn cũ</span>}
                      </td>
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() => loadDetail(prodId)}
                          className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 font-semibold text-[11px]"
                        >
                          Kiểm Tra / Xác Minh
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspection & Verification Drawer */}
      {selectedProductId && (
        <div className="bg-white rounded-2xl border border-purple-200 p-5 shadow-sm space-y-5 text-xs">
          {detailLoading || !detailData ? (
            <div className="text-center py-6 text-gray-400">Đang tải chi tiết sản phẩm...</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 m-0">
                    {detailData.product.name} ({detailData.intelligence.sku || 'Chưa có SKU'})
                  </h4>
                  <span className="text-[11px] text-gray-500">
                    Admin locked fields: {(detailData.intelligence.adminLockedFields || []).join(', ') || 'Chưa có'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAnalyzeImages}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold flex items-center gap-1"
                  >
                    <ImageIcon size={13} />
                    <span>Phân Tích Pixel & Ảnh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProductId(null)}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                  >
                    Đóng
                  </button>
                </div>
              </div>

              {/* Multi-Source Ingestion & Records */}
              <div className="space-y-2">
                <h5 className="font-bold text-gray-800 uppercase tracking-wider m-0 flex items-center gap-1.5">
                  <Link2 size={14} />
                  <span>Nguồn Dữ Liệu ({detailData.intelligence.sourceRecords?.length || 0})</span>
                </h5>

                <form onSubmit={handleIngestSource} className="flex gap-2">
                  <input
                    type="url"
                    placeholder="Nhập HTTPS URL từ amiri.com / ssense.com / farfetch.com / club21.com..."
                    value={sourceUrlInput}
                    onChange={(e) => setSourceUrlInput(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:border-purple-600 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold"
                  >
                    Kiểm Tra Nguồn
                  </button>
                </form>

                <div className="space-y-1.5">
                  {(detailData.intelligence.sourceRecords || []).map((src, i) => (
                    <div key={src.sourceId || i} className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-gray-800">{src.sourceType}</span>
                        <span className="mx-1.5 text-gray-400">•</span>
                        <span className="font-mono text-[11px] text-gray-600">{src.sourceUrl || src.domain}</span>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Match: <strong>{src.productMatchingStatus}</strong> • Trạng thái: <strong>{src.verificationStatus}</strong>
                          {src.failureReason ? ` • ${src.failureReason}` : ''}
                        </div>
                      </div>
                      {src.sourceUrl && src.verificationStatus !== 'UNTRUSTED' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyAction('mark_untrusted', { sourceUrl: src.sourceUrl })}
                          className="px-2.5 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <ShieldAlert size={12} />
                          <span>Đánh Dấu Không Đáng Tin</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Admin Locked Attribute Editor */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">SKU Chính Thức</label>
                  <input value={formSku} onChange={(e) => setFormSku(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Sub-Category</label>
                  <input value={formSubCategory} onChange={(e) => setFormSubCategory(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Màu Sắc Xác Nhận</label>
                  <input value={formColor} onChange={(e) => setFormColor(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Chất Liệu Xác Nhận</label>
                  <input value={formMaterial} onChange={(e) => setFormMaterial(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Họa Tiết (Pattern)</label>
                  <input value={formPattern} onChange={(e) => setFormPattern(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Phom / Shape</label>
                  <input value={formShape} onChange={(e) => setFormShape(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Fit</label>
                  <input value={formFit} onChange={(e) => setFormFit(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Vị Trí Logo</label>
                  <input value={formLogoPos} onChange={(e) => setFormLogoPos(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                </div>

                <div className="md:col-span-4 space-y-2 pt-2">
                  <input
                    type="text"
                    placeholder="Lý do audit cho thay đổi/xác minh..."
                    value={auditReason}
                    onChange={(e) => setAuditReason(e.target.value)}
                    className="w-full border rounded-lg p-2 bg-white"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleVerifyAction('update_attributes', {
                          sku: formSku,
                          subCategory: formSubCategory,
                          attributes: {
                            color: formColor,
                            material: formMaterial,
                            pattern: formPattern,
                            shape: formShape,
                            fit: formFit,
                            logoPosition: formLogoPos
                          }
                        })
                      }
                      className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1"
                    >
                      <Lock size={13} />
                      <span>Lưu & Khóa Thuộc Tính</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleVerifyAction('approve', {
                          sku: formSku,
                          subCategory: formSubCategory,
                          attributes: {
                            color: formColor,
                            material: formMaterial,
                            pattern: formPattern,
                            shape: formShape,
                            fit: formFit,
                            logoPosition: formLogoPos
                          }
                        })
                      }
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1"
                    >
                      <CheckCircle2 size={13} />
                      <span>Xác Nhận (Approve)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVerifyAction('reject')}
                      className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1"
                    >
                      <XCircle size={13} />
                      <span>Từ Chối Xác Minh</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Product Context Preview & Audit Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <h5 className="font-bold text-gray-800 uppercase tracking-wider m-0 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-purple-600" />
                    <span>AI Product Context Preview (HTML-Free)</span>
                  </h5>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] overflow-x-auto max-h-60">
                    {JSON.stringify(detailData.aiContextPreview, null, 2)}
                  </pre>
                </div>

                <div className="space-y-1.5">
                  <h5 className="font-bold text-gray-800 uppercase tracking-wider m-0 flex items-center gap-1.5">
                    <History size={14} className="text-gray-600" />
                    <span>Audit Trail ({detailData.intelligence.auditLogs?.length || 0})</span>
                  </h5>
                  <div className="max-h-60 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-2.5 bg-gray-50">
                    {(detailData.intelligence.auditLogs || []).slice().reverse().map((log, i) => (
                      <div key={i} className="text-[11px] border-b border-gray-200 last:border-0 pb-1.5">
                        <div className="font-bold text-gray-800">{log.action} ({log.actorRole})</div>
                        <div className="text-gray-600">{log.summary}</div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(log.timestamp).toLocaleString('vi-VN')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
