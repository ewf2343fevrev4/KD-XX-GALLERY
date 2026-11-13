const dns = require('dns');
const https = require('https');
const net = require('net');

// Verified luxury fashion and media CDN hostnames for KD-XX
const DEFAULT_ALLOWED_HOSTS = new Set([
  'res.cloudinary.com',
  'image-raw.reversible.com',
  'cdn.clothbase.com',
  'amiri.com',
  'cdn-images.farfetch-contents.com',
  'img.ssensemedia.com',
  'hrd-live.cdn.scayle.cloud',
  'holtrenfrew.scene7.com',
  'media.neimanmarcus.com',
  'club21.com',
  'product.hstatic.net',
  'images.unsplash.com'
]);

const PROXY_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif'
]);

const TRYON_DOWNLOAD_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif'
]);

function getAllowedHosts(extraHosts = null) {
  const hosts = new Set(DEFAULT_ALLOWED_HOSTS);
  if (process.env.ALLOWED_IMAGE_HOSTS) {
    process.env.ALLOWED_IMAGE_HOSTS.split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean)
      .forEach(h => hosts.add(h));
  }
  if (Array.isArray(extraHosts)) {
    extraHosts.map(h => String(h).trim().toLowerCase()).filter(Boolean).forEach(h => hosts.add(h));
  }
  return hosts;
}

function isForbiddenIP(ip) {
  if (typeof ip !== 'string' || !ip.trim()) return true;
  const cleanIp = ip.toLowerCase().trim();
  // IPv4 Loopback
  if (cleanIp.startsWith('127.')) return true;
  // Private IPv4 (RFC 1918)
  if (cleanIp.startsWith('10.') || cleanIp.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;
  // CGNAT (100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(cleanIp)) return true;
  // Link-local / Cloud Metadata (169.254.0.0/16)
  if (cleanIp.startsWith('169.254.')) return true;
  // Current network / Broadcast
  if (cleanIp.startsWith('0.') || cleanIp === '255.255.255.255') return true;
  // IPv6 Loopback, Unspecified, Unique local, Link-local, IPv4-mapped IPv6
  if (
    cleanIp === '::1' ||
    cleanIp === '::' ||
    cleanIp.startsWith('fc') ||
    cleanIp.startsWith('fd') ||
    cleanIp.startsWith('fe80:') ||
    cleanIp.startsWith('::ffff:')
  ) {
    return true;
  }
  return false;
}

function createSsrfProtectedAgent(lookupFn = dns.lookup, transportModule = https) {
  return new transportModule.Agent({
    keepAlive: true,
    timeout: 6000,
    lookup: (hostname, options, callback) => {
      lookupFn(hostname, options, (err, address, family) => {
        if (err) return callback(err);
        if (Array.isArray(address)) {
          for (const item of address) {
            if (isForbiddenIP(item.address)) {
              return callback(new Error('SSRF_FORBIDDEN_IP: Target resolves to forbidden IP'));
            }
          }
        } else if (isForbiddenIP(address)) {
          return callback(new Error('SSRF_FORBIDDEN_IP: Target resolves to forbidden IP'));
        }
        callback(null, address, family);
      });
    }
  });
}

const defaultSsrfProtectedAgent = createSsrfProtectedAgent();

function createFetchError(message, code, statusCode) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

/**
 * Inspect buffer header to detect genuine image format or HTML/script/XML spoofing
 * @param {Buffer} buffer
 * @returns {{isImage: boolean, detectedMime: string, isHtmlOrTextSpoof: boolean}}
 */
function inspectImageBufferSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return { isImage: false, detectedMime: '', isHtmlOrTextSpoof: false };
  }

  // Detect HTML / XML / SVG / text payloads disguised with image extension or Content-Type
  const headText = buffer.subarray(0, Math.min(256, buffer.length)).toString('utf8').trimStart().toLowerCase();
  if (
    headText.startsWith('<!doctype') ||
    headText.startsWith('<html') ||
    headText.startsWith('<head') ||
    headText.startsWith('<body') ||
    headText.startsWith('<script') ||
    headText.startsWith('<svg') ||
    headText.startsWith('<?xml')
  ) {
    return { isImage: false, detectedMime: '', isHtmlOrTextSpoof: true };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isImage: true, detectedMime: 'image/jpeg', isHtmlOrTextSpoof: false };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isImage: true, detectedMime: 'image/png', isHtmlOrTextSpoof: false };
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { isImage: true, detectedMime: 'image/webp', isHtmlOrTextSpoof: false };
  }

  // AVIF: ....ftypavif or ....ftypavis (and mif1 containers carrying avif/avis compatible brands)
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const majorBrand = buffer.subarray(8, 12).toString('ascii');
    if (majorBrand === 'avif' || majorBrand === 'avis') {
      return { isImage: true, detectedMime: 'image/avif', isHtmlOrTextSpoof: false };
    }
    if (majorBrand === 'mif1' && buffer.length >= 20) {
      const boxSizeRaw = buffer.readUInt32BE(0);
      const boxEnd = Math.min(buffer.length, Math.max(20, Math.min(boxSizeRaw || 64, 64)));
      const compatBrands = buffer.subarray(16, boxEnd).toString('ascii');
      if (compatBrands.includes('avif') || compatBrands.includes('avis')) {
        return { isImage: true, detectedMime: 'image/avif', isHtmlOrTextSpoof: false };
      }
    }
  }

  // GIF: GIF87a or GIF89a
  const gifSig = buffer.subarray(0, 6).toString('ascii');
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') {
    return { isImage: true, detectedMime: 'image/gif', isHtmlOrTextSpoof: false };
  }

  return { isImage: false, detectedMime: '', isHtmlOrTextSpoof: false };
}

function isHostnameInAllowlist(hostname, allowedHosts) {
  if (!hostname) return false;
  if (allowedHosts.has(hostname)) return true;
  for (const domain of allowedHosts) {
    if (hostname.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
}

const DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'text/html',
  'application/xhtml+xml'
]);

const ACCESS_CHALLENGE_PATTERNS = [
  /cf-mitigated/i,
  /checking your browser/i,
  /verify you are human/i,
  /\brecaptcha\b/i,
  /\bhcaptcha\b/i,
  /cloudflare turnstile/i,
  /enable javascript and cookies/i,
  /access denied.*bot/i
];

/**
 * Shared SSRF-protected HTTPS GET core reused by both image downloads and external product source lookups.
 * Enforces allowlist, private IP / DNS-rebinding protection, no 3xx redirects, stream size limits & timeouts.
 */
function performSafeHttpGet(rawUrl, options = {}, onCompleteBuffer) {
  const {
    maxBytes = 10 * 1024 * 1024,
    timeoutMs = 15000,
    allowedMimeTypes = TRYON_DOWNLOAD_ALLOWED_MIME_TYPES,
    allowedHosts = getAllowedHosts(options.extraAllowedHosts),
    allowHttpForTest = false,
    transport = https,
    agent = options.dnsLookup
      ? createSsrfProtectedAgent(options.dnsLookup, allowHttpForTest ? transport : https)
      : defaultSsrfProtectedAgent,
    headers = {
      'User-Agent': 'KD-XX-Luxury-TryOn-Engine/1.0',
      'Accept': '*/*'
    },
    blockChallengeStatusCodes = false
  } = options;

  return new Promise((resolve, reject) => {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return reject(createFetchError('URL không hợp lệ hoặc bị rỗng', 'INVALID_URL', 400));
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl.trim());
    } catch (e) {
      return reject(createFetchError('Định dạng URL không hợp lệ', 'INVALID_URL', 400));
    }

    const expectedProtocol = allowHttpForTest ? new Set(['https:', 'http:']) : new Set(['https:']);
    if (!expectedProtocol.has(parsedUrl.protocol)) {
      return reject(createFetchError('Chỉ chấp nhận giao thức HTTPS an toàn', 'INSECURE_PROTOCOL', 400));
    }

    if (parsedUrl.username || parsedUrl.password) {
      return reject(createFetchError('URL không được chứa thông tin xác thực', 'CREDENTIALS_IN_URL', 400));
    }

    if (!allowHttpForTest && parsedUrl.port && parsedUrl.port !== '443') {
      return reject(createFetchError('Cổng kết nối không được phép', 'FORBIDDEN_PORT', 400));
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return reject(createFetchError('Tên miền nội bộ không được phép truy cập', 'SSRF_FORBIDDEN_HOST', 403));
    }

    if (net.isIP(hostname) || (parsedUrl.hostname.startsWith('[') && parsedUrl.hostname.endsWith(']'))) {
      return reject(createFetchError('Không cho phép truy cập qua địa chỉ IP trực tiếp', 'SSRF_DIRECT_IP', 403));
    }

    if (!isHostnameInAllowlist(hostname, allowedHosts)) {
      return reject(createFetchError(`Tên miền "${hostname}" không nằm trong allowlist được xác minh`, 'SSRF_FORBIDDEN_HOST', 403));
    }

    let settled = false;
    const finishError = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const finishSuccess = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const reqOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      ...(parsedUrl.port ? { port: parsedUrl.port } : {}),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      agent,
      headers
    };

    const req = transport.request(reqOptions, (remoteRes) => {
      // Strictly reject HTTP 3xx redirects to prevent open-redirect / internal SSRF pivoting
      if (remoteRes.statusCode >= 300 && remoteRes.statusCode < 400) {
        remoteRes.resume();
        return finishError(createFetchError('Chuyển hướng HTTP không được phép vì lý do bảo mật SSRF', 'REDIRECT_BLOCKED', 403));
      }

      if (blockChallengeStatusCodes && (remoteRes.statusCode === 401 || remoteRes.statusCode === 403 || remoteRes.statusCode === 429)) {
        remoteRes.resume();
        return finishError(
          createFetchError(
            `Nguồn bị hạn chế truy cập (HTTP ${remoteRes.statusCode}) — không vượt tường bảo vệ hoặc paywall`,
            'SOURCE_ACCESS_RESTRICTED',
            remoteRes.statusCode
          )
        );
      }

      if (remoteRes.statusCode !== 200) {
        remoteRes.resume();
        return finishError(createFetchError(`Không thể tải dữ liệu từ máy chủ gốc (HTTP ${remoteRes.statusCode})`, 'UPSTREAM_HTTP_ERROR', remoteRes.statusCode || 502));
      }

      const headerMime = (remoteRes.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      if (!allowedMimeTypes.has(headerMime)) {
        remoteRes.resume();
        return finishError(createFetchError(`Loại MIME "${headerMime || 'unknown'}" không được hỗ trợ`, 'UNSUPPORTED_MIME_TYPE', 415));
      }

      const contentLengthHeader = parseInt(remoteRes.headers['content-length'] || '0', 10);
      if (Number.isFinite(contentLengthHeader) && contentLengthHeader > maxBytes) {
        remoteRes.destroy();
        return finishError(createFetchError(`Kích thước tệp (${contentLengthHeader} bytes) vượt quá giới hạn cho phép`, 'IMAGE_TOO_LARGE', 413));
      }

      let totalBytes = 0;
      const chunks = [];

      remoteRes.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          remoteRes.destroy();
          return finishError(createFetchError(`Kích thước dữ liệu vượt quá giới hạn tối đa ${Math.round(maxBytes / (1024 * 1024))}MB`, 'IMAGE_TOO_LARGE', 413));
        }
        chunks.push(chunk);
      });

      remoteRes.on('end', () => {
        if (settled) return;
        const buffer = Buffer.concat(chunks);
        try {
          const result = onCompleteBuffer({
            buffer,
            headerMime,
            headers: remoteRes.headers,
            parsedUrl
          });
          finishSuccess(result);
        } catch (cbErr) {
          finishError(cbErr);
        }
      });

      remoteRes.on('error', (streamErr) => {
        finishError(createFetchError(`Lỗi đường truyền khi tải dữ liệu: ${streamErr.message}`, 'IMAGE_STREAM_ERROR', 502));
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(createFetchError('Thời gian chờ kết nối quá hạn', 'IMAGE_FETCH_TIMEOUT', 504));
    });

    req.on('error', (err) => {
      if (err && err.code) {
        return finishError(err);
      }
      if (err && err.message && err.message.includes('SSRF_FORBIDDEN_IP')) {
        return finishError(createFetchError('Địa chỉ IP đích nằm trong vùng mạng cấm (SSRF)', 'SSRF_FORBIDDEN_IP', 403));
      }
      if (err && err.message === 'TIMEOUT') {
        return finishError(createFetchError('Thời gian chờ kết nối quá hạn', 'IMAGE_FETCH_TIMEOUT', 504));
      }
      finishError(createFetchError(`Không thể kết nối đến máy chủ đích: ${err.message}`, 'IMAGE_FETCH_NETWORK_ERROR', 502));
    });

    req.end();
  });
}

/**
 * Safely download a remote image over HTTPS with SSRF, DNS-rebinding, redirect, size & magic-byte checks.
 * Supports dependency injection via options (`transport`, `agent`, `dnsLookup`, `allowedHosts`, etc.) for deterministic tests.
 *
 * @param {string} rawUrl
 * @param {Object} [options]
 * @returns {Promise<{buffer: Buffer, mimeType: string, headerMimeType: string, sizeBytes: number}>}
 */
function fetchSafeRemoteImage(rawUrl, options = {}) {
  const verifyMagicBytes = options.verifyMagicBytes !== false;
  const allowedMimeTypes = options.allowedMimeTypes || TRYON_DOWNLOAD_ALLOWED_MIME_TYPES;

  return performSafeHttpGet(
    rawUrl,
    {
      ...options,
      maxBytes: options.maxBytes || 10 * 1024 * 1024,
      timeoutMs: options.timeoutMs || 15000,
      allowedMimeTypes,
      headers: options.headers || {
        'User-Agent': 'KD-XX-Luxury-TryOn-Engine/1.0',
        'Accept': 'image/jpeg,image/png;q=0.95,image/webp;q=0.9,image/avif;q=0.85,image/*;q=0.8'
      }
    },
    ({ buffer, headerMime }) => {
      if (buffer.length === 0) {
        throw createFetchError('Dữ liệu ảnh tải về bị rỗng', 'EMPTY_IMAGE_BODY', 422);
      }

      if (verifyMagicBytes) {
        const sig = inspectImageBufferSignature(buffer);
        if (sig.isHtmlOrTextSpoof) {
          throw createFetchError('Phát hiện nội dung HTML/XML giả dạng tệp hình ảnh', 'HTML_SPOOFED_AS_IMAGE', 415);
        }
        if (!sig.isImage || !allowedMimeTypes.has(sig.detectedMime)) {
          throw createFetchError('Magic bytes không khớp định dạng ảnh hợp lệ được hỗ trợ', 'MAGIC_BYTES_MISMATCH', 415);
        }
        return {
          buffer,
          mimeType: sig.detectedMime,
          headerMimeType: headerMime,
          sizeBytes: buffer.length
        };
      }

      return {
        buffer,
        mimeType: headerMime === 'image/jpg' ? 'image/jpeg' : headerMime,
        headerMimeType: headerMime,
        sizeBytes: buffer.length
      };
    }
  );
}

/**
 * Safely download a structured product source document (JSON, JSON-LD, or HTML metadata page)
 * from an explicitly allowlisted host. Rejects redirects, private IPs, oversized streams, and CAPTCHA/paywall challenges.
 */
function fetchSafeRemoteDocument(rawUrl, options = {}) {
  return performSafeHttpGet(
    rawUrl,
    {
      ...options,
      maxBytes: options.maxBytes || 2 * 1024 * 1024,
      timeoutMs: options.timeoutMs || 10000,
      allowedMimeTypes: options.allowedMimeTypes || DOCUMENT_ALLOWED_MIME_TYPES,
      blockChallengeStatusCodes: true,
      headers: options.headers || {
        'User-Agent': 'KD-XX-Product-Intelligence/1.0',
        'Accept': 'application/json,application/ld+json,text/html;q=0.9'
      }
    },
    ({ buffer, headerMime, headers: resHeaders, parsedUrl }) => {
      if (buffer.length === 0) {
        throw createFetchError('Nội dung nguồn sản phẩm bị rỗng', 'EMPTY_SOURCE_BODY', 422);
      }

      const rawText = buffer.toString('utf8');
      const challengeHeader = String(resHeaders?.['cf-mitigated'] || '').toLowerCase();
      if (
        challengeHeader === 'challenge' ||
        ACCESS_CHALLENGE_PATTERNS.some(rx => rx.test(rawText.slice(0, 8000)))
      ) {
        throw createFetchError(
          'Nguồn bị bảo vệ bởi anti-bot / CAPTCHA — từ chối tự động vượt rào truy cập',
          'SOURCE_ACCESS_RESTRICTED',
          403
        );
      }

      return {
        text: rawText,
        mimeType: headerMime,
        sizeBytes: buffer.length,
        finalUrl: parsedUrl.toString(),
        hostname: parsedUrl.hostname.toLowerCase()
      };
    }
  );
}

module.exports = {
  DEFAULT_ALLOWED_HOSTS,
  PROXY_ALLOWED_MIME_TYPES,
  TRYON_DOWNLOAD_ALLOWED_MIME_TYPES,
  DOCUMENT_ALLOWED_MIME_TYPES,
  getAllowedHosts,
  isForbiddenIP,
  isHostnameInAllowlist,
  createSsrfProtectedAgent,
  ssrfProtectedAgent: defaultSsrfProtectedAgent,
  inspectImageBufferSignature,
  fetchSafeRemoteImage,
  fetchSafeRemoteDocument
};
