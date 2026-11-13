import React, { useState, useEffect } from 'react';
import { 
  Film, 
  Image as ImageIcon, 
  Plus, 
  Edit2, 
  Trash2, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  Eye, 
  Save, 
  X,
  Layers
} from 'lucide-react';
import { getAdminCampaignMedia, updateAdminCampaignMedia, uploadCampaignMediaFile } from '../../services/api';

const DEFAULT_LEFT_TEMPLATE = {
  imageUrl: '/assets/couple-outfit.jpg',
  eyebrow: 'WINTER CAPSULE · CO-ORD',
  title: 'COUPLE OUTFIT',
  description: 'High-altitude alpine glamour meets coordinated dark luxury. Sculpted high-shine puffers, plush fur finishes, and an effortless synchronized silhouette designed for two.'
};

const DEFAULT_RIGHT_TEMPLATE = {
  imageUrl: '/assets/homie-outfit.jpg',
  eyebrow: 'STREET CULTURE · BROTHERHOOD',
  title: 'OUTFIT WITH HOMIE',
  description: 'Unfiltered urban presence and bonded brotherhood. Layered technical tracksuits, statement iced chains, and authentic street silhouettes rooted in the pulse of modern streetwear.'
};

export default function AdminCampaignAdsManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Campaign media state
  const [videoData, setVideoData] = useState({
    videoUrl: '/assets/vid1.mp4',
    title: 'WINTER CAPSULE',
    description: "Winter in Runyon Canyon, set against the iconic backdrop of Los Angeles.\nBringing a sophisticated ease to cold-weather essentials, the Winter Capsule unites function and form through the house's signature craftsmanship.",
    posterUrl: ''
  });

  const [showcaseLeft, setShowcaseLeft] = useState([DEFAULT_LEFT_TEMPLATE]);
  const [showcaseRight, setShowcaseRight] = useState([DEFAULT_RIGHT_TEMPLATE]);

  // Modal edit/add state
  const [itemModal, setItemModal] = useState({
    isOpen: false,
    side: 'left', // 'left' | 'right'
    index: null,  // null for new item, number for editing
    formData: {
      imageUrl: '',
      eyebrow: '',
      title: '',
      description: ''
    }
  });

  const token = localStorage.getItem('token');

  // Load current campaign media
  const loadCampaignMedia = async () => {
    try {
      setLoading(true);
      setFeedback({ type: '', message: '' });
      const res = await getAdminCampaignMedia(token);
      const media = res?.data?.data || res?.data;
      if (res?.success && media) {
        if (media.video) {
          setVideoData({
            videoUrl: media.video.videoUrl || '/assets/vid1.mp4',
            title: media.video.title || 'WINTER CAPSULE',
            description: media.video.description || '',
            posterUrl: media.video.posterUrl || ''
          });
        }
        if (Array.isArray(media.showcaseLeft) && media.showcaseLeft.length > 0) {
          setShowcaseLeft(media.showcaseLeft);
        }
        if (Array.isArray(media.showcaseRight) && media.showcaseRight.length > 0) {
          setShowcaseRight(media.showcaseRight);
        }
      }
    } catch (err) {
      console.error('Error fetching campaign media:', err);
      setFeedback({ type: 'error', message: 'Không thể tải dữ liệu quảng cáo Campaign.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaignMedia();
  }, []);

  // Save all changes
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setFeedback({ type: '', message: '' });

      const payload = {
        video: videoData,
        showcaseLeft: showcaseLeft,
        showcaseRight: showcaseRight
      };

      const res = await updateAdminCampaignMedia(token, payload);
      if (res?.success) {
        setFeedback({ 
          type: 'success', 
          message: '✅ Đã lưu cấu hình quảng cáo & video Campaign thành công! Trang Campaign sẽ lập tức hiển thị nội dung mới.' 
        });
      } else {
        setFeedback({ 
          type: 'error', 
          message: `❌ Lỗi khi lưu: ${res?.error || 'Vui lòng thử lại sau.'}` 
        });
      }
    } catch (err) {
      console.error('Error saving campaign media:', err);
      setFeedback({ type: 'error', message: 'Có lỗi xảy ra khi lưu dữ liệu.' });
    } finally {
      setSaving(false);
    }
  };

  // Reset to default
  const handleResetToDefault = () => {
    const confirmReset = window.confirm(
      '⚠️ Bạn có chắc chắn muốn khôi phục về video và 2 ảnh mẫu mặc định của Winter Capsule không?'
    );
    if (!confirmReset) return;

    setVideoData({
      videoUrl: '/assets/vid1.mp4',
      title: 'WINTER CAPSULE',
      description: "Winter in Runyon Canyon, set against the iconic backdrop of Los Angeles.\nBringing a sophisticated ease to cold-weather essentials, the Winter Capsule unites function and form through the house's signature craftsmanship.",
      posterUrl: ''
    });
    setShowcaseLeft([DEFAULT_LEFT_TEMPLATE]);
    setShowcaseRight([DEFAULT_RIGHT_TEMPLATE]);
    setFeedback({ type: 'success', message: 'Đã đặt lại dữ liệu mẫu. Hãy bấm "LƯU CẤU HÌNH" để áp dụng lên hệ thống.' });
  };

  // Video File Upload
  const handleVideoFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      alert('⚠️ Dung lượng file video vượt quá 100MB. Vui lòng nén video hoặc chọn file nhỏ hơn!');
      return;
    }

    try {
      setUploading(true);
      const res = await uploadCampaignMediaFile(token, file);
      if (res?.success && res.url) {
        setVideoData(prev => ({ ...prev, videoUrl: res.url }));
        setFeedback({ type: 'success', message: '✅ Tải video lên Cloudinary thành công!' });
      } else {
        alert(`❌ Lỗi upload video: ${res?.error || 'Thất bại'}`);
      }
    } catch (err) {
      console.error('Video upload error:', err);
      alert('❌ Có lỗi xảy ra khi tải video lên.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Item Image Upload in Modal
  const handleItemImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('⚠️ Dung lượng file ảnh vượt quá 10MB.');
      return;
    }

    try {
      setUploading(true);
      const res = await uploadCampaignMediaFile(token, file);
      if (res?.success && res.url) {
        setItemModal(prev => ({
          ...prev,
          formData: { ...prev.formData, imageUrl: res.url }
        }));
      } else {
        alert(`❌ Lỗi upload ảnh: ${res?.error || 'Thất bại'}`);
      }
    } catch (err) {
      console.error('Image upload error:', err);
      alert('❌ Có lỗi khi tải ảnh lên.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Open modal for add
  const handleOpenAddModal = (side) => {
    setItemModal({
      isOpen: true,
      side,
      index: null,
      formData: {
        imageUrl: '',
        eyebrow: side === 'left' ? 'WINTER CAPSULE · CO-ORD' : 'STREET CULTURE · BROTHERHOOD',
        title: '',
        description: ''
      }
    });
  };

  // Open modal for edit
  const handleOpenEditModal = (side, index) => {
    const list = side === 'left' ? showcaseLeft : showcaseRight;
    const item = list[index];
    if (!item) return;

    setItemModal({
      isOpen: true,
      side,
      index,
      formData: {
        imageUrl: item.imageUrl || '',
        eyebrow: item.eyebrow || '',
        title: item.title || '',
        description: item.description || ''
      }
    });
  };

  // Delete item from list
  const handleDeleteItem = (side, index) => {
    const list = side === 'left' ? showcaseLeft : showcaseRight;
    if (list.length <= 1) {
      alert('⚠️ Mỗi cột cần giữ lại ít nhất 1 ảnh trưng bày!');
      return;
    }

    const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa ảnh này khỏi ${side === 'left' ? 'Cột Trái' : 'Cột Phải'}?`);
    if (!confirmed) return;

    if (side === 'left') {
      setShowcaseLeft(prev => prev.filter((_, i) => i !== index));
    } else {
      setShowcaseRight(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Save Modal Form
  const handleSaveModal = (e) => {
    e.preventDefault();
    const { side, index, formData } = itemModal;

    if (!formData.imageUrl || !formData.imageUrl.trim()) {
      alert('⚠️ Vui lòng cung cấp URL ảnh hoặc tải ảnh lên từ máy!');
      return;
    }
    if (!formData.title || !formData.title.trim()) {
      alert('⚠️ Vui lòng nhập tiêu đề cho ảnh!');
      return;
    }

    const newItem = {
      imageUrl: formData.imageUrl.trim(),
      eyebrow: formData.eyebrow?.trim() || '',
      title: formData.title.trim(),
      description: formData.description?.trim() || ''
    };

    if (side === 'left') {
      if (index !== null) {
        setShowcaseLeft(prev => prev.map((item, i) => i === index ? newItem : item));
      } else {
        setShowcaseLeft(prev => [...prev, newItem]);
      }
    } else {
      if (index !== null) {
        setShowcaseRight(prev => prev.map((item, i) => i === index ? newItem : item));
      } else {
        setShowcaseRight(prev => [...prev, newItem]);
      }
    }

    setItemModal({ isOpen: false, side: 'left', index: null, formData: { imageUrl: '', eyebrow: '', title: '', description: '' } });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
        <p className="text-sm font-medium text-gray-600">Đang tải dữ liệu Quảng cáo & Truyền thông...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Top Banner & Title */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white p-6 sm:p-8 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/30 text-purple-200 border border-purple-400/30 uppercase tracking-widest">
              KD-XX CAMPAIGN SUITE
            </span>
            <span className="text-xs text-gray-400">• Đang hoạt động trên trang chủ /campaign</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Quản Lý Quảng Cáo & Video Trưng Bày
          </h2>
          <p className="text-sm text-gray-300 mt-1 max-w-2xl">
            Tùy biến video quảng cáo điện ảnh và bộ sưu tập ảnh phối đồ (Editorial Showcase). Khi thêm nhiều ảnh, hệ thống tự động kích hoạt chuyển động trượt chéo độc lập giữa 2 cột.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/campaign"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur-md transition-all border border-white/20"
          >
            <Eye size={15} />
            <span>Xem trang Campaign</span>
          </a>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{saving ? 'ĐANG LƯU...' : 'LƯU CẤU HÌNH QUẢNG CÁO'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback.message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
            : 'bg-red-50 text-red-900 border-red-200'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. SECTION: VIDEO QUẢNG CÁO (CAMPAIGN VIDEO SECTION)           */}
      {/* ============================================================== */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Film size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>1. Video Quảng Cáo Điện Ảnh</span>
                <span className="text-[11px] font-normal px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-200">
                  Full-Width Video Section
                </span>
              </h3>
              <p className="text-xs text-gray-500">Phát lặp vô tận (loop) tự động với nút điều khiển phát/dừng ở giữa</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls & Inputs (Left 7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                Đường dẫn Video (URL hoặc File MP4) <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={videoData.videoUrl}
                  onChange={(e) => setVideoData(prev => ({ ...prev, videoUrl: e.target.value }))}
                  placeholder="VD: /assets/vid1.mp4 hoặc https://res.cloudinary.com/.../video.mp4"
                  className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono"
                />
                
                {/* Upload video file button */}
                <label className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{uploading ? 'Đang tải...' : 'Upload Video'}</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Hỗ trợ file video MP4, WebM hoặc URL lưu trữ trên Cloudinary / CDN.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                Tiêu đề Video (Headline) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={videoData.title}
                onChange={(e) => setVideoData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="VD: WINTER CAPSULE"
                className="w-full px-3.5 py-2.5 text-sm font-semibold bg-gray-50 border border-gray-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                Mô tả & Câu chuyện thời trang (Storytelling text)
              </label>
              <textarea
                rows={4}
                value={videoData.description}
                onChange={(e) => setVideoData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Nhập nội dung giới thiệu cảm hứng nghệ thuật của bộ sưu tập..."
                className="w-full px-3.5 py-2.5 text-xs leading-relaxed bg-gray-50 border border-gray-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Video Preview Box (Right 5 cols) */}
          <div className="lg:col-span-5">
            <span className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
              Xem trước hiển thị (Live Preview)
            </span>
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-gray-800 shadow-md group">
              <video
                key={videoData.videoUrl}
                src={videoData.videoUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
                onError={(e) => {
                  console.warn('Video preview error fallback');
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
              
              <div className="absolute bottom-3 left-3 right-3 text-white pointer-events-none">
                <span className="text-[10px] font-bold tracking-widest text-purple-300 uppercase">
                  CAMPAIGN VIDEO
                </span>
                <h4 className="text-base font-black truncate">{videoData.title || 'WINTER CAPSULE'}</h4>
                <p className="text-[11px] text-gray-300 line-clamp-2 mt-0.5">
                  {videoData.description}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 2. SECTION: ẢNH TRƯNG BÀY (EDITORIAL SHOWCASE SECTION)         */}
      {/* ============================================================== */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Layers size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>2. Quản Lý Ảnh Trưng Bầy (Editorial Showcase)</span>
                <span className="text-[11px] font-normal px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200">
                  Hiệu ứng trượt chéo độc lập
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Giao diện chia 2 cột. Khi thêm nhiều ảnh, hệ thống tự động trượt chéo từ <strong>dưới-phải lên trên-trái</strong> độc lập cho từng bên.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 cursor-pointer"
            title="Khôi phục ảnh mẫu ban đầu"
          >
            <RefreshCw size={13} />
            <span>Khôi phục mẫu gốc</span>
          </button>
        </div>

        {/* 2 Columns Management Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── CỘT TRÁI (LEFT SHOWCASE) ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                  CỘT TRÁI (Left Showcase)
                </h4>
                <span className="text-xs text-gray-500">
                  Đang có <strong className="text-purple-700">{showcaseLeft.length}</strong> ảnh {showcaseLeft.length > 1 ? '(Đang kích hoạt trượt chéo 6s)' : '(Tĩnh)'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleOpenAddModal('left')}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Thêm ảnh Cột Trái</span>
              </button>
            </div>

            {/* List of items in Left Column */}
            <div className="space-y-3">
              {showcaseLeft.map((item, idx) => (
                <div 
                  key={idx}
                  className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-center justify-between gap-4 hover:border-purple-300 transition-all shadow-2xs group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-16 h-20 rounded-lg overflow-hidden bg-gray-900 shrink-0 border border-gray-200">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title} 
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = '/assets/couple-outfit.jpg'; }}
                      />
                      <span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1 rounded">
                        0{idx + 1}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-purple-600 tracking-wider uppercase block truncate">
                        {item.eyebrow || 'WINTER CAPSULE · CO-ORD'}
                      </span>
                      <h5 className="text-sm font-bold text-gray-900 truncate">
                        {item.title}
                      </h5>
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal('left', idx)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Sửa ảnh này"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem('left', idx)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Xóa ảnh này"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CỘT PHẢI (RIGHT SHOWCASE) ── */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                  CỘT PHẢI (Right Showcase)
                </h4>
                <span className="text-xs text-gray-500">
                  Đang có <strong className="text-indigo-700">{showcaseRight.length}</strong> ảnh {showcaseRight.length > 1 ? '(Đang kích hoạt trượt chéo 7.5s)' : '(Tĩnh)'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleOpenAddModal('right')}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Thêm ảnh Cột Phải</span>
              </button>
            </div>

            {/* List of items in Right Column */}
            <div className="space-y-3">
              {showcaseRight.map((item, idx) => (
                <div 
                  key={idx}
                  className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-center justify-between gap-4 hover:border-indigo-300 transition-all shadow-2xs group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-16 h-20 rounded-lg overflow-hidden bg-gray-900 shrink-0 border border-gray-200">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title} 
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = '/assets/homie-outfit.jpg'; }}
                      />
                      <span className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1 rounded">
                        0{idx + 1}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase block truncate">
                        {item.eyebrow || 'STREET CULTURE · BROTHERHOOD'}
                      </span>
                      <h5 className="text-sm font-bold text-gray-900 truncate">
                        {item.title}
                      </h5>
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal('right', idx)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Sửa ảnh này"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem('right', idx)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Xóa ảnh này"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global Bottom Save Button */}
        <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            <span>{saving ? 'ĐANG LƯU HỆ THỐNG...' : 'LƯU TẤT CẢ THAY ĐỔI QUẢNG CÁO'}</span>
          </button>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 3. MODAL: THÊM / CHỈNH SỬA ẢNH TRƯNG BÀY (SHOWCASE MODAL)       */}
      {/* ============================================================== */}
      {itemModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b bg-gray-50">
              <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ImageIcon size={18} className="text-purple-600" />
                <span>
                  {itemModal.index !== null ? 'Chỉnh Sửa Ảnh Trưng Bày' : 'Thêm Ảnh Mới Vào'}{' '}
                  <span className="text-purple-600">({itemModal.side === 'left' ? 'Cột Trái' : 'Cột Phải'})</span>
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setItemModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-5 space-y-4">
              {/* Image Input & Upload */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                  Hình ảnh trưng bày <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={itemModal.formData.imageUrl}
                    onChange={(e) => setItemModal(prev => ({
                      ...prev,
                      formData: { ...prev.formData, imageUrl: e.target.value }
                    }))}
                    placeholder="Dán link ảnh URL hoặc tải file ảnh từ máy..."
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-purple-500"
                  />
                  
                  <label className="shrink-0 inline-flex items-center gap-1 px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-semibold cursor-pointer">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    <span>{uploading ? 'Đang up...' : 'Tải ảnh'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleItemImageUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Preview Image in Modal */}
                {itemModal.formData.imageUrl && (
                  <div className="mt-3 relative aspect-[3/4] max-h-48 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                    <img 
                      src={itemModal.formData.imageUrl} 
                      alt="Preview" 
                      className="w-full h-full object-cover" 
                      onError={(e) => { e.target.src = 'https://via.placeholder.com/300x400?text=Loi+Anh'; }}
                    />
                  </div>
                )}
              </div>

              {/* Eyebrow */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Nhãn phụ (Eyebrow Tag)
                </label>
                <input
                  type="text"
                  value={itemModal.formData.eyebrow}
                  onChange={(e) => setItemModal(prev => ({
                    ...prev,
                    formData: { ...prev.formData, eyebrow: e.target.value }
                  }))}
                  placeholder="VD: WINTER CAPSULE · CO-ORD hoặc STREET CULTURE"
                  className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Tiêu đề chính (Title) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={itemModal.formData.title}
                  onChange={(e) => setItemModal(prev => ({
                    ...prev,
                    formData: { ...prev.formData, title: e.target.value }
                  }))}
                  placeholder="VD: COUPLE OUTFIT hoặc OUTFIT WITH HOMIE"
                  className="w-full px-3 py-2 text-sm font-bold bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Mô tả phong cách (Editorial Description)
                </label>
                <textarea
                  rows={3}
                  value={itemModal.formData.description}
                  onChange={(e) => setItemModal(prev => ({
                    ...prev,
                    formData: { ...prev.formData, description: e.target.value }
                  }))}
                  placeholder="Nhập mô tả phối đồ, chất liệu, cảm hứng thiết kế..."
                  className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {itemModal.index !== null ? 'Cập Nhật Ảnh' : 'Thêm Vào Danh Sách'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

