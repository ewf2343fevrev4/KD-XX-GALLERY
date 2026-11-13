/**
 * Canonical Category Taxonomy & Non-Breaking Mapping Layer for KD-XX Virtual Try-On.
 *
 * Preserves legacy `Product.category` values ('men', 'women', 'accessories', 'shoes', 'clothing')
 * on storefront catalog pages while normalizing items to standardized VTO taxonomy categories.
 */

const CLOTHING_SUBCATEGORIES = [
  'tops',
  't-shirts',
  'shirts',
  'hoodies',
  'jackets',
  'outerwear',
  'pants',
  'jeans',
  'shorts',
  'skirts',
  'dresses'
];

const FOOTWEAR_SUBCATEGORIES = [
  'sneakers',
  'boots',
  'loafers',
  'sandals'
];

const ACCESSORIES_SUBCATEGORIES = [
  'eyewear',
  'sunglasses',
  'belts',
  'bags',
  'wallets',
  'keychains',
  'socks',
  'jewelry',
  'necklaces',
  'rings',
  'watches',
  'hats',
  'other_accessories'
];

const ALL_SUBCATEGORIES = new Set([
  ...CLOTHING_SUBCATEGORIES,
  ...FOOTWEAR_SUBCATEGORIES,
  ...ACCESSORIES_SUBCATEGORIES
]);

const SUBCATEGORY_TO_DOMAIN = new Map([
  ...CLOTHING_SUBCATEGORIES.map(c => [c, 'clothing']),
  ...FOOTWEAR_SUBCATEGORIES.map(c => [c, 'footwear']),
  ...ACCESSORIES_SUBCATEGORIES.map(c => [c, 'accessories'])
]);

const SUBCATEGORY_TO_FILTER_GROUP = new Map([
  ['tops', 'tops'],
  ['t-shirts', 'tops'],
  ['shirts', 'tops'],
  ['hoodies', 'tops'],
  ['jackets', 'tops'],
  ['outerwear', 'tops'],
  ['dresses', 'tops'],
  ['pants', 'bottoms'],
  ['jeans', 'bottoms'],
  ['shorts', 'bottoms'],
  ['skirts', 'bottoms'],
  ['sneakers', 'shoes'],
  ['boots', 'shoes'],
  ['loafers', 'shoes'],
  ['sandals', 'shoes'],
  ['eyewear', 'eyewear'],
  ['sunglasses', 'eyewear'],
  ['belts', 'accessories'],
  ['bags', 'accessories'],
  ['wallets', 'accessories'],
  ['keychains', 'accessories'],
  ['socks', 'accessories'],
  ['jewelry', 'accessories'],
  ['necklaces', 'accessories'],
  ['rings', 'accessories'],
  ['watches', 'accessories'],
  ['hats', 'accessories'],
  ['other_accessories', 'accessories']
]);

/**
 * Build a Unicode-safe word-boundary regex because JavaScript `\b` is ASCII-only
 * and breaks on Vietnamese diacritics (e.g. `/\bvớ\b/i` falsely matching `"với"`).
 */
function unicodeWordRx(phrase) {
  const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
}

// Ordered rules: more specific categories appear before broader ones (e.g. t-shirts before shirts, sunglasses before eyewear).
const TAXONOMY_RULES = [
  // Accessories — Eyewear & Small/Wearable Accessories
  { subCategory: 'sunglasses', patterns: [/\bsunglasses\b/i, /\bsunglass\b/i, unicodeWordRx('kính râm'), unicodeWordRx('kính mát')] },
  { subCategory: 'eyewear', patterns: [/\beyewear\b/i, /\beyeglass(es)?\b/i, unicodeWordRx('gọng kính'), unicodeWordRx('mắt kính')] },
  { subCategory: 'wallets', patterns: [/\bwallet(s)?\b/i, /\bcard\s?holder(s)?\b/i, /\bbifold\b/i, unicodeWordRx('ví da'), unicodeWordRx('ví cầm tay'), unicodeWordRx('ví')] },
  { subCategory: 'keychains', patterns: [/\bkeychain(s)?\b/i, /\bkey\s?ring(s)?\b/i, unicodeWordRx('móc khóa')] },
  { subCategory: 'socks', patterns: [/\bsock(s)?\b/i, /(?<![\p{L}\p{N}_])tất(?!\s+cả)(?![\p{L}\p{N}_])/iu, unicodeWordRx('vớ')] },
  { subCategory: 'belts', patterns: [/\bbelt(s)?\b/i, unicodeWordRx('thắt lưng'), unicodeWordRx('dây nịt')] },
  { subCategory: 'bags', patterns: [/\bbag(s)?\b/i, /\bbackpack(s)?\b/i, /\btote(s)?\b/i, /\bclutch(es)?\b/i, /\bduffle\b/i, unicodeWordRx('túi xách'), unicodeWordRx('túi')] },
  { subCategory: 'necklaces', patterns: [/\bnecklace(s)?\b/i, /\bpendant(s)?\b/i, unicodeWordRx('dây chuyền')] },
  { subCategory: 'rings', patterns: [/\bring(s)?\b/i, unicodeWordRx('nhẫn')] },
  { subCategory: 'jewelry', patterns: [/\bjewelry\b/i, /\bjewellery\b/i, /\bbracelet(s)?\b/i, /\bearring(s)?\b/i, unicodeWordRx('trang sức')] },
  { subCategory: 'watches', patterns: [/\bwatch(es)?\b/i, /\btimepiece\b/i, unicodeWordRx('đồng hồ')] },
  { subCategory: 'hats', patterns: [/\bhat(s)?\b/i, /\bcap(s)?\b/i, /\bbeanie(s)?\b/i, /\bbucket\s?hat\b/i, unicodeWordRx('mũ'), unicodeWordRx('nón')] },
  { subCategory: 'other_accessories', patterns: [/\bscarf\b/i, unicodeWordRx('khăn')] },

  // Footwear
  { subCategory: 'sneakers', patterns: [/\bsneaker(s)?\b/i, /\brunner(s)?\b/i, /\btrainer(s)?\b/i, /\bskate shoe\b/i, unicodeWordRx('giày sneaker'), unicodeWordRx('giày thể thao')] },
  { subCategory: 'boots', patterns: [/\bboot(s)?\b/i, /\bchelsea\b/i, unicodeWordRx('giày boot')] },
  { subCategory: 'loafers', patterns: [/\bloafer(s)?\b/i, /\bmoccasin(s)?\b/i, unicodeWordRx('giày lười')] },
  { subCategory: 'sandals', patterns: [/\bsandal(s)?\b/i, /\bslide(s)?\b/i, unicodeWordRx('dép')] },

  // Clothing — Specific silhouettes first
  { subCategory: 'dresses', patterns: [/\bdress(es)?\b/i, /\bgown(s)?\b/i, unicodeWordRx('váy body'), unicodeWordRx('đầm')] },
  { subCategory: 'skirts', patterns: [/\bskirt(s)?\b/i, unicodeWordRx('chân váy')] },
  { subCategory: 'jeans', patterns: [/\bjean(s)?\b/i, /\bdenim\b/i, unicodeWordRx('quần jean')] },
  { subCategory: 'shorts', patterns: [/\bshort(s)?\b/i, unicodeWordRx('quần short'), unicodeWordRx('quần đùi')] },
  { subCategory: 'pants', patterns: [/\bpant(s)?\b/i, /\btrouser(s)?\b/i, /\bjogger(s)?\b/i, /\bsweatpant(s)?\b/i, unicodeWordRx('quần dài'), unicodeWordRx('quần tây'), unicodeWordRx('quần')] },
  { subCategory: 'hoodies', patterns: [/\bhoodie(s)?\b/i, /\bsweatshirt(s)?\b/i, /\bpullover\b/i, unicodeWordRx('áo hoodie')] },
  { subCategory: 'jackets', patterns: [/\bjacket(s)?\b/i, /\bbomber(s)?\b/i, /\bpuffer(s)?\b/i, /\bdown\b/i, /\bblazer(s)?\b/i, unicodeWordRx('áo khoác')] },
  { subCategory: 'outerwear', patterns: [/\bouterwear\b/i, /\bcoat(s)?\b/i, /\bovercoat\b/i, /\btrench\b/i, /\bparka\b/i] },
  { subCategory: 't-shirts', patterns: [/\bt-shirt(s)?\b/i, /\btee(s)?\b/i, unicodeWordRx('áo thun'), unicodeWordRx('áo phông')] },
  { subCategory: 'shirts', patterns: [/\bshirt(s)?\b/i, /\bpolo\b/i, /\bbowling\b/i, unicodeWordRx('áo sơ mi')] },
  { subCategory: 'tops', patterns: [/\btop(s)?\b/i, /\bsweater(s)?\b/i, /\bknit(wear)?\b/i, /\bcardigan\b/i, unicodeWordRx('áo len')] }
];

const SUPPORT_MATRIX = new Map([
  ...CLOTHING_SUBCATEGORIES.map(c => [
    c,
    {
      tryOnSupportLevel: 'DIRECT',
      supportReason: 'virtual-try-on-001 hỗ trợ trực tiếp nhóm trang phục (Single Item).'
    }
  ]),
  ...FOOTWEAR_SUBCATEGORIES.map(c => [
    c,
    {
      tryOnSupportLevel: 'EXPERIMENTAL',
      supportReason: 'virtual-try-on-001 tối ưu cho quần áo; giày có thể thử nghiệm nhưng có rủi ro biến dạng mũi/đế — cần Footwear provider chuyên biệt ở Phase 3+.'
    }
  ]),
  ['eyewear', {
    tryOnSupportLevel: 'NEEDS_SPECIALIZED_PROVIDER',
    supportReason: 'virtual-try-on-001 không hỗ trợ trực tiếp kính mắt; cần Eyewear/Face-Landmark provider ở Phase 3+.'
  }],
  ['sunglasses', {
    tryOnSupportLevel: 'NEEDS_SPECIALIZED_PROVIDER',
    supportReason: 'virtual-try-on-001 không hỗ trợ trực tiếp kính râm; cần Eyewear/Face-Landmark provider ở Phase 3+.'
  }],
  ['belts', {
    tryOnSupportLevel: 'NEEDS_SPECIALIZED_PROVIDER',
    supportReason: 'Thắt lưng cần provider chỉnh ảnh chuyên biệt để không làm biến dạng mặt khóa logo.'
  }],
  ['bags', {
    tryOnSupportLevel: 'NEEDS_SPECIALIZED_PROVIDER',
    supportReason: 'Túi xách cần provider hiểu ngữ cảnh đeo vai/cầm tay.'
  }],
  ['watches', {
    tryOnSupportLevel: 'NEEDS_SPECIALIZED_PROVIDER',
    supportReason: 'Đồng hồ cần AR cổ tay hoặc model chi tiết nhỏ chuyên biệt.'
  }],
  ['hats', {
    tryOnSupportLevel: 'NEEDS_SPECIALIZED_PROVIDER',
    supportReason: 'Mũ/nón cần phân vùng đầu/tóc hoặc Gemini Multimodal Edit.'
  }],
  ['jewelry', {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Trang sức kích thước nhỏ chưa có AI Try-On bảo toàn chi tiết ổn định.'
  }],
  ['necklaces', {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Dây chuyền kích thước nhỏ dễ bị AI biến dạng chi tiết kim loại/đá.'
  }],
  ['rings', {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Nhẫn kích thước siêu nhỏ chưa phù hợp thử qua VTO toàn thân.'
  }],
  ['wallets', {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Ví/Card holder là phụ kiện cầm tay, chưa có AI Try-On được xác minh.'
  }],
  ['keychains', {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Móc khóa / phụ kiện kim loại nhỏ chưa được AI Try-On hỗ trợ trực tiếp.'
  }],
  ['socks', {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Tất/vớ chưa có model AI Try-On chuyên biệt được xác minh.'
  }],
  ['other_accessories', {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Phụ kiện nhỏ chưa có quy trình AI Try-On được xác minh.'
  }]
]);

function normalizeCandidateSlug(raw = '') {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  const aliases = {
    'tshirt': 't-shirts',
    'tshirts': 't-shirts',
    't-shirt': 't-shirts',
    'shirt': 'shirts',
    'hoodie': 'hoodies',
    'jacket': 'jackets',
    'pant': 'pants',
    'trousers': 'pants',
    'jean': 'jeans',
    'short': 'shorts',
    'skirt': 'skirts',
    'dress': 'dresses',
    'top': 'tops',
    'sneaker': 'sneakers',
    'boot': 'boots',
    'loafer': 'loafers',
    'sandal': 'sandals',
    'sunglass': 'sunglasses',
    'glasses': 'eyewear',
    'belt': 'belts',
    'bag': 'bags',
    'wallet': 'wallets',
    'card holder': 'wallets',
    'card-holders': 'wallets',
    'necklace': 'necklaces',
    'ring': 'rings',
    'watch': 'watches',
    'hat': 'hats',
    'keychain': 'keychains',
    'keychains': 'keychains',
    'sock': 'socks',
    'socks': 'socks',
    'other-accessories': 'other_accessories'
  };

  if (aliases[cleaned]) return aliases[cleaned];
  if (ALL_SUBCATEGORIES.has(cleaned)) return cleaned;
  return '';
}

function matchTaxonomyFromStrings(textList = []) {
  for (const raw of textList) {
    const slug = normalizeCandidateSlug(raw);
    if (slug) return slug;
  }
  const combined = textList.filter(Boolean).join(' ');
  for (const rule of TAXONOMY_RULES) {
    if (rule.patterns.some(rx => rx.test(combined))) {
      return rule.subCategory;
    }
  }
  return '';
}

function areSubcategoriesCompatible(subA, subB) {
  if (!subA || !subB || subA === subB) return true;
  const clothingOuters = new Set(['jackets', 'outerwear']);
  const clothingTops = new Set(['tops', 't-shirts', 'shirts', 'hoodies']);
  const clothingBottoms = new Set(['pants', 'jeans']);
  const eyewearGroup = new Set(['sunglasses', 'eyewear']);
  if (clothingOuters.has(subA) && clothingOuters.has(subB)) return true;
  if (clothingTops.has(subA) && clothingTops.has(subB)) return true;
  if (clothingBottoms.has(subA) && clothingBottoms.has(subB)) return true;
  if (eyewearGroup.has(subA) && eyewearGroup.has(subB)) return true;
  return false;
}

function collectAllMatchesFromList(textList = []) {
  const found = [];
  for (const raw of textList) {
    if (!raw) continue;
    const slug = normalizeCandidateSlug(raw);
    if (slug && !found.includes(slug)) {
      found.push(slug);
      continue;
    }
    for (const rule of TAXONOMY_RULES) {
      if (rule.patterns.some(rx => rx.test(String(raw))) && !found.includes(rule.subCategory)) {
        found.push(rule.subCategory);
      }
    }
  }
  return found;
}

/**
 * Map a legacy KD-XX Product record onto standardized Category Taxonomy
 * without mutating `product.category`.
 */
function mapProductCategory(product = {}, overrideSubCategory = '') {
  const catalogCategory = String(product.category || '').trim().toLowerCase();
  const explicitOverride = normalizeCandidateSlug(overrideSubCategory || product.subCategory);

  let subCategory = '';
  let mappingSource = 'UNCLASSIFIED';
  let needsReview = false;
  let conflictReason = '';

  if (explicitOverride) {
    subCategory = explicitOverride;
    mappingSource = overrideSubCategory ? 'ADMIN' : 'EXPLICIT';
  } else {
    const tagsList = Array.isArray(product.tags) ? product.tags : [];
    const distinctTagMatches = collectAllMatchesFromList(tagsList);
    const conflictingTagMatches = [];
    for (const m of distinctTagMatches) {
      if (!conflictingTagMatches.some(existing => areSubcategoriesCompatible(existing, m))) {
        conflictingTagMatches.push(m);
      } else {
        // Check against primary: only push if incompatible with primary match
        if (!areSubcategoriesCompatible(distinctTagMatches[0], m)) {
          conflictingTagMatches.push(m);
        }
      }
    }
    const hasIncompatibleMultiTags = distinctTagMatches.some(
      m => !areSubcategoriesCompatible(distinctTagMatches[0], m)
    );
    const fromTags = distinctTagMatches[0] || '';
    const fromNameTitle = matchTaxonomyFromStrings([product.name]);
    // Only inspect description prose if neither tags nor product name identified a category
    const fromName = fromNameTitle || (!fromTags ? matchTaxonomyFromStrings([product.description]) : '');

    if (fromName && hasIncompatibleMultiTags) {
      subCategory = fromName;
      mappingSource = 'NAME_HEURISTIC';
      needsReview = true;
      conflictReason = `Tags chứa nhiều danh mục xung đột (${distinctTagMatches.join(', ')}) so với tên sản phẩm ("${fromName}"). Cần Admin kiểm tra lại trước khi bật Try-On.`;
    } else if (fromName && fromTags && !distinctTagMatches.some(t => areSubcategoriesCompatible(t, fromName))) {
      subCategory = fromName;
      mappingSource = 'NAME_HEURISTIC';
      needsReview = true;
      conflictReason = `Tag phân loại "${fromTags}" mâu thuẫn với tên sản phẩm "${fromName}".`;
    } else if (hasIncompatibleMultiTags) {
      subCategory = distinctTagMatches[0];
      mappingSource = 'TAGS';
      needsReview = true;
      conflictReason = `Sản phẩm có nhiều tag danh mục khác nhau (${distinctTagMatches.join(', ')}), cần Admin xác nhận danh mục chính xác.`;
    } else if (fromTags) {
      subCategory = fromTags;
      mappingSource = 'TAGS';
    } else if (fromName) {
      subCategory = fromName;
      mappingSource = 'NAME_HEURISTIC';
    } else if (catalogCategory === 'shoes') {
      subCategory = 'sneakers';
      mappingSource = 'EXPLICIT';
    } else if (catalogCategory === 'accessories') {
      subCategory = 'other_accessories';
      mappingSource = 'EXPLICIT';
    } else if (catalogCategory === 'men' || catalogCategory === 'women' || catalogCategory === 'clothing') {
      subCategory = 'tops';
      mappingSource = 'EXPLICIT';
    }
  }

  const resolvedSubCategory = subCategory || 'unknown';
  if (resolvedSubCategory === 'unknown') {
    needsReview = true;
    conflictReason = conflictReason || 'Chưa xác định được danh mục sản phẩm rõ ràng.';
  }

  const domain = SUBCATEGORY_TO_DOMAIN.get(resolvedSubCategory) || 'unknown';
  const filterGroup = SUBCATEGORY_TO_FILTER_GROUP.get(resolvedSubCategory) || 'all';
  const support = SUPPORT_MATRIX.get(resolvedSubCategory) || {
    tryOnSupportLevel: 'UNSUPPORTED',
    supportReason: 'Danh mục chưa phân loại chi tiết hoặc chưa có AI provider được xác minh.'
  };

  return {
    catalogCategory,
    domain,
    subCategory: resolvedSubCategory,
    filterGroup,
    tryOnSupportLevel: support.tryOnSupportLevel,
    supportReason: support.supportReason,
    mappingSource,
    needsReview,
    conflictReason
  };
}

module.exports = {
  CLOTHING_SUBCATEGORIES,
  FOOTWEAR_SUBCATEGORIES,
  ACCESSORIES_SUBCATEGORIES,
  ALL_SUBCATEGORIES,
  SUPPORT_MATRIX,
  normalizeCandidateSlug,
  areSubcategoriesCompatible,
  mapProductCategory
};
