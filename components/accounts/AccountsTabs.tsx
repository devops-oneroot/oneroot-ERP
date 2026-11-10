"use client";

import { Download, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useGstSheetDownload } from "@/components/GstSheetExport";
import { CustomerPicker, VendorPicker } from "@/components/pickers";
import { ReportFrame, TotalRow, periodLabel, type Range } from "@/components/reports/ReportKit";
import {
  ActionsTd,
  ActionsTh,
  Badge,
  Button,
  Card,
  Checkbox,
  DateInput,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  LoadingRow,
  Modal,
  Pagination,
  RowAction,
  Select,
  Spinner,
  Table,
  TableStack,
  Td,
  // Textarea, // not used in any tab
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { API_URL, api, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, downloadCsv, inr, n, round2, today } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Account, AccountLedger, AccountType, BalanceSheet, Customer, JournalEntry, LedgerProfitLoss, Paged, TrialBalance, Vendor } from "@/lib/types";
import { REF_TYPE_LABEL } from "@/lib/types";

const TYPE_ORDER: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const TYPE_LABEL: Record<AccountType, string> = { ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Capital & Equity", INCOME: "Income", EXPENSE: "Expenses" };

/** Debit-positive amount shown the way an accountant reads it */
const drcr = (v: number) => (Math.abs(v) < 0.005 ? "—" : v > 0 ? `${inr(v)} Dr` : `${inr(-v)} Cr`);

// ───────────────────────── Chart of accounts ─────────────────────────

export function ChartTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { can, isAdmin } = useAuth();
  const canCreate = can("accounts.create");
  const canEdit = can("accounts.edit");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Account | null | "new">(null);
  const [rebuilding, setRebuilding] = useState(false);
  const { data, error, loading, reload } = useApi<Account[]>("/accounting/accounts", { all: showInactive ? "true" : undefined });

  async function rebuild() {
    const ok = await confirm(
      "Rebuild the ledger from every sale, purchase, payment, expense, note and stock entry? Automatic vouchers are re-created; manual vouchers are kept. Use this once when switching accounting on, or after fixing data.",
      { confirmLabel: "Rebuild Ledger" },
    );
    if (!ok) return;
    setRebuilding(true);
    try {
      const r = await api.post<{ entries: number; documents: number }>("/accounting/rebuild");
      toast.success(`Ledger rebuilt: ${r.entries} vouchers from ${r.documents} documents`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRebuilding(false);
    }
  }

  const grouped = useMemo(() => {
    const out = new Map<AccountType, Map<string, Account[]>>();
    for (const a of data ?? []) {
      const byGroup = out.get(a.type) ?? new Map<string, Account[]>();
      byGroup.set(a.group, [...(byGroup.get(a.group) ?? []), a]);
      out.set(a.type, byGroup);
    }
    return out;
  }, [data]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Checkbox label="Show Inactive" checked={showInactive} onChange={setShowInactive} />
        <div className="flex-1" />
        {isAdmin && (
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={rebuilding} onClick={rebuild}>
            Rebuild From Documents
          </Button>
        )}
        {canCreate && (
          <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New Account
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Spinner page />
      ) : (
        <div className="space-y-4">
          {TYPE_ORDER.map((t) => {
            const groups = grouped.get(t);
            if (!groups) return null;
            const total = [...groups.values()].flat().reduce((s, a) => s + (a.balance ?? 0), 0);
            return (
              <Card key={t} title={TYPE_LABEL[t]} actions={<span className="num text-sm font-semibold text-slate-700">{drcr(total)}</span>} bodyClassName="p-0">
                <Table>
                  <thead>
                    <tr>
                      <Th>Code</Th>
                      <Th>Account</Th>
                      <Th>Group</Th>
                      <Th right>Opening</Th>
                      <Th right>Debits</Th>
                      <Th right>Credits</Th>
                      <Th right>Balance</Th>
                      {canEdit && <ActionsTh />}
                    </tr>
                  </thead>
                  <tbody>
                    {[...groups.entries()].map(([g, accounts]) =>
                      accounts.map((a) => (
                        <tr key={a.id} className={cx("hover:bg-slate-50", !a.isActive && "text-slate-400")}>
                          <Td className="font-mono text-xs">{a.code}</Td>
                          <Td>
                            <Link href={`/accounts?tab=ledger&accountId=${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                              {a.name}
                            </Link>
                            {a.key && <span className="ml-1.5 text-[11px] text-slate-400">built-in</span>}
                            {!a.isActive && (
                              <span className="ml-1.5">
                                <Badge>Inactive</Badge>
                              </span>
                            )}
                          </Td>
                          <Td className="text-xs text-slate-500">{g}</Td>
                          <Td right className="text-slate-500">{drcr(a.openingBalance)}</Td>
                          <Td right>{a.debit ? inr(a.debit) : "—"}</Td>
                          <Td right>{a.credit ? inr(a.credit) : "—"}</Td>
                          <Td right className="font-semibold text-slate-900">{drcr(a.balance ?? 0)}</Td>
                          {canEdit && (
                            <ActionsTd>
                              <RowAction kind="edit" title={`Edit ${a.name}`} onClick={() => setEditing(a)} />
                            </ActionsTd>
                          )}
                        </tr>
                      )),
                    )}
                  </tbody>
                </Table>
              </Card>
            );
          })}
        </div>
      )}
      <AccountModal
        open={editing !== null}
        account={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
    </>
  );
}

function AccountModal({ open, account, onClose, onSaved }: { open: boolean; account: Account | null; onClose: () => void; onSaved: () => void }) {
  return open ? <AccountModalBody account={account} onClose={onClose} onSaved={onSaved} /> : null;
}

function AccountModalBody({ account, onClose, onSaved }: { account: Account | null; onClose: () => void; onSaved: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: groups } = useApi<Record<AccountType, string[]>>("/accounting/groups");
  const editing = !!account;
  const [code, setCode] = useState(account?.code ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "EXPENSE");
  const [group, setGroup] = useState(account?.group ?? "Indirect Expenses");
  const [opening, setOpening] = useState(String(Math.abs(account?.openingBalance ?? 0) || ""));
  const [side, setSide] = useState<"Dr" | "Cr">((account?.openingBalance ?? 0) < 0 ? "Cr" : "Dr");
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const options = groups?.[type] ?? [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Enter a name");
    const openingBalance = (n(opening) || 0) * (side === "Cr" ? -1 : 1);
    setSaving(true);
    try {
      if (editing) await api.patch(`/accounting/accounts/${account!.id}`, { name: name.trim(), group, openingBalance, isActive });
      else await api.post("/accounting/accounts", { code: code.trim(), name: name.trim(), type, group, openingBalance });
      toast.success(editing ? "Account updated" : "Account created");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!account || !(await confirm(`Delete account ${account.name}? Only possible when it has no entries.`, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.del(`/accounting/accounts/${account.id}`);
      toast.success("Account deleted");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${account!.name}` : "New Ledger Account"}
      size="sm"
      footer={
        <>
          {editing && !account!.isSystem && can("accounts.delete") && (
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="account-form" loading={saving}>
            {editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="account-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Code" required hint="e.g. 1030 for a second bank">
          <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={editing} required className="font-mono" />
        </Field>
        <Field label="Type" required>
          <Select
            value={type}
            disabled={editing}
            onChange={(e) => {
              const t = e.target.value as AccountType;
              setType(t);
              setGroup(groups?.[t]?.[0] ?? "");
            }}
          >
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Group" required className="sm:col-span-2" hint="Tally group — used when exporting">
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            {(options.includes(group) ? options : [group, ...options]).map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="Opening Balance (₹)" hint="As on the day you started the books">
          <Input type="number" step="0.01" min="0" value={opening} onChange={(e) => setOpening(e.target.value)} className="num" />
        </Field>
        <Field label="Side">
          <Select value={side} onChange={(e) => setSide(e.target.value as "Dr" | "Cr")}>
            <option>Dr</option>
            <option>Cr</option>
          </Select>
        </Field>
        {editing && !account!.key && (
          <div className="sm:col-span-2">
            <Checkbox label="Active" checked={isActive} onChange={setIsActive} />
          </div>
        )}
      </form>
    </Modal>
  );
}

// ───────────────────────── Vouchers / day book ─────────────────────────

export function DayBookTab({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { can } = useAuth();
  const [refType, setRefType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const q = useDebounced(search);
  const { data, error, loading, reload } = useApi<Paged<JournalEntry>>("/accounting/entries", { ...range, refType, search: q, page, pageSize: 30 });

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-surface p-3 shadow-sm">
        {rangeBar}
        <Select value={refType} onChange={(e) => (setRefType(e.target.value), setPage(1))} className="w-full sm:w-44" aria-label="Voucher type">
          <option value="">All Vouchers</option>
          {Object.entries(REF_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} placeholder="Voucher / bill no. / narration" className="w-full sm:w-56" />
        {can("accounts.create") && (
          <>
            <div className="flex-1" />
            <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setManual(true)}>
              New Voucher
            </Button>
          </>
        )}
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : (
        <Card bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Voucher</Th>
                <Th>Type</Th>
                <Th>Reference</Th>
                <Th>Narration</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={6} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={6}>No vouchers in this period</EmptyRow>
              ) : (
                data.items.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(e.id)}>
                    <Td className="whitespace-nowrap">{date(e.date)}</Td>
                    <Td className="font-mono text-xs">{e.entryNo}</Td>
                    <Td>
                      <Badge tone={e.refType === "REVERSAL" ? "red" : e.isManual ? "violet" : "slate"}>{REF_TYPE_LABEL[e.refType] ?? e.refType}</Badge>
                    </Td>
                    <Td className="text-xs">{e.refNo ?? "—"}</Td>
                    <Td className="max-w-md truncate text-xs text-slate-600">{e.narration ?? "—"}</Td>
                    <Td right className="font-medium">{inr(e.amount ?? 0)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
        </Card>
      )}
      <EntryModal id={open} onClose={() => setOpen(null)} onChanged={reload} />
      <ManualVoucherModal
        open={manual}
        onClose={() => setManual(false)}
        onSaved={() => {
          setManual(false);
          void reload();
        }}
      />
    </>
  );
}

export function EntryModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  return id ? <EntryModalBody id={id} onClose={onClose} onChanged={onChanged} /> : null;
}

function EntryModalBody({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const { data: e, error, loading } = useApi<JournalEntry>(`/accounting/entries/${id}`);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!e || !(await confirm(`Delete voucher ${e.entryNo}? Party balances it changed are put back.`, { danger: true, confirmLabel: "Delete Voucher" }))) return;
    setBusy(true);
    try {
      await api.del(`/accounting/entries/${e.id}`);
      toast.success("Voucher deleted");
      onChanged?.();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  // Only link to a bill the user can open
  const docLink = e?.refId
    ? e.refType === "SALE" || (e.refType === "REVERSAL" && /^IN[VP]\//.test(e.refNo ?? ""))
      ? can("sales.view") && `/sales/${e.refId}`
      : e.refType === "PURCHASE"
        ? can("invoices.view") && `/purchases/${e.refId}`
        : e.refType === "GRN"
          ? can("grn.view") && `/goods-inward/${e.refId}`
          : null
    : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={e ? `${e.entryNo} · ${REF_TYPE_LABEL[e.refType] ?? e.refType}` : "Voucher"}
      size="lg"
      footer={
        <>
          {e?.isManual && can("accounts.delete") && (
            <Button variant="danger" icon={<Trash2 className="size-4" />} loading={busy} onClick={remove}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {error ? (
        <ErrorBox message={error} />
      ) : loading && !e ? (
        <Spinner page />
      ) : e ? (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
            <span>
              Date <b className="text-slate-800">{date(e.date)}</b>
            </span>
            <span>
              Reference{" "}
              {docLink ? (
                <Link href={docLink} className="font-medium text-brand-700 hover:underline">
                  {e.refNo}
                </Link>
              ) : (
                <b className="text-slate-800">{e.refNo ?? "—"}</b>
              )}
            </span>
            <span>
              Branch <b className="text-slate-800">{e.branch?.name ?? "—"}</b>
            </span>
            <span>
              Posted <b className="text-slate-800">{dateTime(e.createdAt)}</b>
            </span>
          </div>
          {e.narration && <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{e.narration}</p>}
          {e.reversedBy && (
            <p className="text-xs font-medium text-red-700">Reversed by {e.reversedBy.entryNo}</p>
          )}
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 text-left">Account</th>
                  <th className="py-1.5 text-left">Particulars</th>
                  <th className="py-1.5 text-right">Debit</th>
                  <th className="py-1.5 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {e.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">
                      <span className="font-mono text-xs text-slate-400">{l.account.code}</span> <span className="font-medium text-slate-800">{l.account.name}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-xs text-slate-600">{[l.party, l.description].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="num py-1.5 text-right">{l.debit ? inr(l.debit) : ""}</td>
                    <td className="num py-1.5 text-right">{l.credit ? inr(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-1.5" colSpan={2}>
                    Total
                  </td>
                  <td className="num py-1.5 text-right">{inr(e.lines.reduce((s, l) => s + l.debit, 0))}</td>
                  <td className="num py-1.5 text-right">{inr(e.lines.reduce((s, l) => s + l.credit, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

interface ManualLine {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  customer: Customer | null;
  vendor: Vendor | null;
  description: string;
}

export function ManualVoucherModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  return open ? <ManualVoucherBody onClose={onClose} onSaved={onSaved} /> : null;
}

function ManualVoucherBody({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: accounts } = useApi<Account[]>("/accounting/accounts");
  const [vdate, setVdate] = useState(today());
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<ManualLine[]>([
    { key: 1, accountId: "", debit: "", credit: "", customer: null, vendor: null, description: "" },
    { key: 2, accountId: "", debit: "", credit: "", customer: null, vendor: null, description: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const seq = useState({ n: 2 })[0];
  const acct = (id: string) => accounts?.find((a) => a.id === id);
  const dr = round2(lines.reduce((s, l) => s + n(l.debit), 0));
  const cr = round2(lines.reduce((s, l) => s + n(l.credit), 0));
  const diff = round2(dr - cr);
  const update = (key: number, patch: Partial<ManualLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!narration.trim()) return toast.error("Write a narration");
    if (diff !== 0) return toast.error(`Debits and credits differ by ${inr(Math.abs(diff))}`);
    const body = lines
      .filter((l) => l.accountId && (n(l.debit) > 0 || n(l.credit) > 0))
      .map((l) => {
        const a = acct(l.accountId);
        const party = a?.key === "DEBTORS" ? l.customer : a?.key === "CREDITORS" ? l.vendor : null;
        return {
          accountId: l.accountId,
          debit: n(l.debit) || undefined,
          credit: n(l.credit) || undefined,
          partyType: party ? (a?.key === "DEBTORS" ? "CUSTOMER" : "VENDOR") : undefined,
          partyId: party?.id,
          description: l.description.trim() || undefined,
        };
      });
    if (body.length < 2) return toast.error("A voucher needs at least two lines");
    setSaving(true);
    try {
      const r = await api.post<JournalEntry>("/accounting/entries", { date: vdate, narration: narration.trim(), lines: body });
      toast.success(`Voucher ${r.entryNo} posted`);
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
      title="New Journal Voucher"
      size="xl"
      footer={
        <>
          <span className={cx("mr-auto text-sm max-sm:min-w-full", diff === 0 ? "text-slate-500" : "font-medium text-red-600")}>
            Dr {inr(dr)} · Cr {inr(cr)}
            {diff !== 0 && ` · difference ${inr(Math.abs(diff))}`}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="manual-voucher" loading={saving} disabled={diff !== 0 || dr === 0}>
            Post Voucher
          </Button>
        </>
      }
    >
      <form id="manual-voucher" onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Date" required>
            <DateInput value={vdate} max={today()} onChange={(e) => setVdate(e.target.value)} />
          </Field>
          <Field label="Narration" required className="sm:col-span-2">
            <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Owner's capital deposited in bank" autoFocus />
          </Field>
        </div>
        {/* Phones: each voucher line is a card instead of four inputs squashed into one row */}
        <TableStack>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1.5 text-left">Account</th>
                <th className="py-1.5 text-left">Party / description</th>
                <th className="w-32 py-1.5 text-right">Debit</th>
                <th className="w-32 py-1.5 text-right">Credit</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const a = acct(l.accountId);
                return (
                  <tr key={l.key} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-2">
                      <Select value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value, customer: null, vendor: null })}>
                        <option value="">Choose Account</option>
                        {TYPE_ORDER.map((t) => (
                          <optgroup key={t} label={TYPE_LABEL[t]}>
                            {(accounts ?? [])
                              .filter((x) => x.type === t && x.isActive)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.code} · {x.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2">
                      {a?.key === "DEBTORS" ? (
                        <CustomerPicker value={l.customer} onChange={(c) => update(l.key, { customer: c })} />
                      ) : a?.key === "CREDITORS" ? (
                        <VendorPicker value={l.vendor} onChange={(v) => update(l.key, { vendor: v })} />
                      ) : (
                        <Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Optional" />
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="number" step="0.01" min="0" value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} className="num text-right" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="number" step="0.01" min="0" value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} className="num text-right" />
                    </td>
                    <td className="py-1.5">
                      <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableStack>
        <Button
          type="button"
          variant="add"
          size="sm"
          icon={<Plus className="size-4" />}
          onClick={() => setLines((ls) => [...ls, { key: ++seq.n, accountId: "", debit: "", credit: "", customer: null, vendor: null, description: "" }])}
        >
          Add Line
        </Button>
      </form>
    </Modal>
  );
}

// ───────────────────────── Ledger ─────────────────────────

export function LedgerTab({ range, rangeBar, initialAccountId }: { range: Range; rangeBar: ReactNode; initialAccountId?: string | null }) {
  const { data: accounts } = useApi<Account[]>("/accounting/accounts");
  const [accountId, setAccountId] = useState(initialAccountId ?? "");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const chosen = accounts?.find((a) => a.id === accountId) ?? accounts?.find((a) => a.key === "CASH");
  const party = chosen?.key === "DEBTORS" ? customer : chosen?.key === "CREDITORS" ? vendor : null;
  const { data, error, loading, reload } = useApi<AccountLedger>(chosen ? "/accounting/ledger" : null, {
    accountId: chosen?.id,
    ...range,
    partyType: party ? (chosen?.key === "DEBTORS" ? "CUSTOMER" : "VENDOR") : undefined,
    partyId: party?.id,
  });

  function csv() {
    if (!data) return;
    downloadCsv(`ledger-${data.account.code}-${range.from}-to-${range.to}.csv`, ["Date", "Voucher", "Type", "Reference", "Particulars", "Debit", "Credit", "Balance"], [
      ["", "", "", "", "Opening balance", "", "", data.opening],
      ...data.entries.map((r) => [date(r.date), r.entryNo, REF_TYPE_LABEL[r.refType] ?? r.refType, r.refNo, [r.party, r.description, r.narration].filter(Boolean).join(" · "), r.debit || "", r.credit || "", r.balance]),
      ["", "", "", "", "Closing balance", data.totalDebit, data.totalCredit, data.closing],
    ]);
  }

  const title = data ? `${data.account.name}${party ? ` — ${party.name}` : ""}` : "Ledger";
  return (
    <>
      <ReportFrame
        title={`Ledger · ${title}`}
        period={periodLabel(range)}
        controls={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={chosen?.id ?? ""} onChange={(e) => (setAccountId(e.target.value), setCustomer(null), setVendor(null))} className="w-full sm:w-64" aria-label="Account">
              {TYPE_ORDER.map((t) => (
                <optgroup key={t} label={TYPE_LABEL[t]}>
                  {(accounts ?? [])
                    .filter((a) => a.type === t)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
            {chosen?.key === "DEBTORS" && (
              <div className="w-full sm:w-64">
                <CustomerPicker value={customer} onChange={setCustomer} />
              </div>
            )}
            {chosen?.key === "CREDITORS" && (
              <div className="w-full sm:w-64">
                <VendorPicker value={vendor} onChange={setVendor} />
              </div>
            )}
            {rangeBar}
          </div>
        }
        onCsv={csv}
        loading={loading}
        error={error}
        onRetry={reload}
        hasData={!!data}
      >
        {data && (
          <Card bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Voucher</Th>
                  <Th>Type</Th>
                  <Th>Particulars</Th>
                  <Th right>Debit</Th>
                  <Th right>Credit</Th>
                  <Th right>Balance</Th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50/70">
                  <Td colSpan={6} className="font-medium text-slate-600">
                    Opening balance
                  </Td>
                  <Td right className="font-medium">{drcr(data.opening)}</Td>
                </tr>
                {data.entries.length === 0 && <EmptyRow colSpan={7}>No entries in this period</EmptyRow>}
                {data.entries.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(r.entryId)}>
                    <Td className="whitespace-nowrap">{date(r.date)}</Td>
                    <Td className="font-mono text-xs">{r.entryNo}</Td>
                    <Td className="text-xs">{REF_TYPE_LABEL[r.refType] ?? r.refType}</Td>
                    <Td className="max-w-md text-xs text-slate-600">
                      {r.refNo && <span className="font-medium text-slate-800">{r.refNo} · </span>}
                      {[r.party, r.description].filter(Boolean).join(" · ") || r.narration}
                    </Td>
                    <Td right>{r.debit ? inr(r.debit) : ""}</Td>
                    <Td right>{r.credit ? inr(r.credit) : ""}</Td>
                    <Td right className="font-medium text-slate-900">{drcr(r.balance)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <TotalRow>
                  <Td colSpan={4}>Closing balance</Td>
                  <Td right>{inr(data.totalDebit)}</Td>
                  <Td right>{inr(data.totalCredit)}</Td>
                  <Td right>{drcr(data.closing)}</Td>
                </TotalRow>
              </tfoot>
            </Table>
          </Card>
        )}
      </ReportFrame>
      <EntryModal id={open} onClose={() => setOpen(null)} onChanged={reload} />
    </>
  );
}

// ───────────────────────── Party balances ─────────────────────────

interface Parties {
  type: "CUSTOMER" | "VENDOR";
  account: string;
  rows: { partyId: string | null; name: string | null; balance: number }[];
  total: number;
}

export function PartiesTab() {
  const [type, setType] = useState<"CUSTOMER" | "VENDOR">("CUSTOMER");
  const [asOf, setAsOf] = useState(today());
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<Parties>("/accounting/parties", { type, asOf });
  const label = type === "CUSTOMER" ? "receivable" : "payable";
  const canStatement = can(type === "CUSTOMER" ? "customers.view" : "vendors.view");
  return (
    <ReportFrame
      title={`${type === "CUSTOMER" ? "Sundry Debtors" : "Sundry Creditors"} — party balances`}
      period={`as on ${date(asOf)}`}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value as "CUSTOMER" | "VENDOR")} className="w-44" aria-label="Party type">
            <option value="CUSTOMER">Customers (Debtors)</option>
            <option value="VENDOR">Vendors (Creditors)</option>
          </Select>
          <DateInput value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} className="w-40" aria-label="As on" />
        </div>
      }
      onCsv={() => data && downloadCsv(`${label}-${asOf}.csv`, ["Party", "Balance"], data.rows.map((r) => [r.name, r.balance]))}
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <Card bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Party</Th>
                <Th right>{type === "CUSTOMER" ? "Receivable" : "Payable"}</Th>
                {canStatement && <Th />}
              </tr>
            </thead>
            <tbody>
              {!data.rows.length && <EmptyRow colSpan={canStatement ? 3 : 2}>No balances</EmptyRow>}
              {data.rows.map((r) => (
                <tr key={r.partyId ?? "none"} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{r.name ?? "Walk-in customer"}</Td>
                  <Td right className={r.balance < 0 ? "text-brand-700" : "font-medium"}>
                    {r.balance < 0 ? `${inr(-r.balance)} advance` : inr(r.balance)}
                  </Td>
                  {canStatement && (
                    <Td right>
                      {r.partyId && (
                        <Link href={type === "CUSTOMER" ? `/customers/${r.partyId}` : `/vendors/${r.partyId}`} className="text-xs font-medium text-brand-700 hover:underline">
                          Statement
                        </Link>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow>
                <Td>Total {label}</Td>
                <Td right>{inr(data.total)}</Td>
                {canStatement && <Td />}
              </TotalRow>
            </tfoot>
          </Table>
        </Card>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── Trial balance ─────────────────────────

export function TrialBalanceTab({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<TrialBalance>("/accounting/trial-balance", { ...range });
  return (
    <ReportFrame
      title="Trial Balance"
      period={periodLabel(range)}
      controls={rangeBar}
      onCsv={() =>
        data &&
        downloadCsv(`trial-balance-${range.from}-to-${range.to}.csv`, ["Code", "Account", "Group", "Opening", "Debit", "Credit", "Closing"], data.rows.map((r) => [r.code, r.name, r.group, r.opening, r.debit, r.credit, r.closing]))
      }
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <Card bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Group</Th>
                <Th right>Opening Dr</Th>
                <Th right>Opening Cr</Th>
                <Th right>Debit</Th>
                <Th right>Credit</Th>
                <Th right>Closing Dr</Th>
                <Th right>Closing Cr</Th>
              </tr>
            </thead>
            <tbody>
              {!data.rows.length && <EmptyRow colSpan={8}>No entries yet</EmptyRow>}
              {data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="font-mono text-xs text-slate-400">{r.code}</span>{" "}
                    <Link href={`/accounts?tab=ledger&accountId=${r.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {r.name}
                    </Link>
                  </Td>
                  <Td className="text-xs text-slate-500">{r.group}</Td>
                  <Td right>{r.opening > 0 ? inr(r.opening) : ""}</Td>
                  <Td right>{r.opening < 0 ? inr(-r.opening) : ""}</Td>
                  <Td right>{r.debit ? inr(r.debit) : ""}</Td>
                  <Td right>{r.credit ? inr(r.credit) : ""}</Td>
                  <Td right className="font-medium">{r.closing > 0 ? inr(r.closing) : ""}</Td>
                  <Td right className="font-medium">{r.closing < 0 ? inr(-r.closing) : ""}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow>
                <Td colSpan={2}>Total</Td>
                <Td right>{inr(data.totals.openingDr)}</Td>
                <Td right>{inr(data.totals.openingCr)}</Td>
                <Td right>{inr(data.totals.debit)}</Td>
                <Td right>{inr(data.totals.credit)}</Td>
                <Td right>{inr(data.totals.closingDr)}</Td>
                <Td right>{inr(data.totals.closingCr)}</Td>
              </TotalRow>
            </tfoot>
          </Table>
          <p className={cx("px-3 py-2 text-xs", Math.abs(data.totals.closingDr - data.totals.closingCr) < 0.01 ? "text-brand-700" : "font-medium text-red-600")}>
            {Math.abs(data.totals.closingDr - data.totals.closingCr) < 0.01 ? "Debits equal credits — the books balance." : "Debits and credits differ — check opening balances."}
          </p>
        </Card>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── Profit & loss (ledger) ─────────────────────────

function StatementRow({ label, amount, bold, indent, code }: { label: string; amount: number; bold?: boolean; indent?: boolean; code?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1 text-sm", indent && "pl-5", bold && "border-t border-slate-300 font-semibold text-slate-900")}>
      <span className={bold ? undefined : "text-slate-700"}>
        {code && <span className="mr-1.5 font-mono text-xs text-slate-400">{code}</span>}
        {label}
      </span>
      <span className="num whitespace-nowrap">{amount < 0 ? `(${inr(-amount)})` : inr(amount)}</span>
    </div>
  );
}

export function PnlTab({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const { data, error, loading, reload } = useApi<LedgerProfitLoss>("/accounting/profit-loss", { ...range });
  const rows = (type: AccountType, groups: string[]) => (data?.rows ?? []).filter((r) => r.type === type && groups.includes(r.group));
  return (
    <ReportFrame
      title="Profit & Loss (From the Ledger)"
      period={periodLabel(range)}
      controls={rangeBar}
      onCsv={() => data && downloadCsv(`pl-ledger-${range.from}-to-${range.to}.csv`, ["Code", "Account", "Type", "Amount"], [...data.rows.map((r) => [r.code, r.name, r.type, r.amount]), ["", "Net profit", "", data.netProfit]])}
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" bodyClassName="px-4 py-5 sm:px-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Trading Account</p>
            {rows("INCOME", ["Sales Accounts", "Direct Incomes"]).map((r) => (
              <StatementRow key={r.id} code={r.code} label={r.name} amount={r.amount} indent />
            ))}
            <StatementRow label="Net Sales" amount={data.sales} bold />
            {rows("EXPENSE", ["Direct Expenses", "Purchase Accounts"]).map((r) => (
              <StatementRow key={r.id} code={r.code} label={`Less: ${r.name}`} amount={-r.amount} indent />
            ))}
            <StatementRow label="Gross Profit" amount={data.grossProfit} bold />
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Profit & Loss Account</p>
            {rows("INCOME", ["Indirect Incomes"]).map((r) => (
              <StatementRow key={r.id} code={r.code} label={`Add: ${r.name}`} amount={r.amount} indent />
            ))}
            {rows("EXPENSE", ["Indirect Expenses"]).map((r) => (
              <StatementRow key={r.id} code={r.code} label={`Less: ${r.name}`} amount={-r.amount} indent />
            ))}
            <div className={cx("mt-2 flex items-baseline justify-between border-y-4 border-double border-slate-300 py-2 text-base font-semibold", data.netProfit < 0 ? "text-red-600" : "text-brand-700")}>
              <span>{data.netProfit < 0 ? "Net loss" : "Net profit"}</span>
              <span className="num">{inr(Math.abs(data.netProfit))}</span>
            </div>
          </Card>
          <div className="space-y-3">
            {[
              ["Net Sales", data.sales],
              ["Gross Profit", data.grossProfit],
              ["Other Income", data.otherIncome],
              ["Expenses", data.indirectExpenses],
              ["Net Profit", data.netProfit],
            ].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{l}</p>
                <p className={cx("num mt-1 text-xl font-semibold", Number(v) < 0 ? "text-red-600" : "text-slate-900")}>{inr(Number(v))}</p>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Stock is valued continuously (every sale posts its cost), so no closing-stock entry is needed. The operational P&amp;L under Reports uses the same figures from the documents.
            </p>
          </div>
        </div>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── Balance sheet ─────────────────────────

export function BalanceSheetTab() {
  const [asOf, setAsOf] = useState(today());
  const { data, error, loading, reload } = useApi<BalanceSheet>("/accounting/balance-sheet", { asOf });
  const side = (rows: BalanceSheet["assets"]) => {
    const groups = new Map<string, BalanceSheet["assets"]>();
    for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
    return [...groups.entries()];
  };
  return (
    <ReportFrame
      title="Balance Sheet"
      period={`as on ${date(asOf)}`}
      controls={<DateInput value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} className="w-40" aria-label="As on" />}
      onCsv={() =>
        data &&
        downloadCsv(`balance-sheet-${asOf}.csv`, ["Side", "Group", "Account", "Amount"], [
          ...data.liabilities.map((r) => ["Liabilities", r.group, r.name, r.balance]),
          ...data.equity.map((r) => ["Equity", r.group, r.name, r.balance]),
          ["Equity", "Profit & Loss A/c", "Retained Earnings", data.retainedEarnings],
          ["Equity", "Profit & Loss A/c", "Profit for the Year", data.currentProfit],
          ...data.assets.map((r) => ["Assets", r.group, r.name, r.balance]),
        ])
      }
      loading={loading}
      error={error}
      onRetry={reload}
      hasData={!!data}
    >
      {data && (
        <div className="space-y-3">
          {Math.abs(data.difference) >= 0.01 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              Assets and liabilities differ by {inr(Math.abs(data.difference))} — usually an opening balance entered on one side only. Fix it in the chart of accounts.
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Liabilities & Capital" bodyClassName="px-5 py-4">
              {side(data.liabilities).map(([g, rows]) => (
                <div key={g} className="mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</p>
                  {rows.map((r) => (
                    <StatementRow key={r.id} code={r.code} label={r.name} amount={r.balance} indent />
                  ))}
                </div>
              ))}
              {side(data.equity).map(([g, rows]) => (
                <div key={g} className="mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</p>
                  {rows.map((r) => (
                    <StatementRow key={r.id} code={r.code} label={r.name} amount={r.balance} indent />
                  ))}
                </div>
              ))}
              <div className="mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Profit & Loss A/c</p>
                <StatementRow label="Retained Earnings (Earlier Years)" amount={data.retainedEarnings} indent />
                <StatementRow label={`Profit for the Year From ${date(data.fyStart)}`} amount={data.currentProfit} indent />
              </div>
              <StatementRow label="Total" amount={round2(data.totalLiabilities + data.totalEquity)} bold />
            </Card>
            <Card title="Assets" bodyClassName="px-5 py-4">
              {side(data.assets).map(([g, rows]) => (
                <div key={g} className="mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</p>
                  {rows.map((r) => (
                    <StatementRow key={r.id} code={r.code} label={r.name} amount={r.balance} indent />
                  ))}
                </div>
              ))}
              <StatementRow label="Total" amount={data.totalAssets} bold />
            </Card>
          </div>
        </div>
      )}
    </ReportFrame>
  );
}

// ───────────────────────── Tally export ─────────────────────────

interface TallyPreview {
  from: string;
  to: string;
  masters: { name: string; parent: string; opening: number }[];
  vouchers: { type: string; date: string; number: string; party?: string | null; lines: { ledger: string; debit: number; credit: number }[] }[];
}

export function TallyTab({ range, rangeBar }: { range: Range; rangeBar: ReactNode }) {
  const toast = useToast();
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const sheet = useGstSheetDownload();


  const { data, error, loading, reload } = useApi<TallyPreview>("/accounting/tally/preview", { ...range });
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of data?.vouchers ?? []) m.set(v.type, (m.get(v.type) ?? 0) + 1);
    return [...m.entries()];
  }, [data]);

  async function download(kind: "masters" | "vouchers") {
    setBusy(kind);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to, ...(company.trim() ? { company: company.trim() } : {}) });
      const res = await fetch(`${API_URL}/accounting/tally/${kind}.xml?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tally-${kind}-${range.from}-to-${range.to}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Export to Tally Prime">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            {rangeBar}
            <Field label="Tally Company Name" hint="Optional — leave blank to import into the company currently open in Tally">
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. OneRoot Agri Inputs" className="max-w-md" />
            </Field>
          </div>
          <div className="flex flex-col gap-2 lg:w-64">
            <Button icon={<Download className="size-4" />} loading={busy === "masters"} onClick={() => download("masters")} disabled={!data}>
              1 · Masters (ledgers)
            </Button>
            <Button icon={<Download className="size-4" />} loading={busy === "vouchers"} onClick={() => download("vouchers")} disabled={!data}>
              2 · Vouchers
            </Button>
          </div>
        </div>
      </Card>
      <Card title={`GST Vouchers Excel · ${periodLabel(range)}`}>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <p className="text-sm text-slate-600">
            For manual entry in Tally: one row per document, in the GST Vouchers sheet columns (date, invoice no., party, ledgers, taxable amount, GST slab, bill amount, place of supply)
            followed by its products with quantity and rate. Purchase orders cover approved and received POs by order date, with freight and round off in their own columns; GRNs
            value the accepted quantity at the PO rate, by received date; sales cover completed invoices by bill date. Pick the period with the dates above.
          </p>
          <div className="flex flex-col gap-2 lg:w-64">
            <Button variant="secondary" icon={<Download className="size-4" />} loading={sheet.busy === "po"} onClick={() => sheet.download("po", range)}>
              Purchase Orders (.xlsx)
            </Button>
            <Button variant="secondary" icon={<Download className="size-4" />} loading={sheet.busy === "grn"} onClick={() => sheet.download("grn", range)}>
              GRNs (.xlsx)
            </Button>
            <Button variant="secondary" icon={<Download className="size-4" />} loading={sheet.busy === "sale"} onClick={() => sheet.download("sale", range)}>
              Sales (.xlsx)
            </Button>
          </div>
        </div>
      </Card>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner page />
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`What Will Be Exported · ${periodLabel(range)}`}>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Ledger masters</dt>
              <dd className="num font-medium">{data.masters.length}</dd>
              {byType.map(([t, c]) => (
                <Fragment key={t}>
                  <dt className="text-slate-500">{t} vouchers</dt>
                  <dd className="num font-medium">{c}</dd>
                </Fragment>
              ))}
              <dt className="text-slate-500">Total vouchers</dt>
              <dd className="num font-semibold">{data.vouchers.length}</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Vouchers use Tally&apos;s usual periodic style: purchases go to a <b>Purchases</b> ledger and stock-side entries are left out, so you enter closing stock in Tally as you normally do. Customers and vendors become ledgers under Sundry Debtors / Creditors with their opening balance as on {date(range.from)}.
            </p>
          </Card>
          <Card title="How to Import in Tally Prime">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
              <li>Download both files above (masters first, then vouchers).</li>
              <li>
                In Tally Prime open the company, then <b>Alt+O (Import) → Masters</b>, choose <i>tally-masters…xml</i> and import. Existing ledgers with the same name are skipped.
              </li>
              <li>
                Then <b>Alt+O (Import) → Transactions</b> and choose <i>tally-vouchers…xml</i>.
              </li>
              <li>Check the Day Book in Tally for the period. Re-importing the same vouchers creates duplicates, so export each period once.</li>
            </ol>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <FileText className="size-3.5" /> GST ledgers are named Output CGST / SGST / IGST and Input CGST / SGST / IGST under Duties &amp; Taxes.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

import { Fragment } from "react";
