/**
 * KD-XX Intelligence — AI Admin Task Registry
 * Central registry mapping taskId to data aggregators, system prompts, and validation rules.
 * All mathematical and financial computations are executed in pure Node.js (Ground Truth).
 * Gemini AI only receives aggregated metrics to provide analysis, insights, and recommendations.
 */

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

const TASK_REGISTRY = {
  // ========================================================
  // 1. AI KẾ TOÁN — MONTHLY FINANCIAL REPORT
  // ========================================================
  monthly_financial_report: {
    id: 'monthly_financial_report',
    title: 'Báo cáo Tài chính Tháng',
    role: 'AI Kế toán trưởng',
    badge: 'KẾ TOÁN TRƯỞNG NỘI BỘ',
    icon: 'Receipt',
    color: 'emerald',
    description: 'Đối soát tổng giá trị đơn hàng, doanh thu thực nhận (đã thanh toán), dòng tiền SePay/COD/Thẻ và chênh lệch thanh toán theo tháng.',
    paramSchema: {
      month: { type: 'number', min: 1, max: 12, default: () => new Date().getMonth() + 1 },
      year: { type: 'number', min: 2024, max: 2030, default: () => new Date().getFullYear() }
    },
    systemInstruction: `Bạn là Kế toán trưởng nội bộ của thương hiệu thời trang cao cấp KD-XX (AMIRI).
Nhiệm vụ của bạn là giải thích báo cáo tài chính hàng tháng cho Quản trị viên (Admin) một cách chặt chẽ, chuyên nghiệp và trung thực.

NGUYÊN TẮC BẮT BUỘC:
1. KHÔNG đồng nhất Tổng giá trị đơn hàng (Gross Order Value) với Doanh thu thực nhận (Realized Revenue).
2. KHÔNG tự bịa ra Giá vốn hàng bán (COGS), Chi phí vận hành, hay Lợi nhuận ròng (Net Profit) nếu dữ liệu backend ghi nhận "hasCostData: false". Hãy nêu rõ ràng việc hệ thống hiện chưa có trường giá vốn nên chưa thể kết luận về lợi nhuận ròng.
3. Chỉ dựa trên các con số thật do backend cung cấp, không tự suy diễn số liệu.
4. Đưa ra các khuyến nghị kiểm soát dòng tiền, đơn hàng chưa thanh toán và quản trị rủi ro thanh toán.
5. Ngôn ngữ: Tiếng Việt trang trọng, mạch lạc, thuật ngữ tài chính chuẩn xác.`,

    async fetchAndComputeData(params = {}) {
      const now = new Date();
      const month = Number(params.month) || (now.getMonth() + 1);
      const year = Number(params.year) || now.getFullYear();

      // Define exact month boundaries (UTC)
      const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      // Previous month boundaries for period-over-period comparison
      const prevStart = new Date(Date.UTC(year, month - 2, 1, 0, 0, 0));
      const prevEnd = new Date(Date.UTC(year, month - 1, 0, 23, 59, 59, 999));

      const [currentOrders, prevOrders] = await Promise.all([
        Order.find({ createdAt: { $gte: startOfMonth, $lte: endOfMonth } }).lean(),
        Order.find({ createdAt: { $gte: prevStart, $lte: prevEnd } }).lean()
      ]);

      // Calculate current month financial metrics
      let totalGrossOrderValue = 0;
      let realizedRevenue = 0;
      let realizedRevenueVND = 0;
      let paidOrderCount = 0;
      let unpaidOrderCount = 0;
      let cancelledOrderCount = 0;
      let activeOrderCount = 0;
      const paymentMethodsBreakdown = {
        sepay: { count: 0, totalUSD: 0, realizedUSD: 0 },
        cod: { count: 0, totalUSD: 0, realizedUSD: 0 },
        credit_card: { count: 0, totalUSD: 0, realizedUSD: 0 },
        other: { count: 0, totalUSD: 0, realizedUSD: 0 }
      };

      for (const order of currentOrders) {
        const orderTotal = Number(order.total || order.totalPrice || 0);
        const method = (order.paymentMethod || 'other').toLowerCase();
        const methodKey = paymentMethodsBreakdown[method] ? method : 'other';

        paymentMethodsBreakdown[methodKey].count += 1;
        paymentMethodsBreakdown[methodKey].totalUSD += orderTotal;

        const isCancelled = order.orderStatus === 'cancelled' || order.status === 'cancelled';
        if (isCancelled) {
          cancelledOrderCount += 1;
          continue; // Cancelled orders excluded from gross revenue
        }

        activeOrderCount += 1;
        totalGrossOrderValue += orderTotal;

        if (order.isPaid) {
          paidOrderCount += 1;
          realizedRevenue += orderTotal;
          realizedRevenueVND += Number(order.amountVND || 0);
          paymentMethodsBreakdown[methodKey].realizedUSD += orderTotal;
        } else {
          unpaidOrderCount += 1;
        }
      }

      // Calculate previous month comparison
      let prevGrossOrderValue = 0;
      let prevRealizedRevenue = 0;
      let prevActiveOrders = 0;
      for (const order of prevOrders) {
        const isCancelled = order.orderStatus === 'cancelled' || order.status === 'cancelled';
        if (isCancelled) continue;
        const total = Number(order.total || order.totalPrice || 0);
        prevGrossOrderValue += total;
        prevActiveOrders += 1;
        if (order.isPaid) {
          prevRealizedRevenue += total;
        }
      }

      const grossGrowthPct = prevGrossOrderValue > 0 
        ? ((totalGrossOrderValue - prevGrossOrderValue) / prevGrossOrderValue) * 100 
        : null;
      const revenueGrowthPct = prevRealizedRevenue > 0 
        ? ((realizedRevenue - prevRealizedRevenue) / prevRealizedRevenue) * 100 
        : null;
      const orderGrowthPct = prevActiveOrders > 0 
        ? ((activeOrderCount - prevActiveOrders) / prevActiveOrders) * 100 
        : null;

      const aov = activeOrderCount > 0 ? (totalGrossOrderValue / activeOrderCount) : 0;
      const paymentCollectionRate = totalGrossOrderValue > 0 ? (realizedRevenue / totalGrossOrderValue) * 100 : 0;

      return {
        period: {
          month,
          year,
          label: `Tháng ${month}/${year}`,
          startDate: startOfMonth.toISOString().slice(0, 10),
          endDate: endOfMonth.toISOString().slice(0, 10)
        },
        metrics: {
          totalOrders: currentOrders.length,
          activeOrders: activeOrderCount,
          cancelledOrders: cancelledOrderCount,
          paidOrders: paidOrderCount,
          unpaidOrders: unpaidOrderCount,
          totalGrossOrderValue: Math.round(totalGrossOrderValue * 100) / 100,
          realizedRevenue: Math.round(realizedRevenue * 100) / 100,
          realizedRevenueVND,
          unpaidAmount: Math.round((totalGrossOrderValue - realizedRevenue) * 100) / 100,
          paymentCollectionRate: Math.round(paymentCollectionRate * 10) / 10,
          averageOrderValue: Math.round(aov * 100) / 100,
          paymentMethods: paymentMethodsBreakdown,
          comparison: {
            prevMonthOrders: prevActiveOrders,
            prevGrossOrderValue: Math.round(prevGrossOrderValue * 100) / 100,
            prevRealizedRevenue: Math.round(prevRealizedRevenue * 100) / 100,
            grossGrowthPct: grossGrowthPct !== null ? Math.round(grossGrowthPct * 10) / 10 : null,
            revenueGrowthPct: revenueGrowthPct !== null ? Math.round(revenueGrowthPct * 10) / 10 : null,
            orderGrowthPct: orderGrowthPct !== null ? Math.round(orderGrowthPct * 10) / 10 : null
          },
          dataLimitations: {
            hasCostPrice: false,
            hasOperatingExpenses: false,
            netProfitCalculable: false,
            notes: 'Database hiện chưa lưu giá vốn hàng bán (costPrice) và chi phí vận hành (marketing, kho bãi, nhân sự). Do đó không có cơ sở xác định Lợi nhuận gộp và Lợi nhuận ròng.'
          }
        }
      };
    },

    formatPrompt(data) {
      return `BÁO CÁO TÀI CHÍNH THỰC TẾ TỪ CƠ SỞ DỮ LIỆU (${data.period.label}):
- Kỳ báo cáo: Từ ${data.period.startDate} đến ${data.period.endDate}
- Tổng số đơn phát sinh: ${data.metrics.totalOrders} đơn (${data.metrics.activeOrders} đơn hợp lệ, ${data.metrics.cancelledOrders} đơn đã hủy)
- TỔNG GIÁ TRỊ ĐƠN ĐẶT (Gross Order Value): $${data.metrics.totalGrossOrderValue.toLocaleString()} USD
- DOANH THU THỰC NHẬN (Realized Revenue - Đã thanh toán): $${data.metrics.realizedRevenue.toLocaleString()} USD (${data.metrics.realizedRevenueVND.toLocaleString()} VND)
- KHOẢN CHƯA THU (Unpaid / Chờ COD): $${data.metrics.unpaidAmount.toLocaleString()} USD (${data.metrics.unpaidOrders} đơn)
- Tỷ lệ thu hồi tiền (Collection Rate): ${data.metrics.paymentCollectionRate}%
- Giá trị đơn trung bình (AOV): $${data.metrics.averageOrderValue.toLocaleString()} USD

SO SÁNH VỚI THÁNG TRƯỚC:
- Số đơn tháng trước: ${data.metrics.comparison.prevMonthOrders} đơn
- Doanh thu thực nhận tháng trước: $${data.metrics.comparison.prevRealizedRevenue.toLocaleString()} USD
- Tăng trưởng doanh thu: ${data.metrics.comparison.revenueGrowthPct !== null ? `${data.metrics.comparison.revenueGrowthPct}%` : 'Chưa đủ dữ liệu tháng trước'}

GIỚI HẠN DỮ LIỆU:
${data.metrics.dataLimitations.notes}

Hãy thực hiện phân tích tài chính chuyên môn: đánh giá chất lượng dòng tiền, tỷ lệ đơn chưa thanh toán, rủi ro COD/hủy đơn và các khuyến nghị quản trị dòng tiền.`;
    }
  },

  // ========================================================
  // 2. AI KINH DOANH — BUSINESS PERFORMANCE REPORT
  // ========================================================
  business_performance_report: {
    id: 'business_performance_report',
    title: 'Phân tích Hiệu quả Kinh doanh',
    role: 'AI Chuyên viên Phân tích Kinh doanh',
    badge: 'CHUYÊN VIÊN PHÂN TÍCH KINH DOANH',
    icon: 'TrendingUp',
    color: 'blue',
    description: 'Đánh giá sản phẩm bán chạy, cơ cấu doanh thu theo nhóm hàng thời trang (Men, Women, Shoes, Accessories) và xu hướng bán lẻ.',
    paramSchema: {
      month: { type: 'number', min: 1, max: 12, default: () => new Date().getMonth() + 1 },
      year: { type: 'number', min: 2024, max: 2030, default: () => new Date().getFullYear() }
    },
    systemInstruction: `Bạn là Chuyên viên Phân tích Kinh doanh (BI Analyst) cấp cao của thương hiệu thời trang cao cấp KD-XX.
Nhiệm vụ của bạn là phân tích dữ liệu hiệu quả kinh doanh, cơ cấu sản phẩm và hành vi mua hàng.

NGUYÊN TẮC BẮT BUỘC:
1. Phân biệt rõ: Số lượng sản phẩm bán ra (Units Sold) khác với Số lượt đơn hàng (Order Count) và Doanh thu (Gross Revenue).
2. Dựa chính xác vào bảng thống kê danh mục và sản phẩm do backend cung cấp.
3. Không suy diễn xu hướng khi tập dữ liệu còn nhỏ; nếu số lượng đơn chưa lớn, hãy nêu rõ đây là giai đoạn ban đầu và khuyến nghị mở rộng phễu khách hàng.
4. Ngôn ngữ: Tiếng Việt mang tính chiến lược thương mại, tư vấn danh mục và tối ưu giỏ hàng.`,

    async fetchAndComputeData(params = {}) {
      const now = new Date();
      const month = Number(params.month) || (now.getMonth() + 1);
      const year = Number(params.year) || now.getFullYear();

      const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      const [orders, allProducts] = await Promise.all([
        Order.find({
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          orderStatus: { $ne: 'cancelled' },
          status: { $ne: 'cancelled' }
        }).lean(),
        Product.find().lean()
      ]);

      const productMap = new Map();
      allProducts.forEach(p => productMap.set(String(p._id), p));

      const productSales = {};
      const categorySales = {
        men: { count: 0, revenue: 0, name: 'Thời trang Nam' },
        women: { count: 0, revenue: 0, name: 'Thời trang Nữ' },
        accessories: { count: 0, revenue: 0, name: 'Phụ kiện cao cấp' },
        shoes: { count: 0, revenue: 0, name: 'Giày dép' },
        clothing: { count: 0, revenue: 0, name: 'Quần áo' },
        other: { count: 0, revenue: 0, name: 'Khác' }
      };

      let totalUnitsSold = 0;
      let totalRevenue = 0;
      const customerOrdersCount = {};

      for (const order of orders) {
        const userId = String(order.user || 'anonymous');
        customerOrdersCount[userId] = (customerOrdersCount[userId] || 0) + 1;

        const items = (order.orderItems && order.orderItems.length > 0) ? order.orderItems : (order.items || []);
        for (const item of items) {
          const qty = Number(item.quantity || 1);
          const price = Number(item.price || 0);
          const lineTotal = price * qty;
          const prodId = String(item.product || item._id || item.name);

          totalUnitsSold += qty;
          totalRevenue += lineTotal;

          if (!productSales[prodId]) {
            const productDoc = productMap.get(prodId);
            productSales[prodId] = {
              id: prodId,
              name: item.name || productDoc?.name || 'Sản phẩm KD-XX',
              category: productDoc?.category || 'other',
              unitsSold: 0,
              revenue: 0,
              price: price || productDoc?.price || 0
            };
          }

          productSales[prodId].unitsSold += qty;
          productSales[prodId].revenue += lineTotal;

          const catKey = productSales[prodId].category;
          const safeCat = categorySales[catKey] ? catKey : 'other';
          categorySales[safeCat].count += qty;
          categorySales[safeCat].revenue += lineTotal;
        }
      }

      // Sort top products by revenue
      const topProductsByRevenue = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Sort top products by volume
      const topProductsByVolume = Object.values(productSales)
        .sort((a, b) => b.unitsSold - a.unitsSold)
        .slice(0, 5);

      const uniqueCustomers = Object.keys(customerOrdersCount).length;
      const repeatCustomers = Object.values(customerOrdersCount).filter(c => c > 1).length;
      const repeatRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
      const unitsPerOrder = orders.length > 0 ? (totalUnitsSold / orders.length) : 0;

      return {
        period: {
          month,
          year,
          label: `Tháng ${month}/${year}`
        },
        metrics: {
          totalOrders: orders.length,
          totalUnitsSold,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          averageUnitsPerOrder: Math.round(unitsPerOrder * 10) / 10,
          uniqueCustomers,
          repeatCustomers,
          repeatRate: Math.round(repeatRate * 10) / 10,
          categories: categorySales,
          topProductsByRevenue,
          topProductsByVolume
        }
      };
    },

    formatPrompt(data) {
      const topRevList = data.metrics.topProductsByRevenue.map(p => `- ${p.name} (${p.category}): Đã bán ${p.unitsSold} sản phẩm, Doanh thu: $${p.revenue.toLocaleString()}`).join('\n') || 'Chưa có sản phẩm phát sinh doanh thu trong tháng.';
      const catList = Object.entries(data.metrics.categories).map(([k, v]) => `- ${v.name}: ${v.count} sản phẩm đã bán, Doanh thu: $${Math.round(v.revenue).toLocaleString()}`).join('\n');

      return `BÁO CÁO KINH DOANH THỰC TẾ (${data.period.label}):
- Tổng số đơn hàng thành công/đang xử lý: ${data.metrics.totalOrders} đơn
- Tổng số lượng sản phẩm bán ra: ${data.metrics.totalUnitsSold} chiếc
- Doanh thu hàng bán: $${data.metrics.totalRevenue.toLocaleString()} USD
- Số lượng sản phẩm trung bình trên một đơn (UPT): ${data.metrics.averageUnitsPerOrder}
- Khách hàng quay lại (Repeat Customer Rate): ${data.metrics.repeatRate}% (${data.metrics.repeatCustomers}/${data.metrics.uniqueCustomers} khách)

CƠ CẤU DOANH THU THEO DANH MỤC:
${catList}

TOP SẢN PHẨM BÁN CHẠY NHẤT:
${topRevList}

Hãy nhận định hiệu quả kinh doanh, chỉ ra danh mục chủ lực dẫn dắt doanh số, đánh giá mức độ hấp dẫn của sản phẩm và đề xuất chiến lược kích cầu/bán kèm (cross-sell) cho thời gian tới.`;
    }
  },

  // ========================================================
  // 3. AI QUẢN LÝ KHO — INVENTORY ANALYSIS
  // ========================================================
  inventory_analysis: {
    id: 'inventory_analysis',
    title: 'Phân tích Tồn kho & Cung ứng',
    role: 'AI Quản lý Kho & Chuỗi Cung ứng',
    badge: 'QUẢN LÝ KHO & CHUỖI CUNG ỨNG',
    icon: 'Package',
    color: 'amber',
    description: 'Kiểm kê thực tế số lượng hàng tồn, phát hiện sản phẩm hết hàng hoặc chạm ngưỡng an toàn, phân bổ giá trị danh mục.',
    paramSchema: {
      lowStockThreshold: { type: 'number', min: 1, max: 100, default: 10 }
    },
    systemInstruction: `Bạn là Quản lý Kho và Chuỗi Cung ứng của thương hiệu thời trang cao cấp KD-XX.
Nhiệm vụ của bạn là giám sát tình trạng tồn kho, cảnh báo các mặt hàng sắp hết để tránh đứt gãy kinh doanh.

NGUYÊN TẮC BẮT BUỘC:
1. Giá trị tồn kho hiển thị là Giá trị bán lẻ ước tính theo giá niêm yết (Retail Inventory Value), KHÔNG PHẢI Giá vốn nhập kho (COGS) vì cơ sở dữ liệu hiện chưa có trường giá vốn.
2. Ngưỡng cảnh báo sắp hết hàng là cấu hình do Admin chọn (mặc định <= 10 chiếc), không phải định mức lịch sử.
3. Nêu đích danh các sản phẩm cần nhập thêm hàng gấp.
4. Ngôn ngữ: Tiếng Việt chuyên môn quản lý kho, tập trung vào an toàn tồn kho, rủi ro thiếu hàng và điều phối dòng sản phẩm.`,

    async fetchAndComputeData(params = {}) {
      const threshold = Number(params.lowStockThreshold) || 10;
      const products = await Product.find().lean();

      let totalStockUnits = 0;
      let totalRetailInventoryValue = 0;
      const outOfStock = [];
      const lowStock = [];
      const healthyStock = [];

      const categoryStock = {
        men: { units: 0, value: 0, count: 0, name: 'Nam' },
        women: { units: 0, value: 0, count: 0, name: 'Nữ' },
        accessories: { units: 0, value: 0, count: 0, name: 'Phụ kiện' },
        shoes: { units: 0, value: 0, count: 0, name: 'Giày dép' },
        clothing: { units: 0, value: 0, count: 0, name: 'Quần áo' },
        other: { units: 0, value: 0, count: 0, name: 'Khác' }
      };

      for (const p of products) {
        const stock = Number(p.stock || 0);
        const price = Number(p.price || 0);
        const value = stock * price;
        const cat = p.category || 'other';
        const safeCat = categoryStock[cat] ? cat : 'other';

        totalStockUnits += stock;
        totalRetailInventoryValue += value;

        categoryStock[safeCat].units += stock;
        categoryStock[safeCat].value += value;
        categoryStock[safeCat].count += 1;

        const itemSummary = {
          id: p._id,
          name: p.name,
          category: p.category,
          price: p.price,
          stock,
          retailValue: value
        };

        if (stock <= 0 || p.inStock === false) {
          outOfStock.push(itemSummary);
        } else if (stock <= threshold) {
          lowStock.push(itemSummary);
        } else {
          healthyStock.push(itemSummary);
        }
      }

      // Sort low stock ascending (urgent first)
      lowStock.sort((a, b) => a.stock - b.stock);

      return {
        threshold,
        metrics: {
          totalCatalogProducts: products.length,
          totalStockUnits,
          totalRetailInventoryValue: Math.round(totalRetailInventoryValue),
          outOfStockCount: outOfStock.length,
          lowStockCount: lowStock.length,
          healthyStockCount: healthyStock.length,
          outOfStockItems: outOfStock,
          lowStockItems: lowStock,
          categoryBreakdown: categoryStock,
          valuationNote: 'Giá trị tổng kho được tính theo giá niêm yết bán lẻ (Retail Price) của từng sản phẩm, do hệ thống chưa có trường giá vốn nhập kho.'
        }
      };
    },

    formatPrompt(data) {
      const lowStockList = data.metrics.lowStockItems.map(p => `- ${p.name} (${p.category}): CÒN ${p.stock} CHIẾC (Giá: $${p.price})`).join('\n') || 'Không có sản phẩm nào chạm ngưỡng sắp hết.';
      const outOfStockList = data.metrics.outOfStockItems.map(p => `- ${p.name} (${p.category}): ĐÃ HẾT HÀNG (0 chiếc)`).join('\n') || 'Hiện không có sản phẩm nào bị hết hàng hoàn toàn.';

      return `BÁO CÁO KIỂM KÊ KHO HÀNG THỰC TẾ KD-XX:
- Tổng số mẫu sản phẩm trong danh mục: ${data.metrics.totalCatalogProducts} mẫu
- Tổng số lượng sản phẩm vật lý trong kho: ${data.metrics.totalStockUnits.toLocaleString()} chiếc
- Tổng giá trị kho theo giá niêm yết bán lẻ: $${data.metrics.totalRetailInventoryValue.toLocaleString()} USD
- Ngưỡng cảnh báo sắp hết hàng: <= ${data.threshold} chiếc

CẢNH BÁO TỒN KHO:
- Số sản phẩm ĐÃ HẾT HÀNG (0 chiếc): ${data.metrics.outOfStockCount} mẫu
${outOfStockList}
- Số sản phẩm SẮP HẾT HÀNG (<= ${data.threshold} chiếc): ${data.metrics.lowStockCount} mẫu
${lowStockList}

PHÂN BỔ TỒN KHO THEO DANH MỤC:
${Object.entries(data.metrics.categoryBreakdown).map(([k, v]) => `- ${v.name}: ${v.count} mẫu, ${v.units.toLocaleString()} chiếc, Trị giá: $${Math.round(v.value).toLocaleString()}`).join('\n')}

Hãy đánh giá mức độ an toàn của kho, rủi ro mất doanh số do thiếu hàng ở các mẫu cao cấp sắp hết và lập kế hoạch nhập hàng/tái sản xuất cụ thể cho quản trị viên.`;
    }
  },

  // ========================================================
  // 4. AI VẬN HÀNH ĐƠN HÀNG — ORDER OPERATIONS REPORT
  // ========================================================
  order_operations_report: {
    id: 'order_operations_report',
    title: 'Báo cáo Vận hành Đơn hàng',
    role: 'AI Giám sát Vận hành Đơn hàng',
    badge: 'TRƯỞNG PHÒNG VẬN HÀNH',
    icon: 'Truck',
    color: 'purple',
    description: 'Giám sát tiến độ đóng gói, tỷ lệ đơn hủy, đơn chờ duyệt quá 24h và phát hiện các đơn hàng có dấu hiệu bất thường.',
    paramSchema: {
      limit: { type: 'number', min: 10, max: 200, default: 100 }
    },
    systemInstruction: `Bạn là Trưởng phòng Vận hành Đơn hàng của thương hiệu KD-XX.
Nhiệm vụ của bạn là kiểm tra tình trạng xử lý đơn hàng, phát hiện các điểm nghẽn và các đơn hàng bất thường cần xử lý ngay.

NGUYÊN TẮC BẮT BUỘC:
1. Phân biệt rõ các trạng thái thực tế trong database: pending (chờ xử lý), processing (đang xử lý/đã thanh toán), shipped (đang giao), delivered (đã giao), cancelled (đã hủy).
2. Phát hiện và cảnh báo các đơn bất thường theo các quy tắc kiểm tra logic rõ ràng:
   - Đơn hủy nhưng đã thanh toán tiền (cần hoàn tiền khẩn cấp).
   - Đơn pending tồn đọng lâu chưa xử lý.
   - Đơn có giá trị lớn bất thường đang nằm ở trạng thái pending.
3. Không thực hiện bất kỳ hành động ghi/xóa nào, chỉ đưa ra cảnh báo và đề xuất xử lý.
4. Ngôn ngữ: Tiếng Việt dứt khoát, rõ ràng, tập trung vào SLA (Service Level Agreement) và trải nghiệm giao nhận của khách hàng.`,

    async fetchAndComputeData() {
      const orders = await Order.find().sort({ createdAt: -1 }).limit(100).lean();

      const statusCounts = {
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0,
        other: 0
      };

      const paymentCounts = {
        paid: 0,
        unpaid: 0
      };

      const now = new Date();
      const anomalies = [];
      let pendingOlderThan24h = 0;

      for (const o of orders) {
        const s = (o.orderStatus || o.status || 'pending').toLowerCase();
        const safeS = statusCounts[s] !== undefined ? s : 'other';
        statusCounts[safeS] += 1;

        if (o.isPaid) {
          paymentCounts.paid += 1;
        } else {
          paymentCounts.unpaid += 1;
        }

        const createdAt = new Date(o.createdAt);
        const ageHours = (now - createdAt) / (1000 * 60 * 60);
        const total = Number(o.total || o.totalPrice || 0);

        // Anomaly Rule 1: Cancelled order with isPaid === true
        if (s === 'cancelled' && o.isPaid) {
          anomalies.push({
            orderId: o._id,
            type: 'REFUND_REQUIRED',
            severity: 'CRITICAL',
            message: `Đơn hàng #${String(o._id).slice(-6).toUpperCase()} đã hủy nhưng tiền đã vào tài khoản ($${total} USD). Cần hoàn tiền gấp cho khách!`
          });
        }

        // Anomaly Rule 2: Delivered but unpaid (non-COD)
        if (s === 'delivered' && !o.isPaid && o.paymentMethod !== 'cod') {
          anomalies.push({
            orderId: o._id,
            type: 'PAYMENT_MISMATCH',
            severity: 'HIGH',
            message: `Đơn hàng #${String(o._id).slice(-6).toUpperCase()} đã chuyển sang trạng thái "Đã giao" nhưng chưa được đánh dấu đã thanh toán.`
          });
        }

        // Anomaly Rule 3: High value order pending
        if (s === 'pending' && total >= 1500) {
          anomalies.push({
            orderId: o._id,
            type: 'HIGH_VALUE_PENDING',
            severity: 'MEDIUM',
            message: `Đơn hàng VIP trị giá lớn ($${total.toLocaleString()} USD) đang ở trạng thái chờ duyệt.`
          });
        }

        // Check age of pending orders
        if (s === 'pending' && ageHours >= 24) {
          pendingOlderThan24h += 1;
        }
      }

      const totalAnalyzed = orders.length;
      const cancellationRate = totalAnalyzed > 0 ? (statusCounts.cancelled / totalAnalyzed) * 100 : 0;
      const fulfillmentRate = totalAnalyzed > 0 ? ((statusCounts.delivered + statusCounts.shipped) / totalAnalyzed) * 100 : 0;

      return {
        metrics: {
          totalAnalyzed,
          statusCounts,
          paymentCounts,
          cancellationRate: Math.round(cancellationRate * 10) / 10,
          fulfillmentRate: Math.round(fulfillmentRate * 10) / 10,
          pendingOlderThan24h,
          anomaliesCount: anomalies.length,
          anomalies
        }
      };
    },

    formatPrompt(data) {
      const anomalyText = data.metrics.anomalies.map(a => `[${a.severity}] ${a.message}`).join('\n') || 'Không phát hiện đơn hàng bất thường.';

      return `BÁO CÁO VẬN HÀNH ĐƠN HÀNG THỰC TẾ (${data.metrics.totalAnalyzed} ĐƠN GẦN NHẤT):
- Đang chờ xử lý (Pending): ${data.metrics.statusCounts.pending} đơn
- Đang đóng gói / Đã thanh toán (Processing): ${data.metrics.statusCounts.processing} đơn
- Đang vận chuyển (Shipped): ${data.metrics.statusCounts.shipped} đơn
- Đã giao thành công (Delivered): ${data.metrics.statusCounts.delivered} đơn
- Đã hủy (Cancelled): ${data.metrics.statusCounts.cancelled} đơn (${data.metrics.cancellationRate}%)
- Tỷ lệ hoàn thành đơn (Fulfillment Rate): ${data.metrics.fulfillmentRate}%
- Đơn chờ xử lý tồn đọng quá 24h: ${data.metrics.pendingOlderThan24h} đơn

CÁC BẤT THƯỜNG CẦN CHÚ Ý:
${anomalyText}

Hãy phân tích quy trình vận hành, điểm nghẽn trong khâu đóng gói/giao nhận và chỉ dẫn hành động cụ thể để bộ phận chăm sóc khách hàng và kho xử lý ngay các đơn tồn đọng hoặc bất thường.`;
    }
  }
};

/**
 * Get task definition by ID
 */
function getTask(taskId) {
  return TASK_REGISTRY[taskId] || null;
}

/**
 * List all available tasks with client-safe metadata
 */
function listAvailableTasks() {
  return Object.values(TASK_REGISTRY).map(task => ({
    id: task.id,
    title: task.title,
    role: task.role,
    badge: task.badge,
    icon: task.icon,
    color: task.color,
    description: task.description,
    paramSchema: task.paramSchema
  }));
}

module.exports = {
  TASK_REGISTRY,
  getTask,
  listAvailableTasks
};

