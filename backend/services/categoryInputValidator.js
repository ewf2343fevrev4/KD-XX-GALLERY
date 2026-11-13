const { normalizeCategoryKey } = require('./providers/TryOnProviderRegistry');

const CATEGORY_SPECIFIC_RULES = {
  clothing: {
    label: 'Clothing (Quần / Áo / Đầm / Áo khoác)',
    requireUpperOrFullBody: true,
    requireFeetVisible: false,
    requireFaceVisible: false,
    guidance: 'Ảnh toàn thân hoặc bán thân rõ vai & thân áo; nền sáng/đơn giản; trang phục rõ phom.'
  },
  footwear: {
    label: 'Footwear (Giày / Boots / Sandals)',
    requireUpperOrFullBody: false,
    requireFeetVisible: true,
    requireFaceVisible: false,
    guidance: 'Cần ảnh thấy rõ cả bàn chân/cổ chân ở góc chính diện hoặc chếch 3/4, nền sạch.'
  },
  eyewear: {
    label: 'Eyewear (Kính mắt / Kính râm)',
    requireUpperOrFullBody: false,
    requireFeetVisible: false,
    requireFaceVisible: true,
    guidance: 'Cần ảnh chân dung chính diện rõ mắt, sống mũi, hai bên thái dương và không bị tóc/tay che.'
  },
  bags: {
    label: 'Bags (Túi xách)',
    guidance: 'Phụ kiện cầm tay / đeo vai cần AI nhận diện tư thế tay & tỷ lệ cơ thể chuẩn xác.'
  },
  belts: {
    label: 'Belts (Thắt lưng)',
    guidance: 'Cần ảnh rõ vùng eo/cạp quần và provider bảo toàn khóa logo chuyên biệt.'
  },
  hats: {
    label: 'Hats (Mũ / Nón)',
    guidance: 'Cần ảnh thấy rõ đỉnh đầu và không bị cắt mép trên.'
  },
  jewelry: {
    label: 'Jewelry (Trang sức / Nhẫn / Dây chuyền)',
    guidance: 'Trang sức nhỏ cần độ phân giải cao vùng cổ/ngón tay và AR landmark chuyên dụng.'
  },
  watches: {
    label: 'Watches (Đồng hồ)',
    guidance: 'Cần ảnh cận cổ tay hoặc wrist-tracking AR chuyên dụng.'
  },
  wallets: {
    label: 'Wallets / Card Holders',
    guidance: 'Ví/Card holder là phụ kiện cầm tay, chưa phù hợp VTO toàn thân.'
  },
  keychains: {
    label: 'Keychains (Móc khóa)',
    guidance: 'Phụ kiện nhỏ cầm tay, chưa có quy trình AI Try-On được xác minh.'
  },
  socks: {
    label: 'Socks (Tất / Vớ)',
    guidance: 'Cần ảnh bàn chân/bắp chân và provider Footwear/Legwear chuyên biệt.'
  },
  other_accessories: {
    label: 'Accessories',
    guidance: 'Chưa có AI Try-On provider được xác minh cho nhóm phụ kiện này.'
  },
  unknown: {
    label: 'Unclassified',
    guidance: 'Chưa xác định danh mục sản phẩm rõ ràng.'
  }
};

class CategoryInputValidator {
  /**
   * Enforce strict Category + Capability + Input Validation BEFORE credit reservation or provider calls.
   */
  validate({ category = '', domain = '', subCategory = '', routingSupport = null, personAsset = null, product = null, intelligence = null, productImageUrl = '' } = {}) {
    const errors = [];
    const warnings = [];
    const key = normalizeCategoryKey(subCategory || category, domain);
    const rules = CATEGORY_SPECIFIC_RULES[key] || CATEGORY_SPECIFIC_RULES.unknown;

    if (!routingSupport || !routingSupport.allowSubmit) {
      return {
        valid: false,
        categoryKey: key,
        code: routingSupport?.blockCode || 'UNSUPPORTED_CATEGORY',
        message: routingSupport?.reason || 'Danh mục này hiện chưa hỗ trợ Virtual Try-On.',
        errors: [routingSupport?.reason || 'Danh mục chưa sẵn sàng.'],
        warnings: []
      };
    }

    if (!productImageUrl || !/^https?:\/\//i.test(String(productImageUrl))) {
      errors.push('Sản phẩm chưa có URL ảnh hợp lệ để gửi tới AI Try-On.');
    }

    if (!personAsset) {
      errors.push('Thiếu ảnh người dùng hợp lệ.');
    } else {
      const mime = String(personAsset.mimeType || '').toLowerCase();
      if (mime && !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        errors.push(`Định dạng ảnh người dùng (${mime}) chưa được provider hỗ trợ trực tiếp (chấp nhận JPEG/PNG/WebP).`);
      }

      const w = Number(personAsset.width || 0);
      const h = Number(personAsset.height || 0);
      if ((w > 0 && w < 256) || (h > 0 && h < 256)) {
        errors.push(`Ảnh người dùng quá nhỏ (${w}x${h}px). Yêu cầu tối thiểu 256px để đảm bảo tỷ lệ giải phẫu.`);
      }
      if (w > 0 && h > 0) {
        const ratio = w / h;
        if (ratio < 0.3 || ratio > 3.2) {
          warnings.push('Tỷ lệ khung hình ảnh hơi hẹp hoặc quá ngang; ảnh đứng dọc 3:4 cho kết quả ổn định hơn.');
        }
      }

      if (key === 'footwear' && w > 0 && h > 0 && w / h > 1.25) {
        warnings.push('Thử giày cần ảnh toàn thân thấy rõ hai bàn chân.');
      }

      if (key === 'eyewear' && w > 0 && h > 0 && h / w > 2.2) {
        warnings.push('Thử kính nên dùng ảnh chân dung cận mặt nhìn thẳng.');
      }
    }

    if (intelligence?.flags?.missingImages) {
      errors.push('Sản phẩm chưa có ảnh chuẩn hợp lệ trong Product Intelligence.');
    }

    if (intelligence?.verificationStatus === 'CONFLICT') {
      errors.push('Hồ sơ sản phẩm đang có xung đột dữ liệu nghiêm trọng (CONFLICT), cần Admin xử lý trước khi tạo Try-On.');
    }

    if (intelligence?.verificationStatus === 'NEEDS_REVIEW' || intelligence?.flags?.needsReview || intelligence?.normalizedCategory?.needsReview) {
      errors.push(
        intelligence?.normalizedCategory?.conflictReason ||
        'Danh mục sản phẩm có dấu hiệu mơ hồ (NEEDS_REVIEW), cần Admin xác nhận trước khi bật Try-On.'
      );
    }

    return {
      valid: errors.length === 0,
      categoryKey: key,
      code: errors.length > 0 ? 'CATEGORY_INPUT_INVALID' : 'OK',
      message: errors[0] || '',
      guidance: rules.guidance,
      errors,
      warnings
    };
  }
}

module.exports = new CategoryInputValidator();
module.exports.CategoryInputValidator = CategoryInputValidator;
module.exports.CATEGORY_SPECIFIC_RULES = CATEGORY_SPECIFIC_RULES;
