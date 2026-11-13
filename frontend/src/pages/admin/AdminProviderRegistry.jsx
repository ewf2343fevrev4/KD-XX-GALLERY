import React, { useState } from 'react';
import {
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Activity,
  DollarSign,
  History
} from 'lucide-react';
import { buildApiUrl } from '../../config/apiConfig';

const STATUS_BADGE = {
  VERIFIED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  LIMITED: 'bg-amber-100 text-amber-800 border-amber-200',
  EXPERIMENTAL: 'bg-purple-100 text-purple-800 border-purple-200',
  NOT_CONFIGURED: 'bg-gray-100 text-gray-700 border-gray-300',
  UNSUPPORTED: 'bg-red-100 text-red-800 border-red-200',
  DEPRECATED: 'bg-red-200 text-red-900 border-red-300'
};

export default function AdminProviderRegistry({
  registryData,
  token,
  onUpdated
}) {
  const [reason, setReason] = useState('');
  const [busyProviderId, setBusyProviderId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const providers = registryData?.providers || [];
  const categoryMatrix = registryData?.categoryMatrix || [];
  const usageStats = registryData?.usageStats || null;
  const auditLogs = registryData?.auditLogs || [];

  const handleUpdateProvider = async (providerId, payload) => {
    setBusyProviderId(providerId);
    setFeedback(null);
    try {
      const res = await fetch(buildApiUrl(`/tryon/admin/providers/${providerId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...payload,
          reason: reason.trim() || `Admin cập nhật ${providerId}`
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ type: 'success', text: json.message });
        setReason('');
        if (onUpdated) onUpdated(json.data);
      } else {
        setFeedback({ type: 'error', text: json.message || 'Không thể cập nhật provider' });
      }
    } catch (e) {
      setFeedback({ type: 'error', text: 'Lỗi kết nối khi cập nhật cấu hình provider' });
    } finally {
      setBusyProviderId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-provider-registry">
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* 1. Category Support Matrix */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 m-0 flex items-center gap-2">
              <Cpu size={16} className="text-purple-600" />
              Ma Trận Năng Lực Theo Danh Mục Sản Phẩm
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-0">
              Hệ thống tự động chặn submit & không fallback sai danh mục khi trạng thái không phải VERIFIED/Enabled.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {categoryMatrix.map((row) => (
            <div
              key={row.key}
              className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/70 flex flex-col justify-between gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-gray-900">{row.label || row.key}</div>
                  <div className="text-[11px] font-mono text-gray-500 mt-0.5">
                    {row.modelId ? `${row.providerName} • ${row.modelId}` : 'Chưa gán model'}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    STATUS_BADGE[row.status] || STATUS_BADGE.UNSUPPORTED
                  }`}
                >
                  {row.status}
                </span>
              </div>

              <div className="text-[11px] text-gray-600 leading-relaxed">
                {row.reason}
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-gray-200">
                <span className={row.allowSubmit ? 'text-emerald-700 font-bold' : 'text-red-700 font-semibold'}>
                  {row.allowSubmit ? 'Cho phép Try-On' : 'Đang chặn submit'}
                </span>
                {row.retirementDate && (
                  <span className="text-amber-700 font-mono">
                    Retire: {row.retirementDate}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Real Usage & Cost Stats (Never Fake) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 mb-3 flex items-center gap-2">
          <DollarSign size={16} className="text-emerald-600" />
          Thống Kê Sử Dụng & Chi Phí Thực Tế ({usageStats?.windowDays || 30} ngày gần nhất)
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
            <span className="text-[11px] text-gray-500 block">Tổng Job Thực Tế</span>
            <span className="text-xl font-black text-gray-900">{usageStats?.totalJobs ?? 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
            <span className="text-[11px] text-gray-500 block">Thành Công</span>
            <span className="text-xl font-black text-emerald-600">{usageStats?.completedJobs ?? 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
            <span className="text-[11px] text-gray-500 block">Tỉ Lệ Lỗi</span>
            <span className="text-xl font-black text-amber-600">{usageStats?.failureRate ?? 0}%</span>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
            <span className="text-[11px] text-gray-500 block">Ước Tính Từ Job Đã Ghi</span>
            <span className="text-xl font-black text-purple-700">
              ${Number(usageStats?.totalEstimatedUsd || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {(usageStats?.byProvider?.length || 0) === 0 ? (
          <p className="text-xs text-gray-500 m-0">
            Chưa có dữ liệu job mới trong {usageStats?.windowDays || 30} ngày gần nhất. Hệ thống không tự tạo số liệu giả.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-500 uppercase text-[10px]">
                  <th className="p-2.5">Provider ID</th>
                  <th className="p-2.5">Jobs</th>
                  <th className="p-2.5">Completed</th>
                  <th className="p-2.5">Failure Rate</th>
                  <th className="p-2.5">Avg Latency</th>
                  <th className="p-2.5">Est. Cost USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usageStats.byProvider.map((p) => (
                  <tr key={p.providerId}>
                    <td className="p-2.5 font-mono font-bold text-gray-800">{p.providerId}</td>
                    <td className="p-2.5">{p.totalJobs}</td>
                    <td className="p-2.5 text-emerald-700 font-semibold">{p.completedJobs}</td>
                    <td className="p-2.5">{p.failureRate}%</td>
                    <td className="p-2.5">{p.avgDurationMs ? `${(p.avgDurationMs / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="p-2.5 font-mono">${Number(p.estimatedCostUsd || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Provider Registry & Governance Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 m-0 flex items-center gap-2">
              <Activity size={16} className="text-purple-600" />
              Danh Sách AI Try-On Providers & Kiểm Soát Kích Hoạt ({providers.length})
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-0">
              Không hiển thị credentials/secret. Không thể bật provider NOT_CONFIGURED hoặc model đã đến ngày retirement.
            </p>
          </div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ghi chú lý do cho Audit Log (tùy chọn)..."
            className="text-xs border border-gray-300 rounded-xl px-3 py-2 w-full md:w-72 focus:outline-none focus:border-purple-600"
          />
        </div>

        <div className="space-y-3">
          {providers.map((p) => {
            const canToggle = !p.isPastRetirement && p.verificationStatus !== 'NOT_CONFIGURED' && p.baseAvailable;
            const cbOpen = p.circuitBreaker?.state === 'OPEN';

            return (
              <div
                key={p.providerId}
                className="p-4 rounded-xl border border-gray-200 hover:border-purple-200 transition-colors space-y-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{p.displayName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          STATUS_BADGE[p.verificationStatus] || STATUS_BADGE.UNSUPPORTED
                        }`}
                      >
                        {p.verificationStatus}
                      </span>
                      {p.lifecycleStage && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                          {p.lifecycleStage}
                        </span>
                      )}
                      {cbOpen && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                          CIRCUIT OPEN
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 font-mono mt-1">
                      ID: {p.providerId} • Model: {p.modelId} • Region: {p.region} • Est: ${p.estimatedCost?.unitCostUsd ?? 0}/img
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {cbOpen && (
                      <button
                        type="button"
                        disabled={busyProviderId === p.providerId}
                        onClick={() => handleUpdateProvider(p.providerId, { resetCircuitBreaker: true })}
                        className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-1"
                      >
                        <RefreshCw size={12} />
                        Reset Circuit
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!canToggle || busyProviderId === p.providerId}
                      onClick={() => handleUpdateProvider(p.providerId, { isEnabled: !p.available })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        !canToggle
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : p.available
                            ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {p.available ? 'Tạm Tắt Provider' : 'Kích Hoạt Provider'}
                    </button>
                  </div>
                </div>

                {p.categoryCapabilities?.full_outfit && (
                  <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-purple-900">Full Outfit (2 Bước: Áo + Quần):</span>{' '}
                      <span className="text-purple-800">
                        {p.categoryCapabilities.full_outfit.effectiveEnabled
                          ? 'Đã mở (Admin đã duyệt sau benchmark)'
                          : 'Đang tắt — Chờ nghiệm thu Benchmark với provider thật'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(p.isPastRetirement) || !p.available || busyProviderId === p.providerId}
                      onClick={() =>
                        handleUpdateProvider(p.providerId, {
                          categoryOverrides: {
                            full_outfit: !p.categoryCapabilities.full_outfit.effectiveEnabled
                          }
                        })
                      }
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        p.isPastRetirement || !p.available
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : p.categoryCapabilities.full_outfit.effectiveEnabled
                            ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                      }`}
                    >
                      {p.categoryCapabilities.full_outfit.effectiveEnabled
                        ? 'Tắt Full Outfit'
                        : 'Bật Full Outfit (Sau Benchmark)'}
                    </button>
                  </div>
                )}

                {/* Deprecation / Retirement Alert */}
                {(p.deprecationDate || p.retirementDate) && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                    <span>
                      <strong>Lộ trình Vòng Đời Google Vertex:</strong> Deprecation <code className="font-mono">{p.deprecationDate}</code> •{' '}
                      Retirement <code className="font-mono">{p.retirementDate}</code> — Backend tự động chặn mọi job mới từ ngày retirement.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-gray-600">
                  <div>
                    <strong>Biến môi trường yêu cầu:</strong>{' '}
                    <span className="font-mono">
                      {(p.requiredEnvVars || []).length > 0 ? p.requiredEnvVars.join(', ') : 'Không yêu cầu'}
                    </span>{' '}
                    ({p.credentialsConfigured ? (
                      <span className="text-emerald-700 font-semibold inline-flex items-center gap-0.5">
                        <CheckCircle2 size={11} /> Đã có env
                      </span>
                    ) : (
                      <span className="text-gray-500 inline-flex items-center gap-0.5">
                        <XCircle size={11} /> Chưa cấu hình
                      </span>
                    )})
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <strong>Last Verified:</strong> <span className="font-mono">{p.lastVerifiedAt || 'N/A'}</span>
                    </span>
                    {p.documentationUrl && (
                      <a
                        href={p.documentationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-600 hover:underline inline-flex items-center gap-1"
                      >
                        Docs <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>

                {p.limitations?.length > 0 && (
                  <div className="text-[11px] text-gray-500">
                    <strong>Giới hạn xác minh:</strong> {p.limitations.join(' • ')}
                  </div>
                )}

                {p.lastError?.code && (
                  <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <ShieldAlert size={13} className="shrink-0" />
                    <span>
                      Lỗi gần nhất ({p.lastError.code}): {p.lastError.message}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Admin Audit Logs */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 mb-3 flex items-center gap-2">
          <History size={16} className="text-purple-600" />
          Nhật Ký Thay Đổi Cấu Hình Provider ({auditLogs.length})
        </h3>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-gray-500 m-0">Chưa có thay đổi cấu hình nào từ Admin.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
            {auditLogs.map((log, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-3">
                <div>
                  <span className="font-mono font-bold text-purple-700">{log.providerId}</span>{' '}
                  <span className="text-gray-700">— {log.summary}</span>
                  <div className="text-[11px] text-gray-400">
                    {log.actorEmail || log.actorRole}
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString('vi-VN')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
