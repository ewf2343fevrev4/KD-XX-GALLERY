const Product = require('../models/Product');

// 📌 Lấy tất cả sản phẩm
const getProducts = async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📌 Lấy sản phẩm theo ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    if (error.name === 'CastError' || error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ message: error.message });
  }
};

// 📌 Lấy tất cả tags và tags phân theo danh mục
const getProductTags = async (req, res) => {
  try {
    const products = await Product.find({}, 'category tags');
    const allTagsSet = new Set();
    const byCategory = {
      all: new Set(),
      men: new Set(),
      women: new Set(),
      accessories: new Set(),
      shoes: new Set()
    };

    products.forEach(p => {
      const cat = (p.category || '').toLowerCase().trim();
      if (Array.isArray(p.tags)) {
        p.tags.forEach(rawTag => {
          const t = rawTag ? rawTag.trim() : '';
          if (t) {
            allTagsSet.add(t);
            byCategory.all.add(t);
            if (byCategory[cat]) {
              byCategory[cat].add(t);
            }
          }
        });
      }
    });

    res.json({
      success: true,
      tags: Array.from(allTagsSet),
      byCategory: {
        all: Array.from(byCategory.all),
        men: Array.from(byCategory.men),
        women: Array.from(byCategory.women),
        accessories: Array.from(byCategory.accessories),
        shoes: Array.from(byCategory.shoes)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 📌 Tạo sản phẩm (chấp nhận image, imageUrl hoặc images[])
const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category,
      sizes,
      colors,
      tags,
      quantity,
      featured,
      image,
      imageUrl,
      images
    } = req.body;

    let parsedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        try {
          parsedTags = JSON.parse(tags);
        } catch (e) {
          parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
        }
      } else if (Array.isArray(tags)) {
        parsedTags = tags.map(t => typeof t === 'string' ? t.trim() : '').filter(Boolean);
      }
    }

    const product = new Product({
      name,
      description,
      price,
      category,
      sizes,
      colors,
      tags: parsedTags,
      quantity,
      featured,
      inStock: quantity > 0,
      // ✅ Ưu tiên images[], nếu không có thì dùng image hoặc imageUrl
      images: images?.length ? images : [image || imageUrl].filter(Boolean)
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 📌 Cập nhật sản phẩm
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      category,
      sizes,
      colors,
      tags,
      quantity,
      featured,
      image,
      imageUrl,
      images
    } = req.body;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.name = name || product.name;
    product.description = description || product.description;
    product.price = price || product.price;
    product.category = category || product.category;
    product.sizes = sizes || product.sizes;
    product.colors = colors || product.colors;
    if (tags !== undefined) {
      let parsedTags = [];
      if (typeof tags === 'string') {
        try {
          parsedTags = JSON.parse(tags);
        } catch (e) {
          parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
        }
      } else if (Array.isArray(tags)) {
        parsedTags = tags.map(t => typeof t === 'string' ? t.trim() : '').filter(Boolean);
      }
      product.tags = parsedTags;
    }
    product.quantity = quantity ?? product.quantity;
    product.featured = featured ?? product.featured;
    product.inStock = (quantity ?? product.quantity) > 0;
    // ✅ Cập nhật hình ảnh linh hoạt
    product.images = images?.length
      ? images
      : [image || imageUrl].filter(Boolean).length
      ? [image || imageUrl]
      : product.images;

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 📌 Xóa sản phẩm
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      await product.deleteOne();
      res.json({ message: 'Product removed' });
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📌 Lấy danh sách sản phẩm curated cho trang Campaign:
// - bestSellers: Các sản phẩm có lượt mua nhiều nhất từ Order
// - featured: Các sản phẩm được gắn tag nổi bật / featured: true từ trang Admin
const getCampaignCuratedProducts = async (req, res) => {
  try {
    // 1. Lấy sản phẩm bán chạy nhất từ bảng Order
    let bestSellerProducts = [];
    try {
      const Order = require('../models/Order');
      const topOrders = await Order.aggregate([
        { $match: { 'orderItems.0': { $exists: true } } },
        { $unwind: '$orderItems' },
        {
          $group: {
            _id: '$orderItems.product',
            totalQuantity: { $sum: '$orderItems.quantity' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalQuantity: -1, orderCount: -1 } },
        { $limit: 8 }
      ]);

      if (topOrders && topOrders.length > 0) {
        const productIds = topOrders.map(o => o._id).filter(Boolean);
        const found = await Product.find({ _id: { $in: productIds } });
        // Giữ đúng thứ tự bán chạy
        const productMap = new Map(found.map(p => [p._id.toString(), p]));
        bestSellerProducts = productIds
          .map(id => productMap.get(id.toString()))
          .filter(Boolean);
      }
    } catch (aggErr) {
      console.warn('Order aggregation warning:', aggErr.message);
    }

    // Fallback nếu chưa có nhiều đơn hàng: Lấy sản phẩm có rating/lượt review cao hoặc mới nhất
    if (bestSellerProducts.length < 4) {
      const existingIds = new Set(bestSellerProducts.map(p => p._id.toString()));
      const fallback = await Product.find({
        _id: { $nin: Array.from(existingIds) },
        category: { $in: ['men', 'shoes', 'clothing', 'accessories'] }
      })
        .sort({ numReviews: -1, rating: -1, createdAt: -1 })
        .limit(8 - bestSellerProducts.length);
      bestSellerProducts = [...bestSellerProducts, ...fallback];
    }

    // 2. Lấy sản phẩm được gắn tag nổi bật (featured: true hoặc tags chứa featured/nổi bật)
    const bestSellerIdSet = new Set(bestSellerProducts.map(p => p._id.toString()));
    let featuredProducts = await Product.find({
      $or: [
        { featured: true },
        { tags: { $in: ['featured', 'nổi bật', 'highlight', 'hot', 'best'] } }
      ]
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(8);

    // Nếu thiếu, lấy thêm các sản phẩm women/clothing/accessories mới nhất để đảm bảo đủ sản phẩm
    if (featuredProducts.length < 4) {
      const featIds = new Set(featuredProducts.map(p => p._id.toString()));
      const extra = await Product.find({
        _id: { $nin: Array.from(new Set([...featIds, ...bestSellerIdSet])) }
      })
        .sort({ createdAt: -1 })
        .limit(8 - featuredProducts.length);
      featuredProducts = [...featuredProducts, ...extra];
    }

    res.json({
      success: true,
      bestSellers: bestSellerProducts.slice(0, 8),
      featured: featuredProducts.slice(0, 8)
    });
  } catch (error) {
    console.error('Error fetching campaign curated products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  getProductTags,
  getCampaignCuratedProducts,
  createProduct,
  updateProduct,
  deleteProduct
};
