import React, { useState, useEffect, useCallback } from 'react';
import { 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  Users, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  ArrowUpRight, 
  RefreshCw, 
  Star, 
  Layers, 
  Clock, 
  Truck, 
  Tag, 
  ChevronRight 
} from 'lucide-react';
import { getAdminStats } from '../../services/api';

const STATUS_CONFIG = {
  pending: {
    label: 'Chờ xử lý',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    barBg: 'bg-amber-500'
  },
  processing: {
    label: 'Đang chuẩn bị',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    barBg: 'bg-blue-500'
  },
  shipped: {
    label: 'Đang vận chuyển',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    barBg: 'bg-purple-600'
  },
  delivered: {
    label: 'Đã giao thành công',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    barBg: 'bg-emerald-500'
  },
  cancelled: {
    label: 'Đã hủy',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    barBg: 'bg-red-500'
  }
};

export default function AdminAnalyticsDashboard({ onNavigateTab }) {
  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRange, setSelectedRange] = useState('all'); // '7d', '30d', 'all'

  const fetchStats = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setError('Vui lòng đăng nhập với tài khoản Admin.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await getAdminStats(currentToken);
      if (res && res.success) {
        const payload = (res.data && res.data.data) ? res.data.data : res.data;
        if (payload && typeof payload === 'object') {
          setStatsData(payload);
        } else {
          setError('Không có dữ liệu thống kê');
        }
      } else {
        setError(res?.error || res?.message || 'Không thể tải thống kê');
      }
    } catch (err) {
      console.error('Fetch admin stats error:', err);
      setError('Lỗi kết nối khi tải số liệu thống kê');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleImageError = (e) => {
    if (e.target.dataset.fallbackApplied) {
      e.target.style.opacity = '0.5';
      return;
    }
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = '/placeholder.jpg';
  };

  if (loading && !statsData) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
        <RefreshCw size={36} className="animate-spin mx-auto text-blue-600 mb-4" />
        <h3 className="text-base font-bold text-gray-800">Đang tổng hợp dữ liệu phân tích kinh doanh...</h3>
        <p className="text-xs text-gray-500 mt-1">Đang xử lý doanh thu, đơn hàng và kho hàng thời gian thực</p>
      </div>
    );
  }

  if (error && !statsData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700 shadow-sm">
        <AlertTriangle size={36} className="mx-auto mb-2 text-red-500" />
        <h3 className="text-base font-bold">Không thể tải số liệu thống kê</h3>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <button
          type="button"
          onClick={fetchStats}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const data = statsData || {};
  const statusCounts = data.statusCounts || { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  const totalOrders = data.totalOrders || 0;
  const nonCancelledOrders = totalOrders - (statusCounts.cancelled || 0);

  // Dynamic timeline based on selected range
  const timeline = selectedRange === 'all'
    ? (data.revenueTimelineMonthly && data.revenueTimelineMonthly.length > 0 ? data.revenueTimelineMonthly : (data.revenueTimeline7d || data.revenueTimeline || []))
    : (data.revenueTimeline7d || data.revenueTimeline || []);
  const maxDailyRevenue = Math.max(...timeline.map(t => Number(t.revenue || 0)), 100);

  return (
    <div className="space-y-6">
      {/* ================= 1. HEADER & CONTROLS ================= */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
              KD-XX EXECUTIVE ANALYTICS
            </span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mt-0.5">
            Trung Tâm Phân Tích & Báo Cáo Kinh Doanh
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cập nhật tự động số liệu doanh thu, vận hành đơn hàng và hiệu suất kho hàng
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold text-gray-600">
            <button
              type="button"
              onClick={() => setSelectedRange('7d')}
              className={`px-3 py-1.5 rounded-lg transition ${selectedRange === '7d' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'hover:text-gray-900'}`}
            >
              7 ngày qua
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange('30d')}
              className={`px-3 py-1.5 rounded-lg transition ${selectedRange === '30d' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'hover:text-gray-900'}`}
            >
              30 ngày qua
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange('all')}
              className={`px-3 py-1.5 rounded-lg transition ${selectedRange === 'all' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'hover:text-gray-900'}`}
            >
              Toàn thời gian
            </button>
          </div>

          <button
            type="button"
            onClick={fetchStats}
            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition"
            title="Làm mới số liệu"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ================= 2. TOP 4 PRIMARY KPI METRIC CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl border border-emerald-200/80 p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Tổng Doanh Thu
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shadow-2xs">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
              ${Number(data.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              <span className="inline-flex items-center text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                <ArrowUpRight size={13} /> +18.4%
              </span>
              <span className="text-gray-500">tổng từ {nonCancelledOrders} đơn hợp lệ</span>
            </div>
          </div>
        </div>

        {/* Total Orders */}
        <div className="bg-gradient-to-br from-white to-blue-50/40 rounded-2xl border border-blue-200/80 p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
              Tổng Đơn Hàng
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shadow-2xs">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
              {totalOrders} <span className="text-base font-semibold text-gray-500">đơn</span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
              <span className="font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {data.pendingOrders || 0} Chờ xử lý
              </span>
              <span>• {statusCounts.delivered || 0} Đã giao</span>
            </div>
          </div>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="bg-gradient-to-br from-white to-purple-50/40 rounded-2xl border border-purple-200/80 p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-800">
              Giá Trị Đơn (AOV)
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shadow-2xs">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
              ${Number(data.averageOrderValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
              <span className="font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                Cao cấp (Luxury)
              </span>
              <span>trung bình / đơn</span>
            </div>
          </div>
        </div>

        {/* Users & Community */}
        <div className="bg-gradient-to-br from-white to-amber-50/40 rounded-2xl border border-amber-200/80 p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Khách Hàng & Users
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold shadow-2xs">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
              {data.totalUsers || 0} <span className="text-base font-semibold text-gray-500">tài khoản</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{data.regularUsers || 0} khách hàng</span>
              <span>• {data.totalAdmins || 1} Admin</span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= 3. QUICK STATUS STRIP ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-amber-200/80 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-1">
            <Clock size={14} />
            <span>Chờ Xử Lý</span>
          </div>
          <div className="text-xl font-bold text-gray-900">{statusCounts.pending || 0}</div>
          <span className="text-[11px] text-gray-500">Đơn mới đặt</span>
        </div>

        <div className="bg-white rounded-xl border border-blue-200/80 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 mb-1">
            <Package size={14} />
            <span>Đang Đóng Gói</span>
          </div>
          <div className="text-xl font-bold text-gray-900">{statusCounts.processing || 0}</div>
          <span className="text-[11px] text-gray-500">Đang xử lý</span>
        </div>

        <div className="bg-white rounded-xl border border-purple-200/80 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 mb-1">
            <Truck size={14} />
            <span>Đang Giao</span>
          </div>
          <div className="text-xl font-bold text-gray-900">{statusCounts.shipped || 0}</div>
          <span className="text-[11px] text-gray-500">Đang vận chuyển</span>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200/80 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 mb-1">
            <CheckCircle size={14} />
            <span>Đã Giao Xong</span>
          </div>
          <div className="text-xl font-bold text-gray-900">{statusCounts.delivered || 0}</div>
          <span className="text-[11px] text-gray-500">Giao thành công</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mb-1">
            <Star size={14} fill="currentColor" />
            <span>Đánh Giá Sao</span>
          </div>
          <div className="text-xl font-bold text-gray-900">
            {data.reviewStats?.averageRating || 5.0} ★
          </div>
          <span className="text-[11px] text-gray-500">{data.reviewStats?.totalReviews || 0} phản hồi</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-purple-600 mb-1">
            <Layers size={14} />
            <span>Kho Sản Phẩm</span>
          </div>
          <div className="text-xl font-bold text-gray-900">{data.totalProducts || 0}</div>
          <span className="text-[11px] text-emerald-600 font-semibold">{data.inStockProducts || 0} sẵn sàng</span>
        </div>
      </div>

      {/* ================= 4. REVENUE TIMELINE CHART & ACTIVITY ================= */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600" />
              <span>Biểu Đồ Doanh Thu & Đơn Hàng Theo Thời Gian</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedRange === 'all' 
                ? 'Doanh thu tích lũy toàn thời gian theo từng tháng' 
                : 'Phân tích xu hướng doanh thu hàng ngày theo chu kỳ 7 ngày gần nhất'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-gradient-to-r from-emerald-500 to-purple-600"></span>
              <span className="text-gray-700">Doanh thu ($)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-gray-700">Số đơn</span>
            </div>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div 
          className="grid gap-2 sm:gap-4 items-end h-64 pt-6 px-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(timeline.length, 1)}, minmax(0, 1fr))` }}
        >
          {timeline.map((item, idx) => {
            const rev = Number(item.revenue || 0);
            const heightPercent = maxDailyRevenue > 0 ? Math.max(8, Math.round((rev / maxDailyRevenue) * 100)) : 8;
            const isToday = item.label === 'Hôm nay';

            return (
              <div key={idx} className="flex flex-col items-center h-full justify-end group relative">
                {/* Tooltip on hover */}
                <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition pointer-events-none bg-gray-900 text-white text-[11px] rounded-lg py-1.5 px-2.5 whitespace-nowrap shadow-xl z-20">
                  <p className="font-bold">${rev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-gray-400 text-[10px]">{item.ordersCount} đơn hàng</p>
                </div>

                {/* Amount on top of bar if > 0 */}
                {rev > 0 && (
                  <span className="text-[10px] font-bold text-emerald-700 mb-1.5 truncate max-w-full">
                    ${Math.round(rev).toLocaleString()}
                  </span>
                )}

                {/* The Bar */}
                <div 
                  className={`w-full max-w-[48px] rounded-t-xl transition-all duration-500 relative ${
                    rev > 0 
                      ? isToday 
                        ? 'bg-gradient-to-t from-emerald-600 to-purple-600 shadow-sm' 
                        : 'bg-gradient-to-t from-emerald-500 to-teal-400' 
                      : 'bg-gray-100'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                >
                  {item.ordersCount > 0 && (
                    <span className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white/90 text-gray-900 text-[9px] font-bold flex items-center justify-center shadow-2xs">
                      {item.ordersCount}
                    </span>
                  )}
                </div>

                {/* Date Label */}
                <div className="text-center mt-2.5">
                  <span className={`text-[11px] block font-medium ${isToday ? 'text-purple-700 font-bold' : 'text-gray-500'}`}>
                    {item.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= 5. TWO-COLUMN OPERATIONAL BREAKDOWNS ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Order Status Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-gray-900">Phân Bổ Trạng Thái Đơn Hàng</h3>
              <p className="text-xs text-gray-500">Tỷ lệ hoàn tất & tiến độ xử lý đơn hàng</p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition"
              >
                <span>Xem đơn</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => {
              const count = statusCounts[key] || 0;
              const percent = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-700">{config.label}</span>
                    <span className="text-gray-500 font-medium">
                      <strong className="text-gray-900">{count}</strong> đơn ({percent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${config.barBg} rounded-full transition-all duration-500`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between text-xs text-gray-600 border border-gray-100">
            <span className="font-medium">Tỉ lệ giao hàng thành công:</span>
            <span className="font-extrabold text-emerald-700">
              {totalOrders > 0 ? Math.round(((statusCounts.delivered || 0) / totalOrders) * 100) : 100}%
            </span>
          </div>
        </div>

        {/* Column 2: Category Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-gray-900">Danh Mục Sản Phẩm</h3>
              <p className="text-xs text-gray-500">Cơ cấu danh mục và phân bổ nguồn hàng</p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('products')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition"
              >
                <span>Xem kho</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {(data.categoryBreakdown || []).map((catItem, idx) => {
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-wider text-gray-800">
                      {catItem.category}
                    </span>
                    <span className="text-gray-500">
                      <strong className="text-gray-900">{catItem.count}</strong> mẫu ({catItem.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${catItem.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between text-xs text-gray-600 border border-gray-100">
            <span className="font-medium">Tổng danh mục đang kinh doanh:</span>
            <span className="font-extrabold text-purple-700">
              {data.categoryBreakdown?.length || 0} ngành hàng
            </span>
          </div>
        </div>
      </div>

      {/* ================= 6. BOTTOM ROW: TOP SELLING & RECENT ORDERS ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <Tag size={17} className="text-purple-600" />
                <span>Top Sản Phẩm Bán Chạy Nhất</span>
              </h3>
              <p className="text-xs text-gray-500">Xếp hạng theo số lượng bán và doanh thu</p>
            </div>
          </div>

          {(data.topSellingProducts || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              Chưa có dữ liệu bán hàng cho các sản phẩm
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.topSellingProducts.map((prod, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between gap-3 hover:bg-gray-50/70 rounded-xl px-2 transition">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 ${
                      idx === 0 
                        ? 'bg-amber-100 text-amber-800' 
                        : idx === 1 
                        ? 'bg-gray-200 text-gray-800' 
                        : idx === 2 
                        ? 'bg-amber-50 text-amber-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      #{idx + 1}
                    </span>
                    <div className="w-11 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 shrink-0">
                      <img 
                        src={prod.image || '/placeholder.jpg'} 
                        alt={prod.name}
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 line-clamp-1">{prod.name}</h4>
                      <p className="text-[11px] text-gray-500">
                        Đơn giá: ${Number(prod.price || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-extrabold text-emerald-700">
                      ${Number(prod.revenue || 0).toLocaleString()}
                    </div>
                    <span className="text-[11px] font-semibold text-gray-500">
                      {prod.unitsSold} sản phẩm
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders Preview */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <ShoppingBag size={17} className="text-blue-600" />
                <span>Đơn Hàng Gần Đây</span>
              </h3>
              <p className="text-xs text-gray-500">Giao dịch vừa phát sinh trên hệ thống</p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('orders')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition"
              >
                <span>Tất cả</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          {(data.recentOrders || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              Chưa có đơn hàng nào phát sinh
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recentOrders.map((order, idx) => {
                const statusConf = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                return (
                  <div key={idx} className="py-3 flex items-center justify-between gap-3 hover:bg-gray-50/70 rounded-xl px-2 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                        <img 
                          src={order.firstItemImage || '/placeholder.jpg'} 
                          alt="Order item"
                          className="w-full h-full object-cover"
                          onError={handleImageError}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gray-900">{order.user?.name || 'Khách lẻ'}</span>
                          <span className="text-[11px] text-gray-400 font-mono">#{order._id?.slice(-5)}</span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-xs font-extrabold text-gray-900">
                        ${Number(order.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusConf.bg} ${statusConf.color} ${statusConf.border}`}>
                        {statusConf.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
