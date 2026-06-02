const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Định nghĩa Schema người dùng
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false // Không trả về password khi query (BẢO MẬT)
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  avatar: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  phone: String,
  wishlist: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }
  ],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Hash password trước khi lưu
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12); // tăng độ bảo mật
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// So sánh mật khẩu khi đăng nhập
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Virtual field để kiểm tra quyền admin (không trùng với field thật)
userSchema.virtual('isAdminVirtual').get(function () {
  return this.role === 'admin';
});

// ✅ Cách export tránh lỗi "Cannot overwrite `User` model once compiled"
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
