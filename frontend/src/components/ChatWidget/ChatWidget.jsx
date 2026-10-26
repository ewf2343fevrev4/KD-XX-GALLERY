import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { 
  MessageSquare, 
  Send, 
  Maximize2, 
  Minimize2, 
  ChevronDown, 
  Search, 
  CreditCard, 
  Package, 
  Sparkles,
  Check,
  CheckCheck,
  Loader2
} from 'lucide-react';
import './ChatWidget.css';

const API_BASE_URL = 'http://localhost:5000';

const SUGGESTED_QUESTIONS = [
  {
    id: 'order',
    icon: Search,
    text: 'WHERE IS MY ORDER?',
    prompt: 'Tôi muốn kiểm tra tình trạng đơn hàng của mình.'
  },
  {
    id: 'size',
    icon: CreditCard,
    text: 'SIZE AND FIT GUIDANCE',
    prompt: 'Tôi cần tư vấn bảng kích cỡ và form dáng chuẩn cho sản phẩm.'
  },
  {
    id: 'return',
    icon: Package,
    text: 'HELP ME WITH A RETURN',
    prompt: 'Chính sách đổi trả hàng và bảo hành của KD-XX như thế nào?'
  },
  {
    id: 'style',
    icon: Sparkles,
    text: 'KD-XX STYLE RECOMMENDATIONS',
    prompt: 'Tôi muốn được gợi ý phối đồ theo phong cách luxury streetwear KD-XX.'
  }
];

export default function ChatWidget() {
  const location = useLocation();
  const { user, token } = useAuth();
  const { isOpen: isCartOpen } = useCart();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Hide on admin routes
  const isAdminRoute = location.pathname.startsWith('/admin');

  // 1. Get or create persistent guest ID
  const getGuestId = () => {
    let guestId = localStorage.getItem('kdxx_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem('kdxx_guest_id', guestId);
    }
    return guestId;
  };

  // 2. Initialize Socket.IO connection
  useEffect(() => {
    if (isAdminRoute) return;

    const socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // If conversation already loaded, join its room
      if (conversation?._id) {
        socket.emit('join_conversation', conversation._id);
      }
    });

    socket.on('new_message', ({ message, conversationId }) => {
      setMessages((prev) => {
        // Prevent duplicate if already added with real _id
        if (prev.some((m) => m._id === message._id)) return prev;

        // If there's an optimistic temp message matching text and senderRole, replace it
        const tempIdx = prev.findIndex(
          (m) =>
            typeof m._id === 'string' &&
            m._id.startsWith('temp_') &&
            m.senderRole === message.senderRole &&
            m.text === message.text
        );

        if (tempIdx !== -1) {
          const updated = [...prev];
          updated[tempIdx] = message;
          return updated;
        }

        return [...prev, message];
      });

      // Update unread count if chat is closed and message is from admin
      if (message.senderRole === 'admin') {
        if (!isOpen) {
          setUnreadCount((c) => c + 1);
        } else {
          // If open, mark as read on server
          markAsRead(conversationId);
        }
      }
    });

    socket.on('user_typing', ({ role, isTyping: typingStatus }) => {
      if (role === 'admin') {
        setAdminTyping(typingStatus);
      }
    });

    socket.on('messages_read', ({ readBy }) => {
      if (readBy === 'admin') {
        setMessages((prev) =>
          prev.map((m) => (m.senderRole === 'customer' ? { ...m, isRead: true } : m))
        );
      }
    });

    return () => {
      if (conversation?._id) {
        socket.emit('leave_conversation', conversation._id);
      }
      socket.disconnect();
    };
  }, [isAdminRoute, conversation?._id, isOpen]);

  // 3. Load or initialize conversation
  const loadConversation = async () => {
    try {
      setLoading(true);
      const guestId = getGuestId();
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/api/chat/conversation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          guestId,
          name: user?.name || undefined,
          email: user?.email || undefined
        })
      });

      const data = await res.json();
      if (data.success && data.conversation) {
        setConversation(data.conversation);
        setUnreadCount(data.conversation.unreadCustomerCount || 0);

        // Join socket room
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('join_conversation', data.conversation._id);
        }

        // Fetch messages for this conversation
        await fetchMessages(data.conversation._id);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoading(false);
    }
  };

  // 4. Fetch messages history
  const fetchMessages = async (convId) => {
    try {
      const guestId = getGuestId();
      const headers = {
        'x-guest-id': guestId
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/api/chat/conversation/${convId}/messages`, {
        headers
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  // 5. Mark messages as read
  const markAsRead = async (convId) => {
    try {
      const guestId = getGuestId();
      const headers = {
        'Content-Type': 'application/json',
        'x-guest-id': guestId
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      await fetch(`${API_BASE_URL}/api/chat/conversation/${convId}/read`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ guestId })
      });
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark messages as read:', err);
    }
  };

  // Initial load
  useEffect(() => {
    if (!isAdminRoute) {
      loadConversation();
    }
  }, [user, token, isAdminRoute]);

  // When opening widget, clear unread and mark as read
  useEffect(() => {
    if (isOpen && conversation?._id) {
      markAsRead(conversation._id);
      setTimeout(() => {
        scrollToBottom();
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 150);
    }
  }, [isOpen, conversation?._id]);

  // Auto-scroll when messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, adminTyping, isOpen]);

  // Send message
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputValue).trim();
    if (!text || sending) return;

    if (!conversation?._id) {
      await loadConversation();
    }

    const currentConvId = conversation?._id;
    if (!currentConvId) return;

    try {
      setSending(true);
      const guestId = getGuestId();
      const headers = {
        'Content-Type': 'application/json',
        'x-guest-id': guestId,
        'x-socket-id': socketRef.current?.id || ''
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Optimistic message placeholder
      const tempId = 'temp_' + Date.now();
      const tempMsg = {
        _id: tempId,
        conversationId: currentConvId,
        senderRole: 'customer',
        senderName: user?.name || 'Khách hàng',
        text,
        createdAt: new Date().toISOString(),
        isRead: false
      };
      setMessages((prev) => [...prev, tempMsg]);
      setInputValue('');

      // Emit stop typing
      if (socketRef.current) {
        socketRef.current.emit('typing', {
          conversationId: currentConvId,
          role: 'customer',
          isTyping: false
        });
      }

      const res = await fetch(`${API_BASE_URL}/api/chat/conversation/${currentConvId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, guestId })
      });

      const data = await res.json();
      if (data.success && data.message) {
        // If socket already added or replaced the message, remove leftover temp
        setMessages((prev) => {
          const alreadyHas = prev.some((m) => m._id === data.message._id);
          if (alreadyHas) {
            return prev.filter((m) => m._id !== tempId);
          }
          return prev.map((m) => (m._id === tempId ? data.message : m));
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  };

  // Typing indicator trigger
  const handleInputChange = (e) => {
    setInputValue(e.target.value);

    if (conversation?._id && socketRef.current) {
      if (!isTyping) {
        setIsTyping(true);
        socketRef.current.emit('typing', {
          conversationId: conversation._id,
          role: 'customer',
          isTyping: true
        });
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        if (socketRef.current && conversation?._id) {
          socketRef.current.emit('typing', {
            conversationId: conversation._id,
            role: 'customer',
            isTyping: false
          });
        }
      }, 1500);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  if (isAdminRoute) return null;

  return (
    <div 
      className={`kdxx-chat-widget-wrapper ${isCartOpen ? 'cart-is-open' : ''}`}
      style={isCartOpen ? { opacity: 0, pointerEvents: 'none', visibility: 'hidden', transition: 'opacity 0.2s ease, visibility 0.2s ease' } : { transition: 'opacity 0.2s ease, visibility 0.2s ease' }}
    >
      {/* 1. FLOATING LAUNCHER BUTTON */}
      {!isOpen && (
        <button
          className="kdxx-chat-launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Open Customer Support Chat"
        >
          <div className="kdxx-chat-launcher-icon">
            <MessageSquare size={24} color="#ffffff" strokeWidth={2} />
          </div>
          {unreadCount > 0 && (
            <span className="kdxx-chat-unread-badge">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* 2. CHAT POPUP WINDOW */}
      {isOpen && (
        <div className={`kdxx-chat-window ${isExpanded ? 'is-expanded' : ''}`}>
          {/* Top Control Bar */}
          <div className="kdxx-chat-header-bar">
            <div className="kdxx-chat-status">
              <span className="kdxx-status-dot"></span>
              <span className="kdxx-status-text">KD-XX Concierge Active</span>
            </div>

            <div className="kdxx-chat-controls">
              <button
                className="kdxx-control-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Thu nhỏ' : 'Phóng to'}
                aria-label="Expand or contract chat"
              >
                {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                className="kdxx-control-btn"
                onClick={() => setIsOpen(false)}
                title="Đóng chat"
                aria-label="Close chat"
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>

          {/* Chat Body */}
          <div className="kdxx-chat-body">
            {/* AMIRI / KD-XX Monogram Hero (visible when conversation is empty) */}
            {messages.length === 0 && (
              <>
                <div className="kdxx-chat-hero">
                  <div className="kdxx-monogram-circle">
                    <span className="kdxx-monogram-text">KD</span>
                  </div>
                  <h3 className="kdxx-hero-title">I'M KD-XX SUPPORT, HOW CAN I HELP?</h3>
                  <p className="kdxx-hero-subtitle">EVERY PIECE HAS A STORY.</p>
                </div>

                {/* Quick Suggestion Prompts */}
                <div className="kdxx-prompts-grid">
                  {SUGGESTED_QUESTIONS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        className="kdxx-prompt-btn"
                        onClick={() => handleSendMessage(item.prompt)}
                      >
                        <Icon size={14} className="kdxx-prompt-icon" />
                        <span className="kdxx-prompt-text">{item.text}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Messages History */}
            <div className="kdxx-messages-list">
              {loading && messages.length === 0 ? (
                <div className="kdxx-chat-loading">
                  <Loader2 size={24} className="kdxx-spin" />
                  <span>Đang kết nối trung tâm hỗ trợ...</span>
                </div>
              ) : null}

              {messages.map((msg, index) => {
                const isCustomer = msg.senderRole === 'customer';
                return (
                  <div
                    key={msg._id || index}
                    className={`kdxx-message-row ${isCustomer ? 'is-customer' : 'is-admin'}`}
                  >
                    {!isCustomer && (
                      <div className="kdxx-admin-avatar">
                        <span>KD</span>
                      </div>
                    )}
                    <div className="kdxx-message-content">
                      {!isCustomer && (
                        <span className="kdxx-message-sender-name">
                          {msg.senderName || 'KD-XX Concierge'}
                        </span>
                      )}
                      <div className="kdxx-message-bubble">
                        <p className="kdxx-message-text">{msg.text}</p>
                      </div>
                      <div className="kdxx-message-meta">
                        <span className="kdxx-message-time">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        {isCustomer && (
                          <span className="kdxx-read-status">
                            {msg.isRead ? (
                              <CheckCheck size={12} color="#10b981" />
                            ) : (
                              <Check size={12} color="#9ca3af" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Admin Typing Indicator */}
              {adminTyping && (
                <div className="kdxx-message-row is-admin">
                  <div className="kdxx-admin-avatar">
                    <span>KD</span>
                  </div>
                  <div className="kdxx-message-content">
                    <div className="kdxx-message-bubble kdxx-typing-bubble">
                      <span className="kdxx-typing-dot"></span>
                      <span className="kdxx-typing-dot"></span>
                      <span className="kdxx-typing-dot"></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Bottom Message Input */}
          <div className="kdxx-chat-footer">
            <div className="kdxx-input-container">
              <input
                ref={inputRef}
                type="text"
                className="kdxx-chat-input"
                placeholder="Message KD-XX SUPPORT..."
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
              <button
                className="kdxx-send-btn"
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || sending}
                aria-label="Send Message"
              >
                {sending ? (
                  <Loader2 size={16} className="kdxx-spin" color="#ffffff" />
                ) : (
                  <Send size={15} color="#ffffff" />
                )}
              </button>
            </div>

            <p className="kdxx-chat-disclaimer">
              Chat sessions may be monitored and recorded for quality assurance. By using this chat, you agree to KD-XX's Privacy Policy & Terms.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

