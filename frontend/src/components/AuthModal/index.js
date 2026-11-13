import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/apiConfig';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [socialLoading, setSocialLoading] = useState(null); // 'google' | 'facebook' | null
  const [socialError, setSocialError] = useState('');
  
  const { login, register, loginWithSocial, loading, error, clearError } = useAuth();

  // Listen for popup OAuth postMessage responses
  const handleAuthMessage = useCallback((event) => {
    // Only trust messages matching expected OAuth types
    if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
      const { token, user } = event.data;
      if (token && user) {
        loginWithSocial(token, user);
        setSocialLoading(null);
        setSocialError('');
        onClose();
      }
    } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
      setSocialLoading(null);
      setSocialError(event.data.message || 'Social sign-in failed. Please try again.');
    }
  }, [loginWithSocial, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('message', handleAuthMessage);

    let channel;
    try {
      if (typeof window.BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('kdxx_oauth_channel');
        channel.onmessage = (event) => {
          handleAuthMessage(event);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel error in AuthModal:', e);
    }

    return () => {
      window.removeEventListener('message', handleAuthMessage);
      if (channel) {
        channel.close();
      }
    };
  }, [isOpen, handleAuthMessage]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!isLogin && !formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    clearError();
    setSocialError('');

    if (isLogin) {
      const result = await login(formData.email, formData.password);
      if (result.success) {
        onClose();
        setFormData({ name: '', email: '', password: '', confirmPassword: '' });
      }
    } else {
      const result = await register(formData.name, formData.email, formData.password);
      if (result.success) {
        onClose();
        setFormData({ name: '', email: '', password: '', confirmPassword: '' });
      }
    }
  };

  const handleSocialLogin = (provider) => {
    setSocialError('');
    setSocialLoading(provider);

    const width = 540;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const authUrl = `${API_BASE_URL}/auth/${provider}`;

    const popup = window.open(
      authUrl,
      `${provider}_login`,
      `width=${width},height=${height},left=${left},top=${top},status=0,toolbar=0,menubar=0,location=1`
    );

    // Fallback if popup was blocked by browser
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = authUrl;
    } else {
      // Check if popup was closed prematurely by the user
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          setSocialLoading(null);
        }
      }, 800);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setErrors({});
    clearError();
    setSocialError('');
  };

  if (!isOpen) return null;

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        <div className="auth-modal-header">
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        {/* ── Social Login Buttons ── */}
        <div className="social-auth-container">
          <button
            type="button"
            className="social-auth-btn social-google-btn"
            onClick={() => handleSocialLogin('google')}
            disabled={socialLoading !== null || loading}
            aria-label="Continue with Google"
          >
            <svg className="social-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            <span>{socialLoading === 'google' ? 'Connecting...' : 'Continue with Google'}</span>
          </button>

          <button
            type="button"
            className="social-auth-btn social-facebook-btn"
            onClick={() => handleSocialLogin('facebook')}
            disabled={socialLoading !== null || loading}
            aria-label="Continue with Facebook"
          >
            <svg className="social-icon" viewBox="0 0 24 24" width="20" height="20" fill="#1877F2" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <span>{socialLoading === 'facebook' ? 'Connecting...' : 'Continue with Facebook'}</span>
          </button>
        </div>

        {/* ── Luxury Divider ── */}
        <div className="auth-divider">
          <span>OR</span>
        </div>

        {/* ── Native Email/Password Form ── */}
        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="form-group">
              <input
                type="text"
                name="name"
                placeholder="Full Name"
                value={formData.name}
                onChange={handleInputChange}
                className={errors.name ? 'error' : ''}
              />
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>
          )}

          <div className="form-group">
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleInputChange}
              className={errors.email ? 'error' : ''}
            />
            {errors.email && <span className="error-message">{errors.email}</span>}
          </div>

          <div className="form-group">
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleInputChange}
              className={errors.password ? 'error' : ''}
            />
            {errors.password && <span className="error-message">{errors.password}</span>}
          </div>

          {!isLogin && (
            <div className="form-group">
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className={errors.confirmPassword ? 'error' : ''}
              />
              {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
            </div>
          )}

          {socialError && <div className="auth-error">{socialError}</div>}
          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit-btn" disabled={loading || socialLoading !== null}>
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="auth-switch">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={switchMode} className="switch-btn">
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;