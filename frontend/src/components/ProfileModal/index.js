import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { updateUserProfile } from "../../services/api";
import KDAvatar from "./KDAvatar";
import "./ProfileModal.css";

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, token, setUser, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("personal"); // 'personal' | 'address' | 'security'
  const [saveLoading, setSaveLoading] = useState(false);
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: string }

  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    address: user?.address || "",
    city: user?.city || "",
    postalCode: user?.postalCode || "",
    country: user?.country || "Vietnam",
    birthDate: user?.birthDate || "",
    gender: user?.gender || "",
  });

  // Sync formData whenever user updates
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        address: user.address || "",
        city: user.city || "",
        postalCode: user.postalCode || "",
        country: user.country || "Vietnam",
        birthDate: user.birthDate || "",
        gender: user.gender || "",
      });
    }
  }, [user]);

  // Clear notification after 4s
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setSaveLoading(true);
    setNotification(null);
    try {
      const result = await updateUserProfile(token, formData);
      if (result.success && result.data?.user) {
        const updatedUser = result.data.user;
        localStorage.setItem("user", JSON.stringify(updatedUser));
        setUser(updatedUser);
        setIsEditing(false);
        setNotification({
          type: "success",
          message: "Thông tin hồ sơ đã được cập nhật thành công!",
        });
      } else {
        setNotification({
          type: "error",
          message: result.error || "Không thể cập nhật thông tin lúc này.",
        });
      }
    } catch (error) {
      console.error("Save error:", error);
      setNotification({
        type: "error",
        message: "Lỗi kết nối máy chủ khi lưu thông tin.",
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        address: user.address || "",
        city: user.city || "",
        postalCode: user.postalCode || "",
        country: user.country || "Vietnam",
        birthDate: user.birthDate || "",
        gender: user.gender || "",
      });
    }
    setIsEditing(false);
    setNotification(null);
  };

  const handleLogoutClick = () => {
    logout();
    onClose();
  };

  if (!isOpen) return null;

  // Determine avatar & provider status
  const hasSocialAvatar =
    user?.avatar &&
    !user.avatar.includes("placeholder") &&
    user.avatar.trim() !== "";
  const provider = user?.authProvider || "local";
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("vi-VN", {
        month: "long",
        year: "numeric",
      })
    : "Thành viên độc quyền";

  return ReactDOM.createPortal(
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Header */}
        <div className="profile-modal-header">
          <div className="profile-brand-tag">
            <span className="brand-dot" />
            <span>KD-XX VIP CLIENT IDENTITY</span>
          </div>
          <button className="profile-close-btn" onClick={onClose} aria-label="Close profile">
            ✕
          </button>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className={`profile-toast profile-toast--${notification.type}`}>
            {notification.message}
          </div>
        )}

        {/* ── Luxury Identity Banner (Subtle Tint & Clean Light Contrast) ── */}
        <div className="profile-identity-card">
          <div className="profile-avatar-container">
            {hasSocialAvatar ? (
              <img
                src={user.avatar}
                alt={user.name || "User Avatar"}
                className="profile-social-avatar"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => {
                  console.warn("Avatar image failed to load, falling back to KD avatar:", user.avatar);
                  e.target.style.display = "none";
                  const fallback = document.getElementById("profile-kd-avatar-fallback");
                  if (fallback) fallback.style.display = "block";
                }}
              />
            ) : null}

            {/* Default Avatar */}
            <div
              id="profile-kd-avatar-fallback"
              className="profile-kd-avatar-wrapper"
              style={{ display: hasSocialAvatar ? "none" : "block" }}
            >
              <KDAvatar size={92} />
            </div>

            {/* Provider Mini Badge overlay */}
            {provider === "google" && (
              <div className="provider-badge google-badge" title="Tài khoản Google đã xác thực">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
              </div>
            )}
            {provider === "facebook" && (
              <div className="provider-badge facebook-badge" title="Tài khoản Facebook đã xác thực">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
            )}
            {provider === "local" && (
              <div className="provider-badge kd-badge" title="Tài khoản KD-XX Signature">
                KD
              </div>
            )}
          </div>

          <div className="profile-identity-info">
            <div className="profile-identity-name-row">
              <h3>{user?.name || "KD-XX Client"}</h3>
              <span className={`role-pill role-pill--${user?.role || "user"}`}>
                {user?.role === "admin" ? "MASTER ADMIN" : "BLACK TIER VIP"}
              </span>
            </div>
            <p className="profile-identity-email">{user?.email || "Chưa cập nhật email"}</p>

            <div className="profile-identity-badges">
              <span className="info-badge">
                {provider === "google"
                  ? "Google Verified"
                  : provider === "facebook"
                  ? "Facebook Verified"
                  : "KD-XX Signature"}
              </span>
              <span className="info-badge date-badge">
                Tham gia: {memberSince}
              </span>
            </div>
          </div>
        </div>

        {/* ── Quick Stats Grid ── */}
        <div className="profile-stats-grid">
          <div className="stat-card">
            <span className="stat-label">Hạng thành viên</span>
            <span className="stat-value highlight-gold">KD-XX Signature</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Bảo mật tài khoản</span>
            <span className="stat-value highlight-green">
              {provider !== "local" ? "OAuth 2.0 Active" : "Password Protected"}
            </span>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="profile-tabs">
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === "personal" ? "active" : ""}`}
            onClick={() => setActiveTab("personal")}
          >
            Thông tin cá nhân
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === "address" ? "active" : ""}`}
            onClick={() => setActiveTab("address")}
          >
            Địa chỉ giao hàng
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === "security" ? "active" : ""}`}
            onClick={() => setActiveTab("security")}
          >
            Bảo mật & Tài khoản
          </button>
        </div>

        {/* ── Tab Content Form ── */}
        <div className="profile-body">
          {activeTab === "personal" && (
            <div className="profile-section-panel">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Họ và tên</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="Nhập họ và tên đầy đủ"
                    className={isEditing ? "is-editing" : ""}
                  />
                </div>

                <div className="form-group full-width">
                  <label>
                    Email
                    {provider !== "local" && (
                      <span className="input-tag-verified">Đã xác thực qua {provider.toUpperCase()}</span>
                    )}
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!isEditing || provider !== "local"}
                    placeholder="example@amiri.com"
                    className={isEditing && provider === "local" ? "is-editing" : ""}
                  />
                  {provider !== "local" && (
                    <small className="field-hint">
                      Email được đồng bộ tự động từ tài khoản {provider === 'google' ? 'Google' : 'Facebook'}.
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label>Số điện thoại</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="+84 9xx xxx xxx"
                    className={isEditing ? "is-editing" : ""}
                  />
                </div>

                <div className="form-group">
                  <label>Ngày sinh</label>
                  <input
                    type="date"
                    name="birthDate"
                    value={formData.birthDate ? formData.birthDate.substring(0, 10) : ""}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className={isEditing ? "is-editing" : ""}
                  />
                </div>

                <div className="form-group full-width">
                  <label>Giới tính</label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className={isEditing ? "is-editing" : ""}
                  >
                    <option value="">Chọn giới tính</option>
                    <option value="male">Nam (Male)</option>
                    <option value="female">Nữ (Female)</option>
                    <option value="other">Khác (Other)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "address" && (
            <div className="profile-section-panel">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Địa chỉ đường / số nhà</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="VD: Số 88 Đường Đồng Khởi, Phường Bến Nghé"
                    className={isEditing ? "is-editing" : ""}
                  />
                </div>

                <div className="form-group">
                  <label>Thành phố / Tỉnh</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="VD: TP. Hồ Chí Minh"
                    className={isEditing ? "is-editing" : ""}
                  />
                </div>

                <div className="form-group">
                  <label>Mã bưu chính (Postal Code)</label>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="VD: 700000"
                    className={isEditing ? "is-editing" : ""}
                  />
                </div>

                <div className="form-group full-width">
                  <label>Quốc gia</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="Vietnam"
                    className={isEditing ? "is-editing" : ""}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="profile-section-panel">
              <div className="security-summary-card">
                <div className="security-row">
                  <div>
                    <h4>Phương thức đăng nhập</h4>
                    <p>
                      {provider === "google"
                        ? "Đăng nhập nhanh an toàn qua Google OAuth 2.0"
                        : provider === "facebook"
                        ? "Đăng nhập nhanh an toàn qua Facebook Login"
                        : "Tài khoản bảo vệ bằng mật khẩu mã hóa Bcrypt"}
                    </p>
                  </div>
                  <span className="security-status-badge">
                    {provider === "local" ? "Email & Mật khẩu" : `${provider.toUpperCase()} OAUTH`}
                  </span>
                </div>

                <div className="security-row">
                  <div>
                    <h4>Mã định danh thành viên (Client ID)</h4>
                    <p className="monospace-text">KD-{user?._id ? user._id.slice(-8).toUpperCase() : "CLIENT"}</p>
                  </div>
                  <span className="security-status-badge active-tag">Hoạt động</span>
                </div>

                <div className="security-row">
                  <div>
                    <h4>Bảo mật 2 lớp & Token JWT</h4>
                    <p>Phiên đăng nhập được mã hóa theo chuẩn RFC 7519 bảo vệ giao dịch.</p>
                  </div>
                  <span className="security-status-badge active-tag">Đã bảo vệ</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer Controls ── */}
        <div className="profile-modal-footer">
          <div className="footer-left">
            <button
              type="button"
              className="profile-logout-btn"
              onClick={handleLogoutClick}
              title="Đăng xuất khỏi thiết bị này"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
              </svg>
              Đăng xuất
            </button>
          </div>

          <div className="footer-right">
            {!isEditing ? (
              <button
                type="button"
                className="profile-edit-btn"
                onClick={() => setIsEditing(true)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
                Chỉnh sửa hồ sơ
              </button>
            ) : (
              <div className="editing-button-group">
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={handleCancel}
                  disabled={saveLoading}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="profile-save-btn"
                  onClick={handleSave}
                  disabled={saveLoading}
                >
                  {saveLoading ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProfileModal;