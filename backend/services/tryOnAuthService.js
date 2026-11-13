const { GoogleAuth } = require('google-auth-library');

class TryOnAuthService {
  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    this.cachedToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * Get valid Bearer access token using ADC
   * Automatically refreshes before expiration
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    const now = Date.now();
    // Use cached token if valid for at least 2 more minutes
    if (this.cachedToken && this.tokenExpiry > now + 120000) {
      return this.cachedToken;
    }

    try {
      const client = await this.auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = tokenResponse.token;
      
      if (!token) {
        throw new Error('GoogleAuth did not return an access token');
      }

      this.cachedToken = token;
      // Default Google OAuth token TTL is 3600 seconds (1 hour)
      this.tokenExpiry = now + 3500 * 1000;
      return token;
    } catch (error) {
      console.error('❌ Failed to obtain Google Cloud access token via ADC:', error.message);
      throw new Error(`Google Cloud Authentication failed: ${error.message}`);
    }
  }

  /**
   * Get active Google Cloud Project ID
   * @returns {Promise<string>}
   */
  async getProjectId() {
    try {
      return (await this.auth.getProjectId()) || process.env.GCP_PROJECT_ID || 'kdxx-tryon';
    } catch (e) {
      return process.env.GCP_PROJECT_ID || 'kdxx-tryon';
    }
  }
}

module.exports = new TryOnAuthService();
