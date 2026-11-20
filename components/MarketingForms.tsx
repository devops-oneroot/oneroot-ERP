"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { Button, DateInput, Field, Input, Modal, Select, Textarea, errMsg, useToast } from "./ui";

/** A marketing item with its count (from GET /marketing/stock) */
export interface MarketingStockRow {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
  received: number;
  used: number;
  movedIn: number;
  movedOut: number;
  adjusted: number;
  left: number;
  branches: { branchId: string; code: string; name: string; quantity: number }[];
}

export interface MarketingSuggestions {
  givenTo: string[];
  purposes: string[];
  names: string[];
}

const UNITS = ["NOS", "PCS", "SET", "BOX", "PKT", "BUNDLE", "ROLL"];

/** Text box with a dropdown of known options; anything else can be typed */
function Combo({ id, value, onChange, options, placeholder, required }: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; required?: boolean }) {
  return (
    <>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} autoComplete="off" className="w-full" />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

function FormError({ error }: { error: string | null }) {
  return error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null;
}

function Footer({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" loading={busy}>
        {label}
      </Button>
    </div>
  );
}

const qtyOk = (v: string) => Number(v) > 0;

// ───── Unpack a kit / add materials ─────

interface KitOption {
  productId: string;
  name: string;
  unit: string;
  inStock: number;
}

interface ReceiveLine {
  name: string;
  unit: string;
  quantity: string;
}

export function ReceiveModal({ open, onClose, onSaved, items }: { open: boolean; onClose: () => void; onSaved: () => void; items: MarketingStockRow[] }) {
  const toast = useToast();
  const kits = useApi<KitOption[]>(open ? "/marketing/kits" : null);
  const [productId, setProductId] = useState("");
  const [kitQuantity, setKitQuantity] = useState("1");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>([{ name: "", unit: "NOS", quantity: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kit = kits.data?.find((k) => k.productId === productId) ?? null;
  const known = useMemo(() => new Map(items.map((i) => [i.name.toLowerCase(), i])), [items]);

  const setLine = (i: number, patch: Partial<ReceiveLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const filled = lines.filter((l) => l.name.trim() || l.quantity);
    if (!filled.length) return setError("Enter at least one item and its quantity");
    if (filled.some((l) => !l.name.trim() || !qtyOk(l.quantity))) return setError("Every line needs an item name and a quantity above 0");
    if (productId && !qtyOk(kitQuantity)) return setError("Enter how many kits are unpacked");
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ refNo: string }>("/marketing/receive", {
        productId: productId || undefined,
        kitQuantity: productId ? Number(kitQuantity) : undefined,
        date,
        note: note.trim() || undefined,
        lines: filled.map((l) => {
          const existing = known.get(l.name.trim().toLowerCase());
          return existing ? { itemId: existing.id, quantity: Number(l.quantity) } : { name: l.name.trim(), unit: l.unit, quantity: Number(l.quantity) };
        }),
      });
      toast.success(`${kit ? `${kit.name} unpacked` : "Materials added"} (${res.refNo})`);
      setProductId("");
      setKitQuantity("1");
      setNote("");
      setLines([{ name: "", unit: "NOS", quantity: "" }]);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Unpack Kit / Add Materials" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem_10rem]">
          <Field label="Kit to unpack">
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Kit to unpack">
              <option value="">No kit — add materials directly</option>
              {(kits.data ?? []).map((k) => (
                <option key={k.productId} value={k.productId}>
                  {k.name} ({k.inStock} {k.unit} in stock)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kits unpacked">
            <Input type="number" min="0" step="any" value={kitQuantity} onChange={(e) => setKitQuantity(e.target.value)} disabled={!productId} className="w-full" />
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
          </Field>
        </div>
        {kit && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {kitQuantity || 0} × {kit.name} will leave the sellable stock of this branch and its contents below will be counted as marketing materials.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">What&apos;s inside — pick an item or type a new one</p>
          <datalist id="mkt-items">
            {items.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const existing = known.get(l.name.trim().toLowerCase());
              return (
                <div key={i} className="grid grid-cols-[1fr_6.5rem_6rem_2rem] items-center gap-2">
                  <Input list="mkt-items" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="e.g. Leaflets, T-shirts" autoComplete="off" className="w-full" aria-label="Item" />
                  {existing ? (
                    <span className="text-center text-xs text-slate-500">{existing.unit}</span>
                  ) : (
                    <Select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-label="Unit">
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder="Qty" className="w-full" aria-label="Quantity" />
                  <button
                    type="button"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ name: "", unit: "NOS", quantity: "" }]))}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <Button type="button" size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setLines((ls) => [...ls, { name: "", unit: "NOS", quantity: "" }])}>
            Add Line
          </Button>
        </div>

        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
        </Field>
        <FormError error={error} />
        <Footer onClose={onClose} busy={busy} label={kit ? "Unpack Kit" : "Add Materials"} />
      </form>
    </Modal>
  );
}

// ───── Give out ─────

interface QtyLine {
  itemId: string;
  quantity: string;
}

function QtyLines({ lines, setLines, items }: { lines: QtyLine[]; setLines: (fn: (l: QtyLine[]) => QtyLine[]) => void; items: MarketingStockRow[] }) {
  const available = items.filter((i) => i.left > 0);
  const setLine = (i: number, patch: Partial<QtyLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-600">Items</p>
      <div className="space-y-2">
        {lines.map((l, i) => {
          const item = items.find((x) => x.id === l.itemId);
          return (
            <div key={i} className="grid grid-cols-[1fr_6rem_2rem] items-center gap-2">
              <Select value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value })} aria-label="Item">
                <option value="">Choose an item…</option>
                {available.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.left} {x.unit} left)
                  </option>
                ))}
              </Select>
              <Input type="number" min="0" step="any" max={item?.left} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder="Qty" className="w-full" aria-label="Quantity" />
              <button
                type="button"
                onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ itemId: "", quantity: "" }]))}
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove line"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      <Button type="button" size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setLines((ls) => [...ls, { itemId: "", quantity: "" }])}>
        Add Line
      </Button>
    </div>
  );
}

function linesToSend(lines: QtyLine[]) {
  const filled = lines.filter((l) => l.itemId || l.quantity);
  if (!filled.length) return { error: "Choose at least one item and its quantity" } as const;
  if (filled.some((l) => !l.itemId || !qtyOk(l.quantity))) return { error: "Every line needs an item and a quantity above 0" } as const;
  return { lines: filled.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })) } as const;
}

export function IssueModal({
  open,
  onClose,
  onSaved,
  items,
  startItemId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  items: MarketingStockRow[];
  startItemId?: string | null;
}) {
  const toast = useToast();
  const sugg = useApi<MarketingSuggestions>(open ? "/marketing/suggestions" : null);
  const [givenToType, setGivenToType] = useState("");
  const [givenToName, setGivenToName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  // Mounted fresh each time it opens: opened from an item's row, it starts with that item
  const [lines, setLines] = useState<QtyLine[]>([{ itemId: startItemId ?? "", quantity: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const out = linesToSend(lines);
    if ("error" in out) return setError(out.error ?? null);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ refNo: string }>("/marketing/issue", {
        givenToType: givenToType.trim(),
        givenToName: givenToName.trim() || undefined,
        purpose: purpose.trim(),
        note: note.trim() || undefined,
        date,
        lines: out.lines,
      });
      toast.success(`Given out (${res.refNo})`);
      setGivenToName("");
      setNote("");
      setLines([{ itemId: "", quantity: "" }]);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Give Out Marketing Materials" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Given to" hint="Pick from the list or type your own">
            <Combo id="mkt-given-to" value={givenToType} onChange={setGivenToType} options={sugg.data?.givenTo ?? []} placeholder="Farmer, Dealer, Event / Demo…" required />
          </Field>
          <Field label="Name / village / event (optional)">
            <Combo id="mkt-names" value={givenToName} onChange={setGivenToName} options={sugg.data?.names ?? []} placeholder="e.g. Ravi, Kollegal" />
          </Field>
          <Field label="Purpose" hint="Pick from the list or type your own">
            <Combo id="mkt-purpose" value={purpose} onChange={setPurpose} options={sugg.data?.purposes ?? []} placeholder="Farmer meeting, Field demo…" required />
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
          </Field>
        </div>
        <QtyLines lines={lines} setLines={setLines} items={items} />
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
        </Field>
        <FormError error={error} />
        <Footer onClose={onClose} busy={busy} label="Give Out" />
      </form>
    </Modal>
  );
}

// ───── Move to another branch ─────

export function TransferModal({ open, onClose, onSaved, items, fromBranchId }: { open: boolean; onClose: () => void; onSaved: () => void; items: MarketingStockRow[]; fromBranchId: string | null }) {
  const toast = useToast();
  const branches = useApi<{ id: string; code: string; name: string; isActive: boolean }[]>(open ? "/branches" : null);
  const [toBranchId, setToBranchId] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<QtyLine[]>([{ itemId: "", quantity: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!toBranchId) return setError("Choose the branch to send to");
    const out = linesToSend(lines);
    if ("error" in out) return setError(out.error ?? null);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ refNo: string }>("/marketing/transfer", { toBranchId, date, note: note.trim() || undefined, lines: out.lines });
      toast.success(`Moved (${res.refNo})`);
      setToBranchId("");
      setNote("");
      setLines([{ itemId: "", quantity: "" }]);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Move Marketing Materials to Another Branch" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Send to">
            <Select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)} aria-label="Send to branch">
              <option value="">Choose a branch…</option>
              {(branches.data ?? [])
                .filter((b) => b.isActive !== false && b.id !== fromBranchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
          </Field>
        </div>
        <QtyLines lines={lines} setLines={setLines} items={items} />
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
        </Field>
        <FormError error={error} />
        <Footer onClose={onClose} busy={busy} label="Move" />
      </form>
    </Modal>
  );
}

// ───── Correct a count / rename ─────

export function AdjustModal({ item, onClose, onSaved }: { item: MarketingStockRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    if (counted === "" || Number(counted) < 0) return setError("Enter the counted quantity (0 or more)");
    setBusy(true);
    setError(null);
    try {
      await api.post("/marketing/adjust", { itemId: item.id, countedQuantity: Number(counted), note: note.trim() });
      toast.success(`${item.name} count corrected`);
      setCounted("");
      setNote("");
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} title={`Correct count: ${item?.name ?? ""}`} size="sm">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-600">
          The system says <b>{item?.left}</b> {item?.unit} in this branch. Enter what you actually counted.
        </p>
        <Field label="Counted quantity">
          <Input type="number" min="0" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} required autoFocus className="w-full" />
        </Field>
        <Field label="Reason">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} required minLength={3} maxLength={500} placeholder="e.g. Physical count on 20 Nov" />
        </Field>
        <FormError error={error} />
        <Footer onClose={onClose} busy={busy} label="Save Count" />
      </form>
    </Modal>
  );
}

export function EditItemModal({ item, onClose, onSaved }: { item: MarketingStockRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  // Mounted fresh for each item (keyed by the page), so it starts from that item's values
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "NOS");
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/marketing/items/${item.id}`, { name: name.trim(), unit, isActive });
      toast.success("Item saved");
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} title="Edit item" size="sm">
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} className="w-full" />
        </Field>
        <Field label="Unit">
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
            {[...new Set([unit, ...UNITS])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 accent-brand-600" />
          In use (untick to hide it once none is left)
        </label>
        <FormError error={error} />
        <Footer onClose={onClose} busy={busy} label="Save" />
      </form>
    </Modal>
  );
}
