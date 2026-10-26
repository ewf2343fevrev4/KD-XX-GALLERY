import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import './VirtualStoreSection.css';

// ── Camera presets inside the single 3D boutique scene ──
const CAMERA_PRESETS = {
  overview: {
    pos: new THREE.Vector3(0, 2.55, 7.6),
    lookAt: new THREE.Vector3(0, 1.85, -1.6),
  },
  men: {
    pos: new THREE.Vector3(-3.35, 2.15, 2.25),
    lookAt: new THREE.Vector3(-4.9, 1.95, -1.65),
  },
  center: {
    pos: new THREE.Vector3(0, 2.15, 2.35),
    lookAt: new THREE.Vector3(0, 1.45, -1.1),
  },
  women: {
    pos: new THREE.Vector3(3.35, 2.15, 2.25),
    lookAt: new THREE.Vector3(4.9, 1.95, -1.65),
  },
};

// ── 3D World positions for the projected floating hotspot markers ──
const HOTSPOT_ANCHORS = {
  men: new THREE.Vector3(-4.55, 3.05, -1.3),
  center: new THREE.Vector3(0, 2.55, -0.7),
  women: new THREE.Vector3(4.55, 3.05, -1.3),
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

      if (zoneKey === 'men' || zoneKey === 'women') {
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
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      50
    );
    camera.position.copy(CAMERA_PRESETS.overview.pos);
    camera.lookAt(CAMERA_PRESETS.overview.lookAt);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

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

    // ── 4. LEFT AREA: MEN'S CLOTHING & SNEAKER DISPLAYS ──
    const menGroup = new THREE.Group();
    scene.add(menGroup);

    // Men's Neon Sign on upper left wall
    const menSignTex = createNeonSignTexture({
      title: "MEN'S",
      subtitle: 'STREETWEAR & SNEAKERS',
      primaryColor: '#38bdf8',
      secondaryColor: '#a855f7',
    });
    const menSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 1.08),
      new THREE.MeshBasicMaterial({ map: menSignTex, transparent: true })
    );
    menSign.position.set(-4.85, 4.15, -3.7);
    menSign.rotation.y = 0.18;
    menGroup.add(menSign);

    // Backlit Sneaker Display Unit (4 glowing shelves with 3D sneakers)
    const sneakerUnitBack = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.9, 0.18),
      new THREE.MeshStandardMaterial({
        color: '#100d19',
        roughness: 0.4,
        metalness: 0.6,
      })
    );
    sneakerUnitBack.position.set(-5.75, 1.85, -2.55);
    sneakerUnitBack.rotation.y = 0.35;
    menGroup.add(sneakerUnitBack);

    const sneakerColors = ['#f8fafc', '#38bdf8', '#a855f7', '#1e1b2e'];
    for (let s = 0; s < 4; s++) {
      const shelfY = 0.85 + s * 0.62;
      const shelfGroup = new THREE.Group();
      shelfGroup.position.set(-5.75, shelfY, -2.55);
      shelfGroup.rotation.y = 0.35;

      // Metal shelf
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.05, 0.48),
        chromeMat
      );
      shelf.position.set(0, 0, 0.22);
      shelfGroup.add(shelf);

      // Glowing cyan/purple LED strip under shelf
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 0.025, 0.04),
        s % 2 === 0 ? ledBlueMat : ledPurpleMat
      );
      strip.position.set(0, 0.03, 0.42);
      shelfGroup.add(strip);

      // 3 stylized 3D sneakers per shelf
      for (let k = -1; k <= 1; k++) {
        const shoe = new THREE.Group();
        shoe.position.set(k * 0.72, 0.09, 0.22);
        shoe.rotation.y = -0.25;

        // White/contrast rubber outsole
        const sole = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.05, 0.15),
          new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.3 })
        );
        shoe.add(sole);

        // Sneaker upper body
        const upper = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.11, 0.14),
          new THREE.MeshStandardMaterial({
            color: sneakerColors[(s + k + 1) % sneakerColors.length],
            roughness: 0.4,
            metalness: 0.2,
          })
        );
        upper.position.set(-0.01, 0.07, 0);
        shoe.add(upper);

        // High-top collar
        const collar = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, 0.09, 0.13),
          new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5 })
        );
        collar.position.set(-0.08, 0.14, 0);
        shoe.add(collar);

        shelfGroup.add(shoe);
      }

      menGroup.add(shelfGroup);
    }

    // Men's Industrial Metal Clothing Rack
    const menRackGroup = new THREE.Group();
    menRackGroup.position.set(-3.75, 0, -1.45);
    menRackGroup.rotation.y = 0.22;

    // Rack base & uprights
    const rackBase = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.08, 0.75),
      darkSteelMat
    );
    rackBase.position.y = 0.04;
    menRackGroup.add(rackBase);

    [-1.0, 1.0].forEach((rx) => {
      const upright = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 2.25, 12),
        chromeMat
      );
      upright.position.set(rx, 1.15, 0);
      menRackGroup.add(upright);
    });

    const crossbar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 2.05, 12),
      chromeMat
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 2.25, 0);
    menRackGroup.add(crossbar);

    // Realistic Hanging Men's Clothes (Oversized Hoodies, Varsity, Moto Leather, Denim Jacket)
    const menGarmentsConfig = [
      { type: 'hoodie', color: '#111827', secondary: '#f8fafc', accent: '#38bdf8' },
      { type: 'varsity', color: '#1e1b4b', secondary: '#f8fafc', accent: '#c084fc' },
      { type: 'leather', color: '#0a0a0c', secondary: '#d4d4dc', accent: '#ffffff' },
      { type: 'hoodie', color: '#2e1065', secondary: '#38bdf8', accent: '#a855f7' },
      { type: 'denim', color: '#1e293b', secondary: '#334155', accent: '#f59e0b' },
      { type: 'hoodie', color: '#f8fafc', secondary: '#0f172a', accent: '#38bdf8' },
      { type: 'varsity', color: '#311042', secondary: '#e2e8f0', accent: '#ec4899' },
    ];

    menGarmentsConfig.forEach((cfg, idx) => {
      const gx = -0.78 + idx * 0.26;
      const piece = createDetailedMenGarment({
        type: cfg.type,
        color: cfg.color,
        secondaryColor: cfg.secondary,
        accentColor: cfg.accent,
        chromeMat,
        darkSteelMat,
      });
      piece.position.set(gx, 2.24, 0);
      // Gentle natural rack angle
      piece.rotation.y = 0.08 + (idx % 2 === 0 ? 0.04 : -0.04);
      menRackGroup.add(piece);
    });

    menGroup.add(menRackGroup);

    // Styled Men's Display Mannequin on Chrome Stand
    const menMannequin = createMannequin({
      gender: 'men',
      outfitColor: '#111827',
      accentColor: '#f8fafc',
      chromeMat,
      darkSteelMat,
    });
    menMannequin.position.set(-2.3, 0, -1.05);
    menMannequin.rotation.y = 0.35;
    menGroup.add(menMannequin);

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

    // Women's Neon Sign on upper right wall
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
    womenSign.position.set(4.85, 4.15, -3.7);
    womenSign.rotation.y = -0.18;
    womenGroup.add(womenSign);

    // Women's Sleek Clothing Rack 1 (Foreground right)
    const womenRack1 = new THREE.Group();
    womenRack1.position.set(3.85, 0, -1.45);
    womenRack1.rotation.y = -0.22;

    const wRackBase = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.08, 0.75),
      darkSteelMat
    );
    wRackBase.position.y = 0.04;
    womenRack1.add(wRackBase);

    [-1.0, 1.0].forEach((rx) => {
      const upright = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 2.35, 12),
        chromeMat
      );
      upright.position.set(rx, 1.2, 0);
      womenRack1.add(upright);
    });

    const wCrossbar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 2.05, 12),
      chromeMat
    );
    wCrossbar.rotation.z = Math.PI / 2;
    wCrossbar.position.set(0, 2.35, 0);
    womenRack1.add(wCrossbar);

    // Realistic Hanging Women's Garments (Couture Flared Gown Dresses, Silk Slips, Trench Coats, Blazers)
    const womenGarmentsConfig = [
      { type: 'flared_dress', color: '#f472b6', secondary: '#fbcfe8', accent: '#ffffff' },
      { type: 'slip', color: '#faf5ff', secondary: '#f8fafc', accent: '#c084fc' },
      { type: 'trench_coat', color: '#18181b', secondary: '#3f3f46', accent: '#d4d4dc' },
      { type: 'flared_dress', color: '#be185d', secondary: '#f43f5e', accent: '#ffffff' },
      { type: 'cropped_blazer', color: '#09090b', secondary: '#c084fc', accent: '#d4d4dc' },
      { type: 'slip', color: '#d8b4fe', secondary: '#f3e8ff', accent: '#f472b6' },
      { type: 'flared_dress', color: '#2e1065', secondary: '#7e22ce', accent: '#ffffff' },
    ];

    womenGarmentsConfig.forEach((cfg, idx) => {
      const gx = -0.78 + idx * 0.26;
      const piece = createDetailedWomenGarment({
        type: cfg.type,
        color: cfg.color,
        secondaryColor: cfg.secondary,
        accentColor: cfg.accent,
        chromeMat,
        darkSteelMat,
      });
      piece.position.set(gx, 2.34, 0);
      piece.rotation.y = -0.08 + (idx % 2 === 0 ? -0.04 : 0.04);
      womenRack1.add(piece);
    });
    womenGroup.add(womenRack1);

    // Styled Women's Couture Display Mannequin on Chrome Stand
    const womenMannequin = createMannequin({
      gender: 'women',
      outfitColor: '#09090b',
      accentColor: '#f472b6',
      chromeMat,
      darkSteelMat,
    });
    womenMannequin.position.set(2.35, 0, -1.05);
    womenMannequin.rotation.y = -0.35;
    womenGroup.add(womenMannequin);

    // Women's Backlit Boutique Mirror & Accessory Pedestals on Right Wall
    const mirrorGroup = new THREE.Group();
    mirrorGroup.position.set(5.75, 1.95, -2.55);
    mirrorGroup.rotation.y = -0.35;

    const mirrorNeonRim = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 3.15, 0.06),
      ledPinkMat
    );
    mirrorGroup.add(mirrorNeonRim);

    const mirrorSurface = new THREE.Mesh(
      new THREE.BoxGeometry(1.42, 3.02, 0.09),
      new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.05,
        metalness: 0.96,
      })
    );
    mirrorSurface.position.z = 0.02;
    mirrorGroup.add(mirrorSurface);
    womenGroup.add(mirrorGroup);

    // Two Luxury Handbag Display Plinths
    [
      { x: 4.9, z: -0.65, h: 0.95, bagColor: '#f472b6' },
      { x: 5.45, z: -1.25, h: 1.2, bagColor: '#f8fafc' },
    ].forEach((ped) => {
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, ped.h, 0.46),
        marbleMat
      );
      plinth.position.set(ped.x, ped.h / 2, ped.z);
      plinth.castShadow = true;
      womenGroup.add(plinth);

      // Structured handbag on plinth
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.22, 0.14),
        new THREE.MeshStandardMaterial({
          color: ped.bagColor,
          roughness: 0.3,
          metalness: 0.2,
        })
      );
      bag.position.set(ped.x, ped.h + 0.11, ped.z);
      bag.rotation.y = -0.4;
      womenGroup.add(bag);

      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.065, 0.012, 8, 16, Math.PI),
        chromeMat
      );
      handle.position.set(ped.x, ped.h + 0.22, ped.z);
      handle.rotation.y = -0.4;
      womenGroup.add(handle);
    });

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

    const hitboxes = [menHitbox, centerHitbox, womenHitbox];

    // ── 8. Boutique Lighting Setup ──
    const ambientLight = new THREE.AmbientLight('#2a1f3d', 1.45);
    scene.add(ambientLight);

    // Zone Accent PointLights (boosted when hovered)
    const menLight = new THREE.PointLight('#38bdf8', 4.5, 9);
    menLight.position.set(-4.5, 3.4, -1.2);
    scene.add(menLight);

    const centerLight = new THREE.PointLight('#c084fc', 5.2, 10);
    centerLight.position.set(0, 3.5, -1.0);
    scene.add(centerLight);

    const womenLight = new THREE.PointLight('#f472b6', 4.5, 9);
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

    const animate = (now) => {
      reqId = requestAnimationFrame(animate);

      // Skip rendering and GPU load when section is scrolled out of viewport
      if (!isVisible) return;

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

      ['men', 'center', 'women'].forEach((key) => {
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
              Luxury Dresses &amp; Coats →
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
          <span>WOMEN&apos;S RACKS</span>
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
