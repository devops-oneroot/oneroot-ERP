"use client";

import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  ClipboardList,
  Download,
  FileText,
  Package,
  Pencil,
  Printer,
  ReceiptIndianRupee,
  // ShoppingCart, // only the switched-off New Purchase button used it
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PartyPaymentForm, modeLabel, type FixedParty } from "@/components/PartyPaymentForm";
import { ProductPicker } from "@/components/pickers";
import { VendorBranchList } from "@/components/VendorBranches";
import { VendorPortalUsers } from "@/components/VendorPortalUsers";
import {
  Badge,
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  Info,
  LoadingRow,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, downloadCsv, inr, n } from "@/lib/format";
import { placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { Dec, Ledger, Paged, Payment, Product, Purchase, StoreSettings, Vendor, VendorProductLink } from "@/lib/types";
import { LazyVendorForm } from "@/components/lazy";

type VendorDetail = Vendor & {
  stats: { totalPurchases: Dec; billCount: number; lastPurchase: string | null };
  // Never rendered (the Purchases tab loads its own list), and the API no longer sends it
  // recentPurchases: Pick<
  //   Purchase,
  //   "id" | "purchaseNo" | "vendorInvoiceNo" | "purchaseDate" | "totalAmount" | "paidAmount" | "paymentStatus" | "status"
  // >[];
};

type Tab = "ledger" | "branches" | "products" | "purchases" | "payments" | "portal";

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const canBuy = can("po.create");
  const canPortal = can("vendors.portal");
  const canSeePurchases = can("purchases.view");
  const canSeePayments = can("payments.view");
  const [tab, setTab] = useState<Tab>("ledger");
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [ledgerKey, setLedgerKey] = useState(0);

  const { data: v, error, loading, reload } = useApi<VendorDetail>(`/vendors/${id}`);
  const { data: store } = useApi<StoreSettings>("/settings");

  const fixed = useMemo<FixedParty | null>(
    () => (v ? { partyType: "VENDOR", partyId: v.id, partyName: v.name, balance: n(v.balance) } : null),
    [v],
  );

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !v) return <Spinner page />;
  if (!v) return null;

  const bal = n(v.balance);

  return (
    <>
      <div className="no-print mb-2">
        <Link href="/vendors" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Vendors
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {v.name}
            {v.code && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-600">{v.code}</span>}
            {!v.isActive && <Badge>Inactive</Badge>}
          </span>
        }
        subtitle={[v.contactPerson, v.phone, v.gstin && `GSTIN ${v.gstin}`].filter(Boolean).join(" · ") || "Vendor"}
        actions={
          <>
            {canBuy && (
              <Button
                variant="add"
                icon={<ClipboardList className="size-4" />}
                onClick={() => router.push(`/purchase-orders/new?vendorId=${v.id}`)}
              >
                New PO
              </Button>
            )}
            {/* Purchase Entry is switched off: purchase invoices are booked from a GRN (Goods Inward) now
            {can("invoices.create") && (
              <Button
                variant="add"
                icon={<ShoppingCart className="size-4" />}
                onClick={() => router.push(`/purchases/new?vendorId=${v.id}`)}
              >
                New Purchase
              </Button>
            )}
            */}
            {can("vendors.edit") && (
              <Button variant="edit" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {can("payments.vendor") && (
              <Button icon={<Banknote className="size-4" />} onClick={() => setPayOpen(true)}>
                Pay Vendor
              </Button>
            )}
          </>
        }
      />

      <div className="no-print mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={bal < 0 ? "Advance With Vendor" : "Payable Balance"}
          value={inr(Math.abs(bal))}
          tone={bal > 0 ? "amber" : "green"}
          icon={<Wallet />}
          sub={bal > 0 ? "You owe this vendor" : bal < 0 ? "Paid in advance" : "All settled"}
        />
        <StatCard label="Total Purchases" value={inr(v.stats.totalPurchases)} icon={<ReceiptIndianRupee />} tone="blue" />
        <StatCard label="Bills" value={v.stats.billCount} icon={<FileText />} sub="Completed purchase bills" />
        <StatCard
          label="Last Purchase"
          value={<span className="text-lg">{date(v.stats.lastPurchase)}</span>}
          icon={<CalendarClock />}
          sub={v.paymentTermsDays ? `Terms: ${v.paymentTermsDays} days credit` : "Terms: immediate payment"}
        />
      </div>

      <div className="no-print mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Contact">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 break-words">
            <Info label="Contact Person">{v.contactPerson}</Info>
            <Info label="Phone">{v.phone && <a href={`tel:${v.phone}`} className="hover:text-brand-700">{v.phone}</a>}</Info>
            <Info label="Email">{v.email && <a href={`mailto:${v.email}`} className="hover:text-brand-700">{v.email}</a>}</Info>
            <Info label="GSTIN">{v.gstin && <span className="font-mono">{v.gstin}</span>}</Info>
            <Info label="Place of Supply">{placeOfSupply(v, store).label}</Info>
            <div className="col-span-2">
              <Info label="Address">{[v.address, v.city, v.state, v.pincode].filter(Boolean).join(", ")}</Info>
            </div>
            <div className="col-span-2">
              <Info label="Billing Address">{v.billingAddress}</Info>
            </div>
            <div className="col-span-2">
              <Info label="Shipping Address">{v.shippingAddress}</Info>
            </div>
            {v.notes && (
              <div className="col-span-2">
                <Info label="Notes">{v.notes}</Info>
              </div>
            )}
          </dl>
        </Card>
        <Card title="Bank Details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 break-words">
            <Info label="Bank">{v.bankName}</Info>
            <Info label="IFSC">{v.ifsc && <span className="font-mono">{v.ifsc}</span>}</Info>
            <Info label="Account Number">{v.bankAccount && <span className="font-mono">{v.bankAccount}</span>}</Info>
            <Info label="Opening Balance">{inr(v.openingBalance)}</Info>
          </dl>
        </Card>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "ledger", label: "Ledger" },
          { value: "branches", label: "Depots" },
          { value: "products", label: "Products Supplied" },
          ...(canSeePurchases ? [{ value: "purchases" as Tab, label: `Purchases (${v.stats.billCount})` }] : []),
          ...(canSeePayments ? [{ value: "payments" as Tab, label: "Payments" }] : []),
          // Supplier sign-ins: administrators and roles with the Supplier Portal permission (the API checks this too)
          ...(canPortal ? [{ value: "portal" as Tab, label: "Supplier Portal" }] : []),
        ]}
      />

      {tab === "ledger" && <VendorLedger key={ledgerKey} vendor={v} linkPurchases={canSeePurchases} />}
      {tab === "branches" && <VendorBranchList vendor={v} />}
      {tab === "products" && <VendorProducts vendor={v} canEdit={can("vendors.edit")} />}
      {tab === "purchases" && canSeePurchases && <VendorPurchases vendorId={v.id} />}
      {tab === "payments" && canSeePayments && <VendorPayments key={ledgerKey} vendorId={v.id} linkPurchases={canSeePurchases} />}
      {tab === "portal" && canPortal && <VendorPortalUsers vendor={v} />}

      <LazyVendorForm
        open={editOpen}
        vendor={v}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          void reload();
          setLedgerKey((k) => k + 1);
        }}
      />
      <PartyPaymentForm
        open={payOpen}
        fixed={fixed}
        onClose={() => setPayOpen(false)}
        onSaved={() => {
          setPayOpen(false);
          void reload();
          setLedgerKey((k) => k + 1);
        }}
      />
    </>
  );
}

const LEDGER_TONE: Record<string, "blue" | "green" | "red" | "violet"> = {
  Purchase: "blue",
  Payment: "green",
  "Debit note": "red",
  "Credit note": "violet",
};

function VendorLedger({ vendor, linkPurchases }: { vendor: Vendor; linkPurchases: boolean }) {
  const { data, error, loading, reload } = useApi<Ledger<Vendor>>(`/vendors/${vendor.id}/ledger`);

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `ledger-${vendor.name.replace(/\W+/g, "-").toLowerCase()}.csv`,
      ["Date", "Type", "Reference", "Note", "Bill Amount (Dr)", "Paid (Cr)", "Balance"],
      [
        ["", "Opening balance", "", "", "", "", data.openingBalance],
        ...data.entries.map((e) => [date(e.date), e.type, e.refNo, e.note, e.debit || "", e.credit || "", e.balance]),
        ["", "Closing balance", "", "", data.totalDebit, data.totalCredit, data.closingBalance],
      ],
    );
  }

  const balText = (b: number) => (b < 0 ? `${inr(-b)} Adv` : inr(b));

  return (
    <Card
      className="print-area"
      bodyClassName="p-0"
      title={<span className="no-print">Account Statement</span>}
      actions={
        <div className="no-print flex gap-2">
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!data}>
            CSV
          </Button>
          <Button variant="secondary" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!data}>
            Print
          </Button>
        </div>
      }
    >
      <div className="hidden px-3 pb-3 print:block">
        <h2 className="text-lg font-semibold">Vendor ledger — {vendor.name}</h2>
        <p className="text-xs text-slate-600">
          {[vendor.gstin && `GSTIN ${vendor.gstin}`, vendor.phone, [vendor.address, vendor.city].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-xs text-slate-600">Printed {date(new Date())}</p>
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Reference</Th>
              <Th>Note</Th>
              <Th right>Bill (Dr)</Th>
              <Th right>Paid / Notes (Cr)</Th>
              <Th right>Balance</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={7} />
            ) : !data ? null : (
              <>
                <tr className="bg-slate-50/60">
                  <Td colSpan={6} className="font-medium text-slate-600">
                    Opening balance
                  </Td>
                  <Td right className="font-medium">
                    {balText(data.openingBalance)}
                  </Td>
                </tr>
                {data.entries.length === 0 && <EmptyRow colSpan={7}>No bills or payments yet</EmptyRow>}
                {data.entries.map((e, i) => (
                  <tr key={`${e.refId ?? e.refNo}-${i}`} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{date(e.date)}</Td>
                    <Td>
                      <Badge tone={LEDGER_TONE[e.type] ?? "slate"}>{e.type}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {!linkPurchases ? (
                        e.refNo
                      ) : e.type === "Purchase" && e.refId ? (
                        <Link href={`/purchases/${e.refId}`} className="font-medium text-brand-700 hover:underline">
                          {e.refNo}
                        </Link>
                      ) : (e.type === "Debit note" || e.type === "Credit note") && e.refId ? (
                        <Link
                          href={`/debit-notes${e.type === "Credit note" ? "?type=credit" : ""}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {e.refNo}
                        </Link>
                      ) : (
                        e.refNo
                      )}
                    </Td>
                    <Td className="max-w-64 truncate text-xs text-slate-500">{e.note || ""}</Td>
                    <Td right>{e.debit ? inr(e.debit) : ""}</Td>
                    <Td right className="text-brand-700">
                      {e.credit ? inr(e.credit) : ""}
                    </Td>
                    <Td right className={cx("font-medium", e.balance > 0 ? "text-slate-900" : "text-brand-700")}>
                      {balText(e.balance)}
                    </Td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
          {data && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={4} className="text-slate-700">
                  Closing balance
                </Td>
                <Td right>{inr(data.totalDebit)}</Td>
                <Td right className="text-brand-700">
                  {inr(data.totalCredit)}
                </Td>
                <Td right className={data.closingBalance > 0 ? "text-amber-700" : "text-brand-700"}>
                  {balText(data.closingBalance)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
      )}
    </Card>
  );
}

/** Products this vendor supplies: a PO for the vendor can only list these */
function VendorProducts({ vendor, canEdit }: { vendor: Vendor; canEdit: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<VendorProductLink[]>(`/vendors/${vendor.id}/products`);
  const [busy, setBusy] = useState(false);
  const linked = new Set((data ?? []).map((p) => p.id));

  async function link(p: Product) {
    if (linked.has(p.id)) return toast.info(`${p.name} is already linked`);
    setBusy(true);
    try {
      await api.post(`/vendors/${vendor.id}/products`, { productIds: [p.id] });
      toast.success(`${p.name} linked to ${vendor.name}`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(p: VendorProductLink) {
    if (!(await confirm(`Remove ${p.name} from the products ${vendor.name} supplies? New POs for this vendor won't list it.`, { danger: true, confirmLabel: "Remove" })))
      return;
    try {
      await api.del(`/vendors/${vendor.id}/products/${p.id}`);
      toast.success(`${p.name} removed`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <Card
      bodyClassName="p-0"
      title={
        <span className="inline-flex items-center gap-1.5">
          <Package className="size-4 text-slate-400" /> Products Supplied{data ? ` (${data.length})` : ""}
        </span>
      }
    >
      <div className="border-b border-slate-100 p-3">
        {canEdit ? (
          <>
            <ProductPicker onPick={(p) => void link(p)} placeholder="Search a product to link to this vendor…" />
            <p className="mt-1.5 text-xs text-slate-500">
              {busy ? "Linking…" : "Purchase orders for this vendor can only list the products linked here."}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500">Purchase orders for this vendor can only list these products.</p>
        )}
      </div>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>SKU Code</Th>
              <Th>UOM</Th>
              <Th right>Purchase Price</Th>
              {canEdit && <Th />}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={canEdit ? 5 : 4} />
            ) : !data?.length ? (
              <EmptyRow colSpan={canEdit ? 5 : 4}>No products linked yet{canEdit ? " — search above to add the ones this vendor supplies" : ""}</EmptyRow>
            ) : (
              data.map((p) => (
                <tr key={p.id} className={cx("hover:bg-slate-50", !p.isActive && "opacity-60")}>
                  <Td>
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {[p.brand, p.packSize].filter(Boolean).join(" · ")}
                      {!p.isActive && " · inactive"}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-800">{p.sku}</span>
                  </Td>
                  <Td className="text-slate-600">{p.unit}</Td>
                  <Td right>{inr(p.purchasePrice)}</Td>
                  {canEdit && (
                    <Td right>
                      <button
                        type="button"
                        onClick={() => void unlink(p)}
                        className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1.5"
                        aria-label={`Remove ${p.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </Td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function VendorPurchases({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Purchase>>("/purchases", { vendorId, status: "all", page, pageSize: 20 });

  return (
    <Card bodyClassName="p-0">
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Bill No.</Th>
              <Th>Vendor Invoice</Th>
              <Th>Date</Th>
              <Th>Due</Th>
              <Th right>Total</Th>
              <Th right>Paid</Th>
              <Th right>Balance</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={8} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={8}>No purchases from this vendor yet</EmptyRow>
            ) : (
              data.items.map((p) => {
                const due = p.status === "COMPLETED" ? n(p.totalAmount) - n(p.paidAmount) : 0;
                return (
                  <tr key={p.id} className={cx("hover:bg-slate-50", p.status === "CANCELLED" && "opacity-60")}>
                    <Td>
                      <Link href={`/purchases/${p.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                        {p.purchaseNo}
                      </Link>
                    </Td>
                    <Td>{p.vendorInvoiceNo || "—"}</Td>
                    <Td className="whitespace-nowrap">{date(p.purchaseDate)}</Td>
                    <Td className="whitespace-nowrap">{date(p.dueDate)}</Td>
                    <Td right>{inr(p.totalAmount)}</Td>
                    <Td right className="text-slate-500">
                      {inr(p.paidAmount)}
                    </Td>
                    <Td right className={due > 0 ? "font-medium text-amber-700" : "text-slate-400"}>
                      {inr(due)}
                    </Td>
                    <Td>
                      {p.status === "CANCELLED" ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={p.paymentStatus} />}
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
  );
}

function VendorPayments({ vendorId, linkPurchases }: { vendorId: string; linkPurchases: boolean }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Payment>>("/payments", { partyId: vendorId, page, pageSize: 20 });

  return (
    <Card bodyClassName="p-0">
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
              <Th>Against</Th>
              <Th>Mode</Th>
              <Th>Reference</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={6} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={6}>No payments made to this vendor yet</EmptyRow>
            ) : (
              data.items.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap font-medium text-slate-900">{p.paymentNo}</Td>
                  <Td className="whitespace-nowrap">{date(p.paymentDate)}</Td>
                  <Td>
                    {p.purchase && !linkPurchases ? (
                      p.purchase.purchaseNo
                    ) : p.purchase ? (
                      <Link href={`/purchases/${p.purchase.id}`} className="text-brand-700 hover:underline">
                        {p.purchase.purchaseNo}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">On account</span>
                    )}
                  </Td>
                  <Td>{modeLabel(p.mode)}</Td>
                  <Td className="text-slate-500">{p.reference || "—"}</Td>
                  <Td right className="font-medium">
                    {inr(p.amount)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {!!data?.items.length && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={5} className="text-right text-xs uppercase tracking-wide text-slate-500">
                  Total paid
                </Td>
                <Td right>{inr(data.totalAmount)}</Td>
              </tr>
            </tfoot>
          )}
        </Table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}
