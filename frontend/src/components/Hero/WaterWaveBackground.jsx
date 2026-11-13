import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './WaterWaveBackground.css';

/**
 * 3D Liquid Water Surface Shaders (WebGL via Three.js)
 * Simulates genuine 3D water surface physics:
 * - Ambient multi-harmonic fluid waves and caustics
 * - Inward converging wave depression ("tụ sóng") directly behind hovered brand logo
 * - Outward radiating 3D ripples with realistic crests, troughs, and damping
 * - Physical 3D surface normal calculation (finite differences) with Blinn-Phong specular glints
 * - Color dispersion ("màu loang trong nước") with royal purple (#581c87) and rich burgundy (#831843)
 * - Exact subpixel logo centering using DOM bounding rect & normalized UV coordinates
 */
const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uFocalPos;
uniform float uFocalIntensity;
uniform vec4 uRipples[10]; // xy: center in aspect-corrected uv, z: radius, w: amplitude * colorSign

varying vec2 vUv;

// Multi-layered organic 3D water surface height field
float getWaterHeight(vec2 p) {
  float h = 0.0;

  // 1. Ambient multi-octave directional water swell
  h += sin(dot(p, vec2(0.866, 0.500)) * 3.4 + uTime * 0.85) * 0.015;
  h += sin(dot(p, vec2(-0.420, 0.907)) * 5.1 + uTime * 1.15) * 0.009;
  h += sin(dot(p, vec2(0.707, -0.707)) * 8.2 + uTime * 1.60) * 0.005;

  // 2. Focal wave dynamics behind active logo (meniscus depression & inward contracting wave)
  if (uFocalIntensity > 0.001) {
    float dFocal = length(p - uFocalPos);
    // Smooth liquid surface dip (meniscus)
    h -= 0.038 * smoothstep(0.32, 0.01, dFocal) * uFocalIntensity;

    // Inward contracting wave ring ("tụ sóng lại phía sau logo")
    float convergeWave = sin(dFocal * 26.0 + uTime * 4.8);
    float convergeEnv = smoothstep(0.40, 0.06, dFocal) * smoothstep(0.005, 0.06, dFocal);
    h += convergeWave * convergeEnv * 0.028 * uFocalIntensity;
  }

  // 3. Outward radiating 3D wave ripples ("gợn sóng tản ra")
  for (int i = 0; i < 10; i++) {
    vec4 rp = uRipples[i];
    float amp = abs(rp.w);
    if (amp > 0.001) {
      float d = length(p - rp.xy);
      float dr = d - rp.z;
      // High-order Gaussian envelope for realistic wave-packet profile
      float packet = exp(-(dr * dr) / 0.0040);
      float wave = sin(dr * 54.0);
      h += wave * packet * amp * 0.038;
    }
  }

  return h;
}

void main() {
  // Use vUv directly: 100% immune to devicePixelRatio scaling discrepancies
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);

  // ── 1. Calculate Analytical 3D Surface Normals via Finite Differences ──
  float eps = 1.0 / uResolution.y;
  float hC = getWaterHeight(uv);
  float hR = getWaterHeight(uv + vec2(eps, 0.0));
  float hL = getWaterHeight(uv - vec2(eps, 0.0));
  float hT = getWaterHeight(uv + vec2(0.0, eps));
  float hB = getWaterHeight(uv - vec2(0.0, eps));

  float dHdx = (hR - hL) / (2.0 * eps);
  float dHdy = (hT - hB) / (2.0 * eps);

  // Surface normal vector in 3D liquid space
  vec3 normal = normalize(vec3(-dHdx * 0.55, -dHdy * 0.55, 1.0));

  // ── 2. Optical Refraction (distorts deep underwater layers) ──
  vec2 refUV = uv + normal.xy * 0.032;

  // ── 3. Deep Ambient Liquid Dye Blobs (Floating underneath the water) ──
  vec3 baseColor = vec3(0.031, 0.024, 0.059);   // Obsidian charcoal #08060f
  vec3 royalPurple = vec3(0.345, 0.110, 0.529);  // Royal purple #581c87
  vec3 richBurgundy = vec3(0.514, 0.094, 0.263); // Rich burgundy #831843
  vec3 plumMagenta = vec3(0.439, 0.102, 0.459);  // Plum magenta #701a75
  vec3 darkIndigo = vec3(0.231, 0.027, 0.392);   // Dark indigo #3b0764

  // Purple dye mass (Top-Left)
  vec2 b1Pos = vec2(-0.45 + sin(uTime * 0.35) * 0.08, 0.22 + cos(uTime * 0.45) * 0.06);
  float b1 = smoothstep(0.75, 0.0, length(refUV - b1Pos)) * 0.48;

  // Burgundy dye mass (Bottom-Right)
  vec2 b2Pos = vec2(0.50 + cos(uTime * 0.40) * 0.09, -0.22 + sin(uTime * 0.32) * 0.07);
  float b2 = smoothstep(0.78, 0.0, length(refUV - b2Pos)) * 0.44;

  // Plum dye mass (Top-Right)
  vec2 b3Pos = vec2(0.35 + sin(uTime * 0.52) * 0.07, 0.28 + cos(uTime * 0.42) * 0.05);
  float b3 = smoothstep(0.68, 0.0, length(refUV - b3Pos)) * 0.38;

  // Indigo foundation mass (Bottom-Left)
  vec2 b4Pos = vec2(-0.40 + cos(uTime * 0.38) * 0.08, -0.26 + sin(uTime * 0.48) * 0.06);
  float b4 = smoothstep(0.72, 0.0, length(refUV - b4Pos)) * 0.52;

  vec3 fluidBody = baseColor;
  fluidBody += royalPurple * b1;
  fluidBody += richBurgundy * b2;
  fluidBody += plumMagenta * b3;
  fluidBody += darkIndigo * b4;

  // ── 4. Dynamic Wave Color Dispersion ("Màu loang theo gợn sóng") ──
  vec3 dispersionDye = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    vec4 rp = uRipples[i];
    float amp = abs(rp.w);
    if (amp > 0.001) {
      float d = length(uv - rp.xy);
      // Soft color wash trailing immediately behind the wave crest
      float trailDist = d - rp.z * 0.88;
      float trail = exp(-(trailDist * trailDist) / 0.015) * amp;

      vec3 dyeTone = (rp.w > 0.0) 
        ? vec3(0.68, 0.35, 0.98)   // Radiant royal violet
        : vec3(0.92, 0.24, 0.52);  // Radiant wine magenta

      dispersionDye += dyeTone * trail * 0.75;
    }
  }

  // ── 5. Concentrated Hover Glow Pool Behind Logo ──
  vec3 focalGlow = vec3(0.0);
  if (uFocalIntensity > 0.001) {
    float dFocal = length(uv - uFocalPos);
    float poolCore = smoothstep(0.20, 0.0, dFocal) * 0.60 * uFocalIntensity;
    float poolHalo = smoothstep(0.42, 0.05, dFocal) * 0.35 * uFocalIntensity;

    vec3 glowCore = vec3(0.88, 0.70, 1.0);   // Soft luminous lavender
    vec3 glowHalo = vec3(0.58, 0.12, 0.38);  // Deep wine aura
    focalGlow = glowCore * poolCore + glowHalo * poolHalo;
  }

  // ── 6. Realistic 3D Caustic Shimmer (Subsurface light refraction) ──
  vec2 cUv = refUV * 7.5;
  float c1 = sin(cUv.x * 2.8 + uTime * 0.75) * cos(cUv.y * 2.8 - uTime * 0.65);
  float c2 = sin(cUv.x * 4.6 - uTime * 1.05 + c1) * cos(cUv.y * 4.6 + uTime * 0.88);
  float causticPattern = pow(clamp(0.5 + 0.5 * (c1 + c2), 0.0, 1.0), 3.5);
  vec3 causticLight = vec3(0.75, 0.60, 0.95) * causticPattern * 0.16;

  // ── 7. 3D Directional & Specular Lighting on Wave Crests ──
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 mainLightDir = normalize(vec3(0.22, 0.65, 0.92));
  vec3 halfMain = normalize(mainLightDir + viewDir);

  // Sharp & soft specular glints on wave crests
  float specSharp = pow(max(dot(normal, halfMain), 0.0), 54.0);
  float specSoft = pow(max(dot(normal, halfMain), 0.0), 16.0);
  vec3 specLight = vec3(0.92, 0.85, 1.0) * (specSharp * 0.75 + specSoft * 0.25);

  // Dynamic point-light specular from the hovered logo
  if (uFocalIntensity > 0.001) {
    vec3 logoLightDir = normalize(vec3(uFocalPos - uv, 0.22));
    vec3 halfLogo = normalize(logoLightDir + viewDir);
    float logoDist = length(uv - uFocalPos);
    float logoAtten = 1.0 / (1.0 + logoDist * 5.0);
    float specLogo = pow(max(dot(normal, halfLogo), 0.0), 40.0) * logoAtten * uFocalIntensity;
    specLight += vec3(1.0, 0.78, 0.92) * specLogo * 0.85;
  }

  // ── 8. Physical Fresnel Reflection Factor ──
  float nDotV = max(dot(normal, viewDir), 0.0);
  float fresnel = 0.035 + (1.0 - 0.035) * pow(1.0 - nDotV, 4.5);

  // ── 9. Final Color Composition ──
  vec3 finalColor = fluidBody;
  finalColor += causticLight;
  finalColor += dispersionDye;
  finalColor += focalGlow;
  finalColor += specLight * (0.65 + 0.55 * fresnel);
  finalColor += vec3(0.45, 0.22, 0.70) * fresnel * 0.45;

  // ── 10. Smooth Vignette around Screen Borders ──
  float vignette = smoothstep(1.35, 0.35, length(uv));
  finalColor *= (0.35 + 0.65 * vignette);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

const WaterWaveBackground = ({ activeTarget }) => {
  const canvasRef = useRef(null);
  const animRef = useRef({
    reqId: null,
    renderer: null,
    scene: null,
    material: null,
    geometry: null,
    uniforms: null,
    lastTime: performance.now(),
    activeTarget: null,
    lastTargetId: null,
    focalUv: { x: 0, y: 0 },
    focalIntensity: 0,
    ripples: [],
    lastSpawnTime: 0,
    lastAmbientSpawn: 0,
    rippleToggle: false,
  });

  // Keep target reference synchronized without rebuilding WebGL context
  useEffect(() => {
    animRef.current.activeTarget = activeTarget;
  }, [activeTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    let width = canvas.parentElement.clientWidth || window.innerWidth;
    let height = canvas.parentElement.clientHeight || window.innerHeight;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      console.warn('WebGL initialization failed, falling back gracefully:', err);
      return;
    }

    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const ripplesArray = new Array(10).fill(null).map(() => new THREE.Vector4(0, 0, 0, 0));

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uFocalPos: { value: new THREE.Vector2(0, 0) },
      uFocalIntensity: { value: 0 },
      uRipples: { value: ripplesArray },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const state = animRef.current;
    state.renderer = renderer;
    state.scene = scene;
    state.material = material;
    state.geometry = geometry;
    state.uniforms = uniforms;
    state.lastTime = performance.now();

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.parentElement.clientWidth || window.innerWidth;
      height = canvas.parentElement.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
    };

    window.addEventListener('resize', handleResize);

    // ── WebGL Render & Physics Loop ──
    const render = (timestamp) => {
      const now = timestamp || performance.now();
      const dt = Math.min((now - state.lastTime) * 0.001, 0.05);
      state.lastTime = now;

      const target = state.activeTarget;
      const aspect = width / (height || 1);

      // ── Handle Focal Target Smoothing ("Tụ sóng") ──
      if (target) {
        let logoCenterX = target.x;
        let logoCenterY = target.y;

        // Query the live rendered DOM element of the brand card for true subpixel precision
        if (target.id) {
          const logoEl = document.querySelector(`.brand-logo-card--${target.id}`);
          if (logoEl && canvas) {
            const rect = logoEl.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            logoCenterX = (rect.left + rect.width / 2) - canvasRect.left;
            logoCenterY = (rect.top + rect.height / 2) - canvasRect.top;
          }
        }

        // Map exact CSS pixel coordinates to normalized UV space
        const normX = logoCenterX / width;
        const normY = 1.0 - (logoCenterY / height);

        const targetUvX = (normX - 0.5) * aspect;
        const targetUvY = (normY - 0.5);

        // Snap immediately if new logo or waking up from idle to prevent drag offset
        if (state.focalIntensity < 0.05 || target.id !== state.lastTargetId) {
          state.focalUv.x = targetUvX;
          state.focalUv.y = targetUvY;
          state.lastTargetId = target.id;
        } else {
          // Smooth exponential tracking
          state.focalUv.x += (targetUvX - state.focalUv.x) * 0.25;
          state.focalUv.y += (targetUvY - state.focalUv.y) * 0.25;
        }

        state.focalIntensity = Math.min(1.0, state.focalIntensity + 0.12);

        // Spawn outward radiating 3D ripples centered exactly on the logo
        if (now - state.lastSpawnTime > 200) {
          state.ripples.push({
            x: state.focalUv.x,
            y: state.focalUv.y,
            radius: 0.02,
            maxRadius: 1.6,
            speed: 0.32,
            amplitude: 1.0,
            decay: 0.42,
            colorSign: state.rippleToggle ? 1.0 : -1.0, // Alternate purple & burgundy
          });
          state.rippleToggle = !state.rippleToggle;
          state.lastSpawnTime = now;
        }
      } else {
        // Smoothly ease focal intensity back down when unhovered
        state.focalIntensity = Math.max(0, state.focalIntensity - 0.04);
        state.lastTargetId = null;

        // Periodic gentle ambient ripples in calm state
        if (now - state.lastAmbientSpawn > 2600) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.12 + Math.random() * 0.28;
          state.ripples.push({
            x: Math.cos(angle) * dist * aspect * 0.5,
            y: Math.sin(angle) * dist,
            radius: 0.02,
            maxRadius: 1.2,
            speed: 0.22,
            amplitude: 0.45,
            decay: 0.28,
            colorSign: Math.random() > 0.5 ? 1.0 : -1.0,
          });
          state.lastAmbientSpawn = now;
        }
      }

      // ── Update 3D Ripples Physics & Propagation ──
      for (let i = state.ripples.length - 1; i >= 0; i--) {
        const rp = state.ripples[i];
        rp.radius += rp.speed * dt;
        rp.amplitude *= Math.max(0, 1.0 - rp.decay * dt);

        if (rp.amplitude <= 0.008 || rp.radius >= rp.maxRadius) {
          state.ripples.splice(i, 1);
        }
      }

      // ── Transfer Active Ripples to GLSL Uniforms ──
      for (let i = 0; i < 10; i++) {
        if (i < state.ripples.length) {
          const rp = state.ripples[i];
          uniforms.uRipples.value[i].set(
            rp.x,
            rp.y,
            rp.radius,
            rp.amplitude * rp.colorSign
          );
        } else {
          uniforms.uRipples.value[i].set(0, 0, 0, 0);
        }
      }

      // Update global uniforms
      uniforms.uTime.value = now * 0.001;
      uniforms.uFocalPos.value.set(state.focalUv.x, state.focalUv.y);
      uniforms.uFocalIntensity.value = state.focalIntensity;

      renderer.render(scene, camera);
      state.reqId = requestAnimationFrame(render);
    };

    state.reqId = requestAnimationFrame(render);

    return () => {
      if (state.reqId) {
        cancelAnimationFrame(state.reqId);
      }
      window.removeEventListener('resize', handleResize);
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      if (renderer) renderer.dispose();
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
