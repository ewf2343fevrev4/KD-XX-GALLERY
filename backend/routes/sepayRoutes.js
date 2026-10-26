const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');

// ==========================================
// SePay Webhook & Payment Routes
// Docs: https://developer.sepay.vn/
// ==========================================

/**
 * Health check endpoint for SePay webhook connectivity
 * @route GET /api/sepay/webhook
 */
router.get('/webhook', (req, res) => {
  res.json({
    success: true,
    message: 'SePay Webhook Endpoint is active and ready to receive transactions',
    timestamp: new Date().toISOString()
  });
});

/**
 * Get VietQR payment configuration for an order
 * @route GET /api/sepay/qr-info/:orderId
 */
router.get('/qr-info/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const bankName = process.env.SEPAY_BANK_NAME || 'MBBank';
    const bankAccount = process.env.SEPAY_BANK_ACCOUNT || '0987654321';
    const accountName = process.env.SEPAY_ACCOUNT_NAME || 'CONG TY TNHH KD-XX';
    const exchangeRate = Number(process.env.USD_VND_EXCHANGE_RATE) || 25400;
    
    // Ensure amountVND is available
    const amountVND = order.amountVND > 0 
      ? order.amountVND 
      : Math.round(Number(order.total || order.totalPrice || 0) * exchangeRate);

    // Ensure paymentCode is available
    const paymentCode = order.paymentCode || `KDX${order._id.toString().slice(-6).toUpperCase()}`;

    // Standard VietQR QuickLink (supported natively by SePay)
    // NOTE: For VietinBank, SePay strictly requires content to start with keyword "SEVQR"
    const transferContent = `SEVQR ${paymentCode}`;
    const qrUrl = `https://vietqr.app/img?acc=${encodeURIComponent(bankAccount)}&bank=${encodeURIComponent(bankName)}&amount=${amountVND}&des=${encodeURIComponent(transferContent)}&template=compact`;

    res.json({
      success: true,
      data: {
        orderId: order._id,
        paymentCode,
        transferContent,
        amountVND,
        amountUSD: order.total || order.totalPrice,
        bankName,
        bankAccount,
        accountName,
        qrUrl,
        isPaid: Boolean(order.isPaid),
        status: order.orderStatus || order.status
      }
    });
  } catch (error) {
    console.error('Error getting SePay QR info:', error);
    res.status(500).json({ success: false, message: 'Failed to generate QR payment info' });
  }
});

/**
 * Primary Webhook Handler for SePay Incoming Transactions
 * @route POST /api/sepay/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('⚡ [SePay Webhook] Received webhook notification from SePay');

    // 1. AUTHENTICATION VERIFICATION (Fail-Closed)
    const expectedApiKey = process.env.SEPAY_WEBHOOK_API_KEY;
    const authHeader = req.headers.authorization || req.headers['x-api-key'] || '';

    if (!expectedApiKey || expectedApiKey === 'your_sepay_webhook_api_key_here') {
      console.error('⛔ [SePay Webhook] Server configuration error: SEPAY_WEBHOOK_API_KEY is not configured or using placeholder.');
      return res.status(500).json({
        success: false,
        message: 'Webhook configuration error on server'
      });
    }

    let incomingToken = '';
    if (authHeader.startsWith('Apikey ') || authHeader.startsWith('apikey ')) {
      incomingToken = authHeader.slice(7).trim();
    } else if (authHeader.startsWith('Bearer ') || authHeader.startsWith('bearer ')) {
      incomingToken = authHeader.slice(7).trim();
    } else {
      incomingToken = authHeader.trim();
    }

    // Timing-safe comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedApiKey);
    const incomingBuffer = Buffer.from(incomingToken);

    const isValid = expectedBuffer.length === incomingBuffer.length && 
                    crypto.timingSafeEqual(expectedBuffer, incomingBuffer);

    if (!isValid) {
      console.warn('⛔ [SePay Webhook] Authentication failed: Invalid API Key');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid SePay API Key'
      });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const {
      id,
      gateway,
      transactionDate,
      accountNumber,
      subAccount,
      code,
      content,
      transferType,
      transferAmount,
      accumulated,
      referenceCode,
      description
    } = payload;

    console.log(`📥 [SePay Webhook] Transaction #${id} | Bank: ${gateway} | Amount: ${transferAmount} VND | Type: ${transferType}`);
    console.log(`📝 [SePay Webhook] Content: "${content}" | Extracted Code: "${code}"`);

    // 2. CHECK TRANSACTION TYPE (Only process money in)
    if (transferType && transferType.toLowerCase() !== 'in') {
      console.log(`ℹ️ [SePay Webhook] Ignored non-incoming transaction type: ${transferType}`);
      return res.status(200).json({
        success: true,
        message: 'Ignored non-incoming transfer'
      });
    }

    // 3. IDEMPOTENCY CHECK (Prevent duplicate processing of same transaction ID)
    if (id) {
      const alreadyProcessed = await Order.findOne({ 'sepayTransaction.id': Number(id) });
      if (alreadyProcessed) {
        console.log(`🔁 [SePay Webhook] Transaction #${id} already processed for Order #${alreadyProcessed._id}. Skipping duplicate.`);
        return res.status(200).json({
          success: true,
          message: 'Transaction already processed (Idempotent)'
        });
      }
    }

    // 4. LOCATE THE TARGET ORDER
    // Match order by paymentCode (from payload.code, or regex in content / description)
    const prefix = process.env.SEPAY_PAYMENT_PREFIX || 'KDX';
    const fullText = `${code || ''} ${content || ''} ${description || ''}`;
    const codeRegex = new RegExp(`${prefix}[A-Z0-9]+`, 'i');
    const match = fullText.match(codeRegex);
    let targetCode = match ? match[0].toUpperCase() : (code || '').replace(/^SEVQR\s*/i, '').trim().toUpperCase();

    console.log(`🔍 [SePay Webhook] Searching order with paymentCode: "${targetCode}" (From text: "${content || code}")`);

    let order = null;
    if (targetCode) {
      order = await Order.findOne({ paymentCode: targetCode });
    }

    // Fallback: Check if order ID was included directly in content
    if (!order) {
      const fullText = `${content || ''} ${description || ''}`;
      const hexMatches = fullText.match(/[a-f0-9]{24}/i);
      if (hexMatches) {
        const potentialOrderId = hexMatches[0];
        if (mongoose.Types.ObjectId.isValid(potentialOrderId)) {
          order = await Order.findById(potentialOrderId);
        }
      }
    }

    if (!order) {
      console.warn(`⚠️ [SePay Webhook] Could not find order for code: "${targetCode}". Recorded for review.`);
      // Return HTTP 200 so SePay marks webhook delivered and does not repeat retries endlessly
      return res.status(200).json({
        success: false,
        message: `Order not found for payment code: ${targetCode}`
      });
    }

    // 5. VALIDATE TRANSFER AMOUNT
    const expectedVND = order.amountVND > 0 
      ? order.amountVND 
      : Math.round(Number(order.total || order.totalPrice || 0) * (Number(process.env.USD_VND_EXCHANGE_RATE) || 25400));

    const actualAmount = Number(transferAmount || 0);

    if (actualAmount < expectedVND) {
      console.warn(`⚠️ [SePay Webhook] Underpaid! Expected: ${expectedVND} VND, Received: ${actualAmount} VND for Order #${order._id}`);
      // Record partial transaction without marking fully paid
      order.sepayTransaction = {
        id: Number(id),
        gateway,
        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
        accountNumber,
        subAccount,
        referenceCode,
        content,
        transferType,
        transferAmount: actualAmount,
        accumulated
      };
      await order.save();
      return res.status(200).json({
        success: false,
        message: `Underpaid: Received ${actualAmount} VND but expected ${expectedVND} VND`
      });
    }

    // 6. UPDATE ORDER STATUS TO PAID
    order.isPaid = true;
    order.paidAt = transactionDate ? new Date(transactionDate) : new Date();
    order.status = 'processing';
    order.orderStatus = 'processing';
    order.sepayTransaction = {
      id: Number(id),
      gateway,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      accountNumber,
      subAccount,
      referenceCode,
      content,
      transferType,
      transferAmount: actualAmount,
      accumulated
    };

    await order.save();

    console.log(`✅ [SePay Webhook] Successfully verified & marked Order #${order._id} as PAID!`);

    // 7. REAL-TIME NOTIFICATION VIA SOCKET.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('order_paid', {
        orderId: order._id,
        paymentCode: order.paymentCode,
        amountVND: actualAmount,
        transactionId: id,
        paidAt: order.paidAt
      });
      console.log(`📡 [SePay Webhook] Broadcasted socket event 'order_paid' for Order #${order._id}`);
    }

    // 8. RETURN 200 OK TO SEPAY
    return res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully',
      orderId: order._id
    });

  } catch (error) {
    console.error('❌ [SePay Webhook] Internal server error processing webhook:', error);
    // Return 500 so SePay can retry in case of temporary database or network glitches
    return res.status(500).json({
      success: false,
      message: 'Server error processing webhook',
      error: error.message
    });
  }
});

module.exports = router;

