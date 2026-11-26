import { demoGetItem, demoSetItem } from './demoSandbox';

export type SyncRegistryDomain =
  | 'transactions'
  | 'fee_ledger'
  | 'cashier_shifts'
  | 'stock_mutations'
  | 'purchase_orders'
  | 'marketing_campaigns'
  | 'prescriptions'
  | 'rme_records'
  | 'opname_records'
  | 'lab_records'
  | 'morbidity_reports'
  | 'suppliers'
  | 'mitra'
  | 'branches'
  | 'branch_transfers'
  | 'purchase_invoices'
  | 'discounts_promos'
  | 'mitra_orders'
  | 'patients'
  | 'staff';

const MAX_TOMBSTONES = 3000;

const STORAGE_KEYS: Record<
  SyncRegistryDomain,
  {
    deleted: string;
    pendingDelete: string;
    pendingSync: string;
    clearAllPending: string;
    syncedOnce: string;
  }
> = {
  transactions: {
    deleted: 'latisha_deleted_transaction_ids_v1',
    pendingDelete: 'latisha_pending_delete_transaction_ids_v1',
    pendingSync: 'latisha_pending_sync_transaction_ids_v1',
    clearAllPending: 'latisha_pending_clear_transactions_v1',
    syncedOnce: 'latisha_transactions_cloud_synced_once_v1'
  },
  fee_ledger: {
    deleted: 'latisha_deleted_fee_ledger_ids_v1',
    pendingDelete: 'latisha_pending_delete_fee_ledger_ids_v1',
    pendingSync: 'latisha_pending_sync_fee_ledger_ids_v1',
    clearAllPending: 'latisha_pending_clear_fee_ledger_v1',
    syncedOnce: 'latisha_fee_ledger_cloud_synced_once_v1'
  },
  cashier_shifts: {
    deleted: 'latisha_deleted_cashier_shift_ids_v1',
    pendingDelete: 'latisha_pending_delete_cashier_shift_ids_v1',
    pendingSync: 'latisha_pending_sync_cashier_shift_ids_v1',
    clearAllPending: 'latisha_pending_clear_cashier_shifts_v1',
    syncedOnce: 'latisha_cashier_shifts_cloud_synced_once_v1'
  },
  stock_mutations: {
    deleted: 'latisha_deleted_stock_mutation_ids_v1',
    pendingDelete: 'latisha_pending_delete_stock_mutation_ids_v1',
    pendingSync: 'latisha_pending_sync_stock_mutation_ids_v1',
    clearAllPending: 'latisha_pending_clear_stock_mutations_v1',
    syncedOnce: 'latisha_stock_mutations_cloud_synced_once_v1'
  },
  purchase_orders: {
    deleted: 'latisha_deleted_purchase_order_ids_v1',
    pendingDelete: 'latisha_pending_delete_purchase_order_ids_v1',
    pendingSync: 'latisha_pending_sync_purchase_order_ids_v1',
    clearAllPending: 'latisha_pending_clear_purchase_orders_v1',
    syncedOnce: 'latisha_purchase_orders_cloud_synced_once_v1'
  },
  marketing_campaigns: {
    deleted: 'latisha_deleted_marketing_campaign_ids_v1',
    pendingDelete: 'latisha_pending_delete_marketing_campaign_ids_v1',
    pendingSync: 'latisha_pending_sync_marketing_campaign_ids_v1',
    clearAllPending: 'latisha_pending_clear_marketing_campaigns_v1',
    syncedOnce: 'latisha_marketing_campaigns_cloud_synced_once_v1'
  },
  prescriptions: {
    deleted: 'latisha_deleted_prescription_ids_v1',
    pendingDelete: 'latisha_pending_delete_prescription_ids_v1',
    pendingSync: 'latisha_pending_sync_prescription_ids_v1',
    clearAllPending: 'latisha_pending_clear_prescriptions_v1',
    syncedOnce: 'latisha_prescriptions_cloud_synced_once_v1'
  },
  rme_records: {
    deleted: 'latisha_deleted_rme_record_ids_v1',
    pendingDelete: 'latisha_pending_delete_rme_record_ids_v1',
    pendingSync: 'latisha_pending_sync_rme_record_ids_v1',
    clearAllPending: 'latisha_pending_clear_rme_records_v1',
    syncedOnce: 'latisha_rme_records_cloud_synced_once_v1'
  },
  opname_records: {
    deleted: 'latisha_deleted_opname_record_ids_v1',
    pendingDelete: 'latisha_pending_delete_opname_record_ids_v1',
    pendingSync: 'latisha_pending_sync_opname_record_ids_v1',
    clearAllPending: 'latisha_pending_clear_opname_records_v1',
    syncedOnce: 'latisha_opname_records_cloud_synced_once_v1'
  },
  lab_records: {
    deleted: 'latisha_deleted_lab_record_ids_v1',
    pendingDelete: 'latisha_pending_delete_lab_record_ids_v1',
    pendingSync: 'latisha_pending_sync_lab_record_ids_v1',
    clearAllPending: 'latisha_pending_clear_lab_records_v1',
    syncedOnce: 'latisha_lab_records_cloud_synced_once_v1'
  },
  morbidity_reports: {
    deleted: 'latisha_deleted_morbidity_report_ids_v1',
    pendingDelete: 'latisha_pending_delete_morbidity_report_ids_v1',
    pendingSync: 'latisha_pending_sync_morbidity_report_ids_v1',
    clearAllPending: 'latisha_pending_clear_morbidity_reports_v1',
    syncedOnce: 'latisha_morbidity_reports_cloud_synced_once_v1'
  },
  suppliers: {
    deleted: 'latisha_deleted_supplier_ids_v1',
    pendingDelete: 'latisha_pending_delete_supplier_ids_v1',
    pendingSync: 'latisha_pending_sync_supplier_ids_v1',
    clearAllPending: 'latisha_pending_clear_suppliers_v1',
    syncedOnce: 'latisha_suppliers_cloud_synced_once_v1'
  },
  mitra: {
    deleted: 'latisha_deleted_mitra_ids_v1',
    pendingDelete: 'latisha_pending_delete_mitra_ids_v1',
    pendingSync: 'latisha_pending_sync_mitra_ids_v1',
    clearAllPending: 'latisha_pending_clear_mitra_v1',
    syncedOnce: 'latisha_mitra_cloud_synced_once_v1'
  },
  branches: {
    deleted: 'latisha_deleted_branch_ids_v1',
    pendingDelete: 'latisha_pending_delete_branch_ids_v1',
    pendingSync: 'latisha_pending_sync_branch_ids_v1',
    clearAllPending: 'latisha_pending_clear_branches_v1',
    syncedOnce: 'latisha_branches_cloud_synced_once_v1'
  },
  branch_transfers: {
    deleted: 'latisha_deleted_branch_transfer_ids_v1',
    pendingDelete: 'latisha_pending_delete_branch_transfer_ids_v1',
    pendingSync: 'latisha_pending_sync_branch_transfer_ids_v1',
    clearAllPending: 'latisha_pending_clear_branch_transfers_v1',
    syncedOnce: 'latisha_branch_transfers_cloud_synced_once_v1'
  },
  purchase_invoices: {
    deleted: 'latisha_deleted_purchase_invoice_ids_v1',
    pendingDelete: 'latisha_pending_delete_purchase_invoice_ids_v1',
    pendingSync: 'latisha_pending_sync_purchase_invoice_ids_v1',
    clearAllPending: 'latisha_pending_clear_purchase_invoices_v1',
    syncedOnce: 'latisha_purchase_invoices_cloud_synced_once_v1'
  },
  discounts_promos: {
    deleted: 'latisha_deleted_discount_promo_ids_v1',
    pendingDelete: 'latisha_pending_delete_discount_promo_ids_v1',
    pendingSync: 'latisha_pending_sync_discount_promo_ids_v1',
    clearAllPending: 'latisha_pending_clear_discounts_promos_v1',
    syncedOnce: 'latisha_discounts_promos_cloud_synced_once_v1'
  },
  mitra_orders: {
    deleted: 'latisha_deleted_mitra_order_ids_v1',
    pendingDelete: 'latisha_pending_delete_mitra_order_ids_v1',
    pendingSync: 'latisha_pending_sync_mitra_order_ids_v1',
    clearAllPending: 'latisha_pending_clear_mitra_orders_v1',
    syncedOnce: 'latisha_mitra_orders_cloud_synced_once_v1'
  },
  patients: {
    deleted: 'latisha_deleted_patient_ids_v1',
    pendingDelete: 'latisha_pending_delete_patient_ids_v1',
    pendingSync: 'latisha_pending_sync_patient_ids_v1',
    clearAllPending: 'latisha_pending_clear_patients_v1',
    syncedOnce: 'latisha_patients_cloud_synced_once_v1'
  },
  staff: {
    deleted: 'latisha_deleted_staff_ids_v1',
    pendingDelete: 'latisha_pending_delete_staff_ids_v1',
    pendingSync: 'latisha_pending_sync_staff_ids_v1',
    clearAllPending: 'latisha_pending_clear_staff_v1',
    syncedOnce: 'latisha_staff_cloud_synced_once_v1'
  }
};

const DELETED_OPNAME_REFS_KEY = 'latisha_deleted_opname_ref_nos_v1';
const PENDING_DELETE_FEE_LEDGER_TRX_IDS_KEY = 'latisha_pending_delete_fee_ledger_trx_ids_v1';

function readIdList(storageKey: string): string[] {
  try {
    const raw = demoGetItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => String(id || '').trim())
      .filter((id) => id.length > 0);
  } catch {
    return [];
  }
}

function writeIdList(storageKey: string, ids: string[], limit = MAX_TOMBSTONES): void {
  try {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const rawId of ids) {
      const id = String(rawId || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    const trimmed = unique.length > limit ? unique.slice(unique.length - limit) : unique;
    demoSetItem(storageKey, JSON.stringify(trimmed));
  } catch (err) {
    console.warn(`[DeletionRegistry] Failed to persist ${storageKey}:`, err);
  }
}

export function getDeletedIdsSet(domain: SyncRegistryDomain): Set<string> {
  return new Set(readIdList(STORAGE_KEYS[domain].deleted));
}

export function getPendingDeleteIds(domain: SyncRegistryDomain): string[] {
  return readIdList(STORAGE_KEYS[domain].pendingDelete);
}

export function getPendingSyncIdsSet(domain: SyncRegistryDomain): Set<string> {
  return new Set(readIdList(STORAGE_KEYS[domain].pendingSync));
}

export function isClearAllPending(domain: SyncRegistryDomain): boolean {
  try {
    return demoGetItem(STORAGE_KEYS[domain].clearAllPending) === 'true';
  } catch {
    return false;
  }
}

export function setClearAllPending(domain: SyncRegistryDomain, pending: boolean): void {
  try {
    demoSetItem(STORAGE_KEYS[domain].clearAllPending, pending ? 'true' : 'false');
  } catch {}
}

export function hasCompletedInitialCloudSync(domain: SyncRegistryDomain): boolean {
  try {
    return demoGetItem(STORAGE_KEYS[domain].syncedOnce) === 'true';
  } catch {
    return false;
  }
}

export function markInitialCloudSyncCompleted(domain: SyncRegistryDomain): void {
  try {
    demoSetItem(STORAGE_KEYS[domain].syncedOnce, 'true');
  } catch {}
}

/**
 * Synchronously records locally deleted IDs into persistent tombstone + pending-cloud-delete lists,
 * and removes them from any pending-upload queue so they can never be re-uploaded to Supabase.
 */
export function markIdsDeleted(domain: SyncRegistryDomain, ids: string[]): void {
  const cleanIds = ids.map((id) => String(id || '').trim()).filter(Boolean);
  if (cleanIds.length === 0) return;

  const keys = STORAGE_KEYS[domain];
  const deleted = readIdList(keys.deleted);
  writeIdList(keys.deleted, [...deleted, ...cleanIds]);

  const pendingDelete = readIdList(keys.pendingDelete);
  writeIdList(keys.pendingDelete, [...pendingDelete, ...cleanIds]);

  const removeSet = new Set(cleanIds);
  const pendingSync = readIdList(keys.pendingSync).filter((id) => !removeSet.has(id));
  writeIdList(keys.pendingSync, pendingSync);
}

/**
 * Records a deletion confirmed from Supabase realtime so stale caches cannot re-insert it.
 * Note: For 'staff', IDs are sequential and reusable (STF-002, STF-003, ...), so we remove
 * local pending flags without keeping a permanent tombstone that would wipe future hires.
 */
export function recordRemoteDeletedId(domain: SyncRegistryDomain, id: string): void {
  const cleanId = String(id || '').trim();
  if (!cleanId) return;
  const keys = STORAGE_KEYS[domain];
  if (domain === 'staff') {
    const deleted = readIdList(keys.deleted).filter((existing) => existing !== cleanId);
    writeIdList(keys.deleted, deleted);
  } else {
    const deleted = readIdList(keys.deleted);
    writeIdList(keys.deleted, [...deleted, cleanId]);
  }

  const pendingSync = readIdList(keys.pendingSync).filter((existing) => existing !== cleanId);
  writeIdList(keys.pendingSync, pendingSync);

  const pendingDelete = readIdList(keys.pendingDelete).filter((existing) => existing !== cleanId);
  writeIdList(keys.pendingDelete, pendingDelete);
}

/**
 * Marks IDs as confirmed deleted on Supabase (clears them from pendingDelete queue
 * while keeping them in deleted tombstones for non-reusable ID domains).
 * For 'staff', IDs are sequential & reusable, so confirmed cloud deletes also lift the tombstone.
 */
export function confirmCloudDeletes(domain: SyncRegistryDomain, ids: string[]): void {
  const cleanIds = new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
  if (cleanIds.size === 0) return;
  const keys = STORAGE_KEYS[domain];
  const remaining = readIdList(keys.pendingDelete).filter((id) => !cleanIds.has(id));
  writeIdList(keys.pendingDelete, remaining);
  if (domain === 'staff') {
    const remainingDeleted = readIdList(keys.deleted).filter((id) => !cleanIds.has(id));
    writeIdList(keys.deleted, remainingDeleted);
  }
}

/**
 * Clears any stale deleted tombstones that are no longer waiting in pendingDelete.
 * Crucial for 'staff' where sequential IDs (STF-002+) can legitimately be reassigned.
 */
export function clearNonPendingDeletedTombstones(domain: SyncRegistryDomain): void {
  const keys = STORAGE_KEYS[domain];
  const pendingDeleteSet = new Set(readIdList(keys.pendingDelete));
  if (pendingDeleteSet.size === 0) {
    writeIdList(keys.deleted, []);
    return;
  }
  const retained = readIdList(keys.deleted).filter((id) => pendingDeleteSet.has(id));
  writeIdList(keys.deleted, retained);
}

/**
 * Tracks a newly created or locally modified record ID that has not yet been confirmed on Supabase.
 */
export function markIdsPendingSync(domain: SyncRegistryDomain, ids: string[]): void {
  const cleanIds = ids.map((id) => String(id || '').trim()).filter(Boolean);
  if (cleanIds.length === 0) return;
  const keys = STORAGE_KEYS[domain];
  const idSet = new Set(cleanIds);

  const pendingSync = readIdList(keys.pendingSync);
  writeIdList(keys.pendingSync, [...pendingSync, ...cleanIds]);

  // If the exact same ID is explicitly created/edited again, lift it from deleted tombstones
  const deleted = readIdList(keys.deleted).filter((id) => !idSet.has(id));
  writeIdList(keys.deleted, deleted);

  const pendingDelete = readIdList(keys.pendingDelete).filter((id) => !idSet.has(id));
  writeIdList(keys.pendingDelete, pendingDelete);
}

/**
 * Clears IDs from pendingSync once Supabase confirms upsert success.
 */
export function confirmCloudSync(domain: SyncRegistryDomain, ids: string[]): void {
  const cleanIds = new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
  if (cleanIds.size === 0) return;
  const keys = STORAGE_KEYS[domain];
  const remaining = readIdList(keys.pendingSync).filter((id) => !cleanIds.has(id));
  writeIdList(keys.pendingSync, remaining);
}

export function getDeletedOpnameRefsSet(): Set<string> {
  return new Set(readIdList(DELETED_OPNAME_REFS_KEY));
}

export function markOpnameRefsDeleted(refNos: string[]): void {
  const cleanRefs = refNos.map((r) => String(r || '').trim()).filter(Boolean);
  if (cleanRefs.length === 0) return;
  const existing = readIdList(DELETED_OPNAME_REFS_KEY);
  writeIdList(DELETED_OPNAME_REFS_KEY, [...existing, ...cleanRefs]);
}

export function getPendingDeleteFeeLedgerTrxIds(): string[] {
  return readIdList(PENDING_DELETE_FEE_LEDGER_TRX_IDS_KEY);
}

export function addPendingDeleteFeeLedgerTrxIds(trxIds: string[]): void {
  const cleanIds = trxIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (cleanIds.length === 0) return;
  const existing = readIdList(PENDING_DELETE_FEE_LEDGER_TRX_IDS_KEY);
  writeIdList(PENDING_DELETE_FEE_LEDGER_TRX_IDS_KEY, [...existing, ...cleanIds]);
}

export function confirmFeeLedgerTrxDeletes(trxIds: string[]): void {
  const cleanIds = new Set(trxIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (cleanIds.size === 0) return;
  const remaining = readIdList(PENDING_DELETE_FEE_LEDGER_TRX_IDS_KEY).filter(
    (id) => !cleanIds.has(id)
  );
  writeIdList(PENDING_DELETE_FEE_LEDGER_TRX_IDS_KEY, remaining);
}

