const express = require('express');
const router = express.Router();
const multer = require('multer');
const CampaignMedia = require('../models/CampaignMedia');
const { protect, admin } = require('../middleware/authMiddleware');
const cloudinary = require('../config/cloudinary');

// Setup multer memory storage (allows up to 100MB for videos or high-res images)
const storage = multer.memoryStorage();
const uploadMedia = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const DEFAULT_CAMPAIGN_DATA = {
  key: 'main_campaign',
  video: {
    videoUrl: '/assets/vid1.mp4',
    title: 'WINTER CAPSULE',
    description: "Winter in Runyon Canyon, set against the iconic backdrop of Los Angeles.\nBringing a sophisticated ease to cold-weather essentials, the Winter Capsule unites function and form through the house's signature craftsmanship.",
    posterUrl: ''
  },
  showcaseLeft: [
    {
      imageUrl: '/assets/couple-outfit.jpg',
      eyebrow: 'WINTER CAPSULE · CO-ORD',
      title: 'COUPLE OUTFIT',
      description: 'High-altitude alpine glamour meets coordinated dark luxury. Sculpted high-shine puffers, plush fur finishes, and an effortless synchronized silhouette designed for two.'
    }
  ],
  showcaseRight: [
    {
      imageUrl: '/assets/homie-outfit.jpg',
      eyebrow: 'STREET CULTURE · BROTHERHOOD',
      title: 'OUTFIT WITH HOMIE',
      description: 'Unfiltered urban presence and bonded brotherhood. Layered technical tracksuits, statement iced chains, and authentic street silhouettes rooted in the pulse of modern streetwear.'
    }
  ]
};

// Helper to get or create campaign media doc
async function getOrCreateCampaignMedia() {
  let doc = await CampaignMedia.findOne({ key: 'main_campaign' });
  if (!doc) {
    doc = await CampaignMedia.create(DEFAULT_CAMPAIGN_DATA);
  }
  return doc;
}

// @route   GET /api/campaign-media
// @desc    Lấy dữ liệu video và ảnh trưng bày cho trang Campaign (Public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const doc = await getOrCreateCampaignMedia();
    res.json({
      success: true,
      data: doc
    });
  } catch (error) {
    console.error('Error fetching campaign media:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tải dữ liệu Campaign',
      data: DEFAULT_CAMPAIGN_DATA
    });
  }
});

// @route   GET /api/campaign-media/admin
// @desc    Lấy dữ liệu Campaign Media cho Admin dashboard
// @access  Private/Admin
router.get('/admin', protect, admin, async (req, res) => {
  try {
    const doc = await getOrCreateCampaignMedia();
    res.json({
      success: true,
      data: doc
    });
  } catch (error) {
    console.error('Admin fetch campaign media error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/campaign-media/admin
// @desc    Cập nhật video và danh sách ảnh trưng bày cột Trái & Phải
// @access  Private/Admin
router.put('/admin', protect, admin, async (req, res) => {
  try {
    const { video, showcaseLeft, showcaseRight } = req.body;
    let doc = await getOrCreateCampaignMedia();

    if (video) {
      doc.video = {
        videoUrl: video.videoUrl || doc.video.videoUrl,
        title: video.title !== undefined ? video.title : doc.video.title,
        description: video.description !== undefined ? video.description : doc.video.description,
        posterUrl: video.posterUrl !== undefined ? video.posterUrl : doc.video.posterUrl
      };
    }

    if (Array.isArray(showcaseLeft)) {
      doc.showcaseLeft = showcaseLeft;
    }

    if (Array.isArray(showcaseRight)) {
      doc.showcaseRight = showcaseRight;
    }

    await doc.save();

    res.json({
      success: true,
      message: 'Cập nhật cấu hình quảng cáo Campaign thành công!',
      data: doc
    });
  } catch (error) {
    console.error('Update campaign media error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lưu Campaign Media'
    });
  }
});

// @route   POST /api/campaign-media/admin/upload
// @desc    Upload file ảnh hoặc video lên Cloudinary cho Campaign
// @access  Private/Admin
router.post('/admin/upload', protect, admin, uploadMedia.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không tìm thấy file tải lên'
      });
    }

    const isVideo = req.file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'kdxx-campaign',
          resource_type: resourceType
        },
        (error, uploadResult) => {
          if (error) reject(error);
          else resolve(uploadResult);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({
      success: true,
      url: result.secure_url,
      resourceType: result.resource_type,
      format: result.format
    });
  } catch (error) {
    console.error('Upload campaign file error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi upload file lên Cloudinary'
    });
  }
});

module.exports = router;

