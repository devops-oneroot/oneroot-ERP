"use client";

import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CASH_MODES, PartyPaymentForm, modeLabel } from "@/components/PartyPaymentForm";
import { VendorPending } from "@/components/VendorPending";
import {
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  PageHeader,
  Pagination,
  Select,
  Table,
  Tabs,
  Td,
  Th,
  errMsg,
  useToast,
  FilterBar,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, downloadCsv, inr, monthStart, n, today } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Permission } from "@/lib/permissions";
import type { Paged, Payment } from "@/lib/types";

type Direction = "IN" | "OUT";

type Can = (...keys: Permission[]) => boolean;

/** Links only point at pages the user can open; otherwise the name shows as plain text */
function partyOf(p: Payment, can: Can) {
  if (p.customer) return { name: p.customer.name, href: can("customers.view") ? `/customers/${p.customer.id}` : null };
  if (p.vendor) return { name: p.vendor.name, href: can("vendors.view") ? `/vendors/${p.vendor.id}` : null };
  return { name: p.sale?.customerName || "Walk-in customer", href: null };
}

function againstOf(p: Payment, can: Can) {
  // Advance bookings: money taken for one, refunded from one, or one's advance set against a bill
  if (p.booking && !p.sale) {
    const label = p.direction === "OUT" ? `Refund · ${p.booking.bookingNo}` : p.mode === "ADVANCE" ? `To account · ${p.booking.bookingNo}` : `Booking · ${p.booking.bookingNo}`;
    return { label, href: can("bookings.view") ? `/bookings/${p.booking.id}` : null };
  }
  if (p.sale) return { label: p.booking ? `${p.sale.invoiceNo} · from ${p.booking.bookingNo}` : p.sale.invoiceNo, href: can("sales.view") ? `/sales/${p.sale.id}` : null };
  // Paid for a GRN's goods / as an advance on a PO: those are what finance paid against
  if (p.grn) return { label: p.grn.grnNo, href: can("grn.view") ? `/goods-inward/${p.grn.id}` : null };
  if (p.po) return { label: `Advance · ${p.po.poNo}`, href: can("purchases.view") ? `/purchase-orders/${p.po.id}` : null };
  if (p.purchase) return { label: p.purchase.purchaseNo, href: can("invoices.view") ? `/purchases/${p.purchase.id}` : null };
  return null;
}

export default function PaymentsPage() {
  const { can } = useAuth();
  const toast = useToast();
  // ?tab=pending opens the vendor to-pay lists (where Finance's payment notifications link)
  const params = useSearchParams();
  const [tab, setTab] = useState<Direction | "PENDING">(params.get("tab") === "pending" ? "PENDING" : "IN");
  const pendingTab = tab === "PENDING";
  const direction: Direction = pendingTab ? "OUT" : tab;
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [mode, setMode] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Recording needs the permission plus the party list the form picks from
  const canReceive = can("payments.record") && can("customers.view");
  const canPayVendor = can("payments.vendor") && can("vendors.view");

  const filters = { direction, from, to, mode };
  const { data, error, loading, reload } = useApi<Paged<Payment>>(pendingTab ? null : "/payments", { ...filters, page, pageSize: 25 });
  const isIn = direction === "IN";

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await api.get<Paged<Payment>>("/payments", { ...filters, pageSize: 500 });
      downloadCsv(
        `${isIn ? "receipts" : "vendor-payments"}-${from || "all"}-to-${to || "today"}.csv`,
        ["Payment No", "Date", isIn ? "Customer" : "Vendor", "Against", "Mode", "Reference", "Amount", "Notes"],
        all.items.map((p) => [
          p.paymentNo,
          date(p.paymentDate),
          partyOf(p, can).name,
          againstOf(p, can)?.label ?? "On account",
          p.mode,
          p.reference,
          n(p.amount),
          p.notes,
        ]),
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  const cols = 7;

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Money received from customers and paid to vendors"
        actions={
          <>
            {!pendingTab && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting}>
                Export
              </Button>
            )}
            {(canReceive || canPayVendor) && (
              <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setFormOpen(true)}>
                New Payment
              </Button>
            )}
          </>
        }
      />

      <Tabs<Direction | "PENDING">
        value={tab}
        onChange={(d) => {
          setTab(d);
          setPage(1);
        }}
        tabs={[
          { value: "IN", label: "Received (From Customers)" },
          { value: "OUT", label: "Paid (To Vendors)" },
          { value: "PENDING", label: "Pending (To Vendors)" },
        ]}
      />

      {pendingTab ? (
        <VendorPending />
      ) : (
      <Card bodyClassName="p-0">
        <FilterBar>
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <DateInput value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="From date" />
            <span className="text-xs text-slate-400">to</span>
            <DateInput value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} className="min-w-0 flex-1 sm:w-38 sm:flex-none" aria-label="To date" />
          </div>
          <Select value={mode} onChange={(e) => (setMode(e.target.value), setPage(1))} className="w-full sm:w-40" aria-label="Mode">
            <option value="">All Modes</option>
            {CASH_MODES.map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </Select>
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              All Dates
            </Button>
          )}
          {data && (
            <p className="ml-auto text-sm text-slate-500">
              Total {isIn ? "received" : "paid"}:{" "}
              <span className={`num font-semibold ${isIn ? "text-brand-700" : "text-amber-700"}`}>{inr(data.totalAmount)}</span>
            </p>
          )}
        </FilterBar>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Payment No.</Th>
                <Th>Date</Th>
                <Th>{isIn ? "Customer" : "Vendor"}</Th>
                <Th>Against</Th>
                <Th>Mode</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={cols} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={cols}>No {isIn ? "receipts" : "vendor payments"} for these filters</EmptyRow>
              ) : (
                data.items.map((p) => {
                  const party = partyOf(p, can);
                  const against = againstOf(p, can);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-900">{p.paymentNo}</Td>
                      <Td className="whitespace-nowrap">{date(p.paymentDate)}</Td>
                      <Td>
                        {party.href ? (
                          <Link href={party.href} className="hover:text-brand-700">
                            {party.name}
                          </Link>
                        ) : (
                          <span className="text-slate-500">{party.name}</span>
                        )}
                      </Td>
                      <Td>
                        {against?.href ? (
                          <Link href={against.href} className="text-brand-700 hover:underline">
                            {against.label}
                          </Link>
                        ) : against ? (
                          against.label
                        ) : (
                          <span className="text-xs text-slate-500">On account</span>
                        )}
                      </Td>
                      <Td>{modeLabel(p.mode)}</Td>
                      <Td className="max-w-48 truncate text-slate-500">{p.reference || "—"}</Td>
                      <Td right className="font-medium text-slate-900">
                        {inr(p.amount)}
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
      )}

      <PartyPaymentForm
        open={formOpen}
        defaultType={(isIn && canReceive) || !canPayVendor ? "CUSTOMER" : "VENDOR"}
        onClose={() => setFormOpen(false)}
        onSaved={(p) => {
          setFormOpen(false);
          if (p.direction !== tab) {
            setTab(p.direction);
            setPage(1);
          } else void reload();
        }}
      />
    </>
  );
}
