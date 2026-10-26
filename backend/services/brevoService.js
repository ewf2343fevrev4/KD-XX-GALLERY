/**
 * Brevo (Sendinblue) Email Marketing Service
 * Connects directly to Brevo REST API v3 for high reliability and clean error reporting.
 */

const getBrevoConfig = () => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'kdeexx1912@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'KD-XX — MADE TRẦN ĐỨC MINH';

  return { apiKey, senderEmail, senderName };
};

/**
 * Send an email through Brevo API v3
 * @param {Object} options
 * @param {Array<{email: string, name?: string}>|string} options.to
 * @param {string} options.subject
 * @param {string} options.htmlContent
 * @param {string} [options.textContent]
 * @param {Object} [options.sender]
 */
const sendEmail = async ({ to, subject, htmlContent, textContent, sender }) => {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();

  if (!apiKey) {
    throw new Error('Chưa cấu hình BREVO_API_KEY trong file .env');
  }

  // Format recipients array
  let recipients = [];
  if (typeof to === 'string') {
    recipients = [{ email: to.trim() }];
  } else if (Array.isArray(to)) {
    recipients = to.map((item) =>
      typeof item === 'string' ? { email: item.trim() } : { email: item.email.trim(), name: item.name }
    );
  } else if (to && to.email) {
    recipients = [to];
  }

  if (recipients.length === 0) {
    throw new Error('Danh sách người nhận email trống');
  }

  const payload = {
    sender: sender || {
      name: senderName,
      email: senderEmail
    },
    to: recipients,
    subject: subject,
    htmlContent: htmlContent,
    textContent: textContent || subject
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();

  if (!response.ok) {
    const errorMsg = responseData?.message || responseData?.code || 'Gửi email qua Brevo thất bại';
    console.error('❌ Brevo API Error:', responseData);
    throw new Error(`Brevo API Error (${response.status}): ${errorMsg}`);
  }

  return {
    success: true,
    messageId: responseData.messageId
  };
};

/**
 * Generate a luxury dark aesthetic HTML email template for KD-XX newsletter
 */
const generateLuxuryNewsletterHtml = ({
  subject,
  previewText = '',
  content,
  bannerUrl = '',
  ctaText = 'KHÁM PHÁ NGAY',
  ctaUrl = 'http://localhost:3000',
  unsubscribeUrl = '#'
}) => {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #050408;
      color: #e5e5e5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 620px;
      margin: 0 auto;
      background-color: #0b0910;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .header {
      padding: 35px 20px 25px;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background-color: #050408;
    }
    .monogram {
      display: inline-block;
      width: 44px;
      height: 44px;
      line-height: 44px;
      border-radius: 50%;
      background: #000;
      color: #fff;
      font-weight: 800;
      font-size: 16px;
      letter-spacing: 2px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      margin-bottom: 12px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 6px;
      color: #ffffff;
      margin: 0 0 4px;
      text-transform: uppercase;
    }
    .brand-subtitle {
      font-size: 10px;
      letter-spacing: 3px;
      color: #a855f7;
      text-transform: uppercase;
      margin: 0;
      font-weight: 600;
    }
    .banner {
      width: 100%;
      max-height: 340px;
      object-fit: cover;
      display: block;
    }
    .body-content {
      padding: 40px 35px;
      line-height: 1.75;
      font-size: 14.5px;
      color: #d1d5db;
    }
    .email-subject {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 1px;
      margin: 0 0 20px;
      text-transform: uppercase;
      line-height: 1.3;
    }
    .cta-container {
      text-align: center;
      margin: 35px 0 10px;
    }
    .cta-button {
      display: inline-block;
      padding: 15px 36px;
      background-color: #ffffff;
      color: #000000 !important;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-decoration: none;
      text-transform: uppercase;
      border-radius: 2px;
      transition: all 0.2s ease;
    }
    .footer {
      padding: 30px 25px;
      text-align: center;
      background-color: #050408;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      color: #71717a;
      line-height: 1.6;
    }
    .footer a {
      color: #a855f7;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText || subject}
  </div>

  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050408; padding: 25px 10px;">
    <tr>
      <td align="center">
        <div class="container">
          <!-- HEADER -->
          <div class="header">
            <div class="monogram">KD</div>
            <h1 class="brand-title">KD - XX</h1>
            <p class="brand-subtitle">MADE TRẦN ĐỨC MINH &bull; LUXURY STREETWEAR</p>
          </div>

          <!-- OPTIONAL BANNER -->
          ${
            bannerUrl
              ? `<img src="${bannerUrl}" alt="${subject}" class="banner" />`
              : ''
          }

          <!-- BODY -->
          <div class="body-content">
            <h2 class="email-subject">${subject}</h2>
            <div>
              ${content}
            </div>

            ${
              ctaUrl
                ? `<div class="cta-container">
                    <a href="${ctaUrl}" target="_blank" class="cta-button">${ctaText}</a>
                   </div>`
                : ''
            }
          </div>

          <!-- FOOTER -->
          <div class="footer">
            <p style="margin: 0 0 10px;">
              Bạn nhận được email độc quyền này vì đã đăng ký nhận thông báo từ <strong>KD-XX</strong>.
            </p>
            <p style="margin: 0 0 10px;">
              &copy; 2026 KD-XX — MADE TRẦN ĐỨC MINH. All rights reserved.
            </p>
            <p style="margin: 0;">
              Nếu không còn muốn nhận thông tin này, bạn có thể <a href="${unsubscribeUrl}" target="_blank">Hủy đăng ký nhận tin (Unsubscribe)</a> bất cứ lúc nào.
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

module.exports = {
  getBrevoConfig,
  sendEmail,
  generateLuxuryNewsletterHtml
};

