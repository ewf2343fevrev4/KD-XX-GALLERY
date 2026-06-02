const express = require('express');
const {
  registerUser,
  authUser,
  getUserProfile,
  updateUserProfile
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', authUser);
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile); // 👈 thêm PUT update profile

module.exports = router;