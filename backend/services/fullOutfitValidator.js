const sharp = require('sharp');

const TOP_SUBCATEGORIES = new Set(['tops', 't-shirts', 'shirts', 'hoodies', 'jackets', 'outerwear']);
const BOTTOM_SUBCATEGORIES = new Set(['pants', 'jeans', 'skirts', 'shorts']);
const OUTER_LAYER_SUBCATEGORIES = new Set(['jackets', 'outerwear', 'hoodies']);
const DRESS_SUBCATEGORIES = new Set(['dresses']);
const FOOTWEAR_SUBCATEGORIES = new Set(['sneakers', 'boots', 'loafers', 'sandals', 'footwear', 'shoes']);

/**
 * Maps normalized taxonomy to a deterministic Full Outfit slot.
 */
function classifyProductSlot(taxonomy = {}) {
  const domain = String(taxonomy.domain || '').toLowerCase();
  const sub = String(taxonomy.subCategory || '').toLowerCase();

  if (DRESS_SUBCATEGORIES.has(sub)) return 'DRESS';
  if (TOP_SUBCATEGORIES.has(sub)) return 'TOP';
  if (BOTTOM_SUBCATEGORIES.has(sub)) return 'BOTTOM';
  if (domain === 'footwear' || FOOTWEAR_SUBCATEGORIES.has(sub)) return 'FOOTWEAR';
  if (domain === 'accessories') return 'ACCESSORIES';
  return 'UNKNOWN';
}

/**
 * Validates and deterministically orders a 2-piece Full Outfit request.
 * Enforces server-side constraints:
 *  - Exactly 2 unique products: 1 TOP/Outerwear + 1 BOTTOM/Jeans/Pants/Skirt
 *  - Blocks DRESS (Single Item only), FOOTWEAR, ACCESSORIES, NEEDS_REVIEW, CONFLICT
 *  - Ignores any client creditsCost and sets server creditsCost = 2
 */
function validateFullOutfitSelection(itemEntries = []) {
  if (!Array.isArray(itemEntries) || itemEntries.length === 0) {
    const err = new Error('Vui lòng chọn đủ 1 Áo/Áo khoác và 1 Quần/Chân váy cho Full Outfit.');
    err.code = 'INVALID_OUTFIT_ITEMS';
    err.statusCode = 400;
    throw err;
  }

  if (itemEntries.length !== 2) {
    const err = new Error(
      itemEntries.length > 2
        ? 'Full Outfit hiện chỉ hỗ trợ tối đa 2 sản phẩm (1 Áo/Áo khoác + 1 Quần/Chân váy). Giày và Phụ kiện đang bị khóa.'
        : 'Full Outfit yêu cầu đúng 2 sản phẩm gồm 1 Áo/Áo khoác và 1 Quần/Chân váy.'
    );
    err.code = 'INVALID_OUTFIT_COUNT';
    err.statusCode = 400;
    throw err;
  }

  const seenProductIds = new Set();
  const classified = [];

  for (const entry of itemEntries) {
    const product = entry.product;
    const pid = String(product?._id || '');
    if (!pid) {
      const err = new Error('Thiếu mã sản phẩm hợp lệ trong danh sách Full Outfit.');
      err.code = 'PRODUCT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (seenProductIds.has(pid)) {
      const err = new Error('Không thể chọn trùng cùng một sản phẩm hai lần trong Full Outfit.');
      err.code = 'DUPLICATE_OUTFIT_PRODUCT';
      err.statusCode = 400;
      throw err;
    }
    seenProductIds.add(pid);

    if (entry.intelligence?.verificationStatus === 'CONFLICT' || entry.intelligence?.flags?.hasConflicts) {
      const err = new Error(`Sản phẩm "${product.name}" đang có xung đột dữ liệu (CONFLICT), không thể đưa vào Full Outfit.`);
      err.code = 'PRODUCT_INTELLIGENCE_CONFLICT';
      err.statusCode = 400;
      throw err;
    }

    if (
      entry.intelligence?.verificationStatus === 'NEEDS_REVIEW' ||
      entry.intelligence?.flags?.needsReview ||
      entry.taxonomy?.needsReview
    ) {
      const err = new Error(
        entry.taxonomy?.conflictReason ||
        `Sản phẩm "${product.name}" đang chờ Admin rà soát danh mục (NEEDS_REVIEW), chưa thể thử Full Outfit.`
      );
      err.code = 'PRODUCT_NEEDS_REVIEW';
      err.statusCode = 400;
      throw err;
    }

    const slot = classifyProductSlot(entry.taxonomy);
    if (slot === 'DRESS') {
      const err = new Error(
        `Sản phẩm "${product.name}" thuộc nhóm Đầm liền thân (DRESS), chỉ hỗ trợ thử ở chế độ Single Item và không được kết hợp với Áo hoặc Quần.`
      );
      err.code = 'DRESS_SINGLE_ITEM_ONLY';
      err.statusCode = 400;
      throw err;
    }

    if (slot === 'FOOTWEAR') {
      const err = new Error(
        `Sản phẩm "${product.name}" thuộc nhóm Giày (FOOTWEAR) hiện đang khóa trong Full Outfit cho tới khi có provider chuyên biệt được nghiệm thu.`
      );
      err.code = 'FULL_OUTFIT_FOOTWEAR_LOCKED';
      err.statusCode = 400;
      throw err;
    }

    if (slot === 'ACCESSORIES') {
      const err = new Error(
        `Sản phẩm "${product.name}" thuộc nhóm Phụ kiện (ACCESSORIES) hiện chưa hỗ trợ trong Full Outfit.`
      );
      err.code = 'FULL_OUTFIT_ACCESSORIES_LOCKED';
      err.statusCode = 400;
      throw err;
    }

    if (slot !== 'TOP' && slot !== 'BOTTOM') {
      const err = new Error(`Sản phẩm "${product.name}" chưa thuộc nhóm Áo hoặc Quần hợp lệ cho Full Outfit.`);
      err.code = 'UNSUPPORTED_OUTFIT_SLOT';
      err.statusCode = 400;
      throw err;
    }

    if (!entry.productImageUrl) {
      const err = new Error(`Sản phẩm "${product.name}" chưa có ảnh để AI thử đồ.`);
      err.code = 'PRODUCT_IMAGE_MISSING';
      err.statusCode = 400;
      throw err;
    }

    classified.push({
      ...entry,
      slot,
      isOuterLayer: OUTER_LAYER_SUBCATEGORIES.has(String(entry.taxonomy?.subCategory || '').toLowerCase())
    });
  }

  const tops = classified.filter(c => c.slot === 'TOP');
  const bottoms = classified.filter(c => c.slot === 'BOTTOM');

  if (tops.length !== 1 || bottoms.length !== 1) {
    const err = new Error('Full Outfit bắt buộc gồm đúng 1 Áo/Áo khoác và 1 Quần/Chân váy (không chọn 2 món cùng loại).');
    err.code = 'DUPLICATE_OUTFIT_SLOT';
    err.statusCode = 400;
    throw err;
  }

  // Always apply BOTTOM at step 0 and TOP/OUTERWEAR at step 1 so waist/hemline drapes naturally
  const orderedSteps = [
    { ...bottoms[0], stepOrder: 0 },
    { ...tops[0], stepOrder: 1 }
  ];

  return {
    orderedSteps,
    creditsCost: 2
  };
}

/**
 * Validates the person portrait image specifically for Full Outfit try-on.
 * Full outfit requires draping bottoms (pants/jeans/skirts), which mandates a full-length
 * vertical portrait showing the full body (including legs and hips).
 * Aspect ratio width/height must be <= 0.85 (vertical orientation).
 */
function validatePersonImageForOutfit(personAsset = {}) {
  const width = Number(personAsset?.width || 0);
  const height = Number(personAsset?.height || 0);

  if (!width || !height) {
    return { valid: true };
  }

  const aspectRatio = width / height;

  if (aspectRatio > 0.85) {
    const err = new Error(
      `Thử đồ Full Outfit (kèm Quần/Chân váy) yêu cầu ảnh chân dung toàn thân dạng đứng (Full-body Portrait, tỷ lệ khung hình đứng dọc). Ảnh hiện tại có góc chụp quá gần hoặc dạng ngang/vuông (tỉ lệ ${aspectRatio.toFixed(2)}), thiếu phần chân khiến mô hình AI không thể nhận diện tư thế.`
    );
    err.code = 'FULL_BODY_PHOTO_REQUIRED';
    err.statusCode = 400;
    err.details = {
      width,
      height,
      aspectRatio: Number(aspectRatio.toFixed(3)),
      maxAllowedRatio: 0.85
    };
    throw err;
  }

  return {
    valid: true,
    aspectRatio: Number(aspectRatio.toFixed(3))
  };
}

/**
 * Computes average absolute pixel delta on resized 64x64 grayscale thumbnails to catch no-op AI outputs.
 */
async function computeNormalizedDiff(bufA, bufB) {
  if (!bufA || !bufB) return null;
  const [rawA, rawB] = await Promise.all([
    sharp(bufA).resize(64, 64, { fit: 'fill' }).grayscale().raw().toBuffer(),
    sharp(bufB).resize(64, 64, { fit: 'fill' }).grayscale().raw().toBuffer()
  ]);
  const len = Math.min(rawA.length, rawB.length);
  if (!len) return null;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const d = rawA[i] - rawB[i];
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / len);
}

/**
 * Inspects Full Outfit output quality instead of blindly equating HTTP 200 with visual success.
 */
async function inspectFullOutfitResultQuality({ originalBuffer, intermediateBuffer, finalBuffer } = {}) {
  const checkedAt = new Date();
  const warnings = [];
  const metrics = {};

  if (!finalBuffer || !Buffer.isBuffer(finalBuffer) || finalBuffer.length === 0) {
    return {
      status: 'FAILED',
      warnings: ['EMPTY_RESULT_BUFFER'],
      notes: 'Không có dữ liệu ảnh kết quả đầu ra để kiểm tra chất lượng.',
      checkedAt,
      metrics
    };
  }

  try {
    const [finalMeta, finalStats, origMeta] = await Promise.all([
      sharp(finalBuffer).metadata(),
      sharp(finalBuffer).stats(),
      originalBuffer ? sharp(originalBuffer).metadata().catch(() => null) : Promise.resolve(null)
    ]);

    metrics.finalWidth = finalMeta.width || 0;
    metrics.finalHeight = finalMeta.height || 0;
    metrics.finalFormat = finalMeta.format || '';

    if (metrics.finalWidth < 128 || metrics.finalHeight < 128) {
      warnings.push('LOW_OUTPUT_RESOLUTION');
    }

    const channelStdevs = (finalStats.channels || []).slice(0, 3).map(c => Number(c.stdev || 0));
    metrics.minChannelStdDev = channelStdevs.length ? Math.min(...channelStdevs) : 0;
    if (metrics.minChannelStdDev < 4) {
      warnings.push('FLAT_OR_BLANK_OUTPUT');
    }

    if (origMeta?.width && origMeta?.height && metrics.finalWidth && metrics.finalHeight) {
      const origRatio = origMeta.width / origMeta.height;
      const finalRatio = metrics.finalWidth / metrics.finalHeight;
      const ratioDrift = Math.abs(finalRatio - origRatio) / origRatio;
      metrics.aspectRatioDrift = Number(ratioDrift.toFixed(4));
      if (ratioDrift > 0.08) {
        warnings.push('ASPECT_RATIO_DRIFT');
      }
    }

    const [diffVsOriginal, diffVsIntermediate] = await Promise.all([
      computeNormalizedDiff(originalBuffer, finalBuffer).catch(() => null),
      computeNormalizedDiff(intermediateBuffer, finalBuffer).catch(() => null)
    ]);

    if (diffVsOriginal !== null) {
      metrics.rmsDiffVsOriginal = Number(diffVsOriginal.toFixed(2));
      if (diffVsOriginal < 1.5) {
        warnings.push('NO_VISIBLE_CHANGE_VS_ORIGINAL');
      }
    }

    if (diffVsIntermediate !== null) {
      metrics.rmsDiffVsIntermediate = Number(diffVsIntermediate.toFixed(2));
      if (diffVsIntermediate < 1.0) {
        warnings.push('NO_VISIBLE_CHANGE_STEP2');
      }
    }

    const status = warnings.includes('FLAT_OR_BLANK_OUTPUT') ? 'FAILED' : warnings.length > 0 ? 'WARNING' : 'PASSED';
    const notes = warnings.length > 0
      ? `Phát hiện dấu hiệu sai lệch cần lưu ý ở kết quả ghép tuần tự (${warnings.join(', ')}).`
      : 'Ảnh kết quả Full Outfit vượt qua kiểm tra kỹ thuật cơ bản (kích thước, tỷ lệ khung hình, tương phản & thay đổi giữa 2 bước).';

    return {
      status,
      warnings,
      notes,
      checkedAt,
      metrics
    };
  } catch (err) {
    return {
      status: 'FAILED',
      warnings: ['QUALITY_INSPECTION_ERROR'],
      notes: `Không thể phân tích chất lượng ảnh đầu ra: ${err.message}`,
      checkedAt,
      metrics
    };
  }
}

module.exports = {
  TOP_SUBCATEGORIES,
  BOTTOM_SUBCATEGORIES,
  DRESS_SUBCATEGORIES,
  classifyProductSlot,
  validateFullOutfitSelection,
  validatePersonImageForOutfit,
  inspectFullOutfitResultQuality
};
