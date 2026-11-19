"use client";

import { LogOut, PackageSearch, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyRow, ErrorBox, LOGOS, LoadingRow, Logo, SearchInput, Table, Td, Th, errMsg } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, daysUntil, qty } from "@/lib/format";

/** Exactly what the API sends a supplier: no prices, costs, branches or locations */
interface StockRow {
  product: string;
  packSize: string | null;
  unit: string;
  batchNo: string | null;
  expiryDate: string | null;
  quantity: number;
}

interface StockResponse {
  vendorName: string;
  asOf: string;
  items: StockRow[];
}

function Expiry({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const days = daysUntil(value);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {date(value)}
      {days !== null && days < 0 && <Badge tone="red">Expired</Badge>}
      {days !== null && days >= 0 && days <= 60 && <Badge tone="amber">{days === 0 ? "Today" : `${days} days`}</Badge>}
    </span>
  );
}

/**
 * Supplier portal: the only page a supplier account has. Shows the stock of the batches that came in from their
 * company (all branches together) — product, batch, expiry and quantity — and nothing else. View only: no editing,
 * export, download or print. Data is fetched fresh each time and never kept in the browser.
 */
export default function SupplierStockPage() {
  const { supplier, user, loading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<StockResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState("");
  // Bumped by Refresh: the effect below fetches again
  const [loadKey, setLoadKey] = useState(0);

  // Signed out → sign in; a staff account belongs in the ERP
  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/dashboard");
    else if (!supplier) router.replace("/login");
  }, [loading, user, supplier, router]);

  useEffect(() => {
    if (!supplier) return;
    let live = true;
    api
      .get<StockResponse>("/vendor-portal/stock")
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e) => live && setError(errMsg(e)))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [supplier, loadKey]);

  const load = useCallback(() => {
    setBusy(true);
    setLoadKey((k) => k + 1);
  }, []);

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => r.product.toLowerCase().includes(q) || (r.batchNo ?? "").toLowerCase().includes(q));
  }, [data, search]);

  if (loading || !supplier) return null;

  return (
    <div className="min-h-dvh bg-paper-4">
      {/* Printing is turned off for this page: it would be an export */}
      <div className="hidden p-8 text-center text-sm text-slate-600 print:block">Printing is not available for supplier stock.</div>

      <div className="print:hidden">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Logo logo={LOGOS.horizontal} priority imageClassName="w-32" />
              <div className="min-w-0 border-l border-line pl-3">
                <p className="truncate text-sm font-semibold text-slate-900">{supplier.vendorName}</p>
                <p className="truncate text-xs text-slate-500">{supplier.name} · Supplier view</p>
              </div>
            </div>
            <Button variant="secondary" onClick={logout} icon={<LogOut className="size-4" />}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <PackageSearch className="size-5 text-brand-600" />
                Your stock with us
              </h1>
              <p className="text-xs text-slate-500">
                Batches received from {supplier.vendorName}, all our branches together
                {data ? ` · as of ${new Date(data.asOf).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <SearchInput value={search} onChange={setSearch} placeholder="Search product or batch" className="w-full sm:w-64" />
              <Button variant="secondary" onClick={load} loading={busy} aria-label="Refresh" icon={<RefreshCw className="size-4" />} />
            </div>
          </div>

          {error && <ErrorBox message={error} onRetry={load} />}

          <div className="select-none overflow-hidden rounded-xl border border-line bg-surface" onContextMenu={(e) => e.preventDefault()}>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Batch</Th>
                  <Th>Expiry</Th>
                  <Th right>Quantity</Th>
                </tr>
              </thead>
              <tbody>
                {!data && busy ? (
                  <LoadingRow colSpan={4} />
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={4}>{search ? "No product or batch matches your search" : "No stock of your products right now"}</EmptyRow>
                ) : (
                  rows.map((r, i) => (
                    <tr key={`${r.product}|${r.batchNo}|${r.expiryDate}|${i}`}>
                      <Td>
                        <span className="font-medium text-slate-900">{r.product}</span>
                        {r.packSize && <span className="ml-1.5 text-xs text-slate-500">{r.packSize}</span>}
                      </Td>
                      <Td>{r.batchNo ?? <span className="text-slate-400">—</span>}</Td>
                      <Td>
                        <Expiry value={r.expiryDate} />
                      </Td>
                      <Td right>
                        <span className="font-semibold text-slate-900">{qty(r.quantity)}</span>
                        <span className="ml-1 text-xs text-slate-500">{r.unit}</span>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          {data && data.items.length > 0 && (
            <p className="text-right text-xs text-slate-500">
              {rows.length} of {data.items.length} line{data.items.length === 1 ? "" : "s"}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
