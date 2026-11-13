import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import { getSepayQrInfo, getOrderPaymentStatus } from '../../services/api';
import { API_ORIGIN } from '../../config/apiConfig';
import './SepayPaymentModal.css';

const SOCKET_SERVER_URL = process.env.REACT_APP_SOCKET_URL || API_ORIGIN;

const SepayPaymentModal = ({ isOpen, onClose, order, onPaymentSuccess }) => {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPaid, setIsPaid] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes countdown

  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  // 1. Load QR payment information
  useEffect(() => {
    if (!isOpen || !order?._id) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setIsPaid(false);
    setTimeLeft(900);

    const loadData = async () => {
      const res = await getSepayQrInfo(order._id);
      if (!isMounted) return;

      if (res.success && res.data) {
        setQrData(res.data);
        if (res.data.isPaid) {
          setIsPaid(true);
        }
      } else {
        setError(res.error || 'Không thể tạo mã thanh toán VietQR');
      }
      setLoading(false);
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, order?._id]);

  // 2. Real-time updates via Socket.IO
  useEffect(() => {
    if (!isOpen || !order?._id || isPaid) return;

    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('order_paid', (data) => {
      const targetId = order._id.toString();
      const targetCode = order.paymentCode || qrData?.paymentCode;

      if (
        (data.orderId && data.orderId.toString() === targetId) ||
        (data.paymentCode && targetCode && data.paymentCode.toUpperCase() === targetCode.toUpperCase())
      ) {
        console.log('🎉 [SePay] Received payment confirmation via Socket.IO!');
        setIsPaid(true);
        if (onPaymentSuccess) {
          onPaymentSuccess(order);
        }
      }
    });

    return () => {
      if (socket) socket.disconnect();
    };
  }, [isOpen, order?._id, order?.paymentCode, qrData?.paymentCode, isPaid, onPaymentSuccess]);

  // 3. Polling fallback every 3 seconds
  useEffect(() => {
    if (!isOpen || !order?._id || isPaid) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await getOrderPaymentStatus(order._id);
        if (res.success && res.data?.isPaid) {
          console.log('🎉 [SePay] Payment confirmed via Polling!');
          setIsPaid(true);
          if (onPaymentSuccess) {
            onPaymentSuccess(order);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, order?._id, isPaid, onPaymentSuccess]);

  // 4. Countdown timer
  useEffect(() => {
    if (!isOpen || isPaid) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isPaid]);

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey('');
    }, 2000);
  };

  const formatMinutes = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="sepay-modal-overlay" onClick={onClose}>
      <div className="sepay-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sepay-modal-header">
          <div className="sepay-header-brand">
            <span className="sepay-badge">VietQR Auto Payment</span>
            <h3>THANH TOÁN CHUYỂN KHOẢN</h3>
            <p>Hệ thống SePay tự động xác nhận đơn hàng trong 5 - 15 giây</p>
          </div>
          <button className="sepay-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="sepay-modal-body">
          {loading ? (
            <div className="sepay-loading-state">
              <div className="sepay-spinner"></div>
              <p>Đang khởi tạo mã VietQR SePay...</p>
            </div>
          ) : error ? (
            <div className="sepay-error-state">
              <div className="sepay-error-icon">⚠️</div>
              <h4>Không thể tải cổng thanh toán</h4>
              <p>{error}</p>
              <button className="sepay-btn-secondary" onClick={onClose}>
                Đóng
              </button>
            </div>
          ) : isPaid ? (
            /* SUCCESS STATE */
            <div className="sepay-success-state">
              <div className="sepay-success-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="sepay-success-title">THANH TOÁN THÀNH CÔNG!</h3>
              <p className="sepay-success-desc">
                Hệ thống ngân hàng đã nhận khoản thanh toán cho đơn hàng <strong>#{order._id?.slice(-6).toUpperCase()}</strong>.
              </p>

              <div className="sepay-success-box">
                <div className="sepay-success-row">
                  <span>Mã thanh toán:</span>
                  <strong>{qrData?.paymentCode || order.paymentCode}</strong>
                </div>
                <div className="sepay-success-row">
                  <span>Số tiền:</span>
                  <strong className="text-emerald">
                    {Number(qrData?.amountVND || 0).toLocaleString('vi-VN')} VND
                  </strong>
                </div>
                <div className="sepay-success-row">
                  <span>Trạng thái:</span>
                  <span className="status-tag-paid">Đã thanh toán (Processing)</span>
                </div>
              </div>

              <button className="sepay-btn-primary" onClick={onClose}>
                HOÀN TẤT & XEM ĐƠN HÀNG
              </button>
            </div>
          ) : (
            /* ACTIVE QR PAYMENT STATE */
            <div className="sepay-content-grid">
              {/* Left Column: VietQR Code */}
              <div className="sepay-qr-column">
                <div className="sepay-qr-card">
                  <div className="sepay-qr-wrapper">
                    <img
                      src={qrData?.qrUrl}
                      alt="VietQR SePay"
                      className="sepay-qr-image"
                    />
                  </div>
                  <div className="sepay-qr-footer">
                    <div className="sepay-timer">
                      <span className="timer-icon">⏳</span>
                      <span>Hết hạn trong: <strong>{formatMinutes(timeLeft)}</strong></span>
                    </div>
                    <p className="sepay-scan-hint">
                      Mở ứng dụng ngân hàng bất kỳ để quét mã VietQR tự động điền số tiền & nội dung
                    </p>
                  </div>
                </div>

                {/* Pulsing listening indicator */}
                <div className="sepay-listening-indicator">
                  <span className="pulse-dot"></span>
                  <span>Đang chờ hệ thống ngân hàng xác nhận tiền về...</span>
                </div>
              </div>

              {/* Right Column: Bank Transfer Details */}
              <div className="sepay-info-column">
                <h4 className="sepay-info-title">HOẶC CHUYỂN KHOẢN THỦ CÔNG</h4>

                <div className="sepay-details-list">
                  {/* Bank Name */}
                  <div className="sepay-detail-item">
                    <div className="detail-label">Ngân hàng thụ hưởng:</div>
                    <div className="detail-value-row">
                      <span className="font-bold">{qrData?.bankName}</span>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => handleCopy(qrData?.bankName, 'bank')}
                      >
                        {copiedKey === 'bank' ? 'Đã sao chép' : 'Sao chép'}
                      </button>
                    </div>
                  </div>

                  {/* Account Number */}
                  <div className="sepay-detail-item">
                    <div className="detail-label">Số tài khoản:</div>
                    <div className="detail-value-row">
                      <span className="font-mono font-bold text-accent">{qrData?.bankAccount}</span>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => handleCopy(qrData?.bankAccount, 'acc')}
                      >
                        {copiedKey === 'acc' ? 'Đã sao chép' : 'Sao chép'}
                      </button>
                    </div>
                  </div>

                  {/* Account Holder */}
                  <div className="sepay-detail-item">
                    <div className="detail-label">Chủ tài khoản:</div>
                    <div className="detail-value-row">
                      <span className="font-bold uppercase">{qrData?.accountName}</span>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => handleCopy(qrData?.accountName, 'name')}
                      >
                        {copiedKey === 'name' ? 'Đã sao chép' : 'Sao chép'}
                      </button>
                    </div>
                  </div>

                  {/* Transfer Amount */}
                  <div className="sepay-detail-item highlight">
                    <div className="detail-label">Số tiền chính xác (VND):</div>
                    <div className="detail-value-row">
                      <span className="font-mono font-extrabold text-amount">
                        {Number(qrData?.amountVND || 0).toLocaleString('vi-VN')} đ
                      </span>
                      <button
                        type="button"
                        className="copy-btn primary"
                        onClick={() => handleCopy(String(qrData?.amountVND), 'amount')}
                      >
                        {copiedKey === 'amount' ? 'Đã sao chép' : 'Sao chép số tiền'}
                      </button>
                    </div>
                    <div className="detail-sub">
                      Tương đương ${Number(qrData?.amountUSD || order.total || 0).toFixed(2)} USD
                    </div>
                  </div>

                  {/* Transfer Content (CRITICAL - VietinBank requires SEVQR prefix) */}
                  <div className="sepay-detail-item critical">
                    <div className="detail-label text-warning">
                      ⚠️ Nội dung chuyển khoản (Bắt buộc):
                    </div>
                    <div className="detail-value-row">
                      <span className="font-mono font-extrabold text-code">
                        {qrData?.transferContent || `SEVQR ${qrData?.paymentCode}`}
                      </span>
                      <button
                        type="button"
                        className="copy-btn highlight"
                        onClick={() => handleCopy(qrData?.transferContent || `SEVQR ${qrData?.paymentCode}`, 'code')}
                      >
                        {copiedKey === 'code' ? 'Đã sao chép' : 'Sao chép mã'}
                      </button>
                    </div>
                    <div className="detail-notice">
                      * Bắt buộc có từ khóa SEVQR ở đầu để hệ thống VietinBank ghi nhận biến động số dư.
                    </div>
                  </div>
                </div>

                <div className="sepay-footer-actions">
                  <button type="button" className="sepay-cancel-btn" onClick={onClose}>
                    Đóng cửa sổ thanh toán
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SepayPaymentModal;

