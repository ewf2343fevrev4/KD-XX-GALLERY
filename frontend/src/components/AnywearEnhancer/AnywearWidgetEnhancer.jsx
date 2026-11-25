import { useEffect } from 'react';
import './AnywearWidgetEnhancer.css';

const STORAGE_KEY = 'kdxx_anywear_pill_pos_v1';
const GLITTER_SYMBOLS = ['✦', '✧', '⋆', '•'];
const GLITTER_COLORS = ['#f5d0fe', '#e879f9', '#c084fc', '#d8b4fe', '#ffffff'];
const MAX_ACTIVE_PARTICLES = 36;

/**
 * Clamp pill coordinates inside viewport with comfortable breathing margin
 */
function clampPosition(left, top, width, height) {
  const margin = 12;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    left: Math.min(Math.max(margin, left), maxX),
    top: Math.min(Math.max(margin, top), maxY),
  };
}

/**
 * Read saved normalized anchor or default bottom-left cute position
 */
function getInitialCoordinates(width, height) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.xRatio === 'number' && typeof parsed?.yRatio === 'number') {
        const rawLeft = parsed.xRatio * Math.max(1, window.innerWidth - width);
        const rawTop = parsed.yRatio * Math.max(1, window.innerHeight - height);
        return clampPosition(rawLeft, rawTop, width, height);
      }
    }
  } catch {
    // Ignore storage read errors
  }
  // Default: sleek bottom-left corner with breathing room
  return clampPosition(20, window.innerHeight - height - 20, width, height);
}

function saveCoordinates(left, top, width, height) {
  try {
    const denomX = Math.max(1, window.innerWidth - width);
    const denomY = Math.max(1, window.innerHeight - height);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        xRatio: Math.min(1, Math.max(0, left / denomX)),
        yRatio: Math.min(1, Math.max(0, top / denomY)),
      })
    );
  } catch {
    // Ignore storage write errors
  }
}

export default function AnywearWidgetEnhancer() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Lightweight fixed overlay container for glitter particles (below widget z-index)
    let glitterLayer = document.getElementById('kdxx-anywear-glitter-layer');
    if (!glitterLayer) {
      glitterLayer = document.createElement('div');
      glitterLayer.id = 'kdxx-anywear-glitter-layer';
      glitterLayer.className = 'kdxx-glitter-layer';
      document.body.appendChild(glitterLayer);
    }

    let lastSpawnAt = 0;

    const spawnGlitter = (x, y, vx = 0, vy = 0, count = 2) => {
      if (!glitterLayer) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      // Enforce hard cap on active particles for zero lag
      while (glitterLayer.childElementCount > MAX_ACTIVE_PARTICLES) {
        glitterLayer.firstElementChild?.remove();
      }

      for (let i = 0; i < count; i += 1) {
        const el = document.createElement('span');
        el.className = 'kdxx-glitter-particle';

        const symbol = GLITTER_SYMBOLS[Math.floor(Math.random() * GLITTER_SYMBOLS.length)];
        const color = GLITTER_COLORS[Math.floor(Math.random() * GLITTER_COLORS.length)];
        const size = symbol === '•' ? 4 + Math.random() * 4 : 9 + Math.random() * 8;
        const duration = 480 + Math.random() * 280;

        // Trail slightly opposite the movement vector + cute scatter
        const spreadX = (Math.random() - 0.5) * 32 - Math.max(-18, Math.min(18, vx * 1.4));
        const spreadY = (Math.random() - 0.5) * 26 - Math.max(-18, Math.min(18, vy * 1.4)) + 10;
        const startX = x + (Math.random() - 0.5) * 16;
        const startY = y + (Math.random() - 0.5) * 14;
        const rot = `${Math.round((Math.random() - 0.5) * 160)}deg`;
        const scale = (0.75 + Math.random() * 0.65).toFixed(2);

        el.textContent = symbol;
        el.style.color = color;
        el.style.fontSize = `${size.toFixed(1)}px`;
        el.style.textShadow = `0 0 8px ${color}`;
        el.style.setProperty('--x0', `${startX.toFixed(1)}px`);
        el.style.setProperty('--y0', `${startY.toFixed(1)}px`);
        el.style.setProperty('--dx', `${spreadX.toFixed(1)}px`);
        el.style.setProperty('--dy', `${spreadY.toFixed(1)}px`);
        el.style.setProperty('--rot', rot);
        el.style.setProperty('--sc', scale);
        el.style.setProperty('--dur', `${Math.round(duration)}ms`);

        glitterLayer.appendChild(el);
        window.setTimeout(() => {
          el.remove();
        }, duration + 40);
      }
    };

    const spawnGlitterThrottled = (x, y, vx, vy) => {
      const now = performance.now();
      if (now - lastSpawnAt < 24) return;
      lastSpawnAt = now;
      spawnGlitter(x, y, vx, vy, 2);
    };

    const applyPillPosition = (widget) => {
      const rect = widget.getBoundingClientRect();
      const width = rect.width || 168;
      const height = rect.height || 36;
      const { left, top } = getInitialCoordinates(width, height);
      widget.style.setProperty('bottom', 'auto', 'important');
      widget.style.setProperty('right', 'auto', 'important');
      widget.style.setProperty('left', `${Math.round(left)}px`, 'important');
      widget.style.setProperty('top', `${Math.round(top)}px`, 'important');
    };

    const decoratePillContent = (pillBtn) => {
      if (!pillBtn || pillBtn.dataset.kdxxDecorated) return;
      pillBtn.dataset.kdxxDecorated = '1';

      const mainSpan = pillBtn.querySelector('span');
      if (mainSpan && !mainSpan.querySelector('.kdxx-pill-sparkle')) {
        const sparkle = document.createElement('span');
        sparkle.className = 'kdxx-pill-sparkle';
        sparkle.setAttribute('aria-hidden', 'true');
        sparkle.textContent = '✦';
        const svg = mainSpan.querySelector('svg');
        if (svg && svg.nextSibling) {
          mainSpan.insertBefore(sparkle, svg.nextSibling);
        } else {
          mainSpan.prepend(sparkle);
        }
      }
    };

    const bindPillDrag = (widget, pillBtn) => {
      if (!widget || !pillBtn || pillBtn.dataset.kdxxDragBound) return;
      pillBtn.dataset.kdxxDragBound = '1';

      let dragging = false;
      let hasMoved = false;
      let activePointerId = null;
      let startX = 0;
      let startY = 0;
      let originLeft = 0;
      let originTop = 0;
      let prevX = 0;
      let prevY = 0;
      let boxWidth = 168;
      let boxHeight = 36;
      let suppressClick = false;

      // Capture click to prevent opening popup right after a drag gesture
      const onCaptureClick = (e) => {
        if (!suppressClick) return;
        suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
      };
      widget.addEventListener('click', onCaptureClick, true);

      const onPointerMove = (e) => {
        if (!dragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!hasMoved && Math.hypot(dx, dy) < 5) {
          return;
        }

        if (!hasMoved) {
          hasMoved = true;
          widget.classList.add('kdxx-is-dragging');
          // Subtle initial puff of glitter when lift-off begins
          spawnGlitter(e.clientX, e.clientY, 0, 0, 4);
        }

        const { left, top } = clampPosition(originLeft + dx, originTop + dy, boxWidth, boxHeight);
        widget.style.setProperty('bottom', 'auto', 'important');
        widget.style.setProperty('right', 'auto', 'important');
        widget.style.setProperty('left', `${Math.round(left)}px`, 'important');
        widget.style.setProperty('top', `${Math.round(top)}px`, 'important');

        const vx = e.clientX - prevX;
        const vy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;

        // Trail sparkling dust behind the dragged pill
        spawnGlitterThrottled(left + boxWidth * 0.5, top + boxHeight * 0.5, vx, vy);
      };

      const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;

        try {
          if (activePointerId !== null && pillBtn.hasPointerCapture?.(activePointerId)) {
            pillBtn.releasePointerCapture(activePointerId);
          }
        } catch {
          // Ignore pointer capture release errors
        }
        activePointerId = null;

        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', endDrag);

        if (hasMoved) {
          suppressClick = true;
          window.setTimeout(() => {
            suppressClick = false;
          }, 220);

          const finalRect = widget.getBoundingClientRect();
          saveCoordinates(finalRect.left, finalRect.top, finalRect.width, finalRect.height);

          // Tiny cute celebratory burst on drop
          if (e && typeof e.clientX === 'number') {
            spawnGlitter(finalRect.left + finalRect.width * 0.5, finalRect.top + finalRect.height * 0.5, 0, 0, 5);
          }
        }

        widget.classList.remove('kdxx-is-dragging');
        hasMoved = false;
      };

      pillBtn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest?.('[aria-label="Minimise"]')) return;

        const rect = widget.getBoundingClientRect();
        dragging = true;
        hasMoved = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        prevX = e.clientX;
        prevY = e.clientY;
        originLeft = rect.left;
        originTop = rect.top;
        boxWidth = rect.width || 168;
        boxHeight = rect.height || 36;

        try {
          pillBtn.setPointerCapture?.(e.pointerId);
        } catch {
          // Ignore if unsupported
        }

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
      });

      // Re-clamp cleanly whenever Minimise button toggles collapsed/expanded state
      const minBtn = widget.querySelector('[aria-label="Minimise"]');
      if (minBtn && !minBtn.dataset.kdxxResizeBound) {
        minBtn.dataset.kdxxResizeBound = '1';
        minBtn.addEventListener('click', () => {
          requestAnimationFrame(() => {
            if (widget.classList.contains('kdxx-anywear-pill-mode')) {
              const r = widget.getBoundingClientRect();
              const clamped = clampPosition(r.left, r.top, r.width, r.height);
              widget.style.setProperty('left', `${Math.round(clamped.left)}px`, 'important');
              widget.style.setProperty('top', `${Math.round(clamped.top)}px`, 'important');
            }
          });
        });
      }
    };

    const bindOpenPaneHeader = (widget) => {
      const link = widget.querySelector('#pane-anywear-link');
      const headerBar = link?.parentElement;
      if (!headerBar) return;

      // Desktop non-fullscreen pane check
      const isFullscreen =
        window.innerWidth <= 768 ||
        widget.style.width === '100%' ||
        headerBar.style.display === 'none';

      if (isFullscreen) {
        widget.classList.remove('kdxx-anywear-pane-mode');
        return;
      }

      widget.classList.add('kdxx-anywear-pane-mode');
      headerBar.classList.add('kdxx-anywear-pane-header');

      if (!headerBar.dataset.kdxxGlitterBound) {
        headerBar.dataset.kdxxGlitterBound = '1';
        let paneDragging = false;
        let lastX = 0;
        let lastY = 0;

        const onMove = (e) => {
          if (!paneDragging) return;
          const vx = e.clientX - lastX;
          const vy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          if (Math.abs(vx) + Math.abs(vy) >= 2) {
            spawnGlitterThrottled(e.clientX, e.clientY, vx, vy);
          }
        };

        const onUp = () => {
          paneDragging = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        headerBar.addEventListener('mousedown', (e) => {
          if (e.button !== 0 || e.target.closest?.('a, button')) return;
          paneDragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });
      }
    };

    const syncWidgetState = () => {
      const widget = document.getElementById('__decart-tryon-widget');
      if (!widget || widget.classList.contains('kdxx-is-dragging')) return;

      const pillBtn = widget.querySelector('#__decart-pill-btn');
      if (pillBtn) {
        const wasPillMode = widget.classList.contains('kdxx-anywear-pill-mode');
        widget.classList.remove('kdxx-anywear-pane-mode');
        widget.classList.add('kdxx-anywear-pill-mode');

        decoratePillContent(pillBtn);
        bindPillDrag(widget, pillBtn);

        if (!wasPillMode || !widget.dataset.kdxxPositioned) {
          widget.dataset.kdxxPositioned = '1';
          // Wait one frame for Anywear styles/layout so width/height measurement is exact
          requestAnimationFrame(() => applyPillPosition(widget));
        }
      } else {
        widget.classList.remove('kdxx-anywear-pill-mode');
        delete widget.dataset.kdxxPositioned;
        bindOpenPaneHeader(widget);
      }
    };

    const handleWindowResize = () => {
      const widget = document.getElementById('__decart-tryon-widget');
      if (!widget || !widget.classList.contains('kdxx-anywear-pill-mode')) return;
      applyPillPosition(widget);
    };

    // Observe DOM mutations for Anywear widget creation/re-creation/open/fullscreen transitions
    const observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((m) => {
        const target = m.target;
        if (!target) return false;
        if (
          target.id === 'kdxx-anywear-glitter-layer' ||
          target.classList?.contains?.('kdxx-glitter-particle')
        ) {
          return false;
        }
        return (
          target === document.body ||
          target.id === '__decart-tryon-widget' ||
          Boolean(target.closest?.('#__decart-tryon-widget'))
        );
      });
      if (hasRelevantMutation) {
        syncWidgetState();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    window.addEventListener('resize', handleWindowResize);
    syncWidgetState();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  return null;
}
