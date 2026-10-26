const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Mã sản phẩm là bắt buộc'],
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userName: {
    type: String,
    required: [true, 'Vui lòng nhập họ tên của bạn'],
    trim: true
  },
  userEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  userAvatar: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    required: [true, 'Vui lòng chọn số sao đánh giá (1-5 sao)'],
    min: [1, 'Đánh giá tối thiểu 1 sao'],
    max: [5, 'Đánh giá tối đa 5 sao']
  },
  title: {
    type: String,
    trim: true,
    default: ''
  },
  comment: {
    type: String,
    required: [true, 'Vui lòng nhập nội dung đánh giá'],
    trim: true
  },
  images: {
    type: [String],
    default: []
  },
  sizePurchased: {
    type: String,
    trim: true,
    default: ''
  },
  colorPurchased: {
    type: String,
    trim: true,
    default: ''
  },
  verifiedPurchase: {
    type: Boolean,
    default: true
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['approved', 'hidden'],
    default: 'approved'
  },
  adminReply: {
    comment: {
      type: String,
      default: ''
    },
    replyAt: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Review', reviewSchema);

