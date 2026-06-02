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
    if (product) res.json(product);
    else res.status(404).json({ message: 'Product not found' });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      quantity,
      featured,
      image,
      imageUrl,
      images
    } = req.body;

    const product = new Product({
      name,
      description,
      price,
      category,
      sizes,
      colors,
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

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};
