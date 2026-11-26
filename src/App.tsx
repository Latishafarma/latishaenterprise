/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useTransition, lazy, Suspense } from 'react';

let auditLogSequence = 0;

export function normalizeMedicineName(rawName: string): string {
  if (!rawName) return '';
  let str = rawName.toLowerCase();
  const dosageForms = ['tablet', 'tab', 'capsule', 'kapsul', 'caps', 'cap', 'syrup', 'sirup', 'suspension', 'susp', 'drop', 'drops', 'injeksi', 'injection', 'suppositoria', 'suppo', 'cream', 'salep', 'ointment'];
  dosageForms.forEach(form => {
    const regex = new RegExp(`\\b${form}\\b`, 'gi');
    str = str.replace(regex, '');
  });
  str = str.replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|cc|%)\b/gi, '');
  const salts = ['hcl', 'hydrochloride', 'besylate', 'cilexetil', 'maleate', 'sodium', 'potassium', 'diacetate', 'sulfate'];
  salts.forEach(salt => {
    const regex = new RegExp(`\\b${salt}\\b`, 'gi');
    str = str.replace(regex, '');
  });
  str = str.replace(/[\d\(\)\[\]\/\+\-\,\.]+/g, ' ');
  return str.replace(/\s+/g, ' ').trim();
}

function ensureUniqueAuditLogIds(list: AuditLog[]): AuditLog[] {
  const seen = new Set<string>();
  return list.map((item, idx) => {
    const baseId = item.id || `LOG-${idx}`;
    if (!seen.has(baseId)) {
      seen.add(baseId);
      return item;
    }
    let candidate = `${baseId}-${idx}`;
    while (seen.has(candidate)) {
      candidate = `${baseId}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
    }
    seen.add(candidate);
    return { ...item, id: candidate };
  });
}
import {
  INITIAL_BRANCHES,
  INITIAL_ICD10_LIST,
  INITIAL_MEDICINES,
  INITIAL_PATIENTS,
  INITIAL_DOCTORS,
  INITIAL_STAFF,
  INITIAL_PATIENT_QUEUE,
  INITIAL_ONLINE_REGISTRATIONS,
  INITIAL_RME_RECORDS,
  INITIAL_E_PRESCRIPTIONS,
  INITIAL_PURCHASE_INVOICES,
  INITIAL_TRANSACTIONS,
  INITIAL_STOCK_MUTATIONS,
  INITIAL_TRANSFERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_MITRA,
  INITIAL_SUPPLIERS,
  INITIAL_DUTY_SCHEDULES
} from './data/initialData';

import {
  Branch,
  Medicine,
  Patient,
  Doctor,
  Staff,
  DutySchedule,
  PatientQueue,
  OnlineRegistration,
  RMERecord,
  EPrescription,
  Transaction,
  PurchaseInvoice,
  PurchaseOrder,
  StockMutation,
  StockTransfer,
  AuditLog,
  FeeConfig,
  DEFAULT_FEE_CONFIG,
  Mitra,
  Supplier,
  CartItem,
  PurchaseReturnRecord,
  LabTestRecord,
  StockOpnameRecord,
  StockOpnameItemRecord,
  StockOpnameBatchRecord,
  StockOpnameKind,
  MedicineBatch,
  ICD10Item,
  DEFAULT_ROLE_PERMISSIONS,
  CashierShiftSession,
  StaffRole,
  OWNER_ADMIN_ROLE,
  isOwnerAdminRole,
  normalizeStaffRole,
  isPrimaryOwnerStaffRecord,
  ensurePrimaryOwnerStaffRole,
  getStaffActiveRoles,
  resolveStaffEffectivePermissions,
  MitraOrder,
  MitraOrderStatus,
  MedicalMorbidityReportRecord,
  SalesDiscount,
  PromoAd,
  MarketingCampaign,
  DrugInteractionRecord,
  PortalActivityEvent,
  StaffAttendanceRecord,
  StaffFeeLedgerEntry,
  DPJProfile
} from './types';
import { INITIAL_INTERAKSI_OBAT } from './data/drugInteractions';
import { RoleAccessProvider } from './utils/roleAccess';
import {
  runAutoDailyBackupIfNeeded,
  StoredBackupFileMeta,
  formatBackupBytes,
  BACKUPS_FOLDER_NAME
} from './utils/autoBackupStorage';
import {
  resolvePrimaryBatchAndStock,
  allocateBatchesFEFO,
  deductBatchesFEFO,
  addBatchStock,
  getMedicineHppBox
} from './utils/batchHelper';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import {
  getSavedPharmacyProfile,
  getSavedAPJProfile,
  getSavedDPJProfile,
  applyRemoteFacilityProfiles,
  formatPharmacyAddress,
  syncFacilityProfileToServer
} from './utils/facilityProfileHelper';
const PharmacySettingsModal = lazy(() =>
  import('./components/PharmacySettingsModal').then((m) => ({ default: m.PharmacySettingsModal }))
);

import type { ConvertMitraOrderOptions } from './components/MitraOrdersView';

const DashboardView = lazy(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const LiveMonitorView = lazy(() => import('./components/LiveMonitorView').then((m) => ({ default: m.LiveMonitorView })));
const PatientMasterView = lazy(() => import('./components/PatientMasterView').then((m) => ({ default: m.PatientMasterView })));
const CheckinView = lazy(() => import('./components/CheckinView').then((m) => ({ default: m.CheckinView })));
const OnlineRegistrationView = lazy(() => import('./components/OnlineRegistrationView').then((m) => ({ default: m.OnlineRegistrationView })));
const DoctorSOAPView = lazy(() => import('./components/DoctorSOAPView').then((m) => ({ default: m.DoctorSOAPView })));
const LabTestView = lazy(() => import('./components/LabTestView').then((m) => ({ default: m.LabTestView })));
const RMEHistoryView = lazy(() => import('./components/RMEHistoryView').then((m) => ({ default: m.RMEHistoryView })));
const RMEReportsView = lazy(() => import('./components/RMEReportsView').then((m) => ({ default: m.RMEReportsView })));
const POSCashierView = lazy(() => import('./components/POSCashierView').then((m) => ({ default: m.POSCashierView })));
const EPrescriptionQueueView = lazy(() => import('./components/EPrescriptionQueueView').then((m) => ({ default: m.EPrescriptionQueueView })));
const InventoryView = lazy(() => import('./components/InventoryView').then((m) => ({ default: m.InventoryView })));
const StockCardView = lazy(() => import('./components/StockCardView').then((m) => ({ default: m.StockCardView })));
const StockOpnameView = lazy(() => import('./components/StockOpnameView').then((m) => ({ default: m.StockOpnameView })));
const DefectaView = lazy(() => import('./components/DefectaView').then((m) => ({ default: m.DefectaView })));
const PurchaseInvoiceView = lazy(() => import('./components/PurchaseInvoiceView').then((m) => ({ default: m.PurchaseInvoiceView })));
const SalesHistoryView = lazy(() => import('./components/SalesHistoryView').then((m) => ({ default: m.SalesHistoryView })));
const BranchSyncView = lazy(() => import('./components/BranchSyncView').then((m) => ({ default: m.BranchSyncView })));
const FinancialReportsView = lazy(() => import('./components/FinancialReportsView').then((m) => ({ default: m.FinancialReportsView })));
const FeeSettingsView = lazy(() => import('./components/FeeSettingsView').then((m) => ({ default: m.FeeSettingsView })));
const SetupMitraView = lazy(() => import('./components/SetupMitraView').then((m) => ({ default: m.SetupMitraView })));
const SetupSupplierView = lazy(() => import('./components/SetupSupplierView').then((m) => ({ default: m.SetupSupplierView })));
const DiscountPromoView = lazy(() => import('./components/DiscountPromoView').then((m) => ({ default: m.DiscountPromoView })));
const AuditTrailView = lazy(() => import('./components/AuditTrailView').then((m) => ({ default: m.AuditTrailView })));
const MobileFieldStaffView = lazy(() => import('./components/MobileFieldStaffView').then((m) => ({ default: m.MobileFieldStaffView })));
const PrintView = lazy(() => import('./components/PrintView').then((m) => ({ default: m.PrintView })));
const PurchaseReturnHistoryView = lazy(() => import('./components/PurchaseReturnHistoryView').then((m) => ({ default: m.PurchaseReturnHistoryView })));
const DebtReceivableView = lazy(() => import('./components/DebtReceivableView').then((m) => ({ default: m.DebtReceivableView })));
const DatabaseBackupView = lazy(() => import('./components/DatabaseBackupView').then((m) => ({ default: m.DatabaseBackupView })));
const PublicPatientRegistration = lazy(() => import('./components/PublicPatientRegistration').then((m) => ({ default: m.PublicPatientRegistration })));
const PublicMitraPortalView = lazy(() => import('./components/PublicMitraPortalView').then((m) => ({ default: m.PublicMitraPortalView })));
const UnifiedCustomerPortalView = lazy(() => import('./components/UnifiedCustomerPortalView').then((m) => ({ default: m.UnifiedCustomerPortalView })));
const PublicStaffRegistrationView = lazy(() => import('./components/PublicStaffRegistrationView').then((m) => ({ default: m.PublicStaffRegistrationView })));
const PortalQRGeneratorModal = lazy(() => import('./components/PortalQRGeneratorModal').then((m) => ({ default: m.PortalQRGeneratorModal })));
const MitraOrdersView = lazy(() => import('./components/MitraOrdersView').then((m) => ({ default: m.MitraOrdersView })));
const DutyScheduleView = lazy(() => import('./components/DutyScheduleView').then((m) => ({ default: m.DutyScheduleView })));
const SatuSehatView = lazy(() => import('./components/SatuSehatView').then((m) => ({ default: m.SatuSehatView })));
const MarketingStrategyView = lazy(() => import('./components/MarketingStrategyView').then((m) => ({ default: m.MarketingStrategyView })));
const TaxEstimationView = lazy(() => import('./components/TaxEstimationView').then((m) => ({ default: m.TaxEstimationView })));

const TabLoadingFallback: React.FC = () => (
  <div className="bg-white/80 rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs animate-pulse space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 rounded-full border-2 border-sky-600 border-t-transparent animate-spin shrink-0" />
      <div className="h-4 w-48 bg-slate-200 rounded-md" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="h-20 bg-slate-100 rounded-xl" />
      <div className="h-20 bg-slate-100 rounded-xl" />
      <div className="h-20 bg-slate-100 rounded-xl" />
    </div>
    <div className="h-48 bg-slate-100 rounded-xl" />
  </div>
);
import {
  enqueuePatientSatuSehatBackground,
  enqueueClinicalSatuSehatBackground,
  enqueueDispenseSatuSehatBackground
} from './utils/satusehatService';
import {
  syncPatientToSupabase,
  updatePatientInSupabase,
  deletePatientFromSupabase,
  fetchPatientsFromSupabase,
  subscribePatientsRealtime,
  isSamePatientRecord,
  deduplicatePatients,
  mergePatientLists,
  fetchOnlineRegistrationsFromSupabase,
  syncOnlineRegistrationToSupabase,
  subscribeOnlineRegistrationsRealtime,
  fetchICD10FromSupabase,
  syncICD10ToSupabase,
  subscribeICD10Realtime,
  fetchStaffFromSupabase,
  syncStaffToSupabase,
  registerNewStaffToSupabase,
  deleteStaffFromSupabase,
  subscribeStaffRealtime,
  fetchRmeFromSupabase,
  syncRmeToSupabase,
  seedRmeToSupabase,
  deleteRmeFromSupabase,
  deleteRmesFromSupabase,
  subscribeRmeRealtime,
  isDemoRmeId,
  fetchMorbidityReportsFromSupabase,
  syncMorbidityReportToSupabase,
  seedMorbidityReportsToSupabase,
  deleteMorbidityReportFromSupabase,
  subscribeMorbidityReportsRealtime,
  fetchSchedulesFromSupabase,
  syncScheduleToSupabase,
  seedSchedulesToSupabase,
  deleteScheduleFromSupabase,
  subscribeSchedulesRealtime,
  fetchMedicinesFromSupabase,
  syncMedicineToSupabase,
  updateMedicineInSupabase,
  seedMedicinesToSupabase,
  deleteMedicineFromSupabase,
  clearMedicinesFromSupabase,
  subscribeMedicinesRealtime,
  fetchMitraFromSupabase,
  syncMitraToSupabase,
  seedMitraToSupabase,
  deleteMitraFromSupabase,
  subscribeMitraRealtime,
  fetchMitraOrdersFromSupabase,
  syncMitraOrderToSupabase,
  deleteMitraOrderFromSupabase,
  subscribeMitraOrdersRealtime,
  fetchFacilityProfilesFromSupabase,
  syncFacilityProfilesToSupabase,
  subscribeFacilityProfileRealtime,
  fetchPrescriptionsFromSupabase,
  syncPrescriptionToSupabase,
  seedPrescriptionsToSupabase,
  deletePrescriptionFromSupabase,
  deletePrescriptionsFromSupabase,
  subscribePrescriptionsRealtime,
  isDemoPrescriptionId,
  fetchTransactionsFromSupabase,
  syncTransactionToSupabase,
  seedTransactionsToSupabase,
  deleteTransactionsFromSupabase,
  subscribeTransactionsRealtime,
  fetchStockMutationsFromSupabase,
  syncStockMutationToSupabase,
  seedStockMutationsToSupabase,
  deleteStockMutationsFromSupabase,
  subscribeStockMutationsRealtime,
  fetchLabRecordsFromSupabase,
  syncLabRecordToSupabase,
  seedLabRecordsToSupabase,
  deleteLabRecordFromSupabase,
  deleteLabRecordsFromSupabase,
  subscribeLabRecordsRealtime,
  isDemoLabRecordId,
  fetchOpnameRecordsFromSupabase,
  syncOpnameRecordToSupabase,
  seedOpnameRecordsToSupabase,
  deleteOpnameRecordFromSupabase,
  deleteOpnameRecordsFromSupabase,
  subscribeOpnameRecordsRealtime,
  isDemoOpnameRecordId,
  fetchSuppliersFromSupabase,
  syncSupplierToSupabase,
  seedSuppliersToSupabase,
  deleteSupplierFromSupabase,
  subscribeSuppliersRealtime,
  isDemoSupplierId,
  fetchBranchesFromSupabase,
  syncBranchToSupabase,
  seedBranchesToSupabase,
  deleteBranchFromSupabase,
  subscribeBranchesRealtime,
  isDemoBranchId,
  fetchBranchTransfersFromSupabase,
  syncBranchTransferToSupabase,
  seedBranchTransfersToSupabase,
  deleteBranchTransferFromSupabase,
  subscribeBranchTransfersRealtime,
  isDemoTransferId,
  fetchCashierShiftsFromSupabase,
  syncCashierShiftToSupabase,
  seedCashierShiftsToSupabase,
  deleteCashierShiftFromSupabase,
  deleteCashierShiftsFromSupabase,
  clearCashierShiftsFromSupabase,
  subscribeCashierShiftsRealtime,
  isDemoCashierShiftId,
  fetchPurchaseInvoicesFromSupabase,
  syncPurchaseInvoiceToSupabase,
  seedPurchaseInvoicesToSupabase,
  deletePurchaseInvoiceFromSupabase,
  subscribePurchaseInvoicesRealtime,
  isDemoPurchaseInvoiceId,
  fetchPurchaseOrdersFromSupabase,
  syncPurchaseOrderToSupabase,
  seedPurchaseOrdersToSupabase,
  deletePurchaseOrdersFromSupabase,
  subscribePurchaseOrdersRealtime,
  isDemoPurchaseOrderId,
  fetchMarketingCampaignsFromSupabase,
  syncMarketingCampaignToSupabase,
  seedMarketingCampaignsToSupabase,
  deleteMarketingCampaignsFromSupabase,
  subscribeMarketingCampaignsRealtime,
  isDemoMarketingCampaignId,
  fetchDiscountsPromosFromSupabase,
  syncDiscountToSupabase,
  syncPromoToSupabase,
  deletePromoOrDiscountFromSupabase,
  seedDiscountsPromosToSupabase,
  subscribeDiscountsPromosRealtime,
  pushDiscountsPromosToServerBridge,
  fetchDiscountsPromosFromServerBridge,
  fetchFeeConfigFromSupabase,
  syncFeeConfigToSupabase,
  subscribeFeeConfigRealtime,
  fetchFeeLedgerFromSupabase,
  upsertFeeLedgerEntriesToSupabase,
  cancelFeeLedgerByTransactionInSupabase,
  deleteFeeLedgerByTransactionsInSupabase,
  deleteFeeLedgerByIdsInSupabase,
  subscribeFeeLedgerRealtime,
  getSupabaseClient,
  getSupabaseConfig,
  checkOrRegisterPatientSupabase
} from './utils/supabaseClient';
import {
  buildFeeLedgerEntriesForTransaction,
  isDemoFeeLedgerId,
  loadLocalFeeLedger,
  reconcileFeeLedgerWithTransactions,
  saveLocalFeeLedger
} from './utils/serviceFeeHelper';
import {
  getDeletedIdsSet,
  getPendingDeleteIds,
  getPendingSyncIdsSet,
  isClearAllPending,
  setClearAllPending,
  hasCompletedInitialCloudSync,
  markInitialCloudSyncCompleted,
  markIdsDeleted,
  recordRemoteDeletedId,
  confirmCloudDeletes,
  markIdsPendingSync,
  confirmCloudSync,
  getDeletedOpnameRefsSet,
  markOpnameRefsDeleted,
  getPendingDeleteFeeLedgerTrxIds,
  addPendingDeleteFeeLedgerTrxIds,
  confirmFeeLedgerTrxDeletes,
  clearNonPendingDeletedTombstones
} from './utils/deletionRegistry';
const PatientServiceChatWidget = lazy(() =>
  import('./components/PatientServiceChatWidget').then((m) => ({ default: m.PatientServiceChatWidget }))
);
import {
  isDemoMode,
  demoGetItem,
  demoSetItem,
  demoRemoveItem,
  getDemoBroadcastChannelName,
  getScopedStorageKey,
  activateDemoModeStorage,
  deactivateDemoModeStorage
} from './utils/demoSandbox';
import type { DemoSeedBundle } from './data/demoData';
import { playRestrictedSaleAlarmAudio, stopRestrictedSaleAlarmAudio, playCheckInOverdueAlarmAndVoice } from './utils/audio';
import {
  ATTENDANCE_UPDATED_EVENT,
  loadLocalAttendanceRecords,
  findOverdueUncheckedSchedules,
  hasTriggeredCheckInOverdueAlert,
  markTriggeredCheckInOverdueAlert,
  getTodayIsoLocal
} from './utils/attendanceService';
import { buildRestrictedSaleAlarm, RestrictedSaleAlarm } from './utils/medicineRegulation';
import {
  loadPortalActivityLogs,
  PORTAL_ACTIVITY_CHANNEL_NAME,
  PORTAL_ACTIVITY_STORAGE_KEY
} from './utils/portalActivityLogger';
import { Lock, ShieldCheck, KeyRound, IdCard, User, AlertCircle, CheckCircle, Globe, Store, FlaskConical, RotateCcw, Copy, Check, LogOut, Sparkles, Siren, Volume2, VolumeX, Eye, FolderArchive, X, QrCode, LogIn, UserPlus, ExternalLink, Bell, Clock } from 'lucide-react';
import {
  RBAC_BROADCAST_CHANNEL_BASE,
  ROLE_PERMISSIONS_UPDATED_EVENT,
  generateNextStaffId,
  getSavedRolePermissions,
  getStaffRegistrationShareUrl,
  normalizeRolePermissionsMap,
  reconcileStaffPermissionsWithRoleChange,
  resolveRoleDefaultPermissions,
  saveRolePermissionsLocally,
  saveStaffListLocally
} from './utils/staffRegistrationHelper';
import { buildPortalUrl } from './utils/portalUrlHelper';

const stripTitles = (name: string): string => {
  return name
    .replace(/\b(apt|dr|drg|ns|prof|hj|h)\b\.?\s*/gi, '')
    .replace(/,\s*(s\.?farm|m\.?farm|sp\.?pd|sp\.?a|sp\.?og|s\.?kep|a\.?md\.?far|a\.?md\.?kep|s\.?ked|m\.?kes|apt)\b.*/gi, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

const verifyStaffCredentials = (inputName: string, inputId: string, list: Staff[]): Staff | null => {
  const cleanId = inputId.trim().toLowerCase();
  const cleanName = inputName.trim();
  if (!cleanId || !cleanName) return null;

  // Find staff where ID matches
  const staffById = list.find((s) => s.id.toLowerCase() === cleanId);
  if (!staffById) return null;

  const normInput = normalizeStr(cleanName);
  const normFull = normalizeStr(staffById.name);
  const normStripped = normalizeStr(stripTitles(staffById.name));
  const normInputStripped = normalizeStr(stripTitles(cleanName));

  if (normInput === normFull || normInput === normStripped || normInputStripped === normStripped) {
    return staffById;
  }

  // Also match if stripped name contains input name or vice-versa (min 3 chars)
  if (normStripped.length >= 3 && normInputStripped.length >= 3) {
    if (normStripped.includes(normInputStripped) || normInputStripped.includes(normStripped)) {
      return staffById;
    }
  }

  // Match significant individual words (e.g. "Mardin", "Anis", "Ratna", "Rahma", "Lestari")
  const skipWords = new Set(['apt', 'dr', 'drg', 'ns', 'prof', 'sfarm', 'skep', 'amdfar', 'amdkep']);
  const inputWords = cleanName.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length >= 3 && !skipWords.has(w));
  const staffWords = staffById.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length >= 3 && !skipWords.has(w));
  
  if (inputWords.length > 0 && inputWords.some(w => staffWords.includes(w))) {
    return staffById;
  }

  return null;
};

const MEDICINES_PENDING_OPS_KEY = 'latisha_medicines_pending_ops';
const MEDICINES_CLOUD_SYNCED_KEY = 'latisha_medicines_cloud_synced';

interface PendingMedicineOps {
  upserts: string[];
  deletes: string[];
}

const readPendingMedicineOps = (): PendingMedicineOps => {
  if (typeof window === 'undefined' || isDemoMode()) {
    return { upserts: [], deletes: [] };
  }
  try {
    const raw = demoGetItem(MEDICINES_PENDING_OPS_KEY);
    if (!raw) return { upserts: [], deletes: [] };
    const parsed = JSON.parse(raw);
    return {
      upserts: Array.isArray(parsed?.upserts) ? parsed.upserts.filter(Boolean) : [],
      deletes: Array.isArray(parsed?.deletes) ? parsed.deletes.filter(Boolean) : []
    };
  } catch {
    return { upserts: [], deletes: [] };
  }
};

const writePendingMedicineOps = (ops: PendingMedicineOps) => {
  if (typeof window === 'undefined' || isDemoMode()) return;
  try {
    const clean: PendingMedicineOps = {
      upserts: Array.from(new Set(ops.upserts.filter(Boolean))),
      deletes: Array.from(new Set(ops.deletes.filter(Boolean)))
    };
    demoSetItem(MEDICINES_PENDING_OPS_KEY, JSON.stringify(clean));
  } catch {}
};

const enqueueMedicineUpsert = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingMedicineOps();
  ops.deletes = ops.deletes.filter((d) => d !== id);
  if (!ops.upserts.includes(id)) ops.upserts.push(id);
  writePendingMedicineOps(ops);
};

const dequeueMedicineUpsert = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingMedicineOps();
  const next = ops.upserts.filter((u) => u !== id);
  if (next.length !== ops.upserts.length) {
    writePendingMedicineOps({ ...ops, upserts: next });
  }
};

const enqueueMedicineDelete = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingMedicineOps();
  ops.upserts = ops.upserts.filter((u) => u !== id);
  if (!ops.deletes.includes(id)) ops.deletes.push(id);
  writePendingMedicineOps(ops);
};

const dequeueMedicineDelete = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingMedicineOps();
  const next = ops.deletes.filter((d) => d !== id);
  if (next.length !== ops.deletes.length) {
    writePendingMedicineOps({ ...ops, deletes: next });
  }
};

const clearPendingMedicineOps = () => {
  if (typeof window === 'undefined' || isDemoMode()) return;
  try {
    demoRemoveItem(MEDICINES_PENDING_OPS_KEY);
  } catch {}
};

const SCHEDULES_PENDING_OPS_KEY = 'latisha_schedules_pending_ops';
const SCHEDULES_CLOUD_SYNCED_KEY = 'latisha_schedules_cloud_synced';

interface PendingScheduleOps {
  upserts: string[];
  deletes: string[];
}

const readPendingScheduleOps = (): PendingScheduleOps => {
  if (typeof window === 'undefined' || isDemoMode()) {
    return { upserts: [], deletes: [] };
  }
  try {
    const raw = demoGetItem(SCHEDULES_PENDING_OPS_KEY);
    if (!raw) return { upserts: [], deletes: [] };
    const parsed = JSON.parse(raw);
    return {
      upserts: Array.isArray(parsed?.upserts) ? parsed.upserts.filter(Boolean) : [],
      deletes: Array.isArray(parsed?.deletes) ? parsed.deletes.filter(Boolean) : []
    };
  } catch {
    return { upserts: [], deletes: [] };
  }
};

const writePendingScheduleOps = (ops: PendingScheduleOps) => {
  if (typeof window === 'undefined' || isDemoMode()) return;
  try {
    const clean: PendingScheduleOps = {
      upserts: Array.from(new Set(ops.upserts.filter(Boolean))),
      deletes: Array.from(new Set(ops.deletes.filter(Boolean)))
    };
    demoSetItem(SCHEDULES_PENDING_OPS_KEY, JSON.stringify(clean));
  } catch {}
};

const enqueueScheduleUpsert = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingScheduleOps();
  ops.deletes = ops.deletes.filter((d) => d !== id);
  if (!ops.upserts.includes(id)) ops.upserts.push(id);
  writePendingScheduleOps(ops);
};

const dequeueScheduleUpsert = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingScheduleOps();
  const next = ops.upserts.filter((u) => u !== id);
  if (next.length !== ops.upserts.length) {
    writePendingScheduleOps({ ...ops, upserts: next });
  }
};

const enqueueScheduleDelete = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingScheduleOps();
  ops.upserts = ops.upserts.filter((u) => u !== id);
  if (!ops.deletes.includes(id)) ops.deletes.push(id);
  writePendingScheduleOps(ops);
};

const dequeueScheduleDelete = (id: string) => {
  if (!id || isDemoMode()) return;
  const ops = readPendingScheduleOps();
  const next = ops.deletes.filter((d) => d !== id);
  if (next.length !== ops.deletes.length) {
    writePendingScheduleOps({ ...ops, deletes: next });
  }
};

const clearPendingScheduleOps = () => {
  if (typeof window === 'undefined' || isDemoMode()) return;
  try {
    demoRemoveItem(SCHEDULES_PENDING_OPS_KEY);
  } catch {}
};

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const printMode = searchParams.get('print');

  if (printMode) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-xs font-semibold">Menyiapkan dokumen cetak...</div>}>
        <PrintView mode={printMode} searchParams={searchParams} />
      </Suspense>
    );
  }

  const [isDemoActive, setIsDemoActive] = useState<boolean>(() => isDemoMode());

  useEffect(() => {
    if (!isDemoActive) return;
    if (demoGetItem('latisha_medicines')) return;
    let cancelled = false;
    import('./data/demoData')
      .then(({ seedDemoSandboxStorage }) => {
        if (cancelled) return;
        const bundle = seedDemoSandboxStorage(false);
        applyDemoSeedToReactStates(bundle, true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isDemoActive]);

  const [demoResetVersion, setDemoResetVersion] = useState<number>(0);
  const [demoResetToast, setDemoResetToast] = useState<string>('');
  const [copiedDemoUrl, setCopiedDemoUrl] = useState<boolean>(false);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    const saved = demoGetItem('latisha_is_logged_in');
    return saved === 'true';
  });
  const [activeStaffId, setActiveStaffId] = useState<string>(() => {
    return demoGetItem('latisha_active_staff_id') || 'STF-001';
  });
  const [userName, setUserName] = useState<string>(() => {
    const saved = demoGetItem('latisha_user_name');
    return saved || INITIAL_STAFF[0]?.name || 'apt. Mardin, S.Farm';
  });
  const [activeRole, setActiveRole] = useState<StaffRole>(() => {
    const savedName = demoGetItem('latisha_user_name') || INITIAL_STAFF[0]?.name || '';
    const savedId = demoGetItem('latisha_active_staff_id') || 'STF-001';
    if (isPrimaryOwnerStaffRecord({ id: savedId, name: savedName })) {
      return OWNER_ADMIN_ROLE;
    }
    const saved = demoGetItem('latisha_active_role');
    return saved ? normalizeStaffRole(saved, OWNER_ADMIN_ROLE) : OWNER_ADMIN_ROLE;
  });
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [pendingTabTarget, setPendingTabTarget] = useState<string | null>(null);
  const [isTabTransitionPending, startTabTransition] = useTransition();

  useEffect(() => {
    setPendingTabTarget(null);
  }, [activeTab]);

  const handleNavigateTab = useCallback((nextTab: string) => {
    setPendingTabTarget(nextTab);
    startTabTransition(() => {
      setActiveTab(nextTab);
    });
  }, []);
  const [isMobileMode, setIsMobileMode] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState<boolean>(() => {
    return demoGetItem('latisha_desktop_sidebar_collapsed') === 'true';
  });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'apotek' | 'apj' | 'dpj' | 'pegawai'>('apotek');
  const [confirmRejectPendingStaffId, setConfirmRejectPendingStaffId] = useState<string | null>(null);
  const [staffValidationToast, setStaffValidationToast] = useState<string | null>(null);

  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(() =>
    getSavedRolePermissions()
  );

  // Core Data State (Loaded from LocalStorage if available, with AI dummy simulation purged)
  const [branches, setBranches] = useState<Branch[]>(() => {
    const saved = demoGetItem('latisha_branches');
    if (!saved) return INITIAL_BRANCHES;
    try {
      const parsed: Branch[] = JSON.parse(saved);
      if (isDemoMode()) {
        return parsed.length > 0 ? parsed : INITIAL_BRANCHES;
      }
      const cleaned = parsed.map((b, idx) => {
        if (idx === 0) {
          const isLegacyDummyName =
            b.name?.trim().toLowerCase() === 'apotek & klinik pratama latisha farma';
          const isLegacyDummyAddr = b.address
            ?.toLowerCase()
            .includes('jl. raya kesehatan no. 45');
          const isLegacyDummyPhone = b.phone?.trim() === '(021) 8899-7722';
          if (isLegacyDummyName || isLegacyDummyAddr || isLegacyDummyPhone) {
            return {
              ...b,
              name: isLegacyDummyName ? INITIAL_BRANCHES[0].name : b.name,
              address: isLegacyDummyAddr ? INITIAL_BRANCHES[0].address : b.address,
              phone: isLegacyDummyPhone ? INITIAL_BRANCHES[0].phone : b.phone
            };
          }
        }
        return b;
      });
      demoSetItem('latisha_branches', JSON.stringify(cleaned));
      return cleaned;
    } catch {
      return INITIAL_BRANCHES;
    }
  });

  const [currentBranch, setCurrentBranch] = useState<Branch>(
    branches[0] || INITIAL_BRANCHES[0]
  );

  const normalizeUniqueMedicines = (list: Medicine[]): { items: Medicine[]; changed: boolean; reassigned: Medicine[] } => {
    const seenById = new Map<string, Medicine>();
    const allExistingIds = new Set<string>(list.map((m) => m.id));
    let maxSeq = list.reduce((max, m) => {
      const match = /^OBT-(\d+)$/i.exec((m.id || '').trim());
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, list.length);

    let changed = false;
    const reassigned: Medicine[] = [];
    const result: Medicine[] = [];

    for (const item of list) {
      const currentId = (item.id || '').trim();
      if (!currentId) {
        maxSeq++;
        let newId = `OBT-${String(maxSeq).padStart(3, '0')}`;
        while (allExistingIds.has(newId) || seenById.has(newId)) {
          maxSeq++;
          newId = `OBT-${String(maxSeq).padStart(3, '0')}`;
        }
        const fixedItem: Medicine = { ...item, id: newId };
        seenById.set(newId, fixedItem);
        allExistingIds.add(newId);
        result.push(fixedItem);
        reassigned.push(fixedItem);
        changed = true;
        continue;
      }

      if (!seenById.has(currentId)) {
        seenById.set(currentId, item);
        result.push(item);
      } else {
        const firstItem = seenById.get(currentId)!;
        const sameProduct =
          (firstItem.name || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase() &&
          (firstItem.batchNo || '').trim().toLowerCase() === (item.batchNo || '').trim().toLowerCase();

        if (sameProduct) {
          // Exact duplicate record with same ID, name, and batch -> skip duplicate
          changed = true;
        } else {
          // Different medicine that collided on the same ID (e.g., OBT-008 after deletion) -> assign a fresh unique ID
          maxSeq++;
          let newId = `OBT-${String(maxSeq).padStart(3, '0')}`;
          while (allExistingIds.has(newId) || seenById.has(newId)) {
            maxSeq++;
            newId = `OBT-${String(maxSeq).padStart(3, '0')}`;
          }
          const fixedItem: Medicine = {
            ...item,
            id: newId,
            barcode:
              item.barcode && item.barcode !== firstItem.barcode
                ? item.barcode
                : `899123456${String(maxSeq).padStart(3, '0')}`
          };
          seenById.set(newId, fixedItem);
          allExistingIds.add(newId);
          result.push(fixedItem);
          reassigned.push(fixedItem);
          changed = true;
        }
      }
    }

    return { items: result, changed, reassigned };
  };

  const [medicines, setMedicines] = useState<Medicine[]>(() => {
    const saved = demoGetItem('latisha_medicines');
    if (!saved) return [];
    try {
      const list: Medicine[] = JSON.parse(saved);
      const filtered = isDemoMode()
        ? list
        : list.filter((m) => !(m.batchNo?.startsWith('BTC-202') && /^OBT-0(0[1-9]|10)$/.test(m.id)));
      const normalized = normalizeUniqueMedicines(filtered);
      if (normalized.changed) {
        demoSetItem('latisha_medicines', JSON.stringify(normalized.items));
        if (!isDemoMode() && normalized.reassigned.length > 0) {
          normalized.reassigned.forEach((m) => {
            enqueueMedicineUpsert(m.id);
            syncMedicineToSupabase(m)
              .then((res) => {
                if (res.success) dequeueMedicineUpsert(m.id);
              })
              .catch(() => {});
          });
        }
      }
      return normalized.items;
    } catch (e) {
      return [];
    }
  });
  const [medicinesNeedsTableSetup, setMedicinesNeedsTableSetup] = useState(false);
  const medicinesRef = React.useRef<Medicine[]>(medicines);
  useEffect(() => {
    medicinesRef.current = medicines;
  }, [medicines]);
  const medicineChannelRef = React.useRef<ReturnType<typeof subscribeMedicinesRealtime>>(null);

  const syncMedicineWithTracking = async (
    med: Medicine
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    if (isDemoActive || isDemoMode()) {
      return { success: false, isDemo: true };
    }
    enqueueMedicineUpsert(med.id);
    const res = await syncMedicineToSupabase(med);
    if (res.success) {
      dequeueMedicineUpsert(med.id);
      setMedicinesNeedsTableSetup(false);
    } else if (res.needsTableSetup) {
      setMedicinesNeedsTableSetup(true);
    }
    return res;
  };

  const updateMedicineWithTracking = async (
    med: Medicine
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    if (isDemoActive || isDemoMode()) {
      return { success: true, isDemo: true };
    }
    enqueueMedicineUpsert(med.id);
    const res = await updateMedicineInSupabase(med);
    if (res.success) {
      dequeueMedicineUpsert(med.id);
      setMedicinesNeedsTableSetup(false);
    } else if (res.needsTableSetup) {
      setMedicinesNeedsTableSetup(true);
    }
    return res;
  };

  const deleteMedicineWithTracking = async (
    id: string
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    if (isDemoActive || isDemoMode()) {
      return { success: false, isDemo: true };
    }
    enqueueMedicineDelete(id);
    const res = await deleteMedicineFromSupabase(id);
    if (res.success) {
      dequeueMedicineDelete(id);
      setMedicinesNeedsTableSetup(false);
    } else if (res.needsTableSetup) {
      setMedicinesNeedsTableSetup(true);
    }
    return res;
  };

  const [patients, setPatients] = useState<Patient[]>(() => {
    const deletedSet = getDeletedIdsSet('patients');
    const saved = demoGetItem('latisha_patients');
    if (!saved) return [];
    try {
      const list: Patient[] = JSON.parse(saved);
      const validList = Array.isArray(list)
        ? list.filter((p) => {
            const pid = String(p?.id || '').trim();
            const dbId = String(p?.dbId || '').trim();
            return (pid || dbId) && !deletedSet.has(pid) && (!dbId || !deletedSet.has(dbId));
          })
        : [];
      if (isDemoMode()) return validList;
      // Remove AI dummy template patients (RM-001..RM-005 with template NIK 160100293029...), keep real patients
      const cleaned = validList.filter((p) => !(p.nik?.startsWith('160100293029') && /^RM-00[1-5]$/.test(p.id)));
      const deduped = deduplicatePatients(cleaned);
      const supaCfg = getSupabaseConfig();
      return supaCfg.url && supaCfg.key && deduped.length > 250 ? deduped.slice(0, 250) : deduped;
    } catch (e) {
      return [];
    }
  });

  const [doctors, setDoctors] = useState<Doctor[]>(() => {
    try {
      const savedDpj = demoGetItem('latisha_dpj_profile');
      if (savedDpj) {
        const parsed = JSON.parse(savedDpj);
        if (parsed.name) {
          const spec = parsed.specialization === 'Dokter Umum & Pemeriksaan Keluarga'
            ? 'Dokter Umum'
            : (parsed.specialization || INITIAL_DOCTORS[0].specialization);
          return INITIAL_DOCTORS.map((doc, idx) =>
            idx === 0
              ? {
                  ...doc,
                  name: parsed.name,
                  sip: parsed.sip || doc.sip,
                  specialization: spec,
                  schedule: parsed.schedule || doc.schedule
                }
              : doc
          );
        }
      }
    } catch {}
    return INITIAL_DOCTORS;
  });
  const [staffList, setStaffList] = useState<Staff[]>(() => {
    clearNonPendingDeletedTombstones('staff');
    const pendingDeleteSet = new Set(getPendingDeleteIds('staff'));
    const saved = demoGetItem('latisha_staff');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed
            .filter((st: Staff) => st?.id && !pendingDeleteSet.has(String(st.id).trim()))
            .map((st: Staff) => ensurePrimaryOwnerStaffRole(st).staff);
          if (valid.length > 0) return valid;
        }
      } catch {}
    }
    const defaultSeeds = isDemoMode() ? INITIAL_STAFF : [INITIAL_STAFF[0]];
    return defaultSeeds
      .filter((st) => st?.id && !pendingDeleteSet.has(st.id))
      .map((st) => ensurePrimaryOwnerStaffRole(st).staff);
  });
  const staffListRef = React.useRef<Staff[]>(staffList);
  useEffect(() => {
    staffListRef.current = staffList;
  }, [staffList]);
  const [isLoadingCloudStaff, setIsLoadingCloudStaff] = useState<boolean>(false);
  const [cloudStaffSyncError, setCloudStaffSyncError] = useState<string>('');
  const lastStaffCloudSyncAtRef = React.useRef<number>(0);

  const refreshStaffFromCloud = useCallback(
    async (options?: { silent?: boolean }): Promise<Staff[] | null> => {
      if (isDemoActive || isDemoMode()) return null;
      if (!options?.silent) {
        setIsLoadingCloudStaff(true);
      }
      try {
        const pendingDelStaff = getPendingDeleteIds('staff');
        if (pendingDelStaff.length > 0) {
          for (const delId of pendingDelStaff) {
            const delRes = await deleteStaffFromSupabase(delId).catch(() => ({ success: false }));
            if (delRes.success) {
              confirmCloudDeletes('staff', [delId]);
            }
          }
        }
        clearNonPendingDeletedTombstones('staff');

        const res = await fetchStaffFromSupabase();
        if (res.error && !res.data) {
          setCloudStaffSyncError(res.error);
          return null;
        }
        setCloudStaffSyncError('');
        lastStaffCloudSyncAtRef.current = Date.now();

        if (!res.data) return null;

        const remainingPendingDelSet = new Set(getPendingDeleteIds('staff'));
        const pendingSyncStaffSet = getPendingSyncIdsSet('staff');
        const remoteClean = res.data
          .filter((s) => s?.id && !remainingPendingDelSet.has(String(s.id).trim()))
          .map((s) => ensurePrimaryOwnerStaffRole(s).staff);

        // Replay genuinely unsynced local additions safely without overwriting other devices' IDs
        const mergedMap = new Map<string, Staff>();
        remoteClean.forEach((s) => mergedMap.set(s.id, s));

        const localPending = staffListRef.current.filter(
          (s) =>
            s?.id &&
            !remainingPendingDelSet.has(String(s.id).trim()) &&
            pendingSyncStaffSet.has(String(s.id).trim())
        );

        for (const pendingItem of localPending) {
          const safePending = ensurePrimaryOwnerStaffRole(pendingItem).staff;
          const existingSameName = Array.from(mergedMap.values()).find(
            (r) =>
              r.name.trim().toLowerCase().replace(/\s+/g, ' ') ===
              safePending.name.trim().toLowerCase().replace(/\s+/g, ' ')
          );
          if (existingSameName) {
            confirmCloudSync('staff', [safePending.id]);
            continue;
          }
          const collision = mergedMap.get(safePending.id);
          const targetItem = collision
            ? { ...safePending, id: generateNextStaffId(Array.from(mergedMap.values())) }
            : safePending;
          const pushRes = await syncStaffToSupabase(targetItem).catch(() => ({ success: false }));
          if (pushRes.success) {
            confirmCloudSync('staff', [safePending.id, targetItem.id]);
          }
          mergedMap.set(targetItem.id, targetItem);
        }

        const nextList = Array.from(mergedMap.values());
        if (nextList.length > 0) {
          markInitialCloudSyncCompleted('staff');
          saveStaffListLocally(nextList, { broadcast: false });
          setStaffList(nextList);
          return nextList;
        }
        return null;
      } catch (err: any) {
        setCloudStaffSyncError(err?.message || 'Gagal menyinkronkan data pegawai dengan Supabase');
        return null;
      } finally {
        if (!options?.silent) {
          setIsLoadingCloudStaff(false);
        }
      }
    },
    [isDemoActive]
  );

  const [icd10List, setIcd10List] = useState<ICD10Item[]>(() => {
    const saved = demoGetItem('latisha_icd10_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return INITIAL_ICD10_LIST;
  });

  const [loginNameInput, setLoginNameInput] = useState('');
  const [loginIdInput, setLoginIdInput] = useState('');
  const [loginErrorMessage, setLoginErrorMessage] = useState('');

  const [queue, setQueue] = useState<PatientQueue[]>(() => {
    const saved = demoGetItem('latisha_queue');
    if (!saved) return [];
    try {
      const list: PatientQueue[] = JSON.parse(saved);
      if (isDemoMode()) return list;
      return list.filter((q) => !(/^A-00[1-3]$/.test(q.nomor) && /^RM-00[1-3]$/.test(q.rmId)));
    } catch (e) {
      return [];
    }
  });

  const [onlineRegistrations, setOnlineRegistrations] = useState<OnlineRegistration[]>(() => {
    const saved = demoGetItem('latisha_online_registrations');
    if (!saved) return [];
    try {
      const list: OnlineRegistration[] = JSON.parse(saved);
      if (isDemoMode()) return list;
      return list.filter((r) => !['REG-2026-001', 'REG-2026-002'].includes(r.id));
    } catch (e) {
      return [];
    }
  });

  const [rmeRecords, setRmeRecords] = useState<RMERecord[]>(() => {
    const deletedSet = getDeletedIdsSet('rme_records');
    const saved = demoGetItem('latisha_rme_records');
    if (!saved) return [];
    try {
      const list: RMERecord[] = JSON.parse(saved);
      const validList = Array.isArray(list)
        ? list.filter((r) => r?.id && !deletedSet.has(String(r.id).trim()))
        : [];
      if (isDemoMode()) return validList;
      return validList.filter((r) => !isDemoRmeId(r.id));
    } catch (e) {
      return [];
    }
  });

  const [labRecords, setLabRecords] = useState<LabTestRecord[]>(() => {
    const deletedSet = getDeletedIdsSet('lab_records');
    const saved = demoGetItem('latisha_lab_records');
    if (!saved) return [];
    try {
      const list: LabTestRecord[] = JSON.parse(saved);
      const validList = Array.isArray(list)
        ? list.filter((r) => r?.id && !deletedSet.has(String(r.id).trim()))
        : [];
      if (isDemoMode()) return validList;
      return validList.filter((r) => !isDemoLabRecordId(r.id));
    } catch (e) {
      return [];
    }
  });
  const [labRecordsNeedsTableSetup, setLabRecordsNeedsTableSetup] = useState(false);

  const [prescriptions, setPrescriptions] = useState<EPrescription[]>(() => {
    const deletedSet = getDeletedIdsSet('prescriptions');
    const saved = demoGetItem('latisha_prescriptions');
    if (!saved) return [];
    try {
      const list: EPrescription[] = JSON.parse(saved);
      const validList = Array.isArray(list)
        ? list.filter((p) => p?.id && !deletedSet.has(String(p.id).trim()))
        : [];
      if (isDemoMode()) return validList;
      return validList.filter((p) => !isDemoPrescriptionId(p.id));
    } catch (e) {
      return [];
    }
  });

  const [activePrescriptionForPOS, setActivePrescriptionForPOS] = useState<EPrescription | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = demoGetItem('latisha_transactions');
    if (!saved) return [];
    try {
      const list: Transaction[] = JSON.parse(saved);
      const deletedSet = getDeletedIdsSet('transactions');
      if (isDemoMode()) return list.filter((t) => t?.id && !deletedSet.has(t.id));
      return list.filter(
        (t) =>
          t?.id &&
          !['TRX-1001', 'TRX-1002', 'FPJ-202610-1003', 'TRX-1004'].includes(t.id) &&
          !deletedSet.has(t.id)
      );
    } catch (e) {
      return [];
    }
  });
  const [transactionsNeedsTableSetup, setTransactionsNeedsTableSetup] = useState(false);

  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(() => {
    const deletedSet = getDeletedIdsSet('purchase_invoices');
    const saved = demoGetItem('latisha_purchase_invoices');
    if (!saved) return [];
    try {
      const list: PurchaseInvoice[] = JSON.parse(saved);
      const valid = Array.isArray(list)
        ? list.filter((i) => i?.id && !deletedSet.has(String(i.id).trim()))
        : [];
      if (isDemoMode()) return valid;
      return valid.filter((i) => !['INV-PBF-2026-001', 'INV-PBF-2026-002', 'INV-PBF-2026-003'].includes(i.id));
    } catch (e) {
      return [];
    }
  });

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    const saved = demoGetItem('latisha_purchase_orders');
    if (!saved) return [];
    try {
      const list: PurchaseOrder[] = JSON.parse(saved);
      const deletedSet = getDeletedIdsSet('purchase_orders');
      if (isDemoMode()) return list.filter((po) => po?.id && !deletedSet.has(po.id));
      return list.filter((po) => {
        if (!po?.id || isDemoPurchaseOrderId(po.id) || deletedSet.has(po.id)) return false;
        const isUntouchedLegacyDummy =
          po.id === 'PO-202611-001' &&
          !po.updatedAt &&
          po.items?.length === 2 &&
          po.items[0]?.id === 'POI-1' &&
          po.items[1]?.id === 'POI-2';
        return !isUntouchedLegacyDummy;
      });
    } catch (e) {
      return [];
    }
  });
  const [purchaseOrdersNeedsTableSetup, setPurchaseOrdersNeedsTableSetup] = useState(false);
  const purchaseOrderChannelRef = React.useRef<ReturnType<typeof subscribePurchaseOrdersRealtime>>(null);

  const [marketingCampaigns, setMarketingCampaigns] = useState<MarketingCampaign[]>(() => {
    const saved = demoGetItem('latisha_marketing_campaigns');
    if (!saved) return [];
    try {
      const parsed: MarketingCampaign[] = JSON.parse(saved);
      const deletedSet = getDeletedIdsSet('marketing_campaigns');
      if (isDemoMode()) return parsed.filter((c) => c?.id && !deletedSet.has(c.id));
      return parsed.filter(
        (c) => c?.id && !isDemoMarketingCampaignId(c.id) && !deletedSet.has(c.id)
      );
    } catch {
      return [];
    }
  });
  const [marketingNeedsTableSetup, setMarketingNeedsTableSetup] = useState(false);
  const marketingChannelRef = React.useRef<ReturnType<typeof subscribeMarketingCampaignsRealtime>>(null);

  const marketingInteractionRules = useMemo<DrugInteractionRecord[]>(() => {
    try {
      const saved = demoGetItem('latisha_interaksi_obat_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= INITIAL_INTERAKSI_OBAT.length) {
          return parsed;
        }
      }
    } catch {}
    return INITIAL_INTERAKSI_OBAT;
  }, []);

  const [stockMutations, setStockMutations] = useState<StockMutation[]>(() => {
    const saved = demoGetItem('latisha_stock_mutations');
    if (!saved) return [];
    try {
      const list: StockMutation[] = JSON.parse(saved);
      const deletedMutSet = getDeletedIdsSet('stock_mutations');
      if (isDemoMode()) return list;
      return list.filter(
        (m) => m?.id && !['MUT-01', 'MUT-02', 'MUT-03'].includes(m.id) && !deletedMutSet.has(m.id)
      );
    } catch (e) {
      return [];
    }
  });
  const [stockMutationsNeedsTableSetup, setStockMutationsNeedsTableSetup] = useState(false);
  const [stockMutationsNeedsBatchMigration, setStockMutationsNeedsBatchMigration] = useState(false);

  const mergeStockMutationWithBatchPreserve = (
    localMut: StockMutation | undefined,
    remoteMut: StockMutation
  ): StockMutation => {
    if (!localMut) return remoteMut;
    const remoteHasBatchDetails = Array.isArray(remoteMut.batchDetails) && remoteMut.batchDetails.length > 0;
    const localHasBatchDetails = Array.isArray(localMut.batchDetails) && localMut.batchDetails.length > 0;
    return {
      ...localMut,
      ...remoteMut,
      batchNo: remoteMut.batchNo || localMut.batchNo,
      expDate: remoteMut.expDate || localMut.expDate,
      batchDetails: remoteHasBatchDetails
        ? remoteMut.batchDetails
        : localHasBatchDetails
        ? localMut.batchDetails
        : remoteMut.batchDetails,
      hpp: remoteMut.hpp !== undefined ? remoteMut.hpp : localMut.hpp,
      nominalDiff: remoteMut.nominalDiff !== undefined ? remoteMut.nominalDiff : localMut.nominalDiff
    };
  };

  const [transfers, setTransfers] = useState<StockTransfer[]>(() => {
    const deletedSet = getDeletedIdsSet('branch_transfers');
    const saved = demoGetItem('latisha_transfers');
    if (!saved) return [];
    try {
      const list: StockTransfer[] = JSON.parse(saved);
      const valid = Array.isArray(list)
        ? list.filter((t) => t?.id && !deletedSet.has(String(t.id).trim()))
        : [];
      if (isDemoMode()) return valid;
      return valid.filter((t) => !isDemoTransferId(t.id));
    } catch (e) {
      return [];
    }
  });
  const [multiCabangNeedsTableSetup, setMultiCabangNeedsTableSetup] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = demoGetItem('latisha_audit_logs');
    if (!saved) return [];
    try {
      const list: AuditLog[] = JSON.parse(saved);
      const filtered = isDemoMode()
        ? list
        : list.filter((l) => !['LOG-001', 'LOG-002'].includes(l.id));
      return ensureUniqueAuditLogIds(filtered);
    } catch (e) {
      return [];
    }
  });

  const [feeConfig, setFeeConfig] = useState<FeeConfig>(() => {
    const saved = demoGetItem('latisha_fee_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_FEE_CONFIG;
      }
    }
    return DEFAULT_FEE_CONFIG;
  });
  const [feeConfigNeedsTableSetup, setFeeConfigNeedsTableSetup] = useState(false);
  const [feeLedger, setFeeLedger] = useState<StaffFeeLedgerEntry[]>(() => {
    const deletedLedgerSet = getDeletedIdsSet('fee_ledger');
    const deletedTrxSet = getDeletedIdsSet('transactions');
    const list = loadLocalFeeLedger().filter((e) => {
      if (!e?.id) return false;
      const eid = String(e.id).trim();
      const tid = String(e.transaction_id || '').trim();
      if (deletedLedgerSet.has(eid)) return false;
      if (tid && deletedTrxSet.has(tid)) return false;
      return true;
    });
    if (isDemoMode()) return list;
    return list.filter((e) => !isDemoFeeLedgerId(e.id));
  });
  const [feeLedgerNeedsTableSetup, setFeeLedgerNeedsTableSetup] = useState(false);

  const [mitraList, setMitraList] = useState<Mitra[]>(() => {
    const deletedSet = getDeletedIdsSet('mitra');
    const saved = demoGetItem('latisha_mitra');
    if (!saved) return [];
    try {
      const list: Mitra[] = JSON.parse(saved);
      const valid = Array.isArray(list)
        ? list.filter((m) => m?.id && !deletedSet.has(String(m.id).trim()))
        : [];
      if (isDemoMode()) return valid;
      return valid.filter((m) => !['MTR-001', 'MTR-002', 'MTR-003'].includes(m.id));
    } catch (e) {
      return [];
    }
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    const deletedSet = getDeletedIdsSet('suppliers');
    const saved = demoGetItem('latisha_suppliers');
    if (!saved) return [];
    try {
      const list: Supplier[] = JSON.parse(saved);
      const valid = Array.isArray(list)
        ? list.filter((s) => s?.id && !deletedSet.has(String(s.id).trim()))
        : [];
      if (isDemoMode()) return valid;
      return valid.filter((s) => !isDemoSupplierId(s.id));
    } catch (e) {
      return [];
    }
  });
  const [suppliersNeedsTableSetup, setSuppliersNeedsTableSetup] = useState(false);

  const [salesDiscounts, setSalesDiscounts] = useState<SalesDiscount[]>(() => {
    const deletedSet = getDeletedIdsSet('discounts_promos');
    const saved = demoGetItem('latisha_sales_discounts');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((d) => d?.id && !deletedSet.has(String(d.id).trim()))
        : [];
    } catch {
      return [];
    }
  });
  const [promoAds, setPromoAds] = useState<PromoAd[]>(() => {
    const deletedSet = getDeletedIdsSet('discounts_promos');
    const saved = demoGetItem('latisha_promo_ads');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((p) => p?.id && !deletedSet.has(String(p.id).trim()))
        : [];
    } catch {
      return [];
    }
  });
  const [promoDiscountNeedsTableSetup, setPromoDiscountNeedsTableSetup] = useState(false);

  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturnRecord[]>(() => {
    const saved = demoGetItem('latisha_purchase_returns');
    return saved ? JSON.parse(saved) : [];
  });

  const [opnameRecords, setOpnameRecords] = useState<StockOpnameRecord[]>(() => {
    const deletedSet = getDeletedIdsSet('opname_records');
    const saved = demoGetItem('latisha_stock_opname_records');
    if (saved) {
      try {
        const list: StockOpnameRecord[] = JSON.parse(saved);
        const validList = Array.isArray(list)
          ? list.filter((r) => r?.id && !deletedSet.has(String(r.id).trim()))
          : [];
        if (isDemoMode()) return validList;
        return validList.filter((r) => !isDemoOpnameRecordId(r.id));
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [opnameRecordsNeedsTableSetup, setOpnameRecordsNeedsTableSetup] = useState(false);
  const opnameChannelRef = React.useRef<ReturnType<typeof subscribeOpnameRecordsRealtime>>(null);

  const [cashierShifts, setCashierShifts] = useState<CashierShiftSession[]>(() => {
    try {
      if (!isDemoMode()) {
        const alreadyCleared = demoGetItem('latisha_cashier_shifts_cleared_v2');
        if (!alreadyCleared) {
          demoRemoveItem('latisha_cashier_shifts');
          demoSetItem('latisha_cashier_shifts_cleared_v2', 'true');
          return [];
        }
      }
      const saved = demoGetItem('latisha_cashier_shifts');
      if (saved) {
        const parsed: CashierShiftSession[] = JSON.parse(saved);
        const deletedSet = getDeletedIdsSet('cashier_shifts');
        if (isDemoMode()) return parsed.filter((s) => s?.id && !deletedSet.has(s.id));
        return parsed.filter((s) => s?.id && !isDemoCashierShiftId(s.id) && !deletedSet.has(s.id));
      }
    } catch (e) {
      return [];
    }
    return [];
  });
  const [cashierShiftsNeedsTableSetup, setCashierShiftsNeedsTableSetup] = useState(false);

  const [schedules, setSchedules] = useState<DutySchedule[]>(() => {
    try {
      const saved = demoGetItem('latisha_schedules');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((sch: DutySchedule) => ({
            ...sch,
            staffRole: normalizeStaffRole(sch.staffRole, 'Dokter')
          }));
        }
      }
      if (!isDemoMode()) {
        const supaCfg = getSupabaseConfig();
        if (supaCfg.url && supaCfg.key) {
          return [];
        }
      }
    } catch (e) {
      console.error(e);
    }
    return INITIAL_DUTY_SCHEDULES;
  });
  const schedulesRef = React.useRef<DutySchedule[]>(schedules);
  schedulesRef.current = schedules;
  const [schedulesNeedsTableSetup, setSchedulesNeedsTableSetup] = useState(false);

  const [morbidityReports, setMorbidityReports] = useState<MedicalMorbidityReportRecord[]>(() => {
    const deletedSet = getDeletedIdsSet('morbidity_reports');
    try {
      const saved = demoGetItem('latisha_morbidity_reports');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((r) => r?.id && !deletedSet.has(String(r.id).trim()));
        }
      }
    } catch {}
    return [];
  });
  const [rmeNeedsTableSetup, setRmeNeedsTableSetup] = useState(false);
  const [morbidityNeedsTableSetup, setMorbidityNeedsTableSetup] = useState(false);

  const [mitraOrders, setMitraOrders] = useState<MitraOrder[]>(() => {
    const deletedSet = getDeletedIdsSet('mitra_orders');
    try {
      const saved = demoGetItem('latisha_mitra_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((o) => o?.id && !deletedSet.has(String(o.id).trim()));
        }
      }
    } catch {}
    return [];
  });

  const [portalActivityLogs, setPortalActivityLogs] = useState<PortalActivityEvent[]>(() =>
    loadPortalActivityLogs()
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const [openedViaDirectCustomerUrl] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search || '';
    const pathname = window.location.pathname || '';
    const hash = window.location.hash || '';
    return (
      search.includes('view=portal-pelanggan') ||
      pathname.includes('/portal-pelanggan') ||
      hash.includes('portal-pelanggan') ||
      pathname.includes('/portal-mitra') ||
      search.includes('view=portal-mitra') ||
      search.includes('page=portal-mitra') ||
      hash.includes('portal-mitra') ||
      search.includes('view=daftar') ||
      search.includes('page=pendaftaran') ||
      pathname.includes('/pendaftaran') ||
      pathname.includes('/daftar-online')
    );
  });

  const [unifiedOrderRoom, setUnifiedOrderRoom] = useState<'REGULER' | 'MITRA'>(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const pathname = window.location.pathname || '';
      const hash = window.location.hash || '';
      const sp = new URLSearchParams(search);
      if (
        sp.get('room')?.toLowerCase() === 'mitra' ||
        pathname.includes('/portal-mitra') ||
        search.includes('view=portal-mitra') ||
        search.includes('page=portal-mitra') ||
        hash.includes('portal-mitra')
      ) {
        return 'MITRA';
      }
    }
    return 'REGULER';
  });

  const [showQrPortalModal, setShowQrPortalModal] = useState<boolean>(false);
  const [copiedStaffRegUrl, setCopiedStaffRegUrl] = useState<boolean>(false);
  const [showStaffRegistration, setShowStaffRegistration] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const pathname = window.location.pathname || '';
      const hash = window.location.hash || '';
      const sp = new URLSearchParams(search);
      return (
        sp.get('view')?.toLowerCase() === 'registrasi-pegawai' ||
        pathname.includes('/registrasi-pegawai') ||
        hash.includes('registrasi-pegawai')
      );
    }
    return false;
  });

  const [showPublicPortal, setShowPublicPortal] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const pathname = window.location.pathname || '';
      const sp = new URLSearchParams(search);
      return (
        sp.get('tab')?.toLowerCase() === 'pasien' ||
        search.includes('view=daftar') ||
        search.includes('page=pendaftaran') ||
        pathname.includes('/pendaftaran') ||
        pathname.includes('/daftar-online')
      );
    }
    return false;
  });

  const [showMitraPortal, setShowMitraPortal] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const pathname = window.location.pathname || '';
      const hash = window.location.hash || '';
      const sp = new URLSearchParams(search);
      return (
        search.includes('view=portal-pelanggan') ||
        pathname.includes('/portal-pelanggan') ||
        hash.includes('portal-pelanggan') ||
        pathname.includes('/portal-mitra') ||
        search.includes('view=portal-mitra') ||
        search.includes('page=portal-mitra') ||
        hash.includes('portal-mitra')
      );
    }
    return false;
  });

  // Super Admin Restricted Medicine Alarm State (Non-Clinic Psikotropik / Antibiotik Sales)
  const [acknowledgedRestrictedTrxIds, setAcknowledgedRestrictedTrxIds] = useState<string[]>(() => {
    try {
      const saved = demoGetItem('latisha_restricted_alarm_ack_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.map((id) => String(id).trim()).filter(Boolean);
      }
    } catch {}
    return [];
  });
  const acknowledgedRestrictedTrxIdsRef = React.useRef<string[]>(acknowledgedRestrictedTrxIds);
  useEffect(() => {
    acknowledgedRestrictedTrxIdsRef.current = acknowledgedRestrictedTrxIds;
  }, [acknowledgedRestrictedTrxIds]);

  const [restrictedSaleAlarms, setRestrictedSaleAlarms] = useState<RestrictedSaleAlarm[]>(() => {
    try {
      const savedAck = demoGetItem('latisha_restricted_alarm_ack_ids');
      const ackSet = new Set<string>(
        savedAck ? (JSON.parse(savedAck) as string[]).map((id) => String(id).trim()) : []
      );
      const saved = demoGetItem('latisha_restricted_sale_alarms');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((a: RestrictedSaleAlarm) => a?.trxId && !ackSet.has(String(a.trxId).trim()));
        }
      }
    } catch {}
    return [];
  });
  const [isAlarmAudioMuted, setIsAlarmAudioMuted] = useState<boolean>(false);
  const [inspectTransactionId, setInspectTransactionId] = useState<string | null>(null);
  const alarmChannelRef = React.useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    demoSetItem('latisha_restricted_sale_alarms', JSON.stringify(restrictedSaleAlarms));
  }, [isDemoActive, restrictedSaleAlarms]);

  useEffect(() => {
    demoSetItem('latisha_restricted_alarm_ack_ids', JSON.stringify(acknowledgedRestrictedTrxIds));
  }, [isDemoActive, acknowledgedRestrictedTrxIds]);

  const isRestrictedTrxAcknowledged = (trxId: string): boolean => {
    const normId = String(trxId || '').trim();
    if (!normId) return false;
    if (acknowledgedRestrictedTrxIdsRef.current.includes(normId)) return true;
    try {
      const saved = demoGetItem('latisha_restricted_alarm_ack_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.some((id) => String(id).trim() === normId)) {
          return true;
        }
      }
    } catch {}
    return false;
  };

  const evaluateAndEnqueueRestrictedAlarm = (trx: Transaction) => {
    if (!trx || !trx.id) return;
    const normTrxId = String(trx.id).trim();
    if (trx.status === 'Dibatalkan' || trx.status === 'Diretur') {
      setRestrictedSaleAlarms((prev) => prev.filter((a) => String(a.trxId).trim() !== normTrxId));
      return;
    }
    if (isRestrictedTrxAcknowledged(normTrxId)) return;

    const alarm = buildRestrictedSaleAlarm(trx, medicinesRef.current);
    if (!alarm) return;

    setIsAlarmAudioMuted(false);
    setRestrictedSaleAlarms((prev) => {
      if (isRestrictedTrxAcknowledged(normTrxId)) return prev;
      if (prev.some((a) => String(a.trxId).trim() === String(alarm.trxId).trim())) {
        return prev.map((a) => (String(a.trxId).trim() === String(alarm.trxId).trim() ? alarm : a));
      }
      return [alarm, ...prev];
    });

    try {
      alarmChannelRef.current?.postMessage({ type: 'ALARM_UPSERT', alarm });
    } catch {}
  };

  const handleAcknowledgeRestrictedAlarm = (alarm: RestrictedSaleAlarm, navigateToCheck = false) => {
    const normTrxId = String(alarm.trxId || '').trim();
    stopRestrictedSaleAlarmAudio();

    const nextAckIds = acknowledgedRestrictedTrxIdsRef.current.includes(normTrxId)
      ? acknowledgedRestrictedTrxIdsRef.current
      : [...acknowledgedRestrictedTrxIdsRef.current.slice(-499), normTrxId];
    acknowledgedRestrictedTrxIdsRef.current = nextAckIds;
    setAcknowledgedRestrictedTrxIds(nextAckIds);
    demoSetItem('latisha_restricted_alarm_ack_ids', JSON.stringify(nextAckIds));

    setRestrictedSaleAlarms((prev) => {
      const next = prev.filter(
        (a) => a.id !== alarm.id && String(a.trxId).trim() !== normTrxId
      );
      demoSetItem('latisha_restricted_sale_alarms', JSON.stringify(next));
      return next;
    });

    try {
      alarmChannelRef.current?.postMessage({
        type: 'ALARM_ACK',
        alarmId: alarm.id,
        trxId: normTrxId
      });
    } catch {}

    if (navigateToCheck) {
      addAuditLog(
        'Alarm Pengawasan Obat',
        `APJ / Owner mengecek transaksi #${normTrxId} (Akun ${alarm.cashierName} melakukan penjualan ${alarm.categoryLabel} jalur ${alarm.trxType}).`
      );
      setIsMobileMode(false);
      setActiveTab('pos-riwayat');
      setInspectTransactionId(normTrxId);
    }
  };

  // Auto-Save to localStorage (per-key dirty-tracked & debounced 350ms so 5000+ patients/medicines never block UI clicks)
  const prevPersistedRefs = React.useRef<Record<string, unknown>>({});
  const pendingPersistMapRef = React.useRef<Map<string, () => string>>(new Map());
  const persistTimerRef = React.useRef<number | null>(null);
  const prevPersistDemoFlagRef = React.useRef<boolean>(isDemoActive);
  const transactionsRef = React.useRef<Transaction[]>(transactions);
  transactionsRef.current = transactions;
  const prescriptionsRef = React.useRef<EPrescription[]>(prescriptions);
  prescriptionsRef.current = prescriptions;
  const rmeRecordsRef = React.useRef<RMERecord[]>(rmeRecords);
  rmeRecordsRef.current = rmeRecords;
  const opnameRecordsRef = React.useRef<StockOpnameRecord[]>(opnameRecords);
  opnameRecordsRef.current = opnameRecords;
  const cashierShiftsRef = React.useRef<CashierShiftSession[]>(cashierShifts);
  cashierShiftsRef.current = cashierShifts;
  const purchaseOrdersRef = React.useRef<PurchaseOrder[]>(purchaseOrders);
  purchaseOrdersRef.current = purchaseOrders;
  const marketingCampaignsRef = React.useRef<MarketingCampaign[]>(marketingCampaigns);
  marketingCampaignsRef.current = marketingCampaigns;
  const feeLedgerRef = React.useRef<StaffFeeLedgerEntry[]>(feeLedger);
  feeLedgerRef.current = feeLedger;
  const labRecordsRef = React.useRef<LabTestRecord[]>(labRecords);
  labRecordsRef.current = labRecords;
  const stockMutationsRef = React.useRef<StockMutation[]>(stockMutations);
  stockMutationsRef.current = stockMutations;
  const morbidityReportsRef = React.useRef<MedicalMorbidityReportRecord[]>(morbidityReports);
  morbidityReportsRef.current = morbidityReports;
  const suppliersRef = React.useRef<Supplier[]>(suppliers);
  suppliersRef.current = suppliers;
  const mitraListRef = React.useRef<Mitra[]>(mitraList);
  mitraListRef.current = mitraList;
  const branchesRef = React.useRef<Branch[]>(branches);
  branchesRef.current = branches;
  const transfersRef = React.useRef<StockTransfer[]>(transfers);
  transfersRef.current = transfers;
  const purchaseInvoicesRef = React.useRef<PurchaseInvoice[]>(purchaseInvoices);
  purchaseInvoicesRef.current = purchaseInvoices;
  const salesDiscountsRef = React.useRef<SalesDiscount[]>(salesDiscounts);
  salesDiscountsRef.current = salesDiscounts;
  const promoAdsRef = React.useRef<PromoAd[]>(promoAds);
  promoAdsRef.current = promoAds;
  const mitraOrdersRef = React.useRef<MitraOrder[]>(mitraOrders);
  mitraOrdersRef.current = mitraOrders;
  const transactionsAuthoritativeRef = React.useRef<boolean>(false);

  const persistTransactionsNow = useCallback((nextList: Transaction[]) => {
    transactionsRef.current = nextList;
    prevPersistedRefs.current['latisha_transactions'] = nextList;
    pendingPersistMapRef.current.delete('latisha_transactions');
    try {
      demoSetItem('latisha_transactions', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_transactions:', err);
    }
  }, []);

  const persistPrescriptionsNow = useCallback((nextList: EPrescription[]) => {
    prescriptionsRef.current = nextList;
    prevPersistedRefs.current['latisha_prescriptions'] = nextList;
    pendingPersistMapRef.current.delete('latisha_prescriptions');
    try {
      demoSetItem('latisha_prescriptions', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_prescriptions:', err);
    }
  }, []);

  const persistRmeNow = useCallback((nextList: RMERecord[]) => {
    rmeRecordsRef.current = nextList;
    prevPersistedRefs.current['latisha_rme_records'] = nextList;
    pendingPersistMapRef.current.delete('latisha_rme_records');
    try {
      demoSetItem('latisha_rme_records', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_rme_records:', err);
    }
  }, []);

  const persistOpnameNow = useCallback((nextList: StockOpnameRecord[]) => {
    opnameRecordsRef.current = nextList;
    prevPersistedRefs.current['latisha_stock_opname_records'] = nextList;
    pendingPersistMapRef.current.delete('latisha_stock_opname_records');
    try {
      demoSetItem('latisha_stock_opname_records', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_stock_opname_records:', err);
    }
  }, []);

  const persistCashierShiftsNow = useCallback((nextList: CashierShiftSession[]) => {
    cashierShiftsRef.current = nextList;
    prevPersistedRefs.current['latisha_cashier_shifts'] = nextList;
    pendingPersistMapRef.current.delete('latisha_cashier_shifts');
    try {
      demoSetItem('latisha_cashier_shifts', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_cashier_shifts:', err);
    }
  }, []);

  const persistPurchaseOrdersNow = useCallback((nextList: PurchaseOrder[]) => {
    purchaseOrdersRef.current = nextList;
    prevPersistedRefs.current['latisha_purchase_orders'] = nextList;
    pendingPersistMapRef.current.delete('latisha_purchase_orders');
    try {
      demoSetItem('latisha_purchase_orders', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_purchase_orders:', err);
    }
  }, []);

  const persistMarketingCampaignsNow = useCallback((nextList: MarketingCampaign[]) => {
    marketingCampaignsRef.current = nextList;
    prevPersistedRefs.current['latisha_marketing_campaigns'] = nextList;
    pendingPersistMapRef.current.delete('latisha_marketing_campaigns');
    try {
      demoSetItem('latisha_marketing_campaigns', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_marketing_campaigns:', err);
    }
  }, []);

  const persistFeeLedgerNow = useCallback((nextList: StaffFeeLedgerEntry[]) => {
    feeLedgerRef.current = nextList;
    prevPersistedRefs.current['latisha_fee_ledger'] = nextList;
    pendingPersistMapRef.current.delete('latisha_fee_ledger');
    saveLocalFeeLedger(nextList);
  }, []);

  const persistLabRecordsNow = useCallback((nextList: LabTestRecord[]) => {
    labRecordsRef.current = nextList;
    prevPersistedRefs.current['latisha_lab_records'] = nextList;
    pendingPersistMapRef.current.delete('latisha_lab_records');
    try {
      demoSetItem('latisha_lab_records', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_lab_records:', err);
    }
  }, []);

  const persistStockMutationsNow = useCallback((nextList: StockMutation[]) => {
    stockMutationsRef.current = nextList;
    prevPersistedRefs.current['latisha_stock_mutations'] = nextList;
    pendingPersistMapRef.current.delete('latisha_stock_mutations');
    try {
      demoSetItem('latisha_stock_mutations', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_stock_mutations:', err);
    }
  }, []);

  const persistMorbidityReportsNow = useCallback((nextList: MedicalMorbidityReportRecord[]) => {
    morbidityReportsRef.current = nextList;
    prevPersistedRefs.current['latisha_morbidity_reports'] = nextList;
    pendingPersistMapRef.current.delete('latisha_morbidity_reports');
    try {
      demoSetItem('latisha_morbidity_reports', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_morbidity_reports:', err);
    }
  }, []);

  const persistSuppliersNow = useCallback((nextList: Supplier[]) => {
    suppliersRef.current = nextList;
    prevPersistedRefs.current['latisha_suppliers'] = nextList;
    pendingPersistMapRef.current.delete('latisha_suppliers');
    try {
      demoSetItem('latisha_suppliers', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_suppliers:', err);
    }
  }, []);

  const persistMitraListNow = useCallback((nextList: Mitra[]) => {
    mitraListRef.current = nextList;
    prevPersistedRefs.current['latisha_mitra'] = nextList;
    pendingPersistMapRef.current.delete('latisha_mitra');
    try {
      demoSetItem('latisha_mitra', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_mitra:', err);
    }
  }, []);

  const persistPurchaseInvoicesNow = useCallback((nextList: PurchaseInvoice[]) => {
    purchaseInvoicesRef.current = nextList;
    prevPersistedRefs.current['latisha_purchase_invoices'] = nextList;
    pendingPersistMapRef.current.delete('latisha_purchase_invoices');
    try {
      demoSetItem('latisha_purchase_invoices', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_purchase_invoices:', err);
    }
  }, []);

  const persistMitraOrdersNow = useCallback((nextList: MitraOrder[]) => {
    mitraOrdersRef.current = nextList;
    prevPersistedRefs.current['latisha_mitra_orders'] = nextList;
    pendingPersistMapRef.current.delete('latisha_mitra_orders');
    try {
      demoSetItem('latisha_mitra_orders', JSON.stringify(nextList));
    } catch (err) {
      console.warn('Immediate persist failed for latisha_mitra_orders:', err);
    }
  }, []);

  const pruneFeeLedgerWithTransactions = useCallback(
    (txList: Transaction[], isAuthoritative: boolean) => {
      const deletedTrxSet = getDeletedIdsSet('transactions');
      const deletedFeeSet = getDeletedIdsSet('fee_ledger');
      const pendingSyncTrxSet = getPendingSyncIdsSet('transactions');
      const validTrxIds = new Set(
        (txList || [])
          .filter((t) => t?.id && !deletedTrxSet.has(String(t.id).trim()))
          .map((t) => String(t.id).trim())
      );

      const removedEntries: StaffFeeLedgerEntry[] = [];
      const currentLedger = feeLedgerRef.current || [];
      const nextLedger = currentLedger.filter((entry) => {
        if (!entry?.id) return false;
        const cleanId = String(entry.id).trim();
        const cleanTrxId = String(entry.transaction_id || '').trim();
        if (deletedFeeSet.has(cleanId) || (cleanTrxId && deletedTrxSet.has(cleanTrxId))) {
          removedEntries.push(entry);
          return false;
        }
        if (
          isAuthoritative &&
          (!cleanTrxId || (!validTrxIds.has(cleanTrxId) && !pendingSyncTrxSet.has(cleanTrxId)))
        ) {
          removedEntries.push(entry);
          return false;
        }
        return true;
      });

      if (removedEntries.length > 0) {
        setFeeLedger(nextLedger);
        persistFeeLedgerNow(nextLedger);
        const orphanIds = removedEntries.map((e) => String(e.id).trim()).filter(Boolean);
        const orphanTrxIds = Array.from(
          new Set(removedEntries.map((e) => String(e.transaction_id || '').trim()).filter(Boolean))
        );
        if (orphanIds.length > 0) {
          markIdsDeleted('fee_ledger', orphanIds);
        }
        if (orphanTrxIds.length > 0) {
          addPendingDeleteFeeLedgerTrxIds(orphanTrxIds);
        }
        if (!isDemoActive && !isDemoMode()) {
          if (orphanTrxIds.length > 0) {
            deleteFeeLedgerByTransactionsInSupabase(orphanTrxIds)
              .then((res) => {
                if (res.success) {
                  confirmFeeLedgerTrxDeletes(orphanTrxIds);
                  confirmCloudDeletes('fee_ledger', orphanIds);
                } else if (res.needsTableSetup) {
                  setFeeLedgerNeedsTableSetup(true);
                }
              })
              .catch(() => {});
          } else if (orphanIds.length > 0) {
            deleteFeeLedgerByIdsInSupabase(orphanIds)
              .then((res) => {
                if (res.success) confirmCloudDeletes('fee_ledger', orphanIds);
                else if (res.needsTableSetup) setFeeLedgerNeedsTableSetup(true);
              })
              .catch(() => {});
          }
        }
      }
    },
    [isDemoActive, persistFeeLedgerNow]
  );

  useEffect(() => {
    const demoModeSwitched = prevPersistDemoFlagRef.current !== isDemoActive;
    if (demoModeSwitched) {
      prevPersistDemoFlagRef.current = isDemoActive;
      prevPersistedRefs.current = {};
    }

    const supaCfg = getSupabaseConfig();
    const hasSupabase = Boolean(supaCfg.url && supaCfg.key) && !isDemoActive;

    const entries: Array<[string, unknown, () => string]> = [
      ['latisha_medicines', medicines, () => JSON.stringify(medicines)],
      [
        'latisha_patients',
        patients,
        () => JSON.stringify(hasSupabase && patients.length > 250 ? patients.slice(0, 250) : patients)
      ],
      ['latisha_queue', queue, () => JSON.stringify(queue)],
      ['latisha_online_registrations', onlineRegistrations, () => JSON.stringify(onlineRegistrations)],
      ['latisha_rme_records', rmeRecords, () => JSON.stringify(rmeRecords)],
      ['latisha_prescriptions', prescriptions, () => JSON.stringify(prescriptions)],
      ['latisha_transactions', transactions, () => JSON.stringify(transactions)],
      ['latisha_purchase_invoices', purchaseInvoices, () => JSON.stringify(purchaseInvoices)],
      ['latisha_purchase_orders', purchaseOrders, () => JSON.stringify(purchaseOrders)],
      ['latisha_stock_mutations', stockMutations, () => JSON.stringify(stockMutations)],
      ['latisha_transfers', transfers, () => JSON.stringify(transfers)],
      ['latisha_audit_logs', auditLogs, () => JSON.stringify(auditLogs.slice(0, 300))],
      ['latisha_branches', branches, () => JSON.stringify(branches)],
      ['latisha_fee_config', feeConfig, () => JSON.stringify(feeConfig)],
      ['latisha_fee_ledger', feeLedger, () => JSON.stringify(feeLedger)],
      ['latisha_mitra', mitraList, () => JSON.stringify(mitraList)],
      ['latisha_suppliers', suppliers, () => JSON.stringify(suppliers)],
      ['latisha_purchase_returns', purchaseReturns, () => JSON.stringify(purchaseReturns)],
      ['latisha_lab_records', labRecords, () => JSON.stringify(labRecords)],
      ['latisha_stock_opname_records', opnameRecords, () => JSON.stringify(opnameRecords)],
      ['latisha_staff', staffList, () => JSON.stringify(staffList)],
      ['latisha_schedules', schedules, () => JSON.stringify(schedules)],
      ['latisha_morbidity_reports', morbidityReports, () => JSON.stringify(morbidityReports)],
      ['latisha_role_permissions', rolePermissions, () => JSON.stringify(rolePermissions)],
      ['latisha_cashier_shifts', cashierShifts, () => JSON.stringify(cashierShifts)],
      ['latisha_icd10_list', icd10List, () => JSON.stringify(icd10List)],
      ['latisha_mitra_orders', mitraOrders, () => JSON.stringify(mitraOrders)],
      ['latisha_sales_discounts', salesDiscounts, () => JSON.stringify(salesDiscounts)],
      ['latisha_promo_ads', promoAds, () => JSON.stringify(promoAds)],
      ['latisha_marketing_campaigns', marketingCampaigns, () => JSON.stringify(marketingCampaigns)],
      ['latisha_active_staff_id', activeStaffId, () => activeStaffId],
      ['latisha_active_role', activeRole, () => activeRole],
      ['latisha_user_name', userName, () => userName]
    ];

    let queuedAny = false;
    for (const [key, val, serialize] of entries) {
      if (!Object.is(prevPersistedRefs.current[key], val)) {
        prevPersistedRefs.current[key] = val;
        pendingPersistMapRef.current.set(key, serialize);
        queuedAny = true;
      }
    }

    if (!queuedAny) return;

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      const flushChunk = () => {
        persistTimerRef.current = null;
        let processed = 0;
        while (pendingPersistMapRef.current.size > 0 && processed < 2) {
          const nextIter = pendingPersistMapRef.current.entries().next();
          if (nextIter.done) break;
          const [key, serialize] = nextIter.value;
          pendingPersistMapRef.current.delete(key);
          try {
            demoSetItem(key, serialize());
          } catch (err) {
            console.warn(`Local cache write skipped for ${key}:`, err);
          }
          processed++;
        }
        if (pendingPersistMapRef.current.size > 0) {
          persistTimerRef.current = window.setTimeout(flushChunk, 16);
        }
      };
      flushChunk();
    }, 350);
  }, [
    isDemoActive,
    medicines,
    patients,
    queue,
    onlineRegistrations,
    rmeRecords,
    labRecords,
    prescriptions,
    transactions,
    purchaseInvoices,
    purchaseOrders,
    stockMutations,
    transfers,
    auditLogs,
    branches,
    feeConfig,
    feeLedger,
    mitraList,
    suppliers,
    purchaseReturns,
    opnameRecords,
    staffList,
    schedules,
    morbidityReports,
    rolePermissions,
    cashierShifts,
    icd10List,
    mitraOrders,
    salesDiscounts,
    promoAds,
    activeStaffId,
    activeRole,
    userName
  ]);

  useEffect(() => {
    const flushPendingStorage = () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const pending = Array.from(pendingPersistMapRef.current.entries());
      pendingPersistMapRef.current.clear();
      for (const [key, serialize] of pending) {
        try {
          demoSetItem(key, serialize());
        } catch {}
      }
    };
    window.addEventListener('beforeunload', flushPendingStorage);
    return () => {
      window.removeEventListener('beforeunload', flushPendingStorage);
      flushPendingStorage();
    };
  }, []);

  // Cross-tab BroadcastChannel sync for Portal Order Mandiri Mitra (isolated channel in Demo Mode)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_orders_channel'));
    bc.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'ORDER_UPSERT' && msg.order) {
        setMitraOrders((prev) => {
          const exists = prev.some((o) => o.id === msg.order.id);
          if (exists) return prev.map((o) => (o.id === msg.order.id ? msg.order : o));
          return [msg.order, ...prev];
        });
      } else if (msg.type === 'ORDER_DELETE' && msg.id) {
        setMitraOrders((prev) => prev.filter((o) => o.id !== msg.id));
      }
    };

    const bcMitra = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_channel'));
    bcMitra.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if ((msg.type === 'MITRA_ADD' || msg.type === 'MITRA_UPDATE') && msg.mitra) {
        setMitraList((prev) => {
          const exists = prev.some((m) => m.id === msg.mitra.id);
          if (exists) return prev.map((m) => (m.id === msg.mitra.id ? msg.mitra : m));
          return [msg.mitra, ...prev];
        });
      } else if (msg.type === 'MITRA_DELETE' && msg.id) {
        setMitraList((prev) => prev.filter((m) => m.id !== msg.id));
      }
    };

    const bcAlarm = new BroadcastChannel(getDemoBroadcastChannelName('latisha_restricted_alarm_channel'));
    alarmChannelRef.current = bcAlarm;
    bcAlarm.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'ALARM_UPSERT' && msg.alarm) {
        const incoming: RestrictedSaleAlarm = msg.alarm;
        const normIncomingId = String(incoming.trxId || '').trim();
        if (isRestrictedTrxAcknowledged(normIncomingId)) return;
        setIsAlarmAudioMuted(false);
        setRestrictedSaleAlarms((prev) => {
          if (isRestrictedTrxAcknowledged(normIncomingId)) return prev;
          if (prev.some((a) => String(a.trxId).trim() === normIncomingId)) {
            return prev.map((a) => (String(a.trxId).trim() === normIncomingId ? incoming : a));
          }
          return [incoming, ...prev];
        });
      } else if (msg.type === 'ALARM_ACK' && msg.trxId) {
        const normAckId = String(msg.trxId).trim();
        stopRestrictedSaleAlarmAudio();
        const nextAckIds = acknowledgedRestrictedTrxIdsRef.current.includes(normAckId)
          ? acknowledgedRestrictedTrxIdsRef.current
          : [...acknowledgedRestrictedTrxIdsRef.current.slice(-499), normAckId];
        acknowledgedRestrictedTrxIdsRef.current = nextAckIds;
        setAcknowledgedRestrictedTrxIds(nextAckIds);
        setRestrictedSaleAlarms((prev) =>
          prev.filter((a) => a.id !== msg.alarmId && String(a.trxId).trim() !== normAckId)
        );
      }
    };

    const ackStorageKey = getScopedStorageKey('latisha_restricted_alarm_ack_ids');
    const alarmsStorageKey = getScopedStorageKey('latisha_restricted_sale_alarms');
    const portalActivityStorageKey = getScopedStorageKey(PORTAL_ACTIVITY_STORAGE_KEY);

    const bcPortalActivity = new BroadcastChannel(
      getDemoBroadcastChannelName(PORTAL_ACTIVITY_CHANNEL_NAME)
    );
    bcPortalActivity.onmessage = (event) => {
      const msg = event.data;
      if (msg?.type === 'PORTAL_ACTIVITY_ADD' && msg.event) {
        const incomingEvent: PortalActivityEvent = msg.event;
        setPortalActivityLogs((prev) => {
          if (prev.some((item) => item.id === incomingEvent.id)) return prev;
          return [incomingEvent, ...prev].slice(0, 1500);
        });
      }
    };

    const handleAlarmStorageSync = (ev: StorageEvent) => {
      if (!ev.key) return;
      if (ev.key === ackStorageKey && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          if (Array.isArray(parsed)) {
            const cleanAck = parsed.map((id) => String(id).trim()).filter(Boolean);
            acknowledgedRestrictedTrxIdsRef.current = cleanAck;
            setAcknowledgedRestrictedTrxIds(cleanAck);
            const ackSet = new Set(cleanAck);
            setRestrictedSaleAlarms((prev) => {
              const filtered = prev.filter((a) => !ackSet.has(String(a.trxId).trim()));
              if (filtered.length === 0) stopRestrictedSaleAlarmAudio();
              return filtered;
            });
          }
        } catch {}
      } else if (ev.key === alarmsStorageKey && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          if (Array.isArray(parsed)) {
            const ackSet = new Set(acknowledgedRestrictedTrxIdsRef.current);
            const filtered = parsed.filter(
              (a: RestrictedSaleAlarm) => a?.trxId && !ackSet.has(String(a.trxId).trim())
            );
            setRestrictedSaleAlarms(filtered);
            if (filtered.length === 0) stopRestrictedSaleAlarmAudio();
          }
        } catch {}
      } else if (ev.key === portalActivityStorageKey && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          if (Array.isArray(parsed)) {
            setPortalActivityLogs(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleAlarmStorageSync);

    return () => {
      bc.close();
      bcMitra.close();
      bcAlarm.close();
      bcPortalActivity.close();
      alarmChannelRef.current = null;
      window.removeEventListener('storage', handleAlarmStorageSync);
    };
  }, [isDemoActive]);

  // APJ / Owner Audio Alarm Loop (runs in ALL app modes when logged in as APJ / Owner and an alarm is active)
  const isSuperAdminLoggedIn = isLoggedIn && isOwnerAdminRole(activeRole);
  const activeRestrictedSaleAlarms = useMemo(
    () =>
      restrictedSaleAlarms.filter(
        (a) => a?.trxId && !acknowledgedRestrictedTrxIds.includes(String(a.trxId).trim())
      ),
    [restrictedSaleAlarms, acknowledgedRestrictedTrxIds]
  );
  const latestRestrictedAlarm = activeRestrictedSaleAlarms[0] || null;
  const shouldSoundSuperAdminAlarm =
    isSuperAdminLoggedIn && Boolean(latestRestrictedAlarm) && !isAlarmAudioMuted;

  useEffect(() => {
    if (!shouldSoundSuperAdminAlarm || !latestRestrictedAlarm) {
      stopRestrictedSaleAlarmAudio();
      return;
    }

    let effectCancelled = false;
    const targetTrxId = String(latestRestrictedAlarm.trxId).trim();
    const spokenText = `Peringatan! Akun ${latestRestrictedAlarm.cashierName} melakukan penjualan ${latestRestrictedAlarm.categoryLabel} di luar jalur pasien klinik.`;

    const triggerSound = () => {
      if (effectCancelled || acknowledgedRestrictedTrxIdsRef.current.includes(targetTrxId)) {
        stopRestrictedSaleAlarmAudio();
        return;
      }
      playRestrictedSaleAlarmAudio(spokenText).catch(() => {});
    };

    triggerSound();
    const repeatInterval = window.setInterval(triggerSound, 15000);

    const handleUserUnlock = (ev: Event) => {
      const targetEl = ev.target as HTMLElement | null;
      // Jangan putar ulang suara jika interaksi berasal dari tombol banner alarm (mis. "Silahkan Cek")
      if (targetEl && targetEl.closest('[data-restricted-alarm-banner="true"]')) {
        return;
      }
      triggerSound();
    };
    window.addEventListener('pointerdown', handleUserUnlock, { once: true });
    window.addEventListener('keydown', handleUserUnlock, { once: true });

    return () => {
      effectCancelled = true;
      window.clearInterval(repeatInterval);
      window.removeEventListener('pointerdown', handleUserUnlock);
      window.removeEventListener('keydown', handleUserUnlock);
      stopRestrictedSaleAlarmAudio();
    };
  }, [
    shouldSoundSuperAdminAlarm,
    latestRestrictedAlarm?.id,
    latestRestrictedAlarm?.trxId,
    latestRestrictedAlarm?.cashierName,
    latestRestrictedAlarm?.categoryLabel
  ]);

  // Jadwal Backup Otomatis Harian (JSON ke folder 'Backups' pada Browser Storage saat APJ / Owner login pertama kali)
  const [autoBackupToast, setAutoBackupToast] = useState<{
    type: 'success' | 'error';
    file?: StoredBackupFileMeta;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isSuperAdminLoggedIn) return;
    let cancelled = false;
    let dismissTimer: number | null = null;

    const startTimer = window.setTimeout(() => {
      runAutoDailyBackupIfNeeded({
        triggeredBy: userName || 'APJ / Owner'
      }).then((res) => {
        if (cancelled || !res.executed) return;
        if (res.success && res.file) {
          addAuditLog(
            'Auto Backup Harian',
            `Backup otomatis harian berhasil disimpan ke folder browser storage "${BACKUPS_FOLDER_NAME}/${res.file.fileName}" (${formatBackupBytes(res.file.sizeBytes)}, ${res.file.summary.tableCount} tabel).`
          );
          setAutoBackupToast({
            type: 'success',
            file: res.file,
            message: `Backup otomatis harian disimpan ke folder "${BACKUPS_FOLDER_NAME}/${res.file.fileName}" (${formatBackupBytes(res.file.sizeBytes)}).`
          });
          dismissTimer = window.setTimeout(() => {
            setAutoBackupToast(null);
          }, 12000);
        } else if (!res.success) {
          addAuditLog(
            'Auto Backup Harian',
            `Backup otomatis harian gagal: ${res.error || 'Kesalahan penyimpanan browser'}`
          );
          setAutoBackupToast({
            type: 'error',
            message: `Backup otomatis harian gagal: ${res.error || 'Tidak dapat menulis ke folder Backups pada browser storage.'}`
          });
        }
      });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
    };
  }, [isSuperAdminLoggedIn, isDemoActive]);

  // Two-way Supabase Real-time Integration (STRICTLY DISABLED during Demo Sandbox Mode)
  useEffect(() => {
    if (isDemoActive || isDemoMode()) return;
    const client = getSupabaseClient();
    if (!client) return;

    const isPortalView = showMitraPortal || showPublicPortal;
    const isLoginOrRegView = (!isLoggedIn || showStaffRegistration) && !isPortalView;
    const isFullAppView = isLoggedIn && !isPortalView && !showStaffRegistration;

    let effectDisposed = false;
    const waveTimers: number[] = [];

    let cancelledPatientsEffect = false;
    let cancelledStaffEffect = false;
    let cancelledMitraEffect = false;
    let cancelledMitraOrderEffect = false;
    let cancelledFeeConfigEffect = false;
    let cancelledFeeLedgerEffect = false;
    let cancelledPromoDiscountEffect = false;
    let cancelledRmeEffect = false;
    let cancelledMorbidityEffect = false;
    let cancelledTransactionEffect = false;
    let cancelledStockCardEffect = false;
    let cancelledLabEffect = false;
    let cancelledOpnameEffect = false;
    let cancelledScheduleEffect = false;
    let cancelledMedicineEffect = false;
    let cancelledSupplierEffect = false;
    let cancelledBranchEffect = false;
    let cancelledShiftEffect = false;
    let cancelledPurchaseInvoiceEffect = false;
    let cancelledPurchaseOrderEffect = false;
    let cancelledMarketingEffect = false;
    let cancelledPrescriptionEffect = false;

    let patientBatchTimer: number | null = null;
    let patientChannel: ReturnType<typeof subscribePatientsRealtime> = null;
    let onlineRegChannel: ReturnType<typeof subscribeOnlineRegistrationsRealtime> = null;
    let icdChannel: ReturnType<typeof subscribeICD10Realtime> = null;
    let staffChannel: ReturnType<typeof subscribeStaffRealtime> = null;
    let rmeChannel: ReturnType<typeof subscribeRmeRealtime> = null;
    let morbidityChannel: ReturnType<typeof subscribeMorbidityReportsRealtime> = null;
    let transactionChannel: ReturnType<typeof subscribeTransactionsRealtime> = null;
    let stockCardChannel: ReturnType<typeof subscribeStockMutationsRealtime> = null;
    let labChannel: ReturnType<typeof subscribeLabRecordsRealtime> = null;
    let opnameChannel: ReturnType<typeof subscribeOpnameRecordsRealtime> = null;
    let scheduleChannel: ReturnType<typeof subscribeSchedulesRealtime> = null;
    let medicineChannel: ReturnType<typeof subscribeMedicinesRealtime> = null;
    let mitraChannel: ReturnType<typeof subscribeMitraRealtime> = null;
    let mitraOrderChannel: ReturnType<typeof subscribeMitraOrdersRealtime> = null;
    let supplierChannel: any = null;
    let branchChannel: ReturnType<typeof subscribeBranchesRealtime> = null;
    let branchTransferChannel: ReturnType<typeof subscribeBranchTransfersRealtime> = null;
    let cashierShiftChannel: ReturnType<typeof subscribeCashierShiftsRealtime> = null;
    let purchaseInvoiceChannel: ReturnType<typeof subscribePurchaseInvoicesRealtime> = null;
    let purchaseOrderChannel: ReturnType<typeof subscribePurchaseOrdersRealtime> = null;
    let marketingChannel: ReturnType<typeof subscribeMarketingCampaignsRealtime> = null;
    let facilityProfileChannel: ReturnType<typeof subscribeFacilityProfileRealtime> = null;
    let prescriptionChannel: ReturnType<typeof subscribePrescriptionsRealtime> = null;
    let promoDiscountChannel: ReturnType<typeof subscribeDiscountsPromosRealtime> = null;
    let feeConfigChannel: ReturnType<typeof subscribeFeeConfigRealtime> = null;
    let feeLedgerChannel: ReturnType<typeof subscribeFeeLedgerRealtime> = null;

    // Helper sinkronisasi state aplikasi (Cabang, Dokter, APJ/DPJ Staff, UserName) dari profil terbaru
    const syncAppStatesFromProfiles = () => {
      try {
        const parsedPharm = getSavedPharmacyProfile();
        if (parsedPharm.name) {
          const formattedAddr = formatPharmacyAddress(parsedPharm);
          setBranches((prev) =>
            prev.map((b, idx) =>
              idx === 0
                ? {
                    ...b,
                    name: parsedPharm.name,
                    address: formattedAddr,
                    phone: parsedPharm.phone,
                    siaNumber: parsedPharm.sia
                  }
                : b
            )
          );
          setCurrentBranch((prev) => ({
            ...prev,
            name: parsedPharm.name,
            address: formattedAddr,
            phone: parsedPharm.phone,
            siaNumber: parsedPharm.sia
          }));
        }

        const parsedApj = getSavedAPJProfile();
        if (parsedApj.name) {
          setStaffList((prev) =>
            prev.map((s) =>
              s.id === 'STF-001' || s.id === 'STF-01'
                ? { ...s, name: parsedApj.name, phone: parsedApj.phone || s.phone }
                : s
            )
          );
          if (activeStaffId === 'STF-001' || activeStaffId === 'STF-01') {
            setUserName(parsedApj.name);
          }
        }

        const parsedDpj = getSavedDPJProfile();
        if (parsedDpj.name) {
          setDoctors((prev) =>
            prev.map((doc, idx) =>
              idx === 0
                ? {
                    ...doc,
                    name: parsedDpj.name,
                    sip: parsedDpj.sip || doc.sip,
                    specialization: parsedDpj.specialization || doc.specialization,
                    schedule: parsedDpj.schedule || doc.schedule
                  }
                : doc
            )
          );
          setStaffList((prev) =>
            prev.map((s) =>
              s.isDpj === true && getStaffActiveRoles(s, s.role).includes('Dokter')
                ? {
                    ...s,
                    name: parsedDpj.name,
                    phone: parsedDpj.phone || s.phone,
                    ...(parsedDpj.sip ? { sipNumber: parsedDpj.sip } : {}),
                    ...(parsedDpj.idi ? { estrNumber: parsedDpj.idi } : {})
                  }
                : s
            )
          );
          const matchedActiveStaff = staffListRef.current.find((s) => s.id === activeStaffId);
          if (
            matchedActiveStaff?.isDpj === true &&
            getStaffActiveRoles(matchedActiveStaff, matchedActiveStaff.role).includes('Dokter')
          ) {
            setUserName(parsedDpj.name);
          }
        }
      } catch {}
    };

    // Bersihkan sisa kunci penyimpanan lokal multi-tenant/penyewa lama secara otomatis
    try {
      const legacyExactKeys = [
        'latisha_active_tenant_id',
        'latisha_tenant_licenses_v1',
        'latisha_tenant_token'
      ];
      legacyExactKeys.forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {}
      });
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.startsWith('latisha_tenant_') ||
          lowerKey.startsWith('tenant__') ||
          lowerKey.includes('potek_sehat') ||
          lowerKey.includes('potek-sehat') ||
          lowerKey.includes('sehat_farma') ||
          lowerKey.includes('sehat-farma')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {}
      });
      // Pastikan profil apotek lokal ikut bersih dari teks penyewa lama
      getSavedPharmacyProfile();
    } catch {}

    // 0. Initial Inbound Sync & Realtime: Profil Apotek, APJ, DPJ & Standar Hak Akses Peran
    const startFacilityProfileSync = () => {
      if (effectDisposed || isDemoMode()) return;
      fetchFacilityProfilesFromSupabase().then((res) => {
        if (effectDisposed || isDemoMode()) return;
        if (res.data) {
          const applied = applyRemoteFacilityProfiles(res.data);
          if (applied.rolePermissions) {
            setRolePermissions(applied.rolePermissions);
          }
          if (applied.changed) {
            syncAppStatesFromProfiles();
          }
        } else if (res.isEmpty) {
          syncFacilityProfilesToSupabase({
            pharmacy: getSavedPharmacyProfile(),
            apj: getSavedAPJProfile(),
            dpj: getSavedDPJProfile(),
            rolePermissions: getSavedRolePermissions()
          });
        }
      });

      facilityProfileChannel = subscribeFacilityProfileRealtime((bundle) => {
        const applied = applyRemoteFacilityProfiles(bundle);
        if (applied.rolePermissions) {
          setRolePermissions(applied.rolePermissions);
        }
        if (applied.changed) {
          syncAppStatesFromProfiles();
        }
      });
    };

    // 1. Initial Inbound Sync: Pull bounded recent patients from Supabase (tombstone-safe + replay pending deletes)
    const startPatientsSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
        const pendingDelPatients = getPendingDeleteIds('patients');
        if (pendingDelPatients.length > 0 && !isDemoMode()) {
          for (const delId of pendingDelPatients) {
            const delRes = await deletePatientFromSupabase(delId).catch(() => ({ success: false }));
            if (cancelledPatientsEffect) return;
            if (delRes.success) confirmCloudDeletes('patients', [delId]);
          }
        }
        const res = await fetchPatientsFromSupabase({ limit: 100 });
        if (cancelledPatientsEffect) return;
        if (res.data) {
          const deletedPatientSet = getDeletedIdsSet('patients');
          const stubbornIds = res.data
            .filter((p) =>
              [p.id, p.dbId, p.noRm].some((k) => k && deletedPatientSet.has(String(k).trim()))
            )
            .map((p) => String(p.dbId || p.id || p.noRm).trim())
            .filter(Boolean);
          if (stubbornIds.length > 0 && !isDemoMode()) {
            Promise.all(
              stubbornIds.map((sid) =>
                deletePatientFromSupabase(sid)
                  .then((dRes) => {
                    if (dRes.success) confirmCloudDeletes('patients', [sid]);
                  })
                  .catch(() => {})
              )
            );
          }
          const remoteClean = res.data.filter(
            (p) => ![p.id, p.dbId, p.noRm].some((k) => k && deletedPatientSet.has(String(k).trim()))
          );
          if (remoteClean.length > 0) {
            setPatients((prev) =>
              mergePatientLists(
                prev.filter(
                  (p) => ![p.id, p.dbId, p.noRm].some((k) => k && deletedPatientSet.has(String(k).trim()))
                ),
                remoteClean
              ).slice(0, 250)
            );
          }
        }
      })();

      const pendingPatientUpserts = new Map<string, Patient>();
      const pendingPatientDeletes = new Set<string>();

      const flushPatientRealtimeBatch = () => {
        patientBatchTimer = null;
        const upserts = Array.from(pendingPatientUpserts.values());
        const deletes = new Set(pendingPatientDeletes);
        pendingPatientUpserts.clear();
        pendingPatientDeletes.clear();
        if (upserts.length === 0 && deletes.size === 0) return;

        const deletedPatientSet = getDeletedIdsSet('patients');
        const filteredUpserts = upserts.filter(
          (p) => ![p.id, p.dbId, p.noRm].some((k) => k && deletedPatientSet.has(String(k).trim()))
        );

        setPatients((prev) => {
          const nextList = prev.filter(
            (p) =>
              !deletes.has(String(p.dbId || '')) &&
              !deletes.has(String(p.id)) &&
              !deletes.has(String(p.noRm || '')) &&
              ![p.id, p.dbId, p.noRm].some((k) => k && deletedPatientSet.has(String(k).trim()))
          );
          const merged =
            filteredUpserts.length > 0 ? mergePatientLists(filteredUpserts.reverse(), nextList) : nextList;
          return merged.length > 250 ? merged.slice(0, 250) : merged;
        });
      };

      const schedulePatientBatchFlush = () => {
        if (patientBatchTimer !== null) return;
        patientBatchTimer = window.setTimeout(flushPatientRealtimeBatch, 250);
      };

      patientChannel = subscribePatientsRealtime(
        (newPatient) => {
          const deletedPatientSet = getDeletedIdsSet('patients');
          if ([newPatient.id, newPatient.dbId, newPatient.noRm].some((k) => k && deletedPatientSet.has(String(k).trim()))) {
            return;
          }
          const key = String(newPatient.dbId || newPatient.id || newPatient.noRm);
          pendingPatientDeletes.delete(key);
          pendingPatientUpserts.set(key, newPatient);
          schedulePatientBatchFlush();
        },
        (updatedPatient) => {
          const deletedPatientSet = getDeletedIdsSet('patients');
          if (
            [updatedPatient.id, updatedPatient.dbId, updatedPatient.noRm].some(
              (k) => k && deletedPatientSet.has(String(k).trim())
            )
          ) {
            return;
          }
          const key = String(updatedPatient.dbId || updatedPatient.id || updatedPatient.noRm);
          pendingPatientDeletes.delete(key);
          pendingPatientUpserts.set(key, updatedPatient);
          schedulePatientBatchFlush();
        },
        (deletedId) => {
          const key = String(deletedId || '').trim();
          if (!key) return;
          recordRemoteDeletedId('patients', key);
          pendingPatientUpserts.delete(key);
          pendingPatientDeletes.add(key);
          schedulePatientBatchFlush();
        }
      );
    };

    // 2. Initial Inbound Sync & Realtime: Online Registrations
    const startOnlineRegSync = () => {
      if (effectDisposed || isDemoMode()) return;
      fetchOnlineRegistrationsFromSupabase().then((res) => {
        if (effectDisposed) return;
        if (res.data && res.data.length > 0) {
          setOnlineRegistrations((prev) => {
            const map = new Map<string, OnlineRegistration>();
            prev.forEach((r) => map.set(r.id, r));
            res.data!.forEach((r) => map.set(r.id, r));
            return Array.from(map.values());
          });
        }
      });

      onlineRegChannel = subscribeOnlineRegistrationsRealtime(
        (newReg) => {
          setOnlineRegistrations((prev) => {
            const exists = prev.some((r) => r.id === newReg.id || r.bookingCode === newReg.bookingCode);
            if (exists) {
              return prev.map((r) => (r.id === newReg.id || r.bookingCode === newReg.bookingCode ? newReg : r));
            }
            return [newReg, ...prev];
          });
        },
        (updatedReg) => {
          setOnlineRegistrations((prev) => {
            const exists = prev.some((r) => r.id === updatedReg.id || r.bookingCode === updatedReg.bookingCode);
            if (exists) {
              return prev.map((r) => (r.id === updatedReg.id || r.bookingCode === updatedReg.bookingCode ? updatedReg : r));
            }
            return [updatedReg, ...prev];
          });
        },
        (deletedId) => {
          setOnlineRegistrations((prev) => prev.filter((r) => r.id !== deletedId));
        }
      );
    };

    // 3. Initial Inbound Sync & Realtime: ICD-10
    const startIcdSync = () => {
      if (effectDisposed || isDemoMode()) return;
      fetchICD10FromSupabase().then((res) => {
        if (effectDisposed) return;
        if (res.data && res.data.length > 0) {
          setIcd10List(res.data);
        }
      });

      icdChannel = subscribeICD10Realtime(
        (newIcd) => {
          setIcd10List((prev) => {
            const exists = prev.some((i) => i.code === newIcd.code);
            if (exists) {
              return prev.map((i) => (i.code === newIcd.code ? newIcd : i));
            }
            return [...prev, newIcd];
          });
        },
        (updatedIcd) => {
          setIcd10List((prev) => {
            const exists = prev.some((i) => i.code === updatedIcd.code);
            if (exists) {
              return prev.map((i) => (i.code === updatedIcd.code ? updatedIcd : i));
            }
            return [...prev, updatedIcd];
          });
        },
        (deletedCode) => {
          setIcd10List((prev) => prev.filter((i) => i.code !== deletedCode));
        }
      );
    };

    // 4. Initial Inbound Sync & Realtime: Staff (safe against reused STF-XXX IDs)
    const startStaffSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
        if (cancelledStaffEffect) return;
        await refreshStaffFromCloud({ silent: true });
      })();

      staffChannel = subscribeStaffRealtime(
        (newStaff) => {
          const cleanId = String(newStaff?.id || '').trim();
          if (!cleanId) return;
          if (getPendingDeleteIds('staff').includes(cleanId)) return;
          markIdsPendingSync('staff', [cleanId]);
          confirmCloudSync('staff', [cleanId]);
          const safeStaff = ensurePrimaryOwnerStaffRole(newStaff).staff;
          setStaffList((prev) => {
            const exists = prev.some((s) => s.id === safeStaff.id);
            const nextList = exists
              ? prev.map((s) => (s.id === safeStaff.id ? safeStaff : s))
              : [...prev, safeStaff];
            saveStaffListLocally(nextList, { broadcast: false });
            return nextList;
          });
        },
        (updatedStaff) => {
          const cleanId = String(updatedStaff?.id || '').trim();
          if (!cleanId || getPendingDeleteIds('staff').includes(cleanId)) return;
          const safeStaff = ensurePrimaryOwnerStaffRole(updatedStaff).staff;
          setStaffList((prev) => {
            const exists = prev.some((s) => s.id === safeStaff.id);
            const nextList = exists
              ? prev.map((s) => (s.id === safeStaff.id ? safeStaff : s))
              : [...prev, safeStaff];
            saveStaffListLocally(nextList, { broadcast: false });
            return nextList;
          });
        },
        (deletedId) => {
          const cleanId = String(deletedId || '').trim();
          if (!cleanId) return;
          recordRemoteDeletedId('staff', cleanId);
          setStaffList((prev) => {
            const nextList = prev.filter((s) => s.id !== cleanId);
            saveStaffListLocally(nextList, { broadcast: false });
            return nextList;
          });
        }
      );
    };

    // 5. Initial Inbound Sync & Safe Realtime: Pull latest RME records from Supabase (tombstone-safe + replay pending deletes)
    const startRmeSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      // Step 1: Replay any pending cloud deletes FIRST so deleted RME rows never reappear
      const pendingDeleteRmeIds = getPendingDeleteIds('rme_records');
      if (pendingDeleteRmeIds.length > 0 && !isDemoMode()) {
        const delRes = await deleteRmesFromSupabase(pendingDeleteRmeIds).catch((err) => ({
          success: false,
          error: err?.message || String(err)
        }));
        if (cancelledRmeEffect) return;
        if (delRes.success) {
          confirmCloudDeletes('rme_records', pendingDeleteRmeIds);
        }
      }

      const res = await fetchRmeFromSupabase({ forceRefresh: true });
      if (cancelledRmeEffect) return;
      setRmeNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedRmeSet = getDeletedIdsSet('rme_records');
        const pendingSyncRmeSet = getPendingSyncIdsSet('rme_records');
        const remoteAll = res.data || [];

        // If any locally deleted ID still exists remotely, clean it up on Supabase
        const stubbornDeletedRemoteIds = remoteAll
          .filter((r) => r.id && deletedRmeSet.has(String(r.id).trim()))
          .map((r) => String(r.id).trim());
        if (stubbornDeletedRemoteIds.length > 0) {
          deleteRmesFromSupabase(stubbornDeletedRemoteIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('rme_records', stubbornDeletedRemoteIds);
              }
            })
            .catch(() => {});
        }

        const remoteClean = remoteAll.filter(
          (r) => r.id && !isDemoRmeId(r.id) && !deletedRmeSet.has(String(r.id).trim())
        );
        const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
        const syncedOnceBefore = hasCompletedInitialCloudSync('rme_records');

        const localValid = rmeRecordsRef.current.filter(
          (r) => r.id && !isDemoRmeId(r.id) && !deletedRmeSet.has(String(r.id).trim())
        );
        const localToUpload = localValid.filter((r) => {
          const cleanId = String(r.id).trim();
          if (pendingSyncRmeSet.has(cleanId)) return true;
          if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
          return false;
        });

        if (localToUpload.length > 0) {
          seedRmeToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'rme_records',
                  localToUpload.map((r) => String(r.id).trim())
                );
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, RMERecord>();
        remoteClean.forEach((r) => map.set(String(r.id).trim(), r));
        localToUpload.forEach((r) => {
          const cleanId = String(r.id).trim();
          if (!map.has(cleanId) || pendingSyncRmeSet.has(cleanId)) {
            map.set(cleanId, r);
          }
        });
        const authoritative = Array.from(map.values());
        setRmeRecords(authoritative);
        persistRmeNow(authoritative);
        markInitialCloudSyncCompleted('rme_records');
      }

      if (!res.needsTableSetup && !cancelledRmeEffect) {
        rmeChannel = subscribeRmeRealtime(
          (newRec) => {
            const cleanId = String(newRec?.id || '').trim();
            if (!cleanId || isDemoRmeId(cleanId)) return;
            if (getDeletedIdsSet('rme_records').has(cleanId)) return;
            setRmeRecords((prev) => {
              const next = prev.some((r) => String(r.id).trim() === cleanId)
                ? prev.map((r) => (String(r.id).trim() === cleanId ? newRec : r))
                : [newRec, ...prev];
              persistRmeNow(next);
              return next;
            });
          },
          (updatedRec) => {
            const cleanId = String(updatedRec?.id || '').trim();
            if (!cleanId || isDemoRmeId(cleanId)) return;
            if (getDeletedIdsSet('rme_records').has(cleanId)) return;
            setRmeRecords((prev) => {
              const next = prev.some((r) => String(r.id).trim() === cleanId)
                ? prev.map((r) => (String(r.id).trim() === cleanId ? updatedRec : r))
                : [updatedRec, ...prev];
              persistRmeNow(next);
              return next;
            });
          },
          (delId) => {
            const cleanId = String(delId || '').trim();
            if (!cleanId) return;
            recordRemoteDeletedId('rme_records', cleanId);
            setRmeRecords((prev) => {
              const next = prev.filter((r) => String(r.id).trim() !== cleanId);
              persistRmeNow(next);
              return next;
            });
          }
        );
      }
    })();
    };

    // 5c. Initial Inbound Sync & Safe Realtime: Pull Riwayat & Faktur Penjualan dari Supabase
    const startTransactionsSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      const demoTrxIds = ['TRX-1001', 'TRX-1002', 'FPJ-202610-1003', 'TRX-1004'];

      // Step 1: Replay any pending cloud deletes FIRST so deleted rows never reappear
      const pendingDeleteIds = getPendingDeleteIds('transactions');
      if (pendingDeleteIds.length > 0 && !isDemoMode()) {
        const delRes = await deleteTransactionsFromSupabase(pendingDeleteIds).catch((err) => ({
          success: false,
          error: err?.message || String(err)
        }));
        if (cancelledTransactionEffect) return;
        if (delRes.success) {
          confirmCloudDeletes('transactions', pendingDeleteIds);
        }
      }

      const res = await fetchTransactionsFromSupabase();
      if (cancelledTransactionEffect) return;
      setTransactionsNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('transactions');
        const pendingSyncSet = getPendingSyncIdsSet('transactions');
        const remoteAll = res.data || [];

        // If any locally deleted ID still exists remotely, trigger cleanup delete in background
        const stubbornDeletedRemoteIds = remoteAll
          .filter((t) => deletedSet.has(t.id))
          .map((t) => t.id);
        if (stubbornDeletedRemoteIds.length > 0) {
          deleteTransactionsFromSupabase(stubbornDeletedRemoteIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('transactions', stubbornDeletedRemoteIds);
              }
            })
            .catch(() => {});
        }

        const remoteClean = remoteAll.filter((t) => t.id && !demoTrxIds.includes(t.id) && !deletedSet.has(t.id));
        const remoteIds = new Set(remoteClean.map((t) => t.id));
        const syncedOnceBefore = hasCompletedInitialCloudSync('transactions');

        // Only upload local records that are genuinely unsynced offline creations/updates
        // (or first-ever migration into an empty Supabase table), NEVER tombstoned/deleted rows
        const localValid = transactionsRef.current.filter(
          (t) => t.id && !demoTrxIds.includes(t.id) && !deletedSet.has(t.id)
        );
        const localToUpload = localValid.filter((t) => {
          if (pendingSyncSet.has(t.id)) return true;
          if (!syncedOnceBefore && res.isEmpty && !remoteIds.has(t.id)) return true;
          return false;
        });

        if (localToUpload.length > 0) {
          seedTransactionsToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync('transactions', localToUpload.map((t) => t.id));
              }
            })
            .catch(() => {});
        }

        // Authoritative merge: Supabase remote rows + genuinely unsynced local rows (never deleted rows)
        const map = new Map<string, Transaction>();
        remoteClean.forEach((t) => map.set(t.id, t));
        localToUpload.forEach((t) => {
          if (!map.has(t.id) || pendingSyncSet.has(t.id)) {
            map.set(t.id, t);
          }
        });
        const authoritative = Array.from(map.values());
        setTransactions(authoritative);
        persistTransactionsNow(authoritative);
        markInitialCloudSyncCompleted('transactions');
        transactionsAuthoritativeRef.current = true;
        pruneFeeLedgerWithTransactions(authoritative, true);
      }

      if (!res.needsTableSetup && !cancelledTransactionEffect) {
        transactionChannel = subscribeTransactionsRealtime(
          (newTrx) => {
            if (demoTrxIds.includes(newTrx.id)) return;
            if (getDeletedIdsSet('transactions').has(newTrx.id)) return;
            setTransactions((prev) => {
              const next = prev.some((t) => t.id === newTrx.id)
                ? prev.map((t) => (t.id === newTrx.id ? newTrx : t))
                : [newTrx, ...prev];
              persistTransactionsNow(next);
              return next;
            });
            evaluateAndEnqueueRestrictedAlarm(newTrx);
          },
          (updatedTrx) => {
            if (demoTrxIds.includes(updatedTrx.id)) return;
            if (getDeletedIdsSet('transactions').has(updatedTrx.id)) return;
            setTransactions((prev) => {
              const next = prev.map((t) => (t.id === updatedTrx.id ? updatedTrx : t));
              persistTransactionsNow(next);
              return next;
            });
            if (updatedTrx.status === 'Dibatalkan' || updatedTrx.status === 'Diretur') {
              setRestrictedSaleAlarms((prev) => prev.filter((a) => a.trxId !== updatedTrx.id));
            }
          },
          (delId) => {
            const cleanDelId = String(delId || '').trim();
            if (!cleanDelId) return;
            recordRemoteDeletedId('transactions', cleanDelId);
            setTransactions((prev) => {
              const next = prev.filter((t) => t.id !== cleanDelId);
              persistTransactionsNow(next);
              return next;
            });
            setRestrictedSaleAlarms((prev) => prev.filter((a) => a.trxId !== cleanDelId));
            // Also strip linked fee ledger entries cleanly when a transaction is deleted remotely
            const linkedFeeIds = feeLedgerRef.current
              .filter((e) => e.transaction_id === cleanDelId)
              .map((e) => e.id);
            if (linkedFeeIds.length > 0) {
              markIdsDeleted('fee_ledger', linkedFeeIds);
              setFeeLedger((prev) => {
                const next = prev.filter((e) => e.transaction_id !== cleanDelId);
                persistFeeLedgerNow(next);
                return next;
              });
            }
          }
        );
      }
    })();
    };

    // 5d. Initial Inbound Sync & Safe Realtime: Pull Mutasi & Kartu Stok Digital (kartu_stok) dari Supabase
    const startStockCardSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      const demoMutIds = ['MUT-01', 'MUT-02', 'MUT-03'];
      const pendingMutDeleteIds = getPendingDeleteIds('stock_mutations');
      if (pendingMutDeleteIds.length > 0) {
        const delRetry = await deleteStockMutationsFromSupabase(pendingMutDeleteIds);
        if (delRetry.success) {
          confirmCloudDeletes('stock_mutations', pendingMutDeleteIds);
        }
      }
      if (cancelledStockCardEffect) return;

      const res = await fetchStockMutationsFromSupabase();
      if (cancelledStockCardEffect) return;
      setStockMutationsNeedsTableSetup(Boolean(res.needsTableSetup));
      if (res.needsBatchColumnMigration !== undefined) {
        setStockMutationsNeedsBatchMigration(Boolean(res.needsBatchColumnMigration));
      }

      const deletedMutSet = getDeletedIdsSet('stock_mutations');
      const pendingSyncMutSet = getPendingSyncIdsSet('stock_mutations');
      const syncedOnceMut = hasCompletedInitialCloudSync('stock_mutations');

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const remoteAll = res.data || [];
        const stubbornDeletedMutIds = remoteAll
          .filter((m) => m.id && deletedMutSet.has(m.id))
          .map((m) => m.id);
        if (stubbornDeletedMutIds.length > 0 && !isDemoMode()) {
          deleteStockMutationsFromSupabase(stubbornDeletedMutIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('stock_mutations', stubbornDeletedMutIds);
              }
            })
            .catch(() => {});
        }

        const filteredRemote = remoteAll.filter(
          (m) => m.id && !demoMutIds.includes(m.id) && !deletedMutSet.has(m.id)
        );
        const remoteById = new Map(filteredRemote.map((m) => [m.id, m]));
        const localValid = stockMutationsRef.current.filter(
          (m) => m.id && !demoMutIds.includes(m.id) && !deletedMutSet.has(m.id)
        );
        const localOnly = localValid.filter((m) => {
          if (pendingSyncMutSet.has(m.id)) return true;
          if (!syncedOnceMut && res.isEmpty && !remoteById.has(m.id)) return true;
          return false;
        });
        const enrichedToBackfill = !res.needsBatchColumnMigration
          ? localValid.filter((localM) => {
              const remoteM = remoteById.get(localM.id);
              if (!remoteM) return false;
              const localHasBatch = Boolean(
                (localM.batchNo && localM.batchNo !== '-') ||
                localM.expDate ||
                (localM.batchDetails && localM.batchDetails.length > 0)
              );
              const remoteHasBatch = Boolean(
                (remoteM.batchNo && remoteM.batchNo !== '-') ||
                remoteM.expDate ||
                (remoteM.batchDetails && remoteM.batchDetails.length > 0)
              );
              return localHasBatch && !remoteHasBatch;
            })
          : [];
        const toUpload = [...localOnly, ...enrichedToBackfill];
        if (toUpload.length > 0 && !isDemoMode()) {
          seedStockMutationsToSupabase(toUpload)
            .then((seedRes) => {
              if (seedRes.needsBatchColumnMigration !== undefined) {
                setStockMutationsNeedsBatchMigration(Boolean(seedRes.needsBatchColumnMigration));
              }
              if (seedRes.success) {
                confirmCloudSync(
                  'stock_mutations',
                  toUpload.map((m) => m.id)
                );
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, StockMutation>();
        filteredRemote.forEach((remoteM) => {
          const localMatch = localValid.find((l) => l.id === remoteM.id);
          map.set(remoteM.id, mergeStockMutationWithBatchPreserve(localMatch, remoteM));
        });
        localOnly.forEach((localM) => {
          if (!map.has(localM.id) || pendingSyncMutSet.has(localM.id)) {
            map.set(localM.id, localM);
          }
        });
        const authoritative = Array.from(map.values());
        setStockMutations(authoritative);
        persistStockMutationsNow(authoritative);
        markInitialCloudSyncCompleted('stock_mutations');
      }
      if (!res.needsTableSetup && !cancelledStockCardEffect) {
        stockCardChannel = subscribeStockMutationsRealtime(
          (newMut) => {
            if (demoMutIds.includes(newMut.id) || getDeletedIdsSet('stock_mutations').has(newMut.id)) return;
            setStockMutations((prev) => {
              const existing = prev.find((m) => m.id === newMut.id);
              const mergedMut = mergeStockMutationWithBatchPreserve(existing, newMut);
              const next = existing
                ? prev.map((m) => (m.id === newMut.id ? mergedMut : m))
                : [mergedMut, ...prev];
              persistStockMutationsNow(next);
              return next;
            });
          },
          (updatedMut) => {
            if (demoMutIds.includes(updatedMut.id) || getDeletedIdsSet('stock_mutations').has(updatedMut.id)) return;
            setStockMutations((prev) => {
              const next = prev.map((m) =>
                m.id === updatedMut.id ? mergeStockMutationWithBatchPreserve(m, updatedMut) : m
              );
              persistStockMutationsNow(next);
              return next;
            });
          },
          (delId) => {
            recordRemoteDeletedId('stock_mutations', delId);
            setStockMutations((prev) => {
              const next = prev.filter((m) => m.id !== delId);
              persistStockMutationsNow(next);
              return next;
            });
          }
        );
      }
    })();
    };

    // 5b. Initial Inbound Sync & Safe Realtime: Pull Pemeriksaan & Cek Lab (cek_lab) dari Supabase (tombstone-safe + replay pending deletes)
    const startLabSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      const pendingDeleteLabIds = getPendingDeleteIds('lab_records');
      if (pendingDeleteLabIds.length > 0 && !isDemoMode()) {
        const delRes = await deleteLabRecordsFromSupabase(pendingDeleteLabIds).catch((err) => ({
          success: false,
          error: err?.message || String(err)
        }));
        if (cancelledLabEffect) return;
        if (delRes.success) {
          confirmCloudDeletes('lab_records', pendingDeleteLabIds);
        }
      }

      const res = await fetchLabRecordsFromSupabase({ forceRefresh: true });
      if (cancelledLabEffect) return;
      setLabRecordsNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedLabSet = getDeletedIdsSet('lab_records');
        const pendingSyncLabSet = getPendingSyncIdsSet('lab_records');
        const remoteAll = res.data || [];

        const stubbornDeletedRemoteIds = remoteAll
          .filter((r) => r.id && deletedLabSet.has(String(r.id).trim()))
          .map((r) => String(r.id).trim());
        if (stubbornDeletedRemoteIds.length > 0 && !isDemoMode()) {
          deleteLabRecordsFromSupabase(stubbornDeletedRemoteIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('lab_records', stubbornDeletedRemoteIds);
              }
            })
            .catch(() => {});
        }

        const remoteClean = remoteAll.filter(
          (r) => r.id && !isDemoLabRecordId(r.id) && !deletedLabSet.has(String(r.id).trim())
        );
        const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
        const syncedOnceBefore = hasCompletedInitialCloudSync('lab_records');

        const localValid = labRecordsRef.current.filter(
          (r) => r.id && !isDemoLabRecordId(r.id) && !deletedLabSet.has(String(r.id).trim())
        );
        const localToUpload = localValid.filter((r) => {
          const cleanId = String(r.id).trim();
          if (pendingSyncLabSet.has(cleanId)) return true;
          if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
          return false;
        });

        if (localToUpload.length > 0 && !isDemoMode()) {
          seedLabRecordsToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'lab_records',
                  localToUpload.map((r) => String(r.id).trim())
                );
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, LabTestRecord>();
        remoteClean.forEach((r) => map.set(String(r.id).trim(), r));
        localToUpload.forEach((r) => {
          const cleanId = String(r.id).trim();
          if (!map.has(cleanId) || pendingSyncLabSet.has(cleanId)) {
            map.set(cleanId, r);
          }
        });
        const authoritative = Array.from(map.values()).sort((a, b) =>
          `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
        );
        setLabRecords(authoritative);
        persistLabRecordsNow(authoritative);
        markInitialCloudSyncCompleted('lab_records');
      }

      if (!res.needsTableSetup && !cancelledLabEffect) {
        labChannel = subscribeLabRecordsRealtime(
          (newRec) => {
            const cleanId = String(newRec?.id || '').trim();
            if (!cleanId || isDemoLabRecordId(cleanId)) return;
            if (getDeletedIdsSet('lab_records').has(cleanId)) return;
            setLabRecords((prev) => {
              const next = (prev.some((r) => String(r.id).trim() === cleanId)
                ? prev.map((r) => (String(r.id).trim() === cleanId ? newRec : r))
                : [newRec, ...prev]
              ).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
              persistLabRecordsNow(next);
              return next;
            });
          },
          (updatedRec) => {
            const cleanId = String(updatedRec?.id || '').trim();
            if (!cleanId || isDemoLabRecordId(cleanId)) return;
            if (getDeletedIdsSet('lab_records').has(cleanId)) return;
            setLabRecords((prev) => {
              const next = (prev.some((r) => String(r.id).trim() === cleanId)
                ? prev.map((r) => (String(r.id).trim() === cleanId ? updatedRec : r))
                : [updatedRec, ...prev]
              ).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
              persistLabRecordsNow(next);
              return next;
            });
          },
          (delId) => {
            const cleanId = String(delId || '').trim();
            if (!cleanId) return;
            recordRemoteDeletedId('lab_records', cleanId);
            setLabRecords((prev) => {
              const next = prev.filter((r) => String(r.id).trim() !== cleanId);
              persistLabRecordsNow(next);
              return next;
            });
          }
        );
      }
    })();
    };

    // 5c. Initial Inbound Sync & Safe Realtime: Pull Riwayat Stok Opname (riwayat_opname) dari Supabase (tombstone-safe + replay pending deletes)
    const startOpnameSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      // Step 1: Replay any pending cloud deletes FIRST so deleted opname records never reappear
      const pendingDeleteOpnameIds = getPendingDeleteIds('opname_records');
      if (pendingDeleteOpnameIds.length > 0 && !isDemoMode()) {
        const delRes = await deleteOpnameRecordsFromSupabase(pendingDeleteOpnameIds).catch(
          (err): { success: boolean; error?: string } => ({
            success: false,
            error: err?.message || String(err)
          })
        );
        if (cancelledOpnameEffect) return;
        if (delRes.success) {
          confirmCloudDeletes('opname_records', pendingDeleteOpnameIds);
        }
      }

      const res = await fetchOpnameRecordsFromSupabase({ forceRefresh: true, limit: 200 });
      if (cancelledOpnameEffect) return;
      setOpnameRecordsNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedOpnameSet = getDeletedIdsSet('opname_records');
        const pendingSyncOpnameSet = getPendingSyncIdsSet('opname_records');
        const remoteAll = res.data || [];

        // Clean up any locally deleted IDs that still exist remotely
        const stubbornDeletedRemoteIds = remoteAll
          .filter((r) => r.id && deletedOpnameSet.has(String(r.id).trim()))
          .map((r) => String(r.id).trim());
        if (stubbornDeletedRemoteIds.length > 0) {
          deleteOpnameRecordsFromSupabase(stubbornDeletedRemoteIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('opname_records', stubbornDeletedRemoteIds);
              }
            })
            .catch(() => {});
        }

        const remoteClean = remoteAll.filter(
          (r) => r.id && !isDemoOpnameRecordId(r.id) && !deletedOpnameSet.has(String(r.id).trim())
        );
        const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
        const syncedOnceBefore = hasCompletedInitialCloudSync('opname_records');

        const localValid = opnameRecordsRef.current.filter(
          (r) => r.id && !isDemoOpnameRecordId(r.id) && !deletedOpnameSet.has(String(r.id).trim())
        );
        const localToUpload = localValid.filter((r) => {
          const cleanId = String(r.id).trim();
          if (pendingSyncOpnameSet.has(cleanId)) return true;
          if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
          return false;
        });

        if (localToUpload.length > 0) {
          seedOpnameRecordsToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'opname_records',
                  localToUpload.map((r) => String(r.id).trim())
                );
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, StockOpnameRecord>();
        remoteClean.forEach((r) => map.set(String(r.id).trim(), r));
        localToUpload.forEach((r) => {
          const cleanId = String(r.id).trim();
          if (!map.has(cleanId) || pendingSyncOpnameSet.has(cleanId)) {
            map.set(cleanId, r);
          }
        });
        const authoritative = Array.from(map.values()).sort((a, b) =>
          `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
        );
        setOpnameRecords(authoritative);
        persistOpnameNow(authoritative);
        markInitialCloudSyncCompleted('opname_records');
      }

      if (!res.needsTableSetup && !cancelledOpnameEffect) {
        if (opnameChannelRef.current) {
          const activeClient = getSupabaseClient();
          if (activeClient) activeClient.removeChannel(opnameChannelRef.current);
        }
        opnameChannel = subscribeOpnameRecordsRealtime(
          (newRec) => {
            const cleanId = String(newRec?.id || '').trim();
            if (!cleanId || isDemoMode() || isDemoOpnameRecordId(cleanId)) return;
            if (getDeletedIdsSet('opname_records').has(cleanId)) return;
            setOpnameRecords((prev) => {
              const next = (prev.some((r) => String(r.id).trim() === cleanId)
                ? prev.map((r) => (String(r.id).trim() === cleanId ? newRec : r))
                : [newRec, ...prev]
              ).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
              persistOpnameNow(next);
              return next;
            });
          },
          (updatedRec) => {
            const cleanId = String(updatedRec?.id || '').trim();
            if (!cleanId || isDemoMode() || isDemoOpnameRecordId(cleanId)) return;
            if (getDeletedIdsSet('opname_records').has(cleanId)) return;
            setOpnameRecords((prev) => {
              const next = (prev.some((r) => String(r.id).trim() === cleanId)
                ? prev.map((r) => (String(r.id).trim() === cleanId ? updatedRec : r))
                : [updatedRec, ...prev]
              ).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
              persistOpnameNow(next);
              return next;
            });
          },
          (delId) => {
            const cleanId = String(delId || '').trim();
            if (!cleanId || isDemoMode()) return;
            const deletedObj = opnameRecordsRef.current.find((r) => String(r.id).trim() === cleanId);
            if (deletedObj?.refNo) markOpnameRefsDeleted([deletedObj.refNo]);
            recordRemoteDeletedId('opname_records', cleanId);
            setOpnameRecords((prev) => {
              const next = prev.filter((r) => String(r.id).trim() !== cleanId);
              persistOpnameNow(next);
              return next;
            });
          }
        );
        opnameChannelRef.current = opnameChannel;
      }
    })();
    };

    // 5b-morbid. Initial Inbound Sync & Safe Realtime: Pull Arsip Laporan Medis & Morbiditas dari Supabase (tombstone-safe + replay pending deletes)
    const startMorbiditySync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      const pendingDeleteMorbidIds = getPendingDeleteIds('morbidity_reports');
      if (pendingDeleteMorbidIds.length > 0 && !isDemoMode()) {
        for (const delId of pendingDeleteMorbidIds) {
          const delRes = await deleteMorbidityReportFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledMorbidityEffect) return;
          if (delRes.success) confirmCloudDeletes('morbidity_reports', [delId]);
        }
      }

      const res = await fetchMorbidityReportsFromSupabase({ forceRefresh: true });
      if (cancelledMorbidityEffect) return;
      setMorbidityNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('morbidity_reports');
        const pendingSyncSet = getPendingSyncIdsSet('morbidity_reports');
        const remoteAll = res.data || [];

        const stubbornIds = remoteAll
          .filter((r) => r.id && deletedSet.has(String(r.id).trim()))
          .map((r) => String(r.id).trim());
        if (stubbornIds.length > 0 && !isDemoMode()) {
          Promise.all(
            stubbornIds.map((sid) =>
              deleteMorbidityReportFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('morbidity_reports', [sid]);
                })
                .catch(() => {})
            )
          );
        }

        const remoteClean = remoteAll.filter((r) => r.id && !deletedSet.has(String(r.id).trim()));
        const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
        const syncedOnceBefore = hasCompletedInitialCloudSync('morbidity_reports');

        const localValid = morbidityReportsRef.current.filter(
          (r) => r.id && !deletedSet.has(String(r.id).trim())
        );
        const localToUpload = localValid.filter((r) => {
          const cleanId = String(r.id).trim();
          if (pendingSyncSet.has(cleanId)) return true;
          if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
          return false;
        });

        if (localToUpload.length > 0 && !isDemoMode()) {
          seedMorbidityReportsToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'morbidity_reports',
                  localToUpload.map((r) => String(r.id).trim())
                );
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, MedicalMorbidityReportRecord>();
        remoteClean.forEach((r) => map.set(String(r.id).trim(), r));
        localToUpload.forEach((r) => {
          const cleanId = String(r.id).trim();
          if (!map.has(cleanId) || pendingSyncSet.has(cleanId)) {
            map.set(cleanId, r);
          }
        });
        const authoritative = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setMorbidityReports(authoritative);
        persistMorbidityReportsNow(authoritative);
        markInitialCloudSyncCompleted('morbidity_reports');
      }

      if (!res.needsTableSetup && !cancelledMorbidityEffect) {
        morbidityChannel = subscribeMorbidityReportsRealtime(
          (newRep) => {
            const cleanId = String(newRep?.id || '').trim();
            if (!cleanId || getDeletedIdsSet('morbidity_reports').has(cleanId)) return;
            setMorbidityReports((prev) => {
              const next = (prev.some((r) => String(r.id).trim() === cleanId)
                ? prev.map((r) => (String(r.id).trim() === cleanId ? newRep : r))
                : [newRep, ...prev]
              ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              persistMorbidityReportsNow(next);
              return next;
            });
          },
          (updatedRep) => {
            const cleanId = String(updatedRep?.id || '').trim();
            if (!cleanId || getDeletedIdsSet('morbidity_reports').has(cleanId)) return;
            setMorbidityReports((prev) => {
              const next = prev.map((r) => (String(r.id).trim() === cleanId ? updatedRep : r));
              persistMorbidityReportsNow(next);
              return next;
            });
          },
          (delId) => {
            const cleanId = String(delId || '').trim();
            if (!cleanId) return;
            recordRemoteDeletedId('morbidity_reports', cleanId);
            setMorbidityReports((prev) => {
              const next = prev.filter((r) => String(r.id).trim() !== cleanId);
              persistMorbidityReportsNow(next);
              return next;
            });
          }
        );
      }
    })();
    };

    // 6. Initial Inbound/Outbound Two-Way Sync: Flush pending offline ops & pull authoritative schedules from Supabase
    const startSchedulesSync = () => {
      if (effectDisposed || isDemoMode()) return;
      handleSyncSchedulesSupabase().then((syncRes) => {
        if (cancelledScheduleEffect || isDemoMode()) return;
        setSchedulesNeedsTableSetup(Boolean(syncRes.needsTableSetup));
        if (!syncRes.needsTableSetup) {
          scheduleChannel = subscribeSchedulesRealtime(
            (newSch) => {
              const pendingOps = readPendingScheduleOps();
              if (pendingOps.deletes.includes(newSch.id)) return;
              setSchedules((prev) => {
                const next = prev.some((s) => s.id === newSch.id)
                  ? prev.map((s) => (s.id === newSch.id ? newSch : s))
                  : [newSch, ...prev];
                try {
                  demoSetItem('latisha_schedules', JSON.stringify(next));
                } catch {}
                return next;
              });
            },
            (updatedSch) => {
              const pendingOps = readPendingScheduleOps();
              if (pendingOps.deletes.includes(updatedSch.id)) return;
              setSchedules((prev) => {
                const next = prev.map((s) => (s.id === updatedSch.id ? updatedSch : s));
                try {
                  demoSetItem('latisha_schedules', JSON.stringify(next));
                } catch {}
                return next;
              });
            },
            (delId) => {
              dequeueScheduleDelete(delId);
              setSchedules((prev) => {
                const next = prev.filter((s) => s.id !== delId);
                try {
                  demoSetItem('latisha_schedules', JSON.stringify(next));
                } catch {}
                return next;
              });
            }
          );
        }
      });
    };

    // 7. Initial Inbound/Outbound Two-Way Sync & Realtime: master_obat
    const startMedicinesSync = () => {
      if (effectDisposed || isDemoMode()) return;
      handleSyncMedicinesSupabase().then((syncRes) => {
        if (cancelledMedicineEffect || isDemoMode()) return;
        if (syncRes.needsTableSetup) {
          setMedicinesNeedsTableSetup(true);
        }
      });

      medicineChannel = subscribeMedicinesRealtime(
        (newMed) => {
          if (isDemoMode()) return;
          setMedicines((prev) => {
            if (prev.some((m) => m.id === newMed.id)) {
              return prev.map((m) => (m.id === newMed.id ? newMed : m));
            }
            return normalizeUniqueMedicines([newMed, ...prev]).items;
          });
        },
        (updatedMed) => {
          if (isDemoMode()) return;
          setMedicines((prev) => {
            if (prev.some((m) => m.id === updatedMed.id)) {
              return prev.map((m) => (m.id === updatedMed.id ? updatedMed : m));
            }
            return normalizeUniqueMedicines([updatedMed, ...prev]).items;
          });
        },
        (delId) => {
          if (isDemoMode()) return;
          setMedicines((prev) => prev.filter((m) => m.id !== delId));
        }
      );
      medicineChannelRef.current = medicineChannel;
    };

    // 8. Initial Inbound Sync & Realtime: Mitra Orders from Supabase (tombstone-safe + replay pending deletes)
    const startMitraOrdersSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      const pendingDeleteOrdIds = getPendingDeleteIds('mitra_orders');
      if (pendingDeleteOrdIds.length > 0 && !isDemoMode()) {
        for (const delId of pendingDeleteOrdIds) {
          const delRes = await deleteMitraOrderFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledMitraOrderEffect) return;
          if (delRes.success) confirmCloudDeletes('mitra_orders', [delId]);
        }
      }
      const res = await fetchMitraOrdersFromSupabase();
      if (cancelledMitraOrderEffect) return;
      if (res.data) {
        const deletedSet = getDeletedIdsSet('mitra_orders');
        const pendingSyncSet = getPendingSyncIdsSet('mitra_orders');
        const stubbornIds = res.data
          .filter((o) => o.id && deletedSet.has(String(o.id).trim()))
          .map((o) => String(o.id).trim());
        if (stubbornIds.length > 0 && !isDemoMode()) {
          Promise.all(
            stubbornIds.map((sid) =>
              deleteMitraOrderFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('mitra_orders', [sid]);
                })
                .catch(() => {})
            )
          );
        }
        const remoteClean = res.data.filter((o) => o.id && !deletedSet.has(String(o.id).trim()));
        const localPending = mitraOrdersRef.current.filter(
          (o) => o.id && !deletedSet.has(String(o.id).trim()) && pendingSyncSet.has(String(o.id).trim())
        );
        if (localPending.length > 0 && !isDemoMode()) {
          Promise.all(
            localPending.map((ord) =>
              syncMitraOrderToSupabase(ord)
                .then((sRes) => {
                  if (sRes.success) confirmCloudSync('mitra_orders', [ord.id]);
                })
                .catch(() => {})
            )
          );
        }
        const map = new Map<string, MitraOrder>();
        remoteClean.forEach((o) => map.set(o.id, o));
        localPending.forEach((o) => map.set(o.id, o));
        const authoritative = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setMitraOrders(authoritative);
        persistMitraOrdersNow(authoritative);
        markInitialCloudSyncCompleted('mitra_orders');
      }
    })();

      mitraOrderChannel = subscribeMitraOrdersRealtime(
        (newOrd) => {
          if (!newOrd?.id || getDeletedIdsSet('mitra_orders').has(newOrd.id)) return;
          setMitraOrders((prev) => {
            const next = prev.some((o) => o.id === newOrd.id)
              ? prev.map((o) => (o.id === newOrd.id ? newOrd : o))
              : [newOrd, ...prev];
            persistMitraOrdersNow(next);
            return next;
          });
        },
        (updatedOrd) => {
          if (!updatedOrd?.id || getDeletedIdsSet('mitra_orders').has(updatedOrd.id)) return;
          setMitraOrders((prev) => {
            const next = prev.map((o) => (o.id === updatedOrd.id ? updatedOrd : o));
            persistMitraOrdersNow(next);
            return next;
          });
        },
        (delId) => {
          const cleanId = String(delId || '').trim();
          if (!cleanId) return;
          recordRemoteDeletedId('mitra_orders', cleanId);
          setMitraOrders((prev) => {
            const next = prev.filter((o) => o.id !== cleanId);
            persistMitraOrdersNow(next);
            return next;
          });
        }
      );
    };

    // 9. Initial Inbound Sync & Realtime: Pull Riwayat Skrining Resep & Antrean E-Resep dari Supabase
    const startPrescriptionsSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      // Step 1: Replay any pending cloud deletes FIRST so deleted rows never reappear
      const pendingDeleteRxIds = getPendingDeleteIds('prescriptions');
      if (pendingDeleteRxIds.length > 0 && !isDemoMode()) {
        const delRes = await deletePrescriptionsFromSupabase(pendingDeleteRxIds).catch((err) => ({
          success: false,
          error: err?.message || String(err)
        }));
        if (cancelledPrescriptionEffect) return;
        if (delRes.success) {
          confirmCloudDeletes('prescriptions', pendingDeleteRxIds);
        }
      }

      const res = await fetchPrescriptionsFromSupabase();
      if (cancelledPrescriptionEffect) return;

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedRxSet = getDeletedIdsSet('prescriptions');
        const pendingSyncRxSet = getPendingSyncIdsSet('prescriptions');
        const remoteAll = res.data || [];

        // If any locally deleted ID still exists remotely, trigger cleanup delete in background
        const stubbornDeletedRemoteIds = remoteAll
          .filter((rx) => rx.id && deletedRxSet.has(String(rx.id).trim()))
          .map((rx) => String(rx.id).trim());
        if (stubbornDeletedRemoteIds.length > 0) {
          deletePrescriptionsFromSupabase(stubbornDeletedRemoteIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('prescriptions', stubbornDeletedRemoteIds);
              }
            })
            .catch(() => {});
        }

        const remoteClean = remoteAll.filter(
          (rx) => rx.id && !isDemoPrescriptionId(rx.id) && !deletedRxSet.has(String(rx.id).trim())
        );
        const remoteIds = new Set(remoteClean.map((rx) => String(rx.id).trim()));
        const syncedOnceBefore = hasCompletedInitialCloudSync('prescriptions');

        const localValid = prescriptionsRef.current.filter(
          (rx) => rx.id && !isDemoPrescriptionId(rx.id) && !deletedRxSet.has(String(rx.id).trim())
        );
        const localToUpload = localValid.filter((rx) => {
          const cleanId = String(rx.id).trim();
          if (pendingSyncRxSet.has(cleanId)) return true;
          if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
          return false;
        });

        if (localToUpload.length > 0) {
          seedPrescriptionsToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'prescriptions',
                  localToUpload.map((rx) => String(rx.id).trim())
                );
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, EPrescription>();
        remoteClean.forEach((rx) => map.set(String(rx.id).trim(), rx));
        localToUpload.forEach((rx) => {
          const cleanId = String(rx.id).trim();
          if (!map.has(cleanId) || pendingSyncRxSet.has(cleanId)) {
            map.set(cleanId, rx);
          }
        });
        const authoritative = Array.from(map.values());
        setPrescriptions(authoritative);
        persistPrescriptionsNow(authoritative);
        markInitialCloudSyncCompleted('prescriptions');
      }
    })();

      prescriptionChannel = subscribePrescriptionsRealtime(
        (newRx) => {
          const cleanId = String(newRx.id || '').trim();
          if (!cleanId || isDemoPrescriptionId(cleanId)) return;
          if (getDeletedIdsSet('prescriptions').has(cleanId)) return;
          setPrescriptions((prev) => {
            const next = prev.some((p) => String(p.id).trim() === cleanId)
              ? prev.map((p) => (String(p.id).trim() === cleanId ? newRx : p))
              : [newRx, ...prev];
            persistPrescriptionsNow(next);
            return next;
          });
        },
        (updatedRx) => {
          const cleanId = String(updatedRx.id || '').trim();
          if (!cleanId || isDemoPrescriptionId(cleanId)) return;
          if (getDeletedIdsSet('prescriptions').has(cleanId)) return;
          setPrescriptions((prev) => {
            const next = prev.some((p) => String(p.id).trim() === cleanId)
              ? prev.map((p) => (String(p.id).trim() === cleanId ? updatedRx : p))
              : [updatedRx, ...prev];
            persistPrescriptionsNow(next);
            return next;
          });
        },
        (deletedId) => {
          const cleanId = String(deletedId || '').trim();
          if (!cleanId) return;
          recordRemoteDeletedId('prescriptions', cleanId);
          setPrescriptions((prev) => {
            const next = prev.filter((p) => String(p.id).trim() !== cleanId);
            persistPrescriptionsNow(next);
            return next;
          });
        }
      );
    };

    // 10b. Initial Inbound Sync & Realtime: Diskon & Promo Portal Mitra (tombstone-safe + replay pending deletes)
    const startPromoDiscountSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      const pendingDelPromoIds = getPendingDeleteIds('discounts_promos');
      if (pendingDelPromoIds.length > 0 && !isDemoMode()) {
        for (const delId of pendingDelPromoIds) {
          const delRes = await deletePromoOrDiscountFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledPromoDiscountEffect || isDemoMode()) return;
          if (delRes.success) confirmCloudDeletes('discounts_promos', [delId]);
        }
      }
      const res = await fetchDiscountsPromosFromSupabase();
      if (cancelledPromoDiscountEffect || isDemoMode()) return;
      setPromoDiscountNeedsTableSetup(Boolean(res.needsTableSetup));
      if (!res.error) {
        const deletedSet = getDeletedIdsSet('discounts_promos');
        const pendingSyncSet = getPendingSyncIdsSet('discounts_promos');
        const syncedOnceBefore = hasCompletedInitialCloudSync('discounts_promos');

        const stubbornIds = [
          ...res.discounts.filter((d) => d.id && deletedSet.has(d.id)).map((d) => d.id),
          ...res.promos.filter((p) => p.id && deletedSet.has(p.id)).map((p) => p.id)
        ];
        if (stubbornIds.length > 0) {
          Promise.all(
            stubbornIds.map((sid) =>
              deletePromoOrDiscountFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('discounts_promos', [sid]);
                })
                .catch(() => {})
            )
          );
        }

        const remoteDiscounts = res.discounts.filter((d) => d.id && !deletedSet.has(d.id));
        const remotePromos = res.promos.filter((p) => p.id && !deletedSet.has(p.id));
        const remoteDiscIds = new Set(remoteDiscounts.map((d) => d.id));
        const remotePromoIds = new Set(remotePromos.map((p) => p.id));

        const localDiscountsToUpload = salesDiscountsRef.current.filter(
          (d) =>
            d.id &&
            !deletedSet.has(d.id) &&
            (pendingSyncSet.has(d.id) || (!syncedOnceBefore && !remoteDiscIds.has(d.id)))
        );
        const localPromosToUpload = promoAdsRef.current.filter(
          (p) =>
            p.id &&
            !deletedSet.has(p.id) &&
            (pendingSyncSet.has(p.id) || (!syncedOnceBefore && !remotePromoIds.has(p.id)))
        );

        if (localDiscountsToUpload.length > 0 || localPromosToUpload.length > 0) {
          seedDiscountsPromosToSupabase(localDiscountsToUpload, localPromosToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync('discounts_promos', [
                  ...localDiscountsToUpload.map((d) => d.id),
                  ...localPromosToUpload.map((p) => p.id)
                ]);
              }
            })
            .catch(() => {});
        }

        const discMap = new Map<string, SalesDiscount>();
        remoteDiscounts.forEach((d) => discMap.set(d.id, d));
        localDiscountsToUpload.forEach((d) => {
          if (!discMap.has(d.id) || pendingSyncSet.has(d.id)) discMap.set(d.id, d);
        });
        const promoMap = new Map<string, PromoAd>();
        remotePromos.forEach((p) => promoMap.set(p.id, p));
        localPromosToUpload.forEach((p) => {
          if (!promoMap.has(p.id) || pendingSyncSet.has(p.id)) promoMap.set(p.id, p);
        });
        setSalesDiscounts(Array.from(discMap.values()));
        setPromoAds(Array.from(promoMap.values()));
        markInitialCloudSyncCompleted('discounts_promos');
      } else {
        // Fallback ke bridge server lokal jika tabel Supabase belum dibuat
        const deletedSet = getDeletedIdsSet('discounts_promos');
        fetchDiscountsPromosFromServerBridge().then((bridge) => {
          if (!bridge || cancelledPromoDiscountEffect || isDemoMode()) return;
          if (bridge.discounts.length > 0 && salesDiscountsRef.current.length === 0) {
            setSalesDiscounts(bridge.discounts.filter((d) => !deletedSet.has(d.id)));
          }
          if (bridge.promos.length > 0 && promoAdsRef.current.length === 0) {
            setPromoAds(bridge.promos.filter((p) => !deletedSet.has(p.id)));
          }
        });
      }
    })();

      promoDiscountChannel = subscribeDiscountsPromosRealtime(
        (item) => {
          const deletedSet = getDeletedIdsSet('discounts_promos');
          if (item.kind === 'DISCOUNT' && item.discount) {
            if (!item.discount.id || deletedSet.has(item.discount.id)) return;
            setSalesDiscounts((prev) => {
              const exists = prev.some((d) => d.id === item.discount!.id);
              return exists
                ? prev.map((d) => (d.id === item.discount!.id ? item.discount! : d))
                : [item.discount!, ...prev];
            });
          } else if (item.kind === 'PROMO' && item.promo) {
            if (!item.promo.id || deletedSet.has(item.promo.id)) return;
            setPromoAds((prev) => {
              const exists = prev.some((p) => p.id === item.promo!.id);
              return exists
                ? prev.map((p) => (p.id === item.promo!.id ? item.promo! : p))
                : [item.promo!, ...prev];
            });
          }
        },
        (deletedId) => {
          const cleanId = String(deletedId || '').trim();
          if (!cleanId) return;
          recordRemoteDeletedId('discounts_promos', cleanId);
          setSalesDiscounts((prev) => prev.filter((d) => d.id !== cleanId));
          setPromoAds((prev) => prev.filter((p) => p.id !== cleanId));
        }
      );
    };

    // 10c-fee. Initial Inbound Sync & Realtime: Pengaturan Tarif & Jasa Medis (pengaturan_tarif_jasa)
    const startFeeConfigSync = () => {
      if (effectDisposed || isDemoMode()) return;
      fetchFeeConfigFromSupabase().then((res) => {
        if (cancelledFeeConfigEffect || isDemoMode()) return;
        setFeeConfigNeedsTableSetup(Boolean(res.needsTableSetup));
        if (res.data) {
          setFeeConfig(res.data);
          if (res.data.payrollConfig) {
            try {
              demoSetItem('latisha_payroll_overtime_config', JSON.stringify(res.data.payrollConfig));
            } catch {}
          }
        } else if (res.isEmpty) {
          syncFeeConfigToSupabase(feeConfig, userName)
            .then((seedRes) => {
              if (!cancelledFeeConfigEffect && seedRes.needsTableSetup) {
                setFeeConfigNeedsTableSetup(true);
              }
            })
            .catch(() => {});
        }
      });

      feeConfigChannel = subscribeFeeConfigRealtime((remoteFeeConfig) => {
        if (isDemoMode()) return;
        setFeeConfig(remoteFeeConfig);
        if (remoteFeeConfig.payrollConfig) {
          try {
            demoSetItem('latisha_payroll_overtime_config', JSON.stringify(remoteFeeConfig.payrollConfig));
          } catch {}
        }
      });
    };

    // 10c-ledger. Initial Inbound Sync & Realtime: Ledger Fee Petugas POS (log_fee_petugas, tombstone-safe + replay pending deletes)
    const startFeeLedgerSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;

      // Step 1: Replay pending transaction-scoped & entry-scoped fee deletes FIRST
      const pendingTrxDeletes = getPendingDeleteFeeLedgerTrxIds();
      if (pendingTrxDeletes.length > 0) {
        const delTrxRes = await deleteFeeLedgerByTransactionsInSupabase(pendingTrxDeletes).catch(() => ({
          success: false,
          needsTableSetup: false
        }));
        if (cancelledFeeLedgerEffect || isDemoMode()) return;
        if (delTrxRes.success) {
          confirmFeeLedgerTrxDeletes(pendingTrxDeletes);
        }
      }
      const pendingFeeDeletes = getPendingDeleteIds('fee_ledger');
      if (pendingFeeDeletes.length > 0) {
        const delIdRes = await deleteFeeLedgerByIdsInSupabase(pendingFeeDeletes).catch(() => ({
          success: false,
          needsTableSetup: false
        }));
        if (cancelledFeeLedgerEffect || isDemoMode()) return;
        if (delIdRes.success) {
          confirmCloudDeletes('fee_ledger', pendingFeeDeletes);
        }
      }

      const res = await fetchFeeLedgerFromSupabase();
      if (cancelledFeeLedgerEffect || isDemoMode()) return;
      setFeeLedgerNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedFeeSet = getDeletedIdsSet('fee_ledger');
        const deletedTrxSet = getDeletedIdsSet('transactions');
        const pendingSyncFeeSet = getPendingSyncIdsSet('fee_ledger');
        const pendingSyncTrxSet = getPendingSyncIdsSet('transactions');
        const trxIsAuthoritative = transactionsAuthoritativeRef.current;
        const activeTrxIds = new Set(
          transactionsRef.current
            .filter((t) => t?.id && !deletedTrxSet.has(String(t.id).trim()))
            .map((t) => String(t.id).trim())
        );

        const remoteAll = res.data || [];
        const stubbornDeletedIds: string[] = [];
        const orphanTrxIdsToClean = new Set<string>();
        remoteAll.forEach((e) => {
          const cleanId = String(e?.id || '').trim();
          const cleanTrxId = String(e?.transaction_id || '').trim();
          if (!cleanId || isDemoFeeLedgerId(cleanId)) return;
          const isDeleted =
            deletedFeeSet.has(cleanId) || (cleanTrxId !== '' && deletedTrxSet.has(cleanTrxId));
          const isOrphan =
            trxIsAuthoritative &&
            (!cleanTrxId || (!activeTrxIds.has(cleanTrxId) && !pendingSyncTrxSet.has(cleanTrxId)));
          if (isDeleted || isOrphan) {
            stubbornDeletedIds.push(cleanId);
            if (cleanTrxId) orphanTrxIdsToClean.add(cleanTrxId);
          }
        });

        if (stubbornDeletedIds.length > 0) {
          if (orphanTrxIdsToClean.size > 0) {
            deleteFeeLedgerByTransactionsInSupabase(Array.from(orphanTrxIdsToClean))
              .then((cleanupRes) => {
                if (cleanupRes.success) {
                  confirmFeeLedgerTrxDeletes(Array.from(orphanTrxIdsToClean));
                  confirmCloudDeletes('fee_ledger', stubbornDeletedIds);
                }
              })
              .catch(() => {});
          } else {
            deleteFeeLedgerByIdsInSupabase(stubbornDeletedIds)
              .then((cleanupRes) => {
                if (cleanupRes.success) {
                  confirmCloudDeletes('fee_ledger', stubbornDeletedIds);
                }
              })
              .catch(() => {});
          }
        }

        const remoteClean = remoteAll.filter((e) => {
          const cleanId = String(e?.id || '').trim();
          const cleanTrxId = String(e?.transaction_id || '').trim();
          if (!cleanId || isDemoFeeLedgerId(cleanId)) return false;
          if (deletedFeeSet.has(cleanId) || (cleanTrxId && deletedTrxSet.has(cleanTrxId))) return false;
          if (
            trxIsAuthoritative &&
            (!cleanTrxId || (!activeTrxIds.has(cleanTrxId) && !pendingSyncTrxSet.has(cleanTrxId)))
          ) {
            return false;
          }
          return true;
        });

        const localClean = feeLedgerRef.current.filter((e) => {
          const cleanId = String(e?.id || '').trim();
          const cleanTrxId = String(e?.transaction_id || '').trim();
          if (!cleanId || isDemoFeeLedgerId(cleanId)) return false;
          if (deletedFeeSet.has(cleanId) || (cleanTrxId && deletedTrxSet.has(cleanTrxId))) return false;
          if (
            trxIsAuthoritative &&
            (!cleanTrxId || (!activeTrxIds.has(cleanTrxId) && !pendingSyncTrxSet.has(cleanTrxId)))
          ) {
            return false;
          }
          return true;
        });

        const localToUpload = localClean.filter((e) => pendingSyncFeeSet.has(String(e.id).trim()));
        if (localToUpload.length > 0) {
          upsertFeeLedgerEntriesToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'fee_ledger',
                  localToUpload.map((e) => String(e.id).trim())
                );
              }
            })
            .catch(() => {});
        }

        const mergedMap = new Map<string, StaffFeeLedgerEntry>();
        remoteClean.forEach((e) => mergedMap.set(e.id, e));
        localToUpload.forEach((e) => mergedMap.set(e.id, e));
        const merged = Array.from(mergedMap.values()).sort((a, b) =>
          (b.created_at || b.transaction_date).localeCompare(a.created_at || a.transaction_date)
        );
        setFeeLedger(merged);
        persistFeeLedgerNow(merged);
        markInitialCloudSyncCompleted('fee_ledger');
      }
    })();

      feeLedgerChannel = subscribeFeeLedgerRealtime(
        (remoteEntry) => {
          if (isDemoMode() || !remoteEntry?.id || isDemoFeeLedgerId(remoteEntry.id)) return;
          const cleanId = String(remoteEntry.id).trim();
          const cleanTrxId = String(remoteEntry.transaction_id || '').trim();
          if (
            getDeletedIdsSet('fee_ledger').has(cleanId) ||
            (cleanTrxId && getDeletedIdsSet('transactions').has(cleanTrxId))
          ) {
            return;
          }
          if (
            transactionsAuthoritativeRef.current &&
            (!cleanTrxId ||
              (!transactionsRef.current.some((t) => t.id === cleanTrxId) &&
                !getPendingSyncIdsSet('transactions').has(cleanTrxId)))
          ) {
            return;
          }
          setFeeLedger((prev) => {
            const exists = prev.some((item) => item.id === cleanId);
            const next = exists
              ? prev.map((item) => (item.id === cleanId ? remoteEntry : item))
              : [remoteEntry, ...prev];
            persistFeeLedgerNow(next);
            return next;
          });
        },
        (deletedId) => {
          const cleanId = String(deletedId || '').trim();
          if (isDemoMode() || !cleanId) return;
          recordRemoteDeletedId('fee_ledger', cleanId);
          setFeeLedger((prev) => {
            const next = prev.filter((item) => item.id !== cleanId);
            persistFeeLedgerNow(next);
            return next;
          });
        }
      );
    };

    // 10. Initial Inbound Sync & Realtime: Pull Master Data Mitra dari Supabase (tombstone-safe + replay pending deletes)
    const startMitraSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      const demoMitraIds = ['MTR-001', 'MTR-002', 'MTR-003'];
      const pendingDeleteMitraIds = getPendingDeleteIds('mitra');
      if (pendingDeleteMitraIds.length > 0 && !isDemoMode()) {
        for (const delId of pendingDeleteMitraIds) {
          const delRes = await deleteMitraFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledMitraEffect) return;
          if (delRes.success) confirmCloudDeletes('mitra', [delId]);
        }
      }
      const res = await fetchMitraFromSupabase();
      if (cancelledMitraEffect) return;
      if (!res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('mitra');
        const pendingSyncSet = getPendingSyncIdsSet('mitra');
        const syncedOnceBefore = hasCompletedInitialCloudSync('mitra');
        const remoteAll = res.data || [];

        const stubbornIds = remoteAll
          .filter((m) => m.id && deletedSet.has(String(m.id).trim()))
          .map((m) => String(m.id).trim());
        if (stubbornIds.length > 0 && !isDemoMode()) {
          Promise.all(
            stubbornIds.map((sid) =>
              deleteMitraFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('mitra', [sid]);
                })
                .catch(() => {})
            )
          );
        }

        const remoteClean = remoteAll.filter(
          (m) => m.id && !demoMitraIds.includes(m.id) && !deletedSet.has(String(m.id).trim())
        );
        const remoteIds = new Set(remoteClean.map((m) => String(m.id).trim()));
        const localValid = mitraListRef.current.filter(
          (m) => m.id && !demoMitraIds.includes(m.id) && !deletedSet.has(String(m.id).trim())
        );
        const localToUpload = localValid.filter((m) => {
          const cleanId = String(m.id).trim();
          if (pendingSyncSet.has(cleanId)) return true;
          if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
          return false;
        });
        if (localToUpload.length > 0 && !isDemoMode()) {
          seedMitraToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'mitra',
                  localToUpload.map((m) => String(m.id).trim())
                );
              }
            })
            .catch(() => {});
        }
        const map = new Map<string, Mitra>();
        remoteClean.forEach((m) => map.set(String(m.id).trim(), m));
        localToUpload.forEach((m) => {
          const cleanId = String(m.id).trim();
          if (!map.has(cleanId) || pendingSyncSet.has(cleanId)) map.set(cleanId, m);
        });
        const authoritative = Array.from(map.values());
        setMitraList(authoritative);
        persistMitraListNow(authoritative);
        markInitialCloudSyncCompleted('mitra');
      }
    })();

      mitraChannel = subscribeMitraRealtime(
        (newMitra) => {
          if (!newMitra?.id || ['MTR-001', 'MTR-002', 'MTR-003'].includes(newMitra.id)) return;
          if (getDeletedIdsSet('mitra').has(newMitra.id)) return;
          setMitraList((prev) => {
            const next = prev.some((m) => m.id === newMitra.id)
              ? prev.map((m) => (m.id === newMitra.id ? newMitra : m))
              : [newMitra, ...prev];
            persistMitraListNow(next);
            return next;
          });
        },
        (updatedMitra) => {
          if (!updatedMitra?.id || ['MTR-001', 'MTR-002', 'MTR-003'].includes(updatedMitra.id)) return;
          if (getDeletedIdsSet('mitra').has(updatedMitra.id)) return;
          setMitraList((prev) => {
            const next = prev.some((m) => m.id === updatedMitra.id)
              ? prev.map((m) => (m.id === updatedMitra.id ? updatedMitra : m))
              : [updatedMitra, ...prev];
            persistMitraListNow(next);
            return next;
          });
        },
        (deletedId) => {
          const cleanId = String(deletedId || '').trim();
          if (!cleanId) return;
          recordRemoteDeletedId('mitra', cleanId);
          setMitraList((prev) => {
            const next = prev.filter((m) => m.id !== cleanId);
            persistMitraListNow(next);
            return next;
          });
        }
      );
    };

    // 7d. Sync Master Data Supplier & PBF (tombstone-safe + replay pending deletes)
    const startSuppliersSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;
      const pendingDeleteSupplierIds = getPendingDeleteIds('suppliers');
      if (pendingDeleteSupplierIds.length > 0) {
        for (const delId of pendingDeleteSupplierIds) {
          const delRes = await deleteSupplierFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledSupplierEffect || isDemoMode()) return;
          if (delRes.success) confirmCloudDeletes('suppliers', [delId]);
        }
      }

      const res = await fetchSuppliersFromSupabase();
      if (cancelledSupplierEffect || isDemoMode()) return;
      setSuppliersNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('suppliers');
        const pendingSyncSet = getPendingSyncIdsSet('suppliers');
        const syncedOnceBefore = hasCompletedInitialCloudSync('suppliers');
        const remoteAll = res.data || [];

        const stubbornIds = remoteAll
          .filter((s) => s.id && deletedSet.has(String(s.id).trim()))
          .map((s) => String(s.id).trim());
        if (stubbornIds.length > 0) {
          Promise.all(
            stubbornIds.map((sid) =>
              deleteSupplierFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('suppliers', [sid]);
                })
                .catch(() => {})
            )
          );
        }

        const remoteClean = remoteAll.filter(
          (s) => s.id && !isDemoSupplierId(s.id) && !deletedSet.has(String(s.id).trim())
        );
        const remoteIds = new Set(remoteClean.map((s) => String(s.id).trim()));
        const localValid = suppliersRef.current.filter(
          (s) => s.id && !isDemoSupplierId(s.id) && !deletedSet.has(String(s.id).trim())
        );
        const localToUpload = localValid.filter((s) => {
          const cleanId = String(s.id).trim();
          if (pendingSyncSet.has(cleanId)) return true;
          if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
          return false;
        });
        if (localToUpload.length > 0) {
          seedSuppliersToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'suppliers',
                  localToUpload.map((s) => String(s.id).trim())
                );
              }
            })
            .catch(() => {});
        }
        const map = new Map<string, Supplier>();
        remoteClean.forEach((s) => map.set(String(s.id).trim(), s));
        localToUpload.forEach((s) => {
          const cleanId = String(s.id).trim();
          if (!map.has(cleanId) || pendingSyncSet.has(cleanId)) map.set(cleanId, s);
        });
        const authoritative = Array.from(map.values());
        setSuppliers(authoritative);
        persistSuppliersNow(authoritative);
        markInitialCloudSyncCompleted('suppliers');
      }

      if (!res.needsTableSetup && !cancelledSupplierEffect) {
        supplierChannel = subscribeSuppliersRealtime(
          (newSup) => {
            if (isDemoMode() || isDemoSupplierId(newSup.id)) return;
            if (getDeletedIdsSet('suppliers').has(newSup.id)) return;
            setSuppliers((prev) => {
              const next = prev.some((s) => s.id === newSup.id)
                ? prev.map((s) => (s.id === newSup.id ? newSup : s))
                : [newSup, ...prev];
              persistSuppliersNow(next);
              return next;
            });
          },
          (updatedSup) => {
            if (isDemoMode() || isDemoSupplierId(updatedSup.id)) return;
            if (getDeletedIdsSet('suppliers').has(updatedSup.id)) return;
            setSuppliers((prev) => {
              const next = prev.map((s) => (s.id === updatedSup.id ? updatedSup : s));
              persistSuppliersNow(next);
              return next;
            });
          },
          (delId) => {
            if (isDemoMode()) return;
            recordRemoteDeletedId('suppliers', delId);
            setSuppliers((prev) => {
              const next = prev.filter((s) => s.id !== delId);
              persistSuppliersNow(next);
              return next;
            });
          }
        );
      }
    })();
    };

    // 10c. Initial Inbound Sync & Safe Realtime: Pull Multi-Cabang (cabang & transfer_stok_cabang, tombstone-safe)
    const startBranchesSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;
      const pendingDeleteBranchIds = getPendingDeleteIds('branches');
      if (pendingDeleteBranchIds.length > 0) {
        for (const delId of pendingDeleteBranchIds) {
          const delRes = await deleteBranchFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledBranchEffect || isDemoMode()) return;
          if (delRes.success) confirmCloudDeletes('branches', [delId]);
        }
      }

      const res = await fetchBranchesFromSupabase();
      if (cancelledBranchEffect || isDemoMode()) return;
      if (res.needsTableSetup) {
        setMultiCabangNeedsTableSetup(true);
      }

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('branches');
        const pendingSyncSet = getPendingSyncIdsSet('branches');
        const syncedOnceBefore = hasCompletedInitialCloudSync('branches');
        const remoteAll = res.data || [];

        const stubbornIds = remoteAll
          .filter((b) => b.id && deletedSet.has(b.id))
          .map((b) => b.id);
        if (stubbornIds.length > 0) {
          Promise.all(
            stubbornIds.map((sid) =>
              deleteBranchFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('branches', [sid]);
                })
                .catch(() => {})
            )
          );
        }

        const remoteClean = remoteAll.filter(
          (b) => b.id && !isDemoBranchId(b.id) && !deletedSet.has(b.id)
        );
        const remoteIds = new Set(remoteClean.map((b) => b.id));
        const localValid = branchesRef.current.filter(
          (b) => b.id && !isDemoBranchId(b.id) && !deletedSet.has(b.id)
        );
        const localToUpload = localValid.filter(
          (b) => pendingSyncSet.has(b.id) || (!syncedOnceBefore && !remoteIds.has(b.id))
        );
        if (localToUpload.length > 0) {
          seedBranchesToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'branches',
                  localToUpload.map((b) => b.id)
                );
              }
            })
            .catch(() => {});
        }
        const map = new Map<string, Branch>();
        remoteClean.forEach((b) => map.set(b.id, b));
        localToUpload.forEach((b) => {
          if (!map.has(b.id) || pendingSyncSet.has(b.id)) map.set(b.id, b);
        });
        const merged = Array.from(map.values());
        if (merged.length > 0) {
          if (!merged.some((b) => b.isCentral)) {
            merged[0] = { ...merged[0], isCentral: true };
          }
          setBranches(merged);
          setCurrentBranch((curr) => merged.find((b) => b.id === curr.id) || merged[0] || curr);
        }
        markInitialCloudSyncCompleted('branches');
      }

      if (!res.needsTableSetup && !cancelledBranchEffect) {
        branchChannel = subscribeBranchesRealtime(
          (newBr) => {
            if (isDemoMode() || isDemoBranchId(newBr.id)) return;
            if (getDeletedIdsSet('branches').has(newBr.id)) return;
            setBranches((prev) => {
              const next = prev.some((b) => b.id === newBr.id)
                ? prev.map((b) => (b.id === newBr.id ? newBr : b))
                : [...prev, newBr];
              return next;
            });
          },
          (updatedBr) => {
            if (isDemoMode() || isDemoBranchId(updatedBr.id)) return;
            if (getDeletedIdsSet('branches').has(updatedBr.id)) return;
            setBranches((prev) => prev.map((b) => (b.id === updatedBr.id ? updatedBr : b)));
            setCurrentBranch((curr) => (curr.id === updatedBr.id ? updatedBr : curr));
          },
          (delId) => {
            if (isDemoMode()) return;
            recordRemoteDeletedId('branches', delId);
            setBranches((prev) => {
              const remaining = prev.filter((b) => b.id !== delId);
              return remaining.length > 0 ? remaining : prev;
            });
          }
        );
      }
    })();
    };

    const startBranchTransfersSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;
      const pendingDeleteTrfIds = getPendingDeleteIds('branch_transfers');
      if (pendingDeleteTrfIds.length > 0) {
        for (const delId of pendingDeleteTrfIds) {
          const delRes = await deleteBranchTransferFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledBranchEffect || isDemoMode()) return;
          if (delRes.success) confirmCloudDeletes('branch_transfers', [delId]);
        }
      }

      const res = await fetchBranchTransfersFromSupabase();
      if (cancelledBranchEffect || isDemoMode()) return;
      if (res.needsTableSetup) {
        setMultiCabangNeedsTableSetup(true);
      }

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('branch_transfers');
        const pendingSyncSet = getPendingSyncIdsSet('branch_transfers');
        const syncedOnceBefore = hasCompletedInitialCloudSync('branch_transfers');
        const remoteAll = res.data || [];

        const stubbornIds = remoteAll
          .filter((t) => t.id && deletedSet.has(t.id))
          .map((t) => t.id);
        if (stubbornIds.length > 0) {
          Promise.all(
            stubbornIds.map((sid) =>
              deleteBranchTransferFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('branch_transfers', [sid]);
                })
                .catch(() => {})
            )
          );
        }

        const remoteClean = remoteAll.filter(
          (t) => t.id && !isDemoTransferId(t.id) && !deletedSet.has(t.id)
        );
        const remoteIds = new Set(remoteClean.map((t) => t.id));
        const localValid = transfersRef.current.filter(
          (t) => t.id && !isDemoTransferId(t.id) && !deletedSet.has(t.id)
        );
        const localToUpload = localValid.filter(
          (t) => pendingSyncSet.has(t.id) || (!syncedOnceBefore && !remoteIds.has(t.id))
        );
        if (localToUpload.length > 0) {
          seedBranchTransfersToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'branch_transfers',
                  localToUpload.map((t) => t.id)
                );
              }
            })
            .catch(() => {});
        }
        const map = new Map<string, StockTransfer>();
        remoteClean.forEach((t) => map.set(t.id, t));
        localToUpload.forEach((t) => {
          if (!map.has(t.id) || pendingSyncSet.has(t.id)) map.set(t.id, t);
        });
        setTransfers(Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)));
        markInitialCloudSyncCompleted('branch_transfers');
      }

      if (!res.needsTableSetup && !cancelledBranchEffect) {
        branchTransferChannel = subscribeBranchTransfersRealtime(
          (newTrf) => {
            if (isDemoMode() || isDemoTransferId(newTrf.id)) return;
            if (getDeletedIdsSet('branch_transfers').has(newTrf.id)) return;
            setTransfers((prev) => {
              if (prev.some((t) => t.id === newTrf.id)) {
                return prev.map((t) => (t.id === newTrf.id ? newTrf : t));
              }
              return [newTrf, ...prev];
            });
          },
          (updatedTrf) => {
            if (isDemoMode() || isDemoTransferId(updatedTrf.id)) return;
            if (getDeletedIdsSet('branch_transfers').has(updatedTrf.id)) return;
            setTransfers((prev) => prev.map((t) => (t.id === updatedTrf.id ? updatedTrf : t)));
          },
          (delId) => {
            if (isDemoMode()) return;
            recordRemoteDeletedId('branch_transfers', delId);
            setTransfers((prev) => prev.filter((t) => t.id !== delId));
          }
        );
      }
    })();
    };

    // 10d. Initial Inbound Sync & Safe Realtime: Pull Riwayat Shift Kasir (riwayat_shift_kasir) dari Supabase
    const startCashierShiftsSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;

      // Step 1: Replay any pending clear-all or individual cloud deletes FIRST
      if (isClearAllPending('cashier_shifts')) {
        const pendingIds = getPendingDeleteIds('cashier_shifts');
        const clearRes = await clearCashierShiftsFromSupabase(pendingIds).catch((err) => ({
          success: false,
          error: err?.message || String(err)
        }));
        if (cancelledShiftEffect || isDemoMode()) return;
        if (clearRes.success) {
          confirmCloudDeletes('cashier_shifts', pendingIds);
          setClearAllPending('cashier_shifts', false);
        }
      } else {
        const pendingDeleteIds = getPendingDeleteIds('cashier_shifts');
        if (pendingDeleteIds.length > 0) {
          const delRes = await deleteCashierShiftsFromSupabase(pendingDeleteIds).catch((err) => ({
            success: false,
            error: err?.message || String(err)
          }));
          if (cancelledShiftEffect || isDemoMode()) return;
          if (delRes.success) {
            confirmCloudDeletes('cashier_shifts', pendingDeleteIds);
          }
        }
      }

      const res = await fetchCashierShiftsFromSupabase();
      if (cancelledShiftEffect || isDemoMode()) return;
      setCashierShiftsNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('cashier_shifts');
        const pendingSyncSet = getPendingSyncIdsSet('cashier_shifts');
        const remoteAll = res.data || [];

        // If any locally deleted shift still exists remotely, trigger background cleanup
        const stubbornDeletedRemoteIds = remoteAll
          .filter((s) => deletedSet.has(s.id))
          .map((s) => s.id);
        if (stubbornDeletedRemoteIds.length > 0) {
          deleteCashierShiftsFromSupabase(stubbornDeletedRemoteIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('cashier_shifts', stubbornDeletedRemoteIds);
              }
            })
            .catch(() => {});
        }

        const remoteClean = remoteAll.filter(
          (s) => s.id && !isDemoCashierShiftId(s.id) && !deletedSet.has(s.id)
        );
        const remoteIds = new Set(remoteClean.map((s) => s.id));
        const syncedOnceBefore = hasCompletedInitialCloudSync('cashier_shifts');

        const currentLocalShifts = cashierShiftsRef.current.filter(
          (s) => s.id && !isDemoCashierShiftId(s.id) && !deletedSet.has(s.id)
        );
        const localToUpload = currentLocalShifts.filter((s) => {
          if (pendingSyncSet.has(s.id)) return true;
          if (!syncedOnceBefore && res.isEmpty && !remoteIds.has(s.id)) return true;
          return false;
        });

        if (localToUpload.length > 0) {
          seedCashierShiftsToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync('cashier_shifts', localToUpload.map((s) => s.id));
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, CashierShiftSession>();
        remoteClean.forEach((s) => map.set(s.id, s));
        localToUpload.forEach((s) => {
          if (!map.has(s.id) || pendingSyncSet.has(s.id)) {
            map.set(s.id, s);
          }
        });
        const authoritative = Array.from(map.values()).sort(
          (a, b) => (Number(b.openTimestamp) || 0) - (Number(a.openTimestamp) || 0)
        );
        setCashierShifts(authoritative);
        persistCashierShiftsNow(authoritative);
        markInitialCloudSyncCompleted('cashier_shifts');
      }

      if (!res.needsTableSetup && !cancelledShiftEffect) {
        cashierShiftChannel = subscribeCashierShiftsRealtime(
          (newShift) => {
            if (isDemoMode() || isDemoCashierShiftId(newShift.id)) return;
            if (getDeletedIdsSet('cashier_shifts').has(newShift.id)) return;
            setCashierShifts((prev) => {
              const next = prev.some((s) => s.id === newShift.id)
                ? prev.map((s) => (s.id === newShift.id ? newShift : s))
                : [newShift, ...prev];
              persistCashierShiftsNow(next);
              return next;
            });
          },
          (updatedShift) => {
            if (isDemoMode() || isDemoCashierShiftId(updatedShift.id)) return;
            if (getDeletedIdsSet('cashier_shifts').has(updatedShift.id)) return;
            setCashierShifts((prev) => {
              const next = prev.map((s) => (s.id === updatedShift.id ? updatedShift : s));
              persistCashierShiftsNow(next);
              return next;
            });
          },
          (delId) => {
            if (isDemoMode()) return;
            recordRemoteDeletedId('cashier_shifts', delId);
            setCashierShifts((prev) => {
              const next = prev.filter((s) => s.id !== delId);
              persistCashierShiftsNow(next);
              return next;
            });
          }
        );
      }
    })();
    };

    // 10e. Initial Inbound Sync & Safe Realtime: Pull Faktur Pembelian & Hutang PBF (faktur_pembelian, tombstone-safe)
    const startPurchaseInvoicesSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;
      const pendingDeleteInvIds = getPendingDeleteIds('purchase_invoices');
      if (pendingDeleteInvIds.length > 0) {
        for (const delId of pendingDeleteInvIds) {
          const delRes = await deletePurchaseInvoiceFromSupabase(delId).catch(() => ({ success: false }));
          if (cancelledPurchaseInvoiceEffect || isDemoMode()) return;
          if (delRes.success) confirmCloudDeletes('purchase_invoices', [delId]);
        }
      }

      const res = await fetchPurchaseInvoicesFromSupabase();
      if (cancelledPurchaseInvoiceEffect || isDemoMode()) return;

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('purchase_invoices');
        const pendingSyncSet = getPendingSyncIdsSet('purchase_invoices');
        const syncedOnceBefore = hasCompletedInitialCloudSync('purchase_invoices');
        const remoteAll = res.data || [];

        const stubbornIds = remoteAll
          .filter((inv) => inv.id && deletedSet.has(inv.id))
          .map((inv) => inv.id);
        if (stubbornIds.length > 0) {
          Promise.all(
            stubbornIds.map((sid) =>
              deletePurchaseInvoiceFromSupabase(sid)
                .then((dRes) => {
                  if (dRes.success) confirmCloudDeletes('purchase_invoices', [sid]);
                })
                .catch(() => {})
            )
          );
        }

        const remoteClean = remoteAll.filter(
          (inv) => inv.id && !isDemoPurchaseInvoiceId(inv.id) && !deletedSet.has(inv.id)
        );
        const remoteIds = new Set(remoteClean.map((inv) => inv.id));
        const localValid = purchaseInvoicesRef.current.filter(
          (inv) => inv.id && !isDemoPurchaseInvoiceId(inv.id) && !deletedSet.has(inv.id)
        );
        const localToUpload = localValid.filter(
          (inv) => pendingSyncSet.has(inv.id) || (!syncedOnceBefore && !remoteIds.has(inv.id))
        );
        if (localToUpload.length > 0) {
          seedPurchaseInvoicesToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync(
                  'purchase_invoices',
                  localToUpload.map((inv) => inv.id)
                );
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, PurchaseInvoice>();
        remoteClean.forEach((inv) => map.set(inv.id, inv));
        localToUpload.forEach((inv) => {
          if (!map.has(inv.id) || pendingSyncSet.has(inv.id)) map.set(inv.id, inv);
        });
        const authoritative = Array.from(map.values()).sort((a, b) =>
          (b.date || '').localeCompare(a.date || '')
        );
        setPurchaseInvoices(authoritative);
        persistPurchaseInvoicesNow(authoritative);
        markInitialCloudSyncCompleted('purchase_invoices');
      }

      if (!res.needsTableSetup && !cancelledPurchaseInvoiceEffect) {
        purchaseInvoiceChannel = subscribePurchaseInvoicesRealtime(
          (newInv) => {
            if (isDemoMode() || isDemoPurchaseInvoiceId(newInv.id)) return;
            if (getDeletedIdsSet('purchase_invoices').has(newInv.id)) return;
            setPurchaseInvoices((prev) => {
              const next = prev.some((i) => i.id === newInv.id)
                ? prev.map((i) => (i.id === newInv.id ? newInv : i))
                : [newInv, ...prev];
              persistPurchaseInvoicesNow(next);
              return next;
            });
          },
          (updatedInv) => {
            if (isDemoMode() || isDemoPurchaseInvoiceId(updatedInv.id)) return;
            if (getDeletedIdsSet('purchase_invoices').has(updatedInv.id)) return;
            setPurchaseInvoices((prev) => {
              const next = prev.map((i) => (i.id === updatedInv.id ? updatedInv : i));
              persistPurchaseInvoicesNow(next);
              return next;
            });
          },
          (delId) => {
            if (isDemoMode()) return;
            recordRemoteDeletedId('purchase_invoices', delId);
            setPurchaseInvoices((prev) => {
              const next = prev.filter((i) => i.id !== delId);
              persistPurchaseInvoicesNow(next);
              return next;
            });
          }
        );
      }
    })();
    };

    // 10f. Initial Inbound Sync & Safe Realtime: Pull Pesanan Pembelian & Riwayat Surat Pesanan (surat_pesanan)
    const startPurchaseOrdersSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;

      const pendingDeleteIds = getPendingDeleteIds('purchase_orders');
      if (pendingDeleteIds.length > 0) {
        const delRes = await deletePurchaseOrdersFromSupabase(pendingDeleteIds).catch((err) => ({
          success: false,
          needsTableSetup: false,
          error: err?.message || String(err)
        }));
        if (cancelledPurchaseOrderEffect || isDemoMode()) return;
        if (delRes.success) {
          confirmCloudDeletes('purchase_orders', pendingDeleteIds);
        }
      }

      const res = await fetchPurchaseOrdersFromSupabase();
      if (cancelledPurchaseOrderEffect || isDemoMode()) return;
      setPurchaseOrdersNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('purchase_orders');
        const pendingSyncSet = getPendingSyncIdsSet('purchase_orders');
        const remoteAll = res.data || [];

        const stubbornDeletedRemoteIds = remoteAll
          .filter((po) => deletedSet.has(po.id))
          .map((po) => po.id);
        if (stubbornDeletedRemoteIds.length > 0) {
          deletePurchaseOrdersFromSupabase(stubbornDeletedRemoteIds)
            .then((cleanupRes) => {
              if (cleanupRes.success) {
                confirmCloudDeletes('purchase_orders', stubbornDeletedRemoteIds);
              }
            })
            .catch(() => {});
        }

        const remoteClean = remoteAll.filter(
          (po) => po.id && !isDemoPurchaseOrderId(po.id) && !deletedSet.has(po.id)
        );
        const remoteIds = new Set(remoteClean.map((po) => po.id));
        const syncedOnceBefore = hasCompletedInitialCloudSync('purchase_orders');

        const currentLocalOrders = purchaseOrdersRef.current.filter(
          (po) => po.id && !isDemoPurchaseOrderId(po.id) && !deletedSet.has(po.id)
        );
        const localToUpload = currentLocalOrders.filter((po) => {
          if (pendingSyncSet.has(po.id)) return true;
          if (!syncedOnceBefore && res.isEmpty && !remoteIds.has(po.id)) return true;
          return false;
        });

        if (localToUpload.length > 0) {
          seedPurchaseOrdersToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync('purchase_orders', localToUpload.map((po) => po.id));
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, PurchaseOrder>();
        remoteClean.forEach((po) => map.set(po.id, po));
        localToUpload.forEach((po) => {
          if (!map.has(po.id) || pendingSyncSet.has(po.id)) {
            map.set(po.id, po);
          }
        });
        const authoritative = Array.from(map.values()).sort((a, b) =>
          `${b.date || ''} ${b.createdAt || ''}`.localeCompare(`${a.date || ''} ${a.createdAt || ''}`)
        );
        setPurchaseOrders(authoritative);
        persistPurchaseOrdersNow(authoritative);
        markInitialCloudSyncCompleted('purchase_orders');
      }

      if (!res.needsTableSetup && !cancelledPurchaseOrderEffect) {
        purchaseOrderChannel = subscribePurchaseOrdersRealtime(
          (newPo) => {
            if (isDemoMode() || isDemoPurchaseOrderId(newPo.id)) return;
            if (getDeletedIdsSet('purchase_orders').has(newPo.id)) return;
            setPurchaseOrders((prev) => {
              const next = prev.some((p) => p.id === newPo.id)
                ? prev.map((p) => (p.id === newPo.id ? newPo : p))
                : [newPo, ...prev];
              persistPurchaseOrdersNow(next);
              return next;
            });
          },
          (updatedPo) => {
            if (isDemoMode() || isDemoPurchaseOrderId(updatedPo.id)) return;
            if (getDeletedIdsSet('purchase_orders').has(updatedPo.id)) return;
            setPurchaseOrders((prev) => {
              const next = prev.some((p) => p.id === updatedPo.id)
                ? prev.map((p) => (p.id === updatedPo.id ? updatedPo : p))
                : [updatedPo, ...prev];
              persistPurchaseOrdersNow(next);
              return next;
            });
          },
          (delId) => {
            if (isDemoMode()) return;
            recordRemoteDeletedId('purchase_orders', delId);
            setPurchaseOrders((prev) => {
              const next = prev.filter((p) => p.id !== delId);
              persistPurchaseOrdersNow(next);
              return next;
            });
          }
        );
        purchaseOrderChannelRef.current = purchaseOrderChannel;
      }
    })();
    };

    // 10g. Initial Inbound Sync & Safe Realtime: Strategi Marketing (strategi_marketing)
    const startMarketingSync = () => {
      if (effectDisposed || isDemoMode()) return;
      (async () => {
      if (isDemoMode()) return;

      const pendingDeleteIds = getPendingDeleteIds('marketing_campaigns');
      if (pendingDeleteIds.length > 0) {
        const delRes = await deleteMarketingCampaignsFromSupabase(pendingDeleteIds).catch((err) => ({
          success: false,
          needsTableSetup: false,
          error: err?.message || String(err)
        }));
        if (cancelledMarketingEffect || isDemoMode()) return;
        if (delRes.success) {
          confirmCloudDeletes('marketing_campaigns', pendingDeleteIds);
        }
      }

      const res = await fetchMarketingCampaignsFromSupabase();
      if (cancelledMarketingEffect || isDemoMode()) return;
      setMarketingNeedsTableSetup(Boolean(res.needsTableSetup));

      if (!res.needsTableSetup && !res.error && res.data !== null) {
        const deletedSet = getDeletedIdsSet('marketing_campaigns');
        const pendingSyncSet = getPendingSyncIdsSet('marketing_campaigns');
        const remoteClean = (res.data || []).filter(
          (c) => c.id && !isDemoMarketingCampaignId(c.id) && !deletedSet.has(c.id)
        );
        const remoteIds = new Set(remoteClean.map((c) => c.id));
        const syncedOnceBefore = hasCompletedInitialCloudSync('marketing_campaigns');

        const localClean = marketingCampaignsRef.current.filter(
          (c) => c.id && !isDemoMarketingCampaignId(c.id) && !deletedSet.has(c.id)
        );
        const localToUpload = localClean.filter((c) => {
          if (pendingSyncSet.has(c.id)) return true;
          if (!syncedOnceBefore && res.isEmpty && !remoteIds.has(c.id)) return true;
          return false;
        });

        if (localToUpload.length > 0) {
          seedMarketingCampaignsToSupabase(localToUpload)
            .then((seedRes) => {
              if (seedRes.success) {
                confirmCloudSync('marketing_campaigns', localToUpload.map((c) => c.id));
              }
            })
            .catch(() => {});
        }

        const map = new Map<string, MarketingCampaign>();
        remoteClean.forEach((c) => map.set(c.id, c));
        localToUpload.forEach((c) => {
          if (!map.has(c.id) || pendingSyncSet.has(c.id)) map.set(c.id, c);
        });
        const authoritative = Array.from(map.values()).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        );
        setMarketingCampaigns(authoritative);
        persistMarketingCampaignsNow(authoritative);
        markInitialCloudSyncCompleted('marketing_campaigns');
      }

      if (!res.needsTableSetup && !cancelledMarketingEffect) {
        marketingChannel = subscribeMarketingCampaignsRealtime(
          (newCamp) => {
            if (isDemoMode() || isDemoMarketingCampaignId(newCamp.id)) return;
            if (getDeletedIdsSet('marketing_campaigns').has(newCamp.id)) return;
            setMarketingCampaigns((prev) => {
              const next = prev.some((c) => c.id === newCamp.id)
                ? prev.map((c) => (c.id === newCamp.id ? newCamp : c))
                : [newCamp, ...prev];
              persistMarketingCampaignsNow(next);
              return next;
            });
          },
          (updatedCamp) => {
            if (isDemoMode() || isDemoMarketingCampaignId(updatedCamp.id)) return;
            if (getDeletedIdsSet('marketing_campaigns').has(updatedCamp.id)) return;
            setMarketingCampaigns((prev) => {
              const next = prev.some((c) => c.id === updatedCamp.id)
                ? prev.map((c) => (c.id === updatedCamp.id ? updatedCamp : c))
                : [updatedCamp, ...prev];
              persistMarketingCampaignsNow(next);
              return next;
            });
          },
          (delId) => {
            if (isDemoMode()) return;
            recordRemoteDeletedId('marketing_campaigns', delId);
            setMarketingCampaigns((prev) => {
              const next = prev.filter((c) => c.id !== delId);
              persistMarketingCampaignsNow(next);
              return next;
            });
          }
        );
        marketingChannelRef.current = marketingChannel;
      }
    })();
    };

    const scheduleWave = (delayMs: number, fn: () => void) => {
      const tid = window.setTimeout(() => {
        if (!effectDisposed && !isDemoMode()) {
          fn();
        }
      }, delayMs);
      waveTimers.push(tid);
    };

    if (isLoginOrRegView) {
      // Mode Login / Registrasi Pegawai: hanya sinkronkan profil fasilitas, daftar pegawai & cabang
      startFacilityProfileSync();
      startStaffSync();
      startBranchesSync();
    } else if (isPortalView) {
      // Mode Portal Pelanggan / Mitra: hanya muat katalog, promo, jadwal, cabang, order mitra, registrasi & pasien
      startFacilityProfileSync();
      startStaffSync();
      startBranchesSync();
      startMedicinesSync();
      startSchedulesSync();
      startMitraOrdersSync();
      scheduleWave(250, () => {
        startPromoDiscountSync();
        startMitraSync();
        startOnlineRegSync();
        startPatientsSync();
      });
    } else if (isFullAppView) {
      // Mode ERP Terautentikasi: sinkronisasi bertahap 3 gelombang agar main thread mobile tetap ringan
      startFacilityProfileSync();
      startStaffSync();
      startBranchesSync();
      startMedicinesSync();
      startSchedulesSync();
      startPatientsSync();
      startOnlineRegSync();
      startPrescriptionsSync();
      startMitraOrdersSync();

      scheduleWave(350, () => {
        startTransactionsSync();
        startStockCardSync();
        startCashierShiftsSync();
        startFeeConfigSync();
        startFeeLedgerSync();
        startPromoDiscountSync();
        startMitraSync();
        startSuppliersSync();
      });

      scheduleWave(900, () => {
        startRmeSync();
        startLabSync();
        startOpnameSync();
        startMorbiditySync();
        startPurchaseInvoicesSync();
        startPurchaseOrdersSync();
        startMarketingSync();
        startBranchTransfersSync();
        startIcdSync();
      });
    }

    return () => {
      effectDisposed = true;
      waveTimers.forEach((tid) => window.clearTimeout(tid));
      if (patientBatchTimer !== null) {
        window.clearTimeout(patientBatchTimer);
        patientBatchTimer = null;
      }
      cancelledPatientsEffect = true;
      cancelledStaffEffect = true;
      cancelledMitraEffect = true;
      cancelledMitraOrderEffect = true;
      cancelledFeeConfigEffect = true;
      cancelledFeeLedgerEffect = true;
      cancelledPromoDiscountEffect = true;
      cancelledRmeEffect = true;
      cancelledMorbidityEffect = true;
      cancelledTransactionEffect = true;
      cancelledStockCardEffect = true;
      cancelledLabEffect = true;
      cancelledOpnameEffect = true;
      cancelledScheduleEffect = true;
      cancelledMedicineEffect = true;
      cancelledSupplierEffect = true;
      cancelledBranchEffect = true;
      cancelledShiftEffect = true;
      cancelledPurchaseInvoiceEffect = true;
      cancelledPurchaseOrderEffect = true;
      cancelledMarketingEffect = true;
      cancelledPrescriptionEffect = true;

      const activeClient = getSupabaseClient();
      if (activeClient) {
        if (patientChannel) activeClient.removeChannel(patientChannel);
        if (onlineRegChannel) activeClient.removeChannel(onlineRegChannel);
        if (icdChannel) activeClient.removeChannel(icdChannel);
        if (staffChannel) activeClient.removeChannel(staffChannel);
        if (rmeChannel) activeClient.removeChannel(rmeChannel);
        if (morbidityChannel) activeClient.removeChannel(morbidityChannel);
        if (transactionChannel) activeClient.removeChannel(transactionChannel);
        if (stockCardChannel) activeClient.removeChannel(stockCardChannel);
        if (labChannel) activeClient.removeChannel(labChannel);
        if (opnameChannel) activeClient.removeChannel(opnameChannel);
        if (opnameChannelRef.current && opnameChannelRef.current !== opnameChannel) {
          activeClient.removeChannel(opnameChannelRef.current);
        }
        opnameChannelRef.current = null;
        if (scheduleChannel) activeClient.removeChannel(scheduleChannel);
        if (medicineChannel) activeClient.removeChannel(medicineChannel);
        if (medicineChannelRef.current && medicineChannelRef.current !== medicineChannel) {
          activeClient.removeChannel(medicineChannelRef.current);
        }
        medicineChannelRef.current = null;
        if (mitraChannel) activeClient.removeChannel(mitraChannel);
        if (mitraOrderChannel) activeClient.removeChannel(mitraOrderChannel);
        if (supplierChannel) activeClient.removeChannel(supplierChannel);
        if (branchChannel) activeClient.removeChannel(branchChannel);
        if (branchTransferChannel) activeClient.removeChannel(branchTransferChannel);
        if (cashierShiftChannel) activeClient.removeChannel(cashierShiftChannel);
        if (purchaseInvoiceChannel) activeClient.removeChannel(purchaseInvoiceChannel);
        if (purchaseOrderChannel) activeClient.removeChannel(purchaseOrderChannel);
        if (
          purchaseOrderChannelRef.current &&
          purchaseOrderChannelRef.current !== purchaseOrderChannel
        ) {
          activeClient.removeChannel(purchaseOrderChannelRef.current);
        }
        purchaseOrderChannelRef.current = null;
        if (marketingChannel) activeClient.removeChannel(marketingChannel);
        if (
          marketingChannelRef.current &&
          marketingChannelRef.current !== marketingChannel
        ) {
          activeClient.removeChannel(marketingChannelRef.current);
        }
        marketingChannelRef.current = null;
        if (facilityProfileChannel) activeClient.removeChannel(facilityProfileChannel);
        if (prescriptionChannel) activeClient.removeChannel(prescriptionChannel);
        if (promoDiscountChannel) activeClient.removeChannel(promoDiscountChannel);
        if (feeConfigChannel) activeClient.removeChannel(feeConfigChannel);
        if (feeLedgerChannel) activeClient.removeChannel(feeLedgerChannel);
      }
    };
  }, [isDemoActive, isLoggedIn, showMitraPortal, showPublicPortal, showStaffRegistration]);

  // Cross-tab instant sync for staffList & rolePermissions (including ?view=registrasi-pegawai in another tab)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const staffStorageKey = getScopedStorageKey('latisha_staff');
    const rolePermStorageKey = getScopedStorageKey('latisha_role_permissions');

    const applySyncedStaffList = (parsed: unknown) => {
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const pendingDeleteSet = new Set(getPendingDeleteIds('staff'));
      const valid = parsed
        .filter((st: Staff) => st?.id && !pendingDeleteSet.has(String(st.id).trim()))
        .map((st: Staff) => ensurePrimaryOwnerStaffRole(st).staff);
      if (valid.length > 0) setStaffList(valid);
    };

    const handleStaffStorageSync = (e: StorageEvent) => {
      if (e.key === staffStorageKey && e.newValue) {
        try {
          applySyncedStaffList(JSON.parse(e.newValue));
        } catch {}
      } else if (e.key === rolePermStorageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === 'object') {
            setRolePermissions(normalizeRolePermissionsMap(parsed));
          }
        } catch {}
      }
    };

    const handleLocalRolePermEvent = (ev: Event) => {
      const customEv = ev as CustomEvent<Record<string, string[]>>;
      if (customEv?.detail && typeof customEv.detail === 'object') {
        setRolePermissions(normalizeRolePermissionsMap(customEv.detail));
      }
    };

    let rbacChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        rbacChannel = new BroadcastChannel(getDemoBroadcastChannelName(RBAC_BROADCAST_CHANNEL_BASE));
        rbacChannel.onmessage = (event: MessageEvent) => {
          const msg = event?.data as { type?: string; payload?: unknown } | null;
          if (!msg) return;
          if (msg.type === 'role_permissions' && msg.payload && typeof msg.payload === 'object') {
            setRolePermissions(normalizeRolePermissionsMap(msg.payload as Record<string, string[]>));
          } else if (msg.type === 'staff_list') {
            applySyncedStaffList(msg.payload);
          }
        };
      } catch {}
    }

    // Fallback cloud sync saat window kembali aktif atau berkala (agar pendaftaran pegawai dari GitHub link tetap masuk walau Realtime WebSocket sempat putus)
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastStaffCloudSyncAtRef.current < 12000) return;
      void refreshStaffFromCloud({ silent: true });
    };
    const staffPollInterval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void refreshStaffFromCloud({ silent: true });
      }
    }, 25000);

    window.addEventListener('storage', handleStaffStorageSync);
    window.addEventListener(ROLE_PERMISSIONS_UPDATED_EVENT, handleLocalRolePermEvent);
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    return () => {
      window.removeEventListener('storage', handleStaffStorageSync);
      window.removeEventListener(ROLE_PERMISSIONS_UPDATED_EVENT, handleLocalRolePermEvent);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.clearInterval(staffPollInterval);
      try {
        rbacChannel?.close();
      } catch {}
    };
  }, [isDemoActive, refreshStaffFromCloud]);

  // Resolve current logged-in staff account & effective RBAC permissions live from staffList
  const currentStaff: Staff | undefined = useMemo(
    () =>
      staffList.find((s) => s.id === activeStaffId) ||
      staffList.find((s) => userName.toLowerCase().includes(s.name.toLowerCase())) ||
      staffList[0],
    [staffList, activeStaffId, userName]
  );

  const currentStaffRoles: StaffRole[] = useMemo(
    () => getStaffActiveRoles(currentStaff, activeRole),
    [currentStaff, activeRole]
  );
  const allowedPermissions: string[] = useMemo(
    () => resolveStaffEffectivePermissions(currentStaff, activeRole, rolePermissions),
    [currentStaff, activeRole, rolePermissions]
  );

  // Sync activeRole, userName, and activeTab whenever staffList or rolePermissions are updated
  useEffect(() => {
    if (!currentStaff) return;

    // Keep userName in sync if currentStaff's name was edited in Pengaturan Sistem
    if (currentStaff.id === activeStaffId && currentStaff.name && userName !== currentStaff.name) {
      setUserName(currentStaff.name);
    }

    // Ensure activeRole is one of the employee's active checked roles
    const validRoles = getStaffActiveRoles(currentStaff, currentStaff.role);
    if (isPrimaryOwnerStaffRecord(currentStaff) && !isOwnerAdminRole(activeRole)) {
      setActiveRole(OWNER_ADMIN_ROLE);
    } else if (!validRoles.includes(activeRole)) {
      const nextRole = validRoles.some((r) => isOwnerAdminRole(r))
        ? 'APJ / Owner'
        : validRoles[0];
      setActiveRole(nextRole);
    }

    // Ensure activeTab is permitted for the current employee & role
    const effectivePerms = resolveStaffEffectivePermissions(
      currentStaff,
      validRoles.includes(activeRole) ? activeRole : validRoles[0],
      rolePermissions
    );
    if (!effectivePerms.includes(activeTab)) {
      const fallbackTab = effectivePerms[0] || 'dashboard';
      if (fallbackTab !== activeTab) {
        setActiveTab(fallbackTab);
      }
    }

    // Disable mobile field mode if employee no longer has 'mobile-lapangan' permission
    if (isMobileMode && !effectivePerms.includes('mobile-lapangan')) {
      setIsMobileMode(false);
    }
  }, [currentStaff, activeStaffId, activeRole, rolePermissions, activeTab, isMobileMode, userName]);

  const addAuditLog = (module: string, detail: string) => {
    auditLogSequence += 1;
    const newLog: AuditLog = {
      id: `LOG-${Date.now().toString().slice(-6)}-${auditLogSequence.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      time: new Date().toLocaleTimeString('id-ID'),
      role: activeRole,
      user: userName,
      module,
      detail,
      branchId: currentBranch.id
    };
    setAuditLogs((prev) => [newLog, ...prev].slice(0, 500));
  };

  // Handler: Sync Now (2-Way Real-Time Cloud Sync for Multi-Cabang & Transfer Stok)
  const handleSyncNow = async (): Promise<{
    success?: boolean;
    branchCount?: number;
    transferCount?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    setIsSyncing(true);
    addAuditLog('Multi-Cabang Sync', `Sinkronisasi data real-time dengan server cabang ${currentBranch.name}`);

    if (isDemoActive || isDemoMode()) {
      setTimeout(() => {
        setIsSyncing(false);
        setBranches((prev) =>
          prev.map((b) => ({
            ...b,
            lastSyncTime: 'Baru saja (Demo)',
            syncStatus: 'Tersinkronisasi'
          }))
        );
      }, 600);
      return {
        success: true,
        isDemo: true,
        branchCount: branches.length,
        transferCount: transfers.length
      };
    }

    try {
      const [brRes, trfRes] = await Promise.all([
        fetchBranchesFromSupabase({ forceRefresh: true }),
        fetchBranchTransfersFromSupabase({ forceRefresh: true }),
        handleSyncMedicinesSupabase()
      ]);

      const needsSetup = Boolean(brRes.needsTableSetup || trfRes.needsTableSetup);
      setMultiCabangNeedsTableSetup(needsSetup);

      if (needsSetup) {
        setIsSyncing(false);
        return {
          success: false,
          needsTableSetup: true,
          error: brRes.error || trfRes.error || 'Tabel cabang / transfer_stok_cabang belum dibuat di Supabase.'
        };
      }

      const nowTimeLabel = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      }) + ' WIB';

      const brMap = new Map<string, Branch>();
      branches
        .filter((b) => !isDemoBranchId(b.id))
        .forEach((b) =>
          brMap.set(b.id, {
            ...b,
            syncStatus: 'Tersinkronisasi',
            lastSyncTime: nowTimeLabel
          })
        );
      (brRes.data || []).forEach((b) =>
        brMap.set(b.id, {
          ...b,
          syncStatus: 'Tersinkronisasi',
          lastSyncTime: nowTimeLabel
        })
      );
      const mergedBranches = Array.from(brMap.values());
      if (mergedBranches.length > 0 && !mergedBranches.some((b) => b.isCentral)) {
        mergedBranches[0] = { ...mergedBranches[0], isCentral: true };
      }

      setBranches(mergedBranches);
      setCurrentBranch((curr) => mergedBranches.find((b) => b.id === curr.id) || mergedBranches[0] || curr);
      await seedBranchesToSupabase(mergedBranches);

      const trfMap = new Map<string, StockTransfer>();
      transfers
        .filter((t) => !isDemoTransferId(t.id))
        .forEach((t) => trfMap.set(t.id, t));
      (trfRes.data || []).forEach((t) => trfMap.set(t.id, t));
      const mergedTransfers = Array.from(trfMap.values()).sort((a, b) =>
        b.date.localeCompare(a.date)
      );

      setTransfers(mergedTransfers);
      if (mergedTransfers.length > 0) {
        await seedBranchTransfersToSupabase(mergedTransfers);
      }

      setIsSyncing(false);
      return {
        success: true,
        branchCount: mergedBranches.length,
        transferCount: mergedTransfers.length
      };
    } catch (err: any) {
      setIsSyncing(false);
      return {
        success: false,
        error: err?.message || String(err)
      };
    }
  };

  // Handler: Queue Status Update
  const handleUpdateQueueStatus = (nomor: string, newStatus: PatientQueue['status']) => {
    setQueue((prev) =>
      prev.map((q) => (q.nomor === nomor ? { ...q, status: newStatus } : q))
    );
    addAuditLog('Live Antrean', `Status antrean ${nomor} diperbarui menjadi '${newStatus}'`);
  };

  const handleCallNext = () => {
    if (queue.length === 0) return;
    const current = queue.find((q) => q.status === 'Diperiksa') || queue[0];
    if (current) {
      handleUpdateQueueStatus(current.nomor, 'Selesai');
    }
  };

  // Handler: Save RME & Dispatch E-Prescription
  const handleSaveRME = (record: RMERecord, prescription?: EPrescription) => {
    setRmeRecords((prev) => {
      const next = [record, ...prev.filter((r) => r.id !== record.id)];
      persistRmeNow(next);
      return next;
    });
    if (prescription) {
      setPrescriptions((prev) => {
        const next = [prescription, ...prev.filter((p) => p.id !== prescription.id)];
        persistPrescriptionsNow(next);
        return next;
      });
      if (!isDemoActive && !isDemoMode()) {
        markIdsPendingSync('prescriptions', [prescription.id]);
        syncPrescriptionToSupabase(prescription)
          .then((res) => {
            if (res.success) confirmCloudSync('prescriptions', [prescription.id]);
          })
          .catch((err) => console.warn('Supabase prescription sync error:', err));
      }
    }
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('rme_records', [record.id]);
      syncRmeToSupabase(record)
        .then((res) => {
          if (res.needsTableSetup) setRmeNeedsTableSetup(true);
          if (res.success) {
            confirmCloudSync('rme_records', [record.id]);
            const matchedPat = patients.find(
              (p) =>
                p.noRm === record.rmId ||
                p.id === record.rmId ||
                (record.nik && p.nik === record.nik) ||
                p.name.toLowerCase() === record.patientName.toLowerCase()
            );
            enqueueClinicalSatuSehatBackground({
              rmeRecord: record,
              patient: matchedPat,
              prescription
            });
          }
        })
        .catch((err) => console.warn('Supabase RME sync error:', err));
    }
    addAuditLog('RME Dokter', `Pemeriksaan RME pasien ${record.patientName} (${record.rmId}) disimpan.`);
  };

  // Handler: Update RME Record & Auto-Sync Antrean E-Resep & Skrining Standar Apoteker
  const handleUpdateRME = (updatedRecord: RMERecord) => {
    const prevRecord = rmeRecordsRef.current.find((rec) => rec.id === updatedRecord.id);

    setRmeRecords((prev) => {
      const next = prev.map((rec) => (rec.id === updatedRecord.id ? updatedRecord : rec));
      persistRmeNow(next);
      return next;
    });

    const nextItems = updatedRecord.prescription ? [...updatedRecord.prescription] : [];
    const nextTimestamp = `${updatedRecord.date} ${updatedRecord.time}`.trim();

    let rxToSync: EPrescription | null = null;
    let rxIdToDelete: string | null = null;

    let matchedIdx = prescriptions.findIndex((rx) => rx.rmeRecordId === updatedRecord.id);
    if (matchedIdx === -1 && prevRecord) {
      const prevTs = `${prevRecord.date} ${prevRecord.time}`.trim();
      matchedIdx = prescriptions.findIndex(
        (rx) => rx.rmId === prevRecord.rmId && rx.timestamp.trim() === prevTs
      );
    }
    if (matchedIdx === -1 && prevRecord) {
      matchedIdx = prescriptions.findIndex(
        (rx) =>
          rx.rmId === prevRecord.rmId &&
          rx.timestamp.startsWith(prevRecord.date) &&
          rx.status === 'Pending Skrining'
      );
    }
    if (matchedIdx === -1 && prevRecord) {
      matchedIdx = prescriptions.findIndex(
        (rx) => rx.rmId === prevRecord.rmId && rx.timestamp.startsWith(prevRecord.date)
      );
    }

    if (matchedIdx !== -1) {
      const target = prescriptions[matchedIdx];
      if (nextItems.length === 0 && target.status === 'Pending Skrining') {
        rxIdToDelete = target.id;
        markIdsDeleted('prescriptions', [target.id]);
        setPrescriptions((prev) => {
          const next = prev.filter((rx) => rx.id !== target.id);
          persistPrescriptionsNow(next);
          return next;
        });
      } else {
        const revertedFromReject = target.status === 'Ditolak' && nextItems.length > 0;
        const updatedRx: EPrescription = {
          ...target,
          rmeRecordId: updatedRecord.id,
          rmId: updatedRecord.rmId,
          patientName: updatedRecord.patientName,
          doctorName: updatedRecord.doctorName,
          items: nextItems,
          assignedStaff: updatedRecord.assignedStaff ? [...updatedRecord.assignedStaff] : target.assignedStaff,
          timestamp: nextTimestamp || target.timestamp,
          branchId: updatedRecord.branchId || target.branchId,
          status: revertedFromReject ? 'Pending Skrining' : target.status,
          screeningNotes: revertedFromReject
            ? 'Diperbarui dari Edit e-RME — menunggu skrining ulang apoteker.'
            : target.screeningNotes
        };
        rxToSync = updatedRx;
        if (activePrescriptionForPOS?.id === target.id) {
          setActivePrescriptionForPOS(updatedRx);
        }
        setPrescriptions((prev) => {
          const next = prev.map((rx) => (rx.id === target.id ? updatedRx : rx));
          persistPrescriptionsNow(next);
          return next;
        });
      }
    } else if (nextItems.length > 0) {
      // Jika RME sebelumnya belum memiliki E-Resep dan sekarang ditambahkan obat, otomatis buat antrean E-Resep baru
      const newRx: EPrescription = {
        id: `RX-${Date.now().toString().slice(-4)}`,
        rmeRecordId: updatedRecord.id,
        rmId: updatedRecord.rmId,
        patientName: updatedRecord.patientName,
        doctorName: updatedRecord.doctorName,
        items: nextItems,
        status: 'Pending Skrining',
        timestamp: nextTimestamp || new Date().toLocaleString('id-ID'),
        assignedStaff: updatedRecord.assignedStaff ? [...updatedRecord.assignedStaff] : [],
        screeningChecks: {
          admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
          farmasetik: { bentukSediaan: true, dosis: true, stabilitas: true, kompatibilitas: true },
          klinis: { tepatDosis: true, tepatWaktu: true, kontraIndikasi: true, interaksi: true }
        },
        branchId: updatedRecord.branchId || 'BR-01'
      };
      rxToSync = newRx;
      setPrescriptions((prev) => {
        const next = [newRx, ...prev];
        persistPrescriptionsNow(next);
        return next;
      });
    }

    if (rxIdToDelete) {
      if (isDemoActive || isDemoMode()) {
        confirmCloudDeletes('prescriptions', [rxIdToDelete]);
      } else {
        deletePrescriptionFromSupabase(rxIdToDelete)
          .then((res) => {
            if (res.success) confirmCloudDeletes('prescriptions', [rxIdToDelete!]);
          })
          .catch((err) => console.warn('Supabase prescription delete error:', err));
      }
    } else if (rxToSync) {
      if (!isDemoActive && !isDemoMode()) {
        const syncId = rxToSync.id;
        markIdsPendingSync('prescriptions', [syncId]);
        syncPrescriptionToSupabase(rxToSync)
          .then((res) => {
            if (res.success) confirmCloudSync('prescriptions', [syncId]);
          })
          .catch((err) => console.warn('Supabase prescription update error:', err));
      }
    }

    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('rme_records', [updatedRecord.id]);
      syncRmeToSupabase(updatedRecord)
        .then((res) => {
          if (res.needsTableSetup) setRmeNeedsTableSetup(true);
          if (res.success) confirmCloudSync('rme_records', [updatedRecord.id]);
        })
        .catch((err) => console.warn('Supabase RME update error:', err));
    }
    addAuditLog(
      'RME Dokter',
      `Catatan RME & penugasan pasien ${updatedRecord.patientName} (${updatedRecord.rmId}) diperbarui dan disinkronkan ke Antrean E-Resep.`
    );
  };

  // Handler: Delete Single RME Record (Tombstone + Immediate Local Persist + Cloud Delete)
  const handleDeleteRME = async (
    id: string
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    const cleanId = String(id || '').trim();
    if (!cleanId) return { success: true };

    const rxToRemove = prescriptionsRef.current.filter(
      (rx) => rx.rmeRecordId === cleanId && rx.status === 'Pending Skrining'
    );
    const rxIdsToDelete = rxToRemove.map((rx) => rx.id).filter(Boolean);
    if (rxIdsToDelete.length > 0) {
      markIdsDeleted('prescriptions', rxIdsToDelete);
    }

    // Record RME tombstone & persist immediately before any async cloud call
    markIdsDeleted('rme_records', [cleanId]);
    setRmeRecords((prev) => {
      const next = prev.filter((rec) => String(rec.id).trim() !== cleanId);
      persistRmeNow(next);
      return next;
    });

    setPrescriptions((prev) => {
      const next = prev.filter((rx) => !(rx.rmeRecordId === cleanId && rx.status === 'Pending Skrining'));
      if (next.length !== prev.length) {
        persistPrescriptionsNow(next);
      }
      return next;
    });

    addAuditLog('RME Dokter', `Catatan RME #${cleanId} berhasil dihapus dari riwayat.`);

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('rme_records', [cleanId]);
      if (rxIdsToDelete.length > 0) confirmCloudDeletes('prescriptions', rxIdsToDelete);
      return { success: true, isDemo: true };
    }

    if (rxIdsToDelete.length > 0) {
      deletePrescriptionsFromSupabase(rxIdsToDelete)
        .then((res) => {
          if (res.success) confirmCloudDeletes('prescriptions', rxIdsToDelete);
        })
        .catch(() => {});
    }

    const rmeDelRes = await deleteRmeFromSupabase(cleanId).catch(
      (err): { success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string } => ({
        success: false,
        error: err?.message || String(err)
      })
    );
    if (rmeDelRes.needsTableSetup) {
      setRmeNeedsTableSetup(true);
    }
    if (rmeDelRes.success) {
      confirmCloudDeletes('rme_records', [cleanId]);
    } else {
      console.warn('Supabase RME delete pending replay:', rmeDelRes.error);
    }
    return rmeDelRes;
  };

  // Handler: Bulk Delete RME Records (Tombstone + Immediate Local Persist + Batch Cloud Delete)
  const handleBulkDeleteRME = async (
    ids: string[]
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    const cleanIds = Array.from(
      new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (cleanIds.length === 0) return { success: true };

    const idSet = new Set(cleanIds);
    const rxToRemove = prescriptionsRef.current.filter(
      (rx) => rx.rmeRecordId && idSet.has(String(rx.rmeRecordId).trim()) && rx.status === 'Pending Skrining'
    );
    const rxIdsToDelete = rxToRemove.map((rx) => rx.id).filter(Boolean);
    if (rxIdsToDelete.length > 0) {
      markIdsDeleted('prescriptions', rxIdsToDelete);
    }

    markIdsDeleted('rme_records', cleanIds);
    setRmeRecords((prev) => {
      const next = prev.filter((rec) => !idSet.has(String(rec.id).trim()));
      persistRmeNow(next);
      return next;
    });

    setPrescriptions((prev) => {
      const next = prev.filter(
        (rx) => !(rx.rmeRecordId && idSet.has(String(rx.rmeRecordId).trim()) && rx.status === 'Pending Skrining')
      );
      if (next.length !== prev.length) {
        persistPrescriptionsNow(next);
      }
      return next;
    });

    addAuditLog('RME Dokter', `${cleanIds.length} catatan RME berhasil dihapus secara massal.`);

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('rme_records', cleanIds);
      if (rxIdsToDelete.length > 0) confirmCloudDeletes('prescriptions', rxIdsToDelete);
      return { success: true, isDemo: true };
    }

    if (rxIdsToDelete.length > 0) {
      deletePrescriptionsFromSupabase(rxIdsToDelete)
        .then((res) => {
          if (res.success) confirmCloudDeletes('prescriptions', rxIdsToDelete);
        })
        .catch(() => {});
    }

    const bulkDelRes = await deleteRmesFromSupabase(cleanIds).catch(
      (err): { success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string } => ({
        success: false,
        error: err?.message || String(err)
      })
    );
    if (bulkDelRes.needsTableSetup) {
      setRmeNeedsTableSetup(true);
    }
    if (bulkDelRes.success) {
      confirmCloudDeletes('rme_records', cleanIds);
    } else {
      console.warn('Supabase RME bulk delete pending replay:', bulkDelRes.error);
    }
    return bulkDelRes;
  };

  // Handler: Update Patient in Queue (e.g. vital signs, complaint from Doctor SOAP Workspace)
  const handleUpdateQueuePatient = (nomor: string, updatedData: Partial<PatientQueue>) => {
    setQueue((prev) =>
      prev.map((q) => (q.nomor === nomor ? { ...q, ...updatedData } : q))
    );
    addAuditLog('Antrean Pasien', `Data pemeriksaan antrean #${nomor} diperbarui oleh Dokter.`);
  };

  // Handlers: Cek Lab & Laboratorium (Tombstone-Safe Two-Way Sync)
  const handleAddLabRecord = (record: LabTestRecord) => {
    setLabRecords((prev) => {
      const next = [record, ...prev.filter((r) => r.id !== record.id)];
      persistLabRecordsNow(next);
      return next;
    });
    addAuditLog('Cek Lab', `Input dokumen hasil lab #${record.id} pasien ${record.patientName}`);
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('lab_records', [record.id]);
      syncLabRecordToSupabase(record)
        .then((res) => {
          if (res.needsTableSetup) setLabRecordsNeedsTableSetup(true);
          if (res.success) confirmCloudSync('lab_records', [record.id]);
        })
        .catch((err) => console.warn('Supabase cek lab add sync error:', err));
    }
  };

  const handleUpdateLabRecord = (record: LabTestRecord) => {
    setLabRecords((prev) => {
      const next = prev.map((r) => (r.id === record.id ? record : r));
      persistLabRecordsNow(next);
      return next;
    });
    addAuditLog('Cek Lab', `Update dokumen hasil lab #${record.id} pasien ${record.patientName}`);
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('lab_records', [record.id]);
      syncLabRecordToSupabase(record)
        .then((res) => {
          if (res.needsTableSetup) setLabRecordsNeedsTableSetup(true);
          if (res.success) confirmCloudSync('lab_records', [record.id]);
        })
        .catch((err) => console.warn('Supabase cek lab update sync error:', err));
    }
  };

  const handleDeleteLabRecord = async (
    id: string
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    const cleanId = String(id || '').trim();
    if (!cleanId) return { success: true };

    const found = labRecordsRef.current.find((r) => String(r.id).trim() === cleanId);
    markIdsDeleted('lab_records', [cleanId]);
    setLabRecords((prev) => {
      const next = prev.filter((r) => String(r.id).trim() !== cleanId);
      persistLabRecordsNow(next);
      return next;
    });
    addAuditLog('Cek Lab', `Hapus dokumen lab #${cleanId} pasien ${found?.patientName || ''}`);

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('lab_records', [cleanId]);
      return { success: true, isDemo: true };
    }

    const res = await deleteLabRecordsFromSupabase([cleanId]).catch((err) => ({
      success: false,
      needsTableSetup: false,
      error: err?.message || String(err)
    }));
    if (res.needsTableSetup) setLabRecordsNeedsTableSetup(true);
    if (res.success) {
      confirmCloudDeletes('lab_records', [cleanId]);
    }
    return res;
  };

  // Handler: Finish Queue from Doctor's room
  const handleFinishDoctorQueue = (nomor: string) => {
    setQueue((prev) => prev.filter((q) => q.nomor !== nomor));
  };

  // Handler: Save Cashier Transaction (deduct FEFO stock + enrich real Batch/ED on mutations + sync to Supabase)
  const handleSaveTransaction = (trx: Transaction, mutations: StockMutation[]) => {
    const workingMedMap = new Map<string, Medicine>();
    medicinesRef.current.forEach((m) => {
      workingMedMap.set(m.id, {
        ...m,
        batches: m.batches ? m.batches.map((b) => ({ ...b })) : undefined
      });
    });

    // Track explicit preferred batch per medicine from Faktur Penjualan items (if customized by user)
    const preferredByMedId = new Map<string, { batchNo?: string; expDate?: string }>();
    if (trx.type === 'FAKTUR_PENJUALAN') {
      trx.items.forEach((it) => {
        if (it.id && (it.batchNo || it.expDate)) {
          preferredByMedId.set(it.id, { batchNo: it.batchNo, expDate: it.expDate });
        }
      });
    }

    const enrichedMutations: StockMutation[] = (mutations || []).map((mut) => {
      const med = workingMedMap.get(mut.medicineId);
      if (!med) return mut;

      const qtyOut = Math.max(0, Number(mut.outQty) || 0);
      if (qtyOut > 0) {
        const pref = preferredByMedId.get(mut.medicineId);
        const allocResult = allocateBatchesFEFO(
          med,
          qtyOut,
          pref?.batchNo || mut.batchNo,
          pref?.expDate || mut.expDate
        );
        // Update sequential working snapshot for multiple cart lines of same medicine
        workingMedMap.set(med.id, {
          ...med,
          stock: allocResult.stock,
          batchNo: allocResult.batchNo,
          expDate: allocResult.expDate,
          batches: allocResult.batches
        });

        const resolvedBatchNo =
          allocResult.allocations.length > 0
            ? allocResult.allocations.map((a) => a.batchNo || '-').join(', ')
            : mut.batchNo || med.batchNo || '-';
        const resolvedExpDate =
          allocResult.allocations.length > 0
            ? Array.from(new Set(allocResult.allocations.map((a) => a.expDate).filter(Boolean))).join(', ') ||
              mut.expDate ||
              med.expDate ||
              ''
            : mut.expDate || med.expDate || '';

        return {
          ...mut,
          balance: allocResult.stock,
          batchNo: resolvedBatchNo,
          expDate: resolvedExpDate,
          batchDetails:
            allocResult.allocations.length > 0
              ? allocResult.allocations
              : [
                  {
                    batchNo: resolvedBatchNo,
                    expDate: resolvedExpDate,
                    qty: qtyOut
                  }
                ]
        };
      }

      return {
        ...mut,
        batchNo: mut.batchNo || med.batchNo || '-',
        expDate: mut.expDate || med.expDate || ''
      };
    });

    // Sync real FEFO batch/ED back onto Transaction items so invoices/receipts & Kartu Stok match 100%
    const enrichedTrx: Transaction = {
      ...trx,
      items: trx.items.map((it) => {
        const matchedMut = enrichedMutations.find(
          (m) => m.medicineId === it.id && m.outQty === it.qty
        ) || enrichedMutations.find((m) => m.medicineId === it.id);
        if (matchedMut && (matchedMut.batchNo || matchedMut.expDate)) {
          return {
            ...it,
            batchNo: matchedMut.batchNo || it.batchNo || '-',
            expDate: matchedMut.expDate || it.expDate || ''
          };
        }
        return it;
      })
    };

    setTransactions((prev) => [enrichedTrx, ...prev]);
    setStockMutations((prev) => [...enrichedMutations, ...prev]);

    // Deduct stock from medicines (FEFO multi-batch aware: penjualan langsung + pemakaian produk Cek Lab) & sync to Supabase
    setMedicines((prev) =>
      prev.map((m) => {
        const directOut = enrichedTrx.items
          .filter((i) => i.id === m.id)
          .reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
        const labOut = enrichedTrx.items.reduce((sum, i) => {
          if (!i.labConsumedProducts || i.labConsumedProducts.length === 0) return sum;
          const matchedLabQty = i.labConsumedProducts
            .filter((lp) => lp.medicineId === m.id)
            .reduce((s, lp) => s + (Number(lp.qty) || 0) * (Number(i.qty) || 1), 0);
          return sum + matchedLabQty;
        }, 0);
        const totalOut = directOut + labOut;
        if (totalOut > 0) {
          const pref = preferredByMedId.get(m.id);
          const updated = pref?.batchNo
            ? allocateBatchesFEFO(m, totalOut, pref.batchNo, pref.expDate)
            : deductBatchesFEFO(m, totalOut);
          const nextMed: Medicine = {
            ...m,
            stock: updated.stock,
            batchNo: updated.batchNo,
            expDate: updated.expDate,
            batches: updated.batches
          };
          syncMedicineWithTracking(nextMed).catch((err) =>
            console.warn('Supabase medicine stock deduct sync error:', err)
          );
          return nextMed;
        }
        return m;
      })
    );

    // Jika transaksi berasal dari E-Resep aktif (dari Antrian E-Resep POS), perbarui status resep ke 'Selesai di POS' dan sinkronkan ke Supabase
    if (activePrescriptionForPOS) {
      const completedRx: EPrescription = {
        ...activePrescriptionForPOS,
        status: 'Selesai di POS',
        screeningChecks: {
          ...(activePrescriptionForPOS.screeningChecks || {
            admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
            farmasetik: {
              bentukSediaan: true,
              dosis: true,
              stabilitas: true,
              kompatibilitas: true
            },
            klinis: {
              tepatDosis: true,
              tepatWaktu: true,
              kontraIndikasi: true,
              interaksi: true,
              duplikasi: true
            }
          }),
          posQueueMeta: {
            ...(activePrescriptionForPOS.screeningChecks?.posQueueMeta || {}),
            sentToPos: true,
            processedPosTrxId: enrichedTrx.id,
            processedPosAt: enrichedTrx.date
          }
        }
      };
      setPrescriptions((prev) => {
        const next = prev.map((p) => (p.id === completedRx.id ? completedRx : p));
        persistPrescriptionsNow(next);
        return next;
      });
      if (!isDemoActive && !isDemoMode()) {
        markIdsPendingSync('prescriptions', [completedRx.id]);
        syncPrescriptionToSupabase(completedRx)
          .then((res) => {
            if (res.success) confirmCloudSync('prescriptions', [completedRx.id]);
          })
          .catch((err) => console.warn('Supabase prescription POS completion sync error:', err));
      }
      setActivePrescriptionForPOS(null);
    }

    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('transactions', [enrichedTrx.id]);
      syncTransactionToSupabase(enrichedTrx)
        .then((res) => {
          if (res.needsTableSetup) setTransactionsNeedsTableSetup(true);
          if (res.success) {
            confirmCloudSync('transactions', [enrichedTrx.id]);
          }
          if (res.success && !res.needsTableSetup) {
            const matchedPat = patients.find(
              (p) =>
                p.name.toLowerCase() === (enrichedTrx.customerName || '').toLowerCase() ||
                p.noRm === enrichedTrx.customerName ||
                p.id === enrichedTrx.customerName
            );
            enqueueDispenseSatuSehatBackground({
              transaction: enrichedTrx,
              patient: matchedPat
            });
          }
        })
        .catch((err) => console.warn('Supabase sales transaction sync error:', err));

      if (enrichedMutations.length > 0) {
        const mutIds = enrichedMutations.map((m) => m.id).filter(Boolean);
        markIdsPendingSync('stock_mutations', mutIds);
        seedStockMutationsToSupabase(enrichedMutations)
          .then((res) => {
            if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
            if (res.success) confirmCloudSync('stock_mutations', mutIds);
          })
          .catch((err) => console.warn('Supabase sales stock mutation sync error:', err));
      }
    }

    // Auto-record Ledger Fee Petugas POS (log_fee_petugas)
    const newLedgerEntries = buildFeeLedgerEntriesForTransaction(enrichedTrx, feeConfig, effectiveStaffList);
    if (newLedgerEntries.length > 0) {
      const ledgerIds = newLedgerEntries.map((e) => e.id).filter(Boolean);
      setFeeLedger((prev) => {
        const newIds = new Set(ledgerIds);
        const next = [...newLedgerEntries, ...prev.filter((e) => !newIds.has(e.id))];
        persistFeeLedgerNow(next);
        return next;
      });
      if (!isDemoActive && !isDemoMode()) {
        markIdsPendingSync('fee_ledger', ledgerIds);
        upsertFeeLedgerEntriesToSupabase(newLedgerEntries)
          .then((res) => {
            if (res.needsTableSetup) setFeeLedgerNeedsTableSetup(true);
            if (res.success) confirmCloudSync('fee_ledger', ledgerIds);
          })
          .catch((err) => console.warn('Supabase fee ledger insert sync error:', err));
      }
    }

    addAuditLog('POS Kasir', `Transaksi #${enrichedTrx.id} senilai Rp ${enrichedTrx.total.toLocaleString('id-ID')} terbayar.`);
    evaluateAndEnqueueRestrictedAlarm(enrichedTrx);
  };

  // Handlers: Cashier Shift & Session Management (Buka & Tutup Kasir + Approval Selisih)
  const handleOpenCashierShift = (newShift: CashierShiftSession) => {
    setCashierShifts((prev) => {
      const next = [newShift, ...prev];
      persistCashierShiftsNow(next);
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      setClearAllPending('cashier_shifts', false);
      markIdsPendingSync('cashier_shifts', [newShift.id]);
      syncCashierShiftToSupabase(newShift)
        .then((res) => {
          if (res.needsTableSetup) setCashierShiftsNeedsTableSetup(true);
          if (res.success) confirmCloudSync('cashier_shifts', [newShift.id]);
        })
        .catch((err) => console.warn('Supabase open cashier shift sync error:', err));
    }
    addAuditLog(
      'Buka Shift Kasir',
      `Buka Kasir #${newShift.id} (${newShift.shiftName}) oleh ${newShift.cashierName}. Modal Awal (Cash Float): Rp ${newShift.openingFloat.toLocaleString('id-ID')}. Catatan: ${newShift.openingNotes || '-'}`
    );
  };

  const handleCloseCashierShift = (closedShift: CashierShiftSession) => {
    setCashierShifts((prev) => {
      const exists = prev.some((s) => s.id === closedShift.id);
      const next = exists
        ? prev.map((s) => (s.id === closedShift.id ? closedShift : s))
        : [closedShift, ...prev];
      persistCashierShiftsNow(next);
      return next;
    });

    if (!isDemoActive && !isDemoMode()) {
      setClearAllPending('cashier_shifts', false);
      markIdsPendingSync('cashier_shifts', [closedShift.id]);
      syncCashierShiftToSupabase(closedShift)
        .then((res) => {
          if (res.needsTableSetup) setCashierShiftsNeedsTableSetup(true);
          if (res.success) confirmCloudSync('cashier_shifts', [closedShift.id]);
        })
        .catch((err) => console.warn('Supabase close cashier shift sync error:', err));
    }

    const denomSummary = closedShift.denominations
      .map((d) => `${d.label} x ${d.sheets} lbr = Rp ${d.subtotal.toLocaleString('id-ID')}`)
      .join(' | ');

    if (closedShift.difference !== 0) {
      addAuditLog(
        'ALERT SELISIH KASIR (Menunggu Approval APJ / Owner)',
        `[PERINGATAN REAL-TIME KE APJ / OWNER] Tutup Kasir #${closedShift.id} (${closedShift.shiftName} - ${closedShift.cashierName}) mengalami SELISIH ${closedShift.differenceStatus.toUpperCase()} sebesar ${closedShift.difference > 0 ? '+' : '-'}Rp ${Math.abs(closedShift.difference).toLocaleString('id-ID')}. Kas Fisik Laci: Rp ${closedShift.physicalCashInDrawer.toLocaleString('id-ID')} vs Kas Sistem Seharusnya: Rp ${closedShift.expectedCashInDrawer.toLocaleString('id-ID')} (Modal: Rp ${closedShift.openingFloat.toLocaleString('id-ID')} + Omset Tunai: Rp ${closedShift.systemCashSales.toLocaleString('id-ID')}). Rincian Fisik: [${denomSummary}]. Status: Menunggu Approval Tutup Kasir.`
      );
    } else {
      addAuditLog(
        'Tutup Shift Kasir (Sesuai)',
        `Tutup Kasir #${closedShift.id} (${closedShift.shiftName} - ${closedShift.cashierName}) SELESAI & SESUAI (Balance Rp 0). Total Kas Fisik Laci: Rp ${closedShift.physicalCashInDrawer.toLocaleString('id-ID')} | Omset Tunai Sistem: Rp ${closedShift.systemCashSales.toLocaleString('id-ID')} | Modal Awal: Rp ${closedShift.openingFloat.toLocaleString('id-ID')}. Rincian Fisik: [${denomSummary}].`
      );
    }
  };

  const handleApproveRejectCashierShift = (
    shiftId: string,
    action: 'APPROVE' | 'REJECT',
    notes: string
  ) => {
    if (!isOwnerAdminRole(activeRole)) {
      return;
    }

    const targetShift = cashierShifts.find((s) => s.id === shiftId);
    if (!targetShift) return;

    const nowTime =
      new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    const nextStatus: CashierShiftSession['status'] =
      action === 'APPROVE' ? 'Ditutup (Approved APJ / Owner)' : 'Ditolak (Hitung Ulang)';

    const updatedShift: CashierShiftSession = {
      ...targetShift,
      status: nextStatus,
      approvedBy: userName,
      approvalTime: nowTime,
      approvalNotes: notes
    };

    setCashierShifts((prev) => {
      const next = prev.map((s) => (s.id === shiftId ? updatedShift : s));
      persistCashierShiftsNow(next);
      return next;
    });

    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('cashier_shifts', [updatedShift.id]);
      syncCashierShiftToSupabase(updatedShift)
        .then((res) => {
          if (res.needsTableSetup) setCashierShiftsNeedsTableSetup(true);
          if (res.success) confirmCloudSync('cashier_shifts', [updatedShift.id]);
        })
        .catch((err) => console.warn('Supabase approve/reject shift sync error:', err));
    }

    const denomSummary = targetShift.denominations
      .map((d) => `${d.label}:${d.sheets}`)
      .join(', ');

    addAuditLog(
      action === 'APPROVE'
        ? 'Approval Tutup Kasir (Disetujui APJ / Owner)'
        : 'Reject Tutup Kasir (Ditolak APJ / Owner)',
      `APJ / Owner (${userName}) telah ${
        action === 'APPROVE' ? 'MENYETUJUI (APPROVE)' : 'MENOLAK (REJECT / HITUNG ULANG)'
      } Tutup Kasir #${shiftId} (${targetShift.cashierName}) dengan selisih ${
        targetShift.difference > 0 ? '+' : '-'
      }Rp ${Math.abs(targetShift.difference).toLocaleString('id-ID')} (${
        targetShift.differenceStatus
      }). Rincian Fisik: [${denomSummary}]. Catatan APJ / Owner: ${notes}`
    );
  };

  const handleDeleteCashierShift = async (shiftId: string) => {
    markIdsDeleted('cashier_shifts', [shiftId]);
    setCashierShifts((prev) => {
      const next = prev.filter((s) => s.id !== shiftId);
      persistCashierShiftsNow(next);
      return next;
    });
    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('cashier_shifts', [shiftId]);
      return { success: true, isDemo: true };
    }
    const res = await deleteCashierShiftFromSupabase(shiftId);
    if (res.needsTableSetup) setCashierShiftsNeedsTableSetup(true);
    if (res.success) {
      confirmCloudDeletes('cashier_shifts', [shiftId]);
    }
    addAuditLog('Riwayat Shift Kasir', `Menghapus catatan riwayat shift kasir #${shiftId}`);
    return res;
  };

  const handleClearCashierShiftHistory = async () => {
    const idsToDelete = cashierShiftsRef.current.map((s) => s.id).filter(Boolean);
    markIdsDeleted('cashier_shifts', idsToDelete);
    setClearAllPending('cashier_shifts', true);
    setCashierShifts([]);
    persistCashierShiftsNow([]);
    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('cashier_shifts', idsToDelete);
      setClearAllPending('cashier_shifts', false);
      return { success: true, isDemo: true };
    }
    const res = await clearCashierShiftsFromSupabase(idsToDelete);
    if (res.needsTableSetup) setCashierShiftsNeedsTableSetup(true);
    if (res.success) {
      confirmCloudDeletes('cashier_shifts', idsToDelete);
      setClearAllPending('cashier_shifts', false);
    }
    addAuditLog(
      'Riwayat Shift Kasir',
      `Mengosongkan seluruh riwayat shift kasir (${idsToDelete.length} data)`
    );
    return res;
  };

  const handleSyncCashierShiftsSupabase = async () => {
    if (isDemoActive || isDemoMode()) {
      return { success: true, isDemo: true, count: cashierShiftsRef.current.length };
    }

    // 1. Flush pending deletes / pending clear-all BEFORE fetching remote rows
    if (isClearAllPending('cashier_shifts')) {
      const pendingIds = getPendingDeleteIds('cashier_shifts');
      const clearRes = await clearCashierShiftsFromSupabase(pendingIds);
      if (clearRes.needsTableSetup) {
        setCashierShiftsNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: clearRes.error };
      }
      if (clearRes.success) {
        confirmCloudDeletes('cashier_shifts', pendingIds);
        setClearAllPending('cashier_shifts', false);
      }
    } else {
      const pendingDeleteIds = getPendingDeleteIds('cashier_shifts');
      if (pendingDeleteIds.length > 0) {
        const delRes = await deleteCashierShiftsFromSupabase(pendingDeleteIds);
        if (delRes.needsTableSetup) {
          setCashierShiftsNeedsTableSetup(true);
          return { success: false, needsTableSetup: true, error: delRes.error };
        }
        if (delRes.success) {
          confirmCloudDeletes('cashier_shifts', pendingDeleteIds);
        }
      }
    }

    const res = await fetchCashierShiftsFromSupabase({ forceRefresh: true });
    setCashierShiftsNeedsTableSetup(Boolean(res.needsTableSetup));
    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error || 'Tabel riwayat_shift_kasir belum dibuat di Supabase.'
      };
    }
    if (res.error) {
      return { success: false, error: res.error };
    }

    const deletedSet = getDeletedIdsSet('cashier_shifts');
    const pendingSyncSet = getPendingSyncIdsSet('cashier_shifts');
    const remoteAll = res.data || [];

    const stubbornDeletedIds = remoteAll.filter((s) => deletedSet.has(s.id)).map((s) => s.id);
    if (stubbornDeletedIds.length > 0) {
      const cleanupRes = await deleteCashierShiftsFromSupabase(stubbornDeletedIds);
      if (cleanupRes.success) {
        confirmCloudDeletes('cashier_shifts', stubbornDeletedIds);
      }
    }

    const remoteClean = remoteAll.filter(
      (s) => s.id && !isDemoCashierShiftId(s.id) && !deletedSet.has(s.id)
    );
    const localPendingUploads = cashierShiftsRef.current.filter(
      (s) =>
        s.id &&
        !isDemoCashierShiftId(s.id) &&
        !deletedSet.has(s.id) &&
        pendingSyncSet.has(s.id)
    );

    if (localPendingUploads.length > 0) {
      const seedRes = await seedCashierShiftsToSupabase(localPendingUploads);
      if (seedRes.success) {
        confirmCloudSync('cashier_shifts', localPendingUploads.map((s) => s.id));
      }
    }

    const map = new Map<string, CashierShiftSession>();
    remoteClean.forEach((s) => map.set(s.id, s));
    localPendingUploads.forEach((s) => map.set(s.id, s));

    const merged = Array.from(map.values()).sort(
      (a, b) => (Number(b.openTimestamp) || 0) - (Number(a.openTimestamp) || 0)
    );
    setCashierShifts(merged);
    persistCashierShiftsNow(merged);
    markInitialCloudSyncCompleted('cashier_shifts');

    addAuditLog(
      'Riwayat Shift Kasir',
      `Sinkronisasi 2-arah Riwayat Shift Kasir dengan Supabase (${merged.length} sesi).`
    );
    return { success: true, count: merged.length };
  };

  // Handler: Add Sales Invoice Transaction
  const handleAddSalesInvoice = (trx: Transaction, mutations: StockMutation[]) => {
    handleSaveTransaction(trx, mutations);
    addAuditLog('Faktur Penjualan', `Faktur penjualan #${trx.id} untuk ${trx.customerName} senilai Rp ${trx.total.toLocaleString('id-ID')} diterbitkan.`);
  };

  // Handler: Update Transaction
  const handleUpdateTransaction = (updated: Transaction) => {
    setTransactions((prev) => {
      const next = prev.map((t) => (t.id === updated.id ? updated : t));
      persistTransactionsNow(next);
      return next;
    });
    if (updated.status === 'Dibatalkan' || updated.status === 'Diretur') {
      setRestrictedSaleAlarms((prev) => prev.filter((a) => a.trxId !== updated.id));
      const cancelReason = updated.cancelReason || updated.returnReason || updated.status;
      const nowIso = new Date().toISOString();
      setFeeLedger((prev) => {
        let changed = false;
        const next = prev.map((entry) => {
          if (entry.transaction_id !== updated.id) return entry;
          changed = true;
          return {
            ...entry,
            status_pembayaran: 'dibatalkan' as const,
            cancelled_reason: cancelReason,
            updated_at: nowIso
          };
        });
        if (changed) persistFeeLedgerNow(next);
        return changed ? next : prev;
      });
      if (!isDemoActive && !isDemoMode()) {
        cancelFeeLedgerByTransactionInSupabase(updated.id, cancelReason)
          .then((res) => {
            if (res.needsTableSetup) setFeeLedgerNeedsTableSetup(true);
          })
          .catch((err) => console.warn('Supabase fee ledger cancel sync error:', err));
      }
    }
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('transactions', [updated.id]);
      syncTransactionToSupabase(updated)
        .then((res) => {
          if (res.needsTableSetup) setTransactionsNeedsTableSetup(true);
          if (res.success) confirmCloudSync('transactions', [updated.id]);
        })
        .catch((err) => console.warn('Supabase sales transaction update error:', err));
    }
    addAuditLog('Riwayat Penjualan', `Transaksi #${updated.id} diperbarui (Status: ${updated.status || 'Selesai'})`);
  };

  // Handler: Permanently Delete Transactions (Local Tombstone + Synchronous Cache + Verified Cloud Delete + Ledger Sync)
  const handleDeleteTransactions = async (idsToDelete: string[]) => {
    const cleanIds = Array.from(
      new Set((idsToDelete || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (cleanIds.length === 0) return { success: true };

    markIdsDeleted('transactions', cleanIds);
    addPendingDeleteFeeLedgerTrxIds(cleanIds);
    const idSet = new Set(cleanIds);
    const matchedLedgerIds = feeLedgerRef.current
      .filter((e) => e?.id && idSet.has(String(e.transaction_id || '').trim()))
      .map((e) => String(e.id).trim());
    if (matchedLedgerIds.length > 0) {
      markIdsDeleted('fee_ledger', matchedLedgerIds);
    }

    setTransactions((prev) => {
      const updated = prev.filter((t) => !idSet.has(String(t.id).trim()));
      persistTransactionsNow(updated);
      return updated;
    });
    setRestrictedSaleAlarms((prev) => prev.filter((a) => !idSet.has(String(a.trxId).trim())));
    setFeeLedger((prev) => {
      const next = prev.filter((e) => !idSet.has(String(e.transaction_id || '').trim()));
      if (next.length !== prev.length) {
        persistFeeLedgerNow(next);
      }
      return next.length !== prev.length ? next : prev;
    });

    addAuditLog('Riwayat Penjualan', `Hapus permanen ${cleanIds.length} transaksi penjualan`);

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('transactions', cleanIds);
      confirmFeeLedgerTrxDeletes(cleanIds);
      if (matchedLedgerIds.length > 0) confirmCloudDeletes('fee_ledger', matchedLedgerIds);
      return { success: true, isDemo: true };
    }

    const [trxRes, ledgerRes] = await Promise.all([
      deleteTransactionsFromSupabase(cleanIds).catch((err) => ({
        success: false,
        needsTableSetup: false,
        error: err?.message || String(err)
      })),
      deleteFeeLedgerByTransactionsInSupabase(cleanIds).catch((err) => ({
        success: false,
        needsTableSetup: false,
        error: err?.message || String(err)
      }))
    ]);

    if (trxRes.needsTableSetup) setTransactionsNeedsTableSetup(true);
    if (trxRes.success) {
      confirmCloudDeletes('transactions', cleanIds);
    }
    if (ledgerRes.needsTableSetup) setFeeLedgerNeedsTableSetup(true);
    if (ledgerRes.success) {
      confirmFeeLedgerTrxDeletes(cleanIds);
      if (matchedLedgerIds.length > 0) confirmCloudDeletes('fee_ledger', matchedLedgerIds);
    }
    return trxRes;
  };

  // Handlers: Pesanan Penjualan Mitra
  const broadcastMitraOrderEvent = (msg: { type: 'ORDER_UPSERT'; order: MitraOrder } | { type: 'ORDER_DELETE'; id: string }) => {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_orders_channel'));
      bc.postMessage(msg);
      bc.close();
    } catch {}
  };

  const handleUpdateMitraOrderStatus = (
    orderId: string,
    status: MitraOrderStatus,
    adminNotes?: string
  ) => {
    let updatedOrder: MitraOrder | null = null;
    setMitraOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        updatedOrder = {
          ...ord,
          status,
          adminNotes: adminNotes !== undefined ? adminNotes : ord.adminNotes,
          updatedAt: new Date().toISOString()
        };
        return updatedOrder;
      })
    );
    if (updatedOrder) {
      syncMitraOrderToSupabase(updatedOrder).catch((err) =>
        console.warn('Supabase mitra order status sync error:', err)
      );
      broadcastMitraOrderEvent({ type: 'ORDER_UPSERT', order: updatedOrder });
      addAuditLog(
        'Pesanan Mitra',
        `Status pesanan ${(updatedOrder as MitraOrder).orderCode} (${(updatedOrder as MitraOrder).mitraName}) diubah menjadi '${status}'.`
      );
    }
  };

  const handleValidateMitraOrderPayment = (
    orderId: string,
    decision: 'APPROVE' | 'REJECT',
    rejectionReason?: string
  ) => {
    let updatedOrder: MitraOrder | null = null;
    const nowIso = new Date().toISOString();

    setMitraOrders((prev) =>
      prev.map((ord) => {
        if (ord.id !== orderId) return ord;
        if (decision === 'APPROVE') {
          updatedOrder = {
            ...ord,
            paymentStatus: 'Lunas',
            paymentVerifiedAt: nowIso,
            paymentVerifiedBy: userName,
            paymentRejectionReason: undefined,
            status: ord.status === 'Pending' ? 'Dikonfirmasi' : ord.status,
            adminNotes:
              ord.adminNotes || `Pembayaran Transfer Bank tervalidasi Lunas oleh ${userName}.`,
            updatedAt: nowIso
          };
        } else {
          const reason =
            (rejectionReason || '').trim() ||
            'Bukti transfer tidak valid / nominal belum masuk mutasi rekening.';
          updatedOrder = {
            ...ord,
            paymentStatus: 'Ditolak',
            paymentVerifiedAt: nowIso,
            paymentVerifiedBy: userName,
            paymentRejectionReason: reason,
            updatedAt: nowIso
          };
        }
        return updatedOrder;
      })
    );

    if (updatedOrder) {
      const ordRef = updatedOrder as MitraOrder;
      syncMitraOrderToSupabase(ordRef).catch((err) =>
        console.warn('Supabase mitra payment validation sync error:', err)
      );
      broadcastMitraOrderEvent({ type: 'ORDER_UPSERT', order: ordRef });
      addAuditLog(
        'Validasi Pembayaran Mitra',
        decision === 'APPROVE'
          ? `Pembayaran pesanan ${ordRef.orderCode} (${ordRef.mitraName}) senilai Rp ${ordRef.totalAmount.toLocaleString('id-ID')} DISETUJUI (Lunas) oleh ${userName}.`
          : `Pembayaran pesanan ${ordRef.orderCode} (${ordRef.mitraName}) DITOLAK oleh ${userName}. Alasan: ${ordRef.paymentRejectionReason}`
      );
    }
  };

  const handleDeleteMitraOrder = (orderId: string) => {
    const cleanId = String(orderId || '').trim();
    if (!cleanId) return;
    const found = mitraOrdersRef.current.find((o) => o.id === cleanId);
    markIdsDeleted('mitra_orders', [cleanId]);
    setMitraOrders((prev) => {
      const next = prev.filter((o) => o.id !== cleanId);
      persistMitraOrdersNow(next);
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      deleteMitraOrderFromSupabase(cleanId)
        .then((res) => {
          if (res.success) confirmCloudDeletes('mitra_orders', [cleanId]);
        })
        .catch((err) => console.warn('Supabase mitra order delete error:', err));
    } else {
      confirmCloudDeletes('mitra_orders', [cleanId]);
    }
    broadcastMitraOrderEvent({ type: 'ORDER_DELETE', id: cleanId });
    addAuditLog('Pesanan Mitra', `Hapus pesanan mitra ${found?.orderCode || cleanId}.`);
  };

  const handleConvertMitraOrderToPOS = (
    order: MitraOrder,
    options: ConvertMitraOrderOptions
  ): { success: boolean; trxId?: string; error?: string } => {
    if (order.status === 'Selesai' || order.status === 'Dibatalkan') {
      return { success: false, error: `Pesanan berstatus '${order.status}' tidak dapat dikonversi ulang.` };
    }

    if ((order.paymentStatus || 'Menunggu Pembayaran') !== 'Lunas') {
      return {
        success: false,
        error:
          'Pesanan hanya dapat dikonversi ke Faktur Penjualan (POS) setelah bukti pembayaran divalidasi dan disetujui (Lunas) oleh Admin.'
      };
    }

    // Validate live stock sufficiency before deducting
    for (const item of order.items) {
      const med = medicines.find((m) => m.id === item.medicineId);
      if (!med) {
        return {
          success: false,
          error: `Produk "${item.name}" tidak ditemukan di Master Obat.`
        };
      }
      const isSmallUnit = item.unitMode === 'KECIL';
      const ratio = Math.max(1, Number(med.rasioKonversi) || Number(item.rasioKonversi) || 1);
      const needKecil = isSmallUnit
        ? Number(item.qtyTotalKecil) || Number(item.qtyBox) || 0
        : Number(item.qtyTotalKecil) || (Number(item.qtyBox) || 0) * ratio;
      if ((Number(med.stock) || 0) < needKecil) {
        return {
          success: false,
          error: `Stok "${med.name}" tidak mencukupi (Tersedia: ${med.stock} ${med.satuanKecil || 'Tab'}, Dibutuhkan: ${needKecil} ${item.satuanKecil}).`
        };
      }
    }

    const isRegulerOrder =
      order.orderRoom === 'REGULER' || String(order.orderCode || '').startsWith('REG-');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const trxPrefix = isRegulerOrder ? 'POS' : 'FPJ';
    const trxId = `${trxPrefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}-${String(Date.now()).slice(-4)}`;

    const termDays = options.term === '30 Hari' ? 30 : options.term === '14 Hari' ? 14 : 0;
    const dueObj = new Date(now.getTime() + termDays * 86400000);
    const dueDate = `${dueObj.getFullYear()}-${pad(dueObj.getMonth() + 1)}-${pad(dueObj.getDate())}`;

    const cartItems: CartItem[] = [];
    const mutations: StockMutation[] = [];
    let totalHppOrder = 0;

    order.items.forEach((item, idx) => {
      const med = medicines.find((m) => m.id === item.medicineId)!;
      const isSmallUnit = item.unitMode === 'KECIL';
      const ratio = Math.max(1, Number(med.rasioKonversi) || Number(item.rasioKonversi) || 1);
      const qtyTotalKecil = isSmallUnit
        ? Math.max(1, Number(item.qtyTotalKecil) || Number(item.qtyBox) || 1)
        : Math.max(1, Number(item.qtyTotalKecil) || (Number(item.qtyBox) || 1) * ratio);
      const hppPerBox = Number(item.hppBox) || getMedicineHppBox(med);
      const hppPerSmall = Number(med.hpp) || Math.round(hppPerBox / ratio);
      const hppTotalItem = isSmallUnit
        ? hppPerSmall * qtyTotalKecil
        : hppPerBox * (Number(item.qtyBox) || 1);
      totalHppOrder += hppTotalItem;

      const fefoAlloc = allocateBatchesFEFO(med, qtyTotalKecil);
      const batchSummaryNo =
        fefoAlloc.allocations.length > 0
          ? fefoAlloc.allocations.map((a) => a.batchNo || '-').join(', ')
          : med.batchNo || '-';
      const batchSummaryExp =
        fefoAlloc.allocations.length > 0
          ? Array.from(new Set(fefoAlloc.allocations.map((a) => a.expDate).filter(Boolean))).join(', ') ||
            med.expDate ||
            ''
          : med.expDate || '';

      cartItems.push({
        id: med.id,
        name: isSmallUnit ? med.name : `${med.name} (${item.qtyBox} ${item.satuanBesar})`,
        kekuatan: med.kekuatan || item.kekuatan || '-',
        batchNo: batchSummaryNo,
        expDate: batchSummaryExp,
        qty: qtyTotalKecil,
        unit: med.satuanKecil || item.satuanKecil || 'Tablet',
        tuslah: 0,
        price: Math.round(item.subtotal / qtyTotalKecil),
        discount: 0,
        subtotal: item.subtotal,
        hpp: hppPerSmall
      });

      mutations.push({
        id: `MUT-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        date: todayYMD,
        time: now.toLocaleTimeString('id-ID'),
        medicineId: med.id,
        medicineName: med.name,
        refNo: trxId,
        type: 'PENJUALAN',
        inQty: 0,
        outQty: qtyTotalKecil,
        balance: Math.max(0, (Number(med.stock) || 0) - qtyTotalKecil),
        ket: isRegulerOrder
          ? `Konversi Order Portal Reguler ${order.orderCode} (${order.mitraName})`
          : `Konversi Order Mitra ${order.orderCode} (${order.mitraName})`,
        petugas: userName,
        branchId: currentBranch.id,
        batchNo: batchSummaryNo,
        expDate: batchSummaryExp,
        batchDetails:
          fefoAlloc.allocations.length > 0
            ? fefoAlloc.allocations
            : [{ batchNo: batchSummaryNo, expDate: batchSummaryExp, qty: qtyTotalKecil }]
      });
    });

    const dpp = order.totalAmount;
    const ppn = options.usePpn ? Math.round(dpp * 0.11) : 0;
    const grandTotal = dpp + ppn;
    const isPaid = options.term === 'Cash / COD';

    const newTrx: Transaction = {
      id: trxId,
      date: todayYMD,
      type: isRegulerOrder ? 'REGULER' : 'FAKTUR_PENJUALAN',
      kasir: userName,
      customerName: order.mitraName,
      customerAddress: order.mitraAddress || '-',
      customerPhone: order.mitraPhone || '-',
      dueDate,
      term: options.term,
      usePpn: options.usePpn,
      dpp,
      ppn,
      status: 'Selesai',
      subtotal: dpp,
      discount: 0,
      chargeCC: 0,
      total: grandTotal,
      payAmount: isPaid ? grandTotal : 0,
      change: 0,
      hppTotal: totalHppOrder,
      profit: dpp - totalHppOrder,
      paymentMethod: options.paymentMethod,
      paymentStatus: isPaid ? 'Lunas' : 'Tempo',
      paidAmount: isPaid ? grandTotal : 0,
      remainingAmount: isPaid ? 0 : grandTotal,
      description:
        options.notes ||
        (isRegulerOrder
          ? `Order Portal Reguler/Umum (${order.orderCode}) - ${order.mitraName}`
          : `Faktur Penjualan Mitra (${order.orderCode}) - ${order.mitraName}`),
      items: cartItems,
      branchId: currentBranch.id
    };

    // Execute transaction, FEFO stock deduction & Supabase medicine stock sync
    handleSaveTransaction(newTrx, mutations);

    const completedOrder: MitraOrder = {
      ...order,
      status: 'Selesai',
      convertedTrxId: trxId,
      adminNotes: order.adminNotes
        ? `${order.adminNotes} | ${isRegulerOrder ? 'Struk POS' : 'Faktur'}: ${trxId}`
        : `Diterbitkan ${isRegulerOrder ? 'Struk POS' : 'Faktur'} ${trxId}`,
      updatedAt: now.toISOString()
    };

    setMitraOrders((prev) => prev.map((o) => (o.id === order.id ? completedOrder : o)));
    syncMitraOrderToSupabase(completedOrder).catch((err) =>
      console.warn('Supabase mitra order complete sync error:', err)
    );
    broadcastMitraOrderEvent({ type: 'ORDER_UPSERT', order: completedOrder });

    addAuditLog(
      isRegulerOrder ? 'Order Portal Reguler' : 'Faktur Penjualan Mitra',
      `Pesanan ${isRegulerOrder ? 'Portal Reguler/Umum' : 'Mitra'} ${order.orderCode} (${order.mitraName}) dikonversi menjadi ${isRegulerOrder ? 'Transaksi POS' : 'Faktur'} #${trxId} senilai Rp ${grandTotal.toLocaleString('id-ID')} dan stok FEFO otomatis terpotong.`
    );

    return { success: true, trxId };
  };

  // Handler: Restock items from Cancel or Return
  const handleRestockFromCancelOrReturn = (
    items: CartItem[],
    reason: string,
    refNo: string,
    actionType: 'Batal' | 'Retur'
  ) => {
    // 1. Restock medicines (restore into primary/matching batch)
    setMedicines((prev) =>
      prev.map((m) => {
        const found = items.find((it) => it.id === m.id);
        if (found) {
          const updated = addBatchStock(
            m,
            found.batchNo || m.batchNo,
            found.expDate || m.expDate,
            found.qty
          );
          return {
            ...m,
            stock: updated.stock,
            batchNo: updated.batchNo,
            expDate: updated.expDate,
            batches: updated.batches
          };
        }
        return m;
      })
    );

    // 2. Add Stock Mutations (PENYESUAIAN)
    const newMutations: StockMutation[] = items.map((it) => {
      const med = medicines.find((m) => m.id === it.id);
      const bNo = (it.batchNo || med?.batchNo || '-').trim() || '-';
      const eDate = (it.expDate || med?.expDate || '').trim();
      return {
        id: `MUT-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('id-ID'),
        medicineId: it.id,
        medicineName: it.name,
        refNo,
        type: 'PENYESUAIAN',
        inQty: it.qty,
        outQty: 0,
        balance: (med?.stock || 0) + it.qty,
        ket: `${actionType === 'Batal' ? 'Pembatalan' : 'Retur'} Penjualan #${refNo}: ${reason}`,
        petugas: userName,
        branchId: currentBranch.id,
        batchNo: bNo,
        expDate: eDate,
        batchDetails: [{ batchNo: bNo, expDate: eDate, qty: it.qty }]
      };
    });

    setStockMutations((prev) => [...newMutations, ...prev]);
    if (!isDemoActive && !isDemoMode() && newMutations.length > 0) {
      seedStockMutationsToSupabase(newMutations)
        .then((res) => {
          if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
        })
        .catch((err) => console.warn('Supabase cancel/return stock mutation sync error:', err));
    }
    addAuditLog(
      actionType === 'Batal' ? 'Batal Penjualan' : 'Retur Penjualan',
      `${actionType === 'Batal' ? 'Pembatalan' : 'Retur'} transaksi #${refNo}. Stok dikembalikan. Alasan: ${reason}`
    );
  };

  // Handler: Approve Prescription into POS E-Resep Queue (without directly creating POS transaction or auto-redirecting)
  const handleApprovePrescriptionToPOS = (rx: EPrescription) => {
    const nowFormatted = rx.screenedAt || new Date().toLocaleString('id-ID');
    const verifier = rx.screenedBy || userName;
    const updatedRx: EPrescription = {
      ...rx,
      status: 'Antrian POS',
      screeningNotes: rx.screeningNotes || 'Memenuhi standar administratif, farmasetik & klinis.',
      screenedBy: verifier,
      screenedAt: nowFormatted,
      screeningChecks: {
        ...(rx.screeningChecks || {
          admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
          farmasetik: {
            bentukSediaan: true,
            dosis: true,
            stabilitas: true,
            kompatibilitas: true
          },
          klinis: {
            tepatDosis: true,
            tepatWaktu: true,
            kontraIndikasi: true,
            interaksi: true,
            duplikasi: true
          }
        }),
        posQueueMeta: {
          ...(rx.screeningChecks?.posQueueMeta || {}),
          sentToPos: true,
          sentToPosAt: nowFormatted,
          sentToPosBy: verifier
        }
      }
    };
    setPrescriptions((prev) => {
      const next = prev.map((p) => (p.id === updatedRx.id ? updatedRx : p));
      persistPrescriptionsNow(next);
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('prescriptions', [updatedRx.id]);
      syncPrescriptionToSupabase(updatedRx)
        .then((res) => {
          if (res.success) confirmCloudSync('prescriptions', [updatedRx.id]);
        })
        .catch((err) => console.warn('Supabase prescription approve sync error:', err));
    }
    addAuditLog(
      'Skrining Resep',
      `Resep #${rx.id} pasien ${rx.patientName} lolos skrining dan disimpan ke Antrian E-Resep POS Kasir (Supabase tersinkron).`
    );
  };

  // Handler: Cashier picks a prescription from Antrian E-Resep inside POS Kasir
  const handleSelectPrescriptionForPOS = (rx: EPrescription) => {
    setActivePrescriptionForPOS(rx);
  };

  // Handler: Reject Prescription
  const handleRejectPrescription = (rxId: string, reason: string, extra?: Partial<EPrescription>) => {
    const existing = prescriptions.find((p) => p.id === rxId);
    const updatedRx: EPrescription | null = existing
      ? {
          ...existing,
          ...(extra || {}),
          status: 'Ditolak',
          screeningNotes: `Ditolak: ${reason}`,
          screenedBy: extra?.screenedBy || userName,
          screenedAt: extra?.screenedAt || new Date().toLocaleString('id-ID')
        }
      : null;

    setPrescriptions((prev) => {
      const next = prev.map((p) =>
        p.id === rxId
          ? {
              ...p,
              ...(extra || {}),
              status: 'Ditolak',
              screeningNotes: `Ditolak: ${reason}`,
              screenedBy: extra?.screenedBy || userName,
              screenedAt: extra?.screenedAt || new Date().toLocaleString('id-ID')
            }
          : p
      );
      persistPrescriptionsNow(next);
      return next;
    });
    if (updatedRx && !isDemoActive && !isDemoMode()) {
      markIdsPendingSync('prescriptions', [updatedRx.id]);
      syncPrescriptionToSupabase(updatedRx)
        .then((res) => {
          if (res.success) confirmCloudSync('prescriptions', [updatedRx.id]);
        })
        .catch((err) => console.warn('Supabase prescription reject sync error:', err));
    }
    addAuditLog('Skrining Resep', `Resep #${rxId} ditolak apoteker. Alasan: ${reason}`);
  };

  // Handler: Permanently Delete Prescription Screening History (Local Tombstone + Synchronous Cache + Verified Cloud Delete)
  const handleDeletePrescriptionHistory = async (rxId: string) => {
    const cleanId = String(rxId || '').trim();
    if (!cleanId) return { success: false, error: 'ID resep tidak valid' };

    markIdsDeleted('prescriptions', [cleanId]);
    setPrescriptions((prev) => {
      const next = prev.filter((p) => String(p.id).trim() !== cleanId);
      persistPrescriptionsNow(next);
      return next;
    });

    addAuditLog('Skrining Resep', `Riwayat skrining resep #${cleanId} dihapus.`);

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('prescriptions', [cleanId]);
      return { success: true, isDemo: true };
    }

    const res = await deletePrescriptionsFromSupabase([cleanId]).catch((err) => ({
      success: false,
      needsTableSetup: false,
      error: err?.message || String(err)
    }));
    if (res.success) {
      confirmCloudDeletes('prescriptions', [cleanId]);
    }
    return res;
  };

  // Handler: 2-Way Supabase Sync for Riwayat Skrining Resep (Flushes Pending Deletes + Respects Tombstones)
  const handleSyncPrescriptionsSupabase = async () => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        count: prescriptionsRef.current.length,
        error: 'Mode Demo aktif: Sinkronisasi cloud Supabase dinonaktifkan untuk melindungi database produksi.'
      };
    }

    // 1. Replay any pending cloud deletes FIRST so deleted rows never reappear
    const pendingDeleteIds = getPendingDeleteIds('prescriptions');
    if (pendingDeleteIds.length > 0) {
      const delRes = await deletePrescriptionsFromSupabase(pendingDeleteIds);
      if (delRes.needsTableSetup) {
        return {
          success: false,
          needsTableSetup: true,
          error: delRes.error || 'Tabel riwayat_skrining_resep belum disiapkan atau terkendala RLS di Supabase.'
        };
      }
      if (delRes.success) {
        confirmCloudDeletes('prescriptions', pendingDeleteIds);
      }
    }

    // 2. Pull remote rows from Supabase
    const res = await fetchPrescriptionsFromSupabase();
    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error || 'Tabel riwayat_skrining_resep belum disiapkan atau terkendala RLS di Supabase.'
      };
    }
    if (res.error) {
      return {
        success: false,
        error: res.error
      };
    }

    const deletedSet = getDeletedIdsSet('prescriptions');
    const pendingSyncSet = getPendingSyncIdsSet('prescriptions');
    const remoteAll = res.data || [];

    // 3. Clean up any remote rows that were locally deleted
    const stubbornDeletedIds = remoteAll
      .filter((rx) => rx.id && deletedSet.has(String(rx.id).trim()))
      .map((rx) => String(rx.id).trim());
    if (stubbornDeletedIds.length > 0) {
      const cleanupRes = await deletePrescriptionsFromSupabase(stubbornDeletedIds);
      if (cleanupRes.success) {
        confirmCloudDeletes('prescriptions', stubbornDeletedIds);
      }
    }

    const remoteClean = remoteAll.filter(
      (rx) => rx.id && !isDemoPrescriptionId(rx.id) && !deletedSet.has(String(rx.id).trim())
    );
    const remoteIds = new Set(remoteClean.map((rx) => String(rx.id).trim()));
    const syncedOnceBefore = hasCompletedInitialCloudSync('prescriptions');

    // 4. Only upload local records that are not deleted and are genuinely pending sync or not yet in remote before first cloud sync
    const localValid = prescriptionsRef.current.filter(
      (rx) => rx.id && !isDemoPrescriptionId(rx.id) && !deletedSet.has(String(rx.id).trim())
    );
    const localToUpload = localValid.filter((rx) => {
      const cleanId = String(rx.id).trim();
      if (pendingSyncSet.has(cleanId)) return true;
      if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
      return false;
    });

    let seedError: string | undefined;
    if (localToUpload.length > 0) {
      const seedRes = await seedPrescriptionsToSupabase(localToUpload);
      if (seedRes.needsTableSetup) {
        return {
          success: false,
          needsTableSetup: true,
          error: seedRes.error || 'Tabel riwayat_skrining_resep belum disiapkan di Supabase.'
        };
      }
      if (seedRes.success) {
        confirmCloudSync(
          'prescriptions',
          localToUpload.map((rx) => String(rx.id).trim())
        );
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }

    // 5. Authoritative merge: remote rows + local pending uploads (never deleted rows)
    const map = new Map<string, EPrescription>();
    remoteClean.forEach((rx) => map.set(String(rx.id).trim(), rx));
    localToUpload.forEach((rx) => {
      const cleanId = String(rx.id).trim();
      if (!map.has(cleanId) || pendingSyncSet.has(cleanId)) {
        map.set(cleanId, rx);
      }
    });

    const merged = Array.from(map.values());
    setPrescriptions(merged);
    persistPrescriptionsNow(merged);
    markInitialCloudSyncCompleted('prescriptions');

    addAuditLog(
      'Skrining Resep',
      `Sinkronisasi 2-arah Riwayat Skrining Resep dengan Supabase (${merged.length} data).`
    );

    if (seedError) {
      return { success: false, count: merged.length, error: seedError };
    }
    return {
      success: true,
      count: merged.length,
      uploadedCount: localToUpload.length,
      deletedFlushedCount: pendingDeleteIds.length + stubbornDeletedIds.length
    };
  };

  // Helper: Compute accurate weighted-average HPP (+11% PPN), HNA, and tier selling prices on Purchase Invoice save
  const computeMedicinePricingFromPurchase = (
    m: Medicine,
    invItem: PurchaseInvoice['items'][number] | undefined,
    incomingQtyKecil: number,
    invoice: PurchaseInvoice,
    baseStockForAvg: number
  ) => {
    const ratio = Math.max(1, Number(m.rasioKonversi) || 1);

    // 1. Net price per invItem.unit after item discount (avoid double-applying invItem.disc on subtotal)
    const invItemQty = Math.max(1, Number(invItem?.qty) || 1);
    const itemGrossUnit = Number(invItem?.price) || 0;
    const itemDiscPct = Math.max(0, Math.min(100, Number(invItem?.disc) || 0));
    const priceAfterItemDisc = invItem
      ? Number(invItem.subtotal) > 0
        ? Number(invItem.subtotal) / invItemQty
        : itemGrossUnit * (1 - itemDiscPct / 100)
      : Number(m.hnaBesar) || 0;

    // Apportion any extra global invoice discount across line items proportionally
    const totalItemDiscs = invoice.items.reduce(
      (sum, it) =>
        sum + ((Number(it.qty) || 0) * (Number(it.price) || 0) * (Number(it.disc) || 0)) / 100,
      0
    );
    const subtotalAfterItemDiscs = invoice.items.reduce((sum, it) => {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const disc = Math.max(0, Math.min(100, Number(it.disc) || 0));
      const sub = Number(it.subtotal) > 0 ? Number(it.subtotal) : qty * price * (1 - disc / 100);
      return sum + sub;
    }, 0);
    const extraGlobalDisc = Math.max(0, (Number(invoice.totalDiscountAmount) || 0) - totalItemDiscs);
    const globalDiscMultiplier =
      subtotalAfterItemDiscs > 0 && extraGlobalDisc > 0
        ? Math.max(0, (subtotalAfterItemDiscs - extraGlobalDisc) / subtotalAfterItemDiscs)
        : 1;
    const effectiveInvoiceUnitPrice = priceAfterItemDisc * globalDiscMultiplier;

    // 2. Convert invoice unit price to Satuan Besar (HNA Besar before PPN)
    const isPurchasedInBesar =
      !invItem ||
      !m.satuanBesar ||
      (invItem.unit || '').trim().toLowerCase() === m.satuanBesar.trim().toLowerCase();
    const invoiceHnaBesar = isPurchasedInBesar
      ? effectiveInvoiceUnitPrice
      : effectiveInvoiceUnitPrice * ratio;

    // 3. Incoming cost (HPP Besar) includes 11% PPN if invoice uses PPN
    const incomingHppBesar =
      invoice.usePpn !== false ? invoiceHnaBesar * 1.11 : invoiceHnaBesar;

    // 4. Existing HPP Besar consistent with InventoryView (HNA + 11% PPN)
    const oldHnaBesar = Number(m.hnaBesar) || 0;
    const oldHppBesar =
      oldHnaBesar > 0
        ? Math.round(oldHnaBesar * 1.11)
        : Number(m.hpp) > 0
        ? Math.round(Number(m.hpp) * ratio)
        : 0;
    const oldHppKecil = Math.round(oldHppBesar / ratio);

    // 5. Weighted Average HPP (Satuan Besar & Satuan Kecil)
    const safeOldStock = Math.max(0, Number(baseStockForAvg) || 0);
    let weightedHppBesarExact = incomingHppBesar;
    if (safeOldStock > 0 && oldHppBesar > 0 && safeOldStock + incomingQtyKecil > 0) {
      weightedHppBesarExact =
        (safeOldStock * oldHppBesar + incomingQtyKecil * incomingHppBesar) /
        (safeOldStock + incomingQtyKecil);
    } else if (incomingHppBesar <= 0 && oldHppBesar > 0) {
      weightedHppBesarExact = oldHppBesar;
    }

    // Keep HNA Besar, HPP Besar, and HPP Kecil 100% synchronized with InventoryView (HPP = HNA + 11%)
    const newHnaBesar = Math.round(weightedHppBesarExact / 1.11);
    const newHppBesar = Math.round(newHnaBesar * 1.11);
    return computeTierPricesFromHppBesar(m, newHppBesar, newHnaBesar);
  };

  // Shared pricing helper: recalculates HNA Besar, HPP Kecil, and Tier Selling Prices = HPP + %Markup
  const computeTierPricesFromHppBesar = (
    m: Medicine,
    targetHppBesar: number,
    explicitHnaBesar?: number
  ) => {
    const ratio = Math.max(1, Number(m.rasioKonversi) || 1);
    const oldHnaBesar = Number(m.hnaBesar) || 0;
    const oldHppBesar =
      oldHnaBesar > 0
        ? Math.round(oldHnaBesar * 1.11)
        : Number(m.hpp) > 0
        ? Math.round(Number(m.hpp) * ratio)
        : 0;
    const oldHppKecil = Math.round(oldHppBesar / ratio);

    const safeTargetHppBesar = Math.max(0, Math.round(targetHppBesar));
    let newHnaBesar: number;
    if (
      explicitHnaBesar !== undefined &&
      explicitHnaBesar >= 0 &&
      Math.round(explicitHnaBesar * 1.11) === safeTargetHppBesar
    ) {
      newHnaBesar = Math.round(explicitHnaBesar * 100) / 100;
    } else {
      const intHna = Math.round(safeTargetHppBesar / 1.11);
      newHnaBesar =
        Math.round(intHna * 1.11) === safeTargetHppBesar
          ? intHna
          : Math.round((safeTargetHppBesar / 1.11) * 100) / 100;
    }
    const newHppBesar = Math.round(newHnaBesar * 1.11);
    const newHppKecil = Math.round(newHppBesar / ratio);

    // Resolve active markup percentages & compute accurate tier selling prices = newHppKecil * (1 + %markup/100)
    const resolveActiveMarkup = (
      savedMarkup: number | undefined,
      oldPriceKecil: number,
      defaultMarkup: number
    ): number => {
      if (typeof savedMarkup === 'number' && !isNaN(savedMarkup)) {
        if (savedMarkup === 0 && oldHppKecil > 0 && oldPriceKecil > oldHppKecil * 1.02) {
          return Math.round(((oldPriceKecil - oldHppKecil) / oldHppKecil) * 1000) / 10;
        }
        return savedMarkup;
      }
      if (oldHppKecil > 0 && oldPriceKecil > 0) {
        return Math.round(((oldPriceKecil - oldHppKecil) / oldHppKecil) * 1000) / 10;
      }
      return defaultMarkup;
    };

    const rawOldMitra = Number(m.sellPriceMitra) || 0;
    const oldMitraKecil =
      ratio > 1 &&
      oldHppBesar > 0 &&
      rawOldMitra >= oldHppBesar * 0.75 &&
      rawOldMitra > oldHppKecil * (1 + (m.markupMitra ?? 25) / 100) * ratio * 0.6
        ? Math.round(rawOldMitra / ratio)
        : rawOldMitra;

    const activeMarkupReg = resolveActiveMarkup(m.markupReguler, Number(m.sellPrice) || 0, 100);
    const activeMarkupKlinik = resolveActiveMarkup(
      m.markupKlinik,
      Number(m.sellPriceKlinik) || 0,
      100
    );
    const activeMarkupMitra = resolveActiveMarkup(m.markupMitra, oldMitraKecil, 25);

    const newSellPrice = Math.round(newHppKecil * (1 + activeMarkupReg / 100));
    const newSellPriceKlinik = Math.round(newHppKecil * (1 + activeMarkupKlinik / 100));
    const newSellPriceMitra = Math.round(newHppKecil * (1 + activeMarkupMitra / 100));

    return {
      hnaBesar: newHnaBesar,
      hpp: newHppKecil,
      sellPrice: newSellPrice,
      sellPriceKlinik: newSellPriceKlinik,
      sellPriceMitra: newSellPriceMitra,
      markupReguler: activeMarkupReg,
      markupKlinik: activeMarkupKlinik,
      markupMitra: activeMarkupMitra
    };
  };

  // Handler: Add Purchase Invoice (increments stock)
  const handleAddPurchaseInvoice = (
    invoice: PurchaseInvoice,
    stockIncrements: { medId: string; qty: number }[]
  ) => {
    setPurchaseInvoices((prev) => [invoice, ...prev]);

    const applyAddToMedicine = (m: Medicine): { med: Medicine; changed: boolean } => {
      const found = stockIncrements.find((inc) => inc.medId === m.id);
      if (!found) return { med: m, changed: false };
      const invItem = invoice.items.find(
        (it) => it.medicineId === m.id || it.name.toLowerCase() === m.name.toLowerCase()
      );
      const updated = addBatchStock(
        m,
        invItem?.batchNo || m.batchNo,
        invItem?.expDate || m.expDate,
        found.qty
      );
      const pricing = computeMedicinePricingFromPurchase(
        m,
        invItem,
        found.qty,
        invoice,
        m.stock || 0
      );
      return {
        changed: true,
        med: {
          ...m,
          stock: updated.stock,
          hnaBesar: pricing.hnaBesar,
          hpp: pricing.hpp,
          sellPrice: pricing.sellPrice,
          sellPriceKlinik: pricing.sellPriceKlinik,
          sellPriceMitra: pricing.sellPriceMitra,
          markupReguler: pricing.markupReguler,
          markupKlinik: pricing.markupKlinik,
          markupMitra: pricing.markupMitra,
          batchNo: updated.batchNo,
          expDate: updated.expDate,
          batches: updated.batches
        }
      };
    };

    const updatedMedicinesToSync = medicines
      .map((m) => applyAddToMedicine(m))
      .filter((r) => r.changed)
      .map((r) => r.med);

    // Increment stocks & merge incoming batches/ED from Purchase Invoice & update weighted average HPP/HNA & selling prices
    setMedicines((prev) => prev.map((m) => applyAddToMedicine(m).med));

    // Add mutations
    const newMutations: StockMutation[] = invoice.items.map((it) => {
      const med = medicines.find((m) => m.id === it.medicineId);
      const ratio = Math.max(1, Number(med?.rasioKonversi) || 1);
      const isBesar =
        !med?.satuanBesar ||
        (it.unit || '').trim().toLowerCase() === med.satuanBesar.trim().toLowerCase();
      const inQtyKecil = it.qty * (isBesar ? ratio : 1);
      const bNo = (it.batchNo || med?.batchNo || '-').trim() || '-';
      const eDate = (it.expDate || med?.expDate || '').trim();
      return {
        id: `MUT-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        date: invoice.date,
        time: new Date().toLocaleTimeString('id-ID'),
        medicineId: it.medicineId || '',
        medicineName: it.name,
        refNo: invoice.invoiceNo,
        type: 'PEMBELIAN',
        inQty: inQtyKecil,
        outQty: 0,
        balance: (med?.stock || 0) + inQtyKecil,
        ket: `Penerimaan Faktur PBF ${invoice.pbfName}`,
        petugas: userName,
        branchId: currentBranch.id,
        batchNo: bNo,
        expDate: eDate,
        batchDetails: [{ batchNo: bNo, expDate: eDate, qty: inQtyKecil }]
      };
    });

    setStockMutations((prev) => [...newMutations, ...prev]);
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('purchase_invoices', [invoice.id]);
      syncPurchaseInvoiceToSupabase(invoice)
        .then((res) => {
          if (res.success) confirmCloudSync('purchase_invoices', [invoice.id]);
        })
        .catch((err) => console.warn('Supabase purchase invoice add sync error:', err));
      updatedMedicinesToSync.forEach((med) => {
        syncMedicineWithTracking(med).catch((err) =>
          console.warn('Supabase medicine update after purchase sync error:', err)
        );
      });
      if (newMutations.length > 0) {
        const mutIds = newMutations.map((m) => m.id).filter(Boolean);
        markIdsPendingSync('stock_mutations', mutIds);
        seedStockMutationsToSupabase(newMutations)
          .then((res) => {
            if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
            if (res.success) confirmCloudSync('stock_mutations', mutIds);
          })
          .catch((err) => console.warn('Supabase purchase stock mutation sync error:', err));
      }
    }
    addAuditLog('Faktur PBF', `Input faktur pembelian #${invoice.invoiceNo} dari ${invoice.pbfName}`);
  };

  // Handler: Update Purchase Invoice
  const handleUpdatePurchaseInvoice = (
    updated: PurchaseInvoice,
    stockIncrements: { medId: string; qty: number }[] = []
  ) => {
    const existing = purchaseInvoices.find((i) => i.id === updated.id);
    if (existing && existing.status === 'Lunas') {
      alert('Faktur dengan status Lunas tidak dapat diedit lagi!');
      return;
    }

    const applyUpdateToMedicine = (m: Medicine): { med: Medicine; changed: boolean } => {
      let baseMed = m;
      let changed = false;

      if (existing) {
        const oldItem = existing.items.find(
          (it) =>
            it.medicineId === m.id || it.name.toLowerCase().trim() === m.name.toLowerCase().trim()
        );
        if (oldItem) {
          const ratio = Math.max(1, Number(m.rasioKonversi) || 1);
          const isBesar =
            !m.satuanBesar ||
            (oldItem.unit || '').trim().toLowerCase() === m.satuanBesar.trim().toLowerCase();
          const qtyToRemove = oldItem.qty * (isBesar ? ratio : 1);
          baseMed = {
            ...m,
            stock: Math.max(0, m.stock - qtyToRemove)
          };
          changed = true;
        }
      }

      const found = stockIncrements.find((inc) => inc.medId === m.id);
      if (found) {
        const invItem = updated.items.find(
          (it) =>
            it.medicineId === m.id || it.name.toLowerCase().trim() === m.name.toLowerCase().trim()
        );
        const updatedBatch = addBatchStock(
          baseMed,
          invItem?.batchNo || baseMed.batchNo,
          invItem?.expDate || baseMed.expDate,
          found.qty
        );

        const pricing = computeMedicinePricingFromPurchase(
          baseMed,
          invItem,
          found.qty,
          updated,
          baseMed.stock || 0
        );

        return {
          changed: true,
          med: {
            ...baseMed,
            stock: updatedBatch.stock,
            hnaBesar: pricing.hnaBesar,
            hpp: pricing.hpp,
            sellPrice: pricing.sellPrice,
            sellPriceKlinik: pricing.sellPriceKlinik,
            sellPriceMitra: pricing.sellPriceMitra,
            markupReguler: pricing.markupReguler,
            markupKlinik: pricing.markupKlinik,
            markupMitra: pricing.markupMitra,
            batchNo: updatedBatch.batchNo,
            expDate: updatedBatch.expDate,
            batches: updatedBatch.batches
          }
        };
      }

      return { med: baseMed, changed };
    };

    const updatedMedicinesToSync = medicines
      .map((m) => applyUpdateToMedicine(m))
      .filter((r) => r.changed)
      .map((r) => r.med);

    setMedicines((prev) => prev.map((m) => applyUpdateToMedicine(m).med));

    setPurchaseInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));

    // Record stock delta mutations when purchase invoice items are updated
    const editMutations: StockMutation[] = [];
    const affectedMedIds = new Set<string>();
    (existing?.items || []).forEach((it) => {
      if (it.medicineId) affectedMedIds.add(it.medicineId);
    });
    updated.items.forEach((it) => {
      if (it.medicineId) affectedMedIds.add(it.medicineId);
    });

    affectedMedIds.forEach((medId) => {
      const med = medicines.find((m) => m.id === medId);
      if (!med) return;
      const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
      const oldQty = (existing?.items || [])
        .filter((it) => it.medicineId === medId)
        .reduce((s, it) => {
          const isBesar =
            !med.satuanBesar ||
            (it.unit || '').trim().toLowerCase() === med.satuanBesar.trim().toLowerCase();
          return s + (Number(it.qty) || 0) * (isBesar ? ratio : 1);
        }, 0);
      const newItemsForMed = updated.items.filter((it) => it.medicineId === medId);
      const newQty = newItemsForMed.reduce((s, it) => {
        const isBesar =
          !med.satuanBesar ||
          (it.unit || '').trim().toLowerCase() === med.satuanBesar.trim().toLowerCase();
        return s + (Number(it.qty) || 0) * (isBesar ? ratio : 1);
      }, 0);
      const delta = newQty - oldQty;
      if (delta === 0) return;

      const updatedMedSnapshot = updatedMedicinesToSync.find((u) => u.id === medId);
      const primaryNewItem = newItemsForMed[0];
      const bNo = (primaryNewItem?.batchNo || updatedMedSnapshot?.batchNo || med.batchNo || '-').trim() || '-';
      const eDate = (primaryNewItem?.expDate || updatedMedSnapshot?.expDate || med.expDate || '').trim();
      const nextBal = updatedMedSnapshot?.stock ?? Math.max(0, (Number(med.stock) || 0) + delta);

      editMutations.push({
        id: `MUT-EDIT-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        date: updated.date,
        time: new Date().toLocaleTimeString('id-ID'),
        medicineId: med.id,
        medicineName: primaryNewItem?.name || med.name,
        refNo: updated.invoiceNo,
        type: delta > 0 ? 'PEMBELIAN' : 'PENYESUAIAN',
        inQty: delta > 0 ? delta : 0,
        outQty: delta < 0 ? Math.abs(delta) : 0,
        balance: nextBal,
        ket: `Perubahan Faktur PBF #${updated.invoiceNo} (${updated.pbfName})`,
        petugas: userName,
        branchId: currentBranch.id,
        batchNo: bNo,
        expDate: eDate,
        batchDetails: [{ batchNo: bNo, expDate: eDate, qty: Math.abs(delta) }]
      });
    });

    if (editMutations.length > 0) {
      setStockMutations((prev) => [...editMutations, ...prev]);
    }

    if (!isDemoActive && !isDemoMode()) {
      syncPurchaseInvoiceToSupabase(updated).catch((err) =>
        console.warn('Supabase purchase invoice update sync error:', err)
      );
      updatedMedicinesToSync.forEach((med) => {
        syncMedicineWithTracking(med).catch((err) =>
          console.warn('Supabase medicine update after invoice edit error:', err)
        );
      });
      if (editMutations.length > 0) {
        seedStockMutationsToSupabase(editMutations)
          .then((res) => {
            if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
            if (res.needsBatchColumnMigration !== undefined) {
              setStockMutationsNeedsBatchMigration(Boolean(res.needsBatchColumnMigration));
            }
          })
          .catch((err) => console.warn('Supabase purchase invoice edit stock mutation sync error:', err));
      }
    }
    addAuditLog('Faktur PBF', `Update faktur pembelian #${updated.invoiceNo} (${updated.pbfName}) - Stok, HPP & Harga Jual diperbarui`);
  };

  // Handler: Delete Purchase Invoice
  const handleDeletePurchaseInvoice = (id: string) => {
    const inv = purchaseInvoices.find((i) => i.id === id);
    if (!inv) return;
    if (inv.status === 'Lunas') {
      alert('Faktur dengan status Lunas tidak dapat dihapus!');
      return;
    }
    if (confirm(`Apakah Anda yakin menghapus data ini (No. Faktur: ${inv.invoiceNo})?`)) {
      setPurchaseInvoices((prev) => prev.filter((i) => i.id !== id));

      const applyDeleteToMedicine = (m: Medicine): { med: Medicine; changed: boolean } => {
        const invItem = inv.items.find(
          (it) => it.medicineId === m.id || it.name.toLowerCase() === m.name.toLowerCase()
        );
        if (!invItem) return { med: m, changed: false };
        const ratio = Math.max(1, Number(m.rasioKonversi) || 1);
        const isBesar =
          !m.satuanBesar ||
          (invItem.unit || '').trim().toLowerCase() === m.satuanBesar.trim().toLowerCase();
        const qtyToRemove = invItem.qty * (isBesar ? ratio : 1);
        return {
          changed: true,
          med: {
            ...m,
            stock: Math.max(0, m.stock - qtyToRemove)
          }
        };
      };

      const updatedMedicinesToSync = medicines
        .map((m) => applyDeleteToMedicine(m))
        .filter((r) => r.changed)
        .map((r) => r.med);

      // Decrease stock in medicines corresponding to items in the deleted invoice
      setMedicines((prev) => prev.map((m) => applyDeleteToMedicine(m).med));

      // Record stock mutation for purchase deletion / cancellation
      const deleteMutations: StockMutation[] = inv.items.map((it) => {
        const med = medicines.find((m) => m.id === it.medicineId);
        const ratio = Math.max(1, Number(med?.rasioKonversi) || 1);
        const isBesar =
          !med?.satuanBesar ||
          (it.unit || '').trim().toLowerCase() === med.satuanBesar.trim().toLowerCase();
        const outQtyKecil = it.qty * (isBesar ? ratio : 1);
        const bNo = (it.batchNo || med?.batchNo || '-').trim() || '-';
        const eDate = (it.expDate || med?.expDate || '').trim();
        return {
          id: `MUT-DEL-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('id-ID'),
          medicineId: it.medicineId || '',
          medicineName: it.name,
          refNo: inv.invoiceNo,
          type: 'BATAL_BELI',
          inQty: 0,
          outQty: outQtyKecil,
          balance: Math.max(0, (med?.stock || 0) - outQtyKecil),
          ket: `Pembatalan / Penghapusan Faktur PBF #${inv.invoiceNo} (${inv.pbfName})`,
          petugas: userName,
          branchId: currentBranch.id,
          batchNo: bNo,
          expDate: eDate,
          batchDetails: [{ batchNo: bNo, expDate: eDate, qty: outQtyKecil }]
        };
      });

      setStockMutations((prev) => [...deleteMutations, ...prev]);

      markIdsDeleted('purchase_invoices', [id]);
      if (!isDemoActive && !isDemoMode()) {
        deletePurchaseInvoiceFromSupabase(id)
          .then((res) => {
            if (res.success) confirmCloudDeletes('purchase_invoices', [id]);
          })
          .catch((err) => console.warn('Supabase purchase invoice delete sync error:', err));
        updatedMedicinesToSync.forEach((med) => {
          syncMedicineWithTracking(med).catch((err) =>
            console.warn('Supabase medicine stock revert after invoice delete error:', err)
          );
        });
        if (deleteMutations.length > 0) {
          const mutIds = deleteMutations.map((m) => m.id).filter(Boolean);
          markIdsPendingSync('stock_mutations', mutIds);
          seedStockMutationsToSupabase(deleteMutations)
            .then((res) => {
              if (res.success) confirmCloudSync('stock_mutations', mutIds);
            })
            .catch((err) => console.warn('Supabase delete purchase stock mutation sync error:', err));
        }
      } else {
        confirmCloudDeletes('purchase_invoices', [id]);
      }
      addAuditLog('Faktur PBF', `Hapus faktur pembelian #${inv.invoiceNo} (Stok dikurangi)`);
      alert(`Faktur pembelian #${inv.invoiceNo} berhasil dihapus dan stok obat terkait telah dikurangi.`);
    }
  };

  // Handler: Process Return Purchase
  const handleProcessReturn = (
    invoiceId: string,
    returnedItems: { medicineId: string; name?: string; qty: number; unit: string; batchNo?: string; expDate?: string; price?: number; subtotal?: number; reason?: string }[]
  ) => {
    const inv = purchaseInvoices.find((i) => i.id === invoiceId);
    if (!inv) return;

    // Reduce stock in medicines
    setMedicines((prev) =>
      prev.map((m) => {
        const found = returnedItems.find((r) => r.medicineId === m.id);
        if (found) {
          const ratio = m.rasioKonversi || 1;
          const multiplier = found.unit === m.satuanBesar ? ratio : 1;
          return {
            ...m,
            stock: Math.max(0, m.stock - found.qty * multiplier)
          };
        }
        return m;
      })
    );

    // Record stock mutations
    const newMutations: StockMutation[] = returnedItems.map((rit) => {
      const med = medicines.find((m) => m.id === rit.medicineId);
      const currentStock = med?.stock || 0;
      const ratio = med?.rasioKonversi || 1;
      const multiplier = rit.unit === med?.satuanBesar ? ratio : 1;
      const dedQty = rit.qty * multiplier;
      const bNo = (rit.batchNo || med?.batchNo || '-').trim() || '-';
      const eDate = (rit.expDate || med?.expDate || '').trim();

      return {
        id: `MUT-RET-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('id-ID'),
        medicineId: rit.medicineId,
        medicineName: rit.name || med?.name || 'Obat',
        refNo: `RET-${inv.invoiceNo}`,
        type: 'RETUR PEMBELIAN',
        inQty: 0,
        outQty: dedQty,
        balance: Math.max(0, currentStock - dedQty),
        ket: `Retur ke PBF ${inv.pbfName}${rit.reason ? ' - Alasan: ' + rit.reason : ''}`,
        petugas: userName,
        branchId: currentBranch.id,
        batchNo: bNo,
        expDate: eDate,
        batchDetails: [{ batchNo: bNo, expDate: eDate, qty: dedQty }]
      };
    });

    setStockMutations((prev) => [...newMutations, ...prev]);
    if (!isDemoActive && !isDemoMode() && newMutations.length > 0) {
      seedStockMutationsToSupabase(newMutations)
        .then((res) => {
          if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
        })
        .catch((err) => console.warn('Supabase purchase return stock mutation sync error:', err));
    }

    // Create PurchaseReturnRecord
    const detailedItems = returnedItems.map((rit) => {
      const med = medicines.find((m) => m.id === rit.medicineId);
      const price = rit.price || med?.hpp || 0;
      return {
        medicineId: rit.medicineId,
        name: rit.name || med?.name || 'Obat',
        qty: rit.qty,
        unit: rit.unit,
        batchNo: rit.batchNo || med?.batchNo || '-',
        expDate: rit.expDate || med?.expDate || '2028-12-31',
        price,
        subtotal: (rit as any).subtotal || (rit.qty * price),
        reason: rit.reason || (rit as any).alasan || '',
        alasan: rit.reason || (rit as any).alasan || ''
      };
    });

    const totalVal = detailedItems.reduce((acc, it) => acc + it.subtotal, 0);
    const newReturnRecord: PurchaseReturnRecord = {
      id: `RET-${Date.now().toString().slice(-6)}`,
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo,
      pbfName: inv.pbfName,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('id-ID'),
      salesman: inv.salesman,
      items: detailedItems,
      totalReturValue: totalVal,
      petugas: userName,
      branchId: currentBranch.id
    };

    setPurchaseReturns((prev) => [newReturnRecord, ...prev]);
    addAuditLog('Retur PBF', `Proses retur faktur #${inv.invoiceNo} ke ${inv.pbfName} sebanyak ${returnedItems.length} item obat.`);
  };

  const handleDeletePurchaseReturn = (id: string) => {
    setPurchaseReturns((prev) => prev.filter((r) => r.id !== id));
    addAuditLog('Retur PBF', `Hapus arsip riwayat retur #${id}`);
  };

  // Handler: Update Existing Purchase Return Record (Overwrite data lama, cegah duplikasi)
  const handleUpdatePurchaseReturn = (
    returnId: string,
    updatedItems: { medicineId: string; name?: string; qty: number; unit: string; batchNo?: string; expDate?: string; price?: number; subtotal?: number; reason?: string; alasan?: string }[]
  ) => {
    setPurchaseReturns((prev) => {
      const updatedList = prev.map((ret) => {
        if (ret.id === returnId) {
          const detailedItems = updatedItems.map((rit) => {
            const med = medicines.find((m) => m.id === rit.medicineId);
            const price = rit.price || med?.hpp || 0;
            return {
              medicineId: rit.medicineId,
              name: rit.name || med?.name || 'Obat',
              qty: rit.qty,
              unit: rit.unit,
              batchNo: rit.batchNo || med?.batchNo || '-',
              expDate: rit.expDate || med?.expDate || '2028-12-31',
              price,
              subtotal: rit.subtotal || (rit.qty * price),
              reason: rit.reason || (rit as any).alasan || '',
              alasan: rit.reason || (rit as any).alasan || ''
            };
          });
          const totalVal = detailedItems.reduce((acc, it) => acc + it.subtotal, 0);

          return {
            ...ret,
            items: detailedItems,
            totalReturValue: totalVal
          };
        }
        return ret;
      });
      try {
        demoSetItem('latisha_purchase_returns', JSON.stringify(updatedList));
      } catch (e) {}
      return updatedList;
    });
    addAuditLog('Retur PBF', `Perbarui data riwayat retur #${returnId}`);
  };

  // Handler: Accept Online Registration to Today's Queue with Supabase Duplicate Check & Auto-Insert
  const handleAcceptOnlineRegistrationToQueue = async (reg: OnlineRegistration) => {
    // 1. Pengecekan Otomatis (Duplicate Check) & Auto-Insert ke Supabase tabel_pasien
    const regResult = await checkOrRegisterPatientSupabase({
      nik: reg.nik,
      name: reg.name,
      birthDate: reg.birthDate,
      gender: reg.gender,
      phone: reg.phone,
      address: reg.address,
      allergy: reg.allergy,
      category: 'Pasien Praktik'
    });

    const patient = regResult.patient;

    // Pastikan state local ter-update jika pasien baru
    if (regResult.isNew) {
      setPatients((prev) => {
        if (!prev.some((p) => isSamePatientRecord(p, patient) || (patient.nik && p.nik === patient.nik))) {
          return deduplicatePatients([patient, ...prev]);
        }
        return deduplicatePatients(prev);
      });
      addAuditLog('Master Pasien', `Auto-Insert pasien baru ${patient.name} (${patient.id}) ke Supabase`);
    }

    const nextNum = `A-${String(queue.length + 1).padStart(3, '0')}`;
    const newQueueItem: PatientQueue = {
      nomor: nextNum,
      rmId: patient.id,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      vital: { td: '120/80', suhu: 36.5, nadi: 80, spo2: 98 },
      status: 'Menunggu',
      doctorId: reg.doctorId,
      doctorName: reg.doctorName,
      checkinTime: reg.appointmentTime || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      source: 'Pendaftaran Online',
      complaint: reg.complaint,
      serviceType: reg.serviceType,
      branchId: currentBranch.id
    };

    setQueue((prev) => [...prev, newQueueItem]);
    const updatedReg: OnlineRegistration = { ...reg, status: 'Diterima' };
    setOnlineRegistrations((prev) =>
      prev.map((r) => (r.id === reg.id ? updatedReg : r))
    );
    syncOnlineRegistrationToSupabase(updatedReg).catch((err) => console.warn('Supabase reg status update error:', err));

    addAuditLog('Online Registration', `Verifikasi booking #${reg.bookingCode} untuk pasien ${reg.name} (RM: ${patient.id}) ke antrean ${nextNum}`);
    alert(`${regResult.message}\nNomor Antrean Poli Hari Ini: ${nextNum}`);
  };

  // Handler: Add Stock Transfer (with 2-way Supabase sync & Kartu Stok mutation)
  const handleAddTransfer = (transfer: StockTransfer) => {
    setTransfers((prev) => [transfer, ...prev]);

    let updatedMedicineForSync: Medicine | null = null;
    // Update stock in medicine list (FEFO multi-batch aware)
    setMedicines((prev) =>
      prev.map((m) => {
        if (m.id === transfer.medicineId) {
          const updated = deductBatchesFEFO(m, transfer.qty);
          const nextMed: Medicine = {
            ...m,
            stock: updated.stock,
            batchNo: updated.batchNo,
            expDate: updated.expDate,
            batches: updated.batches
          };
          updatedMedicineForSync = nextMed;
          return nextMed;
        }
        return m;
      })
    );

    const fromBranchObj = branches.find((b) => b.id === transfer.fromBranchId);
    const toBranchObj = branches.find((b) => b.id === transfer.toBranchId);
    const targetMed = medicines.find((m) => m.id === transfer.medicineId);
    const newBalance = Math.max(0, (targetMed?.stock ?? transfer.qty) - transfer.qty);
    const transferAlloc = targetMed ? allocateBatchesFEFO(targetMed, transfer.qty) : null;

    const transferMutation: StockMutation = {
      id: `MUT-TRF-${Date.now().toString().slice(-6)}`,
      date: transfer.date,
      time:
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        }) + ' WIB',
      medicineId: transfer.medicineId,
      medicineName: transfer.medicineName,
      refNo: transfer.id,
      type: 'TRANSFER_KELUAR',
      inQty: 0,
      outQty: transfer.qty,
      balance: newBalance,
      ket: `Transfer stok dari ${fromBranchObj?.name || transfer.fromBranchId} ke ${toBranchObj?.name || transfer.toBranchId}${transfer.notes ? ` (${transfer.notes})` : ''}`,
      petugas: transfer.petugas || userName,
      branchId: transfer.fromBranchId,
      hpp: targetMed?.hpp,
      nominalDiff: targetMed?.hpp ? -(transfer.qty * targetMed.hpp) : undefined,
      batchNo: transferAlloc?.batchNo || targetMed?.batchNo || '-',
      expDate: transferAlloc?.expDate || targetMed?.expDate || '',
      batchDetails: transferAlloc?.allocations
    };

    setStockMutations((prev) => [transferMutation, ...prev]);

    if (!isDemoActive && !isDemoMode()) {
      syncBranchTransferToSupabase(transfer).then((res) => {
        if (res.needsTableSetup) setMultiCabangNeedsTableSetup(true);
      });
      if (updatedMedicineForSync) {
        syncMedicineWithTracking(updatedMedicineForSync).catch(() => {});
      }
      syncStockMutationToSupabase(transferMutation).catch(() => {});
    }

    addAuditLog('Transfer Stok', `Transfer #${transfer.id} sebanyak ${transfer.qty} ${transfer.unit} ${transfer.medicineName}`);
  };

  // Handler: Delete Stock Transfer
  const handleDeleteTransfer = (transferId: string) => {
    const cleanId = String(transferId || '').trim();
    if (!cleanId) return;
    markIdsDeleted('branch_transfers', [cleanId]);
    setTransfers((prev) => prev.filter((t) => t.id !== cleanId));
    if (!isDemoActive && !isDemoMode()) {
      deleteBranchTransferFromSupabase(cleanId).then((res) => {
        if (res.needsTableSetup) setMultiCabangNeedsTableSetup(true);
        if (res.success) confirmCloudDeletes('branch_transfers', [cleanId]);
      });
    } else {
      confirmCloudDeletes('branch_transfers', [cleanId]);
    }
    addAuditLog('Transfer Stok', `Hapus riwayat transfer stok antar-cabang #${cleanId}`);
  };

  // Handler: Add Branch
  const handleAddBranch = (newBranch: Branch) => {
    let nextBranchesList: Branch[] = [];
    setBranches((prev) => {
      if (newBranch.isCentral) {
        nextBranchesList = [
          ...prev.map((b) => ({ ...b, isCentral: false })),
          { ...newBranch, isCentral: true }
        ];
      } else {
        nextBranchesList = [...prev, newBranch];
      }
      return nextBranchesList;
    });

    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('branches', [newBranch.id]);
      if (newBranch.isCentral && nextBranchesList.length > 0) {
        seedBranchesToSupabase(nextBranchesList).then((res) => {
          if (res.needsTableSetup) setMultiCabangNeedsTableSetup(true);
          if (res.success) confirmCloudSync('branches', nextBranchesList.map((b) => b.id));
        });
      } else {
        syncBranchToSupabase(newBranch).then((res) => {
          if (res.needsTableSetup) setMultiCabangNeedsTableSetup(true);
          if (res.success) confirmCloudSync('branches', [newBranch.id]);
        });
      }
    }

    addAuditLog('Cabang', `Tambah cabang baru: ${newBranch.name} (${newBranch.code})`);
  };

  // Handler: Delete Branch
  const handleDeleteBranch = (branchId: string) => {
    const branchToDelete = branches.find((b) => b.id === branchId);
    if (!branchToDelete) return;
    if (branchToDelete.isCentral) return;

    markIdsDeleted('branches', [branchId]);
    setBranches((prev) => prev.filter((b) => b.id !== branchId));
    if (currentBranch.id === branchId) {
      const fallback = branches.find((b) => b.isCentral) || branches[0];
      if (fallback) setCurrentBranch(fallback);
    }

    if (!isDemoActive && !isDemoMode()) {
      deleteBranchFromSupabase(branchId).then((res) => {
        if (res.needsTableSetup) setMultiCabangNeedsTableSetup(true);
        if (res.success) confirmCloudDeletes('branches', [branchId]);
      });
    } else {
      confirmCloudDeletes('branches', [branchId]);
    }

    addAuditLog('Cabang', `Hapus cabang: ${branchToDelete.name} (${branchToDelete.code})`);
  };

  // Handler: Update Branch (including Pusat Induk status)
  const handleUpdateBranch = (updatedBranch: Branch) => {
    let updatedListForSync: Branch[] = [];
    setBranches((prev) => {
      if (updatedBranch.isCentral) {
        updatedListForSync = prev.map((b) =>
          b.id === updatedBranch.id
            ? { ...updatedBranch, isCentral: true }
            : { ...b, isCentral: false }
        );
      } else {
        updatedListForSync = prev.map((b) => (b.id === updatedBranch.id ? updatedBranch : b));
      }
      return updatedListForSync;
    });

    if (currentBranch.id === updatedBranch.id) {
      setCurrentBranch(updatedBranch);
    }

    if (!isDemoActive && !isDemoMode()) {
      if (updatedBranch.isCentral && updatedListForSync.length > 0) {
        seedBranchesToSupabase(updatedListForSync).then((res) => {
          if (res.needsTableSetup) setMultiCabangNeedsTableSetup(true);
        });
      } else {
        syncBranchToSupabase(updatedBranch).then((res) => {
          if (res.needsTableSetup) setMultiCabangNeedsTableSetup(true);
        });
      }
    }

    addAuditLog('Cabang', `Update data cabang: ${updatedBranch.name} (${updatedBranch.code})${updatedBranch.isCentral ? ' [Pusat Induk]' : ''}`);
  };

  // Handlers: Mitra
  const handleAddMitra = (m: Mitra) => {
    setMitraList((prev) => {
      const next = prev.some((item) => item.id === m.id)
        ? prev.map((item) => (item.id === m.id ? m : item))
        : [m, ...prev];
      persistMitraListNow(next);
      return next;
    });
    addAuditLog('Setup Mitra', `Registrasi faskes mitra baru: ${m.name} (${m.licenseNo})`);
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_channel'));
        bc.postMessage({ type: 'MITRA_ADD', mitra: m });
        bc.close();
      }
    } catch {}
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('mitra', [m.id]);
      syncMitraToSupabase(m)
        .then((res) => {
          if (res.success) confirmCloudSync('mitra', [m.id]);
        })
        .catch(() => {});
    }
  };

  const handleUpdateMitra = (m: Mitra) => {
    setMitraList((prev) => {
      const next = prev.map((item) => (item.id === m.id ? m : item));
      persistMitraListNow(next);
      return next;
    });
    addAuditLog('Setup Mitra', `Update data faskes mitra: ${m.name} (${m.id})`);
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_mitra_channel'));
        bc.postMessage({ type: 'MITRA_UPDATE', mitra: m });
        bc.close();
      }
    } catch {}
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('mitra', [m.id]);
      syncMitraToSupabase(m)
        .then((res) => {
          if (res.success) confirmCloudSync('mitra', [m.id]);
        })
        .catch(() => {});
    }
  };

  const handleDeleteMitra = (id: string) => {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;
    const found = mitraListRef.current.find((item) => item.id === cleanId);
    markIdsDeleted('mitra', [cleanId]);
    setMitraList((prev) => {
      const next = prev.filter((item) => item.id !== cleanId);
      persistMitraListNow(next);
      return next;
    });
    addAuditLog('Setup Mitra', `Hapus faskes mitra: ${found?.name || cleanId}`);
    if (!isDemoActive && !isDemoMode()) {
      deleteMitraFromSupabase(cleanId)
        .then((res) => {
          if (res.success) confirmCloudDeletes('mitra', [cleanId]);
        })
        .catch(() => {});
    } else {
      confirmCloudDeletes('mitra', [cleanId]);
    }
  };

  const handleSyncMitraSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Koneksi Supabase produksi dinonaktifkan.'
      };
    }

    const pendingDeleteIds = getPendingDeleteIds('mitra');
    if (pendingDeleteIds.length > 0) {
      for (const delId of pendingDeleteIds) {
        const dRes = await deleteMitraFromSupabase(delId).catch(() => ({ success: false }));
        if (dRes.success) confirmCloudDeletes('mitra', [delId]);
      }
    }

    const res = await fetchMitraFromSupabase();
    if (res.error) {
      return {
        success: false,
        needsTableSetup: res.needsTableSetup,
        error: res.error
      };
    }

    const demoMitraIds = ['MTR-001', 'MTR-002', 'MTR-003'];
    const deletedSet = getDeletedIdsSet('mitra');
    const pendingSyncSet = getPendingSyncIdsSet('mitra');
    const syncedOnceBefore = hasCompletedInitialCloudSync('mitra');
    const remoteAll = res.data || [];

    const stubbornIds = remoteAll.filter((m) => m.id && deletedSet.has(m.id)).map((m) => m.id);
    if (stubbornIds.length > 0) {
      await Promise.all(
        stubbornIds.map((sid) =>
          deleteMitraFromSupabase(sid)
            .then((dRes) => {
              if (dRes.success) confirmCloudDeletes('mitra', [sid]);
            })
            .catch(() => {})
        )
      );
    }

    const remoteClean = remoteAll.filter(
      (m) => m.id && !demoMitraIds.includes(m.id) && !deletedSet.has(m.id)
    );
    const remoteIds = new Set(remoteClean.map((m) => m.id));
    const localValid = mitraListRef.current.filter(
      (m) => m.id && !demoMitraIds.includes(m.id) && !deletedSet.has(m.id)
    );
    const localToUpload = localValid.filter(
      (m) => pendingSyncSet.has(m.id) || (!syncedOnceBefore && !remoteIds.has(m.id))
    );

    if (localToUpload.length > 0) {
      const seedRes = await seedMitraToSupabase(localToUpload);
      if (!seedRes.success && seedRes.error) {
        return {
          success: false,
          needsTableSetup: seedRes.needsTableSetup,
          error: seedRes.error
        };
      }
      if (seedRes.success) {
        confirmCloudSync('mitra', localToUpload.map((m) => m.id));
      }
    }

    const mergedMap = new Map<string, Mitra>();
    remoteClean.forEach((m) => mergedMap.set(m.id, m));
    localToUpload.forEach((m) => {
      if (!mergedMap.has(m.id) || pendingSyncSet.has(m.id)) mergedMap.set(m.id, m);
    });
    const merged = Array.from(mergedMap.values());
    setMitraList(merged);
    persistMitraListNow(merged);
    markInitialCloudSyncCompleted('mitra');
    return { success: true, count: merged.length };
  };

  // Handlers: Manajemen Diskon & Promo Portal Mitra
  const broadcastPromoDiscounts = (nextDiscounts: SalesDiscount[], nextPromos: PromoAd[]) => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(getDemoBroadcastChannelName('latisha_promo_discount_channel'));
        bc.postMessage({
          type: 'PROMO_DISCOUNT_SYNC',
          discounts: nextDiscounts,
          promos: nextPromos
        });
        bc.close();
      }
    } catch {}
    if (!isDemoActive && !isDemoMode()) {
      pushDiscountsPromosToServerBridge(nextDiscounts, nextPromos).catch(() => {});
    }
  };

  const handleSaveDiscount = (d: SalesDiscount, isEdit: boolean) => {
    const nextDiscounts = isEdit
      ? salesDiscounts.map((item) => (item.id === d.id ? d : item))
      : [d, ...salesDiscounts];
    setSalesDiscounts(nextDiscounts);
    broadcastPromoDiscounts(nextDiscounts, promoAds);
    addAuditLog(
      'Diskon & Promo',
      `${isEdit ? 'Perbarui' : 'Tambah'} program diskon penjualan: ${d.name}`
    );
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('discounts_promos', [d.id]);
      syncDiscountToSupabase(d)
        .then((res) => {
          if (res.needsTableSetup) setPromoDiscountNeedsTableSetup(true);
          if (res.success) confirmCloudSync('discounts_promos', [d.id]);
        })
        .catch(() => {});
    }
  };

  const handleDeleteDiscount = (id: string) => {
    const cleanId = String(id || '').trim();
    const found = salesDiscounts.find((d) => d.id === cleanId);
    markIdsDeleted('discounts_promos', [cleanId]);
    const nextDiscounts = salesDiscounts.filter((d) => d.id !== cleanId);
    setSalesDiscounts(nextDiscounts);
    broadcastPromoDiscounts(nextDiscounts, promoAds);
    addAuditLog('Diskon & Promo', `Hapus program diskon: ${found?.name || cleanId}`);
    if (!isDemoActive && !isDemoMode()) {
      deletePromoOrDiscountFromSupabase(cleanId)
        .then((res) => {
          if (res.success) confirmCloudDeletes('discounts_promos', [cleanId]);
        })
        .catch(() => {});
    } else {
      confirmCloudDeletes('discounts_promos', [cleanId]);
    }
  };

  const handleToggleDiscountActive = (id: string) => {
    const target = salesDiscounts.find((d) => d.id === id);
    if (!target) return;
    const updated: SalesDiscount = {
      ...target,
      isActive: !target.isActive,
      updatedAt: new Date().toISOString()
    };
    handleSaveDiscount(updated, true);
  };

  const handleSavePromo = (p: PromoAd, isEdit: boolean) => {
    const nextPromos = isEdit
      ? promoAds.map((item) => (item.id === p.id ? p : item))
      : [p, ...promoAds];
    setPromoAds(nextPromos);
    broadcastPromoDiscounts(salesDiscounts, nextPromos);
    addAuditLog(
      'Diskon & Promo',
      `${isEdit ? 'Perbarui' : 'Tambah'} iklan promo Portal Mitra: ${p.title}`
    );
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('discounts_promos', [p.id]);
      syncPromoToSupabase(p)
        .then((res) => {
          if (res.needsTableSetup) setPromoDiscountNeedsTableSetup(true);
          if (res.success) confirmCloudSync('discounts_promos', [p.id]);
        })
        .catch(() => {});
    }
  };

  const handleDeletePromo = (id: string) => {
    const cleanId = String(id || '').trim();
    const found = promoAds.find((p) => p.id === cleanId);
    markIdsDeleted('discounts_promos', [cleanId]);
    const nextPromos = promoAds.filter((p) => p.id !== cleanId);
    setPromoAds(nextPromos);
    broadcastPromoDiscounts(salesDiscounts, nextPromos);
    addAuditLog('Diskon & Promo', `Hapus iklan promo: ${found?.title || cleanId}`);
    if (!isDemoActive && !isDemoMode()) {
      deletePromoOrDiscountFromSupabase(cleanId)
        .then((res) => {
          if (res.success) confirmCloudDeletes('discounts_promos', [cleanId]);
        })
        .catch(() => {});
    } else {
      confirmCloudDeletes('discounts_promos', [cleanId]);
    }
  };

  const handleTogglePromoActive = (id: string) => {
    const target = promoAds.find((p) => p.id === id);
    if (!target) return;
    const updated: PromoAd = {
      ...target,
      isActive: !target.isActive,
      updatedAt: new Date().toISOString()
    };
    handleSavePromo(updated, true);
  };

  const handleSyncPromoDiscountSupabase = async () => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase dinonaktifkan.'
      };
    }

    const pendingDeletes = getPendingDeleteIds('discounts_promos');
    if (pendingDeletes.length > 0) {
      for (const delId of pendingDeletes) {
        const dRes = await deletePromoOrDiscountFromSupabase(delId).catch(() => ({ success: false }));
        if (dRes.success) confirmCloudDeletes('discounts_promos', [delId]);
      }
    }

    const fetchRes = await fetchDiscountsPromosFromSupabase();
    if (fetchRes.error) {
      setPromoDiscountNeedsTableSetup(Boolean(fetchRes.needsTableSetup));
      return {
        success: false,
        needsTableSetup: fetchRes.needsTableSetup,
        error: fetchRes.error
      };
    }

    const deletedSet = getDeletedIdsSet('discounts_promos');
    const pendingSyncSet = getPendingSyncIdsSet('discounts_promos');
    const syncedOnceBefore = hasCompletedInitialCloudSync('discounts_promos');

    const stubbornIds = [
      ...fetchRes.discounts.filter((d) => d.id && deletedSet.has(d.id)).map((d) => d.id),
      ...fetchRes.promos.filter((p) => p.id && deletedSet.has(p.id)).map((p) => p.id)
    ];
    if (stubbornIds.length > 0) {
      await Promise.all(
        stubbornIds.map((sid) =>
          deletePromoOrDiscountFromSupabase(sid)
            .then((dRes) => {
              if (dRes.success) confirmCloudDeletes('discounts_promos', [sid]);
            })
            .catch(() => {})
        )
      );
    }

    const remoteDiscounts = fetchRes.discounts.filter((d) => d.id && !deletedSet.has(d.id));
    const remotePromos = fetchRes.promos.filter((p) => p.id && !deletedSet.has(p.id));
    const remoteDiscIds = new Set(remoteDiscounts.map((d) => d.id));
    const remotePromoIds = new Set(remotePromos.map((p) => p.id));

    const localDiscountsToUpload = salesDiscountsRef.current.filter(
      (d) =>
        d.id &&
        !deletedSet.has(d.id) &&
        (pendingSyncSet.has(d.id) || (!syncedOnceBefore && !remoteDiscIds.has(d.id)))
    );
    const localPromosToUpload = promoAdsRef.current.filter(
      (p) =>
        p.id &&
        !deletedSet.has(p.id) &&
        (pendingSyncSet.has(p.id) || (!syncedOnceBefore && !remotePromoIds.has(p.id)))
    );

    if (localDiscountsToUpload.length > 0 || localPromosToUpload.length > 0) {
      const seedRes = await seedDiscountsPromosToSupabase(localDiscountsToUpload, localPromosToUpload);
      if (!seedRes.success && seedRes.error) {
        setPromoDiscountNeedsTableSetup(Boolean(seedRes.needsTableSetup));
        return {
          success: false,
          needsTableSetup: seedRes.needsTableSetup,
          error: seedRes.error
        };
      }
      if (seedRes.success) {
        confirmCloudSync('discounts_promos', [
          ...localDiscountsToUpload.map((d) => d.id),
          ...localPromosToUpload.map((p) => p.id)
        ]);
      }
    }

    const mergedDiscountsMap = new Map<string, SalesDiscount>();
    remoteDiscounts.forEach((d) => mergedDiscountsMap.set(d.id, d));
    localDiscountsToUpload.forEach((d) => {
      if (!mergedDiscountsMap.has(d.id) || pendingSyncSet.has(d.id)) mergedDiscountsMap.set(d.id, d);
    });
    const mergedPromosMap = new Map<string, PromoAd>();
    remotePromos.forEach((p) => mergedPromosMap.set(p.id, p));
    localPromosToUpload.forEach((p) => {
      if (!mergedPromosMap.has(p.id) || pendingSyncSet.has(p.id)) mergedPromosMap.set(p.id, p);
    });
    const mergedDiscounts = Array.from(mergedDiscountsMap.values());
    const mergedPromos = Array.from(mergedPromosMap.values());
    setSalesDiscounts(mergedDiscounts);
    setPromoAds(mergedPromos);
    broadcastPromoDiscounts(mergedDiscounts, mergedPromos);
    setPromoDiscountNeedsTableSetup(false);
    markInitialCloudSyncCompleted('discounts_promos');
    return { success: true, count: mergedDiscounts.length + mergedPromos.length };
  };

  // Handlers: Pengaturan Tarif & Jasa Medis (Two-Way Supabase)
  const handleSaveFeeConfig = async (
    updatedConfig: FeeConfig
  ): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
    updatedAt?: string;
  }> => {
    setFeeConfig(updatedConfig);
    if (updatedConfig.payrollConfig) {
      try {
        demoSetItem('latisha_payroll_overtime_config', JSON.stringify(updatedConfig.payrollConfig));
      } catch {}
    }
    addAuditLog(
      'Gaji, Jasa, Fee & Lembur',
      `Memperbarui pengaturan gaji, lembur Minggu & tarif jasa medis (Dokter: Rp ${(updatedConfig.doctorFee || 0).toLocaleString('id-ID')}, Penunjang: Rp ${(updatedConfig.medicalSupportFee || 0).toLocaleString('id-ID')}, Apoteker: Rp ${(updatedConfig.pharmacistFee || 0).toLocaleString('id-ID')}, Layanan Khusus: ${(updatedConfig.customTariffs || []).length} item)`
    );

    if (isDemoActive || isDemoMode()) {
      return { success: true, isDemo: true };
    }

    const syncRes = await syncFeeConfigToSupabase(updatedConfig, userName);
    setFeeConfigNeedsTableSetup(Boolean(syncRes.needsTableSetup));
    return syncRes;
  };

  const handleSyncFeeConfigSupabase = async (
    mode: 'auto' | 'push' | 'pull' = 'auto'
  ): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
    updatedAt?: string;
    action?: 'pushed' | 'pulled';
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase dinonaktifkan.'
      };
    }

    if (mode === 'push') {
      const pushRes = await syncFeeConfigToSupabase(feeConfig, userName);
      setFeeConfigNeedsTableSetup(Boolean(pushRes.needsTableSetup));
      if (!pushRes.success) {
        return {
          success: false,
          needsTableSetup: pushRes.needsTableSetup,
          error: pushRes.error
        };
      }
      setFeeConfigNeedsTableSetup(false);
      return { success: true, updatedAt: pushRes.updatedAt, action: 'pushed' };
    }

    const fetchRes = await fetchFeeConfigFromSupabase();
    if (fetchRes.error) {
      setFeeConfigNeedsTableSetup(Boolean(fetchRes.needsTableSetup));
      return {
        success: false,
        needsTableSetup: fetchRes.needsTableSetup,
        error: fetchRes.error
      };
    }

    if (fetchRes.isEmpty || !fetchRes.data) {
      const pushRes = await syncFeeConfigToSupabase(feeConfig, userName);
      setFeeConfigNeedsTableSetup(Boolean(pushRes.needsTableSetup));
      if (!pushRes.success) {
        return {
          success: false,
          needsTableSetup: pushRes.needsTableSetup,
          error: pushRes.error
        };
      }
      setFeeConfigNeedsTableSetup(false);
      return { success: true, updatedAt: pushRes.updatedAt, action: 'pushed' };
    }

    setFeeConfig(fetchRes.data);
    setFeeConfigNeedsTableSetup(false);
    return { success: true, updatedAt: fetchRes.updatedAt, action: 'pulled' };
  };

  const handleUpdateFeeLedgerStatus = async (
    ids: string[],
    nextStatus: 'belum_dibayar' | 'dibayar',
    paidBy?: string
  ) => {
    const idSet = new Set((ids || []).filter(Boolean));
    if (idSet.size === 0) return;

    const nowIso = new Date().toISOString();
    const reconciledPool = reconcileFeeLedgerWithTransactions(
      feeLedgerRef.current,
      transactionsRef.current,
      feeConfig,
      effectiveStaffList
    );
    const reconciledById = new Map(reconciledPool.map((e) => [e.id, e]));

    const updatedRows: StaffFeeLedgerEntry[] = [];
    setFeeLedger((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const next = prev.map((entry) => {
        if (!idSet.has(entry.id) || entry.status_pembayaran === 'dibatalkan') return entry;
        const patched: StaffFeeLedgerEntry = {
          ...entry,
          status_pembayaran: nextStatus,
          paid_at: nextStatus === 'dibayar' ? nowIso : undefined,
          paid_by: nextStatus === 'dibayar' ? paidBy || userName : undefined,
          updated_at: nowIso
        };
        updatedRows.push(patched);
        return patched;
      });

      // Jika entri berasal dari rekonsiliasi transaksi POS yang belum tersimpan di state feeLedger, sisipkan sekaligus perbarui statusnya
      idSet.forEach((targetId) => {
        if (existingIds.has(targetId)) return;
        const derivedEntry = reconciledById.get(targetId);
        if (!derivedEntry || derivedEntry.status_pembayaran === 'dibatalkan') return;
        const patched: StaffFeeLedgerEntry = {
          ...derivedEntry,
          status_pembayaran: nextStatus,
          paid_at: nextStatus === 'dibayar' ? nowIso : undefined,
          paid_by: nextStatus === 'dibayar' ? paidBy || userName : undefined,
          updated_at: nowIso
        };
        updatedRows.push(patched);
        next.unshift(patched);
      });

      persistFeeLedgerNow(next);
      return next;
    });

    if (updatedRows.length > 0 && !isDemoActive && !isDemoMode()) {
      const res = await upsertFeeLedgerEntriesToSupabase(updatedRows).catch((err) => ({
        success: false,
        needsTableSetup: false,
        error: err?.message || String(err)
      }));
      if (res.needsTableSetup) setFeeLedgerNeedsTableSetup(true);
    }

    addAuditLog(
      'Ledger Fee Petugas',
      `Status pembayaran ${idSet.size} entri fee petugas diubah menjadi ${nextStatus === 'dibayar' ? 'Dibayar' : 'Belum Dibayar'}`
    );
  };

  const handleSyncFeeLedgerSupabase = async (): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
    count?: number;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase dinonaktifkan.'
      };
    }

    // 1. Replay pending deletes for fee_ledger (both by transaction_id and by entry id)
    const pendingTrxDeletes = getPendingDeleteFeeLedgerTrxIds();
    if (pendingTrxDeletes.length > 0) {
      const delTrxRes = await deleteFeeLedgerByTransactionsInSupabase(pendingTrxDeletes);
      if (delTrxRes.needsTableSetup) {
        setFeeLedgerNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: delTrxRes.error };
      }
      if (delTrxRes.success) {
        confirmFeeLedgerTrxDeletes(pendingTrxDeletes);
      }
    }
    const pendingFeeDeletes = getPendingDeleteIds('fee_ledger');
    if (pendingFeeDeletes.length > 0) {
      const delFeeRes = await deleteFeeLedgerByIdsInSupabase(pendingFeeDeletes);
      if (delFeeRes.needsTableSetup) {
        setFeeLedgerNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: delFeeRes.error };
      }
      if (delFeeRes.success) {
        confirmCloudDeletes('fee_ledger', pendingFeeDeletes);
      }
    }

    // 2. Fetch authoritative transactions snapshot so deleted/empty riwayat_penjualan prunes log_fee_petugas
    const deletedTrxSet = getDeletedIdsSet('transactions');
    const pendingSyncTrxSet = getPendingSyncIdsSet('transactions');
    const demoTrxIds = ['TRX-1001', 'TRX-1002', 'FPJ-202610-1003', 'TRX-1004'];
    let authoritativeTransactions: Transaction[] = transactionsRef.current.filter(
      (t) => t?.id && !demoTrxIds.includes(t.id) && !deletedTrxSet.has(String(t.id).trim())
    );
    const trxFetchRes = await fetchTransactionsFromSupabase({ forceRefresh: true }).catch(() => null);
    if (trxFetchRes && !trxFetchRes.needsTableSetup && !trxFetchRes.error && trxFetchRes.data !== null) {
      const trxMap = new Map<string, Transaction>();
      (trxFetchRes.data || [])
        .filter((t) => t?.id && !demoTrxIds.includes(t.id) && !deletedTrxSet.has(String(t.id).trim()))
        .forEach((t) => trxMap.set(String(t.id).trim(), t));
      transactionsRef.current
        .filter(
          (t) =>
            t?.id &&
            !demoTrxIds.includes(t.id) &&
            !deletedTrxSet.has(String(t.id).trim()) &&
            pendingSyncTrxSet.has(String(t.id).trim())
        )
        .forEach((t) => trxMap.set(String(t.id).trim(), t));
      authoritativeTransactions = Array.from(trxMap.values());
      transactionsAuthoritativeRef.current = true;
      setTransactions(authoritativeTransactions);
      persistTransactionsNow(authoritativeTransactions);
      markInitialCloudSyncCompleted('transactions');
    }

    const activeTrxIds = new Set(
      authoritativeTransactions.map((t) => String(t.id).trim()).filter(Boolean)
    );

    // 3. Fetch remote log_fee_petugas rows and delete any deleted or orphaned entries on Supabase
    const fetchRes = await fetchFeeLedgerFromSupabase();
    setFeeLedgerNeedsTableSetup(Boolean(fetchRes.needsTableSetup));
    if (fetchRes.needsTableSetup || fetchRes.error) {
      return {
        success: false,
        needsTableSetup: fetchRes.needsTableSetup,
        error: fetchRes.error || 'Tabel log_fee_petugas belum tersedia di Supabase.'
      };
    }

    const deletedFeeSet = getDeletedIdsSet('fee_ledger');
    const remoteAll = fetchRes.data || [];
    const orphanRemoteIds: string[] = [];
    const orphanRemoteTrxIds = new Set<string>();
    const remoteClean: StaffFeeLedgerEntry[] = [];

    remoteAll.forEach((e) => {
      const cleanId = String(e?.id || '').trim();
      const cleanTrxId = String(e?.transaction_id || '').trim();
      if (!cleanId || isDemoFeeLedgerId(cleanId)) return;
      const isDeleted =
        deletedFeeSet.has(cleanId) || (cleanTrxId !== '' && deletedTrxSet.has(cleanTrxId));
      const isMissingTrx = !cleanTrxId || !activeTrxIds.has(cleanTrxId);
      if (isDeleted || isMissingTrx) {
        orphanRemoteIds.push(cleanId);
        if (cleanTrxId) orphanRemoteTrxIds.add(cleanTrxId);
      } else {
        remoteClean.push(e);
      }
    });

    if (orphanRemoteIds.length > 0) {
      if (orphanRemoteTrxIds.size > 0) {
        await deleteFeeLedgerByTransactionsInSupabase(Array.from(orphanRemoteTrxIds));
      }
      await deleteFeeLedgerByIdsInSupabase(orphanRemoteIds);
      confirmCloudDeletes('fee_ledger', orphanRemoteIds);
    }

    // 4. Reconcile local & remote ledger strictly against activeTransactions
    const mergedSeedPoolMap = new Map<string, StaffFeeLedgerEntry>();
    remoteClean.forEach((e) => mergedSeedPoolMap.set(e.id, e));
    feeLedgerRef.current.forEach((e) => {
      const cleanId = String(e?.id || '').trim();
      const cleanTrxId = String(e?.transaction_id || '').trim();
      if (!cleanId || isDemoFeeLedgerId(cleanId) || deletedFeeSet.has(cleanId)) return;
      if (!cleanTrxId || deletedTrxSet.has(cleanTrxId) || !activeTrxIds.has(cleanTrxId)) return;
      if (!mergedSeedPoolMap.has(cleanId)) mergedSeedPoolMap.set(cleanId, e);
    });

    const reconciled = reconcileFeeLedgerWithTransactions(
      Array.from(mergedSeedPoolMap.values()),
      authoritativeTransactions,
      feeConfig,
      effectiveStaffList,
      { pruneMissingTransactions: true }
    ).filter((e) => e?.id && !isDemoFeeLedgerId(e.id));

    const remoteCleanIds = new Set(remoteClean.map((e) => e.id));
    const pendingSyncFeeSet = getPendingSyncIdsSet('fee_ledger');
    const toUpload = reconciled.filter(
      (e) => pendingSyncFeeSet.has(e.id) || !remoteCleanIds.has(e.id)
    );
    if (toUpload.length > 0) {
      const pushRes = await upsertFeeLedgerEntriesToSupabase(toUpload);
      if (!pushRes.success) {
        setFeeLedgerNeedsTableSetup(Boolean(pushRes.needsTableSetup));
        return {
          success: false,
          needsTableSetup: pushRes.needsTableSetup,
          error: pushRes.error
        };
      }
      confirmCloudSync(
        'fee_ledger',
        toUpload.map((e) => e.id)
      );
    }

    setFeeLedger(reconciled);
    persistFeeLedgerNow(reconciled);
    setFeeLedgerNeedsTableSetup(false);
    markInitialCloudSyncCompleted('fee_ledger');
    return { success: true, count: reconciled.length };
  };

  // Handlers: Supplier (Tombstone-Safe)
  const handleAddSupplier = (s: Supplier) => {
    setSuppliers((prev) => {
      const next = [s, ...prev.filter((item) => item.id !== s.id)];
      persistSuppliersNow(next);
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('suppliers', [s.id]);
      syncSupplierToSupabase(s)
        .then((res) => {
          if (res.needsTableSetup) setSuppliersNeedsTableSetup(true);
          if (res.success) confirmCloudSync('suppliers', [s.id]);
        })
        .catch(() => {});
    }
    addAuditLog('Setup Supplier', `Registrasi supplier/PBF baru: ${s.name} (${s.phone})`);
  };

  const handleUpdateSupplier = (s: Supplier) => {
    setSuppliers((prev) => {
      const next = prev.map((item) => (item.id === s.id ? s : item));
      persistSuppliersNow(next);
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('suppliers', [s.id]);
      syncSupplierToSupabase(s)
        .then((res) => {
          if (res.needsTableSetup) setSuppliersNeedsTableSetup(true);
          if (res.success) confirmCloudSync('suppliers', [s.id]);
        })
        .catch(() => {});
    }
    addAuditLog('Setup Supplier', `Update data supplier/PBF: ${s.name} (${s.id})`);
  };

  const handleDeleteSupplier = (id: string) => {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;
    const found = suppliersRef.current.find((item) => item.id === cleanId);
    markIdsDeleted('suppliers', [cleanId]);
    setSuppliers((prev) => {
      const next = prev.filter((item) => item.id !== cleanId);
      persistSuppliersNow(next);
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      deleteSupplierFromSupabase(cleanId)
        .then((res) => {
          if (res.needsTableSetup) setSuppliersNeedsTableSetup(true);
          if (res.success) confirmCloudDeletes('suppliers', [cleanId]);
        })
        .catch(() => {});
    } else {
      confirmCloudDeletes('suppliers', [cleanId]);
    }
    addAuditLog('Setup Supplier', `Hapus supplier/PBF: ${found?.name || cleanId}`);
  };

  const handleSyncSuppliersSupabase = async (): Promise<{
    success: boolean;
    count: number;
    error?: string;
    needsTableSetup?: boolean;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        count: suppliersRef.current.length,
        error: 'Mode Demo Sandbox aktif: Sinkronisasi cloud Supabase dinonaktifkan untuk menjaga isolasi data produksi.'
      };
    }

    const pendingDeletes = getPendingDeleteIds('suppliers');
    if (pendingDeletes.length > 0) {
      for (const delId of pendingDeletes) {
        const dRes = await deleteSupplierFromSupabase(delId).catch(() => ({
          success: false,
          needsTableSetup: false,
          error: undefined
        }));
        if (dRes.needsTableSetup) {
          setSuppliersNeedsTableSetup(true);
          return {
            success: false,
            count: suppliersRef.current.length,
            needsTableSetup: true,
            error: dRes.error
          };
        }
        if (dRes.success) confirmCloudDeletes('suppliers', [delId]);
      }
    }

    const fetchRes = await fetchSuppliersFromSupabase({ forceRefresh: true });
    if (fetchRes.needsTableSetup) {
      setSuppliersNeedsTableSetup(true);
      return {
        success: false,
        count: suppliersRef.current.length,
        needsTableSetup: true,
        error: fetchRes.error || 'Tabel supplier belum tersedia di database Supabase.'
      };
    }

    if (fetchRes.error) {
      return {
        success: false,
        count: suppliersRef.current.length,
        error: fetchRes.error
      };
    }

    setSuppliersNeedsTableSetup(false);
    const deletedSet = getDeletedIdsSet('suppliers');
    const pendingSyncSet = getPendingSyncIdsSet('suppliers');
    const syncedOnceBefore = hasCompletedInitialCloudSync('suppliers');
    const remoteAll = fetchRes.data || [];

    const stubbornIds = remoteAll.filter((s) => s.id && deletedSet.has(s.id)).map((s) => s.id);
    if (stubbornIds.length > 0) {
      await Promise.all(
        stubbornIds.map((sid) =>
          deleteSupplierFromSupabase(sid)
            .then((dRes) => {
              if (dRes.success) confirmCloudDeletes('suppliers', [sid]);
            })
            .catch(() => {})
        )
      );
    }

    const remoteClean = remoteAll.filter(
      (s) => s.id && !isDemoSupplierId(s.id) && !deletedSet.has(s.id)
    );
    const remoteIds = new Set(remoteClean.map((s) => s.id));
    const localValid = suppliersRef.current.filter(
      (s) => s.id && !isDemoSupplierId(s.id) && !deletedSet.has(s.id)
    );
    const localToUpload = localValid.filter(
      (s) => pendingSyncSet.has(s.id) || (!syncedOnceBefore && !remoteIds.has(s.id))
    );

    if (localToUpload.length > 0) {
      const seedRes = await seedSuppliersToSupabase(localToUpload);
      if (seedRes.needsTableSetup) {
        setSuppliersNeedsTableSetup(true);
        return {
          success: false,
          count: suppliersRef.current.length,
          needsTableSetup: true,
          error: seedRes.error
        };
      }
      if (seedRes.success) {
        confirmCloudSync(
          'suppliers',
          localToUpload.map((s) => s.id)
        );
      }
    }

    const mergedMap = new Map<string, Supplier>();
    remoteClean.forEach((s) => mergedMap.set(s.id, s));
    localToUpload.forEach((s) => {
      if (!mergedMap.has(s.id) || pendingSyncSet.has(s.id)) mergedMap.set(s.id, s);
    });
    const merged = Array.from(mergedMap.values());
    setSuppliers(merged);
    persistSuppliersNow(merged);
    markInitialCloudSyncCompleted('suppliers');
    addAuditLog('Setup Supplier', `Sinkronisasi manual data Supplier/PBF dengan Supabase (${merged.length} supplier)`);
    return { success: true, count: merged.length };
  };

  // Handler: Stock Opname Live Reconciliation (Batch & ED + Multi-Batch FEFO Auto-Adjust)
  const handleApplyStockOpname = (
    adjustments: {
      medicineId: string;
      medicineName: string;
      finalStock: number;
      difference: number;
      reason: string;
      systemStock?: number;
      hpp?: number;
      hppBesar?: number;
      hppUpdated?: boolean;
      sellPrice?: number;
      unit?: string;
      batchNo?: string;
      expDate?: string;
      batches?: {
        id?: string;
        batchNo: string;
        expDate: string;
        systemStock?: number;
        physicalStock?: number;
        stock?: number;
        difference?: number;
      }[];
    }[],
    notes?: string,
    customPetugas?: string,
    opnameKind: StockOpnameKind = 'PENYESUAIAN_STOK'
  ) => {
    const opnameOfficer = customPetugas || userName;
    const isStokAwalKind = opnameKind === 'STOK_AWAL';
    const opnameKindLabel = isStokAwalKind ? 'Stok Awal' : 'Penyesuaian Stok';
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const todayCompact = today.replace(/-/g, '');
    const refPrefix = `SO-${todayCompact}-`;
    const usedRefSuffixes = new Set<number>();
    const collectRefSuffix = (rn?: string) => {
      if (rn && rn.startsWith(refPrefix)) {
        const n = parseInt(rn.slice(refPrefix.length), 10);
        if (Number.isFinite(n) && n > 0) usedRefSuffixes.add(n);
      }
    };
    opnameRecordsRef.current.forEach((r) => collectRefSuffix(r.refNo));
    stockMutations.forEach((m) => collectRefSuffix(m.refNo));
    getDeletedOpnameRefsSet().forEach((rn) => collectRefSuffix(rn));
    let nextRefSeq = opnameRecordsRef.current.length + 1;
    while (usedRefSuffixes.has(nextRefSeq)) nextRefSeq += 1;
    const refNo = `${refPrefix}${String(nextRefSeq).padStart(2, '0')}`;
    const newMutations: StockMutation[] = [];
    const opnameItems: StockOpnameItemRecord[] = [];
    const baseMedicines = medicinesRef.current.length > 0 ? medicinesRef.current : medicines;

    // Precompute updated HPP, HNA Besar & Harga Jual (+%Markup) for any item whose HPP changed in Stok Opname
    const pricingUpdatesByMedId = new Map<
      string,
      ReturnType<typeof computeTierPricesFromHppBesar> & { targetHppBesar: number }
    >();
    adjustments.forEach((adj) => {
      const med = baseMedicines.find((m) => m.id === adj.medicineId);
      if (!med) return;
      const ratio = Math.max(1, Number(med.rasioKonversi) || 1);
      const currentHppBesar = Math.round(
        (med.hnaBesar || ((med.hpp || 0) * ratio) / 1.11) * 1.11
      );
      const targetHppBesar =
        adj.hppBesar !== undefined
          ? Math.max(0, Math.round(adj.hppBesar))
          : adj.hpp !== undefined
          ? Math.max(0, Math.round(adj.hpp * ratio))
          : currentHppBesar;
      if (adj.hppUpdated || targetHppBesar !== currentHppBesar) {
        const computed = computeTierPricesFromHppBesar(med, targetHppBesar);
        pricingUpdatesByMedId.set(med.id, {
          ...computed,
          targetHppBesar
        });
      }
    });

    adjustments.forEach((adj, adjIdx) => {
      const med = baseMedicines.find((m) => m.id === adj.medicineId);
      const updatedPricing = pricingUpdatesByMedId.get(adj.medicineId);
      const hpp = updatedPricing ? updatedPricing.hpp : adj.hpp ?? med?.hpp ?? 0;
      const hppBesar = updatedPricing ? updatedPricing.targetHppBesar : adj.hppBesar;
      const sellPrice = updatedPricing ? updatedPricing.sellPrice : adj.sellPrice ?? med?.sellPrice ?? 0;
      const unit = adj.unit ?? med?.unit ?? 'Unit';
      const sysStock = adj.systemStock !== undefined ? adj.systemStock : adj.finalStock - adj.difference;
      const nominalDiffHpp = adj.difference * hpp;
      const nominalDiffSell = adj.difference * sellPrice;

      // Resolve batch & ED records for history and medicine master update
      let resolvedBatchResult: {
        batches: MedicineBatch[];
        stock: number;
        batchNo: string;
        expDate: string;
      } | null = null;

      let itemBatchRecords: StockOpnameBatchRecord[] | undefined;

      if (adj.batches && adj.batches.length > 0) {
        const rawBatches: MedicineBatch[] = adj.batches.map((b, idx) => ({
          id: b.id || `${adj.medicineId}-B${Date.now()}-${idx + 1}`,
          batchNo: (b.batchNo || '').trim() || '-',
          expDate: (b.expDate || '').trim(),
          stock: Math.max(0, Math.round(Number(b.physicalStock ?? b.stock ?? 0)))
        }));

        resolvedBatchResult = resolvePrimaryBatchAndStock(
          rawBatches,
          adj.batchNo || med?.batchNo || '-',
          adj.expDate || med?.expDate || '',
          true
        );

        itemBatchRecords = adj.batches.map((b) => {
          const pStock = Math.max(0, Math.round(Number(b.physicalStock ?? b.stock ?? 0)));
          const sStock = Math.max(0, Math.round(Number(b.systemStock ?? 0)));
          return {
            batchNo: (b.batchNo || '').trim() || '-',
            expDate: (b.expDate || '').trim(),
            systemStock: sStock,
            physicalStock: pStock,
            difference: b.difference !== undefined ? b.difference : pStock - sStock
          };
        });
      } else if (adj.batchNo !== undefined || adj.expDate !== undefined) {
        const singleBatch: MedicineBatch[] = [
          {
            id: `${adj.medicineId}-B1`,
            batchNo: (adj.batchNo || med?.batchNo || '-').trim() || '-',
            expDate: (adj.expDate || med?.expDate || '').trim(),
            stock: Math.max(0, Math.round(adj.finalStock))
          }
        ];
        resolvedBatchResult = resolvePrimaryBatchAndStock(
          singleBatch,
          adj.batchNo || med?.batchNo || '-',
          adj.expDate || med?.expDate || '',
          true
        );
      }

      const finalStockValue = resolvedBatchResult ? resolvedBatchResult.stock : adj.finalStock;
      const finalBatchNo = resolvedBatchResult?.batchNo ?? adj.batchNo ?? med?.batchNo ?? '-';
      const finalExpDate = resolvedBatchResult?.expDate ?? adj.expDate ?? med?.expDate ?? '';
      const batchSummaryNote =
        itemBatchRecords && itemBatchRecords.length > 1
          ? `Multi-Batch (${itemBatchRecords.map((b) => `${b.batchNo} ED:${b.expDate || '-'} [${b.physicalStock}]`).join(', ')})`
          : `Batch: ${finalBatchNo} ED: ${finalExpDate || '-'}`;

      opnameItems.push({
        medicineId: adj.medicineId,
        medicineName: adj.medicineName || med?.name || 'Obat',
        unit,
        hpp,
        hppBesar,
        sellPrice,
        systemStock: sysStock,
        physicalStock: finalStockValue,
        difference: adj.difference,
        nominalDiffHpp,
        nominalDiffSell,
        reason: adj.reason,
        batchNo: finalBatchNo,
        expDate: finalExpDate,
        batches: itemBatchRecords
      });

      const batchChanged =
        med &&
        (finalBatchNo !== (med.batchNo || '') ||
          finalExpDate !== (med.expDate || '') ||
          (resolvedBatchResult && resolvedBatchResult.batches.length !== (med.batches?.length || 1)));

      const opnameBatchDetails =
        itemBatchRecords && itemBatchRecords.length > 0
          ? (() => {
              const changed = itemBatchRecords.filter((b) => Number(b.difference) !== 0);
              const target = changed.length > 0 ? changed : itemBatchRecords;
              return target.map((b) => ({
                batchNo: (b.batchNo || '-').trim() || '-',
                expDate: (b.expDate || '').trim(),
                qty: isStokAwalKind
                  ? Number(b.physicalStock) || 0
                  : Math.abs(Number(b.difference) || 0) || Number(b.physicalStock) || 0
              }));
            })()
          : [
              {
                batchNo: (finalBatchNo || '-').trim() || '-',
                expDate: (finalExpDate || '').trim(),
                qty: isStokAwalKind ? finalStockValue : Math.abs(adj.difference)
              }
            ];

      if (isStokAwalKind) {
        if (finalStockValue > 0 || adj.difference !== 0 || batchChanged) {
          const inQty =
            sysStock === 0 || adj.difference === 0
              ? Math.max(0, finalStockValue)
              : adj.difference > 0
              ? adj.difference
              : 0;
          const outQty = adj.difference < 0 ? Math.abs(adj.difference) : 0;
          newMutations.push({
            id: `MUT-OPN-${Date.now()}-${adjIdx}-${Math.floor(Math.random() * 1000)}`,
            date: today,
            time: `${time} WIB`,
            medicineId: adj.medicineId,
            medicineName: adj.medicineName || med?.name || 'Obat',
            refNo,
            type: 'STOK_AWAL',
            inQty,
            outQty,
            balance: finalStockValue,
            ket: `Stok Awal (Stok Opname) · ${adj.reason} · ${batchSummaryNote}`,
            petugas: opnameOfficer,
            branchId: currentBranch.id,
            hpp,
            nominalDiff: nominalDiffHpp,
            batchNo: finalBatchNo || '-',
            expDate: finalExpDate || '',
            batchDetails: opnameBatchDetails
          });
        }
      } else if (adj.difference !== 0 || batchChanged) {
        newMutations.push({
          id: `MUT-OPN-${Date.now()}-${adjIdx}-${Math.floor(Math.random() * 1000)}`,
          date: today,
          time: `${time} WIB`,
          medicineId: adj.medicineId,
          medicineName: adj.medicineName || med?.name || 'Obat',
          refNo,
          type: 'STOK_OPNAME',
          inQty: adj.difference > 0 ? adj.difference : 0,
          outQty: adj.difference < 0 ? Math.abs(adj.difference) : 0,
          balance: finalStockValue,
          ket: `Penyesuaian Stok (Stok Opname) · ${adj.reason} · ${batchSummaryNote} (Nominal Selisih HPP: ${nominalDiffHpp >= 0 ? '+' : '-'}Rp ${Math.abs(nominalDiffHpp).toLocaleString('id-ID')})`,
          petugas: opnameOfficer,
          branchId: currentBranch.id,
          hpp,
          nominalDiff: nominalDiffHpp,
          batchNo: finalBatchNo || '-',
          expDate: finalExpDate || '',
          batchDetails: opnameBatchDetails
        });
      }
    });

    const updatedMedsToSync: Medicine[] = [];
    const nextMedicines = baseMedicines.map((med) => {
      const found = adjustments.find((a) => a.medicineId === med.id);
      if (!found) return med;

      let nextStock = found.finalStock;
      let nextBatchNo = found.batchNo !== undefined ? found.batchNo : med.batchNo;
      let nextExpDate = found.expDate !== undefined ? found.expDate : med.expDate;
      let nextBatches = med.batches;

      if (found.batches && found.batches.length > 0) {
        const rawBatches: MedicineBatch[] = found.batches.map((b, idx) => ({
          id: b.id || `${med.id}-B${Date.now()}-${idx + 1}`,
          batchNo: (b.batchNo || '').trim() || '-',
          expDate: (b.expDate || '').trim(),
          stock: Math.max(0, Math.round(Number(b.physicalStock ?? b.stock ?? 0)))
        }));
        const resolved = resolvePrimaryBatchAndStock(
          rawBatches,
          found.batchNo || med.batchNo,
          found.expDate || med.expDate,
          true
        );
        nextStock = resolved.stock;
        nextBatchNo = resolved.batchNo;
        nextExpDate = resolved.expDate;
        nextBatches = resolved.batches;
      } else {
        const resolved = resolvePrimaryBatchAndStock(
          [
            {
              id: med.batches?.[0]?.id || `${med.id}-B1`,
              batchNo: nextBatchNo || '-',
              expDate: nextExpDate || '',
              stock: Math.max(0, Math.round(found.finalStock))
            }
          ],
          nextBatchNo,
          nextExpDate,
          true
        );
        nextStock = resolved.stock;
        nextBatchNo = resolved.batchNo;
        nextExpDate = resolved.expDate;
        nextBatches = resolved.batches;
      }

      const updatedPricing = pricingUpdatesByMedId.get(med.id);
      const updatedMed: Medicine = {
        ...med,
        stock: nextStock,
        batchNo: nextBatchNo,
        expDate: nextExpDate,
        batches: nextBatches,
        ...(updatedPricing
          ? {
              hnaBesar: updatedPricing.hnaBesar,
              hpp: updatedPricing.hpp,
              sellPrice: updatedPricing.sellPrice,
              sellPriceKlinik: updatedPricing.sellPriceKlinik,
              sellPriceMitra: updatedPricing.sellPriceMitra,
              markupReguler: updatedPricing.markupReguler,
              markupKlinik: updatedPricing.markupKlinik,
              markupMitra: updatedPricing.markupMitra
            }
          : {})
      };
      updatedMedsToSync.push(updatedMed);
      return updatedMed;
    });

    medicinesRef.current = nextMedicines;
    setMedicines(nextMedicines);
    demoSetItem('latisha_medicines', JSON.stringify(nextMedicines));

    // Sync reconciled medicines (stock + Batch/ED + multi-batch) to Supabase in background
    updatedMedsToSync.forEach((m) => {
      syncMedicineWithTracking(m).catch((err) => console.warn('Supabase opname medicine sync error:', err));
    });

    if (newMutations.length > 0) {
      setStockMutations((prev) => [...newMutations, ...prev]);
      if (!isDemoActive && !isDemoMode()) {
        seedStockMutationsToSupabase(newMutations)
          .then((res) => {
            if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
          })
          .catch((err) => console.warn('Supabase opname stock mutation sync error:', err));
      }
    }

    const matchCount = opnameItems.filter((i) => i.difference === 0).length;
    const surplusItems = opnameItems.filter((i) => i.difference > 0);
    const deficitItems = opnameItems.filter((i) => i.difference < 0);
    const totalSurplusNominal = surplusItems.reduce((acc, i) => acc + i.nominalDiffHpp, 0);
    const totalDeficitNominal = deficitItems.reduce((acc, i) => acc + Math.abs(i.nominalDiffHpp), 0);
    const netNominalDiff = totalSurplusNominal - totalDeficitNominal;

    const baseNotes = notes || `Rekonsiliasi Stok Opname Live (${opnameKindLabel} · Batch & ED FEFO)`;
    const formattedNotes = baseNotes.includes('[Jenis:')
      ? baseNotes
      : `[Jenis: ${opnameKindLabel}] ${baseNotes}`;

    const newOpnameRecord: StockOpnameRecord = {
      id: `OPN-${Date.now().toString().slice(-6)}`,
      refNo,
      date: today,
      time: `${time} WIB`,
      petugas: opnameOfficer,
      branchId: currentBranch.id,
      branchName: currentBranch.name,
      opnameKind,
      totalItemsCounted: opnameItems.length,
      matchCount,
      surplusCount: surplusItems.length,
      deficitCount: deficitItems.length,
      totalSurplusNominal,
      totalDeficitNominal,
      netNominalDiff,
      notes: formattedNotes,
      items: opnameItems
    };

    setOpnameRecords((prev) => {
      const next = [newOpnameRecord, ...prev.filter((r) => r.id !== newOpnameRecord.id)];
      persistOpnameNow(next);
      return next;
    });

    if (!isDemoActive && !isDemoMode()) {
      markIdsPendingSync('opname_records', [newOpnameRecord.id]);
      syncOpnameRecordToSupabase(newOpnameRecord)
        .then((res) => {
          if (res.needsTableSetup) setOpnameRecordsNeedsTableSetup(true);
          if (res.success) confirmCloudSync('opname_records', [newOpnameRecord.id]);
        })
        .catch((err) => console.warn('Supabase opname record sync error:', err));
    }

    addAuditLog(
      'Stok Opname',
      `Stok Opname #${refNo} [${opnameKindLabel}] disimpan (${adjustments.length} item, Stok Master Obat & Kartu Stok Digital diperbarui, Selisih Bersih: ${netNominalDiff >= 0 ? '+' : '-'}Rp ${Math.abs(netNominalDiff).toLocaleString('id-ID')}) oleh ${opnameOfficer}`
    );
  };

  const handleDeleteOpnameRecord = async (
    id: string,
    refNoHint?: string
  ): Promise<{
    success?: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    const cleanId = String(id || '').trim();
    if (!cleanId) return { success: true };

    const targetRec = opnameRecordsRef.current.find((r) => String(r.id).trim() === cleanId);
    const derivedLegacyRef = cleanId.startsWith('OPN-HIST-')
      ? cleanId.replace(/^OPN-HIST-[^_]*__/, '')
      : '';
    const cleanRefNo = String(targetRec?.refNo || refNoHint || derivedLegacyRef || '').trim();

    // Record persistent tombstone for ID and refNo BEFORE updating state/cloud
    markIdsDeleted('opname_records', [cleanId]);
    if (cleanRefNo) {
      markOpnameRefsDeleted([cleanRefNo]);
    }

    setOpnameRecords((prev) => {
      const next = prev.filter((r) => String(r.id).trim() !== cleanId);
      persistOpnameNow(next);
      return next;
    });

    addAuditLog(
      'Stok Opname',
      `Hapus riwayat stok opname ${cleanRefNo ? `#${cleanRefNo}` : `#${cleanId}`}`
    );

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('opname_records', [cleanId]);
      return { success: true, isDemo: true };
    }
    if (isDemoOpnameRecordId(cleanId) || cleanId.startsWith('OPN-HIST-')) {
      confirmCloudDeletes('opname_records', [cleanId]);
      return { success: true };
    }

    const res = await deleteOpnameRecordFromSupabase(cleanId).catch(
      (err): { success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string } => ({
        success: false,
        error: err?.message || String(err)
      })
    );
    if (res.needsTableSetup) {
      setOpnameRecordsNeedsTableSetup(true);
    }
    if (res.success) {
      confirmCloudDeletes('opname_records', [cleanId]);
    } else {
      console.warn('Supabase Opname delete pending replay:', res.error);
    }
    return res;
  };

  // Handler: Export Backup JSON
  const handleExportBackup = () => {
    const backupData = {
      version: 'Latisha Farma Enterprise V8.0',
      timestamp: new Date().toISOString(),
      branches,
      medicines,
      patients,
      queue,
      onlineRegistrations,
      rmeRecords,
      prescriptions,
      transactions,
      purchaseInvoices,
      stockMutations,
      transfers,
      staffList,
      schedules,
      auditLogs,
      mitraList,
      suppliers
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `Latisha_Farma_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    addAuditLog('Cloud Backup', 'Ekspor pencadangan data JSON berhasil diunduh.');
  };

  const handleAddSchedule = (sch: DutySchedule) => {
    setSchedules((prev) => {
      const next = [sch, ...prev];
      try {
        demoSetItem('latisha_schedules', JSON.stringify(next));
      } catch {}
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      enqueueScheduleUpsert(sch.id);
      syncScheduleToSupabase(sch)
        .then((res) => {
          if (res.success) {
            dequeueScheduleUpsert(sch.id);
          } else if (res.needsTableSetup) {
            setSchedulesNeedsTableSetup(true);
          }
        })
        .catch(() => {});
    }
    addAuditLog('Jadwal Petugas', `Menambah jadwal ${sch.staffName} (${sch.day} ${sch.startTime}-${sch.endTime} WIB)`);
  };

  const handleUpdateSchedule = (sch: DutySchedule) => {
    setSchedules((prev) => {
      const next = prev.map((item) => (item.id === sch.id ? sch : item));
      try {
        demoSetItem('latisha_schedules', JSON.stringify(next));
      } catch {}
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      enqueueScheduleUpsert(sch.id);
      syncScheduleToSupabase(sch)
        .then((res) => {
          if (res.success) {
            dequeueScheduleUpsert(sch.id);
          } else if (res.needsTableSetup) {
            setSchedulesNeedsTableSetup(true);
          }
        })
        .catch(() => {});
    }
    addAuditLog('Jadwal Petugas', `Update jadwal ${sch.staffName} (${sch.day} ${sch.startTime}-${sch.endTime} WIB)`);
  };

  const handleDeleteSchedule = (id: string) => {
    const found = schedulesRef.current.find((s) => s.id === id);
    setSchedules((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try {
        demoSetItem('latisha_schedules', JSON.stringify(next));
      } catch {}
      return next;
    });
    if (!isDemoActive && !isDemoMode()) {
      enqueueScheduleDelete(id);
      deleteScheduleFromSupabase(id)
        .then((res) => {
          if (res.success) {
            dequeueScheduleDelete(id);
          } else if (res.needsTableSetup) {
            setSchedulesNeedsTableSetup(true);
          }
        })
        .catch(() => {});
    }
    addAuditLog('Jadwal Petugas', `Menghapus jadwal ${found?.staffName || id}`);
  };

  const handleResetSchedules = () => {
    const defaultSchedules = INITIAL_DUTY_SCHEDULES;
    const defaultIds = new Set(defaultSchedules.map((s) => s.id));
    const existingToDelete = schedulesRef.current
      .map((s) => s.id)
      .filter((id) => id && !defaultIds.has(id));

    clearPendingScheduleOps();
    setSchedules(defaultSchedules);
    try {
      demoSetItem('latisha_schedules', JSON.stringify(defaultSchedules));
    } catch {}
    if (!isDemoActive && !isDemoMode()) {
      (async () => {
        for (const delId of existingToDelete) {
          await deleteScheduleFromSupabase(delId).catch(() => {});
        }
        await seedSchedulesToSupabase(defaultSchedules).catch(() => {});
      })();
    }
    addAuditLog('Jadwal Petugas', `Reset jadwal dokter & petugas apotek ke format default resmi klinik`);
  };

  const handleSyncSchedulesSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase dinonaktifkan.'
      };
    }

    try {
      const currentLocal = schedulesRef.current;
      const pendingOps = readPendingScheduleOps();
      const localById = new Map<string, DutySchedule>(currentLocal.map((s) => [s.id, s]));

      // 1. Flush pending deletes first so deleted schedules are permanently removed from Supabase
      const remainingDeletes: string[] = [];
      let hitTableSetup = false;
      let flushError: string | undefined;

      for (const delId of pendingOps.deletes) {
        const delRes = await deleteScheduleFromSupabase(delId);
        if (delRes.needsTableSetup) {
          hitTableSetup = true;
          remainingDeletes.push(delId);
        } else if (!delRes.success) {
          remainingDeletes.push(delId);
          flushError = flushError || delRes.error;
        }
      }

      // 2. Flush pending upserts (adds/updates made offline or pending)
      const pendingUpsertItems = pendingOps.upserts
        .map((id) => localById.get(id))
        .filter((s): s is DutySchedule => Boolean(s));
      let remainingUpserts = [...pendingOps.upserts];

      if (pendingUpsertItems.length > 0 && !hitTableSetup) {
        const upRes = await seedSchedulesToSupabase(pendingUpsertItems);
        if (upRes.needsTableSetup) {
          hitTableSetup = true;
        } else if (upRes.success) {
          const flushedIds = new Set(pendingUpsertItems.map((s) => s.id));
          remainingUpserts = remainingUpserts.filter((id) => !flushedIds.has(id));
        } else {
          flushError = flushError || upRes.error;
        }
      }

      writePendingScheduleOps({ upserts: remainingUpserts, deletes: remainingDeletes });

      if (hitTableSetup) {
        setSchedulesNeedsTableSetup(true);
        return {
          success: false,
          needsTableSetup: true,
          error: `Tabel "${getSupabaseConfig().scheduleTable || 'schedules'}" belum dibuat di Supabase.`
        };
      }

      // 3. Pull authoritative cloud snapshot from Supabase (NEVER auto-reseed INITIAL_DUTY_SCHEDULES)
      const res = await fetchSchedulesFromSupabase({ forceRefresh: true, seedIfEmpty: false });
      setSchedulesNeedsTableSetup(Boolean(res.needsTableSetup));

      if (res.needsTableSetup) {
        return {
          success: false,
          needsTableSetup: true,
          error: res.error
        };
      }
      if (res.error || res.data === null) {
        return {
          success: false,
          error: res.error || flushError || 'Gagal mengambil data Jadwal dari Supabase.'
        };
      }

      const remoteList = res.data;
      const stillPendingDeleteSet = new Set(remainingDeletes);
      const stillPendingUpsertSet = new Set(remainingUpserts);

      // Reconcile authoritative cloud snapshot with any still-unsynced local mutations only
      const mergedMap = new Map<string, DutySchedule>();
      for (const s of remoteList) {
        if (!stillPendingDeleteSet.has(s.id)) {
          mergedMap.set(s.id, s);
        }
      }
      for (const upId of stillPendingUpsertSet) {
        const localItem = localById.get(upId);
        if (localItem && !stillPendingDeleteSet.has(upId)) {
          mergedMap.set(upId, localItem);
        }
      }

      const authoritativeList = Array.from(mergedMap.values());
      setSchedules(authoritativeList);
      try {
        demoSetItem('latisha_schedules', JSON.stringify(authoritativeList));
        demoSetItem(SCHEDULES_CLOUD_SYNCED_KEY, 'true');
      } catch {}

      return { success: true, count: authoritativeList.length };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Gagal menyinkronkan jadwal dengan Supabase.'
      };
    }
  };

  // ================================================================
  // LAPORAN MEDIS & MORBIDITAS — TWO-WAY SUPABASE HANDLERS
  // ================================================================
  const handleSaveMorbidityReport = async (
    report: MedicalMorbidityReportRecord
  ): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    setMorbidityReports((prev) => {
      const exists = prev.some((r) => r.id === report.id);
      const next = exists
        ? prev.map((r) => (r.id === report.id ? report : r))
        : [report, ...prev];
      persistMorbidityReportsNow(next);
      return next;
    });
    addAuditLog(
      'Laporan Morbiditas',
      `Menyimpan arsip ${report.title} (${report.startDate} s.d. ${report.endDate})`
    );

    if (isDemoActive || isDemoMode()) {
      return {
        success: true,
        isDemo: true
      };
    }

    markIdsPendingSync('morbidity_reports', [report.id]);
    const res = await syncMorbidityReportToSupabase(report);
    if (res.needsTableSetup) {
      setMorbidityNeedsTableSetup(true);
    }
    if (res.success) {
      confirmCloudSync('morbidity_reports', [report.id]);
    }
    return res;
  };

  const handleDeleteMorbidityReport = async (
    id: string
  ): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    const cleanId = String(id || '').trim();
    if (!cleanId) return { success: true };
    const found = morbidityReportsRef.current.find((r) => r.id === cleanId);
    markIdsDeleted('morbidity_reports', [cleanId]);
    setMorbidityReports((prev) => {
      const next = prev.filter((r) => r.id !== cleanId);
      persistMorbidityReportsNow(next);
      return next;
    });
    addAuditLog(
      'Laporan Morbiditas',
      `Menghapus arsip laporan morbiditas ${found?.title || cleanId}`
    );

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('morbidity_reports', [cleanId]);
      return { success: true, isDemo: true };
    }

    const res = await deleteMorbidityReportFromSupabase(cleanId);
    if (res.needsTableSetup) {
      setMorbidityNeedsTableSetup(true);
    }
    if (res.success) {
      confirmCloudDeletes('morbidity_reports', [cleanId]);
    }
    return res;
  };

  // ================================================================
  // ARSIP e-RME (medical_records) — TWO-WAY TOMBSTONE-SAFE SUPABASE SYNC
  // ================================================================
  const handleSyncRmeSupabase = async (options?: {
    silentAudit?: boolean;
  }): Promise<{
    success: boolean;
    count?: number;
    uploadedCount?: number;
    deletedFlushedCount?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        count: rmeRecordsRef.current.length,
        error: 'Mode Demo aktif: Sinkronisasi cloud Supabase dinonaktifkan untuk melindungi database produksi.'
      };
    }

    // 1. Replay any pending cloud deletes FIRST so deleted RME records never reappear
    const pendingDeleteIds = getPendingDeleteIds('rme_records');
    if (pendingDeleteIds.length > 0) {
      const delRes = await deleteRmesFromSupabase(pendingDeleteIds);
      if (delRes.needsTableSetup) {
        setRmeNeedsTableSetup(true);
        return {
          success: false,
          needsTableSetup: true,
          error: delRes.error || 'Tabel medical_records belum disiapkan atau terkendala RLS di Supabase.'
        };
      }
      if (delRes.success) {
        confirmCloudDeletes('rme_records', pendingDeleteIds);
      }
    }

    // 2. Pull authoritative rows from Supabase
    const res = await fetchRmeFromSupabase({ forceRefresh: true });
    setRmeNeedsTableSetup(Boolean(res.needsTableSetup));

    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error || 'Tabel medical_records belum disiapkan atau terkendala RLS di Supabase.'
      };
    }
    if (res.error) {
      return {
        success: false,
        error: res.error
      };
    }

    const deletedSet = getDeletedIdsSet('rme_records');
    const pendingSyncSet = getPendingSyncIdsSet('rme_records');
    const remoteAll = res.data || [];

    // 3. Clean up any remote rows that were locally deleted
    const stubbornDeletedIds = remoteAll
      .filter((r) => r.id && deletedSet.has(String(r.id).trim()))
      .map((r) => String(r.id).trim());
    if (stubbornDeletedIds.length > 0) {
      const cleanupRes = await deleteRmesFromSupabase(stubbornDeletedIds);
      if (cleanupRes.success) {
        confirmCloudDeletes('rme_records', stubbornDeletedIds);
      }
    }

    const remoteClean = remoteAll.filter(
      (r) => r.id && !isDemoRmeId(r.id) && !deletedSet.has(String(r.id).trim())
    );
    const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
    const syncedOnceBefore = hasCompletedInitialCloudSync('rme_records');

    // 4. Only upload local records that are genuinely pending sync (or pre-initial-sync migration), never deleted rows
    const localValid = rmeRecordsRef.current.filter(
      (r) => r.id && !isDemoRmeId(r.id) && !deletedSet.has(String(r.id).trim())
    );
    const localToUpload = localValid.filter((r) => {
      const cleanId = String(r.id).trim();
      if (pendingSyncSet.has(cleanId)) return true;
      if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
      return false;
    });

    let seedError: string | undefined;
    if (localToUpload.length > 0) {
      const seedRes = await seedRmeToSupabase(localToUpload);
      if (seedRes.needsTableSetup) {
        setRmeNeedsTableSetup(true);
        return {
          success: false,
          needsTableSetup: true,
          error: seedRes.error || 'Tabel medical_records belum disiapkan di Supabase.'
        };
      }
      if (seedRes.success) {
        confirmCloudSync(
          'rme_records',
          localToUpload.map((r) => String(r.id).trim())
        );
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }

    // 5. Authoritative merge: Supabase remote rows + pending local uploads (never deleted rows)
    const map = new Map<string, RMERecord>();
    remoteClean.forEach((r) => map.set(String(r.id).trim(), r));
    localToUpload.forEach((r) => {
      const cleanId = String(r.id).trim();
      if (!map.has(cleanId) || pendingSyncSet.has(cleanId)) {
        map.set(cleanId, r);
      }
    });

    const merged = Array.from(map.values());
    setRmeRecords(merged);
    persistRmeNow(merged);
    markInitialCloudSyncCompleted('rme_records');

    if (!options?.silentAudit) {
      addAuditLog(
        'Arsip e-RME',
        `Sinkronisasi 2-arah Riwayat Rekam Medis dengan Supabase (${merged.length} data).`
      );
    }

    if (seedError) {
      return { success: false, count: merged.length, error: seedError };
    }
    return {
      success: true,
      count: merged.length,
      uploadedCount: localToUpload.length,
      deletedFlushedCount: pendingDeleteIds.length + stubbornDeletedIds.length
    };
  };

  const handleSyncMorbiditySupabase = async (): Promise<{
    success: boolean;
    rmeCount?: number;
    reportCount?: number;
    needsTableSetup?: boolean;
    needsRmeTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan.'
      };
    }

    const pendingDeleteMorbidIds = getPendingDeleteIds('morbidity_reports');
    if (pendingDeleteMorbidIds.length > 0) {
      for (const delId of pendingDeleteMorbidIds) {
        const dRes = await deleteMorbidityReportFromSupabase(delId).catch(() => ({ success: false }));
        if (dRes.success) confirmCloudDeletes('morbidity_reports', [delId]);
      }
    }

    const [rmeSyncRes, repRes] = await Promise.all([
      handleSyncRmeSupabase({ silentAudit: true }),
      fetchMorbidityReportsFromSupabase({ forceRefresh: true })
    ]);

    setRmeNeedsTableSetup(Boolean(rmeSyncRes.needsTableSetup));
    setMorbidityNeedsTableSetup(Boolean(repRes.needsTableSetup));

    const mergedRmeCount = rmeSyncRes.count ?? rmeRecordsRef.current.length;
    const rmeSeedError = !rmeSyncRes.success && !rmeSyncRes.needsTableSetup ? rmeSyncRes.error : undefined;

    let mergedRepCount = morbidityReportsRef.current.length;
    let repSeedError: string | undefined;

    if (!repRes.needsTableSetup && !repRes.error) {
      const deletedSet = getDeletedIdsSet('morbidity_reports');
      const pendingSyncSet = getPendingSyncIdsSet('morbidity_reports');
      const syncedOnceBefore = hasCompletedInitialCloudSync('morbidity_reports');
      const remoteAll = repRes.data || [];

      const stubbornIds = remoteAll.filter((r) => r.id && deletedSet.has(r.id)).map((r) => r.id);
      if (stubbornIds.length > 0) {
        await Promise.all(
          stubbornIds.map((sid) =>
            deleteMorbidityReportFromSupabase(sid)
              .then((dRes) => {
                if (dRes.success) confirmCloudDeletes('morbidity_reports', [sid]);
              })
              .catch(() => {})
          )
        );
      }

      const remoteRep = remoteAll.filter((r) => r.id && !deletedSet.has(r.id));
      const remoteRepIds = new Set(remoteRep.map((r) => r.id));
      const localValid = morbidityReportsRef.current.filter((r) => r.id && !deletedSet.has(r.id));
      const localToUpload = localValid.filter(
        (r) => pendingSyncSet.has(r.id) || (!syncedOnceBefore && !remoteRepIds.has(r.id))
      );

      if (localToUpload.length > 0) {
        const seedRepRes = await seedMorbidityReportsToSupabase(localToUpload);
        if (seedRepRes.success) {
          confirmCloudSync(
            'morbidity_reports',
            localToUpload.map((r) => r.id)
          );
        } else if (seedRepRes.error) {
          repSeedError = seedRepRes.error;
        }
      }

      const repMap = new Map<string, MedicalMorbidityReportRecord>();
      remoteRep.forEach((r) => repMap.set(r.id, r));
      localToUpload.forEach((r) => {
        if (!repMap.has(r.id) || pendingSyncSet.has(r.id)) repMap.set(r.id, r);
      });
      const mergedRep = Array.from(repMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setMorbidityReports(mergedRep);
      persistMorbidityReportsNow(mergedRep);
      markInitialCloudSyncCompleted('morbidity_reports');
      mergedRepCount = mergedRep.length;
    }

    if (repRes.needsTableSetup || rmeSyncRes.needsTableSetup) {
      return {
        success: false,
        rmeCount: mergedRmeCount,
        reportCount: mergedRepCount,
        needsTableSetup: Boolean(repRes.needsTableSetup),
        needsRmeTableSetup: Boolean(rmeSyncRes.needsTableSetup),
        error: repRes.error || rmeSyncRes.error
      };
    }

    const anyErr = repRes.error || repSeedError || rmeSeedError;
    if (anyErr) {
      return {
        success: false,
        rmeCount: mergedRmeCount,
        reportCount: mergedRepCount,
        error: anyErr
      };
    }

    return {
      success: true,
      rmeCount: mergedRmeCount,
      reportCount: mergedRepCount
    };
  };

  // ================================================================
  // RIWAYAT & FAKTUR PENJUALAN — TWO-WAY SUPABASE SYNC HANDLER
  // ================================================================
  const handleSyncTransactionsSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan.'
      };
    }

    // 1. Replay pending local deletions to Supabase FIRST before pulling
    const pendingDeleteIds = getPendingDeleteIds('transactions');
    if (pendingDeleteIds.length > 0) {
      const delRes = await deleteTransactionsFromSupabase(pendingDeleteIds);
      if (delRes.needsTableSetup) {
        setTransactionsNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: delRes.error };
      }
      if (delRes.success) {
        confirmCloudDeletes('transactions', pendingDeleteIds);
      }
    }

    const res = await fetchTransactionsFromSupabase({ forceRefresh: true });
    setTransactionsNeedsTableSetup(Boolean(res.needsTableSetup));

    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error
      };
    }

    if (res.error && (!res.data || res.data.length === 0)) {
      return {
        success: false,
        error: res.error
      };
    }

    const demoTrxIds = ['TRX-1001', 'TRX-1002', 'FPJ-202610-1003', 'TRX-1004'];
    const deletedSet = getDeletedIdsSet('transactions');
    const pendingSyncSet = getPendingSyncIdsSet('transactions');
    const remoteAll = res.data || [];

    const stubbornDeletedIds = remoteAll.filter((t) => deletedSet.has(t.id)).map((t) => t.id);
    if (stubbornDeletedIds.length > 0) {
      const cleanupRes = await deleteTransactionsFromSupabase(stubbornDeletedIds);
      if (cleanupRes.success) {
        confirmCloudDeletes('transactions', stubbornDeletedIds);
      }
    }

    const remoteClean = remoteAll.filter(
      (t) => t.id && !demoTrxIds.includes(t.id) && !deletedSet.has(t.id)
    );
    const localPendingUploads = transactionsRef.current.filter(
      (t) => t.id && !demoTrxIds.includes(t.id) && !deletedSet.has(t.id) && pendingSyncSet.has(t.id)
    );

    let seedError: string | undefined;
    if (localPendingUploads.length > 0) {
      const seedRes = await seedTransactionsToSupabase(localPendingUploads);
      if (seedRes.success) {
        confirmCloudSync('transactions', localPendingUploads.map((t) => t.id));
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }

    const mergedMap = new Map<string, Transaction>();
    remoteClean.forEach((t) => mergedMap.set(t.id, t));
    localPendingUploads.forEach((t) => mergedMap.set(t.id, t));
    const merged = Array.from(mergedMap.values());
    setTransactions(merged);
    persistTransactionsNow(merged);
    markInitialCloudSyncCompleted('transactions');
    transactionsAuthoritativeRef.current = true;
    pruneFeeLedgerWithTransactions(merged, true);

    if (seedError) {
      return { success: false, count: merged.length, error: seedError };
    }
    return { success: true, count: merged.length };
  };

  // ================================================================
  // KARTU STOK DIGITAL — TWO-WAY SUPABASE SYNC & ADJUSTMENT HANDLERS
  // ================================================================
  const handleAddManualStockMutation = async (params: {
    medicineId: string;
    adjustType: 'MASUK' | 'KELUAR';
    qty: number;
    ket: string;
    refNo?: string;
    batchNo?: string;
    expDate?: string;
  }): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    const med = medicines.find((m) => m.id === params.medicineId);
    if (!med) return { success: false, error: 'Obat tidak ditemukan.' };
    const cleanQty = Math.max(1, Math.round(Number(params.qty) || 0));

    let nextMedSnapshot: Medicine | null = null;
    let nextBalance = med.stock;
    let mutBatchNo = (params.batchNo || med.batchNo || '-').trim() || '-';
    let mutExpDate = (params.expDate || med.expDate || '').trim();
    let mutBatchDetails: { batchNo: string; expDate: string; qty: number }[] = [
      { batchNo: mutBatchNo, expDate: mutExpDate, qty: cleanQty }
    ];

    if (params.adjustType === 'MASUK') {
      const updated = addBatchStock(
        med,
        params.batchNo || med.batchNo,
        params.expDate || med.expDate,
        cleanQty
      );
      nextBalance = updated.stock;
      nextMedSnapshot = {
        ...med,
        stock: updated.stock,
        batchNo: updated.batchNo,
        expDate: updated.expDate,
        batches: updated.batches
      };
    } else {
      const allocated = allocateBatchesFEFO(med, cleanQty);
      nextBalance = allocated.stock;
      mutBatchNo = allocated.batchNo || med.batchNo || '-';
      mutExpDate = allocated.expDate || med.expDate || '';
      mutBatchDetails =
        allocated.allocations.length > 0
          ? allocated.allocations
          : [{ batchNo: mutBatchNo, expDate: mutExpDate, qty: cleanQty }];
      nextMedSnapshot = {
        ...med,
        stock: allocated.stock,
        batchNo: allocated.batchNo,
        expDate: allocated.expDate,
        batches: allocated.batches
      };
    }

    setMedicines((prev) =>
      prev.map((m) => (m.id === med.id && nextMedSnapshot ? nextMedSnapshot : m))
    );

    const now = new Date();
    const newMutation: StockMutation = {
      id: `MUT-ADJ-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      medicineId: med.id,
      medicineName: med.name,
      refNo: (params.refNo || '').trim() || `ADJ-${String(Date.now()).slice(-6)}`,
      type: 'PENYESUAIAN',
      inQty: params.adjustType === 'MASUK' ? cleanQty : 0,
      outQty: params.adjustType === 'KELUAR' ? cleanQty : 0,
      balance: nextBalance,
      ket: params.ket.trim() || `Penyesuaian stok ${params.adjustType === 'MASUK' ? 'masuk' : 'keluar'} manual`,
      petugas: userName,
      branchId: currentBranch.id,
      hpp: med.hpp || 0,
      batchNo: mutBatchNo,
      expDate: mutExpDate,
      batchDetails: mutBatchDetails
    };

    setStockMutations((prev) => {
      const next = [newMutation, ...prev];
      persistStockMutationsNow(next);
      return next;
    });
    addAuditLog(
      'Kartu Stok Digital',
      `Penyesuaian stok ${med.name} (${params.adjustType === 'MASUK' ? '+' : '-'}${cleanQty} ${med.unit}) · Saldo: ${nextBalance}. Ket: ${newMutation.ket}`
    );

    if (isDemoActive || isDemoMode()) {
      return { success: true, isDemo: true };
    }

    if (nextMedSnapshot) {
      syncMedicineWithTracking(nextMedSnapshot).catch((err) =>
        console.warn('Supabase medicine adjustment sync error:', err)
      );
    }

    markIdsPendingSync('stock_mutations', [newMutation.id]);
    const res = await syncStockMutationToSupabase(newMutation);
    if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
    if (res.needsBatchColumnMigration !== undefined) {
      setStockMutationsNeedsBatchMigration(Boolean(res.needsBatchColumnMigration));
    }
    if (res.success) {
      confirmCloudSync('stock_mutations', [newMutation.id]);
    }
    return res;
  };

  const handleDeleteStockMutations = async (idsToDelete: string[]) => {
    const cleanIds = Array.from(
      new Set((idsToDelete || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (cleanIds.length === 0) return { success: true };

    markIdsDeleted('stock_mutations', cleanIds);
    const idSet = new Set(cleanIds);

    setStockMutations((prev) => {
      const updated = prev.filter((m) => !idSet.has(m.id));
      try {
        demoSetItem('latisha_stock_mutations', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    addAuditLog('Mutasi & Kartu Stok Digital', `Hapus ${cleanIds.length} catatan mutasi kartu stok`);

    if (isDemoActive || isDemoMode()) {
      confirmCloudDeletes('stock_mutations', cleanIds);
      return { success: true, isDemo: true };
    }

    const res = await deleteStockMutationsFromSupabase(cleanIds);
    if (res.needsTableSetup) setStockMutationsNeedsTableSetup(true);
    if (res.success) {
      confirmCloudDeletes('stock_mutations', cleanIds);
    }
    return res;
  };

  // ================================================================
  // MASTER DATA OBAT — TWO-WAY SUPABASE SYNC HANDLER
  // ================================================================
  const handleSyncMedicinesSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error:
          'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan untuk isolasi data demo.'
      };
    }

    try {
      const currentLocal = medicinesRef.current.filter(
        (m) => m.id && !(m.batchNo?.startsWith('BTC-202') && /^OBT-0(0[1-9]|10)$/.test(m.id))
      );
      const pendingOps = readPendingMedicineOps();
      const localById = new Map<string, Medicine>(currentLocal.map((m) => [m.id, m]));

      // 1. Flush pending deletes first so deleted items are removed from Supabase
      const remainingDeletes: string[] = [];
      let hitTableSetup = false;
      let flushError: string | undefined;

      for (const delId of pendingOps.deletes) {
        const delRes = await deleteMedicineFromSupabase(delId);
        if (delRes.needsTableSetup) {
          hitTableSetup = true;
          remainingDeletes.push(delId);
        } else if (!delRes.success) {
          remainingDeletes.push(delId);
          flushError = flushError || delRes.error;
        }
      }

      // 2. Flush pending upserts (adds/updates made while offline or pending)
      const pendingUpsertMeds = pendingOps.upserts
        .map((id) => localById.get(id))
        .filter((m): m is Medicine => Boolean(m));
      let remainingUpserts = [...pendingOps.upserts];

      if (pendingUpsertMeds.length > 0 && !hitTableSetup) {
        const upRes = await seedMedicinesToSupabase(pendingUpsertMeds);
        if (upRes.needsTableSetup) {
          hitTableSetup = true;
        } else if (upRes.success) {
          const flushedIds = new Set(pendingUpsertMeds.map((m) => m.id));
          remainingUpserts = remainingUpserts.filter((id) => !flushedIds.has(id));
        } else {
          flushError = flushError || upRes.error;
        }
      }

      writePendingMedicineOps({ upserts: remainingUpserts, deletes: remainingDeletes });

      if (hitTableSetup) {
        setMedicinesNeedsTableSetup(true);
        return {
          success: false,
          needsTableSetup: true,
          error: `Tabel ${getSupabaseConfig().medicineTable || 'master_obat'} belum dibuat di Supabase.`
        };
      }

      // 3. Pull authoritative cloud snapshot from Supabase
      const res = await fetchMedicinesFromSupabase({ seedIfEmpty: false });
      setMedicinesNeedsTableSetup(Boolean(res.needsTableSetup));

      if (res.needsTableSetup) {
        return {
          success: false,
          needsTableSetup: true,
          error: res.error
        };
      }

      if (res.error || res.data === null) {
        return {
          success: false,
          error: res.error || flushError || 'Gagal mengambil data Master Obat dari Supabase.'
        };
      }

      const remoteList = res.data;
      const remoteIds = new Set(remoteList.map((m) => m.id));
      const hasSyncedBefore =
        typeof window !== 'undefined' &&
        demoGetItem(MEDICINES_CLOUD_SYNCED_KEY) === 'true';

      const stillPendingDeleteSet = new Set(remainingDeletes);
      const stillPendingUpsertSet = new Set(remainingUpserts);
      let finalCloudAndInitial = [...remoteList];

      // On first-ever cloud sync, upload any pre-existing local-only real medicines so nothing is lost
      if (!hasSyncedBefore) {
        const initialLocalOnly = currentLocal.filter(
          (m) => !remoteIds.has(m.id) && !stillPendingDeleteSet.has(m.id)
        );
        if (initialLocalOnly.length > 0) {
          const seedRes = await seedMedicinesToSupabase(initialLocalOnly);
          if (seedRes.success) {
            finalCloudAndInitial = [...remoteList, ...initialLocalOnly];
          } else if (seedRes.error) {
            flushError = flushError || seedRes.error;
          }
        }
      }

      // Reconcile cloud snapshot with any still-unsynced local mutations
      const mergedMap = new Map<string, Medicine>();
      for (const m of finalCloudAndInitial) {
        if (!stillPendingDeleteSet.has(m.id)) {
          mergedMap.set(m.id, m);
        }
      }
      for (const pendingId of stillPendingUpsertSet) {
        const localMed = localById.get(pendingId);
        if (localMed && !stillPendingDeleteSet.has(pendingId)) {
          mergedMap.set(pendingId, localMed);
        }
      }

      const normalized = normalizeUniqueMedicines(Array.from(mergedMap.values()));
      setMedicines(normalized.items);

      if (normalized.reassigned.length > 0) {
        normalized.reassigned.forEach((m) => {
          syncMedicineWithTracking(m).catch(() => {});
        });
      }

      if (typeof window !== 'undefined') {
        try {
          demoSetItem(MEDICINES_CLOUD_SYNCED_KEY, 'true');
        } catch {}
      }

      // Activate Realtime channel if table just became ready
      if (!medicineChannelRef.current) {
        medicineChannelRef.current = subscribeMedicinesRealtime(
          (newMed) => {
            if (isDemoMode()) return;
            setMedicines((prev) => {
              if (prev.some((m) => m.id === newMed.id)) {
                return prev.map((m) => (m.id === newMed.id ? newMed : m));
              }
              return normalizeUniqueMedicines([newMed, ...prev]).items;
            });
          },
          (updatedMed) => {
            if (isDemoMode()) return;
            setMedicines((prev) => {
              if (prev.some((m) => m.id === updatedMed.id)) {
                return prev.map((m) => (m.id === updatedMed.id ? updatedMed : m));
              }
              return normalizeUniqueMedicines([updatedMed, ...prev]).items;
            });
          },
          (delId) => {
            if (isDemoMode()) return;
            setMedicines((prev) => prev.filter((m) => m.id !== delId));
          }
        );
      }

      if (flushError) {
        return { success: false, count: normalized.items.length, error: flushError };
      }

      return { success: true, count: normalized.items.length };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err)
      };
    }
  };

  const handleSyncStockMutationsSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    needsBatchColumnMigration?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan untuk isolasi data demo.'
      };
    }

    // 1. Flush pending cloud deletes so removed mutation rows stay deleted
    const pendingDeletes = getPendingDeleteIds('stock_mutations');
    if (pendingDeletes.length > 0) {
      const delRes = await deleteStockMutationsFromSupabase(pendingDeletes);
      if (delRes.needsTableSetup) {
        setStockMutationsNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: delRes.error };
      }
      if (delRes.success) {
        confirmCloudDeletes('stock_mutations', pendingDeletes);
      }
    }

    const res = await fetchStockMutationsFromSupabase({ forceRefresh: true });
    setStockMutationsNeedsTableSetup(Boolean(res.needsTableSetup));
    if (res.needsBatchColumnMigration !== undefined) {
      setStockMutationsNeedsBatchMigration(Boolean(res.needsBatchColumnMigration));
    }

    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error
      };
    }

    if (res.error && (!res.data || res.data.length === 0)) {
      return {
        success: false,
        error: res.error
      };
    }

    const demoMutIds = ['MUT-01', 'MUT-02', 'MUT-03'];
    const deletedMutSet = getDeletedIdsSet('stock_mutations');
    const pendingSyncMutSet = getPendingSyncIdsSet('stock_mutations');
    const syncedOnceMut = hasCompletedInitialCloudSync('stock_mutations');

    // Enforce deletion tombstones if any deleted IDs still exist remotely
    const rawRemoteList = res.data || [];
    const stubbornDeletedRemoteIds = rawRemoteList
      .filter((m) => deletedMutSet.has(m.id))
      .map((m) => m.id);
    if (stubbornDeletedRemoteIds.length > 0) {
      const dRes = await deleteStockMutationsFromSupabase(stubbornDeletedRemoteIds).catch(() => ({
        success: false
      }));
      if (dRes.success) confirmCloudDeletes('stock_mutations', stubbornDeletedRemoteIds);
    }

    const remoteList = rawRemoteList.filter(
      (m) => m.id && !demoMutIds.includes(m.id) && !deletedMutSet.has(m.id)
    );
    const remoteById = new Map(remoteList.map((m) => [m.id, m]));

    const validLocal = stockMutationsRef.current.filter(
      (m) => m.id && !demoMutIds.includes(m.id) && !deletedMutSet.has(m.id)
    );
    const localOnly = validLocal.filter(
      (m) => pendingSyncMutSet.has(m.id) || (!syncedOnceMut && !remoteById.has(m.id))
    );
    const enrichedToBackfill = !res.needsBatchColumnMigration
      ? validLocal.filter((localM) => {
          const remoteM = remoteById.get(localM.id);
          if (!remoteM) return false;
          const localHasBatch = Boolean(
            (localM.batchNo && localM.batchNo !== '-') ||
            localM.expDate ||
            (localM.batchDetails && localM.batchDetails.length > 0)
          );
          const remoteHasBatch = Boolean(
            (remoteM.batchNo && remoteM.batchNo !== '-') ||
            remoteM.expDate ||
            (remoteM.batchDetails && remoteM.batchDetails.length > 0)
          );
          return localHasBatch && !remoteHasBatch;
        })
      : [];

    const toUpload = [...localOnly, ...enrichedToBackfill];
    let seedError: string | undefined;
    let detectedBatchMigration = Boolean(res.needsBatchColumnMigration);
    if (toUpload.length > 0) {
      const seedRes = await seedStockMutationsToSupabase(toUpload);
      if (seedRes.needsBatchColumnMigration) detectedBatchMigration = true;
      if (seedRes.success) {
        confirmCloudSync(
          'stock_mutations',
          toUpload.map((m) => m.id)
        );
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }
    setStockMutationsNeedsBatchMigration(detectedBatchMigration);

    const mergedMap = new Map<string, StockMutation>();
    remoteList.forEach((remoteM) => {
      const localMatch = validLocal.find((l) => l.id === remoteM.id);
      mergedMap.set(remoteM.id, mergeStockMutationWithBatchPreserve(localMatch, remoteM));
    });
    localOnly.forEach((localM) => {
      if (!mergedMap.has(localM.id) || pendingSyncMutSet.has(localM.id)) {
        mergedMap.set(localM.id, localM);
      }
    });
    const merged = Array.from(mergedMap.values());
    setStockMutations(merged);
    persistStockMutationsNow(merged);
    markInitialCloudSyncCompleted('stock_mutations');

    if (seedError) {
      return {
        success: false,
        count: merged.length,
        needsBatchColumnMigration: detectedBatchMigration,
        error: seedError
      };
    }
    return {
      success: true,
      count: merged.length,
      needsBatchColumnMigration: detectedBatchMigration
    };
  };

  // ================================================================
  // PEMERIKSAAN & CEK LAB — TWO-WAY TOMBSTONE-SAFE SUPABASE SYNC HANDLER
  // ================================================================
  const handleSyncLabRecordsSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan untuk isolasi data demo.'
      };
    }

    // 1. Replay pending cloud deletes FIRST
    const pendingDeleteIds = getPendingDeleteIds('lab_records');
    if (pendingDeleteIds.length > 0) {
      const delRes = await deleteLabRecordsFromSupabase(pendingDeleteIds);
      if (delRes.needsTableSetup) {
        setLabRecordsNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: delRes.error };
      }
      if (delRes.success) {
        confirmCloudDeletes('lab_records', pendingDeleteIds);
      }
    }

    const res = await fetchLabRecordsFromSupabase({ forceRefresh: true });
    setLabRecordsNeedsTableSetup(Boolean(res.needsTableSetup));

    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error
      };
    }

    if (res.error || res.data === null) {
      return {
        success: false,
        error: res.error || 'Gagal mengambil data Cek Lab dari Supabase.'
      };
    }

    const deletedSet = getDeletedIdsSet('lab_records');
    const pendingSyncSet = getPendingSyncIdsSet('lab_records');
    const syncedOnceBefore = hasCompletedInitialCloudSync('lab_records');
    const remoteAll = res.data || [];

    const stubbornDeletedIds = remoteAll
      .filter((r) => r.id && deletedSet.has(String(r.id).trim()))
      .map((r) => String(r.id).trim());
    if (stubbornDeletedIds.length > 0) {
      const cleanupRes = await deleteLabRecordsFromSupabase(stubbornDeletedIds);
      if (cleanupRes.success) {
        confirmCloudDeletes('lab_records', stubbornDeletedIds);
      }
    }

    const remoteClean = remoteAll.filter(
      (r) => r.id && !isDemoLabRecordId(r.id) && !deletedSet.has(String(r.id).trim())
    );
    const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
    const localValid = labRecordsRef.current.filter(
      (r) => r.id && !isDemoLabRecordId(r.id) && !deletedSet.has(String(r.id).trim())
    );
    const localToUpload = localValid.filter((r) => {
      const cleanId = String(r.id).trim();
      if (pendingSyncSet.has(cleanId)) return true;
      if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
      return false;
    });

    let seedError: string | undefined;
    if (localToUpload.length > 0) {
      const seedRes = await seedLabRecordsToSupabase(localToUpload);
      if (seedRes.success) {
        confirmCloudSync(
          'lab_records',
          localToUpload.map((r) => String(r.id).trim())
        );
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }

    const mergedMap = new Map<string, LabTestRecord>();
    remoteClean.forEach((r) => mergedMap.set(String(r.id).trim(), r));
    localToUpload.forEach((r) => {
      const cleanId = String(r.id).trim();
      if (!mergedMap.has(cleanId) || pendingSyncSet.has(cleanId)) {
        mergedMap.set(cleanId, r);
      }
    });
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
    );
    setLabRecords(merged);
    persistLabRecordsNow(merged);
    markInitialCloudSyncCompleted('lab_records');

    if (seedError) {
      return { success: false, count: merged.length, error: seedError };
    }
    return { success: true, count: merged.length };
  };

  // ================================================================
  // RIWAYAT STOK OPNAME — TWO-WAY TOMBSTONE-SAFE SUPABASE SYNC HANDLER
  // ================================================================
  const handleSyncOpnameRecordsSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan untuk isolasi data demo.'
      };
    }

    // 1. Replay pending cloud deletes FIRST so deleted opname records never reappear
    const pendingDeleteIds = getPendingDeleteIds('opname_records');
    if (pendingDeleteIds.length > 0) {
      const delRes = await deleteOpnameRecordsFromSupabase(pendingDeleteIds);
      if (delRes.needsTableSetup) {
        setOpnameRecordsNeedsTableSetup(true);
        return {
          success: false,
          needsTableSetup: true,
          error: delRes.error
        };
      }
      if (delRes.success) {
        confirmCloudDeletes('opname_records', pendingDeleteIds);
      }
    }

    // 2. Pull authoritative rows from Supabase
    const res = await fetchOpnameRecordsFromSupabase({ forceRefresh: true, limit: 200 });
    setOpnameRecordsNeedsTableSetup(Boolean(res.needsTableSetup));

    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error
      };
    }

    if (res.error || res.data === null) {
      return {
        success: false,
        error: res.error || 'Gagal mengambil data Riwayat Opname dari Supabase.'
      };
    }

    const deletedSet = getDeletedIdsSet('opname_records');
    const pendingSyncSet = getPendingSyncIdsSet('opname_records');
    const remoteAll = res.data || [];

    // 3. Clean up any remote rows that were locally deleted
    const stubbornDeletedIds = remoteAll
      .filter((r) => r.id && deletedSet.has(String(r.id).trim()))
      .map((r) => String(r.id).trim());
    if (stubbornDeletedIds.length > 0) {
      const cleanupRes = await deleteOpnameRecordsFromSupabase(stubbornDeletedIds);
      if (cleanupRes.success) {
        confirmCloudDeletes('opname_records', stubbornDeletedIds);
      }
    }

    const remoteClean = remoteAll.filter(
      (r) => r.id && !isDemoOpnameRecordId(r.id) && !deletedSet.has(String(r.id).trim())
    );
    const remoteIds = new Set(remoteClean.map((r) => String(r.id).trim()));
    const syncedOnceBefore = hasCompletedInitialCloudSync('opname_records');

    // 4. Only upload local records that are genuinely pending sync (or pre-initial-sync migration), never deleted rows
    const localValid = opnameRecordsRef.current.filter(
      (r) => r.id && !isDemoOpnameRecordId(r.id) && !deletedSet.has(String(r.id).trim())
    );
    const localToUpload = localValid.filter((r) => {
      const cleanId = String(r.id).trim();
      if (pendingSyncSet.has(cleanId)) return true;
      if (!syncedOnceBefore && !remoteIds.has(cleanId)) return true;
      return false;
    });

    let seedError: string | undefined;
    if (localToUpload.length > 0) {
      const seedRes = await seedOpnameRecordsToSupabase(localToUpload);
      if (seedRes.needsTableSetup) {
        setOpnameRecordsNeedsTableSetup(true);
        return {
          success: false,
          needsTableSetup: true,
          error: seedRes.error
        };
      }
      if (seedRes.success) {
        confirmCloudSync(
          'opname_records',
          localToUpload.map((r) => String(r.id).trim())
        );
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }

    // 5. Authoritative merge: remote rows + genuinely unsynced local rows (never deleted rows)
    const mergedMap = new Map<string, StockOpnameRecord>();
    remoteClean.forEach((r) => mergedMap.set(String(r.id).trim(), r));
    localToUpload.forEach((r) => {
      const cleanId = String(r.id).trim();
      if (!mergedMap.has(cleanId) || pendingSyncSet.has(cleanId)) {
        mergedMap.set(cleanId, r);
      }
    });
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
    );
    setOpnameRecords(merged);
    persistOpnameNow(merged);
    markInitialCloudSyncCompleted('opname_records');

    // Ensure Realtime subscription is active once table is verified
    if (!opnameChannelRef.current) {
      opnameChannelRef.current = subscribeOpnameRecordsRealtime(
        (newRec) => {
          const cleanId = String(newRec?.id || '').trim();
          if (!cleanId || isDemoMode() || isDemoOpnameRecordId(cleanId)) return;
          if (getDeletedIdsSet('opname_records').has(cleanId)) return;
          setOpnameRecords((prev) => {
            const next = (prev.some((r) => String(r.id).trim() === cleanId)
              ? prev.map((r) => (String(r.id).trim() === cleanId ? newRec : r))
              : [newRec, ...prev]
            ).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
            persistOpnameNow(next);
            return next;
          });
        },
        (updatedRec) => {
          const cleanId = String(updatedRec?.id || '').trim();
          if (!cleanId || isDemoMode() || isDemoOpnameRecordId(cleanId)) return;
          if (getDeletedIdsSet('opname_records').has(cleanId)) return;
          setOpnameRecords((prev) => {
            const next = (prev.some((r) => String(r.id).trim() === cleanId)
              ? prev.map((r) => (String(r.id).trim() === cleanId ? updatedRec : r))
              : [updatedRec, ...prev]
            ).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
            persistOpnameNow(next);
            return next;
          });
        },
        (delId) => {
          const cleanId = String(delId || '').trim();
          if (!cleanId || isDemoMode()) return;
          const deletedObj = opnameRecordsRef.current.find((r) => String(r.id).trim() === cleanId);
          if (deletedObj?.refNo) markOpnameRefsDeleted([deletedObj.refNo]);
          recordRemoteDeletedId('opname_records', cleanId);
          setOpnameRecords((prev) => {
            const next = prev.filter((r) => String(r.id).trim() !== cleanId);
            persistOpnameNow(next);
            return next;
          });
        }
      );
    }

    if (seedError) {
      return { success: false, count: merged.length, error: seedError };
    }
    return { success: true, count: merged.length };
  };

  // ================================================================
  // DEFECTA & RIWAYAT SURAT PESANAN — TWO-WAY SUPABASE SYNC HANDLERS
  // ================================================================
  const handleSavePurchaseOrder = async (
    po: PurchaseOrder,
    options?: { skipAudit?: boolean }
  ): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    const enrichedPo: PurchaseOrder = {
      ...po,
      branchId: po.branchId || currentBranch?.id || 'BR-01',
      petugas: po.petugas || userName,
      updatedAt: po.updatedAt || new Date().toISOString()
    };

    const isUpdate = purchaseOrdersRef.current.some((item) => item.id === enrichedPo.id);
    const nextList = isUpdate
      ? purchaseOrdersRef.current.map((item) => (item.id === enrichedPo.id ? enrichedPo : item))
      : [enrichedPo, ...purchaseOrdersRef.current];

    setPurchaseOrders(nextList);
    persistPurchaseOrdersNow(nextList);

    if (!options?.skipAudit) {
      addAuditLog(
        'Surat Pesanan (SP)',
        `${isUpdate ? 'Pembaruan' : 'Pembuatan'} PO #${enrichedPo.poNumber} ke ${enrichedPo.supplierName} (${enrichedPo.items.length} item, status: ${enrichedPo.status})`
      );
    }

    if (isDemoActive || isDemoMode() || isDemoPurchaseOrderId(enrichedPo.id)) {
      return { success: true, isDemo: true };
    }

    markIdsPendingSync('purchase_orders', [enrichedPo.id]);
    const res = await syncPurchaseOrderToSupabase(enrichedPo);
    setPurchaseOrdersNeedsTableSetup(Boolean(res.needsTableSetup));
    if (res.success) {
      confirmCloudSync('purchase_orders', [enrichedPo.id]);
    }
    return res;
  };

  const handleDeletePurchaseOrder = async (
    poId: string
  ): Promise<{
    success: boolean;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    const existing = purchaseOrdersRef.current.find((p) => p.id === poId);
    const nextList = purchaseOrdersRef.current.filter((p) => p.id !== poId);
    setPurchaseOrders(nextList);
    persistPurchaseOrdersNow(nextList);

    addAuditLog(
      'Hapus Surat Pesanan',
      `Menghapus PO #${existing?.poNumber || poId} (${existing?.supplierName || '-'})`
    );

    if (isDemoActive || isDemoMode() || isDemoPurchaseOrderId(poId)) {
      return { success: true, isDemo: true };
    }

    markIdsDeleted('purchase_orders', [poId]);
    const res = await deletePurchaseOrdersFromSupabase([poId]);
    setPurchaseOrdersNeedsTableSetup(Boolean(res.needsTableSetup));
    if (res.success) {
      confirmCloudDeletes('purchase_orders', [poId]);
    }
    return res;
  };

  const handleSyncPurchaseOrdersSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan untuk isolasi data demo.'
      };
    }

    const pendingDeletes = getPendingDeleteIds('purchase_orders');
    if (pendingDeletes.length > 0) {
      const delRes = await deletePurchaseOrdersFromSupabase(pendingDeletes);
      if (delRes.needsTableSetup) {
        setPurchaseOrdersNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: delRes.error };
      }
      if (delRes.success) {
        confirmCloudDeletes('purchase_orders', pendingDeletes);
      }
    }

    const res = await fetchPurchaseOrdersFromSupabase({ forceRefresh: true });
    setPurchaseOrdersNeedsTableSetup(Boolean(res.needsTableSetup));

    if (res.needsTableSetup) {
      return {
        success: false,
        needsTableSetup: true,
        error: res.error
      };
    }

    if (res.error && (!res.data || res.data.length === 0)) {
      return {
        success: false,
        error: res.error
      };
    }

    const deletedSet = getDeletedIdsSet('purchase_orders');
    const pendingSyncSet = getPendingSyncIdsSet('purchase_orders');
    const rawRemoteList = res.data || [];

    const stubbornDeletedRemoteIds = rawRemoteList
      .filter((po) => deletedSet.has(po.id))
      .map((po) => po.id);
    if (stubbornDeletedRemoteIds.length > 0) {
      deletePurchaseOrdersFromSupabase(stubbornDeletedRemoteIds)
        .then((dRes) => {
          if (dRes.success) confirmCloudDeletes('purchase_orders', stubbornDeletedRemoteIds);
        })
        .catch(() => {});
    }

    const remoteList = rawRemoteList.filter(
      (po) => po.id && !isDemoPurchaseOrderId(po.id) && !deletedSet.has(po.id)
    );
    const remoteIds = new Set(remoteList.map((po) => po.id));

    const validLocal = purchaseOrdersRef.current.filter(
      (po) => po.id && !isDemoPurchaseOrderId(po.id) && !deletedSet.has(po.id)
    );
    const toUpload = validLocal.filter(
      (po) => pendingSyncSet.has(po.id) || !remoteIds.has(po.id)
    );

    let seedError: string | undefined;
    if (toUpload.length > 0) {
      const seedRes = await seedPurchaseOrdersToSupabase(toUpload);
      if (seedRes.success) {
        confirmCloudSync('purchase_orders', toUpload.map((po) => po.id));
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }

    const mergedMap = new Map<string, PurchaseOrder>();
    remoteList.forEach((po) => mergedMap.set(po.id, po));
    validLocal.forEach((po) => {
      if (!mergedMap.has(po.id) || pendingSyncSet.has(po.id)) {
        mergedMap.set(po.id, po);
      }
    });
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      `${b.date || ''} ${b.createdAt || ''}`.localeCompare(`${a.date || ''} ${a.createdAt || ''}`)
    );
    setPurchaseOrders(merged);
    persistPurchaseOrdersNow(merged);
    markInitialCloudSyncCompleted('purchase_orders');

    if (!purchaseOrderChannelRef.current) {
      purchaseOrderChannelRef.current = subscribePurchaseOrdersRealtime(
        (newPo) => {
          if (isDemoMode() || isDemoPurchaseOrderId(newPo.id)) return;
          if (getDeletedIdsSet('purchase_orders').has(newPo.id)) return;
          setPurchaseOrders((prev) => {
            const next = prev.some((p) => p.id === newPo.id)
              ? prev.map((p) => (p.id === newPo.id ? newPo : p))
              : [newPo, ...prev];
            persistPurchaseOrdersNow(next);
            return next;
          });
        },
        (updatedPo) => {
          if (isDemoMode() || isDemoPurchaseOrderId(updatedPo.id)) return;
          if (getDeletedIdsSet('purchase_orders').has(updatedPo.id)) return;
          setPurchaseOrders((prev) => {
            const next = prev.some((p) => p.id === updatedPo.id)
              ? prev.map((p) => (p.id === updatedPo.id ? updatedPo : p))
              : [updatedPo, ...prev];
            persistPurchaseOrdersNow(next);
            return next;
          });
        },
        (delId) => {
          if (isDemoMode()) return;
          recordRemoteDeletedId('purchase_orders', delId);
          setPurchaseOrders((prev) => {
            const next = prev.filter((p) => p.id !== delId);
            persistPurchaseOrdersNow(next);
            return next;
          });
        }
      );
    }

    if (seedError) {
      return { success: false, count: merged.length, error: seedError };
    }
    return { success: true, count: merged.length };
  };

  // ================================================================
  // STRATEGI MARKETING — TWO-WAY SUPABASE SYNC HANDLERS
  // ================================================================
  const handleSaveMarketingCampaign = async (
    campaign: MarketingCampaign,
    isEdit: boolean
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    const enriched: MarketingCampaign = {
      ...campaign,
      branchId: campaign.branchId || currentBranch?.id || 'BR-01',
      createdBy: campaign.createdBy || userName,
      updatedAt: new Date().toISOString()
    };
    const nextList = isEdit
      ? marketingCampaignsRef.current.map((c) => (c.id === enriched.id ? enriched : c))
      : [enriched, ...marketingCampaignsRef.current];
    setMarketingCampaigns(nextList);
    persistMarketingCampaignsNow(nextList);

    addAuditLog(
      'Strategi Marketing',
      `${isEdit ? 'Perbarui' : 'Aktifkan'} kampanye strategi marketing: ${enriched.title}`
    );

    if (isDemoActive || isDemoMode() || isDemoMarketingCampaignId(enriched.id)) {
      return { success: true, isDemo: true };
    }

    markIdsPendingSync('marketing_campaigns', [enriched.id]);
    const res = await syncMarketingCampaignToSupabase(enriched);
    setMarketingNeedsTableSetup(Boolean(res.needsTableSetup));
    if (res.success) {
      confirmCloudSync('marketing_campaigns', [enriched.id]);
    }
    return res;
  };

  const handleDeleteMarketingCampaign = async (
    id: string
  ): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> => {
    const found = marketingCampaignsRef.current.find((c) => c.id === id);
    const nextList = marketingCampaignsRef.current.filter((c) => c.id !== id);
    setMarketingCampaigns(nextList);
    persistMarketingCampaignsNow(nextList);

    addAuditLog('Strategi Marketing', `Hapus kampanye strategi: ${found?.title || id}`);

    if (isDemoActive || isDemoMode() || isDemoMarketingCampaignId(id)) {
      return { success: true, isDemo: true };
    }

    markIdsDeleted('marketing_campaigns', [id]);
    const res = await deleteMarketingCampaignsFromSupabase([id]);
    setMarketingNeedsTableSetup(Boolean(res.needsTableSetup));
    if (res.success) {
      confirmCloudDeletes('marketing_campaigns', [id]);
    }
    return res;
  };

  const handleSyncMarketingCampaignsSupabase = async (): Promise<{
    success: boolean;
    count?: number;
    needsTableSetup?: boolean;
    isDemo?: boolean;
    error?: string;
  }> => {
    if (isDemoActive || isDemoMode()) {
      return {
        success: false,
        isDemo: true,
        error: 'Mode Demo / Sandbox aktif. Sinkronisasi Supabase produksi dinonaktifkan untuk isolasi data demo.'
      };
    }

    const pendingDeletes = getPendingDeleteIds('marketing_campaigns');
    if (pendingDeletes.length > 0) {
      const delRes = await deleteMarketingCampaignsFromSupabase(pendingDeletes);
      if (delRes.needsTableSetup) {
        setMarketingNeedsTableSetup(true);
        return { success: false, needsTableSetup: true, error: delRes.error };
      }
      if (delRes.success) {
        confirmCloudDeletes('marketing_campaigns', pendingDeletes);
      }
    }

    const res = await fetchMarketingCampaignsFromSupabase({ forceRefresh: true });
    setMarketingNeedsTableSetup(Boolean(res.needsTableSetup));
    if (res.needsTableSetup) {
      return { success: false, needsTableSetup: true, error: res.error };
    }
    if (res.error && (!res.data || res.data.length === 0)) {
      return { success: false, error: res.error };
    }

    const deletedSet = getDeletedIdsSet('marketing_campaigns');
    const pendingSyncSet = getPendingSyncIdsSet('marketing_campaigns');
    const remoteList = (res.data || []).filter(
      (c) => c.id && !isDemoMarketingCampaignId(c.id) && !deletedSet.has(c.id)
    );
    const remoteIds = new Set(remoteList.map((c) => c.id));
    const validLocal = marketingCampaignsRef.current.filter(
      (c) => c.id && !isDemoMarketingCampaignId(c.id) && !deletedSet.has(c.id)
    );
    const toUpload = validLocal.filter(
      (c) => pendingSyncSet.has(c.id) || !remoteIds.has(c.id)
    );

    let seedError: string | undefined;
    if (toUpload.length > 0) {
      const seedRes = await seedMarketingCampaignsToSupabase(toUpload);
      if (seedRes.success) {
        confirmCloudSync('marketing_campaigns', toUpload.map((c) => c.id));
      } else if (seedRes.error) {
        seedError = seedRes.error;
      }
    }

    const mergedMap = new Map<string, MarketingCampaign>();
    remoteList.forEach((c) => mergedMap.set(c.id, c));
    validLocal.forEach((c) => {
      if (!mergedMap.has(c.id) || pendingSyncSet.has(c.id)) mergedMap.set(c.id, c);
    });
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    setMarketingCampaigns(merged);
    persistMarketingCampaignsNow(merged);
    markInitialCloudSyncCompleted('marketing_campaigns');

    if (seedError) {
      return { success: false, count: merged.length, error: seedError };
    }
    return { success: true, count: merged.length };
  };

  // ================================================================
  // MODE DEMO / SANDBOX LIFECYCLE HANDLERS (TOTAL ISOLATION)
  // ================================================================
  const applyDemoSeedToReactStates = (bundle: DemoSeedBundle, readFromDemoStorageFirst = false, targetRole?: StaffRole) => {
    const readJson = <T,>(key: string, fallback: T): T => {
      if (!readFromDemoStorageFirst) return fallback;
      try {
        const raw = demoGetItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        return fallback;
      }
    };

    const nextBranches = readJson('latisha_branches', bundle.branches);
    const nextStaff = readJson('latisha_staff', bundle.staffList);
    const nextFee = readJson('latisha_fee_config', bundle.feeConfig);
    const nextRolePerms = readJson('latisha_role_permissions', bundle.rolePermissions);

    setBranches(nextBranches);
    setCurrentBranch(nextBranches[0] || bundle.branches[0]);
    setMedicines(readJson('latisha_medicines', bundle.medicines));
    setPatients(deduplicatePatients(readJson('latisha_patients', bundle.patients)));
    setStaffList(nextStaff);
    setDoctors([
      {
        ...INITIAL_DOCTORS[0],
        name: bundle.dpjProfile.name,
        sip: bundle.dpjProfile.sip,
        specialization: bundle.dpjProfile.specialization,
        schedule: bundle.dpjProfile.schedule,
        feePerPatient: nextFee.doctorFee || 25000
      }
    ]);
    setIcd10List(readJson('latisha_icd10_list', bundle.icd10List));
    setQueue(readJson('latisha_queue', bundle.queue));
    setOnlineRegistrations(readJson('latisha_online_registrations', bundle.onlineRegistrations));
    const deletedRmeSet = getDeletedIdsSet('rme_records');
    setRmeRecords(
      readJson('latisha_rme_records', bundle.rmeRecords).filter(
        (r) => r?.id && !deletedRmeSet.has(String(r.id).trim())
      )
    );
    const deletedLabSet = getDeletedIdsSet('lab_records');
    setLabRecords(
      readJson('latisha_lab_records', bundle.labRecords).filter(
        (r) => r?.id && !deletedLabSet.has(String(r.id).trim())
      )
    );
    const deletedRxSet = getDeletedIdsSet('prescriptions');
    setPrescriptions(
      readJson('latisha_prescriptions', bundle.prescriptions).filter(
        (rx) => rx?.id && !deletedRxSet.has(String(rx.id).trim())
      )
    );
    const deletedTrxSet = getDeletedIdsSet('transactions');
    const deletedFeeSet = getDeletedIdsSet('fee_ledger');
    const deletedShiftSet = getDeletedIdsSet('cashier_shifts');
    const deletedMutSet = getDeletedIdsSet('stock_mutations');
    const deletedPoSet = getDeletedIdsSet('purchase_orders');
    setTransactions(
      readJson('latisha_transactions', bundle.transactions).filter(
        (t) => t?.id && !deletedTrxSet.has(t.id)
      )
    );
    setPurchaseInvoices(readJson('latisha_purchase_invoices', bundle.purchaseInvoices));
    setPurchaseOrders(
      readJson('latisha_purchase_orders', bundle.purchaseOrders).filter(
        (po) => po?.id && !deletedPoSet.has(po.id)
      )
    );
    setStockMutations(
      readJson('latisha_stock_mutations', bundle.stockMutations).filter(
        (m) => m?.id && !deletedMutSet.has(m.id)
      )
    );
    setTransfers(readJson('latisha_transfers', bundle.transfers));
    setAuditLogs(readJson('latisha_audit_logs', bundle.auditLogs));
    setFeeConfig(nextFee);
    setFeeLedger(
      readJson('latisha_fee_ledger', []).filter(
        (e: StaffFeeLedgerEntry) =>
          e?.id &&
          !deletedFeeSet.has(String(e.id).trim()) &&
          !deletedTrxSet.has(String(e.transaction_id || '').trim())
      )
    );
    setMitraList(readJson('latisha_mitra', bundle.mitraList));
    setSuppliers(readJson('latisha_suppliers', bundle.suppliers));
    setPurchaseReturns(readJson('latisha_purchase_returns', bundle.purchaseReturns));
    const deletedOpnameSet = getDeletedIdsSet('opname_records');
    setOpnameRecords(
      readJson('latisha_stock_opname_records', bundle.opnameRecords).filter(
        (r) => r?.id && !deletedOpnameSet.has(String(r.id).trim())
      )
    );
    setCashierShifts(
      readJson('latisha_cashier_shifts', bundle.cashierShifts).filter(
        (s) => s?.id && !deletedShiftSet.has(s.id)
      )
    );
    setSchedules(readJson('latisha_schedules', bundle.schedules));
    setMorbidityReports(readJson('latisha_morbidity_reports', []));
    setMitraOrders(readJson('latisha_mitra_orders', bundle.mitraOrders));
    setSalesDiscounts(readJson('latisha_sales_discounts', []));
    setPromoAds(readJson('latisha_promo_ads', []));
    setMarketingCampaigns(readJson('latisha_marketing_campaigns', []));
    setPortalActivityLogs(readJson(PORTAL_ACTIVITY_STORAGE_KEY, []));
    setRolePermissions(nextRolePerms);
    setActivePrescriptionForPOS(null);
    const demoAckIds = (readJson<string[]>('latisha_restricted_alarm_ack_ids', []) || []).map((id) =>
      String(id).trim()
    );
    const demoAckSet = new Set(demoAckIds);
    acknowledgedRestrictedTrxIdsRef.current = demoAckIds;
    setAcknowledgedRestrictedTrxIds(demoAckIds);
    setRestrictedSaleAlarms(
      (readJson<RestrictedSaleAlarm[]>('latisha_restricted_sale_alarms', []) || []).filter(
        (a) => a?.trxId && !demoAckSet.has(String(a.trxId).trim())
      )
    );
    setInspectTransactionId(null);

    const chosenStaff =
      (targetRole
        ? nextStaff.find((s) => s.role === targetRole || s.roles?.includes(targetRole))
        : null) || nextStaff[0];
    const resolvedRole: StaffRole = normalizeStaffRole(
      targetRole || chosenStaff?.role,
      OWNER_ADMIN_ROLE
    );
    const resolvedId = chosenStaff?.id || 'STF-001';
    const resolvedName = chosenStaff?.name || 'apt. Mardin, S.Farm';

    setActiveStaffId(resolvedId);
    setActiveRole(resolvedRole);
    setUserName(resolvedName);
    setIsLoggedIn(true);
    setActiveTab('dashboard');
    setIsMobileMode(false);
    setDemoResetVersion((v) => v + 1);
    window.dispatchEvent(new Event('latisha_profile_updated'));
  };

  const handleEnterDemoMode = async (targetRole?: StaffRole, openTargetPortal?: 'mitra' | 'pasien') => {
    activateDemoModeStorage();
    const { seedDemoSandboxStorage } = await import('./data/demoData');
    const bundle = seedDemoSandboxStorage(false);
    setIsDemoActive(true);
    applyDemoSeedToReactStates(bundle, true, targetRole);
    if (openTargetPortal === 'mitra') {
      setShowMitraPortal(true);
    } else if (openTargetPortal === 'pasien') {
      setShowPublicPortal(true);
    }
  };

  const handleResetDemoData = async () => {
    const { seedDemoSandboxStorage } = await import('./data/demoData');
    const freshBundle = seedDemoSandboxStorage(true);
    applyDemoSeedToReactStates(freshBundle, false, activeRole);
    setDemoResetToast('Data Demo berhasil di-reset ke kondisi awal! Database asli apotek tetap 100% aman.');
    setTimeout(() => setDemoResetToast(''), 4500);
  };

  const handleExitDemoMode = () => {
    deactivateDemoModeStorage();
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    url.searchParams.delete('demo');
    window.location.replace(`${url.pathname}${url.search}`);
  };

  const handleSwitchDemoRole = (nextRole: StaffRole) => {
    const matchStaff =
      staffList.find((s) => s.role === nextRole || s.roles?.includes(nextRole)) || staffList[0];
    if (matchStaff) {
      setActiveStaffId(matchStaff.id);
      setUserName(matchStaff.name);
    }
    setActiveRole(nextRole);
    const nextPerms = resolveStaffEffectivePermissions(matchStaff, nextRole, rolePermissions);
    if (!nextPerms.includes(activeTab)) {
      setActiveTab(nextPerms[0] || 'dashboard');
    }
    setDemoResetToast(`Pratinjau peran dialihkan ke: ${nextRole}`);
    setTimeout(() => setDemoResetToast(''), 3000);
  };

  const handleCopyDemoShareLink = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'demo');
    navigator.clipboard?.writeText(url.toString()).then(() => {
      setCopiedDemoUrl(true);
      setTimeout(() => setCopiedDemoUrl(false), 2500);
    }).catch(() => {});
  };

  // Active Staff, Effective Doctors, Alarms, and Badge Counts memoized BEFORE early portal/login returns (Rules of Hooks)
  const activeStaffList = useMemo(
    () => staffList.filter((s) => s.status === 'Aktif'),
    [staffList]
  );
  const pendingValidationStaff = useMemo(
    () => staffList.filter((s) => s.status === 'Menunggu Validasi'),
    [staffList]
  );
  const effectiveStaffList = useMemo(
    () => (activeStaffList.length > 0 ? activeStaffList : staffList),
    [activeStaffList, staffList]
  );

  const effectiveDoctors: Doctor[] = useMemo(() => {
    const baseDocs = [...doctors];
    const staffDoctors = effectiveStaffList.filter(
      (s) => s.role === 'Dokter' || (s.roles && s.roles.includes('Dokter'))
    );
    staffDoctors.forEach((sd, idx) => {
      if (idx === 0 && baseDocs.length > 0) {
        baseDocs[0] = {
          ...baseDocs[0],
          name: sd.name
        };
      } else if (!baseDocs.some((d) => d.name.toLowerCase() === sd.name.toLowerCase())) {
        baseDocs.push({
          id: `DOC-${sd.id}`,
          name: sd.name,
          sip: `SIP/2026/${sd.id}`,
          specialization: 'Dokter Umum / Klinis',
          schedule: 'Senin - Sabtu: 08.00 - 20.00 WIB',
          feePerPatient: feeConfig.doctorFee || 20000,
          commissionPercent: 5,
          phone: sd.phone || '0812-0000-0000',
          earnedCommission: 0,
          status: 'Aktif'
        });
      }
    });
    return baseDocs;
  }, [doctors, effectiveStaffList, feeConfig.doctorFee]);

  const currentDoctor = effectiveDoctors[0] || INITIAL_DOCTORS[0];

  const currentUserOpnameAlarmInfo = useMemo(() => {
    const d4 = new Date();
    d4.setMonth(d4.getMonth() - 4);
    const cutoffStr = `${d4.getFullYear()}-${String(d4.getMonth() + 1).padStart(2, '0')}-${String(d4.getDate()).padStart(2, '0')}`;
    const targetNorm = normalizeStr(stripTitles(userName || ''));

    const isSameOfficer = (petugasName?: string) => {
      if (!petugasName || !targetNorm) return false;
      const pNorm = normalizeStr(stripTitles(petugasName));
      if (!pNorm) return false;
      return (
        pNorm === targetNorm ||
        (pNorm.length >= 3 &&
          targetNorm.length >= 3 &&
          (pNorm.includes(targetNorm) || targetNorm.includes(pNorm)))
      );
    };

    let hasUserOpnameIn4Months = false;
    let lastUserOpnameDate = '';

    opnameRecords.forEach((rec) => {
      if (!isSameOfficer(rec.petugas)) return;
      const rDate = rec.date ? rec.date.split('T')[0].split(' ')[0] : '';
      if (!rDate) return;
      if (!lastUserOpnameDate || rDate > lastUserOpnameDate) lastUserOpnameDate = rDate;
      if (rDate >= cutoffStr) hasUserOpnameIn4Months = true;
    });

    stockMutations
      .filter((m) => m.type === 'STOK_OPNAME')
      .forEach((m) => {
        if (!isSameOfficer(m.petugas)) return;
        const mDate = m.date ? m.date.split('T')[0].split(' ')[0] : '';
        if (!mDate) return;
        if (!lastUserOpnameDate || mDate > lastUserOpnameDate) lastUserOpnameDate = mDate;
        if (mDate >= cutoffStr) hasUserOpnameIn4Months = true;
      });

    const canAccessOpname =
      allowedPermissions.includes('inv-stok-opname') ||
      allowedPermissions.includes('mobile-lapangan');

    return {
      shouldWarn: canAccessOpname && !hasUserOpnameIn4Months,
      lastUserOpnameDate,
      cutoffStr
    };
  }, [userName, opnameRecords, stockMutations, allowedPermissions]);

  // Lightweight Overdue Check-In Monitor (> 5 mins past scheduled start time) for logged-in staff
  const [globalAttendanceRecords, setGlobalAttendanceRecords] = useState<StaffAttendanceRecord[]>(() =>
    loadLocalAttendanceRecords()
  );
  const [overdueCurrentUserSchedules, setOverdueCurrentUserSchedules] = useState<DutySchedule[]>([]);
  const [dismissedCheckInBanner, setDismissedCheckInBanner] = useState<boolean>(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    const onAttUpdated = () => setGlobalAttendanceRecords(loadLocalAttendanceRecords());
    window.addEventListener(ATTENDANCE_UPDATED_EVENT, onAttUpdated);
    return () => {
      window.removeEventListener(ATTENDANCE_UPDATED_EVENT, onAttUpdated);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || showPublicPortal || showMitraPortal) {
      setOverdueCurrentUserSchedules((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const evaluateOverdue = () => {
      const next = findOverdueUncheckedSchedules({
        schedules,
        records: globalAttendanceRecords,
        now: new Date(),
        graceMinutes: 5,
        targetStaffId: currentStaff?.id,
        targetStaffName: userName
      });
      setOverdueCurrentUserSchedules((prev) => {
        if (
          prev.length === next.length &&
          prev.every((item, idx) => item.id === next[idx]?.id)
        ) {
          return prev;
        }
        return next;
      });
    };
    evaluateOverdue();
    const interval = window.setInterval(evaluateOverdue, 30000);
    return () => {
      window.clearInterval(interval);
    };
  }, [
    isLoggedIn,
    showPublicPortal,
    showMitraPortal,
    schedules,
    globalAttendanceRecords,
    currentStaff?.id,
    userName
  ]);

  useEffect(() => {
    if (overdueCurrentUserSchedules.length === 0) return;
    const todayIso = getTodayIsoLocal(new Date());
    const unalerted = overdueCurrentUserSchedules.filter(
      (s) => !hasTriggeredCheckInOverdueAlert(todayIso, s.id)
    );
    if (unalerted.length === 0) return;

    unalerted.forEach((s) => markTriggeredCheckInOverdueAlert(todayIso, s.id));
    setDismissedCheckInBanner(false);
    playCheckInOverdueAlarmAndVoice().catch(() => {});
  }, [overdueCurrentUserSchedules]);

  const pendingShiftApprovalCount = useMemo(
    () => cashierShifts.filter((s) => s.status === 'Menunggu Approval Tutup Kasir').length,
    [cashierShifts]
  );
  const pendingResepCount = useMemo(
    () => prescriptions.filter((p) => p.status === 'Pending Skrining').length,
    [prescriptions]
  );
  const pendingOnlineCount = useMemo(
    () => onlineRegistrations.filter((r) => r.status === 'Menunggu Verifikasi').length,
    [onlineRegistrations]
  );
  const pendingMitraOrdersCount = useMemo(
    () => mitraOrders.filter((o) => o.status === 'Pending').length,
    [mitraOrders]
  );

  if (showMitraPortal || showPublicPortal) {
    const initialUnifiedSection: 'order' | 'pasien' = showPublicPortal ? 'pasien' : 'order';
    return (
      <Suspense fallback={<TabLoadingFallback />}>
        <UnifiedCustomerPortalView
          initialSection={initialUnifiedSection}
          initialOrderRoom={unifiedOrderRoom}
          isDemoSandbox={isDemoActive}
          onResetDemo={handleResetDemoData}
          onExitDemo={handleExitDemoMode}
          allowReturnToStaffPreview={isLoggedIn && !openedViaDirectCustomerUrl}
          onBackToStaffPreview={() => {
            setShowMitraPortal(false);
            setShowPublicPortal(false);
            setPortalActivityLogs(loadPortalActivityLogs());
          }}
          mitraList={mitraList}
          initialMedicines={medicines}
          initialPromos={promoAds}
          initialDiscounts={salesDiscounts}
          onRegisterMitra={handleAddMitra}
          onOrderSubmitted={(newOrd) => {
            setMitraOrders((prev) => {
              if (prev.some((o) => o.id === newOrd.id)) return prev;
              return [newOrd, ...prev];
            });
            setPortalActivityLogs(loadPortalActivityLogs());
          }}
          schedules={schedules}
          initialPatients={patients}
          onNewRegistrationSuccess={(newReg) => {
            setOnlineRegistrations((prev) => [newReg, ...prev]);
          }}
        />
      </Suspense>
    );
  }

  const syncDoctorStaffToDpjProfile = async (
    savedStaff: Staff,
    liveRolePerms: Record<string, string[]> = rolePermissions
  ) => {
    const staffRoles = getStaffActiveRoles(savedStaff, savedStaff.role);
    if (!staffRoles.includes('Dokter') || savedStaff.isDpj !== true) {
      return;
    }
    const currentDpj = getSavedDPJProfile();
    const nextDpj: DPJProfile = {
      ...currentDpj,
      name: savedStaff.name.trim(),
      phone: savedStaff.phone.trim() || currentDpj.phone,
      ...(savedStaff.sipNumber?.trim() ? { sip: savedStaff.sipNumber.trim() } : {}),
      ...(savedStaff.estrNumber?.trim() ? { idi: savedStaff.estrNumber.trim() } : {})
    };
    try {
      demoSetItem('latisha_dpj_profile', JSON.stringify(nextDpj));
      syncFacilityProfileToServer({
        pharmacy: getSavedPharmacyProfile(),
        apj: getSavedAPJProfile(),
        dpj: nextDpj
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('latisha_profile_updated', { detail: { source: 'dpj_registration' } })
        );
      }
    } catch {}

    setDoctors((prev) =>
      prev.map((doc, idx) =>
        idx === 0
          ? {
              ...doc,
              name: nextDpj.name,
              sip: nextDpj.sip || doc.sip,
              phone: nextDpj.phone || doc.phone,
              specialization: nextDpj.specialization || doc.specialization,
              schedule: nextDpj.schedule || doc.schedule
            }
          : doc
      )
    );

    if (!isDemoActive && !isDemoMode() && getSupabaseClient()) {
      await syncFacilityProfilesToSupabase({
        pharmacy: getSavedPharmacyProfile(),
        apj: getSavedAPJProfile(),
        dpj: nextDpj,
        rolePermissions: normalizeRolePermissionsMap(liveRolePerms)
      }).catch(() => {});
    }
  };

  const handleSelfRegisterStaff = async (incomingStaff: Staff): Promise<Staff> => {
    const finalRole = normalizeStaffRole(incomingStaff.role, 'Apoteker');
    const liveRolePermissions = demoGetItem('latisha_role_permissions')
      ? getSavedRolePermissions()
      : normalizeRolePermissionsMap(rolePermissions);
    const assignedPermissions = resolveRoleDefaultPermissions(finalRole, liveRolePermissions);

    const buildStaffWithId = (resolvedId: string): Staff =>
      ensurePrimaryOwnerStaffRole({
        ...incomingStaff,
        id: resolvedId,
        role: finalRole,
        roles: [finalRole],
        permissions: assignedPermissions,
        status: 'Menunggu Validasi',
        registeredAt: incomingStaff.registeredAt || new Date().toISOString()
      }).staff;

    let savedStaff: Staff;

    if (!isDemoActive && !isDemoMode()) {
      const regRes = await registerNewStaffToSupabase(buildStaffWithId, staffListRef.current);
      if (regRes.allCloudStaff && regRes.allCloudStaff.length > 0) {
        const pendingDeleteSet = new Set(getPendingDeleteIds('staff'));
        const syncedList = regRes.allCloudStaff
          .filter((s) => s?.id && !pendingDeleteSet.has(String(s.id).trim()))
          .map((s) => ensurePrimaryOwnerStaffRole(s).staff);
        if (syncedList.length > 0) {
          saveStaffListLocally(syncedList);
          setStaffList(syncedList);
        }
      }
      if (!regRes.success || !regRes.staff) {
        throw new Error(
          regRes.error ||
            'Pendaftaran gagal tersimpan ke database Supabase. Silakan periksa koneksi internet dan coba lagi.'
        );
      }
      savedStaff = regRes.staff;
      confirmCloudSync('staff', [savedStaff.id]);
    } else {
      const uniqueId = staffListRef.current.some(
        (s) => s.id.toLowerCase() === incomingStaff.id.toLowerCase()
      )
        ? generateNextStaffId(staffListRef.current)
        : incomingStaff.id;
      savedStaff = buildStaffWithId(uniqueId);
      setStaffList((prev) => {
        if (prev.some((s) => s.id.toLowerCase() === savedStaff.id.toLowerCase())) {
          return prev;
        }
        const nextList = [...prev, savedStaff];
        saveStaffListLocally(nextList);
        return nextList;
      });
      confirmCloudSync('staff', [savedStaff.id]);
    }

    addAuditLog(
      'Pegawai',
      `Registrasi mandiri akun pegawai ${savedStaff.name} (ID: ${savedStaff.id}, Role: ${savedStaff.role}, ${savedStaff.permissions?.length || 0} modul${savedStaff.isDpj ? ', Calon DPJ' : ''}) — menunggu validasi APJ / Owner`
    );
    return savedStaff;
  };

  const handleValidateStaffAccount = async (targetStaff: Staff) => {
    const validatedStaff: Staff = ensurePrimaryOwnerStaffRole({
      ...targetStaff,
      status: 'Aktif',
      validatedAt: new Date().toISOString(),
      validatedBy: userName || 'APJ / Owner'
    }).staff;

    markIdsPendingSync('staff', [validatedStaff.id]);
    setStaffList((prev) => {
      const nextList = prev.map((s) => (s.id === validatedStaff.id ? validatedStaff : s));
      saveStaffListLocally(nextList);
      return nextList;
    });

    if (!isDemoActive && !isDemoMode()) {
      await syncStaffToSupabase(validatedStaff)
        .then((res) => {
          if (res.success) confirmCloudSync('staff', [validatedStaff.id]);
        })
        .catch(() => {});
    } else {
      confirmCloudSync('staff', [validatedStaff.id]);
    }

    const validatedRoles = getStaffActiveRoles(validatedStaff, validatedStaff.role);
    if (validatedRoles.includes('Dokter') && validatedStaff.isDpj === true) {
      const liveRolePerms = demoGetItem('latisha_role_permissions')
        ? getSavedRolePermissions()
        : normalizeRolePermissionsMap(rolePermissions);
      await syncDoctorStaffToDpjProfile(validatedStaff, liveRolePerms);
    }

    setConfirmRejectPendingStaffId(null);
    addAuditLog(
      'Validasi Pegawai',
      `APJ / Owner (${userName}) memvalidasi & mengaktifkan akun pegawai ${validatedStaff.name} (ID: ${validatedStaff.id}, Role: ${validatedStaff.role}). Pegawai kini dapat login ke sistem.`
    );
    setStaffValidationToast(
      `Akun ${validatedStaff.name} (${validatedStaff.id}) telah divalidasi dan sekarang dapat login ke sistem.`
    );
    setTimeout(() => {
      setStaffValidationToast((prev) =>
        prev && prev.includes(validatedStaff.id) ? null : prev
      );
    }, 5000);
  };

  const handleRejectPendingStaff = async (targetStaff: Staff) => {
    const rejectedStaff: Staff = {
      ...targetStaff,
      status: 'Non-Aktif',
      validatedAt: new Date().toISOString(),
      validatedBy: userName || 'APJ / Owner'
    };

    markIdsPendingSync('staff', [rejectedStaff.id]);
    setStaffList((prev) => {
      const nextList = prev.map((s) => (s.id === rejectedStaff.id ? rejectedStaff : s));
      saveStaffListLocally(nextList);
      return nextList;
    });

    if (!isDemoActive && !isDemoMode()) {
      await syncStaffToSupabase(rejectedStaff)
        .then((res) => {
          if (res.success) confirmCloudSync('staff', [rejectedStaff.id]);
        })
        .catch(() => {});
    } else {
      confirmCloudSync('staff', [rejectedStaff.id]);
    }

    setConfirmRejectPendingStaffId(null);
    addAuditLog(
      'Validasi Pegawai',
      `APJ / Owner (${userName}) menolak / menonaktifkan pendaftaran akun pegawai ${rejectedStaff.name} (ID: ${rejectedStaff.id}).`
    );
    setStaffValidationToast(
      `Pendaftaran ${rejectedStaff.name} (${rejectedStaff.id}) ditolak (status Non-Aktif).`
    );
    setTimeout(() => {
      setStaffValidationToast((prev) =>
        prev && prev.includes(rejectedStaff.id) ? null : prev
      );
    }, 4500);
  };

  if (showStaffRegistration) {
    return (
      <Suspense fallback={<TabLoadingFallback />}>
        <PublicStaffRegistrationView
          staffList={staffList}
          branches={branches}
          rolePermissions={rolePermissions}
          isDemoSandbox={isDemoActive}
          isLoadingCloudStaff={isLoadingCloudStaff}
          cloudSyncError={cloudStaffSyncError}
          onRefreshCloudStaff={async () => {
            await refreshStaffFromCloud();
          }}
          onRegisterStaff={handleSelfRegisterStaff}
          onBackToLogin={(prefillStaff) => {
            setShowStaffRegistration(false);
            if (typeof window !== 'undefined') {
              try {
                const url = new URL(window.location.href);
                if (url.searchParams.get('view')?.toLowerCase() === 'registrasi-pegawai') {
                  url.searchParams.delete('view');
                  window.history.replaceState({}, '', url.toString());
                }
              } catch {}
            }
            if (prefillStaff) {
              setLoginNameInput(prefillStaff.name);
              setLoginIdInput(prefillStaff.id);
              setLoginErrorMessage('');
            }
          }}
        />
      </Suspense>
    );
  }

  // Login Screen if logged out
  const matchedLoginStaff = verifyStaffCredentials(loginNameInput, loginIdInput, staffList);

  if (!isLoggedIn) {
    return (
      <div className="fixed inset-0 bg-slate-950 overflow-y-auto custom-scrollbar z-50">
        <div className="min-h-full w-full flex flex-col items-center justify-start sm:justify-center p-3 sm:p-6">
          <div className="my-auto bg-white rounded-2xl sm:rounded-3xl w-full max-w-md md:max-w-3xl lg:max-w-4xl shadow-2xl overflow-hidden border border-slate-800">
            {/* Compact Responsive Brand Header */}
            <div className="px-4 py-4 sm:px-7 sm:py-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white p-1.5 rounded-2xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden">
                  <img
                    src={`${import.meta.env.BASE_URL}assets/aistudio/logo_resmi_apotek_673c56f0.png`}
                    alt="Logo Aplikasi Latisha Farma"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-white tracking-wide leading-tight">
                    LATISHA FARMA
                  </h1>
                  <p className="text-[11px] sm:text-xs text-sky-400 font-bold uppercase tracking-wider mt-0.5">
                    Enterprise Pharmacy &amp; Clinic System
                  </p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[11px] font-semibold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Portal Autentikasi Pegawai &amp; Akses Publik</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Left / Primary Column: Staff Login Form */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  let candidateList = staffList;
                  let matched = verifyStaffCredentials(loginNameInput, loginIdInput, candidateList);
                  if (
                    (!matched || matched.status === 'Menunggu Validasi') &&
                    !isDemoActive &&
                    !isDemoMode()
                  ) {
                    const refreshed = await refreshStaffFromCloud({ silent: true });
                    if (refreshed && refreshed.length > 0) {
                      candidateList = refreshed;
                      matched = verifyStaffCredentials(loginNameInput, loginIdInput, candidateList);
                    }
                  }
                  if (!matched) {
                    setLoginErrorMessage(
                      'Nama atau ID tidak ditemukan. Pastikan nama petugas (boleh nama saja atau dengan gelar) dan ID pegawai sesuai dengan data yang tersimpan di sistem.'
                    );
                    return;
                  }
                  if (matched.status === 'Menunggu Validasi') {
                    setLoginErrorMessage(
                      `Akun pegawai ${matched.name} (${matched.id}) sedang menunggu validasi oleh APJ / Owner. Anda baru dapat login ke sistem setelah data divalidasi.`
                    );
                    return;
                  }
                  if (matched.status !== 'Aktif') {
                    setLoginErrorMessage(
                      `Akun pegawai ${matched.name} (${matched.id}) saat ini berstatus Non-Aktif. Silakan hubungi APJ / Owner.`
                    );
                    return;
                  }

                  const roles = getStaffActiveRoles(matched, matched.role);
                  const primaryRole: StaffRole = roles.some((r) => isOwnerAdminRole(r))
                    ? 'APJ / Owner'
                    : roles[0];
                  const nextPerms = resolveStaffEffectivePermissions(
                    matched,
                    primaryRole,
                    rolePermissions
                  );

                  setLoginErrorMessage('');
                  setActiveStaffId(matched.id);
                  setUserName(matched.name);
                  setActiveRole(primaryRole);
                  if (!nextPerms.includes(activeTab)) {
                    setActiveTab(nextPerms[0] || 'dashboard');
                  }
                  setIsLoggedIn(true);
                  demoSetItem('latisha_is_logged_in', 'true');
                  addAuditLog(
                    'Auth',
                    `Pengguna ${matched.name} (ID: ${matched.id}) berhasil masuk dengan peran ${primaryRole}`
                  );
                }}
                className="md:col-span-7 p-4 sm:p-6 lg:p-7 space-y-4 text-xs"
              >
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                  <span className="font-extrabold text-slate-800 text-xs sm:text-sm uppercase tracking-wide">
                    Login Pegawai / Petugas
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Apotek Latisha Farma
                  </span>
                </div>

                {/* Notification alert if rejected */}
                {loginErrorMessage && (
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <strong className="block font-bold">Autentikasi Gagal</strong>
                      <span className="leading-snug block break-words">{loginErrorMessage}</span>
                    </div>
                  </div>
                )}

                {/* 1. Nama Petugas */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <label className="block font-bold text-slate-700">Nama Petugas *</label>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      Boleh nama saja atau dengan gelar
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="Masukkan nama petugas"
                      value={loginNameInput}
                      onChange={(e) => {
                        setLoginNameInput(e.target.value);
                        if (loginErrorMessage) setLoginErrorMessage('');
                      }}
                      className="w-full min-h-[44px] py-2.5 pr-3 pl-9 border rounded-xl font-bold bg-white text-slate-800 border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none text-base sm:text-xs"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* 2. ID Pegawai */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <label className="block font-bold text-slate-700">ID Pegawai *</label>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      Diinput manual (Kerahasiaan Terjaga)
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="Masukkan ID pegawai"
                      value={loginIdInput}
                      onChange={(e) => {
                        setLoginIdInput(e.target.value);
                        if (loginErrorMessage) setLoginErrorMessage('');
                      }}
                      className="w-full min-h-[44px] py-2.5 pr-3 pl-9 border rounded-xl font-mono font-bold bg-white text-slate-800 border-slate-300 focus:ring-2 focus:ring-sky-500 outline-none uppercase text-base sm:text-xs"
                    />
                    <IdCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* 3. Hak Akses */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <label className="font-bold text-slate-700">Hak Akses (Peran / Jabatan)</label>
                    <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-600" /> Kolom Terkunci
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        matchedLoginStaff
                          ? getStaffActiveRoles(matchedLoginStaff, matchedLoginStaff.role).join(', ')
                          : loginNameInput.trim() && loginIdInput.trim()
                          ? 'Nama atau ID tidak ditemukan'
                          : 'Otomatis terisi saat Nama & ID valid...'
                      }
                      readOnly
                      disabled
                      className={`w-full min-h-[44px] py-2.5 pr-3 pl-9 border rounded-xl font-bold cursor-not-allowed select-none transition text-xs ${
                        matchedLoginStaff
                          ? matchedLoginStaff.status === 'Aktif'
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            : matchedLoginStaff.status === 'Menunggu Validasi'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                          : loginNameInput.trim() && loginIdInput.trim()
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    />
                    <ShieldCheck
                      className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
                        matchedLoginStaff
                          ? matchedLoginStaff.status === 'Aktif'
                            ? 'text-emerald-600'
                            : matchedLoginStaff.status === 'Menunggu Validasi'
                            ? 'text-amber-600'
                            : 'text-rose-600'
                          : 'text-slate-400'
                      }`}
                    />
                  </div>
                  {matchedLoginStaff ? (
                    matchedLoginStaff.status === 'Menunggu Validasi' ? (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Akun <strong>{matchedLoginStaff.name}</strong> terdaftar namun berstatus{' '}
                          <strong>Menunggu Validasi APJ / Owner</strong>. Akses login dibuka setelah
                          data divalidasi.
                        </span>
                      </div>
                    ) : matchedLoginStaff.status !== 'Aktif' ? (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-rose-700">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span>
                          Akun pegawai {matchedLoginStaff.name} berstatus Non-Aktif. Hubungi APJ /
                          Owner.
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-emerald-700">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>
                          Pegawai terverifikasi: {matchedLoginStaff.name} (
                          {
                            resolveStaffEffectivePermissions(
                              matchedLoginStaff,
                              matchedLoginStaff.role,
                              rolePermissions
                            ).length
                          }{' '}
                          Modul Akses)
                        </span>
                      </div>
                    )
                  ) : loginNameInput.trim() && loginIdInput.trim() ? (
                    <div className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-rose-600">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                      <span>Nama atau ID tidak ditemukan di data sistem</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Kolom ini otomatis mendeteksi peran resmi pegawai terdaftar dan terkunci untuk
                      keamanan.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[46px] py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-black rounded-xl shadow-lg transition text-xs tracking-wider uppercase cursor-pointer active:scale-[0.99] mt-1"
                >
                  Masuk ke Sistem Latisha Farma
                </button>

                {/* Link Registrasi Akun Pegawai */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStaffRegistration(true)}
                    className="inline-flex items-center justify-center sm:justify-start gap-1.5 py-2 px-3 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 font-extrabold text-[11px] transition cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                    <span>Registrasi Akun Pegawai Baru</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const shareUrl = getStaffRegistrationShareUrl(isDemoActive);
                      navigator.clipboard?.writeText(shareUrl).then(() => {
                        setCopiedStaffRegUrl(true);
                        setTimeout(() => setCopiedStaffRegUrl(false), 2200);
                      });
                    }}
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 text-[11px] font-bold text-slate-600 hover:text-violet-700 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                    title="Salin link halaman registrasi akun pegawai untuk dibagikan"
                  >
                    {copiedStaffRegUrl ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedStaffRegUrl ? 'Link Disalin!' : 'Salin Link Registrasi'}</span>
                  </button>
                </div>
              </form>

              {/* Right / Secondary Column: Mode Demo & Public / Mitra Portals */}
              <div className="md:col-span-5 p-4 sm:p-6 lg:p-7 bg-slate-50/70 flex flex-col justify-between gap-3 text-xs">
                {/* MODE DEMO / CLIENT PREVIEW SANDBOX ENTRY */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50 via-amber-50/70 to-orange-50 border border-amber-300 space-y-2.5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <FlaskConical className="w-4 h-4 text-amber-700 shrink-0" />
                      <span className="font-black text-amber-950 text-[11px] uppercase tracking-wide">
                        Mode Demo / Klien Preview
                      </span>
                    </div>
                    <span className="px-2 py-0.5 bg-amber-300 text-amber-950 font-black text-[9px] rounded border border-amber-500 uppercase">
                      Sandbox Aman
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900/90 leading-snug">
                    Coba seluruh fitur POS, E-Resep, Stok Opname multi-batch, &amp; Portal Mitra
                    dengan data contoh tanpa memengaruhi database produksi.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => handleEnterDemoMode('APJ / Owner')}
                      className="w-full min-h-[42px] py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>Masuk Mode Demo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEnterDemoMode('APJ / Owner', 'mitra')}
                      className="w-full min-h-[42px] py-2.5 px-3 bg-white hover:bg-amber-100 text-amber-950 font-bold rounded-xl border border-amber-300 transition text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Store className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>Demo Portal Mitra</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10px]">
                    <span className="text-amber-800 font-semibold">
                      URL Klien:{' '}
                      <code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono">
                        ?mode=demo
                      </code>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyDemoShareLink}
                      className="inline-flex items-center gap-1 py-1 font-bold text-amber-900 hover:text-amber-950 underline cursor-pointer"
                    >
                      {copiedDemoUrl ? (
                        <Check className="w-3 h-3 text-emerald-700" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedDemoUrl ? 'Tautan Disalin!' : 'Salin Link Demo'}</span>
                    </button>
                  </div>
                </div>

                {/* Unified Customer & Patient Portal + QR Code */}
                <div className="space-y-2">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Aplikasi Pelanggan &amp; Pasien (PWA)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setUnifiedOrderRoom('REGULER');
                      setShowPublicPortal(false);
                      setShowMitraPortal(true);
                    }}
                    className="w-full min-h-[44px] py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-700 hover:to-sky-700 text-white font-extrabold rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm text-center"
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Buka Aplikasi Pelanggan &amp; Pasien</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUnifiedOrderRoom('MITRA');
                        setShowPublicPortal(false);
                        setShowMitraPortal(true);
                      }}
                      className="min-h-[38px] py-2 px-2.5 bg-sky-50 hover:bg-sky-100 text-sky-900 font-bold rounded-xl border border-sky-200 transition text-[11px] flex items-center justify-center gap-1.5 cursor-pointer text-center"
                    >
                      <Store className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>Order Mitra</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMitraPortal(false);
                        setShowPublicPortal(true);
                      }}
                      className="min-h-[38px] py-2 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl border border-emerald-200 transition text-[11px] flex items-center justify-center gap-1.5 cursor-pointer text-center"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Daftar Pasien</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQrPortalModal(true)}
                    className="w-full min-h-[38px] py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>QR Code &amp; Poster Apotek</span>
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-1 pt-0.5">
                    <a
                      href={buildPortalUrl({ view: 'portal-pelanggan' }, isDemoActive)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 hover:text-sky-800 font-bold hover:underline py-1"
                    >
                      ?view=portal-pelanggan ↗
                    </a>
                    <a
                      href={buildPortalUrl({ view: 'portal-mitra' }, isDemoActive)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline py-1"
                    >
                      /portal-mitra ↗
                    </a>
                    <a
                      href={getStaffRegistrationShareUrl(isDemoActive)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-700 hover:text-violet-900 font-bold hover:underline py-1 inline-flex items-center gap-0.5"
                    >
                      <span>?view=registrasi-pegawai</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showQrPortalModal && (
          <Suspense fallback={null}>
            <PortalQRGeneratorModal
              isOpen={showQrPortalModal}
              onClose={() => setShowQrPortalModal(false)}
              defaultTarget="unified"
              onOpenPortalPreview={(target) => {
                if (target === 'pasien') {
                  setShowMitraPortal(false);
                  setShowPublicPortal(true);
                } else {
                  setUnifiedOrderRoom(target === 'mitra' ? 'MITRA' : 'REGULER');
                  setShowPublicPortal(false);
                  setShowMitraPortal(true);
                }
              }}
            />
          </Suspense>
        )}
      </div>
    );
  }

  // Derived staff, doctor, alarm, and badge values are memoized above early portal returns.

  return (
    <RoleAccessProvider activeRole={activeRole}>
    <div key={`workspace-${isDemoActive}-${demoResetVersion}`} className="flex flex-col h-screen overflow-hidden bg-slate-100 text-slate-800">
      {/* Persistent Sandbox / Demo Mode Indicator Banner */}
      {isDemoActive && (
        <div className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 text-slate-950 border-b-2 border-amber-500 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0 z-40 shadow-sm text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-slate-950 text-amber-300 px-2.5 py-1 rounded-lg font-black text-[11px] uppercase tracking-wider shadow-xs">
              <FlaskConical className="w-3.5 h-3.5" />
              MODE DEMO / SANDBOX
            </span>
            <span className="font-bold text-slate-900">
              Lingkungan uji coba terisolasi aktif — transaksi, resep, stok, & pesanan mitra tidak mengubah database asli apotek.
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white/85 px-2.5 py-1 rounded-lg border border-amber-600/30">
              <span className="text-[10px] font-bold text-slate-600 uppercase">Simulasi Peran:</span>
              <select
                value={activeRole}
                onChange={(e) => handleSwitchDemoRole(e.target.value as StaffRole)}
                className="bg-transparent text-slate-950 font-extrabold text-xs outline-none cursor-pointer"
              >
                <option value="APJ / Owner">APJ / Owner</option>
                <option value="Dokter">Dokter</option>
                <option value="Apoteker">Apoteker</option>
                <option value="Perawat / Bidan">Perawat / Bidan</option>
                <option value="Kasir & Front Office">Kasir & Front Office</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleResetDemoData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-amber-50 text-slate-950 font-black border border-amber-700/40 shadow-xs transition cursor-pointer"
              title="Hapus semua perubahan demo & kembalikan dummy data awal"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
              <span>Reset Demo</span>
            </button>

            <button
              type="button"
              onClick={handleCopyDemoShareLink}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-950/10 hover:bg-amber-950/20 text-slate-950 font-bold border border-amber-700/30 transition cursor-pointer"
              title="Salin tautan khusus calon pelanggan (?mode=demo)"
            >
              {copiedDemoUrl ? <Check className="w-3.5 h-3.5 text-emerald-800" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedDemoUrl ? 'Link Disalin' : 'Salin Link Demo'}</span>
            </button>

            <button
              type="button"
              onClick={handleExitDemoMode}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs transition cursor-pointer"
              title="Keluar dari Mode Demo Sandbox & kembali ke sistem produksi"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Demo</span>
            </button>
          </div>
        </div>
      )}

      {/* Non-blocking Demo Notification Toast */}
      {demoResetToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-amber-400 flex items-center gap-2.5 text-xs font-bold">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{demoResetToast}</span>
        </div>
      )}



      {/* Top Header */}
      <Header
        currentBranch={currentBranch}
        branches={branches}
        onSelectBranch={(b) => {
          setCurrentBranch(b);
          addAuditLog('Navigasi Cabang', `Beralih ke cabang ${b.name}`);
        }}
        activeRole={activeRole}
        userName={userName}
        currentStaff={currentStaff}
        allowedPermissions={allowedPermissions}
        isMobileMode={isMobileMode}
        onToggleMobileMode={() => setIsMobileMode(!isMobileMode)}
        onLogout={() => {
          setIsLoggedIn(false);
          setLoginNameInput('');
          setLoginIdInput('');
          setLoginErrorMessage('');
          demoSetItem('latisha_is_logged_in', 'false');
        }}
        onSyncNow={handleSyncNow}
        isSyncing={isSyncing}
        onOpenLiveMonitor={() => handleNavigateTab('fo-antrean')}
        onOpenSettings={(tab) => {
          setSettingsInitialTab(tab || 'apotek');
          setIsSettingsModalOpen(true);
        }}
        pendingShiftApprovalCount={pendingShiftApprovalCount}
        onNavigateToCashierShiftApproval={() => handleNavigateTab('pos-kasir')}
        pendingStaffValidationCount={pendingValidationStaff.length}
        onOpenStaffValidation={() => {
          setSettingsInitialTab('pegawai');
          setIsSettingsModalOpen(true);
        }}
        isDemoMode={isDemoActive}
        onResetDemo={handleResetDemoData}
        onExitDemo={handleExitDemoMode}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isDesktopSidebarCollapsed={isDesktopSidebarCollapsed}
        onToggleDesktopSidebar={() => {
          setIsDesktopSidebarCollapsed((prev) => {
            const next = !prev;
            demoSetItem('latisha_desktop_sidebar_collapsed', String(next));
            return next;
          });
        }}
      />

      {/* Global Super Admin Audio & Visual Alarm for Non-Clinic Psikotropik / Antibiotik Sales (All Modes) */}
      {isSuperAdminLoggedIn && activeRestrictedSaleAlarms.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          data-restricted-alarm-banner="true"
          className="bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 text-white border-b-2 border-amber-300 px-3 sm:px-5 py-2.5 shadow-lg z-40 shrink-0"
        >
          <div className="max-w-7xl mx-auto space-y-2">
            {activeRestrictedSaleAlarms.map((alarm, idx) => (
              <div
                key={alarm.id}
                className={`flex flex-col md:flex-row md:items-center justify-between gap-2.5 ${
                  idx > 0 ? 'pt-2 border-t border-white/20' : ''
                }`}
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <span className="p-2 bg-white/20 rounded-xl shrink-0 animate-pulse border border-white/30">
                    <Siren className="w-5 h-5 text-amber-200" />
                  </span>
                  <div className="min-w-0 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-amber-300 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                        ALARM OBAT TERBATAS
                      </span>
                      <span className="font-black text-xs sm:text-sm tracking-tight text-white">
                        Akun {alarm.cashierName} melakukan penjualan {alarm.categoryLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-100 mt-0.5 break-words">
                      No. Transaksi <strong className="font-mono text-white">#{alarm.trxId}</strong> · Jalur{' '}
                      <strong className="text-amber-200">{alarm.trxType}</strong> (Di luar jalur Pasien Klinik) ·{' '}
                      <span>{alarm.timestampLabel}</span> · Obat:{' '}
                      <strong className="text-white">
                        {alarm.flaggedItems
                          .map((it) => `${it.name} (${it.qty} ${it.unit})`)
                          .join(', ')}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {idx === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isAlarmAudioMuted) {
                          setIsAlarmAudioMuted(false);
                        } else {
                          stopRestrictedSaleAlarmAudio();
                          setIsAlarmAudioMuted(true);
                        }
                      }}
                      className="px-2.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
                      title={
                        isAlarmAudioMuted
                          ? 'Aktifkan kembali suara alarm peringatan'
                          : 'Bisukan suara alarm sementara'
                      }
                    >
                      {isAlarmAudioMuted ? (
                        <VolumeX className="w-3.5 h-3.5 text-amber-200" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
                      )}
                      <span>{isAlarmAudioMuted ? 'Bunyikan Alarm' : 'Bisukan Suara'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleAcknowledgeRestrictedAlarm(alarm, true)}
                    className="px-4 py-2 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 font-black text-xs shadow-md inline-flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Silahkan Cek</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifikasi Validasi Akun Pegawai Baru (Khusus APJ / Owner) */}
      {isSuperAdminLoggedIn && pendingValidationStaff.length > 0 && (
        <div
          role="region"
          aria-label="Notifikasi validasi akun pegawai baru"
          className="bg-gradient-to-r from-amber-50 via-amber-100/90 to-orange-50 text-amber-950 border-b-2 border-amber-400 px-3 sm:px-5 py-2.5 shadow-sm z-30 shrink-0"
        >
          <div className="max-w-7xl mx-auto space-y-2">
            {pendingValidationStaff.map((pendingSt, idx) => {
              const pendingRoles = getStaffActiveRoles(pendingSt, pendingSt.role);
              const isConfirmingReject = confirmRejectPendingStaffId === pendingSt.id;
              return (
                <div
                  key={pendingSt.id}
                  className={`flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 ${
                    idx > 0 ? 'pt-2 border-t border-amber-300/70' : ''
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                    <span className="p-2 bg-amber-500 text-white rounded-xl shrink-0 shadow-2xs">
                      <Bell className="w-4 h-4 animate-bounce" />
                    </span>
                    <div className="min-w-0 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-black text-[10px] uppercase tracking-wider">
                          VALIDASI PEGAWAI BARU
                        </span>
                        <span className="font-mono font-black text-sky-800 bg-white px-2 py-0.5 rounded border border-sky-300 text-[10px]">
                          {pendingSt.id}
                        </span>
                        <span className="font-black text-xs sm:text-sm text-slate-900">
                          {pendingSt.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 border border-violet-300 font-bold text-[10px]">
                          {pendingRoles.join(', ')}
                        </span>
                        {pendingSt.isDpj && pendingRoles.includes('Dokter') && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-[10px]">
                            Calon DPJ
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-amber-900 mt-0.5 break-words">
                        Pegawai mendaftar mandiri dan menunggu validasi APJ / Owner sebelum dapat login ke sistem.
                        {' · '}WA/HP: <strong className="font-mono">{pendingSt.phone}</strong>
                        {pendingSt.sipNumber && (
                          <>
                            {' · '}SIP: <strong className="font-mono">{pendingSt.sipNumber}</strong>
                          </>
                        )}
                        {pendingSt.estrNumber && (
                          <>
                            {' · '}E-STR: <strong className="font-mono">{pendingSt.estrNumber}</strong>
                          </>
                        )}
                        {pendingSt.sipbNumber && (
                          <>
                            {' · '}SIPB/E-STR: <strong className="font-mono">{pendingSt.sipbNumber}</strong>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleValidateStaffAccount(pendingSt)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm inline-flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Validasi &amp; Aktifkan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsInitialTab('pegawai');
                        setIsSettingsModalOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border border-amber-300 font-bold text-[11px] inline-flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Tinjau Data</span>
                    </button>
                    {isConfirmingReject ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleRejectPendingStaff(pendingSt)}
                          className="px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] cursor-pointer transition"
                        >
                          Yakin Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRejectPendingStaffId(null)}
                          className="px-2 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[11px] cursor-pointer transition"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRejectPendingStaffId(pendingSt.id)}
                        className="px-2.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer transition"
                      >
                        Tolak
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast Konfirmasi Validasi Pegawai (APJ / Owner) */}
      {isSuperAdminLoggedIn && staffValidationToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 z-50 max-w-md w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="rounded-2xl border border-emerald-400 bg-slate-900 text-white shadow-xl p-3.5 flex items-start gap-3 text-xs">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-xs text-emerald-300">Validasi Pegawai Diperbarui</div>
              <p className="text-[11px] text-slate-200 mt-0.5 leading-relaxed break-words">
                {staffValidationToast}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStaffValidationToast(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
              aria-label="Tutup notifikasi validasi pegawai"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Notifikasi Toast Backup Otomatis Harian (APJ / Owner) */}
      {isSuperAdminLoggedIn && autoBackupToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-md w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-2"
        >
          <div
            className={`rounded-2xl border shadow-xl p-3.5 flex items-start gap-3 text-xs ${
              autoBackupToast.type === 'success'
                ? 'bg-slate-900 text-white border-emerald-500/50'
                : 'bg-rose-950 text-rose-50 border-rose-500/60'
            }`}
          >
            <div
              className={`p-2 rounded-xl shrink-0 ${
                autoBackupToast.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              <FolderArchive className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-xs flex items-center gap-1.5">
                <span>
                  {autoBackupToast.type === 'success'
                    ? 'Backup Otomatis Harian Selesai'
                    : 'Backup Otomatis Harian Gagal'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed break-words">
                {autoBackupToast.message}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('setup-database');
                    setAutoBackupToast(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-[11px] transition cursor-pointer"
                >
                  Lihat Folder Backups
                </button>
                <button
                  type="button"
                  onClick={() => setAutoBackupToast(null)}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 font-bold text-[11px] transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoBackupToast(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
              aria-label="Tutup notifikasi backup"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <div className="flex flex-1 overflow-hidden min-w-0">
        {/* Sidebar Navigation */}
        {!isMobileMode && (
          <Sidebar
            activeTab={pendingTabTarget || activeTab}
            setActiveTab={handleNavigateTab}
            pendingResepCount={pendingResepCount}
            pendingOnlineCount={pendingOnlineCount}
            pendingMitraOrdersCount={pendingMitraOrdersCount}
            activeRole={activeRole}
            allowedPermissions={allowedPermissions}
            staffRoles={currentStaffRoles}
            isMobileDrawerOpen={isSidebarOpen}
            onCloseMobileDrawer={() => setIsSidebarOpen(false)}
            isDesktopCollapsed={isDesktopSidebarCollapsed}
          />
        )}

        {/* Viewport Content */}
        <main className="flex-1 min-w-0 w-full overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 pb-24 sm:pb-20 lg:pb-20 custom-scrollbar bg-slate-100">
          {/* Global User Alarm Banner when user has not done Stock Opname in the last 4 months (shown outside StockOpnameView since StockOpnameView renders its own detailed alarm) */}
          {!isMobileMode && activeTab !== 'inv-stok-opname' && currentUserOpnameAlarmInfo.shouldWarn && (
            <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white border-2 border-rose-300 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start sm:items-center gap-2.5">
                <span className="p-2 bg-white/20 rounded-xl shrink-0 animate-bounce">
                  <AlertCircle className="w-5 h-5 text-amber-200" />
                </span>
                <div>
                  <p className="font-black text-xs sm:text-sm tracking-wide uppercase">
                    PERINGATAN ! ANDA BELUM MELAKUKAN STOK OPNAME. SEGERA LAKUKAN OPNAME !!!
                  </p>
                  <p className="text-[11px] text-rose-100 mt-0.5">
                    Akun <strong>{userName}</strong> belum tercatat melakukan kegiatan Stok Opname dalam 4 bulan terakhir
                    {currentUserOpnameAlarmInfo.lastUserOpnameDate
                      ? ` (terakhir: ${currentUserOpnameAlarmInfo.lastUserOpnameDate})`
                      : ''}
                    .
                  </p>
                </div>
              </div>
              {allowedPermissions.includes('inv-stok-opname') && (
                <button
                  type="button"
                  onClick={() => handleNavigateTab('inv-stok-opname')}
                  className="px-3.5 py-2 bg-white hover:bg-amber-100 text-rose-700 rounded-xl font-black text-xs shrink-0 shadow-xs cursor-pointer transition"
                >
                  Buka Stok Opname Sekarang &rarr;
                </button>
              )}
            </div>
          )}

          {/* Global Overdue Check-In Alert (> 5 mins past shift start) for logged-in user */}
          {overdueCurrentUserSchedules.length > 0 && !dismissedCheckInBanner && activeTab !== 'rme-jadwal' && (
            <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start sm:items-center gap-2.5">
                <span className="p-2 bg-rose-600 text-white rounded-xl shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-black text-rose-900 text-xs sm:text-sm">
                    Anda Belum Check-In Absensi ({overdueCurrentUserSchedules[0].staffName})
                  </p>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    Jadwal shift Anda mulai pukul{' '}
                    <strong>{overdueCurrentUserSchedules[0].startTime} WIB</strong> telah lewat lebih dari 5 menit dan belum tercatat check-in.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    playCheckInOverdueAlarmAndVoice().catch(() => {});
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Putar Suara</span>
                </button>
                {allowedPermissions.includes('rme-jadwal') && (
                  <button
                    type="button"
                    onClick={() => handleNavigateTab('rme-jadwal')}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold text-[11px] flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Check-In Sekarang</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDismissedCheckInBanner(true)}
                  className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 cursor-pointer transition"
                  title="Tutup peringatan sementara"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Mobile Field Staff Mode View */}
          <div className={isTabTransitionPending ? 'opacity-80 transition-opacity duration-150' : ''}>
          <Suspense fallback={<TabLoadingFallback />}>
          {isMobileMode ? (
            <MobileFieldStaffView
              medicines={medicines}
              queue={queue}
              transactions={transactions}
              onApplyStockOpname={handleApplyStockOpname}
              onCloseMobileMode={() => setIsMobileMode(false)}
              staffName={userName}
              opnameRecords={opnameRecords}
              stockMutations={stockMutations}
              staffList={effectiveStaffList}
              schedules={schedules}
              currentStaffId={currentStaff?.id}
              currentBranch={currentBranch}
              onAuditLog={addAuditLog}
            />
          ) : !allowedPermissions.includes(activeTab) ? (
            <div className="max-w-lg mx-auto mt-12 p-8 bg-white rounded-3xl border border-rose-200 shadow-lg text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase">
                Modul Tidak Diizinkan untuk Peran Ini
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Akun pegawai <strong>{userName}</strong> dengan peran aktif{' '}
                <strong className="text-violet-700">{activeRole}</strong> tidak memiliki hak akses
                ke modul ini. Silakan pilih menu yang tersedia pada navigasi samping atau hubungi{' '}
                <strong>APJ / Owner</strong>.
              </p>
              <button
                type="button"
                onClick={() => handleNavigateTab(allowedPermissions[0] || 'dashboard')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-extrabold cursor-pointer transition"
              >
                Kembali ke Beranda Akses
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Dashboard */}
              {activeTab === 'dashboard' && (
                <DashboardView
                  transactions={transactions}
                  medicines={medicines}
                  queue={queue}
                  prescriptions={prescriptions}
                  currentBranch={currentBranch}
                  onNavigateTab={handleNavigateTab}
                />
              )}

              {/* Module 1: Front Office & Antrean */}
              {activeTab === 'fo-antrean' && (
                <LiveMonitorView
                  queue={queue}
                  onUpdateQueueStatus={handleUpdateQueueStatus}
                  onCallNext={handleCallNext}
                  clinicName={currentBranch.name}
                  doctorName={currentDoctor.name}
                />
              )}

              {activeTab === 'fo-pasien' && (
                <PatientMasterView
                  patients={patients}
                  isDemoSandbox={isDemoActive}
                  onAddPatient={async (p) => {
                    setPatients((prev) => {
                      if (prev.some((item) => isSamePatientRecord(item, p))) {
                        return deduplicatePatients(prev.map((item) => (isSamePatientRecord(item, p) ? p : item)));
                      }
                      return deduplicatePatients([p, ...prev]);
                    });
                    addAuditLog('Master Pasien', `Registrasi pasien baru ${p.name} (${p.id})`);
                    if (isDemoActive || isDemoMode()) return { success: true };
                    // Outbound sync to Supabase
                    const syncRes = await syncPatientToSupabase(p).catch((err) => {
                      console.warn('Supabase outbound sync error:', err);
                      return { success: false, error: err?.message || String(err) };
                    });
                    if (syncRes.success) {
                      enqueuePatientSatuSehatBackground(p, (patId, ihs) => {
                        setPatients((prev) =>
                          prev.map((item) =>
                            item.dbId === patId || item.id === patId
                              ? {
                                  ...item,
                                  ihsNumber: ihs,
                                  syncSatusehat: 'sent',
                                  satusehatSyncedAt: new Date().toISOString()
                                }
                              : item
                          )
                        );
                      });
                    }
                    return syncRes;
                  }}
                  onUpdatePatient={async (p) => {
                    setPatients((prev) => {
                      const matched = prev.some((item) => isSamePatientRecord(item, p));
                      const next = matched
                        ? prev.map((item) => (isSamePatientRecord(item, p) ? p : item))
                        : [p, ...prev];
                      return deduplicatePatients(next);
                    });
                    addAuditLog('Master Pasien', `Update data pasien ${p.name} (${p.id})`);
                    if (isDemoActive || isDemoMode()) return { success: true };
                    // Outbound strict in-place update to Supabase
                    const updateRes = await updatePatientInSupabase(p).catch((err) => {
                      console.warn('Supabase outbound update error:', err);
                      return { success: false, error: err?.message || String(err) };
                    });
                    if (updateRes.success) {
                      enqueuePatientSatuSehatBackground(p, (patId, ihs) => {
                        setPatients((prev) =>
                          prev.map((item) =>
                            item.dbId === patId || item.id === patId
                              ? {
                                  ...item,
                                  ihsNumber: ihs,
                                  syncSatusehat: 'sent',
                                  satusehatSyncedAt: new Date().toISOString()
                                }
                              : item
                          )
                        );
                      });
                    }
                    return updateRes;
                  }}
                  onDeletePatient={async (id) => {
                    const cleanId = String(id || '').trim();
                    const matched = patients.find(
                      (p) => p.id === cleanId || p.dbId === cleanId || p.noRm === cleanId
                    );
                    const idsToTombstone = Array.from(
                      new Set(
                        [cleanId, matched?.id, matched?.dbId, matched?.noRm]
                          .map((v) => String(v || '').trim())
                          .filter(Boolean)
                      )
                    );
                    markIdsDeleted('patients', idsToTombstone);
                    setPatients((prev) =>
                      prev.filter((p) => p.id !== cleanId && p.dbId !== cleanId && p.noRm !== cleanId)
                    );
                    addAuditLog('Master Pasien', `Hapus data pasien ${cleanId}`);
                    if (isDemoActive || isDemoMode()) {
                      confirmCloudDeletes('patients', idsToTombstone);
                      return { success: true };
                    }
                    const delRes = await deletePatientFromSupabase(cleanId).catch((err) => {
                      console.warn('Supabase outbound delete error:', err);
                      return { success: false, error: err?.message || String(err) };
                    });
                    if (delRes.success) {
                      confirmCloudDeletes('patients', idsToTombstone);
                    }
                    return delRes;
                  }}
                  onReloadFromSupabase={async () => {
                    const deletedPatientSet = getDeletedIdsSet('patients');
                    const res = await fetchPatientsFromSupabase({ limit: 200 });
                    if (res.data && res.data.length > 0) {
                      const remoteClean = res.data.filter(
                        (p) =>
                          ![p.id, p.dbId, p.noRm].some(
                            (k) => k && deletedPatientSet.has(String(k).trim())
                          )
                      );
                      setPatients((prev) =>
                        mergePatientLists(
                          prev.filter(
                            (p) =>
                              ![p.id, p.dbId, p.noRm].some(
                                (k) => k && deletedPatientSet.has(String(k).trim())
                              )
                          ),
                          remoteClean
                        ).slice(0, 250)
                      );
                      return { success: true, count: remoteClean.length };
                    }
                    return { success: false, error: res.error || 'Tidak ada data di Supabase' };
                  }}
                  onSendToQueue={(p) => {
                    const nextNum = `A-${String(queue.length + 1).padStart(3, '0')}`;
                    const newQueueItem: PatientQueue = {
                      nomor: nextNum,
                      rmId: p.id,
                      name: p.name,
                      age: p.age,
                      gender: p.gender,
                      vital: { td: '120/80', suhu: 36.5, nadi: 80, spo2: 98 },
                      status: 'Menunggu',
                      doctorId: currentDoctor.id,
                      doctorName: currentDoctor.name,
                      checkinTime: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                      source: 'Pendaftaran Langsung (Walk-in)',
                      complaint: 'Pemeriksaan Dokter Umum',
                      serviceType: 'Poli Umum',
                      branchId: currentBranch.id
                    };
                    setQueue((prev) => [...prev, newQueueItem]);
                    handleNavigateTab('fo-antrean');
                    addAuditLog('Front Office', `Pasien ${p.name} didaftarkan ke antrean ${nextNum}`);
                  }}
                />
              )}

              {activeTab === 'fo-checkin' && (
                <CheckinView
                  patients={patients}
                  doctors={effectiveDoctors}
                  staffList={effectiveStaffList}
                  queue={queue}
                  onAddToQueue={(q) => {
                    setQueue((prev) => [...prev, q]);
                    addAuditLog('Check-in', `Pasien ${q.name} check-in dengan nomor antrean ${q.nomor}`);
                  }}
                  onNavigateToMonitor={() => handleNavigateTab('fo-antrean')}
                  onRegisterNewPatient={(newPat) => {
                    setPatients((prev) => {
                      if (!prev.some((p) => isSamePatientRecord(p, newPat))) {
                        return deduplicatePatients([newPat, ...prev]);
                      }
                      return deduplicatePatients(prev);
                    });
                  }}
                />
              )}

              {activeTab === 'fo-online' && (
                <OnlineRegistrationView
                  registrations={onlineRegistrations}
                  schedules={schedules}
                  onAddRegistration={(reg) => {
                    setOnlineRegistrations((prev) => [reg, ...prev]);
                    addAuditLog('Online Booking', `Pendaftaran online baru ${reg.name} (${reg.bookingCode})`);
                    syncOnlineRegistrationToSupabase(reg).catch((err) => console.warn('Supabase reg add error:', err));
                  }}
                  onUpdateStatus={(id, status) => {
                    setOnlineRegistrations((prev) => {
                      const updated = prev.map((r) => (r.id === id ? { ...r, status } : r));
                      const target = updated.find((r) => r.id === id);
                      if (target) {
                        syncOnlineRegistrationToSupabase(target).catch((err) => console.warn('Supabase reg status update error:', err));
                      }
                      return updated;
                    });
                    addAuditLog('Online Booking', `Status pendaftaran #${id} diperbarui menjadi ${status}`);
                  }}
                  onReloadFromSupabase={async () => {
                    const res = await fetchOnlineRegistrationsFromSupabase();
                    if (res.data && res.data.length > 0) {
                      setOnlineRegistrations((prev) => {
                        const map = new Map<string, OnlineRegistration>();
                        prev.forEach((r) => map.set(r.id, r));
                        res.data!.forEach((r) => map.set(r.id, r));
                        return Array.from(map.values());
                      });
                      return { success: true, count: res.data.length };
                    }
                    return { success: false, error: res.error || 'Tidak ada data pendaftaran online di Supabase' };
                  }}
                  onAcceptToQueue={handleAcceptOnlineRegistrationToQueue}
                  doctors={effectiveDoctors}
                  patients={patients}
                />
              )}

              {/* Module 2: Pelayanan Dokter & RME */}
              {activeTab === 'rme-pemeriksaan' && (
                <DoctorSOAPView
                  queue={queue}
                  medicines={medicines}
                  activeDoctor={currentDoctor}
                  icd10List={icd10List}
                  onSaveRME={handleSaveRME}
                  onFinishQueue={handleFinishDoctorQueue}
                  onUpdateQueuePatient={handleUpdateQueuePatient}
                  staffList={effectiveStaffList}
                  feeConfig={feeConfig}
                  labRecords={labRecords}
                  onAddIcd10={(newItem) => {
                    setIcd10List((prev) => {
                      if (!prev.some((i) => i.code.toLowerCase() === newItem.code.toLowerCase())) {
                        return [...prev, newItem];
                      }
                      return prev;
                    });
                    syncICD10ToSupabase(newItem).catch((err) => console.warn('Supabase ICD10 sync error:', err));
                  }}
                  onReloadIcd10FromSupabase={async () => {
                    const res = await fetchICD10FromSupabase();
                    if (res.data && res.data.length > 0) {
                      setIcd10List(res.data);
                      return { success: true, count: res.data.length };
                    }
                    return { success: false, error: res.error || 'Gagal memuat data ICD-10 dari Supabase' };
                  }}
                />
              )}

              {activeTab === 'rme-cek-lab' && (
                <LabTestView
                  labRecords={labRecords}
                  patients={patients}
                  doctors={effectiveDoctors}
                  staffList={effectiveStaffList}
                  medicines={medicines}
                  onAddLabRecord={handleAddLabRecord}
                  onUpdateLabRecord={handleUpdateLabRecord}
                  onDeleteLabRecord={handleDeleteLabRecord}
                  onSyncSupabase={handleSyncLabRecordsSupabase}
                  needsTableSetup={labRecordsNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                />
              )}

              {activeTab === 'rme-riwayat' && (
                <RMEHistoryView
                  rmeRecords={rmeRecords}
                  staffList={effectiveStaffList}
                  medicines={medicines}
                  icd10List={icd10List}
                  onUpdateRecord={handleUpdateRME}
                  onDeleteRecord={handleDeleteRME}
                  onBulkDeleteRecords={handleBulkDeleteRME}
                  onSyncRmeSupabase={handleSyncRmeSupabase}
                  needsTableSetup={rmeNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  onSyncRmeFromSupabase={(newRecs) => {
                    const deletedSet = getDeletedIdsSet('rme_records');
                    const cleanList = newRecs.filter(
                      (r) => r?.id && !deletedSet.has(String(r.id).trim())
                    );
                    setRmeRecords(cleanList);
                    persistRmeNow(cleanList);
                  }}
                />
              )}

              {activeTab === 'rme-laporan' && (
                <RMEReportsView
                  rmeRecords={rmeRecords}
                  morbidityReports={morbidityReports}
                  onSaveMorbidityReport={handleSaveMorbidityReport}
                  onDeleteMorbidityReport={handleDeleteMorbidityReport}
                  onSyncSupabase={handleSyncMorbiditySupabase}
                  needsTableSetup={morbidityNeedsTableSetup}
                  needsRmeTableSetup={rmeNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  currentUserName={userName}
                  currentBranchId={currentBranch.id}
                />
              )}

              {activeTab === 'rme-jadwal' && (
                <DutyScheduleView
                  schedules={schedules}
                  staffList={effectiveStaffList}
                  onAddSchedule={handleAddSchedule}
                  onUpdateSchedule={handleUpdateSchedule}
                  onDeleteSchedule={handleDeleteSchedule}
                  onResetDefault={handleResetSchedules}
                  onSyncSupabase={handleSyncSchedulesSupabase}
                  needsTableSetup={schedulesNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  currentUserName={userName}
                  currentStaffId={currentStaff?.id}
                  currentBranchId={currentBranch.id}
                  onAuditLog={addAuditLog}
                />
              )}

              {activeTab === 'pos-kasir' && (
                <POSCashierView
                  medicines={medicines}
                  patients={patients}
                  doctors={effectiveDoctors}
                  mitraList={mitraList}
                  staffList={effectiveStaffList}
                  transactions={transactions}
                  onSaveTransaction={handleSaveTransaction}
                  activePrescription={activePrescriptionForPOS}
                  onClearActivePrescription={() => setActivePrescriptionForPOS(null)}
                  currentCashierName={userName}
                  activeRole={activeRole}
                  branchId={currentBranch.id}
                  feeConfig={feeConfig}
                  labRecords={labRecords}
                  cashierShifts={cashierShifts}
                  onOpenShift={handleOpenCashierShift}
                  onCloseShift={handleCloseCashierShift}
                  onApproveRejectShift={handleApproveRejectCashierShift}
                  onDeleteShift={handleDeleteCashierShift}
                  onClearShiftHistory={handleClearCashierShiftHistory}
                  onSyncShiftsSupabase={handleSyncCashierShiftsSupabase}
                  shiftsNeedsTableSetup={cashierShiftsNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  salesDiscounts={salesDiscounts}
                  prescriptions={prescriptions}
                  onSelectPrescriptionFromQueue={handleSelectPrescriptionForPOS}
                  onSyncPrescriptionsSupabase={handleSyncPrescriptionsSupabase}
                />
              )}

              {activeTab === 'pos-resep' && (
                <EPrescriptionQueueView
                  prescriptions={prescriptions}
                  rmeRecords={rmeRecords}
                  patients={patients}
                  medicines={medicines}
                  branchId={currentBranch.id}
                  onApproveToPOS={handleApprovePrescriptionToPOS}
                  onGoToPOSCashier={() => handleNavigateTab('pos-kasir')}
                  onRejectPrescription={handleRejectPrescription}
                  onSaveExternalPrescription={(newExternalRx) => {
                    setPrescriptions((prev) => {
                      const next = [newExternalRx, ...prev.filter((p) => p.id !== newExternalRx.id)];
                      persistPrescriptionsNow(next);
                      return next;
                    });
                    if (!isDemoActive && !isDemoMode()) {
                      markIdsPendingSync('prescriptions', [newExternalRx.id]);
                      syncPrescriptionToSupabase(newExternalRx)
                        .then((res) => {
                          if (res.success) confirmCloudSync('prescriptions', [newExternalRx.id]);
                        })
                        .catch((err) =>
                          console.warn('Supabase external prescription sync error:', err)
                        );
                    }
                    addAuditLog(
                      'Skrining Resep Luar',
                      `Simpan Resep Dokter Luar #${newExternalRx.id} — Pasien: ${newExternalRx.patientName}, Dokter: ${newExternalRx.doctorName} (${newExternalRx.items.length} item obat)`
                    );
                  }}
                  onSyncPrescriptionsFromSupabase={(list) => {
                    const deletedSet = getDeletedIdsSet('prescriptions');
                    const cleanList = list.filter(
                      (p) => p?.id && !deletedSet.has(String(p.id).trim())
                    );
                    setPrescriptions(cleanList);
                    persistPrescriptionsNow(cleanList);
                    addAuditLog(
                      'Skrining Resep',
                      `Sinkronisasi 2-arah Riwayat Skrining Resep dengan Supabase (${cleanList.length} data).`
                    );
                  }}
                  onSyncPrescriptionsSupabase={handleSyncPrescriptionsSupabase}
                  onDeletePrescriptionHistory={handleDeletePrescriptionHistory}
                />
              )}

              {activeTab === 'pos-mitra-orders' && (
                <MitraOrdersView
                  orders={mitraOrders}
                  medicines={medicines}
                  onUpdateStatus={handleUpdateMitraOrderStatus}
                  onValidatePayment={handleValidateMitraOrderPayment}
                  onConvertToPOS={handleConvertMitraOrderToPOS}
                  onDeleteOrder={handleDeleteMitraOrder}
                  onOpenPublicPortal={() => setShowMitraPortal(true)}
                  onNavigateToSalesHistory={() => handleNavigateTab('pos-riwayat')}
                  onRefreshSupabase={async () => {
                    if (!isDemoActive && !isDemoMode()) {
                      const pendingDeletes = getPendingDeleteIds('mitra_orders');
                      for (const delId of pendingDeletes) {
                        const dRes = await deleteMitraOrderFromSupabase(delId).catch(() => ({
                          success: false
                        }));
                        if (dRes.success) confirmCloudDeletes('mitra_orders', [delId]);
                      }
                    }
                    const res = await fetchMitraOrdersFromSupabase();
                    if (res.data) {
                      const deletedSet = getDeletedIdsSet('mitra_orders');
                      const pendingSyncSet = getPendingSyncIdsSet('mitra_orders');
                      const stubbornIds = res.data
                        .filter((o) => o.id && deletedSet.has(o.id))
                        .map((o) => o.id);
                      if (stubbornIds.length > 0 && !isDemoActive && !isDemoMode()) {
                        await Promise.all(
                          stubbornIds.map((sid) =>
                            deleteMitraOrderFromSupabase(sid)
                              .then((dRes) => {
                                if (dRes.success) confirmCloudDeletes('mitra_orders', [sid]);
                              })
                              .catch(() => {})
                          )
                        );
                      }
                      const remoteClean = res.data.filter((o) => o.id && !deletedSet.has(o.id));
                      const map = new Map<string, MitraOrder>();
                      remoteClean.forEach((o) => map.set(o.id, o));
                      mitraOrdersRef.current
                        .filter((o) => o.id && !deletedSet.has(o.id) && pendingSyncSet.has(o.id))
                        .forEach((o) => map.set(o.id, o));
                      const authoritative = Array.from(map.values()).sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                      );
                      setMitraOrders(authoritative);
                      persistMitraOrdersNow(authoritative);
                      return { success: true, count: authoritative.length };
                    }
                    return { success: false, error: res.error || 'Gagal memuat pesanan mitra dari Supabase' };
                  }}
                />
              )}

              {activeTab === 'pos-riwayat' && (
                <SalesHistoryView
                  transactions={transactions}
                  onUpdateTransaction={handleUpdateTransaction}
                  onAddTransaction={handleAddSalesInvoice}
                  medicines={medicines}
                  onRestockFromCancelOrReturn={handleRestockFromCancelOrReturn}
                  currentBranch={currentBranch}
                  userName={userName}
                  mitraList={mitraList}
                  activeRole={activeRole}
                  onDeleteTransactions={handleDeleteTransactions}
                  onSyncSupabase={handleSyncTransactionsSupabase}
                  needsTableSetup={transactionsNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  inspectTransactionId={inspectTransactionId}
                  onClearInspectTransaction={() => setInspectTransactionId(null)}
                />
              )}

              {/* Module 4: Inventaris & Logistik Pusat */}
              {activeTab === 'inv-master' && (
                <InventoryView
                  medicines={medicines}
                  activeRole={activeRole}
                  onSyncSupabase={handleSyncMedicinesSupabase}
                  needsTableSetup={medicinesNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  onAddMedicine={async (m, options) => {
                    const normalizedPreview = normalizeUniqueMedicines([m, ...medicinesRef.current]);
                    const finalMed = normalizedPreview.items[0] || m;
                    setMedicines((prev) => normalizeUniqueMedicines([m, ...prev]).items);
                    const res = await syncMedicineWithTracking(finalMed).catch((err) => {
                      console.warn('Supabase medicine add error:', err);
                      return { success: false, error: err?.message || String(err) };
                    });
                    addAuditLog('Master Obat', `Tambah obat baru ${finalMed.name} (${finalMed.id})`);

                    if (options?.recordInitialStock && finalMed.stock > 0) {
                      const now = new Date();
                      const initMutation: StockMutation = {
                        id: `MUT-INIT-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
                        date: now.toISOString().split('T')[0],
                        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                        medicineId: finalMed.id,
                        medicineName: finalMed.name,
                        refNo: `INIT-${finalMed.id}`,
                        type: 'STOK_AWAL',
                        inQty: finalMed.stock,
                        outQty: 0,
                        balance: finalMed.stock,
                        ket: 'Stok Awal',
                        petugas: userName,
                        branchId: currentBranch.id,
                        hpp: finalMed.hpp || 0,
                        batchNo: finalMed.batchNo || '-',
                        expDate: finalMed.expDate || '',
                        batchDetails: [
                          {
                            batchNo: finalMed.batchNo || '-',
                            expDate: finalMed.expDate || '',
                            qty: finalMed.stock
                          }
                        ]
                      };
                      setStockMutations((prev) => [initMutation, ...prev]);
                      if (!isDemoActive && !isDemoMode()) {
                        syncStockMutationToSupabase(initMutation)
                          .then((mutRes) => {
                            if (mutRes.needsTableSetup) setStockMutationsNeedsTableSetup(true);
                          })
                          .catch((err) => console.warn('Supabase stok awal mutation sync error:', err));
                      }
                    }
                    return res;
                  }}
                  onUpdateMedicine={async (m, options) => {
                    const prevMed = medicinesRef.current.find((item) => item.id === m.id);
                    const oldStock = Number(prevMed?.stock) || 0;
                    const newStock = Number(m.stock) || 0;
                    const stockDiff = newStock - oldStock;

                    setMedicines((prev) =>
                      prev.some((item) => item.id === m.id)
                        ? prev.map((item) => (item.id === m.id ? m : item))
                        : [m, ...prev]
                    );
                    const res = await updateMedicineWithTracking(m).catch((err) => {
                      console.warn('Supabase medicine update error:', err);
                      return { success: false, error: err?.message || String(err) };
                    });
                    addAuditLog('Master Obat', `Update master obat ${m.name} (${m.id})`);

                    if (options?.recordInitialStock && prevMed && stockDiff !== 0) {
                      const now = new Date();
                      const initMutation: StockMutation = {
                        id: `MUT-INIT-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
                        date: now.toISOString().split('T')[0],
                        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                        medicineId: m.id,
                        medicineName: m.name,
                        refNo: `INIT-${m.id}`,
                        type: 'STOK_AWAL',
                        inQty: stockDiff > 0 ? stockDiff : 0,
                        outQty: stockDiff < 0 ? Math.abs(stockDiff) : 0,
                        balance: newStock,
                        ket: stockDiff > 0 ? 'Stok Awal' : 'Stok Awal (Penyesuaian)',
                        petugas: userName,
                        branchId: currentBranch.id,
                        hpp: m.hpp || 0,
                        batchNo: m.batchNo || '-',
                        expDate: m.expDate || '',
                        batchDetails: [
                          {
                            batchNo: m.batchNo || '-',
                            expDate: m.expDate || '',
                            qty: Math.abs(stockDiff)
                          }
                        ]
                      };
                      setStockMutations((prev) => [initMutation, ...prev]);
                      if (!isDemoActive && !isDemoMode()) {
                        syncStockMutationToSupabase(initMutation)
                          .then((mutRes) => {
                            if (mutRes.needsTableSetup) setStockMutationsNeedsTableSetup(true);
                          })
                          .catch((err) => console.warn('Supabase stok awal update mutation sync error:', err));
                      }
                    }
                    return res;
                  }}
                  onDeleteMedicine={(id) => {
                    setMedicines((prev) => prev.filter((m) => m.id !== id));
                    deleteMedicineWithTracking(id).catch((err) =>
                      console.warn('Supabase medicine delete error:', err)
                    );
                    addAuditLog('Master Obat', `Hapus obat ID: ${id}`);
                  }}
                  onClearMedicines={() => {
                    const existingIds = medicinesRef.current.map((m) => m.id).filter(Boolean);
                    setMedicines([]);
                    demoRemoveItem('latisha_medicines');
                    if (!isDemoActive && !isDemoMode()) {
                      clearPendingMedicineOps();
                      try {
                        demoSetItem(MEDICINES_CLOUD_SYNCED_KEY, 'true');
                      } catch {}
                      clearMedicinesFromSupabase()
                        .then((res) => {
                          if (res.needsTableSetup) {
                            setMedicinesNeedsTableSetup(true);
                          } else if (!res.success && existingIds.length > 0) {
                            existingIds.forEach((id) => enqueueMedicineDelete(id));
                          }
                        })
                        .catch(() => {
                          existingIds.forEach((id) => enqueueMedicineDelete(id));
                        });
                    }
                    addAuditLog('Master Obat', 'Bersihkan seluruh data master obat & harga bertingkat');
                  }}
                />
              )}

              {activeTab === 'inv-kartu-stok' && (
                <StockCardView
                  medicines={medicines}
                  stockMutations={stockMutations}
                  transactions={transactions}
                  purchaseInvoices={purchaseInvoices}
                  opnameRecords={opnameRecords}
                  activeRole={activeRole}
                  onAddManualMutation={handleAddManualStockMutation}
                  onDeleteMutations={handleDeleteStockMutations}
                  onSyncSupabase={handleSyncStockMutationsSupabase}
                  needsTableSetup={stockMutationsNeedsTableSetup}
                  needsBatchColumnMigration={stockMutationsNeedsBatchMigration}
                  isDemoSandbox={isDemoActive}
                />
              )}

              {activeTab === 'inv-stok-opname' && (
                <StockOpnameView
                  medicines={medicines}
                  transactions={transactions}
                  currentBranch={currentBranch}
                  userName={userName}
                  staffList={effectiveStaffList}
                  onApplyStockOpname={handleApplyStockOpname}
                  opnameRecords={opnameRecords}
                  stockMutations={stockMutations}
                  onDeleteOpnameRecord={handleDeleteOpnameRecord}
                  onSyncSupabase={handleSyncOpnameRecordsSupabase}
                  needsTableSetup={opnameRecordsNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                />
              )}

              {activeTab === 'inv-pembelian' && (
                <PurchaseInvoiceView
                  invoices={purchaseInvoices}
                  medicines={medicines}
                  suppliers={suppliers}
                  onAddInvoice={handleAddPurchaseInvoice}
                  onUpdateInvoice={handleUpdatePurchaseInvoice}
                  onDeleteInvoice={handleDeletePurchaseInvoice}
                  onProcessReturn={handleProcessReturn}
                  onUpdateInvoiceStatus={(id, status) => {
                    setPurchaseInvoices((prev) =>
                      prev.map((i) => (i.id === id ? { ...i, status } : i))
                    );
                    addAuditLog('Faktur PBF', `Status faktur #${id} diubah menjadi ${status}`);
                  }}
                />
              )}

              {activeTab === 'inv-retur-riwayat' && (
                <PurchaseReturnHistoryView
                  returns={purchaseReturns}
                  invoices={purchaseInvoices}
                  userName={userName}
                  onDeleteReturn={handleDeletePurchaseReturn}
                  onProcessReturn={handleProcessReturn}
                  onUpdateReturn={handleUpdatePurchaseReturn}
                />
              )}

              {activeTab === 'inv-defecta' && (
                <DefectaView
                  medicines={medicines}
                  suppliers={suppliers}
                  purchaseOrders={purchaseOrders}
                  currentBranch={currentBranch}
                  userName={userName}
                  activeRole={activeRole}
                  onSavePurchaseOrder={handleSavePurchaseOrder}
                  onDeletePurchaseOrder={handleDeletePurchaseOrder}
                  onSyncSupabase={handleSyncPurchaseOrdersSupabase}
                  needsTableSetup={purchaseOrdersNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                />
              )}

              {/* Module 5: Keuangan & Akuntansi */}
              {activeTab === 'keuangan-labarugi' && (
                <FinancialReportsView
                  transactions={transactions}
                  medicines={medicines}
                  purchaseInvoices={purchaseInvoices}
                  rmeRecords={rmeRecords}
                  doctors={effectiveDoctors}
                  staffList={effectiveStaffList}
                  opnameRecords={opnameRecords}
                  stockMutations={stockMutations}
                  feeConfig={feeConfig}
                  schedules={schedules}
                  feeLedger={feeLedger}
                  initialTab="laba-rugi"
                />
              )}

              {activeTab === 'keuangan-hutang-piutang' && (
                <DebtReceivableView
                  purchaseInvoices={purchaseInvoices}
                  transactions={transactions}
                  onUpdatePurchaseInvoices={(updated) => {
                    setPurchaseInvoices(updated);
                    try {
                      demoSetItem('latisha_purchase_invoices', JSON.stringify(updated));
                    } catch (e) {}
                    if (!isDemoActive && !isDemoMode()) {
                      const prevMap = new Map(purchaseInvoices.map((inv) => [inv.id, inv]));
                      const changed = updated.filter((inv) => prevMap.get(inv.id) !== inv);
                      if (changed.length > 0) {
                        seedPurchaseInvoicesToSupabase(changed).catch((err) =>
                          console.warn('Supabase hutang PBF invoice update error:', err)
                        );
                      }
                    }
                  }}
                  onUpdateTransactions={(updated) => {
                    const prevMap = new Map(transactionsRef.current.map((t) => [t.id, t]));
                    setTransactions(updated);
                    persistTransactionsNow(updated);
                    if (!isDemoActive && !isDemoMode()) {
                      const changed = updated.filter((t) => prevMap.get(t.id) !== t);
                      if (changed.length > 0) {
                        const changedIds = changed.map((t) => t.id);
                        markIdsPendingSync('transactions', changedIds);
                        seedTransactionsToSupabase(changed)
                          .then((res) => {
                            if (res.success) confirmCloudSync('transactions', changedIds);
                          })
                          .catch((err) =>
                            console.warn('Supabase piutang transaction update error:', err)
                          );
                      }
                    }
                  }}
                  userName={userName}
                  onAddAuditLog={addAuditLog}
                  isDemoSandbox={isDemoActive}
                />
              )}

              {activeTab === 'keuangan-setting' && (
                <FeeSettingsView
                  feeConfig={feeConfig}
                  staffList={effectiveStaffList}
                  rolePermissions={rolePermissions}
                  onSaveFeeConfig={handleSaveFeeConfig}
                  onSyncSupabase={handleSyncFeeConfigSupabase}
                  needsTableSetup={feeConfigNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  feeLedger={feeLedger}
                  transactions={transactions}
                  onUpdateFeeLedgerStatus={handleUpdateFeeLedgerStatus}
                  onSyncFeeLedgerSupabase={handleSyncFeeLedgerSupabase}
                  ledgerNeedsTableSetup={feeLedgerNeedsTableSetup}
                  currentUserName={userName}
                />
              )}

              {activeTab === 'keuangan-pph' && (
                <TaxEstimationView
                  transactions={transactions}
                  staffList={effectiveStaffList}
                  branches={branches}
                  feeConfig={feeConfig}
                  schedules={schedules}
                  feeLedger={feeLedger}
                  currentBranch={currentBranch.id}
                  userName={userName}
                  isDemoSandbox={isDemoActive}
                  onUpdateStaff={(updated) => {
                    setStaffList((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                    syncStaffToSupabase(updated);
                    addAuditLog(
                      'Estimasi PPh (WP OP)',
                      `Update profil pajak petugas ${updated.name} (PTKP ${updated.ptkpStatus || 'TK/0'})`
                    );
                  }}
                  onAddAuditLog={addAuditLog}
                />
              )}

              {/* Module 6: Sistem & Multi-Cabang */}
              {activeTab === 'sys-cabang' && (
                <BranchSyncView
                  branches={branches}
                  currentBranch={currentBranch}
                  onSelectBranch={setCurrentBranch}
                  medicines={medicines}
                  transfers={transfers}
                  onAddTransfer={handleAddTransfer}
                  onDeleteTransfer={handleDeleteTransfer}
                  onSyncAllBranches={handleSyncNow}
                  isSyncing={isSyncing}
                  onExportBackup={handleExportBackup}
                  onAddBranch={handleAddBranch}
                  onUpdateBranch={handleUpdateBranch}
                  onDeleteBranch={handleDeleteBranch}
                  staffList={effectiveStaffList}
                  userName={userName}
                  isDemoSandbox={isDemoActive}
                  needsTableSetup={multiCabangNeedsTableSetup}
                />
              )}

              {activeTab === 'sys-satusehat' && (
                <SatuSehatView
                  patients={patients}
                  isDemoSandbox={isDemoActive}
                  onPatientIhsUpdated={(patId, ihs) => {
                    setPatients((prev) =>
                      prev.map((item) =>
                        item.dbId === patId || item.id === patId
                          ? {
                              ...item,
                              ihsNumber: ihs,
                              syncSatusehat: 'sent',
                              satusehatSyncedAt: new Date().toISOString()
                            }
                          : item
                      )
                    );
                  }}
                />
              )}

              {activeTab === 'sys-audit' && (
                <AuditTrailView logs={auditLogs} />
              )}

              {activeTab === 'sys-marketing' && (
                <MarketingStrategyView
                  transactions={transactions}
                  medicines={medicines}
                  patients={patients}
                  mitraList={mitraList}
                  mitraOrders={mitraOrders}
                  rmeRecords={rmeRecords}
                  salesDiscounts={salesDiscounts}
                  promoAds={promoAds}
                  purchaseOrders={purchaseOrders}
                  branches={branches}
                  currentBranch={currentBranch}
                  suppliers={suppliers}
                  interactionRules={marketingInteractionRules}
                  marketingCampaigns={marketingCampaigns}
                  portalActivityLogs={portalActivityLogs}
                  needsTableSetup={marketingNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  userName={userName}
                  onSaveCampaign={handleSaveMarketingCampaign}
                  onDeleteCampaign={handleDeleteMarketingCampaign}
                  onSyncCampaignsSupabase={handleSyncMarketingCampaignsSupabase}
                  onSaveDiscount={handleSaveDiscount}
                  onSavePromo={handleSavePromo}
                  onSavePurchaseOrder={handleSavePurchaseOrder}
                  onNavigateTab={handleNavigateTab}
                  onOpenMitraPortal={() => setShowMitraPortal(true)}
                />
              )}

              {/* Module 7: Setup */}
              {activeTab === 'setup-mitra' && (
                <SetupMitraView
                  mitraList={mitraList}
                  onAddMitra={handleAddMitra}
                  onUpdateMitra={handleUpdateMitra}
                  onDeleteMitra={handleDeleteMitra}
                  onSyncSupabase={handleSyncMitraSupabase}
                  isDemoSandbox={isDemoActive}
                />
              )}

              {activeTab === 'setup-supplier' && (
                <SetupSupplierView
                  suppliers={suppliers}
                  onAddSupplier={handleAddSupplier}
                  onUpdateSupplier={handleUpdateSupplier}
                  onDeleteSupplier={handleDeleteSupplier}
                  onSyncSupabase={handleSyncSuppliersSupabase}
                  needsTableSetup={suppliersNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                />
              )}

              {activeTab === 'setup-diskon-promo' && (
                <DiscountPromoView
                  discounts={salesDiscounts}
                  promos={promoAds}
                  medicines={medicines}
                  onSaveDiscount={handleSaveDiscount}
                  onDeleteDiscount={handleDeleteDiscount}
                  onToggleDiscountActive={handleToggleDiscountActive}
                  onSavePromo={handleSavePromo}
                  onDeletePromo={handleDeletePromo}
                  onTogglePromoActive={handleTogglePromoActive}
                  onSyncSupabase={handleSyncPromoDiscountSupabase}
                  needsTableSetup={promoDiscountNeedsTableSetup}
                  isDemoSandbox={isDemoActive}
                  onOpenPortalPreview={() => setShowMitraPortal(true)}
                />
              )}

              {activeTab === 'setup-database' && (
                <DatabaseBackupView
                  onDatabaseRestored={() => window.location.reload()}
                  currentUserName={userName}
                  onAuditLog={addAuditLog}
                />
              )}
            </>
          )}
          </Suspense>
          </div>
        </main>
      </div>

      {/* Pharmacy & APJ Settings Modal (Accessible via Header Settings Icon - APJ / Owner Only) */}
      {isSettingsModalOpen && (
        <Suspense fallback={null}>
          <PharmacySettingsModal
            isOpen={isSettingsModalOpen}
        initialTab={settingsInitialTab}
        onClose={() => setIsSettingsModalOpen(false)}
        activeRole={activeRole}
        userName={userName}
        activeStaffId={currentStaff?.id}
        staffList={staffList}
        branches={branches}
        rolePermissions={rolePermissions}
        onUpdateRolePermissions={(updated, changedMeta) => {
          const normalizedMap = saveRolePermissionsLocally(updated);
          setRolePermissions(normalizedMap);

          if (changedMeta) {
            const { nextStaffList, updatedStaffMembers } = reconcileStaffPermissionsWithRoleChange(
              staffList,
              normalizedMap,
              changedMeta
            );
            if (updatedStaffMembers.length > 0) {
              saveStaffListLocally(nextStaffList);
              setStaffList(nextStaffList);
              if (!isDemoActive && !isDemoMode()) {
                updatedStaffMembers.forEach((st) => {
                  void syncStaffToSupabase(st);
                });
              }
            }
          }

          if (!isDemoActive && !isDemoMode() && getSupabaseClient()) {
            void syncFacilityProfilesToSupabase({
              pharmacy: getSavedPharmacyProfile(),
              apj: getSavedAPJProfile(),
              dpj: getSavedDPJProfile(),
              rolePermissions: normalizedMap
            });
          }

          addAuditLog(
            'Hak Akses',
            changedMeta
              ? `Checkbox hak akses modul "${changedMeta.permId}" untuk peran ${changedMeta.role} ${changedMeta.enabled ? 'diaktifkan' : 'dinonaktifkan'} & disinkronkan ke pegawai.`
              : 'Konfigurasi checkbox hak akses peran diperbarui oleh APJ / Owner.'
          );
        }}
        onAddStaff={(s) => {
          markIdsPendingSync('staff', [s.id]);
          setStaffList((prev) => {
            const nextList = [...prev, s];
            saveStaffListLocally(nextList);
            return nextList;
          });
          if (!isDemoActive && !isDemoMode()) {
            syncStaffToSupabase(s)
              .then((res) => {
                if (res.success) confirmCloudSync('staff', [s.id]);
              })
              .catch(() => {});
          } else {
            confirmCloudSync('staff', [s.id]);
          }
          addAuditLog('Pegawai', `Registrasi staf baru ${s.name} (${s.role})`);
        }}
        onUpdateStaff={(updated) => {
          const prevRecord = staffList.find((s) => s.id === updated.id);
          const becameActive =
            prevRecord?.status === 'Menunggu Validasi' && updated.status === 'Aktif';
          const enriched: Staff = becameActive
            ? {
                ...updated,
                validatedAt: updated.validatedAt || new Date().toISOString(),
                validatedBy: updated.validatedBy || userName || 'APJ / Owner'
              }
            : updated;
          markIdsPendingSync('staff', [enriched.id]);
          setStaffList((prev) => {
            const nextList = prev.map((s) => (s.id === enriched.id ? enriched : s));
            saveStaffListLocally(nextList);
            return nextList;
          });
          if (!isDemoActive && !isDemoMode()) {
            syncStaffToSupabase(enriched)
              .then((res) => {
                if (res.success) confirmCloudSync('staff', [enriched.id]);
              })
              .catch(() => {});
          } else {
            confirmCloudSync('staff', [enriched.id]);
          }
          if (
            becameActive &&
            getStaffActiveRoles(enriched, enriched.role).includes('Dokter') &&
            enriched.isDpj === true
          ) {
            void syncDoctorStaffToDpjProfile(enriched, rolePermissions);
          }
          addAuditLog(
            becameActive ? 'Validasi Pegawai' : 'Pegawai',
            becameActive
              ? `APJ / Owner memvalidasi & mengaktifkan akun pegawai ${enriched.name} (${enriched.id}, Role: ${enriched.role})`
              : `Update peran & hak akses staf ${enriched.name} (${enriched.role})`
          );
        }}
        onValidateStaff={(st) => {
          void handleValidateStaffAccount(st);
        }}
        onRejectStaff={(st) => {
          void handleRejectPendingStaff(st);
        }}
        onDeleteStaff={(id) => {
          const cleanId = String(id || '').trim();
          if (!cleanId) return;
          markIdsDeleted('staff', [cleanId]);
          setStaffList((prev) => {
            const nextList = prev.filter((s) => s.id !== cleanId);
            saveStaffListLocally(nextList);
            return nextList;
          });
          if (!isDemoActive && !isDemoMode()) {
            deleteStaffFromSupabase(cleanId)
              .then((res) => {
                if (res.success) confirmCloudDeletes('staff', [cleanId]);
              })
              .catch(() => {});
          } else {
            confirmCloudDeletes('staff', [cleanId]);
          }
          addAuditLog('Pegawai', `Hapus staf ID: ${cleanId}`);
        }}
        onSyncStaffFromSupabase={(newStaffs) => {
          saveStaffListLocally(newStaffs);
          setStaffList(newStaffs);
          addAuditLog('Pegawai', `Sinkronisasi manual data pegawai dengan Supabase (${newStaffs.length} pegawai)`);
        }}
        onProfileUpdate={() => {
          // Sync Pharmacy, APJ, and DPJ updates to active system states immediately
          try {
            const parsedPharm = getSavedPharmacyProfile();
            if (parsedPharm.name) {
              const formattedAddr = formatPharmacyAddress(parsedPharm);
              setBranches((prev) =>
                prev.map((b, idx) =>
                  idx === 0
                    ? {
                        ...b,
                        name: parsedPharm.name,
                        address: formattedAddr,
                        phone: parsedPharm.phone,
                        siaNumber: parsedPharm.sia
                      }
                    : b
                )
              );
              setCurrentBranch((prev) => ({
                ...prev,
                name: parsedPharm.name,
                address: formattedAddr,
                phone: parsedPharm.phone,
                siaNumber: parsedPharm.sia
              }));
            }
            const savedApj = demoGetItem('latisha_apj_profile');
            if (savedApj) {
              const parsed = JSON.parse(savedApj);
              if (parsed.name) {
                setStaffList((prev) =>
                  prev.map((s) => (s.id === 'STF-001' ? { ...s, name: parsed.name, phone: parsed.phone || s.phone } : s))
                );
                if (currentStaff?.id === 'STF-001') {
                  setUserName(parsed.name);
                }
              }
            }
            const savedDpj = demoGetItem('latisha_dpj_profile');
            if (savedDpj) {
              const parsedDpj = JSON.parse(savedDpj);
              if (parsedDpj.name) {
                setDoctors((prev) =>
                  prev.map((doc, idx) =>
                    idx === 0
                      ? {
                          ...doc,
                          name: parsedDpj.name,
                          sip: parsedDpj.sip || doc.sip,
                          specialization: parsedDpj.specialization || doc.specialization,
                          schedule: parsedDpj.schedule || doc.schedule
                        }
                      : doc
                  )
                );
                setStaffList((prev) =>
                  prev.map((s) =>
                    s.isDpj === true && getStaffActiveRoles(s, s.role).includes('Dokter')
                      ? {
                          ...s,
                          name: parsedDpj.name,
                          phone: parsedDpj.phone || s.phone,
                          ...(parsedDpj.sip ? { sipNumber: parsedDpj.sip } : {}),
                          ...(parsedDpj.idi ? { estrNumber: parsedDpj.idi } : {})
                        }
                      : s
                  )
                );
                if (
                  currentStaff?.isDpj === true &&
                  getStaffActiveRoles(currentStaff, currentStaff.role).includes('Dokter')
                ) {
                  setUserName(parsedDpj.name);
                }
              }
            }
          } catch (e) {}
        }}
          />
        </Suspense>
      )}
      {/* Interactive Floating Customer / Patient Service Chat Widget */}
      <Suspense fallback={null}>
        <PatientServiceChatWidget
          currentBranch={currentBranch}
          medicines={medicines}
          doctors={effectiveDoctors}
          schedules={schedules}
          feeConfig={feeConfig}
          promoAds={promoAds}
          salesDiscounts={salesDiscounts}
          queue={queue}
          staffName={userName}
          onNavigateTab={handleNavigateTab}
          onOpenPatientPortal={() => setShowPublicPortal(true)}
        />
      </Suspense>
    </div>
    </RoleAccessProvider>
  );
}
