import React, { useEffect, useRef } from 'react';
import './WaterWaveBackground.css';

/**
 * WaterWaveBackground
 * Simulates fluid organic water ripples with dispersing purple and burgundy colors.
 * - Idle: Gentle ambient wave ripples and breathing liquid color gradients (no spinning).
 * - On logo hover: Waves converge behind the hovered logo ("tụ sóng") and
 *   radiate outward across the canvas with color dispersion ("tản sóng & màu loang theo").
 * - On release: Smoothly returns to calm ambient water waves ("lại về bình thường").
 */
const WaterWaveBackground = ({ activeTarget }) => {
  const canvasRef = useRef(null);
  const animRef = useRef({
    reqId: null,
    time: 0,
    activeTarget: null,
    focalPoint: { x: 0, y: 0, active: false, intensity: 0 },
    ripples: [],
    convergingWaves: [],
    ambientRipples: [],
    lastSpawnTime: 0,
    lastAmbientSpawn: 0,
  });

  // Keep ref in sync with prop without restarting animation loop
  useEffect(() => {
    animRef.current.activeTarget = activeTarget;
  }, [activeTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement.clientWidth);
    let height = (canvas.height = canvas.parentElement.clientHeight);

    // Initial focal point at center
    animRef.current.focalPoint.x = width / 2;
    animRef.current.focalPoint.y = height / 2;

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // ── Fluid Ambient Color Blobs Configuration ──
    const ambientBlobs = [
      {
        baseX: 0.28,
        baseY: 0.36,
        radius: 460,
        colorCore: 'rgba(88, 28, 135, 0.42)', // Deep Royal Purple
        colorEdge: 'rgba(88, 28, 135, 0)',
        speedX: 0.00045,
        speedY: 0.0006,
        ampX: 70,
        ampY: 55,
      },
      {
        baseX: 0.72,
        baseY: 0.62,
        radius: 480,
        colorCore: 'rgba(131, 24, 67, 0.38)', // Rich Burgundy / Wine
        colorEdge: 'rgba(131, 24, 67, 0)',
        speedX: 0.0005,
        speedY: 0.0004,
        ampX: 80,
        ampY: 60,
      },
      {
        baseX: 0.52,
        baseY: 0.22,
        radius: 400,
        colorCore: 'rgba(112, 26, 117, 0.35)', // Vibrant Plum / Magenta
        colorEdge: 'rgba(112, 26, 117, 0)',
        speedX: 0.00065,
        speedY: 0.00055,
        ampX: 60,
        ampY: 45,
      },
      {
        baseX: 0.35,
        baseY: 0.75,
        radius: 440,
        colorCore: 'rgba(59, 7, 100, 0.48)', // Dark Indigo Violet
        colorEdge: 'rgba(59, 7, 100, 0)',
        speedX: 0.0004,
        speedY: 0.0005,
        ampX: 65,
        ampY: 50,
      },
    ];

    // ── Main Animation Render Loop ──
    const render = (timestamp) => {
      animRef.current.time = timestamp;
      const t = timestamp;

      // Clear with dark charcoal / midnight baseline
      ctx.fillStyle = '#08060f';
      ctx.fillRect(0, 0, width, height);

      // ── 1. Draw Ambient Liquid Gradient Blobs (No Rotation, Fluid Waves) ──
      ctx.save();
      ambientBlobs.forEach((b) => {
        const cx = width * b.baseX + Math.sin(t * b.speedX) * b.ampX;
        const cy = height * b.baseY + Math.cos(t * b.speedY) * b.ampY;
        const dynamicRadius = b.radius + Math.sin(t * 0.001 + b.ampX) * 35;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dynamicRadius);
        grad.addColorStop(0, b.colorCore);
        grad.addColorStop(0.55, b.colorCore.replace(/[\d.]+\)$/, '0.15)'));
        grad.addColorStop(1, b.colorEdge);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, dynamicRadius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // ── 2. Handle Focal Target Smoothing ("Tụ sóng") ──
      const state = animRef.current;
      const target = state.activeTarget;

      if (target) {
        // Lerp focal point toward hovered logo coordinate
        state.focalPoint.x += (target.x - state.focalPoint.x) * 0.12;
        state.focalPoint.y += (target.y - state.focalPoint.y) * 0.12;
        state.focalPoint.intensity = Math.min(1, state.focalPoint.intensity + 0.08);

        // Spawn inward converging wave ("tụ sóng lại phía sau logo")
        if (t - state.lastSpawnTime > 260) {
          state.convergingWaves.push({
            x: state.focalPoint.x,
            y: state.focalPoint.y,
            radius: 140, // starts wide outside logo
            minRadius: 8,
            speed: 2.2,
            alpha: 0.05,
            maxAlpha: 0.65,
          });

          // Spawn outward radiating ripple ("tản sóng ra xung quanh với màu loang")
          state.ripples.push({
            x: state.focalPoint.x,
            y: state.focalPoint.y,
            radius: 15,
            maxRadius: Math.max(width, height) * 0.65,
            speed: 2.8,
            alpha: 0.85,
            colorHue: (t % 1000 > 500) ? 'purple' : 'burgundy',
          });

          state.lastSpawnTime = t;
        }
      } else {
        // When unhovered, smoothly ease focal intensity back down
        state.focalPoint.intensity = Math.max(0, state.focalPoint.intensity - 0.04);
        state.focalPoint.x += (width / 2 - state.focalPoint.x) * 0.04;
        state.focalPoint.y += (height / 2 - state.focalPoint.y) * 0.04;

        // Periodic gentle ambient ripple in idle state
        if (t - state.lastAmbientSpawn > 1800) {
          state.ambientRipples.push({
            x: width * 0.5 + (Math.sin(t * 0.001) * width * 0.15),
            y: height * 0.5 + (Math.cos(t * 0.0012) * height * 0.12),
            radius: 20,
            maxRadius: Math.min(width, height) * 0.55,
            speed: 1.4,
            alpha: 0.45,
          });
          state.lastAmbientSpawn = t;
        }
      }

      // ── 3. Draw Converging Waves ("Tụ sóng" contracting into logo center) ──
      ctx.save();
      for (let i = state.convergingWaves.length - 1; i >= 0; i--) {
        const cw = state.convergingWaves[i];
        cw.radius -= cw.speed;

        // Alpha peaks midway through convergence
        const progress = (140 - cw.radius) / 132;
        cw.alpha = Math.sin(progress * Math.PI) * cw.maxAlpha * state.focalPoint.intensity;

        if (cw.radius <= cw.minRadius || cw.alpha <= 0.01) {
          state.convergingWaves.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(cw.x, cw.y, cw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(192, 132, 252, ${cw.alpha * 0.75})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Inner glowing converging aura
        ctx.beginPath();
        ctx.arc(cw.x, cw.y, Math.max(2, cw.radius - 3), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(131, 24, 67, ${cw.alpha * 0.45})`;
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }
      ctx.restore();

      // ── 4. Draw Concentrated Liquid Glow Pool Behind Hovered Logo ──
      if (state.focalPoint.intensity > 0.01) {
        ctx.save();
        const fx = state.focalPoint.x;
        const fy = state.focalPoint.y;
        const poolRadius = (100 + Math.sin(t * 0.004) * 16) * state.focalPoint.intensity;

        const poolGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, poolRadius);
        poolGrad.addColorStop(0, `rgba(216, 180, 254, ${0.45 * state.focalPoint.intensity})`);
        poolGrad.addColorStop(0.35, `rgba(168, 85, 247, ${0.35 * state.focalPoint.intensity})`);
        poolGrad.addColorStop(0.68, `rgba(131, 24, 67, ${0.28 * state.focalPoint.intensity})`);
        poolGrad.addColorStop(1, 'rgba(131, 24, 67, 0)');

        ctx.fillStyle = poolGrad;
        ctx.beginPath();
        ctx.arc(fx, fy, poolRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── 5. Draw Outward Radiating Wave Ripples ("Tản sóng & Màu loang theo") ──
      ctx.save();
      for (let i = state.ripples.length - 1; i >= 0; i--) {
        const rp = state.ripples[i];
        rp.radius += rp.speed;

        const life = rp.radius / rp.maxRadius;
        // Natural exponential decay as the water wave travels outward
        rp.alpha = Math.max(0, (1 - life) * (1 - Math.pow(life, 0.4)));

        if (rp.alpha <= 0.005 || rp.radius >= rp.maxRadius) {
          state.ripples.splice(i, 1);
          continue;
        }

        // Color Loang (discharging soft color wash behind wave crest)
        if (rp.radius > 25 && rp.radius < rp.maxRadius * 0.8) {
          const washRadius = rp.radius;
          const washGrad = ctx.createRadialGradient(
            rp.x,
            rp.y,
            Math.max(0, washRadius - 35),
            rp.x,
            rp.y,
            washRadius + 15
          );

          const isPurple = rp.colorHue === 'purple';
          const rColor = isPurple ? '168, 85, 247' : '131, 24, 67';
          const rAlpha = rp.alpha * 0.16;

          washGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          washGrad.addColorStop(0.5, `rgba(${rColor}, ${rAlpha})`);
          washGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = washGrad;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, washRadius + 15, 0, Math.PI * 2);
          ctx.fill();
        }

        // Primary Crisp Ripple Crest
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
        const crestColor =
          rp.colorHue === 'purple'
            ? `rgba(216, 180, 254, ${rp.alpha * 0.85})`
            : `rgba(244, 114, 182, ${rp.alpha * 0.75})`;
        ctx.strokeStyle = crestColor;
        ctx.lineWidth = Math.max(0.6, 2.4 * (1 - life));
        ctx.stroke();

        // Secondary Soft Ripple Caustic Ring
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, Math.max(0, rp.radius - 6), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(147, 51, 234, ${rp.alpha * 0.4})`;
        ctx.lineWidth = Math.max(0.4, 3.8 * (1 - life));
        ctx.stroke();
      }
      ctx.restore();

      // ── 6. Draw Ambient Water Ripples in Idle State ──
      ctx.save();
      for (let i = state.ambientRipples.length - 1; i >= 0; i--) {
        const ar = state.ambientRipples[i];
        ar.radius += ar.speed;

        const life = ar.radius / ar.maxRadius;
        ar.alpha = Math.max(0, (1 - life) * 0.4);

        if (ar.alpha <= 0.005 || ar.radius >= ar.maxRadius) {
          state.ambientRipples.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(ar.x, ar.y, ar.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(168, 85, 247, ${ar.alpha})`;
        ctx.lineWidth = Math.max(0.5, 1.8 * (1 - life));
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(ar.x, ar.y, Math.max(0, ar.radius - 4), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(131, 24, 67, ${ar.alpha * 0.4})`;
        ctx.lineWidth = Math.max(0.4, 2.4 * (1 - life));
        ctx.stroke();
      }
      ctx.restore();

      state.reqId = requestAnimationFrame(render);
    };

    animRef.current.reqId = requestAnimationFrame(render);

    return () => {
      if (animRef.current.reqId) {
        cancelAnimationFrame(animRef.current.reqId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="water-wave-canvas-wrap" aria-hidden="true">
      <canvas ref={canvasRef} className="water-wave-canvas" />
      <div className="water-wave-vignette" />
    </div>
  );
};

export default WaterWaveBackground;

