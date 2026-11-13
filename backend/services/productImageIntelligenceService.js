const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  fetchSafeRemoteImage,
  inspectImageBufferSignature,
  TRYON_DOWNLOAD_ALLOWED_MIME_TYPES
} = require('../utils/ssrfImageFetcher');

const PUBLIC_FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend', 'public');
const MAX_PRODUCT_INSPECT_BYTES = 10 * 1024 * 1024;
const SAMPLE_SIZE = 120;

const COLOR_BUCKETS = [
  { name: 'Black', rgb: [18, 18, 22] },
  { name: 'White', rgb: [242, 242, 245] },
  { name: 'Charcoal', rgb: [58, 60, 68] },
  { name: 'Grey', rgb: [135, 138, 145] },
  { name: 'Cream', rgb: [232, 224, 205] },
  { name: 'Beige', rgb: [196, 174, 142] },
  { name: 'Brown', rgb: [110, 72, 46] },
  { name: 'Navy', rgb: [24, 38, 76] },
  { name: 'Blue', rgb: [48, 102, 186] },
  { name: 'Red', rgb: [186, 36, 44] },
  { name: 'Burgundy', rgb: [108, 24, 42] },
  { name: 'Olive', rgb: [86, 98, 56] },
  { name: 'Green', rgb: [42, 128, 72] },
  { name: 'Gold', rgb: [204, 164, 72] },
  { name: 'Pink', rgb: [212, 132, 162] },
  { name: 'Purple', rgb: [118, 62, 164] },
  { name: 'Orange', rgb: [214, 106, 44] }
];

function classifyRgbToColorName(r, g, b) {
  let bestName = 'Black';
  let bestDist = Infinity;
  for (const bucket of COLOR_BUCKETS) {
    const dr = r - bucket.rgb[0];
    const dg = g - bucket.rgb[1];
    const db = b - bucket.rgb[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestName = bucket.name;
    }
  }
  return bestName;
}

function isNearWhiteBackdrop(r, g, b) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  return minC >= 232 && (maxC - minC) <= 22;
}

class ProductImageIntelligenceService {
  constructor(options = {}) {
    this.remoteFetcher = options.fetchSafeRemoteImage || fetchSafeRemoteImage;
  }

  /**
   * Analyze actual decoded RGB pixels of a product image.
   * Strict rules:
   * - NEVER infer physical textile/leather composition from pixels alone (`inferredMaterial` stays null).
   * - NEVER hallucinate logos (`logoLocation` stays null unless Admin/verified source specifies it).
   */
  async analyzeImagePixels(imageBuffer, contextHint = {}) {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      const err = new Error('Buffer ảnh sản phẩm rỗng');
      err.code = 'EMPTY_IMAGE_BUFFER';
      err.statusCode = 400;
      throw err;
    }

    const sig = inspectImageBufferSignature(imageBuffer);
    if (sig.isHtmlOrTextSpoof || !sig.isImage) {
      const err = new Error('Tệp không phải ảnh raster hợp lệ (có thể là HTML/SVG giả mạo)');
      err.code = sig.isHtmlOrTextSpoof ? 'HTML_SPOOFED_AS_IMAGE' : 'MAGIC_BYTES_MISMATCH';
      err.statusCode = 415;
      throw err;
    }

    const metadata = await sharp(imageBuffer, { limitInputPixels: 40_000_000 }).metadata();
    const width = Number(metadata.width) || 0;
    const height = Number(metadata.height) || 0;
    const aspectRatio = height > 0 ? Number((width / height).toFixed(3)) : 0;

    const { data, info } = await sharp(imageBuffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE, fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .toColorspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const sw = info.width;
    const sh = info.height;
    let borderSumLuma = 0;
    let borderCount = 0;

    const fgPixels = [];
    let fgLumaSum = 0;
    let fgLumaSqSum = 0;
    let minFgX = sw;
    let maxFgX = -1;
    let minFgY = sh;
    let maxFgY = -1;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 3;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        if (x === 0 || y === 0 || x === sw - 1 || y === sh - 1) {
          borderSumLuma += luma;
          borderCount++;
        }

        if (!isNearWhiteBackdrop(r, g, b)) {
          fgPixels.push({ x, y, r, g, b, luma });
          fgLumaSum += luma;
          fgLumaSqSum += luma * luma;
          if (x < minFgX) minFgX = x;
          if (x > maxFgX) maxFgX = x;
          if (y < minFgY) minFgY = y;
          if (y > maxFgY) maxFgY = y;
        }
      }
    }

    const meanBorderLuma = borderCount > 0 ? borderSumLuma / borderCount : 0;
    const hasCleanLightBackground = meanBorderLuma >= 230;

    // Fallback to inner 60% crop if foreground was nearly pure white on light backdrop
    const samples = fgPixels.length >= Math.max(12, Math.floor(sw * sh * 0.03))
      ? fgPixels
      : (() => {
          const fallback = [];
          for (let y = Math.floor(sh * 0.2); y < Math.ceil(sh * 0.8); y++) {
            for (let x = Math.floor(sw * 0.2); x < Math.ceil(sw * 0.8); x++) {
              const idx = (y * sw + x) * 3;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];
              const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              fallback.push({ x, y, r, g, b, luma });
            }
          }
          return fallback;
        })();

    const counts = new Map();
    const rgbAccum = new Map();
    for (const px of samples) {
      const cname = classifyRgbToColorName(px.r, px.g, px.b);
      counts.set(cname, (counts.get(cname) || 0) + 1);
      const acc = rgbAccum.get(cname) || { r: 0, g: 0, b: 0, n: 0 };
      acc.r += px.r;
      acc.g += px.g;
      acc.b += px.b;
      acc.n += 1;
      rgbAccum.set(cname, acc);
    }

    const sortedColors = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const totalSamples = Math.max(1, samples.length);
    const primaryName = sortedColors[0]?.[0] || '';
    const primaryAcc = primaryName ? rgbAccum.get(primaryName) : null;
    const dominantRgb = primaryAcc
      ? [Math.round(primaryAcc.r / primaryAcc.n), Math.round(primaryAcc.g / primaryAcc.n), Math.round(primaryAcc.b / primaryAcc.n)]
      : [];

    let secondaryColorName = '';
    let secondaryRgb = [];
    if (sortedColors.length > 1 && sortedColors[1][1] / totalSamples >= 0.14) {
      secondaryColorName = sortedColors[1][0];
      const secAcc = rgbAccum.get(secondaryColorName);
      secondaryRgb = [Math.round(secAcc.r / secAcc.n), Math.round(secAcc.g / secAcc.n), Math.round(secAcc.b / secAcc.n)];
    }

    // Spatial variance / contrast across foreground pixels
    const nFg = Math.max(1, fgPixels.length);
    const meanFgLuma = fgPixels.length > 0 ? fgLumaSum / nFg : meanBorderLuma;
    const varianceFg = fgPixels.length > 0 ? Math.max(0, fgLumaSqSum / nFg - meanFgLuma * meanFgLuma) : 0;
    const stdFg = Math.sqrt(varianceFg);

    const patternHint =
      sortedColors.length >= 2 && sortedColors[1][1] / totalSamples >= 0.22 && stdFg > 34
        ? 'multi_tone_or_patterned'
        : 'uniform_solid_tone';

    let shapeHint = 'balanced_square_frame';
    if (aspectRatio >= 1.2) {
      shapeHint = 'horizontal_profile';
    } else if (aspectRatio > 0 && aspectRatio <= 0.85) {
      shapeHint = 'vertical_silhouette';
    }

    const visibleMaterialCharacteristics =
      stdFg > 42
        ? 'high_specular_highlight_contrast (composition not inferred from pixels)'
        : 'matte_low_contrast_shading (composition not inferred from pixels)';

    const distinctiveVisualDetails = [];
    if (hasCleanLightBackground) {
      distinctiveVisualDetails.push('Clean light studio backdrop detected');
    }
    if (width > 0 && height > 0) {
      distinctiveVisualDetails.push(`Image resolution ${width}x${height}px (${sig.detectedMime})`);
    }

    return {
      mimeType: sig.detectedMime,
      sizeBytes: imageBuffer.length,
      width,
      height,
      aspectRatio,
      dominantColorName: primaryName,
      dominantRgb,
      secondaryColorName,
      secondaryRgb,
      patternHint,
      shapeHint,
      logoLocation: null, // Strictly never fabricated from pixels
      inferredMaterial: null, // Strictly never guessed from pixels
      visibleMaterialCharacteristics,
      distinctiveVisualDetails,
      hasCleanLightBackground,
      estimatedCategoryHint: contextHint.subCategory || null
    };
  }

  /**
   * Safely fetch buffer for either a remote allowlisted image URL or a local `/public` asset path.
   */
  async loadProductImageSafe(imageUrl, options = {}) {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      const err = new Error('URL ảnh sản phẩm bị rỗng');
      err.code = 'PRODUCT_IMAGE_MISSING';
      err.statusCode = 400;
      throw err;
    }

    const trimmed = imageUrl.trim();
    if (trimmed.startsWith('/')) {
      const rel = trimmed.replace(/^\/+/, '');
      const resolved = path.resolve(PUBLIC_FRONTEND_DIR, rel);
      const baseWithSep = PUBLIC_FRONTEND_DIR.endsWith(path.sep)
        ? PUBLIC_FRONTEND_DIR
        : PUBLIC_FRONTEND_DIR + path.sep;
      const contained = process.platform === 'win32'
        ? resolved.toLowerCase().startsWith(baseWithSep.toLowerCase())
        : resolved.startsWith(baseWithSep);

      if (!contained) {
        const err = new Error('Đường dẫn ảnh nội bộ không hợp lệ');
        err.code = 'PATH_TRAVERSAL_BLOCKED';
        err.statusCode = 403;
        throw err;
      }
      if (!fs.existsSync(resolved)) {
        const err = new Error('Không tìm thấy tệp ảnh sản phẩm nội bộ');
        err.code = 'PRODUCT_IMAGE_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }
      const buffer = fs.readFileSync(resolved);
      const sig = inspectImageBufferSignature(buffer);
      if (!sig.isImage) {
        const err = new Error('Tệp ảnh nội bộ không hợp lệ');
        err.code = 'MAGIC_BYTES_MISMATCH';
        err.statusCode = 415;
        throw err;
      }
      return { buffer, mimeType: sig.detectedMime, sizeBytes: buffer.length, domain: 'local_public' };
    }

    const extraAllowedHosts = [
      ...(Array.isArray(options.extraAllowedHosts) ? options.extraAllowedHosts : []),
      ...(Array.isArray(options.extraOfficialHosts) ? options.extraOfficialHosts : []),
      ...(Array.isArray(options.extraRetailerHosts) ? options.extraRetailerHosts : [])
    ];

    const downloaded = await this.remoteFetcher(trimmed, {
      maxBytes: options.maxBytes || MAX_PRODUCT_INSPECT_BYTES,
      timeoutMs: options.timeoutMs || 12000,
      allowedMimeTypes: options.allowedMimeTypes || TRYON_DOWNLOAD_ALLOWED_MIME_TYPES,
      allowedHosts: options.allowedHosts,
      extraAllowedHosts,
      allowHttpForTest: options.allowHttpForTest,
      transport: options.transport,
      agent: options.agent,
      dnsLookup: options.dnsLookup,
      verifyMagicBytes: true
    });

    const parsed = new URL(trimmed);
    return {
      ...downloaded,
      domain: parsed.hostname.toLowerCase()
    };
  }

  /**
   * Inspect a single candidate product image (fetch safely + analyze pixels).
   * Never mutates `Product.images`.
   */
  async inspectProductImageUrl(imageUrl, contextHint = {}, options = {}) {
    try {
      const loaded = await this.loadProductImageSafe(imageUrl, options);
      const visualExtract = await this.analyzeImagePixels(loaded.buffer, contextHint);
      return {
        url: imageUrl,
        domain: loaded.domain,
        isValidForTryOn: true,
        mimeType: visualExtract.mimeType,
        sizeBytes: visualExtract.sizeBytes,
        width: visualExtract.width,
        height: visualExtract.height,
        aspectRatio: visualExtract.aspectRatio,
        checkedAt: new Date(),
        lastError: '',
        visualExtract
      };
    } catch (err) {
      return {
        url: imageUrl,
        domain: (() => {
          try {
            return new URL(imageUrl).hostname.toLowerCase();
          } catch (_) {
            return '';
          }
        })(),
        isValidForTryOn: false,
        mimeType: '',
        sizeBytes: 0,
        width: 0,
        height: 0,
        aspectRatio: 0,
        checkedAt: new Date(),
        lastError: err.code ? `${err.code}: ${err.message}` : err.message,
        visualExtract: null
      };
    }
  }

  /**
   * Rank candidate image records prioritizing verified/official sources, valid resolution,
   * and clean light backgrounds while preserving original catalog image fallback.
   */
  selectBestTryOnImage(imageRecords = []) {
    if (!Array.isArray(imageRecords) || imageRecords.length === 0) return '';

    const valid = imageRecords.filter(r => r && r.url && r.isValidForTryOn !== false);
    if (valid.length === 0) return '';

    const ranked = [...valid].sort((a, b) => {
      const scoreRecord = (rec) => {
        let score = 0;
        if (rec.isVerified) score += 50;
        if (rec.sourceType === 'official_brand') score += 40;
        else if (rec.sourceType === 'trusted_retailer') score += 25;
        else score += 10;
        if (rec.role === 'flatlay' || rec.role === 'official') score += 20;
        if (rec.visualExtract?.hasCleanLightBackground) score += 15;
        const pixels = (rec.width || 0) * (rec.height || 0);
        if (pixels >= 800 * 800) score += 10;
        return score;
      };
      return scoreRecord(b) - scoreRecord(a);
    });

    return ranked[0].url;
  }
}

module.exports = new ProductImageIntelligenceService();
module.exports.ProductImageIntelligenceService = ProductImageIntelligenceService;
module.exports.classifyRgbToColorName = classifyRgbToColorName;
