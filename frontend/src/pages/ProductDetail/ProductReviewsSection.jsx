import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Star, 
  Camera, 
  ThumbsUp, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Upload, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  Gift, 
  Maximize2
} from 'lucide-react';
import { getProductReviews, createProductReview, likeProductReview } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const RATING_DESCRIPTIONS = {
  5: '★★★★★ Tuyệt vời — Rất đáng tiền, chất lượng cao cấp & chuẩn form',
  4: '★★★★☆ Hài lòng — Sản phẩm tốt, ưng ý khi mặc',
  3: '★★★☆☆ Bình thường — Sản phẩm tạm ổn, đúng như mô tả',
  2: '★★☆☆☆ Chưa hài lòng — Chất lượng hoặc kích cỡ chưa như kỳ vọng',
  1: '★☆☆☆☆ Rất thất vọng — Không hài lòng về sản phẩm'
};

export default function ProductReviewsSection({
  productId,
  productName,
  productBrand = 'AMIRI',
  availableSizes = [],
  availableColors = [],
  selectedSize = '',
  selectedColor = '',
  onStatsUpdate
}) {
  const { user, token } = useAuth();

  // Reviews data state
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({
    averageRating: 5.0,
    totalReviews: 0,
    ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    ratingPercentages: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    withPhotosCount: 0,
    allPhotos: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Sorting state
  const [selectedRatingFilter, setSelectedRatingFilter] = useState('all'); // 'all', '5', '4', '3', '2', '1'
  const [filterOnlyPhotos, setFilterOnlyPhotos] = useState(false);
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'highest', 'lowest', 'helpful'

  // Write Review Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formRating, setFormRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [formTitle, setFormTitle] = useState('');
  const [formComment, setFormComment] = useState('');
  const [formUserName, setFormUserName] = useState(user?.name || '');
  const [formUserEmail, setFormUserEmail] = useState(user?.email || '');
  const [formSize, setFormSize] = useState(selectedSize || '');
  const [formColor, setFormColor] = useState(selectedColor || '');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Lightbox preview state
  const [activePhotoModal, setActivePhotoModal] = useState(null);

  const formRef = useRef(null);
  const fileInputRef = useRef(null);
  const onStatsUpdateRef = useRef(onStatsUpdate);

  // Keep ref up to date without triggering re-fetch
  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
  }, [onStatsUpdate]);

  // Update user name/email if user logs in
  useEffect(() => {
    if (user) {
      if (!formUserName) setFormUserName(user.name || '');
      if (!formUserEmail) setFormUserEmail(user.email || '');
    }
  }, [user]);

  // Sync size/color if parent selected changes and form is empty
  useEffect(() => {
    if (selectedSize && !formSize) setFormSize(selectedSize);
    if (selectedColor && !formColor) setFormColor(selectedColor);
  }, [selectedSize, selectedColor]);

  // Fetch reviews from API (stable dependencies to avoid infinite loop / flickering)
  const fetchReviews = useCallback(async (showFullLoading = false) => {
    if (!productId) return;
    if (showFullLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const params = {};
      if (selectedRatingFilter !== 'all') params.rating = selectedRatingFilter;
      if (filterOnlyPhotos) params.hasPhoto = 'true';
      if (sortBy) params.sort = sortBy;

      const res = await getProductReviews(productId, params);

      if (res && res.success) {
        setReviews(res.data || []);
        if (res.stats) {
          setStats(res.stats);
          onStatsUpdateRef.current?.(res.stats);
        }
      } else {
        setError(res?.message || 'Không thể tải đánh giá');
      }
    } catch (err) {
      console.error('Fetch reviews error:', err);
      setError('Lỗi kết nối khi tải danh sách đánh giá');
    } finally {
      setLoading(false);
    }
  }, [productId, selectedRatingFilter, filterOnlyPhotos, sortBy]);

  useEffect(() => {
    fetchReviews(true);
  }, [fetchReviews]);

  // Handle file picker selection
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = 5 - selectedFiles.length;
    if (remainingSlots <= 0) {
      alert('Bạn chỉ có thể tải lên tối đa 5 hình ảnh cho mỗi đánh giá');
      return;
    }

    const validFiles = [];
    const validPreviews = [];

    files.slice(0, remainingSlots).forEach(file => {
      if (!file.type.startsWith('image/')) {
        alert(`File "${file.name}" không phải là ảnh hợp lệ!`);
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        alert(`Ảnh "${file.name}" vượt quá dung lượng 8MB cho phép.`);
        return;
      }

      validFiles.push(file);
      validPreviews.push(URL.createObjectURL(file));
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
    setFilePreviews(prev => [...prev, ...validPreviews]);

    // reset input so same file can be re-selected if removed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Submit Review Form
  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!formComment.trim()) {
      setSubmitError('Vui lòng nhập nội dung đánh giá của bạn');
      return;
    }

    if (!formUserName.trim()) {
      setSubmitError('Vui lòng nhập họ tên của bạn');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('rating', formRating);
      formData.append('title', formTitle.trim());
      formData.append('comment', formComment.trim());
      formData.append('userName', formUserName.trim());
      formData.append('userEmail', formUserEmail.trim());
      if (formSize) formData.append('sizePurchased', formSize);
      if (formColor) formData.append('colorPurchased', formColor);

      selectedFiles.forEach(file => {
        formData.append('images', file);
      });

      const res = await createProductReview(productId, formData, token);

      if (res && res.success) {
        setSubmitSuccess('Cảm ơn bạn! Đánh giá kèm hình ảnh thực tế của bạn đã được đăng thành công.');
        // Reset form
        setFormComment('');
        setFormTitle('');
        setSelectedFiles([]);
        setFilePreviews([]);
        setIsFormOpen(false);

        // Refresh reviews
        await fetchReviews();
      } else {
        setSubmitError(res?.message || 'Không thể gửi đánh giá. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error('Submit review error:', err);
      setSubmitError('Lỗi kết nối khi gửi đánh giá');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Like review (helpful)
  const handleLikeReview = async (reviewId) => {
    try {
      const res = await likeProductReview(reviewId, token);
      if (res && res.success) {
        setReviews(prev => prev.map(r => {
          if (r._id === reviewId) {
            return {
              ...r,
              likes: res.likes,
              likedByUser: res.liked
            };
          }
          return r;
        }));
      }
    } catch (err) {
      console.error('Like review error:', err);
    }
  };

  // Helper render stars
  const renderStarRating = (score, size = 16, interactive = false) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(starIndex => {
          const isFilled = interactive 
            ? starIndex <= (hoverRating || formRating)
            : starIndex <= Math.round(score);

          return (
            <button
              key={starIndex}
              type={interactive ? 'button' : undefined}
              disabled={!interactive}
              onMouseEnter={() => interactive && setHoverRating(starIndex)}
              onMouseLeave={() => interactive && setHoverRating(0)}
              onClick={() => interactive && setFormRating(starIndex)}
              className={`transition ${interactive ? 'cursor-pointer hover:scale-115' : 'cursor-default'}`}
              aria-label={`${starIndex} sao`}
            >
              <Star
                size={size}
                fill={isFilled ? '#f59e0b' : 'none'}
                stroke="#f59e0b"
                className={isFilled ? 'text-amber-500' : 'text-gray-400/40'}
              />
            </button>
          );
        })}
      </div>
    );
  };

  // Format relative time (e.g. "2 ngày trước")
  const formatReviewDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Hôm nay';
      if (diffDays === 1) return 'Hôm qua';
      if (diffDays < 7) return `${diffDays} ngày trước`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  return (
    <section id="customer-reviews-section" className="product-reviews-section">
      {/* Section Header */}
      <div className="reviews-section-header">
        <div>
          <span className="reviews-eyebrow">VERIFIED CUSTOMERS • KD-XX COMMUNITY</span>
          <h2 className="reviews-title">ĐÁNH GIÁ & HÌNH ẢNH TRẢI NGHIỆM THỰC TẾ</h2>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsFormOpen(!isFormOpen);
            if (!isFormOpen) {
              setTimeout(() => {
                formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }
          }}
          className="btn-open-review-form"
        >
          <Camera size={15} strokeWidth={1.75} />
          <span>{isFormOpen ? 'ĐÓNG BIỂU MẪU' : 'VIẾT ĐÁNH GIÁ CỦA BẠN'}</span>
        </button>
      </div>

      {/* Success Notification Alert */}
      {submitSuccess && (
        <div className="review-alert review-alert-success">
          <CheckCircle size={18} className="shrink-0 text-emerald-400" />
          <span>{submitSuccess}</span>
          <button type="button" onClick={() => setSubmitSuccess('')} className="ml-auto text-emerald-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ================= 1. RATING SCORECARD & BREAKDOWN ================= */}
      <div className="reviews-scorecard-grid">
        {/* Left: Overall Score */}
        <div className="scorecard-main">
          <div className="score-big-number">
            {stats.totalReviews > 0 ? Number(stats.averageRating).toFixed(1) : '5.0'}
          </div>
          <div className="score-stars-group">
            {renderStarRating(stats.totalReviews > 0 ? stats.averageRating : 5.0, 20)}
          </div>
          <p className="score-total-text">
            {stats.totalReviews > 0 
              ? `Dựa trên ${stats.totalReviews} lượt đánh giá thực tế từ khách hàng`
              : 'Chưa có đánh giá nào. Hãy là người đầu tiên trải nghiệm!'}
          </p>
          <div className="score-guarantee-pill">
            <ShieldCheck size={14} className="text-zinc-500" />
            <span>100% Đánh giá từ khách đã mua hàng</span>
          </div>
        </div>

        {/* Center: Star Rating Distribution Progress Bars */}
        <div className="scorecard-bars">
          {[5, 4, 3, 2, 1].map(star => {
            const count = stats.ratingCounts?.[star] || 0;
            const percentage = stats.ratingPercentages?.[star] || 0;
            const isSelected = selectedRatingFilter === String(star);

            return (
              <button
                key={star}
                type="button"
                onClick={() => {
                  setSelectedRatingFilter(isSelected ? 'all' : String(star));
                }}
                className={`rating-bar-row ${isSelected ? 'active' : ''}`}
                title={`Lọc đánh giá ${star} sao`}
              >
                <div className="bar-star-label">
                  <span>{star}</span>
                  <Star size={12} fill="#f59e0b" stroke="#f59e0b" />
                </div>
                <div className="bar-track">
                  <div 
                    className="bar-fill" 
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="bar-percent">{percentage}%</span>
                <span className="bar-count">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Right: KD-XX Luxury Highlights */}
        <div className="scorecard-perks">
          <div className="perk-highlight-item">
            <div className="perk-icon-circle">
              <Sparkles size={16} />
            </div>
            <div>
              <h4 className="perk-headline">CHUẨN XA XỈ & CHÍNH HÃNG</h4>
              <p className="perk-subtext">Cam kết chất liệu cao cấp, đường may tỉ mỉ chuẩn {productBrand}.</p>
            </div>
          </div>

          <div className="perk-highlight-item">
            <div className="perk-icon-circle">
              <Gift size={16} />
            </div>
            <div>
              <h4 className="perk-headline">TẶNG VOUCHER 10%</h4>
              <p className="perk-subtext">Nhận ngay voucher ưu đãi khi gửi đánh giá kèm hình ảnh thực tế.</p>
            </div>
          </div>

          <div className="perk-highlight-item">
            <div className="perk-icon-circle">
              <Clock size={16} />
            </div>
            <div>
              <h4 className="perk-headline">ĐỔI SIZE TRONG 14 NGÀY</h4>
              <p className="perk-subtext">Nếu sản phẩm chưa vừa vặn, hỗ trợ đổi kích cỡ nhanh chóng.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ================= 2. CUSTOMER PHOTO GALLERY STRIP ================= */}
      {stats.allPhotos && stats.allPhotos.length > 0 && (
        <div className="customer-gallery-section">
          <div className="customer-gallery-header">
            <div className="flex items-center gap-2">
              <Camera size={18} className="text-purple-400" />
              <h3 className="gallery-title">ẢNH THỰC TẾ TỪ KHÁCH HÀNG ({stats.allPhotos.length})</h3>
            </div>
            <span className="gallery-subtitle">Click vào ảnh để phóng to và xem chi tiết đánh giá</span>
          </div>

          <div className="customer-gallery-scroll">
            {stats.allPhotos.map((photoItem, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActivePhotoModal(photoItem)}
                className="customer-gallery-item group"
              >
                <img
                  src={photoItem.url}
                  alt={`Feedback ${idx + 1}`}
                  className="gallery-thumb-img"
                  onError={(e) => { e.target.src = '/placeholder.jpg'; }}
                />
                <div className="gallery-item-overlay">
                  <div className="overlay-info">
                    <span className="font-semibold">{photoItem.userName}</span>
                    <div className="flex items-center gap-0.5 text-amber-400">
                      <Star size={11} fill="currentColor" />
                      <span>{photoItem.rating}</span>
                    </div>
                  </div>
                  <Maximize2 size={16} className="text-white opacity-80" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================= 3. WRITE REVIEW FORM (COLLAPSIBLE) ================= */}
      {isFormOpen && (
        <div ref={formRef} className="write-review-card">
          <div className="write-review-header">
            <div>
              <h3 className="write-title">GỬI ĐÁNH GIÁ CỦA BẠN CHO {productName}</h3>
              <p className="write-desc">Chia sẻ trải nghiệm thực tế về chất liệu, form dáng để giúp các tín đồ khác lựa chọn tốt nhất.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="write-close-btn"
            >
              <X size={20} />
            </button>
          </div>

          {submitError && (
            <div className="review-alert review-alert-danger">
              <AlertCircle size={17} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitReview} className="write-review-form">
            {/* Interactive Rating Picker */}
            <div className="form-group-rating">
              <label className="form-label">
                MỨC ĐỘ HÀI LÒNG CỦA BẠN <span className="text-purple-400">*</span>
              </label>
              <div className="interactive-star-selector">
                {renderStarRating(formRating, 28, true)}
                <span className="rating-desc-text">
                  {RATING_DESCRIPTIONS[hoverRating || formRating]}
                </span>
              </div>
            </div>

            {/* Customer Details Row */}
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">
                  HỌ VÀ TÊN <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Hoàng Long, Alex..."
                  value={formUserName}
                  onChange={(e) => setFormUserName(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  EMAIL (NHẬN MÃ ƯU ĐÃI)
                </label>
                <input
                  type="email"
                  placeholder="Ví dụ: name@gmail.com"
                  value={formUserEmail}
                  onChange={(e) => setFormUserEmail(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            {/* Variant specs (Size & Color) */}
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">KÍCH CỠ BẠN ĐÃ MUA</label>
                {availableSizes.length > 0 ? (
                  <select
                    value={formSize}
                    onChange={(e) => setFormSize(e.target.value)}
                    className="form-input"
                  >
                    <option value="">-- Chọn kích cỡ --</option>
                    {availableSizes.map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ví dụ: L, XL, EU 42..."
                    value={formSize}
                    onChange={(e) => setFormSize(e.target.value)}
                    className="form-input"
                  />
                )}
              </div>

              <div className="form-group">
                <label className="form-label">MÀU SẮC BẠN ĐÃ MUA</label>
                {availableColors.length > 0 ? (
                  <select
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="form-input"
                  >
                    <option value="">-- Chọn màu sắc --</option>
                    {availableColors.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ví dụ: Black, White, Vintage..."
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="form-input"
                  />
                )}
              </div>
            </div>

            {/* Review Title */}
            <div className="form-group">
              <label className="form-label">TIÊU ĐỀ ĐÁNH GIÁ (TÓM TẮT)</label>
              <input
                type="text"
                placeholder="Ví dụ: Chất da cao cấp ngoài mong đợi, lên dáng siêu nét!"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="form-input"
              />
            </div>

            {/* Review Comment Text */}
            <div className="form-group">
              <label className="form-label">
                NỘI DUNG ĐÁNH GIÁ CHI TIẾT <span className="text-purple-400">*</span>
              </label>
              <textarea
                rows={4}
                placeholder="Hãy chia sẻ cảm nhận về form áo/quần/giày, chất liệu vải, độ co giãn, khả năng phối đồ và dịch vụ giao hàng..."
                value={formComment}
                onChange={(e) => setFormComment(e.target.value)}
                className="form-input form-textarea"
                required
              />
            </div>

            {/* Upload Customer Photos Area */}
            <div className="form-group">
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">
                  HÌNH ẢNH THỰC TẾ (TỐI ĐA 5 ẢNH)
                </label>
                <span className="text-xs text-purple-400 font-semibold flex items-center gap-1">
                  <Gift size={12} /> Tặng voucher 10% khi đính kèm ảnh
                </span>
              </div>

              {/* Upload trigger box */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="file-upload-dropzone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="dropzone-content">
                  <Upload size={24} className="text-purple-400 mb-1" />
                  <p className="dropzone-title">Nhấn để chọn ảnh từ máy hoặc kéo thả vào đây</p>
                  <p className="dropzone-sub">Định dạng JPG, PNG, WEBP (Tối đa 8MB mỗi ảnh, tối đa 5 ảnh)</p>
                </div>
              </div>

              {/* File Previews List */}
              {filePreviews.length > 0 && (
                <div className="file-previews-grid">
                  {filePreviews.map((previewUrl, pIdx) => (
                    <div key={pIdx} className="file-preview-card">
                      <img src={previewUrl} alt={`Upload ${pIdx + 1}`} className="preview-thumb" />
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(pIdx)}
                        className="btn-remove-preview"
                        title="Xóa ảnh này"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {filePreviews.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-add-more-photos"
                    >
                      <Upload size={18} />
                      <span>Thêm ảnh ({5 - filePreviews.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Submit buttons */}
            <div className="form-actions">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="btn-review-cancel"
              >
                HỦY BỎ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-review-submit"
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border" />
                    <span>ĐANG TẢI ẢNH & ĐĂNG ĐÁNH GIÁ...</span>
                  </>
                ) : (
                  <>
                    <Camera size={16} />
                    <span>GỬI ĐÁNH GIÁ NGAY</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= 4. FILTER & SORT TOOLBAR ================= */}
      <div className="reviews-toolbar">
        {/* Filter Pills */}
        <div className="reviews-filter-pills">
          <button
            type="button"
            onClick={() => setSelectedRatingFilter('all')}
            className={`filter-pill ${selectedRatingFilter === 'all' && !filterOnlyPhotos ? 'active' : ''}`}
          >
            Tất cả ({stats.totalReviews})
          </button>

          <button
            type="button"
            onClick={() => setFilterOnlyPhotos(!filterOnlyPhotos)}
            className={`filter-pill ${filterOnlyPhotos ? 'active' : ''}`}
          >
            <Camera size={13} />
            <span>Có hình ảnh ({stats.withPhotosCount})</span>
          </button>

          {[5, 4, 3, 2, 1].map(star => {
            const count = stats.ratingCounts?.[star] || 0;
            const isSelected = selectedRatingFilter === String(star) && !filterOnlyPhotos;
            return (
              <button
                key={star}
                type="button"
                onClick={() => {
                  setSelectedRatingFilter(String(star));
                }}
                className={`filter-pill ${isSelected ? 'active' : ''}`}
              >
                <span>{star} Sao ({count})</span>
              </button>
            );
          })}
        </div>

        {/* Sort Select */}
        <div className="reviews-sort-wrap">
          <span className="sort-label">SẮP XẾP:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="reviews-sort-select"
          >
            <option value="newest">Mới nhất</option>
            <option value="highest">Đánh giá cao nhất</option>
            <option value="lowest">Đánh giá thấp nhất</option>
            <option value="helpful">Hữu ích nhất</option>
          </select>
        </div>
      </div>

      {/* ================= 5. REVIEWS LIST ================= */}
      <div className="reviews-list-container">
        {loading ? (
          <div className="reviews-loading-box">
            <div className="luxury-spinner" />
            <p>Đang tải đánh giá từ cộng đồng KD-XX...</p>
          </div>
        ) : error ? (
          <div className="reviews-error-box">
            <AlertCircle size={24} className="text-red-400" />
            <p>{error}</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="reviews-empty-box">
            <div className="empty-star-icon">
              <Star size={36} fill="#f59e0b" stroke="#f59e0b" />
            </div>
            <h4 className="empty-title">CHƯA CÓ ĐÁNH GIÁ PHÙ HỢP BỘ LỌC</h4>
            <p className="empty-desc">
              {stats.totalReviews === 0 
                ? 'Hãy là người đầu tiên trải nghiệm và chia sẻ hình ảnh feedback cho bộ sưu tập này!' 
                : 'Không có đánh giá nào thỏa mãn điều kiện lọc. Hãy thử chọn tab "Tất cả".'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedRatingFilter('all');
                setFilterOnlyPhotos(false);
                setIsFormOpen(true);
              }}
              className="btn-luxury-primary mt-4"
            >
              + VIẾT ĐÁNH GIÁ ĐẦU TIÊN
            </button>
          </div>
        ) : (
          <div className="reviews-items-stack">
            {reviews.map((review) => {
              const hasImages = Array.isArray(review.images) && review.images.length > 0;
              const hasReply = Boolean(review.adminReply?.comment);

              return (
                <div key={review._id} className="review-card-item">
                  {/* Top user row */}
                  <div className="review-card-header">
                    <div className="reviewer-info">
                      <div className="reviewer-avatar">
                        {review.userAvatar ? (
                          <img src={review.userAvatar} alt={review.userName} />
                        ) : (
                          <span>{review.userName?.charAt(0)?.toUpperCase() || 'U'}</span>
                        )}
                      </div>
                      <div>
                        <div className="reviewer-name-row">
                          <span className="reviewer-name">{review.userName}</span>
                          {review.verifiedPurchase && (
                            <span className="verified-badge">
                              <CheckCircle size={12} className="text-emerald-400" />
                              <span>Đã mua tại KD-XX</span>
                            </span>
                          )}
                        </div>
                        <div className="reviewer-meta-row">
                          <div className="review-stars-wrap">
                            {renderStarRating(review.rating, 14)}
                          </div>
                          <span className="review-date">{formatReviewDate(review.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Size & Color tags */}
                    {(review.sizePurchased || review.colorPurchased) && (
                      <div className="review-variants-tag">
                        {review.sizePurchased && (
                          <span className="variant-pill">
                            Size: <strong>{review.sizePurchased}</strong>
                          </span>
                        )}
                        {review.colorPurchased && (
                          <span className="variant-pill">
                            Màu: <strong>{review.colorPurchased}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Review Content */}
                  <div className="review-card-body">
                    {review.title && (
                      <h4 className="review-headline">{review.title}</h4>
                    )}
                    <p className="review-text">{review.comment}</p>
                  </div>

                  {/* Customer Attached Photos */}
                  {hasImages && (
                    <div className="review-photos-grid">
                      {review.images.map((imgUrl, imgIdx) => (
                        <button
                          key={imgIdx}
                          type="button"
                          onClick={() => setActivePhotoModal({
                            url: imgUrl,
                            userName: review.userName,
                            rating: review.rating,
                            comment: review.comment
                          })}
                          className="review-photo-btn group"
                        >
                          <img
                            src={imgUrl}
                            alt={`Khách hàng feedback ${imgIdx + 1}`}
                            className="review-photo-img"
                            onError={(e) => { e.target.src = '/placeholder.jpg'; }}
                          />
                          <div className="photo-zoom-icon">
                            <Maximize2 size={14} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Shop Official Response Block */}
                  {hasReply && (
                    <div className="review-shop-reply">
                      <div className="shop-reply-header">
                        <span className="shop-reply-title">
                          <Sparkles size={13} className="text-purple-400" />
                          PHẢN HỒI TỪ KD-XX OFFICIAL STORE
                        </span>
                        {review.adminReply.replyAt && (
                          <span className="shop-reply-date">
                            {formatReviewDate(review.adminReply.replyAt)}
                          </span>
                        )}
                      </div>
                      <p className="shop-reply-text">
                        "{review.adminReply.comment}"
                      </p>
                    </div>
                  )}

                  {/* Footer Action: Helpful Upvote */}
                  <div className="review-card-footer">
                    <button
                      type="button"
                      onClick={() => handleLikeReview(review._id)}
                      className={`btn-helpful ${review.likedByUser ? 'active' : ''}`}
                    >
                      <ThumbsUp size={13} />
                      <span>Hữu ích ({review.likes || 0})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= 6. LIGHTBOX PHOTO MODAL ================= */}
      {activePhotoModal && (
        <div 
          className="reviews-lightbox-backdrop"
          onClick={() => setActivePhotoModal(null)}
        >
          <div className="reviews-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActivePhotoModal(null)}
              className="lightbox-close"
              aria-label="Đóng"
            >
              <X size={24} />
            </button>

            <div className="lightbox-image-container">
              <img
                src={activePhotoModal.url}
                alt="Customer feedback full view"
                className="lightbox-main-img"
              />
            </div>

            <div className="lightbox-caption">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-bold text-white text-sm">{activePhotoModal.userName}</span>
                {renderStarRating(activePhotoModal.rating, 14)}
              </div>
              {activePhotoModal.comment && (
                <p className="text-gray-300 text-xs line-clamp-3 leading-relaxed">
                  "{activePhotoModal.comment}"
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
