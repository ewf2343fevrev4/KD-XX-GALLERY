const express = require('express');
const crypto = require('crypto');

/**
 * AMIRI E-Commerce OAuth Routes
 * Handles Google & Facebook OAuth 2.0 authentication flows
 * 
 * @param {import('mongoose').Model} User - Mongoose User model
 * @param {Function} generateToken - JWT token generator function
 */
module.exports = function createAuthRouter(User, generateToken) {
  const router = express.Router();

  // In-memory state store with 10-minute TTL for CSRF mitigation
  const stateStore = new Map();
  const STATE_TTL_MS = 10 * 60 * 1000;

  const generateState = (provider) => {
    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, { provider, createdAt: Date.now() });
    
    // Cleanup expired states
    const now = Date.now();
    for (const [key, value] of stateStore.entries()) {
      if (now - value.createdAt > STATE_TTL_MS) {
        stateStore.delete(key);
      }
    }
    return state;
  };

  const validateState = (state, expectedProvider) => {
    if (!state || !stateStore.has(state)) return false;
    const data = stateStore.get(state);
    stateStore.delete(state); // One-time use
    return data.provider === expectedProvider && (Date.now() - data.createdAt <= STATE_TTL_MS);
  };

  const getFrontendUrl = () => {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  };

  /**
   * Helper: Render postMessage response for popup OAuth flow with fallback to URL redirect
   */
  const renderAuthResult = (res, { success, token, user, error, message }) => {
    const frontendUrl = getFrontendUrl();
    
    if (success) {
      const sanitizedUser = {
        _id: user._id,
        name: user.name,
        email: user.email || '',
        role: user.role || 'user',
        avatar: user.avatar || '',
        authProvider: user.authProvider || 'local',
        phone: user.phone || '',
        address: user.address || '',
        city: user.city || '',
        postalCode: user.postalCode || '',
        country: user.country || 'Vietnam'
      };

      const userJson = JSON.stringify(sanitizedUser);
      const redirectTarget = `${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userJson)}`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Authenticating with KD-XX...</title>
          <style>
            body {
              background: #08060f;
              color: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .loader {
              text-align: center;
            }
            .spinner {
              width: 40px;
              height: 40px;
              border: 3px solid rgba(255,255,255,0.15);
              border-top-color: #ffffff;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 16px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="loader">
            <div class="spinner"></div>
            <p>Authentication successful. Returning to store...</p>
          </div>
          <script>
            (function() {
              var payload = {
                type: 'OAUTH_AUTH_SUCCESS',
                token: ${JSON.stringify(token)},
                user: ${userJson}
              };

              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage(payload, '*');
                  setTimeout(function() { window.close(); }, 300);
                  return;
                } catch (e) {
                  console.error('postMessage error:', e);
                }
              }
              window.location.href = ${JSON.stringify(redirectTarget)};
            })();
          </script>
        </body>
        </html>
      `);
    } else {
      const errCode = error || 'oauth_error';
      const errMsg = message || 'Authentication failed. Please try again.';
      const redirectTarget = `${frontendUrl}/auth/callback?error=${encodeURIComponent(errCode)}&message=${encodeURIComponent(errMsg)}`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Authentication Notice - KD-XX</title>
          <style>
            body {
              background: #08060f;
              color: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              padding: 20px;
              box-sizing: border-box;
            }
            .card {
              background: #14111f;
              border: 1px solid rgba(255,255,255,0.12);
              border-radius: 16px;
              padding: 32px;
              max-width: 480px;
              text-align: center;
              box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            }
            h2 { color: #f87171; margin-top: 0; font-size: 1.4rem; letter-spacing: 1px; }
            p { color: #d1d5db; line-height: 1.6; font-size: 0.95rem; margin-bottom: 24px; }
            button {
              background: #ffffff;
              color: #000000;
              border: none;
              padding: 12px 28px;
              border-radius: 50px;
              font-weight: 600;
              cursor: pointer;
              letter-spacing: 1px;
              text-transform: uppercase;
              font-size: 0.85rem;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Notice</h2>
            <p>${errMsg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            <button onclick="handleClose()">Close Window</button>
          </div>
          <script>
            function handleClose() {
              if (window.opener && window.opener !== window) {
                window.close();
              } else {
                window.location.href = ${JSON.stringify(redirectTarget)};
              }
            }

            if (window.opener && window.opener !== window) {
              try {
                window.opener.postMessage({
                  type: 'OAUTH_AUTH_ERROR',
                  error: ${JSON.stringify(errCode)},
                  message: ${JSON.stringify(errMsg)}
                }, '*');
              } catch (e) {}
            }
          </script>
        </body>
        </html>
      `);
    }
  };

  /**
   * Helper: Check if OAuth provider credentials exist
   */
  const isConfigured = (clientId, clientSecret) => {
    if (!clientId || !clientSecret) return false;
    const cleanId = clientId.trim().toLowerCase();
    const cleanSec = clientSecret.trim().toLowerCase();
    if (cleanId === '' || cleanId.includes('your_') || cleanId.includes('placeholder')) return false;
    if (cleanSec === '' || cleanSec.includes('your_') || cleanSec.includes('placeholder')) return false;
    return true;
  };

  // ==========================================
  // GOOGLE OAUTH 2.0
  // ==========================================

  // Step 1: Initiate Google Login
  router.get('/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!isConfigured(clientId, clientSecret)) {
      return renderAuthResult(res, {
        success: false,
        error: 'CONFIG_MISSING',
        message: 'Google Sign-In has not been configured with live credentials yet. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.'
      });
    }

    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';
    const state = generateState('google');

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', clientId);
    googleAuthUrl.searchParams.set('redirect_uri', callbackUrl);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('state', state);
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'select_account');

    res.redirect(googleAuthUrl.toString());
  });

  // Step 2: Google Callback
  router.get('/google/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return renderAuthResult(res, {
        success: false,
        error: 'PROVIDER_ERROR',
        message: error_description || 'Google sign-in was canceled or encountered an error.'
      });
    }

    if (!code) {
      return renderAuthResult(res, {
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Authorization code was not provided by Google.'
      });
    }

    if (!validateState(state, 'google')) {
      return renderAuthResult(res, {
        success: false,
        error: 'INVALID_STATE',
        message: 'Invalid or expired state parameter. Please try logging in again for security.'
      });
    }

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error('Google token exchange error:', tokenData);
        return renderAuthResult(res, {
          success: false,
          error: 'TOKEN_EXCHANGE_FAILED',
          message: tokenData.error_description || 'Failed to exchange authorization code with Google.'
        });
      }

      // Fetch user profile from Google's verified UserInfo endpoint
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });

      const profile = await profileResponse.json();

      if (!profileResponse.ok || !profile.sub) {
        return renderAuthResult(res, {
          success: false,
          error: 'PROFILE_FETCH_FAILED',
          message: 'Unable to retrieve verified profile from Google.'
        });
      }

      const googleId = profile.sub;
      const email = profile.email ? profile.email.toLowerCase().trim() : null;
      const name = profile.name || profile.given_name || 'Google User';
      const rawAvatar = profile.picture || '';
      // Ensure high-resolution Google avatar (256x256 instead of small 96x96)
      const avatar = rawAvatar ? rawAvatar.replace(/=s\d+(-c)?$/, '=s256-c') : '';

      // Account lookup:
      // 1. Check if user already exists with this googleId
      let user = await User.findOne({ googleId });

      if (user) {
        // Returning Google user: update avatar if changed
        if (avatar && user.avatar !== avatar) {
          user.avatar = avatar;
          await user.save();
        }
      } else {
        // 2. Check if an account already exists with the same email
        if (email) {
          const existingUserWithEmail = await User.findOne({ email });
          if (existingUserWithEmail) {
            // SAFE CONFLICT HANDLING:
            // Do NOT automatically merge accounts based solely on email.
            if (existingUserWithEmail.authProvider === 'local') {
              return renderAuthResult(res, {
                success: false,
                error: 'EMAIL_CONFLICT',
                message: `An account with ${email} is already registered with a password. Please sign in with your email and password.`
              });
            } else if (existingUserWithEmail.authProvider && existingUserWithEmail.authProvider !== 'google') {
              return renderAuthResult(res, {
                success: false,
                error: 'PROVIDER_CONFLICT',
                message: `An account with ${email} is already linked to ${existingUserWithEmail.authProvider}. Please sign in using ${existingUserWithEmail.authProvider}.`
              });
            }
          }
        }

        // 3. Create new user record
        user = await User.create({
          name,
          email: email || undefined,
          googleId,
          authProvider: 'google',
          avatar,
          wishlist: []
        });
      }

      const token = generateToken(user._id);
      return renderAuthResult(res, { success: true, token, user });

    } catch (err) {
      console.error('Google OAuth callback error:', err);
      return renderAuthResult(res, {
        success: false,
        error: 'SERVER_ERROR',
        message: 'Internal server error while processing Google login.'
      });
    }
  });

  // ==========================================
  // FACEBOOK LOGIN
  // ==========================================

  // Step 1: Initiate Facebook Login
  router.get('/facebook', (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!isConfigured(appId, appSecret)) {
      return renderAuthResult(res, {
        success: false,
        error: 'CONFIG_MISSING',
        message: 'Facebook Login has not been configured with live credentials yet. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in backend/.env.'
      });
    }

    const callbackUrl = process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:5000/api/auth/facebook/callback';
    const state = generateState('facebook');

    const fbAuthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    fbAuthUrl.searchParams.set('client_id', appId);
    fbAuthUrl.searchParams.set('redirect_uri', callbackUrl);
    fbAuthUrl.searchParams.set('state', state);
    const fbScope = process.env.FACEBOOK_SCOPE || 'public_profile';
    fbAuthUrl.searchParams.set('scope', fbScope);
    fbAuthUrl.searchParams.set('response_type', 'code');

    res.redirect(fbAuthUrl.toString());
  });

  // Step 2: Facebook Callback
  router.get('/facebook/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return renderAuthResult(res, {
        success: false,
        error: 'PROVIDER_ERROR',
        message: error_description || 'Facebook login was canceled or encountered an error.'
      });
    }

    if (!code) {
      return renderAuthResult(res, {
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Authorization code was not provided by Facebook.'
      });
    }

    if (!validateState(state, 'facebook')) {
      return renderAuthResult(res, {
        success: false,
        error: 'INVALID_STATE',
        message: 'Invalid or expired state parameter. Please try logging in again for security.'
      });
    }

    try {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      const callbackUrl = process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:5000/api/auth/facebook/callback';

      // Exchange code for user access token
      const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', appId);
      tokenUrl.searchParams.set('client_secret', appSecret);
      tokenUrl.searchParams.set('redirect_uri', callbackUrl);
      tokenUrl.searchParams.set('code', code);

      const tokenResponse = await fetch(tokenUrl.toString());
      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error('Facebook token exchange error:', tokenData);
        return renderAuthResult(res, {
          success: false,
          error: 'TOKEN_EXCHANGE_FAILED',
          message: tokenData.error?.message || 'Failed to exchange authorization code with Facebook.'
        });
      }

      const accessToken = tokenData.access_token;

      // Generate appsecret_proof for Meta API call security
      const appsecretProof = crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');

      // Fetch user profile from Meta Graph API
      const profileUrl = new URL('https://graph.facebook.com/v19.0/me');
      profileUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
      profileUrl.searchParams.set('access_token', accessToken);
      profileUrl.searchParams.set('appsecret_proof', appsecretProof);

      const profileResponse = await fetch(profileUrl.toString());
      const profile = await profileResponse.json();

      if (!profileResponse.ok || !profile.id) {
        return renderAuthResult(res, {
          success: false,
          error: 'PROFILE_FETCH_FAILED',
          message: profile.error?.message || 'Unable to retrieve verified profile from Facebook.'
        });
      }

      const facebookId = profile.id;
      const email = profile.email ? profile.email.toLowerCase().trim() : null;
      const name = profile.name || 'Facebook User';
      const avatar = profile.picture?.data?.url || '';

      // Account lookup:
      // 1. Check if user already exists with this facebookId
      let user = await User.findOne({ facebookId });

      if (user) {
        // Returning Facebook user: update avatar if changed
        if (avatar && user.avatar !== avatar) {
          user.avatar = avatar;
          await user.save();
        }
      } else {
        // 2. Check if an account already exists with the same email
        if (email) {
          const existingUserWithEmail = await User.findOne({ email });
          if (existingUserWithEmail) {
            if (existingUserWithEmail.authProvider === 'local') {
              return renderAuthResult(res, {
                success: false,
                error: 'EMAIL_CONFLICT',
                message: `An account with ${email} is already registered with a password. Please sign in with your email and password.`
              });
            } else if (existingUserWithEmail.authProvider && existingUserWithEmail.authProvider !== 'facebook') {
              return renderAuthResult(res, {
                success: false,
                error: 'PROVIDER_CONFLICT',
                message: `An account with ${email} is already linked to ${existingUserWithEmail.authProvider}. Please sign in using ${existingUserWithEmail.authProvider}.`
              });
            }
          }
        }

        // 3. Create new user record
        user = await User.create({
          name,
          email: email || undefined,
          facebookId,
          authProvider: 'facebook',
          avatar,
          wishlist: []
        });
      }

      const token = generateToken(user._id);
      return renderAuthResult(res, { success: true, token, user });

    } catch (err) {
      console.error('Facebook OAuth callback error:', err);
      return renderAuthResult(res, {
        success: false,
        error: 'SERVER_ERROR',
        message: 'Internal server error while processing Facebook login.'
      });
    }
  });

  return router;
};

