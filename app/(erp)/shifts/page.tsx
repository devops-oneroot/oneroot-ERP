"use client";

import { Banknote, CheckCircle2, Landmark, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useState } from "react";
import { useNeedBranch } from "@/components/BranchNotice";
import {
  Badge,
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  LoadingRow,
  Modal,
  PageHeader,
  Pagination,
  RowAction,
  Select,
  StatCard,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, inr, inr0, n, round2, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { BankDeposit, CashReconciliation, Paged, Shift, StoreSettings } from "@/lib/types";

type Tab = "shifts" | "deposits";
const NOTES = [500, 200, 100, 50, 20, 10] as const;

export default function ShiftsPage() {
  const toast = useToast();
  const { can } = useAuth();
  const needBranch = useNeedBranch("open a shift in it");
  const [tab, setTab] = useState<Tab>("shifts");
  const [version, setVersion] = useState(0);
  const [openOpen, setOpenOpen] = useState(false);
  const [closeFor, setCloseFor] = useState<Shift | null>(null);
  const [depositFor, setDepositFor] = useState<Shift | null | "any">(null);
  const current = useApi<Shift | null>(needBranch.blocked ? null : "/shifts/current");
  const recon = useApi<CashReconciliation>(can("cash.manage") && !needBranch.blocked ? "/shifts/reconciliation" : null);
  const { data: settings } = useApi<StoreSettings>("/settings");

  const refresh = () => {
    void current.reload();
    void recon.reload();
    setVersion((v) => v + 1);
  };

  const shift = current.data ?? null;
  const b = shift?.breakdown;

  return (
    <>
      <PageHeader
        title="Shifts & Cash"
        subtitle="Open the drawer with a float, count it at close, bank the cash next morning — every gap needs a reason"
        actions={
          <>
            {shift ? (
              <Button icon={<LockKeyhole className="size-4" />} onClick={() => setCloseFor(shift)}>
                Close shift {shift.shiftNo}
              </Button>
            ) : (
              <Button icon={<LockKeyholeOpen className="size-4" />} onClick={() => setOpenOpen(true)} disabled={needBranch.blocked}>
                Open Shift
              </Button>
            )}
            {can("cash.manage") && (
              <Button variant="secondary" icon={<Landmark className="size-4" />} onClick={() => setDepositFor("any")} disabled={needBranch.blocked}>
                Bank Deposit
              </Button>
            )}
          </>
        }
      />
      {needBranch.notice && <div className="mb-4">{needBranch.notice}</div>}

      {shift && b && (
        <Card className="mb-4" title={`Your Open Shift · ${shift.shiftNo}`} actions={<span className="text-xs text-slate-500">opened {dateTime(shift.openedAt)}</span>}>
          <div className={cx("grid grid-cols-2 gap-3 sm:grid-cols-3", b.cashCancellations ? "lg:grid-cols-7" : "lg:grid-cols-6")}>
            <Mini label="Opening Float" value={inr(b.openingFloat)} />
            <Mini label="Cash Sales & Receipts" value={inr(b.cashSales)} tone="green" />
            <Mini label="Cash Paid to Vendors" value={inr(b.vendorCashPayments)} />
            <Mini label="Cash Expenses" value={inr(b.cashExpenses)} />
            <Mini label="Cash Refunds" value={inr(b.cashRefunds)} />
            {!!b.cashCancellations && <Mini label="Cancelled Bills (Cash Back)" value={inr(b.cashCancellations)} />}
            <Mini label="Expected in Drawer" value={inr(b.expected)} strong />
          </div>
          {!settings?.requireOpenShift && can("admin.settings") && (
            <p className="mt-3 text-xs text-slate-500">Billing is allowed without a shift right now. Switch on &quot;No billing without an open shift&quot; in Store Settings to enforce it.</p>
          )}
        </Card>
      )}

      {recon.data && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label={`To Bank (Last ${recon.data.days} Days)`} value={inr0(recon.data.toDeposit)} icon={<Banknote />} />
          <StatCard label="Deposited" value={inr0(recon.data.deposited)} tone="green" icon={<Landmark />} />
          <StatCard label="Not Yet Banked" value={inr0(recon.data.gap)} tone={recon.data.gap > 0 ? "amber" : "slate"} />
          <StatCard label="Unexplained Gaps" value={recon.data.unexplained} tone={recon.data.unexplained ? "red" : "green"} sub={recon.data.unexplained ? "Need a reason and the owner's sign-off" : "All explained"} />
          <StatCard label="Open Shifts Now" value={recon.data.openShifts} />
        </div>
      )}

      {/* Bank deposits are only for whoever reconciles the cash */}
      {can("cash.manage") && (
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "shifts", label: "Shifts" },
            { value: "deposits", label: "Bank Deposits" },
          ]}
        />
      )}
      {(tab === "shifts" || !can("cash.manage")) && <ShiftsTab key={version} onDeposit={(s) => setDepositFor(s)} onClose={(s) => setCloseFor(s)} />}
      {tab === "deposits" && can("cash.manage") && <DepositsTab key={version} onChanged={refresh} />}

      <OpenShiftModal
        open={openOpen}
        onClose={() => setOpenOpen(false)}
        onSaved={() => {
          setOpenOpen(false);
          toast.success("Shift opened");
          refresh();
        }}
      />
      <CloseShiftModal
        shift={closeFor}
        onClose={() => setCloseFor(null)}
        onSaved={(s) => {
          setCloseFor(null);
          toast.success(`Shift closed · ${inr(n(s.toDeposit))} to bank`);
          refresh();
        }}
      />
      <DepositModal
        target={depositFor}
        onClose={() => setDepositFor(null)}
        onSaved={() => {
          setDepositFor(null);
          toast.success("Deposit recorded");
          refresh();
        }}
      />
    </>
  );
}

function Mini({ label, value, tone, strong }: { label: string; value: string; tone?: "green"; strong?: boolean }) {
  return (
    <div className={cx("min-w-0 rounded-lg px-3 py-2", strong ? "bg-brand-50" : "bg-slate-50")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("num mt-0.5 break-words text-base font-semibold", tone === "green" ? "text-brand-700" : strong ? "text-brand-800" : "text-slate-900")}>{value}</p>
    </div>
  );
}

// ───────────────────────── Shifts list ─────────────────────────

function ShiftsTab({ onDeposit, onClose }: { onDeposit: (s: Shift) => void; onClose: (s: Shift) => void }) {
  const { can, user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useApi<Paged<Shift>>("/shifts", { page, pageSize: 20, status });
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <Card bodyClassName="p-0">
      <div className="flex items-center gap-2 border-b border-slate-100 p-3">
        <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-36" aria-label="Status">
          <option value="">All Shifts</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </Select>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Shift</Th>
            <Th>Cashier</Th>
            <Th>Opened</Th>
            <Th>Closed</Th>
            <Th right>Float</Th>
            <Th right>Expected</Th>
            <Th right>Counted</Th>
            <Th right>Difference</Th>
            <Th right>To Bank</Th>
            <Th>Banked</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {loading && !data ? (
            <LoadingRow colSpan={11} />
          ) : !data?.items.length ? (
            <EmptyRow colSpan={11}>No shifts yet — open one with the drawer&apos;s opening cash</EmptyRow>
          ) : (
            data.items.map((s) => {
              const diff = n(s.difference);
              const closed = s.status === "CLOSED";
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{s.shiftNo}</Td>
                  <Td>{s.openedBy?.name}</Td>
                  <Td className="whitespace-nowrap text-xs">{dateTime(s.openedAt)}</Td>
                  <Td className="whitespace-nowrap text-xs">{s.closedAt ? dateTime(s.closedAt) : <Badge tone="green">Open</Badge>}</Td>
                  <Td right>{inr(s.openingFloat)}</Td>
                  <Td right>{closed ? inr(n(s.expectedCash)) : "—"}</Td>
                  <Td right>{closed ? inr(n(s.countedCash)) : "—"}</Td>
                  <Td right className={cx(diff !== 0 && "font-medium text-red-600")}>
                    {closed ? (diff === 0 ? "—" : inr(diff)) : "—"}
                    {closed && s.differenceReason && <p className="max-w-40 truncate text-[11px] font-normal text-slate-500">{s.differenceReason}</p>}
                  </Td>
                  <Td right className="font-medium">{closed ? inr(n(s.toDeposit)) : "—"}</Td>
                  <Td>
                    {closed ? (
                      n(s.depositGap) <= 0 ? (
                        <Badge tone={s.unexplainedGap ? "red" : "green"}>{s.unexplainedGap ? "Gap Unexplained" : "Banked"}</Badge>
                      ) : (s.deposited ?? 0) > 0 ? (
                        <Badge tone="amber">{inr0(n(s.depositGap))} left</Badge>
                      ) : (
                        <Badge tone="amber">Not Banked</Badge>
                      )
                    ) : null}
                  </Td>
                  <Td right>
                    {!closed && (s.openedById === user?.id || can("cash.manage")) && (
                      <Button size="sm" variant="secondary" onClick={() => onClose(s)}>
                        Close
                      </Button>
                    )}
                    {closed && n(s.depositGap) > 0 && can("cash.manage") && (
                      <Button size="sm" variant="secondary" icon={<Landmark className="size-4" />} onClick={() => onDeposit(s)}>
                        Deposit
                      </Button>
                    )}
                  </Td>
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

// ───────────────────────── Deposits list ─────────────────────────

function DepositsTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can, isAdmin } = useAuth();
  const [page, setPage] = useState(1);
  const [slip, setSlip] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Paged<BankDeposit>>("/deposits", { page, pageSize: 20 });

  async function resolve(d: BankDeposit) {
    if (!(await confirm(`Mark the ${inr(Math.abs(n(d.difference)))} gap on ${d.depositNo} as explained and resolved?`, { confirmLabel: "Resolve" }))) return;
    try {
      await api.patch(`/deposits/${d.id}/resolve`);
      toast.success("Gap resolved");
      void reload();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function remove(d: BankDeposit) {
    if (!(await confirm(`Delete deposit ${d.depositNo}? The bank entry in the books is reversed.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/deposits/${d.id}`);
      toast.success("Deposit deleted");
      void reload();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function showSlip(d: BankDeposit) {
    try {
      const r = await api.get<{ slipImage: string | null }>(`/deposits/${d.id}/slip`);
      if (r.slipImage) setSlip(r.slipImage);
      else toast.error("No slip photo on this deposit");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Deposit</Th>
              <Th>Date</Th>
              <Th>For Shift</Th>
              <Th>Bank / Ref</Th>
              <Th right>Amount</Th>
              <Th right>Gap</Th>
              <Th>Reason</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={9} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={9}>No bank deposits recorded yet</EmptyRow>
            ) : (
              data.items.map((d) => {
                const gap = n(d.difference);
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-xs">{d.depositNo}</Td>
                    <Td className="whitespace-nowrap">{date(d.depositDate)}</Td>
                    <Td className="text-xs">
                      {d.shift ? (
                        <>
                          {d.shift.shiftNo}
                          <span className="block text-slate-500">
                            {d.shift.openedBy?.name} · {date(d.shift.openedAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="text-xs">{[d.bankAccount, d.reference].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td right className="font-medium">{inr(d.amount)}</Td>
                    <Td right className={cx(gap !== 0 && "font-medium text-red-600")}>{gap === 0 ? "—" : inr(gap)}</Td>
                    <Td className="max-w-56 truncate text-xs text-slate-600">{d.reason || "—"}</Td>
                    <Td>
                      {gap === 0 ? (
                        <Badge tone="green">Tallies</Badge>
                      ) : d.resolvedAt ? (
                        <Badge tone="slate">Resolved {date(d.resolvedAt)}</Badge>
                      ) : (
                        <Badge tone="red">Gap Open</Badge>
                      )}
                    </Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        {d.slipImage && (
                          <Button size="sm" variant="ghost" onClick={() => showSlip(d)}>
                            Slip
                          </Button>
                        )}
                        {gap !== 0 && !d.resolvedAt && isAdmin && (
                          <Button size="sm" variant="secondary" icon={<CheckCircle2 className="size-4" />} onClick={() => resolve(d)}>
                            Resolve
                          </Button>
                        )}
                        {can("cash.manage") && <RowAction kind="delete" title={`Delete deposit ${d.depositNo}`} onClick={() => remove(d)} />}
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
      <Modal open={!!slip} onClose={() => setSlip(null)} title="Deposit Slip" size="md">
        {slip && <img src={slip} alt="Deposit slip" className="max-h-[65vh] w-full rounded-lg object-contain" />}
      </Modal>
    </>
  );
}

// ───────────────────────── Open shift ─────────────────────────

function OpenShiftModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  return open ? <OpenShiftBody onClose={onClose} onSaved={onSaved} /> : null;
}

function OpenShiftBody({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [float, setFloat] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/shifts", { openingFloat: n(float) });
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Open Shift"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="open-shift" loading={saving}>
            Open Shift
          </Button>
        </>
      }
    >
      <form id="open-shift" onSubmit={save}>
        <Field label="Opening Cash in the Drawer (₹)" required hint="Count the float before the first bill">
          <Input type="number" step="1" min="0" value={float} onChange={(e) => setFloat(e.target.value)} autoFocus required className="num text-lg" />
        </Field>
      </form>
    </Modal>
  );
}

// ───────────────────────── Close shift ─────────────────────────

export function CloseShiftModal({ shift, onClose, onSaved }: { shift: Shift | null; onClose: () => void; onSaved: (s: Shift) => void }) {
  return shift ? <CloseShiftBody shift={shift} onClose={onClose} onSaved={onSaved} /> : null;
}

function CloseShiftBody({ shift, onClose, onSaved }: { shift: Shift; onClose: () => void; onSaved: (s: Shift) => void }) {
  const toast = useToast();
  const { data: live } = useApi<Shift>(`/shifts/${shift.id}`);
  const b = live?.breakdown ?? shift.breakdown;
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState("");
  const [override, setOverride] = useState<string | null>(null);
  const [floatKept, setFloatKept] = useState(String(n(shift.openingFloat)));
  // const [handedTo, setHandedTo] = useState(""); // the Cash Handed To field is commented out below
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const noteTotal = round2(NOTES.reduce((s, d) => s + d * (Number(counts[d]) || 0), 0) + n(coins));
  const counted = override !== null ? n(override) : noteTotal;
  const expected = b?.expected ?? 0;
  const diff = round2(counted - expected);
  const toBank = round2(Math.max(0, counted - n(floatKept)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (Math.abs(diff) >= 0.5 && !reason.trim()) return toast.error(`Counted cash differs by ${inr(diff)} — enter the reason`);
    setSaving(true);
    try {
      const noteCounts: Record<string, number> = {};
      for (const d of NOTES) if (Number(counts[d])) noteCounts[d] = Number(counts[d]);
      if (n(coins)) noteCounts.coins = n(coins);
      const s = await api.post<Shift>(`/shifts/${shift.id}/close`, {
        noteCounts,
        countedCash: counted,
        floatKept: n(floatKept),
        // handedTo: handedTo.trim() || undefined,
        differenceReason: reason.trim() || undefined,
      });
      onSaved(s);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Close Shift · ${shift.shiftNo}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="close-shift" loading={saving} disabled={!b}>
            Close Shift
          </Button>
        </>
      }
    >
      <form id="close-shift" onSubmit={save} className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Expected in Drawer</p>
          {b ? (
            <dl className="space-y-1 text-sm">
              <Row l="Opening Float" v={inr(b.openingFloat)} />
              <Row l="Cash Sales & Receipts" v={`+ ${inr(b.cashSales)}`} />
              <Row l="Paid to Vendors (Cash)" v={`− ${inr(b.vendorCashPayments)}`} />
              <Row l="Cash Expenses" v={`− ${inr(b.cashExpenses)}`} />
              <Row l="Cash Refunds" v={`− ${inr(b.cashRefunds)}`} />
              {!!b.cashCancellations && <Row l="Cancelled Bills (Cash Back)" v={`− ${inr(b.cashCancellations)}`} />}
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <dt>Expected</dt>
                <dd className="num">{inr(b.expected)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
          <p className="mt-2 text-[11px] text-slate-400">Worked out from the bills, receipts and expenses on this shift — never typed.</p>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Count by Note</p>
          <div className="space-y-1.5">
            {NOTES.map((d) => (
              <div key={d} className="flex items-center gap-2 text-sm">
                <span className="w-14 text-slate-600">₹{d} ×</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={counts[d] ?? ""}
                  onChange={(e) => {
                    setCounts((c) => ({ ...c, [d]: e.target.value }));
                    setOverride(null);
                  }}
                  className="num h-8 w-20 text-right"
                  aria-label={`Number of ₹${d} notes`}
                />
                <span className="num ml-auto text-slate-700">{inr(d * (Number(counts[d]) || 0))}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm">
              <span className="w-14 text-slate-600">Coins ₹</span>
              <Input type="number" min="0" step="1" value={coins} onChange={(e) => (setCoins(e.target.value), setOverride(null))} className="num h-8 w-20 text-right" aria-label="Coins amount" />
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
              <span>Counted</span>
              <Input type="number" min="0" step="1" value={override ?? String(noteTotal)} onChange={(e) => setOverride(e.target.value)} className="num h-8 w-28 text-right font-semibold" aria-label="Counted cash" />
            </div>
            <p className={cx("text-right text-xs font-medium", Math.abs(diff) < 0.5 ? "text-brand-700" : "text-red-600")}>
              {Math.abs(diff) < 0.5 ? "Matches expected" : `${diff > 0 ? "Excess" : "Short"} ${inr(Math.abs(diff))}`}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <Field label="Keep as Tomorrow's Float (₹)">
            <Input type="number" min="0" step="1" value={floatKept} onChange={(e) => setFloatKept(e.target.value)} className="num" />
          </Field>
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm">
            <span className="text-slate-600">To deposit</span>
            <span className="num float-right font-semibold text-brand-800">{inr(toBank)}</span>
          </div>
          {/* Saved with the shift but never shown anywhere afterwards
          <Field label="Cash Handed To">
            <Input value={handedTo} onChange={(e) => setHandedTo(e.target.value)} placeholder="e.g. Store manager · Prakash" />
          </Field>
          */}
          {Math.abs(diff) >= 0.5 && (
            <Field label="Reason for the Difference" required>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ₹200 paid to auto driver, voucher attached" />
            </Field>
          )}
        </div>
      </form>
    </Modal>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{l}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}

// ───────────────────────── Bank deposit ─────────────────────────

function DepositModal({ target, onClose, onSaved }: { target: Shift | "any" | null; onClose: () => void; onSaved: () => void }) {
  return target ? <DepositBody preset={target === "any" ? null : target} onClose={onClose} onSaved={onSaved} /> : null;
}

/** Downscale the slip photo in the browser so it stays small in the database */
async function shrinkImage(file: File, max = 1000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function DepositBody({ preset, onClose, onSaved }: { preset: Shift | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: closed } = useApi<Paged<Shift>>("/shifts", { status: "CLOSED", pageSize: 30 });
  const pending = (closed?.items ?? []).filter((s) => n(s.depositGap) > 0);
  const [shiftId, setShiftId] = useState(preset?.id ?? "");
  const chosen = preset && preset.id === shiftId ? preset : pending.find((s) => s.id === shiftId) ?? null;
  const gapOf = (s: Shift | null) => (s ? round2(n(s.depositGap ?? n(s.toDeposit))) : 0);
  const [amount, setAmount] = useState(preset ? String(gapOf(preset)) : "");
  const [depositDate, setDepositDate] = useState(today());
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [slip, setSlip] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const diff = chosen ? round2(gapOf(chosen) - n(amount)) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (n(amount) <= 0) return toast.error("Enter the amount deposited");
    if (diff !== 0 && !reason.trim()) return toast.error(`${inr(Math.abs(diff))} ${diff > 0 ? "less" : "more"} than the shift's cash — enter the reason`);
    setSaving(true);
    try {
      await api.post("/deposits", {
        shiftId: shiftId || undefined,
        amount: n(amount),
        depositDate,
        bankAccount: bank.trim() || undefined,
        reference: reference.trim() || undefined,
        slipImage: slip ?? undefined,
        reason: reason.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Bank Deposit"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="deposit-form" loading={saving}>
            Save Deposit
          </Button>
        </>
      }
    >
      <form id="deposit-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="For Shift" className="sm:col-span-2" hint="Closed shifts with cash still to bank">
          <Select
            value={shiftId}
            onChange={(e) => {
              setShiftId(e.target.value);
              const s = pending.find((x) => x.id === e.target.value) ?? (preset?.id === e.target.value ? preset : null);
              if (s) setAmount(String(gapOf(s)));
            }}
          >
            <option value="">Not Tied to a Shift</option>
            {[...(preset && !pending.some((s) => s.id === preset.id) ? [preset] : []), ...pending].map((s) => (
              <option key={s.id} value={s.id}>
                {s.shiftNo} · {s.openedBy?.name} · {date(s.openedAt)} · {inr(gapOf(s))} to bank
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount Deposited (₹)" required>
          <Input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus className="num" />
        </Field>
        <Field label="Deposit Date" required>
          <DateInput value={depositDate} max={today()} onChange={(e) => setDepositDate(e.target.value)} />
        </Field>
        <Field label="Bank Account">
          <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Current a/c ending 4417" />
        </Field>
        <Field label="Slip / Reference No.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Slip Photo" className="sm:col-span-2">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setSlip(await shrinkImage(f));
              } catch {
                toast.error("Could not read that image");
              }
            }}
          />
          {slip && <img src={slip} alt="Slip preview" className="mt-2 max-h-40 rounded-lg border border-slate-200" />}
        </Field>
        {chosen && (
          <p className={cx("sm:col-span-2 rounded-lg px-3 py-2 text-sm", diff === 0 ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-700")}>
            Shift {chosen.shiftNo} has {inr(gapOf(chosen))} to bank. {diff === 0 ? "This deposit tallies." : `Difference ${inr(Math.abs(diff))} — a reason is required and it stays red on the dashboard until the owner resolves it.`}
          </p>
        )}
        {chosen && diff !== 0 && (
          <Field label="Reason for the Difference" required className="sm:col-span-2">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ₹3,200 paid to labour, voucher attached" />
          </Field>
        )}
      </form>
    </Modal>
  );
}
