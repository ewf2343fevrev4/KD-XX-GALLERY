const TryOnJob = require('../models/TryOnJob');

/**
 * Computes real runtime telemetry from actual TryOnJob records in MongoDB
 * at BOTH job level and execution-step / provider-call level.
 * Never fabricates billing invoices or turns estimated unit costs into confirmed billing cost.
 */
class TryOnUsageStatsService {
  _ensureProviderEntry(byProvider, providerId) {
    if (!byProvider.has(providerId)) {
      byProvider.set(providerId, {
        providerId,
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        indeterminateCalls: 0,
        totalDurationMs: 0,
        estimatedCostUsd: 0,
        confirmedBillingCostUsd: null,
        unknownPendingReconciliationCostUsd: 0,
        failureRate: 0
      });
    }
    return byProvider.get(providerId);
  }

  async getProviderAndCategoryStats({ days = 30 } = {}) {
    const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
    const sinceDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const jobs = await TryOnJob.find({
      createdAt: { $gte: sinceDate }
    })
      .select('mode status provider executionSteps aiProviderDetails reconciliation productSnapshot timing createdAt')
      .lean()
      .catch(() => []);

    const byProvider = new Map();
    const byCategory = new Map();
    let totalJobs = 0;
    let completedJobs = 0;
    let failedJobs = 0;

    let totalProviderCalls = 0;
    let successfulCalls = 0;
    let failedCalls = 0;
    let timeoutIndeterminateCalls = 0;

    let totalEstimatedUsd = 0;
    let totalUnknownPendingReconciliationUsd = 0;
    let confirmedBillingUsdSum = 0;
    let hasConfirmedBilling = false;

    for (const job of jobs) {
      totalJobs += 1;
      const defaultProviderId = job.aiProviderDetails?.providerId || job.provider || 'unknown';
      const subCat =
        job.productSnapshot?.normalizedSubCategory ||
        job.productSnapshot?.category?.subCategory ||
        job.productSnapshot?.category?.domain ||
        'unknown';
      const domain =
        job.productSnapshot?.normalizedDomain ||
        job.productSnapshot?.category?.domain ||
        'unknown';
      const isCompleted = job.status === 'COMPLETED';
      const isFailed = job.status === 'FAILED' || job.status === 'RECONCILIATION_REQUIRED';
      const durationMs = Number(job.timing?.durationMs || 0);

      if (isCompleted) completedJobs += 1;
      if (isFailed) failedJobs += 1;

      const jobEstCost = Number(job.aiProviderDetails?.estimatedCostUsd || 0);
      const jobUnknownCost = Number(
        job.aiProviderDetails?.unknownReconciliationCostUsd ||
        job.reconciliation?.pendingCostUsd ||
        0
      );
      if (typeof job.aiProviderDetails?.confirmedBillingCostUsd === 'number') {
        hasConfirmedBilling = true;
        confirmedBillingUsdSum += job.aiProviderDetails.confirmedBillingCostUsd;
      }

      totalEstimatedUsd += jobEstCost;
      totalUnknownPendingReconciliationUsd += jobUnknownCost;

      const pJobEntry = this._ensureProviderEntry(byProvider, defaultProviderId);
      pJobEntry.totalJobs += 1;
      if (isCompleted) pJobEntry.completedJobs += 1;
      if (isFailed) pJobEntry.failedJobs += 1;
      if (durationMs > 0) pJobEntry.totalDurationMs += durationMs;

      // Step-level execution telemetry (or backward-compatible single-step projection for legacy jobs)
      const steps = Array.isArray(job.executionSteps) && job.executionSteps.length > 0
        ? job.executionSteps
        : null;

      if (steps) {
        for (const step of steps) {
          const stepProvider = step.providerId || defaultProviderId;
          const pStepEntry = this._ensureProviderEntry(byProvider, stepProvider);
          const wasDispatched = Boolean(step.dispatchedAt || step.providerRequestId || step.status === 'COMPLETED' || step.status === 'RECONCILIATION_REQUIRED');
          const stepEstCost = Number(step.estimatedCostUsd || 0);
          const stepUnknownCost = Number(step.pendingReconciliationCostUsd || 0);

          if (wasDispatched) {
            totalProviderCalls += 1;
            pStepEntry.totalCalls += 1;

            if (step.status === 'COMPLETED') {
              successfulCalls += 1;
              pStepEntry.successfulCalls += 1;
            } else if (step.status === 'RECONCILIATION_REQUIRED') {
              timeoutIndeterminateCalls += 1;
              pStepEntry.indeterminateCalls += 1;
            } else if (step.status === 'FAILED') {
              failedCalls += 1;
              pStepEntry.failedCalls += 1;
            }
          }

          pStepEntry.estimatedCostUsd = Number((pStepEntry.estimatedCostUsd + stepEstCost).toFixed(4));
          pStepEntry.unknownPendingReconciliationCostUsd = Number(
            (pStepEntry.unknownPendingReconciliationCostUsd + stepUnknownCost).toFixed(4)
          );
          if (typeof step.confirmedCostUsd === 'number') {
            hasConfirmedBilling = true;
            pStepEntry.confirmedBillingCostUsd = Number(((pStepEntry.confirmedBillingCostUsd || 0) + step.confirmedCostUsd).toFixed(4));
          }
        }
      } else {
        // Legacy Single Item job projection (never double-counts)
        const wasDispatched = Boolean(
          job.aiProviderDetails?.dispatchedAt ||
          job.providerRequestId ||
          job.status === 'COMPLETED' ||
          job.status === 'RECONCILIATION_REQUIRED'
        );
        if (wasDispatched) {
          totalProviderCalls += 1;
          pJobEntry.totalCalls += 1;

          if (job.status === 'COMPLETED') {
            successfulCalls += 1;
            pJobEntry.successfulCalls += 1;
          } else if (job.status === 'RECONCILIATION_REQUIRED') {
            timeoutIndeterminateCalls += 1;
            pJobEntry.indeterminateCalls += 1;
          } else if (job.status === 'FAILED') {
            failedCalls += 1;
            pJobEntry.failedCalls += 1;
          }
        }

        pJobEntry.estimatedCostUsd = Number((pJobEntry.estimatedCostUsd + jobEstCost).toFixed(4));
        pJobEntry.unknownPendingReconciliationCostUsd = Number(
          (pJobEntry.unknownPendingReconciliationCostUsd + jobUnknownCost).toFixed(4)
        );
      }

      if (!byCategory.has(subCat)) {
        byCategory.set(subCat, {
          category: subCat,
          domain,
          totalJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          estimatedCostUsd: 0,
          unknownPendingReconciliationCostUsd: 0,
          failureRate: 0
        });
      }
      const cEntry = byCategory.get(subCat);
      cEntry.totalJobs += 1;
      if (isCompleted) cEntry.completedJobs += 1;
      if (isFailed) cEntry.failedJobs += 1;
      cEntry.estimatedCostUsd = Number((cEntry.estimatedCostUsd + jobEstCost).toFixed(4));
      cEntry.unknownPendingReconciliationCostUsd = Number(
        (cEntry.unknownPendingReconciliationCostUsd + jobUnknownCost).toFixed(4)
      );
    }

    const providerList = Array.from(byProvider.values()).map(p => ({
      ...p,
      avgDurationMs: p.completedJobs > 0 ? Math.round(p.totalDurationMs / p.completedJobs) : 0,
      failureRate: p.totalJobs > 0 ? Number(((p.failedJobs / p.totalJobs) * 100).toFixed(1)) : 0
    }));

    const categoryList = Array.from(byCategory.values()).map(c => ({
      ...c,
      failureRate: c.totalJobs > 0 ? Number(((c.failedJobs / c.totalJobs) * 100).toFixed(1)) : 0
    }));

    return {
      windowDays: safeDays,
      totalJobs,
      completedJobs,
      failedJobs,
      failureRate: totalJobs > 0 ? Number(((failedJobs / totalJobs) * 100).toFixed(1)) : 0,
      totalProviderCalls,
      successfulCalls,
      failedCalls,
      timeoutIndeterminateCalls,
      totalEstimatedUsd: Number(totalEstimatedUsd.toFixed(4)),
      costBreakdown: {
        estimatedCostUsd: Number(totalEstimatedUsd.toFixed(4)),
        confirmedBillingCostUsd: hasConfirmedBilling ? Number(confirmedBillingUsdSum.toFixed(4)) : null,
        unknownPendingReconciliationCostUsd: Number(totalUnknownPendingReconciliationUsd.toFixed(4)),
        billingIntegrationActive: false,
        note: 'Estimated cost dựa trên đơn giá model với các bước hoàn tất; Confirmed billing là null vì chưa tích hợp Google Cloud Billing API.'
      },
      byProvider: providerList,
      byCategory: categoryList
    };
  }
}

module.exports = new TryOnUsageStatsService();
module.exports.TryOnUsageStatsService = TryOnUsageStatsService;
