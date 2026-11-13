const mongoose = require('mongoose');
const TryOnCredit = require('../models/TryOnCredit');
const TryOnCreditLot = require('../models/TryOnCreditLot');
const TryOnCreditLedger = require('../models/TryOnCreditLedger');
const TryOnCreditSettlement = require('../models/TryOnCreditSettlement');
const User = require('../models/User');

function isSettlementModelQueryable() {
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    TryOnCreditSettlement.findOne !== mongoose.Model.findOne
  );
}

function isTransactionUnsupportedError(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    err.code === 20 ||
    err.codeName === 'IllegalOperation' ||
    msg.includes('replica set') ||
    msg.includes('mongos') ||
    msg.includes('transaction numbers') ||
    msg.includes('sessions are not supported') ||
    msg.includes('withtransaction is not a function')
  );
}

class TryOnCreditService {
  constructor() {
    this._settlementLocks = new Map();
  }

  /**
   * Serializes concurrent settlement attempts for the same jobId inside a single worker.
   */
  async _withJobSettlementLock(jobId, taskFn) {
    const key = String(jobId);
    const previous = this._settlementLocks.get(key) || Promise.resolve();
    let release;
    const current = new Promise(resolve => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this._settlementLocks.set(key, chained);

    try {
      await previous;
      return await taskFn();
    } finally {
      release();
      if (this._settlementLocks.get(key) === chained) {
        this._settlementLocks.delete(key);
      }
    }
  }
  /**
   * Get or initialize customer credit account
   * Automatically grants 10 Free credits if never claimed, or unlimited 999.999 for Admin
   * @param {string|ObjectId} userId
   * @returns {Promise<TryOnCredit>}
   */
  async getOrCreateAccount(userId) {
    const userDoc = await User.findById(userId).select('role name email');
    const isAdmin = userDoc && userDoc.role === 'admin';

    let credit = await TryOnCredit.findOne({ user: userId });

    if (!credit) {
      const initialCredits = isAdmin ? 999999 : 10;
      const initialType = isAdmin ? 'admin' : 'free';

      credit = await TryOnCredit.create({
        user: userId,
        freeCreditsClaimed: true,
        membershipType: initialType,
        totalAvailableCredits: initialCredits
      });

      // Grant initial lot
      const lot = await TryOnCreditLot.create({
        user: userId,
        lotType: isAdmin ? 'admin' : 'free',
        initialAmount: initialCredits,
        remainingAmount: initialCredits,
        reservedAmount: 0,
        expiresAt: null,
        isActive: true,
        sourceRef: isAdmin ? 'ADMIN_OWNER_UNLIMITED' : 'INITIAL_WELCOME_FREE'
      });

      // Record immutable ledger transaction
      await TryOnCreditLedger.create({
        user: userId,
        lot: lot._id,
        transactionType: isAdmin ? 'ADMIN_UNLIMITED' : 'GRANT_FREE',
        amount: initialCredits,
        balanceAfter: initialCredits,
        reason: isAdmin
          ? 'Đặc quyền Chủ sở hữu / Admin: Cấp 999.999 lượt thử đồ AI sử dụng không giới hạn'
          : 'Khởi tạo tài khoản — Tặng 10 lượt thử đồ AI miễn phí trải nghiệm KD-XX'
      });
    } else {
      // If user is admin, guarantee they have unlimited admin lot and 999,999 credits!
      if (isAdmin) {
        if (credit.membershipType !== 'admin' || credit.totalAvailableCredits < 500000) {
          credit.membershipType = 'admin';
          await credit.save();

          let adminLot = await TryOnCreditLot.findOne({ user: userId, lotType: 'admin' });
          if (!adminLot) {
            adminLot = await TryOnCreditLot.create({
              user: userId,
              lotType: 'admin',
              initialAmount: 999999,
              remainingAmount: 999999,
              reservedAmount: 0,
              expiresAt: null,
              isActive: true,
              sourceRef: 'ADMIN_OWNER_UNLIMITED'
            });
          } else {
            adminLot.remainingAmount = 999999;
            adminLot.reservedAmount = 0;
            adminLot.isActive = true;
            await adminLot.save();
          }

          await TryOnCreditLedger.create({
            user: userId,
            lot: adminLot._id,
            transactionType: 'ADMIN_UNLIMITED',
            amount: 999999,
            balanceAfter: 999999,
            reason: 'Đặc quyền Chủ sở hữu / Admin: Kích hoạt 999.999 lượt thử đồ AI không giới hạn'
          });
        }
      } else {
        // Automatically check HOMIE membership expiration (Admin never expires)
        if (credit.membershipType === 'homie' && credit.membershipExpiresAt) {
          if (new Date() > new Date(credit.membershipExpiresAt)) {
            await TryOnCredit.findOneAndUpdate(
              {
                _id: credit._id,
                membershipType: 'homie',
                membershipExpiresAt: { $lt: new Date() }
              },
              { $set: { membershipType: 'free' } }
            );
            credit.membershipType = 'free';
          }
        }
      }

      await this.recalculateAvailableBalance(userId);
      credit = await TryOnCredit.findOne({ user: userId });
    }

    return credit;
  }

  /**
   * Check and synchronize membership status against expiration
   * Auto-downgrades expired HOMIE accounts to 'free' while preserving valid credit lots
   * Protects Admin Unlimited Pass from ever downgrading
   * @param {string|ObjectId} userId
   * @returns {Promise<TryOnCredit>}
   */
  async checkAndSyncMembership(userId) {
    const userDoc = await User.findById(userId).select('role');
    const isAdmin = userDoc && userDoc.role === 'admin';

    let credit = await TryOnCredit.findOne({ user: userId });
    if (!credit) {
      return this.getOrCreateAccount(userId);
    }

    if (isAdmin) {
      if (credit.membershipType !== 'admin') {
        credit.membershipType = 'admin';
        await credit.save();
      }
      return credit;
    }

    if (credit.membershipType === 'homie' && credit.membershipExpiresAt) {
      if (new Date() > new Date(credit.membershipExpiresAt)) {
        const updated = await TryOnCredit.findOneAndUpdate(
          {
            _id: credit._id,
            membershipType: 'homie',
            membershipExpiresAt: { $lt: new Date() }
          },
          {
            $set: { membershipType: 'free' }
          },
          { new: true }
        );
        if (updated) credit = updated;
      }
    }

    return credit;
  }

  /**
   * Get active valid lots sorted by strict business rule:
   * 0. Admin unlimited
   * 1. Free credits
   * 2. HOMIE credits (nearest expiry)
   * 3. Purchased credits (nearest expiry)
   * @param {string|ObjectId} userId
   * @returns {Promise<TryOnCreditLot[]>}
   */
  async getConsumableLots(userId) {
    const now = new Date();
    const lots = await TryOnCreditLot.find({
      user: userId,
      remainingAmount: { $gt: 0 },
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    });

    // Sort strictly: Admin -> Free -> Homie (nearest expiry) -> Purchased (nearest expiry)
    return lots.sort((a, b) => {
      const typeRank = { admin: 0, free: 1, homie: 2, purchased: 3 };
      const rankDiff = (typeRank[a.lotType] || 99) - (typeRank[b.lotType] || 99);
      if (rankDiff !== 0) return rankDiff;

      // If same type, order by nearest expiration date
      if (a.expiresAt && b.expiresAt) {
        return a.expiresAt.getTime() - b.expiresAt.getTime();
      }
      return 0;
    });
  }

  /**
   * Recalculate available total balance from active, non-expired lots
   * @param {string|ObjectId} userId
   * @returns {Promise<number>}
   */
  async recalculateAvailableBalance(userId) {
    const activeLots = await this.getConsumableLots(userId);
    const total = activeLots.reduce((sum, lot) => sum + (lot.remainingAmount - lot.reservedAmount), 0);

    await TryOnCredit.findOneAndUpdate(
      { user: userId },
      { totalAvailableCredits: Math.max(0, total), lastActivityAt: new Date() },
      { new: true }
    );

    return Math.max(0, total);
  }

  /**
   * Reserve credit before dispatching try-on job.
   * Supports both single-lot and multi-lot allocation (e.g. 2 credits split across Free + Purchased lots)
   * with atomic $gte guards and compensation rollback on partial allocation races.
   * @param {string|ObjectId} userId
   * @param {string|ObjectId} jobId
   * @param {number} [amount=1]
   * @returns {Promise<{lotId: ObjectId, lotType: string, allocations: Array<{lotId: ObjectId, lotType: string, amount: number}>}>}
   */
  async reserveCredit(userId, jobId, amount = 1) {
    const requestedAmount = Math.max(1, Number(amount) || 1);
    const reserveIdempKey = `RESERVE_${jobId}`;
    const existingReserve = await TryOnCreditLedger.findOne({ idempotencyKey: reserveIdempKey });
    if (existingReserve && existingReserve.lot) {
      const existingLot = await TryOnCreditLot.findById(existingReserve.lot);
      const relatedLedgers = typeof TryOnCreditLedger.find === 'function'
        ? await TryOnCreditLedger.find({ job: jobId, transactionType: 'RESERVE' })
        : [existingReserve];
      const allocations = (Array.isArray(relatedLedgers) && relatedLedgers.length > 0 ? relatedLedgers : [existingReserve])
        .filter(l => l && l.lot)
        .map(l => ({
          lotId: l.lot,
          lotType: existingLot && String(l.lot) === String(existingLot._id) ? existingLot.lotType : 'unknown',
          amount: Math.abs(Number(l.amount) || 1)
        }));
      return {
        lotId: existingReserve.lot,
        lotType: existingLot ? existingLot.lotType : 'unknown',
        allocations
      };
    }

    await this.getOrCreateAccount(userId);
    let consumableLots = await this.getConsumableLots(userId);

    const totalAvailable = consumableLots.reduce(
      (sum, lot) => sum + Math.max(0, (lot.remainingAmount || 0) - (lot.reservedAmount || 0)),
      0
    );

    if (totalAvailable < requestedAmount) {
      const userDoc = await User.findById(userId).select('role');
      if (userDoc && userDoc.role === 'admin') {
        const adminLot = await TryOnCreditLot.create({
          user: userId,
          lotType: 'admin',
          initialAmount: 999999,
          remainingAmount: 999999,
          reservedAmount: 0,
          expiresAt: null,
          isActive: true,
          sourceRef: 'ADMIN_OWNER_REPLENISH'
        });
        consumableLots = [adminLot, ...consumableLots];
      } else {
        const err = new Error('Tài khoản của bạn không đủ lượt thử đồ AI (Credit). Vui lòng nâng cấp HOMIE hoặc nạp thêm lượt thử.');
        err.code = 'INSUFFICIENT_CREDITS';
        err.statusCode = 402;
        throw err;
      }
    }

    // Build greedy allocation plan in strict lot rank order (Admin -> Free -> Homie -> Purchased)
    const allocationPlan = [];
    let remainingNeeded = requestedAmount;
    for (const lot of consumableLots) {
      if (remainingNeeded <= 0) break;
      const availableInLot = Math.max(0, (lot.remainingAmount || 0) - (lot.reservedAmount || 0));
      if (availableInLot <= 0) continue;
      const take = Math.min(availableInLot, remainingNeeded);
      allocationPlan.push({ lot, amount: take });
      remainingNeeded -= take;
    }

    if (remainingNeeded > 0 || allocationPlan.length === 0) {
      const err = new Error('Tài khoản của bạn không đủ lượt thử đồ AI (Credit). Vui lòng nâng cấp HOMIE hoặc nạp thêm lượt thử.');
      err.code = 'INSUFFICIENT_CREDITS';
      err.statusCode = 402;
      throw err;
    }

    const reservedAllocations = [];
    for (const step of allocationPlan) {
      const updatedLot = await TryOnCreditLot.findOneAndUpdate(
        {
          _id: step.lot._id,
          $expr: { $gte: [{ $subtract: ['$remainingAmount', '$reservedAmount'] }, step.amount] }
        },
        { $inc: { reservedAmount: step.amount } },
        { new: true }
      );

      if (!updatedLot) {
        // Compensate any previously reserved lots in this multi-lot transaction before failing
        for (const prev of reservedAllocations) {
          await TryOnCreditLot.findOneAndUpdate(
            { _id: prev.lotId, reservedAmount: { $gte: prev.amount } },
            { $inc: { reservedAmount: -prev.amount } },
            { new: true }
          ).catch(() => {});
        }
        const raceErr = new Error('Xung đột giao dịch khi giữ lượt thử đồ. Vui lòng thử lại.');
        raceErr.code = 'CREDIT_RACE_CONDITION';
        raceErr.statusCode = 409;
        throw raceErr;
      }

      reservedAllocations.push({
        lotId: updatedLot._id,
        lotType: updatedLot.lotType,
        amount: step.amount
      });
    }

    const currentBalance = await this.recalculateAvailableBalance(userId);

    for (let i = 0; i < reservedAllocations.length; i++) {
      const alloc = reservedAllocations[i];
      const stepKey = i === 0 ? reserveIdempKey : `${reserveIdempKey}_lot_${i}`;
      try {
        await TryOnCreditLedger.create({
          user: userId,
          lot: alloc.lotId,
          job: jobId,
          transactionType: 'RESERVE',
          amount: -alloc.amount,
          balanceAfter: currentBalance,
          idempotencyKey: stepKey,
          reason: `Tạm giữ ${alloc.amount} credit cho phiên thử đồ #${String(jobId).slice(-6)}`
        });
      } catch (ledgerErr) {
        if (ledgerErr.code === 11000) {
          return {
            lotId: reservedAllocations[0].lotId,
            lotType: reservedAllocations[0].lotType,
            allocations: reservedAllocations
          };
        }
        throw ledgerErr;
      }
    }

    return {
      lotId: reservedAllocations[0].lotId,
      lotType: reservedAllocations[0].lotType,
      allocations: reservedAllocations
    };
  }

  /**
   * Normalize either legacy single lotId or multi-lot allocations array into [{ lotId, amount }]
   */
  _normalizeAllocations(lotIdOrAllocations, fallbackAmount = 1, extra = {}) {
    const rawList = Array.isArray(extra?.allocations) && extra.allocations.length > 0
      ? extra.allocations
      : Array.isArray(lotIdOrAllocations) && lotIdOrAllocations.length > 0
        ? lotIdOrAllocations
        : lotIdOrAllocations
          ? [{ lotId: lotIdOrAllocations, amount: fallbackAmount }]
          : [];

    return rawList
      .map(item => ({
        lotId: item.lotId || item.lot || null,
        amount: Math.max(1, Number(item.amount) || 1)
      }))
      .filter(item => Boolean(item.lotId));
  }

  /**
   * Attempt settlement inside a native MongoDB Replica Set / Mongos transaction when supported.
   * Returns { unsupported: true } when running on standalone topology or offline test stubs.
   */
  async _tryMongoTransactionSettlement({
    operationType,
    operationKey,
    oppositeKey,
    userId,
    jobId,
    allocations,
    reason,
    extra = {}
  }) {
    const useTx = Boolean(
      extra.sessionRunner ||
      (mongoose.connection?.readyState === 1 && typeof mongoose.startSession === 'function')
    );
    if (!useTx) {
      return { unsupported: true };
    }

    let session = null;
    try {
      session = typeof extra.sessionRunner === 'function'
        ? await extra.sessionRunner()
        : await mongoose.startSession();
    } catch (sessErr) {
      if (isTransactionUnsupportedError(sessErr)) {
        return { unsupported: true };
      }
      throw sessErr;
    }

    if (!session || typeof session.withTransaction !== 'function') {
      if (session && typeof session.endSession === 'function') {
        await session.endSession().catch(() => {});
      }
      return { unsupported: true };
    }

    let outcome = null;
    try {
      await session.withTransaction(async () => {
        const existingSame = await TryOnCreditLedger.findOne({ idempotencyKey: operationKey }, null, { session });
        if (existingSame) {
          outcome = {
            success: true,
            ...(operationType === 'COMMIT' ? { alreadyCommitted: true } : { alreadyRefunded: true }),
            balanceAfter: existingSame.balanceAfter,
            executionMode: 'TRANSACTION'
          };
          return;
        }

        const existingOpposite = await TryOnCreditLedger.findOne({ idempotencyKey: oppositeKey }, null, { session });
        if (existingOpposite) {
          const conflictErr = new Error(
            operationType === 'COMMIT'
              ? `Không thể commit credit cho job #${jobId}: Đã hoàn tiền (REFUND) trước đó.`
              : `Không thể hoàn credit cho job #${jobId}: Credit đã được trừ (COMMIT) trước đó.`
          );
          conflictErr.code = operationType === 'COMMIT' ? 'CREDIT_ALREADY_REFUNDED' : 'CREDIT_ALREADY_COMMITTED';
          throw conflictErr;
        }

        for (const alloc of allocations) {
          const filter = operationType === 'COMMIT'
            ? {
                _id: alloc.lotId,
                user: userId,
                reservedAmount: { $gte: alloc.amount },
                remainingAmount: { $gte: alloc.amount }
              }
            : {
                _id: alloc.lotId,
                user: userId,
                reservedAmount: { $gte: alloc.amount }
              };

          const incUpdate = operationType === 'COMMIT'
            ? { remainingAmount: -alloc.amount, reservedAmount: -alloc.amount }
            : { reservedAmount: -alloc.amount };

          const updatedLot = await TryOnCreditLot.findOneAndUpdate(
            filter,
            { $inc: incUpdate },
            { new: true, session }
          );

          if (!updatedLot) {
            const err = new Error(
              operationType === 'COMMIT'
                ? `Commit thất bại: không tìm thấy lô #${alloc.lotId} đủ reservedAmount/remainingAmount >= ${alloc.amount}`
                : `Không thể hoàn credit: Lô #${alloc.lotId} không hợp lệ hoặc reservedAmount không đủ để hoàn ${alloc.amount} credit.`
            );
            err.code = operationType === 'COMMIT' ? 'INVALID_RESERVATION_COMMIT' : 'INVALID_RESERVATION_REFUND';
            throw err;
          }

          if (operationType === 'COMMIT' && updatedLot.remainingAmount <= 0) {
            updatedLot.isActive = false;
            await updatedLot.save({ session });
          }
        }

        const now = new Date();
        const activeLots = await TryOnCreditLot.find(
          {
            user: userId,
            remainingAmount: { $gt: 0 },
            isActive: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
          },
          null,
          { session }
        );
        const balanceAfter = activeLots.reduce(
          (acc, lot) => acc + Math.max(0, (lot.remainingAmount || 0) - (lot.reservedAmount || 0)),
          0
        );
        await TryOnCredit.findOneAndUpdate(
          { user: userId },
          { $set: { totalAvailableCredits: balanceAfter } },
          { session }
        );

        for (let i = 0; i < allocations.length; i++) {
          const alloc = allocations[i];
          const stepKey = i === 0 ? operationKey : `${operationKey}_lot_${i}`;
          await TryOnCreditLedger.create(
            [
              {
                user: userId,
                lot: alloc.lotId,
                job: jobId,
                transactionType: operationType,
                amount: operationType === 'COMMIT' ? -alloc.amount : +alloc.amount,
                balanceAfter,
                idempotencyKey: stepKey,
                ...(extra.adminUserId ? { adminUser: extra.adminUserId } : {}),
                reason: operationType === 'COMMIT'
                  ? (extra.reason || `Hoàn tất phiên thử đồ #${String(jobId).slice(-6)} — Trừ ${alloc.amount} credit thành công`)
                  : (extra.auditReason || `Hoàn lại ${alloc.amount} credit do phiên #${String(jobId).slice(-6)} thất bại: ${reason}`)
              }
            ],
            { session }
          );
        }

        if (isSettlementModelQueryable()) {
          await TryOnCreditSettlement.findOneAndUpdate(
            { operationKey },
            {
              $set: {
                operationKey,
                operationType,
                user: userId,
                job: jobId,
                status: 'COMPLETED',
                executionMode: 'TRANSACTION',
                steps: allocations.map(a => ({
                  lotId: a.lotId,
                  amount: a.amount,
                  state: 'APPLIED',
                  appliedAt: now
                })),
                reason: String(reason || '').slice(0, 500),
                auditReason: String(extra.auditReason || '').slice(0, 500),
                adminUserId: extra.adminUserId || null,
                requiresReconciliation: false,
                completedAt: now
              }
            },
            { upsert: true, new: true, session }
          );
        }

        outcome = {
          success: true,
          ...(operationType === 'COMMIT' ? { alreadyCommitted: false } : { alreadyRefunded: false }),
          balanceAfter,
          executionMode: 'TRANSACTION'
        };
      });

      return outcome || { unsupported: true };
    } catch (txErr) {
      if (isTransactionUnsupportedError(txErr)) {
        return { unsupported: true };
      }
      throw txErr;
    } finally {
      if (session && typeof session.endSession === 'function') {
        await session.endSession().catch(() => {});
      }
    }
  }

  async _persistSettlement(settlement, persistEnabled) {
    if (!persistEnabled || !settlement) return settlement;
    if (typeof settlement.markModified === 'function') {
      settlement.markModified('steps');
    }
    if (typeof settlement.save === 'function') {
      await settlement.save();
    }
    return settlement;
  }

  /**
   * Deterministic compensating rollback for multi-lot settlements when a later step fails.
   * Escalates to RECONCILIATION_REQUIRED if rollback itself fails or violates lot invariants.
   */
  async _rollbackSettlement(settlement, userId, originalErr, persistEnabled) {
    settlement.status = 'ROLLING_BACK';
    settlement.lastError = String(originalErr?.message || 'Multi-lot settlement step failed').slice(0, 500);
    await this._persistSettlement(settlement, persistEnabled).catch(() => {});

    const appliedIndices = [];
    for (let i = (settlement.steps || []).length - 1; i >= 0; i--) {
      if (settlement.steps[i].state === 'APPLIED') {
        appliedIndices.push(i);
      }
    }

    let rollbackFailed = false;
    let rollbackFailureMessage = '';

    for (const idx of appliedIndices) {
      const step = settlement.steps[idx];
      try {
        if (settlement.operationType === 'COMMIT') {
          const restored = await TryOnCreditLot.findOneAndUpdate(
            { _id: step.lotId, user: userId },
            {
              $inc: {
                remainingAmount: step.amount,
                reservedAmount: step.amount
              },
              $set: { isActive: true }
            },
            { new: true }
          );
          if (!restored) {
            throw new Error(`Không tìm thấy lot #${step.lotId} để rollback commit.`);
          }
        } else {
          // Compare-and-swap rollback for REFUND so reservedAmount never exceeds remainingAmount
          const lotDoc = await TryOnCreditLot.findById(step.lotId);
          if (!lotDoc || String(lotDoc.user) !== String(userId)) {
            throw new Error(`Không tìm thấy lot #${step.lotId} hợp lệ để rollback refund.`);
          }
          if ((lotDoc.reservedAmount || 0) + step.amount > (lotDoc.remainingAmount || 0)) {
            throw new Error(`Rollback refund cho lot #${step.lotId} vi phạm giới hạn remainingAmount.`);
          }
          const restored = await TryOnCreditLot.findOneAndUpdate(
            {
              _id: step.lotId,
              user: userId,
              reservedAmount: lotDoc.reservedAmount
            },
            { $inc: { reservedAmount: step.amount } },
            { new: true }
          );
          if (!restored) {
            throw new Error(`Xung đột đồng thời khi rollback refund lot #${step.lotId}.`);
          }
        }

        step.state = 'ROLLED_BACK';
        step.rolledBackAt = new Date();
        step.error = '';
      } catch (rbErr) {
        rollbackFailed = true;
        rollbackFailureMessage = rbErr.message || 'Rollback thất bại';
        step.state = 'ROLLBACK_FAILED';
        step.error = rollbackFailureMessage.slice(0, 300);
      }
      await this._persistSettlement(settlement, persistEnabled).catch(() => {});
    }

    await this.recalculateAvailableBalance(userId).catch(() => {});

    if (rollbackFailed) {
      settlement.status = 'RECONCILIATION_REQUIRED';
      settlement.requiresReconciliation = true;
      settlement.lastError = `Rollback thất bại: ${rollbackFailureMessage}`.slice(0, 500);
      await this._persistSettlement(settlement, persistEnabled).catch(() => {});

      const recErr = new Error(
        `Xung đột cập nhật multi-lot và rollback thất bại cho phiên #${String(settlement.job).slice(-6)}; chuyển đối soát thủ công.`
      );
      recErr.code = 'CREDIT_RECONCILIATION_REQUIRED';
      recErr.statusCode = 409;
      recErr.cause = originalErr;
      throw recErr;
    }

    settlement.status = 'ROLLED_BACK';
    await this._persistSettlement(settlement, persistEnabled).catch(() => {});
  }

  /**
   * Shared step-checkpointed execution for COMMIT and REFUND (idempotent, crash-recoverable).
   */
  async _executeCompensatingSettlement({
    operationType,
    operationKey,
    oppositeKey,
    userId,
    jobId,
    allocations,
    reason,
    extra = {}
  }) {
    const persistEnabled = isSettlementModelQueryable();

    // 1. Check ledgers & opposite settlement barrier
    const existingLedger = await TryOnCreditLedger.findOne({ idempotencyKey: operationKey });
    if (existingLedger && !extra.resumeLedgersOnly) {
      return {
        success: true,
        ...(operationType === 'COMMIT' ? { alreadyCommitted: true } : { alreadyRefunded: true }),
        balanceAfter: existingLedger.balanceAfter
      };
    }

    const existingOppositeLedger = await TryOnCreditLedger.findOne({ idempotencyKey: oppositeKey });
    if (existingOppositeLedger) {
      const conflictErr = new Error(
        operationType === 'COMMIT'
          ? `Không thể commit credit cho job #${jobId}: Đã hoàn tiền (REFUND) trước đó.`
          : `Không thể hoàn credit cho job #${jobId}: Credit đã được trừ (COMMIT) trước đó.`
      );
      conflictErr.code = operationType === 'COMMIT' ? 'CREDIT_ALREADY_REFUNDED' : 'CREDIT_ALREADY_COMMITTED';
      throw conflictErr;
    }

    let settlement = null;
    if (persistEnabled) {
      const existingOppositeSettlement = await TryOnCreditSettlement.findOne({ operationKey: oppositeKey });
      if (
        existingOppositeSettlement &&
        ['IN_PROGRESS', 'COMPLETED', 'ROLLING_BACK', 'RECONCILIATION_REQUIRED'].includes(existingOppositeSettlement.status)
      ) {
        const conflictErr = new Error(
          operationType === 'COMMIT'
            ? `Không thể commit credit cho job #${jobId}: Phiên đang/đã hoàn tiền (REFUND).`
            : `Không thể hoàn credit cho job #${jobId}: Phiên đang/đã chốt trừ tiền (COMMIT).`
        );
        conflictErr.code = operationType === 'COMMIT' ? 'CREDIT_ALREADY_REFUNDED' : 'CREDIT_ALREADY_COMMITTED';
        throw conflictErr;
      }

      const now = new Date();
      const leaseMs = 30 * 1000;
      const leaseUntil = new Date(now.getTime() + leaseMs);
      const initialSteps = allocations.map(a => ({
        lotId: a.lotId,
        amount: a.amount,
        state: 'PENDING'
      }));

      try {
        settlement = await TryOnCreditSettlement.create({
          operationKey,
          operationType,
          user: userId,
          job: jobId,
          status: 'IN_PROGRESS',
          executionMode: 'COMPENSATING',
          steps: initialSteps,
          reason: String(reason || '').slice(0, 500),
          auditReason: String(extra.auditReason || '').slice(0, 500),
          adminUserId: extra.adminUserId || null,
          leaseExpiresAt: leaseUntil
        });
      } catch (dupErr) {
        if (dupErr.code !== 11000) {
          throw dupErr;
        }
        settlement = await TryOnCreditSettlement.findOne({ operationKey });
        if (!settlement) {
          throw dupErr;
        }
        if (settlement.status === 'COMPLETED') {
          const bal = await this.recalculateAvailableBalance(userId);
          return {
            success: true,
            ...(operationType === 'COMMIT' ? { alreadyCommitted: true } : { alreadyRefunded: true }),
            balanceAfter: bal
          };
        }
        if (settlement.status === 'RECONCILIATION_REQUIRED') {
          const recErr = new Error(`Giao dịch credit #${operationKey} đang chờ đối soát thủ công.`);
          recErr.code = 'CREDIT_RECONCILIATION_REQUIRED';
          recErr.statusCode = 409;
          throw recErr;
        }
        if (settlement.status === 'ROLLED_BACK') {
          // Clean previous failed attempt can be re-attempted with fresh step checkpoints
          settlement.status = 'IN_PROGRESS';
          settlement.steps = initialSteps;
          settlement.lastError = '';
          settlement.leaseExpiresAt = leaseUntil;
          await this._persistSettlement(settlement, persistEnabled);
        } else if (settlement.status === 'ROLLING_BACK') {
          await this._rollbackSettlement(settlement, userId, new Error('Tiếp tục rollback sau sự cố'), persistEnabled);
          const recErr = new Error(`Giao dịch ${operationKey} đã rollback sau sự cố trước đó.`);
          recErr.code = 'CREDIT_RACE_CONDITION';
          recErr.statusCode = 409;
          throw recErr;
        } else if (settlement.status === 'IN_PROGRESS') {
          const isLeaseExpired = settlement.leaseExpiresAt && new Date(settlement.leaseExpiresAt) < now;
          if (!extra.resumeIncomplete && !isLeaseExpired) {
            for (let attempt = 0; attempt < 6; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 25));
              const refreshed = await TryOnCreditSettlement.findOne({ operationKey });
              if (refreshed?.status === 'COMPLETED') {
                const ledger = await TryOnCreditLedger.findOne({ idempotencyKey: operationKey });
                return {
                  success: true,
                  ...(operationType === 'COMMIT' ? { alreadyCommitted: true } : { alreadyRefunded: true }),
                  balanceAfter: ledger ? ledger.balanceAfter : await this.recalculateAvailableBalance(userId)
                };
              }
            }
            const raceErr = new Error(`Giao dịch ${operationKey} đang được xử lý đồng thời bởi tiến trình khác.`);
            raceErr.code = 'CREDIT_RACE_CONDITION';
            raceErr.statusCode = 409;
            throw raceErr;
          }
          // Lease expired or explicit crash-recovery resume -> take over deterministic checkpoint execution
          settlement.leaseExpiresAt = leaseUntil;
          await this._persistSettlement(settlement, persistEnabled);
        }
      }
    } else {
      settlement = {
        operationKey,
        operationType,
        user: userId,
        job: jobId,
        status: 'IN_PROGRESS',
        executionMode: 'COMPENSATING',
        steps: allocations.map(a => ({ lotId: a.lotId, amount: a.amount, state: 'PENDING' }))
      };
    }

    // 2. Apply each pending step with immediate checkpoint persistence
    try {
      for (let i = 0; i < settlement.steps.length; i++) {
        const step = settlement.steps[i];
        if (step.state === 'APPLIED') {
          // Already applied prior to crash/restart — never apply twice!
          continue;
        }

        const filter = operationType === 'COMMIT'
          ? {
              _id: step.lotId,
              user: userId,
              reservedAmount: { $gte: step.amount },
              remainingAmount: { $gte: step.amount }
            }
          : {
              _id: step.lotId,
              user: userId,
              reservedAmount: { $gte: step.amount }
            };

        const incUpdate = operationType === 'COMMIT'
          ? { remainingAmount: -step.amount, reservedAmount: -step.amount }
          : { reservedAmount: -step.amount };

        const updatedLot = await TryOnCreditLot.findOneAndUpdate(
          filter,
          { $inc: incUpdate },
          { new: true }
        );

        if (!updatedLot) {
          const err = new Error(
            operationType === 'COMMIT'
              ? `Commit thất bại: không tìm thấy lô #${step.lotId} có reservedAmount >= ${step.amount}`
              : `Không thể hoàn credit: Lô #${step.lotId} không hợp lệ hoặc số lượng tạm giữ không đủ để hoàn ${step.amount} credit.`
          );
          err.code = operationType === 'COMMIT' ? 'INVALID_RESERVATION_COMMIT' : 'INVALID_RESERVATION_REFUND';
          throw err;
        }

        if (operationType === 'COMMIT' && updatedLot.remainingAmount <= 0) {
          updatedLot.isActive = false;
          await updatedLot.save();
        }

        step.state = 'APPLIED';
        step.appliedAt = new Date();
        await this._persistSettlement(settlement, persistEnabled);
      }

      // 3. Recalculate balance & create immutable idempotent ledger records per step
      const balanceAfter = await this.recalculateAvailableBalance(userId);
      for (let i = 0; i < settlement.steps.length; i++) {
        const step = settlement.steps[i];
        const stepKey = i === 0 ? operationKey : `${operationKey}_lot_${i}`;
        const existingStepLedger = await TryOnCreditLedger.findOne({ idempotencyKey: stepKey });
        if (existingStepLedger) {
          continue;
        }
        try {
          await TryOnCreditLedger.create({
            user: userId,
            lot: step.lotId,
            job: jobId,
            transactionType: operationType,
            amount: operationType === 'COMMIT' ? -step.amount : +step.amount,
            balanceAfter,
            idempotencyKey: stepKey,
            ...(extra.adminUserId ? { adminUser: extra.adminUserId } : {}),
            reason: operationType === 'COMMIT'
              ? (extra.reason || `Hoàn tất phiên thử đồ #${String(jobId).slice(-6)} — Trừ ${step.amount} credit thành công`)
              : (extra.auditReason || `Hoàn lại ${step.amount} credit do phiên #${String(jobId).slice(-6)} thất bại: ${reason}`)
          });
        } catch (ledgerErr) {
          if (ledgerErr.code === 11000) {
            continue;
          }
          throw ledgerErr;
        }
      }

      settlement.status = 'COMPLETED';
      settlement.completedAt = new Date();
      settlement.lastError = '';
      await this._persistSettlement(settlement, persistEnabled);

      return {
        success: true,
        ...(operationType === 'COMMIT' ? { alreadyCommitted: false } : { alreadyRefunded: false }),
        balanceAfter
      };
    } catch (stepErr) {
      await this._rollbackSettlement(settlement, userId, stepErr, persistEnabled);
      throw stepErr;
    }
  }

  /**
   * Recover any IN_PROGRESS or ROLLING_BACK multi-lot settlements interrupted by a server crash/restart.
   */
  async recoverIncompleteSettlements() {
    const summary = {
      resumedCompleted: 0,
      rolledBack: 0,
      movedToReconciliation: 0
    };
    if (!isSettlementModelQueryable()) {
      return summary;
    }

    const pending = await TryOnCreditSettlement.find({
      status: { $in: ['IN_PROGRESS', 'ROLLING_BACK'] }
    });

    for (const s of pending) {
      try {
        if (s.status === 'ROLLING_BACK') {
          await this._rollbackSettlement(s, s.user, new Error('Phục hồi rollback sau restart'), true);
          summary.rolledBack += 1;
        } else {
          const allocs = (s.steps || []).map(st => ({ lotId: st.lotId, amount: st.amount }));
          await this._executeCompensatingSettlement({
            operationType: s.operationType,
            operationKey: s.operationKey,
            oppositeKey: `${s.operationType === 'COMMIT' ? 'REFUND' : 'COMMIT'}_${s.job}`,
            userId: s.user,
            jobId: s.job,
            allocations: allocs,
            reason: s.reason || 'Server restart recovery',
            extra: {
              resumeIncomplete: true,
              resumeLedgersOnly: true,
              adminUserId: s.adminUserId,
              reason: s.reason,
              auditReason: s.auditReason
            }
          });
          summary.resumedCompleted += 1;
        }
      } catch (err) {
        if (err.code === 'CREDIT_RECONCILIATION_REQUIRED' || s.status === 'RECONCILIATION_REQUIRED') {
          summary.movedToReconciliation += 1;
        } else if (s.status === 'ROLLED_BACK') {
          summary.rolledBack += 1;
        } else {
          summary.movedToReconciliation += 1;
        }
      }
    }

    return summary;
  }

  /**
   * Commit reserved credit on successful AI generation (supports single or multi-lot allocations)
   */
  async commitCredit(userId, jobId, lotId, amount = 1, extra = {}) {
    const allocations = this._normalizeAllocations(lotId, amount, extra);
    if (allocations.length === 0) {
      const missingErr = new Error(`Không thể commit credit cho job #${jobId}: Thiếu thông tin creditLot.`);
      missingErr.code = 'INVALID_RESERVATION_DATA';
      throw missingErr;
    }

    const operationKey = `COMMIT_${jobId}`;
    const oppositeKey = `REFUND_${jobId}`;

    return this._withJobSettlementLock(jobId, async () => {
      const txResult = await this._tryMongoTransactionSettlement({
        operationType: 'COMMIT',
        operationKey,
        oppositeKey,
        userId,
        jobId,
        allocations,
        reason: extra.reason || '',
        extra
      });
      if (!txResult.unsupported) {
        return txResult;
      }

      return this._executeCompensatingSettlement({
        operationType: 'COMMIT',
        operationKey,
        oppositeKey,
        userId,
        jobId,
        allocations,
        reason: extra.reason || '',
        extra
      });
    });
  }

  /**
   * Refund reserved credit on confirmed job failure or cancellation (supports single or multi-lot allocations)
   */
  async refundCredit(userId, jobId, lotId, reason, amount = 1, extra = {}) {
    const allocations = this._normalizeAllocations(lotId, amount, extra);
    if (allocations.length === 0) {
      const err = new Error('Không thể hoàn credit: Không tìm thấy thông tin lô tín dụng (lotId missing)');
      err.code = 'INVALID_RESERVATION_DATA';
      throw err;
    }

    const operationKey = `REFUND_${jobId}`;
    const oppositeKey = `COMMIT_${jobId}`;

    return this._withJobSettlementLock(jobId, async () => {
      const txResult = await this._tryMongoTransactionSettlement({
        operationType: 'REFUND',
        operationKey,
        oppositeKey,
        userId,
        jobId,
        allocations,
        reason,
        extra
      });
      if (!txResult.unsupported) {
        return txResult;
      }

      return this._executeCompensatingSettlement({
        operationType: 'REFUND',
        operationKey,
        oppositeKey,
        userId,
        jobId,
        allocations,
        reason,
        extra
      });
    });
  }

  /**
   * Grant HOMIE subscription credits (120 credits with 1-month rollover)
   * Prevents duplicate lots on retry / crash recovery and accurately extends expiration
   * @param {string|ObjectId} userId
   * @param {string} orderRef
   * @returns {Promise<void>}
   */
  async grantHomieSubscription(userId, orderRef) {
    const idempotencyKey = `HOMIE_SUB_${orderRef}`;

    // 1. Check if this subscription orderRef has ALREADY been granted
    const existingLedger = await TryOnCreditLedger.findOne({ idempotencyKey });
    const existingLot = await TryOnCreditLot.findOne({
      user: userId,
      lotType: 'homie',
      sourceRef: orderRef
    });

    const userDoc = await User.findById(userId).select('role name email');
    const isAdmin = userDoc && userDoc.role === 'admin';

    let credit = await TryOnCredit.findOne({ user: userId });
    if (!credit) {
      credit = await this.getOrCreateAccount(userId);
    }

    if (existingLedger || existingLot) {
      console.log(`🔁 [tryOnCreditService] HOMIE subscription for orderRef "${orderRef}" was already granted. Ensuring membership active.`);
      if (!isAdmin && credit.membershipType !== 'admin') {
        credit.membershipType = 'homie';
        if (!credit.membershipExpiresAt || new Date(credit.membershipExpiresAt) < new Date()) {
          credit.membershipExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        await credit.save();
      }
      return;
    }

    const now = new Date();
    let newExpiresAt;

    if (!isAdmin && credit.membershipType === 'homie' && credit.membershipExpiresAt && new Date(credit.membershipExpiresAt) > now) {
      // Existing active membership: extend from current expiry date
      newExpiresAt = new Date(new Date(credit.membershipExpiresAt).getTime() + 30 * 24 * 60 * 60 * 1000);
    } else {
      // First time or expired membership: 30 days from now
      newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    // Lot validity: 30 days active + 30 days rollover = 60 days total retention
    const lotExpiresAt = new Date(newExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    const lot = await TryOnCreditLot.create({
      user: userId,
      lotType: 'homie',
      initialAmount: 120,
      remainingAmount: 120,
      reservedAmount: 0,
      expiresAt: lotExpiresAt,
      isActive: true,
      sourceRef: orderRef
    });

    if (!isAdmin && credit.membershipType !== 'admin') {
      credit.membershipType = 'homie';
      credit.membershipExpiresAt = newExpiresAt;
      await credit.save();
    }

    const balanceAfter = await this.recalculateAvailableBalance(userId);

    try {
      await TryOnCreditLedger.create({
        user: userId,
        lot: lot._id,
        transactionType: 'HOMIE_SUBSCRIPTION',
        amount: 120,
        balanceAfter,
        idempotencyKey,
        reason: `Kích hoạt gói thành viên HOMIE (199.000đ/tháng) — Cấp 120 credits (Lô #${lot._id.toString().slice(-6)})`
      });
    } catch (dupErr) {
      if (dupErr.code === 11000) {
        console.log(`🔁 [tryOnCreditService] Duplicate HOMIE ledger creation prevented for ${idempotencyKey}.`);
        return;
      }
      throw dupErr;
    }
  }

  /**
   * Grant purchased top-up package
   * @param {string|ObjectId} userId
   * @param {number} amount
   * @param {string} packageType
   * @param {string} orderRef
   * @returns {Promise<void>}
   */
  async grantPurchasedPackage(userId, amount, packageType, orderRef) {
    const idempotencyKey = `PURCHASE_PKG_${orderRef}`;
    const existingLedger = await TryOnCreditLedger.findOne({ idempotencyKey });
    const existingLot = await TryOnCreditLot.findOne({
      user: userId,
      lotType: 'purchased',
      sourceRef: orderRef
    });

    if (existingLedger || existingLot) {
      return {
        success: true,
        alreadyGranted: true,
        lotId: existingLot ? existingLot._id : existingLedger.lot,
        balanceAfter: existingLedger ? existingLedger.balanceAfter : await this.recalculateAvailableBalance(userId)
      };
    }

    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days validity

    const lot = await TryOnCreditLot.create({
      user: userId,
      lotType: 'purchased',
      initialAmount: amount,
      remainingAmount: amount,
      reservedAmount: 0,
      expiresAt,
      isActive: true,
      sourceRef: orderRef
    });

    await this.getOrCreateAccount(userId);
    const balanceAfter = await this.recalculateAvailableBalance(userId);

    try {
      await TryOnCreditLedger.create({
        user: userId,
        lot: lot._id,
        transactionType: 'PURCHASE_PACKAGE',
        amount,
        balanceAfter,
        idempotencyKey,
        reason: `Nạp gói ${packageType} (${amount} lượt) theo đơn #${orderRef}`
      });
    } catch (dupErr) {
      if (dupErr.code === 11000) {
        return { success: true, alreadyGranted: true, lotId: lot._id, balanceAfter };
      }
      throw dupErr;
    }

    return { success: true, alreadyGranted: false, lotId: lot._id, balanceAfter };
  }

  /**
   * Manual credit adjustment by Admin with required audit log and optional idempotencyKey
   * @param {Object} options
   * @param {string|ObjectId} options.adminUserId
   * @param {string|ObjectId} options.targetUserId
   * @param {number} options.amount - positive or negative
   * @param {string} options.reason - required explanation
   * @param {string|null} [options.idempotencyKey] - deterministic idempotency key to guard against double click/retry
   * @returns {Promise<{newBalance: number, alreadyProcessed?: boolean}>}
   */
  async manualAdjustCredit({ adminUserId, targetUserId, amount, reason, idempotencyKey = null }) {
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Vui lòng nhập lý do điều chỉnh credit rõ ràng cho audit log');
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
      throw new Error('Số lượng credit điều chỉnh phải khác 0');
    }

    const normalizedKey = idempotencyKey ? `ADMIN_ADJ_${String(idempotencyKey).trim()}` : null;
    if (normalizedKey) {
      const existingLedger = await TryOnCreditLedger.findOne({ idempotencyKey: normalizedKey });
      if (existingLedger) {
        return {
          newBalance: existingLedger.balanceAfter,
          alreadyProcessed: true
        };
      }
    }

    await this.getOrCreateAccount(targetUserId);

    if (numericAmount > 0) {
      const lot = await TryOnCreditLot.create({
        user: targetUserId,
        lotType: 'purchased',
        initialAmount: numericAmount,
        remainingAmount: numericAmount,
        reservedAmount: 0,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        isActive: true,
        sourceRef: normalizedKey || `ADMIN_ADJUST_${adminUserId}`
      });

      const newBalance = await this.recalculateAvailableBalance(targetUserId);

      try {
        await TryOnCreditLedger.create({
          user: targetUserId,
          adminUser: adminUserId,
          lot: lot._id,
          transactionType: 'MANUAL_ADJUSTMENT',
          amount: numericAmount,
          balanceAfter: newBalance,
          ...(normalizedKey ? { idempotencyKey: normalizedKey } : {}),
          reason: `[Admin điều chỉnh] ${reason}`
        });
      } catch (dupErr) {
        if (dupErr.code === 11000) {
          const existing = await TryOnCreditLedger.findOne({ idempotencyKey: normalizedKey });
          return { newBalance: existing ? existing.balanceAfter : newBalance, alreadyProcessed: true };
        }
        throw dupErr;
      }

      return { newBalance, alreadyProcessed: false };
    } else {
      // Deduct from available lots
      let toDeduct = Math.abs(numericAmount);
      const consumableLots = await this.getConsumableLots(targetUserId);

      for (const lot of consumableLots) {
        if (toDeduct <= 0) break;
        const avail = lot.remainingAmount - lot.reservedAmount;
        const take = Math.min(avail, toDeduct);
        lot.remainingAmount -= take;
        if (lot.remainingAmount <= 0) lot.isActive = false;
        await lot.save();
        toDeduct -= take;
      }

      const newBalance = await this.recalculateAvailableBalance(targetUserId);

      try {
        await TryOnCreditLedger.create({
          user: targetUserId,
          adminUser: adminUserId,
          transactionType: 'MANUAL_ADJUSTMENT',
          amount: numericAmount,
          balanceAfter: newBalance,
          ...(normalizedKey ? { idempotencyKey: normalizedKey } : {}),
          reason: `[Admin giảm lượt] ${reason}`
        });
      } catch (dupErr) {
        if (dupErr.code === 11000) {
          const existing = await TryOnCreditLedger.findOne({ idempotencyKey: normalizedKey });
          return { newBalance: existing ? existing.balanceAfter : newBalance, alreadyProcessed: true };
        }
        throw dupErr;
      }

      return { newBalance, alreadyProcessed: false };
    }
  }
}

module.exports = new TryOnCreditService();
module.exports.TryOnCreditService = TryOnCreditService;
