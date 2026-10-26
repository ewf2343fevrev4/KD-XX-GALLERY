const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    senderRole: {
      type: String,
      enum: ['customer', 'admin'],
      required: true
    },
    senderId: {
      type: String,
      default: ''
    },
    senderName: {
      type: String,
      trim: true,
      default: ''
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

chatMessageSchema.index({ conversationId: 1, createdAt: 1 });

const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;

