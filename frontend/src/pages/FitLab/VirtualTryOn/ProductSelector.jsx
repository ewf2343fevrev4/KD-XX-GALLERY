import React, { useState, useEffect, useMemo } from 'react';
import { Shirt, Search, Check, Sparkles, AlertCircle, ShieldCheck, ShieldAlert, Lock, X } from 'lucide-react';
import { getTryOnCatalog, getAllProducts } from '../../../services/api';
import {
  evaluateFrontendCategorySupport,
  classifyFrontendOutfitSlot,
  SUPPORT_STATUS_META
} from './categorySupportHelper';

const CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'tops', label: 'Áo & Khoác' },
  { id: 'bottoms', label: 'Quần & Váy' },
  { id: 'shoes', label: 'Giày (Shoes)' },
  { id: 'eyewear', label: 'Kính mắt' },
  { id: 'accessories', label: 'Phụ kiện' }
];

function getDefaultVariant(prod) {
  if (!prod) return null;
  if (Array.isArray(prod.variants) && prod.variants.length > 0) {
    const first = prod.variants[0];
    return { sku: first.sku || '', color: first.color || '', size: '' };
  }
  if (Array.isArray(prod.colors) && prod.colors.length === 1) {
    return { sku: prod.sku || '', color: prod.colors[0], size: '' };
  }
  return null;
}

export default function ProductSelector({
  selectedProduct,
  selectedVariant = null,
  onSelectProduct,
  categoryMatrix = [],
  tryOnMode = 'single',
  fullOutfitSlots = { top: null, bottom: null },
  onUpdateOutfitSlot = null
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [slotNotice, setSlotNotice] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      try {
        setLoading(true);
        let res = await getTryOnCatalog();
        if (!res || !res.success || !Array.isArray(res.data)) {
          res = await getAllProducts();
        }
        if (active && res && res.success && Array.isArray(res.data)) {
          setProducts(res.data);
          if (!selectedProduct && res.data.length > 0) {
            onSelectProduct(res.data[0], getDefaultVariant(res.data[0]));
          }
        }
      } catch (e) {
        console.error('Failed to load products for try-on:', e);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCatalog();
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (prod.name || '').toLowerCase().includes(q);
        const matchesBrand = (prod.brand || '').toLowerCase().includes(q);
        const matchesSku = (prod.sku || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBrand && !matchesSku) return false;
      }

      if (activeCategory === 'all') return true;

      // Prefer normalized Phase 2 taxonomy when present
      if (prod.taxonomy?.filterGroup && prod.taxonomy.filterGroup !== 'all') {
        return prod.taxonomy.filterGroup === activeCategory;
      }

      // Safe fallback matching for un-enriched catalog payloads
      const cat = (prod.category || '').toLowerCase();
      const name = (prod.name || '').toLowerCase();
      const tags = Array.isArray(prod.tags) ? prod.tags.map(t => (t || '').toLowerCase()) : [];

      if (activeCategory === 'tops') {
        return (
          cat === 'men' ||
          cat === 'women' ||
          name.includes('jacket') ||
          name.includes('hoodie') ||
          name.includes('shirt') ||
          name.includes('dress') ||
          tags.some(t => t.includes('jacket') || t.includes('hoodie') || t.includes('outerwear') || t.includes('top') || t.includes('dresses'))
        );
      }

      if (activeCategory === 'bottoms') {
        return (
          name.includes('skirt') ||
          name.includes('pant') ||
          name.includes('jean') ||
          name.includes('short') ||
          tags.some(t => t.includes('skirt') || t.includes('pant') || t.includes('jean') || t.includes('denim'))
        );
      }

      if (activeCategory === 'shoes') {
        return (
          cat === 'shoes' ||
          name.includes('sneaker') ||
          name.includes('runner') ||
          name.includes('boot') ||
          tags.some(t => t.includes('sneaker') || t.includes('shoe') || t.includes('footwear'))
        );
      }

      if (activeCategory === 'eyewear') {
        return (
          name.includes('sunglass') ||
          name.includes('eyewear') ||
          tags.some(t => t.includes('sunglass') || t.includes('eyewear'))
        );
      }

      if (activeCategory === 'accessories') {
        return (
          cat === 'accessories' ||
          name.includes('belt') ||
          name.includes('bag') ||
          name.includes('wallet') ||
          name.includes('card holder') ||
          tags.some(t => t.includes('belt') || t.includes('bag') || t.includes('card') || t.includes('watch'))
        );
      }

      return true;
    });
  }, [products, activeCategory, searchQuery]);

  const formatPrice = (price) => {
    if (!price && price !== 0) return '';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
      Math.round(price * 25400)
    );
  };

  const selectedVariantsList = useMemo(() => {
    if (!selectedProduct) return [];
    if (Array.isArray(selectedProduct.variants) && selectedProduct.variants.length > 0) {
      return selectedProduct.variants;
    }
    if (Array.isArray(selectedProduct.colors) && selectedProduct.colors.length > 1) {
      return selectedProduct.colors.map((c) => ({
        sku: selectedProduct.sku ? `${selectedProduct.sku}-${c.toUpperCase().slice(0, 3)}` : '',
        color: c,
        imageUrl: selectedProduct.image || ''
      }));
    }
    return [];
  }, [selectedProduct]);

  const activeIntel = selectedProduct?.intelligence;
  const activeTaxonomy = selectedProduct?.taxonomy;
  const selectedSupport = useMemo(
    () => (selectedProduct ? evaluateFrontendCategorySupport(selectedProduct, categoryMatrix) : null),
    [selectedProduct, categoryMatrix]
  );
  const selectedStatusMeta = selectedSupport
    ? SUPPORT_STATUS_META[selectedSupport.displayStatus] || SUPPORT_STATUS_META.UNSUPPORTED
    : null;

  const isFullOutfitMode = tryOnMode === 'full_outfit';

  const handleCardClick = (prod, cardSupport) => {
    const defVariant = getDefaultVariant(prod);
    if (!isFullOutfitMode) {
      setSlotNotice(null);
      onSelectProduct(prod, defVariant);
      return;
    }

    const slot = classifyFrontendOutfitSlot(prod);
    if (slot === 'DRESS') {
      setSlotNotice(`"${prod.name}" thuộc nhóm Đầm liền thân (DRESS), chỉ dùng ở chế độ Single Item.`);
      return;
    }
    if (slot === 'FOOTWEAR' || slot === 'ACCESSORIES') {
      setSlotNotice(`"${prod.name}" thuộc nhóm ${slot === 'FOOTWEAR' ? 'Giày' : 'Phụ kiện'} đang bị khóa trong Full Outfit.`);
      return;
    }
    if (!cardSupport?.allowSubmit) {
      setSlotNotice(cardSupport?.reason || `"${prod.name}" chưa sẵn sàng để đưa vào Full Outfit.`);
      return;
    }
    if (slot === 'TOP' || slot === 'BOTTOM') {
      setSlotNotice(null);
      if (typeof onUpdateOutfitSlot === 'function') {
        onUpdateOutfitSlot(slot.toLowerCase(), prod, defVariant);
      }
      onSelectProduct(prod, defVariant);
    } else {
      setSlotNotice(`"${prod.name}" chưa thuộc nhóm Áo hoặc Quần hợp lệ cho Full Outfit.`);
    }
  };

  return (
    <div className="vto-panel">
      <div className="vto-panel-header">
        <h3>
          <Shirt size={18} className="text-purple-400" />
          <span>
            {isFullOutfitMode
              ? 'Bước 2: Ghép Bộ Full Outfit (1 Áo + 1 Quần/Váy)'
              : 'Bước 2: Chọn Sản Phẩm KD-XX Trực Tiếp Từ Catalog'}
          </span>
        </h3>
        <span className="vto-step-badge">{filteredProducts.length} Món Đồ</span>
      </div>

      {/* Full Outfit 2-Slot Tray + Locked Accessories/Footwear Notice */}
      {isFullOutfitMode && (
        <div
          className="p-3 bg-white/[0.03] border border-purple-500/30 rounded-xl space-y-2.5"
          data-testid="vto-full-outfit-slots"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { key: 'top', label: 'Slot 1: Áo / Áo khoác (TOP)', data: fullOutfitSlots?.top },
              { key: 'bottom', label: 'Slot 2: Quần / Chân váy (BOTTOM)', data: fullOutfitSlots?.bottom }
            ].map((slotInfo) => (
              <div
                key={slotInfo.key}
                data-testid={`vto-outfit-slot-${slotInfo.key}`}
                className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                  slotInfo.data?.product
                    ? 'bg-purple-950/35 border-purple-400/50 text-white'
                    : 'bg-black/30 border-dashed border-white/15 text-slate-400'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                    {slotInfo.label}
                  </div>
                  {slotInfo.data?.product ? (
                    <div className="truncate font-semibold text-white mt-0.5">
                      {slotInfo.data.product.name}
                      {slotInfo.data.variant?.color ? ` (${slotInfo.data.variant.color})` : ''}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Nhấp sản phẩm bên dưới để điền slot
                    </div>
                  )}
                </div>
                {slotInfo.data?.product && typeof onUpdateOutfitSlot === 'function' && (
                  <button
                    type="button"
                    aria-label={`Bỏ chọn ${slotInfo.key}`}
                    onClick={() => onUpdateOutfitSlot(slotInfo.key, null, null)}
                    className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 shrink-0"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            data-testid="vto-locked-footwear-slot"
            className="px-2.5 py-2 rounded-lg bg-slate-900/70 border border-white/10 text-[11px] text-slate-300 flex items-center gap-2"
          >
            <Lock size={12} className="text-amber-400 shrink-0" />
            <span>
              <strong>Giày (Footwear) &amp; Kính / Phụ kiện:</strong> Đang khóa — chờ AI provider chuyên biệt được xác minh. Đầm liền thân (DRESS) chỉ dùng ở Single Item.
            </span>
          </div>

          {slotNotice && (
            <div className="px-2.5 py-1.5 rounded-lg bg-amber-950/50 border border-amber-500/40 text-[11px] text-amber-200 flex items-center gap-1.5">
              <AlertCircle size={13} className="shrink-0 text-amber-400" />
              <span>{slotNotice}</span>
            </div>
          )}
        </div>
      )}

      {/* Category Pills & Search */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, thương hiệu hoặc SKU KD-XX..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
        </div>

        <div className="vto-cat-filters">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`vto-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-xs gap-2">
          <Sparkles size={16} className="animate-spin text-purple-400" />
          <span>Đang tải danh mục sản phẩm thời trang KD-XX...</span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-xs">
          Không tìm thấy sản phẩm phù hợp với bộ lọc.
        </div>
      ) : (
        <div className="vto-product-grid">
          {filteredProducts.map((prod) => {
            const isSelected = isFullOutfitMode
              ? (fullOutfitSlots?.top?.product?._id === prod._id || fullOutfitSlots?.bottom?.product?._id === prod._id)
              : selectedProduct?._id === prod._id;
            const imgSrc =
              prod.intelligence?.bestTryOnImageUrl ||
              prod.image ||
              (Array.isArray(prod.images) && prod.images[0]) ||
              '/brands/amiri.png';
            const verif = prod.intelligence?.verificationStatus;
            const cardSupport = evaluateFrontendCategorySupport(prod, categoryMatrix);
            const cardMeta = SUPPORT_STATUS_META[cardSupport.displayStatus] || SUPPORT_STATUS_META.UNSUPPORTED;

            return (
              <div
                key={prod._id}
                className={`vto-product-card ${isSelected ? 'selected' : ''} ${!cardSupport.allowSubmit ? 'opacity-80' : ''}`}
                onClick={() => handleCardClick(prod, cardSupport)}
              >
                <div className="vto-product-img-wrap">
                  <img src={imgSrc} alt={prod.name} className="vto-product-img" />
                  {isSelected && (
                    <div className="vto-product-selected-pip">
                      <Check size={14} />
                    </div>
                  )}
                </div>

                <div className="vto-product-info">
                  <div className="flex items-center justify-between gap-1">
                    <span className="vto-product-brand">{prod.brand || 'KD-XX'}</span>
                    {verif === 'VERIFIED' && (
                      <ShieldCheck size={12} className="text-emerald-400 shrink-0" title="Đã xác minh Product Intelligence" />
                    )}
                    {verif === 'CONFLICT' && (
                      <ShieldAlert size={12} className="text-amber-400 shrink-0" title="Nguồn dữ liệu cần rà soát" />
                    )}
                  </div>
                  <h4 className="vto-product-name" title={prod.name}>
                    {prod.name}
                  </h4>
                  <div className="flex items-center justify-between gap-1 flex-wrap mt-0.5">
                    <span className="vto-product-price">
                      {formatPrice(prod.price)}
                    </span>
                    <span
                      data-testid="vto-card-capability-badge"
                      className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${cardMeta.badgeClass}`}
                    >
                      {cardSupport.displayStatus}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Product Intelligence & Color Variant Picker */}
      {selectedProduct && (
        <div
          className="p-3 bg-white/[0.04] border border-white/10 rounded-xl space-y-2 text-xs text-slate-300"
          data-testid="vto-selected-product-intel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white">{selectedProduct.name}</span>
              {selectedProduct.sku ? (
                <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono text-purple-200">
                  SKU: {selectedProduct.sku}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-[10px] text-amber-300">
                  Chưa gắn SKU
                </span>
              )}
              {activeTaxonomy?.subCategory && activeTaxonomy.subCategory !== 'unknown' && (
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-[10px] uppercase tracking-wider text-purple-200">
                  {activeTaxonomy.subCategory}
                </span>
              )}
              {selectedSupport && selectedStatusMeta && (
                <span
                  data-testid="vto-selected-capability-badge"
                  className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${selectedStatusMeta.badgeClass}`}
                >
                  {selectedSupport.displayStatus}
                </span>
              )}
            </div>

            {activeIntel && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  activeIntel.verificationStatus === 'VERIFIED'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : activeIntel.verificationStatus === 'CONFLICT'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-700/60 text-slate-300'
                }`}
              >
                {activeIntel.verificationStatus === 'VERIFIED'
                  ? `Xác minh ${Math.round((activeIntel.confidenceScore || 0) * 100)}%`
                  : activeIntel.verificationStatus}
              </span>
            )}
          </div>

          {selectedVariantsList.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-[11px] text-slate-400">Phiên bản màu:</span>
              {selectedVariantsList.map((v, idx) => {
                const isVarActive =
                  selectedVariant &&
                  ((v.color && selectedVariant.color === v.color) || (v.sku && selectedVariant.sku === v.sku));
                return (
                  <button
                    key={`${v.color || v.sku || idx}`}
                    type="button"
                    onClick={() => {
                      const nextVar = {
                        sku: v.sku || selectedProduct.sku || '',
                        color: v.color || '',
                        size: selectedVariant?.size || ''
                      };
                      onSelectProduct(selectedProduct, nextVar);
                      if (isFullOutfitMode && typeof onUpdateOutfitSlot === 'function') {
                        if (fullOutfitSlots?.top?.product?._id === selectedProduct._id) {
                          onUpdateOutfitSlot('top', selectedProduct, nextVar);
                        } else if (fullOutfitSlots?.bottom?.product?._id === selectedProduct._id) {
                          onUpdateOutfitSlot('bottom', selectedProduct, nextVar);
                        }
                      }
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                      isVarActive
                        ? 'bg-purple-500/30 border-purple-400 text-white font-semibold'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    {v.color || v.sku || `Variant ${idx + 1}`}
                  </button>
                );
              })}
            </div>
          )}

          {selectedSupport && !selectedSupport.allowSubmit ? (
            <div className="flex items-start gap-2 text-[11px] text-amber-200 pt-1">
              <AlertCircle size={13} className="shrink-0 text-amber-400 mt-0.5" />
              <span>{selectedSupport.reason}</span>
            </div>
          ) : selectedSupport?.modelId ? (
            <div className="text-[11px] text-slate-400 pt-0.5">
              AI Provider: <span className="text-slate-200 font-medium">{selectedSupport.providerName || 'Google Cloud'}</span>{' '}
              (<code className="text-purple-300">{selectedSupport.modelId}</code>) • Thử 1 sản phẩm trang phục
            </div>
          ) : activeTaxonomy?.tryOnSupportLevel && activeTaxonomy.tryOnSupportLevel !== 'DIRECT' ? (
            <div className="flex items-start gap-2 text-[11px] text-amber-200/90 pt-1">
              <AlertCircle size={13} className="shrink-0 text-amber-400 mt-0.5" />
              <span>{activeTaxonomy.supportReason}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Single-Garment Try-On Model Disclaimer */}
      <div className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-xl flex items-start gap-2.5 text-slate-300 text-xs leading-relaxed">
        <AlertCircle size={15} className="shrink-0 text-purple-400 mt-0.5" />
        <span>
          <strong className="text-purple-300">Quy chuẩn AI Virtual Try-On đa danh mục:</strong> Model <code className="text-purple-200">virtual-try-on-001</code> hiện được xác minh cho trang phục (Clothing, Single Item). Các nhóm Giày, Kính và Phụ kiện chưa xác minh sẽ tự động hiển thị trạng thái và không cho tạo phiên AI sai danh mục.
        </span>
      </div>
    </div>
  );
}
