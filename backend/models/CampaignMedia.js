const mongoose = require('mongoose');

const ShowcaseItemSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' }
}, { _id: true });

const HeroSchema = new mongoose.Schema({
  mediaType: { 
    type: String, 
    enum: ['image', 'video'], 
    default: 'image' 
  },
  mediaUrl: { 
    type: String, 
    default: '/campaign-hero.jpg' 
  },
  eyebrow: { 
    type: String, 
    default: 'MADE TRẦN ĐỨC MINH' 
  },
  headline: { 
    type: String, 
    default: 'Beyond The Ordinary' 
  },
  subtext: { 
    type: String, 
    default: 'A New Expression of Luxury Streetwear.' 
  },
  ctaText: { 
    type: String, 
    default: 'Discover New Arrivals' 
  },
  ctaLink: { 
    type: String, 
    default: '/home' 
  }
}, { _id: false });

const CampaignMediaSchema = new mongoose.Schema({
  key: { 
    type: String, 
    default: 'main_campaign', 
    unique: true 
  },
  // Section 0: Banner Ảnh/Video Chính Trang Campaign (Hero Section)
  hero: {
    type: HeroSchema,
    default: () => ({
      mediaType: 'image',
      mediaUrl: '/campaign-hero.jpg',
      eyebrow: 'MADE TRẦN ĐỨC MINH',
      headline: 'Beyond The Ordinary',
      subtext: 'A New Expression of Luxury Streetwear.',
      ctaText: 'Discover New Arrivals',
      ctaLink: '/home'
    })
  },
  // Section 1: Video Quảng Cáo (Campaign Video)
  video: {
    videoUrl: { type: String, default: '/assets/vid1.mp4' },
    title: { type: String, default: 'WINTER CAPSULE' },
    description: { 
      type: String, 
      default: "Winter in Runyon Canyon, set against the iconic backdrop of Los Angeles.\nBringing a sophisticated ease to cold-weather essentials, the Winter Capsule unites function and form through the house's signature craftsmanship." 
    },
    posterUrl: { type: String, default: '' }
  },
  // Section 2: Ảnh Trưng Bày (Showcase Images - Cột Trái & Cột Phải)
  showcaseLeft: [ShowcaseItemSchema],
  showcaseRight: [ShowcaseItemSchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('CampaignMedia', CampaignMediaSchema);

