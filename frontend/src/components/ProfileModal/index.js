import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { updateUserProfile } from "../../services/api";
import "./ProfileModal.css";

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, token, setUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    address: user?.address || "",
    birthDate: user?.birthDate || "",
    gender: user?.gender || "",
  });

  // ✅ Cập nhật formData khi user thay đổi (đổi tài khoản)
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        address: user.address || "",
        birthDate: user.birthDate || "",
        gender: user.gender || "",
      });
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    try {
      const result = await updateUserProfile(token, formData);
      
      console.log('Update result:', result);
      
      if (result.success && result.data) {
        const updatedUser = result.data.user;
        
        // Cập nhật localStorage
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        // ✅ Cập nhật state trong AuthContext (QUAN TRỌNG!)
        setUser(updatedUser);
        
        setIsEditing(false);
        alert("✅ Cập nhật thông tin thành công!");
        
      } else {
        alert(`❌ Lỗi: ${result.error || 'Không thể cập nhật'}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert("❌ Có lỗi xảy ra khi cập nhật");
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
      address: user?.address || "",
      birthDate: user?.birthDate || "",
      gender: user?.gender || "",
    });
    setIsEditing(false);
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="profile-modal-header">
          <h2>Thông tin cá nhân</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Avatar + Name */}
        <div className="profile-modal-avatar">
          <div className="avatar-circle">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 
              1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 
              1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z" />
            </svg>
          </div>
          <h3>{user?.name}</h3>
        </div>

        {/* Form */}
        <div className="profile-form">
          <div className="form-group">
            <label>Họ và tên</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={!isEditing}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={!isEditing}
            />
          </div>

          <div className="form-group">
            <label>Số điện thoại</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              disabled={!isEditing}
              placeholder="Nhập số điện thoại"
            />
          </div>

          <div className="form-group">
            <label>Địa chỉ</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              disabled={!isEditing}
              placeholder="Nhập địa chỉ"
            />
          </div>

          <div className="form-group">
            <label>Ngày sinh</label>
            <input
              type="date"
              name="birthDate"
              value={formData.birthDate}
              onChange={handleInputChange}
              disabled={!isEditing}
            />
          </div>

          <div className="form-group">
            <label>Giới tính</label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              disabled={!isEditing}
            >
              <option value="">Chọn giới tính</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="profile-actions">
          {!isEditing ? (
            <button className="edit-btn" onClick={() => setIsEditing(true)}>
              Chỉnh sửa
            </button>
          ) : (
            <div className="edit-actions">
              <button className="cancel-btn" onClick={handleCancel}>
                Hủy
              </button>
              <button className="save-btn" onClick={handleSave}>
                Lưu thay đổi
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProfileModal;