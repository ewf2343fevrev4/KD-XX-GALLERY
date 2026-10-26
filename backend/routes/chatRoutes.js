const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');

// Helper to optionally resolve user from token without throwing 401
const resolveOptionalUser = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'amiri-store-super-secret-jwt-key-2024-make-it-very-long-and-random');
      if (decoded && decoded.id) {
        return await User.findById(decoded.id).select('-password');
      }
    }
  } catch (err) {
    // token invalid or expired - proceed as guest
  }
  return null;
};

// Middleware: Require Admin
const requireAdmin = async (req, res, next) => {
  const user = await resolveOptionalUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Chỉ Admin mới có quyền truy cập' });
  }
  req.user = user;
  next();
};

// =========================================================================
// 1. GET OR INITIALIZE CONVERSATION FOR CUSTOMER / GUEST
// POST /api/chat/conversation
// =========================================================================
router.post('/conversation', async (req, res) => {
  try {
    const user = await resolveOptionalUser(req);
    const { guestId, name, email } = req.body;

    let conversation = null;

    if (user) {
      // Find latest conversation for authenticated user
      conversation = await Conversation.findOne({ user: user._id }).sort({ updatedAt: -1 });

      if (!conversation) {
        conversation = await Conversation.create({
          user: user._id,
          customerName: user.name || name || 'Khách hàng KD-XX',
          customerEmail: user.email || email || '',
          status: 'open',
          unreadAdminCount: 0,
          unreadCustomerCount: 0
        });
      } else {
        // Sync name and email if missing
        if (!conversation.customerEmail && user.email) {
          conversation.customerEmail = user.email;
          await conversation.save();
        }
      }
    } else {
      // Guest customer
      const targetGuestId = guestId || req.headers['x-guest-id'];
      if (!targetGuestId) {
        return res.status(400).json({ success: false, message: 'Thiếu guestId' });
      }

      conversation = await Conversation.findOne({ guestId: targetGuestId }).sort({ updatedAt: -1 });

      if (!conversation) {
        conversation = await Conversation.create({
          guestId: targetGuestId,
          customerName: name || `Khách #${targetGuestId.slice(-4)}`,
          customerEmail: email || '',
          status: 'open',
          unreadAdminCount: 0,
          unreadCustomerCount: 0
        });
      }
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('❌ Error getting/creating conversation:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 2. GET MESSAGE HISTORY FOR A CONVERSATION
// GET /api/chat/conversation/:id/messages
// =========================================================================
router.get('/conversation/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện' });
    }

    // Access control
    const user = await resolveOptionalUser(req);
    const guestId = req.headers['x-guest-id'] || req.query.guestId;

    const isAdmin = user && user.role === 'admin';
    const isOwnerUser = user && conversation.user && conversation.user.toString() === user._id.toString();
    const isOwnerGuest = guestId && conversation.guestId && conversation.guestId === guestId;

    if (!isAdmin && !isOwnerUser && !isOwnerGuest) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem cuộc trò chuyện này' });
    }

    const messages = await ChatMessage.find({ conversationId }).sort({ createdAt: 1 });

    res.json({
      success: true,
      conversation,
      messages
    });
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 3. SEND A MESSAGE (CUSTOMER OR ADMIN)
// POST /api/chat/conversation/:id/messages
// =========================================================================
router.post('/conversation/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { text, guestId } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện' });
    }

    const user = await resolveOptionalUser(req);
    const callerGuestId = guestId || req.headers['x-guest-id'];

    const isAdmin = user && user.role === 'admin';
    const isOwnerUser = user && conversation.user && conversation.user.toString() === user._id.toString();
    const isOwnerGuest = callerGuestId && conversation.guestId && conversation.guestId === callerGuestId;

    if (!isAdmin && !isOwnerUser && !isOwnerGuest) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền gửi tin nhắn vào cuộc trò chuyện này' });
    }

    const senderRole = isAdmin ? 'admin' : 'customer';
    const senderName = isAdmin 
      ? (user.name || 'KD-XX Concierge')
      : (user ? user.name : (conversation.customerName || 'Khách hàng'));
    const senderId = isAdmin ? user._id.toString() : (user ? user._id.toString() : conversation.guestId);

    const message = await ChatMessage.create({
      conversationId: conversation._id,
      senderRole,
      senderId,
      senderName,
      text: text.trim(),
      isRead: false
    });

    // Update conversation metadata
    conversation.lastMessage = text.trim();
    conversation.lastMessageAt = new Date();
    if (isAdmin) {
      conversation.unreadCustomerCount = (conversation.unreadCustomerCount || 0) + 1;
    } else {
      conversation.unreadAdminCount = (conversation.unreadAdminCount || 0) + 1;
      // Reopen if closed when customer writes back
      if (conversation.status === 'closed') {
        conversation.status = 'open';
      }
    }
    await conversation.save();

    // Emit Socket.IO event if io is configured
    const io = req.app.get('io');
    if (io) {
      const senderSocketId = req.headers['x-socket-id'];
      if (senderSocketId && io.sockets.sockets.get(senderSocketId)) {
        // Broadcast to other sockets in this conversation room
        io.sockets.sockets.get(senderSocketId).to(`conversation_${conversation._id}`).emit('new_message', {
          message,
          conversationId: conversation._id
        });
      } else {
        // Fallback broadcast
        io.to(`conversation_${conversation._id}`).emit('new_message', {
          message,
          conversationId: conversation._id
        });
      }

      // Broadcast to admin dashboard room
      io.to('admin_inbox').emit('admin_inbox_update', {
        conversationId: conversation._id,
        conversation,
        lastMessage: message
      });
    }

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 4. MARK CONVERSATION MESSAGES AS READ
// PATCH /api/chat/conversation/:id/read
// =========================================================================
router.patch('/conversation/:id/read', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện' });
    }

    const user = await resolveOptionalUser(req);
    const guestId = req.headers['x-guest-id'] || (req.body && req.body.guestId);

    const isAdmin = user && user.role === 'admin';

    if (isAdmin) {
      conversation.unreadAdminCount = 0;
      await conversation.save();
      await ChatMessage.updateMany(
        { conversationId, senderRole: 'customer', isRead: false },
        { isRead: true }
      );
    } else {
      conversation.unreadCustomerCount = 0;
      await conversation.save();
      await ChatMessage.updateMany(
        { conversationId, senderRole: 'admin', isRead: false },
        { isRead: true }
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${conversationId}`).emit('messages_read', {
        conversationId,
        readBy: isAdmin ? 'admin' : 'customer'
      });
      io.to('admin_inbox').emit('admin_inbox_read', {
        conversationId
      });
    }

    res.json({ success: true, conversation });
  } catch (error) {
    console.error('❌ Error marking read:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 5. ADMIN: LIST ALL CONVERSATIONS
// GET /api/chat/admin/conversations
// =========================================================================
router.get('/admin/conversations', requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { customerName: searchRegex },
        { customerEmail: searchRegex },
        { lastMessage: searchRegex }
      ];
    }

    const conversations = await Conversation.find(query)
      .populate('user', 'name email phone avatar')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    // Total unread messages for admin across all conversations
    const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadAdminCount || 0), 0);

    res.json({
      success: true,
      count: conversations.length,
      totalUnread,
      data: conversations
    });
  } catch (error) {
    console.error('❌ Error fetching admin conversations:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 6. ADMIN: UPDATE CONVERSATION STATUS (OPEN / CLOSED)
// PATCH /api/chat/admin/conversations/:id/status
// =========================================================================
router.patch('/admin/conversations/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện' });
    }

    conversation.status = status;
    await conversation.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${conversation._id}`).emit('status_changed', {
        conversationId: conversation._id,
        status
      });
      io.to('admin_inbox').emit('admin_inbox_update', {
        conversationId: conversation._id,
        conversation
      });
    }

    res.json({ success: true, conversation });
  } catch (error) {
    console.error('❌ Error updating status:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

module.exports = router;

