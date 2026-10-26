const mongoose = require('mongoose');
const crypto = require('crypto');

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email là bắt buộc'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Vui lòng nhập định dạng email hợp lệ']
    },
    status: {
      type: String,
      enum: ['subscribed', 'unsubscribed'],
      default: 'subscribed',
      index: true
    },
    source: {
      type: String,
      default: 'footer'
    },
    subscribedAt: {
      type: Date,
      default: Date.now
    },
    unsubscribedAt: {
      type: Date,
      default: null
    },
    unsubscribeToken: {
      type: String,
      default: () => crypto.randomBytes(24).toString('hex'),
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Tự động tạo unsubscribeToken nếu chưa có
newsletterSubscriberSchema.pre('save', function (next) {
  if (!this.unsubscribeToken) {
    this.unsubscribeToken = crypto.randomBytes(24).toString('hex');
  }
  next();
});

const NewsletterSubscriber =
  mongoose.models.NewsletterSubscriber ||
  mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);

module.exports = NewsletterSubscriber;

