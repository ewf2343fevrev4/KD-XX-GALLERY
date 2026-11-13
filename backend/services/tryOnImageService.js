const sharp = require('sharp');
const { inspectImageBufferSignature } = require('../utils/ssrfImageFetcher');

const DEFAULT_MAX_BASE64_BYTES = 7 * 1000 * 1000; // 7 MB strict UTF-8 Base64 budget for Vertex AI inline payload
const DEFAULT_MAX_RAW_BYTES = 5 * 1024 * 1024; // ~5.24 MB raw threshold (guaranteed < 7 MB Base64)
const DEFAULT_MAX_INPUT_PIXELS = 40 * 1000 * 1000; // 40 MP cap against decompression bombs
const DEFAULT_MAX_SIDE_PX = 12000; // Reject absurd single-dimension headers before allocation
const DEFAULT_TARGET_DIMENSION = 2048;

const CONVERTIBLE_SHARP_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'avif', 'heif', 'tiff']);

class TryOnImageService {
  /**
   * Preprocess an input image buffer in memory so it complies with model constraints
   * without mutating or overwriting the original uploaded asset.
   *
   * - Guards against decompression bombs via pixel and side limits before decoding
   * - Converts unsupported raster formats (WebP/AVIF/TIFF) to JPEG/PNG
   * - Auto-orients EXIF rotation while preserving aspect ratio (no stretching/cropping)
   * - Resizes / compresses iteratively so BOTH raw bytes AND Base64 payload fit under 7 MB
   * - Verifies final magic bytes, dimensions, and encoded Base64 size
   *
   * @param {Buffer} inputBuffer
   * @param {Object} [options]
   * @returns {Promise<{
   *   buffer: Buffer,
   *   mimeType: 'image/jpeg'|'image/png',
   *   base64: string,
   *   base64Bytes: number,
   *   originalBytes: number,
   *   processedBytes: number,
   *   width: number,
   *   height: number,
   *   originalFormat: string,
   *   transformed: boolean
   * }>}
   */
  async preprocessForTryOn(inputBuffer, options = {}) {
    if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
      const err = new Error('Dữ liệu hình ảnh đầu vào rỗng hoặc không hợp lệ');
      err.code = 'EMPTY_IMAGE_BUFFER';
      err.statusCode = 400;
      throw err;
    }

    const {
      maxBase64Bytes = DEFAULT_MAX_BASE64_BYTES,
      maxRawBytes = DEFAULT_MAX_RAW_BYTES,
      maxInputPixels = DEFAULT_MAX_INPUT_PIXELS,
      maxSidePx = DEFAULT_MAX_SIDE_PX,
      targetMaxDimension = DEFAULT_TARGET_DIMENSION
    } = options;

    // 1. Guard against HTML/XML/SVG spoofing early
    const sigCheck = inspectImageBufferSignature(inputBuffer);
    if (sigCheck.isHtmlOrTextSpoof) {
      const err = new Error('Nội dung đầu vào là HTML/XML giả dạng hình ảnh');
      err.code = 'HTML_SPOOFED_AS_IMAGE';
      err.statusCode = 415;
      throw err;
    }

    // 2. Inspect image metadata BEFORE decoding pixels to block decompression bombs cleanly
    let metadata;
    try {
      metadata = await sharp(inputBuffer, { limitInputPixels: maxInputPixels }).metadata();
    } catch (metaErr) {
      const err = new Error(`Không thể giải mã hình ảnh hoặc ảnh vượt giới hạn pixel an toàn: ${metaErr.message}`);
      err.code = metaErr.message && metaErr.message.toLowerCase().includes('pixel limit')
        ? 'DECOMPRESSION_BOMB'
        : 'INVALID_IMAGE_DATA';
      err.statusCode = 400;
      throw err;
    }

    const format = (metadata.format || '').toLowerCase();
    if (!CONVERTIBLE_SHARP_FORMATS.has(format)) {
      const err = new Error(`Định dạng ảnh "${format || 'unknown'}" không được hỗ trợ cho Virtual Try-On`);
      err.code = 'UNSUPPORTED_IMAGE_FORMAT';
      err.statusCode = 415;
      throw err;
    }

    const srcWidth = Number(metadata.width) || 0;
    const srcHeight = Number(metadata.height) || 0;
    if (srcWidth <= 0 || srcHeight <= 0) {
      const err = new Error('Kích thước hình ảnh không hợp lệ');
      err.code = 'INVALID_IMAGE_DIMENSIONS';
      err.statusCode = 400;
      throw err;
    }

    if (
      srcWidth > maxSidePx ||
      srcHeight > maxSidePx ||
      srcWidth * srcHeight > maxInputPixels
    ) {
      const err = new Error(`Ảnh vượt giới hạn kích thước an toàn (${srcWidth}x${srcHeight}px). Phóng đại quá mức có thể gây tràn bộ nhớ.`);
      err.code = 'DECOMPRESSION_BOMB';
      err.statusCode = 400;
      throw err;
    }

    // 3. Check if source is already a model-compatible JPEG/PNG within budget and clean orientation
    const rawBase64Length = Math.ceil(inputBuffer.length / 3) * 4;
    const isAlreadyModelFormat = format === 'jpeg' || format === 'jpg' || format === 'png';
    const hasNeedsOrient = Boolean(metadata.orientation && metadata.orientation > 1);
    const exceedsDimensions = srcWidth > targetMaxDimension || srcHeight > targetMaxDimension;

    if (
      isAlreadyModelFormat &&
      !hasNeedsOrient &&
      !exceedsDimensions &&
      inputBuffer.length <= maxRawBytes &&
      rawBase64Length <= maxBase64Bytes
    ) {
      const base64 = inputBuffer.toString('base64');
      const base64Bytes = Buffer.byteLength(base64, 'utf8');
      if (base64Bytes <= maxBase64Bytes) {
        return {
          buffer: Buffer.from(inputBuffer), // Copy so callers cannot mutate source buffer
          mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
          base64,
          base64Bytes,
          originalBytes: inputBuffer.length,
          processedBytes: inputBuffer.length,
          width: srcWidth,
          height: srcHeight,
          originalFormat: format,
          transformed: false
        };
      }
    }

    // 4. Build lossless-aspect-ratio resizing + format normalization steps
    const preferPng = format === 'png' && Boolean(metadata.hasAlpha);
    const compressionLadder = preferPng
      ? [
          { dim: targetMaxDimension, format: 'png', quality: 90 },
          { dim: Math.min(targetMaxDimension, 1536), format: 'png', quality: 85 },
          { dim: Math.min(targetMaxDimension, 1280), format: 'jpeg', quality: 88 },
          { dim: 1024, format: 'jpeg', quality: 78 },
          { dim: 800, format: 'jpeg', quality: 68 }
        ]
      : [
          { dim: targetMaxDimension, format: 'jpeg', quality: 90 },
          { dim: Math.min(targetMaxDimension, 1536), format: 'jpeg', quality: 84 },
          { dim: Math.min(targetMaxDimension, 1280), format: 'jpeg', quality: 76 },
          { dim: 1024, format: 'jpeg', quality: 68 },
          { dim: 800, format: 'jpeg', quality: 58 }
        ];

    let finalBuffer = null;
    let finalMime = 'image/jpeg';
    let finalBase64 = '';
    let finalBase64Bytes = 0;

    for (const step of compressionLadder) {
      let pipeline = sharp(inputBuffer, { limitInputPixels: maxInputPixels })
        .rotate() // Respect EXIF orientation without stretching
        .resize({
          width: step.dim,
          height: step.dim,
          fit: 'inside',
          withoutEnlargement: true
        });

      if (step.format === 'png') {
        pipeline = pipeline.png({ compressionLevel: 9 });
        finalMime = 'image/png';
      } else {
        if (metadata.hasAlpha) {
          pipeline = pipeline.flatten({ background: '#ffffff' });
        }
        pipeline = pipeline.jpeg({ quality: step.quality, mozjpeg: true });
        finalMime = 'image/jpeg';
      }

      let candidateBuf;
      try {
        candidateBuf = await pipeline.toBuffer();
      } catch (decodeErr) {
        const err = new Error(
          `Không thể chuyển đổi định dạng ảnh "${format || 'unknown'}" sang JPEG/PNG: ${decodeErr.message}`
        );
        err.code = 'UNSUPPORTED_IMAGE_FORMAT';
        err.statusCode = 415;
        throw err;
      }
      const candidateBase64 = candidateBuf.toString('base64');
      const candidateBase64Bytes = Buffer.byteLength(candidateBase64, 'utf8');

      finalBuffer = candidateBuf;
      finalBase64 = candidateBase64;
      finalBase64Bytes = candidateBase64Bytes;

      if (candidateBuf.length <= maxRawBytes && candidateBase64Bytes <= maxBase64Bytes) {
        break;
      }
    }

    // 5. Post-processing mandatory size & integrity checks
    if (!finalBuffer || finalBuffer.length > maxRawBytes || finalBase64Bytes > maxBase64Bytes) {
      const err = new Error(
        `Không thể nén ảnh xuống dưới giới hạn tải lên (${Math.round(maxBase64Bytes / (1024 * 1024))}MB Base64)`
      );
      err.code = 'IMAGE_EXCEEDS_INLINE_LIMIT';
      err.statusCode = 413;
      throw err;
    }

    const finalSig = inspectImageBufferSignature(finalBuffer);
    if (!finalSig.isImage || (finalSig.detectedMime !== 'image/jpeg' && finalSig.detectedMime !== 'image/png')) {
      const err = new Error('Ảnh sau xử lý không đạt chuẩn JPEG/PNG');
      err.code = 'POST_PROCESS_INVALID_FORMAT';
      err.statusCode = 500;
      throw err;
    }

    const finalMeta = await sharp(finalBuffer, { limitInputPixels: maxInputPixels }).metadata();

    return {
      buffer: finalBuffer,
      mimeType: finalMime,
      base64: finalBase64,
      base64Bytes: finalBase64Bytes,
      originalBytes: inputBuffer.length,
      processedBytes: finalBuffer.length,
      width: finalMeta.width || srcWidth,
      height: finalMeta.height || srcHeight,
      originalFormat: format,
      transformed: true
    };
  }
}

module.exports = new TryOnImageService();
module.exports.TryOnImageService = TryOnImageService;
module.exports.DEFAULT_MAX_BASE64_BYTES = DEFAULT_MAX_BASE64_BYTES;
module.exports.DEFAULT_MAX_RAW_BYTES = DEFAULT_MAX_RAW_BYTES;
module.exports.DEFAULT_MAX_INPUT_PIXELS = DEFAULT_MAX_INPUT_PIXELS;
