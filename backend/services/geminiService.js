/**
 * Reusable Gemini AI Service for KD-XX Intelligence Admin Center
 * Connects directly to Google AI Studio API with timeout, fallback, and JSON schema enforcement
 */

const FALLBACK_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash'
];

/**
 * Generate structured analysis from Gemini AI
 * @param {Object} options
 * @param {string} options.systemInstruction - Role definition and strict guidelines
 * @param {string} options.prompt - Task context with precomputed backend ground truth metrics
 * @param {number} [options.timeoutMs=25000] - Timeout limit in milliseconds
 * @returns {Promise<{summary: string, keyObservations: string[], warnings: string[], dataGaps: string[], recommendations: string[]}>}
 */
async function generateAnalysis({ systemInstruction, prompt, timeoutMs = 25000 }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trong file .env của backend. Vui lòng thêm API key từ Google AI Studio để kích hoạt AI Operations Center.');
  }

  let lastError = null;

  // Try configured model, fallback to alternative models if temporary 503 or overload occurs
  for (const model of FALLBACK_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `${systemInstruction}\n\n${prompt}\n\nQUAN TRỌNG: Hãy trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc sau (không kèm markdown \`\`\`json hay giải thích bên ngoài):\n{\n  "summary": "Tóm tắt ngắn gọn 2-3 câu về tình hình",\n  "keyObservations": ["Nhận xét 1", "Nhận xét 2", ...],\n  "warnings": ["Cảnh báo / vấn đề 1", ...],\n  "dataGaps": ["Dữ liệu còn thiếu 1", ...],\n  "recommendations": ["Đề xuất hành động 1", ...]\n}`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2, // Low temperature for factual, analytical consistency
          maxOutputTokens: 4096
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const status = res.status;
        const msg = errorData.error?.message || res.statusText;

        if (status === 401 || status === 403) {
          throw new Error('API Key của Google AI Studio không hợp lệ hoặc không có quyền truy cập. Vui lòng kiểm tra lại GEMINI_API_KEY.');
        }

        if (status === 429) {
          throw new Error('Đã chạm hạn mức số lượt gọi (Rate Limit / Quota Exceeded) của Google AI Studio. Vui lòng thử lại sau ít phút.');
        }

        if (status === 503) {
          console.warn(`[GeminiService] Model ${model} is busy (503). Attempting fallback...`);
          lastError = new Error(`Mô hình ${model} đang quá tải. Đang thử mô hình dự phòng...`);
          continue; // Try next fallback model
        }

        throw new Error(`Google AI Studio lỗi (${status}): ${msg}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Gemini không trả về nội dung phân tích.');
      }

      // Clean and robustly extract JSON
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      let parsed = null;
      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
          } catch (sliceErr) {}
        }

        if (!parsed) {
          console.error('[GeminiService] Failed to parse JSON response:', cleaned.slice(0, 200));
          throw new Error('Định dạng kết quả trả về từ Gemini không đúng chuẩn JSON có cấu trúc.');
        }
      }

      // Ensure normalized output schema
      return {
        summary: String(parsed.summary || 'Đã hoàn tất phân tích dữ liệu.'),
        keyObservations: Array.isArray(parsed.keyObservations) ? parsed.keyObservations : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        dataGaps: Array.isArray(parsed.dataGaps) ? parsed.dataGaps : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
      };
    } catch (err) {
      if (err.name === 'TimeoutError' || err.code === 23) {
        lastError = new Error('Quá thời gian chờ phản hồi từ Gemini (Timeout 25s). Vui lòng thử lại sau.');
      } else {
        lastError = err;
      }

      // If it's auth or quota error, don't try other models
      if (err.message.includes('API Key') || err.message.includes('Quota')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Không thể kết nối đến Gemini AI sau khi đã thử tất cả mô hình dự phòng.');
}

module.exports = {
  generateAnalysis
};
