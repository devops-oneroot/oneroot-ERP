import type { Attributes, FieldDef } from "./attributes";
import type { LetterheadBranch } from "./letterhead";
// Shapes returned by the OneRoot API. Prisma Decimal fields arrive as strings — wrap with n() before math.

export type Dec = string | number;
export type Role = "ADMIN" | "MANAGER" | "CASHIER" | "ACCOUNTANT";
export type ProductType = "SEED" | "FERTILIZER" | "PESTICIDE" | "EQUIPMENT" | "OTHER";
export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK" | "CHEQUE" | "CREDIT" | "KCC" | "CREDIT_NOTE" | "ADVANCE";
export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID";
export type DocStatus = "COMPLETED" | "CANCELLED";
export type PoStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "SENT_BACK"
  | "APPROVED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "REJECTED"
  | "CANCELLED";
/** What a PO shows: its status, with approval split by level (some levels approved, or rejected after some approved) */
export type PoDisplayStatus = PoStatus | "PARTIALLY_APPROVED" | "PARTIALLY_REJECTED";
export type DebitNoteStatus = "DRAFT" | "SENT" | "CANCELLED";
export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "DANGER";
export type MovementType =
  | "OPENING"
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "SALE"
  | "SALE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "EXPIRED"
  | "DAMAGED"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

/** Compact branch reference embedded in documents */
export interface BranchRef {
  id: string;
  code: string;
  name: string;
}

/** A store location with its own stock — GET /branches adds headline numbers */
export interface Branch extends BranchRef {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  gstin?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  /** Batches holding stock */
  batches?: number;
  /** Stock value at cost */
  stockValue?: number;
  /** Active staff whose home branch this is */
  users?: number;
}

export interface StockTransferItem {
  id: string;
  productId: string;
  fromBatchId: string;
  toBatchId: string;
  batchNo?: string | null;
  expiryDate?: string | null;
  quantity: Dec;
  unitCost: Dec;
  product?: { name: string; unit: string };
}

export interface StockTransfer {
  id: string;
  transferNo: string;
  fromBranchId: string;
  toBranchId: string;
  transferDate: string;
  notes?: string | null;
  createdAt: string;
  fromBranch: BranchRef;
  toBranch: BranchRef;
  items: StockTransferItem[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalAmount?: Dec;
  paidAmount?: Dec;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  /** Job title, e.g. Senior Accountant */
  designation?: string | null;
  role: Role;
  /** What the user may do = their role's permissions + extraPermissions − revokedPermissions (administrators need none) */
  permissions: string[];
  /** Given to this user on top of their role */
  extraPermissions?: string[];
  /** Taken away from this user although their role has them */
  revokedPermissions?: string[];
  /** Custom role (named set of ticks) the user was given, if any */
  roleTemplateId?: string | null;
  roleTemplate?: { id: string; name: string; baseRole?: Role; level?: RoleLevel; department?: { id: string; code?: string; name: string } | null } | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  /** Home branch; null = works across all branches */
  branchId?: string | null;
  /** Branches the user may work in (the first is the home branch); empty = all branches */
  branchIds?: string[];
  branch?: BranchRef | null;
  /** Approval PIN is set (managers / owner) */
  hasPin?: boolean;
}

/** A custom role: a named set of ticks built on a built-in role (which supplies the authority limits) */
/** Seniority of a role inside its department: L1 (entry) up to L3 (senior) */
export type RoleLevel = "L1" | "L2" | "L3";
export const ROLE_LEVELS: RoleLevel[] = ["L1", "L2", "L3"];
/** Level a role starts at from its name: administrators L3, managers and heads L2, everyone else L1 (same rule as the API) */
export function levelFromName(name: string): RoleLevel {
  if (/\badmin(istrator)?\b/i.test(name)) return "L3";
  if (/\b(manager|head)\b/i.test(name)) return "L2";
  return "L1";
}

export interface RoleTemplate {
  id: string;
  name: string;
  description?: string | null;
  baseRole: Role;
  level: RoleLevel;
  permissions: string[];
  userCount: number;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  createdAt?: string;
}

/** A built-in role's permissions (editable in Roles & Limits); users on it follow it plus their own extras / removals */
export interface BuiltInRole {
  role: Role;
  permissions: string[];
  /** The standard set shipped with the app, for "reset to standard" */
  defaults: string[];
  /** Users on this role without a custom role */
  userCount: number;
}

/** A department groups the custom roles of one function (Procurement, Sales, Warehouse...) */
export interface Department {
  id: string;
  /** DEPT-0001…, given by the server on create */
  code: string;
  name: string;
  description?: string | null;
  roleCount: number;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── Authority limits & approvals ─────────────────────────

export interface RoleLimit {
  role: Role;
  /** null = no limit */
  maxDiscountPct: number | null;
  returnLimit: number | null;
  adjustmentLimit: number | null;
  seeCostPrice: boolean;
}

export type ApprovalKind = "DISCOUNT" | "RETURN" | "ADJUSTMENT" | "OTHER";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "USED";

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  amount: Dec;
  details?: Record<string, unknown> | null;
  reason?: string | null;
  requestedById: string;
  requestedBy?: { name: string; role?: Role };
  status: ApprovalStatus;
  decidedById?: string | null;
  decidedBy?: { name: string } | null;
  decidedAt?: string | null;
  note?: string | null;
  byPin: boolean;
  usedAt?: string | null;
  branch?: { code: string } | null;
  createdAt: string;
}

// ───────────────────────── Schemes & customer types ─────────────────────────

/** How an offer calculates (each offer type in the managed list uses one) */
export type SchemeType = "BUY_X_GET_Y" | "PCT_OFF" | "UPTO_PCT_OFF" | "FLAT_OFF" | "FIXED_PRICE";
/** Built-in purposes (`SchemePurpose.code`) the app treats specially */
export type OfferPurpose = "GENERAL" | "FESTIVAL" | "STOCK_CLEARANCE" | "SEASONAL" | "COMPANY" | "NEW_LAUNCH" | "BULK";
/** Badge / ribbon colour of a purpose */
export type PurposeColor = "slate" | "green" | "amber" | "red" | "blue" | "violet";

/** Why an offer runs (managed list) */
export interface SchemePurpose {
  id: string;
  name: string;
  /** Set on the built-in ones, e.g. FESTIVAL */
  code?: string | null;
  color: PurposeColor;
  _count?: { schemes: number };
}

/** A festival / season offered for an offer's occasion (managed list) */
export interface SchemeOccasion {
  id: string;
  name: string;
}

/** A named offer type (managed list) and how it calculates */
export interface SchemeOfferType {
  id: string;
  name: string;
  kind: SchemeType;
  _count?: { schemes: number };
}

export interface SchemeOptions {
  purposes: SchemePurpose[];
  occasions: SchemeOccasion[];
  offerTypes: SchemeOfferType[];
}
/** What an offer covers */
export type SchemeScope = "PRODUCTS" | "CATEGORIES" | "ALL";

export interface Scheme {
  id: string;
  name: string;
  /** How it calculates (from its offer type) */
  type: SchemeType;
  offerTypeId?: string | null;
  offerType?: Pick<SchemeOfferType, "id" | "name" | "kind"> | null;
  purposeId?: string | null;
  purposeOption?: Pick<SchemePurpose, "id" | "name" | "code" | "color"> | null;
  /** Festival / occasion, e.g. "Pongal 2027" */
  occasion?: string | null;
  scope: SchemeScope;
  buyQty?: number | null;
  freeQty?: number | null;
  pct?: Dec | null;
  flat?: Dec | null;
  /** Offer price per unit (FIXED_PRICE) */
  price?: Dec | null;
  /** Applies only when the line has at least this many units */
  minQty?: Dec | null;
  /** Applies only when the bill reaches this value */
  minBill?: Dec | null;
  /** Stock limit: units that can be sold under the offer in all */
  maxQty?: Dec | null;
  /** Units already sold under a stock-limited offer */
  usedQty?: number;
  excludeSubsidised: boolean;
  categories: { categoryId: string; category?: { id: string; name: string } }[];
  from: string;
  to?: string | null;
  claimable: boolean;
  isActive: boolean;
  notes?: string | null;
  products: { productId: string; product?: { id: string; name: string; sku: string; salePrice: Dec } }[];
  _count?: { saleItems: number };
  /** Campaign this offer belongs to; it only applies while the campaign runs */
  campaignId?: string | null;
  campaign?: Pick<Campaign, "id" | "code" | "name" | "from" | "to" | "isActive"> | null;
}

export type CampaignStatus = "UPCOMING" | "RUNNING" | "ENDED" | "STOPPED";

/** What a campaign's offers achieved on completed bills */
export interface CampaignResults {
  bills: number;
  units: number;
  freeUnits: number;
  sales: number;
  /** Discount and free goods the campaign's schemes gave (not the cashier's or customer-type discounts) */
  discount: number;
}

/** A promotion; its schemes are the offers */
export interface Campaign {
  id: string;
  /** CMP-0001… */
  code: string;
  name: string;
  description?: string | null;
  from: string;
  to?: string | null;
  budget?: Dec | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  status: CampaignStatus;
  results?: CampaignResults;
  _count?: { schemes: number };
}

export interface CampaignDetail extends Campaign {
  schemes: Scheme[];
  results: CampaignResults & { products: { productId: string; name: string; quantity: number; freeQty: number; sales: number; discount: number }[] };
  recentBills: { id: string; invoiceNo: string; saleDate: string; customerName?: string | null; customer?: { name: string } | null; totalAmount: Dec; branch?: { name: string } | null }[];
}

/** One of a vendor's branches / depots we buy from */
export interface VendorBranch {
  id: string;
  vendorId: string;
  vendor?: { id: string; code?: string | null; name: string };
  name: string;
  code?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  isActive: boolean;
  createdAt?: string;
  _count?: { purchaseOrders: number };
}

export interface CustomerType {
  id: string;
  name: string;
  discountPct: Dec;
  minBill: Dec;
  excludeSubsidised: boolean;
  isActive: boolean;
  _count?: { customers: number };
}

export interface StoreSettings {
  id: number;
  storeName: string;
  ownerName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  fertilizerLicenseNo?: string | null;
  pesticideLicenseNo?: string | null;
  seedLicenseNo?: string | null;
  invoicePrefix: string;
  purchasePrefix: string;
  poPrefix: string;
  receiptPrefix: string;
  invoiceFooter?: string | null;
  expiryAlertDays: number;
  /** Default bill layout */
  receiptFormat: "A4" | "THERMAL_80" | "THERMAL_58";
  reminderTemplate?: string | null;
  vendorTerms?: string | null;
  poMailSubject?: string | null;
  poMailBody?: string | null;
  reminderGraceDays: number;
  autoReminders: boolean;
  blockOverdueCredit: boolean;
  /** No billing until the cashier opens a shift */
  requireOpenShift: boolean;
  /** WhatsApp Cloud API keys are present on the server */
  whatsappConfigured?: boolean;
  /** Active branches and their addresses, printed on invoices (see lib/letterhead.ts) */
  branches?: LetterheadBranch[];
}

// ───────────────────────── Cash control ─────────────────────────

export interface CashBreakdown {
  openingFloat: number;
  cashSales: number;
  vendorCashPayments: number;
  cashExpenses: number;
  cashRefunds: number;
  expected: number;
}

export interface Shift {
  id: string;
  shiftNo: string;
  branchId: string;
  branch?: { code: string; name: string };
  openedById: string;
  openedBy?: { name: string };
  openedAt: string;
  openingFloat: Dec;
  status: "OPEN" | "CLOSED";
  closedAt?: string | null;
  closedBy?: { name: string } | null;
  expectedCash?: Dec | null;
  countedCash?: Dec | null;
  noteCounts?: Record<string, number> | null;
  difference?: Dec | null;
  differenceReason?: string | null;
  floatKept?: Dec | null;
  toDeposit?: Dec | null;
  handedTo?: string | null;
  notes?: string | null;
  breakdown?: CashBreakdown;
  /** list only */
  deposited?: number;
  depositGap?: number;
  unexplainedGap?: boolean;
  deposits?: BankDeposit[];
}

export interface BankDeposit {
  id: string;
  depositNo: string;
  shiftId?: string | null;
  shift?: { id: string; shiftNo: string; openedAt: string; toDeposit: Dec | null; openedBy?: { name: string } } | null;
  branchId: string;
  branch?: { code: string; name: string };
  depositDate: string;
  amount: Dec;
  bankAccount?: string | null;
  reference?: string | null;
  /** true when a slip photo is stored (fetch /deposits/:id/slip) */
  slipImage?: boolean;
  difference: Dec;
  reason?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface CashReconciliation {
  days: number;
  openShifts: number;
  toDeposit: number;
  deposited: number;
  gap: number;
  unexplained: number;
  rows: { id: string; shiftNo: string; closedAt: string | null; cashier: string; branch: string; toDeposit: number; deposited: number; gap: number; counterDifference: number; unexplained: boolean }[];
}

export interface GovtMatchRow {
  id: string | null;
  product: { id: string; name: string; sku: string; unit: string };
  ourSales: number;
  ourStock: number;
  govtSales: number | null;
  portalStock: number | null;
  salesOff: number | null;
  stockOff: number | null;
  note: string | null;
  resolvedAt: string | null;
  status: "PENDING" | "MATCH" | "MISMATCH" | "RESOLVED";
}

export interface GovtMatch {
  date: string;
  rows: GovtMatchRow[];
  receiptsOnBills: { id: string; invoiceNo: string; govtReceiptNo: string; aadhaarVerified: boolean; customerName: string | null; totalAmount: Dec }[];
  subsidisedProducts: number;
}

/** Product category (top level), from GET /categories */
export interface Category {
  id: string;
  name: string;
  /** Numeric SKU code (1, 2 … 10 …) */
  code?: string | null;
  description?: string | null;
  /** Tax type: drives GST / HSN defaults for every product under it */
  type?: ProductType | null;
  /** The store's tax type (name and defaults); `type` is the built-in type it behaves like */
  taxTypeId?: string | null;
  taxType?: TaxType | null;
  _count?: { products: number; subCategories: number };
  /** Present with GET /categories?withSubs=true */
  subCategories?: SubCategory[];
}

/** A tax type a category can use: the five built-in ones plus any the store adds */
export interface TaxType {
  id: string;
  name: string;
  /** Built-in type it behaves like (licences, govt fertiliser rules) */
  baseType: ProductType;
  gstRate: Dec;
  hsnCode?: string | null;
  unit: string;
  trackBatch: boolean;
  builtIn: boolean;
  isActive: boolean;
  _count?: { categories: number };
}

/** Sub-category of one category, from GET /categories/:id/sub-categories */
export interface SubCategory {
  id: string;
  categoryId: string;
  name: string;
  /** Numeric SKU code, unique within its category */
  code?: string | null;
  description?: string | null;
  /** Extra fields every product in this sub-category carries (lib/attributes.ts) */
  fields?: FieldDef[] | null;
  _count?: { products: number };
}

export interface Batch {
  id: string;
  productId: string;
  batchNo: string;
  mfgDate?: string | null;
  expiryDate?: string | null;
  costPrice: Dec;
  mrp?: Dec | null;
  quantity: Dec;
  /** Rack / bin this lot sits in */
  location?: string | null;
  createdAt: string;
  branchId?: string;
  branch?: BranchRef | null;
  product?: Pick<Product, "id" | "name" | "sku" | "unit" | "type" | "location" | "salePrice">;
  /** Weighted average cost of the product's in-stock batches in the branch (batch list only) */
  avgCost?: number | null;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  type: ProductType;
  categoryId?: string | null;
  /** taxType: the category's tax type (shown as the product's type) */
  category?: { id: string; name: string; taxType?: { id: string; name: string } | null } | null;
  subCategoryId?: string | null;
  subCategory?: { id: string; name: string; fields?: FieldDef[] | null } | null;
  brand?: string | null;
  manufacturer?: string | null;
  technicalName?: string | null;
  description?: string | null;
  hsnCode?: string | null;
  gstRate: Dec;
  unit: string;
  packSize?: string | null;
  mrp: Dec;
  salePrice: Dec;
  purchasePrice: Dec;
  reorderLevel: Dec;
  trackBatch: boolean;
  /** Govt-subsidised fertiliser: bills need the govt POS receipt no. */
  isSubsidised?: boolean;
  /** Every unit carries a serial number; bills pick which serials leave */
  trackSerial?: boolean;
  /** Usual rack / bin / shelf */
  location?: string | null;
  /** Values of the category's extra fields */
  attributes?: Attributes | null;
  isActive: boolean;
  /** With a branch selected: stock in that branch; otherwise all branches */
  stock: Dec;
  /** Stock across all branches (sent when a branch is selected) */
  totalStock?: Dec;
  /** Detail only: stock per active branch */
  branchStock?: { branchId: string; code: string; name: string; quantity: number }[];
  batches?: Batch[];
}

export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: Dec;
  balanceAfter: Dec;
  unitCost?: Dec | null;
  refType?: string | null;
  refId?: string | null;
  refNo?: string | null;
  note?: string | null;
  createdAt: string;
  product?: { name: string; sku: string; unit: string };
  batch?: { batchNo: string; expiryDate?: string | null } | null;
  branch?: { code: string; name: string } | null;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  village?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  landAcres?: Dec | null;
  crops?: string | null;
  creditLimit: Dec;
  /** FPO, bulk buyer… decides an automatic discount at the counter */
  customerTypeId?: string | null;
  customerType?: CustomerType | null;
  /** Credit period in days; 0 = due immediately */
  creditDays: number;
  /** Credit sales blocked until a manager lifts it */
  creditHold: boolean;
  openingBalance: Dec;
  balance: Dec;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  /** Detail only */
  overdue?: Overdue;
  /** Credit notes not yet applied to a bill (detail only) — usable as a payment mode */
  creditNoteBalance?: number;
  /** Advance held on the customer's bookings, not yet set against a bill (detail only) */
  advanceBalance?: number;
  lastReminder?: CustomerReminder | null;
}

export interface Overdue {
  amount: number;
  days: number;
  oldestDue?: string | null;
}

export type ReminderChannel = "WHATSAPP" | "SMS" | "CALL" | "VISIT" | "NOTE";

export interface CustomerReminder {
  id: string;
  customerId: string;
  channel: ReminderChannel;
  amount: Dec;
  message?: string | null;
  automatic: boolean;
  userId?: string | null;
  sentAt: string;
}

export interface OverdueRow {
  id: string;
  name: string;
  phone: string | null;
  village: string | null;
  balance: number;
  creditLimit: number;
  creditDays: number;
  creditHold: boolean;
  overdue: Overdue;
  lastReminder: { sentAt: string; channel: ReminderChannel; automatic: boolean } | null;
  message: string;
}

export interface Vendor {
  id: string;
  /** VEN-0001…, given by the server */
  code?: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  ifsc?: string | null;
  paymentTermsDays: number;
  openingBalance: Dec;
  balance: Dec;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  paymentNo: string;
  direction: "IN" | "OUT";
  partyType: "CUSTOMER" | "VENDOR";
  customerId?: string | null;
  vendorId?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  amount: Dec;
  mode: PaymentMode;
  reference?: string | null;
  paymentDate: string;
  notes?: string | null;
  customer?: { id: string; name: string } | null;
  vendor?: { id: string; name: string } | null;
  sale?: { id: string; invoiceNo: string; customerName?: string | null } | null;
  purchase?: { id: string; purchaseNo: string } | null;
  /** Advance paid against this PO */
  po?: { id: string; poNo: string } | null;
  /** Paid for the goods on this GRN */
  grn?: { id: string; grnNo: string } | null;
  /** Advance booking the money was taken for, set against a bill from, or refunded on */
  bookingId?: string | null;
  booking?: { id: string; bookingNo: string } | null;
}

// ───────────────────────── Advance bookings ─────────────────────────

export type BookingStatus = "OPEN" | "PARTIAL" | "FULFILLED" | "CANCELLED";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  OPEN: "Open",
  PARTIAL: "Part Delivered",
  FULFILLED: "Delivered",
  CANCELLED: "Cancelled",
};

export interface AdvanceBookingItem {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string; unit: string; trackSerial: boolean; salePrice: Dec };
  quantity: Dec;
  deliveredQty: Dec;
  /** Units still to deliver */
  remaining: number;
  agreedPrice?: Dec | null;
  /** Detail only: the bill lines that delivered it */
  saleItems?: { id: string; bookingQty: Dec; sale: { id: string; invoiceNo: string; saleDate: string }; serials: { serialNo: string }[] }[];
}

/** A customer's product booking with an advance; units can come from any later batch */
export interface AdvanceBooking {
  id: string;
  bookingNo: string;
  customerId: string;
  customer: { id: string; name: string; phone?: string | null; village?: string | null; balance?: Dec };
  branch?: { id: string; code: string; name: string } | null;
  user?: { name: string } | null;
  bookingDate: string;
  expectedDate?: string | null;
  status: BookingStatus;
  advancePaid: Dec;
  advanceUsed: Dec;
  refunded: Dec;
  /** Advance still held: paid − used − refunded */
  unused: number;
  notes?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  items: AdvanceBookingItem[];
  /** Detail only */
  payments?: (Payment & { user?: { name: string } | null })[];
}

export type SerialStatus = "IN_STOCK" | "SOLD";

/** One serial-numbered unit of a product */
export interface SerialNumber {
  id: string;
  productId: string;
  serialNo: string;
  branchId: string;
  batchId?: string | null;
  batch?: { batchNo: string } | null;
  status: SerialStatus;
  saleItemId?: string | null;
  saleItem?: { sale: { id: string; invoiceNo: string } } | null;
  note?: string | null;
  soldAt?: string | null;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId: string;
  batchId?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  productName: string;
  hsnCode?: string | null;
  unit: string;
  quantity: Dec;
  rate: Dec;
  discountPct: Dec;
  gstRate: Dec;
  taxableAmount: Dec;
  taxAmount: Dec;
  amount: Dec;
  costPrice: Dec;
  returnedQty: Dec;
  /** Cashier's own discount on the line (the part that needs authority) */
  manualDiscountPct?: Dec;
  /** Customer-type discount folded into discountPct */
  typeDiscountPct?: Dec;
  schemeId?: string | null;
  scheme?: { name: string; type: SchemeType; claimable: boolean } | null;
  /** Free goods from a buy-X-get-Y scheme (zero price) */
  isFree?: boolean;
  /** Serial-numbered units that left with this line */
  serials?: { serialNo: string }[];
  product?: { sku: string; technicalName?: string | null; packSize?: string | null; isSubsidised?: boolean };
}

export interface SaleReturn {
  id: string;
  returnNo: string;
  saleId: string;
  returnDate: string;
  totalAmount: Dec;
  refundMode: PaymentMode;
  reason?: string | null;
  items: { id: string; saleItemId: string; productId: string; quantity: Dec; amount: Dec; product?: { name: string; unit: string } }[];
  sale?: { invoiceNo: string; customerName?: string | null };
  customer?: { name: string } | null;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  /** Branch that made the bill */
  branchId?: string | null;
  customerId?: string | null;
  customer?: Customer | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Customer type whose discount applied on this bill (FPO, bulk buyer…) */
  customerTypeName?: string | null;
  /** Counter or van trip */
  channel?: SaleChannel;
  vanTripId?: string | null;
  approvalId?: string | null;
  /** Agent who brought the sale in: internal reference, never on the printed bill */
  agentId?: string | null;
  agent?: { id: string; agentId: string; firstName: string; lastName?: string | null } | null;
  saleDate: string;
  dueDate?: string | null;
  subtotal: Dec;
  discount: Dec;
  taxAmount: Dec;
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
  roundOff: Dec;
  totalAmount: Dec;
  paidAmount: Dec;
  costAmount: Dec;
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  status: DocStatus;
  isInterState: boolean;
  offlineId?: string | null;
  /** Government fertiliser POS receipt for subsidised lines */
  govtReceiptNo?: string | null;
  aadhaarVerified?: boolean;
  notes?: string | null;
  items?: SaleItem[];
  payments?: Payment[];
  returns?: SaleReturn[];
  user?: { name: string } | null;
  _count?: { items: number };
}

export interface PurchaseItem {
  id: string;
  productId: string;
  batchId?: string | null;
  batchNo?: string | null;
  mfgDate?: string | null;
  expiryDate?: string | null;
  quantity: Dec;
  freeQty: Dec;
  rate: Dec;
  mrp?: Dec | null;
  discountPct: Dec;
  gstRate: Dec;
  taxableAmount: Dec;
  taxAmount: Dec;
  amount: Dec;
  product?: { name: string; sku: string; unit: string; hsnCode?: string | null };
}

export interface Purchase {
  id: string;
  purchaseNo: string;
  vendorId: string;
  vendor?: Vendor;
  /** Branch the goods were received into (detail only) */
  branch?: { id: string; code: string; name: string; address?: string | null; city?: string | null } | null;
  poId?: string | null;
  po?: { id: string; poNo: string } | null;
  grnId?: string | null;
  grn?: { id: string; grnNo: string } | null;
  rateMismatch?: boolean;
  vendorInvoiceNo?: string | null;
  purchaseDate: string;
  dueDate?: string | null;
  subtotal: Dec;
  discount: Dec;
  taxAmount: Dec;
  otherCharges: Dec;
  roundOff: Dec;
  totalAmount: Dec;
  paidAmount: Dec;
  paymentStatus: PaymentStatus;
  status: DocStatus;
  notes?: string | null;
  items?: PurchaseItem[];
  payments?: Payment[];
  /** detail only: debit/credit notes against this invoice */
  debitNotes?: NoteSummary[];
  user?: { name: string } | null;
  _count?: { items: number };
}

/** One step of a PO's approval chain, with its state for this PO */
export interface ChainStep {
  order: number;
  title: string;
  /** Role level that approves this step (that level or higher); absent on chains saved before levels */
  level?: RoleLevel;
  approverId: string | null;
  approverName: string | null;
  state: "done" | "current" | "pending" | "rejected";
}

export interface PoItem {
  id: string;
  productId: string;
  quantity: Dec;
  rate: Dec; // excl. GST
  /** Trade discount, % of quantity x rate (before GST) */
  discountPct?: Dec;
  gstRate: Dec;
  amount: Dec; // incl. GST, after the discount
  passedQty: Dec;
  rejectedQty: Dec;
  damagedQty: Dec;
  expiredQty: Dec;
  pendingQty?: number;
  product: { name: string; sku: string; unit: string; hsnCode?: string | null; trackBatch: boolean; trackSerial?: boolean; location?: string | null; packSize?: string | null; barcode?: string | null };
}

export interface PoHistory {
  id: string;
  round: number;
  action: string;
  userName: string;
  note?: string | null;
  at: string;
}

/** When a PO is paid: after goods inward, 100% advance, or a partial advance (balance after goods inward) */
export type PoPaymentTerm = "AFTER_GRN" | "ADVANCE_FULL" | "ADVANCE_PARTIAL";
export const PO_PAYMENT_TERMS: { value: PoPaymentTerm; label: string; hint: string }[] = [
  { value: "AFTER_GRN", label: "Payment After GRN", hint: "Finance pays against the GRN once the goods are received" },
  { value: "ADVANCE_FULL", label: "100% Advance", hint: "Finance pays the full PO amount once it is approved" },
  { value: "ADVANCE_PARTIAL", label: "Partial Advance", hint: "Finance pays the advance once approved; the balance after the GRN" },
];

export interface PurchaseOrder {
  id: string;
  poNo: string;
  vendorId: string;
  paymentTerm?: PoPaymentTerm;
  /** Advance to pay before delivery (PO total for 100% advance) */
  advanceAmount?: Dec;
  /** Advance paid so far */
  advancePaid?: Dec;
  /** Part of the advance already set against the PO's invoices */
  advanceApplied?: Dec;
  vendor?: Vendor;
  /** The vendor's branch this PO buys from (its address and GSTIN go on the PO) */
  vendorBranchId?: string | null;
  vendorBranch?: VendorBranch | null;
  orderDate: string;
  expectedDate?: string | null;
  /** How many days the PO stays valid (7 or 14); null on older POs */
  expiryDays?: number | null;
  /** Freight and other charges, already included in totalAmount */
  transportCharges?: Dec;
  /** GST % on the transportation / other charges (18 by default) */
  transportGstRate?: Dec;
  /** The transport amount was entered including GST; transportCharges is still the value before GST */
  transportGstInclusive?: boolean;
  otherCharges?: Dec;
  otherChargesGstRate?: Dec;
  otherChargesNote?: string | null;
  /** Brings totalAmount to whole rupees (.49 down, .50 up) */
  roundOff?: Dec;
  status: PoStatus;
  displayStatus?: PoDisplayStatus;
  subtotal: Dec;
  taxAmount: Dec;
  /** Saved by the backend from the vendor's and the delivery branch's state: IGST when true */
  isInterState?: boolean;
  totalAmount: Dec;
  round: number;
  level: number;
  levelsNeeded: number;
  notes?: string | null;
  createdBy?: { id?: string; name: string } | null;
  /** Sent to the vendor by email (Send to Vendor, once only) and by whom */
  vendorEmailedAt?: string | null;
  vendorEmailedBy?: string | null;
  chain: ChainStep[];
  receivedPct: number;
  canEdit: boolean;
  /** Branch the goods are delivered to */
  branchId?: string | null;
  branch?: (BranchRef & { address?: string | null; city?: string | null }) | null;
  // list only
  itemCount?: number;
  // detail only
  items?: PoItem[];
  history?: PoHistory[];
  waitingFor?: ChainStep | null;
  canAct?: boolean;
  grns?: {
    id: string;
    grnNo: string;
    receivedAt: string;
    receivedBy?: { name: string } | null;
    items?: { poItemId: string; passedQty: Dec; batchNo?: string | null; expiryDate?: string | null }[];
  }[];
  purchases?: { id: string; purchaseNo: string; status: DocStatus }[];
  debitNotes?: NoteSummary[];
  /** detail only: what has been paid to the vendor against this PO */
  payment?: PoPayment;
}

/** A vendor payment shown on a PO / GRN, with the transaction details finance noted */
export interface PaymentTxn {
  id: string;
  paymentNo: string;
  amount: Dec;
  mode: PaymentMode;
  /** UTR / txn id / cheque no. */
  reference?: string | null;
  paymentDate: string;
  notes?: string | null;
  user?: { name: string } | null;
  grn?: { id: string; grnNo: string } | null;
}

/** Payment status of a GRN, through the invoice booked from it */
export interface GrnPayment {
  status: PaymentStatus | "NOT_INVOICED";
  total: number;
  paid: number;
  due: number;
  transactions: PaymentTxn[];
}

/** Payment status of a PO: invoices paid plus advance not yet set against one, against the PO total */
export interface PoPayment extends Omit<GrnPayment, "status"> {
  status: PaymentStatus;
  /** Advance still to pay (advance terms only) */
  advanceDue: number;
  /** GRNs whose invoice still has a balance to pay */
  grns: { id: string; grnNo: string; due: number }[];
}

export interface ApprovalQueue {
  pending: (PurchaseOrder & {
    lastAction: PoHistory | null;
    waitingFor: ChainStep;
    canAct: boolean;
    createdBy?: { name: string } | null;
    _count: { items: number };
  })[];
  mine: number;
  reapprovals: number;
  byStep: { title: string; approverName: string | null; waiting: number }[];
  decisions: (PoHistory & { po: { id: string; poNo: string } })[];
}

/** The L1 → L2 → L3 chain and the value bands that decide how far up it a PO (and its goods inward) goes */
export interface ApprovalConfig {
  steps: { id: RoleLevel; order: number; title: string; level: RoleLevel; approverId: null; approverName: string }[];
  /** level: the highest step the band needs (L2 = L1 → L2, L3 = L1 → L2 → L3); steps = how many that is */
  bands: { id: string; upTo: number | null; steps: number; level: RoleLevel }[];
}

/** Goods inward waiting for (or decided by) the approval chain; the GRN is posted on the last approval */
export interface GrnApprovalRow {
  id: string;
  poId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  level: number;
  createdAt: string;
  updatedAt: string;
  requestedById: string;
  requestedBy: { name: string };
  po: { id: string; poNo: string; totalAmount: Dec; vendor: { id: string; name: string }; branch?: { name: string } | null };
  grn?: { id: string; grnNo: string } | null;
  supplierInvoiceNo?: string | null;
  vehicleNo?: string | null;
  receivedAt: string;
  notes?: string | null;
  items: {
    product: string;
    unit: string;
    passedQty: number;
    rejectedQty: number;
    damagedQty: number;
    expiredQty: number;
    batchNo?: string | null;
    /** Why goods on this row were not accepted, and what was wrong */
    issue?: string | null;
    issueRemark?: string | null;
  }[];
  chain: ChainStep[];
  waitingFor: ChainStep | null;
  canAct: boolean;
  history: { action: string; by: string; at: string; note?: string | null }[];
}

export interface GrnApprovalQueue {
  pending: GrnApprovalRow[];
  decided: GrnApprovalRow[];
  mine: number;
}

export interface PendingInwardPo {
  id: string;
  poNo: string;
  vendor: { id: string; name: string };
  orderDate: string;
  expectedDate?: string | null;
  status: PoStatus;
  totalAmount: Dec;
  products: string[];
  /** Total quantity ordered on the PO */
  poQty: number;
  receivedPct: number;
  late: boolean;
  branchId?: string | null;
  branch?: BranchRef | null;
}

export interface GrnItem {
  id: string;
  poItemId: string;
  productId: string;
  passedQty: Dec;
  rejectedQty: Dec;
  damagedQty: Dec;
  expiredQty: Dec;
  batchNo?: string | null;
  mfgDate?: string | null;
  expiryDate?: string | null;
  batchId?: string | null;
  rate: Dec; // PO rate excl. GST
  product: { name: string; sku: string; unit: string; hsnCode?: string | null; barcode?: string | null; mrp?: Dec; salePrice?: Dec; packSize?: string | null };
  poItem: { rate: Dec; gstRate: Dec; quantity: Dec; discountPct?: Dec };
  /** Serial-numbered units that came in on this row (its batch); sent with a single GRN */
  serials?: { serialNo: string; status: "IN_STOCK" | "SOLD" }[];
}

export interface Grn {
  id: string;
  grnNo: string;
  po: { id: string; poNo: string; vendorId?: string; vendorBranch?: VendorBranch | null; isInterState?: boolean; transportGstRate?: Dec };
  vendor: Vendor | { id: string; name: string };
  receivedAt: string;
  /** Earliest expiry of the stock accepted on this GRN (list only) */
  earliestExpiry?: string | null;
  receivedBy?: { name: string } | null;
  /** Branch the goods were received into */
  branchId?: string | null;
  /** detail only */
  branch?: (BranchRef & { address?: string | null; city?: string | null }) | null;
  vehicleNo?: string | null;
  /** Number on the supplier's invoice / challan that came with the goods */
  supplierInvoiceNo?: string | null;
  notes?: string | null;
  purchase?: { id: string; purchaseNo: string; status?: DocStatus } | null;
  // list only: totals per GRN
  /** Total quantity ordered on the PO (GRN list) */
  poQty?: number;
  /** Everything that arrived: passed + rejected + damaged + expired */
  received?: number;
  passed?: number;
  rejected?: number;
  damaged?: number;
  expired?: number;
  // detail only
  items?: GrnItem[];
  debitNotes?: { id: string; dnNo: string; status: DebitNoteStatus }[];
  payment?: GrnPayment;
}

export type NoteType = "DEBIT" | "CREDIT";
export type NoteReason =
  | "RETURN"
  | "REJECTED_AT_INWARD"
  | "RATE_DIFFERENCE"
  | "SHORT_SUPPLY"
  | "DAMAGED_IN_TRANSIT"
  | "SCHEME_INCENTIVE"
  | "PRICE_PROTECTION"
  | "CASH_DISCOUNT"
  | "AGAINST_DEBIT_NOTE"
  | "OTHER";

export const NOTE_REASON_LABEL: Record<NoteReason, string> = {
  RETURN: "Goods Returned",
  REJECTED_AT_INWARD: "Rejected at Inward",
  RATE_DIFFERENCE: "Rate Difference",
  SHORT_SUPPLY: "Short Supply",
  DAMAGED_IN_TRANSIT: "Damaged in Transit",
  SCHEME_INCENTIVE: "Scheme / Target Incentive",
  PRICE_PROTECTION: "Price Protection",
  CASH_DISCOUNT: "Cash Discount",
  AGAINST_DEBIT_NOTE: "Against Our Debit Note",
  OTHER: "Other",
};

/** Debit (we raise) or credit (vendor gives us) note — the list/detail shape from GET /debit-notes */
export interface DebitNote {
  id: string;
  dnNo: string;
  noteType: NoteType;
  reasonType: NoteReason;
  vendorId: string;
  vendor: {
    id: string;
    code?: string;
    name: string;
    gstin?: string | null;
    state?: string | null;
    address?: string | null;
    city?: string | null;
    pincode?: string | null;
    billingAddress?: string | null;
    shippingAddress?: string | null;
  };
  grn?: { id: string; grnNo: string } | null;
  purchaseId?: string | null;
  purchase?: { id: string; purchaseNo: string; vendorInvoiceNo?: string | null } | null;
  poId?: string | null;
  po?: { id: string; poNo: string } | null;
  /** Who raised the note; only they can cancel it */
  userId?: string | null;
  /** The vendor's own note number (credit notes) */
  vendorRef?: string | null;
  noteDate: string;
  reason: string;
  /** Shipping address typed on the note */
  shipTo?: string | null;
  status: DebitNoteStatus;
  /** Goods return: stock leaves when posted */
  affectsStock: boolean;
  /** Money-only note: the payable drops when posted */
  affectsBalance: boolean;
  subtotal: Dec;
  taxAmount: Dec;
  totalAmount: Dec;
  items: {
    id: string;
    productId?: string | null;
    description?: string | null;
    batchId?: string | null;
    batchNo?: string | null;
    quantity: Dec;
    rate: Dec;
    gstRate: Dec;
    amount: Dec;
    product: { name: string; unit: string; hsnCode?: string | null } | null;
  }[];
}

/** Compact note row embedded in PO / purchase invoice details */
export interface NoteSummary {
  id: string;
  dnNo: string;
  noteType: NoteType;
  reasonType: NoteReason;
  reason: string;
  status: DebitNoteStatus;
  totalAmount: Dec;
  noteDate: string;
  vendorRef?: string | null;
  purchase?: { id: string; purchaseNo: string } | null;
  affectsStock?: boolean;
  affectsBalance?: boolean;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string | null;
  module: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  categoryId: string;
  category: ExpenseCategory;
  amount: Dec;
  expenseDate: string;
  mode: PaymentMode;
  paidTo?: string | null;
  reference?: string | null;
  notes?: string | null;
  user?: { name: string } | null;
}

export interface LedgerEntry {
  date: string;
  type: string;
  refNo: string;
  refId?: string;
  debit: number;
  credit: number;
  balance: number;
  note?: string | null;
}

export interface Ledger<P> {
  party: P;
  openingBalance: number;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: unknown;
  createdAt: string;
  user?: { name: string; email: string } | null;
  /** The browser's own id (X-Device-Id); null for older entries and background jobs */
  deviceId?: string | null;
  /** e.g. "Samsung SM-A146B · Android 14 · Chrome 141", worked out by the server */
  deviceName?: string | null;
  /** Name an admin gave this device, e.g. "Front Counter PC" */
  deviceLabel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ───────────────────────── Accounting ─────────────────────────

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  group: string;
  key?: string | null;
  expenseCategoryId?: string | null;
  openingBalance: number;
  isActive: boolean;
  isSystem?: boolean;
  /** From GET /accounting/accounts: totals to date and the debit-positive balance */
  debit?: number;
  credit?: number;
  balance?: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  account: { id?: string; code: string; name: string };
  debit: number;
  credit: number;
  partyType?: "CUSTOMER" | "VENDOR" | null;
  partyId?: string | null;
  party?: string | null;
  description?: string | null;
}

export interface JournalEntry {
  id: string;
  entryNo: string;
  date: string;
  narration?: string | null;
  refType: string;
  refId?: string | null;
  refNo?: string | null;
  reversesId?: string | null;
  isManual: boolean;
  branchId?: string | null;
  branch?: { code: string; name: string } | null;
  createdAt: string;
  amount?: number;
  lines: JournalLine[];
  reversedBy?: { id: string; entryNo: string } | null;
}

export interface LedgerRow {
  id: string;
  entryId: string;
  entryNo: string;
  date: string;
  refType: string;
  refNo?: string | null;
  refId?: string | null;
  narration?: string | null;
  description?: string | null;
  party?: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface AccountLedger {
  account: Account;
  party: { type: "CUSTOMER" | "VENDOR"; id: string } | null;
  from: string;
  to: string;
  opening: number;
  entries: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

export interface TrialBalance {
  from: string;
  to: string;
  rows: { id: string; code: string; name: string; type: AccountType; group: string; opening: number; debit: number; credit: number; closing: number }[];
  totals: { openingDr: number; openingCr: number; debit: number; credit: number; closingDr: number; closingCr: number };
}

export interface LedgerProfitLoss {
  from: string;
  to: string;
  rows: { id: string; code: string; name: string; type: AccountType; group: string; amount: number }[];
  sales: number;
  directExpenses: number;
  grossProfit: number;
  otherIncome: number;
  indirectExpenses: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

export interface BalanceSheet {
  asOf: string;
  fyStart: string;
  assets: { id: string; code: string; name: string; group: string; balance: number }[];
  liabilities: { id: string; code: string; name: string; group: string; balance: number }[];
  equity: { id: string; code: string; name: string; group: string; balance: number }[];
  retainedEarnings: number;
  currentProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  difference: number;
}

export const REF_TYPE_LABEL: Record<string, string> = {
  SALE: "Sale",
  SALE_RETURN: "Sales Return",
  PURCHASE: "Purchase",
  GRN: "Goods Received",
  PAYMENT: "Payment / Receipt",
  EXPENSE: "Expense",
  DEBIT_NOTE: "Debit / Credit Note",
  ADJUSTMENT: "Stock Adjustment",
  OPENING: "Opening Balance",
  MANUAL: "Manual Voucher",
  REVERSAL: "Reversal",
};

export const PRODUCT_TYPES: ProductType[] = ["SEED", "FERTILIZER", "PESTICIDE", "EQUIPMENT", "OTHER"];
export const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "CARD", "KCC", "BANK", "CHEQUE", "CREDIT", "CREDIT_NOTE"];
export const MODE_LABEL: Record<PaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  KCC: "KCC",
  BANK: "Bank Transfer",
  CHEQUE: "Cheque",
  CREDIT: "Credit",
  CREDIT_NOTE: "Credit Note",
  ADVANCE: "Advance",
};
export const modeLabel = (m: PaymentMode | string) => MODE_LABEL[m as PaymentMode] ?? m;
/** Modes money actually arrives in (for receipts and vendor payments) */
export const MONEY_MODES: PaymentMode[] = ["CASH", "UPI", "CARD", "KCC", "BANK", "CHEQUE"];

export type SaleChannel = "COUNTER" | "VAN";

/** A van-stock day */
export interface VanTrip {
  id: string;
  tripNo: string;
  branchId: string;
  branch?: { code: string; name?: string } | null;
  userId: string;
  user?: { id?: string; name: string } | null;
  date: string;
  vehicleNo?: string | null;
  route?: string | null;
  status: "OPEN" | "CLOSED";
  openingCash: Dec;
  cashExpected?: Dec | null;
  cashHandedOver?: Dec | null;
  cashDifference?: Dec | null;
  notes?: string | null;
  closeNote?: string | null;
  closedAt?: string | null;
}

export interface VanTripDetail extends VanTrip {
  items: {
    id: string;
    productId: string;
    product: { id: string; name: string; sku: string; unit: string; salePrice: Dec; packSize?: string | null };
    loadedQty: Dec;
    soldQty: number;
    onVan: number;
    returnedQty?: Dec | null;
    shortQty?: Dec | null;
  }[];
  sales: { id: string; invoiceNo: string; saleDate: string; customerName?: string | null; customer?: { name: string } | null; totalAmount: Dec; paidAmount: Dec; paymentMode: PaymentMode }[];
  summary: { salesTotal: number; bills: number; credit: number; cashSales: number; cashRefunds: number; cashExpected: number; byMode: { mode: PaymentMode; amount: number }[] };
}

/** A POS cart parked for later (hold / recall) */
export interface HeldBill {
  id: string;
  holdNo: number;
  branchId: string;
  userId: string;
  user?: { name: string };
  customerId?: string | null;
  customer?: { name: string; phone?: string | null } | null;
  customerName?: string | null;
  label?: string | null;
  total: Dec;
  itemCount: number;
  payload: Record<string, unknown>;
  createdAt: string;
}
export const UNITS = ["NOS", "KG", "GM", "LTR", "ML", "BAG", "PKT", "BOX", "BTL", "MTR"];
export const GST_RATES = [0, 5, 12, 18, 28];
export const ROLES: Role[] = ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"];

export const TYPE_LABEL: Record<ProductType, string> = {
  SEED: "Seed",
  FERTILIZER: "Fertilizer",
  PESTICIDE: "Pesticide",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
};

/** An agent who brings in vendors and customers; deleted agents are kept with deletedAt / deletedById */
export interface Agent {
  id: string;
  /** ORAGENT + 5-digit running number, e.g. ORAGENT00001 */
  agentId: string;
  firstName: string;
  lastName?: string | null;
  /** 10-digit mobile number */
  mobile?: string | null;
  branchId?: string | null;
  branch?: { id: string; code: string; name: string } | null;
  createdAt: string;
  deletedAt?: string | null;
  deletedById?: string | null;
  /** Completed bills under this agent (in the list's branch and date range) */
  sales?: { count: number; total: number };
}

/** A bill made under an agent, as the agent's sales list shows it */
export interface AgentSale {
  id: string;
  invoiceNo: string;
  saleDate: string;
  customerName?: string | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
  totalAmount: Dec;
  paidAmount: Dec;
  paymentMode: string;
  paymentStatus: string;
  status: string;
  branch?: { code: string; name: string } | null;
  _count?: { items: number };
}

/** What a file can be attached to */
export type AttachmentEntity = "PO" | "GRN" | "NOTE";

/** A file attached to a PO, GRN or debit / credit note */
export interface Attachment {
  id: string;
  entityType: AttachmentEntity;
  entityId: string;
  fileName: string;
  mimeType: string;
  /** Bytes */
  size: number;
  uploadedBy?: { id: string; name: string } | null;
  createdAt: string;
}

/** A product linked to a vendor (products the vendor supplies) */
export interface VendorProductLink {
  id: string;
  name: string;
  sku: string;
  brand?: string | null;
  packSize?: string | null;
  unit: string;
  purchasePrice: Dec;
  isActive: boolean;
  linkedAt: string;
}

export type QuotationStatus = "OPEN" | "ACCEPTED" | "REJECTED" | "CANCELLED";

export interface QuotationItem {
  id: string;
  productId: string;
  productName: string;
  hsnCode?: string | null;
  unit: string;
  quantity: Dec;
  /** GST-inclusive price per unit, as on a sale */
  rate: Dec;
  discountPct: Dec;
  gstRate: Dec;
  taxableAmount: Dec;
  taxAmount: Dec;
  amount: Dec;
  product?: { sku: string; technicalName?: string | null; packSize?: string | null; stock?: Dec };
}

/** Price quote for a customer, laid out like a tax invoice; moves no stock and no money */
export type QuotationParty = "CUSTOMER" | "BUSINESS";

export interface Quotation {
  id: string;
  /** QTN/26-27/00001 */
  quotationNo: string;
  branchId?: string | null;
  /** Registered customer the details were filled from, if any */
  customerId?: string | null;
  /** CUSTOMER: name and contact only; BUSINESS: the firm's details with its GSTIN */
  partyType: QuotationParty;
  /** Customer's name, or the business's registered name */
  customerName: string;
  /** Business quotes: the person it is addressed to */
  contactPerson?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerPincode?: string | null;
  quotationDate: string;
  validUntil?: string | null;
  subtotal: Dec;
  discount: Dec;
  taxAmount: Dec;
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
  roundOff: Dec;
  totalAmount: Dec;
  isInterState: boolean;
  status: QuotationStatus;
  notes?: string | null;
  terms?: string | null;
  items?: QuotationItem[];
  user?: { name: string } | null;
  createdAt: string;
  _count?: { items: number };
}

export type PettyCashType = "TOP_UP" | "SPEND";

/** One movement in a branch's petty-cash fund: a top-up into it or a spend (voucher) out of it */
export interface PettyCashEntry {
  id: string;
  /** PCT/… for top-ups, PCV/… for spend vouchers */
  voucherNo: string;
  type: PettyCashType;
  branchId: string;
  branch?: { id: string; code: string; name: string } | null;
  amount: Dec;
  entryDate: string;
  /** Top-up: where the money came from */
  sourceMode?: PaymentMode | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  paidTo?: string | null;
  billNo?: string | null;
  notes?: string | null;
  user?: { name: string } | null;
  createdAt: string;
}

export interface PettyCashSummary {
  /** Fund balance now (all time), for the branch or all branches */
  balance: number;
  /** Within the filters */
  toppedUp: number;
  spent: number;
  vouchers: number;
}

