const express = require('express');
const router = express.Router();
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const NewsletterCampaign = require('../models/NewsletterCampaign');
const { protect, admin } = require('../middleware/admin');
const { sendEmail, generateLuxuryNewsletterHtml, getBrevoConfig } = require('../services/brevoService');

// Helper to validate email format
const isValidEmail = (email) => {
  return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(String(email).trim());
};

// =========================================================================
// 1. PUBLIC: SUBSCRIBE FROM FOOTER
// POST /api/newsletter/subscribe
// =========================================================================
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp địa chỉ email hợp lệ.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if already in system
    let subscriber = await NewsletterSubscriber.findOne({ email: cleanEmail });

    if (subscriber) {
      if (subscriber.status === 'subscribed') {
        return res.status(200).json({
          success: true,
          alreadySubscribed: true,
          message: 'Email này đã đăng ký nhận bản tin KD-XX trước đó.'
        });
      } else {
        // Re-activate subscription
        subscriber.status = 'subscribed';
        subscriber.subscribedAt = new Date();
        subscriber.unsubscribedAt = null;
        await subscriber.save();

        return res.status(200).json({
          success: true,
          message: 'Chào mừng bạn quay trở lại với bản tin KD-XX!'
        });
      }
    }

    // Create new subscriber
    subscriber = await NewsletterSubscriber.create({
      email: cleanEmail,
      status: 'subscribed',
      source: 'footer'
    });

    // Send Welcome Email asynchronously via Brevo (does not block response)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const unsubscribeUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/newsletter/unsubscribe?token=${subscriber.unsubscribeToken}&email=${encodeURIComponent(cleanEmail)}`;

    const welcomeHtml = generateLuxuryNewsletterHtml({
      subject: 'WELCOME TO KD-XX CONCIERGE',
      previewText: 'Chào mừng bạn gia nhập cộng đồng độc quyền KD-XX.',
      content: `
        <p style="margin-bottom: 16px;">Xin chào,</p>
        <p style="margin-bottom: 16px;">
          Cảm ơn bạn đã đăng ký nhận bản tin từ <strong>KD-XX — MADE TRẦN ĐỨC MINH</strong>.
        </p>
        <p style="margin-bottom: 16px;">
          Từ giờ, bạn sẽ là một trong những người đầu tiên nhận thông tin về các bộ sưu tập giới hạn (Limited Drops), sự kiện thời trang cao cấp và ưu đãi độc quyền dành riêng cho thành viên.
        </p>
        <p style="margin-bottom: 0;">Trân trọng,<br><strong>KD-XX Concierge Team</strong></p>
      `,
      ctaText: 'KHÁM PHÁ BỘ SƯU TẬP',
      ctaUrl: frontendUrl,
      unsubscribeUrl
    });

    sendEmail({
      to: cleanEmail,
      subject: 'WELCOME TO KD-XX — MADE TRẦN ĐỨC MINH',
      htmlContent: welcomeHtml
    }).catch((err) => {
      console.warn('⚠️ Welcome email could not be delivered:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công! Chào mừng bạn đến với KD-XX.'
    });
  } catch (error) {
    console.error('❌ Newsletter subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi đăng ký nhận tin.',
      error: error.message
    });
  }
});

// =========================================================================
// 2. PUBLIC: 1-CLICK UNSUBSCRIBE
// GET /api/newsletter/unsubscribe?token=...&email=...
// =========================================================================
router.get('/unsubscribe', async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token && !email) {
      return res.status(400).send('<h1>Yêu cầu không hợp lệ</h1>');
    }

    const query = {};
    if (token) query.unsubscribeToken = token;
    if (email) query.email = email.trim().toLowerCase();

    const subscriber = await NewsletterSubscriber.findOne(query);

    if (subscriber) {
      subscriber.status = 'unsubscribed';
      subscriber.unsubscribedAt = new Date();
      await subscriber.save();
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Return a clean luxury styled confirmation page
    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hủy đăng ký thành công | KD-XX</title>
        <style>
          body {
            background-color: #06040a;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
          }
          .card {
            background-color: #121016;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            padding: 40px 30px;
            max-width: 480px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
          }
          .monogram {
            display: inline-block;
            width: 48px;
            height: 48px;
            line-height: 48px;
            border-radius: 50%;
            background: #000;
            border: 1px solid rgba(255, 255, 255, 0.3);
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 2px;
            margin-bottom: 20px;
          }
          h1 {
            font-size: 20px;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 12px;
          }
          p {
            color: #a1a1aa;
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 28px;
          }
          a.btn {
            display: inline-block;
            background: #ffffff;
            color: #000000;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            padding: 12px 28px;
            border-radius: 4px;
            text-decoration: none;
            transition: opacity 0.2s;
          }
          a.btn:hover {
            opacity: 0.85;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="monogram">KD</div>
          <h1>ĐÃ HỦY ĐĂNG KÝ BẢN TIN</h1>
          <p>
            Địa chỉ email của bạn đã được gỡ khỏi danh sách nhận email marketing của KD-XX. Bạn sẽ không còn nhận các thông báo về bộ sưu tập và ưu đãi nữa.
          </p>
          <a href="${frontendUrl}" class="btn">QUAY LẠI TRANG CHỦ</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Unsubscribe error:', error);
    res.status(500).send('<h1>Lỗi khi xử lý hủy đăng ký</h1>');
  }
});

// =========================================================================
// 3. ADMIN: GET SUBSCRIBERS LIST WITH STATS
// GET /api/newsletter/admin/subscribers
// =========================================================================
router.get('/admin/subscribers', protect, admin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search && search.trim()) {
      query.email = new RegExp(search.trim(), 'i');
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [subscribers, total, activeCount, unsubCount] = await Promise.all([
      NewsletterSubscriber.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      NewsletterSubscriber.countDocuments(query),
      NewsletterSubscriber.countDocuments({ status: 'subscribed' }),
      NewsletterSubscriber.countDocuments({ status: 'unsubscribed' })
    ]);

    res.json({
      success: true,
      data: subscribers,
      total,
      stats: {
        totalSubscribers: activeCount + unsubCount,
        activeSubscribers: activeCount,
        unsubscribed: unsubCount
      },
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('❌ Admin get subscribers error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 4. ADMIN: TOGGLE SUBSCRIBER STATUS
// PATCH /api/newsletter/admin/subscribers/:id/status
// =========================================================================
router.patch('/admin/subscribers/:id/status', protect, admin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['subscribed', 'unsubscribed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    const subscriber = await NewsletterSubscriber.findById(req.params.id);
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người đăng ký' });
    }

    subscriber.status = status;
    if (status === 'unsubscribed') {
      subscriber.unsubscribedAt = new Date();
    } else {
      subscriber.unsubscribedAt = null;
    }
    await subscriber.save();

    res.json({
      success: true,
      message: `Đã cập nhật trạng thái thành "${status === 'subscribed' ? 'Đang nhận tin' : 'Đã hủy'}"`,
      data: subscriber
    });
  } catch (error) {
    console.error('❌ Admin update subscriber status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 5. ADMIN: DELETE SUBSCRIBER
// DELETE /api/newsletter/admin/subscribers/:id
// =========================================================================
router.delete('/admin/subscribers/:id', protect, admin, async (req, res) => {
  try {
    const subscriber = await NewsletterSubscriber.findByIdAndDelete(req.params.id);
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người đăng ký' });
    }

    res.json({
      success: true,
      message: 'Đã xóa người đăng ký khỏi hệ thống'
    });
  } catch (error) {
    console.error('❌ Admin delete subscriber error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 6. ADMIN: GET CAMPAIGN HISTORY
// GET /api/newsletter/admin/campaigns
// =========================================================================
router.get('/admin/campaigns', protect, admin, async (req, res) => {
  try {
    const campaigns = await NewsletterCampaign.find({})
      .sort({ sentAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    console.error('❌ Admin get campaigns error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
});

// =========================================================================
// 7. ADMIN: SEND TEST EMAIL TO SPECIFIED ADDRESS
// POST /api/newsletter/admin/send-test
// =========================================================================
router.post('/admin/send-test', protect, admin, async (req, res) => {
  try {
    const { testEmail, subject, previewText, content, bannerUrl, ctaText, ctaUrl } = req.body || {};

    const targetEmail = testEmail || req.user.email;
    if (!targetEmail || !isValidEmail(targetEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp địa chỉ email nhận bản thử nghiệm hợp lệ.'
      });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Tiêu đề email không được để trống.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung email không được để trống.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const testUnsubscribeUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/newsletter/unsubscribe?email=${encodeURIComponent(targetEmail)}`;

    const htmlContent = generateLuxuryNewsletterHtml({
      subject: `[TEST] ${subject.trim()}`,
      previewText: previewText || '',
      content: content.trim(),
      bannerUrl: bannerUrl || '',
      ctaText: ctaText || 'KHÁM PHÁ NGAY',
      ctaUrl: ctaUrl || frontendUrl,
      unsubscribeUrl: testUnsubscribeUrl
    });

    const sendResult = await sendEmail({
      to: targetEmail,
      subject: `[TEST] ${subject.trim()}`,
      htmlContent
    });

    res.json({
      success: true,
      message: `Đã gửi thử nghiệm thành công đến ${targetEmail}!`,
      messageId: sendResult.messageId
    });
  } catch (error) {
    console.error('❌ Send test email error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể gửi email qua Brevo',
      error: error.message
    });
  }
});

// =========================================================================
// 8. ADMIN: SEND NEWSLETTER CAMPAIGN TO ALL SUBSCRIBERS
// POST /api/newsletter/admin/send-campaign
// =========================================================================
router.post('/admin/send-campaign', protect, admin, async (req, res) => {
  try {
    const { subject, previewText, content, bannerUrl, ctaText, ctaUrl } = req.body || {};

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: 'Tiêu đề chiến dịch không được để trống.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung email không được để trống.' });
    }

    // 1. Fetch all active subscribers
    const activeSubscribers = await NewsletterSubscriber.find({ status: 'subscribed' }).lean();

    if (activeSubscribers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Hiện chưa có người đăng ký hợp lệ (Active) nào trong danh sách nhận tin.'
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

    console.log(`📨 Starting newsletter campaign to ${activeSubscribers.length} subscribers...`);

    // 2. Dispatch emails with individual unsubscribe links
    let successfulCount = 0;
    let failedCount = 0;
    let lastBrevoId = '';
    const errorsList = [];

    // Process in parallel batches of 5 to respect rate limits
    const batchSize = 5;
    for (let i = 0; i < activeSubscribers.length; i += batchSize) {
      const batch = activeSubscribers.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (sub) => {
          try {
            const unsubUrl = `${backendUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}&email=${encodeURIComponent(sub.email)}`;
            const emailHtml = generateLuxuryNewsletterHtml({
              subject: subject.trim(),
              previewText: previewText || '',
              content: content.trim(),
              bannerUrl: bannerUrl || '',
              ctaText: ctaText || 'KHÁM PHÁ NGAY',
              ctaUrl: ctaUrl || frontendUrl,
              unsubscribeUrl: unsubUrl
            });

            const result = await sendEmail({
              to: sub.email,
              subject: subject.trim(),
              htmlContent: emailHtml
            });

            successfulCount++;
            lastBrevoId = result.messageId;
          } catch (err) {
            failedCount++;
            errorsList.push(`${sub.email}: ${err.message}`);
            console.error(`❌ Failed sending newsletter to ${sub.email}:`, err.message);
          }
        })
      );
    }

    // 3. Record campaign history in MongoDB
    const campaignRecord = await NewsletterCampaign.create({
      subject: subject.trim(),
      previewText: previewText || '',
      htmlContent: content.trim(),
      bannerUrl: bannerUrl || '',
      ctaText: ctaText || 'KHÁM PHÁ NGAY',
      ctaUrl: ctaUrl || frontendUrl,
      sentBy: req.user._id,
      sentByName: req.user.name || 'Admin',
      sentAt: new Date(),
      recipientsCount: activeSubscribers.length,
      status: successfulCount > 0 ? 'sent' : 'failed',
      brevoMessageId: lastBrevoId || '',
      errorDetails: errorsList.slice(0, 5).join('; ')
    });

    console.log(`✅ Campaign finished: ${successfulCount} sent, ${failedCount} failed.`);

    res.json({
      success: true,
      message: `Đã gửi chiến dịch thành công đến ${successfulCount}/${activeSubscribers.length} người đăng ký!`,
      data: campaignRecord,
      stats: {
        total: activeSubscribers.length,
        successful: successfulCount,
        failed: failedCount
      }
    });
  } catch (error) {
    console.error('❌ Send campaign error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi gửi chiến dịch',
      error: error.message
    });
  }
});

module.exports = router;

