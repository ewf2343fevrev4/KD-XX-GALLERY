import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RotateCcw,
  Shield,
  AlertTriangle
} from 'lucide-react';
import { buildApiUrl } from '../../config/apiConfig';
import AdminProductIntelligence from './AdminProductIntelligence';
import AdminProviderRegistry from './AdminProviderRegistry';

export default function AdminVirtualTryOn() {
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [providerRegistry, setProviderRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('jobs'); // 'jobs' | 'ledgers' | 'adjust'
  const [statusFilter, setStatusFilter] = useState('');

  // Manual Adjust Form
  const [adjustTargetUserId, setAdjustTargetUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState(5);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState(null);

  // Reconciliation Modal
  const [reconcileModal, setReconcileModal] = useState(null); // { job, action: 'refund'|'commit', reason: '' }
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState(null);

  const token = localStorage.getItem('token');

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Stats
      const statsRes = await fetch(buildApiUrl('/tryon/admin/stats'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const statsJson = await statsRes.json();
      if (statsRes.ok) setStats(statsJson.data);

      // 2. Jobs
      const jobsRes = await fetch(
        buildApiUrl(`/tryon/admin/jobs${statusFilter ? `?status=${statusFilter}` : ''}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const jobsJson = await jobsRes.json();
      if (jobsRes.ok) setJobs(jobsJson.data || []);

      // 3. Ledgers
      const ledgersRes = await fetch(buildApiUrl('/tryon/admin/ledgers'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const ledgersJson = await ledgersRes.json();
      if (ledgersRes.ok) setLedgers(ledgersJson.data || []);

      // 4. Provider Registry & Usage Stats
      const providersRes = await fetch(buildApiUrl('/tryon/admin/providers'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const providersJson = await providersRes.json();
      if (providersRes.ok) setProviderRegistry(providersJson.data || null);
    } catch (e) {
      console.error('Failed to load Try-On admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualAdjust = async (e) => {
    e.preventDefault();
    if (!adjustTargetUserId || !adjustReason) {
      alert('Vui lòng nhập ID người dùng và lý do điều chỉnh');
      return;
    }

    setAdjustLoading(true);
    setAdjustMessage(null);
    try {
      const res = await fetch(buildApiUrl('/tryon/admin/adjust-credit'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId: adjustTargetUserId.trim(),
          amount: Number(adjustAmount),
          reason: adjustReason.trim(),
          idempotencyKey: `ADMIN_${Date.now()}_${adjustTargetUserId.trim()}`
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setAdjustMessage({ type: 'success', text: json.message });
        setAdjustReason('');
        loadData();
      } else {
        setAdjustMessage({ type: 'error', text: json.message || 'Lỗi điều chỉnh credit' });
      }
    } catch (e) {
      setAdjustMessage({ type: 'error', text: 'Lỗi kết nối máy chủ' });
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleResolveReconciliation = async (e) => {
    e.preventDefault();
    if (!reconcileModal?.job?._id || !reconcileModal.reason || reconcileModal.reason.trim().length < 5) {
      setReconcileNotice({ type: 'error', text: 'Vui lòng nhập lý do đối soát ít nhất 5 ký tự' });
      return;
    }

    setReconcileLoading(true);
    setReconcileNotice(null);
    try {
      const res = await fetch(buildApiUrl(`/tryon/admin/jobs/${reconcileModal.job._id}/reconcile`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          mode: 'manual',
          action: reconcileModal.action,
          reason: reconcileModal.reason.trim()
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setReconcileNotice({ type: 'success', text: json.message });
        setReconcileModal(null);
        loadData();
      } else {
        setReconcileNotice({ type: 'error', text: json.message || 'Không thể xử lý đối soát phiên này' });
      }
    } catch (err) {
      setReconcileNotice({ type: 'error', text: 'Lỗi kết nối khi gửi quyết định đối soát' });
    } finally {
      setReconcileLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-purple-900/60 to-slate-900 p-6 rounded-2xl border border-purple-500/30 text-white flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/40 border border-purple-400/40 flex items-center justify-center text-purple-200">
            <Sparkles size={28} />
          </div>
          <div>
            <h2 className="text-xl font-bold uppercase tracking-wider m-0">
              Quản Trị Virtual Try-On & AI Providers
            </h2>
            <p className="text-xs text-slate-300 mt-1 mb-0">
              {(() => {
                const active = providerRegistry?.providers?.find((p) => p.available);
                if (!active) {
                  return 'Chưa có AI provider nào đang bật hoặc đang tải Registry...';
                }
                return (
                  <>
                    Active Clothing: <code className="text-purple-300 font-mono">{active.modelId}</code> • Region:{' '}
                    <code className="text-purple-300 font-mono">{active.region}</code> • Tổng Registry:{' '}
                    <code className="text-purple-300 font-mono">{providerRegistry?.providers?.length || 0}</code>
                  </>
                );
              })()}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold flex items-center gap-2 border border-white/10 transition-colors"
        >
          <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Làm Mới</span>
        </button>
      </div>

      {/* Deprecation Warning Banner when active model has deprecation announced */}
      {(() => {
        const deprecatedSoon = providerRegistry?.providers?.find(
          (p) => p.available && p.lifecycleStage === 'DEPRECATION_ANNOUNCED'
        );
        if (!deprecatedSoon) return null;
        return (
          <div
            data-testid="admin-vto-deprecation-warning"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3"
          >
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold uppercase tracking-wider">
                Cảnh Báo Lộ Trình Ngừng Hỗ Trợ Model ({deprecatedSoon.modelId})
              </div>
              <p className="mt-1 mb-0">
                Google Cloud thông báo deprecation ngày <code className="font-mono font-bold">{deprecatedSoon.deprecationDate}</code> và retirement ngày{' '}
                <code className="font-mono font-bold">{deprecatedSoon.retirementDate}</code>. Backend sẽ tự động chặn job mới từ ngày retirement bất kể công tắc Admin.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">Tổng Phiên Thử</span>
          <span className="text-2xl font-black text-gray-900 mt-1 block">{stats?.totalJobs ?? 0}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-emerald-600 uppercase tracking-wider block">Thành Công</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats?.completedJobs ?? 0}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
          <span className="text-xs font-medium text-amber-600 uppercase tracking-wider block">Cần Đối Soát</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">{stats?.reconciliationJobs ?? 0}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-purple-600 uppercase tracking-wider block">Tỉ Lệ Đạt</span>
          <span className="text-2xl font-black text-purple-600 mt-1 block">{stats?.successRate ?? 100}%</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wider block">Hàng Đợi Active</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">{stats?.activeQueue ?? 0}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-indigo-600 uppercase tracking-wider block">HOMIE Member</span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">{stats?.homieSubscribers ?? 0}</span>
        </div>
      </div>

      {reconcileNotice && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            reconcileNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {reconcileNotice.text}
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          type="button"
          className={`pb-3 font-semibold text-sm capitalize transition border-b-2 ${
            activeSubTab === 'jobs'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setActiveSubTab('jobs')}
        >
          Lịch Sử Phiên Thử Đồ ({jobs.length})
        </button>
        <button
          type="button"
          className={`pb-3 font-semibold text-sm capitalize transition border-b-2 ${
            activeSubTab === 'ledgers'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setActiveSubTab('ledgers')}
        >
          Sổ Cái Biến Động Credit ({ledgers.length})
        </button>
        <button
          type="button"
          className={`pb-3 font-semibold text-sm capitalize transition border-b-2 ${
            activeSubTab === 'adjust'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setActiveSubTab('adjust')}
        >
          Điều Chỉnh Credit Thủ Công (Audit)
        </button>
        <button
          type="button"
          className={`pb-3 font-semibold text-sm capitalize transition border-b-2 ${
            activeSubTab === 'intelligence'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setActiveSubTab('intelligence')}
        >
          Product Intelligence
        </button>
        <button
          type="button"
          className={`pb-3 font-semibold text-sm capitalize transition border-b-2 ${
            activeSubTab === 'providers'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setActiveSubTab('providers')}
        >
          Quản Lý AI Providers ({providerRegistry?.providers?.length ?? 0})
        </button>
      </div>

      {/* SubTab 1: Jobs Table */}
      {activeSubTab === 'jobs' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Danh sách phiên Virtual Try-On
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Trạng thái:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
              >
                <option value="">Tất cả</option>
                <option value="COMPLETED">COMPLETED (Hoàn tất)</option>
                <option value="RECONCILIATION_REQUIRED">RECONCILIATION_REQUIRED (Cần đối soát)</option>
                <option value="QUEUED">QUEUED (Hàng đợi)</option>
                <option value="PROCESSING">PROCESSING (Đang xử lý)</option>
                <option value="FAILED">FAILED (Thất bại)</option>
                <option value="CANCELLED">CANCELLED (Hủy)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-semibold border-b">
                <tr>
                  <th className="p-3.5">Mã Job</th>
                  <th className="p-3.5">Khách Hàng</th>
                  <th className="p-3.5">Sản Phẩm</th>
                  <th className="p-3.5">Trạng Thái</th>
                  <th className="p-3.5">Thời Gian Xử Lý</th>
                  <th className="p-3.5">Tạo Lúc</th>
                  <th className="p-3.5">Đối Soát / Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-8 text-gray-400">
                      Chưa có phiên thử đồ nào.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job._id} className="hover:bg-gray-50/80">
                      <td className="p-3.5 font-mono text-purple-600 font-bold">
                        #{job._id.slice(-6)}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-gray-900">{job.user?.name || 'Khách'}</div>
                        <div className="text-[11px] text-gray-400">{job.user?.email}</div>
                      </td>
                      <td className="p-3.5 font-medium text-gray-800">
                        <div>{job.productName || job.product?.name || '—'}</div>
                        {job.providerRequestId && (
                          <div className="text-[10px] font-mono text-gray-400 truncate max-w-[180px]">
                            {job.providerRequestId}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                            job.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : job.status === 'RECONCILIATION_REQUIRED'
                              ? 'bg-amber-100 text-amber-800'
                              : job.status === 'PROCESSING'
                              ? 'bg-blue-100 text-blue-800 animate-pulse'
                              : job.status === 'QUEUED'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-gray-600">
                        {job.timing?.durationMs ? `${(job.timing.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="p-3.5 text-gray-400 text-[11px]">
                        {new Date(job.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="p-3.5">
                        {job.status === 'RECONCILIATION_REQUIRED' ? (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setReconcileModal({
                                  job,
                                  action: 'refund',
                                  reason: ''
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-[11px]"
                            >
                              Hoàn Credit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setReconcileModal({
                                  job,
                                  action: 'commit',
                                  reason: ''
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 font-semibold text-[11px]"
                            >
                              Chốt Trừ
                            </button>
                          </div>
                        ) : job.reconciliation?.resolutionNote ? (
                          <span className="text-[11px] text-gray-500" title={job.reconciliation.resolutionNote}>
                            {job.reconciliation.state}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {reconcileModal && (
            <div className="p-5 bg-amber-50 border-t border-amber-200">
              <form onSubmit={handleResolveReconciliation} className="space-y-3 text-xs max-w-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertTriangle size={16} />
                    <span>
                      Đối soát phiên #{reconcileModal.job._id.slice(-6)} — Hành động:{' '}
                      {reconcileModal.action === 'refund'
                        ? `HOÀN ${reconcileModal.job.creditsCost || 1} CREDIT (FAILED)`
                        : `CHỐT TRỪ ${reconcileModal.job.creditsCost || 1} CREDIT (COMMIT)`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-gray-500 hover:text-gray-800 underline"
                    onClick={() => setReconcileModal(null)}
                  >
                    Đóng
                  </button>
                </div>
                <textarea
                  rows="2"
                  value={reconcileModal.reason}
                  onChange={(e) => setReconcileModal({ ...reconcileModal, reason: e.target.value })}
                  placeholder="Nhập bằng chứng kiểm tra GCP Cloud Console / lý do đối soát (tối thiểu 5 ký tự)..."
                  className="w-full border border-amber-300 rounded-lg p-2.5 bg-white focus:outline-none"
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={reconcileLoading}
                    className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold disabled:opacity-50"
                  >
                    {reconcileLoading ? 'Đang Ghi Sổ Cái...' : 'Xác Nhận Đối Soát'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* SubTab 2: Ledgers Table */}
      {activeSubTab === 'ledgers' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Nhật ký Sổ Cái Bất Biến (Immutable Audit Ledger)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-semibold border-b">
                <tr>
                  <th className="p-3.5">Khách Hàng</th>
                  <th className="p-3.5">Loại Giao Dịch</th>
                  <th className="p-3.5">Biến Động</th>
                  <th className="p-3.5">Số Dư Sau</th>
                  <th className="p-3.5">Diễn Giải / Lý Do</th>
                  <th className="p-3.5">Thời Gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledgers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-400">
                      Chưa có bản ghi sổ cái nào.
                    </td>
                  </tr>
                ) : (
                  ledgers.map((l) => (
                    <tr key={l._id} className="hover:bg-gray-50/80">
                      <td className="p-3.5 font-medium text-gray-900">
                        {l.user?.name || l.user?.email || 'User'}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] font-bold text-gray-700">
                        {l.transactionType}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`font-black ${
                            l.amount > 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          {l.amount > 0 ? `+${l.amount}` : l.amount}
                        </span>
                      </td>
                      <td className="p-3.5 font-black text-gray-900">
                        {l.balanceAfter}
                      </td>
                      <td className="p-3.5 text-gray-600 max-w-xs truncate" title={l.reason}>
                        {l.reason}
                      </td>
                      <td className="p-3.5 text-gray-400 text-[11px]">
                        {new Date(l.createdAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 3: Manual Adjust Form */}
      {activeSubTab === 'adjust' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm max-w-xl">
          <div className="flex items-center gap-2 mb-4 text-purple-700">
            <Shield size={18} />
            <h3 className="text-base font-bold m-0 uppercase tracking-wider">
              Điều Chỉnh Credit Có Audit Log
            </h3>
          </div>

          {adjustMessage && (
            <div
              className={`p-3 rounded-xl text-xs mb-4 ${
                adjustMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {adjustMessage.text}
            </div>
          )}

          <form onSubmit={handleManualAdjust} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">User ID Khách Hàng (ObjectId):</label>
              <input
                type="text"
                placeholder="Ví dụ: 68f20aa6c81fb4600362d889"
                value={adjustTargetUserId}
                onChange={(e) => setAdjustTargetUserId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:border-purple-600 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Số Lượng Credit Điều Chỉnh (+ hoặc -):</label>
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:border-purple-600 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                Nhập số dương (ví dụ 10) để tặng thêm, nhập số âm (ví dụ -5) để thu hồi.
              </span>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Lý Do Điều Chỉnh (Bắt Buộc Cho Audit):</label>
              <textarea
                rows="3"
                placeholder="Ví dụ: Đền bù do sự cố kết nối mạng trong phiên #... hoặc CSKH đặc biệt"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 focus:border-purple-600 focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={adjustLoading}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              {adjustLoading ? 'Đang Thực Hiện...' : 'Xác Nhận Điều Chỉnh Credit'}
            </button>
          </form>
        </div>
      )}
      {/* SubTab 4: Product Intelligence */}
      {activeSubTab === 'intelligence' && <AdminProductIntelligence />}

      {/* SubTab 5: AI Provider Registry & Category Matrix */}
      {activeSubTab === 'providers' && (
        <AdminProviderRegistry
          registryData={providerRegistry}
          token={token}
          onUpdated={(nextData) => setProviderRegistry(nextData)}
        />
      )}
    </div>
  );
}
