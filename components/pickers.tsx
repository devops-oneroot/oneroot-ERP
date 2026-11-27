"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { inr, n, qty } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Customer, Paged, Product, Vendor } from "@/lib/types";
import { cx, InfinityLoader } from "./ui";

/** Generic async combobox: type to search, arrow keys + Enter to pick */
function AsyncPicker<T extends { id: string }>({
  fetcher,
  renderItem,
  onPick,
  placeholder,
  autoFocus,
  clearOnPick = true,
  inputRef,
}: {
  fetcher: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  placeholder: string;
  autoFocus?: boolean;
  clearOnPick?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ for: string | null; items: T[] }>({ for: null, items: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q, 200);
  const box = useRef<HTMLDivElement>(null);

  const items = results.items;
  const loading = open && results.for !== debounced;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetcher(debounced)
      .then((r) => {
        if (cancelled) return;
        setResults({ for: debounced, items: r });
        setActive(0);
      })
      .catch(() => !cancelled && setResults({ for: debounced, items: [] }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (item: T) => {
    onPick(item);
    if (clearOnPick) setQ("");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="h-9 w-full rounded-lg border border-slate-300 bg-surface pl-8 pr-8 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      {loading && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          <InfinityLoader className="size-5" />
        </span>
      )}
      {open && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-surface py-1 shadow-lg">
          {items.length === 0 && !loading && <p className="px-3 py-2 text-sm text-slate-400">No matches</p>}
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                // Inside a <label> (Field) the browser would forward this click to the label's first control once the
                // list closes — the picked party's Clear button — undoing the pick. preventDefault stops that.
                e.preventDefault();
                pick(item);
              }}
              className={cx("block w-full px-3 py-2 text-left text-sm", i === active ? "bg-brand-50" : "hover:bg-slate-50")}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductPicker({
  onPick,
  autoFocus,
  inputRef,
  inStockOnly,
  vendorId,
  placeholder = "Search product by name, SKU, barcode, brand…",
}: {
  onPick: (p: Product) => void;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  inStockOnly?: boolean;
  /** Only products this vendor supplies (PO items) */
  vendorId?: string;
  placeholder?: string;
}) {
  return (
    <AsyncPicker<Product>
      placeholder={placeholder}
      autoFocus={autoFocus}
      inputRef={inputRef}
      fetcher={async (q) => {
        // PO items (a vendor given): every product that vendor supplies, so no page size; elsewhere the first 20 matches
        const r = await api.get<Paged<Product>>("/products", { search: q, vendorId, pageSize: vendorId ? undefined : 20 });
        return inStockOnly ? r.items.filter((p) => n(p.stock) > 0) : r.items;
      }}
      onPick={onPick}
      renderItem={(p) => (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{p.name}</p>
            <p className="truncate text-xs text-slate-500">
              <span className="mr-1 rounded bg-slate-100 px-1 font-mono text-[11px] font-medium text-slate-800">{p.sku}</span>
              {p.brand ? ` · ${p.brand}` : ""}
              {p.packSize ? ` · ${p.packSize}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right text-xs">
            <p className="num font-medium text-slate-700">{inr(p.salePrice)}</p>
            <p className={cx("num", n(p.stock) > 0 ? "text-slate-500" : "text-red-600")}>
              {qty(p.stock)} {p.unit}
            </p>
          </div>
        </div>
      )}
    />
  );
}

/** Shows the chosen party with a clear button, or a search box when empty */
function PartySlot<T extends { id: string; name: string }>({
  value,
  onClear,
  describe,
  children,
}: {
  value: T | null;
  onClear: () => void;
  describe: (v: T) => React.ReactNode;
  children: React.ReactNode;
}) {
  if (!value) return <>{children}</>;
  return (
    <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-brand-300 bg-brand-50 px-3 text-sm">
      <div className="min-w-0 truncate">
        <span className="font-medium text-slate-800">{value.name}</span>
        <span className="ml-2 text-xs text-slate-500">{describe(value)}</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onClear();
        }}
        className="-mr-1.5 shrink-0 rounded p-1.5 text-slate-400 hover:text-slate-700" aria-label="Clear">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function CustomerPicker({
  value,
  onChange,
  autoFocus,
}: {
  value: Customer | null;
  onChange: (c: Customer | null) => void;
  autoFocus?: boolean;
}) {
  return (
    <PartySlot
      value={value}
      onClear={() => onChange(null)}
      describe={(c) => [c.phone, c.village, n(c.balance) > 0 ? `due ${inr(c.balance)}` : null].filter(Boolean).join(" · ")}
    >
      <AsyncPicker<Customer>
        placeholder="Search customer by name, phone, village…"
        autoFocus={autoFocus}
        fetcher={async (q) => (await api.get<Paged<Customer>>("/customers", { search: q, pageSize: 20 })).items}
        onPick={onChange}
        renderItem={(c) => (
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{c.name}</p>
              <p className="truncate text-xs text-slate-500">{[c.phone, c.village].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            {n(c.balance) > 0 && <span className="num shrink-0 text-xs text-red-600">due {inr(c.balance)}</span>}
          </div>
        )}
      />
    </PartySlot>
  );
}

/** A farmer from the field app (cf_users): only fills the bill's name and mobile */
export interface CfFarmer {
  id: string;
  name: string | null;
  mobile: string | null;
  village: string | null;
  taluk: string | null;
  district: string | null;
}

export function CfFarmerPicker({ onPick }: { onPick: (f: CfFarmer) => void }) {
  return (
    <AsyncPicker<CfFarmer>
      placeholder="Search field-app farmer by name, mobile, village…"
      fetcher={(q) => api.get<CfFarmer[]>("/customers/cf-farmers", { search: q })}
      onPick={onPick}
      renderItem={(f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{f.name || "Unnamed farmer"}</p>
          <p className="truncate text-xs text-slate-500">{[f.mobile, f.village, f.taluk, f.district].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      )}
    />
  );
}

export function VendorPicker({
  value,
  onChange,
  autoFocus,
  placeholder = "Search vendor by code, name, phone, GSTIN…",
}: {
  value: Vendor | null;
  onChange: (v: Vendor | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <PartySlot
      value={value}
      onClear={() => onChange(null)}
      describe={(v) => [v.gstin, n(v.balance) > 0 ? `payable ${inr(v.balance)}` : null].filter(Boolean).join(" · ")}
    >
      <AsyncPicker<Vendor>
        placeholder={placeholder}
        autoFocus={autoFocus}
        fetcher={async (q) => (await api.get<Paged<Vendor>>("/vendors", { search: q, pageSize: 20 })).items}
        onPick={onChange}
        renderItem={(v) => (
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{v.name}</p>
              <p className="truncate text-xs text-slate-500">{[v.code, v.phone, v.gstin].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            {n(v.balance) > 0 && <span className="num shrink-0 text-xs text-amber-700">payable {inr(v.balance)}</span>}
          </div>
        )}
      />
    </PartySlot>
  );
}
