"use client";

import { ArrowLeft, Ban, FileText, IndianRupee, Plus, Printer, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApprovalGate, approvalNeeded, type ApprovalNeed } from "@/components/ApprovalGate";
import { LazyReturnTermsModal } from "@/components/lazy";
import { PrintPortal } from "@/components/PrintPortal";
import { FitToWidth } from "@/components/FitToWidth";
import { SaleInvoice } from "@/components/SaleInvoice";
import { ThermalReceipt, receiptFromSale } from "@/components/ThermalReceipt";
import {
  Badge,
  Button,
  Card,
  DateInput,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, inr, n, qty, round2, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { defaultPrintMode, printAs, printReceipt, receiptWidth } from "@/lib/print";
import type { Customer, PaymentMode, Sale, StoreSettings } from "@/lib/types";
import { MONEY_MODES, modeLabel } from "@/lib/types";

const RECEIPT_MODES: PaymentMode[] = [...MONEY_MODES];

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: sale, error, loading, reload } = useApi<Sale>(`/sales/${id}`);
  const { data: settings } = useApi<StoreSettings>("/settings");
  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const printed = useRef(false);

  // Thermal receipt or A4 invoice, per the store setting (either can be chosen from the buttons)
  const mode = defaultPrintMode(settings);
  const print = (m: "a4" | "thermal" = mode) => (m === "thermal" ? printReceipt(receiptWidth(settings)) : printAs("a4"));

  // Auto-print once when arriving from the POS (?print=1)
  const wantPrint = params.get("print") === "1";
  useEffect(() => {
    if (!wantPrint || printed.current || !sale || !settings) return;
    printed.current = true;
    window.history.replaceState(null, "", `/sales/${id}`);
    const t = setTimeout(() => printAs("a4"), 300);
    return () => clearTimeout(t);
  }, [wantPrint, sale, settings, id]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !sale) return <Spinner page />;
  if (!sale) return null;

  const cancelled = sale.status === "CANCELLED";
  const total = n(sale.totalAmount);
  const paid = n(sale.paidAmount);
  const balance = round2(Math.max(0, total - paid));
  const returnable = (sale.items ?? []).some((i) => n(i.quantity) - n(i.returnedQty) > 0.0005);
  const hasReturns = (sale.returns?.length ?? 0) > 0;

  async function cancelSale() {
    const ok = await confirm(
      `Cancel invoice ${sale!.invoiceNo}? Stock will be returned, payments recorded against it will be removed and the customer's balance reversed. This cannot be undone.`,
      { danger: true, confirmLabel: "Cancel Invoice" },
    );
    if (!ok) return;
    setCancelling(true);
    try {
      await api.del(`/sales/${sale!.id}`);
      toast.success(`Invoice ${sale!.invoiceNo} cancelled`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {sale.invoiceNo}
            {cancelled ? <Badge tone="red">Cancelled</Badge> : <StatusBadge status={sale.paymentStatus} />}
          </span>
        }
        subtitle={
          <>
            {dateTime(sale.saleDate)}
            {sale.user?.name && ` · billed by ${sale.user.name}`}
          </>
        }
        actions={
          <>
            {can("sales.view") && (
              <Link href="/sales">
                <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
                  Invoices
                </Button>
              </Link>
            )}
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => print()}>
              {mode === "thermal" ? "Print Receipt" : "Print Invoice"}
            </Button>
            <Button variant="ghost" onClick={() => print(mode === "thermal" ? "a4" : "thermal")}>
              {mode === "thermal" ? "A4 Invoice" : "Receipt"}
            </Button>
            {!cancelled && sale.customerId && balance > 0 && can("payments.record") && (
              <Button variant="secondary" icon={<IndianRupee className="size-4" />} onClick={() => setPayOpen(true)}>
                Record Payment
              </Button>
            )}
            {!cancelled && returnable && can("sales.returns") && (
              <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => setReturnOpen(true)}>
                Return Items
              </Button>
            )}
            {!cancelled && can("sales.cancel") && (
              <Button
                variant="danger"
                icon={<Ban className="size-4" />}
                loading={cancelling}
                disabled={hasReturns}
                title={hasReturns ? "Invoices with returns cannot be cancelled" : undefined}
                onClick={cancelSale}
              >
                Cancel Invoice
              </Button>
            )}
            {can("sales.bill") && (
              <Link href="/sales/new">
                <Button variant="add" icon={<Plus className="size-4" />}>New Sale</Button>
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="paper print-area min-w-0 rounded-xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-8">
          {/* The A4 invoice scales down to fit the column: always fully visible, no sideways scrolling */}
          <div>
            <FitToWidth width={760}>
              <SaleInvoice sale={sale} settings={settings} />
            </FitToWidth>
          </div>
        </div>

        <div className="no-print space-y-4">
          <Card title="Payment Status">
            <dl className="space-y-1.5 text-sm">
              <Row label="Invoice Total" value={inr(total)} />
              <Row label="Paid" value={inr(paid)} />
              <div className="flex justify-between border-t border-slate-100 pt-1.5">
                <dt className="font-medium text-slate-700">Balance due</dt>
                <dd className={balance > 0 && !cancelled ? "num font-semibold text-red-600" : "num font-semibold text-slate-800"}>
                  {cancelled ? "—" : inr(balance)}
                </dd>
              </div>
            </dl>
            {sale.customer && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Customer:{" "}
                {can("customers.view") ? (
                  <Link href={`/customers/${sale.customer.id}`} className="font-medium text-brand-700 hover:underline">
                    {sale.customer.name}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-800">{sale.customer.name}</span>
                )}{" "}
                · total due {inr(sale.customer.balance)}
              </p>
            )}
            {/* Internal reference: this panel is no-print, so the agent never reaches the printed bill / PDF */}
            {sale.agent && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Agent: <span className="font-mono font-medium text-slate-800">{sale.agent.agentId}</span> ·{" "}
                {[sale.agent.firstName, sale.agent.lastName].filter(Boolean).join(" ")}
              </p>
            )}
          </Card>

          <Card title="Payments" bodyClassName="p-0">
            {sale.payments?.length ? (
              <ul className="divide-y divide-slate-100">
                {sale.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-slate-800">{p.paymentNo}</p>
                      <p className="text-xs text-slate-500">
                        {date(p.paymentDate)} · {modeLabel(p.mode)}
                        {p.reference && ` · ${p.reference}`}
                      </p>
                    </div>
                    <span className="num shrink-0 font-medium text-brand-700">{inr(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No payments recorded</p>
            )}
          </Card>

          <Card title="Returns" bodyClassName="p-0">
            {sale.returns?.length ? (
              <ul className="divide-y divide-slate-100">
                {sale.returns.map((r) => (
                  <li key={r.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{r.returnNo}</p>
                        <p className="text-xs text-slate-500">
                          {date(r.returnDate)} · refund {r.refundMode === "CREDIT" ? "as credit note" : r.refundMode}
                        </p>
                      </div>
                      <span className="num shrink-0 font-medium text-amber-700">{inr(r.totalAmount)}</span>
                    </div>
                    <ul className="mt-1 text-xs text-slate-600">
                      {r.items.map((ri) => {
                        const si = sale.items?.find((i) => i.id === ri.saleItemId);
                        return (
                          <li key={ri.id}>
                            {si?.productName ?? "Item"} × {qty(ri.quantity)} {si?.unit}
                          </li>
                        );
                      })}
                    </ul>
                    {r.reason && <p className="mt-1 text-xs italic text-slate-500">{r.reason}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No returns</p>
            )}
          </Card>
        </div>
      </div>

      <PrintPortal className="thermal-host">
        <ThermalReceipt data={receiptFromSale(sale)} settings={settings} width={receiptWidth(settings)} />
      </PrintPortal>

      {sale.customerId && (
        <RecordPaymentModal
          open={payOpen}
          sale={sale}
          balance={balance}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false);
            void reload();
          }}
        />
      )}
      <ReturnModal
        open={returnOpen}
        sale={sale}
        onClose={() => setReturnOpen(false)}
        onSaved={() => {
          setReturnOpen(false);
          void reload();
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num text-slate-800">{value}</dd>
    </div>
  );
}

interface PayProps {
  open: boolean;
  sale: Sale;
  balance: number;
  onClose: () => void;
  onSaved: () => void;
}

function RecordPaymentModal(props: PayProps) {
  return props.open ? <RecordPaymentBody {...props} /> : null;
}

function RecordPaymentBody({ open, sale, balance, onClose, onSaved }: PayProps) {
  const toast = useToast();
  const { can } = useAuth();
  const [amount, setAmount] = useState(String(balance));
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [saving, setSaving] = useState(false);
  // Credit notes the customer still holds can settle the bill without money moving
  const { data: cust } = useApi<Customer>(sale.customerId && can("customers.view") ? `/customers/${sale.customerId}` : null);
  const credit = round2(n(cust?.creditNoteBalance));
  const modes: PaymentMode[] = credit > 0 ? [...RECEIPT_MODES, "CREDIT_NOTE"] : RECEIPT_MODES;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amt = n(amount);
    if (amt <= 0) return toast.error("Enter an amount");
    if (amt > balance + 0.004) return toast.error(`Amount cannot exceed the balance of ${inr(balance)}`);
    if (mode === "CREDIT_NOTE" && amt > credit + 0.004) return toast.error(`Only ${inr(credit)} of credit note is available`);
    setSaving(true);
    try {
      await api.post("/payments", {
        partyType: "CUSTOMER",
        partyId: sale.customerId,
        documentId: sale.id,
        amount: amt,
        mode,
        reference: reference.trim() || undefined,
        paymentDate: payDate || undefined,
        notes: `Against ${sale.invoiceNo}`,
      });
      toast.success(`Payment of ${inr(amt)} recorded`);
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record Payment · ${sale.invoiceNo}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="sale-pay-form" loading={saving}>
            Save Payment
          </Button>
        </>
      }
    >
      <form id="sale-pay-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Balance due on this invoice: <span className="num font-semibold text-red-600">{inr(balance)}</span>
        </p>
        <Field label="Amount (₹)" required>
          <Input type="number" step="0.01" min="0.01" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus className="num" />
        </Field>
        <Field label="Mode" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {modes.map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
                {m === "CREDIT_NOTE" ? ` (${inr(credit)} available)` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <DateInput value={payDate} max={today()} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        <Field label="Reference" hint="UTR / cheque no.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={mode === "CASH" || mode === "CREDIT_NOTE"} />
        </Field>
      </form>
    </Modal>
  );
}

interface ReturnProps {
  open: boolean;
  sale: Sale;
  onClose: () => void;
  onSaved: () => void;
}

function ReturnModal(props: ReturnProps) {
  return props.open ? <ReturnBody {...props} /> : null;
}

function ReturnBody({ open, sale, onClose, onSaved }: ReturnProps) {
  const toast = useToast();
  const [qtys, setQtys] = useState<Record<string, string>>({});
  // Default to a credit note when the invoice still has a balance due
  const [refundMode, setRefundMode] = useState<PaymentMode>(
    sale.customerId && n(sale.totalAmount) - n(sale.paidAmount) > 0 ? "CREDIT" : "CASH",
  );
  const [reason, setReason] = useState("");
  const [govtRef, setGovtRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [need, setNeed] = useState<ApprovalNeed | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const items = useMemo(
    () => (sale.items ?? []).map((i) => ({ ...i, left: round2(n(i.quantity) - n(i.returnedQty)) })).filter((i) => i.left > 0),
    [sale.items],
  );
  // Subsidised fertiliser has to be reversed on the government POS before it comes back
  const subsidisedReturn = items.some((i) => i.product?.isSubsidised && n(qtys[i.id]) > 0);

  const refund = round2(
    items.reduce((s, i) => s + (n(i.amount) / n(i.quantity)) * Math.min(n(qtys[i.id]), i.left), 0),
  );

  async function save(e: React.FormEvent | null, approvalId?: string) {
    e?.preventDefault();
    const lines = items.filter((i) => n(qtys[i.id]) > 0).map((i) => ({ saleItemId: i.id, quantity: n(qtys[i.id]) }));
    if (!lines.length) return toast.error("Enter the quantity being returned");
    const over = items.find((i) => n(qtys[i.id]) > i.left);
    if (over) return toast.error(`Only ${qty(over.left)} ${over.unit} of ${over.productName} can be returned`);
    if (subsidisedReturn && !govtRef.trim()) return toast.error("Enter the reversal reference from the govt fertiliser POS first");
    setSaving(true);
    try {
      const r = await api.post<{ returnNo: string }>(`/sales/${sale.id}/returns`, {
        items: lines,
        refundMode,
        reason: reason.trim() || undefined,
        govtReversalRef: govtRef.trim() || undefined,
        approvalId,
      });
      toast.success(`Return ${r.returnNo} saved`);
      onSaved();
    } catch (err) {
      const approval = approvalNeeded(err, { invoiceNo: sale.invoiceNo, customer: sale.customer?.name ?? sale.customerName ?? "Walk-in", refundMode, total: refund });
      if (approval) setNeed(approval);
      else toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={`Return Items · ${sale.invoiceNo}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="sale-return-form" loading={saving} disabled={refund <= 0}>
            Save return · {inr(refund)}
          </Button>
        </>
      }
    >
      <form id="sale-return-form" onSubmit={save} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2">Batch</th>
                <th className="py-2 pr-2 text-right">Sold</th>
                <th className="py-2 pr-2 text-right">Returnable</th>
                <th className="py-2 pr-2 text-right">Unit value</th>
                <th className="w-28 py-2 text-right">Return qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const bad = n(qtys[i.id]) > i.left;
                return (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-medium text-slate-800">{i.productName}</td>
                    <td className="py-2 pr-2 text-xs text-slate-500">{i.batchNo || "—"}</td>
                    <td className="num py-2 pr-2 text-right">
                      {qty(i.quantity)} {i.unit}
                    </td>
                    <td className="num py-2 pr-2 text-right">{qty(i.left)}</td>
                    <td className="num py-2 pr-2 text-right">{inr(n(i.amount) / n(i.quantity))}</td>
                    <td className="py-2">
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        max={i.left}
                        value={qtys[i.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => setQtys((s) => ({ ...s, [i.id]: e.target.value }))}
                        className={bad ? "num border-red-400 text-right" : "num text-right"}
                        aria-label={`Return quantity of ${i.productName}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Refund Mode" required hint={refundMode === "CREDIT" ? "Reduces the customer's dues" : "Money handed back now"}>
            <Select value={refundMode} onChange={(e) => setRefundMode(e.target.value as PaymentMode)}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK">Bank</option>
              {sale.customerId && <option value="CREDIT">Credit Note (Adjust Dues)</option>}
            </Select>
          </Field>
          <Field label="Reason" className="sm:col-span-2">
            <Textarea rows={1} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong product, damaged pack" />
          </Field>
          {subsidisedReturn && (
            <Field label="Govt POS Reversal Reference" required className="sm:col-span-3" hint="Reverse the sale on the government fertiliser device first, then enter its reference here">
              <Input value={govtRef} onChange={(e) => setGovtRef(e.target.value)} className="font-mono" />
            </Field>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            <FileText className="size-4" />
            Terms & Conditions
            <span className="text-red-500">*</span>
          </button>
          <p className="text-sm text-slate-600">
            Refund amount: <span className="num text-base font-semibold text-slate-900">{inr(refund)}</span>
          </p>
        </div>
      </form>
    </Modal>
    <LazyReturnTermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    <ApprovalGate
      need={need}
      onClose={() => setNeed(null)}
      onApproved={(id, by) => {
        setNeed(null);
        toast.success(`Approved by ${by}`);
        void save(null, id);
      }}
    />
    </>
  );
}
