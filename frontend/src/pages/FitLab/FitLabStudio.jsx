import React, { useState, useEffect, useRef, useCallback } from 'react';
import Konva from 'konva';
import { 
  Sparkles, 
  RotateCw, 
  RotateCcw, 
  FlipHorizontal, 
  Trash2, 
  Lock, 
  Unlock, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  Undo2, 
  Redo2, 
  Plus, 
  Upload, 
  Search, 
  Layers, 
  Grid, 
  Check, 
  AlertCircle, 
  Loader2, 
  X,
  Shirt,
  Scissors,
  Wand2,
  Eye
} from 'lucide-react';
import { 
  FIT_CATEGORIES, 
  categorizeItem, 
  generateRandomFit, 
  autoArrangeOutfit, 
  exportFitToPng,
  calculateNaturalDimensions 
} from '../../utils/fitLabHelpers';
import { 
  processBackgroundRemoval, 
  getCachedCutout 
} from '../../utils/backgroundRemovalService';
import { getAllProducts } from '../../services/api';
import './FitLab.css';

const DEFAULT_CANVAS_WIDTH = 700;
const DEFAULT_CANVAS_HEIGHT = 800;

/**
 * Load an image element safely with crossOrigin support,
 * automatic fallback to backend proxy if external CDN blocks CORS (e.g. Farfetch, Scayle),
 * and final fallback to no-crossOrigin so the image always renders on canvas.
 */
const createSafeImageElement = (url, onLoad, onError) => {
  if (!url) {
    if (onError) onError(new Error('Empty image URL'));
    return null;
  }

  const img = new window.Image();
  img.crossOrigin = 'anonymous';

  let settled = false;

  img.onload = () => {
    if (!settled) {
      settled = true;
      if (onLoad) onLoad(img);
    }
  };

  img.onerror = () => {
    // If direct CORS fails on a remote URL, try via backend proxy
    if (
      typeof url === 'string' &&
      (url.startsWith('http://') || url.startsWith('https://')) &&
      !url.includes('/api/proxy-image')
    ) {
      const proxyImg = new window.Image();
      proxyImg.crossOrigin = 'anonymous';
      proxyImg.onload = () => {
        if (!settled) {
          settled = true;
          if (onLoad) onLoad(proxyImg);
        }
      };
      proxyImg.onerror = () => {
        // Fallback without crossOrigin so canvas at least renders the image
        const rawImg = new window.Image();
        rawImg.onload = () => {
          if (!settled) {
            settled = true;
            if (onLoad) onLoad(rawImg);
          }
        };
        rawImg.onerror = (e) => {
          if (!settled) {
            settled = true;
            if (onError) onError(e);
          }
        };
        rawImg.src = url;
      };
      proxyImg.src = `http://localhost:5000/api/proxy-image?url=${encodeURIComponent(url)}`;
    } else {
      const rawImg = new window.Image();
      rawImg.onload = () => {
        if (!settled) {
          settled = true;
          if (onLoad) onLoad(rawImg);
        }
      };
      rawImg.onerror = (e) => {
        if (!settled) {
          settled = true;
          if (onError) onError(e);
        }
      };
      rawImg.src = url;
    }
  };

  img.src = url;
  return img;
};

export default function FitLabStudio() {
  // ==================== STATE ====================
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState(null);

  // Canvas Items
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Auto AI Background Removal Toggle (Enabled by default)
  const [autoRemoveBg, setAutoRemoveBg] = useState(true);
  const [activeBgJobsCount, setActiveBgJobsCount] = useState(0);

  // History for Undo / Redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Wardrobe Panel State
  const [activeWardrobeTab, setActiveWardrobeTab] = useState('catalog'); // 'catalog' | 'uploads'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // User Uploads State
  const [userUploads, setUserUploads] = useState([]);
  const [uploadCategory, setUploadCategory] = useState('tops');
  const [uploadError, setUploadError] = useState(null);

  // Mobile Workspace Navigation
  const [mobileTab, setMobileTab] = useState('canvas'); // 'wardrobe' | 'canvas' | 'tools'

  // Modals & UI Feedback
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Konva References
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const trRef = useRef(null);
  const nodesMapRef = useRef(new Map());

  // Show Toast
  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Push to undo history
  const pushHistory = useCallback((newItems) => {
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyIndex + 1);
      return [...upToCurrent, JSON.parse(JSON.stringify(newItems))];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // ==================== LOAD CATALOG PRODUCTS ====================
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
            setCatalogProducts([]);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Fit Lab fetch catalog error:', err);
          setProductError('Không thể tải danh sách sản phẩm. Bạn vẫn có thể tải ảnh lên để trải nghiệm.');
        }
      } finally {
        if (isMounted) setLoadingProducts(false);
      }
    };

    fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // ==================== INIT KONVA STAGE ====================
  useEffect(() => {
    if (!containerRef.current) return;

    // Create Stage
    const stage = new Konva.Stage({
      container: containerRef.current,
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    // Transformer for selection, rotation, resizing
    const tr = new Konva.Transformer({
      keepRatio: true,
      rotateEnabled: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      anchorSize: 10,
      anchorStroke: '#a855f7',
      anchorFill: '#ffffff',
      anchorStrokeWidth: 2,
      anchorCornerRadius: 4,
      borderStroke: '#a855f7',
      borderStrokeWidth: 1.5,
      borderDash: [4, 4],
      rotateAnchorOffset: 25
    });
    layer.add(tr);

    // Click on empty space deselects
    stage.on('click tap', (e) => {
      if (e.target === stage) {
        setSelectedId(null);
        tr.nodes([]);
        layer.batchDraw();
      }
    });

    stageRef.current = stage;
    layerRef.current = layer;
    trRef.current = tr;

    return () => {
      stage.destroy();
    };
  }, []);

  // ==================== RENDER ITEMS ON KONVA LAYER ====================
  useEffect(() => {
    const layer = layerRef.current;
    const tr = trRef.current;
    if (!layer || !tr) return;

    // Track existing node keys to avoid recreating unchanged nodes
    const existingIds = new Set(nodesMapRef.current.keys());
    const currentIds = new Set(items.map((i) => i.id));

    // Remove deleted nodes
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        const node = nodesMapRef.current.get(id);
        if (node) {
          node.destroy();
          nodesMapRef.current.delete(id);
        }
      }
    }

    // Sort items by zIndex before adding/moving
    const sortedItems = [...items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    sortedItems.forEach((item) => {
      let group = nodesMapRef.current.get(item.id);

      if (!group) {
        // Create new Group for the item
        group = new Konva.Group({
          id: item.id,
          x: item.x || 100,
          y: item.y || 100,
          rotation: item.rotation || 0,
          draggable: !item.isLocked
        });

        // Load image safely with automatic CORS / proxy fallback & true natural aspect ratio preservation
        createSafeImageElement(
          item.image,
          (imgObj) => {
            const natW = imgObj.naturalWidth || imgObj.width;
            const natH = imgObj.naturalHeight || imgObj.height;
            const naturalDims = calculateNaturalDimensions(natW, natH, item.category);

            // Use custom size if user has resized, otherwise strictly use natural proportional dimensions (no stretching!)
            const actualW = item.hasCustomSize ? (item.width || naturalDims.width) : naturalDims.width;
            const actualH = item.hasCustomSize ? (item.height || naturalDims.height) : naturalDims.height;

            let kImage = group.findOne('Image');
            if (!kImage) {
              kImage = new Konva.Image({
                id: `kimg-${item.id}`,
                image: imgObj,
                width: actualW,
                height: actualH,
                shadowColor: '#000000',
                shadowBlur: 14,
                shadowOpacity: 0.18,
                shadowOffset: { x: 0, y: 5 }
              });
              group.add(kImage);
              kImage.moveToBottom();
            } else {
              kImage.image(imgObj);
              kImage.width(actualW);
              kImage.height(actualH);
            }

            // Sync item state width/height with true natural proportions if not custom resized
            if (!item.hasCustomSize && (item.width !== actualW || item.height !== actualH || !item.naturalWidth)) {
              setItems((prev) =>
                prev.map((it) =>
                  it.id === item.id
                    ? { ...it, width: actualW, height: actualH, naturalWidth: natW, naturalHeight: natH }
                    : it
                )
              );
            }

            layer.batchDraw();
          },
          (err) => {
            console.error('Failed to load image for item:', item.name, err);
          }
        );

        // Add processing tag if currently running AI background removal
        if (item.isProcessingBg) {
          const loadingTag = new Konva.Label({
            name: 'bg-processing-tag',
            x: 8,
            y: 8
          });
          loadingTag.add(
            new Konva.Tag({
              fill: 'rgba(126, 34, 206, 0.9)',
              cornerRadius: 4,
              shadowColor: 'black',
              shadowBlur: 8,
              shadowOpacity: 0.6
            })
          );
          loadingTag.add(
            new Konva.Text({
              text: item.bgStatusText || 'Tách nền AI...',
              fontSize: 10,
              fontStyle: 'bold',
              fill: '#ffffff',
              padding: 4
            })
          );
          group.add(loadingTag);
        }

        layer.batchDraw();

        // Click to select
        group.on('click tap', () => {
          setSelectedId(item.id);
        });

        // Drag events
        group.on('dragstart', () => {
          setSelectedId(item.id);
        });

        group.on('dragend', (e) => {
          const newX = e.target.x();
          const newY = e.target.y();
          setItems((prev) => {
            const next = prev.map((it) => (it.id === item.id ? { ...it, x: newX, y: newY } : it));
            pushHistory(next);
            return next;
          });
        });

        // Transform end (resize/rotate)
        group.on('transformend', () => {
          const newX = group.x();
          const newY = group.y();
          const newRot = group.rotation();
          const scaleX = group.scaleX();
          const scaleY = group.scaleY();

          // Reset scale and adjust width/height for clean bounding
          const newWidth = Math.max(40, (item.width || 200) * scaleX);
          const newHeight = Math.max(40, (item.height || 220) * scaleY);
          group.scaleX(1);
          group.scaleY(1);

          const childImg = group.findOne('Image');
          if (childImg) {
            childImg.width(newWidth);
            childImg.height(newHeight);
          }

          setItems((prev) => {
            const next = prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    hasCustomSize: true,
                    x: newX,
                    y: newY,
                    rotation: newRot,
                    width: newWidth,
                    height: newHeight
                  }
                : it
            );
            pushHistory(next);
            return next;
          });
        });

        layer.add(group);
        nodesMapRef.current.set(item.id, group);
      } else {
        // Update existing group properties
        group.x(item.x || 0);
        group.y(item.y || 0);
        group.rotation(item.rotation || 0);
        group.draggable(!item.isLocked);

        const childImg = group.findOne('Image');
        if (childImg) {
          childImg.width(item.width || 200);
          childImg.height(item.height || 220);

          // Update image source texture when background cutout finishes!
          const currentImgObj = childImg.image();
          if (currentImgObj && currentImgObj.src !== item.image) {
            createSafeImageElement(item.image, (newImg) => {
              childImg.image(newImg);
              if (!item.hasCustomSize) {
                const natW = newImg.naturalWidth || newImg.width;
                const natH = newImg.naturalHeight || newImg.height;
                const naturalDims = calculateNaturalDimensions(natW, natH, item.category);
                childImg.width(naturalDims.width);
                childImg.height(naturalDims.height);
              }
              layer.batchDraw();
            });
          }
        } else {
          // If child image was pending or delayed, load it now with natural proportions
          createSafeImageElement(item.image, (newImg) => {
            const natW = newImg.naturalWidth || newImg.width;
            const natH = newImg.naturalHeight || newImg.height;
            const naturalDims = calculateNaturalDimensions(natW, natH, item.category);
            const actualW = item.hasCustomSize ? (item.width || naturalDims.width) : naturalDims.width;
            const actualH = item.hasCustomSize ? (item.height || naturalDims.height) : naturalDims.height;

            let existingKImg = group.findOne('Image');
            if (!existingKImg) {
              const kImage = new Konva.Image({
                id: `kimg-${item.id}`,
                image: newImg,
                width: actualW,
                height: actualH,
                shadowColor: '#000000',
                shadowBlur: 14,
                shadowOpacity: 0.18,
                shadowOffset: { x: 0, y: 5 }
              });
              group.add(kImage);
              kImage.moveToBottom();
            } else {
              existingKImg.image(newImg);
              existingKImg.width(actualW);
              existingKImg.height(actualH);
            }
            layer.batchDraw();
          });
        }

        // Render or update processing tag badge on Konva group
        let loadingTag = group.findOne('.bg-processing-tag');
        if (item.isProcessingBg) {
          if (!loadingTag) {
            loadingTag = new Konva.Label({
              name: 'bg-processing-tag',
              x: 8,
              y: 8
            });
            loadingTag.add(
              new Konva.Tag({
                fill: 'rgba(126, 34, 206, 0.9)',
                cornerRadius: 4,
                shadowColor: 'black',
                shadowBlur: 8,
                shadowOpacity: 0.6
              })
            );
            loadingTag.add(
              new Konva.Text({
                text: item.bgStatusText || 'Tách nền AI...',
                fontSize: 10,
                fontStyle: 'bold',
                fill: '#ffffff',
                padding: 4
              })
            );
            group.add(loadingTag);
          } else {
            const textNode = loadingTag.findOne('Text');
            if (textNode) {
              textNode.text(item.bgStatusText || 'Tách nền AI...');
            }
          }
        } else if (loadingTag) {
          loadingTag.destroy();
        }
      }

      // Move group to proper zIndex position in layer
      group.moveToTop();
    });

    // Ensure transformer stays above all items
    tr.moveToTop();

    // Attach transformer to selected item (if not locked)
    if (selectedId) {
      const selectedItem = items.find((i) => i.id === selectedId);
      const selectedNode = nodesMapRef.current.get(selectedId);
      if (selectedNode && selectedItem && !selectedItem.isLocked) {
        tr.nodes([selectedNode]);
      } else {
        tr.nodes([]);
      }
    } else {
      tr.nodes([]);
    }

    layer.batchDraw();
  }, [items, selectedId, pushHistory]);

  // ==================== ACTIONS: BACKGROUND REMOVAL PIPELINE ====================
  const triggerBackgroundRemovalForItem = async (itemId, rawImageUrl, itemName) => {
    setActiveBgJobsCount((count) => count + 1);

    try {
      const res = await processBackgroundRemoval(rawImageUrl, {
        onProgress: (percent) => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId
                ? { ...it, bgProgress: percent, bgStatusText: `Tách nền... ${percent}%` }
                : it
            )
          );
        },
        onStatusChange: (statusMsg) => {
          setItems((prev) =>
            prev.map((it) => (it.id === itemId ? { ...it, bgStatusText: statusMsg } : it))
          );
        }
      });

      if (res.success && res.isCutout) {
        setItems((prev) => {
          const next = prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  image: res.url,
                  isCutout: true,
                  isProcessingBg: false,
                  bgStatusText: '',
                  bgError: null
                }
              : it
          );
          pushHistory(next);
          return next;
        });
        showToast(`Đã tách nền AI cho "${itemName}"!`, 'success');
      } else if (res.alreadyTransparent) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  isProcessingBg: false,
                  isCutout: false,
                  alreadyTransparent: true,
                  bgStatusText: ''
                }
              : it
          )
        );
      } else {
        // Fallback: retain original image
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  isProcessingBg: false,
                  isCutout: false,
                  bgStatusText: '',
                  bgError: res.error || 'Giữ ảnh gốc'
                }
              : it
          )
        );
        if (res.error) {
          showToast(`Giữ ảnh gốc cho "${itemName}": ${res.error}`, 'info');
        }
      }
    } catch (err) {
      console.warn('Background removal error for item:', err);
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                isProcessingBg: false,
                isCutout: false,
                bgStatusText: '',
                bgError: err.message
              }
            : it
        )
      );
    } finally {
      setActiveBgJobsCount((count) => Math.max(0, count - 1));
    }
  };

  // ==================== ACTIONS: ADD ITEM TO CANVAS ====================
  const handleAddItemToCanvas = (productOrUpload, source = 'catalog', customPosition = null) => {
    const rawImageUrl = productOrUpload.image || productOrUpload.images?.[0];
    if (!rawImageUrl) {
      showToast('Sản phẩm không có ảnh để hiển thị.', 'error');
      return;
    }

    const cat = productOrUpload.category || categorizeItem(productOrUpload);

    // Initial proportional dimensions based on category (refined as soon as image loads)
    const initialDims = calculateNaturalDimensions(0, 0, cat);
    const width = initialDims.width;
    const height = initialDims.height;

    // Coordinates: use drop position if provided, else staggered center
    const offset = (items.length % 5) * 20;
    const x = customPosition?.x ?? Math.max(20, DEFAULT_CANVAS_WIDTH * 0.5 - width / 2 + offset);
    const y = customPosition?.y ?? Math.max(20, DEFAULT_CANVAS_HEIGHT * 0.35 - height / 2 + offset);

    // Check if we already have a cached cutout for this image URL
    const cached = getCachedCutout(rawImageUrl);

    const itemId = `fit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const shouldRunBgRemoval = autoRemoveBg && !cached;

    const newItem = {
      id: itemId,
      source,
      productId: productOrUpload._id || productOrUpload.id,
      name: productOrUpload.name || 'KD-XX Item',
      brand: productOrUpload.brand || (source === 'catalog' ? 'KD-XX' : 'My Upload'),
      price: productOrUpload.price || 0,
      image: cached ? cached.cutoutUrl : rawImageUrl,
      originalImage: rawImageUrl,
      category: cat,
      x,
      y,
      width,
      height,
      hasCustomSize: false,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: items.length + 1,
      isLocked: false,
      isCutout: cached ? cached.isCutout : false,
      isProcessingBg: shouldRunBgRemoval,
      bgProgress: 0,
      bgStatusText: shouldRunBgRemoval ? 'Tách nền AI...' : ''
    };

    setItems((prev) => {
      const next = [...prev, newItem];
      pushHistory(next);
      return next;
    });

    setSelectedId(newItem.id);
    showToast(`Đã thêm "${newItem.name}" vào bàn phối.`);

    // Switch to canvas on mobile view
    if (window.innerWidth < 1024) {
      setMobileTab('canvas');
    }

    // Trigger AI background removal asynchronously if requested and not cached
    if (shouldRunBgRemoval) {
      triggerBackgroundRemovalForItem(itemId, rawImageUrl, newItem.name);
    }
  };

  // ==================== DRAG & DROP FROM WARDROBE ====================
  const handleDragStart = (e, productOrUpload, source = 'catalog') => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ item: productOrUpload, source })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDropOnCanvas = (e) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;

    try {
      const { item, source } = JSON.parse(rawData);
      if (!item) return;

      const rect = containerRef.current?.getBoundingClientRect();
      let dropX = DEFAULT_CANVAS_WIDTH / 2 - 100;
      let dropY = DEFAULT_CANVAS_HEIGHT / 2 - 110;

      if (rect) {
        dropX = Math.max(10, Math.min(DEFAULT_CANVAS_WIDTH - 200, e.clientX - rect.left - 100));
        dropY = Math.max(10, Math.min(DEFAULT_CANVAS_HEIGHT - 200, e.clientY - rect.top - 110));
      }

      handleAddItemToCanvas(item, source, { x: dropX, y: dropY });
    } catch (err) {
      console.warn('Drop error on canvas:', err);
    }
  };

  // ==================== ACTIONS: EDIT SELECTED ====================
  const selectedItem = items.find((i) => i.id === selectedId) || null;

  const handleToggleLock = () => {
    if (!selectedId) return;
    setItems((prev) => {
      const next = prev.map((it) => (it.id === selectedId ? { ...it, isLocked: !it.isLocked } : it));
      pushHistory(next);
      return next;
    });
  };

  const handleDeleteItem = (idToDelete = selectedId) => {
    if (!idToDelete) return;
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== idToDelete);
      pushHistory(next);
      return next;
    });
    if (selectedId === idToDelete) {
      setSelectedId(null);
    }
  };

  const handleRotate = (angleDelta) => {
    if (!selectedId) return;
    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === selectedId
          ? { ...it, rotation: ((it.rotation || 0) + angleDelta + 360) % 360 }
          : it
      );
      pushHistory(next);
      return next;
    });
  };

  const handleFlipHorizontal = () => {
    if (!selectedId) return;
    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === selectedId ? { ...it, scaleX: (it.scaleX || 1) * -1 } : it
      );
      pushHistory(next);
      return next;
    });
  };

  const handleScaleChange = (multiplier) => {
    if (!selectedId) return;
    setItems((prev) => {
      const next = prev.map((it) => {
        if (it.id !== selectedId) return it;
        const newW = Math.max(50, Math.min(550, (it.width || 200) * multiplier));
        const newH = Math.max(50, Math.min(600, (it.height || 220) * multiplier));
        return { ...it, hasCustomSize: true, width: newW, height: newH };
      });
      pushHistory(next);
      return next;
    });
  };

  const handleLayerOrder = (direction) => {
    if (!selectedId) return;
    setItems((prev) => {
      const index = prev.findIndex((it) => it.id === selectedId);
      if (index === -1) return prev;

      const next = [...prev];
      if (direction === 'up' && index < next.length - 1) {
        const temp = next[index];
        next[index] = next[index + 1];
        next[index + 1] = temp;
      } else if (direction === 'down' && index > 0) {
        const temp = next[index];
        next[index] = next[index - 1];
        next[index - 1] = temp;
      } else if (direction === 'top') {
        const [moved] = next.splice(index, 1);
        next.push(moved);
      } else if (direction === 'bottom') {
        const [moved] = next.splice(index, 1);
        next.unshift(moved);
      }

      // Reassign zIndex sequentially
      next.forEach((it, i) => {
        it.zIndex = i + 1;
      });

      pushHistory(next);
      return next;
    });
  };

  // Revert / Toggle between Cutout and Original Image
  const handleToggleCutout = (item) => {
    if (!item) return;

    if (item.isCutout) {
      // Revert to original opaque image
      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === item.id
            ? { ...it, image: it.originalImage || it.image, isCutout: false }
            : it
        );
        pushHistory(next);
        return next;
      });
      showToast('Đã chuyển về ảnh gốc có nền.');
    } else {
      // Run or re-apply background removal
      const cached = getCachedCutout(item.originalImage || item.image);
      if (cached && cached.isCutout) {
        setItems((prev) => {
          const next = prev.map((it) =>
            it.id === item.id ? { ...it, image: cached.cutoutUrl, isCutout: true } : it
          );
          pushHistory(next);
          return next;
        });
        showToast('Đã áp dụng nền trong suốt từ bộ nhớ đệm!');
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, isProcessingBg: true, bgStatusText: 'Đang tách nền AI...' }
              : it
          )
        );
        triggerBackgroundRemovalForItem(item.id, item.originalImage || item.image, item.name);
      }
    }
  };

  // ==================== ACTIONS: UNDO / REDO ====================
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setItems(JSON.parse(JSON.stringify(history[prevIndex])));
      setHistoryIndex(prevIndex);
      setSelectedId(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setItems(JSON.parse(JSON.stringify(history[nextIndex])));
      setHistoryIndex(nextIndex);
      setSelectedId(null);
    }
  };

  // ==================== ACTIONS: RANDOM FIT ====================
  const handleRandomFit = () => {
    const result = generateRandomFit({
      catalogProducts,
      userUploads,
      currentItems: items,
      canvasWidth: DEFAULT_CANVAS_WIDTH,
      canvasHeight: DEFAULT_CANVAS_HEIGHT
    });

    if (result.success && result.items) {
      // Mark any newly picked items that aren't already cutout for AI background removal
      const preparedItems = result.items.map((it) => {
        const cached = getCachedCutout(it.originalImage || it.image);
        const shouldRun = autoRemoveBg && !cached && !it.isCutout;
        return {
          ...it,
          originalImage: it.originalImage || it.image,
          image: cached ? cached.cutoutUrl : it.image,
          isCutout: cached ? cached.isCutout : it.isCutout || false,
          isProcessingBg: shouldRun,
          bgStatusText: shouldRun ? 'Tách nền AI...' : ''
        };
      });

      setItems(preparedItems);
      pushHistory(preparedItems);
      setSelectedId(null);
      showToast(result.message, 'success');

      // Asynchronously process background removal for newly picked items
      if (autoRemoveBg) {
        preparedItems.forEach((it) => {
          if (it.isProcessingBg) {
            triggerBackgroundRemovalForItem(it.id, it.originalImage || it.image, it.name);
          }
        });
      }
    } else {
      showToast(result.message || 'Không thể tạo outfit.', 'error');
    }
  };

  // ==================== ACTIONS: AUTO-ARRANGE LAYOUT ====================
  const handleAutoArrange = () => {
    if (items.length === 0) return;
    const arranged = autoArrangeOutfit(items, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT);
    setItems(arranged);
    pushHistory(arranged);
    showToast('Đã sắp xếp lại bố cục trang phục.');
  };

  // ==================== ACTIONS: CLEAR CANVAS ====================
  const handleClearCanvas = () => {
    setItems([]);
    setSelectedId(null);
    pushHistory([]);
    setShowClearConfirm(false);
    showToast('Đã làm trống bàn phối đồ.');
  };

  // ==================== ACTIONS: EXPORT PNG ====================
  const handleExportPng = async () => {
    if (items.length === 0) {
      showToast('Bàn phối đồ đang trống. Vui lòng thêm sản phẩm trước khi xuất ảnh.', 'error');
      return;
    }

    try {
      setExporting(true);
      showToast('Đang tạo ảnh chất lượng cao...', 'info');
      const res = await exportFitToPng(
        stageRef.current,
        items,
        DEFAULT_CANVAS_WIDTH,
        DEFAULT_CANVAS_HEIGHT
      );

      if (res?.success) {
        showToast('Đã tải xuống file kd-xx-fit-lab.png!', 'success');
      } else {
        showToast(res?.message || 'Không thể xuất file.', 'error');
      }
    } catch (err) {
      console.error('Export error:', err);
      showToast('Lỗi khi xuất ảnh: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // ==================== ACTIONS: USER UPLOAD ====================
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Định dạng không hỗ trợ. Vui lòng chọn ảnh PNG, JPG, JPEG hoặc WebP.');
      return;
    }

    // Validate size (max 8MB)
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Kích thước ảnh vượt quá 8MB. Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const newUpload = {
      id: `upload-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      image: objectUrl,
      category: uploadCategory,
      createdAt: new Date()
    };

    setUserUploads((prev) => [newUpload, ...prev]);
    showToast(`Đã thêm ảnh "${newUpload.name}" vào bộ sưu tập cá nhân.`, 'success');

    // Reset input
    e.target.value = '';
  };

  // Clean up object URLs when unmounting
  useEffect(() => {
    return () => {
      userUploads.forEach((u) => {
        if (u.image && u.image.startsWith('blob:')) {
          URL.revokeObjectURL(u.image);
        }
      });
    };
  }, [userUploads]);

  // ==================== FILTER PRODUCTS ====================
  const filteredCatalog = catalogProducts.filter((p) => {
    const cat = categorizeItem(p);
    const matchCategory = selectedCategory === 'all' || cat === selectedCategory;
    const matchSearch =
      !searchQuery.trim() ||
      (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

  const filteredUploads = userUploads.filter((u) => {
    const matchCategory = selectedCategory === 'all' || u.category === selectedCategory;
    const matchSearch =
      !searchQuery.trim() || u.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="fit-lab-studio">
      {/* ==================== STUDIO HEADER / BANNER ==================== */}
      <div className="fit-lab-header">
        <div className="fit-lab-header-left">
          <div className="fit-lab-badge">
            <Sparkles size={13} className="text-purple-400" />
            <span>2D OUTFIT COLLAGE STUDIO • AI CUTOUT</span>
          </div>
          <h1 className="fit-lab-title">KD-XX FIT LAB</h1>
          <p className="fit-lab-tagline">BUILD YOUR FIT. Mix pieces. Make it yours.</p>
        </div>

        {/* Global Action Bar */}
        <div className="fit-lab-header-actions">
          {/* Auto AI Cutout Toggle */}
          <div className="fit-lab-auto-cutout-toggle">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-300">
              <input
                type="checkbox"
                checked={autoRemoveBg}
                onChange={(e) => setAutoRemoveBg(e.target.checked)}
                className="fit-lab-checkbox"
              />
              <span className="flex items-center gap-1.5">
                <Wand2 size={13} className="text-purple-400" />
                <span>Tự động tách nền AI</span>
              </span>
            </label>
            {activeBgJobsCount > 0 && (
              <span className="fit-lab-active-jobs-badge">
                <Loader2 size={11} className="animate-spin text-purple-300" />
                <span>{activeBgJobsCount} đang xử lý</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleRandomFit}
            className="fit-lab-btn fit-lab-btn-purple"
            title="Tự động phối đồ ngẫu nhiên từ kho sản phẩm (giữ nguyên các món đã khóa)"
          >
            <Sparkles size={15} />
            <span>Random Fit</span>
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            disabled={exporting || items.length === 0}
            className="fit-lab-btn fit-lab-btn-primary"
            title="Xuất bố cục trang phục thành ảnh PNG chất lượng cao"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            <span>Export PNG</span>
          </button>
        </div>
      </div>

      {/* ==================== MOBILE NAVIGATION BAR ==================== */}
      <div className="fit-lab-mobile-tabs lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('wardrobe')}
          className={`fit-lab-mobile-tab ${mobileTab === 'wardrobe' ? 'active' : ''}`}
        >
          <Shirt size={16} />
          <span>Wardrobe</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('canvas')}
          className={`fit-lab-mobile-tab ${mobileTab === 'canvas' ? 'active' : ''}`}
        >
          <Grid size={16} />
          <span>Canvas ({items.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('tools')}
          className={`fit-lab-mobile-tab ${mobileTab === 'tools' ? 'active' : ''}`}
        >
          <Scissors size={16} />
          <span>Tools {selectedItem ? '•' : ''}</span>
        </button>
      </div>

      {/* ==================== WORKSPACE GRID (3 PANELS) ==================== */}
      <div className="fit-lab-workspace">
        {/* ==================== 1. LEFT PANEL: WARDROBE ==================== */}
        <aside
          className={`fit-lab-panel fit-lab-wardrobe ${
            mobileTab === 'wardrobe' ? 'mobile-visible' : 'mobile-hidden'
          }`}
        >
          <div className="fit-lab-panel-header">
            <h2 className="fit-lab-panel-title">TỦ ĐỒ (WARDROBE)</h2>
            <span className="fit-lab-item-count">
              {activeWardrobeTab === 'catalog'
                ? `${filteredCatalog.length} món`
                : `${filteredUploads.length} món`}
            </span>
          </div>

          {/* Sub-Tabs: Catalog vs My Uploads */}
          <div className="fit-lab-wardrobe-tabs">
            <button
              type="button"
              onClick={() => setActiveWardrobeTab('catalog')}
              className={`fit-lab-wardrobe-tab ${activeWardrobeTab === 'catalog' ? 'active' : ''}`}
            >
              KD-XX Catalog
            </button>
            <button
              type="button"
              onClick={() => setActiveWardrobeTab('uploads')}
              className={`fit-lab-wardrobe-tab ${activeWardrobeTab === 'uploads' ? 'active' : ''}`}
            >
              My Uploads ({userUploads.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="fit-lab-search-box">
            <Search size={14} className="fit-lab-search-icon" />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên sản phẩm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="fit-lab-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="fit-lab-search-clear"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="fit-lab-category-pills">
            {FIT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`fit-lab-category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="fit-lab-wardrobe-content">
            {activeWardrobeTab === 'catalog' ? (
              // ==================== CATALOG PRODUCTS ====================
              loadingProducts ? (
                <div className="fit-lab-empty-state">
                  <Loader2 size={24} className="animate-spin text-purple-400" />
                  <p>Đang tải danh mục KD-XX...</p>
                </div>
              ) : productError ? (
                <div className="fit-lab-empty-state">
                  <AlertCircle size={24} className="text-amber-400" />
                  <p>{productError}</p>
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="fit-lab-empty-state">
                  <Shirt size={28} className="text-gray-600" />
                  <p>Không tìm thấy sản phẩm phù hợp.</p>
                </div>
              ) : (
                <div className="fit-lab-product-grid">
                  {filteredCatalog.map((product) => {
                    const img = product.image || product.images?.[0];
                    const cat = categorizeItem(product);
                    return (
                      <div
                        key={product._id || product.id}
                        className="fit-lab-product-card"
                        draggable="true"
                        onDragStart={(e) => handleDragStart(e, product, 'catalog')}
                        title="Kéo thả trực tiếp lên bàn phối hoặc bấm Add"
                      >
                        <div className="fit-lab-product-thumb-wrap">
                          <img
                            src={img}
                            alt={product.name}
                            className="fit-lab-product-thumb"
                            loading="lazy"
                          />
                          <span className="fit-lab-category-tag">{cat}</span>
                        </div>
                        <div className="fit-lab-product-info">
                          <h4 className="fit-lab-product-name">{product.name}</h4>
                          <div className="fit-lab-product-meta">
                            <span className="fit-lab-product-price">
                              ${product.price?.toLocaleString() || '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAddItemToCanvas(product, 'catalog')}
                              className="fit-lab-add-btn"
                              title="Thêm vào bàn phối"
                            >
                              <Plus size={14} />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              // ==================== MY UPLOADS TAB ====================
              <div className="fit-lab-uploads-area">
                {/* Upload Form Box */}
                <div className="fit-lab-upload-box">
                  <div className="fit-lab-upload-header">
                    <Upload size={16} className="text-purple-400" />
                    <span>Tải ảnh trang phục cá nhân</span>
                  </div>
                  <p className="fit-lab-upload-hint">
                    Hỗ trợ PNG (giữ trong suốt), JPG, WebP. AI tự động tách nền khi thêm vào bàn phối.
                  </p>

                  <div className="fit-lab-upload-controls">
                    <label className="fit-lab-select-label">
                      <span>Loại món:</span>
                      <select
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                        className="fit-lab-select"
                      >
                        <option value="tops">Tops & Outerwear</option>
                        <option value="bottoms">Bottoms</option>
                        <option value="shoes">Shoes</option>
                        <option value="accessories">Accessories</option>
                      </select>
                    </label>

                    <label className="fit-lab-upload-file-btn">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <span>Chọn file từ máy</span>
                    </label>
                  </div>

                  {uploadError && <p className="fit-lab-error-text">{uploadError}</p>}
                </div>

                {/* Uploaded List */}
                {filteredUploads.length === 0 ? (
                  <div className="fit-lab-empty-state">
                    <Layers size={28} className="text-gray-600" />
                    <p>Chưa có ảnh nào được tải lên.</p>
                  </div>
                ) : (
                  <div className="fit-lab-product-grid">
                    {filteredUploads.map((up) => (
                      <div
                        key={up.id}
                        className="fit-lab-product-card"
                        draggable="true"
                        onDragStart={(e) => handleDragStart(e, up, 'upload')}
                        title="Kéo thả trực tiếp lên bàn phối hoặc bấm Add"
                      >
                        <div className="fit-lab-product-thumb-wrap">
                          <img src={up.image} alt={up.name} className="fit-lab-product-thumb" />
                          <span className="fit-lab-category-tag">{up.category}</span>
                        </div>
                        <div className="fit-lab-product-info">
                          <h4 className="fit-lab-product-name">{up.name}</h4>
                          <div className="fit-lab-product-meta">
                            <button
                              type="button"
                              onClick={() => handleAddItemToCanvas(up, 'upload')}
                              className="fit-lab-add-btn"
                            >
                              <Plus size={14} />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ==================== 2. CENTER PANEL: OUTFIT CANVAS ==================== */}
        <main
          className={`fit-lab-panel fit-lab-canvas-area ${
            mobileTab === 'canvas' ? 'mobile-visible' : 'mobile-hidden'
          }`}
        >
          {/* Canvas Controls Toolbar */}
          <div className="fit-lab-canvas-toolbar">
            <div className="fit-lab-toolbar-group">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="fit-lab-tool-btn"
                title="Hoàn tác (Undo)"
              >
                <Undo2 size={15} />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="fit-lab-tool-btn"
                title="Làm lại (Redo)"
              >
                <Redo2 size={15} />
              </button>
              <div className="fit-lab-toolbar-divider" />
              <button
                type="button"
                onClick={handleAutoArrange}
                disabled={items.length === 0}
                className="fit-lab-tool-btn"
                title="Tự động sắp xếp vị trí hợp lý (Auto Arrange Layout)"
              >
                <Grid size={15} />
                <span className="hidden sm:inline text-xs">Bố cục cân đối</span>
              </button>
            </div>

            <div className="fit-lab-toolbar-group">
              <span className="fit-lab-canvas-stats">
                {items.length} món trên bàn phối
                {items.some((i) => i.isLocked) && (
                  <span className="text-purple-400 ml-1">
                    ({items.filter((i) => i.isLocked).length} đã khóa)
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={items.length === 0}
                className="fit-lab-tool-btn text-red-400 hover:text-red-300"
                title="Làm trống toàn bộ bàn phối"
              >
                <Trash2 size={15} />
                <span className="hidden sm:inline text-xs">Xóa hết</span>
              </button>
            </div>
          </div>

          {/* Konva Stage Wrapper with Drag-and-Drop Dropzone */}
          <div
            className="fit-lab-canvas-wrapper"
            onDragOver={handleDragOver}
            onDrop={handleDropOnCanvas}
          >
            <div className="fit-lab-canvas-frame">
              {/* Luxury grid background overlay */}
              <div className="fit-lab-grid-overlay" />

              {/* Watermark branding */}
              <div className="fit-lab-canvas-watermark">
                <span className="brand">KD-XX FIT LAB</span>
                <span className="sub">BUILD YOUR FIT • AI CUTOUT READY</span>
              </div>

              {/* Konva Container */}
              <div ref={containerRef} className="fit-lab-konva-container" />

              {/* Empty Canvas Guidance */}
              {items.length === 0 && (
                <div className="fit-lab-canvas-empty-guide">
                  <div className="fit-lab-empty-icon-wrap">
                    <Shirt size={32} strokeWidth={1.4} className="text-zinc-400" />
                  </div>
                  <h3 className="fit-lab-empty-title">BÀN PHỐI ĐANG TRỐNG</h3>
                  <p className="fit-lab-empty-desc">
                    Kéo thả hoặc chọn các món đồ từ Tủ đồ bên trái. AI sẽ tự động tách nền để tạo
                    cutout thời trang trong suốt. Hoặc nhấn <strong>Random Fit</strong> để phối một
                    bộ hoàn chỉnh.
                  </p>
                  <button
                    type="button"
                    onClick={handleRandomFit}
                    className="fit-lab-btn fit-lab-btn-purple mt-4"
                  >
                    <Sparkles size={16} />
                    <span>Phối Ngẫu Nhiên Ngay</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ==================== 3. RIGHT PANEL: EDITING TOOLS ==================== */}
        <aside
          className={`fit-lab-panel fit-lab-tools ${
            mobileTab === 'tools' ? 'mobile-visible' : 'mobile-hidden'
          }`}
        >
          <div className="fit-lab-panel-header">
            <h2 className="fit-lab-panel-title">CÔNG CỤ TÙY CHỈNH</h2>
          </div>

          <div className="fit-lab-tools-content">
            {/* Selected Item Controls */}
            {selectedItem ? (
              <div className="fit-lab-tool-section">
                <div className="fit-lab-tool-section-header">
                  <span className="fit-lab-section-title">Món đang chọn</span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    Bỏ chọn
                  </button>
                </div>

                {/* Selected Item Preview Card */}
                <div className="fit-lab-selected-preview">
                  <img
                    src={selectedItem.image}
                    alt={selectedItem.name}
                    className="fit-lab-selected-thumb"
                  />
                  <div className="fit-lab-selected-details">
                    <div className="flex items-center gap-2">
                      <span className="fit-lab-category-tag">{selectedItem.category}</span>
                      {selectedItem.isLocked && (
                        <span className="fit-lab-locked-badge">
                          <Lock size={10} /> Khóa
                        </span>
                      )}
                    </div>
                    <h4 className="fit-lab-selected-name">{selectedItem.name}</h4>
                    <span className="fit-lab-selected-brand">{selectedItem.brand}</span>
                  </div>
                </div>

                {/* AI Background Removal Status & Controls */}
                <div className="fit-lab-ai-bg-card">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                      <Wand2 size={12} className="text-purple-400" />
                      <span>Tách nền thời trang (AI):</span>
                    </span>

                    {selectedItem.isCutout ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check size={10} />
                        <span>Nền trong suốt</span>
                      </span>
                    ) : selectedItem.isProcessingBg ? (
                      <span className="text-[10px] font-bold text-purple-300 bg-purple-950/70 border border-purple-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin text-purple-300" />
                        <span>{selectedItem.bgStatusText || 'Đang tách nền...'}</span>
                      </span>
                    ) : selectedItem.alreadyTransparent ? (
                      <span className="text-[10px] text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                        Nền gốc trong suốt
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                        Ảnh có khung nền
                      </span>
                    )}
                  </div>

                  {/* Toggle Cutout vs Original Button */}
                  <div className="flex gap-2">
                    {selectedItem.isCutout ? (
                      <button
                        type="button"
                        onClick={() => handleToggleCutout(selectedItem)}
                        className="fit-lab-action-btn flex-1 text-xs"
                        title="Xem lại ảnh gốc có khung nền trắng ban đầu"
                      >
                        <Eye size={13} />
                        <span>Khôi phục ảnh gốc</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleCutout(selectedItem)}
                        disabled={selectedItem.isProcessingBg}
                        className="fit-lab-action-btn flex-1 text-xs bg-purple-900/40 hover:bg-purple-800/60 border-purple-500/30 text-purple-200"
                        title="Dùng AI tách nền trắng để lấy cutout trong suốt"
                      >
                        {selectedItem.isProcessingBg ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Wand2 size={13} className="text-purple-400" />
                        )}
                        <span>
                          {selectedItem.isProcessingBg ? 'Đang phân tích...' : 'Tách nền AI ngay'}
                        </span>
                      </button>
                    )}
                  </div>

                  {selectedItem.bgError && (
                    <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={10} />
                      <span>{selectedItem.bgError}</span>
                    </p>
                  )}
                </div>

                {/* Lock Toggle */}
                <div className="fit-lab-tool-row">
                  <button
                    type="button"
                    onClick={handleToggleLock}
                    className={`fit-lab-action-btn w-full ${
                      selectedItem.isLocked ? 'active-lock' : ''
                    }`}
                  >
                    {selectedItem.isLocked ? <Lock size={15} /> : <Unlock size={15} />}
                    <span>{selectedItem.isLocked ? 'Đang khóa (Giữ nguyên)' : 'Khóa vị trí'}</span>
                  </button>
                </div>

                {/* Quick Transform Controls */}
                {!selectedItem.isLocked && (
                  <>
                    <div className="fit-lab-tool-group">
                      <span className="fit-lab-group-label">Xoay & Lật ảnh:</span>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleRotate(-90)}
                          className="fit-lab-action-btn"
                          title="Xoay trái 90°"
                        >
                          <RotateCcw size={14} />
                          <span>-90°</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRotate(90)}
                          className="fit-lab-action-btn"
                          title="Xoay phải 90°"
                        >
                          <RotateCw size={14} />
                          <span>+90°</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleFlipHorizontal}
                          className="fit-lab-action-btn"
                          title="Lật gương ngang"
                        >
                          <FlipHorizontal size={14} />
                          <span>Lật</span>
                        </button>
                      </div>
                    </div>

                    {/* Scale Controls */}
                    <div className="fit-lab-tool-group">
                      <span className="fit-lab-group-label">Kích thước (Scale):</span>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleScaleChange(0.9)}
                          className="fit-lab-action-btn"
                          title="Thu nhỏ 10%"
                        >
                          <span>- 10%</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleScaleChange(1.1)}
                          className="fit-lab-action-btn"
                          title="Phóng to 10%"
                        >
                          <span>+ 10%</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setItems((prev) => {
                              const next = prev.map((it) => {
                                if (it.id !== selectedId) return it;
                                const naturalDims = calculateNaturalDimensions(
                                  it.naturalWidth,
                                  it.naturalHeight,
                                  it.category
                                );
                                return {
                                  ...it,
                                  hasCustomSize: false,
                                  width: naturalDims.width,
                                  height: naturalDims.height,
                                  rotation: 0,
                                  scaleX: 1
                                };
                              });
                              pushHistory(next);
                              return next;
                            });
                          }}
                          className="fit-lab-action-btn"
                          title="Khôi phục kích thước chuẩn theo tỷ lệ ảnh gốc"
                        >
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>

                    {/* Layer Ordering */}
                    <div className="fit-lab-tool-group">
                      <span className="fit-lab-group-label">Thứ tự lớp (Layer):</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleLayerOrder('up')}
                          className="fit-lab-action-btn"
                          title="Đưa lên trên 1 lớp"
                        >
                          <ArrowUp size={14} />
                          <span>Lên 1 lớp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLayerOrder('down')}
                          className="fit-lab-action-btn"
                          title="Đưa xuống dưới 1 lớp"
                        >
                          <ArrowDown size={14} />
                          <span>Xuống 1 lớp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLayerOrder('top')}
                          className="fit-lab-action-btn"
                          title="Đưa lên trên cùng"
                        >
                          <Layers size={14} />
                          <span>Lên trên cùng</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLayerOrder('bottom')}
                          className="fit-lab-action-btn"
                          title="Đưa xuống dưới cùng"
                        >
                          <Layers size={14} />
                          <span>Xuống dưới cùng</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Remove Item Button */}
                <div className="fit-lab-tool-row pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(selectedId)}
                    className="fit-lab-delete-btn w-full"
                  >
                    <Trash2 size={15} />
                    <span>Xóa món này khỏi bàn</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="fit-lab-tool-section text-center py-6 px-4 border border-dashed border-white/10 rounded-xl">
                <Scissors size={28} className="mx-auto text-gray-600 mb-2" />
                <h4 className="text-sm font-semibold text-gray-300">Chưa chọn món nào</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Nhấp vào một món đồ trên bàn phối để xoay, lật, tách nền AI, thay đổi kích thước hoặc sắp xếp lớp.
                </p>
              </div>
            )}

            {/* Quick Actions Card */}
            <div className="fit-lab-tool-section mt-4">
              <span className="fit-lab-section-title">Hành động nhanh</span>
              <div className="space-y-2 mt-2">
                <button
                  type="button"
                  onClick={handleRandomFit}
                  className="fit-lab-action-card w-full"
                >
                  <div className="fit-lab-action-card-icon bg-purple-900/30 text-purple-400">
                    <Sparkles size={18} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-xs font-bold text-white">Random Fit Phối Đồ</div>
                    <div className="text-[10px] text-gray-400">
                      Tự động phối 1 Áo + 1 Quần + 1 Giày + Phụ kiện (Tự động tách nền AI)
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportPng}
                  disabled={exporting || items.length === 0}
                  className="fit-lab-action-card w-full"
                >
                  <div className="fit-lab-action-card-icon bg-emerald-900/30 text-emerald-400">
                    <Download size={18} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-xs font-bold text-white">Xuất ảnh PNG</div>
                    <div className="text-[10px] text-gray-400">
                      Tải file kd-xx-fit-lab.png chất lượng cao (giữ nguyên độ trong suốt)
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ==================== CLEAR CONFIRM MODAL ==================== */}
      {showClearConfirm && (
        <div className="fit-lab-modal-backdrop">
          <div className="fit-lab-modal">
            <h3 className="fit-lab-modal-title">Xác nhận làm trống bàn phối?</h3>
            <p className="fit-lab-modal-desc">
              Tất cả {items.length} món đồ hiện tại sẽ được gỡ khỏi bàn phối. Bạn có thể sử dụng
              nút Hoàn tác (Undo) nếu cần khôi phục lại.
            </p>
            <div className="fit-lab-modal-actions">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="fit-lab-btn fit-lab-btn-outline"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleClearCanvas}
                className="fit-lab-btn fit-lab-btn-danger"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TOAST FEEDBACK ==================== */}
      {toastMessage && (
        <div className={`fit-lab-toast ${toastMessage.type}`}>
          {toastMessage.type === 'success' && <Check size={16} />}
          {toastMessage.type === 'error' && <AlertCircle size={16} />}
          {toastMessage.type === 'info' && <Sparkles size={16} />}
          <span>{toastMessage.message}</span>
        </div>
      )}
    </div>
  );
}
