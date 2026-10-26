const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    guestId: {
      type: String,
      default: null,
      index: true
    },
    customerName: {
      type: String,
      trim: true,
      default: 'Khách hàng'
    },
    customerEmail: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open'
    },
    lastMessage: {
      type: String,
      default: ''
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    },
    unreadAdminCount: {
      type: Number,
      default: 0
    },
    unreadCustomerCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

conversationSchema.index({ lastMessageAt: -1 });

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;

