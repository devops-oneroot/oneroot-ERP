"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CustomerPicker, ProductPicker } from "@/components/pickers";
import { Badge, Button, Card, DateInput, EmptyRow, Field, Input, LoadingRow, Modal, Select, Table, Td, Textarea, Th, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, inr, n, qty, round2, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { BOOKING_STATUS_LABEL, MONEY_MODES, modeLabel, type AdvanceBooking, type BookingStatus, type Customer, type Paged, type PaymentMode, type Product } from "@/lib/types";

/** GET /bookings: a page of bookings plus the advance taken and still held across every match */
export type BookingList = Paged<AdvanceBooking> & { advancePaid: number; unused: number };

const STATUS_TONE: Record<BookingStatus, "blue" | "amber" | "green" | "slate"> = {
  OPEN: "blue",
  PARTIAL: "amber",
  FULFILLED: "green",
  CANCELLED: "slate",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</Badge>;
}

/** Booked products in one line, e.g. "Opal 090 × 1 (1 left) · Sprayer × 2" */
export function bookedSummary(b: AdvanceBooking) {
  return b.items
    .map((i) => `${i.product.name} × ${qty(i.quantity)}${n(i.deliveredQty) > 0 && i.remaining > 0 ? ` (${qty(i.remaining)} left)` : ""}`)
    .join(" · ");
}

/** Mode, amount, reference: one advance instalment or refund */
function MoneyFields({
  amount,
  setAmount,
  mode,
  setMode,
  reference,
  setReference,
  amountLabel = "Advance Amount (₹)",
  max,
}: {
  amount: string;
  setAmount: (v: string) => void;
  mode: PaymentMode;
  setMode: (m: PaymentMode) => void;
  reference: string;
  setReference: (v: string) => void;
  amountLabel?: string;
  max?: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={amountLabel} required>
        <Input type="number" step="0.01" min="0" max={max} value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-right" />
      </Field>
      <Field label="Paid By" required>
        <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
          {MONEY_MODES.map((m) => (
            <option key={m} value={m}>
              {modeLabel(m)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={mode === "CHEQUE" ? "Cheque No." : mode === "UPI" ? "UPI Ref / UTR" : "Reference"}>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={mode === "CASH"} placeholder={mode === "CASH" ? "—" : "Optional"} />
      </Field>
    </div>
  );
}

interface FormLine {
  key: number;
  id?: string;
  product: Pick<Product, "id" | "name" | "sku" | "unit" | "trackSerial" | "salePrice">;
  quantity: string;
  agreedPrice: string;
  /** Edit: units already delivered (the quantity can't go below) */
  delivered: number;
}
let lineSeq = 0;

/** New booking (customer, products, first advance) or edit of an existing one (products, expected date, notes) */
export function BookingFormModal({
  open,
  onClose,
  onSaved,
  booking,
  presetCustomer,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (b: AdvanceBooking) => void;
  booking?: AdvanceBooking | null;
  presetCustomer?: Customer | null;
}) {
  const toast = useToast();
  const editing = !!booking;
  const [customer, setCustomer] = useState<Customer | null>(presetCustomer ?? null);
  const [lines, setLines] = useState<FormLine[]>(() =>
    (booking?.items ?? []).map((i) => ({
      key: ++lineSeq,
      id: i.id,
      product: i.product,
      quantity: String(n(i.quantity)),
      agreedPrice: i.agreedPrice != null ? String(n(i.agreedPrice)) : "",
      delivered: n(i.deliveredQty),
    })),
  );
  const [expected, setExpected] = useState(booking?.expectedDate ? booking.expectedDate.slice(0, 10) : "");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const value = round2(lines.reduce((s, l) => s + n(l.quantity) * (l.agreedPrice ? n(l.agreedPrice) : n(l.product.salePrice)), 0));

  function addProduct(p: Product) {
    if (lines.some((l) => l.product.id === p.id)) {
      setLines((ls) => ls.map((l) => (l.product.id === p.id ? { ...l, quantity: String(n(l.quantity) + 1) } : l)));
      return;
    }
    setLines((ls) => [...ls, { key: ++lineSeq, product: p, quantity: "1", agreedPrice: "", delivered: 0 }]);
  }

  async function save() {
    if (!editing && !customer) return toast.error("Pick the customer");
    if (!lines.length) return toast.error("Add at least one product");
    for (const l of lines) {
      if (n(l.quantity) <= 0) return toast.error(`Enter a quantity for ${l.product.name}`);
      if (l.product.trackSerial && !Number.isInteger(n(l.quantity))) return toast.error(`${l.product.name} is booked per unit — use a whole number`);
      if (n(l.quantity) < l.delivered) return toast.error(`${l.product.name}: ${qty(l.delivered)} already delivered`);
    }
    if (!editing && n(amount) <= 0) return toast.error("Enter the advance amount");
    const items = lines.map((l) => ({ id: l.id, productId: l.product.id, quantity: n(l.quantity), agreedPrice: l.agreedPrice === "" ? undefined : n(l.agreedPrice) }));
    setSaving(true);
    try {
      const saved = editing
        ? await api.patch<AdvanceBooking>(`/bookings/${booking!.id}`, { items, expectedDate: expected, notes })
        : await api.post<AdvanceBooking>("/bookings", {
            customerId: customer!.id,
            items,
            expectedDate: expected || undefined,
            notes: notes.trim() || undefined,
            advance: { amount: n(amount), mode, reference: reference.trim() || undefined },
          });
      toast.success(editing ? `${saved.bookingNo} updated` : `Booking ${saved.bookingNo} saved — advance ${inr(amount)} received`);
      onSaved(saved);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit ${booking!.bookingNo}` : "New Advance Booking"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {editing ? "Save Changes" : "Save & Take Advance"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {editing ? (
          <p className="text-sm text-slate-600">
            Customer: <b className="text-slate-900">{booking!.customer.name}</b>
          </p>
        ) : (
          // Not <Field>: it is a <label>, and a click inside a label is re-sent to its first control — once a customer is
          // picked that is the picker's clear (✕) button, which would undo the pick straight away
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">
              Customer<span className="text-red-500"> *</span>
            </p>
            <CustomerPicker value={customer} onChange={setCustomer} autoFocus={!presetCustomer} />
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            Products<span className="text-red-500"> *</span>
            <span className="ml-1 font-normal text-slate-400">— book the product, not a serial number: the unit is picked when the customer buys</span>
          </p>
          <ProductPicker onPick={addProduct} placeholder="Search product to book (it can be out of stock)…" />
          {lines.length > 0 && (
            <div className="mt-2 space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <div className="min-w-40 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{l.product.name}</p>
                    <p className="text-xs text-slate-500">
                      {l.product.sku} · today {inr(l.product.salePrice)}
                      {l.product.trackSerial && " · serial no. picked at billing"}
                      {l.delivered > 0 && ` · ${qty(l.delivered)} delivered`}
                    </p>
                  </div>
                  <label className="text-xs text-slate-500">
                    Qty
                    <Input
                      type="number"
                      min={l.delivered || 0}
                      step={l.product.trackSerial ? 1 : "any"}
                      value={l.quantity}
                      onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
                      className="num h-8 w-20 text-right"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Agreed Price
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.agreedPrice}
                      placeholder="optional"
                      onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, agreedPrice: e.target.value } : x)))}
                      className="num h-8 w-28 text-right"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={l.delivered > 0}
                    title={l.delivered > 0 ? "Already delivered" : "Remove"}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="mt-4 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label={`Remove ${l.product.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <p className="text-right text-xs text-slate-500">
                Approx. value <b className="num text-slate-800">{inr(value)}</b> (the bill uses the price on the day of sale)
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Expected Delivery" hint="When the customer plans to take it (next batch, a month…)">
            <DateInput value={expected} min={today()} onChange={(e) => setExpected(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Colour, model, promised terms…" />
          </Field>
        </div>

        {!editing && (
          <div className="rounded-lg bg-paper-2 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Advance Received Now</p>
            <MoneyFields amount={amount} setAmount={setAmount} mode={mode} setMode={setMode} reference={reference} setReference={setReference} />
            <p className="mt-2 text-xs text-slate-500">More instalments can be added later from the booking. The advance is set against the bill when the customer buys.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Another instalment of advance on a booking */
export function AddAdvanceModal({ booking, open, onClose, onSaved }: { booking: AdvanceBooking; open: boolean; onClose: () => void; onSaved: (b: AdvanceBooking) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (n(amount) <= 0) return toast.error("Enter the amount");
    setSaving(true);
    try {
      const b = await api.post<AdvanceBooking>(`/bookings/${booking.id}/payments`, { amount: n(amount), mode, reference: reference.trim() || undefined });
      toast.success(`${inr(amount)} added to ${b.bookingNo}`);
      onSaved(b);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add Advance — ${booking.bookingNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Receive
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        {booking.customer.name} · advance held now <b className="num">{inr(booking.unused)}</b>
      </p>
      <MoneyFields amount={amount} setAmount={setAmount} mode={mode} setMode={setMode} reference={reference} setReference={setReference} amountLabel="Amount (₹)" />
    </Modal>
  );
}

/** Cancel a booking (or settle the leftover advance of a delivered one): refund or keep on the customer's account */
export function CancelBookingModal({ booking, open, onClose, onSaved }: { booking: AdvanceBooking; open: boolean; onClose: () => void; onSaved: (b: AdvanceBooking) => void }) {
  const toast = useToast();
  const undelivered = booking.items.some((i) => i.remaining > 0);
  const [how, setHow] = useState<PaymentMode | "ACCOUNT">("CASH");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (undelivered && !reason.trim()) return toast.error("Enter the reason for cancelling");
    setSaving(true);
    try {
      const b = await api.post<AdvanceBooking>(`/bookings/${booking.id}/cancel`, {
        reason: reason.trim() || undefined,
        refundMode: booking.unused > 0 ? how : undefined,
        reference: reference.trim() || undefined,
      });
      toast.success(undelivered ? `${b.bookingNo} cancelled` : `Leftover advance of ${b.bookingNo} settled`);
      onSaved(b);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={undelivered ? `Cancel ${booking.bookingNo}` : `Refund Leftover — ${booking.bookingNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" onClick={save} loading={saving}>
            {undelivered ? "Cancel Booking" : "Settle Advance"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {booking.unused > 0 ? (
          <>
            <p className="text-slate-600">
              Unused advance <b className="num text-slate-900">{inr(booking.unused)}</b> goes back to {booking.customer.name}:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Give It Back As" required>
                <Select value={how} onChange={(e) => setHow(e.target.value as PaymentMode | "ACCOUNT")}>
                  {MONEY_MODES.map((m) => (
                    <option key={m} value={m}>
                      Refund in {modeLabel(m)}
                    </option>
                  ))}
                  <option value="ACCOUNT">Keep on customer&apos;s account (clears dues)</option>
                </Select>
              </Field>
              {how !== "CASH" && how !== "ACCOUNT" && (
                <Field label="Reference">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." />
                </Field>
              )}
            </div>
          </>
        ) : (
          <p className="text-slate-600">No advance is left on this booking, so nothing is refunded.</p>
        )}
        {undelivered && (
          <Field label="Reason" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer changed their mind, product discontinued…" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** Bookings card on a customer or product page */
export function BookingsCard({ customer, productId, title = "Advance Bookings" }: { customer?: Customer | null; productId?: string; title?: string }) {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const q = useApi<BookingList>(can("bookings.view") ? "/bookings" : null, {
    customerId: customer?.id,
    productId,
    status: "all",
    pageSize: 20,
  });
  if (!can("bookings.view")) return null;
  const rows = q.data?.items ?? [];
  return (
    <Card
      title={
        <span>
          {title}
          {q.data && n(q.data.unused) > 0 && <span className="ml-2 text-xs font-normal text-slate-500">advance held {inr(q.data.unused)}</span>}
        </span>
      }
      actions={
        customer &&
        can("bookings.create") && (
          <Button size="sm" variant="add" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New Booking
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      <Table>
        <thead>
          <tr>
            <Th>Booking</Th>
            {!customer && <Th>Customer</Th>}
            <Th>Products</Th>
            <Th right>Advance Held</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {q.loading && !q.data ? (
            <LoadingRow colSpan={customer ? 4 : 5} />
          ) : !rows.length ? (
            <EmptyRow colSpan={customer ? 4 : 5}>No bookings</EmptyRow>
          ) : (
            rows.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/bookings/${b.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {b.bookingNo}
                  </Link>
                  <p className="text-xs text-slate-500">{date(b.bookingDate)}</p>
                </Td>
                {!customer && <Td>{b.customer.name}</Td>}
                <Td className="text-slate-600">{bookedSummary(b)}</Td>
                <Td right className="num font-medium">
                  {inr(b.unused)}
                </Td>
                <Td>
                  <BookingStatusBadge status={b.status} />
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {creating && customer && (
        <BookingFormModal
          open
          presetCustomer={customer}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void q.reload();
          }}
        />
      )}
    </Card>
  );
}
