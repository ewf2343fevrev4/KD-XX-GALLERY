const DEFAULT_DEV_ORIGIN = 'http://localhost:5000';

/**
 * Resolve API origin and base URL cleanly across local development and production builds.
 * Supports REACT_APP_API_URL specified either as an origin (https://api.example.com)
 * or with a /api suffix (https://api.example.com/api).
 * Never hardcodes staging/Render domains or secrets.
 *
 * @param {string} [overrideUrl]
 * @returns {{ origin: string, apiBaseUrl: string, isCustomEnv: boolean }}
 */
export function resolveApiConfig(overrideUrl) {
  const rawEnv =
    overrideUrl !== undefined
      ? overrideUrl
      : typeof process !== 'undefined' && process.env
        ? process.env.REACT_APP_API_URL
        : '';

  const trimmed = String(rawEnv || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    const isProductionBrowser =
      typeof window !== 'undefined' &&
      window.location &&
      window.location.hostname &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname);

    const defaultOrigin = isProductionBrowser
      ? 'https://kdxx-backend-431378225102.us-central1.run.app'
      : DEFAULT_DEV_ORIGIN;

    return {
      origin: defaultOrigin,
      apiBaseUrl: `${defaultOrigin}/api`,
      isCustomEnv: isProductionBrowser
    };
  }

  if (trimmed.toLowerCase().endsWith('/api')) {
    return {
      origin: trimmed.slice(0, -4),
      apiBaseUrl: trimmed,
      isCustomEnv: true
    };
  }

  return {
    origin: trimmed,
    apiBaseUrl: `${trimmed}/api`,
    isCustomEnv: true
  };
}

const resolvedConfig = resolveApiConfig();

export const API_ORIGIN = resolvedConfig.origin;
export const API_BASE_URL = resolvedConfig.apiBaseUrl;

/**
 * Build full API URL from either `/api/...` or `/tryon/...` path
 * @param {string} endpointPath
 * @returns {string}
 */
export function buildApiUrl(endpointPath = '') {
  const pathStr = String(endpointPath || '').trim();
  if (!pathStr) return API_BASE_URL;
  if (/^https?:\/\//i.test(pathStr)) return pathStr;

  const normalizedPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
  if (normalizedPath.toLowerCase().startsWith('/api/')) {
    return `${API_ORIGIN}${normalizedPath}`;
  }
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Build full asset streaming URL from relative backend path (e.g. `/api/tryon/images/...`)
 * @param {string} assetPath
 * @returns {string}
 */
export function buildAssetUrl(assetPath = '') {
  const pathStr = String(assetPath || '').trim();
  if (!pathStr) return '';
  if (/^https?:\/\//i.test(pathStr)) return pathStr;
  const normalizedPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
  return `${API_ORIGIN}${normalizedPath}`;
}
