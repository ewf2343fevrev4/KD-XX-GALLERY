const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  description: {
    type: String,
    required: false,
    default: 'Sản phẩm chất lượng cao từ AMIRI'
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: 0
  },
  // Cho phép lưu nhiều ảnh (images), hoặc 1 ảnh image/imageUrl
  images: {
    type: [String],
    validate: {
      validator: function (arr) {
        return Array.isArray(arr);
      },
      message: 'Images field must be an array'
    },
    default: []
  },
  image: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: ['men', 'women', 'accessories', 'shoes', 'clothing']
  },
  sizes: [{
    type: String,
    trim: true
  }],
  colors: [String],
  brand: {
    type: String,
    default: 'AMIRI'
  },
  inStock: {
    type: Boolean,
    default: true
  },
  stock: {
    type: Number,
    default: 0,
    min: 0
  },
  featured: {
    type: Boolean,
    default: false
  },
  rating: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 5
  },
  numReviews: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Virtual property để luôn trả về ảnh đầu tiên
productSchema.virtual('mainImage').get(function () {
  return this.images?.[0] || this.image || null;
});

// Đảm bảo khi tạo/update, images và image luôn sync
productSchema.pre('save', function(next) {
  if (this.images && this.images.length > 0) {
    this.image = this.images[0];
  } else if (this.image) {
    this.images = [this.image];
  }
  if (this.stock !== undefined) {
    this.inStock = this.stock > 0;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
