"use client";

import { ArrowLeft, Ban, Pencil, Plus, Printer, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdvanceReceiptSheet, AdvanceReceiptThermal, isReceiptPayment } from "@/components/AdvanceReceipt";
import { AddAdvanceModal, BookingFormModal, BookingStatusBadge, CancelBookingModal } from "@/components/Bookings";
import { PrintPortal } from "@/components/PrintPortal";
import { Button, Card, ErrorBox, Info, PageHeader, Spinner, StatCard, Table, Td, Th, useConfirm } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, dateTime, inr, n, qty } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { defaultPrintMode, printAs, printReceipt, receiptWidth } from "@/lib/print";
import { modeLabel, type AdvanceBooking, type Payment, type StoreSettings } from "@/lib/types";

type PrintFormat = "a4" | "thermal";

/** Latest advance taken on a booking (the one to print right after it was received) */
const latestReceipt = (b: AdvanceBooking) => [...(b.payments ?? [])].reverse().find((p) => isReceiptPayment(p) && p.direction === "IN") ?? null;

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { data: b, error, reload, setData } = useApi<AdvanceBooking>(`/bookings/${id}`);
  const { data: store } = useApi<StoreSettings>("/settings");
  const [dialog, setDialog] = useState<"edit" | "pay" | "cancel" | null>(null);
  const confirm = useConfirm();
  const router = useRouter();
  const params = useSearchParams();
  /** The receipt being printed: rendered off-screen, then the browser's print dialog opens */
  const [job, setJob] = useState<{ paymentId: string; format: PrintFormat } | null>(null);

  function printPayment(p: Payment, format: PrintFormat = defaultPrintMode(store)) {
    setJob({ paymentId: p.id, format });
    setTimeout(() => {
      if (format === "thermal") printReceipt(receiptWidth(store));
      else printAs("sheet", "size: A4 portrait; margin: 0 !important;", `${p.direction === "OUT" ? "Advance Refund" : "Advance Receipt"} - ${p.paymentNo}`);
    }, 150);
  }

  // Just booked (?receipt=latest from New Booking): print the advance receipt once, then drop the flag from the URL
  const printLatest = params.get("receipt") === "latest";
  useEffect(() => {
    if (!printLatest || !b || !store) return;
    const latest = latestReceipt(b);
    const t = setTimeout(() => {
      if (latest) printPayment(latest);
      router.replace(`/bookings/${b.id}`);
    }, 300);
    return () => clearTimeout(t);
    // printPayment only reads `store`, already a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printLatest, b, store, router]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!b) return <Spinner page />;

  const live = b.status !== "CANCELLED";
  const undelivered = b.items.some((i) => i.remaining > 0);
  const saved = (x: AdvanceBooking) => {
    setData(x);
    setDialog(null);
  };
  const advanceAdded = async (x: AdvanceBooking) => {
    saved(x);
    const latest = latestReceipt(x);
    if (latest && (await confirm(`Print the receipt for ${inr(latest.amount)}?`, { confirmLabel: "Print Receipt" }))) printPayment(latest);
  };
  const jobPayment = job ? (b.payments ?? []).find((p) => p.id === job.paymentId) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {b.bookingNo} <BookingStatusBadge status={b.status} />
          </span>
        }
        subtitle={
          <>
            {b.customer.name}
            {b.customer.phone && ` · ${b.customer.phone}`} · booked {date(b.bookingDate)}
            {b.user?.name && ` by ${b.user.name}`}
            {b.branch && ` at ${b.branch.name}`}
          </>
        }
        actions={
          <>
            <Link href="/bookings">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
                Bookings
              </Button>
            </Link>
            {live && undelivered && can("sales.bill") && (
              <Link href={`/sales/new?customerId=${b.customerId}`}>
                <Button icon={<ShoppingCart className="size-4" />}>Bill Now</Button>
              </Link>
            )}
            {live && can("bookings.create") && (
              <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setDialog("pay")}>
                Add Advance
              </Button>
            )}
            {live && can("bookings.edit") && (
              <Button variant="edit" icon={<Pencil className="size-4" />} onClick={() => setDialog("edit")}>
                Edit
              </Button>
            )}
            {live && can("bookings.cancel") && (undelivered || b.unused > 0) && (
              <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setDialog("cancel")}>
                {undelivered ? "Cancel" : "Refund Leftover"}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Advance Paid" value={inr(b.advancePaid)} />
        <StatCard label="Set Against Bills" value={inr(b.advanceUsed)} />
        <StatCard label="Refunded" value={inr(b.refunded)} />
        <StatCard label="Advance Held" value={inr(b.unused)} tone={b.unused > 0 ? "amber" : "slate"} />
      </div>

      {b.status === "CANCELLED" && (
        <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Cancelled {b.cancelledAt ? dateTime(b.cancelledAt) : ""}
          {b.cancelReason && ` — ${b.cancelReason}`}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Booked Products" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th right>Booked</Th>
                  <Th right>Delivered</Th>
                  <Th right>To Deliver</Th>
                  <Th right>Agreed Price</Th>
                  <Th>Delivered On</Th>
                </tr>
              </thead>
              <tbody>
                {b.items.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <Link href={`/products/${i.productId}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {i.product.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {i.product.sku}
                        {i.product.trackSerial && " · serial no. picked at billing"}
                      </p>
                    </Td>
                    <Td right className="num">
                      {qty(i.quantity)} {i.product.unit}
                    </Td>
                    <Td right className="num">
                      {qty(i.deliveredQty)}
                    </Td>
                    <Td right className={i.remaining > 0 && live ? "num font-semibold text-amber-700" : "num"}>
                      {qty(i.remaining)}
                    </Td>
                    <Td right className="num">
                      {i.agreedPrice != null ? inr(i.agreedPrice) : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="text-xs">
                      {i.saleItems?.length
                        ? i.saleItems.map((s) => (
                            <p key={s.id}>
                              <Link href={`/sales/${s.sale.id}`} className="text-brand-700 hover:underline">
                                {s.sale.invoiceNo}
                              </Link>{" "}
                              · {qty(s.bookingQty)} · {date(s.sale.saleDate)}
                              {s.serials.length > 0 && <span className="text-slate-500"> · S/N {s.serials.map((x) => x.serialNo).join(", ")}</span>}
                            </p>
                          ))
                        : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Advance Payments" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>What</Th>
                  <Th>Mode</Th>
                  <Th right>Amount</Th>
                  <Th right className="no-print">Print</Th>
                </tr>
              </thead>
              <tbody>
                {(b.payments ?? []).map((p) => {
                  const what = p.mode === "ADVANCE" ? (p.sale ? "Set against bill" : "Moved to customer's account") : p.direction === "OUT" ? "Refunded" : "Advance received";
                  return (
                    <tr key={p.id}>
                      <Td>
                        <span className="font-medium text-slate-800">{p.paymentNo}</span>
                        <p className="text-xs text-slate-500">
                          {dateTime(p.paymentDate)}
                          {p.user?.name && ` · ${p.user.name}`}
                        </p>
                      </Td>
                      <Td>
                        {what}
                        {p.sale && (
                          <Link href={`/sales/${p.sale.id}`} className="ml-1 text-brand-700 hover:underline">
                            {p.sale.invoiceNo}
                          </Link>
                        )}
                      </Td>
                      <Td>
                        {p.mode === "ADVANCE" ? "—" : modeLabel(p.mode)}
                        {p.mode !== "ADVANCE" && p.reference && <p className="text-xs text-slate-500">{p.reference}</p>}
                      </Td>
                      <Td right className={p.direction === "OUT" || p.mode === "ADVANCE" ? "num text-slate-500" : "num font-medium"}>
                        {p.direction === "OUT" || p.mode === "ADVANCE" ? "− " : ""}
                        {inr(p.amount)}
                      </Td>
                      <Td right className="no-print whitespace-nowrap">
                        {isReceiptPayment(p) ? (
                          <span className="inline-flex gap-1">
                            <Button size="sm" variant="secondary" icon={<Printer className="size-3.5" />} onClick={() => printPayment(p, "a4")} title="Print A4 receipt">
                              A4
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => printPayment(p, "thermal")} title="Print on the receipt printer">
                              Slip
                            </Button>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">on the bill</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>

        <Card title="Details">
          <div className="space-y-3">
            <Info label="Customer">
              <Link href={`/customers/${b.customerId}`} className="text-brand-700 hover:underline">
                {b.customer.name}
              </Link>
              {b.customer.village && <span className="text-slate-500"> · {b.customer.village}</span>}
            </Info>
            <Info label="Expected Delivery">{b.expectedDate ? date(b.expectedDate) : "—"}</Info>
            <Info label="Notes">{b.notes || "—"}</Info>
            {n(b.customer.balance) > 0 && <Info label="Customer Dues">{inr(b.customer.balance)} (separate from this advance)</Info>}
            <p className="rounded-lg bg-paper-2 p-2.5 text-xs text-slate-600">
              When {b.customer.name} buys a booked product at the POS, pick them as the customer: the advance is set against the bill automatically, and for
              serial-numbered products the cashier picks whichever unit is in stock then.
            </p>
          </div>
        </Card>
      </div>

      {dialog === "edit" && <BookingFormModal open booking={b} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog === "pay" && <AddAdvanceModal open booking={b} onClose={() => setDialog(null)} onSaved={(x) => void advanceAdded(x)} />}

      {/* The receipt being printed, outside the app layout (see components/PrintPortal.tsx) */}
      {jobPayment && job?.format === "a4" && (
        <PrintPortal className="sheet-host">
          <AdvanceReceiptSheet booking={b} payment={jobPayment} store={store} />
        </PrintPortal>
      )}
      {jobPayment && job?.format === "thermal" && (
        <PrintPortal className="thermal-host">
          <AdvanceReceiptThermal booking={b} payment={jobPayment} store={store} width={receiptWidth(store)} />
        </PrintPortal>
      )}
      {dialog === "cancel" && <CancelBookingModal open booking={b} onClose={() => setDialog(null)} onSaved={saved} />}
    </>
  );
}
