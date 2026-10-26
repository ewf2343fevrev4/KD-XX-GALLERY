import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  MessageSquare, 
  Search, 
  Send, 
  Check, 
  CheckCheck, 
  RefreshCw, 
  CheckCircle2, 
  Archive,
  Loader2,
  Sparkles,
  Inbox
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000';

const QUICK_REPLIES = [
  'Dạ chào bạn, KD-XX Concierge có thể hỗ trợ gì cho bạn hôm nay ạ?',
  'Dạ đơn hàng của bạn đang được kiểm tra và sẽ được chuyển đi sớm nhất.',
  'Bạn có thể gửi mã đơn hàng hoặc số điện thoại để shop kiểm tra ngay nhé!',
  'Dạ sản phẩm hỗ trợ đổi size miễn phí trong vòng 7 ngày kể từ khi nhận hàng ạ.',
  'Cảm ơn bạn đã tin tưởng và đồng hành cùng KD-XX — MADE TRẦN ĐỨC MINH!'
];

export default function AdminChatInbox({ onUnreadChange }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const activeConvIdRef = useRef(null);

  useEffect(() => {
    activeConvIdRef.current = selectedConversation?._id || null;
  }, [selectedConversation]);

  const token = localStorage.getItem('token');

  // 1. Fetch conversations list
  const fetchConversations = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);
      if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());

      const res = await fetch(`${API_BASE_URL}/api/chat/admin/conversations?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setConversations(data.data);
        if (onUnreadChange) {
          onUnreadChange(data.totalUnread || 0);
        }

        // If there's an active conversation, update its object in state
        if (activeConvIdRef.current) {
          const updatedActive = data.data.find(c => c._id === activeConvIdRef.current);
          if (updatedActive) {
            setSelectedConversation(updatedActive);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching admin conversations:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // 2. Fetch messages for active conversation
  const fetchMessages = async (convId) => {
    try {
      setLoadingMessages(true);
      const res = await fetch(`${API_BASE_URL}/api/chat/conversation/${convId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // 3. Mark active conversation as read
  const markAsRead = async (convId) => {
    try {
      await fetch(`${API_BASE_URL}/api/chat/conversation/${convId}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      setConversations(prev =>
        prev.map(c => c._id === convId ? { ...c, unreadAdminCount: 0 } : c)
      );
      if (selectedConversation?._id === convId) {
        setSelectedConversation(prev => prev ? { ...prev, unreadAdminCount: 0 } : prev);
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  // 4. Initialize Socket.IO with deduplication
  useEffect(() => {
    const socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('admin_join');
      if (activeConvIdRef.current) {
        socket.emit('join_conversation', activeConvIdRef.current);
      }
    });

    // Real-time inbox update (new messages anywhere)
    socket.on('admin_inbox_update', ({ conversationId, conversation, lastMessage }) => {
      setConversations(prev => {
        const index = prev.findIndex(c => c._id === conversationId);
        if (index > -1) {
          const updatedList = [...prev];
          updatedList[index] = {
            ...updatedList[index],
            ...conversation,
            lastMessage: lastMessage?.text || conversation.lastMessage,
            lastMessageAt: lastMessage?.createdAt || new Date()
          };
          const [item] = updatedList.splice(index, 1);
          return [item, ...updatedList];
        } else {
          return [conversation, ...prev];
        }
      });

      setTimeout(() => fetchConversations(false), 500);
    });

    // Real-time new message for active room with deduplication
    socket.on('new_message', ({ message, conversationId }) => {
      if (activeConvIdRef.current === conversationId) {
        setMessages(prev => {
          if (prev.some(m => m._id === message._id)) return prev;

          // If there is an optimistic temp message with same text and senderRole, replace it
          const tempIdx = prev.findIndex(
            m => typeof m._id === 'string' &&
                 m._id.startsWith('temp_') &&
                 m.senderRole === message.senderRole &&
                 m.text === message.text
          );

          if (tempIdx !== -1) {
            const copy = [...prev];
            copy[tempIdx] = message;
            return copy;
          }

          return [...prev, message];
        });

        if (message.senderRole === 'customer') {
          markAsRead(conversationId);
        }
      }
    });

    socket.on('user_typing', ({ role, isTyping }) => {
      if (role === 'customer') {
        setCustomerTyping(isTyping);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // When filters or search change
  useEffect(() => {
    fetchConversations(true);
  }, [statusFilter, searchQuery]);

  // When selectedConversation changes
  const handleSelectConversation = (conv) => {
    if (socketRef.current && selectedConversation?._id) {
      socketRef.current.emit('leave_conversation', selectedConversation._id);
    }

    setSelectedConversation(conv);
    fetchMessages(conv._id);
    markAsRead(conv._id);

    if (socketRef.current) {
      socketRef.current.emit('join_conversation', conv._id);
    }
  };

  // Auto-scroll messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, customerTyping]);

  // Send reply with deduplication
  const handleSendReply = async (textToSend) => {
    const text = (textToSend || replyText).trim();
    if (!text || !selectedConversation || sending) return;

    try {
      setSending(true);

      const tempId = 'temp_' + Date.now();
      const tempMsg = {
        _id: tempId,
        conversationId: selectedConversation._id,
        senderRole: 'admin',
        senderName: 'KD-XX Support',
        text,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      setMessages(prev => [...prev, tempMsg]);
      setReplyText('');

      const res = await fetch(`${API_BASE_URL}/api/chat/conversation/${selectedConversation._id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-socket-id': socketRef.current?.id || ''
        },
        body: JSON.stringify({ text })
      });

      const data = await res.json();
      if (data.success && data.message) {
        setMessages(prev => {
          const hasReal = prev.some(m => m._id === data.message._id);
          if (hasReal) {
            return prev.filter(m => m._id !== tempId);
          }
          return prev.map(m => m._id === tempId ? data.message : m);
        });
      }
    } catch (err) {
      console.error('Error sending reply:', err);
      alert('Không thể gửi tin nhắn. Vui lòng thử lại!');
    } finally {
      setSending(false);
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.focus();
      }, 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  // Toggle conversation status (open / closed)
  const handleToggleStatus = async () => {
    if (!selectedConversation) return;
    const newStatus = selectedConversation.status === 'open' ? 'closed' : 'open';

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/admin/conversations/${selectedConversation._id}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      if (data.success && data.conversation) {
        setSelectedConversation(data.conversation);
        setConversations(prev =>
          prev.map(c => c._id === data.conversation._id ? { ...c, status: newStatus } : c)
        );
      }
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const formatTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="w-full max-w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
      <div className="flex h-[720px] w-full max-w-full overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT PANE: CONVERSATION LIST (FIXED WIDTH, NO SHRINKING) */}
        {/* ========================================================================= */}
        <div className="w-80 md:w-96 flex-shrink-0 flex flex-col bg-white border-r border-gray-200 h-full">
          {/* Header & Search */}
          <div className="p-4 border-b border-gray-100 bg-white flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  KD
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 tracking-wider uppercase">TIN NHẮN HỖ TRỢ</h2>
                  <p className="text-[11px] text-gray-400">Trực tuyến 24/7</p>
                </div>
              </div>
              <button
                onClick={() => fetchConversations(true)}
                className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition"
                title="Làm mới danh sách"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm khách hàng, nội dung..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 rounded-lg border border-gray-200 focus:bg-white focus:border-black focus:outline-none transition"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`flex-1 py-1.5 text-center font-semibold rounded-md transition ${
                  statusFilter === 'all'
                    ? 'bg-white text-black shadow-xs'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setStatusFilter('open')}
                className={`flex-1 py-1.5 text-center font-semibold rounded-md transition ${
                  statusFilter === 'open'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                Đang mở
              </button>
              <button
                onClick={() => setStatusFilter('closed')}
                className={`flex-1 py-1.5 text-center font-semibold rounded-md transition ${
                  statusFilter === 'closed'
                    ? 'bg-white text-gray-800 shadow-xs'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                Đã xử lý
              </button>
            </div>
          </div>

          {/* Conversations List Scrollable */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading ? (
              <div className="p-10 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-black" />
                <span>Đang tải danh sách...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
                <Inbox className="w-8 h-8 text-gray-300" />
                <span>Không có cuộc hội thoại nào</span>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = selectedConversation?._id === conv._id;
                const hasUnread = (conv.unreadAdminCount || 0) > 0;

                return (
                  <div
                    key={conv._id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`p-4 cursor-pointer transition flex items-start gap-3 border-l-4 ${
                      isSelected
                        ? 'bg-gray-100/80 border-black'
                        : hasUnread
                        ? 'bg-blue-50/70 hover:bg-blue-50 border-blue-500'
                        : 'bg-white hover:bg-gray-50/80 border-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs">
                      {conv.customerName ? conv.customerName.charAt(0).toUpperCase() : 'C'}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold truncate ${hasUnread ? 'text-black' : 'text-gray-800'}`}>
                          {conv.customerName}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">
                          {formatTime(conv.lastMessageAt || conv.updatedAt)}
                        </span>
                      </div>

                      <p className={`text-xs truncate mb-2 ${hasUnread ? 'text-black font-semibold' : 'text-gray-500'}`}>
                        {conv.lastMessage || 'Bắt đầu cuộc trò chuyện'}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          conv.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {conv.status === 'open' ? '● Đang mở' : 'Đã đóng'}
                        </span>

                        {hasUnread && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                            {conv.unreadAdminCount} tin mới
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANE: ACTIVE CONVERSATION (FLEX-1 MIN-W-0 TO PREVENT OVERFLOW) */}
        {/* ========================================================================= */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#fcfcfd] h-full overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white shadow-xs flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                    {selectedConversation.customerName ? selectedConversation.customerName.charAt(0).toUpperCase() : 'C'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900 truncate">
                        {selectedConversation.customerName}
                      </h3>
                      {selectedConversation.user ? (
                        <span className="text-[10px] bg-black text-white px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                          Thành viên
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                          Khách vãng lai
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {selectedConversation.customerEmail || `Session ID: ${selectedConversation.guestId || selectedConversation._id}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <button
                    onClick={handleToggleStatus}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${
                      selectedConversation.status === 'open'
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {selectedConversation.status === 'open' ? (
                      <>
                        <Archive size={14} />
                        Đóng phiên
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        Mở lại phiên
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Messages History (Scrollable Area) */}
              <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-4 bg-gray-50/70">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-xs gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                    Đang tải tin nhắn...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                    Chưa có tin nhắn nào trong cuộc trò chuyện này.
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isAdmin = msg.senderRole === 'admin';
                    return (
                      <div
                        key={msg._id || index}
                        className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                      >
                        <div className="text-[10px] text-gray-400 mb-1 px-1">
                          {isAdmin ? 'KD-XX Support (Bạn)' : (selectedConversation.customerName || 'Khách hàng')}
                        </div>

                        <div
                          className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                            isAdmin
                              ? 'bg-black text-white rounded-br-xs shadow-md'
                              : 'bg-white text-gray-900 border border-gray-200 rounded-bl-xs shadow-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap m-0">{msg.text}</p>
                        </div>

                        <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1 px-1">
                          <span>{formatTime(msg.createdAt)}</span>
                          {isAdmin && (
                            msg.isRead ? (
                              <CheckCheck size={12} className="text-emerald-500" />
                            ) : (
                              <Check size={12} className="text-gray-400" />
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {customerTyping && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 italic bg-white px-3 py-2 rounded-xl w-fit border border-gray-100 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    Khách hàng đang soạn tin...
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Replies Bar (min-w-0 to avoid flex blowout) */}
              <div className="w-full min-w-0 px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto flex-shrink-0">
                <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1 flex-shrink-0">
                  <Sparkles size={12} className="text-amber-500" />
                  Mẫu:
                </span>
                {QUICK_REPLIES.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendReply(reply)}
                    title={reply}
                    className="text-[11px] bg-gray-100 hover:bg-black hover:text-white text-gray-700 px-3 py-1 rounded-full max-w-[260px] truncate transition flex-shrink-0 font-medium"
                  >
                    {reply}
                  </button>
                ))}
              </div>

              {/* Message Input Box (flex-shrink-0) */}
              <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
                <div className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3 focus-within:border-black focus-within:bg-white transition shadow-xs">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    placeholder="Nhập nội dung phản hồi cho khách hàng... (Enter để gửi, Shift+Enter xuống dòng)"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    className="flex-1 bg-transparent border-none outline-none text-xs text-gray-900 resize-none leading-relaxed"
                  />
                  <button
                    onClick={() => handleSendReply()}
                    disabled={!replyText.trim() || sending}
                    className="px-4 py-2 bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs flex-shrink-0"
                  >
                    {sending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={13} />
                        Gửi
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-gray-50/50">
              <div className="w-16 h-16 rounded-full bg-gray-200/80 flex items-center justify-center mb-4 text-gray-500 shadow-xs">
                <MessageSquare size={32} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1 tracking-wide uppercase">
                TRUNG TÂM PHẢN HỒI KHÁCH HÀNG
              </h3>
              <p className="text-xs text-gray-500 max-w-sm leading-relaxed">
                Vui lòng chọn một cuộc trò chuyện từ danh sách bên trái để xem nội dung và gửi phản hồi cho khách hàng theo thời gian thực.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
