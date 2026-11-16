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

        // 4. KD-XX Level 1: Human Anatomical Mass & Full-Body Pose Analysis
        const aspectRatioVal = width > 0 && height > 0 ? height / width : 1.33;
        var poseAnalysis = this.analyzePoseAndAnatomy(
          data,
          info.width,
          info.height,
          channels,
          aspectRatioVal
        );
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
      poseAnalysis: typeof poseAnalysis !== 'undefined' ? poseAnalysis : null,
      ...(luminanceStats ? { metrics: luminanceStats } : {})
    };
  }

  /**
   * KD-XX Level 1 Pose & Anatomy Analyzer
   * Evaluates human vertical mass distribution across Upper, Middle, and Lower zones
   * to strictly differentiate between true full-body and cropped upper-body portraits.
   */
  analyzePoseAndAnatomy(data, w, h, channels, aspectRatio) {
    if (!data || w <= 0 || h <= 0 || channels < 3) {
      return {
        isFullBodyDetected: true,
        poseScore: 85,
        zones: {
          upper: { status: 'NORMAL', label: 'Đầu & Vai' },
          middle: { status: 'NORMAL', label: 'Ngực & Thân trên' },
          lower: { status: 'NORMAL', label: 'Hông, Chân & Mắt cá' }
        },
        recommendations: []
      };
    }

    const upperLimit = Math.max(1, Math.floor(h * 0.35));
    const middleLimit = Math.max(upperLimit + 1, Math.floor(h * 0.65));

    const getLuma = (x, y) => {
      const idx = (y * w + x) * channels;
      return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    };

    // Sample background reference from corners
    const bgCorners = [
      getLuma(0, 0),
      getLuma(w - 1, 0),
      getLuma(0, Math.min(4, h - 1)),
      getLuma(w - 1, Math.min(4, h - 1))
    ];
    const meanBgLuma = bgCorners.reduce((a, b) => a + b, 0) / bgCorners.length;

    // Row-by-row foreground activity
    const rowActivity = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let activePixels = 0;
      for (let x = 0; x < w; x++) {
        if (Math.abs(getLuma(x, y) - meanBgLuma) > 16) {
          activePixels++;
        }
      }
      rowActivity[y] = activePixels / w;
    }

    // Zone averages
    let upperActivity = 0;
    for (let y = 0; y < upperLimit; y++) upperActivity += rowActivity[y];
    upperActivity /= upperLimit;

    let middleActivity = 0;
    const midCount = Math.max(1, middleLimit - upperLimit);
    for (let y = upperLimit; y < middleLimit; y++) middleActivity += rowActivity[y];
    middleActivity /= midCount;

    let lowerActivity = 0;
    const lowerCount = Math.max(1, h - middleLimit);
    for (let y = middleLimit; y < h; y++) lowerActivity += rowActivity[y];
    lowerActivity /= lowerCount;

    // Bottom-most 15% activity (ankles, feet, hemline)
    const bottom15Limit = Math.floor(h * 0.85);
    let bottom15Activity = 0;
    const bottom15Count = Math.max(1, h - bottom15Limit);
    for (let y = bottom15Limit; y < h; y++) bottom15Activity += rowActivity[y];
    bottom15Activity /= bottom15Count;

    const issues = [];
    const recommendations = [];
    let poseScore = 95;

    // Aspect ratio check for full body: portrait is mandatory (height >= 1.15 * width)
    const isPortrait = aspectRatio >= 1.15;
    if (!isPortrait) {
      poseScore -= 30;
      issues.push('LANDSCAPE_OR_SQUARE_ASPECT');
      recommendations.push('Chụp ảnh đứng khung dọc (tỷ lệ 3:4 hoặc 9:16) để lấy trọn vẹn toàn thân.');
    }

    // Lower body detection
    const lowerBodyDetected = lowerActivity > 0.06 && bottom15Activity > 0.03 && isPortrait;
    if (!lowerBodyDetected) {
      poseScore -= 35;
      issues.push('LOWER_BODY_TRUNCATED');
      recommendations.push('Ảnh chưa thấy rõ vùng chân và mắt cá chân. Hãy lùi lại để lấy ảnh toàn thân từ đầu đến chân.');
    }

    // Upper body detection
    const upperBodyDetected = upperActivity > 0.04;
    if (!upperBodyDetected) {
      poseScore -= 20;
      issues.push('UPPER_BODY_UNRECOGNIZED');
      recommendations.push('Khu vực đầu và vai chưa rõ ràng. Đảm bảo đứng chính diện.');
    }

    // Symmetry check in middle zone
    let leftActivity = 0;
    let rightActivity = 0;
    const midX = Math.floor(w / 2);
    for (let y = upperLimit; y < middleLimit; y++) {
      for (let x = 0; x < midX; x++) {
        if (Math.abs(getLuma(x, y) - meanBgLuma) > 16) leftActivity++;
      }
      for (let x = midX; x < w; x++) {
        if (Math.abs(getLuma(x, y) - meanBgLuma) > 16) rightActivity++;
      }
    }
    const totalSide = leftActivity + rightActivity;
    const asymmetryRatio = totalSide > 0 ? Math.abs(leftActivity - rightActivity) / totalSide : 0;
    if (asymmetryRatio > 0.50) {
      poseScore -= 10;
      issues.push('ASYMMETRIC_POSE');
      recommendations.push('Đứng thẳng hướng về phía trước, tránh xoay người hoặc nghiêng quá nhiều.');
    }

    const isFullBodyDetected = lowerBodyDetected && upperBodyDetected && isPortrait;
    const finalScore = Math.max(10, Math.min(100, poseScore));

    return {
      isFullBodyDetected,
      poseScore: finalScore,
      zones: {
        upper: {
          status: upperBodyDetected ? 'PASSED' : 'WARNING',
          label: 'Đầu & Vai',
          activity: Number(upperActivity.toFixed(2))
        },
        middle: {
          status: asymmetryRatio <= 0.50 ? 'PASSED' : 'WARNING',
          label: 'Ngực & Thân trên',
          activity: Number(middleActivity.toFixed(2))
        },
        lower: {
          status: lowerBodyDetected ? 'PASSED' : 'FAILED',
          label: 'Hông, Chân & Mắt cá',
          activity: Number(lowerActivity.toFixed(2)),
          bottom15Activity: Number(bottom15Activity.toFixed(2))
        }
      },
      issues,
      recommendations: recommendations.length > 0
        ? recommendations
        : ['Tư thế đứng toàn thân đạt chuẩn vàng cho Full Outfit!']
    };
  }
}

module.exports = new PhotoQualityService();
