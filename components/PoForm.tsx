"use client";

import { AlertTriangle, FileText, ListPlus, Lock, PackagePlus, Route, Send, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBranchOptions } from "@/components/BranchNotice";
import { useCounts } from "@/components/Notifications";
import { ProductPicker, VendorPicker } from "@/components/pickers";
import { Button, Card, DateInput, Field, Input, Select, Spinner, Table, Td, Textarea, Th, cx, errMsg, useToast } from "@/components/ui";
import { PO_PAYMENT_TERMS, type PoPaymentTerm } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { CHARGES_GST_RATE, gstSlabs, halfRate, placeOfSupply } from "@/lib/gst";
import { date, inr, inr0, n, qty, round2, today } from "@/lib/format";
import { clearApiCache, useApi } from "@/lib/hooks";
import { GST_RATES } from "@/lib/types";
import type { ApprovalConfig, Product, PurchaseOrder, StoreSettings, Vendor, VendorBranch, VendorProductLink } from "@/lib/types";
import { branchAddress, branchLabel } from "@/components/VendorBranches";
import { LazyPoTermsModal } from "@/components/lazy";
import { PoPriceHistory } from "@/components/PoPriceHistory";
import { Attachments, PendingFiles, uploadAttachments } from "@/components/Attachments";

interface LowStockRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  packSize: string | null;
  stock: string;
  reorderLevel: string;
  purchasePrice: string;
  gstRate: string;
}

interface PoLine {
  key: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  /** As entered on the product (e.g. 50 kg); shown on the line, not edited here */
  packSize?: string | null;
  stock?: number;
  gstRate: number;
  quantity: string;
  rate: string;
  /** Trade discount %, "" = none */
  discountPct: string;
}

let lineSeq = 0;

const lineGross = (l: PoLine) => round2((Number(l.quantity) || 0) * (Number(l.rate) || 0));
const clampPct = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
// Same as the backend: the discount comes off quantity x rate, GST is charged on the rest
const lineTaxable = (l: PoLine) => round2((Number(l.quantity) || 0) * (Number(l.rate) || 0) * (1 - clampPct(l.discountPct) / 100));
const lineAmount = (l: PoLine) => round2(lineTaxable(l) * (1 + l.gstRate / 100));

/** Same rule as the backend's chainFor: first band that covers the value, then that many leading steps */
export function chainForValue(config: ApprovalConfig, total: number) {
  const bands = [...config.bands].sort((a, b) => (a.upTo === null ? 1 : b.upTo === null ? -1 : a.upTo - b.upTo));
  const band = bands.find((b) => b.upTo === null || total <= b.upTo) ?? bands[bands.length - 1];
  if (!band) return { band: null, steps: config.steps.slice(0, 1) };
  return { band, steps: config.steps.slice(0, Math.max(1, Math.min(band.steps, config.steps.length))) };
}

/** True when the vendor is registered in another state (from GSTIN, else state), so the PO attracts IGST */
export function isInterState(
  vendor?: { gstin?: string | null; state?: string | null } | null,
  store?: { gstin?: string | null; state?: string | null; stateCode?: string | null } | null,
) {
  return placeOfSupply(vendor, store).interState === true;
}

/** How long a PO stays valid; the backend accepts only these */
const PO_EXPIRY_DAYS = [7, 14];

/** Create or edit a purchase order; pass `po` to edit */
export function PoForm({ po, presetVendorId }: { po?: PurchaseOrder; presetVendorId?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const { refresh } = useCounts();
  const editing = !!po;

  const [vendor, setVendorState] = useState<Vendor | null>(po?.vendor ?? null);
  // The vendor's branch we buy from ("" = the vendor's main address)
  // undefined = not chosen yet: a new PO starts on the vendor's primary depot
  const [vendorBranchChoice, setVendorBranchId] = useState<string | undefined>(po ? (po.vendorBranchId ?? "") : undefined);
  const setVendor = (v: Vendor | null) => {
    setVendorState(v);
    if (v?.id !== vendor?.id) setVendorBranchId(undefined);
  };
  const [orderDate, setOrderDate] = useState(po ? today(new Date(po.orderDate)) : today());
  const [expectedDate, setExpectedDate] = useState(po?.expectedDate ? today(new Date(po.expectedDate)) : "");
  const [expiryDays, setExpiryDays] = useState(po?.expiryDays ? String(po.expiryDays) : "");
  // Expected delivery stays editable while the PO is a draft; fixed once submitted (older POs without one may set it once)
  const expectedLocked = !!po?.expectedDate && po.status !== "DRAFT";
  const [lines, setLines] = useState<PoLine[]>(() =>
    // Negative keys for loaded lines so they never clash with lines added later
    (po?.items ?? []).map((i, idx) => ({
      key: -(idx + 1),
      productId: i.productId,
      name: i.product.name,
      sku: i.product.sku,
      unit: i.product.unit,
      packSize: i.product.packSize ?? null,
      gstRate: n(i.gstRate),
      quantity: String(n(i.quantity)),
      rate: String(n(i.rate)),
      discountPct: n(i.discountPct) ? String(n(i.discountPct)) : "",
    })),
  );
  const [notes, setNotes] = useState(po?.notes ?? "");
  // Payment terms: after GRN (default), 100% advance, or a partial advance in rupees
  const [paymentTerm, setPaymentTerm] = useState<PoPaymentTerm>(po?.paymentTerm ?? "AFTER_GRN");
  const [advanceAmount, setAdvanceAmount] = useState(po?.paymentTerm === "ADVANCE_PARTIAL" && n(po.advanceAmount) ? String(n(po.advanceAmount)) : "");
  const [termsOpen, setTermsOpen] = useState(false);
  // An inclusive PO shows the amount as it was entered (value before GST + its GST)
  const [transportCharges, setTransportCharges] = useState(() => {
    if (!po || !n(po.transportCharges)) return "";
    const rate = po.transportGstRate != null ? n(po.transportGstRate) : CHARGES_GST_RATE;
    return String(po.transportGstInclusive ? round2(n(po.transportCharges) * (1 + rate / 100)) : n(po.transportCharges));
  });
  const [transportInclusive, setTransportInclusive] = useState(!!po?.transportGstInclusive);
  const [otherCharges, setOtherCharges] = useState(po && n(po.otherCharges) ? String(n(po.otherCharges)) : "");
  const [transportGstRate, setTransportGstRate] = useState(String(po?.transportGstRate != null ? n(po.transportGstRate) : CHARGES_GST_RATE));
  const [otherChargesGstRate, setOtherChargesGstRate] = useState(String(po?.otherChargesGstRate != null ? n(po.otherChargesGstRate) : CHARGES_GST_RATE));
  const [otherChargesNote, setOtherChargesNote] = useState(po?.otherChargesNote ?? "");
  // Deliver-to branch: where the goods are received (GRN) and stocked
  const { currentId } = useBranch();
  const { branches: branchOptions, loading: branchesLoading } = useBranchOptions();
  const [branchPick, setBranchPick] = useState(po?.branchId ?? po?.branch?.id ?? (currentId !== "all" ? currentId : ""));
  // A single-branch store needs no choice
  const branchId = branchPick || (branchOptions.length === 1 ? branchOptions[0].id : "");
  const showBranch = branchOptions.length > 1 || !branchId;
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [loadingLow, setLoadingLow] = useState(false);
  // Files picked for a new PO; uploaded once it is saved
  const [files, setFiles] = useState<File[]>([]);
  const [preloading, setPreloading] = useState(!po && !!presetVendorId);

  const { data: store } = useApi<StoreSettings>("/settings");
  const { data: rules, error: rulesError } = useApi<ApprovalConfig>("/approval-rules");
  // The number a new PO will get (taken only when it is saved, so every new PO gets the next one)
  const { data: nextNo } = useApi<{ poNo: string }>(po ? null : "/purchase-orders/next-number");
  // Products the chosen vendor supplies: the item search only offers these
  const { data: vendorProducts, loading: vendorProductsLoading } = useApi<VendorProductLink[]>(vendor ? `/vendors/${vendor.id}/products` : null);
  const supplied = vendorProducts ? new Set(vendorProducts.map((p) => p.id)) : null;
  const notSupplied = supplied ? lines.filter((l) => !supplied.has(l.productId)) : [];

  useEffect(() => {
    if (po || !presetVendorId) return;
    let cancelled = false;
    api
      .get<Vendor>(`/vendors/${presetVendorId}`)
      .then((v) => !cancelled && setVendor(v))
      .catch((e) => !cancelled && toast.error(errMsg(e)))
      .finally(() => !cancelled && setPreloading(false));
    return () => {
      cancelled = true;
    };
    // toast's identity changes on every toast; only the vendor id should trigger a reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetVendorId]);

  function addProduct(p: Product) {
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === p.id);
      if (existing) {
        return ls.map((l) => (l === existing ? { ...l, quantity: String(round2((Number(l.quantity) || 0) + 1)) } : l));
      }
      return [
        ...ls,
        {
          key: ++lineSeq,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          packSize: p.packSize ?? null,
          stock: n(p.stock),
          gstRate: n(p.gstRate),
          quantity: "1",
          rate: n(p.purchasePrice) ? String(n(p.purchasePrice)) : "",
          discountPct: "",
        },
      ];
    });
  }

  async function addLowStock() {
    if (!vendor || !supplied) return toast.error("Choose the vendor first");
    setLoadingLow(true);
    try {
      // Only the low-stock products this vendor supplies
      const low = (await api.get<LowStockRow[]>("/inventory/low-stock")).filter((r) => supplied.has(r.id));
      const have = new Set(lines.map((l) => l.productId));
      const todo = low.filter((r) => !have.has(r.id));
      if (!todo.length) {
        toast.success(low.length ? "All low-stock items are already on this order" : `No products ${vendor.name} supplies are below their reorder level`);
        return;
      }
      setLines((ls) => [
        ...ls,
        ...todo.map((r) => ({
          key: ++lineSeq,
          productId: r.id,
          name: r.name,
          sku: r.sku,
          unit: r.unit,
          packSize: r.packSize,
          stock: n(r.stock),
          gstRate: n(r.gstRate),
          quantity: String(Math.ceil(Math.max(n(r.reorderLevel) * 2 - n(r.stock), 1))),
          rate: n(r.purchasePrice) ? String(n(r.purchasePrice)) : "",
          discountPct: "",
        })),
      ]);
      toast.success(`Added ${todo.length} low-stock item${todo.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoadingLow(false);
    }
  }

  const update = (key: number, patch: Partial<PoLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const subtotal = round2(lines.reduce((s, l) => s + lineTaxable(l), 0));
  const discountTotal = round2(lines.reduce((s, l) => s + lineGross(l) - lineTaxable(l), 0));
  // Transport is taxed on its value before GST; an amount entered "Incl. GST" is brought back to it (same as the backend)
  const transportEntered = round2(Math.max(0, Number(transportCharges) || 0));
  const transport = transportInclusive ? round2(transportEntered / (1 + Number(transportGstRate) / 100)) : transportEntered;
  const other = round2(Math.max(0, Number(otherCharges) || 0));
  // Same as the backend: each item is taxed at its own GST rate, and each charge at its own rate (18% by default)
  const slabs = gstSlabs([
    ...lines.map((l) => ({ taxable: lineTaxable(l), gstRate: l.gstRate, tax: round2(lineAmount(l) - lineTaxable(l)) })),
    { taxable: transport, gstRate: Number(transportGstRate) },
    { taxable: other, gstRate: Number(otherChargesGstRate) },
  ]);
  const taxable = round2(subtotal + transport + other);
  const tax = round2(slabs.reduce((s, x) => s + x.tax, 0));
  // Charges count towards the PO value, and so towards the approval route
  const raw = round2(taxable + tax);
  // Whole rupees, as the backend saves it: up to .49 goes down, .50 and above goes up
  const total = Math.round(raw);
  const roundOff = round2(total - raw);
  const { data: vendorBranches } = useApi<VendorBranch[]>(vendor ? `/vendor-branches/vendor/${vendor.id}` : null);
  // An inactive branch already on this PO stays listed so it isn't silently dropped
  const branchChoices = [
    ...(vendorBranches ?? []),
    ...(po?.vendorBranch && po.vendorBranch.vendorId === vendor?.id && !vendorBranches?.some((b) => b.id === po.vendorBranch!.id) ? [po.vendorBranch] : []),
  ];
  const vendorBranchId = vendorBranchChoice ?? vendorBranches?.[0]?.id ?? "";
  const vendorBranch = branchChoices.find((b) => b.id === vendorBranchId) ?? null;
  // Same as the backend: the branch decides intra- or inter-state only with its own GSTIN, else the vendor
  const supplier = vendorBranch?.gstin ? vendorBranch : vendor;
  const igst = isInterState(supplier, store);
  const pos = placeOfSupply(supplier, store);
  const route = rules ? chainForValue(rules, total) : null;

  const hadApprovals = !!po && (po.level > 0 || po.status === "APPROVED");
  const resubmit = po?.status === "SENT_BACK";

  async function save(submit: boolean) {
    if (!vendor) return toast.error("Choose the vendor");
    if (!branchId) return toast.error("Choose the branch the goods are delivered to");
    if (!lines.length) return toast.error("Add at least one product");
    if (notSupplied.length) return toast.error(`${vendor.name} doesn't supply ${notSupplied.map((l) => l.name).join(", ")} — remove it or choose another vendor`);
    for (const l of lines) {
      if (!(Number(l.quantity) > 0)) return toast.error(`Enter a quantity for ${l.name}`);
      if (!(Number(l.rate) > 0)) return toast.error(`Enter the rate for ${l.name}`);
      const d = Number(l.discountPct || 0);
      if (!(d >= 0 && d <= 100)) return toast.error(`Discount on ${l.name} must be between 0 and 100%`);
    }
    if (!expectedDate) return toast.error("Choose the expected delivery date");
    if (!expectedLocked && expectedDate < orderDate) return toast.error("Expected delivery is before the invoice date");
    if (!expiryDays) return toast.error("Choose the expiry days");
    if (Number(transportCharges) < 0 || Number(otherCharges) < 0) return toast.error("Charges can't be negative");
    if (paymentTerm === "ADVANCE_PARTIAL" && !(Number(advanceAmount) > 0 && Number(advanceAmount) < total))
      return toast.error(`Enter the advance: more than ₹0 and less than the PO total of ${inr(total)}`);
    setSaving(submit ? "submit" : "draft");
    const body = {
      vendorId: vendor.id,
      vendorBranchId: vendorBranchId || null,
      branchId,
      orderDate,
      expectedDate: expectedDate || undefined,
      expiryDays: Number(expiryDays),
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        discountPct: clampPct(l.discountPct) || undefined,
      })),
      notes: notes.trim() || undefined,
      transportCharges: Number(transportCharges) || 0,
      transportGstRate: Number(transportGstRate),
      transportGstInclusive: transportInclusive,
      otherCharges: Number(otherCharges) || 0,
      otherChargesGstRate: Number(otherChargesGstRate),
      otherChargesNote: otherChargesNote.trim() || undefined,
      paymentTerm,
      advanceAmount: paymentTerm === "ADVANCE_PARTIAL" ? Number(advanceAmount) : undefined,
      submit,
    };
    try {
      const saved = po
        ? await api.put<PurchaseOrder>(`/purchase-orders/${po.id}`, body)
        : await api.post<PurchaseOrder>("/purchase-orders", body);
      toast.success(
        saved.status === "PENDING_APPROVAL"
          ? `${saved.poNo} saved and issued for approval${saved.round > 1 ? ` (round ${saved.round})` : ""}`
          : saved.status === "APPROVED"
            ? `${saved.poNo} saved — still approved`
            : `${saved.poNo} saved as draft`,
      );
      if (files.length) {
        await uploadAttachments("PO", saved.id, files).then(
          (done) => toast.success(`${done.length} file${done.length === 1 ? "" : "s"} attached to ${saved.poNo}`),
          (e) => toast.warn(`${saved.poNo} saved, but the files were not attached: ${errMsg(e)}. Add them from the PO page.`),
        );
      }
      // That number is used now: the next New PO form must fetch the following one
      clearApiCache("/purchase-orders/next-number");
      refresh();
      router.push(`/purchase-orders/${saved.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(null);
    }
  }

  if (preloading) return <Spinner page />;

  return (
    <>
      {hadApprovals && (
        <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This PO already has approvals. Changing items, rates or vendor restarts approval as round {(po?.round ?? 1) + 1}; earlier
            approvals stay in the history.
          </p>
        </div>
      )}
      {resubmit && (
        <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            This PO was sent back. Make the requested changes and submit it again — approval restarts from the first step as round{" "}
            {(po?.round ?? 1) + 1}.
          </p>
        </div>
      )}

      <Card className="mb-4">
        <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-slate-500">PO No.</span>
          <span className="font-mono font-semibold text-slate-900">{po ? po.poNo : (nextNo?.poNo ?? "…")}</span>
          {!po && <span className="text-xs text-slate-400">assigned when you save</span>}
        </p>
        <div className={cx("grid grid-cols-1 gap-3 sm:grid-cols-2", showBranch ? "lg:grid-cols-6" : "lg:grid-cols-5")}>
          <Field label="Vendor" required className="sm:col-span-2" as="div">
            <VendorPicker value={vendor} onChange={setVendor} autoFocus={!vendor} />
          </Field>
          {/* Past dates are allowed, e.g. to record an order already placed with the vendor */}
          <Field label="Invoice Date" required>
            <DateInput value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
          </Field>
          <Field label="Expected Delivery" required hint={expectedLocked ? "Fixed when the PO was created" : undefined}>
            {expectedLocked ? (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                <Lock className="size-3.5 text-slate-400" />
                {date(expectedDate)}
              </div>
            ) : (
              <DateInput
                value={expectedDate}
                min={orderDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className={cx(!expectedDate && "border-amber-400 bg-amber-50")}
                required
              />
            )}
          </Field>
          {showBranch && (
            <Field label="Deliver to Branch" required>
              <Select
                value={branchId}
                onChange={(e) => setBranchPick(e.target.value)}
                className={cx(!branchId && "border-amber-400 bg-amber-50")}
                disabled={branchesLoading && !branchOptions.length}
              >
                <option value="">{branchesLoading && !branchOptions.length ? "Loading Branches…" : "Choose Branch…"}</option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
                {/* Keep an inactive or out-of-scope branch the PO already points to */}
                {branchId && !branchOptions.some((b) => b.id === branchId) && (
                  <option value={branchId}>{po?.branch ? `${po.branch.name} (${po.branch.code})` : branchId}</option>
                )}
              </Select>
            </Field>
          )}
          <Field label="Expiry Days" required>
            <Select value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className={cx(!expiryDays && "border-amber-400 bg-amber-50")}>
              <option value="">Choose…</option>
              {PO_EXPIRY_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} Days
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {vendor && branchChoices.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Buying From" hint="Which of the vendor's branches supplies this order">
              <Select value={vendorBranchId} onChange={(e) => setVendorBranchId(e.target.value)} aria-label="Vendor branch">
                <option value="">Main address ({vendor.city || vendor.state || "head office"})</option>
                {branchChoices.map((b, i) => (
                  <option key={b.id} value={b.id}>
                    {branchLabel(b)}
                    {i === 0 && b.isActive ? " · Primary" : ""}
                    {b.city ? ` · ${b.city}` : ""}
                    {!b.isActive ? " (inactive)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {vendorBranch && (
              <p className="self-end pb-2 text-xs text-slate-600 lg:col-span-2">
                {branchAddress(vendorBranch) || "Address not recorded"}
                {vendorBranch.contactPerson && ` · ${vendorBranch.contactPerson}`}
                {vendorBranch.phone && ` · ${vendorBranch.phone}`}
              </p>
            )}
          </div>
        )}
        {vendor && (
          <p className="mt-2 text-xs text-slate-500">
            {supplier?.gstin ? `GSTIN ${supplier.gstin}${vendorBranch?.gstin ? " (branch)" : ""}` : "Vendor GSTIN not recorded"} · Place of supply:{" "}
            <b className="font-medium text-slate-700">{pos.name ?? "state not recorded"}</b>
            {pos.taxType && ` · ${pos.interState ? "inter-state supply (IGST)" : "intra-state supply (CGST + SGST)"}`}
          </p>
        )}
      </Card>

      <Card
        className="mb-4"
        bodyClassName="p-0"
        title={`Items${lines.length ? ` (${lines.length})` : ""}`}
        actions={
          can("inventory.view") && (
            <Button variant="add" size="sm" icon={<ListPlus className="size-4" />} onClick={addLowStock} loading={loadingLow} disabled={!supplied}>
              Add Low-Stock Items
            </Button>
          )
        }
      >
        <div className="border-b border-slate-100 p-3">
          {!vendor ? (
            <p className="flex h-9 items-center rounded-lg border border-dashed border-slate-300 px-3 text-sm text-slate-500">
              Choose the vendor first — the item list shows only the products that vendor supplies
            </p>
          ) : (
            // Remounted per vendor so a search typed for one vendor isn't kept for the next
            <ProductPicker key={vendor.id} vendorId={vendor.id} onPick={addProduct} placeholder={`Search products ${vendor.name} supplies…`} />
          )}
          {vendor && supplied && supplied.size === 0 && !vendorProductsLoading && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No products are linked to {vendor.name} yet.{" "}
                {can("vendors.edit") ? (
                  <Link href={`/vendors/${vendor.id}`} className="font-medium underline">
                    Link the products they supply
                  </Link>
                ) : (
                  "Ask someone who can edit vendors to link the products they supply"
                )}{" "}
                to raise a PO for them.
              </span>
            </p>
          )}
        </div>
        {/* Phones: one card per line so qty / rate / discount and remove are reachable without scrolling sideways */}
        <ul className="divide-y divide-slate-100 sm:hidden">
          {!lines.length ? (
            <li className="px-3 py-10 text-center text-sm text-slate-400">
              <PackagePlus className="mx-auto mb-2 size-7 text-slate-300" />
              Search above to add products, or add everything that&apos;s below its reorder level
            </li>
          ) : (
            lines.map((l) => (
              <li key={l.key} className="space-y-2 px-3 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-slate-900">{l.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-medium text-slate-800">{l.sku}</span>
                      <span className={cx(l.stock !== undefined && l.stock <= 0 && "text-red-600")}>
                        In stock {l.stock === undefined ? "—" : qty(l.stock)}
                      </span>
                      {l.packSize && <span>Pack {l.packSize}</span>}
                      <span>GST {l.gstRate}%</span>
                    </p>
                    {supplied && !supplied.has(l.productId) && (
                      <p className="text-[11px] font-medium text-red-600">Not supplied by {vendor?.name ?? "this vendor"} — remove it</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="-mr-1 shrink-0 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove ${l.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label={`Qty (${l.unit})`}>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      className="num text-right"
                      value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Rate (Excl.)">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="num text-right"
                      value={l.rate}
                      onChange={(e) => update(l.key, { rate: e.target.value })}
                    />
                  </Field>
                  <Field label="Disc. %">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      inputMode="decimal"
                      placeholder="0"
                      className={cx("num text-right", Number(l.discountPct) > 100 && "border-red-400")}
                      value={l.discountPct}
                      onChange={(e) => update(l.key, { discountPct: e.target.value })}
                    />
                  </Field>
                </div>
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-xs text-brand-700">
                    {clampPct(l.discountPct) > 0 && `−${inr(round2(lineGross(l) - lineTaxable(l)))} discount`}
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="text-xs text-slate-500">Incl. GST </span>
                    <span className="num font-medium text-slate-900">{inr(lineAmount(l))}</span>
                  </span>
                </p>
              </li>
            ))
          )}
        </ul>
        <Table stack={false} className="hidden sm:block">
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>SKU Code</Th>
              <Th right>In Stock</Th>
              <Th>Pack Size</Th>
              <Th right>Qty</Th>
              <Th>UOM</Th>
              <Th right>Rate (Excl. GST)</Th>
              <Th right>Disc. %</Th>
              <Th right>GST</Th>
              <Th right>Amount (Incl. GST)</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!lines.length ? (
              <tr>
                <td colSpan={11} className="px-3 py-12 text-center text-sm text-slate-400">
                  <PackagePlus className="mx-auto mb-2 size-7 text-slate-300" />
                  Search above to add products, or add everything that&apos;s below its reorder level
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.key}>
                  <Td className="min-w-44 sm:min-w-56">
                    <p className="font-medium text-slate-900">{l.name}</p>
                    {supplied && !supplied.has(l.productId) && (
                      <p className="text-[11px] font-medium text-red-600">Not supplied by {vendor?.name ?? "this vendor"} — remove it</p>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-800">{l.sku}</span>
                  </Td>
                  <Td right className={cx("whitespace-nowrap text-slate-500", l.stock !== undefined && l.stock <= 0 && "text-red-600")}>
                    {l.stock === undefined ? "—" : qty(l.stock)}
                  </Td>
                  {/* From the product, not editable here */}
                  <Td className="whitespace-nowrap text-slate-600">{l.packSize || <span className="text-slate-300">—</span>}</Td>
                  <Td right>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      className="num ml-auto h-8 w-24 text-right"
                      value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: e.target.value })}
                      aria-label={`Quantity of ${l.name}`}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{l.unit}</Td>
                  <Td right>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="num ml-auto h-8 w-28 text-right"
                      value={l.rate}
                      onChange={(e) => update(l.key, { rate: e.target.value })}
                      aria-label={`Rate of ${l.name}`}
                    />
                  </Td>
                  <Td right>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      className={cx("num ml-auto h-8 w-20 text-right", Number(l.discountPct) > 100 && "border-red-400")}
                      value={l.discountPct}
                      onChange={(e) => update(l.key, { discountPct: e.target.value })}
                      aria-label={`Discount % on ${l.name}`}
                    />
                    {clampPct(l.discountPct) > 0 && (
                      <span className="mt-0.5 block text-[11px] text-brand-700">−{inr(round2(lineGross(l) - lineTaxable(l)))}</span>
                    )}
                  </Td>
                  <Td right className="text-slate-500">
                    {l.gstRate}%
                  </Td>
                  <Td right className="whitespace-nowrap font-medium text-slate-900">
                    {inr(lineAmount(l))}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1"
                      aria-label={`Remove ${l.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <PoPriceHistory
        lines={lines}
        vendorId={vendor?.id}
        excludePoId={po?.id}
        onUseRate={(productId, rate) => setLines((ls) => ls.map((x) => (x.productId === productId ? { ...x, rate: String(rate) } : x)))}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title={
              <span className="inline-flex items-center gap-1.5">
                <Route className="size-4 text-slate-400" /> Approval Route for This Value
              </span>
            }
          >
            {rulesError ? (
              <p className="text-sm text-red-600">{rulesError}</p>
            ) : !route ? (
              <p className="text-sm text-slate-400">Loading approval rules…</p>
            ) : (
              <>
                <ol className="flex flex-wrap items-stretch gap-2">
                  {route.steps.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-2">
                      {i > 0 && <span className="text-slate-300">›</span>}
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                        <p className="text-xs text-slate-500">Step {i + 1}</p>
                        <p className="text-sm font-medium text-slate-800">{s.title}</p>
                        <p className="text-xs text-slate-500">{s.approverName}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-slate-500">
                  {route.band?.upTo != null
                    ? `POs up to ${inr0(route.band.upTo)} need ${route.steps.length} approval${route.steps.length === 1 ? "" : "s"}.`
                    : `POs of this value need ${route.steps.length} approval${route.steps.length === 1 ? "" : "s"}.`}{" "}
                  The route is worked out again from the final value when you submit.
                </p>
              </>
            )}
          </Card>
          <Card title="Payment Terms">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="When Is the Vendor Paid?" required hint={PO_PAYMENT_TERMS.find((t) => t.value === paymentTerm)?.hint}>
                <Select value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value as PoPaymentTerm)}>
                  {PO_PAYMENT_TERMS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {paymentTerm === "ADVANCE_PARTIAL" ? (
                <Field
                  label="Advance Amount (₹)"
                  required
                  hint={Number(advanceAmount) > 0 && Number(advanceAmount) < total ? `Balance ${inr(total - Number(advanceAmount))} after the GRN` : `Less than the PO total of ${inr(total)}`}
                >
                  <Input type="number" min="0" step="0.01" className="num" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="e.g. 50000" />
                </Field>
              ) : paymentTerm === "ADVANCE_FULL" ? (
                <p className="self-end pb-2 text-sm text-slate-600">
                  Advance: <span className="num font-medium text-slate-900">{inr(total)}</span> (the full PO total)
                </p>
              ) : null}
            </div>
          </Card>
          <Card title="Notes to Approver">
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this order, scheme / discount agreed, delivery instructions…"
            />
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
            >
              <FileText className="size-4" />
              Terms & Conditions
              <span className="text-red-500">*</span>
            </button>
            <LazyPoTermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
          </Card>
          {po ? (
            <Attachments type="PO" entityId={po.id} canManage />
          ) : (
            <Card title="Attachments">
              <PendingFiles files={files} onChange={setFiles} />
            </Card>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <dl className="space-y-1.5 text-sm">
            {discountTotal > 0 && <TotalRow label="Gross Value" value={inr(round2(subtotal + discountTotal))} />}
            {discountTotal > 0 && <TotalRow label="Discount" value={`−${inr(discountTotal)}`} />}
            <TotalRow label="Items Value" value={inr(subtotal)} />
            {/* Charges come before GST: each is taxed at its own rate (18% by default) */}
            <div className="space-y-2 border-y border-dashed border-slate-200 py-2">
              <ChargeInput
                label="Transportation"
                value={transportCharges}
                onChange={setTransportCharges}
                gstRate={transportGstRate}
                onGstRate={setTransportGstRate}
                inclusive={transportInclusive}
                onInclusive={setTransportInclusive}
              />
              {transportInclusive && transportEntered > 0 && (
                <p className="text-right text-[11px] text-slate-500">
                  {inr(transportEntered)} incl. GST = {inr(transport)} + GST {inr(round2(transportEntered - transport))}
                </p>
              )}
              <ChargeInput
                label="Other Charges (Excl. GST)"
                value={otherCharges}
                onChange={setOtherCharges}
                gstRate={otherChargesGstRate}
                onGstRate={setOtherChargesGstRate}
              />
              {Number(otherCharges) > 0 && (
                <Input
                  value={otherChargesNote}
                  onChange={(e) => setOtherChargesNote(e.target.value)}
                  placeholder="What for? e.g. loading, packing"
                  className="h-8 text-xs"
                  aria-label="Other charges description"
                />
              )}
            </div>
            <TotalRow label="Taxable Value" value={inr(taxable)} />
            {/* Rate-wise GST: items at their own rates, charges at theirs */}
            {slabs.map((x) =>
              igst ? (
                <TotalRow key={x.rate} label={`IGST ${x.rate}% on ${inr(x.taxable)}`} value={inr(x.tax)} />
              ) : (
                <div key={x.rate} className="space-y-1.5">
                  <TotalRow label={`CGST ${halfRate(x.rate)} on ${inr(x.taxable)}`} value={inr(round2(x.tax / 2))} />
                  <TotalRow label={`SGST ${halfRate(x.rate)} on ${inr(x.taxable)}`} value={inr(round2(x.tax - round2(x.tax / 2)))} />
                </div>
              ),
            )}
            {slabs.length > 1 && <TotalRow label="Total GST" value={inr(tax)} />}
            {roundOff !== 0 && <TotalRow label="Round Off" value={`${roundOff > 0 ? "+" : "−"}${inr(Math.abs(roundOff))}`} />}
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">PO Total</dt>
              <dd className="num text-xl font-semibold text-slate-900">{inr(total)}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2">
            <Button
              className="w-full"
              icon={<Send className="size-4" />}
              onClick={() => save(true)}
              loading={saving === "submit"}
              disabled={!vendor || !lines.length || !!saving}
            >
              Save and Issue
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              icon={<Save className="size-4" />}
              onClick={() => save(false)}
              loading={saving === "draft"}
              disabled={!vendor || !lines.length || !!saving}
            >
              Save as Draft
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {editing && po?.status === "APPROVED"
              ? "Saving a changed PO as draft takes it out of the approved list until it is submitted again."
              : "Save and Issue sends the PO for approval; once approved it is issued to the vendor. Drafts are not sent to anyone."}
          </p>
        </Card>
      </div>
    </>
  );
}

/** Amount box for a PO charge, laid out like a total row */
function ChargeInput({
  label,
  value,
  onChange,
  gstRate,
  onGstRate,
  inclusive,
  onInclusive,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  gstRate: string;
  onGstRate: (v: string) => void;
  /** When given, a GST type choice is shown: the amount is before GST (exclusive) or already includes it (inclusive) */
  inclusive?: boolean;
  onInclusive?: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="ml-auto flex min-w-0 items-center gap-1.5 max-sm:w-full max-sm:justify-end">
        <Select value={gstRate} onChange={(e) => onGstRate(e.target.value)} className="h-8 w-20 text-xs" aria-label={`GST on ${label}`} title="GST %">
          {GST_RATES.map((r) => (
            <option key={r} value={r}>
              {r}%
            </option>
          ))}
        </Select>
        {onInclusive && (
          <Select
            value={inclusive ? "INCL" : "EXCL"}
            onChange={(e) => onInclusive(e.target.value === "INCL")}
            className="h-8 w-28 text-xs"
            aria-label={`GST type on ${label}`}
            title="Is GST already included in the amount?"
          >
            <option value="EXCL">Excl. GST</option>
            <option value="INCL">Incl. GST</option>
          </Select>
        )}
        <Input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="num h-8 w-28 min-w-0 text-right max-sm:flex-1"
          aria-label={label}
        />
      </dd>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="min-w-0 text-slate-500">{label}</dt>
      <dd className="num shrink-0 text-slate-800">{value}</dd>
    </div>
  );
}
