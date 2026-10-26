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

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
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
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const verifyToken = async (token) => {
  try {
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
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

// ✅ OAUTH ROUTES (Google & Facebook)
const createAuthRouter = require('./routes/authRoutes');
app.use('/api/auth', createAuthRouter(User, generateToken));

// ✅ IMAGE PROXY FOR FIT LAB & EXTERNAL CDNs (Protected against SSRF & Resource Exhaustion)
const dns = require('dns');
const https = require('https');
const net = require('net');

// Verified luxury fashion and media CDN hostnames for KD-XX
const DEFAULT_ALLOWED_HOSTS = new Set([
  'res.cloudinary.com',
  'image-raw.reversible.com',
  'cdn.clothbase.com',
  'amiri.com',
  'cdn-images.farfetch-contents.com',
  'img.ssensemedia.com',
  'hrd-live.cdn.scayle.cloud',
  'holtrenfrew.scene7.com',
  'media.neimanmarcus.com',
  'club21.com',
  'product.hstatic.net',
  'images.unsplash.com'
]);

function getAllowedHosts() {
  const hosts = new Set(DEFAULT_ALLOWED_HOSTS);
  if (process.env.ALLOWED_IMAGE_HOSTS) {
    process.env.ALLOWED_IMAGE_HOSTS.split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean)
      .forEach(h => hosts.add(h));
  }
  return hosts;
}

function isForbiddenIP(ip) {
  if (typeof ip !== 'string') return true;
  const cleanIp = ip.toLowerCase().trim();
  // IPv4 Loopback
  if (cleanIp.startsWith('127.')) return true;
  // Private IPv4 (RFC 1918)
  if (cleanIp.startsWith('10.') || cleanIp.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)) return true;
  // Link-local / Cloud Metadata (169.254.0.0/16)
  if (cleanIp.startsWith('169.254.')) return true;
  // Current network / Broadcast
  if (cleanIp.startsWith('0.') || cleanIp === '255.255.255.255') return true;
  // IPv6 Loopback, Unspecified, Unique local, Link-local, IPv4-mapped IPv6
  if (cleanIp === '::1' || cleanIp === '::' || cleanIp.startsWith('fc') || cleanIp.startsWith('fd') || cleanIp.startsWith('fe80:') || cleanIp.startsWith('::ffff:')) return true;
  return false;
}

// Custom HTTPS Agent with socket-level DNS verification against DNS Rebinding & Private IPs
const ssrfProtectedAgent = new https.Agent({
  keepAlive: true,
  timeout: 6000,
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) return callback(err);
      if (Array.isArray(address)) {
        for (const item of address) {
          if (isForbiddenIP(item.address)) {
            return callback(new Error('SSRF_FORBIDDEN_IP: Target resolves to forbidden IP'));
          }
        }
      } else if (isForbiddenIP(address)) {
        return callback(new Error('SSRF_FORBIDDEN_IP: Target resolves to forbidden IP'));
      }
      callback(null, address, family);
    });
  }
});

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif'
]);
const MAX_PROXY_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MiB

app.get('/api/proxy-image', (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ message: 'URL hình ảnh không hợp lệ' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch (e) {
      return res.status(400).json({ message: 'Định dạng URL không hợp lệ' });
    }

    // 1. Strict HTTPS protocol check
    if (parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ message: 'Chỉ chấp nhận giao thức HTTPS an toàn' });
    }

    // 2. Reject credentials in URL
    if (parsedUrl.username || parsedUrl.password) {
      return res.status(400).json({ message: 'URL không được chứa thông tin xác thực' });
    }

    // 3. Reject non-standard ports
    if (parsedUrl.port && parsedUrl.port !== '443') {
      return res.status(400).json({ message: 'Cổng kết nối không được phép' });
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // 4. Reject direct IP addresses
    if (net.isIP(hostname)) {
      return res.status(403).json({ message: 'Không cho phép truy cập qua địa chỉ IP trực tiếp' });
    }

    // 5. Hostname whitelist check (exact match or approved subdomain)
    const allowedHosts = getAllowedHosts();
    let isAllowed = allowedHosts.has(hostname);
    if (!isAllowed) {
      for (const domain of allowedHosts) {
        if (hostname.endsWith('.' + domain)) {
          isAllowed = true;
          break;
        }
      }
    }

    if (!isAllowed) {
      return res.status(403).json({ message: 'Tên miền hình ảnh không nằm trong danh mục được phép' });
    }

    // 6. Connect using ssrfProtectedAgent (socket-level DNS verification against DNS Rebinding)
    const options = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      agent: ssrfProtectedAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    };

    const proxyReq = https.request(options, (remoteRes) => {
      // 7. Reject redirects
      if (remoteRes.statusCode >= 300 && remoteRes.statusCode < 400) {
        remoteRes.resume();
        return res.status(403).json({ message: 'Chuyển hướng không được phép' });
      }

      if (remoteRes.statusCode !== 200) {
        remoteRes.resume();
        return res.status(remoteRes.statusCode).json({ message: 'Không thể tải ảnh từ máy chủ gốc' });
      }

      // 8. Validate Content-Type
      const rawContentType = (remoteRes.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      if (!ALLOWED_MIME_TYPES.has(rawContentType)) {
        remoteRes.resume();
        return res.status(415).json({ message: 'Định dạng tệp không được hỗ trợ hoặc có rủi ro bảo mật' });
      }

      // 9. Read stream with strict byte counting (up to 10 MiB)
      let totalBytes = 0;
      const chunks = [];
      let exceededLimit = false;

      remoteRes.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_PROXY_IMAGE_BYTES) {
          exceededLimit = true;
          remoteRes.destroy();
          return res.status(413).json({ message: 'Kích thước tệp vượt quá giới hạn 10MB' });
        }
        chunks.push(chunk);
      });

      remoteRes.on('end', () => {
        if (exceededLimit) return;
        const imageBuffer = Buffer.concat(chunks);
        res.setHeader('Content-Type', rawContentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(imageBuffer);
      });

      remoteRes.on('error', (err) => {
        console.error('Remote image stream error:', err.message);
        if (!res.headersSent) {
          res.status(502).json({ message: 'Lỗi đường truyền khi tải ảnh' });
        }
      });
    });

    proxyReq.setTimeout(6000, () => {
      proxyReq.destroy(new Error('TIMEOUT'));
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy image request error:', err.message);
      if (res.headersSent) return;
      if (err.message && err.message.includes('SSRF_FORBIDDEN_IP')) {
        return res.status(403).json({ message: 'Địa chỉ IP đích không được phép' });
      }
      if (err.message === 'TIMEOUT') {
        return res.status(504).json({ message: 'Thời gian chờ tải ảnh quá hạn' });
      }
      res.status(502).json({ message: 'Không thể kết nối đến máy chủ chứa ảnh' });
    });

    proxyReq.end();
  } catch (error) {
    console.error('Image proxy general error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Lỗi xử lý yêu cầu tải ảnh' });
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

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

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