"use client";

import { ArrowLeft, PackagePlus, Receipt, Trash2, Truck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { LoadLines, loadItems, loadProblem, type LoadLine } from "@/components/VanLoadLines";
import {
  Badge,
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
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
import { date, dateTime, inr, n, qty, round2, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { PAYMENT_MODES, modeLabel, type ExpenseCategory, type PaymentMode, type VanTripDetail } from "@/lib/types";

type Item = VanTripDetail["items"][number];

export default function VanCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: t, error, loading, reload } = useApi<VanTripDetail>(`/van-trips/${id}`);
  const [topUp, setTopUp] = useState(false);
  const [closing, setClosing] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !t) return <Spinner page />;
  if (!t) return null;
  const open = t.status === "OPEN";
  const canAct = can("sales.van") && (t.userId === user?.id || can("cash.manage"));

  async function removeExpense(e: VanTripDetail["expenses"][number]) {
    const ok = await confirm(`Remove this ${inr(e.amount)} ${e.category?.name ?? ""} expense from the campaign? It is reversed in the books.`, { danger: true, confirmLabel: "Remove" });
    if (!ok) return;
    try {
      await api.del(`/van-trips/${id}/expenses/${e.id}`);
      toast.success("Expense removed");
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <>
      <PageHeader
        title={`Van Campaign ${t.tripNo}`}
        subtitle={[t.user?.name, t.vehicleNo, t.route, dateTime(t.date)].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href="/van">
              <Button variant="secondary" icon={<ArrowLeft className="size-4" />}>
                Campaigns
              </Button>
            </Link>
            {canAct && (
              <Button variant="secondary" icon={<Receipt className="size-4" />} onClick={() => setAddingExpense(true)}>
                Add Expense
              </Button>
            )}
            {open && canAct && (
              <>
                <Button variant="secondary" icon={<PackagePlus className="size-4" />} onClick={() => setTopUp(true)}>
                  Take Out More
                </Button>
                <Button icon={<Truck className="size-4" />} onClick={() => setClosing(true)}>
                  Close Campaign
                </Button>
              </>
            )}
          </>
        }
      />

      {(t.team || t.notes) && (
        <p className="mb-4 text-sm text-slate-600">
          {t.notes && <span className="font-medium text-slate-800">{t.notes}</span>}
          {t.team && <span className="block text-xs">Team: {t.team}</span>}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {open ? (
          <StatCard label="Stock Out on the Van" value={inr(t.summary.outValue)} sub="at purchase price" tone="amber" />
        ) : (
          <StatCard label="Free Samples Given" value={inr(t.summary.samplesCost)} sub="at batch cost · marketing" />
        )}
        <StatCard label="Missing Stock" value={open ? "—" : inr(t.summary.lossCost)} tone={t.summary.lossCost > 0 ? "red" : undefined} />
        <StatCard label="Expenses" value={inr(t.summary.expensesTotal)} sub={`${t.expenses.length} entr${t.expenses.length === 1 ? "y" : "ies"}`} />
        <StatCard label="Total Campaign Cost" value={inr(t.summary.totalCost)} tone={open ? undefined : "green"} sub={open ? "samples counted at close" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Stock Taken Out" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th right>Taken Out</Th>
                {!open && (
                  <>
                    <Th right>Returned</Th>
                    <Th right>Given Free</Th>
                    <Th right>Missing</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {t.items.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <span className="font-medium text-slate-800">{i.product.name}</span>
                    <span className="block text-xs text-slate-500">{i.product.sku}</span>
                    {i.serialNos.length > 0 && <SerialList item={i} closed={!open} />}
                  </Td>
                  <Td right className="font-semibold">
                    {qty(i.loadedQty)} <span className="text-xs font-normal text-slate-500">{i.product.unit}</span>
                  </Td>
                  {!open && (
                    <>
                      <Td right>{qty(i.returnedQty ?? 0)}</Td>
                      <Td right>
                        {n(i.givenQty) > 0 ? qty(i.givenQty) : "—"}
                        {n(i.givenCost) > 0 && <span className="block text-xs text-slate-500">{inr(i.givenCost)}</span>}
                      </Td>
                      <Td right className={cx(n(i.shortQty) > 0 && "font-semibold text-red-600")}>
                        {n(i.shortQty) > 0 ? qty(i.shortQty) : "—"}
                        {n(i.shortCost) > 0 && <span className="block text-xs">{inr(i.shortCost)}</span>}
                      </Td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          {!open && t.closeNote && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-600">Closing note: {t.closeNote}</p>}
          {t.sales.length > 0 && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Older van-sale trip: {t.sales.length} bill{t.sales.length === 1 ? "" : "s"} ({t.sales.map((s) => s.invoiceNo).join(", ")})
            </p>
          )}
        </Card>

        <Card title="Campaign Expenses" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>For</Th>
                <Th right>Amount</Th>
                {canAct && <Th />}
              </tr>
            </thead>
            <tbody>
              {!t.expenses.length ? (
                <EmptyRow colSpan={canAct ? 4 : 3}>No expenses yet — add fuel, driver bata, banners…</EmptyRow>
              ) : (
                t.expenses.map((e) => (
                  <tr key={e.id}>
                    <Td className="whitespace-nowrap text-xs">{date(e.expenseDate)}</Td>
                    <Td className="text-xs">
                      <span className="font-medium text-slate-800">{e.category?.name}</span>
                      <span className="block text-slate-500">{[e.paidTo, modeLabel(e.mode), e.reference].filter(Boolean).join(" · ")}</span>
                    </Td>
                    <Td right className="font-medium">{inr(e.amount)}</Td>
                    {canAct && (
                      <Td right>
                        <button type="button" onClick={() => void removeExpense(e)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove expense">
                          <Trash2 className="size-4" />
                        </button>
                      </Td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      {topUp && (
        <TopUpModal
          tripId={t.id}
          onClose={() => setTopUp(false)}
          onSaved={() => {
            setTopUp(false);
            void reload();
          }}
        />
      )}
      {closing && (
        <CloseModal
          trip={t}
          onClose={() => setClosing(false)}
          onSaved={() => {
            setClosing(false);
            void reload();
          }}
        />
      )}
      {addingExpense && (
        <ExpenseModal
          tripId={t.id}
          onClose={() => setAddingExpense(false)}
          onSaved={() => {
            setAddingExpense(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

/** Serials taken out; once closed, which were given free / missing */
function SerialList({ item, closed }: { item: Item; closed: boolean }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {item.serialNos.map((s) => {
        const given = item.givenSerials.includes(s);
        const short = item.shortSerials.includes(s);
        return (
          <Badge key={s} tone={!closed ? "slate" : given ? "blue" : short ? "red" : "green"}>
            {s}
            {closed && (given ? " · given" : short ? " · missing" : " · back")}
          </Badge>
        );
      })}
    </span>
  );
}

function TopUpModal({ tripId, onClose, onSaved }: { tripId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [lines, setLines] = useState<LoadLine[]>([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    const problem = loadProblem(lines);
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      await api.post(`/van-trips/${tripId}/load`, { items: loadItems(lines) });
      toast.success("Added to the campaign");
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Take More Stock Out"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Take Out
          </Button>
        </>
      }
    >
      <LoadLines lines={lines} setLines={setLines} />
    </Modal>
  );
}

type SerialFate = "back" | "given" | "short";

function CloseModal({ trip, onClose, onSaved }: { trip: VanTripDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  // Quantity products: returned + given; whatever is left is missing
  const [back, setBack] = useState<Record<string, string>>(() => Object.fromEntries(trip.items.map((i) => [i.productId, String(i.onVan)])));
  const [given, setGiven] = useState<Record<string, string>>({});
  // Serial products: each unit is back, given free or missing
  const [fate, setFate] = useState<Record<string, SerialFate>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = trip.items.map((i) => {
    if (i.product.trackSerial) {
      const g = i.serialNos.filter((s) => fate[`${i.productId}|${s}`] === "given").length;
      const m = i.serialNos.filter((s) => fate[`${i.productId}|${s}`] === "short").length;
      return { i, returned: i.onVan - g - m, given: g, missing: m };
    }
    const r = n(back[i.productId]);
    const g = n(given[i.productId]);
    return { i, returned: r, given: g, missing: round2(i.onVan - r - g) };
  });
  const over = rows.find((r) => r.missing < -1e-9);
  const missing = rows.filter((r) => r.missing > 1e-9);

  async function save() {
    if (over) return toast.error(`${over.i.product.name}: returned + given is more than was taken out`);
    if (missing.length && !note.trim()) return toast.error("Explain the missing stock in the note");
    setBusy(true);
    try {
      await api.post(`/van-trips/${trip.id}/close`, {
        lines: trip.items.map((i) =>
          i.product.trackSerial
            ? {
                productId: i.productId,
                returnedQty: 0,
                givenQty: 0,
                givenSerials: i.serialNos.filter((s) => fate[`${i.productId}|${s}`] === "given"),
                shortSerials: i.serialNos.filter((s) => fate[`${i.productId}|${s}`] === "short"),
              }
            : { productId: i.productId, returnedQty: n(back[i.productId]), givenQty: n(given[i.productId]) },
        ),
        note: note.trim() || undefined,
      });
      toast.success(`Campaign ${trip.tripNo} closed`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Close Campaign ${trip.tripNo}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} variant={missing.length ? "danger" : "primary"} onClick={() => void save()}>
            {missing.length ? "Close With Missing Stock" : "Close Campaign"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Count what came back. What was <b>given free</b> is booked as marketing cost; anything not accounted for is <b>missing</b> and written off as a loss.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th right>Taken Out</Th>
            <Th right>Returned</Th>
            <Th right>Given Free</Th>
            <Th right>Missing</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ i, missing: m }) =>
            i.product.trackSerial ? (
              <tr key={i.id}>
                <Td className="font-medium" colSpan={5}>
                  {i.product.name}
                  <span className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {i.serialNos.map((s) => (
                      <label key={s} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1 text-xs font-normal">
                        <span className="num">{s}</span>
                        <Select
                          value={fate[`${i.productId}|${s}`] ?? "back"}
                          onChange={(e) => setFate((f) => ({ ...f, [`${i.productId}|${s}`]: e.target.value as SerialFate }))}
                          className="h-7 w-32 text-xs"
                          aria-label={`What happened to serial ${s}`}
                        >
                          <option value="back">Returned</option>
                          <option value="given">Given free</option>
                          <option value="short">Missing</option>
                        </Select>
                      </label>
                    ))}
                  </span>
                </Td>
              </tr>
            ) : (
              <tr key={i.id}>
                <Td className="font-medium">{i.product.name}</Td>
                <Td right>
                  {qty(i.onVan)} {i.product.unit}
                </Td>
                <Td right>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={back[i.productId] ?? ""}
                    onChange={(e) => setBack((b) => ({ ...b, [i.productId]: e.target.value }))}
                    className="num h-8 w-20 text-right"
                    aria-label={`Returned: ${i.product.name}`}
                  />
                </Td>
                <Td right>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={given[i.productId] ?? ""}
                    onChange={(e) => setGiven((g) => ({ ...g, [i.productId]: e.target.value }))}
                    className="num h-8 w-20 text-right"
                    placeholder="0"
                    aria-label={`Given free: ${i.product.name}`}
                  />
                </Td>
                <Td right className={cx(m > 1e-9 ? "font-semibold text-red-600" : m < -1e-9 ? "text-red-600" : "text-slate-400")}>
                  {m > 1e-9 ? qty(m) : m < -1e-9 ? "too many" : "—"}
                </Td>
              </tr>
            ),
          )}
        </tbody>
      </Table>
      <div className="mt-4">
        <Field label="Note" required={missing.length > 0}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={missing.length ? "What happened? e.g. 1 bag torn on the road" : "Optional"} />
        </Field>
        {missing.length > 0 && !can("cash.manage") && <p className="mt-2 text-xs text-amber-700">A campaign with missing stock has to be closed by a manager.</p>}
      </div>
    </Modal>
  );
}

function ExpenseModal({ tripId, onClose, onSaved }: { tripId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: categories } = useApi<ExpenseCategory[]>("/expense-categories");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today());
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [paidTo, setPaidTo] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!(n(amount) > 0)) return toast.error("Enter the amount");
    setBusy(true);
    try {
      await api.post(`/van-trips/${tripId}/expenses`, {
        categoryId: categoryId || undefined,
        amount: n(amount),
        expenseDate,
        mode,
        paidTo: paidTo.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Expense added");
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add Campaign Expense"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="van-expense" loading={busy}>
            Add Expense
          </Button>
        </>
      }
    >
      <form id="van-expense" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category" hint="Left empty: Marketing – Van Campaign" className="sm:col-span-2">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Marketing – Van Campaign</option>
            {categories
              ?.filter((c) => c.name !== "Marketing – Van Campaign")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" placeholder="₹" />
        </Field>
        <Field label="Date" required>
          <DateInput value={expenseDate} max={today()} onChange={(e) => setExpenseDate(e.target.value)} required />
        </Field>
        <Field label="Paid By">
          <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.filter((m) => m !== "CREDIT").map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid To">
          <Input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="e.g. HP petrol bunk, driver" />
        </Field>
        <Field label="Bill / Ref No." className="sm:col-span-2">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Diesel 40 L, banner printing" />
        </Field>
      </form>
    </Modal>
  );
}
