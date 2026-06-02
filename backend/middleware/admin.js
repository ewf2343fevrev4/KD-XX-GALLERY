const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware kiểm tra user đã đăng nhập
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Lấy token từ header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Lấy user từ database (không lấy password)
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'User không tồn tại' });
      }

      next();
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ message: 'Token không hợp lệ' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Không có token, truy cập bị từ chối' });
  }
};

// Middleware kiểm tra quyền admin
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Chỉ admin mới có quyền truy cập' });
  }
};

module.exports = { protect, admin };