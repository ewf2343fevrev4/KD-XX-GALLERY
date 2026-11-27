const jwt = require('jsonwebtoken');

/**
 * Unified JWT and signing secret resolution for KD-XX backend.
 * Eliminates fallback mismatches ('secret' vs 'fallback_secret') across middleware and controllers.
 */
function getJwtSecret() {
  return process.env.JWT_SECRET || 'fallback_secret';
}

function getTryOnSigningSecret() {
  return process.env.TRYON_SIGNING_SECRET || process.env.JWT_SECRET || 'kdxx_tryon_signed_secret_key_2026';
}

function signAuthToken(userId, tokenVersion = 0, expiresIn = process.env.JWT_EXPIRE || '7d') {
  return jwt.sign(
    { id: userId, tv: Number(tokenVersion) || 0 },
    getJwtSecret(),
    { expiresIn }
  );
}

function isTokenVersionValid(user, decoded) {
  if (!user || !decoded) return false;
  return (Number(decoded.tv) || 0) === (Number(user.tokenVersion) || 0);
}

module.exports = {
  getJwtSecret,
  getTryOnSigningSecret,
  signAuthToken,
  isTokenVersionValid
};
