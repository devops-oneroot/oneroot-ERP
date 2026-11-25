"use client";

import { amountInWords, date, dateTime, inr, n, qty, round2 } from "@/lib/format";
import { placeOfSupply } from "@/lib/gst";
import type { Sale, StoreSettings } from "@/lib/types";
import { modeLabel } from "@/lib/types";
import { letterhead } from "@/lib/letterhead";
import { PrintLogo, THERMAL_LOGO, THERMAL_LOGO_SRC, cx } from "./ui";

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  batchNo?: string | null;
  expiryDate?: string | null;
  gstRate: number;
  hsnCode?: string | null;
  /** Taxable value (before GST); worked out from the amount when not given */
  taxable?: number;
}

export interface ReceiptData {
  invoiceNo: string;
  date: string;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Registered customer: GSTIN and billing address (both print on a tax invoice) */
  customerGstin?: string | null;
  customerAddress?: string | null;
  customerState?: string | null;
  lines: ReceiptLine[];
  taxable: number;
  discount: number;
  tax: number;
  isInterState: boolean;
  roundOff: number;
  total: number;
  paid: number;
  paymentMode: string;
  /** Split payments (cash + UPI, credit note + cash…) */
  payments?: { mode: string; amount: number; reference?: string | null }[];
  notes?: string | null;
  /** Government fertiliser POS receipt (subsidised lines) */
  govtReceiptNo?: string | null;
  /** Bill made offline and not yet numbered by the server */
  provisional?: boolean;
  /** Branch that made the bill (marked among the addresses) */
  branchId?: string | null;
  cancelled?: boolean;
}

export function receiptFromSale(sale: Sale): ReceiptData {
  const c = sale.customer;
  return {
    invoiceNo: sale.invoiceNo,
    date: sale.saleDate,
    customerName: c?.name ?? sale.customerName,
    customerPhone: c?.phone ?? sale.customerPhone,
    customerGstin: c?.gstin ?? null,
    customerAddress: c ? [c.village, c.address, c.city, c.pincode].filter(Boolean).join(", ") || null : null,
    customerState: c?.state ?? null,
    lines: (sale.items ?? []).map((i) => ({
      name: i.isFree ? `${i.productName} (free)` : i.productName,
      qty: n(i.quantity),
      unit: i.unit,
      rate: n(i.rate),
      amount: n(i.amount),
      batchNo: i.batchNo,
      expiryDate: i.expiryDate,
      gstRate: n(i.gstRate),
      hsnCode: i.hsnCode ?? null,
      taxable: n(i.taxableAmount),
    })),
    taxable: n(sale.subtotal),
    discount: n(sale.discount),
    tax: n(sale.taxAmount),
    isInterState: sale.isInterState,
    roundOff: n(sale.roundOff),
    total: n(sale.totalAmount),
    paid: n(sale.paidAmount),
    paymentMode: modeLabel(sale.paymentMode),
    payments: (sale.payments ?? []).map((p) => ({ mode: modeLabel(p.mode), amount: n(p.amount), reference: p.reference })),
    notes: sale.notes,
    govtReceiptNo: sale.govtReceiptNo ?? null,
    cancelled: sale.status === "CANCELLED",
    branchId: sale.branchId ?? null,
  };
}

/** Label on the left, value on the right; a long label wraps instead of pushing the value off the paper */
const Row = ({ l, r, bold, big }: { l: string; r: string; bold?: boolean; big?: boolean }) => (
  <div className={cx("flex items-start justify-between gap-2", bold && "font-bold", big && "text-[13px]")}>
    <span className="min-w-0 break-words">{l}</span>
    <span className="num shrink-0 whitespace-nowrap text-right">{r}</span>
  </div>
);

const Rule = ({ solid }: { solid?: boolean }) => <div className={cx("my-1 border-t border-black", !solid && "border-dashed")} />;

/** Half a GST rate for CGST / SGST, e.g. 5 → "2.5" */
const half = (rate: number) => String(Math.round((rate / 2) * 100) / 100);

/**
 * GST tax invoice for 80 mm / 58 mm receipt printers (laid out for the Essae PR-55: 80 mm paper, 72 mm printable).
 * lib/print.ts makes the page the printable width (not the paper width) and the receipt's own length, so nothing is
 * cut at the right edge and the auto-cutter cuts only once, at the end. Every line wraps inside the width.
 * Hidden on screen; shown when printing in receipt mode. Wrap it in a `.thermal-host` element on the page.
 */
export function ThermalReceipt({ data, settings, width = 80 }: { data: ReceiptData; settings: StoreSettings | null; width?: 58 | 80 }) {
  const d = data;
  const narrow = width === 58;
  const due = Math.max(0, round2(d.total - d.paid));
  const lineTaxable = (l: ReceiptLine) => (l.taxable != null && l.taxable > 0 ? l.taxable : l.amount / (1 + l.gstRate / 100));
  // GST by rate, from each line's taxable value
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of d.lines) {
    const taxable = lineTaxable(l);
    const cur = byRate.get(l.gstRate) ?? { taxable: 0, tax: 0 };
    cur.taxable += taxable;
    cur.tax += l.amount - taxable;
    byRate.set(l.gstRate, cur);
  }
  const rates = [...byRate.entries()].filter(([, v]) => v.taxable > 0).sort((a, b) => a[0] - b[0]);
  const gross = d.lines.reduce((s, l) => s + l.amount, 0);
  const totalQty = d.lines.reduce((s, l) => s + l.qty, 0);
  const pos = placeOfSupply(
    d.customerGstin || d.customerState ? { gstin: d.customerGstin, state: d.customerState } : null,
    settings,
  );
  // Place of supply: the customer's state when known, else the store's (a counter sale is supplied where it is made)
  const posText = pos.name ? `${pos.name}${pos.code ? ` (${pos.code})` : ""}` : settings?.state || "—";
  const licences = [
    settings?.fertilizerLicenseNo && `FL ${settings.fertilizerLicenseNo}`,
    settings?.pesticideLicenseNo && `PL ${settings.pesticideLicenseNo}`,
    settings?.seedLicenseNo && `SL ${settings.seedLicenseNo}`,
  ].filter(Boolean);
  const addresses = letterhead(settings);

  return (
    <div
      className={`paper thermal-area thermal-${width} bg-surface text-black`}
      style={{
        // The page is the printer's print width (72 mm on 80 mm paper, 48 mm on 58 mm — lib/print.ts); the content is
        // 4 mm / 3 mm narrower so a driver that shifts the page a little still prints every character
        width: narrow ? "45mm" : "68mm",
        boxSizing: "border-box",
        overflowWrap: "anywhere",
        fontFamily: "ui-monospace, Consolas, 'Courier New', monospace",
        fontSize: narrow ? "9px" : "10.5px",
        lineHeight: 1.25,
        color: "#000",
      }}
    >
      <div className="text-center">
        <PrintLogo src={THERMAL_LOGO_SRC} className="mb-1" imageClassName={cx(narrow ? "h-auto w-[34mm]" : "h-auto w-[46mm]", THERMAL_LOGO)} />
        <p className={cx("font-bold uppercase", narrow ? "text-[11px]" : "text-[13px]")}>{settings?.storeName ?? "OneRoot Agri Inputs"}</p>
        {addresses.length
          ? addresses.map((a) => (
              <p key={a.branchId ?? a.label} className="mt-0.5 text-[9px] leading-tight">
                <b>
                  {a.label}
                  {d.branchId && a.branchId === d.branchId ? " (billed here)" : ""}:
                </b>{" "}
                {a.address}
              </p>
            ))
          : settings?.address && <p>{[settings.address, settings.city].filter(Boolean).join(", ")}</p>}
        {settings?.phone && <p>Ph: {settings.phone}</p>}
        {settings?.gstin && <p className="font-bold">GSTIN: {settings.gstin}</p>}
        {licences.length > 0 && <p className="text-[9px]">{licences.join(" · ")}</p>}
        <p className="mt-1 text-[12px] font-bold">{d.cancelled ? "CANCELLED" : d.provisional ? "PROVISIONAL BILL" : "TAX INVOICE"}</p>
      </div>

      <Rule />
      <Row l={d.provisional ? "Ref" : "Invoice No"} r={d.invoiceNo} />
      <Row l="Date" r={dateTime(d.date)} />
      <Row l="Place of Supply" r={posText} />
      {d.govtReceiptNo && <Row l="Govt POS Rcpt" r={d.govtReceiptNo} />}

      {(d.customerName || d.customerPhone || d.customerGstin) && (
        <>
          <Rule />
          <p className="font-bold">Bill To</p>
          {d.customerName && <p>{d.customerName}</p>}
          {d.customerPhone && <p>Ph: {d.customerPhone}</p>}
          {d.customerAddress && <p className="text-[9.5px]">{d.customerAddress}</p>}
          {d.customerGstin && <p className="font-bold">GSTIN: {d.customerGstin}</p>}
        </>
      )}

      <Rule />
      {/* Column heads for the figures line under each item */}
      <div className="flex justify-between text-[9px] font-bold">
        <span>Item / HSN / GST</span>
        <span>Qty x Rate = Amount</span>
      </div>
      <Rule />
      {d.lines.map((l, i) => (
        <div key={i} className="mb-1">
          <p className="font-semibold">
            {i + 1}. {l.name}
          </p>
          <p className="text-[9.5px]">
            {[l.hsnCode && `HSN ${l.hsnCode}`, `GST ${l.gstRate}%`, l.batchNo && `B ${l.batchNo}`, l.expiryDate && `Exp ${date(l.expiryDate)}`].filter(Boolean).join(" · ")}
          </p>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              {qty(l.qty)} {l.unit} x {inr(l.rate)}
            </span>
            <span className="num shrink-0 whitespace-nowrap">{inr(l.amount)}</span>
          </div>
        </div>
      ))}
      <Rule />
      <Row l={`Items ${d.lines.length} · Qty ${qty(totalQty)}`} r={inr(gross + d.discount)} />
      {d.discount > 0 && <Row l="Discount" r={`- ${inr(d.discount)}`} />}
      <Row l="Taxable Value" r={inr(d.taxable)} />
      {d.isInterState ? (
        <Row l="IGST" r={inr(d.tax)} />
      ) : (
        <>
          <Row l="CGST" r={inr(d.tax / 2)} />
          <Row l="SGST" r={inr(d.tax / 2)} />
        </>
      )}
      {d.roundOff !== 0 && <Row l="Round Off" r={inr(d.roundOff)} />}
      <Rule solid />
      <Row l="TOTAL" r={inr(d.total)} bold big />
      <Rule solid />
      <p className="text-[9.5px]">{amountInWords(d.total)}</p>

      {d.payments && d.payments.length > 1 ? (
        <>
          <Row l="Paid" r={inr(d.paid)} />
          {d.payments.map((p, i) => (
            <Row key={i} l={`  ${p.mode}${p.reference ? ` ${p.reference}` : ""}`} r={inr(p.amount)} />
          ))}
        </>
      ) : (
        <Row l={`Paid (${d.payments?.[0]?.mode ?? d.paymentMode})`} r={inr(d.paid)} />
      )}
      {due > 0 && <Row l="Balance Due" r={inr(due)} bold />}

      {rates.length > 0 && (
        <>
          <Rule />
          <p className="text-[9px] font-bold">GST Summary</p>
          {/* Taxable value and the tax on it per rate; CGST and SGST are each half */}
          {rates.map(([r, v]) => (
            <div key={r} className="text-[9px]">
              <div className="flex justify-between gap-2">
                <span>
                  GST {r}% on {inr(v.taxable)}
                </span>
                <span className="num shrink-0">{inr(v.tax)}</span>
              </div>
              {!d.isInterState && r > 0 && (
                <div className="flex justify-between gap-2 pl-2">
                  <span>
                    CGST {half(r)}% + SGST {half(r)}%
                  </span>
                  <span className="num shrink-0">
                    {inr(v.tax / 2)} + {inr(v.tax / 2)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {d.notes && <p className="mt-1 text-[9.5px]">Note: {d.notes}</p>}
      <Rule />
      <p className="whitespace-pre-line text-center text-[9.5px]">{settings?.invoiceFooter ?? "Thank you for your business!"}</p>
      <p className="mt-1 text-center text-[9px]">Goods once sold will be taken back only as per store policy. Subject to Bangalore jurisdiction.</p>
      {d.provisional && <p className="mt-1 text-center text-[9px]">Made offline — the final invoice number will be issued when the device reconnects.</p>}
      <p className="mt-1 text-center text-[9px]">* This is a system-generated invoice and does not require a signature.</p>
      <p className="mt-1 text-center text-[9px]">OneRoot ERP</p>
    </div>
  );
}
