"use client";

import { amountInWords, dateTime, date, inr, n, qty, round2 } from "@/lib/format";
import { modeLabel, type AdvanceBooking, type Payment, type StoreSettings } from "@/lib/types";
import { PrintHeader, PrintLogo, SystemGeneratedNote } from "./ui";

/** Booking payments that get a printed receipt: advance taken (IN) and refunds (OUT); adjustments print on the bill */
export const isReceiptPayment = (p: Payment) => p.mode !== "ADVANCE";

/** The booking's advance position right after this payment (payments are in date order) */
function positionAfter(b: AdvanceBooking, paymentId: string) {
  let received = 0;
  let used = 0;
  let refunded = 0;
  for (const p of b.payments ?? []) {
    const amt = n(p.amount);
    if (p.mode === "ADVANCE") used += amt;
    else if (p.direction === "OUT") refunded += amt;
    else received += amt;
    if (p.id === paymentId) break;
  }
  return { received: round2(received), used: round2(used), refunded: round2(refunded), held: round2(received - used - refunded) };
}

interface ReceiptProps {
  booking: AdvanceBooking;
  /** A payment from the booking detail (it carries who took it) */
  payment: Payment & { user?: { name: string } | null };
  store: StoreSettings | null;
}

/** A4 advance receipt / refund voucher, printed on its own (PrintPortal "sheet-host", lib/print printAs("sheet")) */
export function AdvanceReceiptSheet({ booking: b, payment: p, store }: ReceiptProps) {
  const refund = p.direction === "OUT";
  const pos = positionAfter(b, p.id);
  const amount = n(p.amount);
  return (
    <div className="paper advance-print hidden text-[12px] leading-[1.5] text-slate-800 [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:block" style={{ padding: "12mm 14mm" }}>
      <PrintHeader
        store={store}
        title={refund ? "Advance Refund" : "Advance Receipt"}
        number={p.paymentNo}
        details={store?.phone ? <p className="text-[10.5px] text-slate-500">Phone: {store.phone}</p> : undefined}
      />

      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{refund ? "Paid To" : "Received From"}</p>
          <p className="text-[14px] font-bold text-slate-900">{b.customer.name}</p>
          {(b.customer.phone || b.customer.village) && <p>{[b.customer.phone, b.customer.village].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="text-right">
          <p>
            <span className="text-slate-500">Date: </span>
            {dateTime(p.paymentDate)}
          </p>
          <p>
            <span className="text-slate-500">Booking No: </span>
            <b>{b.bookingNo}</b> ({date(b.bookingDate)})
          </p>
          {b.expectedDate && (
            <p>
              <span className="text-slate-500">Expected Delivery: </span>
              {date(b.expectedDate)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-slate-300 p-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[13px]">{refund ? "Advance refunded" : "Advance received"}</p>
          <p className="num text-[20px] font-extrabold text-slate-900">{inr(amount)}</p>
        </div>
        <p className="mt-1 italic text-slate-600">{amountInWords(amount)}</p>
        <p className="mt-1">
          <span className="text-slate-500">By: </span>
          {modeLabel(p.mode)}
          {p.reference ? ` · Ref ${p.reference}` : ""}
        </p>
      </div>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Products Booked</p>
      <table className="mt-1 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-slate-300 bg-slate-50 text-left">
            <th className="px-2 py-1.5">#</th>
            <th className="px-2 py-1.5">Product</th>
            <th className="px-2 py-1.5 text-right">Booked</th>
            <th className="px-2 py-1.5 text-right">Delivered</th>
            <th className="px-2 py-1.5 text-right">Agreed Price</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((i, k) => (
            <tr key={i.id} className="border-b border-slate-200">
              <td className="px-2 py-1.5">{k + 1}</td>
              <td className="px-2 py-1.5">
                {i.product.name}
                <span className="text-slate-500"> · {i.product.sku}</span>
              </td>
              <td className="px-2 py-1.5 text-right">
                {qty(i.quantity)} {i.product.unit}
              </td>
              <td className="px-2 py-1.5 text-right">{qty(i.deliveredQty)}</td>
              <td className="px-2 py-1.5 text-right">{i.agreedPrice != null ? inr(i.agreedPrice) : "As on billing day"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-72">
        <SummaryRow l="Total advance received" r={inr(pos.received)} />
        {pos.used > 0 && <SummaryRow l="Set against bills" r={`− ${inr(pos.used)}`} />}
        {pos.refunded > 0 && <SummaryRow l="Refunded" r={`− ${inr(pos.refunded)}`} />}
        <div className="mt-1 border-t border-slate-400 pt-1">
          <SummaryRow l="Advance held" r={inr(pos.held)} bold />
        </div>
      </div>

      <div className="mt-6 space-y-1 text-[10.5px] text-slate-600">
        {refund ? (
          <p>The amount above was refunded from the advance held on booking {b.bookingNo}.</p>
        ) : (
          <>
            <p>This is a receipt for an advance against a booking, not a tax invoice. The GST tax invoice is issued when the goods are delivered.</p>
            <p>The advance is set against the bill when the booked products are bought. Serial-numbered units are allotted at delivery.</p>
          </>
        )}
        {b.notes && <p>Note: {b.notes}</p>}
      </div>
      <div className="mt-10 flex items-end justify-between gap-6">
        <SystemGeneratedNote doc={refund ? "voucher" : "receipt"} />
        <p className="shrink-0 text-[10.5px] text-slate-500">{p.user?.name ? `Prepared by ${p.user.name}` : ""}</p>
      </div>
    </div>
  );
}

function SummaryRow({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "text-[13px] font-bold text-slate-900" : ""}`}>
      <span>{l}</span>
      <span className="num">{r}</span>
    </div>
  );
}

/** Receipt-printer version (58 / 80 mm), printed from PrintPortal "thermal-host" with lib/print printReceipt() */
export function AdvanceReceiptThermal({ booking: b, payment: p, store, width = 80 }: ReceiptProps & { width?: 58 | 80 }) {
  const refund = p.direction === "OUT";
  const pos = positionAfter(b, p.id);
  const narrow = width === 58;
  return (
    <div
      className={`paper thermal-area thermal-${width} bg-surface text-black`}
      style={{ width: narrow ? "48mm" : "72mm", fontFamily: "ui-monospace, Consolas, 'Courier New', monospace", fontSize: narrow ? "9.5px" : "11px", lineHeight: 1.25 }}
    >
      <div className="text-center">
        <PrintLogo className="mb-1" imageClassName={narrow ? "h-auto w-[22mm]" : "h-auto w-[28mm]"} />
        <p className="text-[13px] font-bold uppercase">{store?.storeName ?? "OneRoot Agri Inputs"}</p>
        {store?.address && <p>{[store.address, store.city].filter(Boolean).join(", ")}</p>}
        {store?.phone && <p>Ph: {store.phone}</p>}
        {store?.gstin && <p>GSTIN: {store.gstin}</p>}
        <p className="mt-1 font-bold">{refund ? "ADVANCE REFUND" : "ADVANCE RECEIPT"}</p>
      </div>
      <Dash />
      <TRow l="Receipt No" r={p.paymentNo} />
      <TRow l="Date" r={dateTime(p.paymentDate)} />
      <TRow l="Booking" r={b.bookingNo} />
      <TRow l="Customer" r={[b.customer.name, b.customer.phone].filter(Boolean).join(" ")} />
      {b.expectedDate && <TRow l="Expected" r={date(b.expectedDate)} />}
      <Dash />
      <p className="font-semibold">Booked:</p>
      {b.items.map((i) => (
        <div key={i.id} className="flex justify-between gap-2">
          <span>{i.product.name}</span>
          <span className="whitespace-nowrap">
            {qty(i.quantity)} {i.product.unit}
          </span>
        </div>
      ))}
      <Dash />
      <TRow l={refund ? "REFUNDED" : "RECEIVED"} r={inr(p.amount)} bold big />
      <TRow l={`By ${modeLabel(p.mode)}`} r={p.reference ?? ""} />
      <p className="text-[9px]">{amountInWords(n(p.amount))}</p>
      <Dash />
      <TRow l="Total advance" r={inr(pos.received)} />
      {pos.used > 0 && <TRow l="Used on bills" r={`- ${inr(pos.used)}`} />}
      {pos.refunded > 0 && <TRow l="Refunded" r={`- ${inr(pos.refunded)}`} />}
      <TRow l="Advance held" r={inr(pos.held)} bold />
      <Dash />
      {!refund && <p className="text-center text-[9px]">Advance against booking — not a tax invoice. GST invoice on delivery.</p>}
      <p className="mt-1 text-center text-[9px]">* This is a system-generated {refund ? "voucher" : "receipt"} and does not require a signature.</p>
      <p className="mt-1 text-center text-[9px]">OneRoot ERP</p>
    </div>
  );
}

const Dash = () => <div className="my-1 border-t border-dashed border-black" />;

function TRow({ l, r, bold, big }: { l: string; r: string; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""} ${big ? "text-[13px]" : ""}`}>
      <span>{l}</span>
      <span className="num whitespace-nowrap text-right">{r}</span>
    </div>
  );
}
