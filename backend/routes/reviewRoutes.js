const express = require('express');
const router = express.Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const Review = require('../models/Review');
const Product = require('../models/Product');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const { protect, admin } = require('../middleware/authMiddleware');

// Setup multer memory storage (up to 5 photos, max 8MB each)
const storage = multer.memoryStorage();
const uploadReviewImages = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file định dạng hình ảnh (JPG, PNG, WEBP)'), false);
    }
  }
});

// Optional auth middleware (attaches req.user if valid token exists, doesn't block if not)
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      req.user = await User.findById(decoded.id).select('-password');
    } catch (err) {
      // Ignore token failure for public actions
    }
  }
  next();
};

// Helper: Recalculate product rating & numReviews
async function syncProductRatingStats(productId) {
  try {
    const reviews = await Review.find({ product: productId, status: 'approved' });
    const numReviews = reviews.length;
    let rating = 5.0;
    if (numReviews > 0) {
      const sum = reviews.reduce((acc, curr) => acc + curr.rating, 0);
      rating = Math.round((sum / numReviews) * 10) / 10;
    }
    await Product.findByIdAndUpdate(productId, { rating, numReviews });
    return { rating, numReviews };
  } catch (err) {
    console.error('Error syncing product rating stats:', err);
    return { rating: 5.0, numReviews: 0 };
  }
}

// ==========================================
// 1. PUBLIC: GET REVIEWS FOR A PRODUCT
// ==========================================
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, hasPhoto, sort } = req.query;

    // 1. Fetch all approved reviews for stats calculation
    const allApproved = await Review.find({ product: productId, status: 'approved' })
      .sort({ createdAt: -1 })
      .lean();

    const totalReviews = allApproved.length;
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sumRating = 0;
    let withPhotosCount = 0;
    const allPhotos = [];

    allApproved.forEach(r => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
      ratingCounts[star] = (ratingCounts[star] || 0) + 1;
      sumRating += r.rating;

      if (Array.isArray(r.images) && r.images.length > 0) {
        withPhotosCount += 1;
        r.images.forEach(imgUrl => {
          allPhotos.push({
            url: imgUrl,
            reviewId: r._id,
            userName: r.userName,
            rating: r.rating,
            createdAt: r.createdAt
          });
        });
      }
    });

    const averageRating = totalReviews > 0 
      ? Math.round((sumRating / totalReviews) * 10) / 10 
      : 5.0;

    const ratingPercentages = {
      5: totalReviews > 0 ? Math.round((ratingCounts[5] / totalReviews) * 100) : 0,
      4: totalReviews > 0 ? Math.round((ratingCounts[4] / totalReviews) * 100) : 0,
      3: totalReviews > 0 ? Math.round((ratingCounts[3] / totalReviews) * 100) : 0,
      2: totalReviews > 0 ? Math.round((ratingCounts[2] / totalReviews) * 100) : 0,
      1: totalReviews > 0 ? Math.round((ratingCounts[1] / totalReviews) * 100) : 0
    };

    // 2. Filter & sort for the list
    let filtered = [...allApproved];

    if (rating && !isNaN(Number(rating))) {
      filtered = filtered.filter(r => Math.round(r.rating) === Number(rating));
    }

    if (hasPhoto === 'true' || hasPhoto === true) {
      filtered = filtered.filter(r => Array.isArray(r.images) && r.images.length > 0);
    }

    if (sort === 'highest') {
      filtered.sort((a, b) => b.rating - a.rating || new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'lowest') {
      filtered.sort((a, b) => a.rating - b.rating || new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'helpful') {
      filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      // Default: newest
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.json({
      success: true,
      stats: {
        averageRating,
        totalReviews,
        ratingCounts,
        ratingPercentages,
        withPhotosCount,
        allPhotos
      },
      data: filtered
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tải đánh giá sản phẩm',
      error: error.message
    });
  }
});

// ==========================================
// 2. PUBLIC/AUTH: CREATE PRODUCT REVIEW (WITH PHOTO UPLOAD)
// ==========================================
router.post(
  '/product/:productId',
  optionalAuth,
  uploadReviewImages.array('images', 5),
  async (req, res) => {
    try {
      const { productId } = req.params;
      const { 
        rating, 
        title, 
        comment, 
        userName, 
        userEmail, 
        sizePurchased, 
        colorPurchased 
      } = req.body;

      // Verify product exists
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy sản phẩm cần đánh giá'
        });
      }

      const numRating = Number(rating);
      if (!numRating || numRating < 1 || numRating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn số sao đánh giá hợp lệ từ 1 đến 5 sao'
        });
      }

      if (!comment || !comment.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập nội dung đánh giá chi tiết'
        });
      }

      // Determine user details
      const reviewerName = req.user?.name || (userName && userName.trim()) || 'Khách hàng KD-XX';
      const reviewerEmail = req.user?.email || (userEmail && userEmail.trim()) || '';
      const reviewerAvatar = req.user?.avatar || '';

      // Upload attached files to Cloudinary if any
      const uploadedImageUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            const uploadResult = await new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  folder: 'kdxx-reviews',
                  resource_type: 'image',
                  transformation: [
                    { width: 1200, crop: 'limit' },
                    { quality: 'auto:good', fetch_format: 'auto' }
                  ]
                },
                (err, result) => {
                  if (err) return reject(err);
                  resolve(result);
                }
              );
              stream.end(file.buffer);
            });

            if (uploadResult && uploadResult.secure_url) {
              uploadedImageUrls.push(uploadResult.secure_url);
            }
          } catch (uploadErr) {
            console.error('Cloudinary review image upload error:', uploadErr);
          }
        }
      }

      // Check if client also sent existing image URLs
      let finalImages = [...uploadedImageUrls];
      if (req.body.existingImages) {
        try {
          const parsed = typeof req.body.existingImages === 'string' 
            ? JSON.parse(req.body.existingImages) 
            : req.body.existingImages;
          if (Array.isArray(parsed)) {
            finalImages = [...finalImages, ...parsed];
          }
        } catch (e) {
          // ignore parse error
        }
      }

      // Create review
      const newReview = await Review.create({
        product: productId,
        user: req.user ? req.user._id : null,
        userName: reviewerName,
        userEmail: reviewerEmail,
        userAvatar: reviewerAvatar,
        rating: numRating,
        title: (title || '').trim(),
        comment: comment.trim(),
        images: finalImages,
        sizePurchased: (sizePurchased || '').trim(),
        colorPurchased: (colorPurchased || '').trim(),
        verifiedPurchase: true,
        status: 'approved'
      });

      // Recalculate product rating stats
      const updatedStats = await syncProductRatingStats(productId);

      res.status(201).json({
        success: true,
        message: 'Cảm ơn bạn! Đánh giá sản phẩm đã được gửi thành công.',
        data: newReview,
        productStats: updatedStats
      });
    } catch (error) {
      console.error('Create review error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi đăng đánh giá: ' + (error.message || 'Không xác định')
      });
    }
  }
);

// ==========================================
// 3. PUBLIC: UPVOTE / LIKE A REVIEW (HELPFUL)
// ==========================================
router.post('/:id/like', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá'
      });
    }

    const identifier = req.user?._id?.toString() || req.ip || 'anonymous';
    const hasLiked = Array.isArray(review.likedBy) && review.likedBy.includes(identifier);

    if (hasLiked) {
      review.likedBy = review.likedBy.filter(item => item !== identifier);
      review.likes = Math.max(0, (review.likes || 1) - 1);
    } else {
      if (!Array.isArray(review.likedBy)) review.likedBy = [];
      review.likedBy.push(identifier);
      review.likes = (review.likes || 0) + 1;
    }

    await review.save();

    res.json({
      success: true,
      likes: review.likes,
      liked: !hasLiked
    });
  } catch (error) {
    console.error('Like review error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi thích đánh giá'
    });
  }
});

// ==========================================
// 4. ADMIN: GET ALL REVIEWS WITH FILTERS
// ==========================================
router.get('/admin/all', protect, admin, async (req, res) => {
  try {
    const { search, rating, status, productId, hasPhoto } = req.query;

    const query = {};

    if (productId) {
      query.product = productId;
    }

    if (rating && !isNaN(Number(rating))) {
      query.rating = Number(rating);
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (hasPhoto === 'true') {
      query.images = { $exists: true, $not: { $size: 0 } };
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { userName: regex },
        { userEmail: regex },
        { title: regex },
        { comment: regex }
      ];
    }

    const reviews = await Review.find(query)
      .populate('product', 'name price image images category brand')
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    // Summary counts for Admin stats bar
    const totalCount = await Review.countDocuments();
    const approvedCount = await Review.countDocuments({ status: 'approved' });
    const hiddenCount = await Review.countDocuments({ status: 'hidden' });
    const withPhotosCount = await Review.countDocuments({ images: { $exists: true, $not: { $size: 0 } } });

    res.json({
      success: true,
      data: reviews,
      meta: {
        total: reviews.length,
        totalAll: totalCount,
        approvedCount,
        hiddenCount,
        withPhotosCount
      }
    });
  } catch (error) {
    console.error('Admin get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tải danh sách đánh giá',
      error: error.message
    });
  }
});

// ==========================================
// 5. ADMIN: UPDATE REVIEW (STATUS & SHOP REPLY)
// ==========================================
router.put('/admin/:id', protect, admin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminReply } = req.body;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá cần cập nhật'
      });
    }

    if (status && ['approved', 'hidden'].includes(status)) {
      review.status = status;
    }

    if (adminReply !== undefined) {
      if (typeof adminReply === 'string') {
        review.adminReply = {
          comment: adminReply.trim(),
          replyAt: adminReply.trim() ? new Date() : null
        };
      } else if (typeof adminReply === 'object') {
        review.adminReply = {
          comment: (adminReply.comment || '').trim(),
          replyAt: (adminReply.comment || '').trim() ? (adminReply.replyAt || new Date()) : null
        };
      }
    }

    await review.save();

    // Sync product stats in case status was changed
    await syncProductRatingStats(review.product);

    res.json({
      success: true,
      message: 'Cập nhật đánh giá thành công',
      data: review
    });
  } catch (error) {
    console.error('Admin update review error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật đánh giá: ' + error.message
    });
  }
});

// ==========================================
// 6. ADMIN: DELETE A REVIEW
// ==========================================
router.delete('/admin/:id', protect, admin, async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đánh giá cần xóa'
      });
    }

    const productId = review.product;
    await Review.findByIdAndDelete(id);

    // Sync product stats
    await syncProductRatingStats(productId);

    res.json({
      success: true,
      message: 'Đã xóa đánh giá thành công'
    });
  } catch (error) {
    console.error('Admin delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa đánh giá: ' + error.message
    });
  }
});

module.exports = router;

