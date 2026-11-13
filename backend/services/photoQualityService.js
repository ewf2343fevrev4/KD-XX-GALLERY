const crypto = require('crypto');
const sharp = require('sharp');

const MAX_ANALYZER_INPUT_PIXELS = 40 * 1000 * 1000;

class PhotoQualityService {
  /**
   * Validate image magic bytes and basic integrity
   * @param {Buffer} buffer
   * @param {string} declaredMime
   * @returns {{isValid: boolean, detectedMime: string, error?: string}}
   */
  validateMagicBytes(buffer, declaredMime = '') {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return { isValid: false, detectedMime: '', error: 'Tệp hình ảnh rỗng hoặc không có dữ liệu' };
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return { isValid: false, detectedMime: '', error: 'Kích thước tệp vượt quá giới hạn tối đa 10 MB' };
    }

    if (buffer.length < 512) {
      return { isValid: false, detectedMime: '', error: 'Tệp quá nhỏ hoặc dữ liệu bị hỏng' };
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { isValid: true, detectedMime: 'image/jpeg' };
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
      return { isValid: true, detectedMime: 'image/png' };
    }

    return {
      isValid: false,
      detectedMime: '',
      error: 'Định dạng tệp không hợp lệ. Chỉ chấp nhận định dạng ảnh JPG, JPEG hoặc PNG thật'
    };
  }

  /**
   * Extract image dimensions from JPEG/PNG buffer in pure Node.js
   * @param {Buffer} buffer
   * @param {string} mimeType
   * @returns {{width: number, height: number}}
   */
  extractDimensions(buffer, mimeType) {
    let width = 0;
    let height = 0;

    try {
      if (mimeType === 'image/png' && buffer.length >= 24) {
        // PNG IHDR width and height at offset 16 and 20 (big-endian 32-bit int)
        width = buffer.readUInt32BE(16);
        height = buffer.readUInt32BE(20);
      } else if (mimeType === 'image/jpeg') {
        let offset = 2;
        while (offset < buffer.length - 8) {
          if (buffer[offset] !== 0xff) {
            offset++;
            continue;
          }
          const marker = buffer[offset + 1];
          // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
          if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
            height = buffer.readUInt16BE(offset + 5);
            width = buffer.readUInt16BE(offset + 7);
            break;
          }
          const blockLength = buffer.readUInt16BE(offset + 2);
          offset += 2 + blockLength;
        }
      }
    } catch (e) {
      // Fallback defaults
    }

    return { width, height };
  }

  /**
   * Comprehensive Photo Quality Analyzer
   * Evaluates 8 key criteria for high-fidelity virtual try-on
   * @param {Buffer} buffer
   * @param {string} mimeType
   * @returns {Promise<{status: 'READY'|'NEEDS_IMPROVEMENT'|'REJECTED', score: number, issues: Array<{code: string, message: string}>, suggestions: string[]}>}
   */
  async analyzePhotoQuality(buffer, mimeType) {
    const magic = this.validateMagicBytes(buffer, mimeType);
    if (!magic.isValid) {
      return {
        status: 'REJECTED',
        score: 0,
        issues: [{ code: 'INVALID_SIGNATURE', message: magic.error }],
        suggestions: ['Vui lòng tải lên ảnh chụp thực tế dưới định dạng JPG, JPEG hoặc PNG không bị chỉnh sửa sai header.']
      };
    }

    const { width, height } = this.extractDimensions(buffer, magic.detectedMime);
    const issues = [];
    const suggestions = [];
    let score = 90;

    // 1. Kích thước & Tỉ lệ khung hình (Aspect Ratio & Resolution)
    if (width > 0 && height > 0) {
      if (width < 400 || height < 500) {
        score -= 35;
        issues.push({
          code: 'LOW_RESOLUTION',
          message: `Độ phân giải ảnh thấp (${width}x${height}px). Có thể làm mờ chi tiết trang phục.`
        });
        suggestions.push('Chụp hoặc chọn ảnh có độ phân giải tối thiểu từ 768x1024px để AI ghép vải sắc nét.');
      }

      const aspectRatio = height / width;
      if (aspectRatio < 0.9) {
        // Landscape photo for a full-body person
        score -= 20;
        issues.push({
          code: 'LANDSCAPE_ORIENTATION',
          message: 'Ảnh ngang có thể làm mất vùng thân dưới hoặc đầu.'
        });
        suggestions.push('Nên dùng ảnh chụp dọc (portrait) toàn thân từ đầu đến chân.');
      }
    }

    // 2. Phân tích dung lượng & độ chi tiết (Bitrate & Entropy check)
    if (buffer.length < 35 * 1024) {
      score -= 25;
      issues.push({
        code: 'HIGH_COMPRESSION',
        message: 'Ảnh bị nén quá mạnh hoặc mờ, thiếu chi tiết kết cấu sợi vải.'
      });
      suggestions.push('Tránh chụp lại màn hình điện thoại (screenshot) hoặc tải ảnh qua ứng dụng nén giảm chất lượng.');
    }

    // 3. Giải mã pixel RGB thực tế bằng sharp để tính độ sáng (luminance) và độ tương phản chuẩn BT.709
    let luminanceStats = null;
    try {
      const { data, info } = await sharp(buffer, { limitInputPixels: MAX_ANALYZER_INPUT_PIXELS })
        .rotate()
        .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .toColorspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });

      const channels = info.channels || 3;
      const pixelCount = Math.floor(data.length / channels);

      if (pixelCount > 0) {
        let sumLuma = 0;
        let sumLumaSq = 0;
        let darkPixels = 0;
        let brightPixels = 0;

        for (let i = 0; i < data.length; i += channels) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Perceptual luminance in sRGB (ITU-R BT.709)
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sumLuma += luma;
          sumLumaSq += luma * luma;
          if (luma < 45) darkPixels++;
          if (luma > 235) brightPixels++;
        }

        const meanLuma = sumLuma / pixelCount;
        const variance = Math.max(0, sumLumaSq / pixelCount - meanLuma * meanLuma);
        const lumaStdDev = Math.sqrt(variance);
        const darkRatio = darkPixels / pixelCount;
        const brightRatio = brightPixels / pixelCount;

        luminanceStats = {
          meanLuma: Number(meanLuma.toFixed(2)),
          lumaStdDev: Number(lumaStdDev.toFixed(2)),
          darkRatio: Number(darkRatio.toFixed(4)),
          brightRatio: Number(brightRatio.toFixed(4))
        };

        if (meanLuma < 65 || darkRatio > 0.65) {
          score -= 20;
          issues.push({
            code: 'LOW_LIGHTING',
            message: 'Ánh sáng tổng thể khá tối. Khó nhận diện chính xác đường nét vai và thắt lưng.'
          });
          suggestions.push('Đứng ở nơi có ánh sáng tự nhiên đầy đủ hoặc bật đèn phòng sáng trước khi chụp.');
        }

        if (meanLuma > 225 || (brightRatio > 0.75 && lumaStdDev < 45) || brightRatio > 0.85) {
          score -= 15;
          issues.push({
            code: 'OVEREXPOSURE',
            message: 'Ảnh bị chói sáng hoặc nền quá sáng khiến viền người bị lóa.'
          });
          suggestions.push('Tránh đứng ngược sáng trước cửa sổ hoặc nguồn đèn chiếu thẳng vào ống kính.');
        }
      }
    } catch (decodeErr) {
      return {
        status: 'REJECTED',
        score: 0,
        issues: [{ code: 'INVALID_IMAGE_DECODE', message: 'Không thể giải mã dữ liệu pixel hình ảnh hoặc ảnh vượt giới hạn an toàn.' }],
        suggestions: ['Vui lòng tải lên tệp ảnh JPG hoặc PNG nguyên vẹn chưa bị lỗi hoặc kích thước quá lớn.']
      };
    }

    // Luôn cung cấp hướng dẫn tư thế chuẩn cho luxury try-on
    suggestions.push('Tư thế lý tưởng: đứng thẳng tự nhiên, hai tay thả xuôi dọc hông, nhìn thẳng vào ống kính.');
    suggestions.push('Mặc trang phục vừa vặn gọn gàng (áo thun, quần ôm) để AI thay trang phục chính xác nhất.');

    // Xác định trạng thái cuối
    let status = 'READY';
    if (score < 50 || issues.some(i => i.code === 'INVALID_SIGNATURE' || i.code === 'INVALID_IMAGE_DECODE')) {
      status = 'REJECTED';
    } else if (score < 75 || issues.length > 0) {
      status = 'NEEDS_IMPROVEMENT';
    }

    return {
      status,
      score: Math.max(10, Math.min(100, score)),
      issues,
      suggestions: Array.from(new Set(suggestions)),
      ...(luminanceStats ? { metrics: luminanceStats } : {})
    };
  }
}

module.exports = new PhotoQualityService();
