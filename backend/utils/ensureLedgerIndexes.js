/**
 * Utility to verify ledger integrity and ensure unique sparse index on idempotencyKey.
 * Rule: NEVER delete historical ledger entries. Report duplicates if found.
 */
async function ensureLedgerIndexes(mongooseInstance) {
  const collection = mongooseInstance.connection.db.collection('tryoncreditledgers');

  // 1. Audit existing documents for duplicates
  const pipeline = [
    { $match: { idempotencyKey: { $exists: true, $ne: null } } },
    { $group: { _id: '$idempotencyKey', count: { $sum: 1 }, docs: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ];

  const duplicates = await collection.aggregate(pipeline).toArray();

  if (duplicates.length > 0) {
    console.error('⛔ [CRITICAL LEDGER AUDIT] Duplicate idempotencyKeys detected in TryOnCreditLedger:');
    duplicates.forEach(d => {
      console.error(` - Key: "${d._id}" found ${d.count} times. Document IDs: ${d.docs.join(', ')}`);
    });
    throw new Error(`Cannot create unique index on idempotencyKey: ${duplicates.length} duplicate keys exist in database.`);
  }

  // 2. Inspect existing indexes
  const existingIndexes = await collection.indexes();
  const idempIndex = existingIndexes.find(idx => idx.name === 'idempotencyKey_1');

  if (idempIndex && !idempIndex.unique) {
    console.log('🔄 Dropping obsolete non-unique index "idempotencyKey_1"...');
    await collection.dropIndex('idempotencyKey_1');
  }

  // 3. Create unique sparse index
  const refreshedIndexes = await collection.indexes();
  const hasUniqueIndex = refreshedIndexes.find(idx => idx.name === 'idempotencyKey_1' && idx.unique);
  if (!hasUniqueIndex) {
    console.log('🛡️ Creating unique sparse index on "idempotencyKey"...');
    await collection.createIndex(
      { idempotencyKey: 1 },
      { unique: true, sparse: true, background: true, name: 'idempotencyKey_1' }
    );
    console.log('✅ Unique sparse index on "idempotencyKey" created successfully.');
  }
}

/**
 * Safely ensures operational query and queue indexes on TryOn collections.
 * Non-destructive: checks existing indexes and creates missing ones with background: true.
 */
async function ensureTryOnJobIndexes(mongooseInstance) {
  const collection = mongooseInstance.connection.db.collection('tryonjobs');
  const existingIndexes = await collection.indexes();
  const existingNames = new Set(existingIndexes.map(i => i.name));

  // Queue worker polling index: { status: 1, priority: -1, 'timing.queuedAt': 1 }
  if (!existingNames.has('status_1_priority_-1_timing.queuedAt_1')) {
    console.log('🛡️ Creating queue index on tryonjobs (status, priority, timing.queuedAt)...');
    await collection.createIndex(
      { status: 1, priority: -1, 'timing.queuedAt': 1 },
      { background: true, name: 'status_1_priority_-1_timing.queuedAt_1' }
    );
  }

  // History pagination index: { user: 1, createdAt: -1 }
  if (!existingNames.has('user_1_createdAt_-1')) {
    console.log('🛡️ Creating history index on tryonjobs (user, createdAt)...');
    await collection.createIndex(
      { user: 1, createdAt: -1 },
      { background: true, name: 'user_1_createdAt_-1' }
    );
  }

  // Active user history pagination index: { user: 1, historyDeleted: 1, createdAt: -1 }
  if (!existingNames.has('user_1_historyDeleted_1_createdAt_-1')) {
    console.log('🛡️ Creating active history index on tryonjobs (user, historyDeleted, createdAt)...');
    await collection.createIndex(
      { user: 1, historyDeleted: 1, createdAt: -1 },
      { background: true, name: 'user_1_historyDeleted_1_createdAt_-1' }
    );
  }
}

async function ensureProductIntelligenceIndexes(mongooseInstance) {
  const collection = mongooseInstance.connection.db.collection('productintelligences');
  const existingIndexes = await collection.indexes().catch(() => []);
  const existingNames = new Set(existingIndexes.map(i => i.name));

  if (!existingNames.has('product_1')) {
    console.log('🛡️ Creating unique index on productintelligences (product)...');
    await collection.createIndex(
      { product: 1 },
      { unique: true, background: true, name: 'product_1' }
    );
  }

  if (!existingNames.has('verificationStatus_1')) {
    await collection.createIndex(
      { verificationStatus: 1 },
      { background: true, name: 'verificationStatus_1' }
    );
  }
}

async function ensureTryOnProviderConfigIndexes(mongooseInstance) {
  const collection = mongooseInstance.connection.db.collection('tryonproviderconfigs');
  const existingIndexes = await collection.indexes().catch(() => []);
  const existingNames = new Set(existingIndexes.map(i => i.name));

  if (!existingNames.has('providerId_1')) {
    console.log('🛡️ Creating unique index on tryonproviderconfigs (providerId)...');
    await collection.createIndex(
      { providerId: 1 },
      { unique: true, background: true, name: 'providerId_1' }
    );
  }
}

async function ensureTryOnIndexes(mongooseInstance) {
  await ensureLedgerIndexes(mongooseInstance);
  await ensureTryOnJobIndexes(mongooseInstance);
  await ensureProductIntelligenceIndexes(mongooseInstance);
  await ensureTryOnProviderConfigIndexes(mongooseInstance);
}

module.exports = {
  ensureLedgerIndexes,
  ensureTryOnJobIndexes,
  ensureProductIntelligenceIndexes,
  ensureTryOnProviderConfigIndexes,
  ensureTryOnIndexes
};
