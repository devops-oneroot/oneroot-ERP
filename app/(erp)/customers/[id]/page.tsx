"use client";

import { ArrowLeft, Download, IndianRupee, MessageCircle, Pencil, PhoneCall, Printer, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  Field,
  Info,
  Input,
  LoadingRow,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  errMsg,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, downloadCsv, inr, n, qty, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Customer, CustomerReminder, Dec, Ledger, Paged, Payment, PaymentMode, PaymentStatus, ReminderChannel, Sale, StoreSettings } from "@/lib/types";
import { MONEY_MODES, modeLabel } from "@/lib/types";
import { LazyCustomerForm } from "@/components/lazy";
import { BookingsCard } from "@/components/Bookings";

interface CustomerDetail extends Customer {
  stats: { totalPurchases: Dec; invoiceCount: number; lastPurchase: string | null };
  recentSales: {
    id: string;
    invoiceNo: string;
    saleDate: string;
    totalAmount: Dec;
    paidAmount: Dec;
    paymentStatus: PaymentStatus;
    status: string;
  }[];
}

type Tab = "ledger" | "invoices" | "payments" | "bookings" | "reminders";
const RECEIPT_MODES: PaymentMode[] = [...MONEY_MODES];
const CHANNEL_LABEL: Record<ReminderChannel, string> = { WHATSAPP: "WhatsApp", SMS: "SMS", CALL: "Phone Call", VISIT: "Visit", NOTE: "Note" };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("ledger");
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const { data: c, error, loading, reload } = useApi<CustomerDetail>(`/customers/${id}`);
  const { data: settings } = useApi<StoreSettings>("/settings");

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !c) return <Spinner page />;
  if (!c) return null;

  const balance = n(c.balance);
  const limit = n(c.creditLimit);
  const refresh = () => {
    void reload();
    setVersion((v) => v + 1);
  };

  function sendReminder() {
    const store = settings?.storeName ?? "our store";
    const days = c!.overdue?.days ?? 0;
    const msg = (settings?.reminderTemplate?.trim() ||
      "Namaste {name} ji, a gentle reminder from {store}: ₹{amount} is pending on your account ({days} days past due). Kindly clear it at your earliest convenience. If you have already paid, please ignore this message. Thank you! — {store} {phone}")
      .replace(/\{name\}/g, c!.name)
      .replace(/\{amount\}/g, Math.round(balance).toLocaleString("en-IN"))
      .replace(/\{overdue\}/g, Math.round(c!.overdue?.amount ?? 0).toLocaleString("en-IN"))
      .replace(/\{days\}/g, String(days))
      .replace(/\{store\}/g, store)
      .replace(/\{phone\}/g, settings?.phone ?? "")
      .replace(/\{date\}/g, date(new Date()));
    window.open(`https://wa.me/91${c!.phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    // Keep the follow-up history complete
    api.post(`/reminders/customers/${c!.id}`, { channel: "WHATSAPP", message: msg, amount: balance }).then(refresh).catch(() => {});
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name}
            {!c.isActive && <Badge>Inactive</Badge>}
            {c.creditHold && <Badge tone="red">Credit on Hold</Badge>}
          </span>
        }
        subtitle={[c.phone, c.village, c.crops].filter(Boolean).join(" · ") || "Customer"}
        actions={
          <>
            <Link href="/customers">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
                Customers
              </Button>
            </Link>
            {can("customers.edit") && (
              <Button variant="edit" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {c.phone && balance > 0 && can("customers.edit") && (
              <Button variant="secondary" icon={<MessageCircle className="size-4" />} onClick={sendReminder}>
                Send Reminder
              </Button>
            )}
            {can("payments.record") && (
              <Button variant="secondary" icon={<IndianRupee className="size-4" />} onClick={() => setPayOpen(true)}>
                Receive Payment
              </Button>
            )}
            {can("sales.bill") && (
              <Link href={`/sales/new?customerId=${c.id}`}>
                <Button variant="add" icon={<ShoppingCart className="size-4" />}>New Sale</Button>
              </Link>
            )}
          </>
        }
      />

      <div className="no-print mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Balance Due"
          value={<span className={balance > 0 ? "text-red-600" : undefined}>{balance < 0 ? `${inr(-balance)} adv` : inr(balance)}</span>}
          sub={
            c.overdue && c.overdue.amount > 0 ? (
              <span className="font-medium text-red-600">
                {inr(c.overdue.amount)} overdue · {c.overdue.days} days
              </span>
            ) : limit > 0 && balance > limit ? (
              <span className="font-medium text-red-600">Over credit limit</span>
            ) : balance < 0 ? (
              "Advance with store"
            ) : undefined
          }
          tone={balance > 0 ? "red" : "green"}
          icon={<IndianRupee />}
        />
        <StatCard
          label="Credit Limit"
          value={limit > 0 ? inr(limit) : "No limit"}
          sub={[limit > 0 ? `${inr(Math.max(0, limit - balance))} available` : null, c.creditDays > 0 ? `${c.creditDays} days credit` : null].filter(Boolean).join(" · ") || undefined}
        />
        <StatCard label="Total Purchases" value={inr(c.stats.totalPurchases)} />
        <StatCard label="Invoices" value={c.stats.invoiceCount} />
        <StatCard label="Last Purchase" value={<span className="text-lg">{date(c.stats.lastPurchase)}</span>} />
      </div>

      <Card className="no-print mb-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 [&>div]:min-w-0 [&_dd]:break-words">
          <Info label="Phone">{c.phone}</Info>
          <Info label="Email">{c.email}</Info>
          <Info label="GSTIN">{c.gstin}</Info>
          <Info label="Village">{c.village}</Info>
          <Info label="Address">{[c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ")}</Info>
          <Info label="Land">{n(c.landAcres) > 0 ? `${qty(c.landAcres)} acres` : null}</Info>
          <Info label="Crops">{c.crops}</Info>
          <Info label="Opening Balance">{inr(c.openingBalance)}</Info>
          <Info label="Customer Since">{date(c.createdAt)}</Info>
          {c.notes && (
            <div className="col-span-2 sm:col-span-3">
              <Info label="Notes">{c.notes}</Info>
            </div>
          )}
        </dl>
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "ledger", label: "Ledger" },
          ...(can("sales.view") ? [{ value: "invoices" as const, label: `Invoices (${c.stats.invoiceCount})` }] : []),
          ...(can("payments.view") ? [{ value: "payments" as const, label: "Payments" }] : []),
          ...(can("bookings.view") ? [{ value: "bookings" as const, label: n(c.advanceBalance) > 0 ? `Advance Bookings (${inr(c.advanceBalance)} held)` : "Advance Bookings" }] : []),
          { value: "reminders", label: c.lastReminder ? `Reminders (last ${date(c.lastReminder.sentAt)})` : "Reminders" },
        ]}
      />

      {tab === "ledger" && <LedgerTab key={version} customer={c} settings={settings} />}
      {tab === "invoices" && <InvoicesTab key={version} customerId={c.id} />}
      {tab === "payments" && <PaymentsTab key={version} customerId={c.id} />}
      {tab === "bookings" && <BookingsCard key={version} customer={c} />}
      {tab === "reminders" && <RemindersTab key={version} customer={c} onLogged={refresh} />}

      <LazyCustomerForm
        open={editOpen}
        customer={c}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          refresh();
        }}
      />
      <ReceivePaymentModal
        open={payOpen}
        customer={c}
        onClose={() => setPayOpen(false)}
        onSaved={() => {
          setPayOpen(false);
          refresh();
        }}
      />
    </>
  );
}

// ───────────────────────── Ledger ─────────────────────────

function LedgerTab({ customer, settings }: { customer: Customer; settings: StoreSettings | null }) {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<Ledger<Customer>>(`/customers/${customer.id}/ledger`);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `ledger_${customer.name.replace(/\W+/g, "_")}.csv`,
      ["Date", "Type", "Ref", "Note", "Debit", "Credit", "Balance"],
      [
        ["", "Opening balance", "", "", "", "", data.openingBalance],
        ...data.entries.map((e) => [date(e.date), e.type, e.refNo, e.note, e.debit || "", e.credit || "", e.balance]),
        ["", "Closing balance", "", "", data.totalDebit, data.totalCredit, data.closingBalance],
      ],
    );
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="print-area">
      {/* Print-only statement heading */}
      <div className="mb-4 hidden text-center print:block">
        <p className="text-lg font-bold">{settings?.storeName}</p>
        <p className="text-xs">{[settings?.address, settings?.city, settings?.phone].filter(Boolean).join(" · ")}</p>
        <p className="mt-3 text-base font-semibold">Statement of account — {customer.name}</p>
        <p className="text-xs">
          {[customer.phone, customer.village].filter(Boolean).join(" · ")} · as of {date(new Date())}
        </p>
      </div>

      <Card
        bodyClassName="p-0"
        title={<span className="no-print">Account Ledger</span>}
        actions={
          <div className="no-print flex gap-2">
            <Button variant="secondary" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!data}>
              Print
            </Button>
            <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!data}>
              CSV
            </Button>
          </div>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Reference</Th>
              <Th>Note</Th>
              <Th right>Debit</Th>
              <Th right>Credit</Th>
              <Th right>Balance</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={7} />
            ) : data ? (
              <>
                <tr className="bg-slate-50/70">
                  <Td colSpan={6} className="font-medium text-slate-600">
                    Opening balance
                  </Td>
                  <Td right className="font-medium">
                    {inr(data.openingBalance)}
                  </Td>
                </tr>
                {data.entries.length === 0 && <EmptyRow colSpan={7}>No transactions yet</EmptyRow>}
                {data.entries.map((e, i) => {
                  const linkable = e.refId && (e.type === "Sale" || e.type === "Return") && can("sales.view");
                  return (
                    <tr key={`${e.refNo}-${i}`} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap">{date(e.date)}</Td>
                      <Td>
                        <Badge tone={e.type === "Sale" ? "blue" : e.type === "Return" ? "amber" : "green"}>{e.type}</Badge>
                      </Td>
                      <Td>
                        {linkable ? (
                          <Link href={`/sales/${e.refId}`} className="font-medium text-brand-700 hover:underline">
                            {e.refNo}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-700">{e.refNo}</span>
                        )}
                      </Td>
                      <Td className="max-w-64 truncate text-xs text-slate-500">{e.note || "—"}</Td>
                      <Td right>{e.debit ? inr(e.debit) : ""}</Td>
                      <Td right className="text-brand-700">
                        {e.credit ? inr(e.credit) : ""}
                      </Td>
                      <Td right className={e.balance > 0 ? "font-medium text-slate-900" : "text-slate-500"}>
                        {inr(e.balance)}
                      </Td>
                    </tr>
                  );
                })}
              </>
            ) : null}
          </tbody>
          {data && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={4}>Closing balance</Td>
                <Td right>{inr(data.totalDebit)}</Td>
                <Td right>{inr(data.totalCredit)}</Td>
                <Td right className={data.closingBalance > 0 ? "text-red-600" : undefined}>
                  {inr(data.closingBalance)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>
    </div>
  );
}

// ───────────────────────── Invoices ─────────────────────────

function InvoicesTab({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Sale>>("/sales", { customerId, status: "all", page, pageSize: 20 });

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <Card bodyClassName="p-0">
      <Table>
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th>Date</Th>
            <Th right>Items</Th>
            <Th right>Total</Th>
            <Th right>Paid</Th>
            <Th right>Balance</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {loading && !data ? (
            <LoadingRow colSpan={7} />
          ) : !data?.items.length ? (
            <EmptyRow colSpan={7}>No invoices yet</EmptyRow>
          ) : (
            data.items.map((s) => {
              const cancelled = s.status === "CANCELLED";
              const bal = cancelled ? 0 : n(s.totalAmount) - n(s.paidAmount);
              return (
                <tr key={s.id} className={cancelled ? "text-slate-400" : "hover:bg-slate-50"}>
                  <Td>
                    <Link href={`/sales/${s.id}`} className={cancelled ? "font-medium line-through" : "font-medium text-slate-900 hover:text-brand-700"}>
                      {s.invoiceNo}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{date(s.saleDate)}</Td>
                  <Td right className="text-slate-500">
                    {s._count?.items ?? "—"}
                  </Td>
                  <Td right className="font-medium">
                    {inr(s.totalAmount)}
                  </Td>
                  <Td right>{inr(s.paidAmount)}</Td>
                  <Td right className={bal > 0.004 ? "font-medium text-red-600" : "text-slate-400"}>
                    {bal > 0.004 ? inr(bal) : "—"}
                  </Td>
                  <Td>{cancelled ? <Badge tone="red">Cancelled</Badge> : <StatusBadge status={s.paymentStatus} />}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}

// ───────────────────────── Payments ─────────────────────────

function PaymentsTab({ customerId }: { customerId: string }) {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Payment>>("/payments", { partyId: customerId, page, pageSize: 20 });

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <Card bodyClassName="p-0">
      <Table>
        <thead>
          <tr>
            <Th>Receipt</Th>
            <Th>Date</Th>
            <Th>Mode</Th>
            <Th>Against</Th>
            <Th>Notes</Th>
            <Th right>Amount</Th>
          </tr>
        </thead>
        <tbody>
          {loading && !data ? (
            <LoadingRow colSpan={6} />
          ) : !data?.items.length ? (
            <EmptyRow colSpan={6}>No payments received yet</EmptyRow>
          ) : (
            data.items.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">{p.paymentNo}</Td>
                <Td className="whitespace-nowrap">{date(p.paymentDate)}</Td>
                <Td>
                  {p.mode}
                  {p.reference && <p className="text-xs text-slate-500">{p.reference}</p>}
                </Td>
                <Td>
                  {p.sale && can("sales.view") ? (
                    <Link href={`/sales/${p.sale.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.sale.invoiceNo}
                    </Link>
                  ) : p.sale ? (
                    <span className="font-medium text-slate-700">{p.sale.invoiceNo}</span>
                  ) : (
                    <span className="text-xs text-slate-500">On account</span>
                  )}
                </Td>
                <Td className="max-w-64 truncate text-xs text-slate-500">{p.notes || "—"}</Td>
                <Td right className="font-medium text-brand-700">
                  {inr(p.amount)}
                </Td>
              </tr>
            ))
          )}
        </tbody>
        {data && data.items.length > 0 && (
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <Td colSpan={5}>Total received</Td>
              <Td right>{inr(data.totalAmount)}</Td>
            </tr>
          </tfoot>
        )}
      </Table>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}

// ───────────────────────── Reminders ─────────────────────────

function RemindersTab({ customer, onLogged }: { customer: Customer; onLogged: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const canLog = can("customers.edit");
  const { data, error, loading, reload } = useApi<CustomerReminder[]>(`/reminders/customers/${customer.id}`);
  const [channel, setChannel] = useState<ReminderChannel>("CALL");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function log(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/reminders/customers/${customer.id}`, { channel, message: note.trim() || undefined, amount: n(customer.balance) });
      setNote("");
      toast.success("Follow-up logged");
      void reload();
      onLogged();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <div className={canLog ? "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" : undefined}>
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>How</Th>
              <Th right>Balance Then</Th>
              <Th>Message / Note</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={4} />
            ) : !data?.length ? (
              <EmptyRow colSpan={4}>No reminders or follow-ups logged yet</EmptyRow>
            ) : (
              data.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap">{date(r.sentAt)}</Td>
                  <Td>
                    <Badge tone={r.channel === "WHATSAPP" ? "green" : "slate"}>{CHANNEL_LABEL[r.channel]}</Badge>
                    {r.automatic && <span className="ml-1 text-[11px] text-slate-400">auto</span>}
                  </Td>
                  <Td right>{inr(r.amount)}</Td>
                  <Td className="max-w-md text-xs text-slate-600">{r.message || "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
      {canLog && (
        <Card title="Log a Follow-Up">
          <form onSubmit={log} className="space-y-3">
            <Field label="How">
              <Select value={channel} onChange={(e) => setChannel(e.target.value as ReminderChannel)}>
                {(Object.keys(CHANNEL_LABEL) as ReminderChannel[]).map((k) => (
                  <option key={k} value={k}>
                    {CHANNEL_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note" hint="e.g. Promised to pay after harvest">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="submit" icon={<PhoneCall className="size-4" />} loading={saving} className="w-full">
              Save Follow-Up
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────── Receive payment ─────────────────────────

interface ReceiveProps {
  open: boolean;
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}

function ReceivePaymentModal(props: ReceiveProps) {
  return props.open ? <ReceivePaymentBody {...props} /> : null;
}

function ReceivePaymentBody({ open, customer, onClose, onSaved }: ReceiveProps) {
  const toast = useToast();
  const due = n(customer.balance);
  const [amount, setAmount] = useState(due > 0 ? String(due) : "");
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amt = n(amount);
    if (amt <= 0) return toast.error("Enter an amount");
    setSaving(true);
    try {
      const p = await api.post<Payment>("/payments", {
        partyType: "CUSTOMER",
        partyId: customer.id,
        amount: amt,
        mode,
        reference: reference.trim() || undefined,
        paymentDate: payDate || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Receipt ${p.paymentNo} · ${inr(amt)} received`);
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const amt = n(amount);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receive Payment · ${customer.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-pay-form" loading={saving}>
            Save Receipt
          </Button>
        </>
      }
    >
      <form id="customer-pay-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Current balance due:{" "}
          <span className={due > 0 ? "num font-semibold text-red-600" : "num font-semibold text-slate-800"}>{inr(due)}</span>
          <span className="mt-0.5 block text-xs text-slate-500">Applied to the oldest unpaid invoices first.</span>
        </p>
        <Field label="Amount (₹)" required>
          <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus className="num" />
        </Field>
        <Field label="Mode" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {RECEIPT_MODES.map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <DateInput value={payDate} max={today()} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        <Field label="Reference" hint="UTR / cheque no.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={mode === "CASH"} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {amt > due && amt > 0 && (
          <p className="text-xs text-amber-700 sm:col-span-2">
            {due > 0 ? `${inr(amt - due)} more than the due` : "No dues pending"} — the excess will be kept as advance.
          </p>
        )}
      </form>
    </Modal>
  );
}
