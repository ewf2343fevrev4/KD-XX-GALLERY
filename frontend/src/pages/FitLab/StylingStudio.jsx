import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Download,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Upload,
  Search,
  X,
  Check,
  Loader2,
  AlertCircle,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Info,
  Pin
} from 'lucide-react';
import { getAllProducts } from '../../services/api';
import { categorizeItem } from '../../utils/fitLabHelpers';
import {
  processBackgroundRemoval,
  getCachedCutout
} from '../../utils/backgroundRemovalService';
import './StylingStudio.css';

const API_BASE = 'http://localhost:5000/api';

/**
 * Load image safely with proxy fallback for CORS
 */
const loadSafeImage = (src) => {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (
        typeof src === 'string' &&
        (src.startsWith('http://') || src.startsWith('https://')) &&
        !src.includes('/api/proxy-image')
      ) {
        const proxyImg = new Image();
        proxyImg.crossOrigin = 'anonymous';
        proxyImg.onload = () => resolve(proxyImg);
        proxyImg.onerror = () => {
          const rawImg = new Image();
          rawImg.onload = () => resolve(rawImg);
          rawImg.onerror = () => resolve(null);
          rawImg.src = src;
        };
        proxyImg.src = `${API_BASE}/proxy-image?url=${encodeURIComponent(src)}`;
      } else {
        const rawImg = new Image();
        rawImg.onload = () => resolve(rawImg);
        rawImg.onerror = () => resolve(null);
        rawImg.src = src;
      }
    };
    img.src = src;
  });
};

export default function StylingStudio() {
  // ==================== CANDIDATE ITEMS PER ROW ====================
  // Each row has its own array of candidate pieces + active index
  const [topsList, setTopsList] = useState([]);
  const [currentTopIndex, setCurrentTopIndex] = useState(0);

  const [bottomsList, setBottomsList] = useState([]);
  const [currentBottomIndex, setCurrentBottomIndex] = useState(0);

  const [shoesList, setShoesList] = useState([]);
  const [currentShoeIndex, setCurrentShoeIndex] = useState(0);

  // Optional Accessories list (can hold multiple accessories)
  const [accessoriesList, setAccessoriesList] = useState([]);

  // Pin / Lock state for rows (true = locked against Random Fit)
  const [lockedRows, setLockedRows] = useState({
    tops: false,
    bottoms: false,
    shoes: false
  });

  // Flashing row state for sidebar sync animation ('tops' | 'bottoms' | 'shoes' | 'all' | null)
  const [flashingRow, setFlashingRow] = useState(null);
  const flashTimer = useRef(null);

  const triggerFlash = (category) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashingRow(category);
    flashTimer.current = setTimeout(() => {
      setFlashingRow(null);
    }, 700);
  };

  const toggleLock = (category) => {
    setLockedRows((prev) => {
      const nextState = !prev[category];
      const catName = category === 'tops' ? 'áo' : category === 'bottoms' ? 'quần' : 'giày';
      showToast(
        nextState
          ? `📌 Đã ghim ${catName} này (giữ nguyên khi Phối ngẫu nhiên).`
          : `Đã mở ghim ${catName}.`,
        'info'
      );
      return { ...prev, [category]: nextState };
    });
  };

  // Helper to compute previous, current, and next items for row carousel display
  const getRowTriplet = (list, currentIndex) => {
    if (!list || list.length === 0) return { prev: null, current: null, next: null };
    const current = list[currentIndex] || list[0] || null;
    if (list.length === 1) return { prev: null, current, next: null };
    const prevIndex = (currentIndex - 1 + list.length) % list.length;
    const nextIndex = (currentIndex + 1) % list.length;
    return {
      prev: list[prevIndex],
      current,
      next: list[nextIndex]
    };
  };

  // ==================== CATALOG & UPLOAD STATE ====================
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState(null);

  const [userUploads, setUserUploads] = useState([]);

  // ==================== MODAL STATE ====================
  // activeModalCategory: 'tops' | 'bottoms' | 'shoes' | 'accessories' | null
  const [activeModalCategory, setActiveModalCategory] = useState(null);
  const [modalTab, setModalTab] = useState('catalog'); // 'catalog' | 'upload'
  const [searchQuery, setSearchQuery] = useState('');

  // Upload modal inputs
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('tops');
  const [uploadError, setUploadError] = useState(null);

  // ==================== FEEDBACK & EXPORT STATE ====================
  const [exporting, setExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [processingIds, setProcessingIds] = useState(new Set());

  // Show Toast Helper
  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ==================== FETCH CATALOG PRODUCTS ====================
  useEffect(() => {
    let isMounted = true;
    const fetchCatalog = async () => {
      try {
        setLoadingProducts(true);
        const res = await getAllProducts();
        if (isMounted) {
          if (res?.success && Array.isArray(res.data)) {
            setCatalogProducts(res.data);
          } else if (Array.isArray(res)) {
            setCatalogProducts(res);
          } else {
            setProductError('Không thể tải danh mục sản phẩm KD-XX.');
          }
        }
      } catch (err) {
        if (isMounted) setProductError('Lỗi kết nối khi tải sản phẩm.');
      } finally {
        if (isMounted) setLoadingProducts(false);
      }
    };
    fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // ==================== BACKGROUND REMOVAL DISPATCHER ====================
  const triggerBgRemoval = async (item, targetRow) => {
    if (!item?.originalImage) return;

    // 1. Check if cached cutout already exists
    const cached = getCachedCutout(item.originalImage);
    if (cached) {
      updateItemWithCutout(item.id, cached.cutoutUrl, true, targetRow);
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(item.id));

    try {
      const res = await processBackgroundRemoval(item.originalImage, {
        quality: 'quality'
      });

      if (res?.success && res?.url) {
        updateItemWithCutout(item.id, res.url, res.isCutout, targetRow);
      }
    } catch (err) {
      console.warn('Background removal failed for item, retaining original:', err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Update item image inside target row array
  const updateItemWithCutout = (itemId, newUrl, isCutout, targetRow) => {
    const updater = (prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, image: newUrl, isCutout } : it));

    if (targetRow === 'tops') setTopsList(updater);
    else if (targetRow === 'bottoms') setBottomsList(updater);
    else if (targetRow === 'shoes') setShoesList(updater);
    else if (targetRow === 'accessories') setAccessoriesList(updater);
  };

  // ==================== ROW NAVIGATION (CYCLING & SWIPE) ====================
  const handleNextItem = (category) => {
    if (category === 'tops' && topsList.length > 1) {
      setCurrentTopIndex((prev) => (prev + 1) % topsList.length);
      triggerFlash('tops');
    } else if (category === 'bottoms' && bottomsList.length > 1) {
      setCurrentBottomIndex((prev) => (prev + 1) % bottomsList.length);
      triggerFlash('bottoms');
    } else if (category === 'shoes' && shoesList.length > 1) {
      setCurrentShoeIndex((prev) => (prev + 1) % shoesList.length);
      triggerFlash('shoes');
    }
  };

  const handlePrevItem = (category) => {
    if (category === 'tops' && topsList.length > 1) {
      setCurrentTopIndex((prev) => (prev - 1 + topsList.length) % topsList.length);
      triggerFlash('tops');
    } else if (category === 'bottoms' && bottomsList.length > 1) {
      setCurrentBottomIndex((prev) => (prev - 1 + bottomsList.length) % bottomsList.length);
      triggerFlash('bottoms');
    } else if (category === 'shoes' && shoesList.length > 1) {
      setCurrentShoeIndex((prev) => (prev - 1 + shoesList.length) % shoesList.length);
      triggerFlash('shoes');
    }
  };

  const handleRemoveCurrentItem = (category) => {
    if (category === 'tops') {
      const next = topsList.filter((_, idx) => idx !== currentTopIndex);
      setTopsList(next);
      if (next.length === 0) setCurrentTopIndex(0);
      else if (currentTopIndex >= next.length) setCurrentTopIndex(next.length - 1);
      triggerFlash('tops');
    } else if (category === 'bottoms') {
      const next = bottomsList.filter((_, idx) => idx !== currentBottomIndex);
      setBottomsList(next);
      if (next.length === 0) setCurrentBottomIndex(0);
      else if (currentBottomIndex >= next.length) setCurrentBottomIndex(next.length - 1);
      triggerFlash('bottoms');
    } else if (category === 'shoes') {
      const next = shoesList.filter((_, idx) => idx !== currentShoeIndex);
      setShoesList(next);
      if (next.length === 0) setCurrentShoeIndex(0);
      else if (currentShoeIndex >= next.length) setCurrentShoeIndex(next.length - 1);
      triggerFlash('shoes');
    }
  };

  // Touch Swipe Handlers for mobile & tablet
  const touchCoords = useRef({ startX: 0, endX: 0 });

  const handleTouchStart = (e) => {
    touchCoords.current.startX = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchCoords.current.endX = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (category) => {
    const diff = touchCoords.current.startX - touchCoords.current.endX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNextItem(category); // swipe left
      } else {
        handlePrevItem(category); // swipe right
      }
    }
  };

  // ==================== ADD ITEM HANDLER ====================
  const handleSelectItem = (productOrUpload, targetCategory) => {
    const rawImage = productOrUpload.image || productOrUpload.images?.[0];
    if (!rawImage) {
      showToast('Sản phẩm không có ảnh hợp lệ.', 'error');
      return;
    }

    const cached = getCachedCutout(rawImage);
    const newItem = {
      id: `styling-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: productOrUpload._id || productOrUpload.id,
      name: productOrUpload.name || 'KD-XX Piece',
      brand: productOrUpload.brand || 'KD-XX',
      price: productOrUpload.price || 0,
      category: targetCategory,
      originalImage: rawImage,
      image: cached ? cached.cutoutUrl : rawImage,
      isCutout: cached ? cached.isCutout : false
    };

    if (targetCategory === 'tops') {
      const alreadyIdx = topsList.findIndex((i) => i.productId === newItem.productId);
      if (alreadyIdx !== -1) {
        setCurrentTopIndex(alreadyIdx);
      } else {
        setTopsList((prev) => [...prev, newItem]);
        setCurrentTopIndex(topsList.length);
        triggerBgRemoval(newItem, 'tops');
      }
    } else if (targetCategory === 'bottoms') {
      const alreadyIdx = bottomsList.findIndex((i) => i.productId === newItem.productId);
      if (alreadyIdx !== -1) {
        setCurrentBottomIndex(alreadyIdx);
      } else {
        setBottomsList((prev) => [...prev, newItem]);
        setCurrentBottomIndex(bottomsList.length);
        triggerBgRemoval(newItem, 'bottoms');
      }
    } else if (targetCategory === 'shoes') {
      const alreadyIdx = shoesList.findIndex((i) => i.productId === newItem.productId);
      if (alreadyIdx !== -1) {
        setCurrentShoeIndex(alreadyIdx);
      } else {
        setShoesList((prev) => [...prev, newItem]);
        setCurrentShoeIndex(shoesList.length);
        triggerBgRemoval(newItem, 'shoes');
      }
    } else if (targetCategory === 'accessories') {
      const alreadyExists = accessoriesList.some((i) => i.productId === newItem.productId);
      if (!alreadyExists) {
        setAccessoriesList((prev) => [...prev, newItem]);
        triggerBgRemoval(newItem, 'accessories');
      }
    }

    triggerFlash(targetCategory);
    setActiveModalCategory(null);
    showToast(`Đã thêm "${newItem.name}" vào danh sách!`, 'success');
  };

  // Remove accessory
  const handleRemoveAccessory = (accId) => {
    setAccessoriesList((prev) => prev.filter((it) => it.id !== accId));
  };

  // ==================== UPLOAD HANDLER ====================
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpe?g|webp)$/)) {
      setUploadError('Chỉ chấp nhận định dạng ảnh PNG, JPG, hoặc WebP.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Kích thước ảnh tối đa là 20MB.');
      return;
    }

    setUploadError(null);
    setUploadFile(file);
    const localUrl = URL.createObjectURL(file);
    setUploadPreview(localUrl);
    setUploadName(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleConfirmUpload = () => {
    if (!uploadFile || !uploadPreview) {
      setUploadError('Vui lòng chọn một file ảnh từ máy của bạn.');
      return;
    }

    const customItem = {
      _id: `upload-${Date.now()}`,
      id: `upload-${Date.now()}`,
      name: uploadName || 'Món đồ cá nhân',
      brand: 'My Wardrobe',
      price: 0,
      image: uploadPreview,
      category: uploadCategory
    };

    setUserUploads((prev) => [customItem, ...prev]);
    handleSelectItem(customItem, activeModalCategory || uploadCategory);

    // Reset upload state
    setUploadFile(null);
    setUploadPreview(null);
    setUploadName('');
  };

  // ==================== ACTIONS: RANDOM FIT ====================
  const handleRandomFit = () => {
    if (catalogProducts.length === 0) {
      showToast('Đang tải dữ liệu sản phẩm, vui lòng thử lại sau giây lát.', 'error');
      return;
    }

    // Group catalog products by category
    const topsPool = catalogProducts.filter((p) => categorizeItem(p) === 'tops');
    const bottomsPool = catalogProducts.filter((p) => categorizeItem(p) === 'bottoms');
    const shoesPool = catalogProducts.filter((p) => categorizeItem(p) === 'shoes');
    const accPool = catalogProducts.filter((p) => categorizeItem(p) === 'accessories');

    if (topsPool.length === 0 || bottomsPool.length === 0 || shoesPool.length === 0) {
      showToast('Không đủ sản phẩm để tạo bộ phối đồ đầy đủ.', 'error');
      return;
    }

    const createItem = (p, cat) => {
      const rawImg = p.image || p.images?.[0];
      const cached = getCachedCutout(rawImg);
      return {
        id: `styling-rnd-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        productId: p._id || p.id,
        name: p.name,
        brand: p.brand || 'KD-XX',
        price: p.price || 0,
        category: cat,
        originalImage: rawImg,
        image: cached ? cached.cutoutUrl : rawImg,
        isCutout: cached ? cached.isCutout : false
      };
    };

    if (!lockedRows.tops && topsPool.length > 0) {
      const randomTop = topsPool[Math.floor(Math.random() * topsPool.length)];
      const newTop = createItem(randomTop, 'tops');
      setTopsList([newTop]);
      setCurrentTopIndex(0);
      triggerBgRemoval(newTop, 'tops');
    }

    if (!lockedRows.bottoms && bottomsPool.length > 0) {
      const randomBottom = bottomsPool[Math.floor(Math.random() * bottomsPool.length)];
      const newBottom = createItem(randomBottom, 'bottoms');
      setBottomsList([newBottom]);
      setCurrentBottomIndex(0);
      triggerBgRemoval(newBottom, 'bottoms');
    }

    if (!lockedRows.shoes && shoesPool.length > 0) {
      const randomShoe = shoesPool[Math.floor(Math.random() * shoesPool.length)];
      const newShoe = createItem(randomShoe, 'shoes');
      setShoesList([newShoe]);
      setCurrentShoeIndex(0);
      triggerBgRemoval(newShoe, 'shoes');
    }

    // Random accessory
    if (accessoriesList.length === 0 && accPool.length > 0 && Math.random() > 0.4) {
      const randomAcc = accPool[Math.floor(Math.random() * accPool.length)];
      const newAcc = createItem(randomAcc, 'accessories');
      setAccessoriesList([newAcc]);
      triggerBgRemoval(newAcc, 'accessories');
    }

    triggerFlash('all');
    showToast('✨ KD-XX đã phối ngẫu nhiên cho bạn một outfit streetwear hoàn chỉnh!', 'success');
  };

  // ==================== ACTIONS: CLEAR OUTFIT ====================
  const handleClearOutfit = () => {
    setTopsList([]);
    setCurrentTopIndex(0);
    setBottomsList([]);
    setCurrentBottomIndex(0);
    setShoesList([]);
    setCurrentShoeIndex(0);
    setAccessoriesList([]);
    showToast('Đã làm trống toàn bộ các hàng trang phục.');
  };

  // ==================== ACTIONS: EXPORT PNG ====================
  const handleExportPng = async () => {
    const activeTop = topsList[currentTopIndex] || null;
    const activeBottom = bottomsList[currentBottomIndex] || null;
    const activeShoe = shoesList[currentShoeIndex] || null;

    if (!activeTop && !activeBottom && !activeShoe) {
      showToast('Vui lòng thêm ít nhất một món đồ trước khi xuất ảnh.', 'error');
      return;
    }

    setExporting(true);

    try {
      const canvasWidth = 800;
      const canvasHeight = 1040;
      const scale = 2; // Retina 2x

      const offCanvas = document.createElement('canvas');
      offCanvas.width = canvasWidth * scale;
      offCanvas.height = canvasHeight * scale;
      const ctx = offCanvas.getContext('2d');
      ctx.scale(scale, scale);

      // 1. Crisp White Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 2. Subtle Purple Dot Grid Pattern
      ctx.fillStyle = 'rgba(147, 51, 234, 0.2)';
      for (let x = 16; x < canvasWidth; x += 32) {
        for (let y = 16; y < canvasHeight; y += 32) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Purple Border
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, canvasWidth - 3, canvasHeight - 3);

      // 4. Header Watermark Branding
      ctx.save();
      ctx.fillStyle = '#18181b';
      ctx.font = 'bold 18px "Manrope", sans-serif';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '3px';
      ctx.fillText('KD-XX FIT LAB • STYLING STUDIO', canvasWidth / 2, 45);

      ctx.fillStyle = '#7e22ce';
      ctx.font = '9px "Montserrat", sans-serif';
      ctx.letterSpacing = '2px';
      ctx.fillText('STREETWEAR OUTFIT COORDINATION', canvasWidth / 2, 62);
      ctx.restore();

      // Helper to draw item centered in a vertical slot
      const drawSlotItem = async (item, slotY, slotHeight) => {
        if (!item?.image) return;
        const img = await loadSafeImage(item.image);
        if (!img) return;

        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const ratio = natW / Math.max(1, natH);

        const maxW = 340;
        const maxH = slotHeight - 20;

        let drawW = maxW;
        let drawH = drawW / ratio;

        if (drawH > maxH) {
          drawH = maxH;
          drawW = drawH * ratio;
        }

        const drawX = canvasWidth / 2 - drawW / 2;
        const drawY = slotY + (slotHeight - drawH) / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 6;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
      };

      // 5. Draw the 3 main rows
      // Tops slot: Y = 80 to 360 (height = 280)
      if (activeTop) {
        await drawSlotItem(activeTop, 80, 280);
      }

      // Bottoms slot: Y = 360 to 680 (height = 320)
      if (activeBottom) {
        await drawSlotItem(activeBottom, 360, 320);
      }

      // Shoes slot: Y = 680 to 920 (height = 240)
      if (activeShoe) {
        await drawSlotItem(activeShoe, 680, 240);
      }

      // 6. Draw Accessories Showcase (if any selected) on the right corner
      if (accessoriesList.length > 0) {
        ctx.save();
        ctx.fillStyle = '#fafafc';
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(570, 95, 205, Math.min(380, accessoriesList.length * 90 + 35), 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#7e22ce';
        ctx.font = 'bold 9px "Montserrat", sans-serif';
        ctx.textAlign = 'left';
        ctx.letterSpacing = '1px';
        ctx.fillText('ACCESSORIES', 585, 118);

        let accY = 130;
        for (const acc of accessoriesList.slice(0, 4)) {
          const accImg = await loadSafeImage(acc.image);
          if (accImg) {
            ctx.drawImage(accImg, 585, accY, 60, 60);
          }
          ctx.fillStyle = '#18181b';
          ctx.font = 'bold 10px "Montserrat", sans-serif';
          ctx.fillText((acc.name || '').slice(0, 16), 655, accY + 28);
          ctx.fillStyle = '#7e22ce';
          ctx.font = '9px "Montserrat", sans-serif';
          ctx.fillText(`$${acc.price?.toLocaleString() || '0'}`, 655, accY + 44);
          accY += 75;
        }
        ctx.restore();
      }

      // 7. Footer Watermark Branding
      ctx.save();
      ctx.fillStyle = 'rgba(24, 24, 27, 0.35)';
      ctx.font = 'bold 11px "Cinzel", "Montserrat", sans-serif';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '2px';
      ctx.fillText('KD-XX FIT LAB • STYLING STUDIO', canvasWidth / 2, canvasHeight - 34);

      ctx.fillStyle = 'rgba(126, 34, 206, 0.55)';
      ctx.font = '8px "Montserrat", sans-serif';
      ctx.letterSpacing = '1.5px';
      ctx.fillText('BUILD YOUR FIT • MADE TRẦN ĐỨC MINH', canvasWidth / 2, canvasHeight - 18);
      ctx.restore();

      // 8. Download PNG
      offCanvas.toBlob(
        (blob) => {
          if (!blob) {
            showToast('Không thể tạo file ảnh PNG.', 'error');
            setExporting(false);
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `kdxx-styling-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          setExporting(false);
          showToast('Đã xuất ảnh outfit styling chất lượng cao thành công!', 'success');
        },
        'image/png',
        1.0
      );
    } catch (err) {
      console.error('Styling Export PNG error:', err);
      showToast('Lỗi khi xuất ảnh: ' + err.message, 'error');
      setExporting(false);
    }
  };

  // ==================== CALC TOTAL OUTFIT PRICE & ACTIVE ITEMS ====================
  const activeTop = topsList[currentTopIndex] || null;
  const activeBottom = bottomsList[currentBottomIndex] || null;
  const activeShoe = shoesList[currentShoeIndex] || null;

  const topsTriplet = getRowTriplet(topsList, currentTopIndex);
  const bottomsTriplet = getRowTriplet(bottomsList, currentBottomIndex);
  const shoesTriplet = getRowTriplet(shoesList, currentShoeIndex);

  const totalPrice =
    (activeTop?.price || 0) +
    (activeBottom?.price || 0) +
    (activeShoe?.price || 0) +
    accessoriesList.reduce((acc, it) => acc + (it.price || 0), 0);

  // Filter products for the active modal
  const filteredCatalog = catalogProducts.filter((product) => {
    if (!activeModalCategory) return true;
    const cat = categorizeItem(product);
    const matchesCat = cat === activeModalCategory;
    if (!matchesCat) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      product.name?.toLowerCase().includes(q) ||
      product.brand?.toLowerCase().includes(q) ||
      product.description?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="styling-studio">
      {/* ==================== 1. STYLING TOP BAR ==================== */}
      <div className="styling-topbar">
        <div className="styling-topbar-left">
          <span className="styling-badge">
            <Sparkles size={11} />
            <span>STYLING STUDIO</span>
          </span>
          <h1 className="styling-title">OUTFIT COMBINATOR</h1>
          <p className="styling-tagline">3 ROWS • SWIPE & MIX • BUILD YOUR SILHOUETTE</p>
        </div>

        <div className="styling-topbar-actions">
          <button
            type="button"
            onClick={handleRandomFit}
            className="styling-btn styling-btn-purple"
            title="Tự động phối ngẫu nhiên 1 áo, 1 quần, 1 giày từ kho đồ KD-XX"
          >
            <Sparkles size={14} />
            <span>Random Fit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModalCategory('accessories')}
            className={`styling-btn styling-btn-outline ${
              accessoriesList.length > 0 ? 'active' : ''
            }`}
            title="Thêm phụ kiện hoàn thiện outfit"
          >
            <ShoppingBag size={14} />
            <span>Phụ kiện ({accessoriesList.length})</span>
          </button>

          <button
            type="button"
            onClick={handleClearOutfit}
            disabled={!activeTop && !activeBottom && !activeShoe && accessoriesList.length === 0}
            className="styling-btn styling-btn-danger"
            title="Làm trống toàn bộ trang phục đang chọn"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Xóa hết</span>
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting || (!activeTop && !activeBottom && !activeShoe)}
            className="styling-btn styling-btn-primary"
            title="Xuất outfit thành ảnh PNG nền trắng viền tím chất lượng cao"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export PNG</span>
          </button>
        </div>
      </div>

      {/* ==================== 2. WORKSPACE (STAGE & SIDEBAR) ==================== */}
      <div className="styling-workspace">
        {/* ==================== LEFT: THE EDITORIAL LOOKBOOK STAGE ==================== */}
        <div className="styling-stage-container">
          <div className="styling-lookbook-card">
            {/* Background grid overlay */}
            <div className="styling-lookbook-grid" />

            {/* Stage Card Header */}
            <div className="styling-card-header">
              <span className="styling-card-brand">KD-XX LOOKBOOK</span>
              <span className="styling-card-sub">3-ROW STUDIO</span>
            </div>

            {/* The 3 Horizontal Rows */}
            <div className="styling-rows-wrap">
              {/* -------------------- ROW 1: TOPS -------------------- */}
              <div
                className={`styling-row ${!activeTop ? 'row-empty' : ''}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd('tops')}
              >
                <div className="styling-row-header">
                  <div className="styling-row-label-group">
                    <span className="styling-row-tag">01 • TOPS</span>
                    {topsList.length > 0 && (
                      <span className="styling-row-counter">
                        {currentTopIndex + 1} / {topsList.length}
                      </span>
                    )}
                  </div>
                  {activeTop && (
                    <div className="styling-row-actions">
                      <button
                        type="button"
                        onClick={() => setActiveModalCategory('tops')}
                        className="styling-row-btn-icon"
                        title="Thêm hoặc chọn áo khác từ kho đồ"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCurrentItem('tops')}
                        className="styling-row-btn-icon delete"
                        title="Xóa áo này khỏi danh sách"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="styling-row-content">
                  {topsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handlePrevItem('tops')}
                      className="styling-arrow-btn prev"
                      title="Chuyển sang áo trước đó"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}

                  {activeTop ? (
                    <div className="styling-triplet-stage">
                      {topsTriplet.prev && topsList.length > 1 && (
                        <div
                          className="styling-triplet-slot side prev"
                          onClick={() => handlePrevItem('tops')}
                          title={`Chuyển sang: ${topsTriplet.prev.name}`}
                        >
                          <img
                            src={topsTriplet.prev.image}
                            alt={topsTriplet.prev.name}
                            className="styling-triplet-img side-img"
                          />
                        </div>
                      )}

                      <div className="styling-triplet-slot center">
                        <img
                          src={activeTop.image}
                          alt={activeTop.name}
                          className="styling-triplet-img center-img"
                        />
                        <button
                          type="button"
                          className={`styling-pin-badge ${lockedRows.tops ? 'pinned' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock('tops');
                          }}
                          title={lockedRows.tops ? 'Đã ghim áo này (giữ nguyên khi Phối ngẫu nhiên)' : 'Ghim áo này'}
                        >
                          <Pin size={13} className={lockedRows.tops ? 'fill-purple-600 text-purple-600' : 'text-gray-400'} />
                        </button>
                      </div>

                      {topsTriplet.next && topsList.length > 1 && (
                        <div
                          className="styling-triplet-slot side next"
                          onClick={() => handleNextItem('tops')}
                          title={`Chuyển sang: ${topsTriplet.next.name}`}
                        >
                          <img
                            src={topsTriplet.next.image}
                            alt={topsTriplet.next.name}
                            className="styling-triplet-img side-img"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveModalCategory('tops')}
                      className="styling-empty-btn"
                    >
                      <div className="styling-empty-icon">
                        <Plus size={20} />
                      </div>
                      <span className="styling-empty-text">+ CHỌN ÁO (ADD TOPS)</span>
                    </button>
                  )}

                  {topsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleNextItem('tops')}
                      className="styling-arrow-btn next"
                      title="Chuyển sang áo kế tiếp"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* -------------------- ROW 2: BOTTOMS -------------------- */}
              <div
                className={`styling-row ${!activeBottom ? 'row-empty' : ''}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd('bottoms')}
              >
                <div className="styling-row-header">
                  <div className="styling-row-label-group">
                    <span className="styling-row-tag">02 • BOTTOMS</span>
                    {bottomsList.length > 0 && (
                      <span className="styling-row-counter">
                        {currentBottomIndex + 1} / {bottomsList.length}
                      </span>
                    )}
                  </div>
                  {activeBottom && (
                    <div className="styling-row-actions">
                      <button
                        type="button"
                        onClick={() => setActiveModalCategory('bottoms')}
                        className="styling-row-btn-icon"
                        title="Thêm hoặc chọn quần khác"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCurrentItem('bottoms')}
                        className="styling-row-btn-icon delete"
                        title="Xóa quần này khỏi danh sách"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="styling-row-content">
                  {bottomsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handlePrevItem('bottoms')}
                      className="styling-arrow-btn prev"
                      title="Chuyển sang quần trước đó"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}

                  {activeBottom ? (
                    <div className="styling-triplet-stage">
                      {bottomsTriplet.prev && bottomsList.length > 1 && (
                        <div
                          className="styling-triplet-slot side prev"
                          onClick={() => handlePrevItem('bottoms')}
                          title={`Chuyển sang: ${bottomsTriplet.prev.name}`}
                        >
                          <img
                            src={bottomsTriplet.prev.image}
                            alt={bottomsTriplet.prev.name}
                            className="styling-triplet-img side-img"
                          />
                        </div>
                      )}

                      <div className="styling-triplet-slot center">
                        <img
                          src={activeBottom.image}
                          alt={activeBottom.name}
                          className="styling-triplet-img center-img"
                        />
                        <button
                          type="button"
                          className={`styling-pin-badge ${lockedRows.bottoms ? 'pinned' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock('bottoms');
                          }}
                          title={lockedRows.bottoms ? 'Đã ghim quần này (giữ nguyên khi Phối ngẫu nhiên)' : 'Ghim quần này'}
                        >
                          <Pin size={13} className={lockedRows.bottoms ? 'fill-purple-600 text-purple-600' : 'text-gray-400'} />
                        </button>
                      </div>

                      {bottomsTriplet.next && bottomsList.length > 1 && (
                        <div
                          className="styling-triplet-slot side next"
                          onClick={() => handleNextItem('bottoms')}
                          title={`Chuyển sang: ${bottomsTriplet.next.name}`}
                        >
                          <img
                            src={bottomsTriplet.next.image}
                            alt={bottomsTriplet.next.name}
                            className="styling-triplet-img side-img"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveModalCategory('bottoms')}
                      className="styling-empty-btn"
                    >
                      <div className="styling-empty-icon">
                        <Plus size={20} />
                      </div>
                      <span className="styling-empty-text">+ CHỌN QUẦN (ADD BOTTOMS)</span>
                    </button>
                  )}

                  {bottomsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleNextItem('bottoms')}
                      className="styling-arrow-btn next"
                      title="Chuyển sang quần kế tiếp"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* -------------------- ROW 3: SHOES -------------------- */}
              <div
                className={`styling-row ${!activeShoe ? 'row-empty' : ''}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => handleTouchEnd('shoes')}
              >
                <div className="styling-row-header">
                  <div className="styling-row-label-group">
                    <span className="styling-row-tag">03 • SHOES</span>
                    {shoesList.length > 0 && (
                      <span className="styling-row-counter">
                        {currentShoeIndex + 1} / {shoesList.length}
                      </span>
                    )}
                  </div>
                  {activeShoe && (
                    <div className="styling-row-actions">
                      <button
                        type="button"
                        onClick={() => setActiveModalCategory('shoes')}
                        className="styling-row-btn-icon"
                        title="Thêm hoặc chọn giày khác"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCurrentItem('shoes')}
                        className="styling-row-btn-icon delete"
                        title="Xóa giày này khỏi danh sách"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="styling-row-content">
                  {shoesList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handlePrevItem('shoes')}
                      className="styling-arrow-btn prev"
                      title="Chuyển sang giày trước đó"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}

                  {activeShoe ? (
                    <div className="styling-triplet-stage">
                      {shoesTriplet.prev && shoesList.length > 1 && (
                        <div
                          className="styling-triplet-slot side prev"
                          onClick={() => handlePrevItem('shoes')}
                          title={`Chuyển sang: ${shoesTriplet.prev.name}`}
                        >
                          <img
                            src={shoesTriplet.prev.image}
                            alt={shoesTriplet.prev.name}
                            className="styling-triplet-img side-img"
                          />
                        </div>
                      )}

                      <div className="styling-triplet-slot center">
                        <img
                          src={activeShoe.image}
                          alt={activeShoe.name}
                          className="styling-triplet-img center-img"
                        />
                        <button
                          type="button"
                          className={`styling-pin-badge ${lockedRows.shoes ? 'pinned' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock('shoes');
                          }}
                          title={lockedRows.shoes ? 'Đã ghim giày này (giữ nguyên khi Phối ngẫu nhiên)' : 'Ghim giày này'}
                        >
                          <Pin size={13} className={lockedRows.shoes ? 'fill-purple-600 text-purple-600' : 'text-gray-400'} />
                        </button>
                      </div>

                      {shoesTriplet.next && shoesList.length > 1 && (
                        <div
                          className="styling-triplet-slot side next"
                          onClick={() => handleNextItem('shoes')}
                          title={`Chuyển sang: ${shoesTriplet.next.name}`}
                        >
                          <img
                            src={shoesTriplet.next.image}
                            alt={shoesTriplet.next.name}
                            className="styling-triplet-img side-img"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveModalCategory('shoes')}
                      className="styling-empty-btn"
                    >
                      <div className="styling-empty-icon">
                        <Plus size={20} />
                      </div>
                      <span className="styling-empty-text">+ CHỌN GIÀY (ADD SHOES)</span>
                    </button>
                  )}

                  {shoesList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleNextItem('shoes')}
                      className="styling-arrow-btn next"
                      title="Chuyển sang giày kế tiếp"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Stage Card Footer */}
            <div className="styling-card-footer">
              <span className="styling-footer-brand">KD-XX FIT LAB</span>
              <span className="styling-footer-sub">BUILD YOUR FIT. MAKE IT YOURS.</span>
            </div>
          </div>
        </div>

        {/* ==================== RIGHT: SIDEBAR (INFO, ACCESSORIES & SUMMARY) ==================== */}
        <div className="styling-sidebar">
          {/* ==================== 1. THÔNG TIN MÓN ĐỒ ĐANG PHỐI ==================== */}
          <div className="styling-side-card">
            <div className="styling-side-card-header">
              <span className="styling-side-card-title">
                <Shirt size={14} className="text-purple-400" />
                <span>THÔNG TIN MÓN ĐỒ ĐANG PHỐI</span>
              </span>
              <span className="styling-side-card-badge">
                {[activeTop, activeBottom, activeShoe].filter(Boolean).length} / 3 món
              </span>
            </div>

            <div className="styling-info-list">
              {/* --- 01 • ÁO (TOP) --- */}
              <div className={`styling-info-item ${flashingRow === 'tops' || flashingRow === 'all' ? 'flash' : ''}`}>
                <div className="styling-info-item-head">
                  <span className="styling-info-tag">01 • ÁO (TOP)</span>
                  {activeTop && (
                    <div className="styling-info-head-badges">
                      {lockedRows.tops && (
                        <span className="styling-info-pinned-badge">
                          <Pin size={10} className="fill-purple-400 text-purple-400" />
                          <span>Đã ghim</span>
                        </span>
                      )}
                      {processingIds.has(activeTop.id) ? (
                        <span className="styling-bg-pill processing">
                          <Loader2 size={9} className="animate-spin" />
                          <span>Tách nền AI...</span>
                        </span>
                      ) : activeTop.isCutout ? (
                        <span className="styling-bg-pill">
                          <Check size={9} />
                          <span>Nền trong suốt</span>
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {activeTop ? (
                  <div className="styling-info-item-body">
                    <div className="styling-info-thumb-wrap">
                      <img src={activeTop.image} alt={activeTop.name} className="styling-info-thumb" />
                    </div>
                    <div className="styling-info-meta">
                      <span className="styling-info-brand">{activeTop.brand}</span>
                      <h4 className="styling-info-name" title={activeTop.name}>{activeTop.name}</h4>
                      <div className="styling-info-foot">
                        <span className="styling-info-price">
                          ${activeTop.price?.toLocaleString() || '—'}
                        </span>
                        <div className="styling-info-actions">
                          <button
                            type="button"
                            onClick={() => toggleLock('tops')}
                            className={`styling-info-action-btn ${lockedRows.tops ? 'active-pin' : ''}`}
                            title={lockedRows.tops ? 'Mở ghim áo này' : 'Ghim áo này'}
                          >
                            <Pin size={11} className={lockedRows.tops ? 'fill-current' : ''} />
                            <span>{lockedRows.tops ? 'Đã ghim' : 'Ghim'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveModalCategory('tops')}
                            className="styling-info-action-btn"
                            title="Đổi mẫu áo khác"
                          >
                            Đổi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCurrentItem('tops')}
                            className="styling-info-action-btn del"
                            title="Xóa áo này"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="styling-info-empty-row">
                    <span>Chưa chọn áo</span>
                    <button
                      type="button"
                      onClick={() => setActiveModalCategory('tops')}
                      className="styling-info-add-btn"
                    >
                      + Chọn áo
                    </button>
                  </div>
                )}
              </div>

              {/* --- 02 • QUẦN (BOTTOM) --- */}
              <div className={`styling-info-item ${flashingRow === 'bottoms' || flashingRow === 'all' ? 'flash' : ''}`}>
                <div className="styling-info-item-head">
                  <span className="styling-info-tag">02 • QUẦN (BOTTOM)</span>
                  {activeBottom && (
                    <div className="styling-info-head-badges">
                      {lockedRows.bottoms && (
                        <span className="styling-info-pinned-badge">
                          <Pin size={10} className="fill-purple-400 text-purple-400" />
                          <span>Đã ghim</span>
                        </span>
                      )}
                      {processingIds.has(activeBottom.id) ? (
                        <span className="styling-bg-pill processing">
                          <Loader2 size={9} className="animate-spin" />
                          <span>Tách nền AI...</span>
                        </span>
                      ) : activeBottom.isCutout ? (
                        <span className="styling-bg-pill">
                          <Check size={9} />
                          <span>Nền trong suốt</span>
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {activeBottom ? (
                  <div className="styling-info-item-body">
                    <div className="styling-info-thumb-wrap">
                      <img src={activeBottom.image} alt={activeBottom.name} className="styling-info-thumb" />
                    </div>
                    <div className="styling-info-meta">
                      <span className="styling-info-brand">{activeBottom.brand}</span>
                      <h4 className="styling-info-name" title={activeBottom.name}>{activeBottom.name}</h4>
                      <div className="styling-info-foot">
                        <span className="styling-info-price">
                          ${activeBottom.price?.toLocaleString() || '—'}
                        </span>
                        <div className="styling-info-actions">
                          <button
                            type="button"
                            onClick={() => toggleLock('bottoms')}
                            className={`styling-info-action-btn ${lockedRows.bottoms ? 'active-pin' : ''}`}
                            title={lockedRows.bottoms ? 'Mở ghim quần này' : 'Ghim quần này'}
                          >
                            <Pin size={11} className={lockedRows.bottoms ? 'fill-current' : ''} />
                            <span>{lockedRows.bottoms ? 'Đã ghim' : 'Ghim'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveModalCategory('bottoms')}
                            className="styling-info-action-btn"
                            title="Đổi mẫu quần khác"
                          >
                            Đổi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCurrentItem('bottoms')}
                            className="styling-info-action-btn del"
                            title="Xóa quần này"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="styling-info-empty-row">
                    <span>Chưa chọn quần</span>
                    <button
                      type="button"
                      onClick={() => setActiveModalCategory('bottoms')}
                      className="styling-info-add-btn"
                    >
                      + Chọn quần
                    </button>
                  </div>
                )}
              </div>

              {/* --- 03 • GIÀY (SHOES) --- */}
              <div className={`styling-info-item ${flashingRow === 'shoes' || flashingRow === 'all' ? 'flash' : ''}`}>
                <div className="styling-info-item-head">
                  <span className="styling-info-tag">03 • GIÀY (SHOES)</span>
                  {activeShoe && (
                    <div className="styling-info-head-badges">
                      {lockedRows.shoes && (
                        <span className="styling-info-pinned-badge">
                          <Pin size={10} className="fill-purple-400 text-purple-400" />
                          <span>Đã ghim</span>
                        </span>
                      )}
                      {processingIds.has(activeShoe.id) ? (
                        <span className="styling-bg-pill processing">
                          <Loader2 size={9} className="animate-spin" />
                          <span>Tách nền AI...</span>
                        </span>
                      ) : activeShoe.isCutout ? (
                        <span className="styling-bg-pill">
                          <Check size={9} />
                          <span>Nền trong suốt</span>
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {activeShoe ? (
                  <div className="styling-info-item-body">
                    <div className="styling-info-thumb-wrap">
                      <img src={activeShoe.image} alt={activeShoe.name} className="styling-info-thumb" />
                    </div>
                    <div className="styling-info-meta">
                      <span className="styling-info-brand">{activeShoe.brand}</span>
                      <h4 className="styling-info-name" title={activeShoe.name}>{activeShoe.name}</h4>
                      <div className="styling-info-foot">
                        <span className="styling-info-price">
                          ${activeShoe.price?.toLocaleString() || '—'}
                        </span>
                        <div className="styling-info-actions">
                          <button
                            type="button"
                            onClick={() => toggleLock('shoes')}
                            className={`styling-info-action-btn ${lockedRows.shoes ? 'active-pin' : ''}`}
                            title={lockedRows.shoes ? 'Mở ghim giày này' : 'Ghim giày này'}
                          >
                            <Pin size={11} className={lockedRows.shoes ? 'fill-current' : ''} />
                            <span>{lockedRows.shoes ? 'Đã ghim' : 'Ghim'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveModalCategory('shoes')}
                            className="styling-info-action-btn"
                            title="Đổi mẫu giày khác"
                          >
                            Đổi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCurrentItem('shoes')}
                            className="styling-info-action-btn del"
                            title="Xóa giày này"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="styling-info-empty-row">
                    <span>Chưa chọn giày</span>
                    <button
                      type="button"
                      onClick={() => setActiveModalCategory('shoes')}
                      className="styling-info-add-btn"
                    >
                      + Chọn giày
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Accessories Card */}
          <div className="styling-side-card">
            <div className="styling-side-card-header">
              <span className="styling-side-card-title">
                <ShoppingBag size={14} className="text-purple-400" />
                <span>PHỤ KIỆN (ACCESSORIES)</span>
              </span>
              <span className="styling-side-card-badge">{accessoriesList.length} món</span>
            </div>

            {accessoriesList.length > 0 ? (
              <div className="styling-accessories-grid">
                {accessoriesList.map((acc) => (
                  <div key={acc.id} className="styling-accessory-item">
                    <img src={acc.image} alt={acc.name} className="styling-accessory-thumb" />
                    <div className="styling-accessory-info">
                      <h5 className="styling-accessory-name">{acc.name}</h5>
                      <span className="styling-accessory-price">
                        ${acc.price?.toLocaleString() || '0'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAccessory(acc.id)}
                      className="styling-accessory-del"
                      title="Xóa phụ kiện này"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="styling-empty-accessory">
                <p>Chưa có phụ kiện nào trong bộ trang phục.</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveModalCategory('accessories')}
              className="styling-btn styling-btn-outline w-full mt-3"
            >
              <Plus size={14} />
              <span>Thêm phụ kiện</span>
            </button>
          </div>

          {/* Outfit Price & Composition Summary */}
          <div className="styling-side-card">
            <div className="styling-side-card-header">
              <span className="styling-side-card-title">
                <SlidersHorizontal size={14} className="text-purple-400" />
                <span>TỔNG QUAN OUTFIT</span>
              </span>
            </div>

            <div className="styling-summary-rows">
              <div className="styling-summary-row">
                <span>Áo (Tops):</span>
                <span className="styling-summary-val">
                  {activeTop ? `$${activeTop.price?.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="styling-summary-row">
                <span>Quần (Bottoms):</span>
                <span className="styling-summary-val">
                  {activeBottom ? `$${activeBottom.price?.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="styling-summary-row">
                <span>Giày (Shoes):</span>
                <span className="styling-summary-val">
                  {activeShoe ? `$${activeShoe.price?.toLocaleString()}` : '—'}
                </span>
              </div>
              {accessoriesList.length > 0 && (
                <div className="styling-summary-row">
                  <span>Phụ kiện ({accessoriesList.length}):</span>
                  <span className="styling-summary-val">
                    $
                    {accessoriesList
                      .reduce((acc, it) => acc + (it.price || 0), 0)
                      ?.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="styling-summary-row total">
                <span>Tổng giá trị outfit:</span>
                <span className="styling-summary-val purple">${totalPrice.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportPng}
              disabled={exporting || (!activeTop && !activeBottom && !activeShoe)}
              className="styling-btn styling-btn-purple w-full"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span>Xuất ảnh Outfit (PNG)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================== 3. ITEM PICKER MODAL ==================== */}
      {activeModalCategory && (
        <div
          className="styling-modal-backdrop"
          onClick={() => setActiveModalCategory(null)}
        >
          <div className="styling-modal" onClick={(e) => e.stopPropagation()}>
            <div className="styling-modal-header">
              <h3 className="styling-modal-title">
                {activeModalCategory === 'tops' && 'CHỌN ÁO (TOPS & OUTERWEAR)'}
                {activeModalCategory === 'bottoms' && 'CHỌN QUẦN (BOTTOMS & PANTS)'}
                {activeModalCategory === 'shoes' && 'CHỌN GIÀY (SHOES & FOOTWEAR)'}
                {activeModalCategory === 'accessories' && 'CHỌN PHỤ KIỆN (ACCESSORIES)'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModalCategory(null)}
                className="styling-modal-close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub Tabs: Catalog vs Upload */}
            <div className="styling-modal-tabs">
              <button
                type="button"
                onClick={() => setModalTab('catalog')}
                className={`styling-modal-tab ${modalTab === 'catalog' ? 'active' : ''}`}
              >
                KD-XX Catalog ({filteredCatalog.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalTab('upload');
                  setUploadCategory(activeModalCategory);
                }}
                className={`styling-modal-tab ${modalTab === 'upload' ? 'active' : ''}`}
              >
                Tải ảnh lên (Upload)
              </button>
            </div>

            {modalTab === 'catalog' ? (
              <>
                {/* Search Box */}
                <div className="styling-modal-search">
                  <Search size={15} className="styling-modal-search-icon" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm theo tên sản phẩm..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Catalog Grid */}
                <div className="styling-modal-body">
                  {loadingProducts ? (
                    <div className="styling-empty-state">
                      <Loader2 size={24} className="animate-spin text-purple-400" />
                      <p>Đang tải danh mục KD-XX...</p>
                    </div>
                  ) : productError ? (
                    <div className="styling-empty-state">
                      <AlertCircle size={24} className="text-amber-400" />
                      <p>{productError}</p>
                    </div>
                  ) : filteredCatalog.length === 0 ? (
                    <div className="styling-empty-state">
                      <Shirt size={28} className="text-gray-600" />
                      <p>Không tìm thấy sản phẩm phù hợp trong danh mục này.</p>
                    </div>
                  ) : (
                    <div className="styling-catalog-grid">
                      {filteredCatalog.map((product) => {
                        const img = product.image || product.images?.[0];
                        return (
                          <div
                            key={product._id || product.id}
                            className="styling-picker-card"
                            onClick={() => handleSelectItem(product, activeModalCategory)}
                          >
                            <div className="styling-picker-thumb-wrap">
                              <img
                                src={img}
                                alt={product.name}
                                className="styling-picker-thumb"
                                loading="lazy"
                              />
                            </div>
                            <div className="styling-picker-info">
                              <h5 className="styling-picker-name">{product.name}</h5>
                              <span className="styling-picker-price">
                                ${product.price?.toLocaleString() || '—'}
                              </span>
                              <button type="button" className="styling-picker-btn">
                                <Plus size={12} />
                                <span>Thêm vào hàng</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              // ==================== UPLOAD TAB ====================
              <div className="styling-modal-body">
                <div className="styling-upload-pane">
                  <label className="styling-upload-dropzone">
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {uploadPreview ? (
                      <img src={uploadPreview} alt="Preview" className="styling-upload-preview" />
                    ) : (
                      <>
                        <Upload size={28} className="text-purple-400" />
                        <p className="text-xs text-gray-300 font-semibold">
                          Bấm để chọn ảnh trang phục từ máy (PNG, JPG, WebP)
                        </p>
                        <span className="text-[10px] text-gray-500">Tối đa 20MB</span>
                      </>
                    )}
                  </label>

                  {uploadError && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <AlertCircle size={13} />
                      <span>{uploadError}</span>
                    </p>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400">Tên món đồ (tùy chọn):</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Áo khoác đen yêu thích"
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      className="bg-[#0f0d16] border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmUpload}
                    disabled={!uploadFile}
                    className="styling-btn styling-btn-purple w-full mt-2"
                  >
                    <Plus size={14} />
                    <span>Thêm vào hàng</span>
                  </button>

                  {userUploads.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <p className="text-xs text-gray-400 mb-2">Ảnh bạn đã tải lên gần đây:</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {userUploads.map((uItem) => (
                          <button
                            key={uItem.id}
                            type="button"
                            onClick={() => handleSelectItem(uItem, activeModalCategory || uploadCategory)}
                            className="w-14 h-14 rounded-lg border border-white/10 bg-[#0f0d16] p-1 flex-shrink-0 hover:border-purple-500 transition-colors"
                            title={uItem.name}
                          >
                            <img src={uItem.image} alt={uItem.name} className="w-full h-full object-contain" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 4. TOAST NOTIFICATIONS ==================== */}
      {toastMessage && (
        <div className={`styling-toast ${toastMessage.type}`}>
          {toastMessage.type === 'success' && <Check size={15} />}
          {toastMessage.type === 'error' && <AlertCircle size={15} />}
          {toastMessage.type === 'info' && <Info size={15} />}
          <span>{toastMessage.message}</span>
        </div>
      )}
    </div>
  );
}
