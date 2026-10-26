import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Receipt,
  TrendingUp,
  Package,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Info,
  Copy,
  History,
  ShieldAlert,
  Target,
  FileText
} from 'lucide-react';
import { getAITasks, runAITask, getAITaskHistory } from '../../services/api';
import './AdminAIOperations.css';

const DEFAULT_TASKS = [
  {
    id: 'monthly_financial_report',
    title: 'Báo cáo Tài chính Tháng',
    role: 'AI Kế toán trưởng',
    badge: 'KẾ TOÁN TRƯỞNG NỘI BỘ',
    icon: 'Receipt',
    color: 'emerald',
    description: 'Đối soát tổng giá trị đơn hàng, doanh thu thực nhận (đã thanh toán), dòng tiền SePay/COD/Thẻ và chênh lệch thanh toán theo tháng.'
  },
  {
    id: 'business_performance_report',
    title: 'Phân tích Hiệu quả Kinh doanh',
    role: 'AI Chuyên viên Phân tích Kinh doanh',
    badge: 'CHUYÊN VIÊN PHÂN TÍCH KINH DOANH',
    icon: 'TrendingUp',
    color: 'blue',
    description: 'Đánh giá sản phẩm bán chạy, cơ cấu doanh thu theo nhóm hàng thời trang (Men, Women, Shoes, Accessories) và xu hướng bán lẻ.'
  },
  {
    id: 'inventory_analysis',
    title: 'Phân tích Tồn kho & Cung ứng',
    role: 'AI Quản lý Kho & Chuỗi Cung ứng',
    badge: 'QUẢN LÝ KHO & CHUỖI CUNG ỨNG',
    icon: 'Package',
    color: 'amber',
    description: 'Kiểm kê thực tế số lượng hàng tồn, phát hiện sản phẩm hết hàng hoặc chạm ngưỡng an toàn, phân bổ giá trị danh mục.'
  },
  {
    id: 'order_operations_report',
    title: 'Báo cáo Vận hành Đơn hàng',
    role: 'AI Giám sát Vận hành Đơn hàng',
    badge: 'TRƯỞNG PHÒNG VẬN HÀNH',
    icon: 'Truck',
    color: 'purple',
    description: 'Giám sát tiến độ đóng gói, tỷ lệ đơn hủy, đơn chờ duyệt quá 24h và phát hiện các đơn hàng có dấu hiệu bất thường.'
  }
];

const AdminAIOperations = () => {
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [runningTaskId, setRunningTaskId] = useState(null);
  const [currentResult, setCurrentResult] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parameter controls
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [lowStockThreshold, setLowStockThreshold] = useState(10);

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    if (!token) return;
    try {
      const [tasksRes, historyRes] = await Promise.all([
        getAITasks(token),
        getAITaskHistory(token, 10)
      ]);
      if (tasksRes.success && tasksRes.data?.length > 0) {
        setTasks(tasksRes.data);
      }
      if (historyRes.success && historyRes.data) {
        setHistory(historyRes.data);
      }
    } catch (err) {
      console.warn('Initial load fallback to defaults:', err);
    }
  };

  const handleRunTask = async (taskId) => {
    setError(null);
    setRunningTaskId(taskId);
    setCopied(false);

    const params = {};
    if (taskId === 'monthly_financial_report' || taskId === 'business_performance_report') {
      params.month = Number(selectedMonth);
      params.year = Number(selectedYear);
    } else if (taskId === 'inventory_analysis') {
      params.lowStockThreshold = Number(lowStockThreshold);
    }

    try {
      const res = await runAITask(token, taskId, params);
      if (res.success) {
        setCurrentResult(res);
        // Refresh history list
        getAITaskHistory(token, 10).then(hRes => {
          if (hRes.success) setHistory(hRes.data);
        });
      } else {
        setError(res.message || 'Không thể hoàn thành tác vụ phân tích AI.');
        if (res.metrics) {
          // Keep partial ground truth metrics visible even if AI part had an issue
          setCurrentResult({
            taskId,
            title: tasks.find(t => t.id === taskId)?.title || 'Báo cáo',
            metrics: res.metrics,
            analysis: {
              summary: 'Đã tổng hợp số liệu database thành công, nhưng kết nối Gemini gặp lỗi: ' + (res.message || 'Lỗi không xác định'),
              keyObservations: [],
              warnings: ['Chưa thể tạo nhận xét chuyên sâu từ Gemini AI lúc này.'],
              dataGaps: [],
              recommendations: []
            }
          });
        }
      }
    } catch (err) {
      setError('Lỗi hệ thống khi gọi dịch vụ AI Operations: ' + err.message);
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleSelectHistoryItem = (item) => {
    setCurrentResult({
      taskId: item.taskId,
      title: item.taskName,
      executedAt: item.createdAt,
      executionTimeMs: item.executionTimeMs,
      metrics: item.metrics,
      analysis: item.analysis,
      period: item.params?.month ? { label: `Tháng ${item.params.month}/${item.params.year}` } : null
    });
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleCopyReport = () => {
    if (!currentResult) return;
    const text = `KD-XX INTELLIGENCE REPORT: ${currentResult.title}
Thời gian: ${new Date(currentResult.executedAt || Date.now()).toLocaleString('vi-VN')}
Tóm tắt: ${currentResult.analysis?.summary}

NHẬN XÉT:
${(currentResult.analysis?.keyObservations || []).map(o => '- ' + o).join('\n')}

CẢNH BÁO:
${(currentResult.analysis?.warnings || []).map(w => '- ' + w).join('\n')}

ĐỀ XUẤT HÀNH ĐỘNG:
${(currentResult.analysis?.recommendations || []).map(r => '- ' + r).join('\n')}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getTaskIcon = (iconName, color) => {
    const className = `task-icon-${color}`;
    switch (iconName) {
      case 'Receipt':
        return <div className={`task-icon-wrapper ${className}`}><Receipt size={22} /></div>;
      case 'TrendingUp':
        return <div className={`task-icon-wrapper ${className}`}><TrendingUp size={22} /></div>;
      case 'Package':
        return <div className={`task-icon-wrapper ${className}`}><Package size={22} /></div>;
      case 'Truck':
        return <div className={`task-icon-wrapper ${className}`}><Truck size={22} /></div>;
      default:
        return <div className={`task-icon-wrapper ${className}`}><Sparkles size={22} /></div>;
    }
  };

  return (
    <div className="ai-operations-wrapper">
      {/* Header Banner */}
      <div className="ai-header-banner">
        <div className="ai-header-left">
          <div className="ai-brand-pill">
            <Sparkles size={13} />
            <span>KD-XX Intelligence Hub</span>
          </div>
          <h2 className="ai-header-title">
            AI Operations Center
          </h2>
          <p className="ai-header-desc">
            Hệ thống trợ lý AI chuyên trách nội bộ: Kế toán trưởng, Phân tích kinh doanh, Quản lý kho và Giám sát vận hành đơn hàng. Tính toán 100% số liệu gốc từ MongoDB Atlas trước khi phân tích qua Gemini AI.
          </p>
        </div>
        <div className="ai-header-actions">
          <button
            type="button"
            className="ai-btn-ghost"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={16} />
            <span>{showHistory ? 'Ẩn Lịch Sử' : 'Lịch Sử Chạy AI'}</span>
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="ai-error-banner">
          <AlertTriangle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4>Thông báo từ hệ thống AI</h4>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* History Drawer / Panel */}
      {showHistory && (
        <div className="ai-history-section mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <History size={18} />
              Lịch sử các lần chạy báo cáo gần đây
            </h3>
            <span className="text-xs text-gray-500">Bấm vào hàng để xem lại kết quả</span>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Chưa có lịch sử chạy tác vụ nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Tác vụ</th>
                    <th>Thời điểm chạy</th>
                    <th>Thời gian xử lý</th>
                    <th>Trạng thái</th>
                    <th>Tóm tắt kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(item => (
                    <tr
                      key={item._id}
                      className="cursor-pointer"
                      onClick={() => handleSelectHistoryItem(item)}
                    >
                      <td className="font-semibold text-gray-900">{item.taskName}</td>
                      <td>{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
                      <td>{item.executionTimeMs} ms</td>
                      <td>
                        <span className={item.status === 'success' ? 'status-badge-ok' : 'status-badge-fail'}>
                          {item.status === 'success' ? 'Thành công' : 'Thất bại'}
                        </span>
                      </td>
                      <td className="text-gray-600 truncate max-w-xs">
                        {item.analysis?.summary || item.errorMessage || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Task Cards Grid */}
      <div className="ai-section-title">
        <span>Chọn Nhân Viên Chuyên Trách Để Khởi Chạy Tác Vụ</span>
        <span className="text-xs font-normal text-gray-500">Mô hình phân tích: Gemini 3.5 Flash</span>
      </div>

      <div className="ai-tasks-grid">
        {tasks.map(task => {
          const isRunning = runningTaskId === task.id;
          const isMonthly = task.id === 'monthly_financial_report' || task.id === 'business_performance_report';
          const isInventory = task.id === 'inventory_analysis';

          return (
            <div
              key={task.id}
              className={`ai-task-card ${currentResult?.taskId === task.id ? 'active' : ''}`}
            >
              <div>
                <div className="task-card-header">
                  {getTaskIcon(task.icon, task.color)}
                  <span className={`task-role-badge badge-${task.color}`}>
                    {task.badge || task.role}
                  </span>
                </div>
                <h3 className="task-card-title">{task.title}</h3>
                <p className="task-card-desc">{task.description}</p>

                {/* Parameters configuration */}
                {isMonthly && (
                  <div className="task-params-row">
                    <label>Kỳ báo cáo:</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      disabled={runningTaskId !== null}
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
                      ))}
                    </select>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      disabled={runningTaskId !== null}
                    >
                      <option value={2026}>2026</option>
                      <option value={2025}>2025</option>
                    </select>
                  </div>
                )}

                {isInventory && (
                  <div className="task-params-row">
                    <label>Ngưỡng cảnh báo hết:</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                      disabled={runningTaskId !== null}
                      style={{ width: '65px' }}
                    />
                    <span className="text-xs text-gray-500">chiếc</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="task-btn-run"
                disabled={runningTaskId !== null}
                onClick={() => handleRunTask(task.id)}
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Đang xử lý & phân tích...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>Khởi chạy phân tích</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Loading Processing State */}
      {runningTaskId && (
        <div className="ai-loading-card">
          <div className="ai-spinner-orbit"></div>
          <h3 className="ai-loading-title">Trợ lý AI đang thực hiện nhiệm vụ...</h3>
          <p className="ai-loading-step">
            1. Truy vấn MongoDB Atlas → 2. Tính toán số liệu độc lập → 3. Phân tích đối soát qua Gemini AI
          </p>
        </div>
      )}

      {/* Active Results Display */}
      {currentResult && !runningTaskId && (
        <div className="ai-result-panel">
          {/* Header Bar */}
          <div className="result-header-bar">
            <div className="result-title-group">
              <h3>
                <Sparkles size={20} className="text-indigo-600" />
                {currentResult.title}
                {currentResult.period?.label && (
                  <span className="text-sm font-semibold text-gray-500 ml-2">
                    ({currentResult.period.label})
                  </span>
                )}
              </h3>
              <div className="result-meta-info">
                <span>
                  <Clock size={13} className="inline mr-1" />
                  Thực hiện lúc: {new Date(currentResult.executedAt || Date.now()).toLocaleTimeString('vi-VN')} - {new Date(currentResult.executedAt || Date.now()).toLocaleDateString('vi-VN')}
                </span>
                {currentResult.executionTimeMs > 0 && (
                  <span>
                    Tốc độ xử lý: {currentResult.executionTimeMs} ms
                  </span>
                )}
              </div>
            </div>

            <div className="result-actions">
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={handleCopyReport}
              >
                <Copy size={14} />
                <span>{copied ? 'Đã sao chép!' : 'Sao chép báo cáo'}</span>
              </button>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => handleRunTask(currentResult.taskId)}
              >
                <RefreshCw size={14} />
                <span>Làm mới / Chạy lại</span>
              </button>
            </div>
          </div>

          {/* 1. GROUND TRUTH KPI METRICS (COMPUTED IN BACKEND) */}
          {currentResult.metrics && (
            <div className="metrics-section">
              <div className="section-label-tag">
                <CheckCircle2 size={13} />
                <span>Số liệu thực tế từ Database (Backend Ground Truth)</span>
              </div>

              <div className="metrics-kpi-grid">
                {/* Financial KPIs */}
                {currentResult.metrics.totalGrossOrderValue !== undefined && (
                  <>
                    <div className="kpi-stat-box">
                      <div className="kpi-label">Tổng giá trị đơn đặt (Gross)</div>
                      <div className="kpi-value text-gray-900">
                        ${Number(currentResult.metrics.totalGrossOrderValue).toLocaleString()}
                      </div>
                      <div className="kpi-sub">
                        {currentResult.metrics.activeOrders} đơn hàng hợp lệ
                      </div>
                    </div>

                    <div className="kpi-stat-box highlight">
                      <div className="kpi-label">Doanh thu thực nhận (Đã TT)</div>
                      <div className="kpi-value text-emerald-600">
                        ${Number(currentResult.metrics.realizedRevenue).toLocaleString()}
                      </div>
                      <div className="kpi-sub font-mono">
                        {Number(currentResult.metrics.realizedRevenueVND || 0).toLocaleString()} VND ({currentResult.metrics.paidOrders} đơn)
                      </div>
                    </div>

                    <div className="kpi-stat-box warning">
                      <div className="kpi-label">Khoản chưa thu / Chờ COD</div>
                      <div className="kpi-value text-amber-600">
                        ${Number(currentResult.metrics.unpaidAmount).toLocaleString()}
                      </div>
                      <div className="kpi-sub">
                        {currentResult.metrics.unpaidOrders} đơn chưa thanh toán
                      </div>
                    </div>

                    <div className="kpi-stat-box">
                      <div className="kpi-label">Giá trị đơn trung bình (AOV)</div>
                      <div className="kpi-value text-blue-600">
                        ${Number(currentResult.metrics.averageOrderValue).toLocaleString()}
                      </div>
                      <div className="kpi-sub">
                        Tỷ lệ thu hồi tiền: {currentResult.metrics.paymentCollectionRate}%
                      </div>
                    </div>
                  </>
                )}

                {/* Inventory KPIs */}
                {currentResult.metrics.totalStockUnits !== undefined && (
                  <>
                    <div className="kpi-stat-box">
                      <div className="kpi-label">Tổng sản phẩm vật lý trong kho</div>
                      <div className="kpi-value text-indigo-600">
                        {Number(currentResult.metrics.totalStockUnits).toLocaleString()}
                      </div>
                      <div className="kpi-sub">
                        {currentResult.metrics.totalCatalogProducts} mẫu trong danh mục
                      </div>
                    </div>

                    <div className={`kpi-stat-box ${currentResult.metrics.lowStockCount > 0 ? 'warning' : ''}`}>
                      <div className="kpi-label">Sản phẩm sắp hết hàng (≤ {lowStockThreshold})</div>
                      <div className="kpi-value text-amber-600">
                        {currentResult.metrics.lowStockCount}
                      </div>
                      <div className="kpi-sub">
                        Cần lên kế hoạch nhập bổ sung
                      </div>
                    </div>

                    <div className={`kpi-stat-box ${currentResult.metrics.outOfStockCount > 0 ? 'highlight' : ''}`}>
                      <div className="kpi-label">Sản phẩm hết hàng (0 chiếc)</div>
                      <div className="kpi-value text-red-600">
                        {currentResult.metrics.outOfStockCount}
                      </div>
                      <div className="kpi-sub">
                        Đang tạm ngưng bán
                      </div>
                    </div>

                    <div className="kpi-stat-box">
                      <div className="kpi-label">Ước tính giá trị kho (Giá bán lẻ)</div>
                      <div className="kpi-value text-gray-900">
                        ${Number(currentResult.metrics.totalRetailInventoryValue || 0).toLocaleString()}
                      </div>
                      <div className="kpi-sub">
                        Chưa trừ giá vốn nhập hàng
                      </div>
                    </div>
                  </>
                )}

                {/* Order Ops KPIs */}
                {currentResult.metrics.statusCounts !== undefined && (
                  <>
                    <div className="kpi-stat-box">
                      <div className="kpi-label">Đơn chờ xử lý (Pending)</div>
                      <div className="kpi-value text-amber-600">
                        {currentResult.metrics.statusCounts.pending}
                      </div>
                      <div className="kpi-sub">
                        Tồn đọng &gt; 24h: {currentResult.metrics.pendingOlderThan24h} đơn
                      </div>
                    </div>

                    <div className="kpi-stat-box highlight">
                      <div className="kpi-label">Đang xử lý / Đã giao</div>
                      <div className="kpi-value text-emerald-600">
                        {(currentResult.metrics.statusCounts.processing || 0) + (currentResult.metrics.statusCounts.delivered || 0)}
                      </div>
                      <div className="kpi-sub">
                        Tỷ lệ hoàn thành: {currentResult.metrics.fulfillmentRate}%
                      </div>
                    </div>

                    <div className="kpi-stat-box">
                      <div className="kpi-label">Đơn đã hủy (Cancelled)</div>
                      <div className="kpi-value text-red-600">
                        {currentResult.metrics.statusCounts.cancelled}
                      </div>
                      <div className="kpi-sub">
                        Tỷ lệ hủy: {currentResult.metrics.cancellationRate}%
                      </div>
                    </div>

                    <div className={`kpi-stat-box ${currentResult.metrics.anomaliesCount > 0 ? 'warning' : ''}`}>
                      <div className="kpi-label">Đơn bất thường phát hiện</div>
                      <div className="kpi-value text-purple-600">
                        {currentResult.metrics.anomaliesCount}
                      </div>
                      <div className="kpi-sub">
                        Quy tắc logic cảnh báo rủi ro
                      </div>
                    </div>
                  </>
                )}

                {/* Business Sales KPIs */}
                {currentResult.metrics.totalUnitsSold !== undefined && (
                  <>
                    <div className="kpi-stat-box">
                      <div className="kpi-label">Sản phẩm bán ra (Units Sold)</div>
                      <div className="kpi-value text-indigo-600">
                        {currentResult.metrics.totalUnitsSold}
                      </div>
                      <div className="kpi-sub">
                        Số đơn phát sinh: {currentResult.metrics.totalOrders}
                      </div>
                    </div>

                    <div className="kpi-stat-box highlight">
                      <div className="kpi-label">Doanh số đơn hàng (Gross Sales)</div>
                      <div className="kpi-value text-emerald-600">
                        ${Number(currentResult.metrics.totalRevenue || 0).toLocaleString()}
                      </div>
                      <div className="kpi-sub">
                        Trung bình mỗi đơn: {currentResult.metrics.averageUnitsPerOrder} sản phẩm
                      </div>
                    </div>

                    <div className="kpi-stat-box">
                      <div className="kpi-label">Tỷ lệ khách quay lại (Repeat Rate)</div>
                      <div className="kpi-value text-blue-600">
                        {currentResult.metrics.repeatRate}%
                      </div>
                      <div className="kpi-sub">
                        {currentResult.metrics.repeatCustomers}/{currentResult.metrics.uniqueCustomers} khách hàng
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 2. GEMINI AI ANALYSIS & INSIGHTS */}
          <div className="ai-insights-container">
            <div className="section-label-tag">
              <Sparkles size={13} />
              <span>Đánh giá & Nhận định Chuyên môn (Gemini 3.5 Flash)</span>
            </div>

            {/* Executive Summary */}
            {currentResult.analysis?.summary && (
              <div className="ai-section-box ai-summary-box">
                <h4>
                  <FileText size={16} />
                  Tóm Tắt Điều Hành
                </h4>
                <p>{currentResult.analysis.summary}</p>
              </div>
            )}

            {/* Key Observations */}
            {currentResult.analysis?.keyObservations?.length > 0 && (
              <div className="ai-section-box ai-observations-box">
                <h4>
                  <Info size={16} />
                  Nhận Xét & Phân Tích Chi Tiết
                </h4>
                <ul className="ai-list">
                  {currentResult.analysis.keyObservations.map((obs, idx) => (
                    <li key={idx}>{obs}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings & Anomalies */}
            {currentResult.analysis?.warnings?.length > 0 && (
              <div className="ai-section-box ai-warnings-box">
                <h4>
                  <ShieldAlert size={16} />
                  Cảnh Báo & Rủi Ro Cần Chú Ý
                </h4>
                <ul className="ai-list">
                  {currentResult.analysis.warnings.map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Data Limitations / Gaps */}
            {currentResult.analysis?.dataGaps?.length > 0 && (
              <div className="ai-section-box ai-gaps-box">
                <h4>
                  <Info size={15} />
                  Giới Hạn & Dữ Liệu Cần Bổ Sung (Tính Minh Bạch)
                </h4>
                <ul className="ai-list">
                  {currentResult.analysis.dataGaps.map((gap, idx) => (
                    <li key={idx}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actionable Recommendations */}
            {currentResult.analysis?.recommendations?.length > 0 && (
              <div className="ai-section-box ai-recommendations-box">
                <h4>
                  <Target size={16} />
                  Đề Xuất Hành Động Quản Trị Cụ Thể
                </h4>
                <ul className="ai-list">
                  {currentResult.analysis.recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAIOperations;

