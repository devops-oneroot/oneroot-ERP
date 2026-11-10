"use client";

import { date, dateTime, inr, n, qty } from "@/lib/format";
import type { Sale, StoreSettings } from "@/lib/types";
import { modeLabel } from "@/lib/types";
import { letterhead } from "@/lib/letterhead";
import { PrintLogo } from "./ui";

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  batchNo?: string | null;
  expiryDate?: string | null;
  gstRate: number;
}

export interface ReceiptData {
  invoiceNo: string;
  date: string;
  customerName?: string | null;
  customerPhone?: string | null;
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
  return {
    invoiceNo: sale.invoiceNo,
    date: sale.saleDate,
    customerName: sale.customer?.name ?? sale.customerName,
    customerPhone: sale.customer?.phone ?? sale.customerPhone,
    lines: (sale.items ?? []).map((i) => ({
      name: i.isFree ? `${i.productName} (free)` : i.productName,
      qty: n(i.quantity),
      unit: i.unit,
      rate: n(i.rate),
      amount: n(i.amount),
      batchNo: i.batchNo,
      expiryDate: i.expiryDate,
      gstRate: n(i.gstRate),
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

const Row = ({ l, r, bold, big }: { l: string; r: string; bold?: boolean; big?: boolean }) => (
  <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""} ${big ? "text-[13px]" : ""}`}>
    <span>{l}</span>
    <span className="num whitespace-nowrap">{r}</span>
  </div>
);

/**
 * 80 mm / 58 mm thermal receipt. Hidden on screen; shown when printing in receipt mode (lib/print.ts).
 * Wrap it in a `.thermal-host` element on the page.
 */
export function ThermalReceipt({ data, settings, width = 80 }: { data: ReceiptData; settings: StoreSettings | null; width?: 58 | 80 }) {
  const d = data;
  const due = Math.max(0, d.total - d.paid);
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of d.lines) {
    const taxable = l.amount / (1 + l.gstRate / 100);
    const cur = byRate.get(l.gstRate) ?? { taxable: 0, tax: 0 };
    cur.taxable += taxable;
    cur.tax += l.amount - taxable;
    byRate.set(l.gstRate, cur);
  }
  const gross = d.lines.reduce((s, l) => s + l.amount, 0);
  const narrow = width === 58;
  return (
    <div
      className={`paper thermal-area thermal-${width} bg-surface text-black`}
      style={{ width: narrow ? "48mm" : "72mm", fontFamily: "ui-monospace, Consolas, 'Courier New', monospace", fontSize: narrow ? "9.5px" : "11px", lineHeight: 1.25 }}
    >
      <div className="text-center">
        <PrintLogo
          className="mb-1"
          imageClassName={narrow ? "h-auto w-[22mm]" : "h-auto w-[28mm]"}
        />
        <p className="text-[13px] font-bold uppercase">{settings?.storeName ?? "OneRoot Agri Inputs"}</p>
        {(() => {
          // Every branch address (head office, warehouse, mall); without branch data, the store address as before
          const addresses = letterhead(settings);
          if (!addresses.length) return settings?.address ? <p>{[settings.address, settings.city].filter(Boolean).join(", ")}</p> : null;
          return addresses.map((a) => (
            <p key={a.branchId ?? a.label} className="mt-0.5 text-[9px] leading-tight">
              <b>
                {a.label}
                {d.branchId && a.branchId === d.branchId ? " (billed here)" : ""}:
              </b>{" "}
              {a.address}
            </p>
          ));
        })()}
        {settings?.phone && <p>Ph: {settings.phone}</p>}
        {settings?.gstin && <p>GSTIN: {settings.gstin}</p>}
        {[settings?.fertilizerLicenseNo && `FL ${settings.fertilizerLicenseNo}`, settings?.pesticideLicenseNo && `PL ${settings.pesticideLicenseNo}`, settings?.seedLicenseNo && `SL ${settings.seedLicenseNo}`]
          .filter(Boolean)
          .join(" · ") && (
          <p className="text-[9px]">
            {[settings?.fertilizerLicenseNo && `FL ${settings.fertilizerLicenseNo}`, settings?.pesticideLicenseNo && `PL ${settings.pesticideLicenseNo}`, settings?.seedLicenseNo && `SL ${settings.seedLicenseNo}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p className="mt-1 font-bold">{d.cancelled ? "CANCELLED" : d.provisional ? "PROVISIONAL BILL" : "TAX INVOICE"}</p>
      </div>
      <div className="my-1 border-t border-dashed border-black" />
      <Row l={d.provisional ? "Ref" : "Bill No"} r={d.invoiceNo} />
      <Row l="Date" r={dateTime(d.date)} />
      {(d.customerName || d.customerPhone) && <Row l="Customer" r={[d.customerName, d.customerPhone].filter(Boolean).join(" ")} />}
      {d.govtReceiptNo && <Row l="Govt POS Rcpt" r={d.govtReceiptNo} />}
      <div className="my-1 border-t border-dashed border-black" />
      {d.lines.map((l, i) => (
        <div key={i} className="mb-0.5">
          <p className="font-semibold">{l.name}</p>
          <div className="flex justify-between gap-2">
            <span>
              {qty(l.qty)} {l.unit} × {inr(l.rate)}
              {l.batchNo ? ` · ${l.batchNo}` : ""}
              {l.expiryDate ? ` · exp ${date(l.expiryDate)}` : ""}
            </span>
            <span className="num whitespace-nowrap">{inr(l.amount)}</span>
          </div>
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-black" />
      {d.discount > 0 && (
        <>
          <Row l="Items" r={inr(gross + d.discount)} />
          <Row l="Discount" r={`- ${inr(d.discount)}`} />
        </>
      )}
      <Row l="Taxable" r={inr(d.taxable)} />
      {d.isInterState ? <Row l="IGST" r={inr(d.tax)} /> : (
        <>
          <Row l="CGST" r={inr(d.tax / 2)} />
          <Row l="SGST" r={inr(d.tax / 2)} />
        </>
      )}
      {d.roundOff !== 0 && <Row l="Round Off" r={inr(d.roundOff)} />}
      <div className="my-1 border-t border-black" />
      <Row l="TOTAL" r={inr(d.total)} bold big />
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
      {byRate.size > 0 && (
        <>
          <div className="my-1 border-t border-dashed border-black" />
          <p className="text-[9px]">GST summary</p>
          {[...byRate.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([r, v]) => (
              <div key={r} className="flex justify-between text-[9px]">
                <span>{r}% on {inr(v.taxable)}</span>
                <span className="num">{inr(v.tax)}</span>
              </div>
            ))}
        </>
      )}
      {d.notes && <p className="mt-1 text-[9.5px]">Note: {d.notes}</p>}
      <div className="my-1 border-t border-dashed border-black" />
      <p className="whitespace-pre-line text-center text-[9.5px]">{settings?.invoiceFooter ?? "Thank you for your business!"}</p>
      {d.provisional && <p className="mt-1 text-center text-[9px]">Made offline — the final invoice number will be issued when the device reconnects.</p>}
      <p className="mt-1 text-center text-[9px]">* This is a system-generated bill and does not require a signature.</p>
      <p className="mt-1 text-center text-[9px]">OneRoot ERP</p>
    </div>
  );
}
