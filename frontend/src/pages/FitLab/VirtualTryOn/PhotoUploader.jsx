import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { buildApiUrl, buildAssetUrl } from '../../../config/apiConfig';

export default function PhotoUploader({
  uploadedPhoto,
  onPhotoUploaded,
  onPhotoRemoved,
  token
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
