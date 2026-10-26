import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithSocial } = useAuth();
  const [statusMessage, setStatusMessage] = useState('Completing authentication...');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const userParam = params.get('user');
    const error = params.get('error');
    const message = params.get('message');

    let parsedUser = null;
    if (userParam) {
      try {
        parsedUser = JSON.parse(decodeURIComponent(userParam));
      } catch (e) {
        console.error('Error parsing OAuth user data:', e);
      }
    }

    // 1. Broadcast via BroadcastChannel to parent tab (bypasses cross-origin opener blocks)
    try {
      if (typeof window.BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('kdxx_oauth_channel');
        if (token && parsedUser) {
          channel.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token, user: parsedUser });
        } else if (error) {
          channel.postMessage({ type: 'OAUTH_AUTH_ERROR', error, message: message || 'Authentication failed' });
        }
        setTimeout(() => channel.close(), 1000);
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported or error:', e);
    }

    // 2. Direct postMessage to window.opener if available
    const isPopup = (window.opener && window.opener !== window) || window.name.includes('_login');
    if (window.opener && window.opener !== window) {
      try {
        if (token && parsedUser) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token, user: parsedUser }, '*');
        } else if (error) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error, message: message || 'Authentication failed' }, '*');
        }
      } catch (e) {
        console.warn('postMessage to opener failed:', e);
      }
    }

    // 3. Handle popup auto-close
    if (isPopup) {
      setStatusMessage('Authentication successful! Closing window...');
      setTimeout(() => {
        window.close();
      }, 500);
      return;
    }

    // 4. Fallback for full-page navigation / non-popup flow
    if (token && parsedUser) {
      loginWithSocial(token, parsedUser);
      setStatusMessage('Login successful! Redirecting to boutique...');
      setTimeout(() => {
        navigate('/home', { replace: true });
      }, 600);
    } else if (error) {
      setIsError(true);
      setStatusMessage(message || 'Social authentication was not completed.');
      setTimeout(() => {
        navigate('/home', { replace: true, state: { authError: message || error } });
      }, 3000);
    } else {
      setIsError(true);
      setStatusMessage('Invalid authentication callback request.');
      setTimeout(() => {
        navigate('/home', { replace: true });
      }, 1500);
    }
  }, [location, loginWithSocial, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#08060f',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        background: '#14111f',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '36px 40px',
        maxWidth: '440px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
      }}>
        <div style={{
          fontSize: '2rem',
          letterSpacing: '8px',
          fontWeight: 200,
          marginBottom: '20px',
          color: '#ffffff'
        }}>
          KD-XX
        </div>
        
        {!isError && (
          <div style={{
            width: '36px',
            height: '36px',
            border: '3px solid rgba(255, 255, 255, 0.15)',
            borderTopColor: '#ffffff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 20px'
          }} />
        )}

        <p style={{
          color: isError ? '#f87171' : '#d1d5db',
          fontSize: '0.95rem',
          lineHeight: '1.6',
          margin: 0
        }}>
          {statusMessage}
        </p>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default OAuthCallback;
