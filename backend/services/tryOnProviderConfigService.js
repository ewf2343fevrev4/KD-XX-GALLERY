const mongoose = require('mongoose');
const TryOnProviderConfig = require('../models/TryOnProviderConfig');
const providerRegistry = require('./providers/TryOnProviderRegistry');

const ALLOWED_ADMIN_STATUS_OVERRIDES = new Set([
  'VERIFIED',
  'LIMITED',
  'EXPERIMENTAL',
  'UNSUPPORTED',
  'NOT_CONFIGURED',
  'DEPRECATED'
]);

function isConfigCollectionQueryable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    TryOnProviderConfig.find !== mongoose.Model.find
  );
}

/**
 * Strips potentially sensitive query params, bearer tokens, or filesystem paths from error logs.
 */
function sanitizeProviderErrorMessage(message = '') {
  return String(message || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|api_key|sig|signature)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 400);
}

class TryOnProviderConfigService {
  constructor(options = {}) {
    this.registry = options.registry || providerRegistry;
  }

  async loadConfigsMap() {
    const map = new Map();
    if (!isConfigCollectionQueryable()) {
      return map;
    }
    try {
      const docs = await TryOnProviderConfig.find({});
      for (const doc of docs) {
        if (doc && doc.providerId) {
          map.set(doc.providerId, doc);
        }
      }
    } catch (_) {
      // Safe fallback when DB connection is offline (e.g., isolated unit tests)
    }
    return map;
  }

  async recordProviderOutcome(providerId, { ok = true, errorCode = '', errorMessage = '', category = '' } = {}) {
    if (!providerId || !isConfigCollectionQueryable()) return null;
    try {
      let doc = await TryOnProviderConfig.findOne({ providerId });
      if (!doc) {
        doc = await TryOnProviderConfig.create({ providerId });
      }
      if (!doc.circuitBreaker) {
        doc.circuitBreaker = { state: 'CLOSED', consecutiveFailures: 0, failureThreshold: 5 };
      }

      if (ok) {
        doc.circuitBreaker.consecutiveFailures = 0;
        doc.circuitBreaker.state = 'CLOSED';
        doc.circuitBreaker.openedAt = null;
      } else {
        const nextFails = (doc.circuitBreaker.consecutiveFailures || 0) + 1;
        doc.circuitBreaker.consecutiveFailures = nextFails;
        doc.circuitBreaker.lastFailureAt = new Date();
        if (nextFails >= (doc.circuitBreaker.failureThreshold || 5)) {
          doc.circuitBreaker.state = 'OPEN';
          doc.circuitBreaker.openedAt = new Date();
        }
        doc.lastError = {
          code: String(errorCode || 'PROVIDER_ERROR').slice(0, 80),
          message: sanitizeProviderErrorMessage(errorMessage),
          category: String(category || '').slice(0, 60),
          occurredAt: new Date()
        };
      }
      await doc.save();
      return doc;
    } catch (_) {
      return null;
    }
  }

  async getAdminRegistrySnapshot(now = new Date()) {
    const configsMap = await this.loadConfigsMap();
    const providers = [];
    const recentAuditLogs = [];

    for (const adapter of this.registry.getAllProviders()) {
      const cfg = configsMap.get(adapter.providerId) || null;
      const health = await adapter.healthCheck(now);
      const state = this.registry.getEffectiveProviderState(adapter, cfg, now);

      const categoryOverrides = {};
      if (state.caps.categoryCapabilities) {
        for (const [catKey, catInfo] of Object.entries(state.caps.categoryCapabilities)) {
          const overrideVal = cfg?.categoryOverrides?.[catKey];
          categoryOverrides[catKey] = {
            status: state.retired
              ? 'DEPRECATED'
              : state.effectiveStatus === 'DEPRECATED'
                ? 'DEPRECATED'
                : catInfo.status,
            defaultEnabled: Boolean(catInfo.isEnabledByDefault),
            effectiveEnabled:
              !state.retired &&
              state.isEnabled &&
              (typeof overrideVal === 'boolean' ? overrideVal : Boolean(catInfo.isEnabledByDefault)),
            limitations: catInfo.limitations || '',
            verificationSource: catInfo.verificationSource || ''
          };
        }
      }

      providers.push({
        providerId: health.providerId,
        providerName: health.providerName,
        displayName: health.displayName,
        modelId: health.modelId,
        available: state.isEnabled,
        baseAvailable: state.isBaseAvailable,
        adminEnabled: state.isAdminEnabled,
        credentialsConfigured: Boolean(health.credentialsConfigured),
        requiredEnvVars: health.requiredEnvVars || [],
        authenticationMethod: health.authenticationMethod,
        region: health.region,
        documentationUrl: health.documentationUrl,
        verificationStatus: state.effectiveStatus,
        baseVerificationStatus: state.caps.verificationStatus,
        lifecycleStage: state.caps.lifecycleStage,
        deprecationDate: state.caps.deprecationDate,
        retirementDate: state.caps.retirementDate,
        isPastRetirement: state.retired,
        lastVerifiedAt: state.caps.lastVerifiedAt,
        estimatedCost: state.caps.estimatedCost,
        inputRequirements: state.caps.inputRequirements,
        outputRequirements: state.caps.outputRequirements,
        supportedCategories: state.caps.supportedCategories,
        supportedSubcategories: state.caps.supportedSubcategories,
        supportsMultipleProducts: Boolean(state.caps.supportsMultipleProducts),
        supportsFullOutfit: Boolean(state.caps.supportsFullOutfit),
        supportsPrompt: Boolean(state.caps.supportsPrompt),
        supportsReferenceImage: Boolean(state.caps.supportsReferenceImage),
        limitations: state.caps.limitations || [],
        categoryCapabilities: categoryOverrides,
        defaultForCategories: Array.isArray(cfg?.defaultForCategories) ? cfg.defaultForCategories : [],
        lastError: cfg?.lastError?.code ? cfg.lastError : null,
        circuitBreaker: cfg?.circuitBreaker || { state: 'CLOSED', consecutiveFailures: 0, failureThreshold: 5 },
        auditLogCount: Array.isArray(cfg?.auditLogs) ? cfg.auditLogs.length : 0
      });

      if (Array.isArray(cfg?.auditLogs)) {
        for (const entry of cfg.auditLogs) {
          recentAuditLogs.push({
            providerId: adapter.providerId,
            displayName: adapter.displayName,
            action: entry.action,
            actorEmail: entry.actorEmail || '',
            actorRole: entry.actorRole || 'admin',
            summary: entry.summary || '',
            before: entry.before || null,
            after: entry.after || null,
            timestamp: entry.timestamp
          });
        }
      }
    }

    recentAuditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      providers,
      categoryMatrix: this.registry.buildCategoryMatrix(now, configsMap),
      auditLogs: recentAuditLogs.slice(0, 50)
    };
  }

  /**
   * Controlled Admin update of provider enablement, verification status, category toggles, or defaults.
   * Explicitly prevents enabling retired, unconfigured, or unimplemented providers.
   */
  async adminUpdateProviderConfig({
    providerId,
    adminUser,
    isEnabled,
    categoryOverrides,
    categoryApproval,
    limitedCategoryApprovals,
    verificationStatusOverride,
    setAsDefaultForCategories,
    resetCircuitBreaker,
    reason = '',
    now = new Date()
  }) {
    const adapter = this.registry.getProvider(providerId);
    if (!adapter) {
      const err = new Error(`Không tìm thấy provider "${providerId}" trong Registry`);
      err.code = 'PROVIDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const caps = adapter.getCapabilities(now);
    const retired = Boolean(caps.isPastRetirement);

    if (verificationStatusOverride !== undefined && verificationStatusOverride !== null && !ALLOWED_ADMIN_STATUS_OVERRIDES.has(verificationStatusOverride)) {
      const err = new Error(`Trạng thái verification "${verificationStatusOverride}" không hợp lệ`);
      err.code = 'INVALID_VERIFICATION_STATUS';
      err.statusCode = 400;
      throw err;
    }

    if (retired && verificationStatusOverride !== undefined && verificationStatusOverride !== null && verificationStatusOverride !== 'DEPRECATED') {
      const err = new Error(
        `Không thể thay đổi trạng thái lifecycle của provider "${providerId}" sau ngày retirement (${caps.retirementDate || 'N/A'}).`
      );
      err.code = 'CANNOT_OVERRIDE_RETIRED_PROVIDER';
      err.statusCode = 400;
      throw err;
    }

    const wantsEnable = isEnabled === true ||
      (categoryOverrides && Object.values(categoryOverrides).some(v => v === true)) ||
      (Array.isArray(setAsDefaultForCategories) && setAsDefaultForCategories.length > 0);

    if (wantsEnable) {
      if (retired || caps.effectiveVerificationStatus === 'DEPRECATED' || verificationStatusOverride === 'DEPRECATED') {
        const err = new Error(
          `Không thể kích hoạt provider "${providerId}" vì model "${adapter.modelId}" đã hết hạn phục vụ (retirement: ${caps.retirementDate || 'N/A'}) hoặc bị đánh dấu DEPRECATED.`
        );
        err.code = 'CANNOT_ENABLE_RETIRED_PROVIDER';
        err.statusCode = 400;
        throw err;
      }

      if (caps.verificationStatus === 'NOT_CONFIGURED' || !adapter.isAvailable(now)) {
        const err = new Error(
          `Không thể bật hoặc đặt mặc định provider "${providerId}" vì chưa được cấu hình credentials / chưa triển khai adapter (${(caps.requiredEnvVars || []).join(', ') || 'NOT_CONFIGURED'}).`
        );
        err.code = 'CANNOT_ENABLE_UNCONFIGURED_PROVIDER';
        err.statusCode = 400;
        throw err;
      }
    }

    // Prevent blindly promoting NOT_CONFIGURED / stub / EXPERIMENTAL provider to VERIFIED
    if (verificationStatusOverride === 'VERIFIED' && (!adapter.isAvailable(now) || !caps.credentialsConfigured || caps.verificationStatus === 'EXPERIMENTAL')) {
      const err = new Error(
        `Không thể chuyển "${providerId}" sang VERIFIED khi chưa cấu hình credentials, chưa triển khai hoặc đang ở trạng thái EXPERIMENTAL.`
      );
      err.code = 'CANNOT_VERIFY_UNCONFIGURED_PROVIDER';
      err.statusCode = 400;
      throw err;
    }

    let doc = await TryOnProviderConfig.findOne({ providerId });
    if (!doc) {
      doc = await TryOnProviderConfig.create({ providerId });
    }

    const beforeSnapshot = {
      isEnabled: doc.isEnabled,
      categoryOverrides: { ...(doc.categoryOverrides || {}) },
      verificationStatusOverride: doc.verificationStatusOverride,
      defaultForCategories: [...(doc.defaultForCategories || [])],
      circuitBreakerState: doc.circuitBreaker?.state || 'CLOSED'
    };

    if (typeof isEnabled === 'boolean') {
      doc.isEnabled = isEnabled;
    }

    const effectiveProviderEnabled = typeof isEnabled === 'boolean'
      ? isEnabled
      : (typeof doc.isEnabled === 'boolean' ? doc.isEnabled : Boolean(adapter.isAvailable(now)));
    const effectiveCbOpen = !resetCircuitBreaker && doc.circuitBreaker?.state === 'OPEN';

    if (categoryOverrides && typeof categoryOverrides === 'object') {
      const nextOverrides = { ...(doc.categoryOverrides || {}) };
      const nextApprovals = { ...(doc.limitedCategoryApprovals || {}) };

      for (const [k, v] of Object.entries(categoryOverrides)) {
        if (typeof v !== 'boolean') continue;

        if (v === false) {
          nextOverrides[k] = false;
          continue;
        }

        // Strict category governance when enabling (v === true)
        if (!effectiveProviderEnabled || effectiveCbOpen) {
          const err = new Error(
            `Không thể bật danh mục "${k}" trên provider "${providerId}" khi provider đang tắt hoặc mạch bảo vệ (circuit breaker) đang mở.`
          );
          err.code = 'CANNOT_ENABLE_CATEGORY_ON_DISABLED_PROVIDER';
          err.statusCode = 400;
          throw err;
        }

        const catInfo = caps.categoryCapabilities?.[k];
        if (!catInfo || catInfo.status === 'UNSUPPORTED') {
          const err = new Error(`Không thể bật danh mục "${k}" trên provider "${providerId}" vì không được hỗ trợ (UNSUPPORTED).`);
          err.code = 'CANNOT_ENABLE_UNSUPPORTED_CATEGORY';
          err.statusCode = 400;
          throw err;
        }

        if (catInfo.status === 'DEPRECATED') {
          const err = new Error(`Không thể bật danh mục "${k}" trên provider "${providerId}" vì model đã DEPRECATED.`);
          err.code = 'CANNOT_ENABLE_RETIRED_PROVIDER';
          err.statusCode = 400;
          throw err;
        }

        if (catInfo.status === 'NOT_CONFIGURED') {
          const err = new Error(`Không thể bật danh mục "${k}" trên provider "${providerId}" vì chưa cấu hình (NOT_CONFIGURED).`);
          err.code = 'CANNOT_ENABLE_UNCONFIGURED_CATEGORY';
          err.statusCode = 400;
          throw err;
        }

        if (catInfo.status === 'EXPERIMENTAL') {
          const err = new Error(`Không thể bật danh mục "${k}" trên provider "${providerId}" vì đang ở trạng thái EXPERIMENTAL.`);
          err.code = 'CANNOT_ENABLE_EXPERIMENTAL_CATEGORY';
          err.statusCode = 400;
          throw err;
        }

        if (catInfo.status === 'LIMITED') {
          const approvalPayload =
            (limitedCategoryApprovals && limitedCategoryApprovals[k]) ||
            (categoryApproval && (!categoryApproval.category || categoryApproval.category === k) ? categoryApproval : null);

          const hasJobIds = Array.isArray(approvalPayload?.benchmarkJobIds) && approvalPayload.benchmarkJobIds.length > 0;
          const hasSummary = String(approvalPayload?.evidenceSummary || '').trim().length >= 15;
          const hasValidEvidence =
            approvalPayload &&
            approvalPayload.benchmarkPassed === true &&
            approvalPayload.limitationsAcknowledged === true &&
            (hasJobIds || hasSummary);

          if (!hasValidEvidence) {
            const err = new Error(
              `Danh mục "${k}" đang ở mức LIMITED. Cần cơ chế phê duyệt riêng kèm bằng chứng benchmark đạt chuẩn (benchmarkPassed, limitationsAcknowledged, benchmarkJobIds hoặc evidenceSummary >= 15 ký tự).`
            );
            err.code = 'LIMITED_CATEGORY_APPROVAL_REQUIRED';
            err.statusCode = 400;
            throw err;
          }

          nextApprovals[k] = {
            approvedAt: now,
            approvedBy: adminUser?._id || null,
            approvedByEmail: adminUser?.email || '',
            benchmarkPassed: true,
            limitationsAcknowledged: true,
            benchmarkJobIds: hasJobIds ? approvalPayload.benchmarkJobIds.map(String).slice(0, 20) : [],
            evidenceSummary: String(approvalPayload.evidenceSummary || '').trim().slice(0, 500),
            acknowledgedLimitations: catInfo.limitations || ''
          };
        }

        nextOverrides[k] = true;
      }

      doc.categoryOverrides = nextOverrides;
      doc.limitedCategoryApprovals = nextApprovals;
      if (typeof doc.markModified === 'function') {
        doc.markModified('categoryOverrides');
        doc.markModified('limitedCategoryApprovals');
      }
    }

    if (verificationStatusOverride !== undefined) {
      doc.verificationStatusOverride = verificationStatusOverride || null;
    }

    if (Array.isArray(setAsDefaultForCategories)) {
      const cleanCats = Array.from(new Set(setAsDefaultForCategories.map(c => String(c).trim().toLowerCase()).filter(Boolean)));
      for (const catKey of cleanCats) {
        const catInfo = caps.categoryCapabilities?.[catKey];
        const hasLimitedApproval = Boolean(doc.limitedCategoryApprovals?.[catKey]?.benchmarkPassed && doc.categoryOverrides?.[catKey] === true);
        if (
          !catInfo ||
          catInfo.status === 'UNSUPPORTED' ||
          catInfo.status === 'NOT_CONFIGURED' ||
          catInfo.status === 'EXPERIMENTAL' ||
          catInfo.status === 'DEPRECATED' ||
          (catInfo.status === 'LIMITED' && !hasLimitedApproval)
        ) {
          const err = new Error(`Provider "${providerId}" không đủ điều kiện làm mặc định cho danh mục "${catKey}" (${catInfo?.status || 'UNKNOWN'}).`);
          err.code = 'INELIGIBLE_DEFAULT_PROVIDER';
          err.statusCode = 400;
          throw err;
        }
      }
      doc.defaultForCategories = cleanCats;
    }

    if (resetCircuitBreaker === true) {
      doc.circuitBreaker = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        failureThreshold: doc.circuitBreaker?.failureThreshold || 5,
        openedAt: null,
        lastFailureAt: null
      };
    }

    const afterSnapshot = {
      isEnabled: doc.isEnabled,
      categoryOverrides: { ...(doc.categoryOverrides || {}) },
      verificationStatusOverride: doc.verificationStatusOverride,
      defaultForCategories: [...(doc.defaultForCategories || [])],
      circuitBreakerState: doc.circuitBreaker?.state || 'CLOSED'
    };

    doc.updatedBy = adminUser?._id || null;
    if (!Array.isArray(doc.auditLogs)) doc.auditLogs = [];
    doc.auditLogs.push({
      action: 'ADMIN_PROVIDER_CONFIG_UPDATED',
      actorUser: adminUser?._id || null,
      actorEmail: adminUser?.email || '',
      actorRole: adminUser?.role || 'admin',
      summary: String(reason || '').trim() || `Cập nhật cấu hình provider ${providerId}`,
      before: beforeSnapshot,
      after: afterSnapshot,
      timestamp: new Date()
    });

    await doc.save();
    return this.getAdminRegistrySnapshot(now);
  }
}

module.exports = new TryOnProviderConfigService();
module.exports.TryOnProviderConfigService = TryOnProviderConfigService;
module.exports.sanitizeProviderErrorMessage = sanitizeProviderErrorMessage;
