import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { buildApiUrl, buildAssetUrl } from '../../../config/apiConfig';

export default function PhotoUploader({
  uploadedPhoto,
  onPhotoUploaded,
  onPhotoRemoved,
  token,
  tryOnMode = 'single',
  onSwitchMode = null
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (file) => {
    setUploadError(null);

    // Client-side MIME check
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validMimes.includes(file.type.toLowerCase())) {
      setUploadError('Chỉ hỗ trợ tệp định dạng JPG, JPEG hoặc PNG.');
      return;
    }

    // Client-side size check (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Kích thước ảnh vượt quá dung lượng tối đa cho phép (10 MB).');
      return;
    }

    // Client-side magic bytes validation
    try {
      const slice = await file.slice(0, 4).arrayBuffer();
      const bytes = new Uint8Array(slice);
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

      if (!isJpeg && !isPng) {
        setUploadError('Định dạng tệp không khớp với chữ ký ảnh thực tế (Magic Bytes).');
        return;
      }
    } catch (e) {
      // Continue to server-side authoritative check
    }

    // Prepare upload
    setIsUploading(true);
    const formData = new FormData();
    formData.append('photo', file);

    try {
      const res = await fetch(buildApiUrl('/tryon/upload-photo'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const json = await res.json();
      if (res.ok && json.success) {
        onPhotoUploaded(json.data);
      } else if (res.status === 401) {
        setUploadError('Phiên đăng nhập đã hết hạn. Vui lòng bấm vào biểu tượng tài khoản (góc trên bên phải) để Đăng xuất và Đăng nhập lại.');
      } else {
        setUploadError(json.message || 'Tải ảnh thất bại. Vui lòng thử lại.');
      }
    } catch (err) {
      setUploadError('Lỗi kết nối tới máy chủ tải ảnh.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const analysis = uploadedPhoto?.qualityAnalysis;

  return (
    <div className="vto-panel">
      <div className="vto-panel-header">
        <h3>
          <UploadCloud size={18} className="text-purple-400" />
          <span>Bước 1: Ảnh Toàn Thân Của Bạn</span>
        </h3>
        <span className="vto-step-badge">Max 10MB • Private</span>
      </div>

      {uploadError && (
        <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2">
          <XCircle size={15} className="shrink-0 text-red-400" />
          <span>{uploadError}</span>
        </div>
      )}

      {!uploadedPhoto ? (
        <div
          className={`vto-dropzone ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/jpeg,image/jpg,image/png"
            onChange={handleFileChange}
          />

          {tryOnMode === 'full_outfit' && (
            <div className="mb-2 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/40 text-purple-300 text-[10px] font-semibold tracking-wider uppercase inline-flex items-center gap-1.5 shadow-sm">
              <Sparkles size={11} className="text-purple-400" />
              <span>Full Outfit — Cần Ảnh Đứng Toàn Thân (Đầu Đến Gót Chân)</span>
            </div>
          )}

          <div className="vto-dropzone-icon">
            {isUploading ? (
              <RefreshCw size={26} className="animate-spin text-purple-400" />
            ) : (
              <UploadCloud size={28} />
            )}
          </div>

          <p className="vto-dropzone-title">
            {isUploading ? 'Đang phân tích chất lượng ảnh...' : 'Kéo thả hoặc nhấn để tải ảnh lên'}
          </p>

          <p className="vto-dropzone-desc">
            Chụp hoặc chọn ảnh toàn thân, đứng thẳng, nhìn rõ vai và thân người để AI tạo phom dáng chuẩn nhất.
          </p>

          <span className="vto-dropzone-specs">
            Hỗ trợ JPG, JPEG, PNG • Tối đa 10 MB • Bảo mật riêng tư
          </span>
        </div>
      ) : (
        <>
          {/* Preview Box with Scanline */}
          <div className="vto-preview-box">
            <img
              src={buildAssetUrl(uploadedPhoto.previewUrl)}
              alt="User Try-On Preview"
              className="vto-preview-img"
            />
            <div className="vto-scan-line" />

            <div className="vto-preview-overlay-actions">
              <button
                type="button"
                className="vto-icon-btn"
                title="Thay ảnh khác"
                onClick={() => fileInputRef.current?.click()}
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                className="vto-icon-btn"
                title="Xóa ảnh"
                onClick={onPhotoRemoved}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleFileChange}
            />
          </div>

          {/* Photo Quality Analyzer Details */}
          {analysis && (
            <div className="vto-quality-card">
              <div className="vto-quality-header">
                <div
                  className={`vto-quality-badge ${
                    analysis.status === 'READY'
                      ? 'status-ready'
                      : analysis.status === 'NEEDS_IMPROVEMENT'
                      ? 'status-improvement'
                      : 'status-rejected'
                  }`}
                >
                  {analysis.status === 'READY' && <CheckCircle2 size={13} />}
                  {analysis.status === 'NEEDS_IMPROVEMENT' && <AlertTriangle size={13} />}
                  {analysis.status === 'REJECTED' && <XCircle size={13} />}
                  <span>
                    {analysis.status === 'READY'
                      ? 'Ảnh đạt chuẩn AI'
                      : analysis.status === 'NEEDS_IMPROVEMENT'
                      ? 'Có thể cải thiện'
                      : 'Không đủ điều kiện'}
                  </span>
                </div>

                <div className="vto-score-meter">
                  <span className="text-xs font-bold text-slate-300">
                    {analysis.score}/100
                  </span>
                  <div className="vto-score-bar-bg">
                    <div
                      className="vto-score-bar-fill"
                      style={{
                        width: `${analysis.score}%`,
                        backgroundColor:
                          analysis.score >= 75
                            ? '#10b981'
                            : analysis.score >= 50
                            ? '#f59e0b'
                            : '#ef4444'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Detected issues if any */}
              {analysis.issues && analysis.issues.length > 0 && (
                <ul className="vto-quality-issues">
                  {analysis.issues.map((iss, idx) => (
                    <li key={idx} className="vto-quality-issue-item">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>{iss.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Photography guidelines and tips */}
              {analysis.suggestions && analysis.suggestions.length > 0 && (
                <p className="vto-quality-tips">
                  <span className="font-semibold text-slate-200">Gợi ý từ KD-XX: </span>
                  {analysis.suggestions.slice(0, 2).join(' ')}
                </p>
              )}

              {/* KD-XX Level 1 Pose & Anatomical Integrity Card */}
              {analysis.poseAnalysis && (
                <div
                  data-testid="vto-pose-analysis-widget"
                  className="mt-3.5 p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-purple-400" />
                      <span>Phân Tích Tư Thế & Khung Xương (Pose AI)</span>
                    </span>
                    <span
                      className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded-full ${
                        analysis.poseAnalysis.isFullBodyDetected
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                          : 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {analysis.poseAnalysis.isFullBodyDetected ? 'Toàn Thân (Full Body)' : 'Nửa Người (Half Body)'}
                    </span>
                  </div>

                  {/* 3 Anatomical Zones */}
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-col items-center text-center gap-1">
                      <span className="text-slate-400 font-medium">Đầu & Vai</span>
                      <span
                        className={`font-semibold ${
                          analysis.poseAnalysis.zones?.upper?.status === 'PASSED'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {analysis.poseAnalysis.zones?.upper?.status === 'PASSED' ? '✓ Cân đối' : '⚠️ Cần rõ hơn'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-col items-center text-center gap-1">
                      <span className="text-slate-400 font-medium">Ngực & Thân trên</span>
                      <span
                        className={`font-semibold ${
                          analysis.poseAnalysis.zones?.middle?.status === 'PASSED'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {analysis.poseAnalysis.zones?.middle?.status === 'PASSED' ? '✓ Rõ ràng' : '⚠️ Lệch góc'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-col items-center text-center gap-1">
                      <span className="text-slate-400 font-medium">Chân & Mắt cá</span>
                      <span
                        className={`font-semibold ${
                          analysis.poseAnalysis.zones?.lower?.status === 'PASSED'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {analysis.poseAnalysis.zones?.lower?.status === 'PASSED' ? '✓ Toàn thân' : '❌ Bị cắt cụt'}
                      </span>
                    </div>
                  </div>

                  {/* Full Outfit Warning & Smart Switcher if half-body in full_outfit mode */}
                  {tryOnMode === 'full_outfit' && !analysis.poseAnalysis.isFullBodyDetected && (
                    <div
                      data-testid="vto-half-body-fulloutfit-warning"
                      className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex flex-col gap-2 mt-1"
                    >
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle size={14} className="shrink-0 text-amber-400 mt-0.5" />
                        <span className="leading-tight">
                          Ảnh này thiếu phần chân. Chế độ <strong>Full Outfit</strong> yêu cầu ảnh chụp toàn thân để may đo Quần/Chân váy.
                        </span>
                      </div>

                      {onSwitchMode && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <button
                            type="button"
                            onClick={() => onSwitchMode('single')}
                            className="px-2.5 py-1 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-medium text-[11px] transition shadow-sm"
                          >
                            Chuyển sang Thử 1 Món (1 Credit)
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
                          >
                            Đổi ảnh toàn thân
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
