import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Patient, OnlineRegistration, ICD10Item, Staff, StaffRole, StaffStatus, PtkpStatus, StaffTaxCategory, normalizeStaffRole, ensurePrimaryOwnerStaffRole, RMERecord, VitalSign, PrescriptionItem, StaffFeeItem, DutySchedule, Medicine, Mitra, MitraOrder, MitraOrderItem, MitraOrderStatus, MitraPaymentStatus, DrugInteractionRecord, DrugInteractionSeverity, PharmacyProfile, PharmacyBankAccount, APJProfile, DPJProfile, EPrescription, MedicalMorbidityReportRecord, MorbidityTopDiagnosis, Transaction, CartItem, StockMutation, LabTestRecord, LabTestItem, StockOpnameRecord, StockOpnameItemRecord, StockOpnameKind, LiveOpnameItemActivity, Supplier, Branch, StockTransfer, PurchaseInvoice, PurchaseItem, PurchaseOrder, PurchaseOrderItem, SPGroupType, SPPrintLogEntry, DebtPaymentRecord, ReceivablePaymentRecord, CashFlowRecord, SalesDiscount, PromoAd, FeeConfig, TariffItem, DEFAULT_FEE_CONFIG, PayrollOvertimeConfig, DEFAULT_PAYROLL_OVERTIME_CONFIG, MarketingCampaign, MarketingStrategyType, MarketingCampaignStatus, ServiceFeeRole, ServiceFeeType, ServiceFeeRecipientRule, StaffFeeLedgerEntry, StaffFeeLedgerPaymentStatus, WpOpTaxConfig, WpOpTaxScheme, TaxScopeMode, PphMonthlySnapshot, PphAuditEntry, Pph21StaffBreakdown } from '../types';
import { INITIAL_ICD10_LIST, INITIAL_STAFF, INITIAL_DUTY_SCHEDULES, INITIAL_MEDICINES } from '../data/initialData';
import { resolveGenericDrugName } from '../data/drugInteractions';
import { isDemoMode, demoGetItem, demoSetItem } from './demoSandbox';
import { getDeletedIdsSet, getPendingSyncIdsSet } from './deletionRegistry';
import { normalizeServiceFeeRole, normalizeServiceFeeType } from './serviceFeeHelper';
import { getSavedRolePermissions, normalizeRolePermissionsMap, generateNextStaffId } from './staffRegistrationHelper';

import { CashierShiftSession, CashDenominationItem, CASH_DENOMINATIONS_LIST } from '../types';

export const SUPABASE_STORAGE_KEYS = {
  URL: 'latisha_supabase_url',
  KEY: 'latisha_supabase_key',
  PATIENT_TABLE: 'latisha_supabase_patient_table',
  ONLINE_REG_TABLE: 'latisha_supabase_table',
  ICD10_TABLE: 'latisha_supabase_icd10_table',
  STAFF_TABLE: 'latisha_supabase_staff_table',
  RME_TABLE: 'latisha_supabase_rme_table',
  MORBIDITY_REPORT_TABLE: 'latisha_supabase_morbidity_report_table',
  SCHEDULE_TABLE: 'latisha_supabase_schedule_table',
  MEDICINE_TABLE: 'latisha_supabase_medicine_table',
  MITRA_TABLE: 'latisha_supabase_mitra_table',
  MITRA_ORDER_TABLE: 'latisha_supabase_mitra_order_table',
  INTERAKSI_OBAT_TABLE: 'latisha_supabase_interaksi_obat_table',
  FACILITY_PROFILE_TABLE: 'latisha_supabase_facility_profile_table',
  PRESCRIPTION_TABLE: 'latisha_supabase_prescription_table',
  SALES_TABLE: 'latisha_supabase_sales_table',
  STOCK_CARD_TABLE: 'latisha_supabase_stock_card_table',
  LAB_TEST_TABLE: 'latisha_supabase_lab_test_table',
  OPNAME_TABLE: 'latisha_supabase_opname_table',
  SUPPLIER_TABLE: 'latisha_supabase_supplier_table',
  BRANCH_TABLE: 'latisha_supabase_branch_table',
  BRANCH_TRANSFER_TABLE: 'latisha_supabase_branch_transfer_table',
  CASHIER_SHIFT_TABLE: 'latisha_supabase_cashier_shift_table',
  PURCHASE_INVOICE_TABLE: 'latisha_supabase_purchase_invoice_table',
  DEBT_PAYMENT_TABLE: 'latisha_supabase_debt_payment_table',
  RECEIVABLE_PAYMENT_TABLE: 'latisha_supabase_receivable_payment_table',
  CASH_FLOW_TABLE: 'latisha_supabase_cash_flow_table',
  PROMO_DISCOUNT_TABLE: 'latisha_supabase_promo_discount_table',
  FEE_CONFIG_TABLE: 'latisha_supabase_fee_config_table',
  FEE_LEDGER_TABLE: 'latisha_supabase_fee_ledger_table',
  PURCHASE_ORDER_TABLE: 'latisha_supabase_purchase_order_table',
  MARKETING_TABLE: 'latisha_supabase_marketing_table',
  PPH_CONFIG_TABLE: 'latisha_supabase_pph_config_table',
  PPH_SNAPSHOT_TABLE: 'latisha_supabase_pph_snapshot_table',
  PPH_AUDIT_TABLE: 'latisha_supabase_pph_audit_table'
};

export const DEFAULT_SUPABASE_URL = 'https://aolhizbzrggatxizvenj.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_-UprGGbf8Q05TuCZzRfPhA_q0eWamkW';
export const DEFAULT_PATIENT_TABLE = 'pasien';
export const DEFAULT_ONLINE_REG_TABLE = 'pendaftaran_online';
export const DEFAULT_ICD10_TABLE = 'icd10';
export const DEFAULT_STAFF_TABLE = 'pegawai';
export const DEFAULT_RME_TABLE = 'medical_records';
export const DEFAULT_MORBIDITY_REPORT_TABLE = 'laporan_morbiditas';
export const DEFAULT_SCHEDULE_TABLE = 'schedules';
export const DEFAULT_MEDICINE_TABLE = 'master_obat';
export const DEFAULT_MITRA_TABLE = 'mitra';
export const DEFAULT_MITRA_ORDER_TABLE = 'pesanan_mitra';
export const DEFAULT_INTERAKSI_OBAT_TABLE = 'interaksi_obat';
export const DEFAULT_FACILITY_PROFILE_TABLE = 'profil_fasilitas';
export const DEFAULT_FACILITY_PROFILE_ROW_ID = 'MAIN-FACILITY';
export const DEFAULT_PRESCRIPTION_TABLE = 'riwayat_skrining_resep';
export const DEFAULT_SALES_TABLE = 'riwayat_penjualan';
export const DEFAULT_STOCK_CARD_TABLE = 'kartu_stok';
export const DEFAULT_LAB_TEST_TABLE = 'cek_lab';
export const DEFAULT_OPNAME_TABLE = 'riwayat_opname';
export const DEFAULT_SUPPLIER_TABLE = 'supplier';
export const DEFAULT_BRANCH_TABLE = 'cabang';
export const DEFAULT_BRANCH_TRANSFER_TABLE = 'transfer_stok_cabang';
export const DEFAULT_CASHIER_SHIFT_TABLE = 'riwayat_shift_kasir';
export const DEFAULT_PURCHASE_INVOICE_TABLE = 'faktur_pembelian';
export const DEFAULT_DEBT_PAYMENT_TABLE = 'pembayaran_hutang';
export const DEFAULT_RECEIVABLE_PAYMENT_TABLE = 'pelunasan_piutang';
export const DEFAULT_CASH_FLOW_TABLE = 'buku_kas_mutasi';
export const DEFAULT_PROMO_DISCOUNT_TABLE = 'promo_diskon';
export const DEFAULT_FEE_CONFIG_TABLE = 'pengaturan_tarif_jasa';
export const DEFAULT_FEE_CONFIG_ROW_ID = 'MAIN-FEE-CONFIG';
export const DEFAULT_FEE_LEDGER_TABLE = 'log_fee_petugas';
export const DEFAULT_PURCHASE_ORDER_TABLE = 'surat_pesanan';
export const DEFAULT_MARKETING_TABLE = 'strategi_marketing';
export const DEFAULT_PPH_CONFIG_TABLE = 'pph_wpop_config';
export const DEFAULT_PPH_CONFIG_ROW_ID = 'MAIN-WPOP-TAX-CONFIG';
export const DEFAULT_PPH_SNAPSHOT_TABLE = 'pph_wpop_snapshots';
export const DEFAULT_PPH_AUDIT_TABLE = 'pph_wpop_audit';

export interface SupabaseConfig {
  url: string;
  key: string;
  patientTable: string;
  onlineRegTable: string;
  icd10Table: string;
  staffTable: string;
  rmeTable: string;
  morbidityReportTable: string;
  scheduleTable: string;
  medicineTable: string;
  mitraTable: string;
  mitraOrderTable: string;
  interaksiObatTable: string;
  facilityProfileTable: string;
  prescriptionTable: string;
  salesTable: string;
  stockCardTable: string;
  labTestTable: string;
  opnameTable: string;
  supplierTable: string;
  branchTable: string;
  branchTransferTable: string;
  cashierShiftTable: string;
  purchaseInvoiceTable: string;
  debtPaymentTable: string;
  receivablePaymentTable: string;
  cashFlowTable: string;
  promoDiscountTable: string;
  feeConfigTable: string;
  feeLedgerTable: string;
  purchaseOrderTable: string;
  marketingTable: string;
  pphConfigTable: string;
  pphSnapshotTable: string;
  pphAuditTable: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  if (typeof window === 'undefined') {
    return {
      url: DEFAULT_SUPABASE_URL,
      key: DEFAULT_SUPABASE_KEY,
      patientTable: DEFAULT_PATIENT_TABLE,
      onlineRegTable: DEFAULT_ONLINE_REG_TABLE,
      icd10Table: DEFAULT_ICD10_TABLE,
      staffTable: DEFAULT_STAFF_TABLE,
      rmeTable: DEFAULT_RME_TABLE,
      morbidityReportTable: DEFAULT_MORBIDITY_REPORT_TABLE,
      scheduleTable: DEFAULT_SCHEDULE_TABLE,
      medicineTable: DEFAULT_MEDICINE_TABLE,
      mitraTable: DEFAULT_MITRA_TABLE,
      mitraOrderTable: DEFAULT_MITRA_ORDER_TABLE,
      interaksiObatTable: DEFAULT_INTERAKSI_OBAT_TABLE,
      facilityProfileTable: DEFAULT_FACILITY_PROFILE_TABLE,
      prescriptionTable: DEFAULT_PRESCRIPTION_TABLE,
      salesTable: DEFAULT_SALES_TABLE,
      stockCardTable: DEFAULT_STOCK_CARD_TABLE,
      labTestTable: DEFAULT_LAB_TEST_TABLE,
      opnameTable: DEFAULT_OPNAME_TABLE,
      supplierTable: DEFAULT_SUPPLIER_TABLE,
      branchTable: DEFAULT_BRANCH_TABLE,
      branchTransferTable: DEFAULT_BRANCH_TRANSFER_TABLE,
      cashierShiftTable: DEFAULT_CASHIER_SHIFT_TABLE,
      purchaseInvoiceTable: DEFAULT_PURCHASE_INVOICE_TABLE,
      debtPaymentTable: DEFAULT_DEBT_PAYMENT_TABLE,
      receivablePaymentTable: DEFAULT_RECEIVABLE_PAYMENT_TABLE,
      cashFlowTable: DEFAULT_CASH_FLOW_TABLE,
      promoDiscountTable: DEFAULT_PROMO_DISCOUNT_TABLE,
      feeConfigTable: DEFAULT_FEE_CONFIG_TABLE,
      feeLedgerTable: DEFAULT_FEE_LEDGER_TABLE,
      purchaseOrderTable: DEFAULT_PURCHASE_ORDER_TABLE,
      marketingTable: DEFAULT_MARKETING_TABLE,
      pphConfigTable: DEFAULT_PPH_CONFIG_TABLE,
      pphSnapshotTable: DEFAULT_PPH_SNAPSHOT_TABLE,
      pphAuditTable: DEFAULT_PPH_AUDIT_TABLE
    };
  }
  const storedUrl = localStorage.getItem(SUPABASE_STORAGE_KEYS.URL)?.trim();
  const storedKey = localStorage.getItem(SUPABASE_STORAGE_KEYS.KEY)?.trim();
  const storedPatientTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PATIENT_TABLE)?.trim();
  const storedOnlineRegTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.ONLINE_REG_TABLE)?.trim();
  const storedIcd10Table = localStorage.getItem(SUPABASE_STORAGE_KEYS.ICD10_TABLE)?.trim();
  const storedStaffTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.STAFF_TABLE)?.trim();
  const storedRmeTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.RME_TABLE)?.trim();
  const storedMorbidityReportTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.MORBIDITY_REPORT_TABLE)?.trim();
  const storedScheduleTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.SCHEDULE_TABLE)?.trim();
  const storedMedicineTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.MEDICINE_TABLE)?.trim();
  const storedMitraTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.MITRA_TABLE)?.trim();
  const storedMitraOrderTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.MITRA_ORDER_TABLE)?.trim();
  const storedInteraksiObatTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.INTERAKSI_OBAT_TABLE)?.trim();
  const storedFacilityProfileTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.FACILITY_PROFILE_TABLE)?.trim();
  const storedPrescriptionTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PRESCRIPTION_TABLE)?.trim();
  const storedSalesTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.SALES_TABLE)?.trim();
  const storedStockCardTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.STOCK_CARD_TABLE)?.trim();
  const storedLabTestTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.LAB_TEST_TABLE)?.trim();
  const storedOpnameTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.OPNAME_TABLE)?.trim();
  const storedSupplierTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.SUPPLIER_TABLE)?.trim();
  const storedBranchTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.BRANCH_TABLE)?.trim();
  const storedBranchTransferTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.BRANCH_TRANSFER_TABLE)?.trim();
  const storedCashierShiftTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.CASHIER_SHIFT_TABLE)?.trim();
  const storedPurchaseInvoiceTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PURCHASE_INVOICE_TABLE)?.trim();
  const storedDebtPaymentTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.DEBT_PAYMENT_TABLE)?.trim();
  const storedReceivablePaymentTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.RECEIVABLE_PAYMENT_TABLE)?.trim();
  const storedCashFlowTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.CASH_FLOW_TABLE)?.trim();
  const storedPromoDiscountTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PROMO_DISCOUNT_TABLE)?.trim();
  const storedFeeConfigTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.FEE_CONFIG_TABLE)?.trim();
  const storedFeeLedgerTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.FEE_LEDGER_TABLE)?.trim();
  const storedPurchaseOrderTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PURCHASE_ORDER_TABLE)?.trim();
  const storedMarketingTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.MARKETING_TABLE)?.trim();
  const storedPphConfigTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PPH_CONFIG_TABLE)?.trim();
  const storedPphSnapshotTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PPH_SNAPSHOT_TABLE)?.trim();
  const storedPphAuditTable = localStorage.getItem(SUPABASE_STORAGE_KEYS.PPH_AUDIT_TABLE)?.trim();

  return {
    url: storedUrl || DEFAULT_SUPABASE_URL,
    key: storedKey || DEFAULT_SUPABASE_KEY,
    patientTable: storedPatientTable || DEFAULT_PATIENT_TABLE,
    onlineRegTable: storedOnlineRegTable || DEFAULT_ONLINE_REG_TABLE,
    icd10Table: storedIcd10Table || DEFAULT_ICD10_TABLE,
    staffTable: storedStaffTable || DEFAULT_STAFF_TABLE,
    rmeTable: storedRmeTable || DEFAULT_RME_TABLE,
    morbidityReportTable: storedMorbidityReportTable || DEFAULT_MORBIDITY_REPORT_TABLE,
    scheduleTable: storedScheduleTable || DEFAULT_SCHEDULE_TABLE,
    medicineTable: storedMedicineTable || DEFAULT_MEDICINE_TABLE,
    mitraTable: storedMitraTable || DEFAULT_MITRA_TABLE,
    mitraOrderTable: storedMitraOrderTable || DEFAULT_MITRA_ORDER_TABLE,
    interaksiObatTable: storedInteraksiObatTable || DEFAULT_INTERAKSI_OBAT_TABLE,
    facilityProfileTable: storedFacilityProfileTable || DEFAULT_FACILITY_PROFILE_TABLE,
    prescriptionTable: storedPrescriptionTable || DEFAULT_PRESCRIPTION_TABLE,
    salesTable: storedSalesTable || DEFAULT_SALES_TABLE,
    stockCardTable: storedStockCardTable || DEFAULT_STOCK_CARD_TABLE,
    labTestTable: storedLabTestTable || DEFAULT_LAB_TEST_TABLE,
    opnameTable: storedOpnameTable || DEFAULT_OPNAME_TABLE,
    supplierTable: storedSupplierTable || DEFAULT_SUPPLIER_TABLE,
    branchTable: storedBranchTable || DEFAULT_BRANCH_TABLE,
    branchTransferTable: storedBranchTransferTable || DEFAULT_BRANCH_TRANSFER_TABLE,
    cashierShiftTable: storedCashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE,
    purchaseInvoiceTable: storedPurchaseInvoiceTable || DEFAULT_PURCHASE_INVOICE_TABLE,
    debtPaymentTable: storedDebtPaymentTable || DEFAULT_DEBT_PAYMENT_TABLE,
    receivablePaymentTable: storedReceivablePaymentTable || DEFAULT_RECEIVABLE_PAYMENT_TABLE,
    cashFlowTable: storedCashFlowTable || DEFAULT_CASH_FLOW_TABLE,
    promoDiscountTable: storedPromoDiscountTable || DEFAULT_PROMO_DISCOUNT_TABLE,
    feeConfigTable: storedFeeConfigTable || DEFAULT_FEE_CONFIG_TABLE,
    feeLedgerTable: storedFeeLedgerTable || DEFAULT_FEE_LEDGER_TABLE,
    purchaseOrderTable: storedPurchaseOrderTable || DEFAULT_PURCHASE_ORDER_TABLE,
    marketingTable: storedMarketingTable || DEFAULT_MARKETING_TABLE,
    pphConfigTable: storedPphConfigTable || DEFAULT_PPH_CONFIG_TABLE,
    pphSnapshotTable: storedPphSnapshotTable || DEFAULT_PPH_SNAPSHOT_TABLE,
    pphAuditTable: storedPphAuditTable || DEFAULT_PPH_AUDIT_TABLE
  };
}

export function setSupabaseConfig(cfg: Partial<SupabaseConfig>): void {
  if (typeof window === 'undefined' || isDemoMode()) return;
  if (cfg.url !== undefined) localStorage.setItem(SUPABASE_STORAGE_KEYS.URL, cfg.url.trim());
  if (cfg.key !== undefined) localStorage.setItem(SUPABASE_STORAGE_KEYS.KEY, cfg.key.trim());
  if (cfg.patientTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.PATIENT_TABLE, cfg.patientTable.trim() || DEFAULT_PATIENT_TABLE);
  }
  if (cfg.onlineRegTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.ONLINE_REG_TABLE, cfg.onlineRegTable.trim() || DEFAULT_ONLINE_REG_TABLE);
  }
  if (cfg.icd10Table !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.ICD10_TABLE, cfg.icd10Table.trim() || DEFAULT_ICD10_TABLE);
  }
  if (cfg.staffTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.STAFF_TABLE, cfg.staffTable.trim() || DEFAULT_STAFF_TABLE);
  }
  if (cfg.rmeTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.RME_TABLE, cfg.rmeTable.trim() || DEFAULT_RME_TABLE);
  }
  if (cfg.morbidityReportTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.MORBIDITY_REPORT_TABLE, cfg.morbidityReportTable.trim() || DEFAULT_MORBIDITY_REPORT_TABLE);
  }
  if (cfg.scheduleTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.SCHEDULE_TABLE, cfg.scheduleTable.trim() || DEFAULT_SCHEDULE_TABLE);
  }
  if (cfg.medicineTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.MEDICINE_TABLE, cfg.medicineTable.trim() || DEFAULT_MEDICINE_TABLE);
  }
  if (cfg.mitraTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.MITRA_TABLE, cfg.mitraTable.trim() || DEFAULT_MITRA_TABLE);
  }
  if (cfg.mitraOrderTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.MITRA_ORDER_TABLE, cfg.mitraOrderTable.trim() || DEFAULT_MITRA_ORDER_TABLE);
  }
  if (cfg.interaksiObatTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.INTERAKSI_OBAT_TABLE, cfg.interaksiObatTable.trim() || DEFAULT_INTERAKSI_OBAT_TABLE);
  }
  if (cfg.facilityProfileTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.FACILITY_PROFILE_TABLE, cfg.facilityProfileTable.trim() || DEFAULT_FACILITY_PROFILE_TABLE);
  }
  if (cfg.prescriptionTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.PRESCRIPTION_TABLE, cfg.prescriptionTable.trim() || DEFAULT_PRESCRIPTION_TABLE);
  }
  if (cfg.salesTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.SALES_TABLE, cfg.salesTable.trim() || DEFAULT_SALES_TABLE);
  }
  if (cfg.stockCardTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.STOCK_CARD_TABLE, cfg.stockCardTable.trim() || DEFAULT_STOCK_CARD_TABLE);
  }
  if (cfg.labTestTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.LAB_TEST_TABLE, cfg.labTestTable.trim() || DEFAULT_LAB_TEST_TABLE);
  }
  if (cfg.opnameTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.OPNAME_TABLE, cfg.opnameTable.trim() || DEFAULT_OPNAME_TABLE);
  }
  if (cfg.supplierTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.SUPPLIER_TABLE, cfg.supplierTable.trim() || DEFAULT_SUPPLIER_TABLE);
  }
  if (cfg.branchTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.BRANCH_TABLE, cfg.branchTable.trim() || DEFAULT_BRANCH_TABLE);
  }
  if (cfg.branchTransferTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.BRANCH_TRANSFER_TABLE, cfg.branchTransferTable.trim() || DEFAULT_BRANCH_TRANSFER_TABLE);
  }
  if (cfg.cashierShiftTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.CASHIER_SHIFT_TABLE, cfg.cashierShiftTable.trim() || DEFAULT_CASHIER_SHIFT_TABLE);
  }
  if (cfg.purchaseInvoiceTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.PURCHASE_INVOICE_TABLE, cfg.purchaseInvoiceTable.trim() || DEFAULT_PURCHASE_INVOICE_TABLE);
  }
  if (cfg.debtPaymentTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.DEBT_PAYMENT_TABLE, cfg.debtPaymentTable.trim() || DEFAULT_DEBT_PAYMENT_TABLE);
  }
  if (cfg.receivablePaymentTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.RECEIVABLE_PAYMENT_TABLE, cfg.receivablePaymentTable.trim() || DEFAULT_RECEIVABLE_PAYMENT_TABLE);
  }
  if (cfg.cashFlowTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.CASH_FLOW_TABLE, cfg.cashFlowTable.trim() || DEFAULT_CASH_FLOW_TABLE);
  }
  if (cfg.promoDiscountTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.PROMO_DISCOUNT_TABLE, cfg.promoDiscountTable.trim() || DEFAULT_PROMO_DISCOUNT_TABLE);
  }
  if (cfg.feeConfigTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.FEE_CONFIG_TABLE, cfg.feeConfigTable.trim() || DEFAULT_FEE_CONFIG_TABLE);
  }
  if (cfg.feeLedgerTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.FEE_LEDGER_TABLE, cfg.feeLedgerTable.trim() || DEFAULT_FEE_LEDGER_TABLE);
  }
  if (cfg.purchaseOrderTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.PURCHASE_ORDER_TABLE, cfg.purchaseOrderTable.trim() || DEFAULT_PURCHASE_ORDER_TABLE);
  }
  if (cfg.marketingTable !== undefined) {
    localStorage.setItem(SUPABASE_STORAGE_KEYS.MARKETING_TABLE, cfg.marketingTable.trim() || DEFAULT_MARKETING_TABLE);
  }
  // Reset cached instance
  cachedClient = null;
  clearSupabaseTableSchemaCache();
}

let cachedClient: SupabaseClient | null = null;
let currentClientKey = '';
const cachedExposedTables = new Map<string, Set<string>>();
const pendingSchemaProbes = new Map<string, Promise<Set<string> | null>>();
const missingTablesInSession = new Set<string>();
const openapiProbeUnsupportedKeys = new Set<string>();

export function clearSupabaseTableSchemaCache(): void {
  cachedExposedTables.clear();
  pendingSchemaProbes.clear();
  missingTablesInSession.clear();
  openapiProbeUnsupportedKeys.clear();
}

export async function isSupabaseTableAvailable(
  tableName: string,
  forceRefresh = false
): Promise<boolean | null> {
  if (isDemoMode() || !tableName) return false;
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.key) return false;

  const cleanTable = tableName.trim();
  const keyId = `${cfg.url.replace(/\/+$/, '')}:::${cfg.key}`;

  if (forceRefresh) {
    cachedExposedTables.delete(keyId);
    pendingSchemaProbes.delete(keyId);
    missingTablesInSession.delete(cleanTable);
  } else {
    if (missingTablesInSession.has(cleanTable)) return false;
    const cached = cachedExposedTables.get(keyId);
    if (cached) {
      return cached.has(cleanTable);
    }
  }

  // Supabase publishable keys (sb_publishable_...) intentionally disallow OpenAPI root discovery
  // on GET /rest/v1/ (returning 401 "Secret API key required"), while table endpoints work normally.
  // Only perform OpenAPI root discovery for legacy JWT anon keys (eyJ...).
  const isJwtKey = cfg.key.startsWith('eyJ');
  if (!isJwtKey || openapiProbeUnsupportedKeys.has(keyId)) {
    return null;
  }

  try {
    let probePromise = pendingSchemaProbes.get(keyId);
    if (!probePromise) {
      probePromise = (async () => {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 5000) : undefined;
        try {
          const baseUrl = cfg.url.replace(/\/+$/, '');
          const res = await fetch(`${baseUrl}/rest/v1/`, {
            method: 'GET',
            headers: {
              apikey: cfg.key,
              Authorization: `Bearer ${cfg.key}`,
              Accept: 'application/openapi+json, application/json'
            },
            signal: controller?.signal
          });
          if (res.status === 401 || res.status === 403) {
            openapiProbeUnsupportedKeys.add(keyId);
            return null;
          }
          if (!res.ok) return null;
          const spec = await res.json();
          const tables = new Set<string>();
          if (spec && typeof spec === 'object') {
            if (spec.paths && typeof spec.paths === 'object') {
              for (const p of Object.keys(spec.paths)) {
                const name = p.replace(/^\/+/, '').trim();
                if (name && !name.startsWith('rpc/')) tables.add(name);
              }
            }
            if (spec.definitions && typeof spec.definitions === 'object') {
              for (const d of Object.keys(spec.definitions)) {
                if (d.trim()) tables.add(d.trim());
              }
            }
          }
          if (tables.size === 0) return null;
          cachedExposedTables.set(keyId, tables);
          return tables;
        } catch {
          return null;
        } finally {
          if (timer) clearTimeout(timer);
          pendingSchemaProbes.delete(keyId);
        }
      })();
      pendingSchemaProbes.set(keyId, probePromise);
    }

    const tables = await probePromise;
    if (!tables) return null;
    const exists = tables.has(cleanTable);
    if (!exists) {
      missingTablesInSession.add(cleanTable);
    }
    return exists;
  } catch {
    return null;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  // Absolute Sandbox Isolation: never connect to or mutate production Supabase in Demo Mode
  if (isDemoMode()) {
    return null;
  }

  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.key) {
    return null;
  }

  const keyIdentifier = `${cfg.url}:::${cfg.key}`;
  if (cachedClient && currentClientKey === keyIdentifier) {
    return cachedClient;
  }

  try {
    const client = createClient(cfg.url, cfg.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    cachedClient = client;
    currentClientKey = keyIdentifier;
    return cachedClient;
  } catch (err) {
    console.warn('[Supabase] Gagal inisialisasi client:', err);
    return null;
  }
}

// Convert from local Patient to Supabase row format for table `pasien`
export function patientToSupabaseRow(p: Patient): Record<string, any> {
  const primaryId = p.dbId || p.id;
  const noRm = p.noRm || p.id || primaryId;
  const row: Record<string, any> = {
    id: primaryId,
    no_rm: noRm,
    nik: p.nik || '',
    nama_lengkap: p.name || '',
    jenis_kelamin: p.gender || 'Laki-laki',
    tanggal_lahir: p.birthDate || null,
    kategori: p.category || 'Pasien Praktik',
    kontak: p.phone || '',
    alamat: p.address || '',
    flag_alergi: p.allergy || 'Tidak Ada',
    bpjs_no: p.bpjsNo || '',
    registered_online: Boolean(p.registeredOnline),
    updated_at: new Date().toISOString()
  };
  if (p.ihsNumber !== undefined) row.ihs_number = p.ihsNumber || null;
  if (p.syncSatusehat !== undefined) row.sync_satusehat = p.syncSatusehat;
  if (p.satusehatSyncedAt !== undefined) row.satusehat_synced_at = p.satusehatSyncedAt || null;
  return row;
}

function stripOptionalSatusehatPatientCols(fields: Record<string, any>): Record<string, any> {
  const copy = { ...fields };
  delete copy.ihs_number;
  delete copy.sync_satusehat;
  delete copy.satusehat_synced_at;
  return copy;
}

function isMissingSatusehatPatientColError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return (
    msg.includes('ihs_number') ||
    msg.includes('sync_satusehat') ||
    msg.includes('satusehat_synced_at')
  );
}

// Convert from Supabase row to local Patient format (handles column name variations)
export function supabaseRowToPatient(row: Record<string, any>): Patient {
  const currentYear = new Date().getFullYear();
  const birthDateStr = row.tanggal_lahir || row.tgl_lahir || row.birth_date || row.birthdate || '';
  let calculatedAge = 0;
  if (birthDateStr) {
    const bYear = new Date(birthDateStr).getFullYear();
    if (!isNaN(bYear)) {
      calculatedAge = Math.max(0, currentYear - bYear);
    }
  }

  const rawDbId =
    row.id !== null && row.id !== undefined && String(row.id) !== ''
      ? String(row.id)
      : '';
  const rawNoRm = row.no_rm || row.norm || row.no_rekam_medis || '';
  const cleanNoRm = rawNoRm ? String(rawNoRm) : '';
  const rmId = cleanNoRm || rawDbId || `RM-${Date.now().toString().slice(-4)}`;
  const genderRaw = (row.jenis_kelamin || row.gender || row.jk || '').toString().toLowerCase();
  const isFemale = genderRaw.includes('p') || genderRaw.includes('fem');

  return {
    id: rmId,
    dbId: rawDbId || rmId,
    noRm: cleanNoRm || rmId,
    nik: row.nik || '',
    name: row.nama_lengkap || row.nama || row.name || 'Tanpa Nama',
    age: row.age || calculatedAge,
    gender: isFemale ? 'Perempuan' : 'Laki-laki',
    birthDate: birthDateStr,
    phone: row.kontak || row.phone || row.no_hp || row.no_telepon || row.hp || row.whatsapp || '',
    address: row.alamat || row.address || '',
    allergy: row.flag_alergi || row.allergy || row.alergi || 'Tidak Ada',
    category: (row.kategori || row.category as Patient['category']) || 'Pasien Praktik',
    bpjsNo: row.bpjs_no || row.bpjsNo || row.no_bpjs || row.bpjs || '',
    registeredOnline: Boolean(row.registered_online || row.registeredOnline || row.online),
    registrationDate: row.created_at
      ? (row.created_at.includes('T') ? row.created_at.split('T')[0] : row.created_at)
      : new Date().toISOString().split('T')[0],
    ihsNumber: row.ihs_number ? String(row.ihs_number) : undefined,
    syncSatusehat: (row.sync_satusehat as Patient['syncSatusehat']) || undefined,
    satusehatSyncedAt: row.satusehat_synced_at ? String(row.satusehat_synced_at) : undefined
  };
}

// Outbound: Upsert (Insert/Update) patient to Supabase
export async function syncPatientToSupabase(patient: Patient): Promise<{ success: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { patientTable } = getSupabaseConfig();
  const row = patientToSupabaseRow(patient);

  try {
    let { error } = await client
      .from(patientTable)
      .upsert(row, { onConflict: 'id' });

    if (error && isMissingSatusehatPatientColError(error)) {
      const retry = await client
        .from(patientTable)
        .upsert(stripOptionalSatusehatPatientCols(row), { onConflict: 'id' });
      error = retry.error;
    }

    if (error) {
      console.warn('[Supabase Outbound Error]:', error.message);
      return { success: false, error: error.message };
    }
    console.info(`[Supabase Outbound Success] Pasien ${patient.name} (${row.id}) tersinkronisasi.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Outbound Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export function isSamePatientRecord(a: Patient, b: Patient): boolean {
  const aDb = (a.dbId || '').trim();
  const bDb = (b.dbId || '').trim();
  if (aDb && bDb) {
    if (aDb === bDb) return true;
    const aId = (a.id || '').trim();
    const bId = (b.id || '').trim();
    const aRm = (a.noRm || '').trim();
    const bRm = (b.noRm || '').trim();
    // If one record fell back dbId = noRm/id (e.g., locally synthesized without real PK) while the other has real dbId + matching noRm/id
    const aHasDistinctDbId = Boolean(aDb && (aDb !== aRm || aDb !== aId));
    const bHasDistinctDbId = Boolean(bDb && (bDb !== bRm || bDb !== bId));
    if (aHasDistinctDbId && bHasDistinctDbId) {
      return false;
    }
  }
  const aKeys = new Set(
    [aDb, (a.id || '').trim(), (a.noRm || '').trim()].filter(Boolean)
  );
  const bKeys = [bDb, (b.id || '').trim(), (b.noRm || '').trim()].filter(Boolean);
  return bKeys.some((k) => aKeys.has(k));
}

function mergePatientPair(existing: Patient, incoming: Patient): Patient {
  const incomingHasDistinctDbId =
    Boolean(incoming.dbId) && incoming.dbId !== (incoming.noRm || incoming.id);
  const existingHasDistinctDbId =
    Boolean(existing.dbId) && existing.dbId !== (existing.noRm || existing.id);
  const resolvedDbId = incomingHasDistinctDbId
    ? incoming.dbId
    : existingHasDistinctDbId
    ? existing.dbId
    : incoming.dbId || existing.dbId || incoming.id || existing.id;
  const resolvedNoRm = incoming.noRm || existing.noRm || incoming.id || existing.id;
  return {
    ...existing,
    ...incoming,
    id: resolvedNoRm || incoming.id || existing.id,
    dbId: resolvedDbId,
    noRm: resolvedNoRm
  };
}

export function deduplicatePatients(list: Patient[]): Patient[] {
  const result: Patient[] = [];
  const dbIdToIdx = new Map<string, number>();
  const keyToIdx = new Map<string, number>();

  const getDistinctDbId = (p: Patient): string => {
    const db = (p.dbId || '').trim();
    const id = (p.id || '').trim();
    const rm = (p.noRm || '').trim();
    return db && (db !== rm || db !== id) ? db : '';
  };

  for (const item of list) {
    if (!item) continue;
    const db = (item.dbId || '').trim();
    const id = (item.id || '').trim();
    const rm = (item.noRm || '').trim();
    const distinctDb = getDistinctDbId(item);

    let matchedIdx: number | undefined;
    if (db && dbIdToIdx.has(db)) {
      matchedIdx = dbIdToIdx.get(db);
    }
    if (matchedIdx === undefined) {
      const candidateKeys = [db, id, rm].filter(Boolean);
      for (const k of candidateKeys) {
        const idx = keyToIdx.get(k);
        if (idx !== undefined) {
          const existing = result[idx];
          const existingDistinctDb = getDistinctDbId(existing);
          // Only match on secondary keys if at least one doesn't have an explicit conflicting distinct dbId
          if (!distinctDb || !existingDistinctDb || distinctDb === existingDistinctDb) {
            matchedIdx = idx;
            break;
          }
        }
      }
    }

    if (matchedIdx === undefined) {
      const newIdx = result.length;
      result.push(item);
      if (db) dbIdToIdx.set(db, newIdx);
      if (id) keyToIdx.set(id, newIdx);
      if (rm) keyToIdx.set(rm, newIdx);
      if (db) keyToIdx.set(db, newIdx);
    } else {
      const merged = mergePatientPair(result[matchedIdx], item);
      result[matchedIdx] = merged;
      const mDb = (merged.dbId || '').trim();
      const mId = (merged.id || '').trim();
      const mRm = (merged.noRm || '').trim();
      if (mDb) {
        dbIdToIdx.set(mDb, matchedIdx);
        keyToIdx.set(mDb, matchedIdx);
      }
      if (mId) keyToIdx.set(mId, matchedIdx);
      if (mRm) keyToIdx.set(mRm, matchedIdx);
    }
  }
  return result;
}

export function mergePatientLists(localList: Patient[], remoteList: Patient[]): Patient[] {
  return deduplicatePatients([...localList, ...remoteList]);
}

// Outbound: Strict in-place UPDATE for editing existing patient row (prevents inserting duplicate rows when id != no_rm)
export async function updatePatientInSupabase(patient: Patient): Promise<{ success: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { patientTable } = getSupabaseConfig();
  const row = patientToSupabaseRow(patient);
  const targetId = row.id;
  const { id: _omitId, ...updateFields } = row;

  try {
    let activeFields = updateFields;
    let { data, error } = await client
      .from(patientTable)
      .update(activeFields)
      .eq('id', targetId)
      .select('id');

    if (error && isMissingSatusehatPatientColError(error)) {
      activeFields = stripOptionalSatusehatPatientCols(updateFields);
      const retry = await client
        .from(patientTable)
        .update(activeFields)
        .eq('id', targetId)
        .select('id');
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('[Supabase Update Patient Error]:', error.message);
      return { success: false, error: error.message };
    }

    if (data && data.length > 0) {
      console.info(`[Supabase Update Patient Success] Pasien ${patient.name} (ID DB: ${targetId}) diperbarui in-place.`);
      return { success: true };
    }

    // Lookup existing row across candidate ID / No. RM keys BEFORE ever falling back to insert/upsert
    const candidates = Array.from(
      new Set(
        [targetId, patient.dbId, patient.noRm, patient.id]
          .map((v) => (v || '').trim())
          .filter(Boolean)
      )
    );

    if (candidates.length > 0) {
      const orClauses = candidates.flatMap((c) => {
        const escaped = c.replace(/[,()]/g, '');
        return [`id.eq.${escaped}`, `no_rm.eq.${escaped}`];
      });
      const { data: matchedRows, error: lookupError } = await client
        .from(patientTable)
        .select('id, no_rm')
        .or(orClauses.join(','))
        .limit(1);

      if (lookupError) {
        console.warn('[Supabase Update Patient Lookup Error]:', lookupError.message);
        return { success: false, error: lookupError.message };
      }

      if (matchedRows && matchedRows.length > 0) {
        const realDbId = String(matchedRows[0].id);
        let { error: retryErr } = await client
          .from(patientTable)
          .update(activeFields)
          .eq('id', realDbId);

        if (retryErr && isMissingSatusehatPatientColError(retryErr)) {
          const secondTry = await client
            .from(patientTable)
            .update(stripOptionalSatusehatPatientCols(activeFields))
            .eq('id', realDbId);
          retryErr = secondTry.error;
        }

        if (retryErr) {
          console.warn('[Supabase Update Patient Retry Error]:', retryErr.message);
          return { success: false, error: retryErr.message };
        }
        console.info(`[Supabase Update Patient Success] Pasien ${patient.name} (ID DB: ${realDbId}) diperbarui in-place.`);
        return { success: true };
      }
    }

    // Only insert if lookup confirmed zero matching rows exist in Supabase
    return await syncPatientToSupabase(patient);
  } catch (err: any) {
    console.warn('[Supabase Update Patient Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Outbound: Delete patient from Supabase
export async function deletePatientFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { patientTable } = getSupabaseConfig();
  try {
    const { error } = await client
      .from(patientTable)
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('[Supabase Delete Error]:', error.message);
      return { success: false, error: error.message };
    }
    console.info(`[Supabase Delete Success] Pasien ID ${id} dihapus dari Supabase.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Delete Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export interface PaginatedQueryResult<T> {
  data: T[] | null;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  needsTableSetup?: boolean;
  error?: string;
}

function sanitizePostgrestSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[(),%\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPatientTableMissingError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('404')
  );
}

// Inbound (Server-Side Pagination & Search): Fetch paginated `pasien` rows with .range() & .ilike()
export async function fetchPatientsPaginatedFromSupabase(params: {
  page: number;
  pageSize: number;
  searchQuery?: string;
  categoryFilter?: string;
}): Promise<PaginatedQueryResult<Patient>> {
  const safePage = Math.max(1, Math.floor(params.page || 1));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 25)));

  if (isDemoMode()) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: 'Mode Demo aktif (isolasi sandbox)'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: 'Klien Supabase belum dikonfigurasi'
    };
  }

  const { patientTable } = getSupabaseConfig();
  const tableName = patientTable || 'pasien';
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const rawQuery = (params.searchQuery || '').trim();
  const extractedToken = rawQuery.includes(' - ') ? rawQuery.split(' - ')[0].trim() : rawQuery;
  const cleanSearch = sanitizePostgrestSearchTerm(extractedToken);
  const altRmCompact = cleanSearch.replace(/^RM[\s-]+/i, 'RM');
  const altRmHyphen = /^RM\d+/i.test(cleanSearch)
    ? cleanSearch.replace(/^RM/i, 'RM-')
    : cleanSearch;

  try {
    let query = client.from(tableName).select('*', { count: 'exact' });

    if (params.categoryFilter && params.categoryFilter !== 'SEMUA') {
      query = query.eq('kategori', params.categoryFilter);
    }

    if (cleanSearch) {
      const orClauses = [
        `nama_lengkap.ilike.%${cleanSearch}%`,
        `nik.ilike.%${cleanSearch}%`,
        `no_rm.ilike.%${cleanSearch}%`,
        `id.ilike.%${cleanSearch}%`,
        `kontak.ilike.%${cleanSearch}%`,
        `alamat.ilike.%${cleanSearch}%`
      ];
      if (altRmCompact && altRmCompact.toLowerCase() !== cleanSearch.toLowerCase()) {
        orClauses.push(`no_rm.ilike.%${altRmCompact}%`, `id.ilike.%${altRmCompact}%`);
      }
      if (altRmHyphen && altRmHyphen.toLowerCase() !== cleanSearch.toLowerCase()) {
        orClauses.push(`no_rm.ilike.%${altRmHyphen}%`, `id.ilike.%${altRmHyphen}%`);
      }
      query = query.or(orClauses.join(','));
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      if (isPatientTableMissingError(error)) {
        return {
          data: null,
          totalCount: 0,
          page: safePage,
          pageSize: safePageSize,
          totalPages: 1,
          needsTableSetup: true,
          error: `Tabel ${tableName} belum dibuat di Supabase.`
        };
      }
      console.warn('[Supabase Fetch Paginated Patients Error]:', error.message);
      return {
        data: null,
        totalCount: 0,
        page: safePage,
        pageSize: safePageSize,
        totalPages: 1,
        error: error.message
      };
    }

    const totalCount = typeof count === 'number' ? count : (data?.length ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    const patients: Patient[] = (data || []).map(supabaseRowToPatient);

    return {
      data: patients,
      totalCount,
      page: safePage,
      pageSize: safePageSize,
      totalPages
    };
  } catch (err: any) {
    console.warn('[Supabase Fetch Paginated Patients Exception]:', err);
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: err?.message || String(err)
    };
  }
}

// Inbound: Fetch bounded recent patients from Supabase (never unbounded SELECT * on 5000+ rows)
export async function fetchPatientsFromSupabase(options?: {
  limit?: number;
}): Promise<{ data: Patient[] | null; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { patientTable } = getSupabaseConfig();
  const safeLimit = Math.min(500, Math.max(1, options?.limit ?? 200));
  try {
    const { data, error } = await client
      .from(patientTable)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      console.warn('[Supabase Fetch Patients Error]:', error.message);
      return { data: null, error: error.message };
    }

    const patients: Patient[] = (data || []).map(supabaseRowToPatient);
    return { data: patients };
  } catch (err: any) {
    console.warn('[Supabase Fetch Patients Exception]:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

// Lightweight exact row count for `pasien` (HEAD request, zero payload)
export async function fetchPatientsTotalCountFromSupabase(): Promise<{
  count: number | null;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { count: null, error: 'Mode Demo aktif (isolasi sandbox)' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { count: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { patientTable } = getSupabaseConfig();
  const tableName = patientTable || 'pasien';
  try {
    const { count, error } = await client
      .from(tableName)
      .select('id', { count: 'exact', head: true });

    if (error) {
      if (isPatientTableMissingError(error)) {
        return {
          count: null,
          needsTableSetup: true,
          error: `Tabel ${tableName} belum dibuat di Supabase.`
        };
      }
      return { count: null, error: error.message };
    }

    return { count: typeof count === 'number' ? count : 0 };
  } catch (err: any) {
    return { count: null, error: err?.message || String(err) };
  }
}

// On-demand chunked export of all patients from Supabase (for Database Backup JSON export only)
export async function fetchAllPatientsFromSupabase(options?: {
  onProgress?: (loadedCount: number) => void;
}): Promise<{
  data: Patient[] | null;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { data: null, error: 'Mode Demo aktif (isolasi sandbox)' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { patientTable } = getSupabaseConfig();
  const tableName = patientTable || 'pasien';
  const chunkSize = 1000;
  let offset = 0;
  let keepFetching = true;
  const collected: Patient[] = [];

  try {
    while (keepFetching) {
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + chunkSize - 1);

      if (error) {
        if (isPatientTableMissingError(error)) {
          return {
            data: null,
            needsTableSetup: true,
            error: `Tabel ${tableName} belum dibuat di Supabase.`
          };
        }
        return { data: null, error: error.message };
      }

      const rows = data || [];
      for (const r of rows) {
        collected.push(supabaseRowToPatient(r));
      }

      options?.onProgress?.(collected.length);

      if (rows.length < chunkSize) {
        keepFetching = false;
      } else {
        offset += chunkSize;
        // Yield briefly to keep UI responsive during large multi-thousand row exports
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return { data: deduplicatePatients(collected) };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

// Chunked batch upsert for Database Backup JSON restore into `pasien`
export async function upsertPatientsBatchToSupabase(
  patients: Patient[],
  options?: {
    onProgress?: (syncedCount: number, totalCount: number) => void;
  }
): Promise<{ success: boolean; count: number; error?: string }> {
  if (isDemoMode()) {
    return { success: false, count: 0, error: 'Mode Demo aktif (isolasi sandbox)' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  }
  if (!Array.isArray(patients) || patients.length === 0) {
    return { success: true, count: 0 };
  }

  const { patientTable } = getSupabaseConfig();
  const tableName = patientTable || 'pasien';
  const deduped = deduplicatePatients(patients);
  const totalCount = deduped.length;
  const chunkSize = 200;
  let syncedCount = 0;

  try {
    for (let i = 0; i < deduped.length; i += chunkSize) {
      const batchRows = deduped.slice(i, i + chunkSize).map(patientToSupabaseRow);
      let { error } = await client.from(tableName).upsert(batchRows, { onConflict: 'id' });

      if (error && isMissingSatusehatPatientColError(error)) {
        const strippedRows = batchRows.map(stripOptionalSatusehatPatientCols);
        const retry = await client.from(tableName).upsert(strippedRows, { onConflict: 'id' });
        error = retry.error;
      }

      if (error) {
        return { success: false, count: syncedCount, error: error.message };
      }
      syncedCount += batchRows.length;
      options?.onProgress?.(syncedCount, totalCount);

      if (i + chunkSize < deduped.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return { success: true, count: syncedCount };
  } catch (err: any) {
    return { success: false, count: syncedCount, error: err?.message || String(err) };
  }
}

// Two-way Real-time Inbound Subscription for Pasien
export function subscribePatientsRealtime(
  onInsert: (patient: Patient) => void,
  onUpdate: (patient: Patient) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { patientTable } = getSupabaseConfig();
  const channelName = `realtime_${patientTable}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: patientTable },
        (payload) => {
          console.info('[Supabase Real-time Pasien INSERT]:', payload.new);
          if (payload.new) {
            const newPat = supabaseRowToPatient(payload.new);
            onInsert(newPat);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: patientTable },
        (payload) => {
          console.info('[Supabase Real-time Pasien UPDATE]:', payload.new);
          if (payload.new) {
            const updatedPat = supabaseRowToPatient(payload.new);
            onUpdate(updatedPat);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: patientTable },
        (payload) => {
          console.info('[Supabase Real-time Pasien DELETE]:', payload.old);
          if (payload.old && payload.old.id) {
            onDelete(payload.old.id);
          }
        }
      )
      .subscribe((status) => {
        console.info(`[Supabase Channel Status Pasien] ${channelName}: ${status}`);
      });

    return channel;
  } catch (err) {
    console.warn('[Supabase Real-time Subscription Error]:', err);
    return null;
  }
}

// Convert from local OnlineRegistration to Supabase row format for table `pendaftaran_online`
export function onlineRegToSupabaseRow(reg: OnlineRegistration): Record<string, any> {
  const row: Record<string, any> = {
    id: reg.id || reg.bookingCode,
    booking_code: reg.bookingCode,
    queue_number: reg.bookingCode ? `A-${reg.bookingCode.slice(-3)}` : 'A-001',
    nik: reg.nik || '',
    name: reg.name || '',
    phone: reg.phone || '',
    birth_date: reg.birthDate || null,
    gender: reg.gender || 'Laki-laki',
    address: reg.address || '',
    appointment_date: reg.appointmentDate || new Date().toISOString().split('T')[0],
    appointment_session: reg.appointmentTime || '08:30',
    service_type: reg.serviceType || 'Poli Umum',
    complaint: reg.complaint || '',
    allergy: reg.allergy || 'Tidak Ada',
    status: reg.status || 'Menunggu Verifikasi',
    updated_at: new Date().toISOString()
  };
  return row;
}

// Convert from Supabase row to local OnlineRegistration format
export function supabaseRowToOnlineReg(row: Record<string, any>): OnlineRegistration {
  const bCode = row.booking_code || row.bookingCode || row.id || `LTF-${Date.now().toString().slice(-6)}`;
  return {
    id: row.id || row.booking_code || `REG-${Date.now().toString().slice(-6)}`,
    bookingCode: bCode,
    nik: row.nik || '',
    name: row.name || row.nama_lengkap || row.nama || 'Tanpa Nama',
    phone: row.phone || row.kontak || row.no_hp || row.whatsapp || '',
    birthDate: row.birth_date || row.tanggal_lahir || '',
    gender: (row.gender || row.jenis_kelamin || '').toString().toLowerCase().includes('p') ? 'Perempuan' : 'Laki-laki',
    address: row.address || row.alamat || '',
    appointmentDate: row.appointment_date || row.tanggal_kunjungan || new Date().toISOString().split('T')[0],
    appointmentTime: row.appointment_session || row.appointment_time || row.appointmentTime || '08:30',
    doctorId: row.doctor_id || row.doctorId || 'DOC-001',
    doctorName: row.doctor_name || row.doctorName || 'dr. Anis Prima Dewi',
    serviceType: row.service_type || row.serviceType || 'Poli Umum',
    paymentType: (row.payment_type || row.paymentType as any) || 'Umum / Mandiri',
    complaint: row.complaint || row.keluhan || '-',
    allergy: row.allergy || row.flag_alergi || 'Tidak Ada',
    status: (row.status as OnlineRegistration['status']) || 'Menunggu Verifikasi',
    createdAt: row.created_at
      ? (row.created_at.includes('T') ? row.created_at.split('T')[1].slice(0, 5) : row.created_at)
      : new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    branchId: row.branch_id || row.branchId || 'BR-01'
  };
}

// Outbound: Sync (Upsert) Online Registration to Supabase
export async function syncOnlineRegistrationToSupabase(reg: OnlineRegistration): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { onlineRegTable } = getSupabaseConfig();
  const row = onlineRegToSupabaseRow(reg);

  try {
    // 1. Coba update terlebih dahulu berdasarkan id atau booking_code
    const { data: updateData, error: updateError } = await client
      .from(onlineRegTable)
      .update({
        status: reg.status,
        updated_at: new Date().toISOString()
      })
      .or(`id.eq.${reg.id},booking_code.eq.${reg.bookingCode}`)
      .select();

    if (!updateError && updateData && updateData.length > 0) {
      console.info(`[Supabase Online Reg Update Success] Booking #${reg.bookingCode} status diperbarui ke '${reg.status}'.`);
      return { success: true };
    }

    // 2. Jika row belum ada, lakukan upsert penuh
    const { error: upsertError } = await client
      .from(onlineRegTable)
      .upsert(row, { onConflict: 'id' });

    if (upsertError) {
      console.warn('[Supabase Online Reg Upsert Error]:', upsertError.message);
      return { success: false, error: upsertError.message };
    }

    console.info(`[Supabase Online Reg Outbound Success] Booking #${reg.bookingCode} (${reg.status}) tersinkronisasi.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Online Reg Outbound Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Inbound: Fetch all Online Registrations from Supabase
export async function fetchOnlineRegistrationsFromSupabase(): Promise<{ data: OnlineRegistration[] | null; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { onlineRegTable } = getSupabaseConfig();
  try {
    const { data, error } = await client
      .from(onlineRegTable)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase Online Reg Fetch Error]:', error.message);
      return { data: null, error: error.message };
    }

    const regs: OnlineRegistration[] = (data || []).map(supabaseRowToOnlineReg);
    return { data: regs };
  } catch (err: any) {
    console.warn('[Supabase Online Reg Fetch Exception]:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

// Real-time Inbound Subscription for Pendaftaran Online
export function subscribeOnlineRegistrationsRealtime(
  onInsert: (reg: OnlineRegistration) => void,
  onUpdate: (reg: OnlineRegistration) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { onlineRegTable } = getSupabaseConfig();
  const channelName = `realtime_${onlineRegTable}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: onlineRegTable },
        (payload) => {
          console.info('[Supabase Real-time Online Reg INSERT]:', payload.new);
          if (payload.new) {
            const newReg = supabaseRowToOnlineReg(payload.new);
            onInsert(newReg);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: onlineRegTable },
        (payload) => {
          console.info('[Supabase Real-time Online Reg UPDATE]:', payload.new);
          if (payload.new) {
            const updatedReg = supabaseRowToOnlineReg(payload.new);
            onUpdate(updatedReg);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: onlineRegTable },
        (payload) => {
          console.info('[Supabase Real-time Online Reg DELETE]:', payload.old);
          if (payload.old && payload.old.id) {
            onDelete(payload.old.id);
          }
        }
      )
      .subscribe((status) => {
        console.info(`[Supabase Channel Status Online Reg] ${channelName}: ${status}`);
      });

    return channel;
  } catch (err) {
    console.warn('[Supabase Online Reg Subscription Error]:', err);
    return null;
  }
}

// Query patient(s) from Supabase Master Pasien by NIK, No. RM, ID, or general keyword (Nama/No.RM/NIK/HP)
export async function checkPatientInSupabase(
  identifier: { nik?: string; no_rm?: string; query?: string }
): Promise<{
  exists: boolean;
  patient: Patient | null;
  matches?: Patient[];
  totalCount?: number;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { exists: false, patient: null, matches: [], totalCount: 0, error: 'Klien Supabase belum aktif' };
  }

  const { patientTable } = getSupabaseConfig();
  const tableName = patientTable || 'pasien';
  const cleanNik = sanitizePostgrestSearchTerm(identifier.nik?.trim() || '');
  const cleanNoRm = sanitizePostgrestSearchTerm(identifier.no_rm?.trim() || '');
  const rawQuery = (identifier.query || '').trim();
  const extractedToken = rawQuery.includes(' - ') ? rawQuery.split(' - ')[0].trim() : rawQuery;
  const cleanQuery = sanitizePostgrestSearchTerm(extractedToken);

  if (!cleanNik && !cleanNoRm && !cleanQuery) {
    return { exists: false, patient: null, matches: [], totalCount: 0 };
  }

  try {
    // 1. Jika mencari spesifik berdasarkan nik atau no_rm (misal Duplicate Check saat Pendaftaran Baru)
    if ((cleanNik || cleanNoRm) && !cleanQuery) {
      let exactQuery = client.from(tableName).select('*');
      const orParts: string[] = [];
      if (cleanNik) {
        orParts.push(`nik.ilike.${cleanNik}`);
      }
      if (cleanNoRm) {
        const rmCompact = cleanNoRm.replace(/^RM[\s-]+/i, 'RM');
        const rmHyphen = /^RM\d+/i.test(cleanNoRm) ? cleanNoRm.replace(/^RM/i, 'RM-') : cleanNoRm;
        orParts.push(`id.ilike.${cleanNoRm}`, `no_rm.ilike.${cleanNoRm}`);
        if (rmCompact.toLowerCase() !== cleanNoRm.toLowerCase()) {
          orParts.push(`id.ilike.${rmCompact}`, `no_rm.ilike.${rmCompact}`);
        }
        if (rmHyphen.toLowerCase() !== cleanNoRm.toLowerCase()) {
          orParts.push(`id.ilike.${rmHyphen}`, `no_rm.ilike.${rmHyphen}`);
        }
      }

      const { data, error } = await exactQuery.or(orParts.join(',')).limit(10);
      if (error) {
        console.warn('[Supabase Check Patient Error]:', error.message);
        return { exists: false, patient: null, matches: [], totalCount: 0, error: error.message };
      }
      if (data && data.length > 0) {
        const mapped = data.map(supabaseRowToPatient);
        return { exists: true, patient: mapped[0], matches: mapped, totalCount: mapped.length };
      }
      return { exists: false, patient: null, matches: [], totalCount: 0 };
    }

    // 2. Pencarian fleksibel Master Pasien Supabase (Nama, No. RM, ID PAS-..., NIK, No. HP, Alamat)
    const searchTarget = cleanQuery || cleanNoRm || cleanNik;
    const rmCompact = searchTarget.replace(/^RM[\s-]+/i, 'RM');
    const rmHyphen = /^RM\d+/i.test(searchTarget)
      ? searchTarget.replace(/^RM/i, 'RM-')
      : searchTarget;

    // 2a. Cek kecocokan persis (exact match) terlebih dahulu pada no_rm, id, atau nik
    const exactClauses = [
      `no_rm.ilike.${searchTarget}`,
      `id.ilike.${searchTarget}`,
      `nik.ilike.${searchTarget}`
    ];
    if (rmCompact.toLowerCase() !== searchTarget.toLowerCase()) {
      exactClauses.push(`no_rm.ilike.${rmCompact}`, `id.ilike.${rmCompact}`);
    }
    if (rmHyphen.toLowerCase() !== searchTarget.toLowerCase()) {
      exactClauses.push(`no_rm.ilike.${rmHyphen}`, `id.ilike.${rmHyphen}`);
    }

    const { data: exactData } = await client
      .from(tableName)
      .select('*')
      .or(exactClauses.join(','))
      .limit(5);

    if (exactData && exactData.length === 1) {
      const exactPatient = supabaseRowToPatient(exactData[0]);
      return {
        exists: true,
        patient: exactPatient,
        matches: [exactPatient],
        totalCount: 1
      };
    }

    // 2b. Pencarian parsial komprehensif pada tabel Master Pasien Supabase
    const fuzzyRes = await fetchPatientsPaginatedFromSupabase({
      page: 1,
      pageSize: 50,
      searchQuery: searchTarget
    });

    if (fuzzyRes.error) {
      return {
        exists: false,
        patient: null,
        matches: [],
        totalCount: 0,
        error: fuzzyRes.error
      };
    }

    const matches = fuzzyRes.data || [];
    if (matches.length > 0) {
      // Prioritaskan jika ada yang cocok persis di dalam daftar hasil
      const exactInList = matches.find(
        (p) =>
          p.id.toLowerCase() === searchTarget.toLowerCase() ||
          (p.noRm || '').toLowerCase() === searchTarget.toLowerCase() ||
          (p.dbId || '').toLowerCase() === searchTarget.toLowerCase() ||
          p.id.toLowerCase() === rmCompact.toLowerCase() ||
          (p.noRm || '').toLowerCase() === rmCompact.toLowerCase() ||
          p.nik.toLowerCase() === searchTarget.toLowerCase() ||
          p.name.toLowerCase() === rawQuery.toLowerCase()
      );
      return {
        exists: true,
        patient: exactInList || matches[0],
        matches,
        totalCount: fuzzyRes.totalCount
      };
    }

    return { exists: false, patient: null, matches: [], totalCount: 0 };
  } catch (err: any) {
    console.warn('[Supabase Check Patient Exception]:', err);
    return { exists: false, patient: null, matches: [], totalCount: 0, error: err?.message || String(err) };
  }
}

// Generate next No. RM automatically
export async function generateNextNoRM(): Promise<string> {
  const client = getSupabaseClient();
  if (client) {
    const { patientTable } = getSupabaseConfig();
    try {
      const { data, error } = await client
        .from(patientTable)
        .select('id, no_rm')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data && data.length > 0) {
        let maxNum = 0;
        data.forEach((row) => {
          const rmCandidate = row.no_rm || row.id || '';
          const match = rmCandidate.match(/RM-(\d+)/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
        if (maxNum > 0) {
          return `RM-${String(maxNum + 1).padStart(3, '0')}`;
        }
      }
    } catch (e) {
      console.warn('Gagal membaca counter No. RM dari Supabase:', e);
    }
  }

  // Fallback: check local storage (scoped automatically to latisha_demo_patients in Demo Mode)
  try {
    const saved = demoGetItem('latisha_patients');
    if (saved) {
      const localList: Patient[] = JSON.parse(saved);
      let maxNum = localList.length;
      localList.forEach((p) => {
        const match = p.id.match(/RM-(\d+)/i);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
      return `RM-${String(maxNum + 1).padStart(3, '0')}`;
    }
  } catch {}

  return `RM-${String(Math.floor(100 + Math.random() * 900))}`;
}

export function normalizeDateForHtmlInput(raw: unknown): string {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  // ISO datetime or YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return '';
}

export interface NikMasterLookupResult {
  found: boolean;
  patient: Patient | null;
  source: 'supabase' | 'local' | 'none';
  error?: string;
}

export async function lookupPatientByNikFromMaster(
  nik: string,
  localPatients?: Patient[]
): Promise<NikMasterLookupResult> {
  const cleanNik = String(nik || '').replace(/\D/g, '').slice(0, 16);
  if (cleanNik.length !== 16) {
    return { found: false, patient: null, source: 'none' };
  }

  const findInList = (list: Patient[] | undefined | null): Patient | null => {
    if (!Array.isArray(list) || list.length === 0) return null;
    return (
      list.find((p) => String(p?.nik || '').replace(/\D/g, '') === cleanNik) || null
    );
  };

  let localMatch = findInList(localPatients);
  if (!localMatch) {
    try {
      const saved = demoGetItem('latisha_patients');
      if (saved) {
        const parsed = JSON.parse(saved);
        localMatch = findInList(parsed);
      }
    } catch {}
  }

  if (isDemoMode()) {
    return localMatch
      ? { found: true, patient: localMatch, source: 'local' }
      : { found: false, patient: null, source: 'none' };
  }

  const client = getSupabaseClient();
  if (client) {
    const { patientTable } = getSupabaseConfig();
    const tableName = patientTable || DEFAULT_PATIENT_TABLE;
    try {
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .eq('nik', cleanNik)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped = supabaseRowToPatient(data[0]);
        return { found: true, patient: mapped, source: 'supabase' };
      }

      if (error) {
        console.warn('[Supabase NIK Master Lookup Warning]:', error.message);
      }
    } catch (err: any) {
      console.warn('[Supabase NIK Master Lookup Exception]:', err?.message || err);
    }
  }

  if (localMatch) {
    return { found: true, patient: localMatch, source: 'local' };
  }

  return { found: false, patient: null, source: 'none' };
}

export interface PatientRegistrationInput {
  nik: string;
  name: string;
  birthDate: string;
  gender: 'Laki-laki' | 'Perempuan';
  phone: string;
  address: string;
  allergy?: string;
  category?: Patient['category'];
  bpjsNo?: string;
}

export interface CheckAndRegisterResult {
  isNew: boolean;
  patient: Patient;
  message: string;
  savedToSupabase: boolean;
}

// Automatic Duplicate Check & Auto-Insert into Supabase (tabel_pasien)
export async function checkOrRegisterPatientSupabase(
  input: PatientRegistrationInput
): Promise<CheckAndRegisterResult> {
  const cleanNik = input.nik.trim();
  const currentYear = new Date().getFullYear();
  let calculatedAge = 25;
  if (input.birthDate) {
    const bYear = new Date(input.birthDate).getFullYear();
    if (!isNaN(bYear)) {
      calculatedAge = Math.max(0, currentYear - bYear);
    }
  }

  // 1. Pengecekan Otomatis (Duplicate Check) di Supabase (skip saat Mode Demo)
  if (!isDemoMode()) {
    const checkRes = await checkPatientInSupabase({ nik: cleanNik });

    // Pasien SUDAH TERDAFTAR
    if (checkRes.exists && checkRes.patient) {
      console.info(`[Supabase Duplicate Check] Pasien NIK ${cleanNik} SUDAH TERDAFTAR: ${checkRes.patient.name} (${checkRes.patient.id})`);
      return {
        isNew: false,
        patient: checkRes.patient,
        message: `Pasien lama teridentifikasi: ${checkRes.patient.name} (No. RM: ${checkRes.patient.id}). Langsung melanjutkan ke antrean poli.`,
        savedToSupabase: true
      };
    }
  }

  // Cek juga di local cache jika Supabase offline / Mode Demo
  try {
    const localSaved = demoGetItem('latisha_patients');
    if (localSaved) {
      const localList: Patient[] = JSON.parse(localSaved);
      const foundLocal = localList.find((p) => String(p.nik || '').replace(/\D/g, '') === cleanNik);
      if (foundLocal) {
        console.info(`[Local Duplicate Check] Pasien NIK ${cleanNik} ditemukan di cache lokal: ${foundLocal.name} (${foundLocal.id})`);
        return {
          isNew: false,
          patient: foundLocal,
          message: `Pasien lama teridentifikasi: ${foundLocal.name} (No. RM: ${foundLocal.id}). Langsung melanjutkan ke antrean poli.`,
          savedToSupabase: false
        };
      }
    }
  } catch {}

  // 2. Pasien BELUM TERDAFTAR -> Auto-Insert ke Supabase tabel_pasien (atau Demo Sandbox jika Mode Demo)
  const nextNoRm = await generateNextNoRM();
  const newPatient: Patient = {
    id: nextNoRm,
    dbId: nextNoRm,
    noRm: nextNoRm,
    nik: cleanNik,
    name: input.name.trim(),
    age: calculatedAge,
    gender: input.gender,
    birthDate: input.birthDate || '',
    phone: input.phone.trim(),
    address: input.address.trim() || '-',
    allergy: input.allergy?.trim() || 'Tidak Ada',
    category: input.category || 'Pasien Praktik',
    bpjsNo: input.bpjsNo || '',
    registeredOnline: true,
    registrationDate: new Date().toISOString().split('T')[0]
  };

  const syncRes = await syncPatientToSupabase(newPatient);

  // Simpan juga ke local cache (terisolasi otomatis di Demo Mode)
  try {
    const localSaved = demoGetItem('latisha_patients');
    const localList: Patient[] = localSaved ? JSON.parse(localSaved) : [];
    if (!localList.some((p) => p.id === newPatient.id || p.nik === newPatient.nik)) {
      localList.unshift(newPatient);
      demoSetItem('latisha_patients', JSON.stringify(localList));
    }
  } catch {}

  const savedSuccess = syncRes.success;
  return {
    isNew: true,
    patient: newPatient,
    message: savedSuccess
      ? `Pasien baru berhasil didaftarkan & otomatis tersimpan ke Supabase (No. RM: ${newPatient.id})!`
      : `Pasien baru terdaftar secara lokal (No. RM: ${newPatient.id}). (${syncRes.error || 'Menunggu koneksi Supabase'})`,
    savedToSupabase: savedSuccess
  };
}

// ============================================================================
// HELPER DDL SQL APOTEK & KLINIK LATISHA FARMA (ROW LEVEL SECURITY RLS)
// Menyediakan skrip DDL SQL per menu tabel dengan Row Level Security
// yang memberikan akses penuh ke seluruh operasional Apotek & Klinik Latisha Farma.
// ============================================================================
export const MULTI_TENANT_CORE_SQL_FUNCTIONS = `-- Skrip Kebijakan Akses Single-Tenant Apotek & Klinik Latisha Farma`;

export function buildMultiTenantRlsSqlBlock(
  tableName: string,
  options?: {
    isReferenceTable?: boolean;
    hasBranchId?: boolean;
    includeFunctions?: boolean;
  }
): string {
  const hasBranch = options?.hasBranchId === true;
  const branchIndexSql = hasBranch
    ? `\nCREATE INDEX IF NOT EXISTS idx_${tableName}_branch_id ON ${tableName} (branch_id);`
    : '';

  return `-- Kebijakan Akses Supabase Apotek Latisha Farma (Single-Tenant Mode)
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_pol RECORD;
BEGIN
  FOR v_pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = '${tableName}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', v_pol.policyname, '${tableName}');
  END LOOP;
END $$;

-- Hapus trigger isolasi sewa multi-tenant lama bila pernah terpasang
DROP TRIGGER IF EXISTS trg_enforce_tenant_${tableName} ON ${tableName};
${branchIndexSql}
-- Kebijakan Akses Penuh Khusus Apotek & Klinik Latisha Farma
CREATE POLICY "latisha_farma_access_${tableName}" ON ${tableName}
  FOR ALL
  USING (true)
  WITH CHECK (true);`;
}

// SQL Schema for the user to run in Supabase SQL Editor
export const SUPABASE_PATIEN_SQL_SCHEMA = `-- SKEMA TABEL MASTER PASIEN (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS pasien (
  id VARCHAR(50) PRIMARY KEY, -- No. RM (contoh: RM-001)
  no_rm VARCHAR(50),
  nik VARCHAR(20) NOT NULL,
  nama_lengkap VARCHAR(255) NOT NULL,
  jenis_kelamin VARCHAR(20) NOT NULL DEFAULT 'Laki-laki',
  tanggal_lahir DATE,
  kategori VARCHAR(50) DEFAULT 'Pasien Praktik', -- Pasien Umum, Pasien Praktik, Mitra Perusahaan
  kontak VARCHAR(50), -- No. Telepon / WhatsApp
  alamat TEXT,
  flag_alergi TEXT DEFAULT 'Tidak Ada',
  bpjs_no VARCHAR(50),
  registered_online BOOLEAN DEFAULT false,
  ihs_number VARCHAR(50),
  sync_satusehat VARCHAR(20) NOT NULL DEFAULT 'pending',
  satusehat_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Buat index untuk pencarian cepat NIK, Nama, No. RM, Kontak
CREATE INDEX IF NOT EXISTS idx_pasien_nik ON pasien (nik);
CREATE INDEX IF NOT EXISTS idx_pasien_nama ON pasien (nama_lengkap);
CREATE INDEX IF NOT EXISTS idx_pasien_no_rm ON pasien (no_rm);
CREATE INDEX IF NOT EXISTS idx_pasien_kontak ON pasien (kontak);

ALTER TABLE pasien REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication untuk tabel pasien secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pasien'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pasien;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('pasien')}
`;

export const SUPABASE_ONLINE_REG_SQL_SCHEMA = `-- SKEMA TABEL PENDAFTARAN ONLINE (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS pendaftaran_online (
  id VARCHAR(100) PRIMARY KEY,
  booking_code VARCHAR(50) NOT NULL,
  queue_number VARCHAR(20),
  nik VARCHAR(20) NOT NULL,
  no_rm VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  birth_date DATE,
  gender VARCHAR(20) DEFAULT 'Laki-laki',
  address TEXT,
  appointment_date DATE,
  appointment_session VARCHAR(100),
  service_type VARCHAR(100) DEFAULT 'Poli Umum',
  complaint TEXT,
  allergy TEXT DEFAULT 'Tidak Ada',
  status VARCHAR(50) DEFAULT 'Menunggu Verifikasi',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Buat index
CREATE INDEX IF NOT EXISTS idx_pendaftaran_nik ON pendaftaran_online (nik);
CREATE INDEX IF NOT EXISTS idx_pendaftaran_booking ON pendaftaran_online (booking_code);

ALTER TABLE pendaftaran_online REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication untuk pendaftaran_online secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pendaftaran_online'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pendaftaran_online;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('pendaftaran_online')}
`;

// Helper: Convert ICD10Item to Supabase row format
export function icd10ToSupabaseRow(item: ICD10Item): Record<string, any> {
  return {
    code: item.code.trim(),
    name: item.name.trim(),
    category: item.category || 'Umum',
    updated_at: new Date().toISOString()
  };
}

// Helper: Convert Supabase row to ICD10Item format
export function supabaseRowToICD10(row: Record<string, any>): ICD10Item {
  return {
    code: row.code || row.kode || '',
    name: row.name || row.nama || row.diagnosa || '',
    category: row.category || row.kategori || 'Umum'
  };
}

// Seed initial ICD-10 list into Supabase if empty or during setup (chunked for >1,000 rows support)
export async function seedICD10ToSupabase(): Promise<{ success: boolean; count: number; error?: string }> {
  if (isDemoMode()) {
    return { success: true, count: INITIAL_ICD10_LIST.length };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { icd10Table } = getSupabaseConfig();
  const rows = INITIAL_ICD10_LIST.map(icd10ToSupabaseRow);
  const CHUNK_SIZE = 500;

  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client
        .from(icd10Table)
        .upsert(chunk, { onConflict: 'code' });

      if (error) {
        console.warn('[Supabase ICD-10 Seed Error]:', error.message);
        return { success: false, count: i, error: error.message };
      }
    }

    console.info(`[Supabase ICD-10 Seed Success] Berhasil menyemai ${rows.length} data ICD-10.`);
    return { success: true, count: rows.length };
  } catch (err: any) {
    console.warn('[Supabase ICD-10 Seed Exception]:', err);
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

// Fetch ALL ICD-10 items from Supabase using automatic .range(from, to) paging loop (supports >1,000 rows, e.g. 1,084+ rows)
export async function fetchICD10FromSupabase(): Promise<{ data: ICD10Item[] | null; seeded?: boolean; error?: string }> {
  if (isDemoMode()) {
    return { data: null };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { icd10Table } = getSupabaseConfig();
  const PAGE_SIZE = 1000;
  const allRows: Record<string, any>[] = [];
  let from = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      const { data: batch, error } = await client
        .from(icd10Table)
        .select('*')
        .order('code', { ascending: true })
        .range(from, to);

      if (error) {
        console.warn(`[Supabase Fetch ICD-10 Error at range ${from}-${to}]:`, error.message);
        return { data: null, error: error.message };
      }

      if (batch && batch.length > 0) {
        allRows.push(...batch);
        if (batch.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    if (allRows.length === 0) {
      console.info('[Supabase ICD-10 Empty] Menjalankan auto-seed data ICD-10 awal...');
      const seedRes = await seedICD10ToSupabase();
      if (seedRes.success) {
        return { data: INITIAL_ICD10_LIST, seeded: true };
      }
      return { data: INITIAL_ICD10_LIST, error: seedRes.error };
    }

    // Map & deduplicate by code while preserving ascending order
    const uniqueMap = new Map<string, ICD10Item>();
    for (const row of allRows) {
      const item = supabaseRowToICD10(row);
      if (item.code) {
        uniqueMap.set(item.code.toUpperCase(), item);
      }
    }
    const icdList: ICD10Item[] = Array.from(uniqueMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );

    return { data: icdList };
  } catch (err: any) {
    console.warn('[Supabase Fetch ICD-10 Exception]:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

// Dynamic real-time query / autocomplete search for ICD-10 from Supabase table `icd10`
export async function searchICD10InSupabase(term: string): Promise<ICD10Item[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { icd10Table } = getSupabaseConfig();
  const q = term.trim();

  try {
    let queryBuilder = client.from(icd10Table).select('*');
    if (q) {
      queryBuilder = queryBuilder.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    }
    const { data, error } = await queryBuilder.order('code', { ascending: true }).limit(30);

    if (error) {
      console.warn('[Supabase ICD-10 Search Error]:', error.message);
      return [];
    }

    return (data || []).map(supabaseRowToICD10);
  } catch (err) {
    console.warn('[Supabase ICD-10 Search Exception]:', err);
    return [];
  }
}

// Upsert single ICD-10 code to Supabase
export async function syncICD10ToSupabase(item: ICD10Item): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { icd10Table } = getSupabaseConfig();
  const row = icd10ToSupabaseRow(item);

  try {
    const { error } = await client
      .from(icd10Table)
      .upsert(row, { onConflict: 'code' });

    if (error) {
      console.warn('[Supabase Sync ICD-10 Error]:', error.message);
      return { success: false, error: error.message };
    }

    console.info(`[Supabase Sync ICD-10 Success] Kode ICD-10 ${item.code} (${item.name}) tersimpan.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Sync ICD-10 Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Delete ICD-10 code from Supabase
export async function deleteICD10FromSupabase(code: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { icd10Table } = getSupabaseConfig();

  try {
    const { error } = await client
      .from(icd10Table)
      .delete()
      .eq('code', code);

    if (error) {
      console.warn('[Supabase Delete ICD-10 Error]:', error.message);
      return { success: false, error: error.message };
    }

    console.info(`[Supabase Delete ICD-10 Success] Kode ICD-10 ${code} dihapus.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Delete ICD-10 Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Real-time Inbound Subscription for ICD-10
export function subscribeICD10Realtime(
  onInsert: (item: ICD10Item) => void,
  onUpdate: (item: ICD10Item) => void,
  onDelete: (code: string) => void
): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { icd10Table } = getSupabaseConfig();
  const channelName = `realtime_${icd10Table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: icd10Table },
        (payload) => {
          console.info('[Supabase Real-time ICD-10 INSERT]:', payload.new);
          if (payload.new) {
            onInsert(supabaseRowToICD10(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: icd10Table },
        (payload) => {
          console.info('[Supabase Real-time ICD-10 UPDATE]:', payload.new);
          if (payload.new) {
            onUpdate(supabaseRowToICD10(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: icd10Table },
        (payload) => {
          console.info('[Supabase Real-time ICD-10 DELETE]:', payload.old);
          if (payload.old && payload.old.code) {
            onDelete(payload.old.code);
          }
        }
      )
      .subscribe((status) => {
        console.info(`[Supabase Channel Status ICD-10] ${channelName}: ${status}`);
      });

    return channel;
  } catch (err) {
    console.warn('[Supabase ICD-10 Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_ICD10_SQL_SCHEMA = `-- SKEMA TABEL MASTER ICD-10 DIAGNOSA (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS icd10 (
  code VARCHAR(50) PRIMARY KEY, -- Kode ICD-10 (contoh: J00, I10, E11.9)
  name VARCHAR(255) NOT NULL,    -- Deskripsi Diagnosa Penyakit
  category VARCHAR(100) DEFAULT 'Umum',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_icd10_code ON icd10 (code);
CREATE INDEX IF NOT EXISTS idx_icd10_name ON icd10 (name);

ALTER TABLE icd10 REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication untuk tabel icd10 secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'icd10'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE icd10;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('icd10', { isReferenceTable: true })}
`;

// Helper: Convert Staff object to Supabase row format for table `pegawai`
export function staffToSupabaseRow(st: Staff): Record<string, any> {
  const row: Record<string, any> = {
    id: st.id,
    id_pegawai: st.id,
    nama_lengkap: st.name || '',
    peran: st.role || 'Apoteker',
    peran_multi: st.roles ? JSON.stringify(st.roles) : null,
    hak_akses: st.permissions ? JSON.stringify(st.permissions) : null,
    no_hp: st.phone || '',
    status: st.status || 'Aktif',
    branch_id: st.branchId || 'BR-01',
    updated_at: new Date().toISOString()
  };
  if (st.npwpNik !== undefined) row.npwp_nik = st.npwpNik || null;
  if (st.ptkpStatus !== undefined) row.ptkp_status = st.ptkpStatus || null;
  if (st.taxCategory !== undefined) row.tax_category = st.taxCategory || null;
  if (st.sipNumber !== undefined) row.no_sip = st.sipNumber || null;
  if (st.sipbNumber !== undefined) row.no_sipb = st.sipbNumber || null;
  if (st.estrNumber !== undefined) row.no_estr = st.estrNumber || null;
  if (st.isDpj !== undefined) row.is_dpj = Boolean(st.isDpj);
  if (st.registeredAt !== undefined) row.registered_at = st.registeredAt || null;
  if (st.validatedAt !== undefined) row.validated_at = st.validatedAt || null;
  if (st.validatedBy !== undefined) row.validated_by = st.validatedBy || null;
  return row;
}

const OPTIONAL_STAFF_COLS = [
  'npwp_nik',
  'ptkp_status',
  'tax_category',
  'no_sip',
  'no_sipb',
  'no_estr',
  'is_dpj',
  'registered_at',
  'validated_at',
  'validated_by',
  'id_pegawai',
  'peran_multi',
  'hak_akses',
  'no_hp',
  'status',
  'branch_id',
  'updated_at'
];

const CORE_REQUIRED_STAFF_COLS = new Set(['id', 'nama_lengkap', 'peran']);

function findMissingOptionalStaffCol(error: any, row: Record<string, any>): string | undefined {
  if (!error) return undefined;
  const rawMsg = String(error.message || '');
  const msg = rawMsg.toLowerCase();
  const isSchemaError =
    msg.includes('column') ||
    msg.includes('schema cache') ||
    error.code === 'PGRST204' ||
    error.code === '42703';
  if (!isSchemaError) return undefined;

  const knownMatch = OPTIONAL_STAFF_COLS.find(
    (col) => col in row && !CORE_REQUIRED_STAFF_COLS.has(col) && msg.includes(col)
  );
  if (knownMatch) return knownMatch;

  // Dynamic extraction for any unrecognized optional column name in PostgREST / PostgreSQL error
  const quotedPatterns = [
    /'([a-z0-9_]+)'\s+column/i,
    /column\s+"([a-z0-9_]+)"/i,
    /column\s+[a-z0-9_]+\.([a-z0-9_]+)\s+does\s+not\s+exist/i
  ];
  for (const regex of quotedPatterns) {
    const m = rawMsg.match(regex);
    const colName = m?.[1]?.trim();
    if (colName && colName in row && !CORE_REQUIRED_STAFF_COLS.has(colName)) {
      return colName;
    }
  }
  return undefined;
}

// Helper: Convert Supabase row to local Staff format
export function supabaseRowToStaff(row: Record<string, any>): Staff {
  let roles: StaffRole[] | undefined;
  if (row.peran_multi) {
    try {
      roles = typeof row.peran_multi === 'string' ? JSON.parse(row.peran_multi) : row.peran_multi;
    } catch {}
  } else if (row.roles) {
    try {
      roles = typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles;
    } catch {}
  }

  let permissions: string[] | undefined;
  if (row.hak_akses) {
    try {
      permissions = typeof row.hak_akses === 'string' ? JSON.parse(row.hak_akses) : row.hak_akses;
    } catch {}
  } else if (row.permissions) {
    try {
      permissions = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
    } catch {}
  }

  const normalizedRoles: StaffRole[] | undefined = Array.isArray(roles)
    ? Array.from(new Set(roles.map((r) => normalizeStaffRole(r, 'Apoteker'))))
    : undefined;

  const rawTaxCat = String(row.tax_category || row.taxCategory || '').trim();
  const taxCategory: StaffTaxCategory | undefined =
    rawTaxCat === 'pegawai_tetap' || rawTaxCat === 'bukan_pegawai' ? rawTaxCat : undefined;

  const rawStatus = String(row.status || 'Aktif').trim();
  const normalizedStatus: StaffStatus =
    rawStatus === 'Non-Aktif'
      ? 'Non-Aktif'
      : rawStatus === 'Menunggu Validasi'
      ? 'Menunggu Validasi'
      : 'Aktif';

  const rawIsDpj = row.is_dpj ?? row.isDpj;
  const baseStaff: Staff = {
    id: row.id_pegawai || row.id || `STF-${Date.now().toString().slice(-4)}`,
    name: row.nama_lengkap || row.nama || row.name || 'Tanpa Nama',
    role: normalizeStaffRole(row.peran || row.role, 'Apoteker'),
    roles: normalizedRoles,
    permissions,
    phone: row.no_hp || row.phone || row.kontak || '',
    status: normalizedStatus,
    branchId: row.branch_id || row.branchId || 'BR-01',
    npwpNik: row.npwp_nik || row.npwpNik ? String(row.npwp_nik || row.npwpNik) : undefined,
    ptkpStatus: (row.ptkp_status || row.ptkpStatus) as PtkpStatus | undefined,
    taxCategory,
    sipNumber: row.no_sip || row.sipNumber ? String(row.no_sip || row.sipNumber) : undefined,
    sipbNumber: row.no_sipb || row.sipbNumber ? String(row.no_sipb || row.sipbNumber) : undefined,
    estrNumber: row.no_estr || row.estrNumber ? String(row.no_estr || row.estrNumber) : undefined,
    ...(typeof rawIsDpj === 'boolean' ? { isDpj: rawIsDpj } : {}),
    ...(row.registered_at || row.registeredAt
      ? { registeredAt: String(row.registered_at || row.registeredAt) }
      : {}),
    ...(row.validated_at || row.validatedAt
      ? { validatedAt: String(row.validated_at || row.validatedAt) }
      : {}),
    ...(row.validated_by || row.validatedBy
      ? { validatedBy: String(row.validated_by || row.validatedBy) }
      : {})
  };

  return ensurePrimaryOwnerStaffRole(baseStaff).staff;
}

// Seed initial Staff list into Supabase if empty (only primary APJ / Owner in production so deleted staff IDs stay clean starting at STF-002)
export async function seedStaffToSupabase(): Promise<{ success: boolean; count: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { staffTable } = getSupabaseConfig();
  const primaryOwner = ensurePrimaryOwnerStaffRole(INITIAL_STAFF[0]).staff;
  const deletedStaffSet = getDeletedIdsSet('staff');
  const targetSeed = isDemoMode()
    ? INITIAL_STAFF.filter((s) => !deletedStaffSet.has(s.id))
    : [primaryOwner];
  let currentRows = (targetSeed.length > 0 ? targetSeed : [primaryOwner]).map(staffToSupabaseRow);

  try {
    let error: any = null;
    for (let attempt = 0; attempt <= OPTIONAL_STAFF_COLS.length + 4; attempt++) {
      const res = await client
        .from(staffTable)
        .upsert(currentRows, { onConflict: 'id' });
      error = res.error;
      if (!error) break;
      const missingCol = findMissingOptionalStaffCol(error, currentRows[0] || {});
      if (missingCol) {
        currentRows = currentRows.map((r) => {
          const copy = { ...r };
          delete copy[missingCol];
          return copy;
        });
        continue;
      }
      break;
    }

    if (error) {
      console.warn('[Supabase Staff Seed Error]:', error.message);
      return { success: false, count: 0, error: error.message };
    }

    console.info(`[Supabase Staff Seed Success] Berhasil menyemai ${currentRows.length} data pegawai.`);
    return { success: true, count: currentRows.length };
  } catch (err: any) {
    console.warn('[Supabase Staff Seed Exception]:', err);
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

// Fetch all staff from Supabase (with auto-seed if empty)
export async function fetchStaffFromSupabase(): Promise<{ data: Staff[] | null; seeded?: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { staffTable } = getSupabaseConfig();
  const primaryOwner = ensurePrimaryOwnerStaffRole(INITIAL_STAFF[0]).staff;
  const deletedStaffSet = getDeletedIdsSet('staff');
  const fallbackStaff = isDemoMode()
    ? INITIAL_STAFF.filter((s) => !deletedStaffSet.has(s.id))
    : [primaryOwner];
  const resolvedFallback = fallbackStaff.length > 0 ? fallbackStaff : [primaryOwner];

  try {
    const { data, error } = await client
      .from(staffTable)
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.warn('[Supabase Fetch Staff Error]:', error.message);
      return { data: null, error: error.message };
    }

    if (!data || data.length === 0) {
      console.info('[Supabase Staff Empty] Menjalankan auto-seed data pegawai awal...');
      const seedRes = await seedStaffToSupabase();
      if (seedRes.success) {
        return { data: resolvedFallback, seeded: true };
      }
      return { data: resolvedFallback, error: seedRes.error };
    }

    const staffList: Staff[] = [];
    for (const rawRow of data) {
      const converted = supabaseRowToStaff(rawRow);
      staffList.push(converted);
      // If Supabase row for primary APJ / Owner (apt. Mardin, S.Farm) still had legacy/downgraded role (e.g. Apoteker), sync repair back to Supabase
      const rawPeran = String(rawRow.peran || rawRow.role || '').trim();
      let rawRolesArr: string[] = [];
      try {
        const parsedRoles = rawRow.peran_multi
          ? typeof rawRow.peran_multi === 'string'
            ? JSON.parse(rawRow.peran_multi)
            : rawRow.peran_multi
          : rawRow.roles
          ? typeof rawRow.roles === 'string'
            ? JSON.parse(rawRow.roles)
            : rawRow.roles
          : [];
        if (Array.isArray(parsedRoles)) rawRolesArr = parsedRoles.map(String);
      } catch {}
      const needsCloudRepair =
        converted.role === 'APJ / Owner' &&
        (rawPeran !== 'APJ / Owner' ||
          !rawRolesArr.includes('APJ / Owner') ||
          String(rawRow.status || 'Aktif') !== 'Aktif');
      if (needsCloudRepair) {
        syncStaffToSupabase(converted).catch(() => {});
      }
    }
    return { data: staffList };
  } catch (err: any) {
    console.warn('[Supabase Fetch Staff Exception]:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

// Upsert single staff to Supabase
export async function syncStaffToSupabase(st: Staff): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { staffTable } = getSupabaseConfig();
  const row = staffToSupabaseRow(st);

  try {
    let currentRow = { ...row };
    let error: any = null;

    for (let attempt = 0; attempt <= OPTIONAL_STAFF_COLS.length + 4; attempt++) {
      const res = await client
        .from(staffTable)
        .upsert(currentRow, { onConflict: 'id' });
      error = res.error;
      if (!error) break;
      const missingCol = findMissingOptionalStaffCol(error, currentRow);
      if (missingCol) {
        const nextRow = { ...currentRow };
        delete nextRow[missingCol];
        currentRow = nextRow;
        continue;
      }
      break;
    }

    if (error) {
      console.warn('[Supabase Sync Staff Error]:', error.message);
      return { success: false, error: error.message };
    }

    console.info(`[Supabase Sync Staff Success] Pegawai ${st.name} (${st.id}) tersimpan.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Sync Staff Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Atomic self-registration into Supabase: fetches live staff list first, prevents duplicate names,
// computes collision-free STF-XXX ID, and performs INSERT (never silently overwriting an existing employee)
export async function registerNewStaffToSupabase(
  buildStaff: (resolvedId: string) => Staff,
  localStaffSnapshot: Staff[] = []
): Promise<{
  success: boolean;
  staff?: Staff;
  allCloudStaff?: Staff[];
  duplicateStaff?: Staff;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi.' };
  }

  const { staffTable } = getSupabaseConfig();
  const primaryOwner = ensurePrimaryOwnerStaffRole(INITIAL_STAFF[0]).staff;

  try {
    const { data: rawRows, error: fetchError } = await client
      .from(staffTable)
      .select('*')
      .order('id', { ascending: true });

    if (fetchError) {
      console.warn('[Supabase Register Staff Fetch Error]:', fetchError.message);
      return {
        success: false,
        error: `Gagal terhubung ke tabel pegawai Supabase: ${fetchError.message}`
      };
    }

    let cloudStaff: Staff[] = (rawRows || []).map(supabaseRowToStaff);
    if (cloudStaff.length === 0) {
      await seedStaffToSupabase().catch(() => {});
      cloudStaff = [primaryOwner];
    }

    const provisional = buildStaff('__PENDING__');
    const normalizedInputName = String(provisional.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const duplicateStaff = cloudStaff.find(
      (st) =>
        String(st.name || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ') === normalizedInputName
    );
    if (duplicateStaff) {
      return {
        success: false,
        duplicateStaff,
        allCloudStaff: cloudStaff,
        error: `Pegawai dengan nama "${duplicateStaff.name}" sudah terdaftar di sistem dengan ID ${duplicateStaff.id} (Status: ${duplicateStaff.status}).`
      };
    }

    const pendingSyncLocalSet = getPendingSyncIdsSet('staff');
    const usedStaffList: Staff[] = [
      ...cloudStaff,
      ...localStaffSnapshot.filter(
        (st) =>
          st?.id &&
          pendingSyncLocalSet.has(String(st.id).trim()) &&
          !cloudStaff.some((cs) => cs.id.toLowerCase() === st.id.toLowerCase())
      )
    ];

    let lastError: any = null;
    for (let idAttempt = 0; idAttempt < 6; idAttempt++) {
      const candidateId = generateNextStaffId(usedStaffList);
      const targetStaff = ensurePrimaryOwnerStaffRole(buildStaff(candidateId)).staff;
      let currentRow = staffToSupabaseRow(targetStaff);
      let insertError: any = null;
      let insertedRow: Record<string, any> | null = null;
      let conflictHit = false;

      for (let colAttempt = 0; colAttempt <= OPTIONAL_STAFF_COLS.length + 4; colAttempt++) {
        const res = await client
          .from(staffTable)
          .insert(currentRow)
          .select('*')
          .maybeSingle();

        insertError = res.error;
        if (!insertError) {
          insertedRow = res.data;
          break;
        }

        const missingCol = findMissingOptionalStaffCol(insertError, currentRow);
        if (missingCol) {
          const nextRow = { ...currentRow };
          delete nextRow[missingCol];
          currentRow = nextRow;
          continue;
        }

        const errMsg = String(insertError.message || '').toLowerCase();
        if (
          insertError.code === '23505' ||
          errMsg.includes('duplicate key') ||
          errMsg.includes('already exists')
        ) {
          conflictHit = true;
        }
        break;
      }

      if (!insertError) {
        const verifiedStaff = insertedRow
          ? ensurePrimaryOwnerStaffRole({
              ...targetStaff,
              ...supabaseRowToStaff(insertedRow),
              // Keep exact permissions/roles in case legacy DB lacked JSONB columns
              permissions:
                supabaseRowToStaff(insertedRow).permissions &&
                supabaseRowToStaff(insertedRow).permissions!.length > 0
                  ? supabaseRowToStaff(insertedRow).permissions
                  : targetStaff.permissions,
              roles:
                supabaseRowToStaff(insertedRow).roles &&
                supabaseRowToStaff(insertedRow).roles!.length > 0
                  ? supabaseRowToStaff(insertedRow).roles
                  : targetStaff.roles
            }).staff
          : targetStaff;

        const allCloudStaff = [...cloudStaff, verifiedStaff];
        console.info(
          `[Supabase Register Staff Success] Pegawai ${verifiedStaff.name} (${verifiedStaff.id}) tersimpan ke Supabase.`
        );
        return { success: true, staff: verifiedStaff, allCloudStaff };
      }

      lastError = insertError;
      if (conflictHit) {
        usedStaffList.push({ ...targetStaff, id: candidateId });
        continue;
      }
      break;
    }

    return {
      success: false,
      allCloudStaff: cloudStaff,
      error:
        lastError?.message ||
        'Gagal menyimpan pendaftaran pegawai baru ke Supabase. Pastikan koneksi internet stabil dan kebijakan RLS tabel pegawai aktif.'
    };
  } catch (err: any) {
    console.warn('[Supabase Register Staff Exception]:', err);
    return {
      success: false,
      error: err?.message || String(err)
    };
  }
}

// Delete staff from Supabase
export async function deleteStaffFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { staffTable } = getSupabaseConfig();

  try {
    const { error } = await client
      .from(staffTable)
      .delete()
      .or(`id.eq.${id},id_pegawai.eq.${id}`);

    if (error) {
      console.warn('[Supabase Delete Staff Error]:', error.message);
      return { success: false, error: error.message };
    }

    console.info(`[Supabase Delete Staff Success] Pegawai ID ${id} dihapus dari Supabase.`);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Delete Staff Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Real-time Inbound Subscription for Pegawai / Staff
export function subscribeStaffRealtime(
  onInsert: (st: Staff) => void,
  onUpdate: (st: Staff) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { staffTable } = getSupabaseConfig();
  const channelName = `realtime_${staffTable}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: staffTable },
        (payload) => {
          console.info('[Supabase Real-time Pegawai INSERT]:', payload.new);
          if (payload.new) {
            onInsert(supabaseRowToStaff(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: staffTable },
        (payload) => {
          console.info('[Supabase Real-time Pegawai UPDATE]:', payload.new);
          if (payload.new) {
            onUpdate(supabaseRowToStaff(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: staffTable },
        (payload) => {
          console.info('[Supabase Real-time Pegawai DELETE]:', payload.old);
          if (payload.old && (payload.old.id || payload.old.id_pegawai)) {
            onDelete(payload.old.id_pegawai || payload.old.id);
          }
        }
      )
      .subscribe((status) => {
        console.info(`[Supabase Channel Status Pegawai] ${channelName}: ${status}`);
      });

    return channel;
  } catch (err) {
    console.warn('[Supabase Staff Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_STAFF_SQL_SCHEMA = `-- SKEMA TABEL MASTER PEGAWAI / STAFF (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS pegawai (
  id VARCHAR(50) PRIMARY KEY, -- ID Pegawai (contoh: STF-001)
  id_pegawai VARCHAR(50),
  nama_lengkap VARCHAR(255) NOT NULL,
  peran VARCHAR(100) NOT NULL DEFAULT 'Apoteker',
  peran_multi JSONB, -- Array role tambahan
  hak_akses JSONB,  -- Array permission modul
  no_hp VARCHAR(50),
  status VARCHAR(30) DEFAULT 'Aktif',
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  npwp_nik VARCHAR(40),
  ptkp_status VARCHAR(10) DEFAULT 'TK/0',
  tax_category VARCHAR(30) DEFAULT 'pegawai_tetap',
  no_sip VARCHAR(120),
  no_sipb VARCHAR(120),
  no_estr VARCHAR(120),
  is_dpj BOOLEAN DEFAULT FALSE,
  registered_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  validated_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS npwp_nik VARCHAR(40);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS ptkp_status VARCHAR(10) DEFAULT 'TK/0';
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS tax_category VARCHAR(30) DEFAULT 'pegawai_tetap';
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS no_sip VARCHAR(120);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS no_sipb VARCHAR(120);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS no_estr VARCHAR(120);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS is_dpj BOOLEAN DEFAULT FALSE;
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS validated_by VARCHAR(255);

-- Index untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_pegawai_id ON pegawai (id);
CREATE INDEX IF NOT EXISTS idx_pegawai_nama ON pegawai (nama_lengkap);

ALTER TABLE pegawai REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication untuk tabel pegawai secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pegawai'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pegawai;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('pegawai', { hasBranchId: true })}
`;

// Helper: Convert RMERecord to Supabase row format for table `medical_records`
export function rmeToSupabaseRow(rec: RMERecord): Record<string, any> {
  return {
    id: rec.id,
    date: rec.date || new Date().toISOString().split('T')[0],
    time: rec.time || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    rm_id: rec.rmId || '',
    patient_name: rec.patientName || '',
    nik: rec.nik || '',
    age: rec.age || 0,
    gender: rec.gender || 'Laki-laki',
    doctor_name: rec.doctorName || '',
    doctor_id: rec.doctorId || '',
    vital_sign: rec.vitalSign ? JSON.stringify(rec.vitalSign) : null,
    soap_s: rec.soapS || '',
    soap_o: rec.soapO || '',
    soap_a: rec.soapA || '',
    soap_p: rec.soapP || '',
    icd_code: rec.icdCode || '',
    icd_name: rec.icdName || '',
    icd_list: rec.icdList ? JSON.stringify(rec.icdList) : null,
    prescription: rec.prescription ? JSON.stringify(rec.prescription) : null,
    doctor_fee: rec.doctorFee || 0,
    medical_support_fee: rec.medicalSupportFee || 0,
    admin_fee: rec.adminFee || 0,
    assigned_staff: rec.assignedStaff ? JSON.stringify(rec.assignedStaff) : null,
    notes: rec.notes || '',
    branch_id: rec.branchId || 'BR-01',
    updated_at: new Date().toISOString()
  };
}

// Helper: Convert Supabase row to local RMERecord format
export function supabaseRowToRme(row: Record<string, any>): RMERecord {
  let vitalSign: VitalSign = { td: '120/80', suhu: 36.5, nadi: 80, spo2: 98, bb: 60, tb: 165 };
  if (row.vital_sign) {
    try {
      vitalSign = typeof row.vital_sign === 'string' ? JSON.parse(row.vital_sign) : row.vital_sign;
    } catch {}
  }

  let icdList: ICD10Item[] = [];
  if (row.icd_list) {
    try {
      icdList = typeof row.icd_list === 'string' ? JSON.parse(row.icd_list) : row.icd_list;
    } catch {}
  }

  let prescription: PrescriptionItem[] = [];
  if (row.prescription) {
    try {
      prescription = typeof row.prescription === 'string' ? JSON.parse(row.prescription) : row.prescription;
    } catch {}
  }

  let assignedStaff: StaffFeeItem[] = [];
  if (row.assigned_staff) {
    try {
      assignedStaff = typeof row.assigned_staff === 'string' ? JSON.parse(row.assigned_staff) : row.assigned_staff;
    } catch {}
  }

  return {
    id: row.id || `RME-${Date.now()}`,
    date: row.date || row.tanggal || new Date().toISOString().split('T')[0],
    time: row.time || row.waktu || '08:00',
    rmId: row.rm_id || row.no_rm || '',
    patientName: row.patient_name || row.nama_pasien || 'Tanpa Nama',
    nik: row.nik || '',
    age: row.age || 0,
    gender: (row.gender || row.jenis_kelamin || 'Laki-laki') as any,
    doctorName: row.doctor_name || row.nama_dokter || '',
    doctorId: row.doctor_id || row.id_dokter || '',
    vitalSign,
    soapS: row.soap_s || row.subjektif || '',
    soapO: row.soap_o || row.objektif || '',
    soapA: row.soap_a || row.asesmen || row.diagnosa || '',
    soapP: row.soap_p || row.plan || '',
    icdCode: row.icd_code || row.kode_icd || '',
    icdName: row.icd_name || row.nama_icd || '',
    icdList,
    prescription,
    doctorFee: Number(row.doctor_fee || 0),
    medicalSupportFee: Number(row.medical_support_fee || 0),
    adminFee: Number(row.admin_fee || 0),
    assignedStaff,
    notes: row.notes || row.catatan || '',
    branchId: row.branch_id || 'BR-01'
  };
}

// Outbound: Upsert RME Record to Supabase
export async function syncRmeToSupabase(
  rec: RMERecord
): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { rmeTable } = getSupabaseConfig();
  const tableName = rmeTable || DEFAULT_RME_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const row = rmeToSupabaseRow(rec);

  try {
    const { error } = await client
      .from(tableName)
      .upsert(row, { onConflict: 'id' });

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn('[Supabase Sync RME Error]:', error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Sync RME Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Seed batch RME Records to Supabase
export async function seedRmeToSupabase(
  records: RMERecord[]
): Promise<{ success: boolean; count: number; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (records || []).filter((r) => r.id && !['RME-2026-001', 'RME-2026-002'].includes(r.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { rmeTable } = getSupabaseConfig();
  const tableName = rmeTable || DEFAULT_RME_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const rows = valid.map(rmeToSupabaseRow);
  try {
    const { error } = await client.from(tableName).upsert(rows, { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export const DEMO_RME_IDS = new Set(['RME-2026-001', 'RME-2026-002']);

export function isDemoRmeId(id?: string): boolean {
  return DEMO_RME_IDS.has(String(id || '').trim());
}

// Outbound: Batch Delete RME Records from Supabase (with timeout & chunking)
export async function deleteRmesFromSupabase(
  ids: string[],
  timeoutMs = 8000
): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, isDemo: true };

  const cleanIds = Array.from(
    new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (cleanIds.length === 0) return { success: true };

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { rmeTable } = getSupabaseConfig();
  const tableName = rmeTable || DEFAULT_RME_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  try {
    const chunkSize = 200;
    for (let i = 0; i < cleanIds.length; i += chunkSize) {
      const chunk = cleanIds.slice(i, i + chunkSize);
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ error: { message: string; code?: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({ error: { message: `Timeout menghapus riwayat e-RME dari ${tableName}` } });
        }, timeoutMs);
      });

      const deletePromise =
        chunk.length === 1
          ? client.from(tableName).delete().eq('id', chunk[0])
          : client.from(tableName).delete().in('id', chunk);

      const result = await Promise.race([deletePromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const { error } = result as { error: { message: string; code?: string } | null };
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        console.warn('[Supabase Delete RME Error]:', error.message);
        return { success: false, needsTableSetup, error: error.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Delete RME Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

// Outbound: Delete Single RME Record from Supabase
export async function deleteRmeFromSupabase(
  id: string
): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> {
  return deleteRmesFromSupabase([id]);
}

// Inbound: Fetch all RME Records from Supabase
export async function fetchRmeFromSupabase(options?: {
  forceRefresh?: boolean;
}): Promise<{
  data: RMERecord[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { rmeTable } = getSupabaseConfig();
  const tableName = rmeTable || DEFAULT_RME_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  try {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn('[Supabase Fetch RME Error]:', error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const records: RMERecord[] = (data || []).map(supabaseRowToRme);
    return { data: records, isEmpty: records.length === 0 };
  } catch (err: any) {
    console.warn('[Supabase Fetch RME Exception]:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

// Real-time Inbound Subscription for RME Records
export function subscribeRmeRealtime(
  onInsert: (rec: RMERecord) => void,
  onUpdate: (rec: RMERecord) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { rmeTable } = getSupabaseConfig();
  const tableName = rmeTable || DEFAULT_RME_TABLE;
  if (missingTablesInSession.has(tableName)) return null;
  const channelName = `realtime_${tableName}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName },
        (payload) => {
          if (payload.new) {
            onInsert(supabaseRowToRme(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: tableName },
        (payload) => {
          if (payload.new) {
            onUpdate(supabaseRowToRme(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: tableName },
        (payload) => {
          if (payload.old && payload.old.id) {
            onDelete(payload.old.id);
          }
        }
      )
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase RME Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_RME_SQL_SCHEMA = `-- SKEMA TABEL ARSIP e-RME / MEDICAL RECORDS (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS medical_records (
  id VARCHAR(100) PRIMARY KEY,
  date DATE,
  time VARCHAR(50),
  rm_id VARCHAR(50),
  patient_name VARCHAR(255) NOT NULL,
  nik VARCHAR(20),
  age INT,
  gender VARCHAR(20) DEFAULT 'Laki-laki',
  doctor_name VARCHAR(255),
  doctor_id VARCHAR(50),
  vital_sign JSONB,
  soap_s TEXT,
  soap_o TEXT,
  soap_a TEXT,
  soap_p TEXT,
  icd_code VARCHAR(50),
  icd_name VARCHAR(255),
  icd_list JSONB,
  prescription JSONB,
  doctor_fee NUMERIC DEFAULT 0,
  medical_support_fee NUMERIC DEFAULT 0,
  admin_fee NUMERIC DEFAULT 0,
  assigned_staff JSONB,
  notes TEXT,
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Buat index untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_medical_records_rm ON medical_records (rm_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient ON medical_records (patient_name);
CREATE INDEX IF NOT EXISTS idx_medical_records_date ON medical_records (date);

-- Aktifkan Realtime Replication & Replica Identity Full agar event DELETE mengirim payload.old.id
ALTER TABLE medical_records REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'medical_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE medical_records;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('medical_records', { hasBranchId: true })}
`;

const SCHEDULE_DATE_TAG_RE = /\s*\[\[tgl:(\d{4}-\d{2}-\d{2})\]\]\s*$/;

// Helper: Convert DutySchedule to Supabase row format for table `schedules`
export function scheduleToSupabaseRow(sch: DutySchedule, includeDateColumn = true): Record<string, any> {
  const cleanNotes = String(sch.notes || '').replace(SCHEDULE_DATE_TAG_RE, '').trim();
  const cleanDate =
    typeof sch.scheduleDate === 'string' && sch.scheduleDate.trim()
      ? sch.scheduleDate.trim().slice(0, 10)
      : undefined;

  const row: Record<string, any> = {
    id: sch.id,
    staff_id: sch.staffId || '',
    staff_name: sch.staffName || '',
    staff_role: sch.staffRole || 'Dokter',
    day: sch.day || 'Senin',
    start_time: sch.startTime || '08:00',
    end_time: sch.endTime || '20:00',
    service_unit: sch.serviceUnit || 'Poli Umum',
    session_label: sch.sessionLabel || 'Full Day',
    quota_per_day: sch.quotaPerDay || 50,
    status: sch.status || 'Aktif',
    notes:
      !includeDateColumn && cleanDate
        ? cleanNotes
          ? `${cleanNotes} [[tgl:${cleanDate}]]`
          : `[[tgl:${cleanDate}]]`
        : cleanNotes,
    phone: sch.phone || '',
    updated_at: new Date().toISOString()
  };
  if (includeDateColumn) {
    row.schedule_date = cleanDate || null;
  }
  return row;
}

export function supabaseRowToSchedule(row: Record<string, any>): DutySchedule {
  const rawNotes = String(row.notes || '');
  const tagMatch = rawNotes.match(SCHEDULE_DATE_TAG_RE);
  const cleanNotes = rawNotes.replace(SCHEDULE_DATE_TAG_RE, '').trim();
  const rawDate = row.schedule_date || row.scheduleDate || (tagMatch ? tagMatch[1] : '') || '';
  const normalizedDate = typeof rawDate === 'string' && rawDate.trim() ? rawDate.trim().slice(0, 10) : undefined;
  return {
    id: row.id || `SCH-${Date.now()}`,
    staffId: row.staff_id || row.staffId || '',
    staffName: row.staff_name || row.staffName || '',
    staffRole: normalizeStaffRole(row.staff_role || row.staffRole, 'Dokter'),
    day: (row.day || 'Senin') as any,
    scheduleDate: normalizedDate,
    startTime: row.start_time || row.startTime || '08:00',
    endTime: row.end_time || row.endTime || '20:00',
    serviceUnit: row.service_unit || row.serviceUnit || 'Poli Umum',
    sessionLabel: row.session_label || row.sessionLabel || 'Full Day',
    quotaPerDay: Number(row.quota_per_day || row.quotaPerDay || 50),
    status: (row.status || 'Aktif') as any,
    notes: cleanNotes,
    phone: row.phone || ''
  };
}

const isMissingScheduleDateColumnError = (message?: string, code?: string): boolean => {
  const msg = String(message || '').toLowerCase();
  const c = String(code || '').toUpperCase();
  return (
    msg.includes('schedule_date') &&
    (c === 'PGRST204' || c === '42703' || msg.includes('column') || msg.includes('schema cache'))
  );
};

export async function syncScheduleToSupabase(
  sch: DutySchedule
): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const { scheduleTable } = getSupabaseConfig();
  const tableName = scheduleTable || DEFAULT_SCHEDULE_TABLE;

  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = scheduleToSupabaseRow(sch, true);
  try {
    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      if (isMissingScheduleDateColumnError(error.message, error.code)) {
        const fallbackRow = scheduleToSupabaseRow(sch, false);
        const retry = await client.from(tableName).upsert(fallbackRow, { onConflict: 'id' });
        if (!retry.error) return { success: true };
        return { success: false, error: retry.error.message };
      }
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedSchedulesToSupabase(
  customSchedules?: DutySchedule[]
): Promise<{ success: boolean; count: number; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  const { scheduleTable } = getSupabaseConfig();
  const tableName = scheduleTable || DEFAULT_SCHEDULE_TABLE;

  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const list = Array.isArray(customSchedules) ? customSchedules : INITIAL_DUTY_SCHEDULES;
  if (list.length === 0) {
    return { success: true, count: 0 };
  }
  const rows = list.map((item) => scheduleToSupabaseRow(item, true));
  try {
    const { error } = await client.from(tableName).upsert(rows, { onConflict: 'id' });
    if (error) {
      if (isMissingScheduleDateColumnError(error.message, error.code)) {
        const fallbackRows = list.map((item) => scheduleToSupabaseRow(item, false));
        const retry = await client.from(tableName).upsert(fallbackRows, { onConflict: 'id' });
        if (!retry.error) return { success: true, count: fallbackRows.length };
        return { success: false, count: 0, error: retry.error.message };
      }
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteScheduleFromSupabase(
  id: string
): Promise<{ success: boolean; needsTableSetup?: boolean; isDemo?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const { scheduleTable } = getSupabaseConfig();
  const tableName = scheduleTable || DEFAULT_SCHEDULE_TABLE;

  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function fetchSchedulesFromSupabase(options?: {
  forceRefresh?: boolean;
  seedList?: DutySchedule[];
  seedIfEmpty?: boolean;
}): Promise<{
  data: DutySchedule[] | null;
  seeded?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  const { scheduleTable } = getSupabaseConfig();
  const tableName = scheduleTable || DEFAULT_SCHEDULE_TABLE;

  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  try {
    const { data, error } = await client.from(tableName).select('*');
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { data: null, needsTableSetup, error: error.message };
    }
    if (!data || data.length === 0) {
      if (options?.seedIfEmpty === true) {
        const fallbackSchedules =
          options?.seedList && options.seedList.length > 0
            ? options.seedList
            : INITIAL_DUTY_SCHEDULES;
        const seedRes = await seedSchedulesToSupabase(fallbackSchedules);
        if (seedRes.success) {
          return { data: fallbackSchedules, seeded: true };
        }
        return { data: fallbackSchedules, error: seedRes.error };
      }
      return { data: [] };
    }
    return { data: data.map(supabaseRowToSchedule) };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export function subscribeSchedulesRealtime(
  onInsert: (sch: DutySchedule) => void,
  onUpdate: (sch: DutySchedule) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;
  const { scheduleTable } = getSupabaseConfig();
  const tableName = scheduleTable || DEFAULT_SCHEDULE_TABLE;
  if (missingTablesInSession.has(tableName)) return null;
  const channelName = `realtime_${tableName}_${Date.now()}`;
  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: tableName }, (p) => {
        if (p.new) onInsert(supabaseRowToSchedule(p.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tableName }, (p) => {
        if (p.new) onUpdate(supabaseRowToSchedule(p.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: tableName }, (p) => {
        if (p.old && p.old.id) onDelete(p.old.id);
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.warn('[Supabase Schedule Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_SCHEDULES_SQL_SCHEMA = `-- SKEMA TABEL JADWAL PETUGAS / SCHEDULES (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(100) PRIMARY KEY,
  staff_id VARCHAR(50),
  staff_name VARCHAR(255) NOT NULL,
  staff_role VARCHAR(100),
  day VARCHAR(20),
  schedule_date VARCHAR(20),
  start_time VARCHAR(20),
  end_time VARCHAR(20),
  service_unit VARCHAR(100),
  session_label VARCHAR(100),
  quota_per_day INT DEFAULT 50,
  status VARCHAR(50) DEFAULT 'Aktif',
  notes TEXT,
  phone VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah ada:
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS schedule_date VARCHAR(20);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS quota_per_day INT DEFAULT 50;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_schedules_day ON schedules (day);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules (schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedules_staff ON schedules (staff_name);

ALTER TABLE schedules REPLICA IDENTITY FULL;

-- Aktifkan Realtime secara aman (tidak error jika tabel sudah terdaftar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('schedules')}
`;

/**
 * Menghitung HPP Satuan Besar (HNA + PPN 11%) yang ditampilkan pada kolom HPP di Tabel Master Obat.
 * Digunakan agar kolom `hpp` di tabel `master_obat` Supabase selalu sinkron dengan HPP di Tabel Master Obat aplikasi utama.
 */
export function computeMedicineHppBesar(m: {
  hnaBesar?: number;
  hpp?: number;
  rasioKonversi?: number;
}): number {
  const ratio = Math.max(1, Number(m.rasioKonversi) || 1);
  const rawHnaBesar = Number(m.hnaBesar) || 0;
  const rawHpp = Number(m.hpp) || 0;

  if (rawHnaBesar > 0) {
    return Math.round(rawHnaBesar * 1.11);
  }
  if (rawHpp > 0) {
    // Jika m.hpp di memori adalah HPP satuan kecil, kalikan rasio konversi untuk mendapatkan HPP satuan besar
    return Math.round(rawHpp * ratio);
  }
  return 0;
}

const MEDICINE_STATUS_RESEP_LOCAL_MAP_KEY = 'latisha_medicine_status_resep_map_v1';
const observedMedicineColumnsMap = new Map<string, Set<string>>();
const missingMedicineColumnsMap = new Map<string, Set<string>>();

function saveLocalMedicineStatusResepOverride(id: string, statusResep?: string): void {
  const cleanId = String(id || '').trim();
  const cleanStatus = String(statusResep || '').trim();
  if (!cleanId || !cleanStatus) return;
  try {
    if (typeof window === 'undefined') return;
    const raw = demoGetItem(MEDICINE_STATUS_RESEP_LOCAL_MAP_KEY);
    const parsed: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && parsed[cleanId] !== cleanStatus) {
      parsed[cleanId] = cleanStatus;
      demoSetItem(MEDICINE_STATUS_RESEP_LOCAL_MAP_KEY, JSON.stringify(parsed));
    }
  } catch {}
}

function getLocalMedicineStatusResepOverride(id: string): string {
  const cleanId = String(id || '').trim();
  if (!cleanId) return '';
  try {
    if (typeof window === 'undefined') return '';
    const raw = demoGetItem(MEDICINE_STATUS_RESEP_LOCAL_MAP_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed[cleanId] === 'string' ? parsed[cleanId].trim() : '';
  } catch {
    return '';
  }
}

function recordObservedMedicineColumns(tableName: string, rows: Record<string, any>[] | null | undefined): void {
  if (!rows || rows.length === 0) return;
  const existingSet = observedMedicineColumnsMap.get(tableName) || new Set<string>();
  const sampleLimit = Math.min(rows.length, 5);
  for (let i = 0; i < sampleLimit; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      existingSet.add(key);
    }
  }
  if (existingSet.size > 0) {
    observedMedicineColumnsMap.set(tableName, existingSet);
  }
}

function recordMissingMedicineColumn(tableName: string, colName: string): void {
  const cleanCol = String(colName || '').trim();
  if (!cleanCol) return;
  const set = missingMedicineColumnsMap.get(tableName) || new Set<string>();
  set.add(cleanCol);
  missingMedicineColumnsMap.set(tableName, set);
  const obs = observedMedicineColumnsMap.get(tableName);
  if (obs) {
    obs.delete(cleanCol);
  }
}

function extractUnknownColumnFromPostgrestError(error: any): string | null {
  if (!error) return null;
  const msg = String(error.message || '');
  const details = String(error.details || '');
  const hint = String(error.hint || '');
  const combined = `${msg} ${details} ${hint}`;

  // PostgREST schema cache error: Could not find the 'status_resep' column of 'master_obat' in the schema cache
  const pgrstMatch = combined.match(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  if (pgrstMatch?.[1]) return pgrstMatch[1];

  // Postgres 42703: column "status_resep" of relation "master_obat" does not exist / column status_resep does not exist
  const pgColMatch = combined.match(/column\s+["']?([a-zA-Z0-9_]+)["']?(?:\s+of\s+relation\s+["']?[a-zA-Z0-9_]+["']?)?\s+does not exist/i);
  if (pgColMatch?.[1]) return pgColMatch[1];

  return null;
}

function adaptMedicineRowToKnownSchema(
  tableName: string,
  row: Record<string, any>
): Record<string, any> {
  const adapted: Record<string, any> = { ...row };
  const observed = observedMedicineColumnsMap.get(tableName);
  const missing = missingMedicineColumnsMap.get(tableName);

  // Map zat_aktif_kekuatan -> kekuatan if remote table still uses legacy `kekuatan` column
  if (
    Object.prototype.hasOwnProperty.call(adapted, 'zat_aktif_kekuatan') &&
    ((missing?.has('zat_aktif_kekuatan') && !missing?.has('kekuatan')) ||
      (observed && !observed.has('zat_aktif_kekuatan') && observed.has('kekuatan')))
  ) {
    const val = adapted.zat_aktif_kekuatan;
    delete adapted.zat_aktif_kekuatan;
    adapted.kekuatan = val;
  }

  // Map form -> bentuk_sediaan if remote table uses `bentuk_sediaan` column instead of `form`
  if (
    Object.prototype.hasOwnProperty.call(adapted, 'form') &&
    ((missing?.has('form') && !missing?.has('bentuk_sediaan')) ||
      (observed && !observed.has('form') && observed.has('bentuk_sediaan')))
  ) {
    const val = adapted.form;
    delete adapted.form;
    adapted.bentuk_sediaan = val;
  }

  for (const key of Object.keys(adapted)) {
    if (missing?.has(key)) {
      delete adapted[key];
      continue;
    }
    if (observed && observed.size > 0 && !observed.has(key)) {
      delete adapted[key];
    }
  }

  return adapted;
}

export function isMedicineFormColumnMissingInSupabase(tableName?: string): boolean {
  const targetTable = tableName || getSupabaseConfig().medicineTable || DEFAULT_MEDICINE_TABLE;
  const missing = missingMedicineColumnsMap.get(targetTable);
  const observed = observedMedicineColumnsMap.get(targetTable);
  if (missing?.has('form') && (!observed || !observed.has('bentuk_sediaan'))) {
    return true;
  }
  if (observed && observed.size > 0 && !observed.has('form') && !observed.has('bentuk_sediaan')) {
    return true;
  }
  return false;
}

function applyMissingColumnFallbackToRow(
  tableName: string,
  payload: Record<string, any>,
  error: any
): { nextPayload: Record<string, any>; strippedCol: string | null } {
  const nextPayload: Record<string, any> = { ...payload };
  const unknownCol = extractUnknownColumnFromPostgrestError(error);
  if (unknownCol) {
    recordMissingMedicineColumn(tableName, unknownCol);
    if (unknownCol === 'zat_aktif_kekuatan' && Object.prototype.hasOwnProperty.call(nextPayload, 'zat_aktif_kekuatan')) {
      const val = nextPayload.zat_aktif_kekuatan;
      delete nextPayload.zat_aktif_kekuatan;
      if (!missingMedicineColumnsMap.get(tableName)?.has('kekuatan')) {
        nextPayload.kekuatan = val;
      }
      return { nextPayload, strippedCol: unknownCol };
    }
    if (unknownCol === 'form' && Object.prototype.hasOwnProperty.call(nextPayload, 'form')) {
      const val = nextPayload.form;
      delete nextPayload.form;
      if (!missingMedicineColumnsMap.get(tableName)?.has('bentuk_sediaan')) {
        nextPayload.bentuk_sediaan = val;
      }
      return { nextPayload, strippedCol: unknownCol };
    }
    if (Object.prototype.hasOwnProperty.call(nextPayload, unknownCol)) {
      delete nextPayload[unknownCol];
      return { nextPayload, strippedCol: unknownCol };
    }
  }

  // Fallback check by substring for older PostgREST message variants
  const msg = String(error?.message || '').toLowerCase();
  const knownOptionalCols = [
    'status_resep',
    'batches',
    'zat_aktif_kekuatan',
    'form',
    'bentuk_sediaan',
    'satuan',
    'satuan_kecil',
    'satuan_besar',
    'rasio_konversi',
    'hna_besar',
    'sell_price_klinik',
    'sell_price_mitra',
    'markup_reguler',
    'markup_klinik',
    'markup_mitra',
    'updated_at',
    'branch_id'
  ];
  for (const col of knownOptionalCols) {
    if (msg.includes(col) && Object.prototype.hasOwnProperty.call(nextPayload, col)) {
      recordMissingMedicineColumn(tableName, col);
      if (col === 'zat_aktif_kekuatan') {
        const val = nextPayload.zat_aktif_kekuatan;
        delete nextPayload.zat_aktif_kekuatan;
        nextPayload.kekuatan = val;
      } else if (col === 'form') {
        const val = nextPayload.form;
        delete nextPayload.form;
        if (!missingMedicineColumnsMap.get(tableName)?.has('bentuk_sediaan')) {
          nextPayload.bentuk_sediaan = val;
        }
      } else {
        delete nextPayload[col];
      }
      return { nextPayload, strippedCol: col };
    }
  }

  return { nextPayload, strippedCol: null };
}

export function medicineToSupabaseRow(m: Medicine) {
  const ratio = Math.max(1, Number(m.rasioKonversi) || 10);
  const rawHnaBesar = Number(m.hnaBesar) || 0;
  const rawHpp = Number(m.hpp) || 0;
  const effectiveHnaBesar =
    rawHnaBesar > 0
      ? Math.round(rawHnaBesar * 100) / 100
      : rawHpp > 0
      ? Math.round(((rawHpp * ratio) / 1.11) * 100) / 100
      : 0;
  const effectiveHppBesar = computeMedicineHppBesar({
    hnaBesar: effectiveHnaBesar,
    hpp: rawHpp,
    rasioKonversi: ratio
  });

  const effectiveSatuanBesar = m.satuanBesar || 'Box';
  const effectiveSatuanKecil = m.satuanKecil || 'Tablet';
  const formattedSatuan = `${effectiveSatuanBesar} / ${effectiveSatuanKecil} (1:${ratio})`;
  const normalizedStatusResep = m.statusResep ? String(m.statusResep).trim() : '';

  if (m.id && normalizedStatusResep) {
    saveLocalMedicineStatusResepOverride(m.id, normalizedStatusResep);
  }

  return {
    id: m.id,
    barcode: m.barcode?.trim() ? m.barcode.trim() : null,
    name: m.name || '',
    category: m.category || 'Obat Bebas',
    kelas: m.kelas || '',
    nappza: m.nappza || 'Non-NAPPZA',
    status_resep: normalizedStatusResep,
    zat_aktif_kekuatan: m.kekuatan || '',
    form: String(m.form || '').trim() || 'Tablet',
    unit: m.unit || 'Strip',
    satuan: formattedSatuan,
    satuan_kecil: effectiveSatuanKecil,
    satuan_besar: effectiveSatuanBesar,
    rasio_konversi: ratio,
    hna_besar: effectiveHnaBesar,
    // Simpan HPP Satuan Besar ke kolom hpp di Supabase agar sinkron 100% dengan kolom HPP pada Tabel Master Obat aplikasi utama
    hpp: effectiveHppBesar,
    sell_price: Number(m.sellPrice) || 0,
    sell_price_klinik: Number(m.sellPriceKlinik) || 0,
    sell_price_mitra: Number(m.sellPriceMitra) || 0,
    markup_reguler: m.markupReguler ?? 100,
    markup_klinik: m.markupKlinik ?? 100,
    markup_mitra: m.markupMitra ?? 25,
    stock: Number(m.stock) || 0,
    min_stock: Number(m.minStock) || 5,
    max_stock: Number(m.maxStock) || 100,
    batch_no: m.batchNo || '',
    exp_date: m.expDate || '',
    batches: Array.isArray(m.batches) ? m.batches : [],
    rack: m.rack || '',
    supplier: m.supplier || '',
    branch_id: m.branchId || 'cabang-pusat',
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToMedicine(row: Record<string, any>): Medicine {
  let parsedBatches = Array.isArray(row.batches) ? row.batches : undefined;
  if (!parsedBatches && typeof row.batches === 'string') {
    try {
      const json = JSON.parse(row.batches);
      if (Array.isArray(json)) parsedBatches = json;
    } catch {}
  }

  const rawSatuanStr = String(
    row.satuan ?? row.satuan_dan_konversi ?? row.satuan_konversi ?? ''
  ).trim();
  const parsedSatuanMatch = rawSatuanStr.match(
    /^\s*([^\/\(]+?)\s*\/\s*([^\(\)]+?)(?:\s*\(\s*1\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*\))?\s*$/i
  );
  const parsedBesarFromSatuan = parsedSatuanMatch?.[1]?.trim();
  const parsedKecilFromSatuan = parsedSatuanMatch?.[2]?.trim();
  const parsedRatioFromSatuan = parsedSatuanMatch?.[3]
    ? Number(parsedSatuanMatch[3].replace(',', '.'))
    : undefined;

  const resolvedSatuanBesar =
    row.satuan_besar || row.satuanBesar || parsedBesarFromSatuan || 'Box';
  const resolvedSatuanKecil =
    row.satuan_kecil || row.satuanKecil || parsedKecilFromSatuan || row.unit || 'Tablet';
  const rasioKonversi = Math.max(
    1,
    Number(row.rasio_konversi ?? row.rasioKonversi ?? parsedRatioFromSatuan ?? 10)
  );
  const rawHnaBesar = Number(row.hna_besar ?? row.hnaBesar ?? 0);
  const rawHppDb = Number(row.hpp ?? 0);
  const rawSellReguler = Number(row.sell_price ?? row.sellPrice ?? row.sell_price_reguler ?? 0);
  const rawSellKlinik = Number(row.sell_price_klinik ?? row.sellPriceKlinik ?? 0);
  const rawSellMitra = Number(row.sell_price_mitra ?? row.sellPriceMitra ?? 0);

  let resolvedHnaBesar = rawHnaBesar;
  let resolvedHppBesar = 0;
  let resolvedHppKecil = 0;

  if (rawHnaBesar > 0) {
    resolvedHppBesar = Math.round(rawHnaBesar * 1.11);
    resolvedHppKecil = Math.round(resolvedHppBesar / rasioKonversi);
  } else if (rawHppDb > 0) {
    // Jika hna_besar kosong/0, cek apakah row lama menyimpan rawHppDb sebagai HPP satuan kecil (saat sell_price reguler sudah ada dan lebih besar/setara rawHppDb)
    const isLegacySmallUnitHpp =
      rasioKonversi > 1 && rawSellReguler > 0 && rawHppDb <= rawSellReguler;
    if (isLegacySmallUnitHpp) {
      const targetHppBesar = Math.round(rawHppDb * rasioKonversi);
      const intHna = Math.round(targetHppBesar / 1.11);
      resolvedHnaBesar =
        Math.round(intHna * 1.11) === targetHppBesar
          ? intHna
          : Math.round((targetHppBesar / 1.11) * 100) / 100;
      resolvedHppBesar = targetHppBesar;
      resolvedHppKecil = Math.round(rawHppDb);
    } else {
      const targetHppBesar = Math.round(rawHppDb);
      const intHna = Math.round(targetHppBesar / 1.11);
      resolvedHnaBesar =
        Math.round(intHna * 1.11) === targetHppBesar
          ? intHna
          : Math.round((targetHppBesar / 1.11) * 100) / 100;
      resolvedHppBesar = targetHppBesar;
      resolvedHppKecil = Math.round(targetHppBesar / rasioKonversi);
    }
  }

  // Normalisasi jika sell_price_mitra pada data lama tersimpan per satuan besar
  const normalizedSellMitra =
    rasioKonversi > 1 &&
    resolvedHppBesar > 0 &&
    resolvedHppKecil > 0 &&
    rawSellMitra >= resolvedHppBesar * 0.75 &&
    rawSellMitra > resolvedHppKecil * 1.25 * rasioKonversi * 0.6
      ? Math.round(rawSellMitra / rasioKonversi)
      : rawSellMitra;

  const resolveTierFromSupabase = (
    rawMarkupVal: any,
    rawSellVal: number,
    defaultMarkup: number
  ): { markup: number; sellPrice: number } => {
    const hasRawMarkup =
      rawMarkupVal !== null &&
      rawMarkupVal !== undefined &&
      rawMarkupVal !== '' &&
      !isNaN(Number(rawMarkupVal));
    const parsedMarkup = hasRawMarkup ? Number(rawMarkupVal) : NaN;
    const cleanSell = Math.max(0, Math.round(Number(rawSellVal) || 0));

    // Anggap markup=0 sebagai "belum diisi" jika harga jual juga kosong/0 (efek DEFAULT 0 kolom DB lama), kecuali memang harga jual = HPP (0% markup)
    const isExplicitZeroAtCost =
      hasRawMarkup &&
      parsedMarkup === 0 &&
      resolvedHppKecil > 0 &&
      cleanSell > 0 &&
      Math.abs(cleanSell - resolvedHppKecil) <= Math.max(1, resolvedHppKecil * 0.01);

    const hasEffectiveMarkup = hasRawMarkup && (parsedMarkup !== 0 || isExplicitZeroAtCost);

    if (hasEffectiveMarkup) {
      if (resolvedHppKecil > 0) {
        const calculatedSell = Math.round(resolvedHppKecil * (1 + parsedMarkup / 100));
        if (cleanSell <= 0) {
          return { markup: parsedMarkup, sellPrice: calculatedSell };
        }
        const derivedFromSell =
          Math.round(((cleanSell - resolvedHppKecil) / resolvedHppKecil) * 1000) / 10;
        const roundedParsed = Math.round(parsedMarkup * 10) / 10;
        return {
          markup: parsedMarkup,
          sellPrice: derivedFromSell === roundedParsed ? cleanSell : calculatedSell
        };
      }
      return { markup: parsedMarkup, sellPrice: cleanSell };
    }

    // %markup belum diisi di Supabase
    if (resolvedHppKecil > 0 && cleanSell > 0) {
      // Sudah ada HPP dan harga jual manual -> turunkan %markup agar sinkron
      const derivedMarkup =
        Math.round(((cleanSell - resolvedHppKecil) / resolvedHppKecil) * 1000) / 10;
      return { markup: derivedMarkup, sellPrice: cleanSell };
    }

    // Belum punya %markup (dan harga jual kosong) -> terisi otomatis default (Reguler 100%, Pasien Klinik 100%, Mitra 25%) & hitung harga jual jika HPP sudah terisi
    const autoSell =
      resolvedHppKecil > 0
        ? Math.round(resolvedHppKecil * (1 + defaultMarkup / 100))
        : cleanSell;
    return { markup: defaultMarkup, sellPrice: autoSell };
  };

  const regulerPricing = resolveTierFromSupabase(
    row.markup_reguler ?? row.markupReguler,
    rawSellReguler,
    100
  );
  const klinikPricing = resolveTierFromSupabase(
    row.markup_klinik ?? row.markupKlinik,
    rawSellKlinik,
    100
  );
  const mitraPricing = resolveTierFromSupabase(
    row.markup_mitra ?? row.markupMitra,
    normalizedSellMitra,
    25
  );

  const resolvedId =
    row.id !== null && row.id !== undefined && String(row.id) !== ''
      ? String(row.id)
      : `OBT-${Date.now().toString().slice(-4)}`;

  const dbStatusResep = String(row.status_resep ?? row.statusResep ?? '').trim();
  const resolvedStatusResep =
    dbStatusResep || getLocalMedicineStatusResepOverride(resolvedId) || '';

  return {
    id: resolvedId,
    barcode: row.barcode || '',
    name: row.name || row.nama_obat || row.nama || 'Obat Tanpa Nama',
    category: row.category || 'Obat Bebas',
    kelas: row.kelas || '',
    nappza: row.nappza || 'Non-NAPPZA',
    statusResep: resolvedStatusResep,
    kekuatan: row.zat_aktif_kekuatan || row.kekuatan || '',
    form: String(row.form ?? row.bentuk_sediaan ?? row.bentukSediaan ?? '').trim() || 'Tablet',
    unit: row.unit || resolvedSatuanKecil || 'Strip',
    satuanKecil: resolvedSatuanKecil,
    satuanBesar: resolvedSatuanBesar,
    rasioKonversi,
    hnaBesar: resolvedHnaBesar,
    hpp: resolvedHppKecil,
    sellPrice: regulerPricing.sellPrice,
    sellPriceKlinik: klinikPricing.sellPrice,
    sellPriceMitra: mitraPricing.sellPrice,
    markupReguler: regulerPricing.markup,
    markupKlinik: klinikPricing.markup,
    markupMitra: mitraPricing.markup,
    stock: Number(row.stock ?? row.stok_awal ?? 0),
    minStock: Number(row.min_stock ?? row.minStock ?? 5),
    maxStock: Number(row.max_stock ?? row.maxStock ?? 100),
    batchNo: row.batch_no || row.batchNo || '',
    expDate: row.exp_date || row.expDate || '',
    batches: parsedBatches,
    rack: row.rack || '',
    supplier: row.supplier || '',
    branchId: row.branch_id || row.branchId || 'cabang-pusat'
  };
}

function doesRawMedicineRowNeedPricingOrHppSync(
  rawRow: Record<string, any>,
  mappedMed: Medicine
): { needed: boolean; expectedRow: ReturnType<typeof medicineToSupabaseRow> } {
  const expectedRow = medicineToSupabaseRow(mappedMed);
  const currentDbHpp = Math.round(Number(rawRow.hpp ?? 0));
  const currentDbHna = Math.round(Number(rawRow.hna_besar ?? rawRow.hnaBesar ?? 0));
  const currentDbSell = Math.round(Number(rawRow.sell_price ?? rawRow.sellPrice ?? 0));
  const currentDbSellKlinik = Math.round(
    Number(rawRow.sell_price_klinik ?? rawRow.sellPriceKlinik ?? 0)
  );
  const currentDbSellMitra = Math.round(
    Number(rawRow.sell_price_mitra ?? rawRow.sellPriceMitra ?? 0)
  );
  const dbMarkupRegMissing = rawRow.markup_reguler == null || rawRow.markup_reguler === '';
  const dbMarkupKliMissing = rawRow.markup_klinik == null || rawRow.markup_klinik === '';
  const dbMarkupMitMissing = rawRow.markup_mitra == null || rawRow.markup_mitra === '';
  const currentDbMarkupReg = Number(rawRow.markup_reguler ?? 0);
  const currentDbMarkupKli = Number(rawRow.markup_klinik ?? 0);
  const currentDbMarkupMit = Number(rawRow.markup_mitra ?? 0);

  const hasSatuanColumn = Object.prototype.hasOwnProperty.call(rawRow, 'satuan');
  const currentDbSatuan = String(rawRow.satuan ?? '').trim();
  const hasFormColumn = Object.prototype.hasOwnProperty.call(rawRow, 'form');
  const currentDbForm = String(rawRow.form ?? '').trim();

  const needed =
    (expectedRow.hpp > 0 && currentDbHpp !== expectedRow.hpp) ||
    (expectedRow.hna_besar > 0 && currentDbHna !== Math.round(expectedRow.hna_besar)) ||
    (expectedRow.sell_price > 0 && currentDbSell !== Math.round(expectedRow.sell_price)) ||
    (expectedRow.sell_price_klinik > 0 &&
      currentDbSellKlinik !== Math.round(expectedRow.sell_price_klinik)) ||
    (expectedRow.sell_price_mitra > 0 &&
      currentDbSellMitra !== Math.round(expectedRow.sell_price_mitra)) ||
    dbMarkupRegMissing ||
    dbMarkupKliMissing ||
    dbMarkupMitMissing ||
    currentDbMarkupReg !== expectedRow.markup_reguler ||
    currentDbMarkupKli !== expectedRow.markup_klinik ||
    currentDbMarkupMit !== expectedRow.markup_mitra ||
    (hasSatuanColumn && currentDbSatuan !== expectedRow.satuan) ||
    (hasFormColumn && !currentDbForm && Boolean(expectedRow.form));

  return { needed, expectedRow };
}

function isMedicineTableMissingError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('404')
  );
}

export async function syncMedicineToSupabase(
  medicine: Medicine
): Promise<{ success: boolean; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  const fullRow = medicineToSupabaseRow(medicine);
  let activeRow = adaptMedicineRowToKnownSchema(tableName, fullRow);

  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const { error } = await client.from(tableName).upsert(activeRow, { onConflict: 'id' });
      if (!error) return { success: true };

      if (isMedicineTableMissingError(error)) {
        return { success: false, needsTableSetup: true, error: `Tabel ${tableName} belum dibuat di Supabase.` };
      }

      if (
        (error.code === '23505' || error.message?.toLowerCase().includes('duplicate key')) &&
        activeRow.barcode !== null
      ) {
        activeRow = { ...activeRow, barcode: null };
        continue;
      }

      const { nextPayload, strippedCol } = applyMissingColumnFallbackToRow(
        tableName,
        activeRow,
        error
      );
      if (strippedCol) {
        activeRow = nextPayload;
        continue;
      }

      return { success: false, error: error.message };
    }
    return { success: false, error: 'Gagal menyinkronkan data obat ke Supabase setelah adaptasi skema.' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// Strict in-place UPDATE for editing existing medicine row in `master_obat` (prevents accidental new row creation)
export async function updateMedicineInSupabase(
  medicine: Medicine
): Promise<{ success: boolean; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  const row = medicineToSupabaseRow(medicine);
  const targetId = row.id;
  const { id: _omitId, ...rawUpdateFields } = row;
  let activeUpdateFields = adaptMedicineRowToKnownSchema(tableName, rawUpdateFields);

  try {
    let data: any[] | null = null;
    let error: any = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await client
        .from(tableName)
        .update(activeUpdateFields)
        .eq('id', targetId)
        .select('id');
      data = res.data;
      error = res.error;

      if (!error) break;

      if (isMedicineTableMissingError(error)) {
        return { success: false, needsTableSetup: true, error: `Tabel ${tableName} belum dibuat di Supabase.` };
      }

      if (
        (error.code === '23505' || error.message?.toLowerCase().includes('duplicate key')) &&
        activeUpdateFields.barcode !== null
      ) {
        activeUpdateFields = { ...activeUpdateFields, barcode: null };
        continue;
      }

      const { nextPayload, strippedCol } = applyMissingColumnFallbackToRow(
        tableName,
        activeUpdateFields,
        error
      );
      if (strippedCol) {
        activeUpdateFields = nextPayload;
        continue;
      }

      return { success: false, error: error.message };
    }

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.length > 0) {
      return { success: true };
    }

    // Verify if row exists before falling back to upsert so RLS/empty RETURNING never duplicates a row
    const { data: existingMedRow, error: lookupError } = await client
      .from(tableName)
      .select('id')
      .eq('id', targetId)
      .maybeSingle();

    if (lookupError) {
      return { success: false, error: lookupError.message };
    }

    if (existingMedRow) {
      const { error: retryUpdateErr } = await client
        .from(tableName)
        .update(activeUpdateFields)
        .eq('id', targetId);
      if (retryUpdateErr) {
        return { success: false, error: retryUpdateErr.message };
      }
      return { success: true };
    }

    // Fallback: jika baris lokal belum ada di Supabase, lakukan upsert berdasarkan id asli
    return await syncMedicineToSupabase(medicine);
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deleteMedicineFromSupabase(
  id: string
): Promise<{ success: boolean; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      if (isMedicineTableMissingError(error)) {
        return { success: false, needsTableSetup: true, error: `Tabel ${tableName} belum dibuat di Supabase.` };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function clearMedicinesFromSupabase(): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  try {
    const { error } = await client.from(tableName).delete().not('id', 'is', null);
    if (error) {
      if (isMedicineTableMissingError(error)) {
        return { success: false, needsTableSetup: true, error: `Tabel ${tableName} belum dibuat di Supabase.` };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedMedicinesToSupabase(
  customList?: Medicine[]
): Promise<{ success: boolean; count: number; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, count: 0, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  const defaultMeds = INITIAL_MEDICINES;
  const rawSource = customList !== undefined ? customList : defaultMeds;
  const sourceList = rawSource.filter(
    (m) => !(m.batchNo?.startsWith('BTC-202') && /^OBT-0(0[1-9]|10)$/.test(m.id))
  );
  if (sourceList.length === 0) return { success: true, count: 0 };
  const rawRows = sourceList.map(medicineToSupabaseRow);
  // Deduplicate by id & prevent duplicate non-null barcode within the same batch
  const dedupedById = new Map<string, ReturnType<typeof medicineToSupabaseRow>>();
  const seenBarcodes = new Set<string>();
  for (const row of rawRows) {
    if (!row.id) continue;
    if (row.barcode && seenBarcodes.has(row.barcode)) {
      dedupedById.set(row.id, { ...row, barcode: null });
    } else {
      if (row.barcode) seenBarcodes.add(row.barcode);
      dedupedById.set(row.id, row);
    }
  }
  const rows = Array.from(dedupedById.values());
  const CHUNK_SIZE = 500;

  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      let activeChunk = rows
        .slice(i, i + CHUNK_SIZE)
        .map((r) => adaptMedicineRowToKnownSchema(tableName, r));
      let chunkDone = false;

      for (let attempt = 0; attempt < 10; attempt++) {
        const { error } = await client.from(tableName).upsert(activeChunk, { onConflict: 'id' });
        if (!error) {
          chunkDone = true;
          break;
        }
        if (isMedicineTableMissingError(error)) {
          return {
            success: false,
            count: i,
            needsTableSetup: true,
            error: `Tabel ${tableName} belum dibuat di Supabase.`
          };
        }

        const unknownCol = extractUnknownColumnFromPostgrestError(error);
        if (unknownCol) {
          recordMissingMedicineColumn(tableName, unknownCol);
          activeChunk = activeChunk.map((r) => applyMissingColumnFallbackToRow(tableName, r, error).nextPayload);
          continue;
        }

        if (
          error.message?.includes('batches') ||
          error.message?.includes('zat_aktif_kekuatan') ||
          error.message?.includes('satuan') ||
          error.message?.includes('status_resep')
        ) {
          activeChunk = activeChunk.map((r) => applyMissingColumnFallbackToRow(tableName, r, error).nextPayload);
          continue;
        }

        // Fallback if a single row in the batch conflicts on a secondary UNIQUE index (e.g., barcode)
        if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate key')) {
          for (const singleRow of activeChunk) {
            const singleRes = await client.from(tableName).upsert(singleRow, { onConflict: 'id' });
            if (
              singleRes.error &&
              (singleRes.error.code === '23505' ||
                singleRes.error.message?.toLowerCase().includes('duplicate key'))
            ) {
              await client
                .from(tableName)
                .upsert({ ...singleRow, barcode: null }, { onConflict: 'id' });
            }
          }
          chunkDone = true;
          break;
        }
        return { success: false, count: i, error: error.message };
      }

      if (!chunkDone) {
        return { success: false, count: i, error: 'Gagal sinkronisasi batch master_obat ke Supabase.' };
      }
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

// Fetch ALL medicines from Supabase table `master_obat` using automatic .range(from, to) paging loop (supports >1,000 rows)
export async function fetchMedicinesFromSupabase(options?: {
  seedIfEmpty?: boolean;
}): Promise<{ data: Medicine[] | null; seeded?: boolean; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { data: null, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  const PAGE_SIZE = 1000;
  const allRows: Record<string, any>[] = [];
  let from = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      const { data: batch, error } = await client
        .from(tableName)
        .select('*')
        .order('id', { ascending: true })
        .range(from, to);

      if (error) {
        if (isMedicineTableMissingError(error)) {
          return {
            data: null,
            needsTableSetup: true,
            error: `Tabel ${tableName} belum dibuat di Supabase.`
          };
        }
        console.warn(`[Supabase Fetch master_obat Error at range ${from}-${to}]:`, error.message);
        return { data: null, error: error.message };
      }

      if (batch && batch.length > 0) {
        recordObservedMedicineColumns(tableName, batch);
        allRows.push(...batch);
        if (batch.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    if (allRows.length === 0) {
      if (options?.seedIfEmpty === false) {
        return { data: [] };
      }
      const seedRes = await seedMedicinesToSupabase();
      if (seedRes.success) {
        return {
          data: seedRes.count > 0 ? INITIAL_MEDICINES : [],
          seeded: seedRes.count > 0
        };
      }
      return {
        data: null,
        needsTableSetup: seedRes.needsTableSetup,
        error: seedRes.error
      };
    }

    // Deduplicate rows by id while preserving order
    const uniqueRawRowsMap = new Map<string, Record<string, any>>();
    for (const rawRow of allRows) {
      const rowId = String(rawRow.id || '').trim();
      if (rowId) {
        uniqueRawRowsMap.set(rowId, rawRow);
      }
    }
    const data = Array.from(uniqueRawRowsMap.values());
    const mappedMedicines = data.map(supabaseRowToMedicine);

    // Sinkronisasi balik ke Supabase jika baris memiliki HPP namun %markup / harga jual masih kosong atau perlu perhitungan otomatis
    const rowsNeedingAutoCalcSync: ReturnType<typeof medicineToSupabaseRow>[] = [];
    data.forEach((rawRow, idx) => {
      const med = mappedMedicines[idx];
      const check = doesRawMedicineRowNeedPricingOrHppSync(rawRow, med);
      if (check.needed) {
        rowsNeedingAutoCalcSync.push(check.expectedRow);
      }
    });

    if (rowsNeedingAutoCalcSync.length > 0 && !isDemoMode()) {
      const CHUNK_SIZE = 500;
      (async () => {
        for (let i = 0; i < rowsNeedingAutoCalcSync.length; i += CHUNK_SIZE) {
          let activeChunk = rowsNeedingAutoCalcSync
            .slice(i, i + CHUNK_SIZE)
            .map((r) => adaptMedicineRowToKnownSchema(tableName, r));
          for (let attempt = 0; attempt < 8; attempt++) {
            const { error: migErr } = await client
              .from(tableName)
              .upsert(activeChunk, { onConflict: 'id' });
            if (!migErr) break;
            const { strippedCol } = applyMissingColumnFallbackToRow(tableName, activeChunk[0] || {}, migErr);
            if (strippedCol) {
              activeChunk = activeChunk.map((r) => applyMissingColumnFallbackToRow(tableName, r, migErr).nextPayload);
              continue;
            }
            if (migErr.code === '23505' || migErr.message?.toLowerCase().includes('duplicate key')) {
              for (const singleRow of activeChunk) {
                const singleRes = await client.from(tableName).upsert(singleRow, { onConflict: 'id' });
                if (
                  singleRes.error &&
                  (singleRes.error.code === '23505' ||
                    singleRes.error.message?.toLowerCase().includes('duplicate key'))
                ) {
                  await client
                    .from(tableName)
                    .upsert({ ...singleRow, barcode: null }, { onConflict: 'id' });
                }
              }
            }
            break;
          }
        }
      })().catch(() => {});
    }

    return { data: mappedMedicines };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

// Inbound (Server-Side Pagination & Search): Fetch paginated `master_obat` rows with .range() & .ilike()
export async function fetchMedicinesPaginatedFromSupabase(params: {
  page: number;
  pageSize: number;
  searchQuery?: string;
  categoryFilter?: string;
  rackFilter?: string;
  stockStatusFilter?: string;
  sortBy?: 'name' | 'hpp' | 'sellPrice' | 'sellPriceKlinik' | 'sellPriceMitra' | 'stock' | null;
  sortOrder?: 'asc' | 'desc';
  includeIds?: string[];
  excludeIds?: string[];
}): Promise<PaginatedQueryResult<Medicine>> {
  const safePage = Math.max(1, Math.floor(params.page || 1));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 25)));

  if (isDemoMode()) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: 'Mode Demo aktif (isolasi sandbox)'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: 'Klien Supabase belum dikonfigurasi'
    };
  }

  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const cleanSearch = sanitizePostgrestSearchTerm(params.searchQuery || '');

  const hasIncludeFilter = Array.isArray(params.includeIds);
  const hasExcludeFilter = Array.isArray(params.excludeIds) && params.excludeIds.length > 0;
  const normalizedCategory =
    params.categoryFilter && params.categoryFilter !== 'SEMUA' && params.categoryFilter !== 'ALL'
      ? params.categoryFilter
      : '';
  const normalizedRack =
    params.rackFilter && params.rackFilter !== 'SEMUA' && params.rackFilter !== 'ALL'
      ? params.rackFilter
      : '';
  const sortCol:
    | 'name'
    | 'hpp'
    | 'sell_price'
    | 'sell_price_klinik'
    | 'sell_price_mitra'
    | 'stock'
    | 'id' =
    params.sortBy === 'name'
      ? 'name'
      : params.sortBy === 'hpp'
      ? 'hpp'
      : params.sortBy === 'sellPrice'
      ? 'sell_price'
      : params.sortBy === 'sellPriceKlinik'
      ? 'sell_price_klinik'
      : params.sortBy === 'sellPriceMitra'
      ? 'sell_price_mitra'
      : params.sortBy === 'stock'
      ? 'stock'
      : 'id';
  const sortAscending = sortCol === 'id' ? true : params.sortOrder !== 'desc';

  if (hasIncludeFilter && params.includeIds!.length === 0) {
    return {
      data: [],
      totalCount: 0,
      page: 1,
      pageSize: safePageSize,
      totalPages: 1
    };
  }

  const buildSearchFilter = (useLegacyKekuatan: boolean) => {
    const strengthCol = useLegacyKekuatan ? 'kekuatan' : 'zat_aktif_kekuatan';
    const observed = observedMedicineColumnsMap.get(tableName);
    const missing = missingMedicineColumnsMap.get(tableName);
    const formCol =
      observed && !observed.has('form') && observed.has('bentuk_sediaan')
        ? 'bentuk_sediaan'
        : !missing?.has('form') && (!observed || observed.has('form'))
        ? 'form'
        : '';
    const formFilter = formCol ? `,${formCol}.ilike.%${cleanSearch}%` : '';
    return `name.ilike.%${cleanSearch}%,id.ilike.%${cleanSearch}%,barcode.ilike.%${cleanSearch}%,batch_no.ilike.%${cleanSearch}%,rack.ilike.%${cleanSearch}%,kelas.ilike.%${cleanSearch}%,nappza.ilike.%${cleanSearch}%,${strengthCol}.ilike.%${cleanSearch}%${formFilter}`;
  };

  try {
    // Handle direct small ID subset (.in('id', includeIds)) cleanly via PostgREST pagination
    if (hasIncludeFilter && params.includeIds!.length <= 150 && params.stockStatusFilter !== 'MENIPIS') {
      const executeIncludedPagedQuery = async (useLegacyKekuatan: boolean) => {
        let query = client
          .from(tableName)
          .select('*', { count: 'exact' })
          .in('id', params.includeIds!);

        if (normalizedCategory) query = query.eq('category', normalizedCategory);
        if (normalizedRack) query = query.eq('rack', normalizedRack);
        if (cleanSearch) query = query.or(buildSearchFilter(useLegacyKekuatan));

        let orderedQuery = query.order(sortCol, { ascending: sortAscending });
        if (sortCol !== 'id') {
          orderedQuery = orderedQuery.order('id', { ascending: true });
        }
        return await orderedQuery.range(from, to);
      };

      let incRes = await executeIncludedPagedQuery(false);
      if (incRes.error?.message?.includes('zat_aktif_kekuatan')) {
        incRes = await executeIncludedPagedQuery(true);
      }

      if (incRes.error) {
        if (isMedicineTableMissingError(incRes.error)) {
          return {
            data: null,
            totalCount: 0,
            page: safePage,
            pageSize: safePageSize,
            totalPages: 1,
            needsTableSetup: true,
            error: `Tabel ${tableName} belum dibuat di Supabase.`
          };
        }
        return {
          data: null,
          totalCount: 0,
          page: safePage,
          pageSize: safePageSize,
          totalPages: 1,
          error: incRes.error.message
        };
      }

      const totalCount = typeof incRes.count === 'number' ? incRes.count : (incRes.data?.length ?? 0);
      const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
      return {
        data: (incRes.data || []).map(supabaseRowToMedicine),
        totalCount,
        page: safePage,
        pageSize: safePageSize,
        totalPages
      };
    }

    // Handle column-to-column filter (stock <= min_stock) or large include/exclude ID sets efficiently:
    // Fetch only lightweight ID/stock columns in range loop, slice active page's IDs, then load full rows ONLY for active page (.in('id', pageIds)).
    if (
      params.stockStatusFilter === 'MENIPIS' ||
      hasExcludeFilter ||
      (hasIncludeFilter && params.includeIds!.length > 150)
    ) {
      const selectCols = params.stockStatusFilter === 'MENIPIS' ? 'id, stock, min_stock' : 'id';
      const includeSet = hasIncludeFilter ? new Set(params.includeIds!) : null;
      const excludeSet = hasExcludeFilter ? new Set(params.excludeIds!) : null;

      const fetchMatchingIdsPaged = async (useLegacyKekuatan: boolean) => {
        const chunkSize = 1000;
        let offset = 0;
        let keepFetching = true;
        const collected: any[] = [];

        while (keepFetching) {
          let idQuery = client
            .from(tableName)
            .select(selectCols)
            .order(sortCol, { ascending: sortAscending });

          if (sortCol !== 'id') {
            idQuery = idQuery.order('id', { ascending: true });
          }

          idQuery = idQuery.range(offset, offset + chunkSize - 1);

          if (normalizedCategory) idQuery = idQuery.eq('category', normalizedCategory);
          if (normalizedRack) idQuery = idQuery.eq('rack', normalizedRack);
          if (cleanSearch) idQuery = idQuery.or(buildSearchFilter(useLegacyKekuatan));

          const chunkRes = await idQuery;
          if (chunkRes.error) return { data: null as any[] | null, error: chunkRes.error };

          const rows = chunkRes.data || [];
          collected.push(...rows);
          if (rows.length < chunkSize) {
            keepFetching = false;
          } else {
            offset += chunkSize;
          }
        }
        return { data: collected, error: null };
      };

      let idScanRes = await fetchMatchingIdsPaged(false);
      if (idScanRes.error?.message?.includes('zat_aktif_kekuatan')) {
        idScanRes = await fetchMatchingIdsPaged(true);
      }

      if (idScanRes.error) {
        if (isMedicineTableMissingError(idScanRes.error)) {
          return {
            data: null,
            totalCount: 0,
            page: safePage,
            pageSize: safePageSize,
            totalPages: 1,
            needsTableSetup: true,
            error: `Tabel ${tableName} belum dibuat di Supabase.`
          };
        }
        return {
          data: null,
          totalCount: 0,
          page: safePage,
          pageSize: safePageSize,
          totalPages: 1,
          error: idScanRes.error.message
        };
      }

      const matchingIds = (idScanRes.data || [])
        .filter((r: any) => {
          const rowId = String(r.id);
          if (includeSet && !includeSet.has(rowId)) return false;
          if (excludeSet && excludeSet.has(rowId)) return false;
          if (params.stockStatusFilter === 'MENIPIS') {
            return Number(r.stock ?? 0) <= Number(r.min_stock ?? 0);
          }
          return true;
        })
        .map((r: any) => String(r.id));

      const totalCount = matchingIds.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
      const clampedPage = Math.min(safePage, totalPages);
      const sliceStart = (clampedPage - 1) * safePageSize;
      const pageIds = matchingIds.slice(sliceStart, sliceStart + safePageSize);

      if (pageIds.length === 0) {
        return {
          data: [],
          totalCount: 0,
          page: 1,
          pageSize: safePageSize,
          totalPages: 1
        };
      }

      let pageQuery = client
        .from(tableName)
        .select('*')
        .in('id', pageIds)
        .order(sortCol, { ascending: sortAscending });
      if (sortCol !== 'id') {
        pageQuery = pageQuery.order('id', { ascending: true });
      }
      const { data: pageRows, error: pageErr } = await pageQuery;

      if (pageErr) {
        return {
          data: null,
          totalCount: 0,
          page: clampedPage,
          pageSize: safePageSize,
          totalPages,
          error: pageErr.message
        };
      }

      if (pageRows && pageRows.length > 0) {
        recordObservedMedicineColumns(tableName, pageRows);
      }

      return {
        data: (pageRows || []).map(supabaseRowToMedicine),
        totalCount,
        page: clampedPage,
        pageSize: safePageSize,
        totalPages
      };
    }

    const executePagedQuery = async (useLegacyKekuatan: boolean) => {
      let query = client.from(tableName).select('*', { count: 'exact' });

      if (normalizedCategory) {
        query = query.eq('category', normalizedCategory);
      }

      if (normalizedRack) {
        query = query.eq('rack', normalizedRack);
      }

      if (params.stockStatusFilter === 'EXP_NEAR') {
        const threeMonthsDate = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
        query = query.gt('exp_date', '').lte('exp_date', threeMonthsDate);
      }

      if (cleanSearch) {
        query = query.or(buildSearchFilter(useLegacyKekuatan));
      }

      let orderedQuery = query.order(sortCol, { ascending: sortAscending });
      if (sortCol !== 'id') {
        orderedQuery = orderedQuery.order('id', { ascending: true });
      }
      return await orderedQuery.range(from, to);
    };

    let result = await executePagedQuery(false);
    if (result.error?.message?.includes('zat_aktif_kekuatan')) {
      result = await executePagedQuery(true);
    }

    if (result.error) {
      if (isMedicineTableMissingError(result.error)) {
        return {
          data: null,
          totalCount: 0,
          page: safePage,
          pageSize: safePageSize,
          totalPages: 1,
          needsTableSetup: true,
          error: `Tabel ${tableName} belum dibuat di Supabase.`
        };
      }
      console.warn('[Supabase Fetch Paginated master_obat Error]:', result.error.message);
      return {
        data: null,
        totalCount: 0,
        page: safePage,
        pageSize: safePageSize,
        totalPages: 1,
        error: result.error.message
      };
    }

    const totalCount = typeof result.count === 'number' ? result.count : (result.data?.length ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    if (result.data && result.data.length > 0) {
      recordObservedMedicineColumns(tableName, result.data);
    }
    const mapped = (result.data || []).map(supabaseRowToMedicine);

    return {
      data: mapped,
      totalCount,
      page: safePage,
      pageSize: safePageSize,
      totalPages
    };
  } catch (err: any) {
    console.warn('[Supabase Fetch Paginated master_obat Exception]:', err);
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: err?.message || String(err)
    };
  }
}

// Fetch lightweight category/rack filter facets + exact total count from `master_obat` (for paginated Stock Opname / Inventory views)
export async function fetchMedicineFilterFacetsFromSupabase(): Promise<{
  categories: string[];
  racks: string[];
  totalCount: number;
  error?: string;
}> {
  if (isDemoMode()) return { categories: [], racks: [], totalCount: 0, error: 'Mode Demo aktif' };
  const client = getSupabaseClient();
  if (!client) return { categories: [], racks: [], totalCount: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  const catSet = new Set<string>();
  const rackSet = new Set<string>();
  let totalCount = 0;

  try {
    const chunkSize = 1000;
    let offset = 0;
    let keepFetching = true;

    while (keepFetching) {
      const { data, count, error } = await client
        .from(tableName)
        .select('category, rack', offset === 0 ? { count: 'exact' } : undefined)
        .range(offset, offset + chunkSize - 1);

      if (error) {
        return { categories: [], racks: [], totalCount: 0, error: error.message };
      }
      if (offset === 0 && typeof count === 'number') {
        totalCount = count;
      }

      const rows = data || [];
      for (const r of rows) {
        if (r.category) catSet.add(String(r.category).trim());
        if (r.rack) rackSet.add(String(r.rack).trim());
      }
      if (offset > 0 || totalCount === 0) {
        totalCount = Math.max(totalCount, offset + rows.length);
      }

      if (rows.length < chunkSize) {
        keepFetching = false;
      } else {
        offset += chunkSize;
      }
    }

    return {
      categories: Array.from(catSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      racks: Array.from(rackSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      totalCount
    };
  } catch (err: any) {
    return { categories: [], racks: [], totalCount: 0, error: err?.message || String(err) };
  }
}

// Fetch a single medicine by exact barcode or ID directly from Supabase (for Barcode Scanner in paginated views)
export async function fetchMedicineByBarcodeOrIdFromSupabase(
  code: string
): Promise<{ data: Medicine | null; error?: string }> {
  if (isDemoMode()) return { data: null, error: 'Mode Demo aktif' };
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };

  const clean = sanitizePostgrestSearchTerm(code);
  if (!clean) return { data: null };

  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;

  try {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .or(`barcode.ilike.${clean},id.ilike.${clean}`)
      .limit(1);

    if (error) return { data: null, error: error.message };
    if (!data || data.length === 0) return { data: null };
    recordObservedMedicineColumns(tableName, data);
    return { data: supabaseRowToMedicine(data[0]) };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

// Fetch specific medicines by IDs (chunked safely for hydrating active session counts across pages)
export async function fetchMedicinesByIdsFromSupabase(
  ids: string[]
): Promise<{ data: Medicine[]; error?: string }> {
  if (isDemoMode()) return { data: [], error: 'Mode Demo aktif' };
  const client = getSupabaseClient();
  if (!client || !ids || ids.length === 0) return { data: [] };

  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || DEFAULT_MEDICINE_TABLE;
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));
  const collected: Medicine[] = [];

  try {
    const CHUNK = 150;
    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const slice = uniqueIds.slice(i, i + CHUNK);
      const { data, error } = await client.from(tableName).select('*').in('id', slice);
      if (error) return { data: collected, error: error.message };
      if (data && data.length > 0) {
        recordObservedMedicineColumns(tableName, data);
        collected.push(...data.map(supabaseRowToMedicine));
      }
    }
    return { data: collected };
  } catch (err: any) {
    return { data: collected, error: err?.message || String(err) };
  }
}

export function subscribeMedicinesRealtime(
  onInsert: (m: Medicine) => void,
  onUpdate: (m: Medicine) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;
  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || 'master_obat';
  const channelName = `realtime_${tableName}_${Date.now()}`;
  const syncRealtimePricingBackIfNeeded = (rawRow: Record<string, any>, med: Medicine) => {
    const check = doesRawMedicineRowNeedPricingOrHppSync(rawRow, med);
    if (!check.needed) return;
    syncMedicineToSupabase(med).catch(() => {});
  };
  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: tableName }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const med = supabaseRowToMedicine(p.new);
          onInsert(med);
          syncRealtimePricingBackIfNeeded(p.new, med);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tableName }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const med = supabaseRowToMedicine(p.new);
          onUpdate(med);
          syncRealtimePricingBackIfNeeded(p.new, med);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: tableName }, (p) => {
        if (isDemoMode()) return;
        if (p.old && p.old.id) onDelete(p.old.id);
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.warn('[Supabase Medicine Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_MEDICINES_SQL_SCHEMA = `-- SKEMA TABEL MASTER OBAT & HARGA BERTINGKAT (APOTEK & KLINIK LATISHA FARMA)
CREATE TABLE IF NOT EXISTS master_obat (
  id VARCHAR(50) PRIMARY KEY,
  barcode VARCHAR(100),
  name TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'Obat Bebas',
  kelas VARCHAR(100),
  nappza VARCHAR(50) DEFAULT 'Non-NAPPZA',
  status_resep VARCHAR(100),
  zat_aktif_kekuatan VARCHAR(150),
  form VARCHAR(100) DEFAULT 'Tablet',
  unit VARCHAR(50) DEFAULT 'Strip',
  satuan VARCHAR(100) DEFAULT 'Box / Tablet (1:10)',
  satuan_kecil VARCHAR(50) DEFAULT 'Tablet',
  satuan_besar VARCHAR(50) DEFAULT 'Box',
  rasio_konversi NUMERIC(10,2) DEFAULT 10,
  hna_besar NUMERIC(12,2) DEFAULT 0,          -- HNA Satuan Besar
  hpp NUMERIC(12,2) DEFAULT 0,                -- HPP Satuan Besar (HNA + PPN 11%)
  sell_price NUMERIC(12,2) DEFAULT 0,         -- Harga Reguler / OTC
  sell_price_klinik NUMERIC(12,2) DEFAULT 0,  -- Harga Bertingkat 2 (Pasien Klinik)
  sell_price_mitra NUMERIC(12,2) DEFAULT 0,   -- Harga Bertingkat 3 (Nakes / Mitra)
  markup_reguler NUMERIC(8,2) DEFAULT 100,    -- Default 100%
  markup_klinik NUMERIC(8,2) DEFAULT 100,     -- Default 100%
  markup_mitra NUMERIC(8,2) DEFAULT 25,       -- Default 25%
  stock NUMERIC(12,2) DEFAULT 0,
  min_stock NUMERIC(12,2) DEFAULT 5,
  max_stock NUMERIC(12,2) DEFAULT 100,
  batch_no VARCHAR(50),
  exp_date VARCHAR(50),
  batches JSONB DEFAULT '[]'::jsonb,
  rack VARCHAR(50),
  supplier VARCHAR(100),
  branch_id VARCHAR(50) DEFAULT 'cabang-pusat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman untuk tabel master_obat versi lama agar seluruh kolom tersedia
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Obat Bebas';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS kelas VARCHAR(100);
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS nappza VARCHAR(50) DEFAULT 'Non-NAPPZA';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS status_resep VARCHAR(100);

-- Jika tabel lama masih memakai kolom "kekuatan", ubah menjadi "zat_aktif_kekuatan"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'kekuatan'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'zat_aktif_kekuatan'
  ) THEN
    ALTER TABLE master_obat RENAME COLUMN kekuatan TO zat_aktif_kekuatan;
  END IF;
END $$;

-- Jika tabel lama masih memakai kolom "stok_awal", ubah menjadi "stock"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'stok_awal'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'stock'
  ) THEN
    ALTER TABLE master_obat RENAME COLUMN stok_awal TO stock;
  END IF;
END $$;

-- Jika tabel lama masih memakai kolom "satuan_dan_konversi" atau "satuan_konversi", ubah menjadi "satuan"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'satuan_dan_konversi'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'satuan'
  ) THEN
    ALTER TABLE master_obat RENAME COLUMN satuan_dan_konversi TO satuan;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'satuan_konversi'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'satuan'
  ) THEN
    ALTER TABLE master_obat RENAME COLUMN satuan_konversi TO satuan;
  END IF;
END $$;

-- Jika tabel lama masih memakai kolom "bentuk_sediaan", ubah menjadi "form"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'bentuk_sediaan'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_obat' AND column_name = 'form'
  ) THEN
    ALTER TABLE master_obat RENAME COLUMN bentuk_sediaan TO form;
  END IF;
END $$;

ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS zat_aktif_kekuatan VARCHAR(150);
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS form VARCHAR(100) DEFAULT 'Tablet';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'Strip';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS satuan VARCHAR(100) DEFAULT 'Box / Tablet (1:10)';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS satuan_kecil VARCHAR(50) DEFAULT 'Tablet';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS satuan_besar VARCHAR(50) DEFAULT 'Box';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS rasio_konversi NUMERIC(10,2) DEFAULT 10;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS hna_besar NUMERIC(12,2) DEFAULT 0;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS hpp NUMERIC(12,2) DEFAULT 0;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS sell_price_klinik NUMERIC(12,2) DEFAULT 0;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS sell_price_mitra NUMERIC(12,2) DEFAULT 0;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS markup_reguler NUMERIC(8,2) DEFAULT 100;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS markup_klinik NUMERIC(8,2) DEFAULT 100;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS markup_mitra NUMERIC(8,2) DEFAULT 25;
ALTER TABLE master_obat ALTER COLUMN markup_reguler SET DEFAULT 100;
ALTER TABLE master_obat ALTER COLUMN markup_klinik SET DEFAULT 100;
ALTER TABLE master_obat ALTER COLUMN markup_mitra SET DEFAULT 25;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS stock NUMERIC(12,2) DEFAULT 0;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,2) DEFAULT 5;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS max_stock NUMERIC(12,2) DEFAULT 100;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS batch_no VARCHAR(50);
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS exp_date VARCHAR(50);
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]'::jsonb;
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS rack VARCHAR(50);
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS supplier VARCHAR(100);
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'cabang-pusat';
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE master_obat ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Perluas panjang kolom zat_aktif_kekuatan & form bila tabel lama menggunakan VARCHAR lebih pendek, serta isi nilai default bentuk sediaan
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_obat'
      AND column_name = 'zat_aktif_kekuatan'
      AND character_maximum_length IS NOT NULL
      AND character_maximum_length < 150
  ) THEN
    ALTER TABLE master_obat ALTER COLUMN zat_aktif_kekuatan TYPE VARCHAR(150);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_obat'
      AND column_name = 'form'
      AND character_maximum_length IS NOT NULL
      AND character_maximum_length < 100
  ) THEN
    ALTER TABLE master_obat ALTER COLUMN form TYPE VARCHAR(100);
  END IF;
END $$;

UPDATE master_obat
SET form = 'Tablet'
WHERE COALESCE(TRIM(form), '') = '';

-- Trigger otomatis sinkronisasi kolom satuan + hitung %markup default (100% / 100% / 25%) & Harga Jual dari HPP + %Markup
CREATE OR REPLACE FUNCTION fn_master_obat_auto_pricing()
RETURNS TRIGGER AS $$
DECLARE
  v_ratio NUMERIC;
  v_hpp_besar NUMERIC;
  v_hpp_kecil NUMERIC;
  v_sat_match TEXT[];
BEGIN
  IF COALESCE(TRIM(NEW.satuan), '') <> '' AND (
    TG_OP = 'INSERT' OR (NEW.satuan IS DISTINCT FROM OLD.satuan AND NEW.satuan_besar IS NOT DISTINCT FROM OLD.satuan_besar AND NEW.satuan_kecil IS NOT DISTINCT FROM OLD.satuan_kecil)
  ) THEN
    v_sat_match := regexp_match(NEW.satuan, '^\s*([^/\(]+?)\s*/\s*([^\(\)]+?)(?:\s*\(\s*1\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\))?\s*$');
    IF v_sat_match IS NOT NULL THEN
      IF COALESCE(TRIM(v_sat_match[1]), '') <> '' THEN
        NEW.satuan_besar := TRIM(v_sat_match[1]);
      END IF;
      IF COALESCE(TRIM(v_sat_match[2]), '') <> '' THEN
        NEW.satuan_kecil := TRIM(v_sat_match[2]);
      END IF;
      IF COALESCE(TRIM(v_sat_match[3]), '') <> '' THEN
        NEW.rasio_konversi := GREATEST(1, v_sat_match[3]::NUMERIC);
      END IF;
    END IF;
  END IF;

  v_ratio := GREATEST(1, COALESCE(NEW.rasio_konversi, 10));
  NEW.satuan := COALESCE(NULLIF(TRIM(NEW.satuan_besar), ''), 'Box') || ' / ' || COALESCE(NULLIF(TRIM(NEW.satuan_kecil), ''), 'Tablet') || ' (1:' || TRIM(TO_CHAR(v_ratio, 'FM999999990.##')) || ')';

  IF TG_OP = 'UPDATE' THEN
    IF NEW.hna_besar IS DISTINCT FROM OLD.hna_besar AND NEW.hpp IS NOT DISTINCT FROM OLD.hpp AND COALESCE(NEW.hna_besar, 0) > 0 THEN
      NEW.hpp := ROUND(NEW.hna_besar * 1.11);
    ELSIF NEW.hpp IS DISTINCT FROM OLD.hpp AND NEW.hna_besar IS NOT DISTINCT FROM OLD.hna_besar AND COALESCE(NEW.hpp, 0) > 0 THEN
      NEW.hna_besar := ROUND(NEW.hpp / 1.11, 2);
    END IF;
  END IF;

  IF COALESCE(NEW.hna_besar, 0) > 0 AND COALESCE(NEW.hpp, 0) <= 0 THEN
    NEW.hpp := ROUND(NEW.hna_besar * 1.11);
  ELSIF COALESCE(NEW.hpp, 0) > 0 AND COALESCE(NEW.hna_besar, 0) <= 0 THEN
    NEW.hna_besar := ROUND(NEW.hpp / 1.11, 2);
  END IF;

  v_hpp_besar := COALESCE(NULLIF(NEW.hpp, 0), ROUND(COALESCE(NEW.hna_besar, 0) * 1.11));
  v_hpp_kecil := ROUND(v_hpp_besar / v_ratio);

  IF NEW.markup_reguler IS NULL OR (NEW.markup_reguler = 0 AND COALESCE(NEW.sell_price, 0) <= 0) THEN
    NEW.markup_reguler := 100;
  END IF;
  IF NEW.markup_klinik IS NULL OR (NEW.markup_klinik = 0 AND COALESCE(NEW.sell_price_klinik, 0) <= 0) THEN
    NEW.markup_klinik := 100;
  END IF;
  IF NEW.markup_mitra IS NULL OR (NEW.markup_mitra = 0 AND COALESCE(NEW.sell_price_mitra, 0) <= 0) THEN
    NEW.markup_mitra := 25;
  END IF;

  IF v_hpp_kecil > 0 THEN
    IF COALESCE(NEW.sell_price, 0) <= 0 OR (TG_OP = 'UPDATE' AND (NEW.hpp IS DISTINCT FROM OLD.hpp OR NEW.hna_besar IS DISTINCT FROM OLD.hna_besar OR NEW.markup_reguler IS DISTINCT FROM OLD.markup_reguler) AND NEW.sell_price IS NOT DISTINCT FROM OLD.sell_price) THEN
      NEW.sell_price := ROUND(v_hpp_kecil * (1 + NEW.markup_reguler / 100.0));
    END IF;
    IF COALESCE(NEW.sell_price_klinik, 0) <= 0 OR (TG_OP = 'UPDATE' AND (NEW.hpp IS DISTINCT FROM OLD.hpp OR NEW.hna_besar IS DISTINCT FROM OLD.hna_besar OR NEW.markup_klinik IS DISTINCT FROM OLD.markup_klinik) AND NEW.sell_price_klinik IS NOT DISTINCT FROM OLD.sell_price_klinik) THEN
      NEW.sell_price_klinik := ROUND(v_hpp_kecil * (1 + NEW.markup_klinik / 100.0));
    END IF;
    IF COALESCE(NEW.sell_price_mitra, 0) <= 0 OR (TG_OP = 'UPDATE' AND (NEW.hpp IS DISTINCT FROM OLD.hpp OR NEW.hna_besar IS DISTINCT FROM OLD.hna_besar OR NEW.markup_mitra IS DISTINCT FROM OLD.markup_mitra) AND NEW.sell_price_mitra IS NOT DISTINCT FROM OLD.sell_price_mitra) THEN
      NEW.sell_price_mitra := ROUND(v_hpp_kecil * (1 + NEW.markup_mitra / 100.0));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_master_obat_auto_pricing ON master_obat;
CREATE TRIGGER trg_master_obat_auto_pricing
BEFORE INSERT OR UPDATE ON master_obat
FOR EACH ROW EXECUTE FUNCTION fn_master_obat_auto_pricing();

ALTER TABLE master_obat REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_master_obat_name ON master_obat (name);
CREATE INDEX IF NOT EXISTS idx_master_obat_barcode ON master_obat (barcode);
CREATE INDEX IF NOT EXISTS idx_master_obat_category ON master_obat (category);
CREATE INDEX IF NOT EXISTS idx_master_obat_rack ON master_obat (rack);
CREATE INDEX IF NOT EXISTS idx_master_obat_batch_no ON master_obat (batch_no);
CREATE INDEX IF NOT EXISTS idx_master_obat_kelas ON master_obat (kelas);
CREATE INDEX IF NOT EXISTS idx_master_obat_form ON master_obat (form);

-- Aktifkan Realtime secara aman (tidak error jika tabel sudah terdaftar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'master_obat'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE master_obat;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('master_obat', { hasBranchId: true })}

NOTIFY pgrst, 'reload schema';
`;

// ================= PESANAN PENJUALAN MITRA (PORTAL ORDER MANDIRI MITRA) =================

export async function fetchPublicMedicinesCatalog(): Promise<{
  data: Medicine[];
  source: 'supabase' | 'local';
  error?: string;
}> {
  const client = getSupabaseClient();
  const getLocalFallback = (): Medicine[] => {
    if (typeof window !== 'undefined') {
      try {
        const saved = demoGetItem('latisha_medicines');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return INITIAL_MEDICINES;
  };

  if (isDemoMode()) {
    return { data: getLocalFallback(), source: 'local' };
  }

  if (!client) {
    return { data: getLocalFallback(), source: 'local', error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { medicineTable } = getSupabaseConfig();
  const tableName = medicineTable || 'master_obat';
  const PAGE_SIZE = 1000;
  const allRows: Record<string, any>[] = [];
  let from = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      const { data: batch, error } = await client
        .from(tableName)
        .select('*')
        .order('name', { ascending: true })
        .range(from, to);

      if (error) {
        return { data: getLocalFallback(), source: 'local', error: error.message };
      }

      if (batch && batch.length > 0) {
        allRows.push(...batch);
        if (batch.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    if (allRows.length === 0) {
      return { data: getLocalFallback(), source: 'local' };
    }

    recordObservedMedicineColumns(tableName, allRows);

    const uniqueMap = new Map<string, Medicine>();
    for (const row of allRows) {
      const med = supabaseRowToMedicine(row);
      if (med.id) {
        uniqueMap.set(med.id, med);
      }
    }

    return { data: Array.from(uniqueMap.values()), source: 'supabase' };
  } catch (err: any) {
    return { data: getLocalFallback(), source: 'local', error: err?.message || String(err) };
  }
}

export function mitraOrderToSupabaseRow(order: MitraOrder): Record<string, any> {
  return {
    id: order.id,
    order_code: order.orderCode,
    order_room: order.orderRoom || 'MITRA',
    mitra_id: order.mitraId || null,
    mitra_name: order.mitraName,
    mitra_category: order.mitraCategory || 'Klinik / Apotek Mitra',
    mitra_phone: order.mitraPhone || '',
    mitra_address: order.mitraAddress || '',
    pic_name: order.picName || '',
    items: Array.isArray(order.items) ? order.items : [],
    total_items: Number(order.totalItems) || 0,
    total_qty_box: Number(order.totalQtyBox) || 0,
    total_amount: Number(order.totalAmount) || 0,
    status: order.status || 'Pending',
    payment_method: order.paymentMethod || 'Transfer Bank',
    payment_status: order.paymentStatus || (order.status === 'Selesai' ? 'Lunas' : 'Menunggu Pembayaran'),
    payment_proof_url: order.paymentProofUrl || null,
    payment_proof_name: order.paymentProofName || null,
    payment_uploaded_at: order.paymentUploadedAt || null,
    payment_bank_target: order.paymentBankTarget || null,
    payment_verified_at: order.paymentVerifiedAt || null,
    payment_verified_by: order.paymentVerifiedBy || null,
    payment_rejection_reason: order.paymentRejectionReason || null,
    rx_required: Boolean(order.rxRequired),
    rx_requirement_label: order.rxRequirementLabel || null,
    rx_file_url: order.rxFileUrl || null,
    rx_file_name: order.rxFileName || null,
    rx_uploaded_at: order.rxUploadedAt || null,
    notes: order.notes || '',
    admin_notes: order.adminNotes || '',
    converted_trx_id: order.convertedTrxId || null,
    branch_id: order.branchId || 'BR-01',
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: order.updatedAt || new Date().toISOString()
  };
}

export function supabaseRowToMitraOrder(row: Record<string, any>): MitraOrder {
  let items: MitraOrderItem[] = [];
  if (Array.isArray(row.items)) {
    items = row.items;
  } else if (typeof row.items === 'string') {
    try {
      const parsed = JSON.parse(row.items);
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
  }

  const orderStatus = (row.status as MitraOrderStatus) || 'Pending';
  const rawPayStatus = row.payment_status || row.paymentStatus;
  const resolvedPayStatus: MitraPaymentStatus =
    rawPayStatus ||
    (orderStatus === 'Selesai'
      ? 'Lunas'
      : row.payment_proof_url || row.paymentProofUrl
      ? 'Menunggu Verifikasi'
      : 'Menunggu Pembayaran');

  const resolvedRoom: 'REGULER' | 'MITRA' =
    row.order_room === 'REGULER' ||
    row.orderRoom === 'REGULER' ||
    String(row.order_code || row.orderCode || '').startsWith('REG-')
      ? 'REGULER'
      : 'MITRA';

  return {
    id: row.id || row.order_code || `ORD-${Date.now().toString().slice(-6)}`,
    orderCode: row.order_code || row.orderCode || row.id || `ORD-MTR-${Date.now().toString().slice(-5)}`,
    orderRoom: resolvedRoom,
    mitraId: row.mitra_id || row.mitraId || undefined,
    mitraName: row.mitra_name || row.mitraName || 'Mitra Tanpa Nama',
    mitraCategory: row.mitra_category || row.mitraCategory || 'Mitra Faskes',
    mitraPhone: row.mitra_phone || row.mitraPhone || '',
    mitraAddress: row.mitra_address || row.mitraAddress || '',
    picName: row.pic_name || row.picName || '',
    items,
    totalItems: Number(row.total_items ?? row.totalItems ?? items.length),
    totalQtyBox: Number(row.total_qty_box ?? row.totalQtyBox ?? items.reduce((s, it) => s + (Number(it.qtyBox) || 0), 0)),
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    status: orderStatus,
    paymentMethod: row.payment_method || row.paymentMethod || 'Transfer Bank',
    paymentStatus: resolvedPayStatus,
    paymentProofUrl: row.payment_proof_url || row.paymentProofUrl || undefined,
    paymentProofName: row.payment_proof_name || row.paymentProofName || undefined,
    paymentUploadedAt: row.payment_uploaded_at || row.paymentUploadedAt || undefined,
    paymentBankTarget: row.payment_bank_target || row.paymentBankTarget || undefined,
    paymentVerifiedAt: row.payment_verified_at || row.paymentVerifiedAt || undefined,
    paymentVerifiedBy: row.payment_verified_by || row.paymentVerifiedBy || undefined,
    paymentRejectionReason: row.payment_rejection_reason || row.paymentRejectionReason || undefined,
    rxRequired: Boolean(row.rx_required ?? row.rxRequired),
    rxRequirementLabel: row.rx_requirement_label || row.rxRequirementLabel || undefined,
    rxFileUrl: row.rx_file_url || row.rxFileUrl || undefined,
    rxFileName: row.rx_file_name || row.rxFileName || undefined,
    rxUploadedAt: row.rx_uploaded_at || row.rxUploadedAt || undefined,
    notes: row.notes || '',
    adminNotes: row.admin_notes || row.adminNotes || '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || undefined,
    convertedTrxId: row.converted_trx_id || row.convertedTrxId || undefined,
    branchId: row.branch_id || row.branchId || 'BR-01'
  };
}

export async function syncMitraOrderToSupabase(
  order: MitraOrder
): Promise<{ success: boolean; error?: string; needsMigration?: boolean }> {
  if (isDemoMode()) {
    return { success: true };
  }
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { mitraOrderTable } = getSupabaseConfig();
  const tableName = mitraOrderTable || DEFAULT_MITRA_ORDER_TABLE;
  const row = mitraOrderToSupabaseRow(order);

  try {
    const { error } = await client
      .from(tableName)
      .upsert(row, { onConflict: 'id' });

    if (error) {
      const msg = error.message || '';
      const isMissingCol =
        error.code === 'PGRST204' ||
        error.code === '42703' ||
        msg.includes('payment_') ||
        msg.includes('order_room') ||
        msg.includes('rx_');
      if (isMissingCol) {
        const legacyRow = { ...row };
        delete legacyRow.order_room;
        delete legacyRow.rx_required;
        delete legacyRow.rx_requirement_label;
        delete legacyRow.rx_file_url;
        delete legacyRow.rx_file_name;
        delete legacyRow.rx_uploaded_at;
        delete legacyRow.payment_method;
        delete legacyRow.payment_status;
        delete legacyRow.payment_proof_url;
        delete legacyRow.payment_proof_name;
        delete legacyRow.payment_uploaded_at;
        delete legacyRow.payment_bank_target;
        delete legacyRow.payment_verified_at;
        delete legacyRow.payment_verified_by;
        delete legacyRow.payment_rejection_reason;

        const retryRes = await client.from(tableName).upsert(legacyRow, { onConflict: 'id' });
        if (!retryRes.error) {
          return {
            success: true,
            needsMigration: true,
            error: 'Pesanan tersimpan, namun kolom baru (ruang order / resep / bukti bayar) di Supabase perlu ditambahkan (jalankan SQL Tabel terbaru).'
          };
        }
      }
      console.warn('[Supabase Sync Mitra Order Error]:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Sync Mitra Order Exception]:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function fetchMitraOrdersFromSupabase(): Promise<{ data: MitraOrder[] | null; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };

  const { mitraOrderTable } = getSupabaseConfig();
  try {
    const { data, error } = await client
      .from(mitraOrderTable || DEFAULT_MITRA_ORDER_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase Fetch Mitra Orders Error]:', error.message);
      return { data: null, error: error.message };
    }

    return { data: (data || []).map(supabaseRowToMitraOrder) };
  } catch (err: any) {
    console.warn('[Supabase Fetch Mitra Orders Exception]:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

export async function deleteMitraOrderFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { mitraOrderTable } = getSupabaseConfig();
  try {
    const { error } = await client
      .from(mitraOrderTable || DEFAULT_MITRA_ORDER_TABLE)
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeMitraOrdersRealtime(
  onInsert: (order: MitraOrder) => void,
  onUpdate: (order: MitraOrder) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { mitraOrderTable } = getSupabaseConfig();
  const table = mitraOrderTable || DEFAULT_MITRA_ORDER_TABLE;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) onInsert(supabaseRowToMitraOrder(p.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) onUpdate(supabaseRowToMitraOrder(p.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(p.old.id);
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Mitra Orders Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_MITRA_ORDERS_SQL_SCHEMA = `-- SKEMA TABEL PESANAN PENJUALAN MITRA (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS pesanan_mitra (
  id VARCHAR(100) PRIMARY KEY,
  order_code VARCHAR(50) NOT NULL,
  order_room VARCHAR(30) DEFAULT 'MITRA', -- REGULER atau MITRA
  mitra_id VARCHAR(50),
  mitra_name VARCHAR(255) NOT NULL,
  mitra_category VARCHAR(100) DEFAULT 'Mitra Faskes',
  mitra_phone VARCHAR(50),
  mitra_address TEXT,
  pic_name VARCHAR(150),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_items INT DEFAULT 0,
  total_qty_box INT DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending', -- Pending, Dikonfirmasi, Diproses, Selesai, Dibatalkan
  payment_method VARCHAR(60) DEFAULT 'Transfer Bank',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'Menunggu Pembayaran', -- Menunggu Pembayaran, Menunggu Verifikasi, Lunas, Ditolak
  payment_proof_url TEXT,
  payment_proof_name VARCHAR(255),
  payment_uploaded_at TIMESTAMPTZ,
  payment_bank_target VARCHAR(150),
  payment_verified_at TIMESTAMPTZ,
  payment_verified_by VARCHAR(150),
  payment_rejection_reason TEXT,
  rx_required BOOLEAN DEFAULT FALSE,
  rx_requirement_label VARCHAR(80),
  rx_file_url TEXT,
  rx_file_name VARCHAR(255),
  rx_uploaded_at TIMESTAMPTZ,
  notes TEXT,
  admin_notes TEXT,
  converted_trx_id VARCHAR(100),
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel pesanan_mitra sudah dibuat sebelumnya:
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS order_room VARCHAR(30) DEFAULT 'MITRA';
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS rx_required BOOLEAN DEFAULT FALSE;
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS rx_requirement_label VARCHAR(80);
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS rx_file_url TEXT;
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS rx_file_name VARCHAR(255);
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS rx_uploaded_at TIMESTAMPTZ;
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_method VARCHAR(60) DEFAULT 'Transfer Bank';
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'Menunggu Pembayaran';
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_proof_name VARCHAR(255);
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_uploaded_at TIMESTAMPTZ;
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_bank_target VARCHAR(150);
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_verified_by VARCHAR(150);
ALTER TABLE pesanan_mitra ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_pesanan_mitra_status ON pesanan_mitra (status);
CREATE INDEX IF NOT EXISTS idx_pesanan_mitra_room ON pesanan_mitra (order_room);
CREATE INDEX IF NOT EXISTS idx_pesanan_mitra_payment_status ON pesanan_mitra (payment_status);
CREATE INDEX IF NOT EXISTS idx_pesanan_mitra_code ON pesanan_mitra (order_code);
CREATE INDEX IF NOT EXISTS idx_pesanan_mitra_created ON pesanan_mitra (created_at DESC);

ALTER TABLE pesanan_mitra REPLICA IDENTITY FULL;

-- Aktifkan Realtime secara aman (tidak error jika tabel sudah terdaftar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pesanan_mitra'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pesanan_mitra;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('pesanan_mitra', { hasBranchId: true })}
`;

// ============================================================================
// INTERAKSI OBAT (interaksi_obat) — Pencocokan Interaksi Obat Non-AI
// ============================================================================

export function normalizeInteractionSeverity(raw: any): DrugInteractionSeverity {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('contra') || s.includes('kontra') || s.includes('fatal') || s.includes('dilarang')) {
    return 'contraindicated';
  }
  if (
    s.includes('major') ||
    s.includes('mayor') ||
    s.includes('serious') ||
    s.includes('serius') ||
    s.includes('berat') ||
    s.includes('tinggi') ||
    s.includes('kritis') ||
    s.includes('parah') ||
    s.includes('severe') ||
    s === '3'
  ) {
    return 'major';
  }
  if (
    s.includes('minor') ||
    s.includes('ringan') ||
    s.includes('rendah') ||
    s.includes('kecil') ||
    s === '1'
  ) {
    return 'minor';
  }
  return 'moderate';
}

export function drugInteractionToSupabaseRow(item: DrugInteractionRecord): Record<string, any> {
  return {
    id: item.id,
    obat_a: item.obatA,
    obat_b: item.obatB,
    level: item.severity,
    mekanisme: item.mekanisme,
    efek: item.mekanisme,
    rekomendasi: item.manajemenKlinis
  };
}

export function supabaseRowToDrugInteraction(row: Record<string, any>, fallbackIdx = 0): DrugInteractionRecord {
  const lowerRow: Record<string, any> = {};
  for (const [k, v] of Object.entries(row || {})) {
    lowerRow[k.toLowerCase().trim()] = v;
  }

  const pick = (...keys: string[]): any => {
    for (const k of keys) {
      const val = lowerRow[k];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return val;
      }
    }
    return undefined;
  };

  const parseAliasList = (...vals: any[]): string[] => {
    const collected: string[] = [];
    for (const val of vals) {
      if (Array.isArray(val)) {
        val.forEach((v) => {
          const s = String(v ?? '').trim();
          if (s) collected.push(s);
        });
      } else if (typeof val === 'string' && val.trim()) {
        val.split(/[,;|/]+/).forEach((v) => {
          const s = v.trim();
          if (s) collected.push(s);
        });
      }
    }
    return Array.from(new Set(collected));
  };

  const obatA = String(
    pick(
      'obat_a',
      'obata',
      'obat_1',
      'obat1',
      'nama_obat_a',
      'nama_obat_1',
      'obat1_nama',
      'drug_a',
      'druga',
      'drug_1',
      'drug1',
      'drug_name_a',
      'drug1_name',
      'obat_pertama',
      'item_a',
      'bahan_aktif_a',
      'zat_aktif_a',
      'generik_a',
      'nama_generik_a',
      'komposisi_a'
    ) ?? ''
  ).trim();

  const obatB = String(
    pick(
      'obat_b',
      'obatb',
      'obat_2',
      'obat2',
      'nama_obat_b',
      'nama_obat_2',
      'obat2_nama',
      'drug_b',
      'drugb',
      'drug_2',
      'drug2',
      'drug_name_b',
      'drug2_name',
      'obat_kedua',
      'item_b',
      'bahan_aktif_b',
      'zat_aktif_b',
      'generik_b',
      'nama_generik_b',
      'komposisi_b'
    ) ?? ''
  ).trim();

  const aliasA = parseAliasList(
    pick('alias_a'),
    pick('aliases_a'),
    pick('komposisi_a'),
    pick('generik_a'),
    pick('nama_generik_a'),
    pick('zat_aktif_a'),
    pick('bahan_aktif_a'),
    pick('kandungan_a')
  );
  const aliasB = parseAliasList(
    pick('alias_b'),
    pick('aliases_b'),
    pick('komposisi_b'),
    pick('generik_b'),
    pick('nama_generik_b'),
    pick('zat_aktif_b'),
    pick('bahan_aktif_b'),
    pick('kandungan_b')
  );

  const severity = normalizeInteractionSeverity(
    pick('level', 'severity', 'tingkat_keparahan', 'keparahan', 'risk_level', 'derajat', 'tingkat', 'status')
  );

  const rawMekanisme = String(
    pick('mekanisme', 'mechanism', 'mekanisme_interaksi', 'description', 'uraian', 'keterangan') ?? ''
  ).trim();

  const rawEfek = String(
    pick('efek', 'efek_interaksi', 'efek_klinis', 'clinical_effect', 'dampak') ?? ''
  ).trim();

  let mekanisme = '-';
  if (rawEfek && rawMekanisme) {
    if (
      rawMekanisme.toLowerCase().includes(rawEfek.toLowerCase()) ||
      rawEfek.toLowerCase() === rawMekanisme.toLowerCase()
    ) {
      mekanisme = rawMekanisme;
    } else {
      mekanisme = `Efek Klinis: ${rawEfek} — Mekanisme: ${rawMekanisme}`;
    }
  } else if (rawMekanisme) {
    mekanisme = rawMekanisme;
  } else if (rawEfek) {
    mekanisme = rawEfek;
  }

  const manajemenKlinis = String(
    pick(
      'rekomendasi',
      'manajemen_klinis',
      'clinical_management',
      'manajemen',
      'penatalaksanaan',
      'tindakan',
      'solusi',
      'saran',
      'anjuran'
    ) ?? '-'
  ).trim();

  const referensi =
    String(
      pick('referensi', 'reference', 'url_referensi', 'sumber', 'source_ref', 'literatur') ?? ''
    ).trim() || undefined;

  return {
    id: String(pick('id', 'kode', 'code', 'no') ?? `SB-INT-${fallbackIdx + 1}-${obatA}-${obatB}`),
    obatA,
    obatB,
    aliasA,
    aliasB,
    severity,
    mekanisme,
    manajemenKlinis,
    referensi,
    source: 'supabase'
  };
}

export async function seedDrugInteractionsToSupabase(
  customList?: DrugInteractionRecord[]
): Promise<{ success: boolean; count: number; error?: string; rlsBlocked?: boolean }> {
  if (isDemoMode()) {
    return { success: false, count: 0, error: 'Mode Demo aktif (isolasi sandbox)' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  }
  const { interaksiObatTable } = getSupabaseConfig();
  const tableName = interaksiObatTable || DEFAULT_INTERAKSI_OBAT_TABLE;
  const sourceList = customList && customList.length > 0 ? customList : [];
  if (sourceList.length === 0) return { success: true, count: 0 };

  const rows = sourceList.map(drugInteractionToSupabaseRow);
  const CHUNK_SIZE = 250;

  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).upsert(chunk, { onConflict: 'id' });
      if (error) {
        const isRls =
          error.code === '42501' ||
          error.message?.toLowerCase().includes('row-level security') ||
          error.message?.toLowerCase().includes('permission denied');
        return {
          success: false,
          count: i,
          error: error.message,
          rlsBlocked: isRls
        };
      }
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function fetchDrugInteractionsFromSupabase(timeoutMs = 12000): Promise<{
  data: DrugInteractionRecord[] | null;
  error?: string;
  isDemo?: boolean;
  rlsBlocked?: boolean;
}> {
  if (isDemoMode()) {
    console.log('[Interaction Checker][Supabase] Mode Demo aktif — query Supabase dilewati untuk isolasi sandbox.');
    return {
      data: null,
      error: 'Mode Demo / Sandbox aktif — data interaksi_obat terisolasi dari database produksi.',
      isDemo: true
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    console.warn('[Interaction Checker][Supabase] Klien Supabase tidak aktif.');
    return { data: null, error: 'Klien Supabase tidak aktif atau belum dikonfigurasi.', isDemo: false };
  }

  const { interaksiObatTable } = getSupabaseConfig();
  const tableName = interaksiObatTable || DEFAULT_INTERAKSI_OBAT_TABLE;
  const PAGE_SIZE = 1000;
  const allRows: Record<string, any>[] = [];
  let from = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({
            data: null,
            error: {
              message: `Koneksi ke tabel ${tableName} melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik).`
            }
          });
        }, timeoutMs);
      });

      const queryPromise = client
        .from(tableName)
        .select('*')
        .order('id', { ascending: true })
        .range(from, to);

      let result = (await Promise.race([queryPromise, timeoutPromise])) as {
        data: any[] | null;
        error: { message: string; code?: string } | null;
      };
      if (timeoutHandle) clearTimeout(timeoutHandle);

      // Fallback jika tabel menggunakan urutan kolom selain 'id'
      if (result.error && result.error.code === '42703') {
        const fallbackRes = await client.from(tableName).select('*').range(from, to);
        result = { data: fallbackRes.data, error: fallbackRes.error };
      }

      if (result.error) {
        console.warn(`[Interaction Checker][Supabase] Error fetch tabel "${tableName}":`, result.error.message);
        return { data: null, error: result.error.message, isDemo: false };
      }

      const batch = result.data || [];
      if (batch.length > 0) {
        allRows.push(...batch);
        if (batch.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    const mapped = allRows
      .map((row, idx) => supabaseRowToDrugInteraction(row, idx))
      .filter((r) => r.obatA && r.obatB);

    console.log(
      `[Interaction Checker][Supabase] Fetch tabel "${tableName}" selesai: ${allRows.length} baris mentah, ${mapped.length} aturan interaksi valid.`
    );

    if (allRows.length === 0) {
      return {
        data: [],
        rlsBlocked: true,
        isDemo: false
      };
    }

    return { data: mapped, isDemo: false };
  } catch (err: any) {
    console.warn(`[Interaction Checker][Supabase] Exception tabel "${tableName}":`, err);
    return { data: null, error: err?.message || String(err), isDemo: false };
  }
}

// Helper: Ekstraksi kata kunci zat aktif bersih untuk query ILIKE dua arah ke Supabase interaksi_obat
function extractCleanDrugQueryKeywords(rawName: string): string[] {
  const cleaned = String(rawName || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(
      /\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|g|gr|gram|ml|l|iu|ui|meq|mmol|%|tablet|tab|tb|kaplet|kap|capl|kapsul|kaps|caps|syrup|sirup|syr|drop|drops|tetes|salep|krim|cream|gel|injeksi|inj|ampul|amp|vial|suppo|botol|btl|sachet|strip|box)\b/gi,
      ' '
    )
    .replace(
      /\b(r\/|no|dtd|tablet|tab|tb|kaplet|kap|capl|kapsul|kaps|caps|sirup|syrup|syr|drop|drops|tetes|salep|krim|cream|gel|injeksi|inj|ampul|amp|vial|suppo|suppositoria|ovula|botol|btl|sachet|strip|box|puyer|serbuk|suspensi|emulsi|larutan|infus|salut|selaput|lunak|kering|generik|paten|hcl|besylate|besilat|cilexetil|axetil|medoxomil|etexilate|maleate|maleat|tartrate|tartrat|fumarate|fumarat|succinate|suksinat|citrate|sitrat|sulfate|sulfat|phosphate|fosfat|acetate|asetat|trihydrate|trihidrat|dihydrate|dihidrat|monohydrate|monohidrat|anhydrous|anhidrat|sodium|natrium|potassium|kalium|calcium|kalsium|mesylate|bromide|chloride|nitrate|forte|extra|plus|sr|er|xr|od|cr|mr|la)\b/gi,
      ' '
    )
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const keywords = new Set<string>();
  if (cleaned && cleaned.length >= 3) {
    keywords.add(cleaned);
    const words = cleaned.split(/\s+/).filter((w) => w.length >= 4 && w !== 'asam' && w !== 'acid');
    words.forEach((w) => keywords.add(w));
  }

  // Padanan nama generik Indonesia <-> Internasional agar ILIKE dua arah di Supabase tetap cocok
  const bilingualEquivalents: Array<[string, string[]]> = [
    ['captopril', ['captopril', 'kaptopril']],
    ['candesartan', ['candesartan', 'kandesartan']],
    ['amlodipine', ['amlodipine', 'amlodipin']],
    ['simvastatin', ['simvastatin', 'simvastatine']],
    ['omeprazole', ['omeprazole', 'omeprazol']],
    ['esomeprazole', ['esomeprazole', 'esomeprazol']],
    ['lansoprazole', ['lansoprazole', 'lansoprazol']],
    ['pantoprazole', ['pantoprazole', 'pantoprazol']],
    ['clopidogrel', ['clopidogrel', 'klopidogrel']],
    ['mefenamic acid', ['asam mefenamat', 'mefenamat', 'mefenamic']],
    ['diclofenac', ['diklofenak', 'diclofenac', 'cataflam', 'voltaren']],
    ['ketorolac', ['ketorolac', 'ketorolak']],
    ['meloxicam', ['meloxicam', 'meloksikam']],
    ['piroxicam', ['piroxicam', 'piroksikam']],
    ['aspirin', ['aspirin', 'asetosal', 'aspilet']],
    ['dexamethasone', ['dexamethasone', 'deksametason']],
    ['methylprednisolone', ['methylprednisolone', 'metilprednisolon']],
    ['prednisone', ['prednisone', 'prednison', 'prednisolone']],
    ['spironolactone', ['spironolactone', 'spironolakton']],
    ['furosemide', ['furosemide', 'furosemid']],
    ['ciprofloxacin', ['ciprofloxacin', 'siprofloksasin']],
    ['levofloxacin', ['levofloxacin', 'levofloksasin']],
    ['azithromycin', ['azithromycin', 'azitromisin']],
    ['erythromycin', ['erythromycin', 'eritromisin']],
    ['clarithromycin', ['clarithromycin', 'klaritromisin']],
    ['allopurinol', ['allopurinol', 'alopurinol']],
    ['paracetamol', ['paracetamol', 'parasetamol', 'acetaminophen']],
    ['amoxicillin', ['amoxicillin', 'amoksisilin']],
    ['cetirizine', ['cetirizine', 'setirizin']],
    ['chlorpheniramine', ['chlorpheniramine', 'klorfeniramin', 'ctm']],
    ['domperidone', ['domperidone', 'domperidon']],
    ['metoclopramide', ['metoclopramide', 'metoklopramid']],
    ['glimepiride', ['glimepiride', 'glimepirid']],
    ['glibenclamide', ['glibenclamide', 'glibenklamid']]
  ];

  const rawLower = String(rawName || '').toLowerCase();
  for (const [canonical, variants] of bilingualEquivalents) {
    if (variants.some((v) => rawLower.includes(v) || cleaned.includes(v))) {
      keywords.add(canonical);
      variants.forEach((v) => keywords.add(v));
    }
  }

  return Array.from(keywords).slice(0, 4);
}

/**
 * Query pasangan obat secara bolak-balik (kombinasi dua arah / bidirectional) langsung ke tabel `interaksi_obat` Supabase:
 * Untuk setiap pasangan obat (Ox, Oy) dari daftar resep [O1, O2, O3, ...]:
 *   (obat_a ILIKE %Ox% AND obat_b ILIKE %Oy%) OR (obat_a ILIKE %Oy% AND obat_b ILIKE %Ox%)
 */
export async function queryBidirectionalDrugInteractionsSupabase(
  drugNames: string[],
  medicines: Medicine[] = [],
  timeoutMs = 10000
): Promise<{
  matchedRules: DrugInteractionRecord[];
  error?: string;
}> {
  if (isDemoMode()) {
    return { matchedRules: [] };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { matchedRules: [], error: 'Klien Supabase belum aktif' };
  }

  const validNames = (drugNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (validNames.length < 2) {
    return { matchedRules: [] };
  }

  const { interaksiObatTable } = getSupabaseConfig();
  const tableName = interaksiObatTable || DEFAULT_INTERAKSI_OBAT_TABLE;

  const resolvedNames = validNames.map((name) => resolveGenericDrugName(name, medicines));
  const drugKeywordSets = resolvedNames.map((name) => extractCleanDrugQueryKeywords(name));
  const orConditions: string[] = [];

  for (let i = 0; i < drugKeywordSets.length; i++) {
    for (let j = i + 1; j < drugKeywordSets.length; j++) {
      const kwListX = drugKeywordSets[i];
      const kwListY = drugKeywordSets[j];
      for (const ox of kwListX) {
        for (const oy of kwListY) {
          if (!ox || !oy || ox === oy) continue;
          const safeOx = ox.replace(/[,()]/g, '').trim();
          const safeOy = oy.replace(/[,()]/g, '').trim();
          if (!safeOx || !safeOy) continue;
          // Kondisi dua arah: (obat_a ILIKE %Ox% DAN obat_b ILIKE %Oy%) ATAU (obat_a ILIKE %Oy% DAN obat_b ILIKE %Ox%)
          orConditions.push(`and(obat_a.ilike.%${safeOx}%,obat_b.ilike.%${safeOy}%)`);
          orConditions.push(`and(obat_a.ilike.%${safeOy}%,obat_b.ilike.%${safeOx}%)`);
        }
      }
    }
  }

  if (orConditions.length === 0) {
    return { matchedRules: [] };
  }

  const uniqueConditions = Array.from(new Set(orConditions));
  const CHUNK_CONDITIONS = 24;
  const collectedRows: Record<string, any>[] = [];

  try {
    for (let idx = 0; idx < uniqueConditions.length; idx += CHUNK_CONDITIONS) {
      const slice = uniqueConditions.slice(idx, idx + CHUNK_CONDITIONS);
      const filterExpr = slice.join(',');

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({
            data: null,
            error: { message: 'Timeout saat query pasangan interaksi_obat dua arah' }
          });
        }, timeoutMs);
      });

      const queryPromise = client.from(tableName).select('*').or(filterExpr);
      const res = (await Promise.race([queryPromise, timeoutPromise])) as {
        data: any[] | null;
        error: { message: string } | null;
      };
      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (!res.error && Array.isArray(res.data)) {
        collectedRows.push(...res.data);
      }
    }

    const dedupMap = new Map<string, DrugInteractionRecord>();
    collectedRows.forEach((row, idx) => {
      const mapped = supabaseRowToDrugInteraction(row, idx);
      if (mapped.obatA && mapped.obatB) {
        dedupMap.set(mapped.id, mapped);
      }
    });

    return { matchedRules: Array.from(dedupMap.values()) };
  } catch (err: any) {
    console.warn('[Interaction Checker][Bidirectional Query Exception]:', err);
    return { matchedRules: [], error: err?.message || String(err) };
  }
}

export const SUPABASE_INTERAKSI_OBAT_SQL_SCHEMA = `-- SKEMA TABEL INTERAKSI OBAT (APOTEK & KLINIK LATISHA FARMA)
CREATE TABLE IF NOT EXISTS interaksi_obat (
  id VARCHAR(100) PRIMARY KEY,
  obat_a VARCHAR(200) NOT NULL,
  obat_b VARCHAR(200) NOT NULL,
  level VARCHAR(40) NOT NULL DEFAULT 'moderate', -- minor, moderate, major, contraindicated
  mekanisme TEXT,
  efek TEXT,
  rekomendasi TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaksi_obat_pair ON interaksi_obat (obat_a, obat_b);

ALTER TABLE interaksi_obat REPLICA IDENTITY FULL;

${buildMultiTenantRlsSqlBlock('interaksi_obat', { isReferenceTable: true })}
`;

// ============================================================================
// PROFIL FASILITAS: APOTEK, APJ & DPJ (profil_fasilitas) — Sinkronisasi 2-Arah
// ============================================================================

export interface FacilityProfileBundle {
  pharmacy?: Partial<PharmacyProfile>;
  apj?: Partial<APJProfile>;
  dpj?: Partial<DPJProfile>;
  rolePermissions?: Record<string, string[]>;
  updatedAt?: string;
}

const isMissingTableOrRlsError = (message?: string, code?: string): boolean => {
  const msg = String(message || '').toLowerCase();
  const c = String(code || '').toUpperCase();
  return (
    c === 'PGRST205' ||
    c === '42P01' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('relation') && msg.includes('does not exist')
  );
};

const parseJsonMaybe = <T>(val: any): T | null => {
  if (!val) return null;
  if (typeof val === 'object') return val as T;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return null;
};

const LEGACY_TENANT_FACILITY_REGEX = /\b(a?potek\s+sehat(\s+farma)?)\b/gi;

const sanitizeLegacyTenantFacilityText = (value?: string | null): string => {
  if (!value) return '';
  return String(value).replace(LEGACY_TENANT_FACILITY_REGEX, 'APOTEK LATISHA FARMA');
};

export function facilityProfilesToSupabaseRow(bundle: {
  pharmacy: PharmacyProfile;
  apj: APJProfile;
  dpj: DPJProfile;
  rolePermissions?: Record<string, string[]>;
}): Record<string, any> {
  const { pharmacy, apj, dpj } = bundle;
  const resolvedRolePermissions = normalizeRolePermissionsMap(
    bundle.rolePermissions || getSavedRolePermissions()
  );
  const nowIso = new Date().toISOString();
  const cleanPharmacyName = sanitizeLegacyTenantFacilityText(pharmacy.name || '');
  const cleanHeaderNote = sanitizeLegacyTenantFacilityText(pharmacy.headerNote || '');
  const normalizedBanks: PharmacyBankAccount[] = Array.isArray(pharmacy.bankAccounts)
    ? pharmacy.bankAccounts.map((b, idx) => ({
        id: b.id || `BNK-${idx + 1}`,
        bankName: b.bankName || '',
        accountNumber: b.accountNumber || '',
        accountHolder: b.accountHolder || ''
      }))
    : [];

  return {
    id: DEFAULT_FACILITY_PROFILE_ROW_ID,
    nama_apotek: cleanPharmacyName,
    sia: pharmacy.sia || '',
    alamat: pharmacy.address || '',
    kota: pharmacy.city || '',
    telepon: pharmacy.phone || '',
    email: pharmacy.email || '',
    npwp: pharmacy.npwp || '',
    nib: pharmacy.nib || '',
    catatan_kop: cleanHeaderNote,
    jadwal_operasional: pharmacy.operationalSchedule || '',
    logo_url: pharmacy.logoUrl || '',
    rekening_bank: normalizedBanks,
    pharmacy_json: {
      name: cleanPharmacyName,
      sia: pharmacy.sia || '',
      address: pharmacy.address || '',
      city: pharmacy.city || '',
      phone: pharmacy.phone || '',
      email: pharmacy.email || '',
      npwp: pharmacy.npwp || '',
      nib: pharmacy.nib || '',
      headerNote: cleanHeaderNote,
      operationalDays: pharmacy.operationalDays || '',
      operationalOpenTime: pharmacy.operationalOpenTime || '',
      operationalCloseTime: pharmacy.operationalCloseTime || '',
      operationalSchedule: pharmacy.operationalSchedule || '',
      logoUrl: pharmacy.logoUrl || '',
      bankAccounts: normalizedBanks,
      ...(typeof pharmacy.latitude === 'number' && Number.isFinite(pharmacy.latitude)
        ? { latitude: pharmacy.latitude }
        : {}),
      ...(typeof pharmacy.longitude === 'number' && Number.isFinite(pharmacy.longitude)
        ? { longitude: pharmacy.longitude }
        : {}),
      ...(typeof pharmacy.checkInRadiusMeters === 'number' && Number.isFinite(pharmacy.checkInRadiusMeters)
        ? { checkInRadiusMeters: pharmacy.checkInRadiusMeters }
        : {}),
      ...(pharmacy.branchLocations && Object.keys(pharmacy.branchLocations).length > 0
        ? { branchLocations: pharmacy.branchLocations }
        : {})
    },
    apj_nama: apj.name || '',
    apj_sipa: apj.sipa || '',
    apj_stra: apj.stra || '',
    apj_telepon: apj.phone || '',
    apj_jadwal: apj.schedule || '',
    apj_catatan: apj.notes || '',
    apj_json: {
      name: apj.name || '',
      sipa: apj.sipa || '',
      stra: apj.stra || '',
      phone: apj.phone || '',
      schedule: apj.schedule || '',
      notes: apj.notes || '',
      _rolePermissions: resolvedRolePermissions
    },
    dpj_nama: dpj.name || '',
    dpj_sip: dpj.sip || '',
    dpj_idi: dpj.idi || '',
    dpj_spesialisasi: dpj.specialization || '',
    dpj_telepon: dpj.phone || '',
    dpj_jadwal: dpj.schedule || '',
    dpj_catatan: dpj.notes || '',
    dpj_json: {
      name: dpj.name || '',
      sip: dpj.sip || '',
      idi: dpj.idi || '',
      specialization: dpj.specialization || '',
      phone: dpj.phone || '',
      schedule: dpj.schedule || '',
      notes: dpj.notes || ''
    },
    updated_at: nowIso
  };
}

export function supabaseRowToFacilityProfiles(row: Record<string, any>): FacilityProfileBundle {
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(row || {})) {
    lower[k.toLowerCase().trim()] = v;
  }

  const pickDefined = (...keys: string[]): any => {
    for (const k of keys) {
      if (lower[k] !== undefined && lower[k] !== null) return lower[k];
    }
    return undefined;
  };

  const pickNonEmptyString = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = lower[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v);
      }
    }
    return undefined;
  };

  const rawPharmJson = parseJsonMaybe<Record<string, any>>(pickDefined('pharmacy_json', 'profil_apotek'));
  const rawApjJson = parseJsonMaybe<Record<string, any>>(pickDefined('apj_json', 'profil_apj'));
  const dpjJson = parseJsonMaybe<Partial<DPJProfile>>(pickDefined('dpj_json', 'profil_dpj'));

  const rawRolePermissions =
    (rawApjJson && typeof rawApjJson._rolePermissions === 'object' ? rawApjJson._rolePermissions : undefined) ||
    (rawPharmJson && typeof rawPharmJson._rolePermissions === 'object' ? rawPharmJson._rolePermissions : undefined) ||
    parseJsonMaybe<Record<string, string[]>>(pickDefined('role_permissions', 'hak_akses_peran'));

  let pharmJson: Partial<PharmacyProfile> | null = rawPharmJson as Partial<PharmacyProfile> | null;
  if (rawPharmJson && '_rolePermissions' in rawPharmJson) {
    const cleanPharm = { ...rawPharmJson };
    delete cleanPharm._rolePermissions;
    pharmJson = cleanPharm as Partial<PharmacyProfile>;
  }

  let apjJson: Partial<APJProfile> | null = rawApjJson as Partial<APJProfile> | null;
  if (rawApjJson && '_rolePermissions' in rawApjJson) {
    const cleanApj = { ...rawApjJson };
    delete cleanApj._rolePermissions;
    apjJson = cleanApj as Partial<APJProfile>;
  }

  const rawBanks = parseJsonMaybe<PharmacyBankAccount[]>(pickDefined('rekening_bank', 'bank_accounts'))
    || (Array.isArray(pharmJson?.bankAccounts) ? pharmJson.bankAccounts : undefined);

  const rawPharmacyName =
    pickNonEmptyString('nama_apotek', 'pharmacy_name', 'name') ?? pharmJson?.name;
  const rawHeaderNote =
    pickDefined('catatan_kop', 'header_note') !== undefined
      ? String(pickDefined('catatan_kop', 'header_note'))
      : pharmJson?.headerNote;

  const pharmacy: Partial<PharmacyProfile> = {
    ...(pharmJson || {}),
    ...(rawPharmacyName !== undefined
      ? { name: sanitizeLegacyTenantFacilityText(rawPharmacyName) }
      : {}),
    ...(pickDefined('sia', 'no_sia') !== undefined ? { sia: String(pickDefined('sia', 'no_sia')) } : {}),
    ...(pickDefined('alamat', 'address') !== undefined ? { address: String(pickDefined('alamat', 'address')) } : {}),
    ...(pickDefined('kota', 'city') !== undefined ? { city: String(pickDefined('kota', 'city')) } : {}),
    ...(pickDefined('telepon', 'phone', 'no_telp') !== undefined ? { phone: String(pickDefined('telepon', 'phone', 'no_telp')) } : {}),
    ...(pickDefined('email') !== undefined ? { email: String(pickDefined('email')) } : {}),
    ...(pickDefined('npwp') !== undefined ? { npwp: String(pickDefined('npwp')) } : {}),
    ...(pickDefined('nib') !== undefined ? { nib: String(pickDefined('nib')) } : {}),
    ...(rawHeaderNote !== undefined ? { headerNote: sanitizeLegacyTenantFacilityText(rawHeaderNote) } : {}),
    ...(pickNonEmptyString('jadwal_operasional', 'operational_schedule') !== undefined
      ? { operationalSchedule: pickNonEmptyString('jadwal_operasional', 'operational_schedule') }
      : {}),
    ...(pickDefined('logo_url', 'logo') !== undefined ? { logoUrl: String(pickDefined('logo_url', 'logo')) } : {}),
    ...(Array.isArray(rawBanks) ? { bankAccounts: rawBanks } : {})
  };

  const apj: Partial<APJProfile> = {
    ...(apjJson || {}),
    ...(pickNonEmptyString('apj_nama', 'apj_name', 'nama_apj') !== undefined
      ? { name: pickNonEmptyString('apj_nama', 'apj_name', 'nama_apj') }
      : {}),
    ...(pickDefined('apj_sipa', 'sipa') !== undefined ? { sipa: String(pickDefined('apj_sipa', 'sipa')) } : {}),
    ...(pickDefined('apj_stra', 'stra') !== undefined ? { stra: String(pickDefined('apj_stra', 'stra')) } : {}),
    ...(pickDefined('apj_telepon', 'apj_phone') !== undefined ? { phone: String(pickDefined('apj_telepon', 'apj_phone')) } : {}),
    ...(pickDefined('apj_jadwal', 'apj_schedule') !== undefined ? { schedule: String(pickDefined('apj_jadwal', 'apj_schedule')) } : {}),
    ...(pickDefined('apj_catatan', 'apj_notes') !== undefined ? { notes: String(pickDefined('apj_catatan', 'apj_notes')) } : {})
  };

  const dpj: Partial<DPJProfile> = {
    ...(dpjJson || {}),
    ...(pickNonEmptyString('dpj_nama', 'dpj_name', 'nama_dpj', 'djp_nama', 'djp_name') !== undefined
      ? { name: pickNonEmptyString('dpj_nama', 'dpj_name', 'nama_dpj', 'djp_nama', 'djp_name') }
      : {}),
    ...(pickDefined('dpj_sip', 'djp_sip', 'sip_dpj') !== undefined ? { sip: String(pickDefined('dpj_sip', 'djp_sip', 'sip_dpj')) } : {}),
    ...(pickDefined('dpj_idi', 'djp_idi', 'idi_dpj', 'kki') !== undefined ? { idi: String(pickDefined('dpj_idi', 'djp_idi', 'idi_dpj', 'kki')) } : {}),
    ...(pickDefined('dpj_spesialisasi', 'djp_spesialisasi', 'dpj_specialization') !== undefined
      ? { specialization: String(pickDefined('dpj_spesialisasi', 'djp_spesialisasi', 'dpj_specialization')) }
      : {}),
    ...(pickDefined('dpj_telepon', 'djp_telepon', 'dpj_phone') !== undefined ? { phone: String(pickDefined('dpj_telepon', 'djp_telepon', 'dpj_phone')) } : {}),
    ...(pickDefined('dpj_jadwal', 'djp_jadwal', 'dpj_schedule') !== undefined ? { schedule: String(pickDefined('dpj_jadwal', 'djp_jadwal', 'dpj_schedule')) } : {}),
    ...(pickDefined('dpj_catatan', 'djp_catatan', 'dpj_notes') !== undefined ? { notes: String(pickDefined('dpj_catatan', 'djp_catatan', 'dpj_notes')) } : {})
  };

  return {
    pharmacy,
    apj,
    dpj,
    ...(rawRolePermissions ? { rolePermissions: normalizeRolePermissionsMap(rawRolePermissions) } : {}),
    updatedAt: pickNonEmptyString('updated_at', 'created_at')
  };
}

export async function fetchFacilityProfilesFromSupabase(timeoutMs = 8000): Promise<{
  data: FacilityProfileBundle | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { data: null, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { facilityProfileTable } = getSupabaseConfig();
  const tableName = facilityProfileTable || DEFAULT_FACILITY_PROFILE_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil profil fasilitas (${Math.round(timeoutMs / 1000)} detik)` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .eq('id', DEFAULT_FACILITY_PROFILE_ROW_ID)
      .limit(1);
    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as { data: any[] | null; error: { message: string; code?: string } | null };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Profil Fasilitas] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const rows = data || [];
    if (rows.length === 0) {
      return { data: null, isEmpty: true };
    }

    return { data: supabaseRowToFacilityProfiles(rows[0]) };
  } catch (err: any) {
    console.warn('[Supabase Profil Fasilitas] Fetch exception:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncFacilityProfilesToSupabase(
  bundle: {
    pharmacy: PharmacyProfile;
    apj: APJProfile;
    dpj: DPJProfile;
    rolePermissions?: Record<string, string[]>;
  },
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
  updatedAt?: string;
}> {
  if (isDemoMode()) {
    return { success: false, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { facilityProfileTable } = getSupabaseConfig();
  const tableName = facilityProfileTable || DEFAULT_FACILITY_PROFILE_TABLE;
  const row = facilityProfilesToSupabaseRow(bundle);

  try {
    let currentRow: Record<string, any> = { ...row };
    let finalError: { message: string; code?: string } | null = null;
    const optionalCols = [
      'jadwal_operasional',
      'npwp',
      'nib',
      'rekening_bank',
      'catatan_kop',
      'logo_url'
    ];

    for (let attempt = 0; attempt <= optionalCols.length; attempt++) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({ error: { message: `Timeout sinkronisasi profil ke ${tableName}` } });
        }, timeoutMs);
      });

      const upsertPromise = client
        .from(tableName)
        .upsert(currentRow, { onConflict: 'id' })
        .select('id, updated_at')
        .limit(1);

      const result = await Promise.race([upsertPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const { error } = result as { data?: any[]; error: { message: string; code?: string } | null };
      if (!error) {
        finalError = null;
        break;
      }

      finalError = error;
      const msgLower = String(error.message || '').toLowerCase();
      const isSchemaColError =
        msgLower.includes('column') ||
        msgLower.includes('schema cache') ||
        error.code === 'PGRST204';
      const missingCol = isSchemaColError
        ? optionalCols.find((col) => col in currentRow && msgLower.includes(col))
        : undefined;

      if (missingCol) {
        const nextRow = { ...currentRow };
        delete nextRow[missingCol];
        currentRow = nextRow;
        continue;
      }
      break;
    }

    if (finalError) {
      const needsTableSetup = isMissingTableOrRlsError(finalError.message, finalError.code);
      console.warn(`[Supabase Profil Fasilitas] Upsert error (${tableName}):`, finalError.message);
      return { success: false, needsTableSetup, error: finalError.message };
    }

    return { success: true, updatedAt: row.updated_at };
  } catch (err: any) {
    console.warn('[Supabase Profil Fasilitas] Upsert exception:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeFacilityProfileRealtime(
  onUpdate: (bundle: FacilityProfileBundle) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { facilityProfileTable } = getSupabaseConfig();
  const table = facilityProfileTable || DEFAULT_FACILITY_PROFILE_TABLE;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) onUpdate(supabaseRowToFacilityProfiles(p.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) onUpdate(supabaseRowToFacilityProfiles(p.new));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Profil Fasilitas Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_FACILITY_PROFILE_SQL_SCHEMA = `-- SKEMA TABEL PROFIL FASILITAS: APOTEK, APJ & DPJ (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS profil_fasilitas (
  id VARCHAR(150) PRIMARY KEY DEFAULT 'MAIN-FACILITY',
  -- Profil Apotek
  nama_apotek VARCHAR(255) NOT NULL DEFAULT 'Apotek Latisha Farma',
  sia VARCHAR(150),
  alamat TEXT,
  kota VARCHAR(150),
  telepon VARCHAR(80),
  email VARCHAR(150),
  npwp VARCHAR(100),
  nib VARCHAR(100),
  catatan_kop TEXT,
  jadwal_operasional TEXT,
  logo_url TEXT,
  rekening_bank JSONB NOT NULL DEFAULT '[]'::jsonb,
  pharmacy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Profil APJ (Apoteker Penanggung Jawab)
  apj_nama VARCHAR(255),
  apj_sipa VARCHAR(150),
  apj_stra VARCHAR(150),
  apj_telepon VARCHAR(80),
  apj_jadwal TEXT,
  apj_catatan TEXT,
  apj_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Profil DPJ / DJP (Dokter Penanggung Jawab)
  dpj_nama VARCHAR(255),
  dpj_sip VARCHAR(150),
  dpj_idi VARCHAR(150),
  dpj_spesialisasi VARCHAR(255),
  dpj_telepon VARCHAR(80),
  dpj_jadwal TEXT,
  dpj_catatan TEXT,
  dpj_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah pernah dibuat sebelumnya:
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS sia VARCHAR(150);
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS npwp VARCHAR(100);
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS nib VARCHAR(100);
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS catatan_kop TEXT;
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS jadwal_operasional TEXT;
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS rekening_bank JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS pharmacy_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS apj_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS dpj_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profil_fasilitas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Muat ulang schema cache PostgREST agar kolom NIB & NPWP langsung aktif:
NOTIFY pgrst, 'reload schema';

-- Aktifkan Realtime secara aman (tidak error jika tabel sudah terdaftar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profil_fasilitas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profil_fasilitas;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('profil_fasilitas')}
`;

// ============================================================================
// RIWAYAT SKRINING RESEP & ANTREAN E-RESEP (riwayat_skrining_resep) — 2-Arah
// ============================================================================

export function prescriptionToSupabaseRow(rx: EPrescription): Record<string, any> {
  const baseChecks = rx.screeningChecks || {
    admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
    farmasetik: { bentukSediaan: true, dosis: true, stabilitas: true, kompatibilitas: true },
    klinis: { tepatDosis: true, tepatWaktu: true, kontraIndikasi: true, interaksi: true, duplikasi: true }
  };

  const hasExternalMeta =
    Boolean(rx.isExternalRx) ||
    Boolean(rx.originFacility) ||
    (rx.patientAge !== undefined && rx.patientAge !== '') ||
    Boolean(rx.patientAddress) ||
    Boolean(baseChecks.externalMeta);

  const hasPosQueueMeta =
    Boolean(baseChecks.posQueueMeta) ||
    rx.status === 'Antrian POS' ||
    rx.status === 'Lolos Skrining' ||
    rx.status === 'Selesai di POS';

  const enrichedChecks = {
    ...baseChecks,
    ...(hasExternalMeta
      ? {
          externalMeta: {
            isExternalRx: Boolean(rx.isExternalRx ?? baseChecks.externalMeta?.isExternalRx),
            originFacility: rx.originFacility ?? baseChecks.externalMeta?.originFacility ?? '',
            patientAge: rx.patientAge ?? baseChecks.externalMeta?.patientAge ?? '',
            patientAddress: rx.patientAddress ?? baseChecks.externalMeta?.patientAddress ?? ''
          }
        }
      : {}),
    ...(hasPosQueueMeta
      ? {
          posQueueMeta: {
            sentToPos: Boolean(
              baseChecks.posQueueMeta?.sentToPos ??
                (rx.status === 'Antrian POS' ||
                  rx.status === 'Lolos Skrining' ||
                  rx.status === 'Selesai di POS')
            ),
            sentToPosAt: baseChecks.posQueueMeta?.sentToPosAt || rx.screenedAt || '',
            sentToPosBy: baseChecks.posQueueMeta?.sentToPosBy || rx.screenedBy || '',
            ...(baseChecks.posQueueMeta?.processedPosTrxId
              ? { processedPosTrxId: baseChecks.posQueueMeta.processedPosTrxId }
              : {}),
            ...(baseChecks.posQueueMeta?.processedPosAt
              ? { processedPosAt: baseChecks.posQueueMeta.processedPosAt }
              : {})
          }
        }
      : {})
  };

  return {
    id: rx.id,
    rme_record_id: rx.rmeRecordId || null,
    rm_id: rx.rmId || '',
    patient_name: rx.patientName || '',
    doctor_name: rx.doctorName || '',
    items: Array.isArray(rx.items) ? rx.items : [],
    status: rx.status || 'Pending Skrining',
    rx_timestamp: rx.timestamp || new Date().toLocaleString('id-ID'),
    screening_notes: rx.screeningNotes || '',
    screening_checks: enrichedChecks,
    assigned_staff: Array.isArray(rx.assignedStaff) ? rx.assignedStaff : [],
    screened_by: rx.screenedBy || '',
    screened_at: rx.screenedAt || '',
    branch_id: rx.branchId || 'BR-01',
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToPrescription(row: Record<string, any>): EPrescription {
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(row || {})) {
    lower[k.toLowerCase().trim()] = v;
  }

  const pick = (...keys: string[]): any => {
    for (const k of keys) {
      if (lower[k] !== undefined && lower[k] !== null) return lower[k];
    }
    return undefined;
  };

  const parsedItems = parseJsonMaybe<PrescriptionItem[]>(pick('items', 'daftar_obat'));
  const parsedAssigned = parseJsonMaybe<StaffFeeItem[]>(pick('assigned_staff', 'petugas_terkait'));
  const parsedChecks = parseJsonMaybe<EPrescription['screeningChecks']>(
    pick('screening_checks', 'hasil_ceklis', 'checks')
  );

  const rawStatus = String(pick('status') || 'Pending Skrining').trim();
  const resolvedStatus: EPrescription['status'] = rawStatus || 'Pending Skrining';

  const extMeta = parsedChecks?.externalMeta;
  const resolvedId = String(pick('id', 'rx_id', 'no_resep') || `RX-${Date.now()}`);
  const isExternal =
    Boolean(pick('is_external_rx', 'isexternalrx')) ||
    Boolean(extMeta?.isExternalRx) ||
    resolvedId.startsWith('RXL-');

  return {
    id: resolvedId,
    rmeRecordId: pick('rme_record_id', 'rme_id') ? String(pick('rme_record_id', 'rme_id')) : undefined,
    rmId: String(pick('rm_id', 'no_rm') || ''),
    patientName: String(pick('patient_name', 'nama_pasien') || ''),
    patientAge:
      pick('patient_age', 'umur_pasien') !== undefined
        ? pick('patient_age', 'umur_pasien')
        : extMeta?.patientAge,
    patientAddress:
      pick('patient_address', 'alamat_pasien') !== undefined
        ? String(pick('patient_address', 'alamat_pasien'))
        : extMeta?.patientAddress,
    doctorName: String(pick('doctor_name', 'nama_dokter') || ''),
    originFacility:
      pick('origin_facility', 'instansi_asal') !== undefined
        ? String(pick('origin_facility', 'instansi_asal'))
        : extMeta?.originFacility,
    isExternalRx: isExternal,
    items: Array.isArray(parsedItems) ? parsedItems : [],
    status: resolvedStatus,
    timestamp: String(pick('rx_timestamp', 'timestamp', 'waktu') || new Date().toLocaleString('id-ID')),
    screeningNotes: String(pick('screening_notes', 'catatan_skrining') || ''),
    screenedBy: pick('screened_by', 'apoteker') ? String(pick('screened_by', 'apoteker')) : undefined,
    screenedAt: pick('screened_at', 'waktu_skrining') ? String(pick('screened_at', 'waktu_skrining')) : undefined,
    assignedStaff: Array.isArray(parsedAssigned) ? parsedAssigned : [],
    screeningChecks: parsedChecks || {
      admin: { namaDokter: true, sip: true, tglResep: true, paraf: true },
      farmasetik: { bentukSediaan: true, dosis: true, stabilitas: true, kompatibilitas: true },
      klinis: { tepatDosis: true, tepatWaktu: true, kontraIndikasi: true, interaksi: true, duplikasi: true }
    },
    branchId: String(pick('branch_id') || 'BR-01')
  };
}

export async function fetchPrescriptionsFromSupabase(timeoutMs = 8000): Promise<{
  data: EPrescription[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { data: null, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { prescriptionTable } = getSupabaseConfig();
  const tableName = prescriptionTable || DEFAULT_PRESCRIPTION_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('updated_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as { data: any[] | null; error: { message: string; code?: string } | null };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Riwayat Skrining Resep] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const rows = data || [];
    if (rows.length === 0) {
      return { data: [], isEmpty: true };
    }

    const mapped = rows
      .map(supabaseRowToPrescription)
      .filter((rx) => rx.id && !isDemoPrescriptionId(rx.id));

    return { data: mapped };
  } catch (err: any) {
    console.warn('[Supabase Riwayat Skrining Resep] Fetch exception:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

export function isDemoPrescriptionId(id?: string): boolean {
  const clean = String(id || '').trim();
  if (!clean) return false;
  return ['RX-9921', 'RX-9922', 'RX-9923'].includes(clean) || clean.startsWith('RX-DEMO-');
}

export async function syncPrescriptionToSupabase(
  rx: EPrescription,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { success: false, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { prescriptionTable } = getSupabaseConfig();
  const tableName = prescriptionTable || DEFAULT_PRESCRIPTION_TABLE;
  const row = prescriptionToSupabaseRow(rx);

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout mengirim data resep ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Riwayat Skrining Resep] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Riwayat Skrining Resep] Upsert exception:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedPrescriptionsToSupabase(
  prescriptions: EPrescription[],
  timeoutMs = 8000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { success: false, count: 0, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const valid = prescriptions.filter(
    (rx) => rx.id && !isDemoPrescriptionId(rx.id)
  );
  if (valid.length === 0) {
    return { success: true, count: 0 };
  }

  const { prescriptionTable } = getSupabaseConfig();
  const tableName = prescriptionTable || DEFAULT_PRESCRIPTION_TABLE;
  const rows = valid.map(prescriptionToSupabaseRow);

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai data ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(rows, { onConflict: 'id' });

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Riwayat Skrining Resep] Seed error (${tableName}):`, error.message);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    console.warn('[Supabase Riwayat Skrining Resep] Seed exception:', err);
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deletePrescriptionsFromSupabase(
  ids: string[],
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { success: false, isDemo: true };
  }

  const cleanIds = Array.from(
    new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (cleanIds.length === 0) {
    return { success: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { prescriptionTable } = getSupabaseConfig();
  const tableName = prescriptionTable || DEFAULT_PRESCRIPTION_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menghapus riwayat resep dari ${tableName}` } });
      }, timeoutMs);
    });

    const deletePromise =
      cleanIds.length === 1
        ? client.from(tableName).delete().eq('id', cleanIds[0])
        : client.from(tableName).delete().in('id', cleanIds);

    const result = await Promise.race([deletePromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Riwayat Skrining Resep] Delete error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Riwayat Skrining Resep] Delete exception:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deletePrescriptionFromSupabase(id: string): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  return deletePrescriptionsFromSupabase([id]);
}

export function subscribePrescriptionsRealtime(
  onInsert: (rx: EPrescription) => void,
  onUpdate: (rx: EPrescription) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { prescriptionTable } = getSupabaseConfig();
  const table = prescriptionTable || DEFAULT_PRESCRIPTION_TABLE;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) onInsert(supabaseRowToPrescription(p.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) onUpdate(supabaseRowToPrescription(p.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Riwayat Skrining Resep Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_PRESCRIPTION_SQL_SCHEMA = `-- SKEMA TABEL RIWAYAT SKRINING RESEP & ANTREAN E-RESEP (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS riwayat_skrining_resep (
  id VARCHAR(100) PRIMARY KEY,
  rme_record_id VARCHAR(100),
  rm_id VARCHAR(50) NOT NULL,
  patient_name VARCHAR(255) NOT NULL,
  doctor_name VARCHAR(255) NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending Skrining',
  rx_timestamp VARCHAR(100),
  screening_notes TEXT,
  screening_checks JSONB DEFAULT '{}'::jsonb,
  assigned_staff JSONB NOT NULL DEFAULT '[]'::jsonb,
  screened_by VARCHAR(255),
  screened_at VARCHAR(100),
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah pernah dibuat sebelumnya:
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS rme_record_id VARCHAR(100);
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS rx_timestamp VARCHAR(100);
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS screening_notes TEXT;
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS screening_checks JSONB DEFAULT '{}'::jsonb;
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS assigned_staff JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS screened_by VARCHAR(255);
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS screened_at VARCHAR(100);
ALTER TABLE riwayat_skrining_resep ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_skrining_resep_status ON riwayat_skrining_resep (status);
CREATE INDEX IF NOT EXISTS idx_skrining_resep_rm_id ON riwayat_skrining_resep (rm_id);
CREATE INDEX IF NOT EXISTS idx_skrining_resep_rme_id ON riwayat_skrining_resep (rme_record_id);
CREATE INDEX IF NOT EXISTS idx_skrining_resep_updated ON riwayat_skrining_resep (updated_at DESC);

ALTER TABLE riwayat_skrining_resep REPLICA IDENTITY FULL;

-- Aktifkan Realtime secara aman (tidak error jika tabel sudah terdaftar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'riwayat_skrining_resep'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE riwayat_skrining_resep;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('riwayat_skrining_resep', { hasBranchId: true })}
`;

// ============================================================================
// MASTER DATA MITRA / FASKES JEJARING (mitra) — Integrasi 2-Arah + Real-time
// ============================================================================

const DEMO_MITRA_IDS = new Set(['MTR-001', 'MTR-002', 'MTR-003']);
const ALLOWED_MITRA_CATEGORIES: NonNullable<Mitra['category']>[] = [
  'Klinik Pratama',
  'Klinik Utama',
  'Apotek Mitra',
  'Praktik Dokter Mandiri',
  'Rumah Sakit',
  'Lainnya'
];

export function mitraToSupabaseRow(m: Mitra): Record<string, any> {
  return {
    id: m.id,
    nama_faskes: (m.name || '').trim(),
    no_telepon: (m.phone || '').trim(),
    no_izin: (m.licenseNo || '').trim(),
    license_file_url: m.licenseFileUrl || null,
    license_file_name: m.licenseFileName || null,
    license_file_type: m.licenseFileType || null,
    license_uploaded_at: m.licenseUploadedAt || null,
    alamat: (m.address || '').trim(),
    kategori: m.category || 'Klinik Pratama',
    pic_nama: (m.picName || '').trim(),
    created_date: m.createdAt || new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString()
  };
}

function stripMitraLicenseFileColumns(row: Record<string, any>): Record<string, any> {
  const {
    license_file_url: _u,
    license_file_name: _n,
    license_file_type: _t,
    license_uploaded_at: _a,
    ...rest
  } = row;
  return rest;
}

export function supabaseRowToMitra(row: Record<string, any>): Mitra {
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(row || {})) {
    lower[k.toLowerCase().trim()] = v;
  }

  const pick = (...keys: string[]): any => {
    for (const k of keys) {
      if (lower[k] !== undefined && lower[k] !== null && String(lower[k]).trim() !== '') {
        return lower[k];
      }
    }
    return undefined;
  };

  const rawCategory = String(pick('kategori', 'category', 'jenis_faskes') || 'Klinik Pratama').trim();
  const resolvedCategory: Mitra['category'] = ALLOWED_MITRA_CATEGORIES.includes(
    rawCategory as NonNullable<Mitra['category']>
  )
    ? (rawCategory as Mitra['category'])
    : 'Klinik Pratama';

  const rawCreated = String(
    pick('created_date', 'created_at', 'tanggal_daftar') || new Date().toISOString().split('T')[0]
  ).trim();
  const createdAt = rawCreated.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(rawCreated)
    ? rawCreated.slice(0, 10)
    : rawCreated;

  return {
    id: String(pick('id', 'mitra_id', 'kode_mitra') || `MTR-${Date.now().toString().slice(-4)}`),
    name: String(pick('nama_faskes', 'name', 'mitra_name', 'nama_mitra') || 'Mitra Tanpa Nama'),
    phone: String(pick('no_telepon', 'phone', 'no_tlp', 'no_hp', 'telepon', 'mitra_phone') || ''),
    licenseNo: String(pick('no_izin', 'license_no', 'licenseno', 'nomor_izin', 'sip_klinik') || ''),
    licenseFileUrl: pick('license_file_url', 'file_izin_url', 'dokumen_izin_url')
      ? String(pick('license_file_url', 'file_izin_url', 'dokumen_izin_url'))
      : undefined,
    licenseFileName: pick('license_file_name', 'file_izin_nama', 'dokumen_izin_nama')
      ? String(pick('license_file_name', 'file_izin_nama', 'dokumen_izin_nama'))
      : undefined,
    licenseFileType: pick('license_file_type', 'file_izin_tipe', 'dokumen_izin_tipe')
      ? String(pick('license_file_type', 'file_izin_tipe', 'dokumen_izin_tipe'))
      : undefined,
    licenseUploadedAt: pick('license_uploaded_at', 'file_izin_uploaded_at')
      ? String(pick('license_uploaded_at', 'file_izin_uploaded_at'))
      : undefined,
    address: String(pick('alamat', 'address', 'mitra_address') || ''),
    category: resolvedCategory,
    picName: String(pick('pic_nama', 'pic_name', 'picname', 'penanggung_jawab') || ''),
    createdAt
  };
}

export async function fetchMitraFromSupabase(timeoutMs = 8000): Promise<{
  data: Mitra[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { data: null, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { mitraTable } = getSupabaseConfig();
  const tableName = mitraTable || DEFAULT_MITRA_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('updated_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Master Mitra] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const rows = data || [];
    if (rows.length === 0) {
      return { data: [], isEmpty: true };
    }

    const mapped = rows
      .map(supabaseRowToMitra)
      .filter((m) => m.id && !DEMO_MITRA_IDS.has(m.id));

    return { data: mapped };
  } catch (err: any) {
    console.warn('[Supabase Master Mitra] Fetch exception:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

export async function verifyMitraLoginFromSupabase(
  mitraNameInput: string,
  mitraIdInput: string,
  timeoutMs = 7000
): Promise<{
  mitra: Mitra | null;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { mitra: null, isDemo: true };
  }

  const cleanName = mitraNameInput.trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanId = mitraIdInput.trim();
  if (!cleanName || !cleanId) {
    return { mitra: null };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { mitra: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { mitraTable } = getSupabaseConfig();
  const tableName = mitraTable || DEFAULT_MITRA_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: 'Timeout verifikasi akun mitra' }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .ilike('id', cleanId)
      .limit(5);

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error || !Array.isArray(data) || data.length === 0) {
      return { mitra: null, error: error?.message };
    }

    const mapped = data
      .map(supabaseRowToMitra)
      .filter((m) => m.id && !DEMO_MITRA_IDS.has(m.id));

    const matched = mapped.find(
      (m) =>
        m.id.trim().toUpperCase() === cleanId.toUpperCase() &&
        m.name.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName
    );

    return { mitra: matched || null };
  } catch (err: any) {
    return { mitra: null, error: err?.message || String(err) };
  }
}

export async function syncMitraToSupabase(
  mitra: Mitra,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { success: false, isDemo: true };
  }

  if (!mitra?.id || DEMO_MITRA_IDS.has(mitra.id)) {
    return { success: false, error: 'ID Mitra tidak valid atau data sampel demo' };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { mitraTable } = getSupabaseConfig();
  const tableName = mitraTable || DEFAULT_MITRA_TABLE;
  const row = mitraToSupabaseRow(mitra);

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan data mitra ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const msgLower = (error.message || '').toLowerCase();
      if (
        msgLower.includes('license_file') ||
        msgLower.includes('license_uploaded_at') ||
        error.code === 'PGRST204'
      ) {
        const retryRes = await client
          .from(tableName)
          .upsert(stripMitraLicenseFileColumns(row), { onConflict: 'id' })
          .select('id')
          .limit(1);
        if (!retryRes.error) {
          return { success: true };
        }
      }
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Master Mitra] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Master Mitra] Upsert exception:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedMitraToSupabase(
  mitraList: Mitra[],
  timeoutMs = 8000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { success: false, count: 0, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const valid = (mitraList || []).filter((m) => m.id && !DEMO_MITRA_IDS.has(m.id));
  if (valid.length === 0) {
    return { success: true, count: 0 };
  }

  const { mitraTable } = getSupabaseConfig();
  const tableName = mitraTable || DEFAULT_MITRA_TABLE;
  const rows = valid.map(mitraToSupabaseRow);

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai data mitra ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(rows, { onConflict: 'id' });

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const msgLower = (error.message || '').toLowerCase();
      if (
        msgLower.includes('license_file') ||
        msgLower.includes('license_uploaded_at') ||
        error.code === 'PGRST204'
      ) {
        const retryRes = await client
          .from(tableName)
          .upsert(rows.map(stripMitraLicenseFileColumns), { onConflict: 'id' });
        if (!retryRes.error) {
          return { success: true, count: rows.length };
        }
      }
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Master Mitra] Seed error (${tableName}):`, error.message);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    console.warn('[Supabase Master Mitra] Seed exception:', err);
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteMitraFromSupabase(id: string): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { success: false, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { mitraTable } = getSupabaseConfig();
  const tableName = mitraTable || DEFAULT_MITRA_TABLE;

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeMitraRealtime(
  onInsert: (mitra: Mitra) => void,
  onUpdate: (mitra: Mitra) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { mitraTable } = getSupabaseConfig();
  const table = mitraTable || DEFAULT_MITRA_TABLE;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToMitra(p.new);
          if (!DEMO_MITRA_IDS.has(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToMitra(p.new);
          if (!DEMO_MITRA_IDS.has(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Master Mitra Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_MITRA_SQL_SCHEMA = `-- SKEMA TABEL MASTER DATA MITRA FASKES JEJARING (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS mitra (
  id VARCHAR(100) PRIMARY KEY,
  nama_faskes VARCHAR(255) NOT NULL,
  no_telepon VARCHAR(80) NOT NULL,
  no_izin VARCHAR(150) NOT NULL,
  license_file_url TEXT,
  license_file_name VARCHAR(255),
  license_file_type VARCHAR(100),
  license_uploaded_at TIMESTAMPTZ,
  alamat TEXT NOT NULL,
  kategori VARCHAR(100) DEFAULT 'Klinik Pratama',
  pic_nama VARCHAR(255),
  created_date VARCHAR(30),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah pernah dibuat sebelumnya:
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS license_file_url TEXT;
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS license_file_name VARCHAR(255);
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS license_file_type VARCHAR(100);
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS license_uploaded_at TIMESTAMPTZ;
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS kategori VARCHAR(100) DEFAULT 'Klinik Pratama';
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS pic_nama VARCHAR(255);
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS created_date VARCHAR(30);
ALTER TABLE mitra ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_mitra_nama_faskes ON mitra (nama_faskes);
CREATE INDEX IF NOT EXISTS idx_mitra_kategori ON mitra (kategori);
CREATE INDEX IF NOT EXISTS idx_mitra_updated ON mitra (updated_at DESC);

ALTER TABLE mitra REPLICA IDENTITY FULL;

-- Aktifkan Realtime secara aman (tidak error jika tabel sudah terdaftar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mitra'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mitra;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('mitra')}
`;

// =========================================================================
// LAPORAN MEDIS & MORBIDITAS (laporan_morbiditas) SUPABASE SYNC
// =========================================================================

export function morbidityReportToSupabaseRow(
  report: MedicalMorbidityReportRecord
): Record<string, any> {
  const nowIso = new Date().toISOString();
  return {
    id: report.id,
    title: report.title || '',
    report_type: report.reportType || 'KUNJUNGAN',
    start_date: report.startDate || null,
    end_date: report.endDate || null,
    min_age: report.minAge ?? null,
    max_age: report.maxAge ?? null,
    search_query: report.searchQuery || '',
    total_visits: Number(report.totalVisits) || 0,
    total_cases: Number(report.totalCases) || 0,
    pediatric_count: Number(report.pediatricCount) || 0,
    top_diagnoses: Array.isArray(report.topDiagnoses) ? report.topDiagnoses : [],
    notes: report.notes || '',
    created_by: report.createdBy || '',
    dpj_name: report.dpjName || '',
    apj_name: report.apjName || '',
    branch_id: report.branchId || 'BR-01',
    records_snapshot: Array.isArray(report.recordsSnapshot) ? report.recordsSnapshot : [],
    created_at: report.createdAt || nowIso,
    updated_at: report.updatedAt || nowIso
  };
}

export function supabaseRowToMorbidityReport(
  row: Record<string, any>
): MedicalMorbidityReportRecord {
  let topDiagnoses: MorbidityTopDiagnosis[] = [];
  const rawTop = row.top_diagnoses ?? row.topDiagnoses;
  if (rawTop) {
    try {
      const parsed = typeof rawTop === 'string' ? JSON.parse(rawTop) : rawTop;
      if (Array.isArray(parsed)) topDiagnoses = parsed;
    } catch {}
  }

  let recordsSnapshot: RMERecord[] | undefined;
  const rawSnap = row.records_snapshot ?? row.recordsSnapshot;
  if (rawSnap) {
    try {
      const parsed = typeof rawSnap === 'string' ? JSON.parse(rawSnap) : rawSnap;
      if (Array.isArray(parsed)) recordsSnapshot = parsed;
    } catch {}
  }

  const rawType = String(row.report_type || row.reportType || 'KUNJUNGAN').toUpperCase();
  const reportType: 'KUNJUNGAN' | 'KASUS' = rawType === 'KASUS' ? 'KASUS' : 'KUNJUNGAN';

  return {
    id: String(row.id || `LPM-${Date.now()}`),
    title: String(row.title || 'Laporan Medis & Morbiditas'),
    reportType,
    startDate: String(row.start_date || row.startDate || ''),
    endDate: String(row.end_date || row.endDate || ''),
    minAge:
      row.min_age !== null && row.min_age !== undefined && row.min_age !== ''
        ? Number(row.min_age)
        : row.minAge ?? null,
    maxAge:
      row.max_age !== null && row.max_age !== undefined && row.max_age !== ''
        ? Number(row.max_age)
        : row.maxAge ?? null,
    searchQuery: String(row.search_query || row.searchQuery || ''),
    totalVisits: Number(row.total_visits ?? row.totalVisits ?? 0),
    totalCases: Number(row.total_cases ?? row.totalCases ?? 0),
    pediatricCount: Number(row.pediatric_count ?? row.pediatricCount ?? 0),
    topDiagnoses,
    notes: String(row.notes || ''),
    createdBy: String(row.created_by || row.createdBy || ''),
    dpjName: String(row.dpj_name || row.dpjName || ''),
    apjName: String(row.apj_name || row.apjName || ''),
    branchId: String(row.branch_id || row.branchId || 'BR-01'),
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    updatedAt: row.updated_at || row.updatedAt || undefined,
    recordsSnapshot
  };
}

export async function fetchMorbidityReportsFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: MedicalMorbidityReportRecord[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { morbidityReportTable } = getSupabaseConfig();
  const tableName = morbidityReportTable || DEFAULT_MORBIDITY_REPORT_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Morbidity Reports] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const rows = data || [];
    if (rows.length === 0) return { data: [], isEmpty: true };
    return { data: rows.map(supabaseRowToMorbidityReport) };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncMorbidityReportToSupabase(
  report: MedicalMorbidityReportRecord,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!report?.id) return { success: false, error: 'ID laporan tidak valid' };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { morbidityReportTable } = getSupabaseConfig();
  const tableName = morbidityReportTable || DEFAULT_MORBIDITY_REPORT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = morbidityReportToSupabaseRow(report);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan laporan ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Morbidity Reports] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedMorbidityReportsToSupabase(
  reports: MedicalMorbidityReportRecord[],
  timeoutMs = 8000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (reports || []).filter((r) => Boolean(r.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { morbidityReportTable } = getSupabaseConfig();
  const tableName = morbidityReportTable || DEFAULT_MORBIDITY_REPORT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(morbidityReportToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai arsip laporan ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteMorbidityReportFromSupabase(id: string): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { morbidityReportTable } = getSupabaseConfig();
  const tableName = morbidityReportTable || DEFAULT_MORBIDITY_REPORT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeMorbidityReportsRealtime(
  onInsert: (report: MedicalMorbidityReportRecord) => void,
  onUpdate: (report: MedicalMorbidityReportRecord) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { morbidityReportTable } = getSupabaseConfig();
  const table = morbidityReportTable || DEFAULT_MORBIDITY_REPORT_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) onInsert(supabaseRowToMorbidityReport(p.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) onUpdate(supabaseRowToMorbidityReport(p.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Morbidity Reports Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_MORBIDITY_REPORT_SQL_SCHEMA = `-- SKEMA TABEL ARSIP LAPORAN MEDIS & MORBIDITAS (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS laporan_morbiditas (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  report_type VARCHAR(30) NOT NULL DEFAULT 'KUNJUNGAN',
  start_date DATE,
  end_date DATE,
  min_age INT,
  max_age INT,
  search_query TEXT,
  total_visits INT DEFAULT 0,
  total_cases INT DEFAULT 0,
  pediatric_count INT DEFAULT 0,
  top_diagnoses JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by VARCHAR(255),
  dpj_name VARCHAR(255),
  apj_name VARCHAR(255),
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  records_snapshot JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah ada sebelumnya:
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS min_age INT;
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS max_age INT;
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS search_query TEXT;
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS top_diagnoses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS records_snapshot JSONB DEFAULT '[]'::jsonb;
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS dpj_name VARCHAR(255);
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS apj_name VARCHAR(255);
ALTER TABLE laporan_morbiditas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_laporan_morbiditas_type ON laporan_morbiditas (report_type);
CREATE INDEX IF NOT EXISTS idx_laporan_morbiditas_dates ON laporan_morbiditas (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_laporan_morbiditas_updated ON laporan_morbiditas (updated_at DESC);

ALTER TABLE laporan_morbiditas REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'laporan_morbiditas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE laporan_morbiditas;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('laporan_morbiditas', { hasBranchId: true })}
`;

// ============================================================================
// RIWAYAT & FAKTUR PENJUALAN (riwayat_penjualan) — Two-Way Sync & Real-time
// ============================================================================

const DEMO_TRANSACTION_IDS = new Set([
  'TRX-1001',
  'TRX-1002',
  'FPJ-202610-1003',
  'TRX-1004'
]);

export function transactionToSupabaseRow(trx: Transaction): Record<string, any> {
  return {
    id: trx.id,
    date: trx.date || new Date().toISOString().split('T')[0],
    type: trx.type || 'REGULER',
    kasir: trx.kasir || '',
    customer_name: trx.customerName || 'Reguler',
    customer_address: trx.customerAddress || '',
    customer_phone: trx.customerPhone || '',
    due_date: trx.dueDate || null,
    term: trx.term || 'Cash / COD',
    use_ppn: Boolean(trx.usePpn),
    dpp: Number(trx.dpp ?? trx.subtotal ?? 0),
    ppn: Number(trx.ppn ?? 0),
    status: trx.status || 'Selesai',
    cancel_reason: trx.cancelReason || null,
    return_reason: trx.returnReason || null,
    return_date: trx.returnDate || null,
    rm_id: trx.rmId || null,
    doctor_name: trx.doctorName || null,
    subtotal: Number(trx.subtotal) || 0,
    discount: Number(trx.discount) || 0,
    service_charge: Number(trx.serviceCharge) || 0,
    shipping_fee: Number(trx.shippingFee) || 0,
    pembulatan: Number(trx.pembulatan) || 0,
    charge_cc: Number(trx.chargeCC) || 0,
    total: Number(trx.total) || 0,
    pay_amount: Number(trx.payAmount) || 0,
    change_amount: Number(trx.change) || 0,
    hpp_total: Number(trx.hppTotal) || 0,
    profit: Number(trx.profit) || 0,
    payment_method: trx.paymentMethod || 'Tunai',
    description: trx.description || '',
    payment_status: trx.paymentStatus || 'Lunas',
    paid_amount: trx.paidAmount !== undefined ? Number(trx.paidAmount) : Number(trx.total) || 0,
    remaining_amount: trx.remainingAmount !== undefined ? Number(trx.remainingAmount) : 0,
    assigned_staff: Array.isArray(trx.assignedStaff) ? trx.assignedStaff : [],
    items: Array.isArray(trx.items) ? trx.items : [],
    branch_id: trx.branchId || 'BR-01',
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToTransaction(row: Record<string, any>): Transaction {
  let items: CartItem[] = [];
  const rawItems = row.items;
  if (rawItems) {
    try {
      const parsed = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
  }

  let assignedStaff: StaffFeeItem[] = [];
  const rawStaff = row.assigned_staff ?? row.assignedStaff;
  if (rawStaff) {
    try {
      const parsed = typeof rawStaff === 'string' ? JSON.parse(rawStaff) : rawStaff;
      if (Array.isArray(parsed)) assignedStaff = parsed;
    } catch {}
  }

  const total = Number(row.total ?? 0);
  const rawPaymentStatus = (row.payment_status ?? row.paymentStatus) as
    | 'Lunas'
    | 'Belum Lunas'
    | 'Sebagian'
    | 'Tempo'
    | undefined;

  return {
    id: String(row.id || `TRX-${Date.now()}`),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    type: String(row.type || 'REGULER'),
    kasir: String(row.kasir || ''),
    customerName: String(row.customer_name ?? row.customerName ?? 'Reguler'),
    customerAddress: row.customer_address ?? row.customerAddress ?? undefined,
    customerPhone: row.customer_phone ?? row.customerPhone ?? undefined,
    dueDate: row.due_date ?? row.dueDate ?? undefined,
    term: row.term ?? undefined,
    usePpn: row.use_ppn !== undefined ? Boolean(row.use_ppn) : row.usePpn,
    dpp: row.dpp !== undefined && row.dpp !== null ? Number(row.dpp) : undefined,
    ppn: row.ppn !== undefined && row.ppn !== null ? Number(row.ppn) : undefined,
    status: (row.status as 'Selesai' | 'Dibatalkan' | 'Diretur') || 'Selesai',
    cancelReason: row.cancel_reason ?? row.cancelReason ?? undefined,
    returnReason: row.return_reason ?? row.returnReason ?? undefined,
    returnDate: row.return_date ?? row.returnDate ?? undefined,
    rmId: row.rm_id ?? row.rmId ?? undefined,
    doctorName: row.doctor_name ?? row.doctorName ?? undefined,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    serviceCharge:
      row.service_charge !== undefined && row.service_charge !== null
        ? Number(row.service_charge)
        : row.serviceCharge,
    shippingFee:
      row.shipping_fee !== undefined && row.shipping_fee !== null
        ? Number(row.shipping_fee)
        : row.shippingFee !== undefined && row.shippingFee !== null
          ? Number(row.shippingFee)
          : undefined,
    pembulatan:
      row.pembulatan !== undefined && row.pembulatan !== null
        ? Number(row.pembulatan)
        : undefined,
    chargeCC: Number(row.charge_cc ?? row.chargeCC ?? 0),
    total,
    payAmount: Number(row.pay_amount ?? row.payAmount ?? total),
    change: Number(row.change_amount ?? row.change ?? 0),
    hppTotal: Number(row.hpp_total ?? row.hppTotal ?? 0),
    profit: Number(row.profit ?? 0),
    paymentMethod: String(row.payment_method ?? row.paymentMethod ?? 'Tunai'),
    description: String(row.description ?? ''),
    paymentStatus: rawPaymentStatus,
    paidAmount:
      row.paid_amount !== undefined && row.paid_amount !== null
        ? Number(row.paid_amount)
        : row.paidAmount,
    remainingAmount:
      row.remaining_amount !== undefined && row.remaining_amount !== null
        ? Number(row.remaining_amount)
        : row.remainingAmount,
    assignedStaff,
    items,
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01')
  };
}

export async function fetchTransactionsFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: Transaction[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { salesTable } = getSupabaseConfig();
  const tableName = salesTable || DEFAULT_SALES_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Sales] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToTransaction)
      .filter((t) => !DEMO_TRANSACTION_IDS.has(t.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncTransactionToSupabase(
  trx: Transaction,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!trx?.id || DEMO_TRANSACTION_IDS.has(trx.id)) {
    return { success: false, error: 'Transaksi demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { salesTable } = getSupabaseConfig();
  const tableName = salesTable || DEFAULT_SALES_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = transactionToSupabaseRow(trx);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan transaksi ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    let { error } = result as { error: { message: string; code?: string } | null };
    if (error && /shipping_fee/i.test(error.message || '')) {
      const { shipping_fee: _omit, ...fallbackRow } = row;
      const retryRes = await client
        .from(tableName)
        .upsert(fallbackRow, { onConflict: 'id' })
        .select('id')
        .limit(1);
      error = retryRes.error as { message: string; code?: string } | null;
    }
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Sales] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedTransactionsToSupabase(
  list: Transaction[],
  timeoutMs = 10000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (list || []).filter((t) => Boolean(t.id) && !DEMO_TRANSACTION_IDS.has(t.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { salesTable } = getSupabaseConfig();
  const tableName = salesTable || DEFAULT_SALES_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(transactionToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai transaksi ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    let { error } = result as { error: { message: string; code?: string } | null };
    if (error && /shipping_fee/i.test(error.message || '')) {
      const fallbackRows = rows.map(({ shipping_fee: _omit, ...rest }) => rest);
      const retryRes = await client.from(tableName).upsert(fallbackRows, { onConflict: 'id' });
      error = retryRes.error as { message: string; code?: string } | null;
    }
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteTransactionsFromSupabase(
  ids: string[]
): Promise<{
  success: boolean;
  deletedCount?: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validIds = Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && !DEMO_TRANSACTION_IDS.has(id))
    )
  );
  if (validIds.length === 0) return { success: true, deletedCount: 0 };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { salesTable } = getSupabaseConfig();
  const tableName = salesTable || DEFAULT_SALES_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).delete().in('id', chunk);
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, needsTableSetup, error: error.message };
      }

      // Verify rows are actually removed (detects silent PostgREST RLS DELETE block)
      const { data: stillExisting, error: verifyErr } = await client
        .from(tableName)
        .select('id')
        .in('id', chunk);
      if (!verifyErr && Array.isArray(stillExisting) && stillExisting.length > 0) {
        return {
          success: false,
          needsTableSetup: true,
          error: `Supabase menolak penghapusan ${stillExisting.length} data pada tabel "${tableName}" (kebijakan RLS DELETE belum aktif). Jalankan ulang Skema SQL.`
        };
      }
    }
    return { success: true, deletedCount: validIds.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeTransactionsRealtime(
  onInsert: (trx: Transaction) => void,
  onUpdate: (trx: Transaction) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { salesTable } = getSupabaseConfig();
  const table = salesTable || DEFAULT_SALES_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToTransaction(p.new);
          if (!DEMO_TRANSACTION_IDS.has(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToTransaction(p.new);
          if (!DEMO_TRANSACTION_IDS.has(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Sales Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_TRANSACTIONS_SQL_SCHEMA = `-- SKEMA TABEL RIWAYAT & FAKTUR PENJUALAN (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS riwayat_penjualan (
  id VARCHAR(100) PRIMARY KEY,
  date VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'REGULER', -- REGULER, KLINIK, MITRA, FAKTUR_PENJUALAN
  kasir VARCHAR(255),
  customer_name VARCHAR(255) NOT NULL DEFAULT 'Reguler',
  customer_address TEXT,
  customer_phone VARCHAR(100),
  due_date VARCHAR(50),
  term VARCHAR(60) DEFAULT 'Cash / COD',
  use_ppn BOOLEAN DEFAULT FALSE,
  dpp NUMERIC(14,2) DEFAULT 0,
  ppn NUMERIC(14,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'Selesai', -- Selesai, Dibatalkan, Diretur
  cancel_reason TEXT,
  return_reason TEXT,
  return_date VARCHAR(50),
  rm_id VARCHAR(100),
  doctor_name VARCHAR(255),
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  service_charge NUMERIC(14,2) DEFAULT 0,
  shipping_fee NUMERIC(14,2) DEFAULT 0,
  pembulatan NUMERIC(14,2) DEFAULT 0,
  charge_cc NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  pay_amount NUMERIC(14,2) DEFAULT 0,
  change_amount NUMERIC(14,2) DEFAULT 0,
  hpp_total NUMERIC(14,2) DEFAULT 0,
  profit NUMERIC(14,2) DEFAULT 0,
  payment_method VARCHAR(80) DEFAULT 'Tunai',
  description TEXT,
  payment_status VARCHAR(40) DEFAULT 'Lunas', -- Lunas, Belum Lunas, Sebagian, Tempo
  paid_amount NUMERIC(14,2) DEFAULT 0,
  remaining_amount NUMERIC(14,2) DEFAULT 0,
  assigned_staff JSONB DEFAULT '[]'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah dibuat sebelumnya:
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(100);
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS due_date VARCHAR(50);
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS term VARCHAR(60) DEFAULT 'Cash / COD';
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS use_ppn BOOLEAN DEFAULT FALSE;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS dpp NUMERIC(14,2) DEFAULT 0;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS ppn NUMERIC(14,2) DEFAULT 0;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS return_date VARCHAR(50);
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) DEFAULT 'Lunas';
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS assigned_staff JSONB DEFAULT '[]'::jsonb;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(14,2) DEFAULT 0;
ALTER TABLE riwayat_penjualan ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_riwayat_penjualan_date ON riwayat_penjualan (date);
CREATE INDEX IF NOT EXISTS idx_riwayat_penjualan_type ON riwayat_penjualan (type);
CREATE INDEX IF NOT EXISTS idx_riwayat_penjualan_status ON riwayat_penjualan (status);
CREATE INDEX IF NOT EXISTS idx_riwayat_penjualan_payment_status ON riwayat_penjualan (payment_status);
CREATE INDEX IF NOT EXISTS idx_riwayat_penjualan_created ON riwayat_penjualan (created_at DESC);

ALTER TABLE riwayat_penjualan REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'riwayat_penjualan'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE riwayat_penjualan;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('riwayat_penjualan', { hasBranchId: true })}
`;

// ============================================================================
// KARTU STOK DIGITAL / MUTASI STOK (kartu_stok) — Two-Way Sync & Real-time
// ============================================================================

const DEMO_STOCK_MUTATION_IDS = new Set(['MUT-01', 'MUT-02', 'MUT-03']);

export function stockMutationToSupabaseRow(
  m: StockMutation,
  includeBatchColumns = true
): Record<string, any> {
  const row: Record<string, any> = {
    id: m.id,
    date: m.date || new Date().toISOString().split('T')[0],
    time: m.time || new Date().toLocaleTimeString('id-ID'),
    medicine_id: m.medicineId || '',
    medicine_name: m.medicineName || '',
    ref_no: m.refNo || '',
    type: m.type || 'PENYESUAIAN',
    in_qty: Number(m.inQty) || 0,
    out_qty: Number(m.outQty) || 0,
    balance: Number(m.balance) || 0,
    ket: m.ket || '',
    petugas: m.petugas || '',
    branch_id: m.branchId || 'BR-01',
    hpp: m.hpp !== undefined ? Number(m.hpp) : null,
    nominal_diff: m.nominalDiff !== undefined ? Number(m.nominalDiff) : null,
    updated_at: new Date().toISOString()
  };
  if (includeBatchColumns) {
    row.batch_no = m.batchNo || null;
    row.exp_date = m.expDate || null;
    row.batch_details = Array.isArray(m.batchDetails) ? m.batchDetails : null;
  }
  return row;
}

const isMissingStockCardBatchColumnError = (message?: string, code?: string): boolean => {
  const msg = String(message || '').toLowerCase();
  const c = String(code || '').toUpperCase();
  return (
    (msg.includes('batch_no') || msg.includes('exp_date') || msg.includes('batch_details')) &&
    (c === 'PGRST204' || c === '42703' || msg.includes('column') || msg.includes('schema cache'))
  );
};

export function supabaseRowToStockMutation(row: Record<string, any>): StockMutation {
  const rawDetails = row.batch_details ?? row.batchDetails;
  let parsedDetails: StockMutation['batchDetails'] = undefined;
  if (Array.isArray(rawDetails)) {
    parsedDetails = rawDetails.map((d: any) => ({
      batchNo: String(d?.batchNo ?? d?.batch_no ?? '-'),
      expDate: String(d?.expDate ?? d?.exp_date ?? ''),
      qty: Number(d?.qty ?? 0)
    }));
  }
  return {
    id: String(row.id || `MUT-${Date.now()}`),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    time: String(row.time || '00:00'),
    medicineId: String(row.medicine_id ?? row.medicineId ?? ''),
    medicineName: String(row.medicine_name ?? row.medicineName ?? ''),
    refNo: String(row.ref_no ?? row.refNo ?? '-'),
    type: (row.type || 'PENYESUAIAN') as StockMutation['type'],
    inQty: Number(row.in_qty ?? row.inQty ?? 0),
    outQty: Number(row.out_qty ?? row.outQty ?? 0),
    balance: Number(row.balance ?? 0),
    ket: String(row.ket ?? ''),
    petugas: String(row.petugas ?? ''),
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01'),
    hpp: row.hpp !== null && row.hpp !== undefined ? Number(row.hpp) : undefined,
    nominalDiff:
      row.nominal_diff !== null && row.nominal_diff !== undefined
        ? Number(row.nominal_diff)
        : row.nominalDiff !== undefined
        ? Number(row.nominalDiff)
        : undefined,
    batchNo:
      row.batch_no !== null && row.batch_no !== undefined
        ? String(row.batch_no)
        : row.batchNo !== undefined
        ? String(row.batchNo)
        : undefined,
    expDate:
      row.exp_date !== null && row.exp_date !== undefined
        ? String(row.exp_date)
        : row.expDate !== undefined
        ? String(row.expDate)
        : undefined,
    batchDetails: parsedDetails
  };
}

export async function fetchStockMutationsFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: StockMutation[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  needsBatchColumnMigration?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { stockCardTable } = getSupabaseConfig();
  const tableName = stockCardTable || DEFAULT_STOCK_CARD_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 12000;
  const PAGE_SIZE = 1000;
  const allRows: Record<string, any>[] = [];
  let from = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({
            data: null,
            error: { message: `Timeout mengambil data dari tabel ${tableName}` }
          });
        }, timeoutMs);
      });

      const queryPromise = client
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      const result = await Promise.race([queryPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const { data, error } = result as {
        data: any[] | null;
        error: { message: string; code?: string } | null;
      };

      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        console.warn(`[Supabase Stock Card] Fetch error (${tableName} range ${from}-${to}):`, error.message);
        return { data: null, needsTableSetup, error: error.message };
      }

      if (data && data.length > 0) {
        allRows.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    const firstRow = allRows[0];
    const needsBatchColumnMigration =
      Boolean(firstRow) &&
      (!Object.prototype.hasOwnProperty.call(firstRow, 'batch_no') ||
        !Object.prototype.hasOwnProperty.call(firstRow, 'exp_date') ||
        !Object.prototype.hasOwnProperty.call(firstRow, 'batch_details'));

    const uniqueMap = new Map<string, StockMutation>();
    for (const rawRow of allRows) {
      const mapped = supabaseRowToStockMutation(rawRow);
      if (mapped.id && !DEMO_STOCK_MUTATION_IDS.has(mapped.id)) {
        uniqueMap.set(mapped.id, mapped);
      }
    }
    const mapped = Array.from(uniqueMap.values());

    if (mapped.length === 0) return { data: [], isEmpty: true, needsBatchColumnMigration };
    return { data: mapped, needsBatchColumnMigration };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncStockMutationToSupabase(
  mutation: StockMutation,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  needsBatchColumnMigration?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!mutation?.id || DEMO_STOCK_MUTATION_IDS.has(mutation.id)) {
    return { success: false, error: 'Mutasi demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { stockCardTable } = getSupabaseConfig();
  const tableName = stockCardTable || DEFAULT_STOCK_CARD_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = stockMutationToSupabaseRow(mutation, true);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan mutasi ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      if (isMissingStockCardBatchColumnError(error.message, error.code)) {
        const fallbackRow = stockMutationToSupabaseRow(mutation, false);
        const retry = await client.from(tableName).upsert(fallbackRow, { onConflict: 'id' });
        if (!retry.error) return { success: true, needsBatchColumnMigration: true };
        return { success: false, needsBatchColumnMigration: true, error: retry.error.message };
      }
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Stock Card] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true, needsBatchColumnMigration: false };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedStockMutationsToSupabase(
  mutations: StockMutation[],
  timeoutMs = 12000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  needsBatchColumnMigration?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (mutations || []).filter((m) => Boolean(m.id) && !DEMO_STOCK_MUTATION_IDS.has(m.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { stockCardTable } = getSupabaseConfig();
  const tableName = stockCardTable || DEFAULT_STOCK_CARD_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const CHUNK_SIZE = 250;
  let totalSynced = 0;
  let needsBatchMigration = false;
  let useBatchColumns = true;

  try {
    for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
      const chunk = valid.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((m) => stockMutationToSupabaseRow(m, useBatchColumns));

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({ error: { message: `Timeout menyemai mutasi stok ke ${tableName}` } });
        }, timeoutMs);
      });

      const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
      const result = await Promise.race([upsertPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const { error } = result as { error: { message: string; code?: string } | null };
      if (error) {
        if (useBatchColumns && isMissingStockCardBatchColumnError(error.message, error.code)) {
          useBatchColumns = false;
          needsBatchMigration = true;
          const fallbackRows = chunk.map((m) => stockMutationToSupabaseRow(m, false));
          const retry = await client.from(tableName).upsert(fallbackRows, { onConflict: 'id' });
          if (retry.error) {
            return {
              success: false,
              count: totalSynced,
              needsBatchColumnMigration: true,
              error: retry.error.message
            };
          }
          totalSynced += fallbackRows.length;
          continue;
        }
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return {
          success: false,
          count: totalSynced,
          needsTableSetup,
          needsBatchColumnMigration: needsBatchMigration,
          error: error.message
        };
      }
      totalSynced += rows.length;
    }

    return {
      success: true,
      count: totalSynced,
      needsBatchColumnMigration: needsBatchMigration
    };
  } catch (err: any) {
    return {
      success: false,
      count: totalSynced,
      needsBatchColumnMigration: needsBatchMigration,
      error: err?.message || String(err)
    };
  }
}

export async function deleteStockMutationsFromSupabase(
  ids: string[]
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validIds = (ids || []).filter((id) => Boolean(id) && !DEMO_STOCK_MUTATION_IDS.has(id));
  if (validIds.length === 0) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { stockCardTable } = getSupabaseConfig();
  const tableName = stockCardTable || DEFAULT_STOCK_CARD_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const CHUNK_SIZE = 200;
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunkIds = validIds.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).delete().in('id', chunkIds);
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, needsTableSetup, error: error.message };
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeStockMutationsRealtime(
  onInsert: (mutation: StockMutation) => void,
  onUpdate: (mutation: StockMutation) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { stockCardTable } = getSupabaseConfig();
  const table = stockCardTable || DEFAULT_STOCK_CARD_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToStockMutation(p.new);
          if (!DEMO_STOCK_MUTATION_IDS.has(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToStockMutation(p.new);
          if (!DEMO_STOCK_MUTATION_IDS.has(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Stock Card Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_STOCK_CARD_SQL_SCHEMA = `-- SKEMA TABEL MUTASI & KARTU STOK DIGITAL (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS kartu_stok (
  id VARCHAR(100) PRIMARY KEY,
  date VARCHAR(50) NOT NULL,
  time VARCHAR(50) DEFAULT '00:00',
  medicine_id VARCHAR(100) NOT NULL,
  medicine_name VARCHAR(255) NOT NULL,
  ref_no VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'PENYESUAIAN', -- PEMBELIAN, PENJUALAN, PENYESUAIAN, STOK_OPNAME, RETUR PEMBELIAN, dll
  in_qty NUMERIC(12,2) DEFAULT 0,
  out_qty NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) DEFAULT 0,
  ket TEXT,
  petugas VARCHAR(255),
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  hpp NUMERIC(14,2),
  nominal_diff NUMERIC(14,2),
  batch_no VARCHAR(255),
  exp_date VARCHAR(100),
  batch_details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah ada sebelumnya:
ALTER TABLE kartu_stok ADD COLUMN IF NOT EXISTS hpp NUMERIC(14,2);
ALTER TABLE kartu_stok ADD COLUMN IF NOT EXISTS nominal_diff NUMERIC(14,2);
ALTER TABLE kartu_stok ADD COLUMN IF NOT EXISTS batch_no VARCHAR(255);
ALTER TABLE kartu_stok ADD COLUMN IF NOT EXISTS exp_date VARCHAR(100);
ALTER TABLE kartu_stok ADD COLUMN IF NOT EXISTS batch_details JSONB DEFAULT '[]'::jsonb;
ALTER TABLE kartu_stok ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_kartu_stok_med_id ON kartu_stok (medicine_id);
CREATE INDEX IF NOT EXISTS idx_kartu_stok_date ON kartu_stok (date);
CREATE INDEX IF NOT EXISTS idx_kartu_stok_type ON kartu_stok (type);
CREATE INDEX IF NOT EXISTS idx_kartu_stok_ref ON kartu_stok (ref_no);
CREATE INDEX IF NOT EXISTS idx_kartu_stok_created ON kartu_stok (created_at DESC);

ALTER TABLE kartu_stok REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'kartu_stok'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kartu_stok;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('kartu_stok', { hasBranchId: true })}
`;

// ============================================================================
// PEMERIKSAAN & CEK LAB / DIAGNOSTIK POCT (cek_lab) — Two-Way Sync & Real-time
// ============================================================================

export function isDemoLabRecordId(id?: string): boolean {
  if (!id) return false;
  return id.startsWith('LAB-DEMO-') || id === 'LAB-DEMO-001';
}

export function labRecordToSupabaseRow(rec: LabTestRecord): Record<string, any> {
  return {
    id: rec.id,
    date: rec.date || new Date().toISOString().split('T')[0],
    time: rec.time || '00:00',
    rm_id: rec.rmId || '',
    patient_name: rec.patientName || '',
    nik: rec.nik || '',
    age: rec.age !== undefined ? Number(rec.age) : 0,
    gender: rec.gender || 'Laki-laki',
    doctor_name: rec.doctorName || '',
    analyst_name: rec.analystName || '',
    clinical_diagnosis: rec.clinicalDiagnosis || '',
    items: Array.isArray(rec.items) ? rec.items : [],
    conclusion: rec.conclusion || '',
    notes: rec.notes || '',
    branch_id: rec.branchId || 'BR-01',
    cost: Number(rec.cost) || 0,
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToLabRecord(row: Record<string, any>): LabTestRecord {
  let parsedItems: LabTestItem[] = [];
  const rawItems = row.items;
  if (Array.isArray(rawItems)) {
    parsedItems = rawItems;
  } else if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      const p = JSON.parse(rawItems);
      if (Array.isArray(p)) parsedItems = p;
    } catch {}
  }

  const rawGender = String(row.gender ?? '').toLowerCase();
  const normalizedGender: 'Laki-laki' | 'Perempuan' =
    rawGender.includes('perempuan') || rawGender === 'p' ? 'Perempuan' : 'Laki-laki';

  return {
    id: String(row.id || `LAB-${Date.now()}`),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    time: String(row.time || '00:00'),
    rmId: String(row.rm_id ?? row.rmId ?? ''),
    patientName: String(row.patient_name ?? row.patientName ?? 'Pasien'),
    nik: row.nik ? String(row.nik) : '',
    age: row.age !== null && row.age !== undefined ? Number(row.age) : undefined,
    gender: normalizedGender,
    doctorName: row.doctor_name ?? row.doctorName ?? '',
    analystName: String(row.analyst_name ?? row.analystName ?? ''),
    clinicalDiagnosis: row.clinical_diagnosis ?? row.clinicalDiagnosis ?? '',
    items: parsedItems,
    conclusion: row.conclusion ?? '',
    notes: row.notes ?? '',
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01'),
    cost: Number(row.cost ?? 0)
  };
}

export async function fetchLabRecordsFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: LabTestRecord[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { labTestTable } = getSupabaseConfig();
  const tableName = labTestTable || DEFAULT_LAB_TEST_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Cek Lab] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToLabRecord)
      .filter((r) => !isDemoLabRecordId(r.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncLabRecordToSupabase(
  rec: LabTestRecord,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!rec?.id || isDemoLabRecordId(rec.id)) {
    return { success: false, error: 'Dokumen lab demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { labTestTable } = getSupabaseConfig();
  const tableName = labTestTable || DEFAULT_LAB_TEST_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = labRecordToSupabaseRow(rec);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan dokumen lab ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Cek Lab] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedLabRecordsToSupabase(
  records: LabTestRecord[],
  timeoutMs = 10000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (records || []).filter((r) => Boolean(r.id) && !isDemoLabRecordId(r.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { labTestTable } = getSupabaseConfig();
  const tableName = labTestTable || DEFAULT_LAB_TEST_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(labRecordToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai dokumen lab ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteLabRecordsFromSupabase(
  ids: string[]
): Promise<{
  success: boolean;
  deletedCount?: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validIds = Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && !isDemoLabRecordId(id))
    )
  );
  if (validIds.length === 0) return { success: true, deletedCount: 0 };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { labTestTable } = getSupabaseConfig();
  const tableName = labTestTable || DEFAULT_LAB_TEST_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).delete().in('id', chunk);
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, needsTableSetup, error: error.message };
      }

      // Verify rows are actually removed (detects silent PostgREST RLS DELETE block)
      const { data: stillExisting, error: verifyErr } = await client
        .from(tableName)
        .select('id')
        .in('id', chunk);
      if (!verifyErr && Array.isArray(stillExisting) && stillExisting.length > 0) {
        return {
          success: false,
          needsTableSetup: true,
          error: `Supabase menolak penghapusan ${stillExisting.length} data pada tabel "${tableName}" (kebijakan RLS DELETE belum aktif). Jalankan ulang Skema SQL.`
        };
      }
    }
    return { success: true, deletedCount: validIds.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deleteLabRecordFromSupabase(
  id: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (!id || isDemoLabRecordId(id)) return { success: true };
  const res = await deleteLabRecordsFromSupabase([id]);
  return {
    success: res.success,
    needsTableSetup: res.needsTableSetup,
    isDemo: res.isDemo,
    error: res.error
  };
}

export function subscribeLabRecordsRealtime(
  onInsert: (record: LabTestRecord) => void,
  onUpdate: (record: LabTestRecord) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { labTestTable } = getSupabaseConfig();
  const table = labTestTable || DEFAULT_LAB_TEST_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToLabRecord(p.new);
          if (!isDemoLabRecordId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToLabRecord(p.new);
          if (!isDemoLabRecordId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Cek Lab Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_LAB_TEST_SQL_SCHEMA = `-- SKEMA TABEL PEMERIKSAAN & CEK LAB / DIAGNOSTIK POCT (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS cek_lab (
  id VARCHAR(100) PRIMARY KEY,
  date VARCHAR(50) NOT NULL,
  time VARCHAR(50) DEFAULT '00:00',
  rm_id VARCHAR(100),
  patient_name VARCHAR(255) NOT NULL,
  nik VARCHAR(50),
  age INTEGER,
  gender VARCHAR(30) DEFAULT 'Laki-laki',
  doctor_name VARCHAR(255),
  analyst_name VARCHAR(255) NOT NULL,
  clinical_diagnosis TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  conclusion TEXT,
  notes TEXT,
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  cost NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah ada sebelumnya:
ALTER TABLE cek_lab ADD COLUMN IF NOT EXISTS clinical_diagnosis TEXT;
ALTER TABLE cek_lab ADD COLUMN IF NOT EXISTS cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE cek_lab ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_cek_lab_rm_id ON cek_lab (rm_id);
CREATE INDEX IF NOT EXISTS idx_cek_lab_date ON cek_lab (date);
CREATE INDEX IF NOT EXISTS idx_cek_lab_patient ON cek_lab (patient_name);
CREATE INDEX IF NOT EXISTS idx_cek_lab_created ON cek_lab (created_at DESC);

ALTER TABLE cek_lab REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cek_lab'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cek_lab;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('cek_lab', { hasBranchId: true })}
`;

// =========================================================================
// INTEGRASI SUPABASE 2-ARAH: RIWAYAT STOK OPNAME (riwayat_opname)
// =========================================================================

export function isDemoOpnameRecordId(id?: string): boolean {
  if (!id) return true;
  const upper = id.toUpperCase();
  return upper.startsWith('OPN-DEMO-') || upper.startsWith('OPN-HIST-');
}

export function opnameRecordToSupabaseRow(rec: StockOpnameRecord): Record<string, any> {
  const kindLabel = rec.opnameKind === 'STOK_AWAL' ? 'Stok Awal' : 'Penyesuaian Stok';
  const rawNotes = String(rec.notes || '').trim();
  const normalizedNotes = rawNotes.includes('[Jenis:')
    ? rawNotes
    : rawNotes
    ? `[Jenis: ${kindLabel}] ${rawNotes}`
    : `[Jenis: ${kindLabel}]`;

  return {
    id: rec.id,
    ref_no: rec.refNo || rec.id,
    date: rec.date || new Date().toISOString().split('T')[0],
    time: rec.time || '00:00 WIB',
    petugas: rec.petugas || 'Petugas Apotek',
    branch_id: rec.branchId || 'BR-01',
    branch_name: rec.branchName || 'Apotek Latisha Pusat',
    total_items_counted: Number(rec.totalItemsCounted) || 0,
    match_count: Number(rec.matchCount) || 0,
    surplus_count: Number(rec.surplusCount) || 0,
    deficit_count: Number(rec.deficitCount) || 0,
    total_surplus_nominal: Number(rec.totalSurplusNominal) || 0,
    total_deficit_nominal: Number(rec.totalDeficitNominal) || 0,
    net_nominal_diff: Number(rec.netNominalDiff) || 0,
    notes: normalizedNotes,
    items: Array.isArray(rec.items) ? rec.items : [],
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToOpnameRecord(row: Record<string, any>): StockOpnameRecord {
  let parsedItems: StockOpnameItemRecord[] = [];
  const rawItems = row.items;
  if (Array.isArray(rawItems)) {
    parsedItems = rawItems;
  } else if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      const p = JSON.parse(rawItems);
      if (Array.isArray(p)) parsedItems = p;
    } catch {}
  }

  const rawNotes = row.notes ? String(row.notes) : '';
  const explicitKind = row.opname_kind ?? row.opnameKind;
  const resolvedOpnameKind: StockOpnameKind =
    explicitKind === 'STOK_AWAL' || /\[Jenis:\s*Stok Awal\]/i.test(rawNotes)
      ? 'STOK_AWAL'
      : 'PENYESUAIAN_STOK';

  return {
    id: String(row.id || `OPN-${Date.now()}`),
    refNo: String(row.ref_no ?? row.refNo ?? row.id ?? ''),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    time: String(row.time || '00:00 WIB'),
    petugas: String(row.petugas || 'Petugas Apotek'),
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01'),
    branchName: String(row.branch_name ?? row.branchName ?? 'Apotek Latisha Pusat'),
    opnameKind: resolvedOpnameKind,
    totalItemsCounted: Number(row.total_items_counted ?? row.totalItemsCounted ?? parsedItems.length ?? 0),
    matchCount: Number(row.match_count ?? row.matchCount ?? 0),
    surplusCount: Number(row.surplus_count ?? row.surplusCount ?? 0),
    deficitCount: Number(row.deficit_count ?? row.deficitCount ?? 0),
    totalSurplusNominal: Number(row.total_surplus_nominal ?? row.totalSurplusNominal ?? 0),
    totalDeficitNominal: Number(row.total_deficit_nominal ?? row.totalDeficitNominal ?? 0),
    netNominalDiff: Number(row.net_nominal_diff ?? row.netNominalDiff ?? 0),
    notes: rawNotes,
    items: parsedItems
  };
}

export async function fetchOpnameRecordsFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
  limit?: number;
}): Promise<{
  data: StockOpnameRecord[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { opnameTable } = getSupabaseConfig();
  const tableName = opnameTable || DEFAULT_OPNAME_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  const safeLimit = options?.limit && options.limit > 0 ? Math.min(500, options.limit) : 200;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Riwayat Opname] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToOpnameRecord)
      .filter((r) => !isDemoOpnameRecordId(r.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

// Inbound (Server-Side Pagination & Search): Fetch paginated `riwayat_opname` rows with .range(), .count('exact'), & .ilike()
export async function fetchOpnameRecordsPaginatedFromSupabase(params: {
  page: number;
  pageSize: number;
  searchQuery?: string;
  preset?: 'all' | 'today' | '7days' | 'month' | 'custom';
  startDate?: string;
  endDate?: string;
}): Promise<PaginatedQueryResult<StockOpnameRecord>> {
  const safePage = Math.max(1, Math.floor(params.page || 1));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 25)));

  if (isDemoMode()) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: 'Mode Demo aktif (isolasi sandbox)'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: 'Klien Supabase belum dikonfigurasi'
    };
  }

  const { opnameTable } = getSupabaseConfig();
  const tableName = opnameTable || DEFAULT_OPNAME_TABLE;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const cleanSearch = sanitizePostgrestSearchTerm(params.searchQuery || '');

  try {
    let query = client.from(tableName).select('*', { count: 'exact' });

    const now = new Date();
    const toYMD = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = toYMD(now);

    if (params.preset === 'today') {
      query = query.eq('date', todayStr);
    } else if (params.preset === '7days') {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      query = query.gte('date', toYMD(d7)).lte('date', todayStr);
    } else if (params.preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      query = query.gte('date', toYMD(firstDay)).lte('date', todayStr);
    } else if (params.preset === 'custom') {
      if (params.startDate) query = query.gte('date', params.startDate);
      if (params.endDate) query = query.lte('date', params.endDate);
    }

    if (cleanSearch) {
      query = query.or(
        `ref_no.ilike.%${cleanSearch}%,petugas.ilike.%${cleanSearch}%,notes.ilike.%${cleanSearch}%,id.ilike.%${cleanSearch}%`
      );
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return {
        data: null,
        totalCount: 0,
        page: safePage,
        pageSize: safePageSize,
        totalPages: 1,
        needsTableSetup,
        error: error.message
      };
    }

    const mapped = (data || [])
      .map(supabaseRowToOpnameRecord)
      .filter((r) => !isDemoOpnameRecordId(r.id));

    const totalCount = typeof count === 'number' ? count : mapped.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));

    return {
      data: mapped,
      totalCount,
      page: safePage,
      pageSize: safePageSize,
      totalPages
    };
  } catch (err: any) {
    return {
      data: null,
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
      error: err?.message || String(err)
    };
  }
}

export async function syncOpnameRecordToSupabase(
  rec: StockOpnameRecord,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!rec?.id || isDemoOpnameRecordId(rec.id)) {
    return { success: false, error: 'Dokumen riwayat opname demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { opnameTable } = getSupabaseConfig();
  const tableName = opnameTable || DEFAULT_OPNAME_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = opnameRecordToSupabaseRow(rec);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan riwayat opname ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Riwayat Opname] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedOpnameRecordsToSupabase(
  records: StockOpnameRecord[],
  timeoutMs = 10000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (records || []).filter((r) => Boolean(r.id) && !isDemoOpnameRecordId(r.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { opnameTable } = getSupabaseConfig();
  const tableName = opnameTable || DEFAULT_OPNAME_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(opnameRecordToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai riwayat opname ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteOpnameRecordsFromSupabase(
  ids: string[],
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };

  const cleanIds = Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && !isDemoOpnameRecordId(id) && !id.startsWith('OPN-HIST-'))
    )
  );
  if (cleanIds.length === 0) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { opnameTable } = getSupabaseConfig();
  const tableName = opnameTable || DEFAULT_OPNAME_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const chunkSize = 200;
    for (let i = 0; i < cleanIds.length; i += chunkSize) {
      const chunk = cleanIds.slice(i, i + chunkSize);
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ error: { message: string; code?: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({ error: { message: `Timeout menghapus riwayat stok opname dari ${tableName}` } });
        }, timeoutMs);
      });

      const deletePromise =
        chunk.length === 1
          ? client.from(tableName).delete().eq('id', chunk[0])
          : client.from(tableName).delete().in('id', chunk);

      const result = await Promise.race([deletePromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const { error } = result as { error: { message: string; code?: string } | null };
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        console.warn(`[Supabase Riwayat Opname] Delete error (${tableName}):`, error.message);
        return { success: false, needsTableSetup, error: error.message };
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deleteOpnameRecordFromSupabase(
  id: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  return deleteOpnameRecordsFromSupabase([id]);
}

export function subscribeOpnameRecordsRealtime(
  onInsert: (record: StockOpnameRecord) => void,
  onUpdate: (record: StockOpnameRecord) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { opnameTable } = getSupabaseConfig();
  const table = opnameTable || DEFAULT_OPNAME_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToOpnameRecord(p.new);
          if (!isDemoOpnameRecordId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToOpnameRecord(p.new);
          if (!isDemoOpnameRecordId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Riwayat Opname Realtime Error]:', err);
    return null;
  }
}

export const DEFAULT_ACTIVE_OPNAME_TABLE = 'sesi_opname_aktif';

let fallbackMemorySessionId = '';
export function getClientOpnameSessionId(): string {
  if (typeof window !== 'undefined') {
    try {
      const key = 'latisha_opname_client_session_id';
      const existing = window.sessionStorage.getItem(key);
      if (existing) return existing;
      const created = `OPN-SES-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      window.sessionStorage.setItem(key, created);
      return created;
    } catch {}
  }
  if (!fallbackMemorySessionId) {
    fallbackMemorySessionId = `OPN-SES-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }
  return fallbackMemorySessionId;
}

export interface LiveOpnameActivityController {
  publishMyActivities: (items: LiveOpnameItemActivity[]) => void;
  clearMyActivities: () => void;
  unsubscribe: () => void;
}

/**
 * Real-time Multi-User In-Progress Stock Opname Sync & Conflict Prevention
 * Combines:
 * 1) Supabase Realtime Presence & Broadcast (`latisha_live_opname_presence_v1`) — works immediately without DB setup
 * 2) Optional Supabase Table (`sesi_opname_aktif`) if created in Supabase
 * 3) Browser `BroadcastChannel` for instant multi-tab sync on the same device
 * Strictly isolated in Mode Demo (`isDemoMode()`).
 */
export function subscribeLiveOpnameActivityChannel(options: {
  sessionId?: string;
  onRemoteActivitiesChange: (activitiesByMedicineId: Record<string, LiveOpnameItemActivity[]>) => void;
}): LiveOpnameActivityController {
  const mySessionId = options.sessionId || getClientOpnameSessionId();
  const demoActive = isDemoMode();

  // Map of remote sessionId -> list of active items from that session
  const remoteSessionsMap = new Map<string, LiveOpnameItemActivity[]>();
  let latestMyItems: LiveOpnameItemActivity[] = [];
  let isCleanedUp = false;
  let activeTableReady = false;

  const STALE_MS = 45 * 60 * 1000; // 45 minutes expiry for abandoned drafts

  const emitGroupedRemoteActivities = () => {
    if (isCleanedUp) return;
    const now = Date.now();
    const grouped: Record<string, LiveOpnameItemActivity[]> = {};

    remoteSessionsMap.forEach((items, rSessionId) => {
      if (!rSessionId || rSessionId === mySessionId) return;
      (items || []).forEach((item) => {
        if (!item || !item.medicineId) return;
        const ts = item.updatedAt ? new Date(item.updatedAt).getTime() : now;
        if (!isNaN(ts) && now - ts > STALE_MS) return;

        if (!grouped[item.medicineId]) {
          grouped[item.medicineId] = [];
        }
        const existingIdx = grouped[item.medicineId].findIndex(
          (x) => x.sessionId === item.sessionId
        );
        if (existingIdx >= 0) {
          grouped[item.medicineId][existingIdx] = item;
        } else {
          grouped[item.medicineId].push(item);
        }
      });
    });

    options.onRemoteActivitiesChange(grouped);
  };

  // 1. Browser BroadcastChannel (same-device multi-tab real-time sync, isolated by demo/prod mode)
  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      bc = new BroadcastChannel(
        demoActive ? 'latisha_live_opname_bc_demo_v1' : 'latisha_live_opname_bc_prod_v1'
      );
      bc.onmessage = (ev) => {
        if (isCleanedUp || !ev?.data) return;
        const msg = ev.data;
        if (msg.type === 'OPNAME_ACTIVITY_UPDATE' && msg.sessionId && msg.sessionId !== mySessionId) {
          if (Array.isArray(msg.items) && msg.items.length > 0) {
            remoteSessionsMap.set(msg.sessionId, msg.items);
          } else {
            remoteSessionsMap.delete(msg.sessionId);
          }
          emitGroupedRemoteActivities();
        } else if (msg.type === 'OPNAME_ACTIVITY_CLEAR' && msg.sessionId && msg.sessionId !== mySessionId) {
          remoteSessionsMap.delete(msg.sessionId);
          emitGroupedRemoteActivities();
        } else if (msg.type === 'OPNAME_ACTIVITY_PING' && msg.sessionId !== mySessionId) {
          if (latestMyItems.length > 0 && bc) {
            bc.postMessage({
              type: 'OPNAME_ACTIVITY_UPDATE',
              sessionId: mySessionId,
              items: latestMyItems
            });
          }
        }
      };
      bc.postMessage({ type: 'OPNAME_ACTIVITY_PING', sessionId: mySessionId });
    } catch {}
  }

  // 2. Supabase Realtime Presence + Broadcast + Optional Table (`sesi_opname_aktif`)
  let realtimeChannel: RealtimeChannel | null = null;
  let tableRealtimeChannel: RealtimeChannel | null = null;
  const client = !demoActive ? getSupabaseClient() : null;

  const syncMyItemsToOptionalTable = async (items: LiveOpnameItemActivity[]) => {
    if (demoActive || !client || !activeTableReady) return;
    try {
      if (items.length === 0) {
        await client.from(DEFAULT_ACTIVE_OPNAME_TABLE).delete().eq('session_id', mySessionId);
        return;
      }
      const rows = items.map((it) => ({
        id: `${mySessionId}__${it.medicineId}`,
        session_id: mySessionId,
        medicine_id: it.medicineId,
        medicine_name: it.medicineName,
        staff_name: it.staffName,
        branch_id: it.branchId || 'BR-01',
        physical_stock: it.physicalStock || '',
        unit: it.unit || 'Unit',
        batch_count: Number(it.batchCount) || 1,
        status_text: it.statusText || 'Sedang dihitung',
        is_focused: Boolean(it.isFocused),
        updated_at: it.updatedAt || new Date().toISOString()
      }));
      await client.from(DEFAULT_ACTIVE_OPNAME_TABLE).upsert(rows, { onConflict: 'id' });

      // Remove any rows for this session that are no longer in `items`
      const activeMedIds = new Set(items.map((i) => i.medicineId));
      const { data: existingRows } = await client
        .from(DEFAULT_ACTIVE_OPNAME_TABLE)
        .select('id, medicine_id')
        .eq('session_id', mySessionId);
      const toDeleteIds = (existingRows || [])
        .filter((r: any) => r.medicine_id && !activeMedIds.has(String(r.medicine_id)))
        .map((r: any) => String(r.id));
      if (toDeleteIds.length > 0) {
        await client.from(DEFAULT_ACTIVE_OPNAME_TABLE).delete().in('id', toDeleteIds);
      }
    } catch {}
  };

  if (client && !demoActive) {
    try {
      realtimeChannel = client.channel('latisha_live_opname_presence_v1', {
        config: {
          presence: { key: mySessionId },
          broadcast: { self: false }
        }
      });

      realtimeChannel
        .on('presence', { event: 'sync' }, () => {
          if (isCleanedUp || !realtimeChannel) return;
          const state = realtimeChannel.presenceState();
          const activePresenceSessionIds = new Set<string>();

          Object.entries(state).forEach(([presKey, presences]) => {
            if (!presKey || presKey === mySessionId) return;
            activePresenceSessionIds.add(presKey);
            const latestPresence = (presences as any[])?.[0];
            if (latestPresence && Array.isArray(latestPresence.items)) {
              if (latestPresence.items.length > 0) {
                remoteSessionsMap.set(presKey, latestPresence.items);
              } else {
                remoteSessionsMap.delete(presKey);
              }
            }
          });

          // Remove sessions that left presence (unless backed by table)
          Array.from(remoteSessionsMap.keys()).forEach((sid) => {
            if (!sid.startsWith('DB-') && !activePresenceSessionIds.has(sid)) {
              remoteSessionsMap.delete(sid);
            }
          });

          emitGroupedRemoteActivities();
        })
        .on('presence', { event: 'leave' }, ({ key }) => {
          if (key && key !== mySessionId) {
            remoteSessionsMap.delete(key);
            emitGroupedRemoteActivities();
          }
        })
        .on('broadcast', { event: 'opname_activity_update' }, ({ payload }) => {
          if (isCleanedUp || !payload || payload.sessionId === mySessionId) return;
          if (Array.isArray(payload.items) && payload.items.length > 0) {
            remoteSessionsMap.set(payload.sessionId, payload.items);
          } else {
            remoteSessionsMap.delete(payload.sessionId);
          }
          emitGroupedRemoteActivities();
        })
        .on('broadcast', { event: 'opname_activity_clear' }, ({ payload }) => {
          if (isCleanedUp || !payload || payload.sessionId === mySessionId) return;
          remoteSessionsMap.delete(payload.sessionId);
          emitGroupedRemoteActivities();
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && !isCleanedUp && realtimeChannel) {
            await realtimeChannel.track({
              sessionId: mySessionId,
              items: latestMyItems,
              updatedAt: new Date().toISOString()
            });
          }
        });

      // Also check if optional auxiliary table `sesi_opname_aktif` is created in Supabase
      isSupabaseTableAvailable(DEFAULT_ACTIVE_OPNAME_TABLE).then(async (avail) => {
        if (isCleanedUp || !avail || !client) return;
        activeTableReady = true;

        const mapRowToActivity = (r: any): LiveOpnameItemActivity => ({
          medicineId: String(r.medicine_id || ''),
          medicineName: String(r.medicine_name || ''),
          staffName: String(r.staff_name || 'Petugas Apotek'),
          sessionId: String(r.session_id || `DB-${r.id}`),
          branchId: String(r.branch_id || 'BR-01'),
          physicalStock: String(r.physical_stock ?? ''),
          unit: String(r.unit || 'Unit'),
          batchCount: Number(r.batch_count) || 1,
          statusText: String(r.status_text || 'Sedang dihitung'),
          isFocused: Boolean(r.is_focused),
          updatedAt: String(r.updated_at || new Date().toISOString()),
          updatedTimeLabel: new Date(r.updated_at || Date.now()).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
          })
        });

        const refreshFromActiveTable = async () => {
          if (isCleanedUp || !client) return;
          try {
            const { data } = await client.from(DEFAULT_ACTIVE_OPNAME_TABLE).select('*');
            if (!data) return;
            const bySession = new Map<string, LiveOpnameItemActivity[]>();
            data.forEach((row: any) => {
              const sid = String(row.session_id || '');
              if (!sid || sid === mySessionId) return;
              const act = mapRowToActivity(row);
              if (!bySession.has(`DB-${sid}`)) bySession.set(`DB-${sid}`, []);
              bySession.get(`DB-${sid}`)!.push(act);
            });
            // Replace DB-* entries
            Array.from(remoteSessionsMap.keys()).forEach((k) => {
              if (k.startsWith('DB-')) remoteSessionsMap.delete(k);
            });
            bySession.forEach((list, k) => remoteSessionsMap.set(k, list));
            emitGroupedRemoteActivities();
          } catch {}
        };

        await refreshFromActiveTable();
        if (latestMyItems.length > 0) {
          syncMyItemsToOptionalTable(latestMyItems).catch(() => {});
        }

        tableRealtimeChannel = client
          .channel(`realtime_${DEFAULT_ACTIVE_OPNAME_TABLE}_${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: DEFAULT_ACTIVE_OPNAME_TABLE },
            () => {
              refreshFromActiveTable();
            }
          )
          .subscribe();
      });
    } catch (err) {
      console.warn('[Supabase Live Opname Activity Channel Error]:', err);
    }
  }

  return {
    publishMyActivities: (items: LiveOpnameItemActivity[]) => {
      if (isCleanedUp) return;
      latestMyItems = items;

      if (bc) {
        try {
          bc.postMessage({
            type: 'OPNAME_ACTIVITY_UPDATE',
            sessionId: mySessionId,
            items
          });
        } catch {}
      }

      if (realtimeChannel && !demoActive) {
        realtimeChannel
          .send({
            type: 'broadcast',
            event: 'opname_activity_update',
            payload: { sessionId: mySessionId, items }
          })
          .catch(() => {});
        realtimeChannel
          .track({
            sessionId: mySessionId,
            items,
            updatedAt: new Date().toISOString()
          })
          .catch(() => {});
      }

      if (activeTableReady && !demoActive) {
        syncMyItemsToOptionalTable(items).catch(() => {});
      }
    },
    clearMyActivities: () => {
      if (isCleanedUp) return;
      latestMyItems = [];

      if (bc) {
        try {
          bc.postMessage({
            type: 'OPNAME_ACTIVITY_CLEAR',
            sessionId: mySessionId
          });
        } catch {}
      }

      if (realtimeChannel && !demoActive) {
        realtimeChannel
          .send({
            type: 'broadcast',
            event: 'opname_activity_clear',
            payload: { sessionId: mySessionId }
          })
          .catch(() => {});
        realtimeChannel
          .track({
            sessionId: mySessionId,
            items: [],
            updatedAt: new Date().toISOString()
          })
          .catch(() => {});
      }

      if (activeTableReady && !demoActive) {
        syncMyItemsToOptionalTable([]).catch(() => {});
      }
    },
    unsubscribe: () => {
      isCleanedUp = true;
      if (bc) {
        try {
          bc.postMessage({
            type: 'OPNAME_ACTIVITY_CLEAR',
            sessionId: mySessionId
          });
          bc.close();
        } catch {}
      }
      if (client && !demoActive) {
        if (realtimeChannel) {
          realtimeChannel.untrack().catch(() => {});
          client.removeChannel(realtimeChannel);
        }
        if (tableRealtimeChannel) {
          client.removeChannel(tableRealtimeChannel);
        }
        if (activeTableReady) {
          client.from(DEFAULT_ACTIVE_OPNAME_TABLE).delete().eq('session_id', mySessionId).then(() => {});
        }
      }
    }
  };
}

export const SUPABASE_OPNAME_SQL_SCHEMA = `-- ============================================================================
-- SKEMA TABEL RIWAYAT STOK OPNAME & SESI HITUNG OPNAME LIVE (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda
-- ============================================================================

-- 1. TABEL UTAMA: RIWAYAT STOK OPNAME (riwayat_opname)
CREATE TABLE IF NOT EXISTS riwayat_opname (
  id VARCHAR(100) PRIMARY KEY,
  ref_no VARCHAR(100) NOT NULL,
  date VARCHAR(50) NOT NULL,
  time VARCHAR(50) DEFAULT '00:00 WIB',
  petugas VARCHAR(255) NOT NULL,
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  branch_name VARCHAR(255) DEFAULT 'Apotek Latisha Pusat',
  total_items_counted INTEGER DEFAULT 0,
  match_count INTEGER DEFAULT 0,
  surplus_count INTEGER DEFAULT 0,
  deficit_count INTEGER DEFAULT 0,
  total_surplus_nominal NUMERIC(14,2) DEFAULT 0,
  total_deficit_nominal NUMERIC(14,2) DEFAULT 0,
  net_nominal_diff NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel riwayat_opname sudah ada sebelumnya:
ALTER TABLE riwayat_opname ADD COLUMN IF NOT EXISTS branch_name VARCHAR(255) DEFAULT 'Apotek Latisha Pusat';
ALTER TABLE riwayat_opname ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE riwayat_opname ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE riwayat_opname REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_riwayat_opname_ref_no ON riwayat_opname (ref_no);
CREATE INDEX IF NOT EXISTS idx_riwayat_opname_date ON riwayat_opname (date);
CREATE INDEX IF NOT EXISTS idx_riwayat_opname_petugas ON riwayat_opname (petugas);
CREATE INDEX IF NOT EXISTS idx_riwayat_opname_created ON riwayat_opname (created_at DESC);

-- Aktifkan Realtime Replication untuk riwayat_opname
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'riwayat_opname'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE riwayat_opname;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('riwayat_opname', { hasBranchId: true })}

-- 2. TABEL BANTU REALTIME: SESI HITUNG OPNAME AKTIF (sesi_opname_aktif)
-- Menyimpan indikator obat yang sedang dihitung oleh petugas sebelum klik "Terapkan Hasil Opname"
CREATE TABLE IF NOT EXISTS sesi_opname_aktif (
  id VARCHAR(180) PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  medicine_id VARCHAR(100) NOT NULL,
  medicine_name VARCHAR(255) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  physical_stock VARCHAR(50) DEFAULT '',
  unit VARCHAR(50) DEFAULT 'Unit',
  batch_count INTEGER DEFAULT 1,
  status_text VARCHAR(150) DEFAULT 'Sedang dihitung',
  is_focused BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sesi_opname_aktif REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_sesi_opname_aktif_med ON sesi_opname_aktif (medicine_id);
CREATE INDEX IF NOT EXISTS idx_sesi_opname_aktif_session ON sesi_opname_aktif (session_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sesi_opname_aktif'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sesi_opname_aktif;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('sesi_opname_aktif', { hasBranchId: true, includeFunctions: false })}
`;

// =========================================================================
// INTEGRASI SUPABASE 2-ARAH: MASTER DATA SUPPLIER & PBF (supplier)
// =========================================================================

export function isDemoSupplierId(id?: string): boolean {
  if (!id) return true;
  const upper = id.toUpperCase();
  if (upper.startsWith('SUP-DEMO-')) return true;
  return ['SUP-001', 'SUP-002', 'SUP-003', 'SUP-004'].includes(upper);
}

export function supplierToSupabaseRow(s: Supplier): Record<string, any> {
  return {
    id: s.id,
    name: s.name || '',
    address: s.address || '',
    phone: s.phone || '',
    email: s.email || '',
    license_no: s.licenseNo || '',
    pic_name: s.picName || '',
    created_at_date: s.createdAt || new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToSupplier(row: Record<string, any>): Supplier {
  const rawCreated = row.created_at_date ?? row.createdAt ?? row.created_at ?? '';
  const createdStr =
    typeof rawCreated === 'string' && rawCreated
      ? rawCreated.split('T')[0].split(' ')[0]
      : new Date().toISOString().split('T')[0];

  return {
    id: String(row.id || `SUP-${Date.now().toString().slice(-4)}`),
    name: String(row.name || 'Supplier / PBF'),
    address: String(row.address || ''),
    phone: String(row.phone || ''),
    email: row.email ? String(row.email) : '',
    licenseNo: String(row.license_no ?? row.licenseNo ?? ''),
    picName: String(row.pic_name ?? row.picName ?? ''),
    createdAt: createdStr
  };
}

export async function fetchSuppliersFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: Supplier[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { supplierTable } = getSupabaseConfig();
  const tableName = supplierTable || DEFAULT_SUPPLIER_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Supplier] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToSupplier)
      .filter((s) => !isDemoSupplierId(s.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncSupplierToSupabase(
  sup: Supplier,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!sup?.id || isDemoSupplierId(sup.id)) {
    return { success: false, error: 'Data supplier demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { supplierTable } = getSupabaseConfig();
  const tableName = supplierTable || DEFAULT_SUPPLIER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = supplierToSupabaseRow(sup);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan supplier ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Supplier] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedSuppliersToSupabase(
  suppliersList: Supplier[],
  timeoutMs = 10000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (suppliersList || []).filter((s) => Boolean(s.id) && !isDemoSupplierId(s.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { supplierTable } = getSupabaseConfig();
  const tableName = supplierTable || DEFAULT_SUPPLIER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(supplierToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai supplier ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteSupplierFromSupabase(
  id: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!id || isDemoSupplierId(id)) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { supplierTable } = getSupabaseConfig();
  const tableName = supplierTable || DEFAULT_SUPPLIER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeSuppliersRealtime(
  onInsert: (supplier: Supplier) => void,
  onUpdate: (supplier: Supplier) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { supplierTable } = getSupabaseConfig();
  const table = supplierTable || DEFAULT_SUPPLIER_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToSupplier(p.new);
          if (!isDemoSupplierId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToSupplier(p.new);
          if (!isDemoSupplierId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Supplier Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_SUPPLIER_SQL_SCHEMA = `-- SKEMA TABEL MASTER DATA SUPPLIER & PBF (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS supplier (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(100) NOT NULL,
  email VARCHAR(150),
  license_no VARCHAR(150),
  pic_name VARCHAR(255),
  created_at_date VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah ada sebelumnya:
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS license_no VARCHAR(150);
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS pic_name VARCHAR(255);
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS created_at_date VARCHAR(50);
ALTER TABLE supplier ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_supplier_name ON supplier (name);
CREATE INDEX IF NOT EXISTS idx_supplier_phone ON supplier (phone);
CREATE INDEX IF NOT EXISTS idx_supplier_created ON supplier (created_at DESC);

ALTER TABLE supplier REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'supplier'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE supplier;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('supplier')}
`;

// =========================================================================
// INTEGRASI SUPABASE 2-ARAH: MULTI-CABANG & TRANSFER STOK ANTAR-CABANG
// (Tabel: cabang & transfer_stok_cabang) — Isolasi Penuh Mode Demo
// =========================================================================

export function isDemoBranchId(id?: string): boolean {
  if (!id) return true;
  const upper = id.toUpperCase();
  return upper.startsWith('BR-DEMO-');
}

export function isDemoTransferId(id?: string): boolean {
  if (!id) return true;
  const upper = id.toUpperCase();
  if (upper.startsWith('TRF-DEMO-')) return true;
  return upper === 'TRF-001';
}

export function branchToSupabaseRow(b: Branch): Record<string, any> {
  return {
    id: b.id,
    name: b.name || '',
    code: b.code || '',
    address: b.address || '',
    phone: b.phone || '',
    is_central: Boolean(b.isCentral),
    sync_status: b.syncStatus || 'Tersinkronisasi',
    last_sync_time: b.lastSyncTime || 'Baru saja',
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToBranch(row: Record<string, any>): Branch {
  const rawStatus = String(row.sync_status ?? row.syncStatus ?? 'Tersinkronisasi');
  const validStatus: Branch['syncStatus'] =
    rawStatus === 'Sinkronisasi Berjalan' || rawStatus === 'Offline'
      ? rawStatus
      : 'Tersinkronisasi';

  return {
    id: String(row.id || `BR-${Date.now().toString().slice(-4)}`),
    name: String(row.name || 'Cabang Latisha Farma'),
    code: String(row.code || 'BR-01'),
    address: String(row.address || ''),
    phone: String(row.phone || ''),
    isCentral: Boolean(row.is_central ?? row.isCentral ?? false),
    syncStatus: validStatus,
    lastSyncTime: String(row.last_sync_time ?? row.lastSyncTime ?? 'Tersinkronisasi Cloud')
  };
}

export async function fetchBranchesFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: Branch[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { branchTable } = getSupabaseConfig();
  const tableName = branchTable || DEFAULT_BRANCH_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('is_central', { ascending: false })
      .order('id', { ascending: true });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Cabang] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToBranch)
      .filter((b) => !isDemoBranchId(b.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncBranchToSupabase(
  branch: Branch,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!branch?.id || isDemoBranchId(branch.id)) {
    return { success: false, error: 'Data cabang demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { branchTable } = getSupabaseConfig();
  const tableName = branchTable || DEFAULT_BRANCH_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = branchToSupabaseRow(branch);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan cabang ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Cabang] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedBranchesToSupabase(
  branchesList: Branch[],
  timeoutMs = 10000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (branchesList || []).filter((b) => Boolean(b.id) && !isDemoBranchId(b.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { branchTable } = getSupabaseConfig();
  const tableName = branchTable || DEFAULT_BRANCH_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(branchToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai cabang ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteBranchFromSupabase(
  id: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!id || isDemoBranchId(id)) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { branchTable } = getSupabaseConfig();
  const tableName = branchTable || DEFAULT_BRANCH_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeBranchesRealtime(
  onInsert: (branch: Branch) => void,
  onUpdate: (branch: Branch) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { branchTable } = getSupabaseConfig();
  const table = branchTable || DEFAULT_BRANCH_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const mapped = supabaseRowToBranch(p.new);
          if (!isDemoBranchId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const mapped = supabaseRowToBranch(p.new);
          if (!isDemoBranchId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Cabang Realtime Error]:', err);
    return null;
  }
}

export function stockTransferToSupabaseRow(t: StockTransfer): Record<string, any> {
  return {
    id: t.id,
    date: t.date || new Date().toISOString().split('T')[0],
    from_branch_id: t.fromBranchId || 'BR-01',
    to_branch_id: t.toBranchId || 'BR-02',
    medicine_id: t.medicineId || '',
    medicine_name: t.medicineName || '',
    qty: Number(t.qty) || 0,
    unit: t.unit || 'Unit',
    status: t.status || 'Diterima',
    petugas: t.petugas || 'Petugas',
    notes: t.notes || '',
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToStockTransfer(row: Record<string, any>): StockTransfer {
  const rawStatus = String(row.status ?? 'Diterima');
  const validStatus: StockTransfer['status'] =
    rawStatus === 'Terkirim' || rawStatus === 'Dibatalkan' ? rawStatus : 'Diterima';

  return {
    id: String(row.id || `TRF-${Date.now().toString().slice(-6)}`),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    fromBranchId: String(row.from_branch_id ?? row.fromBranchId ?? 'BR-01'),
    toBranchId: String(row.to_branch_id ?? row.toBranchId ?? 'BR-02'),
    medicineId: String(row.medicine_id ?? row.medicineId ?? ''),
    medicineName: String(row.medicine_name ?? row.medicineName ?? 'Obat'),
    qty: Number(row.qty ?? 0),
    unit: String(row.unit || 'Unit'),
    status: validStatus,
    petugas: String(row.petugas || 'Petugas'),
    notes: row.notes ? String(row.notes) : ''
  };
}

export async function fetchBranchTransfersFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: StockTransfer[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { branchTransferTable } = getSupabaseConfig();
  const tableName = branchTransferTable || DEFAULT_BRANCH_TRANSFER_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Transfer Cabang] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToStockTransfer)
      .filter((t) => !isDemoTransferId(t.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncBranchTransferToSupabase(
  transfer: StockTransfer,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!transfer?.id || isDemoTransferId(transfer.id)) {
    return { success: false, error: 'Data transfer demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { branchTransferTable } = getSupabaseConfig();
  const tableName = branchTransferTable || DEFAULT_BRANCH_TRANSFER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = stockTransferToSupabaseRow(transfer);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan transfer cabang ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Transfer Cabang] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedBranchTransfersToSupabase(
  transfersList: StockTransfer[],
  timeoutMs = 10000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (transfersList || []).filter((t) => Boolean(t.id) && !isDemoTransferId(t.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { branchTransferTable } = getSupabaseConfig();
  const tableName = branchTransferTable || DEFAULT_BRANCH_TRANSFER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(stockTransferToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai transfer cabang ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteBranchTransferFromSupabase(
  id: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!id || isDemoTransferId(id)) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { branchTransferTable } = getSupabaseConfig();
  const tableName = branchTransferTable || DEFAULT_BRANCH_TRANSFER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeBranchTransfersRealtime(
  onInsert: (transfer: StockTransfer) => void,
  onUpdate: (transfer: StockTransfer) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { branchTransferTable } = getSupabaseConfig();
  const table = branchTransferTable || DEFAULT_BRANCH_TRANSFER_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const mapped = supabaseRowToStockTransfer(p.new);
          if (!isDemoTransferId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const mapped = supabaseRowToStockTransfer(p.new);
          if (!isDemoTransferId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Transfer Cabang Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_MULTI_CABANG_SQL_SCHEMA = `-- ============================================================================
-- SKEMA TABEL MULTI-CABANG & TRANSFER STOK ANTAR-CABANG (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda
-- ============================================================================

-- 1. TABEL MASTER DATA CABANG (cabang)
CREATE TABLE IF NOT EXISTS cabang (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(100),
  is_central BOOLEAN DEFAULT FALSE,
  sync_status VARCHAR(50) DEFAULT 'Tersinkronisasi',
  last_sync_time VARCHAR(100) DEFAULT 'Baru saja',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel cabang sudah ada sebelumnya:
ALTER TABLE cabang ADD COLUMN IF NOT EXISTS phone VARCHAR(100);
ALTER TABLE cabang ADD COLUMN IF NOT EXISTS is_central BOOLEAN DEFAULT FALSE;
ALTER TABLE cabang ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'Tersinkronisasi';
ALTER TABLE cabang ADD COLUMN IF NOT EXISTS last_sync_time VARCHAR(100) DEFAULT 'Baru saja';
ALTER TABLE cabang ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE cabang REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_cabang_code ON cabang (code);
CREATE INDEX IF NOT EXISTS idx_cabang_central ON cabang (is_central DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cabang'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cabang;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('cabang')}

-- 2. TABEL RIWAYAT TRANSFER / MUTASI STOK ANTAR-CABANG (transfer_stok_cabang)
CREATE TABLE IF NOT EXISTS transfer_stok_cabang (
  id VARCHAR(100) PRIMARY KEY,
  date VARCHAR(50) NOT NULL,
  from_branch_id VARCHAR(100) NOT NULL,
  to_branch_id VARCHAR(100) NOT NULL,
  medicine_id VARCHAR(100) NOT NULL,
  medicine_name VARCHAR(255) NOT NULL,
  qty NUMERIC(12,2) DEFAULT 0,
  unit VARCHAR(50) DEFAULT 'Unit',
  status VARCHAR(50) DEFAULT 'Diterima',
  petugas VARCHAR(255) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel transfer_stok_cabang sudah ada sebelumnya:
ALTER TABLE transfer_stok_cabang ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE transfer_stok_cabang ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE transfer_stok_cabang REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_transfer_stok_cabang_date ON transfer_stok_cabang (date DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_stok_cabang_from ON transfer_stok_cabang (from_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfer_stok_cabang_to ON transfer_stok_cabang (to_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfer_stok_cabang_med ON transfer_stok_cabang (medicine_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'transfer_stok_cabang'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transfer_stok_cabang;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('transfer_stok_cabang', { includeFunctions: false })}
`;

// ============================================================================
// RIWAYAT SHIFT KASIR (riwayat_shift_kasir) — Integrasi 2-Arah Real-Time Supabase
// ============================================================================

export function isDemoCashierShiftId(id?: string): boolean {
  if (!id) return false;
  const clean = id.trim().toUpperCase();
  return clean.startsWith('SHIFT-DEMO-') || clean.includes('-DEMO');
}

export function cashierShiftToSupabaseRow(s: CashierShiftSession): Record<string, any> {
  return {
    id: s.id,
    branch_id: s.branchId || 'BR-01',
    cashier_name: s.cashierName || 'Petugas Kasir',
    shift_name: s.shiftName || 'Shift Pagi (07:00 - 14:00)',
    open_date: s.openDate || new Date().toISOString().split('T')[0],
    open_time: s.openTime || '',
    open_timestamp: Number(s.openTimestamp) || Date.now(),
    close_date: s.closeDate || null,
    close_time: s.closeTime || null,
    opening_float: Number(s.openingFloat) || 0,
    opening_notes: s.openingNotes || '',
    system_cash_sales: Number(s.systemCashSales) || 0,
    system_non_cash_sales: Number(s.systemNonCashSales) || 0,
    expected_cash_in_drawer: Number(s.expectedCashInDrawer) || 0,
    physical_cash_in_drawer: Number(s.physicalCashInDrawer) || 0,
    difference: Number(s.difference) || 0,
    difference_status: s.differenceStatus || 'Sesuai',
    closing_notes: s.closingNotes || null,
    denominations: Array.isArray(s.denominations) ? s.denominations : [],
    status: s.status || 'Aktif',
    approved_by: s.approvedBy || null,
    approval_time: s.approvalTime || null,
    approval_notes: s.approvalNotes || null,
    transaction_count: Number(s.transactionCount) || 0,
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToCashierShift(row: Record<string, any>): CashierShiftSession {
  let parsedDenoms: CashDenominationItem[] = [];
  if (Array.isArray(row.denominations)) {
    parsedDenoms = row.denominations;
  } else if (typeof row.denominations === 'string' && row.denominations.trim()) {
    try {
      const p = JSON.parse(row.denominations);
      if (Array.isArray(p)) parsedDenoms = p;
    } catch {}
  }

  if (parsedDenoms.length === 0) {
    parsedDenoms = CASH_DENOMINATIONS_LIST.map((d) => ({
      nominal: d.nominal,
      label: d.label,
      sheets: 0,
      subtotal: 0
    }));
  } else {
    parsedDenoms = parsedDenoms.map((d: any) => ({
      nominal: Number(d.nominal) || 0,
      label: String(d.label || `Rp ${(Number(d.nominal) || 0).toLocaleString('id-ID')}`),
      sheets: Number(d.sheets) || 0,
      subtotal: Number(d.subtotal ?? (Number(d.nominal) || 0) * (Number(d.sheets) || 0))
    }));
  }

  const rawDiffStatus = String(row.difference_status ?? row.differenceStatus ?? 'Sesuai');
  const validDiffStatus: CashierShiftSession['differenceStatus'] =
    rawDiffStatus === 'Surplus (Lebih)' || rawDiffStatus === 'Defisit (Kurang)'
      ? rawDiffStatus
      : 'Sesuai';

  const rawStatus = String(row.status ?? 'Aktif');
  const validStatus: CashierShiftSession['status'] =
    rawStatus === 'Ditutup (Approved Super Admin)'
      ? 'Ditutup (Approved APJ / Owner)'
      : rawStatus === 'Menunggu Approval Tutup Kasir' ||
        rawStatus === 'Ditutup (Sesuai)' ||
        rawStatus === 'Ditutup (Approved APJ / Owner)' ||
        rawStatus === 'Ditolak (Hitung Ulang)'
      ? rawStatus
      : 'Aktif';

  return {
    id: String(row.id || `SHIFT-${Date.now()}`),
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01'),
    cashierName: String(row.cashier_name ?? row.cashierName ?? 'Petugas Kasir'),
    shiftName: String(row.shift_name ?? row.shiftName ?? 'Shift Pagi (07:00 - 14:00)'),
    openDate: String(row.open_date ?? row.openDate ?? new Date().toISOString().split('T')[0]),
    openTime: String(row.open_time ?? row.openTime ?? ''),
    openTimestamp: Number(row.open_timestamp ?? row.openTimestamp ?? Date.now()),
    closeDate: row.close_date ?? row.closeDate ? String(row.close_date ?? row.closeDate) : undefined,
    closeTime: row.close_time ?? row.closeTime ? String(row.close_time ?? row.closeTime) : undefined,
    openingFloat: Number(row.opening_float ?? row.openingFloat ?? 0),
    openingNotes:
      row.opening_notes ?? row.openingNotes
        ? String(row.opening_notes ?? row.openingNotes)
        : undefined,
    systemCashSales: Number(row.system_cash_sales ?? row.systemCashSales ?? 0),
    systemNonCashSales: Number(row.system_non_cash_sales ?? row.systemNonCashSales ?? 0),
    expectedCashInDrawer: Number(row.expected_cash_in_drawer ?? row.expectedCashInDrawer ?? 0),
    physicalCashInDrawer: Number(row.physical_cash_in_drawer ?? row.physicalCashInDrawer ?? 0),
    difference: Number(row.difference ?? 0),
    differenceStatus: validDiffStatus,
    closingNotes:
      row.closing_notes ?? row.closingNotes
        ? String(row.closing_notes ?? row.closingNotes)
        : undefined,
    denominations: parsedDenoms,
    status: validStatus,
    approvedBy:
      row.approved_by ?? row.approvedBy ? String(row.approved_by ?? row.approvedBy) : undefined,
    approvalTime:
      row.approval_time ?? row.approvalTime
        ? String(row.approval_time ?? row.approvalTime)
        : undefined,
    approvalNotes:
      row.approval_notes ?? row.approvalNotes
        ? String(row.approval_notes ?? row.approvalNotes)
        : undefined,
    transactionCount: Number(row.transaction_count ?? row.transactionCount ?? 0)
  };
}

export async function fetchCashierShiftsFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: CashierShiftSession[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { cashierShiftTable } = getSupabaseConfig();
  const tableName = cashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout mengambil data dari tabel ${tableName}` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('open_timestamp', { ascending: false })
      .order('created_at', { ascending: false });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as {
      data: any[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Riwayat Shift] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToCashierShift)
      .filter((s) => !isDemoCashierShiftId(s.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncCashierShiftToSupabase(
  shift: CashierShiftSession,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!shift?.id || isDemoCashierShiftId(shift.id)) {
    return { success: false, error: 'Data shift demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { cashierShiftTable } = getSupabaseConfig();
  const tableName = cashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = cashierShiftToSupabaseRow(shift);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan riwayat shift ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Riwayat Shift] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedCashierShiftsToSupabase(
  shiftsList: CashierShiftSession[],
  timeoutMs = 10000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (shiftsList || []).filter((s) => Boolean(s.id) && !isDemoCashierShiftId(s.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { cashierShiftTable } = getSupabaseConfig();
  const tableName = cashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(cashierShiftToSupabaseRow);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai riwayat shift ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }

    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteCashierShiftsFromSupabase(
  ids: string[]
): Promise<{
  success: boolean;
  deletedCount?: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validIds = Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && !isDemoCashierShiftId(id))
    )
  );
  if (validIds.length === 0) return { success: true, deletedCount: 0 };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { cashierShiftTable } = getSupabaseConfig();
  const tableName = cashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).delete().in('id', chunk);
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, needsTableSetup, error: error.message };
      }

      // Verify rows are actually removed (detects silent PostgREST RLS DELETE block)
      const { data: stillExisting, error: verifyErr } = await client
        .from(tableName)
        .select('id')
        .in('id', chunk);
      if (!verifyErr && Array.isArray(stillExisting) && stillExisting.length > 0) {
        return {
          success: false,
          needsTableSetup: true,
          error: `Supabase menolak penghapusan ${stillExisting.length} data shift pada tabel "${tableName}" (kebijakan RLS DELETE belum aktif). Jalankan ulang Skema SQL.`
        };
      }
    }
    return { success: true, deletedCount: validIds.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deleteCashierShiftFromSupabase(
  id: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (!id || isDemoCashierShiftId(id)) return { success: true };
  return deleteCashierShiftsFromSupabase([id]);
}

export async function clearCashierShiftsFromSupabase(
  ids?: string[]
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { cashierShiftTable } = getSupabaseConfig();
  const tableName = cashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const cleanIds = Array.from(
      new Set(
        (ids || [])
          .map((id) => String(id || '').trim())
          .filter((id) => Boolean(id) && !isDemoCashierShiftId(id))
      )
    );
    if (cleanIds.length > 0) {
      const batchRes = await deleteCashierShiftsFromSupabase(cleanIds);
      if (!batchRes.success) return batchRes;
    }

    // Also clear any additional rows that might exist remotely in the table
    const { error } = await client.from(tableName).delete().neq('id', '');
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }

    const { data: remaining, error: verifyErr } = await client
      .from(tableName)
      .select('id')
      .limit(1);
    if (!verifyErr && Array.isArray(remaining) && remaining.length > 0) {
      return {
        success: false,
        needsTableSetup: true,
        error: `Supabase menolak pengosongan tabel "${tableName}" (kebijakan RLS DELETE belum aktif). Jalankan ulang Skema SQL.`
      };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeCashierShiftsRealtime(
  onInsert: (shift: CashierShiftSession) => void,
  onUpdate: (shift: CashierShiftSession) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { cashierShiftTable } = getSupabaseConfig();
  const table = cashierShiftTable || DEFAULT_CASHIER_SHIFT_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const mapped = supabaseRowToCashierShift(p.new);
          if (!isDemoCashierShiftId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.new) {
          const mapped = supabaseRowToCashierShift(p.new);
          if (!isDemoCashierShiftId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (isDemoMode()) return;
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Riwayat Shift Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_CASHIER_SHIFT_SQL_SCHEMA = `-- ============================================================================
-- SKEMA TABEL RIWAYAT SHIFT KASIR (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda
-- ============================================================================

CREATE TABLE IF NOT EXISTS riwayat_shift_kasir (
  id VARCHAR(100) PRIMARY KEY,
  branch_id VARCHAR(100) DEFAULT 'BR-01',
  cashier_name VARCHAR(255) NOT NULL,
  shift_name VARCHAR(150) NOT NULL,
  open_date VARCHAR(50) NOT NULL,
  open_time VARCHAR(50) NOT NULL,
  open_timestamp BIGINT DEFAULT 0,
  close_date VARCHAR(50),
  close_time VARCHAR(50),
  opening_float NUMERIC(15,2) DEFAULT 0,
  opening_notes TEXT,
  system_cash_sales NUMERIC(15,2) DEFAULT 0,
  system_non_cash_sales NUMERIC(15,2) DEFAULT 0,
  expected_cash_in_drawer NUMERIC(15,2) DEFAULT 0,
  physical_cash_in_drawer NUMERIC(15,2) DEFAULT 0,
  difference NUMERIC(15,2) DEFAULT 0,
  difference_status VARCHAR(50) DEFAULT 'Sesuai',
  closing_notes TEXT,
  denominations JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(100) DEFAULT 'Aktif',
  approved_by VARCHAR(255),
  approval_time VARCHAR(100),
  approval_notes TEXT,
  transaction_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel riwayat_shift_kasir sudah ada sebelumnya:
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS branch_id VARCHAR(100) DEFAULT 'BR-01';
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS open_timestamp BIGINT DEFAULT 0;
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS close_date VARCHAR(50);
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS close_time VARCHAR(50);
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS opening_notes TEXT;
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS closing_notes TEXT;
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS denominations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255);
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS approval_time VARCHAR(100);
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS approval_notes TEXT;
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS transaction_count INT DEFAULT 0;
ALTER TABLE riwayat_shift_kasir ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE riwayat_shift_kasir REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_riwayat_shift_kasir_date ON riwayat_shift_kasir (open_date DESC);
CREATE INDEX IF NOT EXISTS idx_riwayat_shift_kasir_ts ON riwayat_shift_kasir (open_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_riwayat_shift_kasir_status ON riwayat_shift_kasir (status);
CREATE INDEX IF NOT EXISTS idx_riwayat_shift_kasir_branch ON riwayat_shift_kasir (branch_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'riwayat_shift_kasir'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE riwayat_shift_kasir;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('riwayat_shift_kasir', { hasBranchId: true })}
`;

// ============================================================================
// MANAJEMEN HUTANG & PIUTANG (FAKTUR PBF, PEMBAYARAN HUTANG, PELUNASAN PIUTANG, BUKU KAS)
// ============================================================================

const DEMO_PURCHASE_INVOICE_IDS = new Set([
  'INV-PBF-DEMO-001',
  'INV-PBF-DEMO-002',
  'INV-PBF-001',
  'INV-PBF-002'
]);

const DEMO_DEBT_PAYMENT_IDS = new Set([
  'PAY-HUTANG-001',
  'PAY-HUTANG-DEMO-001'
]);

const DEMO_RECEIVABLE_PAYMENT_IDS = new Set([
  'PAY-PIUTANG-001',
  'PAY-PIUTANG-DEMO-001'
]);

const DEMO_CASH_FLOW_IDS = new Set([
  'CSH-001',
  'CSH-002',
  'CSH-DEMO-001',
  'CSH-DEMO-002'
]);

export function isDemoPurchaseInvoiceId(id?: string): boolean {
  if (!id) return false;
  const clean = id.trim();
  return DEMO_PURCHASE_INVOICE_IDS.has(clean) || clean.toUpperCase().includes('DEMO');
}

export function isDemoDebtPaymentId(id?: string): boolean {
  if (!id) return false;
  const clean = id.trim();
  return DEMO_DEBT_PAYMENT_IDS.has(clean) || clean.toUpperCase().includes('DEMO');
}

export function isDemoReceivablePaymentId(id?: string): boolean {
  if (!id) return false;
  const clean = id.trim();
  return DEMO_RECEIVABLE_PAYMENT_IDS.has(clean) || clean.toUpperCase().includes('DEMO');
}

export function isDemoCashFlowId(id?: string): boolean {
  if (!id) return false;
  const clean = id.trim();
  return DEMO_CASH_FLOW_IDS.has(clean) || clean.toUpperCase().includes('DEMO');
}

// 1. Mappers: PurchaseInvoice <-> faktur_pembelian
export function purchaseInvoiceToSupabaseRow(inv: PurchaseInvoice): Record<string, any> {
  const total = Number(inv.totalTagihan) || 0;
  const paid =
    inv.paidAmount !== undefined
      ? Number(inv.paidAmount)
      : inv.status === 'Lunas'
      ? total
      : 0;
  const remaining =
    inv.remainingAmount !== undefined
      ? Number(inv.remainingAmount)
      : Math.max(0, total - paid);

  return {
    id: inv.id,
    pbf_name: inv.pbfName || '',
    invoice_no: inv.invoiceNo || '',
    date: inv.date || new Date().toISOString().split('T')[0],
    due_date: inv.dueDate || inv.date || new Date().toISOString().split('T')[0],
    salesman: inv.salesman || '',
    term: inv.term || '30 Hari',
    use_ppn: Boolean(inv.usePpn),
    items: Array.isArray(inv.items) ? inv.items : [],
    gross_dpp: Number(inv.grossDpp) || 0,
    total_discount_amount: Number(inv.totalDiscountAmount) || 0,
    dpp: Number(inv.dpp) || 0,
    ppn: Number(inv.ppn) || 0,
    total_tagihan: total,
    status: inv.status || (remaining <= 0 ? 'Lunas' : paid > 0 ? 'Sebagian' : 'Belum Lunas'),
    paid_amount: paid,
    remaining_amount: remaining,
    branch_id: inv.branchId || 'BR-01',
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToPurchaseInvoice(row: Record<string, any>): PurchaseInvoice {
  let items: PurchaseItem[] = [];
  const rawItems = row.items;
  if (rawItems) {
    try {
      const parsed = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
  }

  const totalTagihan = Number(row.total_tagihan ?? row.totalTagihan ?? 0);
  const rawStatus = String(row.status || 'Belum Lunas');
  const status: 'Lunas' | 'Belum Lunas' | 'Sebagian' =
    rawStatus === 'Lunas' || rawStatus === 'Sebagian' ? rawStatus : 'Belum Lunas';

  const paidAmount =
    row.paid_amount !== undefined && row.paid_amount !== null
      ? Number(row.paid_amount)
      : row.paidAmount !== undefined && row.paidAmount !== null
      ? Number(row.paidAmount)
      : status === 'Lunas'
      ? totalTagihan
      : 0;

  const remainingAmount =
    row.remaining_amount !== undefined && row.remaining_amount !== null
      ? Number(row.remaining_amount)
      : row.remainingAmount !== undefined && row.remainingAmount !== null
      ? Number(row.remainingAmount)
      : Math.max(0, totalTagihan - paidAmount);

  const rawTerm = String(row.term || '30 Hari');
  const validTerms: PurchaseInvoice['term'][] = ['Cash / COD', '14 Hari', '30 Hari', '60 Hari'];
  const term: PurchaseInvoice['term'] = validTerms.includes(rawTerm as PurchaseInvoice['term'])
    ? (rawTerm as PurchaseInvoice['term'])
    : '30 Hari';

  return {
    id: String(row.id || `INV-PBF-${Date.now()}`),
    pbfName: String(row.pbf_name ?? row.pbfName ?? ''),
    invoiceNo: String(row.invoice_no ?? row.invoiceNo ?? ''),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    dueDate: String(row.due_date ?? row.dueDate ?? row.date ?? ''),
    salesman: String(row.salesman ?? ''),
    term,
    usePpn: row.use_ppn !== undefined ? Boolean(row.use_ppn) : Boolean(row.usePpn ?? true),
    items,
    grossDpp: Number(row.gross_dpp ?? row.grossDpp ?? 0),
    totalDiscountAmount: Number(row.total_discount_amount ?? row.totalDiscountAmount ?? 0),
    dpp: Number(row.dpp ?? 0),
    ppn: Number(row.ppn ?? 0),
    totalTagihan,
    status: remainingAmount <= 0 && totalTagihan > 0 ? 'Lunas' : paidAmount > 0 ? 'Sebagian' : status,
    paidAmount,
    remainingAmount,
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01')
  };
}

// 2. Mappers: DebtPaymentRecord <-> pembayaran_hutang
export function debtPaymentToSupabaseRow(rec: DebtPaymentRecord): Record<string, any> {
  return {
    id: rec.id,
    invoice_id: rec.invoiceId || '',
    invoice_no: rec.invoiceNo || '',
    pbf_name: rec.pbfName || '',
    payment_date: rec.paymentDate || new Date().toISOString().split('T')[0],
    amount: Number(rec.amount) || 0,
    payment_method: rec.paymentMethod || 'Kas Apotek (Tunai)',
    reference_no: rec.referenceNo || null,
    notes: rec.notes || null,
    petugas: rec.petugas || '',
    previous_balance: Number(rec.previousBalance) || 0,
    remaining_balance: Number(rec.remainingBalance) || 0,
    created_at: rec.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToDebtPayment(row: Record<string, any>): DebtPaymentRecord {
  return {
    id: String(row.id || `PAY-HUTANG-${Date.now()}`),
    invoiceId: String(row.invoice_id ?? row.invoiceId ?? ''),
    invoiceNo: String(row.invoice_no ?? row.invoiceNo ?? ''),
    pbfName: String(row.pbf_name ?? row.pbfName ?? ''),
    paymentDate: String(row.payment_date ?? row.paymentDate ?? new Date().toISOString().split('T')[0]),
    amount: Number(row.amount ?? 0),
    paymentMethod: String(row.payment_method ?? row.paymentMethod ?? 'Kas Apotek (Tunai)'),
    referenceNo: row.reference_no ?? row.referenceNo ?? undefined,
    notes: row.notes ?? undefined,
    petugas: String(row.petugas ?? ''),
    previousBalance: Number(row.previous_balance ?? row.previousBalance ?? 0),
    remainingBalance: Number(row.remaining_balance ?? row.remainingBalance ?? 0),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString())
  };
}

// 3. Mappers: ReceivablePaymentRecord <-> pelunasan_piutang
export function receivablePaymentToSupabaseRow(rec: ReceivablePaymentRecord): Record<string, any> {
  return {
    id: rec.id,
    transaction_id: rec.transactionId || '',
    customer_name: rec.customerName || '',
    payment_date: rec.paymentDate || new Date().toISOString().split('T')[0],
    amount: Number(rec.amount) || 0,
    payment_method: rec.paymentMethod || 'Kas Apotek (Tunai)',
    reference_no: rec.referenceNo || null,
    notes: rec.notes || null,
    petugas: rec.petugas || '',
    previous_balance: Number(rec.previousBalance) || 0,
    remaining_balance: Number(rec.remainingBalance) || 0,
    created_at: rec.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToReceivablePayment(row: Record<string, any>): ReceivablePaymentRecord {
  return {
    id: String(row.id || `PAY-PIUTANG-${Date.now()}`),
    transactionId: String(row.transaction_id ?? row.transactionId ?? ''),
    customerName: String(row.customer_name ?? row.customerName ?? ''),
    paymentDate: String(row.payment_date ?? row.paymentDate ?? new Date().toISOString().split('T')[0]),
    amount: Number(row.amount ?? 0),
    paymentMethod: String(row.payment_method ?? row.paymentMethod ?? 'Kas Apotek (Tunai)'),
    referenceNo: row.reference_no ?? row.referenceNo ?? undefined,
    notes: row.notes ?? undefined,
    petugas: String(row.petugas ?? ''),
    previousBalance: Number(row.previous_balance ?? row.previousBalance ?? 0),
    remainingBalance: Number(row.remaining_balance ?? row.remainingBalance ?? 0),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString())
  };
}

// 4. Mappers: CashFlowRecord <-> buku_kas_mutasi
export function cashFlowToSupabaseRow(rec: CashFlowRecord): Record<string, any> {
  return {
    id: rec.id,
    date: rec.date || new Date().toISOString().split('T')[0],
    time: rec.time || '',
    type: rec.type === 'IN' ? 'IN' : 'OUT',
    category: rec.category || 'Lainnya',
    amount: Number(rec.amount) || 0,
    reference_id: rec.referenceId || '',
    reference_no: rec.referenceNo || '',
    party_name: rec.partyName || '',
    payment_method: rec.paymentMethod || 'Kas Apotek (Tunai)',
    description: rec.description || '',
    petugas: rec.petugas || '',
    created_at: rec.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToCashFlow(row: Record<string, any>): CashFlowRecord {
  const rawCategory = String(row.category || 'Lainnya');
  const validCategories: CashFlowRecord['category'][] = [
    'Pembayaran Hutang PBF',
    'Pelunasan Piutang POS',
    'Operasional',
    'Lainnya'
  ];
  const category: CashFlowRecord['category'] = validCategories.includes(
    rawCategory as CashFlowRecord['category']
  )
    ? (rawCategory as CashFlowRecord['category'])
    : 'Lainnya';

  return {
    id: String(row.id || `CSH-${Date.now()}`),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    time: String(row.time || ''),
    type: String(row.type || 'OUT').toUpperCase() === 'IN' ? 'IN' : 'OUT',
    category,
    amount: Number(row.amount ?? 0),
    referenceId: String(row.reference_id ?? row.referenceId ?? ''),
    referenceNo: String(row.reference_no ?? row.referenceNo ?? ''),
    partyName: String(row.party_name ?? row.partyName ?? ''),
    paymentMethod: String(row.payment_method ?? row.paymentMethod ?? 'Kas Apotek (Tunai)'),
    description: String(row.description ?? ''),
    petugas: String(row.petugas ?? ''),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString())
  };
}

// Generic helper to fetch all rows from a table with .range(from, to) looping & table availability check
async function fetchAllRowsWithRangeLoop(
  tableName: string,
  orderColumn: string,
  forceRefresh = false
): Promise<{
  rows: Record<string, any>[] | null;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { rows: null };
  const client = getSupabaseClient();
  if (!client) return { rows: null, error: 'Klien Supabase belum dikonfigurasi' };

  const available = await isSupabaseTableAvailable(tableName, forceRefresh);
  if (available === false) {
    return {
      rows: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const PAGE_SIZE = 1000;
  const allRows: Record<string, any>[] = [];
  let from = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      const { data: batch, error } = await client
        .from(tableName)
        .select('*')
        .order(orderColumn, { ascending: false })
        .range(from, to);

      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { rows: null, needsTableSetup, error: error.message };
      }

      if (batch && batch.length > 0) {
        allRows.push(...batch);
        if (batch.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    return { rows: allRows };
  } catch (err: any) {
    return { rows: null, error: err?.message || String(err) };
  }
}

// --- CRUD & Realtime: PurchaseInvoice (faktur_pembelian) ---
export async function fetchPurchaseInvoicesFromSupabase(options?: {
  forceRefresh?: boolean;
}): Promise<{
  data: PurchaseInvoice[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const { purchaseInvoiceTable } = getSupabaseConfig();
  const tableName = purchaseInvoiceTable || DEFAULT_PURCHASE_INVOICE_TABLE;

  const res = await fetchAllRowsWithRangeLoop(tableName, 'date', Boolean(options?.forceRefresh));
  if (res.error || !res.rows) {
    return {
      data: null,
      needsTableSetup: res.needsTableSetup,
      error: res.error
    };
  }

  const mapped = res.rows
    .map(supabaseRowToPurchaseInvoice)
    .filter((inv) => !isDemoPurchaseInvoiceId(inv.id));

  if (mapped.length === 0) return { data: [], isEmpty: true };
  return { data: mapped };
}

export async function syncPurchaseInvoiceToSupabase(
  inv: PurchaseInvoice
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!inv?.id || isDemoPurchaseInvoiceId(inv.id)) {
    return { success: false, error: 'Data faktur demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { purchaseInvoiceTable } = getSupabaseConfig();
  const tableName = purchaseInvoiceTable || DEFAULT_PURCHASE_INVOICE_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const row = purchaseInvoiceToSupabaseRow(inv);
    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedPurchaseInvoicesToSupabase(
  invoices: PurchaseInvoice[]
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (invoices || []).filter((i) => Boolean(i.id) && !isDemoPurchaseInvoiceId(i.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { purchaseInvoiceTable } = getSupabaseConfig();
  const tableName = purchaseInvoiceTable || DEFAULT_PURCHASE_INVOICE_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(purchaseInvoiceToSupabaseRow);
  const CHUNK_SIZE = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).upsert(chunk, { onConflict: 'id' });
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, count: i, needsTableSetup, error: error.message };
      }
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deletePurchaseInvoiceFromSupabase(
  id: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!id || isDemoPurchaseInvoiceId(id)) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { purchaseInvoiceTable } = getSupabaseConfig();
  const tableName = purchaseInvoiceTable || DEFAULT_PURCHASE_INVOICE_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribePurchaseInvoicesRealtime(
  onInsert: (inv: PurchaseInvoice) => void,
  onUpdate: (inv: PurchaseInvoice) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { purchaseInvoiceTable } = getSupabaseConfig();
  const table = purchaseInvoiceTable || DEFAULT_PURCHASE_INVOICE_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToPurchaseInvoice(p.new);
        if (!isDemoPurchaseInvoiceId(mapped.id)) onInsert(mapped);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToPurchaseInvoice(p.new);
        if (!isDemoPurchaseInvoiceId(mapped.id)) onUpdate(mapped);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.old?.id) return;
        onDelete(String(p.old.id));
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.warn('[Supabase PurchaseInvoice Realtime Error]:', err);
    return null;
  }
}

// --- CRUD & Realtime: DebtPaymentRecord (pembayaran_hutang) ---
export async function fetchDebtPaymentsFromSupabase(options?: {
  forceRefresh?: boolean;
}): Promise<{
  data: DebtPaymentRecord[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const { debtPaymentTable } = getSupabaseConfig();
  const tableName = debtPaymentTable || DEFAULT_DEBT_PAYMENT_TABLE;

  const res = await fetchAllRowsWithRangeLoop(tableName, 'created_at', Boolean(options?.forceRefresh));
  if (res.error || !res.rows) {
    return {
      data: null,
      needsTableSetup: res.needsTableSetup,
      error: res.error
    };
  }

  const mapped = res.rows
    .map(supabaseRowToDebtPayment)
    .filter((rec) => !isDemoDebtPaymentId(rec.id));

  if (mapped.length === 0) return { data: [], isEmpty: true };
  return { data: mapped };
}

export async function syncDebtPaymentToSupabase(
  rec: DebtPaymentRecord
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!rec?.id || isDemoDebtPaymentId(rec.id)) {
    return { success: false, error: 'Data pembayaran hutang demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { debtPaymentTable } = getSupabaseConfig();
  const tableName = debtPaymentTable || DEFAULT_DEBT_PAYMENT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const row = debtPaymentToSupabaseRow(rec);
    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedDebtPaymentsToSupabase(
  records: DebtPaymentRecord[]
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (records || []).filter((r) => Boolean(r.id) && !isDemoDebtPaymentId(r.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { debtPaymentTable } = getSupabaseConfig();
  const tableName = debtPaymentTable || DEFAULT_DEBT_PAYMENT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(debtPaymentToSupabaseRow);
  const CHUNK_SIZE = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).upsert(chunk, { onConflict: 'id' });
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, count: i, needsTableSetup, error: error.message };
      }
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export function subscribeDebtPaymentsRealtime(
  onInsert: (rec: DebtPaymentRecord) => void,
  onUpdate: (rec: DebtPaymentRecord) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { debtPaymentTable } = getSupabaseConfig();
  const table = debtPaymentTable || DEFAULT_DEBT_PAYMENT_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToDebtPayment(p.new);
        if (!isDemoDebtPaymentId(mapped.id)) onInsert(mapped);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToDebtPayment(p.new);
        if (!isDemoDebtPaymentId(mapped.id)) onUpdate(mapped);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.old?.id) return;
        onDelete(String(p.old.id));
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.warn('[Supabase DebtPayment Realtime Error]:', err);
    return null;
  }
}

// --- CRUD & Realtime: ReceivablePaymentRecord (pelunasan_piutang) ---
export async function fetchReceivablePaymentsFromSupabase(options?: {
  forceRefresh?: boolean;
}): Promise<{
  data: ReceivablePaymentRecord[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const { receivablePaymentTable } = getSupabaseConfig();
  const tableName = receivablePaymentTable || DEFAULT_RECEIVABLE_PAYMENT_TABLE;

  const res = await fetchAllRowsWithRangeLoop(tableName, 'created_at', Boolean(options?.forceRefresh));
  if (res.error || !res.rows) {
    return {
      data: null,
      needsTableSetup: res.needsTableSetup,
      error: res.error
    };
  }

  const mapped = res.rows
    .map(supabaseRowToReceivablePayment)
    .filter((rec) => !isDemoReceivablePaymentId(rec.id));

  if (mapped.length === 0) return { data: [], isEmpty: true };
  return { data: mapped };
}

export async function syncReceivablePaymentToSupabase(
  rec: ReceivablePaymentRecord
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!rec?.id || isDemoReceivablePaymentId(rec.id)) {
    return { success: false, error: 'Data pelunasan piutang demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { receivablePaymentTable } = getSupabaseConfig();
  const tableName = receivablePaymentTable || DEFAULT_RECEIVABLE_PAYMENT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const row = receivablePaymentToSupabaseRow(rec);
    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedReceivablePaymentsToSupabase(
  records: ReceivablePaymentRecord[]
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (records || []).filter((r) => Boolean(r.id) && !isDemoReceivablePaymentId(r.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { receivablePaymentTable } = getSupabaseConfig();
  const tableName = receivablePaymentTable || DEFAULT_RECEIVABLE_PAYMENT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(receivablePaymentToSupabaseRow);
  const CHUNK_SIZE = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).upsert(chunk, { onConflict: 'id' });
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, count: i, needsTableSetup, error: error.message };
      }
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export function subscribeReceivablePaymentsRealtime(
  onInsert: (rec: ReceivablePaymentRecord) => void,
  onUpdate: (rec: ReceivablePaymentRecord) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { receivablePaymentTable } = getSupabaseConfig();
  const table = receivablePaymentTable || DEFAULT_RECEIVABLE_PAYMENT_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToReceivablePayment(p.new);
        if (!isDemoReceivablePaymentId(mapped.id)) onInsert(mapped);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToReceivablePayment(p.new);
        if (!isDemoReceivablePaymentId(mapped.id)) onUpdate(mapped);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.old?.id) return;
        onDelete(String(p.old.id));
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.warn('[Supabase ReceivablePayment Realtime Error]:', err);
    return null;
  }
}

// --- CRUD & Realtime: CashFlowRecord (buku_kas_mutasi) ---
export async function fetchCashFlowsFromSupabase(options?: {
  forceRefresh?: boolean;
}): Promise<{
  data: CashFlowRecord[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const { cashFlowTable } = getSupabaseConfig();
  const tableName = cashFlowTable || DEFAULT_CASH_FLOW_TABLE;

  const res = await fetchAllRowsWithRangeLoop(tableName, 'created_at', Boolean(options?.forceRefresh));
  if (res.error || !res.rows) {
    return {
      data: null,
      needsTableSetup: res.needsTableSetup,
      error: res.error
    };
  }

  const mapped = res.rows
    .map(supabaseRowToCashFlow)
    .filter((rec) => !isDemoCashFlowId(rec.id));

  if (mapped.length === 0) return { data: [], isEmpty: true };
  return { data: mapped };
}

export async function syncCashFlowToSupabase(
  rec: CashFlowRecord
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!rec?.id || isDemoCashFlowId(rec.id)) {
    return { success: false, error: 'Data mutasi kas demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { cashFlowTable } = getSupabaseConfig();
  const tableName = cashFlowTable || DEFAULT_CASH_FLOW_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const row = cashFlowToSupabaseRow(rec);
    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedCashFlowsToSupabase(
  records: CashFlowRecord[]
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (records || []).filter((r) => Boolean(r.id) && !isDemoCashFlowId(r.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { cashFlowTable } = getSupabaseConfig();
  const tableName = cashFlowTable || DEFAULT_CASH_FLOW_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const rows = valid.map(cashFlowToSupabaseRow);
  const CHUNK_SIZE = 500;
  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).upsert(chunk, { onConflict: 'id' });
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, count: i, needsTableSetup, error: error.message };
      }
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export function subscribeCashFlowsRealtime(
  onInsert: (rec: CashFlowRecord) => void,
  onUpdate: (rec: CashFlowRecord) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { cashFlowTable } = getSupabaseConfig();
  const table = cashFlowTable || DEFAULT_CASH_FLOW_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToCashFlow(p.new);
        if (!isDemoCashFlowId(mapped.id)) onInsert(mapped);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.new) return;
        const mapped = supabaseRowToCashFlow(p.new);
        if (!isDemoCashFlowId(mapped.id)) onUpdate(mapped);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (isDemoMode() || !p.old?.id) return;
        onDelete(String(p.old.id));
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.warn('[Supabase CashFlow Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_DEBT_RECEIVABLE_SQL_SCHEMA = `-- ============================================================================
-- SKEMA TABEL MANAJEMEN HUTANG & PIUTANG (APOTEK & KLINIK LATISHA FARMA)
-- Mencakup:
-- 1. faktur_pembelian   (Daftar Faktur PBF & Saldo Hutang Dagang)
-- 2. pembayaran_hutang  (Riwayat Pembayaran / Cicilan Hutang PBF)
-- 3. pelunasan_piutang  (Riwayat Penerimaan Pelunasan Piutang POS / Mitra)
-- 4. buku_kas_mutasi    (Buku Kas Masuk & Keluar Pelunasan Hutang-Piutang)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda
-- ============================================================================

-- 1. TABEL FAKTUR PEMBELIAN & HUTANG PBF
CREATE TABLE IF NOT EXISTS faktur_pembelian (
  id VARCHAR(100) PRIMARY KEY,
  pbf_name TEXT NOT NULL,
  invoice_no VARCHAR(100) NOT NULL,
  date VARCHAR(30) NOT NULL,
  due_date VARCHAR(30),
  salesman TEXT DEFAULT '',
  term VARCHAR(50) DEFAULT '30 Hari',
  use_ppn BOOLEAN DEFAULT TRUE,
  items JSONB DEFAULT '[]'::jsonb,
  gross_dpp NUMERIC(15,2) DEFAULT 0,
  total_discount_amount NUMERIC(15,2) DEFAULT 0,
  dpp NUMERIC(15,2) DEFAULT 0,
  ppn NUMERIC(15,2) DEFAULT 0,
  total_tagihan NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'Belum Lunas',
  paid_amount NUMERIC(15,2) DEFAULT 0,
  remaining_amount NUMERIC(15,2) DEFAULT 0,
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE faktur_pembelian ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE faktur_pembelian ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE faktur_pembelian ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE faktur_pembelian ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'BR-01';
ALTER TABLE faktur_pembelian ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE faktur_pembelian REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_faktur_pembelian_date ON faktur_pembelian (date DESC);
CREATE INDEX IF NOT EXISTS idx_faktur_pembelian_status ON faktur_pembelian (status);
CREATE INDEX IF NOT EXISTS idx_faktur_pembelian_pbf ON faktur_pembelian (pbf_name);

-- 2. TABEL RIWAYAT PEMBAYARAN HUTANG PBF
CREATE TABLE IF NOT EXISTS pembayaran_hutang (
  id VARCHAR(100) PRIMARY KEY,
  invoice_id VARCHAR(100) NOT NULL,
  invoice_no VARCHAR(100) NOT NULL,
  pbf_name TEXT NOT NULL,
  payment_date VARCHAR(30) NOT NULL,
  amount NUMERIC(15,2) DEFAULT 0,
  payment_method VARCHAR(100) DEFAULT 'Kas Apotek (Tunai)',
  reference_no VARCHAR(100),
  notes TEXT,
  petugas TEXT DEFAULT '',
  previous_balance NUMERIC(15,2) DEFAULT 0,
  remaining_balance NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pembayaran_hutang REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_pembayaran_hutang_invoice ON pembayaran_hutang (invoice_id);
CREATE INDEX IF NOT EXISTS idx_pembayaran_hutang_date ON pembayaran_hutang (payment_date DESC);

-- 3. TABEL RIWAYAT PELUNASAN PIUTANG PENJUALAN (POS / MITRA)
CREATE TABLE IF NOT EXISTS pelunasan_piutang (
  id VARCHAR(100) PRIMARY KEY,
  transaction_id VARCHAR(100) NOT NULL,
  customer_name TEXT NOT NULL,
  payment_date VARCHAR(30) NOT NULL,
  amount NUMERIC(15,2) DEFAULT 0,
  payment_method VARCHAR(100) DEFAULT 'Kas Apotek (Tunai)',
  reference_no VARCHAR(100),
  notes TEXT,
  petugas TEXT DEFAULT '',
  previous_balance NUMERIC(15,2) DEFAULT 0,
  remaining_balance NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pelunasan_piutang REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_pelunasan_piutang_trx ON pelunasan_piutang (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pelunasan_piutang_date ON pelunasan_piutang (payment_date DESC);

-- 4. TABEL BUKU KAS & MUTASI PELUNASAN HUTANG-PIUTANG
CREATE TABLE IF NOT EXISTS buku_kas_mutasi (
  id VARCHAR(100) PRIMARY KEY,
  date VARCHAR(30) NOT NULL,
  time VARCHAR(30) DEFAULT '',
  type VARCHAR(10) NOT NULL,
  category VARCHAR(100) NOT NULL,
  amount NUMERIC(15,2) DEFAULT 0,
  reference_id VARCHAR(100) DEFAULT '',
  reference_no VARCHAR(100) DEFAULT '',
  party_name TEXT DEFAULT '',
  payment_method VARCHAR(100) DEFAULT '',
  description TEXT DEFAULT '',
  petugas TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE buku_kas_mutasi REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_buku_kas_mutasi_date ON buku_kas_mutasi (date DESC);
CREATE INDEX IF NOT EXISTS idx_buku_kas_mutasi_type ON buku_kas_mutasi (type);

-- Pastikan kolom piutang pada tabel riwayat_penjualan tersedia:
ALTER TABLE IF EXISTS riwayat_penjualan ADD COLUMN IF NOT EXISTS due_date VARCHAR(30);
ALTER TABLE IF EXISTS riwayat_penjualan ADD COLUMN IF NOT EXISTS term VARCHAR(50) DEFAULT 'Cash / COD';
ALTER TABLE IF EXISTS riwayat_penjualan ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'Lunas';
ALTER TABLE IF EXISTS riwayat_penjualan ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE IF EXISTS riwayat_penjualan ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2) DEFAULT 0;

-- Aktifkan Realtime secara aman untuk keempat tabel
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['faktur_pembelian', 'pembayaran_hutang', 'pelunasan_piutang', 'buku_kas_mutasi']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;

${buildMultiTenantRlsSqlBlock('faktur_pembelian', { hasBranchId: true })}

${buildMultiTenantRlsSqlBlock('pembayaran_hutang', { includeFunctions: false })}

${buildMultiTenantRlsSqlBlock('pelunasan_piutang', { includeFunctions: false })}

${buildMultiTenantRlsSqlBlock('buku_kas_mutasi', { includeFunctions: false })}
`;

// ============================================================================
// MANAJEMEN DISKON PENJUALAN & IKLAN PROMO PORTAL MITRA
// ============================================================================

export function discountToSupabaseRow(d: SalesDiscount): Record<string, any> {
  return {
    id: d.id,
    kind: 'DISCOUNT',
    title: d.name,
    is_active: Boolean(d.isActive),
    priority: 0,
    start_date: d.startDate || null,
    end_date: d.endDate || null,
    payload_json: d,
    updated_at: d.updatedAt || new Date().toISOString()
  };
}

export function promoToSupabaseRow(p: PromoAd): Record<string, any> {
  return {
    id: p.id,
    kind: 'PROMO',
    title: p.title,
    is_active: Boolean(p.isActive),
    priority: Number(p.priority) || 1,
    start_date: p.startDate || null,
    end_date: p.endDate || null,
    payload_json: p,
    updated_at: p.updatedAt || new Date().toISOString()
  };
}

export function supabaseRowToPromoOrDiscount(row: Record<string, any>): {
  kind: 'DISCOUNT' | 'PROMO';
  discount?: SalesDiscount;
  promo?: PromoAd;
} | null {
  if (!row) return null;
  const kindRaw = String(row.kind || '').toUpperCase().trim();
  const payload = parseJsonMaybe<Record<string, any>>(row.payload_json) || {};
  const id = String(row.id || payload.id || '');
  if (!id) return null;

  if (kindRaw === 'DISCOUNT' || (!kindRaw && payload.basis)) {
    const d: SalesDiscount = {
      id,
      name: String(payload.name || row.title || 'Program Diskon'),
      code: payload.code ? String(payload.code) : '',
      autoApply: payload.autoApply !== undefined ? Boolean(payload.autoApply) : true,
      basis: payload.basis || 'ALL_ITEMS',
      targetMedicineIds: Array.isArray(payload.targetMedicineIds) ? payload.targetMedicineIds : [],
      targetCategories: Array.isArray(payload.targetCategories) ? payload.targetCategories : [],
      targetTherapyClasses: Array.isArray(payload.targetTherapyClasses) ? payload.targetTherapyClasses : [],
      valueType: payload.valueType === 'NOMINAL' ? 'NOMINAL' : 'PERCENT',
      value: Number(payload.value) || 0,
      maxDiscountAmount: Number(payload.maxDiscountAmount) || 0,
      minPurchaseAmount: Number(payload.minPurchaseAmount) || 0,
      minQty: Number(payload.minQty) || 0,
      channelScope: payload.channelScope || 'ALL',
      startDate: String(payload.startDate || row.start_date || ''),
      endDate: String(payload.endDate || row.end_date || ''),
      description: String(payload.description || ''),
      isActive: row.is_active !== undefined ? Boolean(row.is_active) : Boolean(payload.isActive ?? true),
      createdAt: String(payload.createdAt || row.created_at || new Date().toISOString()),
      updatedAt: String(row.updated_at || payload.updatedAt || '')
    };
    return { kind: 'DISCOUNT', discount: d };
  }

  if (kindRaw === 'PROMO' || (!kindRaw && payload.subtitle !== undefined)) {
    const p: PromoAd = {
      id,
      title: String(payload.title || row.title || 'Promo Spesial'),
      badgeText: payload.badgeText ? String(payload.badgeText) : 'PROMO MITRA',
      subtitle: String(payload.subtitle || ''),
      description: String(payload.description || ''),
      highlightText: payload.highlightText ? String(payload.highlightText) : '',
      promoCode: payload.promoCode ? String(payload.promoCode) : '',
      linkedDiscountId: payload.linkedDiscountId ? String(payload.linkedDiscountId) : '',
      ctaText: payload.ctaText ? String(payload.ctaText) : 'Lihat Katalog Promo',
      ctaFilterCategory: payload.ctaFilterCategory ? String(payload.ctaFilterCategory) : '',
      ctaFilterKelas: payload.ctaFilterKelas ? String(payload.ctaFilterKelas) : '',
      ctaSearchQuery: payload.ctaSearchQuery ? String(payload.ctaSearchQuery) : '',
      theme: payload.theme || 'emerald-clinical',
      bannerImageUrl: payload.bannerImageUrl ? String(payload.bannerImageUrl) : '',
      priority: Number(payload.priority ?? row.priority) || 1,
      startDate: String(payload.startDate || row.start_date || ''),
      endDate: String(payload.endDate || row.end_date || ''),
      showOnMitraPortal: payload.showOnMitraPortal !== undefined ? Boolean(payload.showOnMitraPortal) : true,
      isActive: row.is_active !== undefined ? Boolean(row.is_active) : Boolean(payload.isActive ?? true),
      createdAt: String(payload.createdAt || row.created_at || new Date().toISOString()),
      updatedAt: String(row.updated_at || payload.updatedAt || '')
    };
    return { kind: 'PROMO', promo: p };
  }

  return null;
}

export async function fetchDiscountsPromosFromSupabase(timeoutMs = 8000): Promise<{
  discounts: SalesDiscount[];
  promos: PromoAd[];
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { discounts: [], promos: [], isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { discounts: [], promos: [], error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { promoDiscountTable } = getSupabaseConfig();
  const tableName = promoDiscountTable || DEFAULT_PROMO_DISCOUNT_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ data: null, error: { message: `Timeout memuat ${tableName}` } });
      }, timeoutMs);
    });

    const queryPromise = client.from(tableName).select('*').order('updated_at', { ascending: false });
    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as { data: any[] | null; error: { message: string; code?: string } | null };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      return { discounts: [], promos: [], needsTableSetup, error: error.message };
    }

    const discounts: SalesDiscount[] = [];
    const promos: PromoAd[] = [];
    for (const row of data || []) {
      const parsed = supabaseRowToPromoOrDiscount(row);
      if (parsed?.kind === 'DISCOUNT' && parsed.discount) discounts.push(parsed.discount);
      else if (parsed?.kind === 'PROMO' && parsed.promo) promos.push(parsed.promo);
    }

    return { discounts, promos };
  } catch (err: any) {
    return { discounts: [], promos: [], error: err?.message || String(err) };
  }
}

export async function syncDiscountToSupabase(d: SalesDiscount): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const tableName = getSupabaseConfig().promoDiscountTable || DEFAULT_PROMO_DISCOUNT_TABLE;
  try {
    const { error } = await client.from(tableName).upsert(discountToSupabaseRow(d), { onConflict: 'id' });
    if (error) {
      return { success: false, needsTableSetup: isMissingTableOrRlsError(error.message, error.code), error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function syncPromoToSupabase(p: PromoAd): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const tableName = getSupabaseConfig().promoDiscountTable || DEFAULT_PROMO_DISCOUNT_TABLE;
  try {
    const { error } = await client.from(tableName).upsert(promoToSupabaseRow(p), { onConflict: 'id' });
    if (error) {
      return { success: false, needsTableSetup: isMissingTableOrRlsError(error.message, error.code), error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deletePromoOrDiscountFromSupabase(id: string): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const tableName = getSupabaseConfig().promoDiscountTable || DEFAULT_PROMO_DISCOUNT_TABLE;
  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) {
      return { success: false, needsTableSetup: isMissingTableOrRlsError(error.message, error.code), error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedDiscountsPromosToSupabase(
  discounts: SalesDiscount[],
  promos: PromoAd[]
): Promise<{ success: boolean; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  const tableName = getSupabaseConfig().promoDiscountTable || DEFAULT_PROMO_DISCOUNT_TABLE;
  const rows = [
    ...discounts.map(discountToSupabaseRow),
    ...promos.map(promoToSupabaseRow)
  ];
  if (rows.length === 0) return { success: true };
  try {
    const { error } = await client.from(tableName).upsert(rows, { onConflict: 'id' });
    if (error) {
      return { success: false, needsTableSetup: isMissingTableOrRlsError(error.message, error.code), error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeDiscountsPromosRealtime(
  onUpsert: (item: { kind: 'DISCOUNT' | 'PROMO'; discount?: SalesDiscount; promo?: PromoAd }) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;
  const table = getSupabaseConfig().promoDiscountTable || DEFAULT_PROMO_DISCOUNT_TABLE;
  const channelName = `realtime_${table}_${Date.now()}`;
  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        const parsed = supabaseRowToPromoOrDiscount(p.new);
        if (parsed) onUpsert(parsed);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        const parsed = supabaseRowToPromoOrDiscount(p.new);
        if (parsed) onUpsert(parsed);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old?.id) onDelete(String(p.old.id));
      })
      .subscribe();
    return channel;
  } catch (err) {
    console.warn('[Supabase Promo Diskon Realtime Error]:', err);
    return null;
  }
}

export async function pushDiscountsPromosToServerBridge(
  discounts: SalesDiscount[],
  promos: PromoAd[]
): Promise<void> {
  if (isDemoMode() || typeof fetch === 'undefined') return;
  try {
    const { safeBackendFetch } = await import('./serverBridgeHelper');
    await safeBackendFetch('/api/promo-discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discounts, promos })
    });
  } catch {}
}

export async function fetchDiscountsPromosFromServerBridge(): Promise<{
  discounts: SalesDiscount[];
  promos: PromoAd[];
} | null> {
  if (isDemoMode() || typeof fetch === 'undefined') return null;
  try {
    const { safeBackendFetch } = await import('./serverBridgeHelper');
    const res = await safeBackendFetch('/api/promo-discount');
    if (!res || !res.ok) return null;
    const data = await res.json();
    return {
      discounts: Array.isArray(data?.discounts) ? data.discounts : [],
      promos: Array.isArray(data?.promos) ? data.promos : []
    };
  } catch {
    return null;
  }
}

export const SUPABASE_PROMO_DISCOUNT_SQL_SCHEMA = `-- SKEMA TABEL MANAJEMEN DISKON PENJUALAN & IKLAN PROMO PORTAL MITRA (APOTEK & KLINIK LATISHA FARMA)
CREATE TABLE IF NOT EXISTS promo_diskon (
  id VARCHAR(100) PRIMARY KEY,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('DISCOUNT', 'PROMO')),
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER DEFAULT 1,
  start_date VARCHAR(30),
  end_date VARCHAR(30),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE promo_diskon REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_promo_diskon_kind ON promo_diskon (kind);
CREATE INDEX IF NOT EXISTS idx_promo_diskon_active ON promo_diskon (is_active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'promo_diskon'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE promo_diskon;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('promo_diskon')}
`;

function normalizeFeeRecipientsForSync(raw: any): ServiceFeeRecipientRule[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const normalized: ServiceFeeRecipientRule[] = [];
  raw.forEach((rule: any, rIdx: number) => {
    if (!rule || typeof rule !== 'object') return;
    const rawRole = String(rule.penerima_role || '').trim();
    const role: ServiceFeeRole = rawRole ? normalizeServiceFeeRole(rawRole) : 'non_petugas';
    const tipeFee: ServiceFeeType = normalizeServiceFeeType(rule.tipe_fee);
    normalized.push({
      id: String(rule.id || `RCP-${rIdx + 1}`),
      penerima_role: role,
      wajib_pilih_petugas: role === 'non_petugas' ? false : Boolean(rule.wajib_pilih_petugas ?? true),
      tipe_fee: tipeFee,
      nilai_fee: role === 'non_petugas' ? 0 : Math.max(0, Number(rule.nilai_fee) || 0)
    });
  });
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTariffItemForSync(item: any, idx = 0): TariffItem {
  const rawRole = String(item?.penerima_role || '').trim();
  const role: ServiceFeeRole | undefined = rawRole
    ? normalizeServiceFeeRole(rawRole)
    : undefined;
  const rawType = String(item?.tipe_fee || '').trim();
  const tipeFee: ServiceFeeType | undefined = rawType
    ? normalizeServiceFeeType(rawType)
    : undefined;
  const feeRecipients = normalizeFeeRecipientsForSync(item?.fee_recipients);

  return {
    id: String(item?.id || `JASA-CUSTOM-${idx + 1}`),
    name: String(item?.name || 'Layanan Jasa').trim(),
    category: String(item?.category || 'Lainnya').trim(),
    price: Number(item?.price) || 0,
    description: item?.description ? String(item.description) : '',
    isSystem: Boolean(item?.isSystem),
    ...(role ? { penerima_role: role } : {}),
    ...(item?.wajib_pilih_petugas !== undefined
      ? { wajib_pilih_petugas: Boolean(item.wajib_pilih_petugas) }
      : {}),
    ...(tipeFee ? { tipe_fee: tipeFee } : {}),
    ...(item?.nilai_fee !== undefined && item?.nilai_fee !== null
      ? { nilai_fee: Number(item.nilai_fee) || 0 }
      : {}),
    ...(feeRecipients ? { fee_recipients: feeRecipients } : {})
  };
}

function normalizeSystemTariffConfigsForSync(
  raw: any
): Record<string, Partial<TariffItem>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, Partial<TariffItem>> = {};
  for (const [k, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const item = val as Record<string, any>;
    const normalized: Partial<TariffItem> = {};
    if (item.name !== undefined) normalized.name = String(item.name || '').trim();
    if (item.category !== undefined) normalized.category = String(item.category || '').trim();
    if (item.description !== undefined) normalized.description = String(item.description || '');
    if (item.price !== undefined) normalized.price = Number(item.price) || 0;
    const rawRole = String(item.penerima_role || '').trim();
    if (rawRole) {
      normalized.penerima_role = normalizeServiceFeeRole(rawRole);
    }
    if (item.wajib_pilih_petugas !== undefined) {
      normalized.wajib_pilih_petugas = Boolean(item.wajib_pilih_petugas);
    }
    const rawType = String(item.tipe_fee || '').trim();
    if (rawType) {
      normalized.tipe_fee = normalizeServiceFeeType(rawType);
    }
    if (item.nilai_fee !== undefined && item.nilai_fee !== null) {
      normalized.nilai_fee = Number(item.nilai_fee) || 0;
    }
    const feeRecipients = normalizeFeeRecipientsForSync(item.fee_recipients);
    if (feeRecipients) {
      normalized.fee_recipients = feeRecipients;
    }
    result[k] = normalized;
  }
  return result;
}

export function feeConfigToSupabaseRow(
  config: FeeConfig,
  updatedBy?: string
): Record<string, any> {
  const nowIso = new Date().toISOString();
  const normalizedCustomTariffs: TariffItem[] = Array.isArray(config.customTariffs)
    ? config.customTariffs.map((item, idx) => normalizeTariffItemForSync(item, idx))
    : [];

  const normalizedSystemTariffConfigs = normalizeSystemTariffConfigsForSync(
    config.systemTariffConfigs
  );

  const normalizedPayroll: PayrollOvertimeConfig = config.payrollConfig
    ? {
        ...DEFAULT_PAYROLL_OVERTIME_CONFIG,
        ...config.payrollConfig,
        roleDefaults: {
          ...DEFAULT_PAYROLL_OVERTIME_CONFIG.roleDefaults,
          ...(config.payrollConfig.roleDefaults || {})
        },
        staffSalaries: Array.isArray(config.payrollConfig.staffSalaries)
          ? config.payrollConfig.staffSalaries
          : [],
        sundayOvertime: {
          ...DEFAULT_PAYROLL_OVERTIME_CONFIG.sundayOvertime,
          ...(config.payrollConfig.sundayOvertime || {}),
          sundayOnly: true
        },
        updatedAt: config.payrollConfig.updatedAt || nowIso
      }
    : DEFAULT_PAYROLL_OVERTIME_CONFIG;

  const normalizedConfig: FeeConfig = {
    doctorFee: Number(config.doctorFee) || 0,
    specialistFee: Number(config.specialistFee) || 0,
    medicalSupportFee: Number(config.medicalSupportFee) || 0,
    adminFee: Number(config.adminFee) || 0,
    homeVisitFee: Number(config.homeVisitFee) || 0,
    pharmacistFee: Number(config.pharmacistFee) || 0,
    activeOnlyForVisit: config.activeOnlyForVisit ?? true,
    customTariffs: normalizedCustomTariffs,
    systemTariffConfigs: normalizedSystemTariffConfigs,
    payrollConfig: normalizedPayroll
  };

  return {
    id: DEFAULT_FEE_CONFIG_ROW_ID,
    doctor_fee: normalizedConfig.doctorFee,
    specialist_fee: normalizedConfig.specialistFee,
    medical_support_fee: normalizedConfig.medicalSupportFee,
    admin_fee: normalizedConfig.adminFee,
    home_visit_fee: normalizedConfig.homeVisitFee,
    pharmacist_fee: normalizedConfig.pharmacistFee,
    active_only_for_visit: normalizedConfig.activeOnlyForVisit,
    custom_tariffs: normalizedCustomTariffs,
    system_tariff_configs: normalizedSystemTariffConfigs,
    payroll_config: normalizedPayroll,
    fee_config_json: normalizedConfig,
    updated_by: updatedBy || '',
    updated_at: nowIso
  };
}

export function supabaseRowToFeeConfig(row: Record<string, any>): FeeConfig {
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(row || {})) {
    lower[k.toLowerCase().trim()] = v;
  }

  const pickDefined = (...keys: string[]): any => {
    for (const k of keys) {
      if (lower[k] !== undefined && lower[k] !== null) return lower[k];
    }
    return undefined;
  };

  const jsonPayload = parseJsonMaybe<Partial<FeeConfig>>(
    pickDefined('fee_config_json', 'config_json', 'payload_json')
  ) || {};

  const pickNumeric = (fallback: number, jsonVal: any, ...keys: string[]): number => {
    const colVal = pickDefined(...keys);
    if (colVal !== undefined && colVal !== '') {
      const parsed = Number(colVal);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (jsonVal !== undefined && jsonVal !== null && jsonVal !== '') {
      const parsed = Number(jsonVal);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  };

  const rawCustomTariffs =
    parseJsonMaybe<any[]>(pickDefined('custom_tariffs', 'customtariffs', 'tarif_tambahan')) ||
    (Array.isArray(jsonPayload.customTariffs) ? jsonPayload.customTariffs : []);

  const customTariffs: TariffItem[] = Array.isArray(rawCustomTariffs)
    ? rawCustomTariffs
        .filter((item) => item && (item.name || item.id))
        .map((item, idx) => normalizeTariffItemForSync(item, idx))
    : [];

  const rawSysConfigs =
    parseJsonMaybe<Record<string, any>>(pickDefined('system_tariff_configs', 'systemtariffconfigs')) ||
    (jsonPayload.systemTariffConfigs && typeof jsonPayload.systemTariffConfigs === 'object'
      ? jsonPayload.systemTariffConfigs
      : {});
  const systemTariffConfigs = normalizeSystemTariffConfigsForSync(rawSysConfigs);

  const activeOnlyRaw = pickDefined('active_only_for_visit', 'activeonlyforvisit');
  const activeOnlyForVisit =
    activeOnlyRaw !== undefined
      ? Boolean(activeOnlyRaw)
      : jsonPayload.activeOnlyForVisit !== undefined
        ? Boolean(jsonPayload.activeOnlyForVisit)
        : DEFAULT_FEE_CONFIG.activeOnlyForVisit;

  const rawPayrollCol = parseJsonMaybe<Partial<PayrollOvertimeConfig>>(
    pickDefined('payroll_config', 'payrollconfig', 'pengaturan_gaji_lembur')
  );
  const rawPayroll =
    (rawPayrollCol && Object.keys(rawPayrollCol).length > 0 ? rawPayrollCol : null) ||
    (jsonPayload.payrollConfig && typeof jsonPayload.payrollConfig === 'object'
      ? jsonPayload.payrollConfig
      : null);

  const payrollConfig: PayrollOvertimeConfig = rawPayroll
    ? {
        ...DEFAULT_PAYROLL_OVERTIME_CONFIG,
        ...rawPayroll,
        roleDefaults: {
          ...DEFAULT_PAYROLL_OVERTIME_CONFIG.roleDefaults,
          ...(rawPayroll.roleDefaults || {})
        },
        staffSalaries: Array.isArray(rawPayroll.staffSalaries) ? rawPayroll.staffSalaries : [],
        sundayOvertime: {
          ...DEFAULT_PAYROLL_OVERTIME_CONFIG.sundayOvertime,
          ...(rawPayroll.sundayOvertime || {}),
          sundayOnly: true
        }
      }
    : DEFAULT_PAYROLL_OVERTIME_CONFIG;

  return {
    doctorFee: pickNumeric(DEFAULT_FEE_CONFIG.doctorFee, jsonPayload.doctorFee, 'doctor_fee', 'doctorfee', 'jasa_dokter'),
    specialistFee: pickNumeric(DEFAULT_FEE_CONFIG.specialistFee, jsonPayload.specialistFee, 'specialist_fee', 'specialistfee', 'jasa_spesialis'),
    medicalSupportFee: pickNumeric(DEFAULT_FEE_CONFIG.medicalSupportFee, jsonPayload.medicalSupportFee, 'medical_support_fee', 'medicalsupportfee', 'jasa_penunjang', 'jasa_perawat'),
    adminFee: pickNumeric(DEFAULT_FEE_CONFIG.adminFee, jsonPayload.adminFee, 'admin_fee', 'adminfee', 'biaya_admin'),
    homeVisitFee: pickNumeric(DEFAULT_FEE_CONFIG.homeVisitFee, jsonPayload.homeVisitFee, 'home_visit_fee', 'homevisitfee', 'jasa_home_visit'),
    pharmacistFee: pickNumeric(DEFAULT_FEE_CONFIG.pharmacistFee, jsonPayload.pharmacistFee, 'pharmacist_fee', 'pharmacistfee', 'jasa_apoteker'),
    activeOnlyForVisit,
    customTariffs,
    systemTariffConfigs,
    payrollConfig
  };
}

export async function fetchFeeConfigFromSupabase(timeoutMs = 8000): Promise<{
  data: FeeConfig | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
  updatedAt?: string;
  updatedBy?: string;
}> {
  if (isDemoMode()) {
    return { data: null, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { feeConfigTable } = getSupabaseConfig();
  const tableName = feeConfigTable || DEFAULT_FEE_CONFIG_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout memuat ${tableName} (${Math.round(timeoutMs / 1000)} detik)` }
        });
      }, timeoutMs);
    });

    const queryPromise = client.from(tableName).select('*').limit(10);
    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as { data: any[] | null; error: { message: string; code?: string } | null };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Pengaturan Tarif & Jasa] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    const rows = data || [];
    if (rows.length === 0) {
      return { data: null, isEmpty: true };
    }

    const mainRow =
      rows.find((r) => String(r?.id || '').toUpperCase() === DEFAULT_FEE_CONFIG_ROW_ID) || rows[0];

    return {
      data: supabaseRowToFeeConfig(mainRow),
      updatedAt: mainRow?.updated_at ? String(mainRow.updated_at) : undefined,
      updatedBy: mainRow?.updated_by ? String(mainRow.updated_by) : undefined
    };
  } catch (err: any) {
    console.warn('[Supabase Pengaturan Tarif & Jasa] Fetch exception:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncFeeConfigToSupabase(
  config: FeeConfig,
  updatedBy?: string,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
  updatedAt?: string;
}> {
  if (isDemoMode()) {
    return { success: false, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { feeConfigTable } = getSupabaseConfig();
  const tableName = feeConfigTable || DEFAULT_FEE_CONFIG_TABLE;
  const row = feeConfigToSupabaseRow(config, updatedBy);

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout sinkronisasi tarif & jasa ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id, updated_at')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { data?: any[]; error: { message: string; code?: string } | null };

    if (error) {
      const msgLower = String(error.message || '').toLowerCase();
      // Graceful fallback if remote table lacks newly added optional JSONB columns
      // (fee_config_json already carries full customTariffs, systemTariffConfigs & payrollConfig)
      if (msgLower.includes('payroll_config') || msgLower.includes('system_tariff_configs')) {
        const fallbackRow: Record<string, any> = { ...row };
        if (msgLower.includes('payroll_config')) delete fallbackRow.payroll_config;
        if (msgLower.includes('system_tariff_configs')) delete fallbackRow.system_tariff_configs;
        const retryRes = await client
          .from(tableName)
          .upsert(fallbackRow, { onConflict: 'id' })
          .select('id, updated_at')
          .limit(1);
        if (!retryRes.error) {
          return { success: true, updatedAt: row.updated_at };
        }
        const retryMsg = String(retryRes.error.message || '').toLowerCase();
        if (retryMsg.includes('payroll_config') || retryMsg.includes('system_tariff_configs')) {
          delete fallbackRow.payroll_config;
          delete fallbackRow.system_tariff_configs;
          const retry2 = await client
            .from(tableName)
            .upsert(fallbackRow, { onConflict: 'id' })
            .select('id, updated_at')
            .limit(1);
          if (!retry2.error) {
            return { success: true, updatedAt: row.updated_at };
          }
        }
      }
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Pengaturan Gaji, Jasa, Fee & Lembur] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true, updatedAt: row.updated_at };
  } catch (err: any) {
    console.warn('[Supabase Pengaturan Gaji, Jasa, Fee & Lembur] Upsert exception:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeFeeConfigRealtime(
  onUpdate: (config: FeeConfig) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { feeConfigTable } = getSupabaseConfig();
  const table = feeConfigTable || DEFAULT_FEE_CONFIG_TABLE;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) onUpdate(supabaseRowToFeeConfig(p.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) onUpdate(supabaseRowToFeeConfig(p.new));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Pengaturan Tarif & Jasa Realtime Error]:', err);
    return null;
  }
}

// ============================================================================
// LOG FEE PETUGAS OTOMATIS (log_fee_petugas) — TWO-WAY SYNC & REALTIME
// ============================================================================

export function feeLedgerEntryToSupabaseRow(
  entry: StaffFeeLedgerEntry,
  includeExtendedCols = true
): Record<string, any> {
  const nowIso = new Date().toISOString();
  const base: Record<string, any> = {
    id: String(entry.id),
    transaction_id: String(entry.transaction_id),
    transaction_date: String(entry.transaction_date || nowIso.slice(0, 10)),
    transaction_datetime: entry.transaction_datetime ? String(entry.transaction_datetime) : null,
    customer_name: String(entry.customer_name || 'Reguler'),
    trx_type: String(entry.trx_type || 'REGULER'),
    service_id: String(entry.service_id || ''),
    service_name: String(entry.service_name || ''),
    penerima_role: String(normalizeServiceFeeRole(entry.penerima_role || 'non_petugas')),
    qty: Number(entry.qty) || 1,
    tarif_biaya: Number(entry.tarif_biaya) || 0,
    subtotal_layanan: Number(entry.subtotal_layanan) || 0,
    tipe_fee: String(entry.tipe_fee || 'nominal'),
    nilai_fee: Number(entry.nilai_fee) || 0,
    nominal_fee_satuan: Number(entry.nominal_fee_satuan) || 0,
    total_fee_item: Number(entry.total_fee_item) || 0,
    petugas_id: String(entry.petugas_id || ''),
    nama_petugas: String(entry.nama_petugas || ''),
    role_petugas: String(entry.role_petugas || ''),
    status_pembayaran: String(entry.status_pembayaran || 'belum_dibayar'),
    paid_at: entry.paid_at ? String(entry.paid_at) : null,
    paid_by: entry.paid_by ? String(entry.paid_by) : null,
    cancelled_reason: entry.cancelled_reason ? String(entry.cancelled_reason) : null,
    branch_id: entry.branch_id ? String(entry.branch_id) : 'BR-01',
    created_at: entry.created_at || nowIso,
    updated_at: entry.updated_at || nowIso
  };
  if (includeExtendedCols) {
    base.fee_fasilitas =
      entry.fee_fasilitas !== undefined && entry.fee_fasilitas !== null
        ? Number(entry.fee_fasilitas) || 0
        : Math.max(0, (Number(entry.subtotal_layanan) || 0) - (Number(entry.total_fee_item) || 0));
    base.allocation_id = entry.allocation_id ? String(entry.allocation_id) : null;
  }
  return base;
}

export function supabaseRowToFeeLedgerEntry(row: Record<string, any>): StaffFeeLedgerEntry {
  const penerima_role: ServiceFeeRole = normalizeServiceFeeRole(
    row.penerima_role ? String(row.penerima_role) : 'non_petugas'
  );
  const rawType = String(row.tipe_fee || 'nominal').toLowerCase();
  const tipe_fee: ServiceFeeType = rawType === 'persen' ? 'persen' : 'nominal';
  const rawStatus = String(row.status_pembayaran || 'belum_dibayar').toLowerCase();
  const status_pembayaran: StaffFeeLedgerPaymentStatus =
    rawStatus === 'dibayar' || rawStatus === 'dibatalkan'
      ? (rawStatus as StaffFeeLedgerPaymentStatus)
      : 'belum_dibayar';

  const subtotalLayanan = Number(row.subtotal_layanan) || 0;
  const totalFeeItem = Number(row.total_fee_item) || 0;
  const feeFasilitas =
    row.fee_fasilitas !== undefined && row.fee_fasilitas !== null && !Number.isNaN(Number(row.fee_fasilitas))
      ? Math.max(0, Number(row.fee_fasilitas))
      : Math.max(0, subtotalLayanan - totalFeeItem);

  return {
    id: String(row.id || ''),
    transaction_id: String(row.transaction_id || ''),
    transaction_date: String(row.transaction_date || '').slice(0, 10),
    transaction_datetime: row.transaction_datetime ? String(row.transaction_datetime) : undefined,
    customer_name: String(row.customer_name || 'Reguler'),
    trx_type: String(row.trx_type || 'REGULER'),
    service_id: String(row.service_id || ''),
    service_name: String(row.service_name || ''),
    penerima_role,
    qty: Number(row.qty) || 1,
    tarif_biaya: Number(row.tarif_biaya) || 0,
    subtotal_layanan: subtotalLayanan,
    tipe_fee,
    nilai_fee: Number(row.nilai_fee) || 0,
    nominal_fee_satuan: Number(row.nominal_fee_satuan) || 0,
    total_fee_item: totalFeeItem,
    fee_fasilitas: feeFasilitas,
    allocation_id: row.allocation_id ? String(row.allocation_id) : undefined,
    petugas_id: String(row.petugas_id || ''),
    nama_petugas: String(row.nama_petugas || ''),
    role_petugas: String(row.role_petugas || ''),
    status_pembayaran,
    paid_at: row.paid_at ? String(row.paid_at) : undefined,
    paid_by: row.paid_by ? String(row.paid_by) : undefined,
    cancelled_reason: row.cancelled_reason ? String(row.cancelled_reason) : undefined,
    branch_id: row.branch_id ? String(row.branch_id) : 'BR-01',
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : undefined
  };
}

export async function fetchFeeLedgerFromSupabase(timeoutMs = 8000): Promise<{
  data: StaffFeeLedgerEntry[] | null;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { data: null, isDemo: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { feeLedgerTable } = getSupabaseConfig();
  const tableName = feeLedgerTable || DEFAULT_FEE_LEDGER_TABLE;

  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          data: null,
          error: { message: `Timeout memuat ${tableName} (${Math.round(timeoutMs / 1000)} detik)` }
        });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as { data: any[] | null; error: { message: string; code?: string } | null };

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Log Fee Petugas] Fetch error (${tableName}):`, error.message);
      return { data: null, needsTableSetup, error: error.message };
    }

    return {
      data: (data || []).map(supabaseRowToFeeLedgerEntry)
    };
  } catch (err: any) {
    console.warn('[Supabase Log Fee Petugas] Fetch exception:', err);
    return { data: null, error: err?.message || String(err) };
  }
}

export async function upsertFeeLedgerEntriesToSupabase(
  entries: StaffFeeLedgerEntry[],
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) {
    return { success: false, isDemo: true };
  }
  if (!entries || entries.length === 0) {
    return { success: true };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { feeLedgerTable } = getSupabaseConfig();
  const tableName = feeLedgerTable || DEFAULT_FEE_LEDGER_TABLE;

  const runUpsert = async (includeExtendedCols: boolean) => {
    const rows = entries.map((e) => feeLedgerEntryToSupabaseRow(e, includeExtendedCols));
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string; code?: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan ledger fee ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return result as { error: { message: string; code?: string } | null };
  };

  try {
    let { error } = await runUpsert(true);
    if (
      error &&
      (error.message.includes('fee_fasilitas') ||
        error.message.includes('allocation_id') ||
        error.code === 'PGRST204')
    ) {
      // Fallback aman bila tabel Supabase lama belum menjalankan ALTER TABLE kolom baru
      const retry = await runUpsert(false);
      error = retry.error;
    }

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      console.warn(`[Supabase Log Fee Petugas] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase Log Fee Petugas] Upsert exception:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function cancelFeeLedgerByTransactionInSupabase(
  transactionId: string,
  cancelledReason?: string
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode() || !transactionId) return { success: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { feeLedgerTable } = getSupabaseConfig();
  const tableName = feeLedgerTable || DEFAULT_FEE_LEDGER_TABLE;

  try {
    const { error } = await client
      .from(tableName)
      .update({
        status_pembayaran: 'dibatalkan',
        cancelled_reason: cancelledReason || 'Transaksi dibatalkan / diretur',
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId);

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deleteFeeLedgerByTransactionsInSupabase(
  transactionIds: string[]
): Promise<{
  success: boolean;
  deletedCount?: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validTrxIds = Array.from(
    new Set(
      (transactionIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && !DEMO_TRANSACTION_IDS.has(id))
    )
  );
  if (validTrxIds.length === 0) return { success: true, deletedCount: 0 };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { feeLedgerTable } = getSupabaseConfig();
  const tableName = feeLedgerTable || DEFAULT_FEE_LEDGER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < validTrxIds.length; i += CHUNK_SIZE) {
      const chunk = validTrxIds.slice(i, i + CHUNK_SIZE);
      const { error } = await client
        .from(tableName)
        .delete()
        .in('transaction_id', chunk);

      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, needsTableSetup, error: error.message };
      }

      const { data: stillExisting, error: verifyErr } = await client
        .from(tableName)
        .select('id')
        .in('transaction_id', chunk);
      if (!verifyErr && Array.isArray(stillExisting) && stillExisting.length > 0) {
        return {
          success: false,
          needsTableSetup: true,
          error: `Supabase menolak penghapusan ${stillExisting.length} entri fee petugas pada tabel "${tableName}" (kebijakan RLS DELETE belum aktif). Jalankan ulang Skema SQL.`
        };
      }
    }
    return { success: true, deletedCount: validTrxIds.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deleteFeeLedgerByIdsInSupabase(
  ids: string[]
): Promise<{
  success: boolean;
  deletedCount?: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validIds = Array.from(
    new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (validIds.length === 0) return { success: true, deletedCount: 0 };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { feeLedgerTable } = getSupabaseConfig();
  const tableName = feeLedgerTable || DEFAULT_FEE_LEDGER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunk = validIds.slice(i, i + CHUNK_SIZE);
      const { error } = await client
        .from(tableName)
        .delete()
        .in('id', chunk);

      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, needsTableSetup, error: error.message };
      }

      const { data: stillExisting, error: verifyErr } = await client
        .from(tableName)
        .select('id')
        .in('id', chunk);
      if (!verifyErr && Array.isArray(stillExisting) && stillExisting.length > 0) {
        return {
          success: false,
          needsTableSetup: true,
          error: `Supabase menolak penghapusan ${stillExisting.length} entri fee petugas pada tabel "${tableName}" (kebijakan RLS DELETE belum aktif).`
        };
      }
    }
    return { success: true, deletedCount: validIds.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeFeeLedgerRealtime(
  onUpsert: (entry: StaffFeeLedgerEntry) => void,
  onDelete?: (deletedId: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { feeLedgerTable } = getSupabaseConfig();
  const table = feeLedgerTable || DEFAULT_FEE_LEDGER_TABLE;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) onUpsert(supabaseRowToFeeLedgerEntry(p.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) onUpsert(supabaseRowToFeeLedgerEntry(p.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        const oldRow = p.old as Record<string, any> | undefined;
        if (oldRow?.id && onDelete) onDelete(String(oldRow.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Log Fee Petugas Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_FEE_LEDGER_SQL_SCHEMA = `-- SKEMA TABEL LEDGER FEE PETUGAS OTOMATIS (log_fee_petugas)
CREATE TABLE IF NOT EXISTS log_fee_petugas (
  id VARCHAR(120) PRIMARY KEY,
  transaction_id VARCHAR(80) NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_datetime VARCHAR(60) DEFAULT '',
  customer_name VARCHAR(255) DEFAULT 'Reguler',
  trx_type VARCHAR(40) DEFAULT 'REGULER',
  service_id VARCHAR(80) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  penerima_role VARCHAR(100) NOT NULL DEFAULT 'non_petugas', -- sesuai Pengaturan Peran User & Hak Akses
  qty INTEGER NOT NULL DEFAULT 1,
  tarif_biaya NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal_layanan NUMERIC(14,2) NOT NULL DEFAULT 0,
  tipe_fee VARCHAR(20) NOT NULL DEFAULT 'nominal', -- nominal | persen
  nilai_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  nominal_fee_satuan NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_fee_item NUMERIC(14,2) NOT NULL DEFAULT 0,
  fee_fasilitas NUMERIC(14,2) NOT NULL DEFAULT 0,
  allocation_id VARCHAR(80) DEFAULT '',
  petugas_id VARCHAR(80) NOT NULL,
  nama_petugas VARCHAR(255) NOT NULL,
  role_petugas VARCHAR(100) NOT NULL,
  status_pembayaran VARCHAR(30) NOT NULL DEFAULT 'belum_dibayar', -- belum_dibayar | dibayar | dibatalkan
  paid_at TIMESTAMPTZ NULL,
  paid_by VARCHAR(255) DEFAULT '',
  cancelled_reason TEXT DEFAULT '',
  branch_id VARCHAR(40) DEFAULT 'BR-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel log_fee_petugas sudah pernah dibuat sebelumnya:
ALTER TABLE log_fee_petugas ALTER COLUMN penerima_role TYPE VARCHAR(100);
ALTER TABLE log_fee_petugas ADD COLUMN IF NOT EXISTS fee_fasilitas NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE log_fee_petugas ADD COLUMN IF NOT EXISTS allocation_id VARCHAR(80) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_log_fee_petugas_trx ON log_fee_petugas (transaction_id);
CREATE INDEX IF NOT EXISTS idx_log_fee_petugas_staff_date ON log_fee_petugas (petugas_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_log_fee_petugas_status ON log_fee_petugas (status_pembayaran);

ALTER TABLE log_fee_petugas REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'log_fee_petugas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE log_fee_petugas;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('log_fee_petugas', { hasBranchId: true, includeFunctions: false })}
`;

export const SUPABASE_FEE_CONFIG_SQL_SCHEMA = `-- SKEMA TABEL PENGATURAN GAJI, JASA MEDIS, FEE & LEMBUR MINGGU + LEDGER FEE PETUGAS
-- (APOTEK & PRAKTEK DOKTER LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS pengaturan_tarif_jasa (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'MAIN-FEE-CONFIG',
  doctor_fee NUMERIC(14,2) NOT NULL DEFAULT 20000,
  specialist_fee NUMERIC(14,2) NOT NULL DEFAULT 50000,
  medical_support_fee NUMERIC(14,2) NOT NULL DEFAULT 5000,
  admin_fee NUMERIC(14,2) NOT NULL DEFAULT 1000,
  home_visit_fee NUMERIC(14,2) NOT NULL DEFAULT 35000,
  pharmacist_fee NUMERIC(14,2) NOT NULL DEFAULT 10000,
  active_only_for_visit BOOLEAN NOT NULL DEFAULT TRUE,
  -- custom_tariffs & system_tariff_configs menyimpan penerima_role, wajib_pilih_petugas, tipe_fee, nilai_fee, dan multi penerima (fee_recipients)
  custom_tariffs JSONB NOT NULL DEFAULT '[]'::jsonb,
  system_tariff_configs JSONB NOT NULL DEFAULT '{}'::jsonb,
  payroll_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  fee_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah pernah dibuat sebelumnya:
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS doctor_fee NUMERIC(14,2) NOT NULL DEFAULT 20000;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS specialist_fee NUMERIC(14,2) NOT NULL DEFAULT 50000;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS medical_support_fee NUMERIC(14,2) NOT NULL DEFAULT 5000;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS admin_fee NUMERIC(14,2) NOT NULL DEFAULT 1000;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS home_visit_fee NUMERIC(14,2) NOT NULL DEFAULT 35000;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS pharmacist_fee NUMERIC(14,2) NOT NULL DEFAULT 10000;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS active_only_for_visit BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS custom_tariffs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS system_tariff_configs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS payroll_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS fee_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) DEFAULT '';
ALTER TABLE pengaturan_tarif_jasa ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE pengaturan_tarif_jasa REPLICA IDENTITY FULL;

-- Aktifkan Realtime secara aman:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pengaturan_tarif_jasa'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pengaturan_tarif_jasa;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('pengaturan_tarif_jasa')}

${SUPABASE_FEE_LEDGER_SQL_SCHEMA}

NOTIFY pgrst, 'reload schema';
`;

// ============================================================================
// SURAT PESANAN & DEFECTA RE-ORDER (surat_pesanan) — Two-Way Sync & Real-time
// ============================================================================

export function isDemoPurchaseOrderId(id?: string): boolean {
  if (!id) return false;
  return id.toUpperCase().startsWith('PO-DEMO-');
}

export function purchaseOrderToSupabaseRow(po: PurchaseOrder): Record<string, any> {
  return {
    id: po.id,
    po_number: po.poNumber || po.id,
    date: po.date || new Date().toISOString().split('T')[0],
    supplier_id: po.supplierId || null,
    supplier_name: po.supplierName || '',
    supplier_address: po.supplierAddress || '',
    supplier_phone: po.supplierPhone || '',
    supplier_license_no: po.supplierLicenseNo || '',
    sp_numbers: po.spNumbers || {},
    status: po.status || 'Diproses',
    items: Array.isArray(po.items) ? po.items : [],
    notes: po.notes || '',
    total_estimated_cost: Number(po.totalEstimatedCost) || 0,
    branch_id: po.branchId || 'BR-01',
    petugas: po.petugas || '',
    sp_print_logs: po.spPrintLogs || {},
    created_at: po.createdAt || new Date().toISOString(),
    updated_at: po.updatedAt || new Date().toISOString()
  };
}

export function supabaseRowToPurchaseOrder(row: Record<string, any>): PurchaseOrder {
  let parsedItems: PurchaseOrderItem[] = [];
  const rawItems = row.items;
  if (Array.isArray(rawItems)) {
    parsedItems = rawItems;
  } else if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      const p = JSON.parse(rawItems);
      if (Array.isArray(p)) parsedItems = p;
    } catch {}
  }

  let parsedSpNumbers: Record<SPGroupType, string> = {
    REG: '',
    ALK: '',
    PRE: '',
    OOT: '',
    PSI: '',
    NAR: ''
  };
  const rawSpNumbers = row.sp_numbers ?? row.spNumbers;
  if (rawSpNumbers && typeof rawSpNumbers === 'object' && !Array.isArray(rawSpNumbers)) {
    parsedSpNumbers = { ...parsedSpNumbers, ...rawSpNumbers };
  } else if (typeof rawSpNumbers === 'string' && rawSpNumbers.trim()) {
    try {
      const p = JSON.parse(rawSpNumbers);
      if (p && typeof p === 'object') parsedSpNumbers = { ...parsedSpNumbers, ...p };
    } catch {}
  }

  let parsedPrintLogs: Partial<Record<SPGroupType | 'ALL', SPPrintLogEntry>> | undefined = undefined;
  const rawPrintLogs = row.sp_print_logs ?? row.spPrintLogs;
  if (rawPrintLogs && typeof rawPrintLogs === 'object' && !Array.isArray(rawPrintLogs)) {
    parsedPrintLogs = rawPrintLogs;
  } else if (typeof rawPrintLogs === 'string' && rawPrintLogs.trim()) {
    try {
      const p = JSON.parse(rawPrintLogs);
      if (p && typeof p === 'object') parsedPrintLogs = p;
    } catch {}
  }

  const validStatuses: PurchaseOrder['status'][] = [
    'Draft',
    'Diajukan',
    'Diproses',
    'Dikirim',
    'Selesai',
    'Dibatalkan'
  ];
  const rawStatus = String(row.status || 'Diproses') as PurchaseOrder['status'];
  const status = validStatuses.includes(rawStatus) ? rawStatus : 'Diproses';

  return {
    id: String(row.id || `PO-${Date.now()}`),
    poNumber: String(row.po_number ?? row.poNumber ?? row.id ?? ''),
    date: String(row.date || new Date().toISOString().split('T')[0]),
    supplierId: row.supplier_id ?? row.supplierId ?? undefined,
    supplierName: String(row.supplier_name ?? row.supplierName ?? ''),
    supplierAddress: row.supplier_address ?? row.supplierAddress ?? '',
    supplierPhone: row.supplier_phone ?? row.supplierPhone ?? '',
    supplierLicenseNo: row.supplier_license_no ?? row.supplierLicenseNo ?? '',
    spNumbers: parsedSpNumbers,
    status,
    items: parsedItems,
    notes: row.notes ?? '',
    totalEstimatedCost: Number(row.total_estimated_cost ?? row.totalEstimatedCost ?? 0),
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01'),
    petugas: row.petugas ? String(row.petugas) : '',
    spPrintLogs: parsedPrintLogs,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: row.updated_at ?? row.updatedAt ?? undefined
  };
}

export async function fetchPurchaseOrdersFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: PurchaseOrder[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: 'Klien Supabase belum dikonfigurasi' };
  }

  const { purchaseOrderTable } = getSupabaseConfig();
  const tableName = purchaseOrderTable || DEFAULT_PURCHASE_ORDER_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 12000;
  const PAGE_SIZE = 1000;
  const allRows: Record<string, any>[] = [];
  let from = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const to = from + PAGE_SIZE - 1;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({
            data: null,
            error: { message: `Timeout mengambil data dari tabel ${tableName}` }
          });
        }, timeoutMs);
      });

      const queryPromise = client
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      const result = await Promise.race([queryPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const { data, error } = result as {
        data: any[] | null;
        error: { message: string; code?: string } | null;
      };

      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        console.warn(`[Supabase Surat Pesanan] Fetch error (${tableName} range ${from}-${to}):`, error.message);
        return { data: null, needsTableSetup, error: error.message };
      }

      if (data && data.length > 0) {
        allRows.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    const uniqueMap = new Map<string, PurchaseOrder>();
    for (const rawRow of allRows) {
      const mapped = supabaseRowToPurchaseOrder(rawRow);
      if (mapped.id && !isDemoPurchaseOrderId(mapped.id)) {
        uniqueMap.set(mapped.id, mapped);
      }
    }
    const mapped = Array.from(uniqueMap.values());
    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncPurchaseOrderToSupabase(
  po: PurchaseOrder,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!po?.id || isDemoPurchaseOrderId(po.id)) {
    return { success: false, error: 'Surat pesanan demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { purchaseOrderTable } = getSupabaseConfig();
  const tableName = purchaseOrderTable || DEFAULT_PURCHASE_ORDER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = purchaseOrderToSupabaseRow(po);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan surat pesanan ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client
      .from(tableName)
      .upsert(row, { onConflict: 'id' })
      .select('id')
      .limit(1);

    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      console.warn(`[Supabase Surat Pesanan] Upsert error (${tableName}):`, error.message);
      return { success: false, needsTableSetup, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedPurchaseOrdersToSupabase(
  orders: PurchaseOrder[],
  timeoutMs = 12000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (orders || []).filter((po) => Boolean(po.id) && !isDemoPurchaseOrderId(po.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { purchaseOrderTable } = getSupabaseConfig();
  const tableName = purchaseOrderTable || DEFAULT_PURCHASE_ORDER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const CHUNK_SIZE = 200;
  let totalSynced = 0;

  try {
    for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
      const chunk = valid.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map(purchaseOrderToSupabaseRow);

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({ error: { message: `Timeout menyemai surat pesanan ke ${tableName}` } });
        }, timeoutMs);
      });

      const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
      const result = await Promise.race([upsertPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const { error } = result as { error: { message: string; code?: string } | null };
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, count: totalSynced, needsTableSetup, error: error.message };
      }
      totalSynced += rows.length;
    }

    return { success: true, count: totalSynced };
  } catch (err: any) {
    return { success: false, count: totalSynced, error: err?.message || String(err) };
  }
}

export async function deletePurchaseOrdersFromSupabase(
  ids: string[]
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validIds = (ids || []).filter((id) => Boolean(id) && !isDemoPurchaseOrderId(id));
  if (validIds.length === 0) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { purchaseOrderTable } = getSupabaseConfig();
  const tableName = purchaseOrderTable || DEFAULT_PURCHASE_ORDER_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const CHUNK_SIZE = 200;
    for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
      const chunkIds = validIds.slice(i, i + CHUNK_SIZE);
      const { error } = await client.from(tableName).delete().in('id', chunkIds);
      if (error) {
        const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
        if (needsTableSetup) missingTablesInSession.add(tableName);
        return { success: false, needsTableSetup, error: error.message };
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribePurchaseOrdersRealtime(
  onInsert: (po: PurchaseOrder) => void,
  onUpdate: (po: PurchaseOrder) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { purchaseOrderTable } = getSupabaseConfig();
  const table = purchaseOrderTable || DEFAULT_PURCHASE_ORDER_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToPurchaseOrder(p.new);
          if (!isDemoPurchaseOrderId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToPurchaseOrder(p.new);
          if (!isDemoPurchaseOrderId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Surat Pesanan Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_PURCHASE_ORDER_SQL_SCHEMA = `-- SKEMA TABEL PESANAN PEMBELIAN & RIWAYAT SURAT PESANAN (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS surat_pesanan (
  id VARCHAR(100) PRIMARY KEY,
  po_number VARCHAR(100) NOT NULL,
  date VARCHAR(50) NOT NULL,
  supplier_id VARCHAR(100),
  supplier_name VARCHAR(255) NOT NULL,
  supplier_address TEXT,
  supplier_phone VARCHAR(100),
  supplier_license_no VARCHAR(150),
  sp_numbers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'Diproses',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  total_estimated_cost NUMERIC(14,2) DEFAULT 0,
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  petugas VARCHAR(255),
  sp_print_logs JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrasi aman jika tabel sudah ada sebelumnya:
ALTER TABLE surat_pesanan ADD COLUMN IF NOT EXISTS branch_id VARCHAR(50) DEFAULT 'BR-01';
ALTER TABLE surat_pesanan ADD COLUMN IF NOT EXISTS petugas VARCHAR(255);
ALTER TABLE surat_pesanan ADD COLUMN IF NOT EXISTS sp_print_logs JSONB DEFAULT '{}'::jsonb;
ALTER TABLE surat_pesanan ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_surat_pesanan_po_number ON surat_pesanan (po_number);
CREATE INDEX IF NOT EXISTS idx_surat_pesanan_date ON surat_pesanan (date);
CREATE INDEX IF NOT EXISTS idx_surat_pesanan_supplier ON surat_pesanan (supplier_name);
CREATE INDEX IF NOT EXISTS idx_surat_pesanan_status ON surat_pesanan (status);
CREATE INDEX IF NOT EXISTS idx_surat_pesanan_created ON surat_pesanan (created_at DESC);

ALTER TABLE surat_pesanan REPLICA IDENTITY FULL;

-- Aktifkan Realtime Replication secara aman
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'surat_pesanan'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE surat_pesanan;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('surat_pesanan', { hasBranchId: true })}
`;

// ============================================================================
// STRATEGI MARKETING & PELACAKAN KAMPANYE (strategi_marketing) — Two-Way Sync
// ============================================================================

export function isDemoMarketingCampaignId(id?: string): boolean {
  if (!id) return false;
  return id.toUpperCase().startsWith('MKT-DEMO-');
}

export function marketingCampaignToSupabaseRow(c: MarketingCampaign): Record<string, any> {
  return {
    id: c.id,
    title: c.title || '',
    strategy_type: c.strategyType || 'PROMO_UMUM',
    status: c.status || 'Aktif',
    target_channel: c.targetChannel || 'ALL',
    target_medicine_ids: Array.isArray(c.targetMedicineIds) ? c.targetMedicineIds : [],
    target_medicine_names: Array.isArray(c.targetMedicineNames) ? c.targetMedicineNames : [],
    target_mitra_ids: Array.isArray(c.targetMitraIds) ? c.targetMitraIds : [],
    target_patient_rm_ids: Array.isArray(c.targetPatientRmIds) ? c.targetPatientRmIds : [],
    linked_discount_id: c.linkedDiscountId || null,
    linked_promo_id: c.linkedPromoId || null,
    linked_po_id: c.linkedPoId || null,
    discount_code: c.discountCode || '',
    expected_lift_note: c.expectedLiftNote || '',
    follow_up_message: c.followUpMessage || '',
    activated_at: c.activatedAt || new Date().toISOString().split('T')[0],
    baseline_days: Number(c.baselineDays) || 14,
    baseline_snapshot: c.baselineSnapshot || null,
    notes: c.notes || '',
    created_by: c.createdBy || '',
    branch_id: c.branchId || 'BR-01',
    created_at: c.createdAt || new Date().toISOString(),
    updated_at: c.updatedAt || new Date().toISOString()
  };
}

function safeParseArrayField(raw: any): string[] | undefined {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String);
    } catch {}
  }
  return undefined;
}

export function supabaseRowToMarketingCampaign(row: Record<string, any>): MarketingCampaign {
  const validStrategies: MarketingStrategyType[] = [
    'BUNDLING_KLINIS',
    'CLEARANCE_SLOW_ED',
    'RESTOK_FAST_MOVING',
    'REPEAT_PASIEN',
    'REORDER_MITRA',
    'PROMO_UMUM'
  ];
  const rawStrat = String(row.strategy_type ?? row.strategyType ?? 'PROMO_UMUM') as MarketingStrategyType;
  const strategyType = validStrategies.includes(rawStrat) ? rawStrat : 'PROMO_UMUM';

  const validStatuses: MarketingCampaignStatus[] = ['Aktif', 'Draf', 'Selesai', 'Diarsipkan'];
  const rawStatus = String(row.status ?? 'Aktif') as MarketingCampaignStatus;
  const status = validStatuses.includes(rawStatus) ? rawStatus : 'Aktif';

  let baselineSnapshot = row.baseline_snapshot ?? row.baselineSnapshot ?? undefined;
  if (typeof baselineSnapshot === 'string' && baselineSnapshot.trim()) {
    try {
      baselineSnapshot = JSON.parse(baselineSnapshot);
    } catch {
      baselineSnapshot = undefined;
    }
  }

  return {
    id: String(row.id || `MKT-${Date.now()}`),
    title: String(row.title || 'Kampanye Marketing'),
    strategyType,
    status,
    targetChannel: (row.target_channel ?? row.targetChannel ?? 'ALL') as MarketingCampaign['targetChannel'],
    targetMedicineIds: safeParseArrayField(row.target_medicine_ids ?? row.targetMedicineIds),
    targetMedicineNames: safeParseArrayField(row.target_medicine_names ?? row.targetMedicineNames),
    targetMitraIds: safeParseArrayField(row.target_mitra_ids ?? row.targetMitraIds),
    targetPatientRmIds: safeParseArrayField(row.target_patient_rm_ids ?? row.targetPatientRmIds),
    linkedDiscountId: row.linked_discount_id ?? row.linkedDiscountId ?? undefined,
    linkedPromoId: row.linked_promo_id ?? row.linkedPromoId ?? undefined,
    linkedPoId: row.linked_po_id ?? row.linkedPoId ?? undefined,
    discountCode: row.discount_code ?? row.discountCode ?? undefined,
    expectedLiftNote: row.expected_lift_note ?? row.expectedLiftNote ?? undefined,
    followUpMessage: row.follow_up_message ?? row.followUpMessage ?? undefined,
    activatedAt: String(row.activated_at ?? row.activatedAt ?? new Date().toISOString().split('T')[0]),
    baselineDays: Number(row.baseline_days ?? row.baselineDays ?? 14) || 14,
    baselineSnapshot,
    notes: row.notes ?? '',
    createdBy: String(row.created_by ?? row.createdBy ?? ''),
    branchId: String(row.branch_id ?? row.branchId ?? 'BR-01'),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: row.updated_at ?? row.updatedAt ?? undefined
  };
}

export async function fetchMarketingCampaignsFromSupabase(options?: {
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<{
  data: MarketingCampaign[] | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };

  const { marketingTable } = getSupabaseConfig();
  const tableName = marketingTable || DEFAULT_MARKETING_TABLE;
  const available = await isSupabaseTableAvailable(tableName, Boolean(options?.forceRefresh));
  if (available === false) {
    return {
      data: null,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum dibuat di Supabase.`
    };
  }

  const timeoutMs = options?.timeoutMs ?? 12000;
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ data: null, error: { message: `Timeout mengambil data dari tabel ${tableName}` } });
      }, timeoutMs);
    });

    const queryPromise = client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { data, error } = result as { data: any[] | null; error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped = (data || [])
      .map(supabaseRowToMarketingCampaign)
      .filter((c) => Boolean(c.id) && !isDemoMarketingCampaignId(c.id));

    if (mapped.length === 0) return { data: [], isEmpty: true };
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncMarketingCampaignToSupabase(
  campaign: MarketingCampaign,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  if (!campaign?.id || isDemoMarketingCampaignId(campaign.id)) {
    return { success: false, error: 'Kampanye demo atau ID tidak valid' };
  }

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { marketingTable } = getSupabaseConfig();
  const tableName = marketingTable || DEFAULT_MARKETING_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  const row = marketingCampaignToSupabaseRow(campaign);
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyimpan kampanye marketing ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(row, { onConflict: 'id' }).select('id').limit(1);
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function seedMarketingCampaignsToSupabase(
  campaigns: MarketingCampaign[],
  timeoutMs = 12000
): Promise<{
  success: boolean;
  count: number;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, count: 0, isDemo: true };
  const client = getSupabaseClient();
  if (!client) return { success: false, count: 0, error: 'Klien Supabase belum dikonfigurasi' };

  const valid = (campaigns || []).filter((c) => Boolean(c.id) && !isDemoMarketingCampaignId(c.id));
  if (valid.length === 0) return { success: true, count: 0 };

  const { marketingTable } = getSupabaseConfig();
  const tableName = marketingTable || DEFAULT_MARKETING_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      count: 0,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const rows = valid.map(marketingCampaignToSupabaseRow);
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ error: { message: `Timeout menyemai strategi marketing ke ${tableName}` } });
      }, timeoutMs);
    });

    const upsertPromise = client.from(tableName).upsert(rows, { onConflict: 'id' });
    const result = await Promise.race([upsertPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const { error } = result as { error: { message: string; code?: string } | null };
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, count: 0, needsTableSetup, error: error.message };
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || String(err) };
  }
}

export async function deleteMarketingCampaignsFromSupabase(
  ids: string[]
): Promise<{
  success: boolean;
  needsTableSetup?: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { success: false, isDemo: true };
  const validIds = (ids || []).filter((id) => Boolean(id) && !isDemoMarketingCampaignId(id));
  if (validIds.length === 0) return { success: true };

  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { marketingTable } = getSupabaseConfig();
  const tableName = marketingTable || DEFAULT_MARKETING_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return {
      success: false,
      needsTableSetup: true,
      error: `Tabel "${tableName}" belum tersedia di Supabase.`
    };
  }

  try {
    const { error } = await client.from(tableName).delete().in('id', validIds);
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function subscribeMarketingCampaignsRealtime(
  onInsert: (campaign: MarketingCampaign) => void,
  onUpdate: (campaign: MarketingCampaign) => void,
  onDelete: (id: string) => void
): RealtimeChannel | null {
  if (isDemoMode()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { marketingTable } = getSupabaseConfig();
  const table = marketingTable || DEFAULT_MARKETING_TABLE;
  if (missingTablesInSession.has(table)) return null;
  const channelName = `realtime_${table}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToMarketingCampaign(p.new);
          if (!isDemoMarketingCampaignId(mapped.id)) onInsert(mapped);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table }, (p) => {
        if (p.new) {
          const mapped = supabaseRowToMarketingCampaign(p.new);
          if (!isDemoMarketingCampaignId(mapped.id)) onUpdate(mapped);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        if (p.old && p.old.id) onDelete(String(p.old.id));
      })
      .subscribe();

    return channel;
  } catch (err) {
    console.warn('[Supabase Strategi Marketing Realtime Error]:', err);
    return null;
  }
}

export const SUPABASE_MARKETING_SQL_SCHEMA = `-- SKEMA TABEL STRATEGI MARKETING & PELACAKAN KAMPANYE (APOTEK & KLINIK LATISHA FARMA)
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

CREATE TABLE IF NOT EXISTS strategi_marketing (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  strategy_type VARCHAR(60) NOT NULL DEFAULT 'PROMO_UMUM',
  status VARCHAR(40) NOT NULL DEFAULT 'Aktif',
  target_channel VARCHAR(40) NOT NULL DEFAULT 'ALL',
  target_medicine_ids JSONB DEFAULT '[]'::jsonb,
  target_medicine_names JSONB DEFAULT '[]'::jsonb,
  target_mitra_ids JSONB DEFAULT '[]'::jsonb,
  target_patient_rm_ids JSONB DEFAULT '[]'::jsonb,
  linked_discount_id VARCHAR(100),
  linked_promo_id VARCHAR(100),
  linked_po_id VARCHAR(100),
  discount_code VARCHAR(80),
  expected_lift_note TEXT,
  follow_up_message TEXT,
  activated_at VARCHAR(50) NOT NULL,
  baseline_days INT NOT NULL DEFAULT 14,
  baseline_snapshot JSONB,
  notes TEXT,
  created_by VARCHAR(255),
  branch_id VARCHAR(50) DEFAULT 'BR-01',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategi_marketing_status ON strategi_marketing (status);
CREATE INDEX IF NOT EXISTS idx_strategi_marketing_type ON strategi_marketing (strategy_type);
CREATE INDEX IF NOT EXISTS idx_strategi_marketing_activated ON strategi_marketing (activated_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategi_marketing_created ON strategi_marketing (created_at DESC);

ALTER TABLE strategi_marketing REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'strategi_marketing'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE strategi_marketing;
  END IF;
END $$;

${buildMultiTenantRlsSqlBlock('strategi_marketing', { hasBranchId: true })}
`;

// ============================================================================
// MODUL ESTIMASI PPh WAJIB PAJAK ORANG PRIBADI (WP OP) & PPh 21
// ============================================================================

export async function fetchWpOpTaxConfigFromSupabase(): Promise<{
  data: WpOpTaxConfig | null;
  isEmpty?: boolean;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null };
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };

  const { pphConfigTable } = getSupabaseConfig();
  const tableName = pphConfigTable || DEFAULT_PPH_CONFIG_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return { data: null, needsTableSetup: true, error: `Tabel "${tableName}" belum dibuat di Supabase.` };
  }

  try {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .eq('id', DEFAULT_PPH_CONFIG_ROW_ID)
      .maybeSingle();

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { data: null, needsTableSetup, error: error.message };
    }

    if (!data) {
      return { data: null, isEmpty: true };
    }

    const mapped: WpOpTaxConfig = {
      id: data.id || DEFAULT_PPH_CONFIG_ROW_ID,
      scheme: (data.scheme || 'umkm_final') as WpOpTaxScheme,
      scopeMode: (data.scope_mode || 'gabungan_wpop') as TaxScopeMode,
      ownerName: data.owner_name || '',
      ownerNpwpNik: data.owner_npwp_nik || '',
      ownerPtkpStatus: (data.owner_ptkp_status || 'K/0') as PtkpStatus,
      nppnRatePercent: Number(data.nppn_rate_percent ?? 30),
      monthlyOperationalExpense: Number(data.monthly_operational_expense ?? 0),
      includePayrollSalaryInPembukuanExpense:
        data.include_payroll_salary_in_pembukuan_expense !== false,
      manualYtdPriorTurnover: Number(data.manual_ytd_prior_turnover ?? 0),
      notes: data.notes || '',
      updatedAt: data.updated_at || undefined,
      updatedBy: data.updated_by || undefined
    };

    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncWpOpTaxConfigToSupabase(
  cfg: WpOpTaxConfig
): Promise<{ success: boolean; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { pphConfigTable } = getSupabaseConfig();
  const tableName = pphConfigTable || DEFAULT_PPH_CONFIG_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return { success: false, needsTableSetup: true, error: `Tabel "${tableName}" belum dibuat di Supabase.` };
  }

  const row = {
    id: cfg.id || DEFAULT_PPH_CONFIG_ROW_ID,
    scheme: cfg.scheme,
    scope_mode: cfg.scopeMode,
    owner_name: cfg.ownerName || '',
    owner_npwp_nik: cfg.ownerNpwpNik || '',
    owner_ptkp_status: cfg.ownerPtkpStatus || 'K/0',
    nppn_rate_percent: Number(cfg.nppnRatePercent) || 30,
    monthly_operational_expense: Number(cfg.monthlyOperationalExpense) || 0,
    include_payroll_salary_in_pembukuan_expense: Boolean(
      cfg.includePayrollSalaryInPembukuanExpense
    ),
    manual_ytd_prior_turnover: Number(cfg.manualYtdPriorTurnover) || 0,
    notes: cfg.notes || '',
    updated_by: cfg.updatedBy || '',
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function fetchPphSnapshotsFromSupabase(): Promise<{
  data: PphMonthlySnapshot[] | null;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null };
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };

  const { pphSnapshotTable } = getSupabaseConfig();
  const tableName = pphSnapshotTable || DEFAULT_PPH_SNAPSHOT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return { data: null, needsTableSetup: true, error: `Tabel "${tableName}" belum dibuat di Supabase.` };
  }

  try {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .order('period_key', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(120);

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped: PphMonthlySnapshot[] = (data || []).map((row: Record<string, any>) => {
      let staffDetails: Pph21StaffBreakdown[] = [];
      try {
        staffDetails =
          typeof row.staff_pph21_details === 'string'
            ? JSON.parse(row.staff_pph21_details)
            : Array.isArray(row.staff_pph21_details)
            ? row.staff_pph21_details
            : [];
      } catch {}

      let configSnapshot: WpOpTaxConfig = {
        id: DEFAULT_PPH_CONFIG_ROW_ID,
        scheme: (row.scheme || 'umkm_final') as WpOpTaxScheme,
        scopeMode: (row.scope_mode || 'gabungan_wpop') as TaxScopeMode,
        ownerName: '',
        ownerNpwpNik: '',
        ownerPtkpStatus: 'K/0',
        nppnRatePercent: 30,
        monthlyOperationalExpense: 0,
        includePayrollSalaryInPembukuanExpense: true,
        manualYtdPriorTurnover: 0
      };
      try {
        const parsedCfg =
          typeof row.config_snapshot === 'string'
            ? JSON.parse(row.config_snapshot)
            : row.config_snapshot;
        if (parsedCfg && typeof parsedCfg === 'object') {
          configSnapshot = { ...configSnapshot, ...parsedCfg };
        }
      } catch {}

      return {
        id: String(row.id),
        taxYear: Number(row.tax_year) || new Date().getFullYear(),
        taxMonth: Number(row.tax_month) || 1,
        periodKey: String(row.period_key || ''),
        periodStart: String(row.period_start || ''),
        periodEnd: String(row.period_end || ''),
        scopeMode: (row.scope_mode || 'gabungan_wpop') as TaxScopeMode,
        branchId: String(row.branch_id || 'ALL'),
        branchName: String(row.branch_name || 'Gabungan WP OP'),
        scheme: (row.scheme || 'umkm_final') as WpOpTaxScheme,
        totalGrossTransactions: Number(row.total_gross_transactions) || 0,
        excludedJasaTotal: Number(row.excluded_jasa_total) || 0,
        productTurnoverPeriod: Number(row.product_turnover_period) || 0,
        productTurnoverYtd: Number(row.product_turnover_ytd) || 0,
        productHppPeriod: Number(row.product_hpp_period) || 0,
        freeThreshold500mUsed: Number(row.free_threshold_500m_used) || 0,
        freeThreshold500mRemaining: Number(row.free_threshold_500m_remaining) || 0,
        limit48bRemaining: Number(row.limit_48b_remaining) || 0,
        estimatedPphUsaha: Number(row.estimated_pph_usaha) || 0,
        estimatedPph21: Number(row.estimated_pph21) || 0,
        totalEstimatedPph: Number(row.total_estimated_pph) || 0,
        staffPph21Details: staffDetails,
        configSnapshot,
        notes: row.notes || '',
        savedBy: row.saved_by || 'System',
        savedAt: row.saved_at || row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString()
      };
    });

    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function syncPphSnapshotToSupabase(
  snap: PphMonthlySnapshot
): Promise<{ success: boolean; needsTableSetup?: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { pphSnapshotTable } = getSupabaseConfig();
  const tableName = pphSnapshotTable || DEFAULT_PPH_SNAPSHOT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return { success: false, needsTableSetup: true, error: `Tabel "${tableName}" belum dibuat di Supabase.` };
  }

  const row = {
    id: snap.id,
    tax_year: snap.taxYear,
    tax_month: snap.taxMonth,
    period_key: snap.periodKey,
    period_start: snap.periodStart,
    period_end: snap.periodEnd,
    scope_mode: snap.scopeMode,
    branch_id: snap.branchId || 'ALL',
    branch_name: snap.branchName || 'Gabungan WP OP',
    scheme: snap.scheme,
    total_gross_transactions: Math.round(snap.totalGrossTransactions),
    excluded_jasa_total: Math.round(snap.excludedJasaTotal),
    product_turnover_period: Math.round(snap.productTurnoverPeriod),
    product_turnover_ytd: Math.round(snap.productTurnoverYtd),
    product_hpp_period: Math.round(snap.productHppPeriod),
    free_threshold_500m_used: Math.round(snap.freeThreshold500mUsed),
    free_threshold_500m_remaining: Math.round(snap.freeThreshold500mRemaining),
    limit_48b_remaining: Math.round(snap.limit48bRemaining),
    estimated_pph_usaha: Math.round(snap.estimatedPphUsaha),
    estimated_pph21: Math.round(snap.estimatedPph21),
    total_estimated_pph: Math.round(snap.totalEstimatedPph),
    staff_pph21_details: snap.staffPph21Details || [],
    config_snapshot: snap.configSnapshot || {},
    notes: snap.notes || '',
    saved_by: snap.savedBy || 'Admin',
    saved_at: snap.savedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await client.from(tableName).upsert(row, { onConflict: 'id' });
    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { success: false, needsTableSetup, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function deletePphSnapshotFromSupabase(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (isDemoMode()) return { success: false, error: 'Mode Demo aktif (isolasi sandbox)' };
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Klien Supabase belum dikonfigurasi' };

  const { pphSnapshotTable } = getSupabaseConfig();
  const tableName = pphSnapshotTable || DEFAULT_PPH_SNAPSHOT_TABLE;
  if (missingTablesInSession.has(tableName)) return { success: false, error: 'Tabel belum dibuat' };

  try {
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function fetchPphAuditFromSupabase(): Promise<{
  data: PphAuditEntry[] | null;
  needsTableSetup?: boolean;
  error?: string;
}> {
  if (isDemoMode()) return { data: null };
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Klien Supabase belum dikonfigurasi' };

  const { pphAuditTable } = getSupabaseConfig();
  const tableName = pphAuditTable || DEFAULT_PPH_AUDIT_TABLE;
  const available = await isSupabaseTableAvailable(tableName);
  if (available === false) {
    return { data: null, needsTableSetup: true, error: `Tabel "${tableName}" belum dibuat di Supabase.` };
  }

  try {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      const needsTableSetup = isMissingTableOrRlsError(error.message, error.code);
      if (needsTableSetup) missingTablesInSession.add(tableName);
      return { data: null, needsTableSetup, error: error.message };
    }

    const mapped: PphAuditEntry[] = (data || []).map((row: Record<string, any>) => ({
      id: String(row.id),
      actionType: (row.action_type || 'CONFIG_UPDATE') as PphAuditEntry['actionType'],
      summary: String(row.summary || ''),
      actorName: String(row.actor_name || 'System'),
      branchId: String(row.branch_id || 'ALL'),
      payloadSnapshot: row.payload_snapshot || undefined,
      createdAt: String(row.created_at || new Date().toISOString())
    }));
    return { data: mapped };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

export async function insertPphAuditToSupabase(
  entry: PphAuditEntry
): Promise<{ success: boolean; error?: string }> {
  if (isDemoMode()) return { success: false };
  const client = getSupabaseClient();
  if (!client) return { success: false };

  const { pphAuditTable } = getSupabaseConfig();
  const tableName = pphAuditTable || DEFAULT_PPH_AUDIT_TABLE;
  if (missingTablesInSession.has(tableName)) return { success: false };

  try {
    const { error } = await client.from(tableName).upsert(
      {
        id: entry.id,
        action_type: entry.actionType,
        summary: entry.summary,
        actor_name: entry.actorName,
        branch_id: entry.branchId || 'ALL',
        payload_snapshot: entry.payloadSnapshot || null,
        created_at: entry.createdAt || new Date().toISOString()
      },
      { onConflict: 'id' }
    );
    if (error) {
      if (isMissingTableOrRlsError(error.message, error.code)) {
        missingTablesInSession.add(tableName);
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export const SUPABASE_PPH_WPOP_SQL_SCHEMA = `-- SKEMA TABEL ESTIMASI PPh WAJIB PAJAK ORANG PRIBADI (WP OP) & PPh PASAL 21
-- Jalankan skrip ini pada SQL Editor di Dashboard Supabase Anda:

-- 1. Penambahan Kolom Pajak Petugas pada Tabel Master Pegawai
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS npwp_nik VARCHAR(40);
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS ptkp_status VARCHAR(10) DEFAULT 'TK/0';
ALTER TABLE pegawai ADD COLUMN IF NOT EXISTS tax_category VARCHAR(30) DEFAULT 'pegawai_tetap';

-- 2. Tabel Konfigurasi Pajak WP OP (1 baris pengaturan utama)
CREATE TABLE IF NOT EXISTS pph_wpop_config (
  id VARCHAR(60) PRIMARY KEY DEFAULT 'MAIN-WPOP-TAX-CONFIG',
  scheme VARCHAR(40) NOT NULL DEFAULT 'umkm_final', -- umkm_final | pasal_17_pembukuan | nppn
  scope_mode VARCHAR(30) NOT NULL DEFAULT 'gabungan_wpop', -- gabungan_wpop | per_unit
  owner_name VARCHAR(255) DEFAULT '',
  owner_npwp_nik VARCHAR(50) DEFAULT '',
  owner_ptkp_status VARCHAR(10) NOT NULL DEFAULT 'K/0',
  nppn_rate_percent NUMERIC(6,2) NOT NULL DEFAULT 30,
  monthly_operational_expense BIGINT NOT NULL DEFAULT 0,
  include_payroll_salary_in_pembukuan_expense BOOLEAN NOT NULL DEFAULT TRUE,
  manual_ytd_prior_turnover BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Snapshot Estimasi PPh Bulanan (untuk akses cepat histori tanpa scan transaksi mentah)
CREATE TABLE IF NOT EXISTS pph_wpop_snapshots (
  id VARCHAR(120) PRIMARY KEY,
  tax_year INT NOT NULL,
  tax_month INT NOT NULL,
  period_key VARCHAR(10) NOT NULL, -- YYYY-MM
  period_start VARCHAR(15) NOT NULL,
  period_end VARCHAR(15) NOT NULL,
  scope_mode VARCHAR(30) NOT NULL DEFAULT 'gabungan_wpop',
  branch_id VARCHAR(50) NOT NULL DEFAULT 'ALL',
  branch_name VARCHAR(255) DEFAULT 'Gabungan WP OP',
  scheme VARCHAR(40) NOT NULL DEFAULT 'umkm_final',
  total_gross_transactions BIGINT NOT NULL DEFAULT 0,
  excluded_jasa_total BIGINT NOT NULL DEFAULT 0,
  product_turnover_period BIGINT NOT NULL DEFAULT 0,
  product_turnover_ytd BIGINT NOT NULL DEFAULT 0,
  product_hpp_period BIGINT NOT NULL DEFAULT 0,
  free_threshold_500m_used BIGINT NOT NULL DEFAULT 0,
  free_threshold_500m_remaining BIGINT NOT NULL DEFAULT 0,
  limit_48b_remaining BIGINT NOT NULL DEFAULT 0,
  estimated_pph_usaha BIGINT NOT NULL DEFAULT 0,
  estimated_pph21 BIGINT NOT NULL DEFAULT 0,
  total_estimated_pph BIGINT NOT NULL DEFAULT 0,
  staff_pph21_details JSONB DEFAULT '[]'::jsonb,
  config_snapshot JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  saved_by VARCHAR(255),
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pph_snapshots_period ON pph_wpop_snapshots (tax_year DESC, tax_month DESC);
CREATE INDEX IF NOT EXISTS idx_pph_snapshots_period_key ON pph_wpop_snapshots (period_key DESC);
CREATE INDEX IF NOT EXISTS idx_pph_snapshots_scope ON pph_wpop_snapshots (scope_mode, branch_id);

-- 4. Tabel Riwayat Perubahan Konfigurasi & Snapshot Pajak (Audit Trail Pajak)
CREATE TABLE IF NOT EXISTS pph_wpop_audit (
  id VARCHAR(100) PRIMARY KEY,
  action_type VARCHAR(40) NOT NULL, -- CONFIG_UPDATE | SNAPSHOT_SAVE | SNAPSHOT_DELETE | STAFF_TAX_UPDATE
  summary TEXT NOT NULL,
  actor_name VARCHAR(255),
  branch_id VARCHAR(50) DEFAULT 'ALL',
  payload_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pph_audit_created ON pph_wpop_audit (created_at DESC);

ALTER TABLE pph_wpop_config REPLICA IDENTITY FULL;
ALTER TABLE pph_wpop_snapshots REPLICA IDENTITY FULL;
ALTER TABLE pph_wpop_audit REPLICA IDENTITY FULL;

${buildMultiTenantRlsSqlBlock('pph_wpop_config', { includeFunctions: false })}
${buildMultiTenantRlsSqlBlock('pph_wpop_snapshots', { hasBranchId: true, includeFunctions: false })}
${buildMultiTenantRlsSqlBlock('pph_wpop_audit', { hasBranchId: true, includeFunctions: false })}
`;




