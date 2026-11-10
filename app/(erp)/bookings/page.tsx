"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BookingFormModal, BookingStatusBadge, bookedSummary, type BookingList } from "@/components/Bookings";
import { Button, Card, EmptyRow, ErrorBox, FilterBar, LoadingRow, PageHeader, Pagination, SearchInput, Select, StatCard, Table, Td, Th } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { date, daysUntil, inr } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";

export default function BookingsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);

  const { data, error, loading, reload } = useApi<BookingList>("/bookings", { search: q, status, page, pageSize: 25 });

  return (
    <>
      <PageHeader
        title="Advance Bookings"
        subtitle="Customers book a product with an advance and buy it later, from this batch or a coming one. The advance is set against the bill at the POS."
        actions={
          can("bookings.create") && (
            <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New Booking
            </Button>
          )
        }
      />

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <StatCard label="Bookings" value={data.total} sub={status === "open" ? "open (not fully delivered)" : undefined} />
          <StatCard label="Advance Held" value={inr(data.unused)} sub="not yet set against a bill" tone="amber" />
        </div>
      )}

      <Card bodyClassName="p-0">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Booking no, customer, phone or product…"
            className="w-full flex-1 sm:w-auto sm:min-w-60"
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            aria-label="Status"
          >
            <option value="open">Open (to deliver)</option>
            <option value="OPEN">Nothing delivered</option>
            <option value="PARTIAL">Part delivered</option>
            <option value="FULFILLED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="all">All</option>
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
                <Th>Booking</Th>
                <Th>Customer</Th>
                <Th>Products</Th>
                <Th>Expected</Th>
                <Th right>Advance Paid</Th>
                <Th right>Advance Held</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={7} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={7}>No bookings for these filters.</EmptyRow>
              ) : (
                data.items.map((b) => {
                  const late = b.expectedDate && (b.status === "OPEN" || b.status === "PARTIAL") && (daysUntil(b.expectedDate) ?? 0) < 0;
                  return (
                    <tr key={b.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/bookings/${b.id}`)}>
                      <Td>
                        <Link href={`/bookings/${b.id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {b.bookingNo}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {date(b.bookingDate)}
                          {b.branch && ` · ${b.branch.code}`}
                        </p>
                      </Td>
                      <Td>
                        <span className="text-slate-800">{b.customer.name}</span>
                        {(b.customer.phone || b.customer.village) && <p className="text-xs text-slate-500">{[b.customer.phone, b.customer.village].filter(Boolean).join(" · ")}</p>}
                      </Td>
                      <Td className="max-w-72 text-slate-600">{bookedSummary(b)}</Td>
                      <Td className={late ? "font-medium text-amber-700" : "text-slate-600"}>{b.expectedDate ? date(b.expectedDate) : "—"}</Td>
                      <Td right className="num">
                        {inr(b.advancePaid)}
                      </Td>
                      <Td right className="num font-medium">
                        {inr(b.unused)}
                      </Td>
                      <Td>
                        <BookingStatusBadge status={b.status} />
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      {creating && (
        <BookingFormModal
          open
          onClose={() => setCreating(false)}
          onSaved={(b) => {
            setCreating(false);
            router.push(`/bookings/${b.id}?receipt=latest`);
          }}
        />
      )}
    </>
  );
}
