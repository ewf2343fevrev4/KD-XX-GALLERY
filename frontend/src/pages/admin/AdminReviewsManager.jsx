import React, { useState, useEffect, useCallback } from 'react';
import { 
  Star, 
  Search, 
  Trash2, 
  MessageSquare, 
  Eye, 
  EyeOff, 
  Image as ImageIcon, 
  CheckCircle, 
  AlertCircle, 
  Filter, 
  RotateCw, 
  X, 
  Send,
  ThumbsUp,
  Tag
} from 'lucide-react';
import { getAdminReviews, updateAdminReview, deleteAdminReview } from '../../services/api';

const QUICK_REPLY_TEMPLATES = [
  'Cảm ơn bạn đã tin tưởng và đồng hành cùng KD-XX! Chúc bạn luôn tự tin và phong cách cùng outfit mới.',
  'KD-XX rất vui khi bạn hài lòng với chất lượng sản phẩm và dịch vụ đóng gói. Hẹn gặp lại bạn ở những bộ sưu tập tiếp theo!',
  'Cảm ơn feedback chi tiết và hình ảnh trải nghiệm thực tế tuyệt vời của bạn dành cho KD-XX Official Store!',
  'KD-XX rất tiếc nếu trải nghiệm chưa hoàn toàn như bạn mong đợi. Đội ngũ CSKH sẽ liên hệ hỗ trợ bạn ngay qua tin nhắn hỗ trợ nhé.'
];

export default function AdminReviewsManager() {
  const token = localStorage.getItem('token');

  const [reviews, setReviews] = useState([]);
  const [meta, setMeta] = useState({
    total: 0,
    totalAll: 0,
    approvedCount: 0,
    hiddenCount: 0,
    withPhotosCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [hasPhotoOnly, setHasPhotoOnly] = useState(false);

  // Modals & Active state
  const [previewImage, setPreviewImage] = useState(null);
  const [replyingReview, setReplyingReview] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  const fetchReviews = useCallback(async () => {
    if (!token) {
      setError('Vui lòng đăng nhập với tài khoản Admin để truy cập.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (ratingFilter !== 'all') params.rating = ratingFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (hasPhotoOnly) params.hasPhoto = 'true';

      const res = await getAdminReviews(token, params);
      if (res && res.success) {
        setReviews(res.data || []);
        if (res.meta) setMeta(res.meta);
      } else {
        setError(res?.message || 'Không thể tải danh sách đánh giá');
      }
    } catch (err) {
      console.error('Fetch admin reviews error:', err);
      setError('Lỗi kết nối khi tải danh sách đánh giá');
    } finally {
      setLoading(false);
    }
  }, [token, search, ratingFilter, statusFilter, hasPhotoOnly]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Flash success notification
  const showSuccess = (msg) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(''), 4000);
  };

  // Toggle review visibility (Approved <-> Hidden)
  const handleToggleStatus = async (review) => {
    const nextStatus = review.status === 'approved' ? 'hidden' : 'approved';
    try {
      const res = await updateAdminReview(token, review._id, { status: nextStatus });
      if (res && res.success) {
        setReviews(prev => prev.map(r => r._id === review._id ? { ...r, status: nextStatus } : r));
        showSuccess(nextStatus === 'approved' ? 'Đã hiển thị đánh giá' : 'Đã ẩn đánh giá khỏi giao diện');
      } else {
        alert(res?.message || 'Không thể thay đổi trạng thái');
      }
    } catch (err) {
      console.error('Toggle status error:', err);
      alert('Lỗi server khi đổi trạng thái');
    }
  };

  // Open Reply Modal
  const handleOpenReplyModal = (review) => {
    setReplyingReview(review);
    setReplyText(review.adminReply?.comment || '');
  };

  // Submit Shop Reply
  const handleSubmitReply = async (e) => {
    e?.preventDefault();
    if (!replyingReview) return;
    if (!replyText.trim()) {
      alert('Vui lòng nhập nội dung phản hồi');
      return;
    }

    setIsSubmittingReply(true);
    try {
      const res = await updateAdminReview(token, replyingReview._id, {
        adminReply: replyText.trim()
      });

      if (res && res.success) {
        setReviews(prev => prev.map(r => 
          r._id === replyingReview._id 
            ? { ...r, adminReply: { comment: replyText.trim(), replyAt: new Date() } }
            : r
        ));
        setReplyingReview(null);
        setReplyText('');
        showSuccess('Đã gửi phản hồi chính thức từ KD-XX!');
      } else {
        alert(res?.message || 'Không thể lưu phản hồi');
      }
    } catch (err) {
      console.error('Submit reply error:', err);
      alert('Lỗi server khi gửi phản hồi');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Remove Shop Reply
  const handleRemoveReply = async (reviewId) => {
    if (!window.confirm('Bạn có chắc muốn xóa phản hồi của shop cho đánh giá này?')) return;
    try {
      const res = await updateAdminReview(token, reviewId, { adminReply: '' });
      if (res && res.success) {
        setReviews(prev => prev.map(r => 
          r._id === reviewId 
            ? { ...r, adminReply: { comment: '', replyAt: null } }
            : r
        ));
        showSuccess('Đã xóa phản hồi');
      }
    } catch (err) {
      console.error('Remove reply error:', err);
      alert('Lỗi server khi xóa phản hồi');
    }
  };

  // Delete review
  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn đánh giá này? Thao tác này không thể hoàn tác.')) {
      return;
    }

    try {
      const res = await deleteAdminReview(token, reviewId);
      if (res && res.success) {
        setReviews(prev => prev.filter(r => r._id !== reviewId));
        showSuccess('Đã xóa đánh giá thành công');
      } else {
        alert(res?.message || 'Không thể xóa đánh giá');
      }
    } catch (err) {
      console.error('Delete review error:', err);
      alert('Lỗi server khi xóa đánh giá');
    }
  };

  // Render Stars helper
  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-0.5 text-amber-400">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={15}
            fill={star <= Math.round(rating) ? '#f59e0b' : 'none'}
            stroke="#f59e0b"
            className={star <= Math.round(rating) ? 'text-amber-500' : 'text-gray-300'}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tổng Đánh Giá</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{meta.totalAll || reviews.length}</p>
          </div>
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
            <Star size={20} fill="currentColor" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Đang Hiển Thị</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{meta.approvedCount || 0}</p>
          </div>
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <Eye size={20} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Đã Ẩn / Tạm Khóa</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{meta.hiddenCount || 0}</p>
          </div>
          <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
            <EyeOff size={20} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Đánh Giá Có Ảnh</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{meta.withPhotosCount || 0}</p>
          </div>
          <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
            <ImageIcon size={20} />
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl flex items-center gap-2.5 shadow-sm text-sm">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <span className="font-medium">{actionSuccessMsg}</span>
        </div>
      )}

      {/* Filters & Search Control Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo tên khách, nội dung đánh giá hoặc sản phẩm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchReviews()}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchReviews}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1.5 transition"
              title="Làm mới danh sách"
            >
              <RotateCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Tải lại</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 text-xs">
          <span className="font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter size={13} />
            Bộ lọc:
          </span>

          {/* Rating filter */}
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 font-medium focus:outline-none"
          >
            <option value="all">Tất cả số sao</option>
            <option value="5">★★★★★ (5 Sao)</option>
            <option value="4">★★★★☆ (4 Sao)</option>
            <option value="3">★★★☆☆ (3 Sao)</option>
            <option value="2">★★☆☆☆ (2 Sao)</option>
            <option value="1">★☆☆☆☆ (1 Sao)</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 font-medium focus:outline-none"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="approved">Đang hiển thị</option>
            <option value="hidden">Đã ẩn</option>
          </select>

          {/* Has photo button */}
          <button
            type="button"
            onClick={() => setHasPhotoOnly(!hasPhotoOnly)}
            className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition ${
              hasPhotoOnly 
                ? 'bg-purple-50 text-purple-700 border-purple-200' 
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            <ImageIcon size={13} />
            <span>Có hình ảnh đính kèm</span>
          </button>
        </div>
      </div>

      {/* Reviews List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <RotateCw size={28} className="animate-spin mx-auto text-blue-600 mb-2" />
            <p className="text-sm">Đang tải danh sách đánh giá...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <AlertCircle size={28} className="mx-auto mb-2" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Star size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-base font-semibold text-gray-700">Không tìm thấy đánh giá nào</p>
            <p className="text-xs text-gray-400 mt-1">Hãy thử thay đổi từ khóa hoặc điều kiện bộ lọc.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reviews.map((review) => {
              const product = review.product || {};
              const hasImages = Array.isArray(review.images) && review.images.length > 0;
              const hasReply = Boolean(review.adminReply?.comment);

              return (
                <div key={review._id} className="p-5 hover:bg-gray-50/60 transition space-y-3.5">
                  {/* Top row: Product info + Status badge + Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Product badge */}
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-14 bg-gray-100 rounded-lg overflow-hidden shrink-0 border border-gray-200">
                        <img
                          src={product.image || product.images?.[0] || '/placeholder.jpg'}
                          alt={product.name || 'Sản phẩm'}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.src = '/placeholder.jpg'; }}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold tracking-wider uppercase text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                            {product.brand || 'AMIRI'}
                          </span>
                          <span className="text-xs text-gray-400">#{product._id?.slice(-6) || ''}</span>
                        </div>
                        <h4 className="text-sm font-bold text-gray-900 line-clamp-1 mt-0.5">
                          {product.name || 'Sản phẩm không xác định hoặc đã bị xóa'}
                        </h4>
                        <div className="text-xs text-gray-500">
                          ${Number(product.price || 0).toLocaleString()} • {product.category || 'Thời trang'}
                        </div>
                      </div>
                    </div>

                    {/* Actions and Status */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {/* Status indicator */}
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        review.status === 'approved' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {review.status === 'approved' ? (
                          <>
                            <Eye size={12} />
                            <span>Hiển thị</span>
                          </>
                        ) : (
                          <>
                            <EyeOff size={12} />
                            <span>Đã ẩn</span>
                          </>
                        )}
                      </span>

                      {/* Status toggle button */}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(review)}
                        className="px-2.5 py-1 text-xs font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                        title={review.status === 'approved' ? 'Ẩn đánh giá này khỏi web' : 'Hiện đánh giá này lên web'}
                      >
                        {review.status === 'approved' ? 'Ẩn' : 'Hiện'}
                      </button>

                      {/* Reply button */}
                      <button
                        type="button"
                        onClick={() => handleOpenReplyModal(review)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1 transition ${
                          hasReply 
                            ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' 
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                        title="Phản hồi chính thức từ KD-XX"
                      >
                        <MessageSquare size={13} />
                        <span>{hasReply ? 'Sửa phản hồi' : 'Phản hồi'}</span>
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteReview(review._id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Xóa đánh giá vĩnh viễn"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Middle row: Review Details */}
                  <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-100 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      {/* Customer Info & Star */}
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-500 text-white font-bold flex items-center justify-center text-xs">
                          {review.userName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-gray-900">{review.userName}</span>
                            {review.verifiedPurchase && (
                              <span className="inline-flex items-center text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded">
                                ✓ Đã mua hàng
                              </span>
                            )}
                          </div>
                          {review.userEmail && (
                            <span className="text-[11px] text-gray-400">{review.userEmail}</span>
                          )}
                        </div>
                      </div>

                      {/* Stars & Date */}
                      <div className="flex items-center gap-2.5">
                        {renderStars(review.rating)}
                        <span className="font-bold text-amber-600">{Number(review.rating).toFixed(1)}</span>
                        <span className="text-gray-300">•</span>
                        <span className="text-gray-400">
                          {new Date(review.createdAt).toLocaleDateString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Variant tags (Size / Color) */}
                    {(review.sizePurchased || review.colorPurchased) && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Tag size={12} className="text-gray-400" />
                        {review.sizePurchased && (
                          <span className="bg-white border border-gray-200 px-2 py-0.5 rounded text-[11px]">
                            Size: <strong>{review.sizePurchased}</strong>
                          </span>
                        )}
                        {review.colorPurchased && (
                          <span className="bg-white border border-gray-200 px-2 py-0.5 rounded text-[11px]">
                            Màu: <strong>{review.colorPurchased}</strong>
                          </span>
                        )}
                        {review.likes > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-blue-600 ml-auto">
                            <ThumbsUp size={11} /> {review.likes} lượt hữu ích
                          </span>
                        )}
                      </div>
                    )}

                    {/* Review Title & Content */}
                    <div className="text-sm">
                      {review.title && (
                        <h5 className="font-semibold text-gray-900 mb-1">{review.title}</h5>
                      )}
                      <p className="text-gray-700 whitespace-pre-line leading-relaxed">{review.comment}</p>
                    </div>

                    {/* Review Image Attachments */}
                    {hasImages && (
                      <div className="pt-2">
                        <div className="flex items-center gap-1.5 text-xs text-purple-700 font-semibold mb-2">
                          <ImageIcon size={14} />
                          <span>Hình ảnh khách hàng đính kèm ({review.images.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {review.images.map((imgUrl, imgIdx) => (
                            <button
                              key={imgIdx}
                              type="button"
                              onClick={() => setPreviewImage(imgUrl)}
                              className="group relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shadow-2xs hover:border-purple-500 transition"
                            >
                              <img
                                src={imgUrl}
                                alt={`Customer upload ${imgIdx + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition"
                                onError={(e) => { e.target.src = '/placeholder.jpg'; }}
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition">
                                <Eye size={14} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Shop Official Reply Block */}
                  {hasReply && (
                    <div className="ml-4 sm:ml-8 pl-4 border-l-2 border-purple-500 bg-purple-50/50 rounded-r-xl p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1">
                          ★ PHẢN HỒI TỪ KD-XX OFFICIAL STORE
                        </span>
                        <div className="flex items-center gap-2">
                          {review.adminReply.replyAt && (
                            <span className="text-[11px] text-purple-600">
                              {new Date(review.adminReply.replyAt).toLocaleDateString('vi-VN')}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveReply(review._id)}
                            className="text-gray-400 hover:text-red-500 font-semibold"
                            title="Xóa phản hồi này"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-800 leading-relaxed italic">
                        "{review.adminReply.comment}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= REPLY MODAL ================= */}
      {replyingReview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Phản Hồi Đánh Giá Khách Hàng</h3>
                <p className="text-xs text-gray-500">Khách hàng: <strong>{replyingReview.userName}</strong> • Đánh giá: {replyingReview.rating} sao</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingReview(null)}
                className="text-gray-400 hover:text-gray-700 p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Customer Review Summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs border border-gray-100 text-gray-600 max-h-24 overflow-y-auto">
              <span className="font-semibold text-gray-800">Nội dung khách viết: </span>
              "{replyingReview.comment}"
            </div>

            {/* Quick Templates */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Mẫu phản hồi nhanh (Click để chọn):
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {QUICK_REPLY_TEMPLATES.map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReplyText(tpl)}
                    className="w-full text-left text-xs p-2 rounded bg-gray-50 hover:bg-purple-50 hover:text-purple-900 border border-gray-200 transition line-clamp-2"
                  >
                    💬 {tpl}
                  </button>
                ))}
              </div>
            </div>

            {/* Reply Input Form */}
            <form onSubmit={handleSubmitReply} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Nội dung phản hồi công khai (Hiển thị dưới đánh giá của khách):
                </label>
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Nhập phản hồi từ KD-XX Official Store..."
                  className="w-full p-3 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setReplyingReview(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReply}
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-sm flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Send size={13} />
                  <span>{isSubmittingReply ? 'Đang gửi...' : 'Lưu & Đăng phản hồi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= IMAGE LIGHTBOX PREVIEW MODAL ================= */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 p-2"
              title="Đóng xem ảnh"
            >
              <X size={28} />
            </button>
            <img
              src={previewImage}
              alt="Customer review preview"
              className="max-h-[85vh] w-auto rounded-lg shadow-2xl object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
