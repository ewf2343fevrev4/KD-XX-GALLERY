export const SUPPORT_STATUS_META = {
  VERIFIED: {
    label: 'VERIFIED',
    shortLabel: 'Hỗ Trợ Đầy Đủ',
    badgeClass: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300',
    bannerClass: 'bg-emerald-950/30 border-emerald-500/30 text-emerald-100'
  },
  LIMITED: {
    label: 'LIMITED',
    shortLabel: 'Tạm Khóa (Limited)',
    badgeClass: 'bg-amber-500/20 border-amber-400/40 text-amber-300',
    bannerClass: 'bg-amber-950/40 border-amber-500/40 text-amber-100'
  },
  EXPERIMENTAL: {
    label: 'EXPERIMENTAL',
    shortLabel: 'Thử Nghiệm (Chưa Bật)',
    badgeClass: 'bg-purple-500/20 border-purple-400/40 text-purple-200',
    bannerClass: 'bg-purple-950/40 border-purple-500/40 text-purple-100'
  },
  NOT_CONFIGURED: {
    label: 'NOT_CONFIGURED',
    shortLabel: 'Chưa Cấu Hình AI',
    badgeClass: 'bg-slate-600/30 border-slate-400/30 text-slate-300',
    bannerClass: 'bg-slate-900/70 border-slate-500/40 text-slate-200'
  },
  UNSUPPORTED: {
    label: 'UNSUPPORTED',
    shortLabel: 'Chưa Hỗ Trợ AI',
    badgeClass: 'bg-red-500/20 border-red-400/40 text-red-300',
    bannerClass: 'bg-red-950/40 border-red-500/40 text-red-100'
  },
  DEPRECATED: {
    label: 'DEPRECATED',
    shortLabel: 'Ngừng Hỗ Trợ',
    badgeClass: 'bg-red-600/25 border-red-400/50 text-red-200',
    bannerClass: 'bg-red-950/50 border-red-500/50 text-red-100'
  },
  NEEDS_REVIEW: {
    label: 'NEEDS_REVIEW',
    shortLabel: 'Cần Rà Soát Danh Mục',
    badgeClass: 'bg-amber-500/25 border-amber-400/50 text-amber-200',
    bannerClass: 'bg-amber-950/50 border-amber-500/50 text-amber-100'
  }
};

function inferCategoryKey(product = {}) {
  if (product.categorySupport?.categoryKey) {
    return product.categorySupport.categoryKey;
  }
  const sub = String(product.taxonomy?.subCategory || product.subCategory || '').toLowerCase();
  const domain = String(product.taxonomy?.domain || '').toLowerCase();
  const cat = String(product.category || '').toLowerCase();
  const text = `${product.name || ''} ${Array.isArray(product.tags) ? product.tags.join(' ') : ''}`.toLowerCase();

  if (domain === 'footwear' || cat === 'shoes' || ['sneakers', 'boots', 'loafers', 'sandals'].includes(sub) || /\b(sneaker|shoe|boot|loafer|sandal)\b/.test(text)) {
    return 'footwear';
  }
  if (['eyewear', 'sunglasses'].includes(sub) || /\b(sunglass|eyewear|eyeglass|glasses)\b/.test(text)) {
    return 'eyewear';
  }
  if (sub === 'bags' || /\bbag(s)?\b/.test(text)) return 'bags';
  if (sub === 'hats' || /\b(hat|cap|beanie)\b/.test(text)) return 'hats';
  if (['jewelry', 'necklaces', 'rings'].includes(sub) || /\b(jewelry|necklace|ring|bracelet|earring)\b/.test(text)) return 'jewelry';
  if (sub === 'watches' || /\bwatch(es)?\b/.test(text)) return 'watches';
  if (sub === 'belts' || /\bbelt(s)?\b/.test(text)) return 'belts';
  if (sub === 'wallets' || /\b(wallet|card holder|bifold)\b/.test(text)) return 'wallets';
  if (sub === 'keychains' || /\bkeychain(s)?\b/.test(text)) return 'keychains';
  if (sub === 'socks' || /\bsock(s)?\b/.test(text)) return 'socks';
  if (cat === 'accessories' || domain === 'accessories') return 'other_accessories';

  return 'clothing';
}

export function evaluateFrontendCategorySupport(product, categoryMatrix = []) {
  if (!product) {
    return {
      status: 'UNSUPPORTED',
      allowSubmit: false,
      categoryKey: 'unknown',
      reason: 'Chưa chọn sản phẩm.'
    };
  }

  if (product.categorySupport && product.categorySupport.status) {
    const cs = product.categorySupport;
    if (cs.hasConflicts) {
      return {
        ...cs,
        displayStatus: 'CONFLICT',
        allowSubmit: false,
        reason: cs.reason || 'Hồ sơ sản phẩm có xung đột dữ liệu (CONFLICT), cần Admin xử lý trước khi bật Try-On.'
      };
    }
    if (cs.needsReview) {
      return {
        ...cs,
        displayStatus: 'NEEDS_REVIEW',
        allowSubmit: false,
        reason: cs.reason || 'Danh mục sản phẩm có xung đột tag (NEEDS_REVIEW), cần Admin xác nhận trước.'
      };
    }
    return {
      ...cs,
      displayStatus: cs.status
    };
  }

  const categoryKey = inferCategoryKey(product);
  const needsReview = Boolean(product.taxonomy?.needsReview || product.intelligence?.needsReview);
  const hasConflicts = Boolean(product.intelligence?.hasConflicts || product.intelligence?.verificationStatus === 'CONFLICT');

  if (hasConflicts) {
    return {
      status: 'UNSUPPORTED',
      displayStatus: 'CONFLICT',
      allowSubmit: false,
      categoryKey,
      reason: 'Hồ sơ sản phẩm đang có xung đột dữ liệu (CONFLICT).'
    };
  }

  if (needsReview) {
    return {
      status: 'UNSUPPORTED',
      displayStatus: 'NEEDS_REVIEW',
      allowSubmit: false,
      categoryKey,
      reason: product.taxonomy?.conflictReason || 'Danh mục sản phẩm đang chờ Admin rà soát (NEEDS_REVIEW).'
    };
  }

  if (Array.isArray(categoryMatrix) && categoryMatrix.length > 0) {
    const match = categoryMatrix.find((m) => m.key === categoryKey);
    if (match) {
      return {
        ...match,
        categoryKey: match.key,
        displayStatus: match.status
      };
    }
  }

  if (categoryKey === 'clothing') {
    return {
      categoryKey: 'clothing',
      status: 'VERIFIED',
      displayStatus: 'VERIFIED',
      allowSubmit: true,
      providerId: 'google-vertex-vto-001',
      providerName: 'Google Cloud Vertex AI',
      modelId: 'virtual-try-on-001',
      reason: 'Hỗ trợ thử đơn món trang phục qua Google Cloud virtual-try-on-001.'
    };
  }

  if (categoryKey === 'footwear') {
    return {
      categoryKey: 'footwear',
      status: 'LIMITED',
      displayStatus: 'LIMITED',
      allowSubmit: false,
      reason: product.taxonomy?.supportReason || 'Giày dép (Footwear) hiện ở mức LIMITED và đang tắt mặc định tới khi có provider chuyên biệt được xác minh.'
    };
  }

  if (categoryKey === 'eyewear') {
    return {
      categoryKey: 'eyewear',
      status: 'NOT_CONFIGURED',
      displayStatus: 'NOT_CONFIGURED',
      allowSubmit: false,
      reason: product.taxonomy?.supportReason || 'Kính mắt (Eyewear) cần AI provider định vị khuôn mặt chuyên biệt (hiện chưa cấu hình).'
    };
  }

  return {
    categoryKey,
    status: 'UNSUPPORTED',
    displayStatus: 'UNSUPPORTED',
    allowSubmit: false,
    reason: product.taxonomy?.supportReason || 'Phụ kiện này chưa có AI Try-On provider được xác minh.'
  };
}

const FRONTEND_TOP_SUBS = new Set(['tops', 't-shirts', 'shirts', 'hoodies', 'jackets', 'outerwear']);
const FRONTEND_BOTTOM_SUBS = new Set(['pants', 'jeans', 'skirts', 'shorts']);

export function classifyFrontendOutfitSlot(product = {}) {
  if (!product) return 'UNKNOWN';
  const sub = String(product.taxonomy?.subCategory || product.subCategory || '').toLowerCase();
  const domain = String(product.taxonomy?.domain || '').toLowerCase();
  const cat = String(product.category || '').toLowerCase();
  const text = `${product.name || ''} ${Array.isArray(product.tags) ? product.tags.join(' ') : ''}`.toLowerCase();

  if (sub === 'dresses' || /\b(dress|gown|đầm)\b/.test(text)) return 'DRESS';
  if (FRONTEND_TOP_SUBS.has(sub)) return 'TOP';
  if (FRONTEND_BOTTOM_SUBS.has(sub)) return 'BOTTOM';
  if (domain === 'footwear' || cat === 'shoes' || ['sneakers', 'boots', 'loafers', 'sandals'].includes(sub)) {
    return 'FOOTWEAR';
  }
  if (domain === 'accessories' || cat === 'accessories') return 'ACCESSORIES';
  if (/\b(jean|denim|pant|trouser|skirt|short|quần|chân váy)\b/.test(text)) return 'BOTTOM';
  if (/\b(jacket|bomber|hoodie|shirt|t-shirt|tee|outerwear|coat|áo)\b/.test(text)) return 'TOP';
  return 'UNKNOWN';
}

export function evaluateFullOutfitSupport(accountData = null) {
  const matrix = accountData?.categoryMatrix || [];
  const fullRow = Array.isArray(matrix) ? matrix.find((m) => m.key === 'full_outfit') : null;
  if (fullRow && fullRow.allowSubmit) {
    return {
      ...fullRow,
      displayStatus: fullRow.status || 'VERIFIED',
      requiredCredits: 2
    };
  }
  // Isolated Admin-Only Controlled Benchmark Mode (backend-verified, default OFF)
  if (accountData?.isUnlimited && accountData?.fullOutfitBenchmark?.canSubmit) {
    return {
      ...(fullRow || {}),
      key: 'full_outfit',
      status: 'LIMITED',
      displayStatus: 'BENCHMARK_ADMIN_ONLY',
      allowSubmit: true,
      isBenchmarkMode: true,
      blockCode: null,
      requiredCredits: 2,
      reason: 'Chế độ Admin Benchmark có kiểm soát đang bật từ cấu hình backend.'
    };
  }
  if (fullRow) {
    return {
      ...fullRow,
      displayStatus: fullRow.status || 'LIMITED',
      requiredCredits: 2
    };
  }
  return {
    key: 'full_outfit',
    status: 'LIMITED',
    displayStatus: 'LIMITED',
    blockCode: 'FULL_OUTFIT_PENDING_BENCHMARK',
    allowSubmit: false,
    requiredCredits: 2,
    reason: 'Full Outfit (Áo + Quần) đang chờ nghiệm thu Benchmark với provider thật trước khi Admin kích hoạt.'
  };
}
