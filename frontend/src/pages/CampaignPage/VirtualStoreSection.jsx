import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './VirtualStoreSection.css';

// ── Camera presets inside the single 3D boutique scene ──
const CAMERA_PRESETS = {
  overview: {
    pos: new THREE.Vector3(0, 2.65, 8.4),
    lookAt: new THREE.Vector3(0, 1.85, -1.6),
  },
  men: {
    pos: new THREE.Vector3(-3.0, 2.05, 2.85),
    lookAt: new THREE.Vector3(-3.35, 1.65, -1.25),
  },
  center: {
    pos: new THREE.Vector3(0, 2.15, 2.35),
    lookAt: new THREE.Vector3(0, 1.45, -1.1),
  },
  women: {
    pos: new THREE.Vector3(3.2, 2.15, 3.2),
    lookAt: new THREE.Vector3(4.8, 1.75, -1.6),
  },
  accessories: {
    pos: new THREE.Vector3(4.8, 2.3, 1.6),
    lookAt: new THREE.Vector3(7.4, 2.15, -0.4),
  },
};

// ── 3D World positions for the projected floating hotspot markers ──
const HOTSPOT_ANCHORS = {
  men: new THREE.Vector3(-4.15, 4.65, -1.8),
  center: new THREE.Vector3(0, 2.55, -0.7),
  women: new THREE.Vector3(4.15, 4.65, -1.8),
  accessories: new THREE.Vector3(7.42, 3.68, -0.38),
};

// ── Procedural Brick Texture Generator ──
function createBrickTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark mortar base
  ctx.fillStyle = '#0e0b12';
  ctx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const cols = 8;
  const brickH = 512 / rows;
  const brickW = 512 / cols;
  const mortar = 3;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let c = -1; c <= cols; c++) {
      const x = c * brickW + offset;
      const y = r * brickH;

      // Subtle industrial dark brick color variation
      const shade = 18 + ((r * 7 + c * 13) % 16);
      const redTint = shade + 8;
      const blueTint = shade + 6;
      ctx.fillStyle = `rgb(${redTint}, ${shade}, ${blueTint})`;
      ctx.fillRect(
        x + mortar / 2,
        y + mortar / 2,
        brickW - mortar,
        brickH - mortar
      );

      // Subtle highlight edge on top of brick
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.fillRect(x + mortar / 2, y + mortar / 2, brickW - mortar, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 1.8);
  return texture;
}

// ── Procedural Concrete Floor Texture Generator ──
function createConcreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#121018';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle speckles for polished industrial concrete
  for (let i = 0; i < 1800; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    const alpha = (i % 5) * 0.008;
    ctx.fillStyle = i % 2 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 2})`;
    ctx.fillRect(x, y, 3, 3);
  }

  // Expansion joint grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

// ── Glowing Neon Sign Texture Generator ──
function createNeonSignTexture({ title, subtitle, primaryColor, secondaryColor }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dark backing plate with neon border
  ctx.fillStyle = 'rgba(8, 5, 15, 0.78)';
  ctx.fillRect(28, 28, canvas.width - 56, canvas.height - 56);

  // Glowing outer neon tube frame
  ctx.save();
  ctx.strokeStyle = secondaryColor;
  ctx.lineWidth = 6;
  ctx.shadowColor = secondaryColor;
  ctx.shadowBlur = 28;
  ctx.strokeRect(42, 42, canvas.width - 84, canvas.height - 84);
  ctx.restore();

  // Main neon title
  ctx.save();
  ctx.font = '600 96px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = primaryColor;
  ctx.shadowBlur = 38;
  ctx.fillStyle = primaryColor;
  ctx.fillText(title, canvas.width / 2, subtitle ? 162 : 192);

  // White hot inner core
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, canvas.width / 2, subtitle ? 162 : 192);
  ctx.restore();

  // Subtitle
  if (subtitle) {
    ctx.save();
    ctx.font = '500 28px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = secondaryColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(subtitle, canvas.width / 2, 265);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ── Editorial Lookbook Catalog Texture ──
function createLookbookTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  // Page background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 360);

  // Center spine divide
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(254, 0, 4, 360);

  // Left page: Editorial photo simulation
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(24, 28, 208, 260);

  // Purple energy silhouette on photo
  const grad = ctx.createLinearGradient(24, 28, 232, 288);
  grad.addColorStop(0, '#7e22ce');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(44, 48, 168, 220);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "Helvetica Neue", sans-serif';
  ctx.fillText('AMIRI', 32, 316);
  ctx.fillStyle = '#64748b';
  ctx.font = '10px "Helvetica Neue", sans-serif';
  ctx.fillText('AUTUMN / WINTER COLLECTION', 32, 334);

  // Right page: Typography & lookbook grid
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 22px "Helvetica Neue", sans-serif';
  ctx.fillText('BEYOND', 276, 56);
  ctx.fillText('THE ORDINARY', 276, 82);

  ctx.fillStyle = '#64748b';
  ctx.font = '10px "Helvetica Neue", sans-serif';
  ctx.fillText('LOOK 01 / MEN & WOMEN STREETWEAR', 276, 108);

  ctx.fillStyle = '#334155';
  ctx.fillRect(276, 128, 98, 140);
  ctx.fillRect(386, 128, 98, 140);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ── Realistic Hanger Builder ──
function createHanger(chromeMat, darkSteelMat) {
  const hangerGroup = new THREE.Group();

  // Top metal hook
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.045, 0.007, 8, 16, Math.PI),
    chromeMat
  );
  hook.rotation.y = Math.PI / 2;
  hook.position.y = 0.04;
  hangerGroup.add(hook);

  // Hook neck stem
  const hookStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.045, 8),
    chromeMat
  );
  hookStem.position.y = 0.012;
  hangerGroup.add(hookStem);

  // Triangular shoulder support arms (spanning along Z axis)
  const leftArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.32, 8),
    darkSteelMat
  );
  leftArm.rotation.x = Math.PI / 3.4;
  leftArm.position.set(0, -0.065, -0.13);
  hangerGroup.add(leftArm);

  const rightArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.32, 8),
    darkSteelMat
  );
  rightArm.rotation.x = -Math.PI / 3.4;
  rightArm.position.set(0, -0.065, 0.13);
  hangerGroup.add(rightArm);

  return hangerGroup;
}

// ── Realistic Men's Garment Builder (Hoodies, Varsity, Biker Leather, Denim) ──
function createDetailedMenGarment({
  type,
  color,
  secondaryColor = '#ffffff',
  accentColor = '#c084fc',
  chromeMat,
  darkSteelMat,
}) {
  const group = new THREE.Group();

  // Hanger at the top
  const hanger = createHanger(chromeMat, darkSteelMat);
  group.add(hanger);

  const fabricMat = new THREE.MeshStandardMaterial({
    color,
    roughness: type === 'leather' ? 0.26 : 0.72,
    metalness: type === 'leather' ? 0.28 : 0.08,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    roughness: 0.65,
    metalness: 0.12,
  });

  const ribMat = new THREE.MeshStandardMaterial({
    color: secondaryColor === '#ffffff' ? color : secondaryColor,
    roughness: 0.85,
  });

  if (type === 'hoodie') {
    // 1. Shoulders & upper chest (sloped)
    const shoulders = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 0.48, 12),
      fabricMat
    );
    shoulders.rotation.x = Math.PI / 2;
    shoulders.position.set(0, -0.14, 0);
    shoulders.scale.set(1.2, 1, 0.9);
    group.add(shoulders);

    // 2. Torso body (boxy streetwear cut)
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.76, 0.44),
      fabricMat
    );
    torso.position.set(0, -0.52, 0);
    torso.castShadow = true;
    group.add(torso);

    // 3. Realistic 3D Draped Hood at Back
    const hoodDrape = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7),
      fabricMat
    );
    hoodDrape.rotation.x = Math.PI * 0.75;
    hoodDrape.position.set(-0.09, -0.15, 0);
    hoodDrape.scale.set(0.9, 1.15, 1.1);
    group.add(hoodDrape);

    // 4. White / Chrome Hood Drawstrings
    [-0.04, 0.04].forEach((dz) => {
      const string = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.24, 8),
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 })
      );
      string.position.set(0.1, -0.28, dz);
      group.add(string);

      const aglet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.035, 8),
        chromeMat
      );
      aglet.position.set(0.1, -0.41, dz);
      group.add(aglet);
    });

    // 5. Kangaroo Pouch Pocket on Front Stomach
    const pocket = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.22, 0.32),
      fabricMat
    );
    pocket.position.set(0.1, -0.62, 0);
    group.add(pocket);

    // 6. Angled Streetwear Sleeves (hanging naturally at sides)
    [-0.27, 0.27].forEach((sz) => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.055, 0.72, 12),
        fabricMat
      );
      sleeve.position.set(0, -0.5, sz);
      sleeve.rotation.x = sz > 0 ? -0.1 : 0.1;
      sleeve.castShadow = true;
      group.add(sleeve);

      // Ribbed wrist cuff
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.056, 0.056, 0.08, 12),
        ribMat
      );
      cuff.position.set(0, -0.86, sz);
      group.add(cuff);
    });

    // 7. Ribbed Bottom Hem
    const bottomHem = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.075, 0.43),
      ribMat
    );
    bottomHem.position.set(0, -0.92, 0);
    group.add(bottomHem);
  } else if (type === 'varsity') {
    // 1. Torso (Wool Body)
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.74, 0.44),
      fabricMat
    );
    torso.position.set(0, -0.5, 0);
    torso.castShadow = true;
    group.add(torso);

    // 2. Ribbed Striped Collar
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.024, 8, 16, Math.PI),
      ribMat
    );
    collar.position.set(0, -0.12, 0);
    collar.rotation.z = Math.PI / 2;
    group.add(collar);

    // 3. Contrast Leather Sleeves
    [-0.27, 0.27].forEach((sz) => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.078, 0.058, 0.72, 12),
        secondaryMat
      );
      sleeve.position.set(0, -0.49, sz);
      sleeve.rotation.x = sz > 0 ? -0.09 : 0.09;
      sleeve.castShadow = true;
      group.add(sleeve);

      // Striped cuff
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.059, 0.059, 0.09, 12),
        ribMat
      );
      cuff.position.set(0, -0.85, sz);
      group.add(cuff);
    });

    // 4. Center Snap Button Placket with Metallic Buttons
    for (let b = 0; b < 5; b++) {
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10),
        chromeMat
      );
      button.rotation.z = Math.PI / 2;
      button.position.set(0.105, -0.25 - b * 0.12, 0);
      group.add(button);
    }

    // 5. Chenille Letter Patch on Left Chest
    const patch = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.12, 0.1),
      new THREE.MeshStandardMaterial({ color: secondaryColor, roughness: 0.9 })
    );
    patch.position.set(0.105, -0.32, 0.11);
    group.add(patch);

    // 6. Ribbed Bottom Waistband
    const hem = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.08, 0.43),
      ribMat
    );
    hem.position.set(0, -0.89, 0);
    group.add(hem);
  } else if (type === 'leather') {
    // Moto / Biker Leather Jacket
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.74, 0.44),
      fabricMat
    );
    torso.position.set(0, -0.5, 0);
    torso.castShadow = true;
    group.add(torso);

    // Asymmetric Diagonal Chrome Zipper
    const zipper = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.7, 0.018),
      chromeMat
    );
    zipper.position.set(0.095, -0.5, 0.03);
    zipper.rotation.z = -0.08;
    group.add(zipper);

    // Notched Biker Lapels
    const lapelLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.26, 0.12),
      fabricMat
    );
    lapelLeft.position.set(0.098, -0.24, -0.08);
    lapelLeft.rotation.y = 0.35;
    group.add(lapelLeft);

    const lapelRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.26, 0.12),
      fabricMat
    );
    lapelRight.position.set(0.098, -0.24, 0.08);
    lapelRight.rotation.y = -0.35;
    group.add(lapelRight);

    // Chrome snap buttons on collar points
    [-0.1, 0.1].forEach((sz) => {
      const snap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8),
        chromeMat
      );
      snap.rotation.z = Math.PI / 2;
      snap.position.set(0.105, -0.2, sz);
      group.add(snap);
    });

    // Leather Sleeves with Zipped Cuffs
    [-0.26, 0.26].forEach((sz) => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.052, 0.72, 12),
        fabricMat
      );
      sleeve.position.set(0, -0.5, sz);
      sleeve.rotation.x = sz > 0 ? -0.08 : 0.08;
      sleeve.castShadow = true;
      group.add(sleeve);
    });

    // Lower Waist Belt with Roller Buckle
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.055, 0.46),
      darkSteelMat
    );
    belt.position.set(0, -0.86, 0);
    group.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.07, 0.08),
      chromeMat
    );
    buckle.position.set(0.1, -0.86, 0);
    group.add(buckle);
  } else {
    // Denim / Streetwear Overshirt
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.75, 0.44),
      fabricMat
    );
    torso.position.set(0, -0.51, 0);
    torso.castShadow = true;
    group.add(torso);

    // Shirt Collar
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.07, 0.28),
      fabricMat
    );
    collar.position.set(0, -0.13, 0);
    group.add(collar);

    // Dual Flap Chest Pockets
    [-0.11, 0.11].forEach((pz) => {
      const pocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.14, 0.12),
        secondaryMat
      );
      pocket.position.set(0.09, -0.36, pz);
      group.add(pocket);
    });

    // Button line
    for (let b = 0; b < 5; b++) {
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.01, 8),
        chromeMat
      );
      button.rotation.z = Math.PI / 2;
      button.position.set(0.092, -0.24 - b * 0.13, 0);
      group.add(button);
    }

    // Sleeves
    [-0.26, 0.26].forEach((sz) => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.05, 0.72, 12),
        fabricMat
      );
      sleeve.position.set(0, -0.5, sz);
      sleeve.castShadow = true;
      group.add(sleeve);
    });
  }

  return group;
}

// ── Realistic Women's Garment Builder (Couture Dresses, Slips, Trench Coats, Blazers) ──
// eslint-disable-next-line no-unused-vars
function createDetailedWomenGarment({
  type,
  color,
  secondaryColor = '#ffffff',
  accentColor = '#f472b6',
  chromeMat,
  darkSteelMat,
}) {
  const group = new THREE.Group();

  // Delicate slim hanger
  const hanger = createHanger(chromeMat, darkSteelMat);
  group.add(hanger);

  const fabricMat = new THREE.MeshStandardMaterial({
    color,
    roughness: type === 'slip' ? 0.16 : 0.62,
    metalness: type === 'slip' ? 0.15 : 0.08,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    roughness: 0.5,
  });

  if (type === 'flared_dress') {
    // 1. Fitted Bodice with Sweetheart Neckline
    const bodice = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 0.38, 16),
      fabricMat
    );
    bodice.position.set(0, -0.28, 0);
    bodice.scale.set(0.9, 1, 1.25);
    bodice.castShadow = true;
    group.add(bodice);

    // 2. Delicate Shoulder Straps
    [-0.09, 0.09].forEach((sz) => {
      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8),
        fabricMat
      );
      strap.position.set(0, -0.11, sz);
      group.add(strap);
    });

    // 3. Metallic Gold / Crystal Waist Cincher Belt
    const waistBelt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.142, 0.142, 0.035, 20),
      chromeMat
    );
    waistBelt.position.set(0, -0.47, 0);
    waistBelt.scale.set(0.9, 1, 1.25);
    group.add(waistBelt);

    // 4. Dramatic Flowing Flared Dress Skirt (Cascading Cone)
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.42, 0.88, 24, 1, true),
      fabricMat
    );
    skirt.position.set(0, -0.92, 0);
    skirt.scale.set(0.85, 1, 1.15);
    skirt.castShadow = true;
    group.add(skirt);

    // 5. Ruffled / Pleated Hem Ring
    const hemRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.025, 8, 24),
      secondaryMat
    );
    hemRing.rotation.x = Math.PI / 2;
    hemRing.position.set(0, -1.36, 0);
    hemRing.scale.set(0.85, 1.15, 1);
    group.add(hemRing);
  } else if (type === 'slip') {
    // Silk Slip Dress with Fluid Bias Cut
    const bodice = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 0.4, 16),
      fabricMat
    );
    bodice.position.set(0, -0.28, 0);
    bodice.scale.set(0.88, 1, 1.2);
    bodice.castShadow = true;
    group.add(bodice);

    // Spaghetti Straps
    [-0.08, 0.08].forEach((sz) => {
      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.18, 8),
        chromeMat
      );
      strap.position.set(0, -0.1, sz);
      group.add(strap);
    });

    // Flowing Midi Skirt with gentle drape
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.28, 0.95, 20, 1, true),
      fabricMat
    );
    skirt.position.set(0, -0.92, 0);
    skirt.scale.set(0.85, 1, 1.15);
    skirt.castShadow = true;
    group.add(skirt);

    // High side leg slit detail (dark accent line)
    const slitTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.45, 0.015),
      new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    slitTrim.position.set(0.12, -1.05, 0.15);
    group.add(slitTrim);
  } else if (type === 'trench_coat') {
    // Tailored Long Wool / Trench Overcoat
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.82, 0.46),
      fabricMat
    );
    torso.position.set(0, -0.52, 0);
    torso.castShadow = true;
    group.add(torso);

    // Wide Notched Lapels
    const lapelL = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.38, 0.14),
      secondaryMat
    );
    lapelL.position.set(0.105, -0.32, -0.09);
    lapelL.rotation.y = 0.28;
    group.add(lapelL);

    const lapelR = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.38, 0.14),
      secondaryMat
    );
    lapelR.position.set(0.105, -0.32, 0.09);
    lapelR.rotation.y = -0.28;
    group.add(lapelR);

    // Double-breasted buttons
    for (let b = 0; b < 4; b++) {
      [-0.05, 0.05].forEach((bz) => {
        const button = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8),
          chromeMat
        );
        button.rotation.z = Math.PI / 2;
        button.position.set(0.105, -0.34 - b * 0.11, bz);
        group.add(button);
      });
    }

    // Waist Belt Sash with Knot
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.21, 0.065, 0.48),
      secondaryMat
    );
    belt.position.set(0, -0.74, 0);
    group.add(belt);

    const knot = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.24, 0.06),
      secondaryMat
    );
    knot.position.set(0.11, -0.83, 0.05);
    group.add(knot);

    // Long Coat Panels Extending Downwards
    const lowerCoat = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.65, 0.48),
      fabricMat
    );
    lowerCoat.position.set(0, -1.12, 0);
    lowerCoat.castShadow = true;
    group.add(lowerCoat);

    // Sleeves with Buckle Tabs
    [-0.27, 0.27].forEach((sz) => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.052, 0.74, 12),
        fabricMat
      );
      sleeve.position.set(0, -0.52, sz);
      sleeve.castShadow = true;
      group.add(sleeve);

      const tab = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12),
        secondaryMat
      );
      tab.position.set(0, -0.86, sz);
      group.add(tab);
    });
  } else {
    // Cropped Tailored Runway Blazer
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.52, 0.46),
      fabricMat
    );
    torso.position.set(0, -0.38, 0);
    torso.castShadow = true;
    group.add(torso);

    // Sharp Padded Shoulders
    const shoulderPads = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 0.52),
      fabricMat
    );
    shoulderPads.position.set(0, -0.14, 0);
    group.add(shoulderPads);

    // Deep Satin Lapels
    const lapel = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.34, 0.2),
      secondaryMat
    );
    lapel.position.set(0.098, -0.32, 0);
    group.add(lapel);

    // Single Statement Button
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.01, 10),
      chromeMat
    );
    button.rotation.z = Math.PI / 2;
    button.position.set(0.102, -0.55, 0);
    group.add(button);

    // Slender Sleeves
    [-0.27, 0.27].forEach((sz) => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.046, 0.72, 12),
        fabricMat
      );
      sleeve.position.set(0, -0.48, sz);
      sleeve.castShadow = true;
      group.add(sleeve);
    });
  }

  return group;
}

// ── Fashion Atelier Display Mannequin Builder ──
function createMannequin({
  gender = 'men',
  outfitColor = '#18181b',
  accentColor = '#f8fafc',
  chromeMat,
  darkSteelMat,
}) {
  const group = new THREE.Group();

  // 1. Stainless Steel Round Floor Base
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.32, 0.035, 24),
    chromeMat
  );
  base.position.y = 0.02;
  base.receiveShadow = true;
  group.add(base);

  // 2. Vertical Support Stand Pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 1.85, 12),
    chromeMat
  );
  pole.position.y = 0.94;
  group.add(pole);

  // 3. Tailored Atelier Form Body (Torso)
  const mannequinMat = new THREE.MeshStandardMaterial({
    color: '#0f0c18',
    roughness: 0.65,
    metalness: 0.15,
  });

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(
      gender === 'men' ? 0.19 : 0.14,
      gender === 'men' ? 0.15 : 0.18,
      0.82,
      16
    ),
    mannequinMat
  );
  torso.position.y = 1.45;
  torso.scale.set(1, 1, 1.25);
  torso.castShadow = true;
  group.add(torso);

  // 4. Polished Chrome Neck Cap
  const neckCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.055, 0.06, 16),
    chromeMat
  );
  neckCap.position.y = 1.88;
  group.add(neckCap);

  // 5. Styled Layered Outfit
  if (gender === 'men') {
    // Inner Bone-White AMIRI Hoodie
    const innerHoodie = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.16, 0.78, 16),
      new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.75 })
    );
    innerHoodie.position.y = 1.45;
    innerHoodie.scale.set(1.02, 1, 1.26);
    group.add(innerHoodie);

    // 3D Draped Hood on Back of Mannequin
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.75 })
    );
    hood.rotation.x = Math.PI * 0.75;
    hood.position.set(-0.11, 1.76, 0);
    hood.scale.set(0.95, 1.15, 1.1);
    group.add(hood);

    // Silver Cuban Chain Necklace
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.012, 8, 20),
      chromeMat
    );
    chain.rotation.x = Math.PI / 2.3;
    chain.position.set(0.06, 1.72, 0);
    group.add(chain);

    // Outer Open Leather Biker Moto Jacket
    const jacketLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.74, 0.18),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.28, metalness: 0.3 })
    );
    jacketLeft.position.set(0.08, 1.44, -0.19);
    jacketLeft.rotation.y = 0.25;
    group.add(jacketLeft);

    const jacketRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.74, 0.18),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.28, metalness: 0.3 })
    );
    jacketRight.position.set(0.08, 1.44, 0.19);
    jacketRight.rotation.y = -0.25;
    group.add(jacketRight);

    // Shoulders
    const shoulders = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.1, 0.54),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.28, metalness: 0.3 })
    );
    shoulders.position.set(0, 1.76, 0);
    group.add(shoulders);
  } else {
    // Women's Couture Runway Blazer Dress
    const dressBodice = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.17, 0.54, 16),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.45, metalness: 0.12 })
    );
    dressBodice.position.y = 1.54;
    dressBodice.scale.set(0.95, 1, 1.25);
    group.add(dressBodice);

    // Satin Deep V-Lapels
    const lapel = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.38, 0.16),
      new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.2, metalness: 0.2 })
    );
    lapel.position.set(0.11, 1.58, 0);
    group.add(lapel);

    // Metallic Gold Waist Chain Belt
    const goldBelt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.155, 0.03, 20),
      chromeMat
    );
    goldBelt.position.y = 1.34;
    goldBelt.scale.set(0.95, 1, 1.25);
    group.add(goldBelt);

    // Flared Pleated Lower Skirt
    const flareSkirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.36, 0.55, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.45 })
    );
    flareSkirt.position.y = 1.05;
    flareSkirt.scale.set(0.9, 1, 1.2);
    group.add(flareSkirt);

    // Padded Shoulders
    const shoulders = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.07, 0.48),
      new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.45 })
    );
    shoulders.position.set(0, 1.78, 0);
    group.add(shoulders);
  }

  return group;
}

// ── Realistic Folded Garment Builder (for Central Styling Table) ──
function createFoldedGarmentItem({ type, color, labelText = 'AMIRI' }) {
  const group = new THREE.Group();

  const fabricMat = new THREE.MeshStandardMaterial({
    color,
    roughness: type === 'denim' ? 0.8 : 0.7,
    metalness: 0.05,
  });

  if (type === 'hoodie' || type === 'sweater') {
    // 1. Folded main body with rounded front edge
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.065, 0.52),
      fabricMat
    );
    body.position.set(0, 0.032, 0);
    body.castShadow = true;
    group.add(body);

    // Rounded front fold roll
    const frontRoll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.44, 12),
      fabricMat
    );
    frontRoll.rotation.z = Math.PI / 2;
    frontRoll.position.set(0, 0.032, 0.26);
    group.add(frontRoll);

    // 2. Folded hood/collar layer on top
    const topFold = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.04, 0.34),
      fabricMat
    );
    topFold.position.set(0, 0.08, -0.06);
    group.add(topFold);

    // 3. Woven AMIRI neck tag
    const tag = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.005, 0.06),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 })
    );
    tag.position.set(0, 0.102, -0.16);
    group.add(tag);
  } else {
    // Folded Denim Jeans Stack
    // 1. Lower folded leg
    const lowerLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.045, 0.52),
      fabricMat
    );
    lowerLeg.position.set(0, 0.022, 0);
    group.add(lowerLeg);

    // Rounded bottom leg cuff fold
    const cuffFold = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.42, 12),
      fabricMat
    );
    cuffFold.rotation.z = Math.PI / 2;
    cuffFold.position.set(0, 0.022, 0.26);
    group.add(cuffFold);

    // 2. Upper folded leg with visible waistband & belt loops
    const upperLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.41, 0.045, 0.46),
      fabricMat
    );
    upperLeg.position.set(0, 0.067, -0.02);
    group.add(upperLeg);

    // Waistband
    const waistband = new THREE.Mesh(
      new THREE.BoxGeometry(0.41, 0.048, 0.09),
      fabricMat
    );
    waistband.position.set(0, 0.07, -0.21);
    group.add(waistband);

    // Copper Rivet / Button
    const rivet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.008, 8),
      new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.8, roughness: 0.3 })
    );
    rivet.position.set(0, 0.096, -0.21);
    group.add(rivet);

    // AMIRI Leather Brand Patch on back waistband
    const leatherPatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.005, 0.05),
      new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.4 })
    );
    leatherPatch.position.set(0.11, 0.095, -0.21);
    group.add(leatherPatch);
  }

  return group;
}

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const VirtualStoreSection = ({ onSelectCategory, onNavigateMixAndMatch }) => {
  const mountRef = useRef(null);
  const hotspotRefs = useRef({
    men: null,
    center: null,
    women: null,
    accessories: null,
  });

  const [hoveredZone, setHoveredZone] = useState(null);
  const [activeZone, setActiveZone] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [showMixModal, setShowMixModal] = useState(false);

  // Mutable animation state shared with Three.js render loop
  const animStateRef = useRef({
    currentPos: CAMERA_PRESETS.overview.pos.clone(),
    currentLookAt: CAMERA_PRESETS.overview.lookAt.clone(),
    startPos: CAMERA_PRESETS.overview.pos.clone(),
    startLookAt: CAMERA_PRESETS.overview.lookAt.clone(),
    targetPos: CAMERA_PRESETS.overview.pos.clone(),
    targetLookAt: CAMERA_PRESETS.overview.lookAt.clone(),
    animStartTime: null,
    animDuration: 1150,
    isAnimatingCamera: false,
    onAnimComplete: null,
    mouseX: 0,
    mouseY: 0,
    hoveredZone: null,
    isTransitioning: false,
  });

  useEffect(() => {
    animStateRef.current.hoveredZone = hoveredZone;
  }, [hoveredZone]);

  useEffect(() => {
    animStateRef.current.isTransitioning = isTransitioning;
  }, [isTransitioning]);

  // Trigger camera fly-to + transition behavior for a zone
  const triggerZoneSelection = useCallback(
    (zoneKey) => {
      if (animStateRef.current.isTransitioning) return;

      const preset = CAMERA_PRESETS[zoneKey];
      if (!preset) return;

      setIsTransitioning(true);
      setActiveZone(zoneKey);
      setHoveredZone(null);

      const st = animStateRef.current;
      st.isTransitioning = true;
      st.startPos.copy(st.currentPos);
      st.startLookAt.copy(st.currentLookAt);
      st.targetPos.copy(preset.pos);
      st.targetLookAt.copy(preset.lookAt);
      st.animStartTime = performance.now();
      st.animDuration = 1150; // ~1.15s restrained camera animation
      st.isAnimatingCamera = true;

      if (zoneKey === 'men' || zoneKey === 'women' || zoneKey === 'accessories') {
        // Start brief smooth fade near the end of the camera move
        const fadeTimer = setTimeout(() => {
          setIsFading(true);
        }, 820);

        st.onAnimComplete = () => {
          clearTimeout(fadeTimer);
          setIsFading(true);
          setTimeout(() => {
            if (onSelectCategory) {
              onSelectCategory(zoneKey);
            }
          }, 260);
        };
      } else if (zoneKey === 'center') {
        // MIX & MATCH center styling table
        st.onAnimComplete = () => {
          if (onNavigateMixAndMatch) {
            setIsFading(true);
            setTimeout(() => {
              onNavigateMixAndMatch();
            }, 260);
          } else {
            // No existing outfit-styling page yet: show luxury Mix & Match studio preview card
            setShowMixModal(true);
          }
        };
      }
    },
    [onSelectCategory, onNavigateMixAndMatch]
  );

  // Listen for global navbar navigation events (e.g. clicking ACCESSORIES in header)
  useEffect(() => {
    const handleFocusEvent = (e) => {
      const targetZone = e.detail;
      if (targetZone && !animStateRef.current.isTransitioning) {
        triggerZoneSelection(targetZone);
      }
    };
    window.addEventListener('focusBoutiqueZone', handleFocusEvent);
    return () => {
      window.removeEventListener('focusBoutiqueZone', handleFocusEvent);
    };
  }, [triggerZoneSelection]);

  // Return camera from Mix & Match table back to store overview
  const handleResetToOverview = useCallback(() => {
    setShowMixModal(false);
    const st = animStateRef.current;
    st.startPos.copy(st.currentPos);
    st.startLookAt.copy(st.currentLookAt);
    st.targetPos.copy(CAMERA_PRESETS.overview.pos);
    st.targetLookAt.copy(CAMERA_PRESETS.overview.lookAt);
    st.animStartTime = performance.now();
    st.animDuration = 950;
    st.isAnimatingCamera = true;
    st.onAnimComplete = () => {
      st.isTransitioning = false;
      setIsTransitioning(false);
      setActiveZone(null);
    };
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ── 1. Scene, Camera, Renderer ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07050c');
    scene.fog = new THREE.FogExp2('#07050c', 0.042);

    const camera = new THREE.PerspectiveCamera(
      56,
      container.clientWidth / container.clientHeight,
      0.1,
      50
    );
    camera.position.copy(CAMERA_PRESETS.overview.pos);
    camera.lookAt(CAMERA_PRESETS.overview.lookAt);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    // Capped to 1.25 to prevent 4K/Retina fill-rate choking while keeping visuals sharp
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ── Neutral Studio IBL Environment (for authentic Sketchfab-style mirror gold & chrome reflections) ──
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const neutralEnv = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = neutralEnv;

    // ── 2. Shared Materials & Procedural Textures ──
    const brickTex = createBrickTexture();
    const concreteTex = createConcreteTexture();
    const lookbookTex = createLookbookTexture();

    const brickMat = new THREE.MeshStandardMaterial({
      map: brickTex,
      bumpMap: brickTex,
      bumpScale: 0.04,
      roughness: 0.82,
      metalness: 0.08,
    });

    const floorMat = new THREE.MeshStandardMaterial({
      map: concreteTex,
      bumpMap: concreteTex,
      bumpScale: 0.015,
      roughness: 0.28,
      metalness: 0.22,
    });

    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: '#18161f',
      roughness: 0.35,
      metalness: 0.85,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: '#d4d4dc',
      roughness: 0.18,
      metalness: 0.92,
    });

    const marbleMat = new THREE.MeshStandardMaterial({
      color: '#14111d',
      roughness: 0.2,
      metalness: 0.3,
    });

    // ── 3. Boutique Room Geometry (Floor, Brick Walls, Ceiling Trusses) ──
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Back brick wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(18, 7.5), brickMat);
    backWall.position.set(0, 3.75, -4.2);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Angled left brick wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.5), brickMat);
    leftWall.position.set(-7.6, 3.75, -0.5);
    leftWall.rotation.y = Math.PI / 2.35;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Angled right brick wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.5), brickMat);
    rightWall.position.set(7.6, 3.75, -0.5);
    rightWall.rotation.y = -Math.PI / 2.35;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Industrial steel columns dividing the 3 bays on the back wall
    [-3.1, 3.1, -6.6, 6.6].forEach((xPos) => {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 7.5, 0.38),
        darkSteelMat
      );
      pillar.position.set(xPos, 3.75, -4.05);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);
    });

    // Industrial ceiling trusses & neon light bars
    for (let z = -3.2; z <= 2.4; z += 1.8) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(16, 0.16, 0.16),
        darkSteelMat
      );
      beam.position.set(0, 5.6, z);
      scene.add(beam);
    }

    // Ceiling linear LED tubes (blue & purple glow)
    const ledBlueMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const ledPurpleMat = new THREE.MeshBasicMaterial({ color: '#c084fc' });
    const ledPinkMat = new THREE.MeshBasicMaterial({ color: '#f472b6' });

    const leftCeilingLed = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.05, 0.08),
      ledBlueMat
    );
    leftCeilingLed.position.set(-4.6, 5.5, -1.5);
    scene.add(leftCeilingLed);

    const centerCeilingLed = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.05, 0.08),
      ledPurpleMat
    );
    centerCeilingLed.position.set(0, 5.5, -1.2);
    scene.add(centerCeilingLed);

    const rightCeilingLed = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.05, 0.08),
      ledPinkMat
    );
    rightCeilingLed.position.set(4.6, 5.5, -1.5);
    scene.add(rightCeilingLed);

    // ── 4. LEFT AREA: MEN'S DISPLAY ──
    const menGroup = new THREE.Group();
    scene.add(menGroup);

    // Men's Neon Sign mounted flush on the angled left wall (Symmetric to Women's sign on right wall)
    const menSignTex = createNeonSignTexture({
      title: "MEN'S",
      subtitle: 'STREETWEAR & SNEAKERS',
      primaryColor: '#38bdf8',
      secondaryColor: '#c084fc',
    });
    const menSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 1.08),
      new THREE.MeshBasicMaterial({ map: menSignTex, transparent: true })
    );
    // Positioned symmetrically on leftWall matching womenSign on rightWall
    menSign.position.set(-7.195, 4.88, -2.048);
    menSign.rotation.y = Math.PI / 2.35; // EXACT angle of leftWall so it sits 100% flush!
    menGroup.add(menSign);

    // Soft cyan neon ambient glow on the angled left wall around the sign
    const menSignGlow = new THREE.PointLight('#38bdf8', 2.2, 4.0);
    menSignGlow.position.set(-6.95, 4.88, -1.95);
    menGroup.add(menSignGlow);

    // ── Load User's AI-Generated 3D Mannequin Model ──
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      '/models/mannequin/mannequin_dorad.glb',
      (gltf) => {
        const userModel = gltf.scene;

        userModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace || 'srgb';
                child.material.map.needsUpdate = true;
              }

              // Material 1 (109_8b40c86b) = Gold Upper Torso & Head
              // Material 0 (107_8b40c86b) = Pristine Porcelain White Lower Body & Legs
              const isGold = child.material.name === '109_8b40c86b';

              if (isGold) {
                // Mirror-chrome reflective polished gold (reflects neutral studio environment)
                child.material.roughness = 0.06;
                child.material.metalness = 1.0;
                child.material.envMapIntensity = 2.6;
                child.material.emissive.set('#000000');
              } else {
                // Pure clean porcelain / satin white mannequin body (high contrast against gold)
                child.material.color.set('#fdfdfd');
                child.material.roughness = 0.36;
                child.material.metalness = 0.0;
                child.material.envMapIntensity = 0.6;
                child.material.emissive.set('#000000');
              }
              child.material.needsUpdate = true;
            }
          }
        });

        // Compute exact bounding box
        userModel.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(userModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        console.log('✅ AI 3D Mannequin loaded successfully:', {
          size: { x: size.x.toFixed(3), y: size.y.toFixed(3), z: size.z.toFixed(3) },
          center: { x: center.x.toFixed(3), y: center.y.toFixed(3), z: center.z.toFixed(3) },
        });

        // 1. Mannequin wrapper group
        const mannequinWrapper = new THREE.Group();
        mannequinWrapper.name = 'userMannequinWrapper';

        // Center on X and Z, align bottom to Y = 0
        userModel.position.set(-center.x, -box.min.y, -center.z);
        mannequinWrapper.add(userModel);

        // Scale to towering, imposing statuary flex mannequin height (~2.65m)
        const targetHeight = 2.65;
        const scaleVal = targetHeight / (size.y || 1);
        mannequinWrapper.scale.setScalar(scaleVal);

        // Position in the left foreground (balanced symmetrically, moved forward and spread to left)
        const flexPos = { x: -5.2, y: 0.05, z: 1.7 };
        mannequinWrapper.position.set(flexPos.x, flexPos.y, flexPos.z);
        mannequinWrapper.rotation.y = 0.58; // Elegant inward angle toward the center styling table

        // 2. Clean, Minimalist Gallery Podium (Sleek dark titanium with chrome trim)
        const podiumGroup = new THREE.Group();
        podiumGroup.position.set(flexPos.x, 0, flexPos.z);

        const podiumBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.58, 0.64, 0.05, 32),
          new THREE.MeshStandardMaterial({
            color: '#14121d',
            roughness: 0.4,
            metalness: 0.7,
          })
        );
        podiumBase.position.y = 0.025;
        podiumBase.receiveShadow = true;
        podiumGroup.add(podiumBase);

        // Top chrome beveled rim
        const chromeRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.58, 0.014, 12, 32),
          chromeMat
        );
        chromeRim.rotation.x = Math.PI / 2;
        chromeRim.position.y = 0.05;
        podiumGroup.add(chromeRim);

        // Luminous Neon LED Underglow Ring around base (Cyber Cyan / Electric Blue for Men's)
        const baseNeonRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.642, 0.016, 12, 48),
          new THREE.MeshBasicMaterial({ color: '#38bdf8' })
        );
        baseNeonRing.rotation.x = Math.PI / 2;
        baseNeonRing.position.y = 0.012;
        podiumGroup.add(baseNeonRing);

        // Floor glow pool beneath the podium
        const baseGlowLight = new THREE.PointLight('#38bdf8', 3.2, 3.2);
        baseGlowLight.position.set(0, 0.03, 0);
        podiumGroup.add(baseGlowLight);

        menGroup.add(podiumGroup);

        // 3. Studio High-Contrast Lighting Rig (Crisp Key Light, Soft Fill, Clean Rim)
        // Main Studio Key Light (Casts crisp highlights on the gold head and white body)
        const keyLight = new THREE.SpotLight(0xffffff, 7.5, 18, Math.PI / 4, 0.35);
        keyLight.position.set(-3.6, 5.0, 3.4);
        keyLight.target.position.set(flexPos.x, 1.5, flexPos.z);
        keyLight.castShadow = false;
        menGroup.add(keyLight);
        menGroup.add(keyLight.target);

        // Soft Studio Fill Light (Keeps body shadows smooth and elegant)
        const fillLight = new THREE.PointLight(0xf1f5f9, 2.8, 9);
        fillLight.position.set(-6.6, 3.0, 2.8);
        menGroup.add(fillLight);

        // Studio Rim / Silhouette Light (Outlines the back of shoulders and neck)
        const rimLight = new THREE.PointLight(0xe2e8f0, 3.2, 8);
        rimLight.position.set(-6.0, 3.6, 0.2);
        menGroup.add(rimLight);

        // Add the flex AI mannequin into the scene while keeping the main men's display mannequin
        menGroup.add(mannequinWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user mannequin GLB:', err);
      }
    );

    // ── Load Bape Streetwear Wooden Cargo Crate in the Back-Left Corner of Men's Area ──
    gltfLoader.load(
      '/models/props/bape_crate.glb',
      (gltf) => {
        const crateModel = gltf.scene;

        crateModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false; // High FPS performance, no shadow pass overhead
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              child.material.roughness = 0.65;
              child.material.metalness = 0.05;
              child.material.envMapIntensity = 1.25;
            }
          }
        });

        crateModel.updateMatrixWorld(true);
        const crateBox = new THREE.Box3().setFromObject(crateModel);
        const crateSize = new THREE.Vector3();
        crateBox.getSize(crateSize);
        const crateCenter = new THREE.Vector3();
        crateBox.getCenter(crateCenter);

        const crateWrapper = new THREE.Group();
        crateWrapper.name = 'bapeCrateWrapper';

        // Center on X and Z, align bottom to Y = 0 (flush on the floor)
        crateModel.position.set(-crateCenter.x, -crateBox.min.y, -crateCenter.z);
        crateWrapper.add(crateModel);

        // Substantial, imposing streetwear cargo crate scale (1.35m height/width/depth - authentic large pallet crate)
        const targetCrateHeight = 1.35;
        const scaleVal = targetCrateHeight / (crateSize.y || 1);
        crateWrapper.scale.setScalar(scaleVal);

        // Positioned in the spacious back-left corner of the Men's section with ample clearance from walls & mannequins
        const cratePos = { x: -5.10, y: 0.0, z: -2.85 };
        crateWrapper.position.set(cratePos.x, cratePos.y, cratePos.z);
        // Turned slightly at ~16 degrees towards the camera & center runway to show dynamic 3D depth and branding
        crateWrapper.rotation.y = 0.28;

        menGroup.add(crateWrapper);

        // Subtle dedicated overhead downlight to highlight the crate wood grain and Bape graphic
        const crateSpotlight = new THREE.SpotLight('#ffffff', 3.2, 8.0, Math.PI / 3.5, 0.45);
        crateSpotlight.position.set(cratePos.x, 4.4, cratePos.z + 1.2);
        crateSpotlight.target.position.set(cratePos.x, 0.65, cratePos.z);
        crateSpotlight.castShadow = false;
        menGroup.add(crateSpotlight);
        menGroup.add(crateSpotlight.target);
      },
      undefined,
      (err) => {
        console.warn('Could not load Bape wooden crate GLB:', err);
      }
    );

    // ── Load Angel King Von Tribute Sculpture on Top of Bape Crate ──
    gltfLoader.load(
      '/models/props/king_von.glb',
      (gltf) => {
        const vonModel = gltf.scene;

        vonModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false; // Zero shadow-pass penalty for high FPS
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              child.material.roughness = 0.55;
              child.material.metalness = 0.15;
              child.material.envMapIntensity = 1.3;
            }
          }
        });

        vonModel.updateMatrixWorld(true);
        const vonBox = new THREE.Box3().setFromObject(vonModel);
        const vonSize = new THREE.Vector3();
        vonBox.getSize(vonSize);
        const vonCenter = new THREE.Vector3();
        vonBox.getCenter(vonCenter);

        const vonWrapper = new THREE.Group();
        vonWrapper.name = 'angelKingVonWrapper';

        // Center on X and Z, align base flush to local Y = 0
        vonModel.position.set(-vonCenter.x, -vonBox.min.y, -vonCenter.z);
        vonWrapper.add(vonModel);

        // Scale to heroic sculpture proportion (~1.25m tall, wingspan ~1.70m)
        const targetVonHeight = 1.25;
        const scaleVal = targetVonHeight / (vonSize.y || 1);
        vonWrapper.scale.setScalar(scaleVal);

        // Positioned flush on top of Bape wooden crate (crate top is at Y = 1.35m at x = -5.10, z = -2.85)
        const vonPos = { x: -5.10, y: 1.35, z: -2.85 };
        vonWrapper.position.set(vonPos.x, vonPos.y, vonPos.z);
        // Rotate to face camera & center runway, matching crate angle
        vonWrapper.rotation.y = -Math.PI / 2 + 0.28;

        menGroup.add(vonWrapper);

        // Dedicated accent spotlight for Angel King Von sculpture
        const vonSpotlight = new THREE.SpotLight('#ffffff', 3.8, 9.0, Math.PI / 3.5, 0.4);
        vonSpotlight.position.set(vonPos.x + 0.3, 4.5, vonPos.z + 1.6);
        vonSpotlight.target.position.set(vonPos.x, vonPos.y + 0.65, vonPos.z);
        vonSpotlight.castShadow = false;
        menGroup.add(vonSpotlight);
        menGroup.add(vonSpotlight.target);
      },
      undefined,
      (err) => {
        console.warn('Could not load Angel King Von model:', err);
      }
    );

    // ── 5. CENTER AREA: MIX & MATCH STYLING TABLE ──
    const centerGroup = new THREE.Group();
    scene.add(centerGroup);

    // Center Back Wall Neon Sign: AMIRI / MIX & MATCH
    const centerSignTex = createNeonSignTexture({
      title: 'MIX & MATCH',
      subtitle: 'AMIRI STYLING ATELIER',
      primaryColor: '#c084fc',
      secondaryColor: '#38bdf8',
    });
    const centerSign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 1.3),
      new THREE.MeshBasicMaterial({ map: centerSignTex, transparent: true })
    );
    centerSign.position.set(0, 4.15, -3.95);
    centerGroup.add(centerSign);

    // Decorative framed arch backdrop behind Mix & Match
    const centerArchFrame = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 4.8, 0.12),
      darkSteelMat
    );
    centerArchFrame.position.set(0, 2.4, -4.1);
    centerGroup.add(centerArchFrame);

    // Suspended Overhead Neon Halo above the Styling Table
    const haloGroup = new THREE.Group();
    haloGroup.position.set(0, 3.65, -1.1);
    const haloOuter = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.07, 1.5),
      ledPurpleMat
    );
    haloGroup.add(haloOuter);
    centerGroup.add(haloGroup);

    // Elevated floor platform under the styling table
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.08, 2.8),
      new THREE.MeshStandardMaterial({
        color: '#0d0917',
        roughness: 0.35,
        metalness: 0.4,
      })
    );
    platform.position.set(0, 0.04, -1.1);
    platform.receiveShadow = true;
    centerGroup.add(platform);

    // Neon rim under the platform
    const platformRim = new THREE.Mesh(
      new THREE.BoxGeometry(4.26, 0.025, 2.86),
      ledPurpleMat
    );
    platformRim.position.set(0, 0.015, -1.1);
    centerGroup.add(platformRim);

    // Central Styling Table Pedestal & Tabletop
    const tableBase = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.88, 1.35),
      marbleMat
    );
    tableBase.position.set(0, 0.48, -1.1);
    tableBase.castShadow = true;
    tableBase.receiveShadow = true;
    centerGroup.add(tableBase);

    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(2.85, 0.09, 1.65),
      new THREE.MeshStandardMaterial({
        color: '#1e192b',
        roughness: 0.14,
        metalness: 0.55,
      })
    );
    tableTop.position.set(0, 0.96, -1.1);
    tableTop.castShadow = true;
    centerGroup.add(tableTop);

    // Illuminated frosted styling mat on top of table
    const frostedMat = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 0.02, 1.25),
      new THREE.MeshStandardMaterial({
        color: '#e9d5ff',
        emissive: '#7e22ce',
        emissiveIntensity: 0.35,
        roughness: 0.2,
      })
    );
    frostedMat.position.set(0, 1.015, -1.1);
    centerGroup.add(frostedMat);

    // Realistic Folded Hoodies and Stacks of Distressed Denim Jeans
    // Left stack: Folded luxury hoodies
    const foldedHoodie1 = createFoldedGarmentItem({
      type: 'hoodie',
      color: '#0f172a',
    });
    foldedHoodie1.position.set(-0.78, 1.025, -1.15);
    centerGroup.add(foldedHoodie1);

    const foldedHoodie2 = createFoldedGarmentItem({
      type: 'hoodie',
      color: '#581c87',
    });
    foldedHoodie2.position.set(-0.78, 1.135, -1.15);
    foldedHoodie2.rotation.y = 0.05;
    centerGroup.add(foldedHoodie2);

    const foldedTee = createFoldedGarmentItem({
      type: 'sweater',
      color: '#f8fafc',
    });
    foldedTee.position.set(-0.78, 1.245, -1.15);
    centerGroup.add(foldedTee);

    // Right stack: Authentic folded distressed denim jeans with rivets and leather patch
    const foldedJeans1 = createFoldedGarmentItem({
      type: 'denim',
      color: '#1e293b',
    });
    foldedJeans1.position.set(0.78, 1.025, -1.15);
    centerGroup.add(foldedJeans1);

    const foldedJeans2 = createFoldedGarmentItem({
      type: 'denim',
      color: '#0f172a',
    });
    foldedJeans2.position.set(0.78, 1.125, -1.15);
    foldedJeans2.rotation.y = -0.04;
    centerGroup.add(foldedJeans2);

    const foldedJeans3 = createFoldedGarmentItem({
      type: 'denim',
      color: '#334155',
    });
    foldedJeans3.position.set(0.78, 1.225, -1.15);
    centerGroup.add(foldedJeans3);

    // Open Luxury Fashion Lookbook / Magazine resting angled on the table
    const lookbook = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.42),
      new THREE.MeshStandardMaterial({
        map: lookbookTex,
        roughness: 0.25,
        metalness: 0.1,
      })
    );
    lookbook.rotation.x = -Math.PI / 2.25;
    lookbook.position.set(-0.02, 1.035, -0.72);
    centerGroup.add(lookbook);

    // Designer Accessories Tray on the Table (Sunglasses + Cuban Chain)
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.02, 0.32),
      new THREE.MeshStandardMaterial({ color: '#1c1917', roughness: 0.3 })
    );
    tray.position.set(0, 1.025, -1.52);
    centerGroup.add(tray);

    // Aviator Sunglasses
    [-0.06, 0.06].forEach((ex) => {
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.038, 0.005, 16),
        new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.1, metalness: 0.9 })
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(ex, 1.045, -1.52);
      centerGroup.add(lens);
    });

    const bridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.14, 8),
      chromeMat
    );
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 1.045, -1.52);
    centerGroup.add(bridge);

    // Coiled Cuban Curb Chain Necklace on the tray
    const chainCoil = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.012, 8, 20),
      chromeMat
    );
    chainCoil.rotation.x = Math.PI / 2;
    chainCoil.position.set(0, 1.035, -1.38);
    centerGroup.add(chainCoil);

    // Featured sneaker pair on central acrylic display riser
    const centerRiser = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.14, 0.38),
      chromeMat
    );
    centerRiser.position.set(0, 1.09, -1.1);
    centerGroup.add(centerRiser);

    [-0.12, 0.12].forEach((ox) => {
      const sneaker = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.11, 0.3),
        new THREE.MeshStandardMaterial({
          color: '#f8fafc',
          roughness: 0.3,
        })
      );
      sneaker.position.set(ox, 1.22, -1.1);
      centerGroup.add(sneaker);
    });

    // ── 6. RIGHT AREA: WOMEN'S CLOTHING RACKS & DISPLAYS ──
    const womenGroup = new THREE.Group();
    scene.add(womenGroup);

    // Women's Neon Sign mounted flush on the angled right wall (Tường chéo bên phải)
    const womenSignTex = createNeonSignTexture({
      title: "WOMEN'S",
      subtitle: 'LUXURY RUNWAY & DRESSES',
      primaryColor: '#f472b6',
      secondaryColor: '#c084fc',
    });
    const womenSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 1.08),
      new THREE.MeshBasicMaterial({ map: womenSignTex, transparent: true })
    );
    // Positioned higher up and advanced slightly along rightWall so it is 100% uncovered by the Dior showcase
    womenSign.position.set(7.195, 4.88, -2.048);
    womenSign.rotation.y = -Math.PI / 2.35; // EXACT angle of rightWall so it sits 100% flush!
    womenGroup.add(womenSign);

    // Soft pink neon ambient glow on the angled right wall around the sign
    const womenSignGlow = new THREE.PointLight('#f472b6', 2.2, 4.0);
    womenSignGlow.position.set(6.95, 4.88, -1.95);
    womenGroup.add(womenSignGlow);

    // ── Floating 3-Tier Luxury Glass Shelf Mounted on Angled Right Wall ──
    const shelfGroup = new THREE.Group();
    shelfGroup.name = 'rightWallGlassShelfGroup';
    // Shifted forward along the wall (ds = +0.55m) into the open, visible foreground
    shelfGroup.position.set(7.58, 2.15, -0.56);
    shelfGroup.rotation.y = -Math.PI / 2.35; // Flush with angled right wall

    // Architectural Ultra-Clear Tempered Glass Material
    const luxuryGlassMat = new THREE.MeshPhysicalMaterial({
      color: '#f8fafc',
      transparent: true,
      opacity: 0.48,
      roughness: 0.08,
      metalness: 0.12,
      transmission: 0.88,
      ior: 1.52,
      reflectivity: 0.92,
      thickness: 0.025,
      envMapIntensity: 2.2,
    });

    // Dark Titanium / Polished Chrome Rail Material
    const shelfFrameMat = new THREE.MeshStandardMaterial({
      color: '#27272a',
      roughness: 0.22,
      metalness: 0.92,
    });

    const shelfWidth = 3.0; // Extended to 3.0m wide grand luxury display span
    const shelfDepth = 0.42; // 42cm deep for bags, shoes, perfume bottles
    const shelfThick = 0.022; // 2.2cm thick beveled glass
    const tierYPositions = [-0.52, 0.0, 0.52]; // 3 Tiers (Bottom: 1.63m, Mid: 2.15m, Top: 2.67m)

    // 1. Three Vertical Architectural Wall Rails (Left, Center, Right Uprights)
    [-1.15, 0.0, 1.15].forEach((xPos) => {
      // Main vertical mounting track
      const upright = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 1.38, 0.035),
        shelfFrameMat
      );
      upright.position.set(xPos, 0, 0.025);
      upright.castShadow = true;
      upright.receiveShadow = true;
      shelfGroup.add(upright);

      // Top and bottom chrome standoff mounting bosses
      [-0.67, 0.67].forEach((yPos) => {
        const boss = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.024, 0.03, 16),
          chromeMat
        );
        boss.rotation.x = Math.PI / 2;
        boss.position.set(xPos, yPos, 0.015);
        shelfGroup.add(boss);
      });
    });

    // 2. Three Cantilevered Tempered Glass Shelves with Built-in Under-Shelf LED Strips
    tierYPositions.forEach((yPos, tierIdx) => {
      // Tempered glass shelf slab
      const glassShelf = new THREE.Mesh(
        new THREE.BoxGeometry(shelfWidth, shelfThick, shelfDepth),
        luxuryGlassMat
      );
      glassShelf.position.set(0, yPos, shelfDepth / 2 + 0.025);
      glassShelf.castShadow = true;
      glassShelf.receiveShadow = true;
      shelfGroup.add(glassShelf);

      // Polished chrome front edge trim highlight
      const frontTrim = new THREE.Mesh(
        new THREE.BoxGeometry(shelfWidth + 0.005, 0.006, 0.008),
        chromeMat
      );
      frontTrim.position.set(0, yPos, shelfDepth + 0.027);
      shelfGroup.add(frontTrim);

      // Architectural Cantilever Support Arms (3 arms per tier under the glass)
      [-1.15, 0.0, 1.15].forEach((xPos) => {
        const bracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.028, 0.028, shelfDepth - 0.04),
          shelfFrameMat
        );
        bracket.position.set(
          xPos,
          yPos - shelfThick / 2 - 0.014,
          shelfDepth / 2 + 0.025
        );
        bracket.castShadow = true;
        shelfGroup.add(bracket);
      });

      // Concealed Luxury LED light strip beneath the rear of each glass shelf
      const shelfLed = new THREE.Mesh(
        new THREE.BoxGeometry(shelfWidth - 0.08, 0.01, 0.018),
        new THREE.MeshBasicMaterial({ color: '#fbcfe8' })
      );
      shelfLed.position.set(0, yPos - shelfThick / 2, 0.035);
      shelfGroup.add(shelfLed);

      // Minimalist luxury display pedestals / velvet riser blocks on each shelf
      // 4 Display Slots per tier = 12 total dedicated display spots for user .glb products!
      // Generously spaced at [-0.95, -0.32, 0.32, 0.95] so each tier comfortably holds 3 to 4 products without crowding
      [-0.95, -0.32, 0.32, 0.95].forEach((slotX, slotIdx) => {
        const slotGroup = new THREE.Group();
        slotGroup.name = `shelfSlot_tier${tierIdx + 1}_pos${slotIdx + 1}`;
        slotGroup.position.set(slotX, yPos + shelfThick / 2, shelfDepth / 2 + 0.025);

        // Sleek velvet display riser block (adds luxury gallery depth)
        const riser = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.016, 0.22),
          new THREE.MeshStandardMaterial({
            color: '#181524',
            roughness: 0.8,
            metalness: 0.1,
          })
        );
        riser.position.y = 0.008;
        riser.receiveShadow = true;
        slotGroup.add(riser);

        // Polished chrome base border on the riser
        const riserRim = new THREE.Mesh(
          new THREE.BoxGeometry(0.246, 0.004, 0.226),
          chromeMat
        );
        riserRim.position.y = 0.002;
        slotGroup.add(riserRim);

        shelfGroup.add(slotGroup);
      });
    });

    // ── Load 3D Louis Vuitton Bag on Top Glass Shelf (Tier 3) ──
    gltfLoader.load(
      '/models/products/lv_bag/bolso_lv.glb',
      (gltf) => {
        const lvBagScene = gltf.scene;

        // Traverse to tune materials for high-end boutique realism
        lvBagScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;

            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // If this is the gold LV logo plaque (named 'Material.001' or child name 'Plane')
              if (child.name === 'Plane' || (child.material.name && child.material.name.includes('Material.001'))) {
                child.material.roughness = 0.18;
                child.material.metalness = 0.95;
                if (child.material.emissive) {
                  child.material.emissive.set('#856404');
                  child.material.emissiveIntensity = 0.2;
                }
              } else {
                // Monogram leather bag body
                child.material.roughness = 0.45;
                child.material.metalness = 0.12;
                child.material.envMapIntensity = 1.4;
              }
            }
          }
        });

        // Compute natural bounding box of the unscaled prefab
        const bagBBox = new THREE.Box3().setFromObject(lvBagScene);
        const bagSize = new THREE.Vector3();
        bagBBox.getSize(bagSize);
        const bagCenter = new THREE.Vector3();
        bagBBox.getCenter(bagCenter);

        // Target height ~0.235m (around 24cm wide and 23.5cm tall, true luxury handbag proportions)
        const targetHeight = 0.235;
        const bagScale = targetHeight / (bagSize.y || 1);

        // Display slots on Tier 3 (top tier: yPos = 0.52)
        // 4 slots: [-0.95, -0.32, 0.32, 0.95]
        const topTierY = 0.52;
        const slot1X = -0.95;

        // Place ONLY 1 bag at slot 1 (left-most position), keeping slots 2, 3, 4 ready for upcoming distinct items
        const bagClone = lvBagScene.clone(true);
        bagClone.scale.setScalar(bagScale);
        // Center the bag on its base so bottom sits exactly on top of the velvet riser
        bagClone.position.set(
          -bagCenter.x * bagScale,
          -bagBBox.min.y * bagScale,
          -bagCenter.z * bagScale
        );

        const bagWrapper = new THREE.Group();
        bagWrapper.name = 'topTier_product_slot1';
        // Position directly on top of the velvet riser: y = topTierY + shelfThick / 2 + 0.016
        bagWrapper.position.set(
          slot1X,
          topTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        bagWrapper.rotation.y = 0.28; // Elegant inward boutique angle facing the shopper

        bagWrapper.add(bagClone);
        shelfGroup.add(bagWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user Louis Vuitton bag GLB:', err);
      }
    );

    // ── Load 3D Louis Vuitton Trunk Briefcase on Top Glass Shelf (Tier 3, Slot 2) ──
    gltfLoader.load(
      '/models/products/maletin_luvi/maletin_lv.glb',
      (gltf) => {
        const maletinScene = gltf.scene;

        maletinScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;

            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // Gold LV logo tag
              if (child.name === 'Plane.001' || (child.material.name && child.material.name.includes('Material.002'))) {
                child.material.roughness = 0.18;
                child.material.metalness = 0.95;
                if (child.material.emissive) {
                  child.material.emissive.set('#856404');
                  child.material.emissiveIntensity = 0.2;
                }
              } else if (child.name === 'Mesh_0.008' || (child.material.name && child.material.name.includes('92f10684'))) {
                // Gold hardware (locks, hinges, buckles)
                child.material.roughness = 0.2;
                child.material.metalness = 0.92;
                child.material.envMapIntensity = 2.0;
              } else {
                // Trunk leather body & handle
                child.material.roughness = 0.45;
                child.material.metalness = 0.1;
                child.material.envMapIntensity = 1.3;
              }
            }
          }
        });

        const maletinBBox = new THREE.Box3().setFromObject(maletinScene);
        const maletinSize = new THREE.Vector3();
        maletinBBox.getSize(maletinSize);
        const maletinCenter = new THREE.Vector3();
        maletinBBox.getCenter(maletinCenter);

        // Desired luxury trunk height: ~0.22m (~40cm wide, 22cm high, true proportions)
        const maletinTargetHeight = 0.22;
        const maletinScale = maletinTargetHeight / (maletinSize.y || 1);

        const topTierY = 0.52;
        const slot2X = -0.32;

        const maletinClone = maletinScene.clone(true);
        maletinClone.scale.setScalar(maletinScale);
        maletinClone.position.set(
          -maletinCenter.x * maletinScale,
          -maletinBBox.min.y * maletinScale,
          -maletinCenter.z * maletinScale
        );

        const maletinWrapper = new THREE.Group();
        maletinWrapper.name = 'topTier_product_slot2';
        maletinWrapper.position.set(
          slot2X,
          topTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        maletinWrapper.rotation.y = 0.08; // Subtle inward gallery angle

        maletinWrapper.add(maletinClone);
        shelfGroup.add(maletinWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user maletin LV GLB:', err);
      }
    );

    // ── Load 3D Gucci Sylvie Leather Bag on Top Glass Shelf (Tier 3, Slot 3) ──
    gltfLoader.load(
      '/models/products/female_bag/gucci_bag.glb',
      (gltf) => {
        const gucciScene = gltf.scene;

        gucciScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;

            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              if (child.material.name === 'baobao') {
                // White luxury calfskin leather with red/blue Web stripe
                child.material.roughness = 0.38;
                child.material.metalness = 0.08;
                child.material.envMapIntensity = 1.3;
              } else if (child.material.name === 'budai') {
                // Gold buckle, chain, stars, lion head and ribbon
                child.material.roughness = 0.22;
                child.material.metalness = 0.88;
                child.material.envMapIntensity = 1.8;
              } else if (child.material.name === 'daizi') {
                // Leather strap and handle
                child.material.roughness = 0.42;
                child.material.metalness = 0.15;
              }
            }
          }
        });

        const gucciBBox = new THREE.Box3().setFromObject(gucciScene);
        const gucciSize = new THREE.Vector3();
        gucciBBox.getSize(gucciSize);
        const gucciCenter = new THREE.Vector3();
        gucciBBox.getCenter(gucciCenter);

        // Desired luxury handbag height ~0.23m (~24cm wide, 23cm high, matching the display)
        const gucciTargetHeight = 0.23;
        const gucciScale = gucciTargetHeight / (gucciSize.y || 1);

        const topTierY = 0.52;
        const slot3X = 0.32;

        const gucciClone = gucciScene.clone(true);
        gucciClone.scale.setScalar(gucciScale);
        gucciClone.position.set(
          -gucciCenter.x * gucciScale,
          -gucciBBox.min.y * gucciScale,
          -gucciCenter.z * gucciScale
        );

        const gucciWrapper = new THREE.Group();
        gucciWrapper.name = 'topTier_product_slot3';
        gucciWrapper.position.set(
          slot3X,
          topTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        gucciWrapper.rotation.y = Math.PI - 0.08; // Front buckle faces viewer with subtle inward gallery angle

        gucciWrapper.add(gucciClone);
        shelfGroup.add(gucciWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user Gucci bag GLB:', err);
      }
    );

    // ── Load 3D Diesel 1DR Shoulder Handbag on Top Glass Shelf (Tier 3, Slot 4) ──
    const fbxLoader = new FBXLoader();
    const textureLoader = new THREE.TextureLoader();

    const dieselBaseColor = textureLoader.load('/models/products/diesel_bag/bag_Material.001_BaseColor.png');
    dieselBaseColor.colorSpace = THREE.SRGBColorSpace;
    const dieselArmPacked = textureLoader.load('/models/products/diesel_bag/diesel_arm_packed.png');
    const dieselNormal = textureLoader.load('/models/products/diesel_bag/bag_Material.001_Normal.png');

    // High-gloss mirror metallic silver chrome PBR material matching authentic Diesel 1DR (Photo 2)
    const dieselPBRMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f8fafc'),
      map: dieselBaseColor,
      roughnessMap: dieselArmPacked,
      metalnessMap: dieselArmPacked,
      normalMap: dieselNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.85, // Multiplied by green channel (~0.13) gives mirror chrome ~0.11
      metalness: 1.0,  // Multiplied by blue channel (~1.0) gives 100% pure metallic silver
      side: THREE.DoubleSide,
      envMapIntensity: 2.8,
    });

    fbxLoader.load(
      '/models/products/diesel_bag/dieselbagfinal.fbx',
      (fbxScene) => {
        fbxScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            child.material = dieselPBRMaterial;
          }
        });

        const topTierY = 0.52;
        const slot4X = 0.95;

        const dieselWrapper = new THREE.Group();
        dieselWrapper.name = 'topTier_product_slot4';
        dieselWrapper.position.set(
          slot4X,
          topTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        // Front chrome D emblem faces viewer, angled subtly inward toward shelf center
        dieselWrapper.rotation.y = -Math.PI / 2 + 0.18;

        const dieselInner = new THREE.Group();
        const dieselModel = fbxScene.clone(true);
        // Correct upright orientation: handle arches gracefully over top, body & D-logo upright at bottom
        dieselModel.rotation.z = Math.PI;

        dieselInner.add(dieselModel);
        dieselInner.updateMatrixWorld(true);

        const dieselBBox = new THREE.Box3().setFromObject(dieselInner);
        const dieselSize = new THREE.Vector3();
        dieselBBox.getSize(dieselSize);
        const dieselCenter = new THREE.Vector3();
        dieselBBox.getCenter(dieselCenter);

        // Desired luxury handbag height: ~0.24m (height of bag including arched shoulder handle)
        const dieselTargetHeight = 0.24;
        const dieselScale = dieselTargetHeight / (dieselSize.y || 1);
        dieselInner.scale.setScalar(dieselScale);

        // Center on velvet riser base so bottom sits flush at y = 0
        dieselInner.position.set(
          -dieselCenter.x * dieselScale,
          -dieselBBox.min.y * dieselScale,
          -dieselCenter.z * dieselScale
        );

        dieselWrapper.add(dieselInner);
        shelfGroup.add(dieselWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user Diesel 1DR bag FBX:', err);
      }
    );

    // ══════════════════════════════════════════════════════════════════════════════
    // ── MIDDLE GLASS SHELF (TIER 2, yPos = 0.0): 4 DISTINCT LUXURY HANDBAGS ──
    // ══════════════════════════════════════════════════════════════════════════════
    const midTierY = 0.0;
    const tier2Slot1X = -0.95;
    const tier2Slot2X = -0.32;
    const tier2Slot3X = 0.32;
    const tier2Slot4X = 0.95;

    // ── 1. YSL 5 à 7 Hobo Bag (Tier 2, Slot 1) ──
    gltfLoader.load(
      '/models/products/ysl_bag/ysl_bag.glb',
      (gltf) => {
        const yslScene = gltf.scene;
        yslScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // Gold Cassandre YSL monogram logo and strap hardware
              if (
                child.name === 'Object_10' ||
                child.name === 'Object_12' ||
                (child.material.name && child.material.name.includes('0C_Copper'))
              ) {
                child.material.roughness = 0.16;
                child.material.metalness = 0.96;
                child.material.color = new THREE.Color('#fbbf24');
                child.material.envMapIntensity = 2.6;
              } else {
                // White luxury leather bag body and strap
                child.material.roughness = 0.4;
                child.material.metalness = 0.06;
                child.material.envMapIntensity = 1.4;
              }
            }
          }
        });

        const yslBBox = new THREE.Box3().setFromObject(yslScene);
        const yslSize = new THREE.Vector3();
        yslBBox.getSize(yslSize);
        const yslCenter = new THREE.Vector3();
        yslBBox.getCenter(yslCenter);

        // Desired luxury hobo bag height: ~0.23m
        const yslTargetHeight = 0.23;
        const yslScale = yslTargetHeight / (yslSize.y || 1);

        const yslClone = yslScene.clone(true);
        yslClone.scale.setScalar(yslScale);
        yslClone.position.set(
          -yslCenter.x * yslScale,
          -yslBBox.min.y * yslScale,
          -yslCenter.z * yslScale
        );

        const yslWrapper = new THREE.Group();
        yslWrapper.name = 'midTier_product_slot1';
        yslWrapper.position.set(
          tier2Slot1X,
          midTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        // Gold YSL monogram faces shopper with elegant inward boutique angle
        yslWrapper.rotation.y = -Math.PI / 2 + 0.28;

        yslWrapper.add(yslClone);
        shelfGroup.add(yslWrapper);
      },
      undefined,
      (err) => console.warn('Could not load YSL Hobo bag GLB:', err)
    );

    // ── 2. Chanel Bag Low Madera (Tier 2, Slot 2) ──
    gltfLoader.load(
      '/models/products/chanel_madera/chanel_madera.glb',
      (gltf) => {
        const maderaScene = gltf.scene;
        maderaScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // Golden metal hardware & CC chain
              if (
                child.name === 'Mesh_0_1' ||
                (child.material.name && child.material.name.includes('Material.003'))
              ) {
                child.material.roughness = 0.18;
                child.material.metalness = 0.94;
                child.material.color = new THREE.Color('#f59e0b');
                child.material.envMapIntensity = 2.4;
              } else if (child.name.startsWith('path')) {
                // Chanel embossed lettering
                child.material.roughness = 0.25;
                child.material.metalness = 0.4;
                child.material.color = new THREE.Color('#ffffff');
              } else {
                child.material.roughness = 0.48;
                child.material.metalness = 0.05;
                child.material.envMapIntensity = 1.3;
              }
            }
          }
        });

        const maderaBBox = new THREE.Box3().setFromObject(maderaScene);
        const maderaSize = new THREE.Vector3();
        maderaBBox.getSize(maderaSize);
        const maderaCenter = new THREE.Vector3();
        maderaBBox.getCenter(maderaCenter);

        // Desired luxury bag height: ~0.21m
        const maderaTargetHeight = 0.21;
        const maderaScale = maderaTargetHeight / (maderaSize.y || 1);

        const maderaClone = maderaScene.clone(true);
        maderaClone.scale.setScalar(maderaScale);
        maderaClone.position.set(
          -maderaCenter.x * maderaScale,
          -maderaBBox.min.y * maderaScale,
          -maderaCenter.z * maderaScale
        );

        const maderaWrapper = new THREE.Group();
        maderaWrapper.name = 'midTier_product_slot2';
        maderaWrapper.position.set(
          tier2Slot2X,
          midTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        maderaWrapper.rotation.y = 0.08; // Subtle inward gallery angle

        maderaWrapper.add(maderaClone);
        shelfGroup.add(maderaWrapper);
      },
      undefined,
      (err) => console.warn('Could not load Chanel Madera bag GLB:', err)
    );

    // ── 3. Chanel Leather Bag For Women (Tier 2, Slot 3) ──
    gltfLoader.load(
      '/models/products/chanel_leather/chanel_leather_bag.glb',
      (gltf) => {
        const chanelScene = gltf.scene;
        chanelScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // Quilted caviar leather finish & gold CC clasp
              if (child.name === 'Object_3') {
                // Gold CC clasp lock hardware
                child.material.roughness = 0.2;
                child.material.metalness = 0.92;
                child.material.envMapIntensity = 2.4;
              } else {
                // Quilted black/dark leather
                child.material.roughness = 0.38;
                child.material.metalness = 0.12;
                child.material.envMapIntensity = 1.5;
              }
            }
          }
        });

        const chanelBBox = new THREE.Box3().setFromObject(chanelScene);
        const chanelSize = new THREE.Vector3();
        chanelBBox.getSize(chanelSize);
        const chanelCenter = new THREE.Vector3();
        chanelBBox.getCenter(chanelCenter);

        // Desired luxury flap bag height: ~0.22m
        const chanelTargetHeight = 0.22;
        const chanelScale = chanelTargetHeight / (chanelSize.y || 1);

        const chanelClone = chanelScene.clone(true);
        chanelClone.scale.setScalar(chanelScale);
        chanelClone.position.set(
          -chanelCenter.x * chanelScale,
          -chanelBBox.min.y * chanelScale,
          -chanelCenter.z * chanelScale
        );

        const chanelWrapper = new THREE.Group();
        chanelWrapper.name = 'midTier_product_slot3';
        chanelWrapper.position.set(
          tier2Slot3X,
          midTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        chanelWrapper.rotation.y = -0.08; // Subtle inward gallery angle

        chanelWrapper.add(chanelClone);
        shelfGroup.add(chanelWrapper);
      },
      undefined,
      (err) => console.warn('Could not load Chanel Leather bag GLB:', err)
    );

    // ── 4. Womens Structured Tote Bag (Tier 2, Slot 4) ──
    gltfLoader.load(
      '/models/products/womens_bag/womens_bag.glb',
      (gltf) => {
        const womensScene = gltf.scene;
        womensScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              child.material.roughness = 0.42;
              child.material.metalness = 0.1;
              child.material.envMapIntensity = 1.4;
            }
          }
        });

        const womensBBox = new THREE.Box3().setFromObject(womensScene);
        const womensSize = new THREE.Vector3();
        womensBBox.getSize(womensSize);
        const womensCenter = new THREE.Vector3();
        womensBBox.getCenter(womensCenter);

        // Desired luxury tote bag height: ~0.23m
        const womensTargetHeight = 0.23;
        const womensScale = womensTargetHeight / (womensSize.y || 1);

        const womensClone = womensScene.clone(true);
        womensClone.scale.setScalar(womensScale);
        womensClone.position.set(
          -womensCenter.x * womensScale,
          -womensBBox.min.y * womensScale,
          -womensCenter.z * womensScale
        );

        const womensWrapper = new THREE.Group();
        womensWrapper.name = 'midTier_product_slot4';
        womensWrapper.position.set(
          tier2Slot4X,
          midTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        womensWrapper.rotation.y = -0.25; // Inward angle facing shopper

        womensWrapper.add(womensClone);
        shelfGroup.add(womensWrapper);
      },
      undefined,
      (err) => console.warn('Could not load Womens Bag GLB:', err)
    );

    // ══════════════════════════════════════════════════════════════════════════════
    // ── BOTTOM GLASS SHELF (TIER 1 / KỆ 3, yPos = -0.52): 4 DESIGNER SUNGLASSES ──
    // ══════════════════════════════════════════════════════════════════════════════
    const bottomTierY = -0.52;
    const tier1Slot1X = -0.95;
    const tier1Slot2X = -0.32;
    const tier1Slot3X = 0.32;
    const tier1Slot4X = 0.95;

    // Eyewear acrylic pedestal material (minimalist gallery stand for sunglasses)
    const acrylicStandMat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transmission: 0.92,
      opacity: 0.85,
      transparent: true,
      roughness: 0.08,
      ior: 1.48,
      envMapIntensity: 2.2,
    });

    const createEyewearStand = () => {
      const standGroup = new THREE.Group();
      // Angled clear crystal riser block
      const standBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.018, 0.14),
        acrylicStandMat
      );
      standBase.position.y = 0.009;
      standBase.receiveShadow = true;
      standGroup.add(standBase);

      // Slender chrome resting pegs
      [-0.045, 0.045].forEach((px) => {
        const peg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.003, 0.003, 0.018, 12),
          chromeMat
        );
        peg.position.set(px, 0.024, 0.035);
        standGroup.add(peg);
      });
      return standGroup;
    };

    // ── 1. Oakley 24K Double X XX Juliet Sunglasses (Tier 1, Slot 1) ──
    gltfLoader.load(
      '/models/products/glasses/oakley_juliet.glb',
      (gltf) => {
        const oakleyScene = gltf.scene;
        oakleyScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // Signature 24K Gold titanium frame & mirror flash lenses
              if (child.name === 'Retopo_Cylinder003' || (child.material.name && child.material.name.includes('Material.006'))) {
                // Polarized gold mirror lens
                child.material.roughness = 0.05;
                child.material.metalness = 0.98;
                child.material.color = new THREE.Color('#fbbf24');
                child.material.envMapIntensity = 3.0;
              } else if (child.material.name && (child.material.name.includes('Material.001') || child.material.name.includes('Material.002') || child.material.name.includes('Material.004'))) {
                // Polished 24K gold frame
                child.material.roughness = 0.15;
                child.material.metalness = 0.95;
                child.material.color = new THREE.Color('#eab308');
                child.material.envMapIntensity = 2.6;
              } else if (child.material.name && (child.material.name.includes('Material.003') || child.material.name.includes('Material.005'))) {
                // Matte rubber ear socks
                child.material.roughness = 0.85;
                child.material.metalness = 0.02;
              }
            }
          }
        });

        const oakleyWrapper = new THREE.Group();
        oakleyWrapper.name = 'bottomTier_product_slot1';
        oakleyWrapper.position.set(
          tier1Slot1X,
          bottomTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        oakleyWrapper.rotation.y = 0.22; // Inward angle facing shopper
        oakleyWrapper.add(createEyewearStand());

        const oakleyInner = new THREE.Group();
        const oakleyModel = oakleyScene.clone(true);
        oakleyModel.rotation.x = -0.16; // Subtle upward tilt to showcase lenses
        oakleyInner.add(oakleyModel);
        oakleyInner.updateMatrixWorld(true);

        const oakleyBBox = new THREE.Box3().setFromObject(oakleyInner);
        const oakleySize = new THREE.Vector3();
        oakleyBBox.getSize(oakleySize);
        const oakleyCenter = new THREE.Vector3();
        oakleyBBox.getCenter(oakleyCenter);

        const oakleyTargetWidth = 0.20;
        const oakleyScale = oakleyTargetWidth / (oakleySize.x || 1);
        oakleyInner.scale.setScalar(oakleyScale);
        oakleyInner.position.set(
          -oakleyCenter.x * oakleyScale,
          -oakleyBBox.min.y * oakleyScale + 0.022,
          -oakleyCenter.z * oakleyScale
        );

        oakleyWrapper.add(oakleyInner);
        shelfGroup.add(oakleyWrapper);
      },
      undefined,
      (err) => console.warn('Could not load Oakley Juliet glasses GLB:', err)
    );

    // ── 2. Prada Vintage Star Glasses (Tier 1, Slot 2) ──
    gltfLoader.load(
      '/models/products/glasses/prada_star.glb',
      (gltf) => {
        const pradaScene = gltf.scene;
        pradaScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // Chrome star temples & tinted gradient lenses
              if (child.name === 'Object_5' || child.name === 'Object_6' || child.name === 'Object_7') {
                child.material.roughness = 0.12;
                child.material.metalness = 0.96;
                child.material.color = new THREE.Color('#e2e8f0');
                child.material.envMapIntensity = 2.8;
              } else if (child.name === 'Object_4') {
                child.material.roughness = 0.08;
                child.material.metalness = 0.1;
                child.material.opacity = 0.85;
                child.material.transparent = true;
                child.material.envMapIntensity = 1.8;
              }
            }
          }
        });

        const pradaWrapper = new THREE.Group();
        pradaWrapper.name = 'bottomTier_product_slot2';
        pradaWrapper.position.set(
          tier1Slot2X,
          bottomTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        pradaWrapper.rotation.y = 0.08; // Subtle inward angle
        pradaWrapper.add(createEyewearStand());

        const pradaInner = new THREE.Group();
        const pradaModel = pradaScene.clone(true);
        pradaModel.rotation.x = -0.16;
        pradaInner.add(pradaModel);
        pradaInner.updateMatrixWorld(true);

        const pradaBBox = new THREE.Box3().setFromObject(pradaInner);
        const pradaSize = new THREE.Vector3();
        pradaBBox.getSize(pradaSize);
        const pradaCenter = new THREE.Vector3();
        pradaBBox.getCenter(pradaCenter);

        const pradaTargetWidth = 0.20;
        const pradaScale = pradaTargetWidth / (pradaSize.x || 1);
        pradaInner.scale.setScalar(pradaScale);
        pradaInner.position.set(
          -pradaCenter.x * pradaScale,
          -pradaBBox.min.y * pradaScale + 0.022,
          -pradaCenter.z * pradaScale
        );

        pradaWrapper.add(pradaInner);
        shelfGroup.add(pradaWrapper);
      },
      undefined,
      (err) => console.warn('Could not load Prada Star glasses GLB:', err)
    );

    // ── 3. Pervert Glasses 3 (Tier 1, Slot 3) ──
    gltfLoader.load(
      '/models/products/glasses/pervert_glasses.glb',
      (gltf) => {
        const pervertScene = gltf.scene;
        pervertScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              // Gold metal accents & glossy acetate frame
              if (child.material.name && (child.material.name.includes('Gold') || child.material.name.includes('logoBacking') || child.material.name.includes('StandardMetal'))) {
                child.material.roughness = 0.16;
                child.material.metalness = 0.94;
                child.material.color = new THREE.Color('#f59e0b');
                child.material.envMapIntensity = 2.4;
              } else if (child.material.name && child.material.name.includes('Glass_Lenses')) {
                child.material.roughness = 0.06;
                child.material.metalness = 0.15;
                child.material.opacity = 0.88;
                child.material.transparent = true;
                child.material.envMapIntensity = 2.0;
              } else if (child.material.name && child.material.name.includes('Frame_ShinyBlack')) {
                child.material.roughness = 0.12;
                child.material.metalness = 0.08;
                child.material.envMapIntensity = 1.6;
              }
            }
          }
        });

        const pervertWrapper = new THREE.Group();
        pervertWrapper.name = 'bottomTier_product_slot3';
        pervertWrapper.position.set(
          tier1Slot3X,
          bottomTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        pervertWrapper.rotation.y = -0.08; // Subtle inward angle
        pervertWrapper.add(createEyewearStand());

        const pervertInner = new THREE.Group();
        const pervertModel = pervertScene.clone(true);
        pervertModel.rotation.x = -0.16;
        pervertInner.add(pervertModel);
        pervertInner.updateMatrixWorld(true);

        const pervertBBox = new THREE.Box3().setFromObject(pervertInner);
        const pervertSize = new THREE.Vector3();
        pervertBBox.getSize(pervertSize);
        const pervertCenter = new THREE.Vector3();
        pervertBBox.getCenter(pervertCenter);

        const pervertTargetWidth = 0.20;
        const pervertScale = pervertTargetWidth / (pervertSize.x || 1);
        pervertInner.scale.setScalar(pervertScale);
        pervertInner.position.set(
          -pervertCenter.x * pervertScale,
          -pervertBBox.min.y * pervertScale + 0.022,
          -pervertCenter.z * pervertScale
        );

        pervertWrapper.add(pervertInner);
        shelfGroup.add(pervertWrapper);
      },
      undefined,
      (err) => console.warn('Could not load Pervert glasses GLB:', err)
    );

    // ── 4. Fuel Glasses Nice Guy Eddie (Tier 1, Slot 4) ──
    gltfLoader.load(
      '/models/products/glasses/fuel_glasses.glb',
      (gltf) => {
        const fuelScene = gltf.scene;
        fuelScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              child.material.roughness = 0.15;
              child.material.metalness = 0.2;
              child.material.envMapIntensity = 2.0;
            }
          }
        });

        const fuelWrapper = new THREE.Group();
        fuelWrapper.name = 'bottomTier_product_slot4';
        fuelWrapper.position.set(
          tier1Slot4X,
          bottomTierY + shelfThick / 2 + 0.016,
          shelfDepth / 2 + 0.025
        );
        fuelWrapper.rotation.y = -0.22; // Inward angle facing shopper
        fuelWrapper.add(createEyewearStand());

        const fuelInner = new THREE.Group();
        const fuelModel = fuelScene.clone(true);
        fuelModel.rotation.x = -0.16;
        fuelInner.add(fuelModel);
        fuelInner.updateMatrixWorld(true);

        const fuelBBox = new THREE.Box3().setFromObject(fuelInner);
        const fuelSize = new THREE.Vector3();
        fuelBBox.getSize(fuelSize);
        const fuelCenter = new THREE.Vector3();
        fuelBBox.getCenter(fuelCenter);

        const fuelTargetWidth = 0.20;
        const fuelScale = fuelTargetWidth / (fuelSize.x || 1);
        fuelInner.scale.setScalar(fuelScale);
        fuelInner.position.set(
          -fuelCenter.x * fuelScale,
          -fuelBBox.min.y * fuelScale + 0.022,
          -fuelCenter.z * fuelScale
        );

        fuelWrapper.add(fuelInner);
        shelfGroup.add(fuelWrapper);
      },
      undefined,
      (err) => console.warn('Could not load Fuel glasses GLB:', err)
    );

    // 3. Dedicated Gallery Lighting for the 3.0m Wide Shelf Unit
    // Dual overhead focused spotlights evenly illuminating the 4 display slots across the 3.0m span
    [-0.60, 0.60].forEach((spX) => {
      const shelfSpotlight = new THREE.SpotLight(
        '#ffffff',
        4.0,
        8.0,
        Math.PI / 3.2,
        0.35
      );
      shelfSpotlight.position.set(spX, 1.8, 0.95);
      shelfSpotlight.target.position.set(spX, 0.2, 0.25);
      shelfGroup.add(shelfSpotlight);
      shelfGroup.add(shelfSpotlight.target);
    });

    // Warm rose/pink ambient fill light for Parisian haute couture display mood
    const shelfGlow = new THREE.PointLight('#f472b6', 2.4, 4.8);
    shelfGlow.position.set(0, 0.1, 0.55);
    shelfGroup.add(shelfGlow);

    womenGroup.add(shelfGroup);

    // ── Load Luxury Dior SS24 Paris Runway Window Display on Back Wall ──
    let showcaseMixer = null;
    gltfLoader.load(
      '/models/display/dior_ss24_showcase.glb',
      (gltf) => {
        const ss24Model = gltf.scene;

        ss24Model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;

            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace || 'srgb';
                child.material.map.needsUpdate = true;
              }

              const matName = (child.material.name || '').toLowerCase();
              const meshName = (child.name || '').toLowerCase();

              // 1. Parisian architectural map backdrop (material / dioodododo_1)
              if (matName === 'material' || matName.includes('dioodododo')) {
                child.material.roughness = 0.35;
                child.material.metalness = 0.05;
                child.material.envMapIntensity = 1.2;
                child.renderOrder = 0;
              }
              // 2. Parisian map runway floor platform (Material.002 / Image_22)
              else if (matName.includes('material.002')) {
                child.material.transparent = false;
                child.material.opacity = 1.0;
                child.material.roughness = 0.28;
                child.material.metalness = 0.15;
                child.material.envMapIntensity = 1.4;
                child.renderOrder = 1;
              }
              // 3. 3D Dior Letters on Platform (acad4bff11a2 / path2495..path2503)
              else if (
                matName.includes('acad4bff11a2') ||
                meshName.includes('object_118') ||
                meshName.includes('object_121') ||
                meshName.includes('object_124') ||
                meshName.includes('object_127') ||
                meshName.includes('path24') ||
                meshName.includes('path25')
              ) {
                child.material.transparent = false;
                child.material.opacity = 1.0;
                child.material.color = new THREE.Color('#141416');
                child.material.roughness = 0.18;
                child.material.metalness = 0.9;
                child.material.envMapIntensity = 2.4;
                child.renderOrder = 2;
              }
              // 4. Industrial Metal Frame, Ladder & Structure (Material.008)
              else if (matName.includes('material.008')) {
                child.material.color = new THREE.Color('#27272a');
                child.material.roughness = 0.3;
                child.material.metalness = 0.8;
                child.material.envMapIntensity = 1.6;
                child.renderOrder = 0;
              }
              // 5. Luxury Handbag (Material_11, Material_12, Material_10, Material_9 / Stitches, Pattern, Metal, Leather, Fabric)
              else if (
                matName.includes('material_11') ||
                matName.includes('material_12') ||
                matName.includes('material_10') ||
                matName.includes('material_9') ||
                meshName.includes('stitches') ||
                meshName.includes('pattern') ||
                meshName.includes('leather') ||
                meshName.includes('fabric')
              ) {
                child.material.roughness = 0.35;
                child.material.metalness = 0.1;
                child.material.envMapIntensity = 1.8;
                child.renderOrder = 1;
              }
              // 6. Luxury Footwear & Slides (KCQ209KPYS15W_MAT, Strap_MAT, Suola, backup_Esterno)
              else if (
                matName.includes('kcq209') ||
                matName.includes('strap') ||
                matName.includes('suola') ||
                matName.includes('backup')
              ) {
                child.material.roughness = 0.4;
                child.material.metalness = 0.1;
                child.material.envMapIntensity = 1.5;
                child.renderOrder = 1;
              }
              // 7. General meshes
              else {
                if (child.material.transparent && child.material.opacity > 0.9) {
                  child.material.transparent = false;
                }
                child.renderOrder = 0;
              }
            }
          }
        });

        // Compute exact bounding box and dimensions
        ss24Model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(ss24Model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        console.log('✅ Dior SS24 Paris Showcase loaded successfully:', {
          size: { x: size.x.toFixed(3), y: size.y.toFixed(3), z: size.z.toFixed(3) },
          boxMin: { x: box.min.x.toFixed(3), y: box.min.y.toFixed(3), z: box.min.z.toFixed(3) },
          boxMax: { x: box.max.x.toFixed(3), y: box.max.y.toFixed(3), z: box.max.z.toFixed(3) },
        });

        const windowWrapper = new THREE.Group();
        windowWrapper.name = 'diorSs24ShowcaseWrapper';

        // Center on X, align bottom to Y = 0, align back of backdrop to Z = 0
        ss24Model.position.set(-center.x, -box.min.y, -box.min.z);
        windowWrapper.add(ss24Model);

        // Scale:
        // Width: Left edge aligns perfectly flush with left steel pillar without overhanging (x = 2.95), right edge touches angled right wall (x ~ 6.81)
        // Total width = 3.86m (calibrated to be completely flush with zero gap and zero excess overhang)
        const targetWidth = 3.86;
        const scaleX = targetWidth / (size.x || 1); // ~2.23
        const scaleY = scaleX; // Proportional majestic height: ~4.08m tall (clears the neon sign cleanly)

        // Depth: Shifted forward to clear black pillar (back at z = -3.78) and front extending forward to z = -0.38
        const targetDepth = 3.40;
        const scaleZ = targetDepth / (size.z || 1); // ~1.16
        windowWrapper.scale.set(scaleX, scaleY, scaleZ);

        // Position:
        // Centered between left pillar edge (x = 2.95) and right wall (x = 6.81) -> x = 4.88
        // Shifted inward by 6cm from previous x=4.82 so it sits 100% flush without being "hơi thừa"
        const showcasePos = { x: 4.88, y: 0.04, z: -3.78 };
        windowWrapper.position.set(showcasePos.x, showcasePos.y, showcasePos.z);
        windowWrapper.rotation.y = 0; // Straight and flat on the back wall

        // Architectural foundation plinth at the base extending with the platform
        const plinthWidth = targetWidth + 0.08; // 3.94m
        const plinthDepth = targetDepth + 0.08; // 3.48m
        const foundationPlinth = new THREE.Mesh(
          new THREE.BoxGeometry(plinthWidth, 0.05, plinthDepth),
          new THREE.MeshStandardMaterial({
            color: '#111018',
            roughness: 0.4,
            metalness: 0.75,
          })
        );
        foundationPlinth.position.set(showcasePos.x, 0.025, showcasePos.z + plinthDepth / 2);
        foundationPlinth.receiveShadow = true;
        womenGroup.add(foundationPlinth);

        // Subtle glowing pink/gold neon strip along the front bottom edge of the platform
        const baseNeonStrip = new THREE.Mesh(
          new THREE.BoxGeometry(plinthWidth + 0.02, 0.018, 0.03),
          new THREE.MeshBasicMaterial({ color: '#f472b6' })
        );
        baseNeonStrip.position.set(0, 0.025, plinthDepth / 2);
        foundationPlinth.add(baseNeonStrip);

        // Dedicated Atmospheric Lighting:
        // 1. High Editorial Spotlight on the Dior Paris Map Backdrop & Runway Accessories
        const backdropSpotlight = new THREE.SpotLight('#ffffff', 3.4, 8.5, Math.PI / 3.4, 0.35);
        backdropSpotlight.position.set(showcasePos.x, 4.6, -2.2);
        backdropSpotlight.target.position.set(showcasePos.x, 2.0, showcasePos.z);
        womenGroup.add(backdropSpotlight);
        womenGroup.add(backdropSpotlight.target);

        // 2. Focused Spotlight on the 3D Dior Letters and Platform Runway Floor
        const lettersSpotlight = new THREE.SpotLight('#fffbeb', 2.8, 6.5, Math.PI / 3.2, 0.4);
        lettersSpotlight.position.set(showcasePos.x, 3.8, -0.2);
        lettersSpotlight.target.position.set(showcasePos.x, 0.3, -1.5);
        womenGroup.add(lettersSpotlight);
        womenGroup.add(lettersSpotlight.target);

        // 3. Warm Ambient Fill for Parisian haute couture mood
        const ambientFill = new THREE.PointLight('#fbcfe8', 1.2, 4.5);
        ambientFill.position.set(showcasePos.x, 2.2, -1.8);
        womenGroup.add(ambientFill);

        // Animation mixer for conveyor belts
        if (gltf.animations && gltf.animations.length > 0) {
          showcaseMixer = new THREE.AnimationMixer(ss24Model);
          gltf.animations.forEach((clip) => {
            const action = showcaseMixer.clipAction(clip);
            action.setEffectiveTimeScale(0.4); // Elegant, slow luxury speed
            action.play();
          });
        }

        womenGroup.add(windowWrapper);
      },
      (xhr) => {
        if (xhr.total > 0) {
          console.log(`SS24 GLB: ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
        }
      },
      (err) => {
        console.warn('Could not load Dior SS24 Paris Showcase GLB:', err);
      }
    );

    // ── Load User's AI-Generated 3D Female Mannequin Model (Mirrored on Right Side) ──
    gltfLoader.load(
      '/models/mannequin/mannequin_female.glb',
      (gltf) => {
        const femaleModel = gltf.scene;

        femaleModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace || 'srgb';
                child.material.map.needsUpdate = true;
              }

              // PBR map auto-multiplication:
              // Metallic-Roughness texture: Blue channel = 1.0 on gold, 0.0 on white. Green channel = ~0.05 on gold, ~0.05 on white.
              child.material.metalness = 1.0;
              child.material.roughness = 0.85;
              child.material.envMapIntensity = 2.6; // Reflects neutral studio environment
              child.material.emissive.set('#000000');
              child.material.needsUpdate = true;
            }
          }
        });

        // Compute exact bounding box
        femaleModel.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(femaleModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        console.log('✅ AI 3D Female Mannequin loaded successfully:', {
          size: { x: size.x.toFixed(3), y: size.y.toFixed(3), z: size.z.toFixed(3) },
          center: { x: center.x.toFixed(3), y: center.y.toFixed(3), z: center.z.toFixed(3) },
        });

        // 1. Female mannequin wrapper group
        const femaleWrapper = new THREE.Group();
        femaleWrapper.name = 'userFemaleMannequinWrapper';

        // Center on X and Z, align bottom to Y = 0
        femaleModel.position.set(-center.x, -box.min.y, -center.z);
        femaleWrapper.add(femaleModel);

        // Scale to towering, imposing statuary flex mannequin height (~2.65m)
        const targetHeight = 2.65;
        const scaleVal = targetHeight / (size.y || 1);
        femaleWrapper.scale.setScalar(scaleVal);

        // Position in the right foreground (balanced symmetrically, moved forward and spread to right)
        const flexPosFemale = { x: 5.2, y: 0.05, z: 1.7 };
        femaleWrapper.position.set(flexPosFemale.x, flexPosFemale.y, flexPosFemale.z);
        femaleWrapper.rotation.y = -0.58; // Mirrored inward angle toward center styling table

        // 2. Clean, Minimalist Gallery Podium (Sleek dark titanium with chrome trim)
        const podiumGroupFemale = new THREE.Group();
        podiumGroupFemale.position.set(flexPosFemale.x, 0, flexPosFemale.z);

        const podiumBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.58, 0.64, 0.05, 32),
          new THREE.MeshStandardMaterial({
            color: '#14121d',
            roughness: 0.4,
            metalness: 0.7,
          })
        );
        podiumBase.position.y = 0.025;
        podiumBase.receiveShadow = true;
        podiumGroupFemale.add(podiumBase);

        // Top chrome beveled rim
        const chromeRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.58, 0.014, 12, 32),
          chromeMat
        );
        chromeRim.rotation.x = Math.PI / 2;
        chromeRim.position.y = 0.05;
        podiumGroupFemale.add(chromeRim);

        // Luminous Neon LED Underglow Ring around base (Luxury Neon Pink for Women's)
        const baseNeonRingFemale = new THREE.Mesh(
          new THREE.TorusGeometry(0.642, 0.016, 12, 48),
          new THREE.MeshBasicMaterial({ color: '#f472b6' })
        );
        baseNeonRingFemale.rotation.x = Math.PI / 2;
        baseNeonRingFemale.position.y = 0.012;
        podiumGroupFemale.add(baseNeonRingFemale);

        // Floor glow pool beneath the podium
        const baseGlowLightFemale = new THREE.PointLight('#f472b6', 3.2, 3.2);
        baseGlowLightFemale.position.set(0, 0.03, 0);
        podiumGroupFemale.add(baseGlowLightFemale);

        womenGroup.add(podiumGroupFemale);

        // 3. Studio High-Contrast Lighting Rig (Mirrored Key, Fill, and Rim)
        const keyLightFemale = new THREE.SpotLight(0xffffff, 7.5, 18, Math.PI / 4, 0.35);
        keyLightFemale.position.set(3.6, 5.0, 3.4);
        keyLightFemale.target.position.set(flexPosFemale.x, 1.5, flexPosFemale.z);
        keyLightFemale.castShadow = false;
        womenGroup.add(keyLightFemale);
        womenGroup.add(keyLightFemale.target);

        const fillLightFemale = new THREE.PointLight(0xf1f5f9, 2.8, 9);
        fillLightFemale.position.set(6.6, 3.0, 2.8);
        womenGroup.add(fillLightFemale);

        const rimLightFemale = new THREE.PointLight(0xe2e8f0, 3.2, 8);
        rimLightFemale.position.set(6.0, 3.6, 0.2);
        womenGroup.add(rimLightFemale);

        // Add the flex AI female mannequin into the scene while keeping the main women's display mannequin
        womenGroup.add(femaleWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user female mannequin GLB:', err);
      }
    );

    // ── Load User's MetaRetail Runway Mannequin (Positioned between Mix & Match and Dior Showcase) ──
    gltfLoader.load(
      '/models/mannequin/mannequin_metaretail.glb',
      (gltf) => {
        const metaModel = gltf.scene;

        metaModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              child.material.roughness = 0.42;
              child.material.metalness = 0.15;
              child.material.envMapIntensity = 1.6;
            }
          }
        });

        metaModel.updateMatrixWorld(true);
        const metaBox = new THREE.Box3().setFromObject(metaModel);
        const metaSize = new THREE.Vector3();
        metaBox.getSize(metaSize);
        const metaCenter = new THREE.Vector3();
        metaBox.getCenter(metaCenter);

        const metaWrapper = new THREE.Group();
        metaWrapper.name = 'metaRetailMannequinWrapper';

        // Center on X and Z, align bottom to Y = 0
        metaModel.position.set(-metaCenter.x, -metaBox.min.y, -metaCenter.z);
        metaWrapper.add(metaModel);

        // Scale to lifelike haute couture runway model height (~2.35m)
        const targetHeight = 2.35;
        const scaleVal = targetHeight / (metaSize.y || 1);
        metaWrapper.scale.setScalar(scaleVal);

        // Positioned shifted slightly to the right with clean clearance from Mix & Match platform corner
        const metaPos = { x: 2.70, y: 0.04, z: 0.22 };
        metaWrapper.position.set(metaPos.x, metaPos.y, metaPos.z);
        // Face straight forward towards the camera
        metaWrapper.rotation.y = -Math.PI / 2;

        // Gallery Podium with polished chrome trim and Neon Purple underglow (matching Mix & Match color theme)
        const podiumGroupMeta = new THREE.Group();
        podiumGroupMeta.position.set(metaPos.x, 0, metaPos.z);

        const podiumBaseMeta = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.42, 0.04, 32),
          new THREE.MeshStandardMaterial({
            color: '#14121d',
            roughness: 0.4,
            metalness: 0.7,
          })
        );
        podiumBaseMeta.position.y = 0.02;
        podiumBaseMeta.receiveShadow = true;
        podiumGroupMeta.add(podiumBaseMeta);

        const chromeRimMeta = new THREE.Mesh(
          new THREE.TorusGeometry(0.38, 0.012, 12, 32),
          chromeMat
        );
        chromeRimMeta.rotation.x = Math.PI / 2;
        chromeRimMeta.position.y = 0.04;
        podiumGroupMeta.add(chromeRimMeta);

        // Neon Purple Underglow Ring (#c084fc)
        const baseNeonRingMeta = new THREE.Mesh(
          new THREE.TorusGeometry(0.422, 0.014, 12, 48),
          new THREE.MeshBasicMaterial({ color: '#c084fc' })
        );
        baseNeonRingMeta.rotation.x = Math.PI / 2;
        baseNeonRingMeta.position.y = 0.01;
        podiumGroupMeta.add(baseNeonRingMeta);

        // Floor glow pool beneath podium
        const baseGlowLightMeta = new THREE.PointLight('#c084fc', 2.8, 2.8);
        baseGlowLightMeta.position.set(0, 0.025, 0);
        podiumGroupMeta.add(baseGlowLightMeta);

        scene.add(podiumGroupMeta);

        // Dedicated Focused Overhead Spotlight for this runway mannequin
        const spotLightMeta = new THREE.SpotLight(0xffffff, 4.2, 12, Math.PI / 4, 0.35);
        spotLightMeta.position.set(metaPos.x - 0.3, 5.2, metaPos.z + 1.2);
        spotLightMeta.target.position.set(metaPos.x, 1.3, metaPos.z);
        spotLightMeta.castShadow = false;
        scene.add(spotLightMeta);
        scene.add(spotLightMeta.target);

        scene.add(metaWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user metaretail mannequin GLB:', err);
      }
    );

    // ── Load User's MetaRetail Runway Mannequin (Men - Symmetrically Positioned opposite to Women's MetaRetail) ──
    gltfLoader.load(
      '/models/mannequin/mannequin_metaretail_men.glb',
      (gltf) => {
        const metaMenModel = gltf.scene;

        metaMenModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
              child.material.side = THREE.DoubleSide;
              if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.map.needsUpdate = true;
              }
              child.material.roughness = 0.42;
              child.material.metalness = 0.15;
              child.material.envMapIntensity = 1.6;
            }
          }
        });

        metaMenModel.updateMatrixWorld(true);
        const metaMenBox = new THREE.Box3().setFromObject(metaMenModel);
        const metaMenSize = new THREE.Vector3();
        metaMenBox.getSize(metaMenSize);
        const metaMenCenter = new THREE.Vector3();
        metaMenBox.getCenter(metaMenCenter);

        const metaMenWrapper = new THREE.Group();
        metaMenWrapper.name = 'metaRetailMannequinMenWrapper';

        // Center on X and Z, align bottom to Y = 0
        metaMenModel.position.set(-metaMenCenter.x, -metaMenBox.min.y, -metaMenCenter.z);
        metaMenWrapper.add(metaMenModel);

        // Scale to lifelike haute couture runway model height (~2.35m)
        const targetHeight = 2.35;
        const scaleVal = targetHeight / (metaMenSize.y || 1);
        metaMenWrapper.scale.setScalar(scaleVal);

        // Positioned symmetrically opposite to the female MetaRetail mannequin
        const metaMenPos = { x: -2.70, y: 0.04, z: 0.22 };
        metaMenWrapper.position.set(metaMenPos.x, metaMenPos.y, metaMenPos.z);
        // Face straight forward towards the camera
        metaMenWrapper.rotation.y = -Math.PI / 2;

        // Gallery Podium with polished chrome trim and Neon Purple underglow (matching runway theme)
        const podiumGroupMetaMen = new THREE.Group();
        podiumGroupMetaMen.position.set(metaMenPos.x, 0, metaMenPos.z);

        const podiumBaseMetaMen = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.42, 0.04, 32),
          new THREE.MeshStandardMaterial({
            color: '#14121d',
            roughness: 0.4,
            metalness: 0.7,
          })
        );
        podiumBaseMetaMen.position.y = 0.02;
        podiumBaseMetaMen.receiveShadow = true;
        podiumGroupMetaMen.add(podiumBaseMetaMen);

        const chromeRimMetaMen = new THREE.Mesh(
          new THREE.TorusGeometry(0.38, 0.012, 12, 32),
          chromeMat
        );
        chromeRimMetaMen.rotation.x = Math.PI / 2;
        chromeRimMetaMen.position.y = 0.04;
        podiumGroupMetaMen.add(chromeRimMetaMen);

        // Neon Purple Underglow Ring (#c084fc) to form a matching pair flanking the Mix & Match platform
        const baseNeonRingMetaMen = new THREE.Mesh(
          new THREE.TorusGeometry(0.422, 0.014, 12, 48),
          new THREE.MeshBasicMaterial({ color: '#c084fc' })
        );
        baseNeonRingMetaMen.rotation.x = Math.PI / 2;
        baseNeonRingMetaMen.position.y = 0.01;
        podiumGroupMetaMen.add(baseNeonRingMetaMen);

        // Floor glow pool beneath podium
        const baseGlowLightMetaMen = new THREE.PointLight('#c084fc', 2.8, 2.8);
        baseGlowLightMetaMen.position.set(0, 0.025, 0);
        podiumGroupMetaMen.add(baseGlowLightMetaMen);

        scene.add(podiumGroupMetaMen);

        // Dedicated Focused Overhead Spotlight for this runway mannequin
        const spotLightMetaMen = new THREE.SpotLight(0xffffff, 4.2, 12, Math.PI / 4, 0.35);
        spotLightMetaMen.position.set(metaMenPos.x + 0.3, 5.2, metaMenPos.z + 1.2);
        spotLightMetaMen.target.position.set(metaMenPos.x, 1.3, metaMenPos.z);
        spotLightMetaMen.castShadow = false;
        scene.add(spotLightMetaMen);
        scene.add(spotLightMetaMen.target);

        scene.add(metaMenWrapper);
      },
      undefined,
      (err) => {
        console.warn('Could not load user metaretail men mannequin GLB:', err);
      }
    );

    // ── 7. Raycast Hitboxes for Direct 3D Clicking & Hovering ──
    const hitboxMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    const menHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 4.2, 3.2),
      hitboxMat
    );
    menHitbox.position.set(-4.6, 2.1, -1.8);
    menHitbox.userData = { zone: 'men' };
    scene.add(menHitbox);

    const centerHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 3.6, 2.6),
      hitboxMat
    );
    centerHitbox.position.set(0, 1.8, -1.2);
    centerHitbox.userData = { zone: 'center' };
    scene.add(centerHitbox);

    const womenHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 4.2, 3.2),
      hitboxMat
    );
    womenHitbox.position.set(4.6, 2.1, -1.8);
    womenHitbox.userData = { zone: 'women' };
    scene.add(womenHitbox);

    const accessoriesHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.2, 1.2),
      hitboxMat
    );
    // Positioned over the 3-tier luxury handbag shelves on the angled right wall
    accessoriesHitbox.position.set(7.58, 2.15, -0.56);
    accessoriesHitbox.rotation.y = -Math.PI / 2.35;
    accessoriesHitbox.userData = { zone: 'accessories' };
    scene.add(accessoriesHitbox);

    const hitboxes = [menHitbox, centerHitbox, womenHitbox, accessoriesHitbox];

    // ── 8. Boutique Lighting Setup ──
    const ambientLight = new THREE.AmbientLight('#3b2c56', 1.85);
    scene.add(ambientLight);

    // Zone Accent PointLights (boosted when hovered)
    const menLight = new THREE.PointLight('#38bdf8', 5.5, 11);
    menLight.position.set(-4.5, 3.4, -1.2);
    scene.add(menLight);

    const centerLight = new THREE.PointLight('#c084fc', 6.0, 12);
    centerLight.position.set(0, 3.5, -1.0);
    scene.add(centerLight);

    const womenLight = new THREE.PointLight('#f472b6', 5.5, 11);
    womenLight.position.set(4.5, 3.4, -1.2);
    scene.add(womenLight);

    // Warm editorial overhead spotlight on the central styling table
    const centerSpot = new THREE.SpotLight(
      '#f3e8ff',
      7.0,
      14,
      Math.PI / 4,
      0.55,
      1.2
    );
    centerSpot.position.set(0, 5.4, 0.2);
    centerSpot.target.position.set(0, 0.9, -1.1);
    centerSpot.castShadow = true;
    centerSpot.shadow.mapSize.width = 1024;
    centerSpot.shadow.mapSize.height = 1024;
    centerSpot.shadow.camera.near = 1.0;
    centerSpot.shadow.camera.far = 10.0;
    centerSpot.shadow.bias = -0.0006;
    scene.add(centerSpot);
    scene.add(centerSpot.target);

    // ── 9. Pointer & Raycaster Interactions ──
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      animStateRef.current.mouseX = x;
      animStateRef.current.mouseY = y;

      if (animStateRef.current.isTransitioning) {
        renderer.domElement.style.cursor = 'default';
        return;
      }

      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(hitboxes, false);

      if (intersects.length > 0) {
        const hitZone = intersects[0].object.userData.zone;
        renderer.domElement.style.cursor = 'pointer';
        setHoveredZone((prev) => (prev !== hitZone ? hitZone : prev));
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredZone((prev) => (prev !== null ? null : prev));
      }
    };

    const handlePointerClick = (e) => {
      if (animStateRef.current.isTransitioning) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(hitboxes, false);

      if (intersects.length > 0) {
        const hitZone = intersects[0].object.userData.zone;
        triggerZoneSelection(hitZone);
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointermove', handlePointerMove);
    domEl.addEventListener('click', handlePointerClick);

    // ── 10. Resize Handler ──
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ── 11. Render & Animation Loop ──
    let reqId;
    let isVisible = true;
    const tempVec = new THREE.Vector3();

    // IntersectionObserver: Pause heavy WebGL shadow & render calculations when offscreen
    let visibilityObserver;
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isVisible = entry.isIntersecting;
          });
        },
        { threshold: 0.05 }
      );
      visibilityObserver.observe(container);
    }

    let lastFrameTime = performance.now();
    const animate = (now) => {
      reqId = requestAnimationFrame(animate);

      // Skip rendering and GPU load when section is scrolled out of viewport or tab is in background
      if (!isVisible || document.hidden) return;

      const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;
      if (showcaseMixer) showcaseMixer.update(delta);

      const st = animStateRef.current;

      if (st.isAnimatingCamera && st.animStartTime !== null) {
        const elapsed = now - st.animStartTime;
        const progress = Math.min(elapsed / st.animDuration, 1);
        const eased = easeInOutCubic(progress);

        st.currentPos.lerpVectors(st.startPos, st.targetPos, eased);
        st.currentLookAt.lerpVectors(st.startLookAt, st.targetLookAt, eased);

        camera.position.copy(st.currentPos);
        camera.lookAt(st.currentLookAt);

        if (progress >= 1) {
          st.isAnimatingCamera = false;
          if (st.onAnimComplete) {
            const cb = st.onAnimComplete;
            st.onAnimComplete = null;
            cb();
          }
        }
      } else if (!st.isTransitioning) {
        // Subtle editorial mouse parallax in overview mode
        const targetX = CAMERA_PRESETS.overview.pos.x + st.mouseX * 0.45;
        const targetY = CAMERA_PRESETS.overview.pos.y + st.mouseY * 0.22;

        st.currentPos.x += (targetX - st.currentPos.x) * 0.05;
        st.currentPos.y += (targetY - st.currentPos.y) * 0.05;
        st.currentPos.z +=
          (CAMERA_PRESETS.overview.pos.z - st.currentPos.z) * 0.05;

        const lookX = CAMERA_PRESETS.overview.lookAt.x + st.mouseX * 0.35;
        const lookY = CAMERA_PRESETS.overview.lookAt.y + st.mouseY * 0.18;
        st.currentLookAt.x += (lookX - st.currentLookAt.x) * 0.05;
        st.currentLookAt.y += (lookY - st.currentLookAt.y) * 0.05;

        camera.position.copy(st.currentPos);
        camera.lookAt(st.currentLookAt);
      }

      // Dynamic light boost on hovered zone
      const hz = st.hoveredZone;
      menLight.intensity += ((hz === 'men' ? 8.0 : 4.5) - menLight.intensity) * 0.1;
      centerLight.intensity +=
        ((hz === 'center' ? 9.0 : 5.2) - centerLight.intensity) * 0.1;
      womenLight.intensity +=
        ((hz === 'women' ? 8.0 : 4.5) - womenLight.intensity) * 0.1;

      // Project 3D anchor coordinates to 2D screen positions for Hotspot pins
      const width = container.clientWidth;
      const height = container.clientHeight;

      ['men', 'center', 'women', 'accessories'].forEach((key) => {
        const el = hotspotRefs.current[key];
        if (!el) return;
        tempVec.copy(HOTSPOT_ANCHORS[key]);
        tempVec.project(camera);

        const screenX = (tempVec.x * 0.5 + 0.5) * width;
        const screenY = (-(tempVec.y * 0.5) + 0.5) * height;

        el.style.left = `${screenX}px`;
        el.style.top = `${screenY}px`;
      });

      renderer.render(scene, camera);
    };

    reqId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(reqId);
      if (visibilityObserver) visibilityObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      domEl.removeEventListener('pointermove', handlePointerMove);
      domEl.removeEventListener('click', handlePointerClick);
      renderer.dispose();
    };
  }, [triggerZoneSelection]);

  return (
    <section
      className="campaign-virtual-store"
      id="campaign-virtual-store"
      aria-label="AMIRI Interactive 3D Flagship Store"
    >
      {/* Seamless top blend from Campaign Hero */}
      <div className="campaign-virtual-store__top-blend" />

      {/* Three.js WebGL Viewport */}
      <div ref={mountRef} className="campaign-virtual-store__canvas-wrap" />

      {/* Cinematic Vignette */}
      <div className="campaign-virtual-store__vignette" />

      {/* Top Editorial Section Header */}
      <div className="campaign-virtual-store__header">
        <p className="campaign-virtual-store__eyebrow">
          INTERACTIVE 3D FLAGSHIP
        </p>
        <h2 className="campaign-virtual-store__title">
          THE VIRTUAL BOUTIQUE
        </h2>
        <p className="campaign-virtual-store__subtitle">
          Select an area inside the space to explore the collection
        </p>
      </div>

      {/* 3D-Projected Interactive Hotspot Markers */}
      <div className="campaign-virtual-store__hotspots">
        {/* LEFT: MEN'S */}
        <button
          type="button"
          ref={(el) => {
            hotspotRefs.current.men = el;
          }}
          className={`campaign-store-hotspot campaign-store-hotspot--men ${
            hoveredZone === 'men' ? 'is-hovered' : ''
          } ${isTransitioning ? 'is-disabled' : ''}`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('men')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('men')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-hotspot__dot" />
          <span className="campaign-store-hotspot__info">
            <span className="campaign-store-hotspot__label">MEN&apos;S</span>
            <span className="campaign-store-hotspot__action">
              Apparel &amp; Sneakers →
            </span>
          </span>
        </button>

        {/* CENTER: MIX & MATCH */}
        <button
          type="button"
          ref={(el) => {
            hotspotRefs.current.center = el;
          }}
          className={`campaign-store-hotspot campaign-store-hotspot--center ${
            hoveredZone === 'center' ? 'is-hovered' : ''
          } ${isTransitioning ? 'is-disabled' : ''}`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('center')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('center')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-hotspot__dot" />
          <span className="campaign-store-hotspot__info">
            <span className="campaign-store-hotspot__label">MIX &amp; MATCH</span>
            <span className="campaign-store-hotspot__action">
              Styling Table →
            </span>
          </span>
        </button>

        {/* RIGHT: WOMEN'S */}
        <button
          type="button"
          ref={(el) => {
            hotspotRefs.current.women = el;
          }}
          className={`campaign-store-hotspot campaign-store-hotspot--women ${
            hoveredZone === 'women' ? 'is-hovered' : ''
          } ${isTransitioning ? 'is-disabled' : ''}`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('women')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('women')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-hotspot__dot" />
          <span className="campaign-store-hotspot__info">
            <span className="campaign-store-hotspot__label">WOMEN&apos;S</span>
            <span className="campaign-store-hotspot__action">
              Luxury Collection →
            </span>
          </span>
        </button>

        {/* FAR RIGHT: ACCESSORIES (3-TIER HANDBAGS SHELF) */}
        <button
          type="button"
          ref={(el) => {
            hotspotRefs.current.accessories = el;
          }}
          className={`campaign-store-hotspot campaign-store-hotspot--accessories ${
            hoveredZone === 'accessories' ? 'is-hovered' : ''
          } ${isTransitioning ? 'is-disabled' : ''}`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('accessories')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('accessories')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-hotspot__dot" />
          <span className="campaign-store-hotspot__info">
            <span className="campaign-store-hotspot__label">ACCESSORIES</span>
            <span className="campaign-store-hotspot__action">
              Luxury Handbags &amp; Leather →
            </span>
          </span>
        </button>
      </div>

      {/* Bottom Quick-Select Zone Dock */}
      <div
        className={`campaign-virtual-store__dock ${
          isTransitioning ? 'is-disabled' : ''
        }`}
      >
        <button
          type="button"
          className={`campaign-store-dock-btn ${
            hoveredZone === 'men' || activeZone === 'men' ? 'is-active' : ''
          }`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('men')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('men')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-dock-btn__index">01</span>
          <span>MEN&apos;S DISPLAY</span>
        </button>

        <button
          type="button"
          className={`campaign-store-dock-btn ${
            hoveredZone === 'center' || activeZone === 'center'
              ? 'is-active'
              : ''
          }`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('center')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('center')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-dock-btn__index">02</span>
          <span>MIX &amp; MATCH TABLE</span>
        </button>

        <button
          type="button"
          className={`campaign-store-dock-btn ${
            hoveredZone === 'women' || activeZone === 'women' ? 'is-active' : ''
          }`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('women')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('women')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-dock-btn__index">03</span>
          <span>WOMEN&apos;S SHOWCASE</span>
        </button>

        <button
          type="button"
          className={`campaign-store-dock-btn ${
            hoveredZone === 'accessories' || activeZone === 'accessories'
              ? 'is-active'
              : ''
          }`}
          onMouseEnter={() => !isTransitioning && setHoveredZone('accessories')}
          onMouseLeave={() => !isTransitioning && setHoveredZone(null)}
          onClick={() => triggerZoneSelection('accessories')}
          disabled={isTransitioning}
        >
          <span className="campaign-store-dock-btn__index">04</span>
          <span>ACCESSORIES (BAGS)</span>
        </button>
      </div>

      {/* Mix & Match Destination Overlay (Ready for future outfit-styling route) */}
      {showMixModal && (
        <div className="campaign-virtual-store__mix-modal">
          <div className="campaign-virtual-store__mix-card">
            <p className="campaign-virtual-store__mix-tag">
              CENTRAL STYLING TABLE
            </p>
            <h3 className="campaign-virtual-store__mix-heading">
              MIX &amp; MATCH ATELIER
            </h3>
            <p className="campaign-virtual-store__mix-desc">
              Curate signature AMIRI silhouettes by combining statement
              outerwear, distressed denim, and luxury footwear. Interactive
              outfit-styling studio destination is ready for integration.
            </p>
            <div className="campaign-virtual-store__mix-actions">
              <button
                type="button"
                className="campaign-virtual-store__mix-btn campaign-virtual-store__mix-btn--primary"
                onClick={() => {
                  setIsFading(true);
                  setTimeout(() => {
                    if (onNavigateMixAndMatch) {
                      onNavigateMixAndMatch();
                    } else if (onSelectCategory) {
                      onSelectCategory('all');
                    }
                  }, 260);
                }}
              >
                Launch Fit Lab Studio →
              </button>
              <button
                type="button"
                className="campaign-virtual-store__mix-btn campaign-virtual-store__mix-btn--secondary"
                onClick={handleResetToOverview}
              >
                Return to 3D Store
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smooth Fade Transition Overlay */}
      <div
        className={`campaign-virtual-store__fade ${
          isFading ? 'is-active' : ''
        }`}
      />
    </section>
  );
};

export default VirtualStoreSection;
