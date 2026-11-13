/**
 * KD-XX FIT LAB — Real AI Background Removal Service
 * Powered by @bg0/browser (Local WebGPU / WASM AI BiRefNet)
 * With client-side transparency detection, session caching, and fallback protection
 */
import { API_BASE_URL } from '../config/apiConfig';

// In-memory cache for processed cutouts during the session
// Maps: sourceUrl -> { cutoutUrl: string, blob: Blob, isTransparent: boolean }
const processedCache = new Map();

// In-flight processing promises to avoid duplicate simultaneous inference
const activeProcessing = new Map();

/**
 * Check if an image already has a transparent alpha channel
 * Samples border and corner pixels on an offscreen canvas
 */
export const checkImageTransparency = async (imageInput) => {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = Math.min(256, img.naturalWidth || img.width);
          const height = Math.min(256, img.naturalHeight || img.height);
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(false);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const imgData = ctx.getImageData(0, 0, width, height).data;

          // Sample corners and perimeter
          let transparentPixels = 0;
          let sampledPixels = 0;

          // Check 4 corners (5x5 patches in corners)
          const cornerPatches = [
            { startX: 0, startY: 0 },
            { startX: width - 6, startY: 0 },
            { startX: 0, startY: height - 6 },
            { startX: width - 6, startY: height - 6 }
          ];

          for (const patch of cornerPatches) {
            for (let y = Math.max(0, patch.startY); y < Math.min(height, patch.startY + 6); y++) {
              for (let x = Math.max(0, patch.startX); x < Math.min(width, patch.startX + 6); x++) {
                const idx = (y * width + x) * 4;
                const alpha = imgData[idx + 3];
                sampledPixels++;
                if (alpha < 230) {
                  transparentPixels++;
                }
              }
            }
          }

          // Check perimeter border edges
          const step = Math.max(1, Math.floor(width / 30));
          for (let x = 0; x < width; x += step) {
            // Top edge
            sampledPixels++;
            if (imgData[x * 4 + 3] < 230) transparentPixels++;

            // Bottom edge
            sampledPixels++;
            if (imgData[((height - 1) * width + x) * 4 + 3] < 230) transparentPixels++;
          }

          for (let y = 0; y < height; y += step) {
            // Left edge
            sampledPixels++;
            if (imgData[(y * width) * 4 + 3] < 230) transparentPixels++;

            // Right edge
            sampledPixels++;
            if (imgData[(y * width + (width - 1)) * 4 + 3] < 230) transparentPixels++;
          }

          // If more than 15% of sampled border/corner pixels are transparent, image is already cutout
          const ratio = transparentPixels / Math.max(1, sampledPixels);
          const isTransparent = ratio > 0.15;
          resolve(isTransparent);
        } catch (canvasErr) {
          // If canvas is tainted or read fails, treat as opaque to be safe
          console.warn('Transparency check canvas error:', canvasErr);
          resolve(false);
        }
      };

      img.onerror = () => {
        resolve(false);
      };

      if (typeof imageInput === 'string') {
        img.src = imageInput;
      } else if (imageInput instanceof Blob) {
        img.src = URL.createObjectURL(imageInput);
      } else {
        resolve(false);
      }
    } catch (err) {
      console.warn('Transparency detection failed:', err);
      resolve(false);
    }
  });
};

const API_BASE = API_BASE_URL;

/**
 * Convert any image source (URL, Blob, File) into a valid Blob for the AI model
 * Includes automatic backend proxy fallback for external CDNs lacking CORS headers (e.g. Farfetch, Scayle)
 */
const getImageBlob = async (imageInput) => {
  if (imageInput instanceof Blob) {
    return imageInput;
  }

  if (typeof imageInput === 'string') {
    // If it's a blob: or data: URL
    if (imageInput.startsWith('blob:') || imageInput.startsWith('data:')) {
      const res = await fetch(imageInput);
      return await res.blob();
    }

    // Remote HTTP/HTTPS URL
    // Attempt 1: Direct CORS fetch (works for Shopify, Cloudinary, Imgur, etc.)
    try {
      const res = await fetch(imageInput, { mode: 'cors' });
      if (res.ok) {
        return await res.blob();
      }
    } catch (corsErr) {
      console.warn('Direct fetch failed, falling back to backend image proxy:', corsErr.message);
    }

    // Attempt 2: Backend image proxy (handles Farfetch, Scayle, and any CDN missing CORS headers)
    if (!imageInput.includes('/api/proxy-image')) {
      try {
        const proxyUrl = `${API_BASE}/proxy-image?url=${encodeURIComponent(imageInput)}`;
        const proxyRes = await fetch(proxyUrl);
        if (proxyRes.ok) {
          return await proxyRes.blob();
        }
      } catch (proxyErr) {
        console.warn('Backend proxy fetch failed, attempting canvas conversion:', proxyErr.message);
      }
    }

    // Attempt 3: Canvas drawing fallback
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas toBlob returned null'));
            },
            'image/png'
          );
        } catch (cvsErr) {
          reject(cvsErr);
        }
      };
      img.onerror = () => reject(new Error('Không thể trích xuất dữ liệu ảnh'));
      img.src = imageInput;
    });
  }

  throw new Error('Unsupported image input type');
};

/**
 * Studio-Grade Cutout Refinement:
 * - Samples original background color around corners/borders (white, off-white, light gray)
 * - Removes faint background haze / floating artifact pixels (alpha < 5%)
 * - Eliminates white edge halo / color spill on clothing boundaries
 * - Recovers true garment edge chromaticity (un-premultiplying white background spill)
 * - Anti-aliases the silhouette transition so edges look crisp and natural on dark backgrounds
 */
const refineAndCleanCutout = async (cutoutBlob, originalBlob) => {
  try {
    const loadImg = (blob) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        img.src = url;
      });

    const [cutoutImg, originalImg] = await Promise.all([
      loadImg(cutoutBlob),
      loadImg(originalBlob)
    ]);

    const width = cutoutImg.naturalWidth || cutoutImg.width;
    const height = cutoutImg.naturalHeight || cutoutImg.height;

    if (!width || !height) return cutoutBlob;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return cutoutBlob;

    ctx.drawImage(cutoutImg, 0, 0, width, height);
    const cutDataObj = ctx.getImageData(0, 0, width, height);
    const cutData = cutDataObj.data;

    const origCanvas = document.createElement('canvas');
    origCanvas.width = width;
    origCanvas.height = height;
    const origCtx = origCanvas.getContext('2d', { willReadFrequently: true });
    if (!origCtx) return cutoutBlob;

    origCtx.drawImage(originalImg, 0, 0, width, height);
    const origData = origCtx.getImageData(0, 0, width, height).data;

    // 1. Sample original background color from 4 corners (10x10 patches)
    let sumR = 0, sumG = 0, sumB = 0, sampleCount = 0;
    const patchSize = Math.min(10, Math.floor(Math.min(width, height) / 8));
    const corners = [
      { startX: 0, startY: 0 },
      { startX: width - patchSize, startY: 0 },
      { startX: 0, startY: height - patchSize },
      { startX: width - patchSize, startY: height - patchSize }
    ];

    for (const corner of corners) {
      for (let y = corner.startY; y < corner.startY + patchSize; y++) {
        for (let x = corner.startX; x < corner.startX + patchSize; x++) {
          const idx = (y * width + x) * 4;
          sumR += origData[idx];
          sumG += origData[idx + 1];
          sumB += origData[idx + 2];
          sampleCount++;
        }
      }
    }

    const bgR = sampleCount > 0 ? sumR / sampleCount : 255;
    const bgG = sampleCount > 0 ? sumG / sampleCount : 255;
    const bgB = sampleCount > 0 ? sumB / sampleCount : 255;

    const smoothstep = (min, max, value) => {
      const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
      return x * x * (3 - 2 * x);
    };

    // 2. Pixel refinement loop
    const totalPixels = width * height;
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      const a = cutData[offset + 3];

      // A. Completely eliminate faint background haze/dust
      if (a < 14) {
        cutData[offset + 3] = 0;
        continue;
      }

      // Fully opaque pixels remain intact
      if (a >= 250) {
        continue;
      }

      const origR = origData[offset];
      const origG = origData[offset + 1];
      const origB = origData[offset + 2];

      // B. Eliminate white fringe / background spill in low-confidence regions
      const colorDiff = Math.abs(origR - bgR) + Math.abs(origG - bgG) + Math.abs(origB - bgB);
      if (a < 95 && colorDiff < 30) {
        cutData[offset + 3] = 0;
        continue;
      }

      // C. Edge De-fringing (Color Un-premultiplying):
      // Restore true color of garment edge by subtracting the white background contamination
      let normA = a / 255;
      const trueR = Math.max(0, Math.min(255, Math.round((origR - (1 - normA) * bgR) / normA)));
      const trueG = Math.max(0, Math.min(255, Math.round((origG - (1 - normA) * bgG) / normA)));
      const trueB = Math.max(0, Math.min(255, Math.round((origB - (1 - normA) * bgB) / normA)));

      // D. Clean alpha transition with subtle smoothing
      const refinedA = Math.round(smoothstep(0.03, 0.98, normA) * 255);

      cutData[offset] = trueR;
      cutData[offset + 1] = trueG;
      cutData[offset + 2] = trueB;
      cutData[offset + 3] = refinedA;
    }

    ctx.putImageData(cutDataObj, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || cutoutBlob), 'image/png');
    });
  } catch (err) {
    console.warn('Refinement post-processing skipped due to error:', err);
    return cutoutBlob;
  }
};

/**
 * Main Background Removal function
 * 1. Checks cache
 * 2. Prepares image Blob safely (direct or via backend proxy)
 * 3. Checks transparency on local Blob
 * 4. Runs AI background removal via @bg0/browser with 'quality' precision
 * 5. Applies studio-grade edge refinement & defringing
 * 6. Caches and returns transparent object URL
 */
export const processBackgroundRemoval = async (imageInput, options = {}) => {
  const { onProgress, onStatusChange, forceReprocess = false } = options;
  const cacheKey = typeof imageInput === 'string' ? imageInput : imageInput.name || 'blob-input';

  // 1. Check in-memory cache
  if (!forceReprocess && processedCache.has(cacheKey)) {
    const cached = processedCache.get(cacheKey);
    return {
      success: true,
      url: cached.cutoutUrl,
      originalUrl: cacheKey,
      isCutout: cached.isCutout,
      fromCache: true
    };
  }

  // 2. Check if already in-flight
  if (!forceReprocess && activeProcessing.has(cacheKey)) {
    return await activeProcessing.get(cacheKey);
  }

  // Create new processing task
  const taskPromise = (async () => {
    try {
      // 1. Convert input to Blob first (safe from CORS via proxy)
      if (onStatusChange) onStatusChange('Chuẩn bị ảnh...');
      const imageBlob = await getImageBlob(imageInput);

      // 2. Check if image already has transparency using the safe local Blob
      if (onStatusChange) onStatusChange('Kiểm tra độ trong suốt...');
      const alreadyTransparent = await checkImageTransparency(imageBlob);
      if (alreadyTransparent) {
        const directUrl = typeof imageInput === 'string' ? imageInput : URL.createObjectURL(imageBlob);
        processedCache.set(cacheKey, {
          cutoutUrl: directUrl,
          isCutout: false, // Already native transparent
          originalUrl: directUrl
        });

        if (onStatusChange) onStatusChange('Ảnh đã có nền trong suốt.');
        return {
          success: true,
          url: directUrl,
          originalUrl: directUrl,
          isCutout: false,
          alreadyTransparent: true
        };
      }

      // 3. Dynamically import @bg0/browser
      if (onStatusChange) onStatusChange('Khởi động AI tách nền...');
      const bg0 = await import('@bg0/browser');

      if (onStatusChange) onStatusChange('Đang phân tách nền thời trang...');

      // 4. Execute AI background removal on imageBlob with maximum 'quality' precision
      const result = await bg0.removeBackground(imageBlob, {
        quality: 'quality',
        onProgress: (progressInfo) => {
          if (onProgress && progressInfo.progress !== undefined) {
            onProgress(Math.round(progressInfo.progress * 100));
          }
          if (onStatusChange && progressInfo.message) {
            onStatusChange(progressInfo.message);
          }
        }
      });

      if (!result || !result.blob) {
        throw new Error('AI không tạo được alpha mask hợp lệ.');
      }

      // 5. Studio-grade Edge De-fringing, Despill, and Alpha Matting post-processing
      if (onStatusChange) onStatusChange('Tinh chỉnh viền và khử nhiễu viền áo...');
      const cleanBlob = await refineAndCleanCutout(result.blob, imageBlob);

      const cutoutUrl = URL.createObjectURL(cleanBlob);

      // Cache result
      processedCache.set(cacheKey, {
        cutoutUrl,
        blob: cleanBlob,
        isCutout: true,
        originalUrl: cacheKey
      });

      if (onStatusChange) onStatusChange('Tách nền hoàn tất!');

      return {
        success: true,
        url: cutoutUrl,
        originalUrl: cacheKey,
        isCutout: true,
        blob: cleanBlob
      };
    } catch (error) {
      console.warn('AI background removal error:', error);

      // Fallback: return original image
      const fallbackUrl = typeof imageInput === 'string' ? imageInput : URL.createObjectURL(imageInput);
      return {
        success: false,
        url: fallbackUrl,
        originalUrl: fallbackUrl,
        isCutout: false,
        error: error.message || 'Lỗi khi tách nền'
      };
    } finally {
      activeProcessing.delete(cacheKey);
    }
  })();

  activeProcessing.set(cacheKey, taskPromise);
  return await taskPromise;
};

/**
 * Retrieve cached cutout for an image if available
 */
export const getCachedCutout = (imageKey) => {
  return processedCache.get(imageKey) || null;
};

/**
 * Clear session cache and revoke object URLs
 */
export const clearCutoutCache = () => {
  for (const entry of processedCache.values()) {
    if (entry.cutoutUrl && entry.cutoutUrl.startsWith('blob:')) {
      URL.revokeObjectURL(entry.cutoutUrl);
    }
  }
  processedCache.clear();
};

