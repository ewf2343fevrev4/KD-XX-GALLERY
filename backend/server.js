const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
require('dotenv').config();

console.log('Starting server...');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
  }
});

app.set('io', io);

// Socket.io connection handlers
io.on('connection', (socket) => {
  socket.on('join_conversation', (conversationId) => {
    if (conversationId) {
      socket.join(`conversation_${conversationId}`);
    }
  });

  socket.on('leave_conversation', (conversationId) => {
    if (conversationId) {
      socket.leave(`conversation_${conversationId}`);
    }
  });

  socket.on('admin_join', () => {
    socket.join('admin_inbox');
  });

  socket.on('typing', ({ conversationId, role, isTyping }) => {
    if (conversationId) {
      socket.to(`conversation_${conversationId}`).emit('user_typing', { role, isTyping });
    }
  });
});

app.use(cors());
app.use(express.json());

// Kết nối database
connectDB();

const { ensureTryOnIndexes } = require('./utils/ensureLedgerIndexes');
const { getJwtSecret } = require('./utils/jwtConfig');
const { fetchSafeRemoteImage, PROXY_ALLOWED_MIME_TYPES } = require('./utils/ssrfImageFetcher');

// Handle MongoDB connection events
mongoose.connection.on('connected', async () => {
  console.log('Mongoose connected to MongoDB');
  try {
    await ensureTryOnIndexes(mongoose);
  } catch (err) {
    console.error('⚠️ [Index Audit] ensureTryOnIndexes warning:', err.message);
  }
});

mongoose.connection.on('error', (err) => {
  console.log('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// User Schema
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId && !this.facebookId;
    },
    minlength: 6
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  googleId: {
    type: String,
    sparse: true
  },
  facebookId: {
    type: String,
    sparse: true
  },
  avatar: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  phone: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  postalCode: {
    type: String,
    default: ''
  },
  country: {
    type: String,
    default: 'Vietnam'
  },
  birthDate: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    enum: ['', 'male', 'female', 'other'],
    default: ''
  },
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: []
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.password || !this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

// JWT token generation
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const verifyToken = async (token) => {
  try {
    if (!token) return null;
    const decoded = jwt.verify(token, getJwtSecret());
    return await User.findById(decoded.id);
  } catch (error) {
    return null;
  }
};

const createDefaultAdmin = async () => {
  try {
    const adminEmail = 'admin123@gmail.com';
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (!existingAdmin) {
      await User.create({
        name: 'Admin',
        email: adminEmail,
        password: 'admin123',
        role: 'admin',
        wishlist: []
      });
      console.log('✅ Default admin created:', adminEmail);
    } else {
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('✅ Updated existing user to admin:', adminEmail);
      } else {
        console.log('ℹ️ Admin already exists:', adminEmail);
      }
    }
  } catch (error) {
    console.error('❌ Error creating default admin:', error);
  }
};

// Gọi hàm khi MongoDB kết nối xong
mongoose.connection.once('open', async () => {
  console.log('✅ MongoDB connected successfully');
  await createDefaultAdmin();
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'AMIRI API Server is running!' });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend is working!',
    mongoStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// ✅ IMPORT PRODUCT ROUTES
const productRoutes = require('./routes/productRoutes');
app.use('/api/products', productRoutes);

// ✅ IMPORT ORDER ROUTES
const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);

// ✅ SEPAY PAYMENT & WEBHOOK ROUTES
const sepayRoutes = require('./routes/sepayRoutes');
app.use('/api/sepay', sepayRoutes);

// ✅ ADMIN ROUTES
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// ✅ KD-XX INTELLIGENCE / AI ADMIN OPERATIONS ROUTES
const aiAdminRoutes = require('./routes/aiAdminRoutes');
app.use('/api/admin/ai', aiAdminRoutes);

// ✅ CAMPAIGN MEDIA / ADS ROUTES
const campaignMediaRoutes = require('./routes/campaignMediaRoutes');
app.use('/api/campaign-media', campaignMediaRoutes);

// ✅ CUSTOMER REVIEWS & RATINGS ROUTES
const reviewRoutes = require('./routes/reviewRoutes');
app.use('/api/reviews', reviewRoutes);

// ✅ CUSTOMER SUPPORT CHAT ROUTES
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chat', chatRoutes);

// ✅ NEWSLETTER & EMAIL MARKETING ROUTES (Brevo)
const newsletterRoutes = require('./routes/newsletterRoutes');
app.use('/api/newsletter', newsletterRoutes);

// ✅ KD-XX VIRTUAL TRY-ON AI MODULE ROUTES (Google Cloud Vertex AI)
const tryOnRoutes = require('./routes/tryOnRoutes');
app.use('/api/tryon', tryOnRoutes);

// ✅ KD-XX VIRTUAL TRY-ON RETENTION SCHEDULER (Singleton distributed lock purge)
const tryOnCleanupScheduler = require('./services/tryOnCleanupScheduler');
tryOnCleanupScheduler.start();

// ✅ OAUTH ROUTES (Google & Facebook)
const createAuthRouter = require('./routes/authRoutes');
app.use('/api/auth', createAuthRouter(User, generateToken));

// ✅ IMAGE PROXY FOR FIT LAB & EXTERNAL CDNs (Shared SSRF, DNS-rebinding & Magic Bytes Guard)
const MAX_PROXY_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB

app.get('/api/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    const result = await fetchSafeRemoteImage(url, {
      maxBytes: MAX_PROXY_IMAGE_BYTES,
      timeoutMs: 6000,
      allowedMimeTypes: PROXY_ALLOWED_MIME_TYPES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });

    res.setHeader('Content-Type', result.headerMimeType || result.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(result.buffer);
  } catch (error) {
    console.error('Image proxy error:', error.code || '', error.message);
    if (!res.headersSent) {
      return res.status(error.statusCode || 500).json({ message: error.message });
    }
  }
});

// Register user
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    console.log('Registration attempt:', { name, email, passwordLength: password?.length });
    
    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Please provide name, email, and password'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long'
      });
    }
    
    console.log('Checking if user exists...');
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('User already exists');
      return res.status(400).json({
        message: 'User already exists with this email'
      });
    }
    
    console.log('Creating new user...');
    const newUser = await User.create({
      name,
      email,
      password,
      wishlist: []
    });
    
    const token = generateToken(newUser._id);
    
    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      token: token
    });
    
    console.log(`New user registered successfully: ${email}`);
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login user
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt:', { email });
    
    if (!email || !password) {
      return res.status(400).json({
        message: 'Please provide email and password'
      });
    }
    
    console.log('Finding user...');
    const user = await User.findOne({ email }).select('+password');
    
    if (user && (await user.matchPassword(password))) {
      const token = generateToken(user._id);
      
      res.json({
        token: token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
          authProvider: user.authProvider || 'local',
          phone: user.phone || '',
          address: user.address || '',
          city: user.city || '',
          postalCode: user.postalCode || '',
          country: user.country || 'Vietnam',
          birthDate: user.birthDate || '',
          gender: user.gender || '',
          createdAt: user.createdAt,
          wishlistCount: user.wishlist?.length || 0
        }
      });
      
      console.log(`User logged in successfully: ${email}`);
    } else {
      console.log('Invalid credentials');
      res.status(401).json({
        message: 'Invalid email or password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify token
app.get('/api/users/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = await verifyToken(token);
    
    if (user) {
      res.json({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
          authProvider: user.authProvider || 'local',
          phone: user.phone || '',
          address: user.address || '',
          city: user.city || '',
          postalCode: user.postalCode || '',
          country: user.country || 'Vietnam',
          birthDate: user.birthDate || '',
          gender: user.gender || '',
          createdAt: user.createdAt,
          wishlistCount: user.wishlist?.length || 0
        }
      });
    } else {
      res.status(401).json({ message: 'Invalid token' });
    }
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ✅ WISHLIST ROUTES
const Product = require('./models/Product');

// Get user wishlist
app.get('/api/users/wishlist', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = await verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    const userWithWishlist = await User.findById(user._id).populate('wishlist');
    
    res.json({
      wishlist: userWithWishlist.wishlist || []
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add to wishlist
app.post('/api/users/wishlist/add', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = await verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    const { productId } = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    if (!user.wishlist.includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }
    
    res.json({ message: 'Product added to wishlist' });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove from wishlist
app.post('/api/users/wishlist/remove', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = await verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    const { productId } = req.body;
    
    user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    await user.save();
    
    res.json({ message: 'Product removed from wishlist' });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile
app.get('/api/users/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = await verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        address: user.address || '',
        city: user.city || '',
        postalCode: user.postalCode || '',
        country: user.country || 'Vietnam',
        birthDate: user.birthDate || '',
        gender: user.gender || '',
        role: user.role || 'user',
        avatar: user.avatar || '',
        authProvider: user.authProvider || 'local',
        createdAt: user.createdAt,
        wishlistCount: user.wishlist?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
app.put('/api/users/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = await verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    const { name, email, phone, address, city, postalCode, country, birthDate, gender } = req.body;
    
    console.log('Update profile attempt:', { userId: user._id, name, email });
    
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          message: 'Email đã được sử dụng bởi người dùng khác'
        });
      }
    }
    
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone !== undefined ? phone : user.phone;
    user.address = address !== undefined ? address : user.address;
    user.city = city !== undefined ? city : user.city;
    user.postalCode = postalCode !== undefined ? postalCode : user.postalCode;
    user.country = country !== undefined ? country : user.country;
    user.birthDate = birthDate !== undefined ? birthDate : user.birthDate;
    user.gender = gender !== undefined ? gender : user.gender;
    
    await user.save();
    
    res.json({
      message: 'Cập nhật thành công',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        address: user.address || '',
        city: user.city || '',
        postalCode: user.postalCode || '',
        country: user.country || 'Vietnam',
        birthDate: user.birthDate || '',
        gender: user.gender || '',
        role: user.role || 'user',
        avatar: user.avatar || '',
        authProvider: user.authProvider || 'local',
        createdAt: user.createdAt,
        wishlistCount: user.wishlist?.length || 0
      }
    });
    
    console.log(`Profile updated successfully: ${user.email}`);
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      message: 'Lỗi server khi cập nhật thông tin',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Serve static frontend in production if build exists
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const fs = require('fs');
  const buildPath = path.resolve(__dirname, '../frontend/build');
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  }
}

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  try {
    tryOnCleanupScheduler.stop();
  } catch (e) {}
  try {
    require('./services/tryOnQueueService').stopWorkerLoop();
  } catch (e) {}
  await mongoose.connection.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API endpoints:`);
  console.log(`- GET /api/products - Get all products (from MongoDB)`);
  console.log(`- GET /api/products/:id - Get single product`);
  console.log(`- POST /api/users/register - Register user`);
  console.log(`- POST /api/users/login - Login user`);
  console.log(`- GET /api/users/verify - Verify token`);
  console.log(`- GET /api/users/profile - Get user profile`);
  console.log(`- PUT /api/users/profile - Update user profile`);
  console.log(`- GET /api/users/wishlist - Get user wishlist`);
  console.log(`- POST /api/users/wishlist/add - Add to wishlist`);
  console.log(`- POST /api/users/wishlist/remove - Remove from wishlist`);
  console.log(`- GET /api/auth/google - Google OAuth 2.0 Login`);
  console.log(`- GET /api/auth/facebook - Facebook OAuth Login`);
  console.log(`- POST /api/orders - Create new order`);
  console.log(`- GET /api/orders/myorders - Get user orders`);
  console.log(`- GET /api/orders/:id - Get order by ID`);
  console.log(`- SePay Webhook: POST /api/sepay/webhook`);
  console.log(`- Customer Support Chat: /api/chat/* & Socket.IO real-time`);
  console.log(`- Newsletter & Email Marketing: /api/newsletter/*`);
  console.log(`- Admin routes: /api/admin/*`);
});