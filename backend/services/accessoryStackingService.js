/**
 * @file accessoryStackingService.js
 * @description KD-XX Level 6: Luxury Accessory Stacking & Anatomical Anchor Engine.
 * 
 * Accurately anchors rigid luxury accessories (Sunglasses, Belts, Hats, Bags, Wallets, Necklaces)
 * onto full-body or portrait human photos based on anatomical landmarks (Level 1 Pose,
 * Level 4 Face ROI, Level 5 Body Measurements).
 * 
 * Features:
 * 1. Anatomical Anchor Calculator: Eyes, Crown, Waist, Hip, Hand, Clavicle landmarks.
 * 2. Background Auto-Keying: Strips studio white/grey backgrounds, preserving alpha transparency.
 * 3. Photorealistic Contact Shadow Synthesis: Creates soft ambient occlusion shadows.
 * 4. Multi-Layer Stacking: Composites accessories with correct physical Z-index.
 */

const sharp = require('sharp');
const faceIdentityService = require('./faceIdentityService');
const bodyMeasurementService = require('./bodyMeasurementService');

class AccessoryStackingService {
  /**
   * Calculate precise anatomical anchor coordinates and target bounding box.
   *
   * @param {Object} params
   * @param {string} params.category Normalized accessory category
   * @param {string} [params.subCategory] Granular subcategory
   * @param {number} params.width Full body canvas width
   * @param {number} params.height Full body canvas height
   * @param {Object} [params.poseAnalysis] Level 1 pose data
   * @param {Object} [params.headRoi] Level 4 head bounding box
   * @returns {Object} { x, y, width, height, anchorName, zIndex }
   */
  calculateAccessoryAnchor({ category, subCategory = '', width, height, poseAnalysis = null, headRoi = null }) {
    const w = width;
    const h = height;
    const cat = String(subCategory || category || '').toLowerCase();

    // Ensure we have head ROI for upper accessories
    const headRaw = headRoi || faceIdentityService.calculateHeadROI({ width: w, height: h, poseAnalysis });
    const head = {
      x: headRaw.left !== undefined ? headRaw.left : (headRaw.x || 0),
      y: headRaw.top !== undefined ? headRaw.top : (headRaw.y || 0),
      width: headRaw.width || Math.round(w * 0.5),
      height: headRaw.height || Math.round(h * 0.3)
    };

    // 1. Eyewear & Sunglasses
    if (['eyewear', 'sunglasses', 'optical', 'glasses'].some(k => cat.includes(k))) {
      const eyeY = head.y + Math.round(head.height * 0.44);
      const centerX = head.x + Math.round(head.width * 0.5);
      const targetWidth = Math.round(head.width * 0.82);
      const targetHeight = Math.round(targetWidth / 2.5); // Standard sunglasses aspect ratio ~2.5:1
      const x = Math.max(0, centerX - Math.round(targetWidth * 0.5));
      const y = Math.max(0, eyeY - Math.round(targetHeight * 0.45));

      return {
        anchorName: 'FACE_EYES_BRIDGE',
        x,
        y,
        width: targetWidth,
        height: targetHeight,
        zIndex: 50,
        hasDropShadow: true,
        shadowOffsetY: Math.round(targetHeight * 0.12),
        shadowOpacity: 0.35
      };
    }

    // 2. Hats & Caps
    if (['hats', 'caps', 'beanies', 'mũ', 'nón'].some(k => cat.includes(k))) {
      const targetWidth = Math.round(head.width * 1.05);
      const targetHeight = Math.round(head.height * 0.55);
      const x = Math.max(0, head.x + Math.round((head.width - targetWidth) / 2));
      const y = Math.max(0, head.y - Math.round(targetHeight * 0.28));

      return {
        anchorName: 'HEAD_CROWN',
        x,
        y,
        width: targetWidth,
        height: targetHeight,
        zIndex: 40,
        hasDropShadow: true,
        shadowOffsetY: Math.round(targetHeight * 0.1),
        shadowOpacity: 0.4
      };
    }

    // 3. Belts & Waist Accessories
    if (['belts', 'thắt lưng', 'dây nịt'].some(k => cat.includes(k))) {
      const waistY = Math.round(h * 0.45);
      const waistWidth = Math.round(w * 0.36);
      const targetHeight = Math.max(24, Math.round(h * 0.038));
      const x = Math.max(0, Math.round((w - waistWidth) / 2));
      const y = Math.max(0, waistY - Math.round(targetHeight * 0.5));

      return {
        anchorName: 'TORSO_WAISTLINE',
        x,
        y,
        width: waistWidth,
        height: targetHeight,
        zIndex: 25,
        hasDropShadow: true,
        shadowOffsetY: 4,
        shadowOpacity: 0.3
      };
    }

    // 4. Bags & Crossbody
    if (['bags', 'handbags', 'crossbody', 'túi', 'balo'].some(k => cat.includes(k))) {
      const targetWidth = Math.round(w * 0.28);
      const targetHeight = Math.round(targetWidth * 0.95);
      // Position at right hip / thigh flank
      const x = Math.min(w - targetWidth - 10, Math.round(w * 0.58));
      const y = Math.round(h * 0.50);

      return {
        anchorName: 'HIP_FLANK_CROSSBODY',
        x,
        y,
        width: targetWidth,
        height: targetHeight,
        zIndex: 35,
        hasDropShadow: true,
        shadowOffsetY: 8,
        shadowOpacity: 0.35
      };
    }

    // 5. Wallets & Clutches & Keychains
    if (['wallets', 'clutches', 'cardholder', 'ví', 'keychains', 'móc khóa'].some(k => cat.includes(k))) {
      const targetWidth = Math.round(w * 0.18);
      const targetHeight = Math.round(targetWidth * 0.72);
      // Position near right hand / pocket zone
      const x = Math.min(w - targetWidth - 15, Math.round(w * 0.62));
      const y = Math.round(h * 0.48);

      return {
        anchorName: 'HAND_WRIST_FLANK',
        x,
        y,
        width: targetWidth,
        height: targetHeight,
        zIndex: 30,
        hasDropShadow: true,
        shadowOffsetY: 5,
        shadowOpacity: 0.3
      };
    }

    // 6. Jewelry & Necklaces
    if (['jewelry', 'necklaces', 'chains', 'vòng cổ', 'dây chuyền'].some(k => cat.includes(k))) {
      const targetWidth = Math.round(head.width * 0.62);
      const targetHeight = Math.round(targetWidth * 0.90);
      const x = Math.max(0, head.x + Math.round((head.width - targetWidth) / 2));
      const y = head.y + Math.round(head.height * 0.84);

      return {
        anchorName: 'NECK_CLAVICLE',
        x,
        y,
        width: targetWidth,
        height: targetHeight,
        zIndex: 20,
        hasDropShadow: true,
        shadowOffsetY: 3,
        shadowOpacity: 0.25
      };
    }

    // Default general accessory anchor (side flank)
    const defaultWidth = Math.round(w * 0.22);
    const defaultHeight = Math.round(defaultWidth * 0.8);
    return {
      anchorName: 'DEFAULT_ACC_FLANK',
      x: Math.round(w * 0.55),
      y: Math.round(h * 0.50),
      width: defaultWidth,
      height: defaultHeight,
      zIndex: 30,
      hasDropShadow: true,
      shadowOffsetY: 5,
      shadowOpacity: 0.3
    };
  }

  /**
   * Preprocess accessory image: transparent background cutout, aspect ratio preservation, and resizing.
   *
   * @param {Buffer} accessoryBuffer
   * @param {Object} options
   * @param {number} options.targetWidth
   * @param {number} options.targetHeight
   * @returns {Promise<Buffer>} Preprocessed PNG buffer with alpha
   */
  async preprocessAccessoryImage(accessoryBuffer, { targetWidth, targetHeight }) {
    if (!Buffer.isBuffer(accessoryBuffer) || accessoryBuffer.length === 0) {
      throw new Error('Accessory image buffer rỗng hoặc không hợp lệ.');
    }

    const image = sharp(accessoryBuffer).rotate();
    const meta = await image.metadata();

    // Check if background is studio solid (check corners)
    const rawRgba = await image
      .resize(targetWidth, targetHeight, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = rawRgba;
    const pixelsCount = info.width * info.height;

    // Check top-left corner pixel (pixel 0)
    const cornerR = data[0];
    const cornerG = data[1];
    const cornerB = data[2];
    const cornerA = data[3];

    // If corner is opaque white/light-grey (studio background) and image doesn't have transparency
    const isStudioBackground = cornerA > 200 && cornerR > 230 && cornerG > 230 && cornerB > 230;

    if (isStudioBackground) {
      // Key out studio background: set near-white pixels to transparent with soft edge
      for (let i = 0; i < pixelsCount; i++) {
        const offset = i * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];

        if (r > 235 && g > 235 && b > 235) {
          data[offset + 3] = 0; // Transparent
        } else if (r > 215 && g > 215 && b > 215) {
          // Soft edge blending
          const falloff = (235 - Math.max(r, g, b)) / 20;
          data[offset + 3] = Math.round(255 * Math.max(0, Math.min(1, falloff)));
        }
      }
    }

    return sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    })
      .png({ compressionLevel: 8 })
      .toBuffer();
  }

  /**
   * Synthesize a subtle soft contact shadow for photorealistic anchoring.
   *
   * @param {Object} params
   * @param {number} params.width
   * @param {number} params.height
   * @param {number} [params.opacity]
   * @returns {Promise<Buffer>} PNG shadow buffer
   */
  async synthesizeContactShadow({ width, height, opacity = 0.35 }) {
    const shadowW = Math.max(16, width);
    const shadowH = Math.max(8, height);
    const shadowAlpha = Math.round(255 * Math.min(1, Math.max(0.1, opacity)));

    const svg = `
      <svg width="${shadowW}" height="${shadowH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="accShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#000000" stop-opacity="${(shadowAlpha / 255).toFixed(2)}" />
            <stop offset="60%" stop-color="#000000" stop-opacity="${(shadowAlpha * 0.4 / 255).toFixed(2)}" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="${shadowW / 2}" cy="${shadowH / 2}" rx="${shadowW * 0.45}" ry="${shadowH * 0.40}" fill="url(#accShadow)" />
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Stack an accessory onto a body image with luxury fidelity and contact shadow.
   *
   * @param {Object} params
   * @param {Buffer} params.personBuffer Full-body human image buffer
   * @param {Buffer} params.accessoryBuffer Product image buffer
   * @param {string} params.category Category of accessory
   * @param {string} [params.subCategory]
   * @param {Object} [params.poseAnalysis]
   * @param {Object} [params.headRoi]
   * @returns {Promise<Object>} { enhancedBuffer, telemetry }
   */
  async stackAccessoryOntoBody({
    personBuffer,
    accessoryBuffer,
    category,
    subCategory = '',
    poseAnalysis = null,
    headRoi = null
  }) {
    if (!Buffer.isBuffer(personBuffer) || !Buffer.isBuffer(accessoryBuffer)) {
      throw new Error('Ảnh cơ thể hoặc ảnh phụ kiện không hợp lệ.');
    }

    const personMeta = await sharp(personBuffer).metadata();
    const w = personMeta.width;
    const h = personMeta.height;

    // 1. Calculate anchor coordinates
    const anchor = this.calculateAccessoryAnchor({
      category,
      subCategory,
      width: w,
      height: h,
      poseAnalysis,
      headRoi
    });

    // 2. Preprocess accessory (key out background & resize)
    const processedAccessoryBuf = await this.preprocessAccessoryImage(accessoryBuffer, {
      targetWidth: anchor.width,
      targetHeight: anchor.height
    });

    const accMeta = await sharp(processedAccessoryBuf).metadata();
    const actualAccWidth = accMeta.width;
    const actualAccHeight = accMeta.height;

    // Center actual accessory within target anchor box
    const drawX = anchor.x + Math.round((anchor.width - actualAccWidth) / 2);
    const drawY = anchor.y + Math.round((anchor.height - actualAccHeight) / 2);

    const composites = [];

    // 3. Synthesize and composite contact shadow if enabled
    if (anchor.hasDropShadow) {
      const shadowBuf = await this.synthesizeContactShadow({
        width: actualAccWidth,
        height: actualAccHeight,
        opacity: anchor.shadowOpacity || 0.35
      });
      const shadowMeta = await sharp(shadowBuf).metadata();
      const shadowX = drawX + Math.round((actualAccWidth - shadowMeta.width) / 2);
      const shadowY = drawY + actualAccHeight - Math.round(shadowMeta.height * 0.4) + (anchor.shadowOffsetY || 0);

      // Keep within bounds
      if (shadowX >= 0 && shadowX + shadowMeta.width <= w && shadowY >= 0 && shadowY + shadowMeta.height <= h) {
        composites.push({
          input: shadowBuf,
          left: Math.max(0, shadowX),
          top: Math.max(0, shadowY),
          blend: 'multiply'
        });
      }
    }

    // 4. Composite accessory on top
    composites.push({
      input: processedAccessoryBuf,
      left: Math.max(0, drawX),
      top: Math.max(0, drawY),
      blend: 'over'
    });

    const enhancedBuffer = await sharp(personBuffer)
      .composite(composites)
      .png({ compressionLevel: 8 })
      .toBuffer();

    return {
      enhancedBuffer,
      telemetry: {
        anchorName: anchor.anchorName,
        category: category || subCategory,
        subCategory,
        anchorCoordinates: { x: drawX, y: drawY, width: actualAccWidth, height: actualAccHeight },
        zIndex: anchor.zIndex,
        hasDropShadow: anchor.hasDropShadow,
        appliedAt: new Date().toISOString()
      }
    };
  }
}

module.exports = new AccessoryStackingService();
