import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Check, QrCode, CheckCircle2 } from 'lucide-react';
import { buildApiUrl } from '../../../config/apiConfig';

export default function HomieModal({ isOpen, onClose, user, onSuccess }) {
  const [showQR, setShowQR] = useState(false);
  const [isActivated, setIsActivated] = useState(false);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setShowQR(false);
      setIsActivated(false);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
  }, [isOpen]);

  // Poll for HOMIE activation while QR is displayed
  useEffect(() => {
    if (isOpen && showQR && !isActivated) {
      const token = localStorage.getItem('token');
      if (!token) return;

      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await fetch(buildApiUrl('/tryon/account'), {
            headers: { Authorization: `Bearer ${token}` }
          });
          const json = await res.json();
          if (res.ok && json.success && (json.data.membershipType === 'homie' || json.data.membershipType === 'admin')) {
            setIsActivated(true);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            if (onSuccess) onSuccess();
            setTimeout(() => {
              onClose();
            }, 3000);
          }
        } catch (e) {
          // ignore network polling hiccups
        }
      }, 3000);

      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [isOpen, showQR, isActivated, onSuccess, onClose]);

  if (!isOpen) return null;

  const paymentCode = `KDXHOMIE${(user?._id || user?.id || 'VIP').slice(-6).toUpperCase()}`;
  const amountVND = 199000;
  const bankAccount = '104888601401';
  const bankName = 'VietinBank';
  const accountName = 'TRAN DUC MINH';
  const transferContent = `SEVQR ${paymentCode}`;
  const qrUrl = `https://vietqr.app/img?acc=${encodeURIComponent(bankAccount)}&bank=${encodeURIComponent(bankName)}&amount=${amountVND}&des=${encodeURIComponent(transferContent)}&template=compact`;

  return (
    <div className="vto-modal-overlay" onClick={onClose}>
      <div className="vto-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="vto-modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300">
            <Sparkles size={24} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
              Gói Thành Viên Đặc Quyền
            </span>
            <h2 className="text-xl font-bold text-white uppercase tracking-wider m-0 font-['Manrope']">
              KD-XX HOMIE MEMBERSHIP
            </h2>
          </div>
        </div>

        {/* Plan Pricing & Features */}
        <div className="p-4 bg-white/5 border border-purple-500/30 rounded-2xl flex flex-col gap-3 font-['Inter']">
          <div className="flex items-baseline justify-between border-b border-white/10 pb-3">
            <div>
              <span className="text-2xl font-black text-white font-['Manrope']">199.000đ</span>
              <span className="text-xs text-slate-400 ml-1">/ tháng</span>
            </div>
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider">
              Gia Hạn Thủ Công
            </span>
          </div>

          <ul className="flex flex-col gap-2.5 text-xs text-slate-200">
            <li className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Check size={11} />
              </div>
              <span><strong>120 lượt thử đồ AI</strong> mỗi tháng (Google Cloud Vertex AI).</span>
            </li>
            <li className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Check size={11} />
              </div>
              <span><strong>Ưu tiên xử lý hàng đầu</strong> (Priority AI Queue, không chờ đợi).</span>
            </li>
            <li className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Check size={11} />
              </div>
              <span><strong>Tích lũy Rollover 1 tháng</strong> cho lượt chưa sử dụng.</span>
            </li>
            <li className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Check size={11} />
              </div>
              <span><strong>10 lượt AI Photo Cleanup</strong> nâng cao chất lượng ảnh mỗi tháng.</span>
            </li>
          </ul>
        </div>

        {/* Success Banner if Activated */}
        {isActivated ? (
          <div className="p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-2xl text-center flex flex-col items-center gap-2 animate-in fade-in zoom-in-95">
            <CheckCircle2 size={36} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider m-0">
              Kích Hoạt Gói HOMIE Thành Công!
            </h3>
            <p className="text-xs text-emerald-200 m-0">
              120 lượt thử đồ AI ưu tiên cao nhất đã được cộng vào tài khoản của bạn.
            </p>
          </div>
        ) : !showQR ? (
          <button
            type="button"
            className="w-full py-3.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            onClick={() => setShowQR(true)}
          >
            <QrCode size={16} />
            <span>Thanh Toán VietQR Qua SePay (199.000đ)</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3 p-4 bg-black/60 border border-white/10 rounded-2xl">
            <div className="bg-white p-2 rounded-xl">
              <img src={qrUrl} alt="SePay VietQR Payment" className="w-48 h-48 object-contain" />
            </div>

            <div className="text-center text-xs text-slate-300">
              <p className="m-0 font-semibold text-white">Ngân hàng: {bankName} — Số TK: {bankAccount}</p>
              <p className="m-0 text-slate-400">Chủ TK: {accountName}</p>
              <p className="mt-1 font-mono text-purple-300 font-bold">Nội dung CK: {transferContent}</p>
            </div>

            <p className="text-[11px] text-slate-400 text-center m-0 max-w-xs">
              Hệ thống SePay tự động kích hoạt gói HOMIE ngay khi nhận được biến động số dư.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
