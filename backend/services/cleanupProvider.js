/**
 * AI Cleanup Provider Interface
 * Separated provider architecture for photo enhancement / cleanup
 * Does not overwrite raw images; strictly preserves customer original assets
 */

class CleanupProvider {
  constructor() {
    this.providerName = process.env.TRYON_CLEANUP_PROVIDER || 'none';
    this.isConfigured = this.providerName !== 'none';
  }

  /**
   * Check if an active AI cleanup provider is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.isConfigured;
  }

  /**
   * Perform AI Cleanup
   * @param {Object} options
   * @param {Buffer} options.imageBuffer
   * @param {string} options.mimeType
   * @param {string} options.userId
   * @returns {Promise<{success: boolean, enhancedBuffer?: Buffer, status: string, message: string}>}
   */
  async cleanupPhoto({ imageBuffer, mimeType, userId }) {
    if (!this.isAvailable()) {
      return {
        success: false,
        status: 'PROVIDER_NOT_CONFIGURED',
        message: 'Dịch vụ AI Cleanup hiện chưa được cấu hình nhà cung cấp chuyên dụng. Hệ thống giữ nguyên ảnh gốc của bạn để đảm bảo tính xác thực.'
      };
    }

    // Future hook: when a dedicated upscale/cleanup provider (e.g. Imagen Background Retoucher / Real-ESRGAN) is added
    throw new Error('Cleanup provider implementation is currently pending configuration.');
  }
}

module.exports = new CleanupProvider();
