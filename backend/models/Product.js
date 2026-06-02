const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  description: {
    type: String,
    required: false, // ✅ ĐỔI THÀNH false
    default: 'Sản phẩm chất lượng cao từ AMIRI' // ✅ THÊM default
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: 0
  },
  // ✅ Cho phép lưu nhiều ảnh (images), hoặc 1 ảnh image/imageUrl
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
    default: '' // ✅ Cho phép có 1 ảnh duy nhất (tương thích code cũ)
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: ['men', 'women', 'accessories', 'shoes', 'clothing']
  },
  sizes: [{
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  }],
  colors: [String],
  brand: {
    type: String,
    default: 'AMIRI' // ✅ THÊM default
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
  }
}, {
  timestamps: true
});

// ✅ Virtual property để luôn trả về ảnh đầu tiên
productSchema.virtual('mainImage').get(function () {
  return this.images?.[0] || this.image || null;
});

// ✅ Đảm bảo khi tạo/update, images và image luôn sync
productSchema.pre('save', function(next) {
  // Nếu có images array nhưng chưa có image, lấy phần tử đầu
  if (this.images?.length && !this.image) {
    this.image = this.images[0];
  }
  // Nếu có image nhưng images rỗng, đưa image vào images
  if (this.image && !this.images?.length) {
    this.images = [this.image];
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);