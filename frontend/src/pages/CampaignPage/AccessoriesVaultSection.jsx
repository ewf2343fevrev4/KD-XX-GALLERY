import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import './AccessoriesVaultSection.css';

/**
 * AccessoriesVaultSection
 * Immersive 3D interactive luxury accessories display cabinet.
 * Features curated velvet compartments:
 *  - Eyewear (luxury wire & acetate sunglasses)
 *  - Jewelry (Cuban chain, signet rings, cuff bracelet)
 *  - Leather Belts (coiled belts with AMIRI monogram buckles)
 *  - Silk Ties (rolled silk ties with silver tie clip)
 *
 * Physical glass lid pivots open on rear hinges upon interaction,
 * followed by a camera fly-in and smooth fade navigation to /home?category=accessories.
 */
const AccessoriesVaultSection = ({ onNavigateAccessories }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const [isOpening, setIsOpening] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [activeCompartment, setActiveCompartment] = useState(null);
  const [isCanvasHovered, setIsCanvasHovered] = useState(false);

  // References to keep animation state stable
  const animStateRef = useRef({
    isOpening: false,
    startTime: 0,
    mouse: new THREE.Vector2(0, 0),
    targetMouse: new THREE.Vector2(0, 0),
  });

  // Handle trigger sequence
  const handleTriggerUnlock = useCallback(() => {
    if (animStateRef.current.isOpening) return;
    animStateRef.current.isOpening = true;
    animStateRef.current.startTime = performance.now();
    setIsOpening(true);

    // Trigger full screen fade after lid has opened and camera zoomed in
    setTimeout(() => {
      setIsFading(true);
    }, 1350);

    // Trigger navigation callback
    setTimeout(() => {
      if (onNavigateAccessories) {
        onNavigateAccessories();
      }
    }, 1950);
  }, [onNavigateAccessories]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    // ── 1. Scene, Camera, Renderer ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06040a);
    scene.fog = new THREE.FogExp2(0x06040a, 0.035);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 40);
    // Initial elevated overhead perspective — framed to give generous dark space for top typography
    const initialCamPos = new THREE.Vector3(0, 4.35, 2.7);
    const initialLookAt = new THREE.Vector3(0, 0.38, 0.15);

    // Target zoomed position upon opening
    const targetCamPos = new THREE.Vector3(0, 2.2, 1.45);
    const targetLookAt = new THREE.Vector3(0, 0.52, 0.05);

    camera.position.copy(initialCamPos);
    camera.lookAt(initialLookAt);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── 2. Atmospheric Studio Lighting ──
    const ambientLight = new THREE.AmbientLight(0x1e192c, 0.55);
    scene.add(ambientLight);

    // Main Overhead Key Spotlight focused into cabinet
    const keySpot = new THREE.SpotLight(0xfff8f0, 3.4);
    keySpot.position.set(0, 4.8, 0.6);
    keySpot.angle = Math.PI / 4.0;
    keySpot.penumbra = 0.55;
    keySpot.decay = 1.5;
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.45, 0);
    scene.add(spotTarget);
    keySpot.target = spotTarget;
    scene.add(keySpot);

    // Cool Violet/Ice Rim Spotlight on rear glass edges
    const rimSpot = new THREE.SpotLight(0x9d5cf7, 1.8);
    rimSpot.position.set(0, 4.2, -2.6);
    rimSpot.angle = Math.PI / 3.8;
    rimSpot.penumbra = 0.65;
    rimSpot.target = spotTarget;
    scene.add(rimSpot);

    // Soft Front Fill
    const fillLight = new THREE.DirectionalLight(0xf4eeff, 0.6);
    fillLight.position.set(1.5, 3.5, 3.0);
    scene.add(fillLight);

    // Interior LED Edge Accent Point Lights
    const ledLeft = new THREE.PointLight(0xfff5ea, 0.85, 2.8, 1.8);
    ledLeft.position.set(-1.0, 0.68, 0);
    scene.add(ledLeft);

    const ledRight = new THREE.PointLight(0xf3e8ff, 0.85, 2.8, 1.8);
    ledRight.position.set(1.0, 0.68, 0);
    scene.add(ledRight);

    // ── 3. Floor & Architectural Gallery Pedestal ──
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x080610,
      roughness: 0.32,
      metalness: 0.25,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // Pedestal Platform Slab under cabinet
    const plinthGeo = new THREE.BoxGeometry(4.7, 0.08, 3.1);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x0e0c15,
      roughness: 0.4,
      metalness: 0.2,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(0, 0.04, 0);
    scene.add(plinth);

    // Subtle edge rim for plinth
    const plinthRimGeo = new THREE.BoxGeometry(4.74, 0.02, 3.14);
    const plinthRimMat = new THREE.MeshStandardMaterial({
      color: 0x221d2e,
      roughness: 0.2,
      metalness: 0.8,
    });
    const plinthRim = new THREE.Mesh(plinthRimGeo, plinthRimMat);
    plinthRim.position.set(0, 0.08, 0);
    scene.add(plinthRim);

    // ── 4. Main Display Cabinet Construction ──
    const cabinetGroup = new THREE.Group();
    scene.add(cabinetGroup);

    // Materials
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x14121a,
      roughness: 0.25,
      metalness: 0.85,
    });
    const polishedChromeMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5fa,
      roughness: 0.08,
      metalness: 0.98,
    });
    const brushedGoldMat = new THREE.MeshStandardMaterial({
      color: 0xdfb76c,
      roughness: 0.16,
      metalness: 0.94,
    });
    const antiqueGoldMat = new THREE.MeshStandardMaterial({
      color: 0xc89d4e,
      roughness: 0.28,
      metalness: 0.88,
    });
    const blackVelvetMat = new THREE.MeshStandardMaterial({
      color: 0x09070d,
      roughness: 0.96,
      metalness: 0.04,
    });

    // Cabinet Stanchion Legs
    const legGeo = new THREE.BoxGeometry(0.08, 0.46, 0.08);
    const legPositions = [
      [-1.85, 0.27, -1.05],
      [1.85, 0.27, -1.05],
      [-1.85, 0.27, 1.05],
      [1.85, 0.27, 1.05],
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, darkMetalMat);
      leg.position.set(lx, ly, lz);
      cabinetGroup.add(leg);
    });

    // Lower Cross Rails
    const railXGeo = new THREE.BoxGeometry(3.7, 0.03, 0.03);
    const railX1 = new THREE.Mesh(railXGeo, darkMetalMat);
    railX1.position.set(0, 0.18, -1.05);
    cabinetGroup.add(railX1);
    const railX2 = new THREE.Mesh(railXGeo, darkMetalMat);
    railX2.position.set(0, 0.18, 1.05);
    cabinetGroup.add(railX2);

    const railZGeo = new THREE.BoxGeometry(0.03, 0.03, 2.1);
    const railZ1 = new THREE.Mesh(railZGeo, darkMetalMat);
    railZ1.position.set(-1.85, 0.18, 0);
    cabinetGroup.add(railZ1);
    const railZ2 = new THREE.Mesh(railZGeo, darkMetalMat);
    railZ2.position.set(1.85, 0.18, 0);
    cabinetGroup.add(railZ2);

    // Cabinet Main Base Casing
    const baseBottomGeo = new THREE.BoxGeometry(4.0, 0.06, 2.4);
    const baseBottom = new THREE.Mesh(baseBottomGeo, darkMetalMat);
    baseBottom.position.set(0, 0.5, 0);
    cabinetGroup.add(baseBottom);

    // Outer Walls (Height 0.22, from y = 0.53 to y = 0.75)
    const wallWallGeoX = new THREE.BoxGeometry(4.0, 0.22, 0.06);
    const wallBack = new THREE.Mesh(wallWallGeoX, darkMetalMat);
    wallBack.position.set(0, 0.64, -1.17);
    cabinetGroup.add(wallBack);
    const wallFront = new THREE.Mesh(wallWallGeoX, darkMetalMat);
    wallFront.position.set(0, 0.64, 1.17);
    cabinetGroup.add(wallFront);

    const wallWallGeoZ = new THREE.BoxGeometry(0.06, 0.22, 2.28);
    const wallLeft = new THREE.Mesh(wallWallGeoZ, darkMetalMat);
    wallLeft.position.set(-1.97, 0.64, 0);
    cabinetGroup.add(wallLeft);
    const wallRight = new THREE.Mesh(wallWallGeoZ, darkMetalMat);
    wallRight.position.set(1.97, 0.64, 0);
    cabinetGroup.add(wallRight);

    // Interior Velvet Bed Liner
    const velvetBedGeo = new THREE.BoxGeometry(3.88, 0.03, 2.28);
    const velvetBed = new THREE.Mesh(velvetBedGeo, blackVelvetMat);
    velvetBed.position.set(0, 0.545, 0);
    cabinetGroup.add(velvetBed);

    // Velvet Dividers separating 4 distinct compartments
    // Longitudinal (Z divider at x = 0)
    const divZGeo = new THREE.BoxGeometry(0.045, 0.12, 2.24);
    const divZ = new THREE.Mesh(divZGeo, darkMetalMat);
    divZ.position.set(0, 0.62, 0);
    cabinetGroup.add(divZ);

    // Transverse (X divider at z = 0)
    const divXGeo = new THREE.BoxGeometry(3.84, 0.12, 0.045);
    const divX = new THREE.Mesh(divXGeo, darkMetalMat);
    divX.position.set(0, 0.62, 0);
    cabinetGroup.add(divX);

    // Interior Recessed Warm LED Strip
    const ledStripMat = new THREE.MeshBasicMaterial({ color: 0xffebd4 });
    const ledStripFront = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.012, 0.012), ledStripMat);
    ledStripFront.position.set(0, 0.72, 1.12);
    cabinetGroup.add(ledStripFront);
    const ledStripBack = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.012, 0.012), ledStripMat);
    ledStripBack.position.set(0, 0.72, -1.12);
    cabinetGroup.add(ledStripBack);

    // ── 5. Curated Luxury Accessories Items ──

    // ── [Quadrant A: Top-Left (x = -0.96, z = -0.56) — EYEWEAR] ──
    const eyewearGroup = new THREE.Group();
    eyewearGroup.position.set(-0.96, 0.56, -0.56);
    cabinetGroup.add(eyewearGroup);

    // Display Riser 1 (Slanted Velvet Stand for Aviator)
    const riser1Geo = new THREE.BoxGeometry(0.68, 0.035, 0.38);
    const riser1 = new THREE.Mesh(riser1Geo, blackVelvetMat);
    riser1.rotation.x = -0.15;
    riser1.position.set(0, 0.02, -0.2);
    eyewearGroup.add(riser1);

    // Pair 1: Luxury Geometric Wire Aviator
    const glassLensMat = new THREE.MeshStandardMaterial({
      color: 0x181522,
      roughness: 0.04,
      metalness: 0.3,
      transparent: true,
      opacity: 0.88,
    });
    // Left lens
    const lens1Geo = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 24);
    const lensL1 = new THREE.Mesh(lens1Geo, glassLensMat);
    lensL1.rotation.x = Math.PI / 2 - 0.15;
    lensL1.position.set(-0.13, 0.045, -0.2);
    eyewearGroup.add(lensL1);
    // Wire Rim Left
    const rimL1 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 24), brushedGoldMat);
    rimL1.rotation.x = -0.15;
    rimL1.position.set(-0.13, 0.045, -0.2);
    eyewearGroup.add(rimL1);

    // Right lens
    const lensR1 = new THREE.Mesh(lens1Geo, glassLensMat);
    lensR1.rotation.x = Math.PI / 2 - 0.15;
    lensR1.position.set(0.13, 0.045, -0.2);
    eyewearGroup.add(lensR1);
    // Wire Rim Right
    const rimR1 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 24), brushedGoldMat);
    rimR1.rotation.x = -0.15;
    rimR1.position.set(0.13, 0.045, -0.2);
    eyewearGroup.add(rimR1);

    // Double Brow & Nose Bridge
    const bridge1 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1), brushedGoldMat);
    bridge1.rotation.z = Math.PI / 2;
    bridge1.rotation.x = -0.15;
    bridge1.position.set(0, 0.05, -0.2);
    eyewearGroup.add(bridge1);
    const browBar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3), brushedGoldMat);
    browBar1.rotation.z = Math.PI / 2;
    browBar1.rotation.x = -0.15;
    browBar1.position.set(0, 0.14, -0.215);
    eyewearGroup.add(browBar1);

    // Display Riser 2 (Bold Black Acetate Sunglasses)
    const riser2 = new THREE.Mesh(riser1Geo, blackVelvetMat);
    riser2.rotation.x = -0.15;
    riser2.position.set(0, 0.02, 0.24);
    eyewearGroup.add(riser2);

    const acetateMat = new THREE.MeshStandardMaterial({
      color: 0x111116,
      roughness: 0.18,
      metalness: 0.2,
    });
    // Thick rectangular frame
    const frameL2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.02), acetateMat);
    frameL2.rotation.x = -0.15;
    frameL2.position.set(-0.14, 0.045, 0.24);
    eyewearGroup.add(frameL2);
    const frameR2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.02), acetateMat);
    frameR2.rotation.x = -0.15;
    frameR2.position.set(0.14, 0.045, 0.24);
    eyewearGroup.add(frameR2);

    // Acetate bridge
    const bridge2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.02), acetateMat);
    bridge2.rotation.x = -0.15;
    bridge2.position.set(0, 0.055, 0.24);
    eyewearGroup.add(bridge2);

    // Lenses
    const darkPurpleLensMat = new THREE.MeshStandardMaterial({
      color: 0x1c1228,
      roughness: 0.05,
      metalness: 0.35,
      transparent: true,
      opacity: 0.92,
    });
    const innerLensL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.022), darkPurpleLensMat);
    innerLensL.rotation.x = -0.15;
    innerLensL.position.set(-0.14, 0.045, 0.24);
    eyewearGroup.add(innerLensL);
    const innerLensR = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.022), darkPurpleLensMat);
    innerLensR.rotation.x = -0.15;
    innerLensR.position.set(0.14, 0.045, 0.24);
    eyewearGroup.add(innerLensR);

    // Small Gold Temple Rivets
    const rivetGeo = new THREE.SphereGeometry(0.009, 8, 8);
    const rivetL = new THREE.Mesh(rivetGeo, brushedGoldMat);
    rivetL.position.set(-0.25, 0.12, 0.22);
    eyewearGroup.add(rivetL);
    const rivetR = new THREE.Mesh(rivetGeo, brushedGoldMat);
    rivetR.position.set(0.25, 0.12, 0.22);
    eyewearGroup.add(rivetR);


    // ── [Quadrant B: Top-Right (x = 0.96, z = -0.56) — JEWELRY] ──
    const jewelryGroup = new THREE.Group();
    jewelryGroup.position.set(0.96, 0.56, -0.56);
    cabinetGroup.add(jewelryGroup);

    // 1. Heavy Cuban Link Necklace (curved loop on velvet bed)
    const necklaceGroup = new THREE.Group();
    necklaceGroup.position.set(0, 0.015, -0.16);
    jewelryGroup.add(necklaceGroup);

    const linkGeo = new THREE.TorusGeometry(0.045, 0.016, 12, 20);
    const numLinks = 28;
    for (let i = 0; i < numLinks; i++) {
      const angle = (i / (numLinks - 1)) * Math.PI * 1.5 - Math.PI * 0.75;
      const rx = 0.32 * Math.cos(angle);
      const rz = 0.26 * Math.sin(angle);
      const link = new THREE.Mesh(linkGeo, brushedGoldMat);
      link.position.set(rx, 0.01, rz);
      link.rotation.x = Math.PI / 2;
      link.rotation.y = angle + (i % 2 === 0 ? 0.35 : -0.35);
      necklaceGroup.add(link);
    }
    // Statement Center Pavé Clasp
    const claspGeo = new THREE.BoxGeometry(0.09, 0.035, 0.05);
    const clasp = new THREE.Mesh(claspGeo, polishedChromeMat);
    clasp.position.set(0, 0.015, 0.26);
    necklaceGroup.add(clasp);

    // 2. Velvet Ring Display Slot with Signet & Band Rings
    const ringSlotGeo = new THREE.BoxGeometry(0.48, 0.04, 0.2);
    const ringSlot = new THREE.Mesh(ringSlotGeo, blackVelvetMat);
    ringSlot.position.set(-0.35, 0.02, 0.24);
    jewelryGroup.add(ringSlot);

    // Signet Ring (brushed gold with flat square seal face)
    const signetBody = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 12, 24), brushedGoldMat);
    signetBody.position.set(-0.44, 0.055, 0.24);
    signetBody.rotation.y = Math.PI / 4;
    jewelryGroup.add(signetBody);
    const signetFace = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.015, 0.065), brushedGoldMat);
    signetFace.position.set(-0.44, 0.11, 0.24);
    jewelryGroup.add(signetFace);

    // Band Ring (faceted platinum eternity ring)
    const bandRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 12, 24), polishedChromeMat);
    bandRing.position.set(-0.26, 0.055, 0.24);
    bandRing.rotation.y = -Math.PI / 6;
    jewelryGroup.add(bandRing);

    // 3. Luxury Rigid Metallic Cuff Bracelet
    const cuffPillowGeo = new THREE.BoxGeometry(0.36, 0.06, 0.28);
    const cuffPillow = new THREE.Mesh(cuffPillowGeo, blackVelvetMat);
    cuffPillow.position.set(0.34, 0.03, 0.24);
    jewelryGroup.add(cuffPillow);

    const cuffGeo = new THREE.TorusGeometry(0.11, 0.025, 16, 32, Math.PI * 1.6);
    const cuff = new THREE.Mesh(cuffGeo, polishedChromeMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.rotation.z = Math.PI * 0.2;
    cuff.position.set(0.34, 0.075, 0.24);
    jewelryGroup.add(cuff);


    // ── [Quadrant C: Bottom-Left (x = -0.96, z = 0.56) — LEATHER BELTS] ──
    const beltsGroup = new THREE.Group();
    beltsGroup.position.set(-0.96, 0.56, 0.56);
    cabinetGroup.add(beltsGroup);

    const blackLeatherMat = new THREE.MeshStandardMaterial({
      color: 0x141217,
      roughness: 0.58,
      metalness: 0.1,
    });
    const cognacLeatherMat = new THREE.MeshStandardMaterial({
      color: 0x2e151a,
      roughness: 0.52,
      metalness: 0.1,
    });

    // Belt 1: Signature AMIRI Noir Leather Belt
    const belt1Group = new THREE.Group();
    belt1Group.position.set(-0.35, 0, 0);
    beltsGroup.add(belt1Group);

    // Coiled cylinder
    const coil1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.09, 32), blackLeatherMat);
    coil1.position.y = 0.045;
    belt1Group.add(coil1);
    // Outer strap rim
    const coil1Rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 8, 32), blackLeatherMat);
    coil1Rim.rotation.x = Math.PI / 2;
    coil1Rim.position.y = 0.09;
    belt1Group.add(coil1Rim);

    // Statement Polished Chrome Monogram Buckle
    const buckle1 = new THREE.Group();
    buckle1.position.set(0, 0.1, 0.18);
    // Outer buckle frame
    const bFrame1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.12), polishedChromeMat);
    buckle1.add(bFrame1);
    // Monogram crossbar 'A' detail
    const bPin1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.14), polishedChromeMat);
    buckle1.add(bPin1);
    belt1Group.add(buckle1);

    // Belt 2: Deep Cognac Leather Belt with Antique Gold Buckle
    const belt2Group = new THREE.Group();
    belt2Group.position.set(0.35, 0, 0);
    beltsGroup.add(belt2Group);

    const coil2 = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.09, 32), cognacLeatherMat);
    coil2.position.y = 0.045;
    belt2Group.add(coil2);

    const buckle2 = new THREE.Group();
    buckle2.position.set(0, 0.1, 0.18);
    const bFrame2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.11), antiqueGoldMat);
    buckle2.add(bFrame2);
    const bPin2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12), antiqueGoldMat);
    bPin2.rotation.x = Math.PI / 2;
    buckle2.add(bPin2);
    belt2Group.add(buckle2);


    // ── [Quadrant D: Bottom-Right (x = 0.96, z = 0.56) — SILK TIES] ──
    const tiesGroup = new THREE.Group();
    tiesGroup.position.set(0.96, 0.56, 0.56);
    cabinetGroup.add(tiesGroup);

    const silkNoirMat = new THREE.MeshStandardMaterial({
      color: 0x16131f,
      roughness: 0.35,
      metalness: 0.25,
    });
    const silkPlumMat = new THREE.MeshStandardMaterial({
      color: 0x24142b,
      roughness: 0.38,
      metalness: 0.22,
    });
    const silkSilverMat = new THREE.MeshStandardMaterial({
      color: 0x2b2c34,
      roughness: 0.34,
      metalness: 0.3,
    });

    // 3 Rolled Silk Ties in Velvet Slits
    const tieConfigs = [
      { x: -0.45, mat: silkNoirMat, clip: true },
      { x: 0, mat: silkPlumMat, clip: false },
      { x: 0.45, mat: silkSilverMat, clip: true },
    ];

    tieConfigs.forEach(({ x, mat, clip }) => {
      const tieRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 28), mat);
      tieRoll.position.set(x, 0.08, 0);
      tieRoll.rotation.z = Math.PI / 2;
      tiesGroup.add(tieRoll);

      // Folded blade tip extending forward
      const tipGeo = new THREE.BoxGeometry(0.13, 0.015, 0.16);
      const tip = new THREE.Mesh(tipGeo, mat);
      tip.position.set(x, 0.01, 0.18);
      tiesGroup.add(tip);

      // Tie clip on noir & silver ties
      if (clip) {
        const tieBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.025), polishedChromeMat);
        tieBar.position.set(x, 0.022, 0.16);
        tiesGroup.add(tieBar);
      }
    });

    // ── 6. Pivoting Glass Lid Assembly ──
    // Hinge Pivot axis is situated precisely at top rear edge: y = 0.75, z = -1.18
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.75, -1.18);
    cabinetGroup.add(lidPivot);

    // Inside lidPivot, the hinge is at z = 0, y = 0.
    // The glass sheet extends forward from z = 0 to z = 2.36.
    // Center is at z = 1.18, y = 0.012.
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xeef5ff,
      roughness: 0.06,
      metalness: 0.15,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    const glassPane = new THREE.Mesh(new THREE.BoxGeometry(3.92, 0.022, 2.34), glassMat);
    glassPane.position.set(0, 0.011, 1.17);
    lidPivot.add(glassPane);

    // Beveled Metal Outer Frame around glass
    const frameMetalMat = new THREE.MeshStandardMaterial({
      color: 0x181520,
      roughness: 0.2,
      metalness: 0.9,
    });
    // Front rim bar
    const fRimFront = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.028, 0.04), frameMetalMat);
    fRimFront.position.set(0, 0.014, 2.33);
    lidPivot.add(fRimFront);
    // Back rim bar
    const fRimBack = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.028, 0.04), frameMetalMat);
    fRimBack.position.set(0, 0.014, 0.02);
    lidPivot.add(fRimBack);
    // Left rim bar
    const fRimLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 2.34), frameMetalMat);
    fRimLeft.position.set(-1.96, 0.014, 1.17);
    lidPivot.add(fRimLeft);
    // Right rim bar
    const fRimRight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 2.34), frameMetalMat);
    fRimRight.position.set(1.96, 0.014, 1.17);
    lidPivot.add(fRimRight);

    // Sleek Front Handle Grab Bar
    const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6), polishedChromeMat);
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.set(0, 0.035, 2.34);
    lidPivot.add(handleBar);

    // Mechanical Twin Rear Hinges
    const hingeL = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12), darkMetalMat);
    hingeL.rotation.z = Math.PI / 2;
    hingeL.position.set(-1.5, 0, 0);
    lidPivot.add(hingeL);

    const hingeR = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12), darkMetalMat);
    hingeR.rotation.z = Math.PI / 2;
    hingeR.position.set(1.5, 0, 0);
    lidPivot.add(hingeR);

    // ── 7. Raycasting & Interaction Setup ──
    const raycaster = new THREE.Raycaster();
    const hitBoxGeo = new THREE.BoxGeometry(4.2, 0.8, 2.6);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.set(0, 0.65, 0);
    scene.add(hitBox);

    const handlePointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      animStateRef.current.targetMouse.set(x, y);

      // Raycast test
      raycaster.setFromCamera(animStateRef.current.targetMouse, camera);
      const intersects = raycaster.intersectObject(hitBox);
      const isHit = intersects.length > 0;
      setIsCanvasHovered(isHit);

      // Check quadrant hover if hit
      if (isHit && intersects[0].point) {
        const pt = intersects[0].point;
        if (pt.x < 0 && pt.z < 0) setActiveCompartment('eyewear');
        else if (pt.x >= 0 && pt.z < 0) setActiveCompartment('jewelry');
        else if (pt.x < 0 && pt.z >= 0) setActiveCompartment('belts');
        else setActiveCompartment('ties');
      } else {
        setActiveCompartment(null);
      }
    };

    const handlePointerClick = (e) => {
      if (animStateRef.current.isOpening) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const intersects = raycaster.intersectObject(hitBox);
      if (intersects.length > 0) {
        handleTriggerUnlock();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('click', handlePointerClick);

    // ── 8. Render & Animation Loop ──
    let animationFrameId;
    let isVisible = true;
    const currentCamPos = initialCamPos.clone();
    const currentLookAt = initialLookAt.clone();

    // IntersectionObserver: Pause rendering when offscreen
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
      visibilityObserver.observe(container || canvas);
    }

    const animate = (time) => {
      animationFrameId = requestAnimationFrame(animate);

      // Skip rendering and GPU load when offscreen
      if (!isVisible) return;

      // Smooth mouse parallax lerp
      animStateRef.current.mouse.lerp(animStateRef.current.targetMouse, 0.05);

      if (animStateRef.current.isOpening) {
        const elapsed = (time - animStateRef.current.startTime) / 1000;

        // Smooth cubic ease out progression for camera approach
        const camProgress = Math.min(Math.max(elapsed / 1.35, 0), 1);
        const easeCam = 1 - Math.pow(1 - camProgress, 3);

        currentCamPos.lerpVectors(initialCamPos, targetCamPos, easeCam);
        currentLookAt.lerpVectors(initialLookAt, targetLookAt, easeCam);
        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookAt);

        // Smooth physical glass lid rotation opening around back hinge (starts at 0.1s, takes 1.25s)
        const lidProgress = Math.min(Math.max((elapsed - 0.08) / 1.25, 0), 1);
        const easeLid = 1 - Math.pow(1 - lidProgress, 3);
        const maxAngle = -Math.PI * 0.44; // ~79 degrees open
        lidPivot.rotation.x = easeLid * maxAngle;

        // Key spotlight intensity enhancement to dramatize interior items
        keySpot.intensity = 3.4 + easeCam * 1.2;
      } else {
        // Idle gentle parallax tilt
        const mouseParallaxX = animStateRef.current.mouse.x * 0.35;
        const mouseParallaxY = -animStateRef.current.mouse.y * 0.18;

        camera.position.x = initialCamPos.x + mouseParallaxX;
        camera.position.y = initialCamPos.y + mouseParallaxY;
        camera.position.z = initialCamPos.z;
        camera.lookAt(initialLookAt);
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // ── 9. Resize Handling ──
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // ── 10. Cleanup on unmount ──
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (visibilityObserver) visibilityObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      if (canvas) {
        canvas.removeEventListener('click', handlePointerClick);
      }

      // Dispose geometries and materials recursively
      scene.traverse((obj) => {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((mat) => mat.dispose());
            } else {
              obj.material.dispose();
            }
          }
        }
      });

      renderer.dispose();
    };
  }, [handleTriggerUnlock]);

  return (
    <section
      ref={containerRef}
      className={`campaign-accessories-vault ${
        isCanvasHovered ? 'is-hovering' : ''
      } ${isOpening ? 'is-opening' : ''}`}
      aria-label="Interactive 3D Accessories Display Cabinet"
    >
      {/* Seamless gradient transition from previous section */}
      <div className="campaign-accessories-vault__top-blend" />

      {/* WebGL 3D Canvas */}
      <div className="campaign-accessories-vault__canvas-wrap">
        <canvas ref={canvasRef} />
      </div>

      {/* Atmospheric Vignette */}
      <div className="campaign-accessories-vault__vignette" />

      {/* Top Editorial Header */}
      <div className="campaign-accessories-vault__header">
        <p className="campaign-accessories-vault__eyebrow">THE ACCESSORIES VAULT</p>
        <h2 className="campaign-accessories-vault__title">
          The Final Details Define The Look.
        </h2>
        <p className="campaign-accessories-vault__subtext">
          Fine Jewelry · Leather Belts · Silk Ties · Optical Frames
        </p>
      </div>

      {/* Central Floating Interactive Unlock Button */}
      {!isOpening && (
        <button
          type="button"
          className="campaign-accessories-vault__prompt"
          onClick={handleTriggerUnlock}
          aria-label="Unlock Accessories Cabinet"
        >
          <span className="campaign-accessories-vault__prompt-text">
            <span className="campaign-accessories-vault__prompt-icon" />
            Unlock Display Cabinet
          </span>
          <span className="campaign-accessories-vault__prompt-hint">
            Click anywhere to inspect &amp; open
          </span>
        </button>
      )}

      {/* Bottom Interactive Quick-Select Dock */}
      <div
        className={`campaign-accessories-vault__dock ${
          isOpening ? 'is-disabled' : ''
        }`}
      >
        <button
          type="button"
          className={`campaign-vault-dock-btn ${
            activeCompartment === 'jewelry' ? 'is-active' : ''
          }`}
          onClick={handleTriggerUnlock}
        >
          <span className="campaign-vault-dock-btn__dot" />
          <span>Jewelry</span>
        </button>
        <button
          type="button"
          className={`campaign-vault-dock-btn ${
            activeCompartment === 'belts' ? 'is-active' : ''
          }`}
          onClick={handleTriggerUnlock}
        >
          <span className="campaign-vault-dock-btn__dot" />
          <span>Leather Belts</span>
        </button>
        <button
          type="button"
          className={`campaign-vault-dock-btn ${
            activeCompartment === 'ties' ? 'is-active' : ''
          }`}
          onClick={handleTriggerUnlock}
        >
          <span className="campaign-vault-dock-btn__dot" />
          <span>Silk Ties</span>
        </button>
        <button
          type="button"
          className={`campaign-vault-dock-btn ${
            activeCompartment === 'eyewear' ? 'is-active' : ''
          }`}
          onClick={handleTriggerUnlock}
        >
          <span className="campaign-vault-dock-btn__dot" />
          <span>Eyewear</span>
        </button>
        <button
          type="button"
          className="campaign-vault-dock-btn is-cta"
          onClick={handleTriggerUnlock}
        >
          <span>Explore Collection →</span>
        </button>
      </div>

      {/* Fullscreen Smooth Fade Transition Overlay */}
      <div
        className={`campaign-accessories-vault__fade ${
          isFading ? 'is-active' : ''
        }`}
      />
    </section>
  );
};

export default AccessoriesVaultSection;

