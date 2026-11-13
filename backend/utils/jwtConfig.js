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

module.exports = {
  getJwtSecret,
  getTryOnSigningSecret
};
