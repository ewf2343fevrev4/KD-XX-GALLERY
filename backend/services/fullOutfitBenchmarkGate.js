const mongoose = require('mongoose');
const User = require('../models/User');
const TryOnJob = require('../models/TryOnJob');
const TryOnBenchmarkLedger = require('../models/TryOnBenchmarkLedger');

const DEFAULT_ALLOWED_ENVS = ['development', 'test', 'staging'];
const DEFAULT_MAX_JOBS = 10;
const DEFAULT_WINDOW_MINUTES = 120;
const DEFAULT_RATE_MAX = 3;
const DEFAULT_RATE_WINDOW_MINUTES = 10;
const DEFAULT_MAX_BUDGET_USD = 0.20;

function isModelQueryable(ModelClass) {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    (ModelClass && typeof ModelClass.findOne === 'function' && ModelClass.findOne !== mongoose.Model.findOne)
  );
}

function isBenchmarkLedgerQueryable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    (TryOnBenchmarkLedger && typeof TryOnBenchmarkLedger.findOne === 'function' && TryOnBenchmarkLedger.findOne !== mongoose.Model.findOne)
  );
}

/**
 * Isolated Admin-Only Controlled Benchmark Gate & Estimated Cost Guard
 * for Full Outfit Virtual Try-On.
 *
 * Security & Cost Invariants:
 * - Strictly OFF by default (`TRYON_FULL_OUTFIT_BENCHMARK_ENABLED !== 'true'`).
 * - Never trusts client-provided role, userId, cost, or benchmarkMode flags.
 * - Verifies Admin role against User DB record (when queryable) + auth middleware identity.
 * - Restricted by backend environment allowlist (production denied unless explicitly listed).
 * - Bounded by finite active window, persistent max benchmark jobs cap, and Admin rate limit.
 * - Enforces persistent Estimated Cost Guard with hard 0.20 USD ceiling per benchmark window.
 * - Re-checks emergency stop immediately before EACH provider dispatch (including Step 2).
 * - Distinguishes application-level estimated spend from confirmed billing (confirmedBillingCostUsd: null).
 */
class FullOutfitBenchmarkGate {
  constructor(options = {}) {
    this.getEnv = typeof options.getEnv === 'function' ? options.getEnv : () => process.env;
    this.rateLimitHits = new Map(); // key: String(userId) -> number[]
    this.fallbackJobCount = 0;
    this.runtimeWindowStartMs = null;
    this.forceDisabled = false;

    // In-memory cost guard fallback for unit tests when MongoDB is not connected
    this.inMemoryReservedUsd = 0;
    this.inMemoryCommittedUsd = 0;
    this.inMemoryIndeterminateUsd = 0;
    this.inMemoryReservations = new Map(); // key: operationKey -> { status, unitCostUsd, dispatchedAt }
  }

  /**
   * Emergency backend kill-switch (both in-memory and persisted in MongoDB for multi-worker clusters).
   */
  async disableImmediately({ adminUserId = null, reason = 'Emergency stop triggered by Admin' } = {}) {
    this.forceDisabled = true;
    this.runtimeWindowStartMs = null;

    if (isBenchmarkLedgerQueryable()) {
      try {
        await TryOnBenchmarkLedger.findOneAndUpdate(
          { recordType: 'CONTROL', controlKey: 'BENCHMARK_CONTROL' },
          {
            $set: {
              recordType: 'CONTROL',
              controlKey: 'BENCHMARK_CONTROL',
              isEmergencyStopped: true,
              emergencyStoppedAt: new Date(),
              emergencyStoppedBy: adminUserId || null,
              emergencyReason: String(reason || '').slice(0, 500)
            }
          },
          { upsert: true, new: true }
        );
      } catch (_) {
        // Fallback to in-memory state
      }
    }
  }

  async isEmergencyStopped() {
    if (this.forceDisabled) {
      return true;
    }
    if (isBenchmarkLedgerQueryable()) {
      try {
        const control = await TryOnBenchmarkLedger.findOne({
          recordType: 'CONTROL',
          controlKey: 'BENCHMARK_CONTROL'
        });
        if (control?.isEmergencyStopped) {
          this.forceDisabled = true;
          return true;
        }
      } catch (_) {
        // Fallback
      }
    }
    return false;
  }

  async resetRuntimeState() {
    this.forceDisabled = false;
    this.rateLimitHits.clear();
    this.fallbackJobCount = 0;
    this.runtimeWindowStartMs = null;
    this.inMemoryReservedUsd = 0;
    this.inMemoryCommittedUsd = 0;
    this.inMemoryIndeterminateUsd = 0;
    this.inMemoryReservations.clear();

    if (isBenchmarkLedgerQueryable()) {
      try {
        await TryOnBenchmarkLedger.findOneAndUpdate(
          { recordType: 'CONTROL', controlKey: 'BENCHMARK_CONTROL' },
          {
            $set: {
              isEmergencyStopped: false,
              emergencyStoppedAt: null,
              emergencyStoppedBy: null,
              emergencyReason: '',
              totalReservedUsd: 0,
              totalCommittedUsd: 0,
              totalIndeterminateUsd: 0
            }
          }
        );
      } catch (_) {}
    }
  }

  getConfiguration(now = new Date()) {
    const env = this.getEnv() || {};
    const enabledFlag = String(env.TRYON_FULL_OUTFIT_BENCHMARK_ENABLED || '').trim().toLowerCase() === 'true';
    const enabled = Boolean(enabledFlag && !this.forceDisabled);

    const currentEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();
    const rawAllowedEnvs = String(env.TRYON_FULL_OUTFIT_BENCHMARK_ALLOWED_ENVS || '').trim();
    const allowedEnvs = rawAllowedEnvs
      ? rawAllowedEnvs.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [...DEFAULT_ALLOWED_ENVS];

    const maxJobs = Math.max(1, Math.min(100, parseInt(env.TRYON_FULL_OUTFIT_BENCHMARK_MAX_JOBS, 10) || DEFAULT_MAX_JOBS));
    const windowMinutes = Math.max(1, Math.min(1440, parseInt(env.TRYON_FULL_OUTFIT_BENCHMARK_WINDOW_MINUTES, 10) || DEFAULT_WINDOW_MINUTES));
    const rateMax = Math.max(1, Math.min(30, parseInt(env.TRYON_FULL_OUTFIT_BENCHMARK_RATE_MAX, 10) || DEFAULT_RATE_MAX));
    const rateWindowMinutes = Math.max(1, Math.min(120, parseInt(env.TRYON_FULL_OUTFIT_BENCHMARK_RATE_WINDOW_MINUTES, 10) || DEFAULT_RATE_WINDOW_MINUTES));

    const rawMaxBudget = parseFloat(env.TRYON_FULL_OUTFIT_BENCHMARK_MAX_BUDGET_USD);
    const maxBudgetUsd = Number.isFinite(rawMaxBudget) && rawMaxBudget > 0
      ? Number(Math.max(0.06, Math.min(5.00, rawMaxBudget)).toFixed(4))
      : DEFAULT_MAX_BUDGET_USD;

    const explicitExpiresRaw = String(env.TRYON_FULL_OUTFIT_BENCHMARK_EXPIRES_AT || '').trim();
    let windowExpiresAt = null;
    let invalidExpiryConfig = false;
    if (explicitExpiresRaw) {
      const parsed = Date.parse(explicitExpiresRaw);
      if (!Number.isFinite(parsed)) {
        invalidExpiryConfig = true;
      } else {
        windowExpiresAt = new Date(parsed);
      }
    } else if (enabled) {
      const explicitStartRaw = String(env.TRYON_FULL_OUTFIT_BENCHMARK_STARTED_AT || '').trim();
      const parsedStart = explicitStartRaw ? Date.parse(explicitStartRaw) : NaN;
      if (Number.isFinite(parsedStart)) {
        this.runtimeWindowStartMs = parsedStart;
      } else if (!this.runtimeWindowStartMs) {
        this.runtimeWindowStartMs = now.getTime();
      }
      windowExpiresAt = new Date(this.runtimeWindowStartMs + windowMinutes * 60 * 1000);
    } else {
      this.runtimeWindowStartMs = null;
    }

    return {
      enabled,
      currentEnv,
      allowedEnvs,
      maxJobs,
      windowMinutes,
      windowExpiresAt,
      invalidExpiryConfig,
      rateMax,
      rateWindowMinutes,
      maxBudgetUsd
    };
  }

  async verifyAuthenticatedAdmin({ userId, userRole }) {
    if (!userId || userRole !== 'admin') {
      return false;
    }
    if (isModelQueryable(User)) {
      try {
        const userDoc = await User.findById(userId).select('role');
        if (!userDoc || userDoc.role !== 'admin') {
          return false;
        }
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  async countBenchmarkJobs(sinceDate = null) {
    if (isModelQueryable(TryOnJob)) {
      try {
        const query = { 'benchmark.isBenchmark': true };
        if (sinceDate instanceof Date && Number.isFinite(sinceDate.getTime())) {
          query.createdAt = { $gte: sinceDate };
        }
        return await TryOnJob.countDocuments(query);
      } catch (_) {
        // Fallback below
      }
    }
    return this.fallbackJobCount;
  }

  checkBenchmarkRateLimit(userId, rateMax, rateWindowMinutes, now = new Date()) {
    const key = String(userId);
    const windowMs = rateWindowMinutes * 60 * 1000;
    const nowMs = now.getTime();
    const recent = (this.rateLimitHits.get(key) || []).filter(ts => nowMs - ts < windowMs);
    this.rateLimitHits.set(key, recent);

    if (recent.length >= rateMax) {
      return {
        allowed: false,
        used: recent.length,
        remaining: 0
      };
    }
    return {
      allowed: true,
      used: recent.length,
      remaining: rateMax - recent.length
    };
  }

  recordBenchmarkHit(userId, now = new Date()) {
    const key = String(userId);
    const list = this.rateLimitHits.get(key) || [];
    list.push(now.getTime());
    this.rateLimitHits.set(key, list);
    this.fallbackJobCount += 1;
  }

  /**
   * Evaluate whether authenticated user may submit an Admin-only benchmark Full Outfit job
   * while public Full Outfit remains globally locked (`FULL_OUTFIT_PENDING_BENCHMARK`).
   */
  async evaluateAdminAccess({ userId, userRole, now = new Date() } = {}) {
    const cfg = this.getConfiguration(now);

    const isVerifiedAdmin = await this.verifyAuthenticatedAdmin({ userId, userRole });
    if (!isVerifiedAdmin) {
      return {
        allowed: false,
        statusCode: 400,
        blockCode: 'FULL_OUTFIT_PENDING_BENCHMARK',
        message: 'Full Outfit (Áo + Quần) đang chờ nghiệm thu Benchmark với AI provider thật trước khi Admin kích hoạt.',
        configSnapshot: null
      };
    }

    if (!cfg.enabled || (await this.isEmergencyStopped())) {
      return {
        allowed: false,
        statusCode: 400,
        blockCode: 'FULL_OUTFIT_BENCHMARK_DISABLED',
        message: 'Admin Benchmark Mode cho Full Outfit hiện đang TẮT trong cấu hình backend hoặc đã bị dừng khẩn cấp.',
        configSnapshot: {
          enabled: false,
          currentEnv: cfg.currentEnv,
          maxJobs: cfg.maxJobs,
          maxBudgetUsd: cfg.maxBudgetUsd,
          rateMax: cfg.rateMax,
          rateWindowMinutes: cfg.rateWindowMinutes
        }
      };
    }

    if (!cfg.allowedEnvs.includes(cfg.currentEnv)) {
      return {
        allowed: false,
        statusCode: 403,
        blockCode: 'BENCHMARK_ENV_NOT_ALLOWED',
        message: `Benchmark Mode không được phép chạy trên môi trường "${cfg.currentEnv}".`,
        configSnapshot: { enabled: true, currentEnv: cfg.currentEnv, allowedEnvs: cfg.allowedEnvs }
      };
    }

    if (cfg.invalidExpiryConfig || !cfg.windowExpiresAt || now.getTime() > cfg.windowExpiresAt.getTime()) {
      return {
        allowed: false,
        statusCode: 403,
        blockCode: 'BENCHMARK_WINDOW_EXPIRED',
        message: 'Cửa sổ thời gian Admin Benchmark cho Full Outfit đã hết hạn hoặc cấu hình thời hạn không hợp lệ.',
        configSnapshot: {
          enabled: true,
          currentEnv: cfg.currentEnv,
          windowExpiresAt: cfg.windowExpiresAt ? cfg.windowExpiresAt.toISOString() : null
        }
      };
    }

    const windowStart = this.runtimeWindowStartMs
      ? new Date(this.runtimeWindowStartMs)
      : new Date(cfg.windowExpiresAt.getTime() - cfg.windowMinutes * 60 * 1000);
    const usedJobs = await this.countBenchmarkJobs(windowStart);
    if (usedJobs >= cfg.maxJobs) {
      return {
        allowed: false,
        statusCode: 429,
        blockCode: 'BENCHMARK_MAX_JOBS_EXCEEDED',
        message: `Đã đạt giới hạn tối đa ${cfg.maxJobs} benchmark jobs trong phiên kiểm thử này.`,
        configSnapshot: {
          enabled: true,
          usedJobs,
          maxJobs: cfg.maxJobs
        }
      };
    }

    const rateCheck = this.checkBenchmarkRateLimit(userId, cfg.rateMax, cfg.rateWindowMinutes, now);
    if (!rateCheck.allowed) {
      return {
        allowed: false,
        statusCode: 429,
        blockCode: 'BENCHMARK_RATE_LIMIT_EXCEEDED',
        message: `Vượt quá giới hạn benchmark rate limit (${cfg.rateMax} jobs / ${cfg.rateWindowMinutes} phút).`,
        configSnapshot: {
          enabled: true,
          usedJobs,
          maxJobs: cfg.maxJobs,
          rateMax: cfg.rateMax,
          rateWindowMinutes: cfg.rateWindowMinutes
        }
      };
    }

    return {
      allowed: true,
      blockCode: null,
      statusCode: 200,
      message: 'Admin Benchmark Mode đang hoạt động có kiểm soát.',
      configSnapshot: {
        enabled: true,
        canSubmit: true,
        currentEnv: cfg.currentEnv,
        usedJobs,
        maxJobs: cfg.maxJobs,
        maxBudgetUsd: cfg.maxBudgetUsd,
        remainingJobs: Math.max(0, cfg.maxJobs - usedJobs),
        windowExpiresAt: cfg.windowExpiresAt.toISOString(),
        rateMax: cfg.rateMax,
        rateWindowMinutes: cfg.rateWindowMinutes,
        rateRemaining: rateCheck.remaining
      }
    };
  }

  // =========================================================================
  // ESTIMATED COST GUARD & IN-FLIGHT EMERGENCY STOP (PHASE 6.1)
  // =========================================================================

  /**
   * Reserve estimated spend for a specific step before dispatching AI provider call.
   * Atomically rejects if cumulative spend would exceed maxBudgetUsd (default 0.20 USD)
   * or if an Admin emergency stop was triggered.
   */
  async reserveStepSpend({
    jobId,
    stepIndex = 0,
    slot = '',
    providerId = 'google-vertex-vto-001',
    unitCostUsd = 0.06,
    isBenchmark = false
  } = {}) {
    if (!isBenchmark) {
      return { allowed: true, isBenchmark: false, unitCostUsd: 0 };
    }

    const cost = Number(Math.max(0.01, Number(unitCostUsd) || 0.06).toFixed(4));
    const cfg = this.getConfiguration();
    const maxBudget = cfg.maxBudgetUsd || DEFAULT_MAX_BUDGET_USD;

    // 1. In-flight emergency stop check
    if (await this.isEmergencyStopped()) {
      return {
        allowed: false,
        code: 'BENCHMARK_EMERGENCY_STOPPED',
        statusCode: 409,
        message: 'Benchmark Mode đã bị dừng khẩn cấp bởi Admin; provider call bị chặn.'
      };
    }

    // 2. Gate enablement check
    if (!cfg.enabled) {
      return {
        allowed: false,
        code: 'FULL_OUTFIT_BENCHMARK_DISABLED',
        statusCode: 403,
        message: 'Admin Benchmark Mode hiện đang TẮT trong cấu hình backend.'
      };
    }

    const opKey = `BENCH_RESERVE_${jobId}_step_${stepIndex}`;

    // 3. Persistent MongoDB Reservation path
    if (isBenchmarkLedgerQueryable()) {
      try {
        // Idempotency check: step already reserved
        const existing = await TryOnBenchmarkLedger.findOne({ operationKey: opKey });
        if (existing) {
          if (['RESERVED', 'DISPATCHED', 'COMPLETED', 'INDETERMINATE_TIMEOUT'].includes(existing.status)) {
            return {
              allowed: true,
              alreadyReserved: true,
              operationKey: opKey,
              unitCostUsd: existing.unitCostUsd || cost
            };
          }
        }

        // Ensure CONTROL singleton exists
        await TryOnBenchmarkLedger.findOneAndUpdate(
          { recordType: 'CONTROL', controlKey: 'BENCHMARK_CONTROL' },
          {
            $setOnInsert: {
              recordType: 'CONTROL',
              controlKey: 'BENCHMARK_CONTROL',
              maxBudgetUsd: maxBudget,
              totalReservedUsd: 0,
              totalCommittedUsd: 0,
              totalIndeterminateUsd: 0,
              isEmergencyStopped: false
            }
          },
          { upsert: true, new: true }
        );

        // Atomic compare-and-swap reservation against budget & emergency stop
        const updatedControl = await TryOnBenchmarkLedger.findOneAndUpdate(
          {
            recordType: 'CONTROL',
            controlKey: 'BENCHMARK_CONTROL',
            isEmergencyStopped: { $ne: true },
            $expr: {
              $lte: [
                { $add: ['$totalReservedUsd', cost] },
                '$maxBudgetUsd'
              ]
            }
          },
          {
            $inc: { totalReservedUsd: cost }
          },
          { new: true }
        );

        if (!updatedControl) {
          const currentControl = await TryOnBenchmarkLedger.findOne({
            recordType: 'CONTROL',
            controlKey: 'BENCHMARK_CONTROL'
          });

          if (currentControl?.isEmergencyStopped) {
            this.forceDisabled = true;
            return {
              allowed: false,
              code: 'BENCHMARK_EMERGENCY_STOPPED',
              statusCode: 409,
              message: 'Benchmark Mode đã bị dừng khẩn cấp bởi Admin; provider call bị chặn.'
            };
          }

          const reservedSoFar = currentControl?.totalReservedUsd || 0;
          const curMax = currentControl?.maxBudgetUsd || maxBudget;
          return {
            allowed: false,
            code: 'BENCHMARK_BUDGET_EXCEEDED',
            statusCode: 429,
            message: `Ngân sách ước tính cho Benchmark (${curMax.toFixed(2)} USD) đã đạt giới hạn an toàn (${reservedSoFar.toFixed(2)} USD đã giữ, cần thêm ${cost.toFixed(2)} USD). Không thể thực hiện thêm provider call.`,
            totalReservedUsd: reservedSoFar,
            maxBudgetUsd: curMax
          };
        }

        // Insert step-level reservation record
        await TryOnBenchmarkLedger.create({
          recordType: 'STEP_RESERVATION',
          operationKey: opKey,
          job: jobId,
          stepIndex,
          slot: slot || '',
          providerId: providerId || 'google-vertex-vto-001',
          unitCostUsd: cost,
          status: 'RESERVED'
        }).catch(err => {
          if (err.code !== 11000) throw err;
        });

        return {
          allowed: true,
          operationKey: opKey,
          unitCostUsd: cost,
          totalReservedUsd: updatedControl.totalReservedUsd,
          maxBudgetUsd: updatedControl.maxBudgetUsd
        };
      } catch (dbErr) {
        const existing = await TryOnBenchmarkLedger.findOne({ operationKey: opKey }).catch(() => null);
        if (existing) {
          return { allowed: true, alreadyReserved: true, operationKey: opKey, unitCostUsd: cost };
        }
        throw dbErr;
      }
    }

    // In-memory fallback (when DB is unqueryable in unit tests)
    if (this.inMemoryReservations.has(opKey)) {
      return { allowed: true, alreadyReserved: true, operationKey: opKey, unitCostUsd: cost };
    }

    if (this.inMemoryReservedUsd + cost > maxBudget + 0.0001) {
      return {
        allowed: false,
        code: 'BENCHMARK_BUDGET_EXCEEDED',
        statusCode: 429,
        message: `Ngân sách ước tính cho Benchmark (${maxBudget.toFixed(2)} USD) đã đạt giới hạn an toàn. Không thể thực hiện thêm provider call.`,
        totalReservedUsd: this.inMemoryReservedUsd,
        maxBudgetUsd: maxBudget
      };
    }

    this.inMemoryReservedUsd = Number((this.inMemoryReservedUsd + cost).toFixed(4));
    this.inMemoryReservations.set(opKey, { status: 'RESERVED', unitCostUsd: cost });
    return {
      allowed: true,
      operationKey: opKey,
      unitCostUsd: cost,
      totalReservedUsd: this.inMemoryReservedUsd,
      maxBudgetUsd: maxBudget
    };
  }

  /**
   * Asserts that dispatch is allowed. Throws formatted error if blocked.
   */
  async assertDispatchAllowed(params = {}) {
    const check = await this.reserveStepSpend(params);
    if (!check.allowed) {
      const err = new Error(check.message || 'Provider dispatch bị chặn bởi Benchmark Cost Guard.');
      err.code = check.code || 'BENCHMARK_DISPATCH_BLOCKED';
      err.statusCode = check.statusCode || 403;
      err.isEmergencyStop = (check.code === 'BENCHMARK_EMERGENCY_STOPPED');
      err.isBudgetExceeded = (check.code === 'BENCHMARK_BUDGET_EXCEEDED');
      throw err;
    }
    return check;
  }

  /**
   * Mark step as actively dispatched to AI provider.
   */
  async recordStepDispatched({ jobId, stepIndex = 0 }) {
    const opKey = `BENCH_RESERVE_${jobId}_step_${stepIndex}`;
    if (isBenchmarkLedgerQueryable()) {
      try {
        await TryOnBenchmarkLedger.findOneAndUpdate(
          { operationKey: opKey },
          { $set: { status: 'DISPATCHED', dispatchedAt: new Date() } }
        );
      } catch (_) {}
    } else if (this.inMemoryReservations.has(opKey)) {
      const r = this.inMemoryReservations.get(opKey);
      r.status = 'DISPATCHED';
      r.dispatchedAt = new Date();
    }
  }

  /**
   * Record outcome of step:
   * - ok: marks COMPLETED and increments totalCommittedUsd.
   * - isIndeterminate (timeout after dispatch): marks INDETERMINATE_TIMEOUT, keeps reservation in totalIndeterminateUsd (never refunded!).
   * - pre-dispatch failure: marks FAILED_PRE_DISPATCH and rolls back reservation to free budget.
   */
  async recordStepOutcome({
    jobId,
    stepIndex = 0,
    ok = true,
    isIndeterminate = false,
    error = '',
    unitCostUsd = 0.06
  } = {}) {
    const opKey = `BENCH_RESERVE_${jobId}_step_${stepIndex}`;
    const cost = Number(Math.max(0.01, Number(unitCostUsd) || 0.06).toFixed(4));

    if (isBenchmarkLedgerQueryable()) {
      try {
        if (ok) {
          const stepDoc = await TryOnBenchmarkLedger.findOneAndUpdate(
            { operationKey: opKey, status: { $ne: 'COMPLETED' } },
            { $set: { status: 'COMPLETED', completedAt: new Date() } }
          );
          if (stepDoc) {
            await TryOnBenchmarkLedger.findOneAndUpdate(
              { recordType: 'CONTROL', controlKey: 'BENCHMARK_CONTROL' },
              { $inc: { totalCommittedUsd: cost } }
            );
          }
        } else if (isIndeterminate) {
          const stepDoc = await TryOnBenchmarkLedger.findOneAndUpdate(
            { operationKey: opKey, status: { $ne: 'INDETERMINATE_TIMEOUT' } },
            {
              $set: {
                status: 'INDETERMINATE_TIMEOUT',
                completedAt: new Date(),
                error: String(error || '').slice(0, 300)
              }
            }
          );
          if (stepDoc) {
            await TryOnBenchmarkLedger.findOneAndUpdate(
              { recordType: 'CONTROL', controlKey: 'BENCHMARK_CONTROL' },
              { $inc: { totalIndeterminateUsd: cost } }
            );
          }
        } else {
          const stepDoc = await TryOnBenchmarkLedger.findOneAndUpdate(
            { operationKey: opKey, status: { $ne: 'FAILED_PRE_DISPATCH' } },
            {
              $set: {
                status: 'FAILED_PRE_DISPATCH',
                completedAt: new Date(),
                error: String(error || '').slice(0, 300)
              }
            }
          );
          if (stepDoc) {
            await TryOnBenchmarkLedger.findOneAndUpdate(
              { recordType: 'CONTROL', controlKey: 'BENCHMARK_CONTROL' },
              { $inc: { totalReservedUsd: -cost } }
            );
          }
        }
      } catch (_) {}
    } else {
      if (this.inMemoryReservations.has(opKey)) {
        const r = this.inMemoryReservations.get(opKey);
        if (ok && r.status !== 'COMPLETED') {
          r.status = 'COMPLETED';
          this.inMemoryCommittedUsd = Number((this.inMemoryCommittedUsd + cost).toFixed(4));
        } else if (isIndeterminate && r.status !== 'INDETERMINATE_TIMEOUT') {
          r.status = 'INDETERMINATE_TIMEOUT';
          this.inMemoryIndeterminateUsd = Number((this.inMemoryIndeterminateUsd + cost).toFixed(4));
        } else if (!ok && !isIndeterminate && r.status !== 'FAILED_PRE_DISPATCH') {
          r.status = 'FAILED_PRE_DISPATCH';
          this.inMemoryReservedUsd = Number(Math.max(0, this.inMemoryReservedUsd - cost).toFixed(4));
        }
      }
    }
  }

  /**
   * Return comprehensive benchmark spend & emergency stop status.
   */
  async getBenchmarkSpendSummary() {
    const cfg = this.getConfiguration();
    if (isBenchmarkLedgerQueryable()) {
      try {
        const control = await TryOnBenchmarkLedger.findOne({
          recordType: 'CONTROL',
          controlKey: 'BENCHMARK_CONTROL'
        });
        const maxBudgetUsd = control?.maxBudgetUsd || cfg.maxBudgetUsd || DEFAULT_MAX_BUDGET_USD;
        const totalReservedUsd = Number((control?.totalReservedUsd || 0).toFixed(4));
        const totalCommittedUsd = Number((control?.totalCommittedUsd || 0).toFixed(4));
        const totalIndeterminateUsd = Number((control?.totalIndeterminateUsd || 0).toFixed(4));
        return {
          enabled: cfg.enabled,
          isEmergencyStopped: Boolean(control?.isEmergencyStopped || this.forceDisabled),
          emergencyStoppedAt: control?.emergencyStoppedAt || null,
          emergencyReason: control?.emergencyReason || '',
          maxBudgetUsd,
          totalReservedUsd,
          totalCommittedUsd,
          totalIndeterminateUsd,
          remainingBudgetUsd: Number(Math.max(0, maxBudgetUsd - totalReservedUsd).toFixed(4)),
          currency: 'USD',
          confirmedBillingCostUsd: null,
          billingIntegrationActive: false,
          note: 'Estimated Cost Guard (Application-level). Not a Google Cloud Billing hard cap.'
        };
      } catch (_) {}
    }

    const maxBudgetUsd = cfg.maxBudgetUsd || DEFAULT_MAX_BUDGET_USD;
    return {
      enabled: cfg.enabled,
      isEmergencyStopped: this.forceDisabled,
      emergencyStoppedAt: null,
      emergencyReason: '',
      maxBudgetUsd,
      totalReservedUsd: this.inMemoryReservedUsd,
      totalCommittedUsd: this.inMemoryCommittedUsd,
      totalIndeterminateUsd: this.inMemoryIndeterminateUsd,
      remainingBudgetUsd: Number(Math.max(0, maxBudgetUsd - this.inMemoryReservedUsd).toFixed(4)),
      currency: 'USD',
      confirmedBillingCostUsd: null,
      billingIntegrationActive: false,
      note: 'Estimated Cost Guard (Application-level). Not a Google Cloud Billing hard cap.'
    };
  }
}

module.exports = new FullOutfitBenchmarkGate();
module.exports.FullOutfitBenchmarkGate = FullOutfitBenchmarkGate;
