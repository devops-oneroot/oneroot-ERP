"use client";

import { ExternalLink, ReceiptText, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { approvalLevel } from "@/lib/permissions";
import { date, inr, n, qty, round2 } from "@/lib/format";
import { NOTE_REASON_LABEL, type DebitNote, type GrnItem } from "@/lib/types";
import { CancelNoteModal } from "./CancelNoteModal";
import { NoteStatusBadge, NoteTypeBadge } from "./NoteForm";
import { Button, ErrorBox, Input, Modal, Select, Spinner, cx, errMsg, useConfirm, useToast } from "./ui";

/** Why goods go back to the vendor; the label is saved on the debit note line */
export const RETURN_REASONS = ["Damage / Leakage", "Expiry date erased", "Expired product", "Short quantity received"] as const;

/** The GRN a return is raised against */
export interface ReturnGrn {
  id: string;
  grnNo: string;
  po: { id: string; poNo: string };
  vendor: { id: string; name: string };
  purchase?: { id: string; status?: string } | null;
  items: GrnItem[];
}

/**
 * Debit and credit notes for a GRN in a popup: raised against the GRN itself (e.g. goods rejected at
 * inward) or against the purchase invoice booked from it. Each note shows its lines and totals.
 * With `grn` and `canManage`, it also has a return table: Return Qty and a reason per received line,
 * which becomes a debit note (goods return) to the vendor.
 */
export function GrnNotesModal({
  open,
  onClose,
  grnNo,
  notes,
  loading,
  error,
  onRetry,
  focusId,
  grn,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  grnNo: string;
  notes: DebitNote[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Note to scroll to when the popup opens */
  focusId?: string | null;
  grn?: ReturnGrn;
  canManage?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !focusId) return;
    const t = setTimeout(() => box.current?.querySelector(`[data-note="${focusId}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
    return () => clearTimeout(t);
  }, [open, focusId]);

  const live = notes.filter((d) => d.status !== "CANCELLED");
  const total = (type: "DEBIT" | "CREDIT") => round2(live.filter((d) => d.noteType === type).reduce((s, d) => s + n(d.totalAmount), 0));

  async function send(d: DebitNote) {
    const msg = `Send ${d.dnNo} to ${d.vendor.name}? The returned quantities will be taken out of stock now and ${inr(d.totalAmount)} will be taken off what you owe the vendor. This can't be undone.`;
    if (!(await confirm(msg, { confirmLabel: "Send to vendor" }))) return;
    setBusy(d.id);
    try {
      await api.post(`/debit-notes/${d.id}/send`);
      toast.success(`${d.dnNo} sent · stock removed · payable reduced`);
      onRetry();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  // Cancelling a draft asks for the reason
  const [cancelling, setCancelling] = useState<DebitNote | null>(null);

  return (
    <>
      {cancelling && (
        <CancelNoteModal
          dn={cancelling}
          level={approvalLevel(user)}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            onRetry();
          }}
        />
      )}
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        title={
          <span className="inline-flex items-center gap-1.5">
            <ReceiptText className="size-4 text-slate-400" /> Debit &amp; Credit Notes · {grnNo}
          </span>
        }
        footer={
          <>
            <Link href="/debit-notes" className="mr-auto inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
              All notes <ExternalLink className="size-3.5" />
            </Link>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        <div ref={box} className="space-y-3">
          {grn && canManage && <ReturnTable grn={grn} notes={notes} onCreated={onRetry} />}
          {error && !notes.length ? (
            <ErrorBox message={error} onRetry={onRetry} />
          ) : loading && !notes.length ? (
            <Spinner />
          ) : !notes.length ? (
            <p className="py-6 text-center text-sm text-slate-500">No debit or credit notes for this GRN or its purchase invoice yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Figure label="Debit notes" value={inr(total("DEBIT"))} tone="text-red-700" />
                <Figure label="Credit notes" value={inr(total("CREDIT"))} tone="text-brand-700" />
                <Figure label="Notes" value={`${notes.length}${notes.length !== live.length ? ` (${notes.length - live.length} cancelled)` : ""}`} />
              </div>
              {notes.map((d) => (
                <article
                  key={d.id}
                  data-note={d.id}
                  className={cx("overflow-hidden rounded-lg border", focusId === d.id ? "border-brand-400 ring-2 ring-brand-500/20" : "border-slate-200", d.status === "CANCELLED" && "opacity-60")}
                >
                  <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                        {d.dnNo} <NoteTypeBadge type={d.noteType} /> <NoteStatusBadge status={d.status} type={d.noteType} />
                      </p>
                      <p className="text-xs text-slate-500">
                        {NOTE_REASON_LABEL[d.reasonType] ?? d.reasonType} · {date(d.noteDate)}
                        {d.po && ` · ${d.po.poNo}`}
                        {d.vendorRef && ` · vendor ref. ${d.vendorRef}`}
                        {d.purchase && ` · invoice ${d.purchase.purchaseNo}`}
                        {d.grn && !d.purchase && ` · ${d.grn.grnNo}`}
                      </p>
                      {d.reason && <p className="mt-0.5 text-sm text-slate-700">{d.reason}</p>}
                    </div>
                    <div className="text-right">
                      <p className={cx("num text-base font-semibold", d.noteType === "DEBIT" ? "text-red-700" : "text-brand-700")}>{inr(d.totalAmount)}</p>
                      <p className="num text-[11px] text-slate-500">
                        {inr(d.subtotal)} + GST {inr(d.taxAmount)}
                      </p>
                      {canManage && d.status === "DRAFT" && d.noteType === "DEBIT" && d.affectsStock && (
                        <div className="mt-1.5 flex justify-end gap-1.5">
                          {/* Only whoever raised the note can cancel it */}
                          {(!d.userId || d.userId === user?.id) && (
                            <Button size="sm" variant="secondary" onClick={() => setCancelling(d)} disabled={!!busy}>
                              Cancel
                            </Button>
                          )}
                          <Button size="sm" icon={<Send className="size-3.5" />} onClick={() => send(d)} loading={busy === d.id}>
                            Send to vendor
                          </Button>
                        </div>
                      )}
                    </div>
                  </header>
                  {d.items.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-1.5 font-medium">Item</th>
                            <th className="px-3 py-1.5 font-medium">Batch</th>
                            <th className="px-3 py-1.5 font-medium">Reason</th>
                            <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                            <th className="px-3 py-1.5 text-right font-medium">Rate</th>
                            <th className="px-3 py-1.5 text-right font-medium">GST</th>
                            <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.items.map((it) => (
                            <tr key={it.id} className="border-t border-slate-100">
                              <td className="px-3 py-1.5 text-slate-800">{it.product?.name ?? it.description ?? "—"}</td>
                              <td className="px-3 py-1.5 font-mono text-xs text-slate-600">{it.batchNo || "—"}</td>
                              <td className="px-3 py-1.5 text-xs text-slate-600">{(it.product && it.description) || "—"}</td>
                              <td className="num whitespace-nowrap px-3 py-1.5 text-right">
                                {n(it.quantity) ? `${qty(it.quantity)} ${it.product?.unit ?? ""}` : "—"}
                              </td>
                              <td className="num px-3 py-1.5 text-right">{inr(it.rate)}</td>
                              <td className="num px-3 py-1.5 text-right text-slate-500">{n(it.gstRate)}%</td>
                              <td className="num px-3 py-1.5 text-right font-medium">{inr(it.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Return table: one row per received GRN line with Return Qty and a reason; creates a draft debit note */
function ReturnTable({ grn, notes, onCreated }: { grn: ReturnGrn; notes: DebitNote[]; onCreated: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, { qty: string; reason: string }>>({});
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  // Already on a live goods-return note, per batch
  const returned = new Map<string, number>();
  for (const d of notes)
    if (d.status !== "CANCELLED" && d.noteType === "DEBIT" && d.affectsStock)
      for (const it of d.items) if (it.batchId) returned.set(it.batchId, (returned.get(it.batchId) ?? 0) + n(it.quantity));

  const lines = grn.items
    .filter((it) => n(it.passedQty) > 0)
    .map((it) => {
      const rate = round2(n(it.rate) * (1 - n(it.poItem.discountPct) / 100));
      const max = it.batchId ? Math.max(0, round2(n(it.passedQty) - (returned.get(it.batchId) ?? 0))) : 0;
      const r = rows[it.id] ?? { qty: "", reason: "" };
      const q = Number(r.qty) || 0;
      const err =
        q < 0 ? "Can't be negative" : q > max + 0.0005 ? `Only ${qty(max)} can be returned` : q > 0 && !r.reason ? "Choose a reason" : null;
      return { it, rate, max, r, q, err };
    });
  const chosen = lines.filter((l) => l.q > 0);
  const value = round2(chosen.reduce((s, l) => s + l.q * l.rate * (1 + n(l.it.poItem.gstRate) / 100), 0));
  const set = (id: string, patch: Partial<{ qty: string; reason: string }>) =>
    setRows((rs) => ({ ...rs, [id]: { ...(rs[id] ?? { qty: "", reason: "" }), ...patch } }));

  if (!lines.length) return null;

  async function create() {
    setTried(true);
    if (!chosen.length) return toast.error("Enter a return quantity on at least one line");
    const bad = lines.find((l) => l.err);
    if (bad) return toast.error(`${bad.it.product.name}: ${bad.err}`);
    setSaving(true);
    try {
      const reasons = [...new Set(chosen.map((l) => l.r.reason))];
      const dn = await api.post<{ dnNo: string }>("/debit-notes", {
        noteType: "DEBIT",
        reasonType: "RETURN",
        vendorId: grn.vendor.id,
        poId: grn.po.id,
        grnId: grn.id,
        purchaseId: grn.purchase && grn.purchase.status !== "CANCELLED" ? grn.purchase.id : undefined,
        reason: `Return against ${grn.grnNo} (${grn.po.poNo}): ${reasons.join(", ")}`,
        items: chosen.map((l) => ({
          productId: l.it.productId,
          batchId: l.it.batchId,
          description: l.r.reason,
          quantity: l.q,
          rate: l.rate,
          gstRate: n(l.it.poItem.gstRate),
        })),
      });
      toast.success(`${dn.dnNo} drafted · send it to the vendor to take the goods out of stock`);
      setRows({});
      setTried(false);
      onCreated();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <p className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
          <Undo2 className="size-4 text-slate-400" /> Return to Vendor · {grn.po.poNo}
        </p>
        <p className="text-xs text-slate-500">Enter the quantity going back and why; a debit note is drafted to {grn.vendor.name}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-1.5 font-medium">PO / Product</th>
              <th className="px-3 py-1.5 font-medium">Batch</th>
              <th className="px-3 py-1.5 text-right font-medium">Received</th>
              <th className="px-3 py-1.5 text-right font-medium">Return Qty</th>
              <th className="min-w-52 px-3 py-1.5 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ it, max, r, err }) => (
              <tr key={it.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-800">{it.product.name}</p>
                  <p className="text-xs text-slate-500">
                    {grn.po.poNo} · ordered {qty(it.poItem.quantity)} {it.product.unit}
                  </p>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{it.batchNo || "—"}</td>
                <td className="num whitespace-nowrap px-3 py-2 text-right">
                  {qty(it.passedQty)} {it.product.unit}
                  {max < n(it.passedQty) && <p className="text-[11px] text-slate-500">{qty(max)} left to return</p>}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={r.qty}
                    placeholder="0"
                    disabled={max <= 0}
                    onChange={(e) => set(it.id, { qty: e.target.value })}
                    className={cx("num ml-auto w-24 text-right", err && (tried || !err.startsWith("Choose")) && "border-red-400")}
                    aria-label={`Return quantity of ${it.product.name}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <Select value={r.reason} onChange={(e) => set(it.id, { reason: e.target.value })} aria-label={`Return reason for ${it.product.name}`}>
                    <option value="">Select reason</option>
                    {RETURN_REASONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </Select>
                  {err && (tried || !err.startsWith("Choose")) && <p className="mt-1 text-[11px] font-medium text-red-600">{err}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-3 py-2">
        {chosen.length > 0 && (
          <span className="text-sm text-slate-600">
            {chosen.length} line{chosen.length === 1 ? "" : "s"} · <b className="num text-red-700">{inr(value)}</b> incl. GST
          </span>
        )}
        <Button variant="add" size="sm" icon={<Undo2 className="size-3.5" />} onClick={create} loading={saving}>
          Create Debit Note
        </Button>
      </footer>
    </section>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("num font-semibold text-slate-900", tone)}>{value}</p>
    </div>
  );
}
