import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Send, 
  Users, 
  UserCheck, 
  UserX, 
  Search, 
  RefreshCw, 
  Trash2,   
  Sparkles, 
  Eye, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  History,  
  ShieldCheck,
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000';

const CAMPAIGN_TEMPLATES = [
  {
    id: 'winter_capsule',
    label: 'Ra mắt Winter Capsule',
    subject: 'KD-XX WINTER CAPSULE — EXCLUSIVE LAUNCH',
    previewText: 'Khám phá bộ sưu tập mùa đông mới nhất từ KD-XX',
    bannerUrl: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1200&q=80',
    content: `<p style="margin-bottom: 16px;">Kính gửi quý khách hàng,</p>
<p style="margin-bottom: 16px;">Chúng tôi hân hạnh giới thiệu bộ sưu tập <strong>Winter Capsule</strong> — sự kết hợp tinh tế giữa nghệ thuật thủ công cao cấp và phong cách luxury streetwear đặc trưng của KD-XX.</p>
<p style="margin-bottom: 16px;">Tất cả các sản phẩm áo khoác Bones Jacket, quần jeans phá cách và phụ kiện da cao cấp đã chính thức mở bán với số lượng giới hạn.</p>
<p style="margin-bottom: 0;">Hãy là một trong những người đầu tiên sở hữu những thiết kế độc bản này.</p>`,
    ctaText: 'KHÁM PHÁ BỘ SƯU TẬP',
    ctaUrl: 'http://localhost:3000/campaign'
  },
  {
    id: 'vip_sale',
    label: 'Ưu đãi Private VIP',
    subject: 'EXCLUSIVE PRIVATE INVITATION — VIP ACCESS',
    previewText: 'Đặc quyền trải nghiệm ưu đãi riêng dành cho thành viên',
    bannerUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
    content: `<p style="margin-bottom: 16px;">Xin chào thành viên VIP,</p>
<p style="margin-bottom: 16px;">Nhằm tri ân sự đồng hành của bạn cùng <strong>KD-XX — MADE TRẦN ĐỨC MINH</strong>, chúng tôi gửi tặng bạn quyền truy cập sớm vào đợt <em>Private Sale</em> độc quyền.</p>
<p style="margin-bottom: 16px;">Áp dụng đặc quyền ưu đãi 20% cho toàn bộ các thiết kế New Arrivals trong tuần này.</p>`,
    ctaText: 'TRUY CẬP CỬA HÀNG VIP',
    ctaUrl: 'http://localhost:3000/home'
  },
  {
    id: 'event_invitation',
    label: 'Thư mời sự kiện thời trang',
    subject: 'KD-XX RUNWAY & PRIVATE SHOWCASE INVITATION',
    previewText: 'Thư mời tham dự buổi trình diễn BST thời trang mới',
    bannerUrl: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=1200&q=80',
    content: `<p style="margin-bottom: 16px;">Kính mời quý khách hàng,</p>
<p style="margin-bottom: 16px;">KD-XX trân trọng kính mời bạn đến tham dự buổi trưng bày thời trang cá nhân và trải nghiệm không gian nghệ thuật <strong>Virtual Storefront Showcase</strong>.</p>
<p style="margin-bottom: 16px;">Thời gian: 19:00 - Thứ Bảy tuần này<br>Địa điểm: KD-XX Concept Flagship Boutique</p>`,
    ctaText: 'XÁC NHẬN THAM DỰ',
    ctaUrl: 'http://localhost:3000/about'
  }
];

export default function AdminNewsletter() {
  const [activeSubTab, setActiveSubTab] = useState('subscribers'); // 'subscribers' | 'compose' | 'history'
  const [subscribers, setSubscribers] = useState([]);
  const [stats, setStats] = useState({ totalSubscribers: 0, activeSubscribers: 0, unsubscribed: 0 });
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Campaign Form State
  const [campaignForm, setCampaignForm] = useState({
    subject: CAMPAIGN_TEMPLATES[0].subject,
    previewText: CAMPAIGN_TEMPLATES[0].previewText,
    bannerUrl: CAMPAIGN_TEMPLATES[0].bannerUrl,
    content: CAMPAIGN_TEMPLATES[0].content,
    ctaText: CAMPAIGN_TEMPLATES[0].ctaText,
    ctaUrl: CAMPAIGN_TEMPLATES[0].ctaUrl
  });

  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const token = localStorage.getItem('token');

  // Auto clear feedback after 5 seconds
  useEffect(() => {
    if (feedback.message) {
      const timer = setTimeout(() => setFeedback({ type: '', message: '' }), 6000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Fetch subscribers
  const fetchSubscribers = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);
      if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());

      const res = await fetch(`${API_BASE_URL}/api/newsletter/admin/subscribers?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSubscribers(data.data || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching subscribers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch campaigns history
  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/newsletter/admin/campaigns`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'subscribers') {
      fetchSubscribers();
    } else if (activeSubTab === 'history') {
      fetchCampaigns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, statusFilter, searchQuery]);

  // Toggle subscriber status
  const handleToggleStatus = async (subscriber) => {
    const nextStatus = subscriber.status === 'subscribed' ? 'unsubscribed' : 'subscribed';
    try {
      const res = await fetch(`${API_BASE_URL}/api/newsletter/admin/subscribers/${subscriber._id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        setSubscribers((prev) =>
          prev.map((s) => (s._id === subscriber._id ? { ...s, status: nextStatus } : s))
        );
        fetchSubscribers();
      }
    } catch (err) {
      alert('Lỗi cập nhật trạng thái: ' + err.message);
    }
  };

  // Delete subscriber
  const handleDeleteSubscriber = async (id, email) => {
    if (!window.confirm(`Bạn có chắc muốn xóa email "${email}" khỏi danh sách?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/newsletter/admin/subscribers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSubscribers((prev) => prev.filter((s) => s._id !== id));
        fetchSubscribers();
      }
    } catch (err) {
      alert('Lỗi xóa email: ' + err.message);
    }
  };

  // Send Test Email
  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng nhập địa chỉ email nhận bản thử nghiệm.' });
      return;
    }
    if (!campaignForm.subject.trim() || !campaignForm.content.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng điền tiêu đề và nội dung email.' });
      return;
    }

    try {
      setSendingTest(true);
      setFeedback({ type: '', message: '' });

      const res = await fetch(`${API_BASE_URL}/api/newsletter/admin/send-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          testEmail: testEmail.trim(),
          ...campaignForm
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Đã gửi thử nghiệm thành công qua Brevo đến ${testEmail}! (ID: ${data.messageId || 'OK'})`
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Lỗi gửi email thử nghiệm.'
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Lỗi kết nối: ' + err.message });
    } finally {
      setSendingTest(false);
    }
  };

  // Send Full Campaign
  const handleSendFullCampaign = async () => {
    setShowConfirmModal(false);
    if (!campaignForm.subject.trim() || !campaignForm.content.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng điền tiêu đề và nội dung email.' });
      return;
    }

    try {
      setSendingCampaign(true);
      setFeedback({ type: '', message: '' });

      const res = await fetch(`${API_BASE_URL}/api/newsletter/admin/send-campaign`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaignForm)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: data.message || `Đã phát hành chiến dịch thành công qua Brevo!`
        });
        setActiveSubTab('history');
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Lỗi khi phát hành chiến dịch.'
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Lỗi: ' + err.message });
    } finally {
      setSendingCampaign(false);
    }
  };

  // Apply template
  const handleApplyTemplate = (tmpl) => {
    setCampaignForm({
      subject: tmpl.subject,
      previewText: tmpl.previewText,
      bannerUrl: tmpl.bannerUrl,
      content: tmpl.content,
      ctaText: tmpl.ctaText,
      ctaUrl: tmpl.ctaUrl
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner ── */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-black text-white rounded-lg">
              <Mail size={20} />
            </span>
            <h2 className="text-xl font-bold text-gray-900 tracking-wide">
              EMAIL MARKETING & NEWSLETTER
            </h2>
          </div>
          <p className="text-xs text-gray-500">
            Quản lý người đăng ký nhận tin và phát hành chiến dịch email thời trang cao cấp qua <strong>Brevo API</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-semibold text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Brevo API Connected</span>
          </div>
        </div>
      </div>

      {/* ── Feedback Notification ── */}
      {feedback.message && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-red-50 text-red-800 border border-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback({ type: '', message: '' })}
            className="text-gray-400 hover:text-black font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Sub Navigation Tabs ── */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-4 gap-4">
        <button
          onClick={() => setActiveSubTab('subscribers')}
          className={`py-3.5 px-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'subscribers'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <Users size={16} />
          <span>Danh Sách Đăng Ký ({stats.totalSubscribers})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('compose')}
          className={`py-3.5 px-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'compose'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <Send size={16} />
          <span>Soạn & Gửi Chiến Dịch</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`py-3.5 px-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
            activeSubTab === 'history'
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <History size={16} />
          <span>Lịch Sử Gửi</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SUBSCRIBERS LIST */}
      {/* ========================================================================= */}
      {activeSubTab === 'subscribers' && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tổng người đăng ký</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-1">{stats.totalSubscribers}</p>
              </div>
              <div className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center text-gray-700">
                <Users size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Đang nhận tin (Active)</p>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">{stats.activeSubscribers}</p>
              </div>
              <div className="w-11 h-11 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                <UserCheck size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Đã hủy đăng ký</p>
                <p className="text-2xl font-extrabold text-gray-600 mt-1">{stats.unsubscribed}</p>
              </div>
              <div className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                <UserX size={20} />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm kiếm địa chỉ email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-black focus:outline-none transition"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex bg-gray-100 p-1 rounded-lg text-xs w-full md:w-auto">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    statusFilter === 'all' ? 'bg-white text-black shadow-xs' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setStatusFilter('subscribed')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    statusFilter === 'subscribed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  Đang nhận tin
                </button>
                <button
                  onClick={() => setStatusFilter('unsubscribed')}
                  className={`px-3 py-1.5 rounded-md font-semibold transition ${
                    statusFilter === 'unsubscribed' ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  Đã hủy
                </button>
              </div>

              <button
                onClick={fetchSubscribers}
                className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition"
                title="Làm mới"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* Subscribers Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-black" />
                <span>Đang tải danh sách người đăng ký...</span>
              </div>
            ) : subscribers.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-500">
                Chưa có người đăng ký nào phù hợp với bộ lọc.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/75 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-6 py-3.5">Email</th>
                    <th className="px-6 py-3.5">Ngày đăng ký</th>
                    <th className="px-6 py-3.5">Nguồn</th>
                    <th className="px-6 py-3.5">Trạng thái</th>
                    <th className="px-6 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {subscribers.map((sub) => (
                    <tr key={sub._id} className="hover:bg-gray-50/80 transition">
                      <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
                        <Mail size={14} className="text-gray-400" />
                        <span>{sub.email}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(sub.subscribedAt || sub.createdAt).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 uppercase text-[10px] tracking-wider text-gray-400">
                        {sub.source || 'footer'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            sub.status === 'subscribed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sub.status === 'subscribed' ? 'bg-emerald-500' : 'bg-gray-400'
                            }`}
                          />
                          {sub.status === 'subscribed' ? 'Đang nhận tin' : 'Đã hủy'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleToggleStatus(sub)}
                          className="px-2.5 py-1 text-[11px] border rounded-md hover:bg-gray-100 transition text-gray-700 font-semibold"
                          title={sub.status === 'subscribed' ? 'Hủy nhận tin' : 'Kích hoạt lại'}
                        >
                          {sub.status === 'subscribed' ? 'Hủy nhận' : 'Kích hoạt'}
                        </button>
                        <button
                          onClick={() => handleDeleteSubscriber(sub._id, sub.email)}
                          className="p-1 text-gray-400 hover:text-red-600 transition"
                          title="Xóa email"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: COMPOSE & DISPATCH CAMPAIGN */}
      {/* ========================================================================= */}
      {activeSubTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Compose Form (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Quick Templates Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <Sparkles size={14} className="text-purple-600" />
                Mẫu chiến dịch có sẵn:
              </span>
              <div className="flex flex-wrap gap-2">
                {CAMPAIGN_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleApplyTemplate(tmpl)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-black hover:text-white rounded-lg text-xs font-semibold text-gray-700 transition shadow-xs"
                  >
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                  Tiêu đề Email (Subject Line) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={campaignForm.subject}
                  onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                  placeholder="VD: KD-XX WINTER CAPSULE — EXCLUSIVE LAUNCH"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:bg-white focus:border-black focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                  Phụ đề xem trước (Preview Subtitle)
                </label>
                <input
                  type="text"
                  value={campaignForm.previewText}
                  onChange={(e) => setCampaignForm({ ...campaignForm, previewText: e.target.value })}
                  placeholder="Dòng hiển thị dưới tiêu đề trong hộp thư người nhận..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:bg-white focus:border-black focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                  Link ảnh Banner thời trang (Image URL)
                </label>
                <input
                  type="text"
                  value={campaignForm.bannerUrl}
                  onChange={(e) => setCampaignForm({ ...campaignForm, bannerUrl: e.target.value })}
                  placeholder="https://... (Hình ảnh chiến dịch độ nét cao)"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:bg-white focus:border-black focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                  Nội dung Email (HTML hoặc văn bản) <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={6}
                  value={campaignForm.content}
                  onChange={(e) => setCampaignForm({ ...campaignForm, content: e.target.value })}
                  placeholder="Nội dung giới thiệu bộ sưu tập, sự kiện..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:bg-white focus:border-black focus:outline-none transition font-mono leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                    Nút hành động (CTA Text)
                  </label>
                  <input
                    type="text"
                    value={campaignForm.ctaText}
                    onChange={(e) => setCampaignForm({ ...campaignForm, ctaText: e.target.value })}
                    placeholder="VD: KHÁM PHÁ NGAY"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:bg-white focus:border-black focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                    Đường dẫn nút (CTA URL)
                  </label>
                  <input
                    type="text"
                    value={campaignForm.ctaUrl}
                    onChange={(e) => setCampaignForm({ ...campaignForm, ctaUrl: e.target.value })}
                    placeholder="http://localhost:3000/..."
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:bg-white focus:border-black focus:outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Test Send & Campaign Send Action Box */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                Kiểm Thử & Phát Hành Chiến Dịch
              </h3>

              {/* Test Email Row */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="email"
                  placeholder="Nhập email Admin để gửi thử nghiệm trước..."
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full sm:flex-1 px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-black focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={sendingTest || !testEmail.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-bold tracking-wider uppercase transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  <span>Gửi Thử Nghiệm</span>
                </button>
              </div>

              {/* Main Campaign Send Button */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-800">
                    Sẵn sàng gửi đến {stats.activeSubscribers} người đăng ký hợp lệ
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Hệ thống tự động loại trừ các địa chỉ đã hủy đăng ký
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={sendingCampaign || stats.activeSubscribers === 0}
                  className="px-6 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold tracking-wider uppercase transition flex items-center gap-2 disabled:opacity-50 shadow-md shadow-purple-900/20"
                >
                  {sendingCampaign ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Đang Gửi Qua Brevo...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Phát Hành Chiến Dịch</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Email Preview (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <Eye size={14} />
                Xem trước giao diện Email (Preview):
              </span>
              <span className="text-[10px] text-gray-400 font-mono">KD-XX Luxury Template</span>
            </div>

            {/* Email Mockup Container */}
            <div className="bg-[#050408] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl text-gray-200 text-xs">
              {/* Header */}
              <div className="p-6 text-center border-b border-gray-800/80 bg-[#08070c]">
                <div className="w-10 h-10 rounded-full bg-black text-white border border-gray-700 inline-flex items-center justify-center font-bold text-xs tracking-wider mb-2">
                  KD
                </div>
                <h4 className="text-base font-extrabold tracking-[4px] text-white uppercase">KD - XX</h4>
                <p className="text-[9px] tracking-widest text-purple-400 uppercase font-semibold mt-0.5">
                  MADE TRẦN ĐỨC MINH • LUXURY STREETWEAR
                </p>
              </div>

              {/* Optional Banner */}
              {campaignForm.bannerUrl ? (
                <img
                  src={campaignForm.bannerUrl}
                  alt="Banner preview"
                  className="w-full h-44 object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ) : null}

              {/* Body */}
              <div className="p-6 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide leading-snug">
                  {campaignForm.subject || 'TIÊU ĐỀ CHIẾN DỊCH'}
                </h3>
                <div
                  className="text-gray-300 text-[11.5px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: campaignForm.content || '<p>Nội dung preview...</p>' }}
                />

                {campaignForm.ctaUrl && (
                  <div className="text-center pt-3 pb-1">
                    <span className="inline-block px-5 py-2.5 bg-white text-black font-bold text-[10px] tracking-widest uppercase rounded-xs">
                      {campaignForm.ctaText || 'KHÁM PHÁ NGAY'}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 text-center border-t border-gray-800/80 bg-[#08070c] text-[10px] text-gray-500 space-y-1">
                <p>Bạn nhận được email này vì đã đăng ký bản tin từ KD-XX.</p>
                <p className="text-gray-600">© 2026 KD-XX — MADE TRẦN ĐỨC MINH. All rights reserved.</p>
                <p className="text-purple-400 underline cursor-pointer">Hủy đăng ký nhận tin (Unsubscribe)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CAMPAIGN HISTORY */}
      {/* ========================================================================= */}
      {activeSubTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 tracking-wide">LỊCH SỬ CÁC CHIẾN DỊCH ĐÃ GỬI</h3>
              <p className="text-xs text-gray-500">Hệ thống lưu trữ thời điểm, số lượng người nhận và phản hồi từ Brevo</p>
            </div>
            <button
              onClick={fetchCampaigns}
              className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition"
              title="Làm mới"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-black" />
              <span>Đang tải lịch sử chiến dịch...</span>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-12 text-center text-xs text-gray-500">
              Chưa có chiến dịch nào được gửi.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/75 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-6 py-3.5">Tiêu đề chiến dịch</th>
                  <th className="px-6 py-3.5">Thời gian gửi</th>
                  <th className="px-6 py-3.5">Người thực hiện</th>
                  <th className="px-6 py-3.5">Người nhận</th>
                  <th className="px-6 py-3.5">Trạng thái</th>
                  <th className="px-6 py-3.5">Brevo Message ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {campaigns.map((camp) => (
                  <tr key={camp._id} className="hover:bg-gray-50/80 transition">
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {camp.subject}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(camp.sentAt || camp.createdAt).toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {camp.sentByName || 'Admin'}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {camp.recipientsCount} người
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          camp.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            camp.status === 'sent' ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                        {camp.status === 'sent' ? 'Thành công' : 'Thất bại'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-gray-400 truncate max-w-[180px]">
                      {camp.brevoMessageId || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONFIRMATION MODAL BEFORE SENDING FULL CAMPAIGN */}
      {/* ========================================================================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                <Send size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Xác Nhận Phát Hành Chiến Dịch</h3>
                <p className="text-xs text-gray-500">Vui lòng kiểm tra kỹ trước khi gửi qua Brevo</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl text-xs space-y-2 border border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500">Tiêu đề:</span>
                <span className="font-bold text-gray-900 truncate max-w-[240px]">{campaignForm.subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Số lượng người nhận:</span>
                <span className="font-bold text-emerald-600">{stats.activeSubscribers} người (Active)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Người gửi:</span>
                <span className="font-mono text-[11px] text-gray-700">kdeexx1912@gmail.com</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed">
              Email sẽ được gửi chính thức qua hệ thống SMTP relay của <strong>Brevo</strong> đến tất cả khách hàng đã đồng ý nhận tin.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSendFullCampaign}
                className="px-5 py-2 bg-black hover:bg-gray-900 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md"
              >
                Xác Nhận & Gửi Ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
