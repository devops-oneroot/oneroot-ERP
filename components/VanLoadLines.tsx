"use client";

import { Trash2 } from "lucide-react";
import { n, qty } from "@/lib/format";
import type { Product } from "@/lib/types";
import { ProductPicker } from "./pickers";
import { SerialSelect } from "./SerialPicker";
import { Input } from "./ui";

export interface LoadLine {
  product: Product;
  quantity: string;
  /** Serial-tracked products: the exact units taken out */
  serialNos: string[];
}

/** Lines ready to send: products with a quantity (and their serials) */
export const loadItems = (lines: LoadLine[]) =>
  lines.filter((l) => n(l.quantity) > 0).map((l) => ({ productId: l.product.id, quantity: n(l.quantity), serialNos: l.product.trackSerial ? l.serialNos : undefined }));

/** First problem with the lines, or null */
export function loadProblem(lines: LoadLine[]) {
  const items = lines.filter((l) => n(l.quantity) > 0);
  if (!items.length) return "Add at least one product with a quantity";
  for (const l of items) {
    if (!l.product.trackSerial) continue;
    if (!Number.isInteger(n(l.quantity))) return `${l.product.name} goes out per unit — the quantity must be a whole number`;
    if (l.serialNos.length !== n(l.quantity)) return `Pick the serial number${n(l.quantity) > 1 ? "s" : ""} for ${l.product.name}`;
  }
  return null;
}

/** Product + quantity rows for what goes out on a van campaign; serial-tracked products pick each unit's serial */
export function LoadLines({ lines, setLines }: { lines: LoadLine[]; setLines: (fn: (ls: LoadLine[]) => LoadLine[]) => void }) {
  const patch = (id: string, p: Partial<LoadLine>) => setLines((ls) => ls.map((x) => (x.product.id === id ? { ...x, ...p } : x)));
  return (
    <div className="space-y-2">
      <ProductPicker
        onPick={(p: Product) => setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls : [...ls, { product: p, quantity: p.trackSerial ? "1" : "", serialNos: [] }]))}
      />
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-400">Search and add what goes on the van</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {lines.map((l) => (
            <li key={l.product.id} className="px-3 py-2 text-sm">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{l.product.name}</p>
                  <p className="text-xs text-slate-500">
                    {l.product.sku} · {qty(l.product.stock)} {l.product.unit} in branch
                  </p>
                </div>
                <Input
                  type="number"
                  min="0"
                  step={l.product.trackSerial ? "1" : "any"}
                  value={l.quantity}
                  onChange={(e) => patch(l.product.id, { quantity: e.target.value, serialNos: l.serialNos.slice(0, Math.max(0, Math.round(n(e.target.value)))) })}
                  className="num h-8 w-20 shrink-0 text-right sm:w-24"
                  aria-label={`Quantity of ${l.product.name}`}
                  placeholder="Qty"
                />
                <span className="w-10 shrink-0 truncate text-xs text-slate-500">{l.product.unit}</span>
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}
                  className="shrink-0 rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {l.product.trackSerial && n(l.quantity) > 0 && (
                <SerialSelect productId={l.product.id} quantity={n(l.quantity)} value={l.serialNos} onChange={(serialNos) => patch(l.product.id, { serialNos })} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
