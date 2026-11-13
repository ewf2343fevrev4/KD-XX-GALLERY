const mongoose = require('mongoose');
const tryOnStorageService = require('./tryOnStorageService');

class TryOnCleanupScheduler {
  constructor(options = {}) {
    this.timer = null;
    this.initialTimer = null;
    this.storageService = options.storageService || tryOnStorageService;
    this.intervalMinutes = options.intervalMinutes || parseInt(process.env.TRYON_CLEANUP_INTERVAL_MINUTES, 10) || 30;
    this.intervalMs = this.intervalMinutes * 60 * 1000;
    this.initialDelayMs = options.initialDelayMs ?? 1500;
    this.isRunning = false;
  }

  /**
   * Start the periodic retention scheduler (runs recovery sweep shortly after DB connects/boots)
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const scheduleBootSweep = () => {
      if (!this.isRunning) return;
      this.initialTimer = setTimeout(() => {
        this.runSweep('initial_boot');
      }, this.initialDelayMs);
    };

    if (mongoose.connection && mongoose.connection.readyState === 1) {
      scheduleBootSweep();
    } else if (mongoose.connection && typeof mongoose.connection.once === 'function') {
      mongoose.connection.once('connected', scheduleBootSweep);
      // Safety fallback if started with an already-ready external stub
      this.initialTimer = setTimeout(() => {
        if (mongoose.connection?.readyState === 1 || this.initialDelayMs === 0) {
          this.runSweep('initial_boot');
        }
      }, Math.max(this.initialDelayMs, 3000));
    } else {
      scheduleBootSweep();
    }

    // Periodic sweep every intervalMs
    this.timer = setInterval(() => {
      this.runSweep('periodic_interval');
    }, this.intervalMs);

    console.log(`⏱️ [TryOn Cleanup Scheduler] Started (interval: ${this.intervalMinutes} mins, retention: ${this.storageService.retentionHours}h / ${this.storageService.retentionDays}d)`);
  }

  /**
   * Trigger a single sweep using the distributed lock
   * @param {string} [trigger='manual']
   * @returns {Promise<Object>}
   */
  async runSweep(trigger = 'manual') {
    try {
      const result = await this.storageService.cleanupExpiredAssetsWithLock();
      return { success: true, trigger, ...result };
    } catch (e) {
      console.error(`❌ [TryOn Cleanup Scheduler] Error during ${trigger} sweep:`, e.message);
      return { success: false, trigger, error: e.message };
    }
  }

  /**
   * Stop the scheduler (e.g. for graceful server shutdown)
   */
  stop() {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('⏱️ [TryOn Cleanup Scheduler] Stopped');
  }
}

module.exports = new TryOnCleanupScheduler();
module.exports.TryOnCleanupScheduler = TryOnCleanupScheduler;
