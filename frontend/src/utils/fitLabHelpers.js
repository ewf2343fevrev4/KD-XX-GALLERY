/**
 * KD-XX FIT LAB — Helper Utilities
 * Categorization, Random Fit outfit generator, and Image/Export handlers
 */
import { getCachedCutout } from './backgroundRemovalService';
import { API_BASE_URL } from '../config/apiConfig';

// Categorize any product or uploaded item into standard Fit Lab slots
export const categorizeItem = (item) => {
  if (!item) return 'accessories';

  // Explicit category from upload or schema
  const cat = (item.category || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const fullText = `${name} ${desc} ${cat}`;

  // 1. Shoes
  if (
    cat === 'shoes' ||
    /shoe|sneaker|boot|runner|slide|skate|loafer|heel|sandals/.test(fullText)
  ) {
    return 'shoes';
  }

  // 2. Bottoms
  if (
    /jean|pants|trousers|skirt|shorts|sweatpants|jogger|cargo|denim/.test(fullText) &&
    !/jacket|hoodie|shirt|tee/.test(name)
  ) {
    return 'bottoms';
  }

  // 3. Tops / Outerwear / One-piece
  if (
    /hoodie|jacket|bomber|tee|t-shirt|shirt|sweater|coat|puffer|vest|cardigan|dress|top|outerwear/.test(
      fullText
    ) ||
    cat === 'clothing' ||
    (cat === 'men' && !/belt|glasses|accessory/.test(fullText)) ||
    (cat === 'women' && !/belt|glasses|accessory|bag/.test(fullText))
  ) {
    return 'tops';
  }

  // 4. Default: Accessories
  return 'accessories';
};

// Map display label and icon info for categories
export const FIT_CATEGORIES = [
  { id: 'all', label: 'All Items' },
  { id: 'tops', label: 'Tops & Outerwear' },
  { id: 'bottoms', label: 'Bottoms' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'accessories', label: 'Accessories' }
];

/**
 * Calculate proportional dimensions preserving the natural aspect ratio of the image.
 * Fits within category-appropriate bounds on the 700x800 canvas so items never look stretched or fat.
 */
export const calculateNaturalDimensions = (naturalWidth, naturalHeight, category = 'tops', maxBox = null) => {
  if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) {
    const defaults = {
      tops: { width: 200, height: 240 },
      bottoms: { width: 190, height: 260 },
      shoes: { width: 180, height: 140 },
      accessories: { width: 140, height: 140 }
    }[category] || { width: 190, height: 210 };
    return defaults;
  }

  const ratio = naturalWidth / naturalHeight;

  // Maximum bounding box limits by category to preserve accurate clothing silhouettes
  const boxLimits = maxBox || {
    tops: { maxWidth: 240, maxHeight: 270 },
    bottoms: { maxWidth: 210, maxHeight: 290 },
    shoes: { maxWidth: 200, maxHeight: 150 },
    accessories: { maxWidth: 150, maxHeight: 150 }
  }[category] || { maxWidth: 220, maxHeight: 250 };

  let width = boxLimits.maxWidth;
  let height = width / ratio;

  if (height > boxLimits.maxHeight) {
    height = boxLimits.maxHeight;
    width = height * ratio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
};

/**
 * Intelligent Random Fit generator
 * Creates a coordinated streetwear look: 1 Top + 1 Bottom + 1 Shoes + 0-2 Accessories
 * Preserves any items currently locked on the canvas!
 */
export const generateRandomFit = ({
  catalogProducts = [],
  userUploads = [],
  currentItems = [],
  canvasWidth = 700,
  canvasHeight = 800
}) => {
  // Combine all usable items with cached cutouts if available
  const allAvailable = [
    ...catalogProducts.map((p) => {
      const rawImg = p.image || p.images?.[0] || '';
      const cached = getCachedCutout(rawImg);
      return {
        source: 'catalog',
        productId: p._id || p.id,
        name: p.name,
        brand: p.brand || 'KD-XX',
        price: p.price,
        image: cached ? cached.cutoutUrl : rawImg,
        originalImage: rawImg,
        isCutout: cached ? cached.isCutout : false,
        category: categorizeItem(p),
        inStock: p.inStock !== false && (p.stock === undefined || p.stock > 0)
      };
    }),
    ...userUploads.map((u) => {
      const cached = getCachedCutout(u.image);
      return {
        source: 'upload',
        productId: u.id,
        name: u.name,
        brand: 'Custom Upload',
        price: 0,
        image: cached ? cached.cutoutUrl : u.image,
        originalImage: u.image,
        isCutout: cached ? cached.isCutout : false,
        category: u.category || categorizeItem(u),
        inStock: true
      };
    })
  ].filter((item) => item.image && item.image.trim() !== '');

  if (allAvailable.length === 0) {
    return { success: false, message: 'Chưa có sản phẩm nào để phối đồ.' };
  }

  // Group by category, preferring in-stock items
  const grouped = {
    tops: allAvailable.filter((i) => i.category === 'tops'),
    bottoms: allAvailable.filter((i) => i.category === 'bottoms'),
    shoes: allAvailable.filter((i) => i.category === 'shoes'),
    accessories: allAvailable.filter((i) => i.category === 'accessories')
  };

  // Keep all locked items from current canvas
  const lockedItems = currentItems.filter((item) => item.isLocked);
  const lockedCategories = new Set(lockedItems.map((item) => item.category));

  const resultItems = [...lockedItems];

  // Helper to pick random item from pool avoiding duplicates
  const usedImages = new Set(resultItems.map((i) => i.image));
  const pickRandom = (pool) => {
    if (!pool || pool.length === 0) return null;
    // Prefer in-stock items first
    const inStockPool = pool.filter((p) => p.inStock && !usedImages.has(p.image));
    const candidatePool = inStockPool.length > 0 ? inStockPool : pool.filter((p) => !usedImages.has(p.image));
    const finalPool = candidatePool.length > 0 ? candidatePool : pool;
    if (finalPool.length === 0) return null;
    const selected = finalPool[Math.floor(Math.random() * finalPool.length)];
    usedImages.add(selected.image);
    return selected;
  };

  // Base canvas layout coordinates (luxury editorial collage style)
  const layoutSpecs = {
    tops: {
      width: Math.min(280, canvasWidth * 0.42),
      height: Math.min(300, canvasHeight * 0.4),
      x: canvasWidth * 0.5 - Math.min(280, canvasWidth * 0.42) / 2,
      y: canvasHeight * 0.12,
      rotation: (Math.random() - 0.5) * 4,
      zIndex: 2
    },
    bottoms: {
      width: Math.min(240, canvasWidth * 0.36),
      height: Math.min(280, canvasHeight * 0.38),
      x: canvasWidth * 0.5 - Math.min(240, canvasWidth * 0.36) / 2 + 10,
      y: canvasHeight * 0.44,
      rotation: (Math.random() - 0.5) * 6,
      zIndex: 1
    },
    shoes: {
      width: Math.min(190, canvasWidth * 0.3),
      height: Math.min(150, canvasHeight * 0.22),
      x: canvasWidth * 0.5 - Math.min(190, canvasWidth * 0.3) / 2 - 15,
      y: canvasHeight * 0.74,
      rotation: (Math.random() - 0.5) * 8,
      zIndex: 3
    },
    accessories1: {
      width: Math.min(130, canvasWidth * 0.22),
      height: Math.min(130, canvasHeight * 0.2),
      x: canvasWidth * 0.14,
      y: canvasHeight * 0.24,
      rotation: (Math.random() - 0.5) * 14,
      zIndex: 4
    },
    accessories2: {
      width: Math.min(140, canvasWidth * 0.24),
      height: Math.min(140, canvasHeight * 0.22),
      x: canvasWidth * 0.68,
      y: canvasHeight * 0.36,
      rotation: (Math.random() - 0.5) * 12,
      zIndex: 4
    }
  };

  // 1. Tops (if not locked)
  if (!lockedCategories.has('tops')) {
    const topItem = pickRandom(grouped.tops) || pickRandom(allAvailable);
    if (topItem) {
      resultItems.push({
        id: `fit-${Date.now()}-top`,
        ...topItem,
        ...layoutSpecs.tops,
        isLocked: false,
        scaleX: 1,
        scaleY: 1
      });
    }
  }

  // 2. Bottoms (if not locked)
  if (!lockedCategories.has('bottoms')) {
    const bottomItem = pickRandom(grouped.bottoms) || pickRandom(grouped.tops);
    if (bottomItem) {
      resultItems.push({
        id: `fit-${Date.now()}-bottom`,
        ...bottomItem,
        ...layoutSpecs.bottoms,
        isLocked: false,
        scaleX: 1,
        scaleY: 1
      });
    }
  }

  // 3. Shoes (if not locked)
  if (!lockedCategories.has('shoes')) {
    const shoeItem = pickRandom(grouped.shoes) || pickRandom(grouped.accessories);
    if (shoeItem) {
      resultItems.push({
        id: `fit-${Date.now()}-shoes`,
        ...shoeItem,
        ...layoutSpecs.shoes,
        isLocked: false,
        scaleX: 1,
        scaleY: 1
      });
    }
  }

  // 4. Accessory (if not locked)
  if (!lockedCategories.has('accessories') && grouped.accessories.length > 0) {
    const acc1 = pickRandom(grouped.accessories);
    if (acc1) {
      resultItems.push({
        id: `fit-${Date.now()}-acc1`,
        ...acc1,
        ...layoutSpecs.accessories1,
        isLocked: false,
        scaleX: 1,
        scaleY: 1
      });
    }

    if (grouped.accessories.length > 1 && Math.random() > 0.4) {
      const acc2 = pickRandom(grouped.accessories);
      if (acc2) {
        resultItems.push({
          id: `fit-${Date.now()}-acc2`,
          ...acc2,
          ...layoutSpecs.accessories2,
          isLocked: false,
          scaleX: 1,
          scaleY: 1
        });
      }
    }
  }

  // Sort by zIndex
  resultItems.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  return {
    success: true,
    items: resultItems,
    message: 'Đã phối thành công một bộ trang phục mới!'
  };
};

/**
 * Auto-align existing items into a balanced outfit composition
 */
export const autoArrangeOutfit = (items = [], canvasWidth = 700, canvasHeight = 800) => {
  if (items.length === 0) return [];

  const tops = items.filter((i) => i.category === 'tops');
  const bottoms = items.filter((i) => i.category === 'bottoms');
  const shoes = items.filter((i) => i.category === 'shoes');
  const others = items.filter(
    (i) => i.category !== 'tops' && i.category !== 'bottoms' && i.category !== 'shoes'
  );

  return items.map((item) => {
    if (item.isLocked) return item;

    const cat = item.category;
    let targetX = canvasWidth * 0.5 - (item.width || 200) / 2;
    let targetY = canvasHeight * 0.3;

    if (cat === 'tops') {
      const idx = tops.indexOf(item);
      targetX = canvasWidth * 0.5 - (item.width || 250) / 2 + (idx > 0 ? (idx % 2 === 0 ? 40 : -40) : 0);
      targetY = canvasHeight * 0.12 + idx * 30;
    } else if (cat === 'bottoms') {
      const idx = bottoms.indexOf(item);
      targetX = canvasWidth * 0.5 - (item.width || 220) / 2 + (idx > 0 ? (idx % 2 === 0 ? 30 : -30) : 0);
      targetY = canvasHeight * 0.45 + idx * 25;
    } else if (cat === 'shoes') {
      const idx = shoes.indexOf(item);
      targetX = canvasWidth * 0.5 - (item.width || 180) / 2 + (idx > 0 ? (idx % 2 === 0 ? 35 : -35) : 0);
      targetY = canvasHeight * 0.74;
    } else {
      // Accessories / other
      const idx = others.indexOf(item);
      if (idx % 2 === 0) {
        targetX = canvasWidth * 0.15;
        targetY = canvasHeight * 0.2 + idx * 80;
      } else {
        targetX = canvasWidth * 0.72;
        targetY = canvasHeight * 0.25 + idx * 80;
      }
    }

    return {
      ...item,
      x: Math.max(10, Math.min(canvasWidth - (item.width || 100), targetX)),
      y: Math.max(10, Math.min(canvasHeight - (item.height || 100), targetY)),
      rotation: 0
    };
  });
};

/**
 * Export canvas composition to high quality PNG
 */
export const exportFitToPng = async (stage, items = [], canvasWidth = 700, canvasHeight = 800) => {
  try {
    // 1. If Konva stage is available, composite stage on white canvas with purple border and grid dots
    if (stage) {
      try {
        const stageDataUrl = stage.toDataURL({
          mimeType: 'image/png',
          pixelRatio: 2
        });

        const exportCanvas = document.createElement('canvas');
        const scale = 2;
        exportCanvas.width = canvasWidth * scale;
        exportCanvas.height = canvasHeight * scale;
        const eCtx = exportCanvas.getContext('2d');
        eCtx.scale(scale, scale);

        // White background
        eCtx.fillStyle = '#ffffff';
        eCtx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Subtle purple dot grid pattern
        eCtx.fillStyle = 'rgba(147, 51, 234, 0.22)';
        for (let x = 16; x < canvasWidth; x += 32) {
          for (let y = 16; y < canvasHeight; y += 32) {
            eCtx.beginPath();
            eCtx.arc(x, y, 1.2, 0, Math.PI * 2);
            eCtx.fill();
          }
        }

        // Purple border
        eCtx.strokeStyle = '#a855f7';
        eCtx.lineWidth = 3;
        eCtx.strokeRect(1.5, 1.5, canvasWidth - 3, canvasHeight - 3);

        // Watermark branding
        eCtx.save();
        eCtx.fillStyle = 'rgba(24, 24, 27, 0.35)';
        eCtx.font = 'bold 14px "Cinzel", serif';
        eCtx.textAlign = 'center';
        eCtx.fillText('KD-XX FIT LAB', canvasWidth / 2, canvasHeight - 34);
        eCtx.fillStyle = 'rgba(126, 34, 206, 0.5)';
        eCtx.font = '8px "Montserrat", sans-serif';
        eCtx.fillText('BUILD YOUR FIT • MADE TRẦN ĐỨC MINH', canvasWidth / 2, canvasHeight - 18);
        eCtx.restore();

        // Draw rendered Konva elements
        const stageImg = await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = stageDataUrl;
        });
        eCtx.drawImage(stageImg, 0, 0, canvasWidth, canvasHeight);

        const dataUrl = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `kd-xx-fit-lab-${Date.now()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return { success: true };
      } catch (corsErr) {
        console.warn('Konva composite hit CORS, falling back to manual canvas renderer:', corsErr);
      }
    }

    // 2. Fallback: Dedicated off-screen HTML5 Canvas renderer with watermark
    const offCanvas = document.createElement('canvas');
    const scale = 2; // Retina quality
    offCanvas.width = canvasWidth * scale;
    offCanvas.height = canvasHeight * scale;
    const ctx = offCanvas.getContext('2d');
    ctx.scale(scale, scale);

    // Background: White canvas with luxury purple border & grid dots
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Subtle purple dot grid pattern
    ctx.fillStyle = 'rgba(147, 51, 234, 0.22)';
    for (let x = 16; x < canvasWidth; x += 32) {
      for (let y = 16; y < canvasHeight; y += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Purple border
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, canvasWidth - 3, canvasHeight - 3);

    // Sort items by zIndex
    const sorted = [...items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    // Load each image with crossOrigin anonymous and proxy fallback
    const loadImage = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          // If direct anonymous fails, try loading through backend proxy to preserve canvas untainted
          if (
            typeof src === 'string' &&
            (src.startsWith('http://') || src.startsWith('https://')) &&
            !src.includes('/api/proxy-image')
          ) {
            const proxyImg = new Image();
            proxyImg.crossOrigin = 'anonymous';
            proxyImg.onload = () => resolve(proxyImg);
            proxyImg.onerror = () => {
              const imgFallback = new Image();
              imgFallback.onload = () => resolve(imgFallback);
              imgFallback.onerror = () => resolve(null);
              imgFallback.src = src;
            };
            proxyImg.src = `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(src)}`;
          } else {
            const imgFallback = new Image();
            imgFallback.onload = () => resolve(imgFallback);
            imgFallback.onerror = () => resolve(null);
            imgFallback.src = src;
          }
        };
        img.src = src;
      });

    for (const item of sorted) {
      if (!item.image) continue;
      const img = await loadImage(item.image);
      if (!img) continue;

      ctx.save();
      const centerX = (item.x || 0) + (item.width || 100) / 2;
      const centerY = (item.y || 0) + (item.height || 100) / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
      ctx.scale(item.scaleX || 1, item.scaleY || 1);

      ctx.drawImage(
        img,
        -(item.width || 100) / 2,
        -(item.height || 100) / 2,
        item.width || 100,
        item.height || 100
      );
      ctx.restore();
    }

    // Add luxury KD-XX branding at bottom center
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Cinzel", "Montserrat", sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText('KD-XX FIT LAB', canvasWidth / 2, canvasHeight - 34);

    ctx.fillStyle = '#a855f7';
    ctx.font = '9px "Montserrat", sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('BUILD YOUR FIT • MADE TRẦN ĐỨC MINH', canvasWidth / 2, canvasHeight - 18);
    ctx.restore();

    // Trigger download
    return new Promise((resolve) => {
      offCanvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ success: false, message: 'Không thể tạo file ảnh.' });
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `kd-xx-fit-lab-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve({ success: true });
        },
        'image/png',
        1.0
      );
    });
  } catch (error) {
    console.error('Export FIT error:', error);
    return { success: false, message: 'Lỗi khi xuất ảnh: ' + error.message };
  }
};

