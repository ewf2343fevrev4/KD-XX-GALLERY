const mongoose = require('mongoose');

const newsletterCampaignSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: [true, 'Tiêu đề chiến dịch là bắt buộc'],
      trim: true
    },
    previewText: {
      type: String,
      trim: true,
      default: ''
    },
    htmlContent: {
      type: String,
      required: [true, 'Nội dung email là bắt buộc']
    },
    bannerUrl: {
      type: String,
      default: ''
    },
    ctaText: {
      type: String,
      default: 'KHÁM PHÁ NGAY'
    },
    ctaUrl: {
      type: String,
      default: 'http://localhost:3000'
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    sentByName: {
      type: String,
      default: 'Admin'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    recipientsCount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'failed'],
      default: 'sent'
    },
    brevoMessageId: {
      type: String,
      default: ''
    },
    errorDetails: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

const NewsletterCampaign =
  mongoose.models.NewsletterCampaign ||
  mongoose.model('NewsletterCampaign', newsletterCampaignSchema);

module.exports = NewsletterCampaign;

