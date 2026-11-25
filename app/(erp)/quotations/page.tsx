"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { isExpired } from "@/components/QuotationDocument";
import { Badge, Button, Card, DateInput, EmptyRow, ErrorBox, LoadingRow, PageHeader, Pagination, SearchInput, Select, StatusBadge, Table, Td, Th, FilterBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, inr, monthStart, n, today } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Paged, Quotation } from "@/lib/types";

export default function QuotationsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const canAdd = can("sales.bill");

  const { data, error, loading, reload } = useApi<Paged<Quotation>>("/quotations", { search: q, from, to, status, page, pageSize: 25 });

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Quotations"
        subtitle="Price quotes for customers, in the tax invoice layout"
        actions={
          canAdd && (
            <Link href="/quotations/new">
              <Button variant="add" icon={<Plus className="size-4" />}>New Quotation</Button>
            </Link>
          )
        }
      />

      <Card bodyClassName="p-0">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Quotation no, customer, phone or GSTIN…"
            className="w-full flex-1 sm:w-auto sm:min-w-60"
          />
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <DateInput value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="From date" />
            <span className="text-xs text-slate-400">to</span>
            <DateInput value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="To date" />
          </div>
          <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} className="min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="Status">
            <option value="all">All</option>
            <option value="OPEN">Open</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="CONVERTED">Converted</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </FilterBar>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Quotation</Th>
                <Th>Customer</Th>
                <Th right>Items</Th>
                <Th right>Total</Th>
                <Th>Valid Until</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={6} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={6}>
                  No quotations for these filters.{" "}
                  {canAdd && (
                    <Link href="/quotations/new" className="font-medium text-brand-700 underline">
                      Create a Quotation
                    </Link>
                  )}
                </EmptyRow>
              ) : (
                data.items.map((x) => {
                  const cancelled = x.status === "CANCELLED";
                  const expired = isExpired(x);
                  return (
                    <tr key={x.id} className={cancelled ? "bg-slate-50/60 text-slate-400" : "hover:bg-slate-50"}>
                      <Td>
                        <Link href={`/quotations/${x.id}`} className={cancelled ? "font-medium text-slate-500 line-through" : "font-medium text-slate-900 hover:text-brand-700"}>
                          {x.quotationNo}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {date(x.quotationDate)}
                          {x.user?.name && ` · ${x.user.name}`}
                        </p>
                      </Td>
                      <Td>
                        <span className="text-slate-800">{x.customerName}</span>
                        {x.partyType === "BUSINESS" && (
                          <span className="ml-1.5">
                            <Badge tone="blue">Business</Badge>
                          </span>
                        )}
                        {(x.customerPhone || x.customerGstin) && <p className="text-xs text-slate-500">{[x.customerPhone, x.customerGstin].filter(Boolean).join(" · ")}</p>}
                      </Td>
                      <Td right className="text-slate-500">
                        {x._count?.items ?? "—"}
                      </Td>
                      <Td right className="font-medium">
                        {inr(x.totalAmount)}
                      </Td>
                      <Td className={expired ? "text-amber-700" : "text-slate-600"}>{x.validUntil ? date(x.validUntil) : "—"}</Td>
                      <Td>{expired ? <Badge tone="amber">Expired</Badge> : <StatusBadge status={x.status} />}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {data && data.items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td colSpan={3} className="text-xs uppercase tracking-wide text-slate-500">
                    Total ({data.total} quotation{data.total === 1 ? "" : "s"})
                  </Td>
                  <Td right>{inr(n(data.totalAmount))}</Td>
                  <Td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
