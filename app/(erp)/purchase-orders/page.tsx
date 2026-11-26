"use client";

import { ClipboardCheck, PackageCheck, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { BranchCode } from "@/components/BranchNotice";
import { GstSheetButton } from "@/components/GstSheetExport";
import { ListFilters, hasListFilters, noListFilters } from "@/components/ListFilters";
import { ActionsTd, ActionsTh, Badge, Button, Card, EmptyRow, ErrorBox, LoadingRow, PageHeader, Pagination, RowAction, StatusBadge, Table, Tabs, Td, Th, cx, errMsg, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { date, inr, n } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import type { PoDisplayStatus, PurchaseOrder, Paged } from "@/lib/types";

type Filter = "" | PoDisplayStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "PARTIALLY_APPROVED", label: "Partially Approved" },
  { value: "SENT_BACK", label: "Sent Back" },
  { value: "APPROVED", label: "Approved" },
  { value: "PARTIALLY_RECEIVED", label: "Partially Received" },
  { value: "RECEIVED", label: "Received" },
  { value: "PARTIALLY_REJECTED", label: "Partially Rejected" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DRAFT", label: "Draft" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];

interface PoList extends Paged<PurchaseOrder> {
  counts: Partial<Record<PoDisplayStatus, number>>;
  totalValue: string | number;
}

export default function PurchaseOrdersPage() {
  return (
    <RequirePerm perms={["purchases.view"]}>
      <PurchaseOrders />
    </RequirePerm>
  );
}

function PurchaseOrders() {
  const router = useRouter();
  const { can, user } = useAuth();
  const canCreate = can("po.create");
  /** po.edit edits any open PO; a raiser their own drafts and sent-back POs */
  const mayEdit = (po: PurchaseOrder) =>
    !!po.canEdit && (can("po.edit") || (canCreate && po.createdBy?.id === user?.id && (po.status === "DRAFT" || po.status === "SENT_BACK")));
  const { currentId } = useBranch();
  const [status, setStatus] = useState<Filter>("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(noListFilters);
  const { data, error, loading, reload } = useApi<PoList>("/purchase-orders", { ...filters, status, page, pageSize: 25 });
  const toast = useToast();
  const confirm = useConfirm();
  const [restoring, setRestoring] = useState<string | null>(null);
  const expiredTab = status === "EXPIRED";

  async function restore(po: PurchaseOrder) {
    const ok = await confirm(
      `Restore ${po.poNo}? It goes back to the purchase orders as ${(po.status ?? "").toLowerCase().replace(/_/g, " ")}${po.expiryDays ? `, valid for ${po.expiryDays} more days from today` : ""}.`,
      { confirmLabel: "Restore PO" },
    );
    if (!ok) return;
    setRestoring(po.id);
    try {
      await api.post(`/purchase-orders/${po.id}/restore`);
      toast.success(`${po.poNo} restored`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRestoring(null);
    }
  }

  const counts = data?.counts ?? {};
  // Expired POs are off the list, so not part of "All"
  const all = Object.entries(counts).reduce((s, [k, c]) => (k === "EXPIRED" ? s : s + (c ?? 0)), 0);
  const tabs = FILTERS.filter((f) => f.value === "" || f.value === "EXPIRED" || f.value === status || (counts[f.value] ?? 0) > 0).map((f) => {
    const c = f.value === "" ? all : (counts[f.value] ?? 0);
    return {
      value: f.value,
      label: (
        <span className="inline-flex items-center gap-1.5">
          {f.label}
          {data && (
            <span
              className={cx(
                "num rounded-full px-1.5 text-[11px] font-semibold",
                f.value === "PENDING_APPROVAL" || f.value === "PARTIALLY_APPROVED" || f.value === "SENT_BACK" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600",
              )}
            >
              {c}
            </span>
          )}
        </span>
      ),
    };
  });

  const items = data?.items ?? [];
  const totalValue = n(data?.totalValue);

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Raise orders with vendors, get them approved, then receive goods against them"
        actions={
          <>
            <GstSheetButton kind="po" />
            <Button variant="secondary" icon={<ClipboardCheck className="size-4" />} onClick={() => router.push("/purchase-orders/approvals")}>
              Approvals
            </Button>
            {canCreate && (
              <Button variant="add" icon={<Plus className="size-4" />} onClick={() => router.push("/purchase-orders/new")}>
                New PO
              </Button>
            )}
          </>
        }
      />

      <Tabs<Filter>
        tabs={tabs}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <Card bodyClassName="p-0">
        <div className="border-b border-slate-100 p-3">
          <ListFilters
            value={filters}
            optionsPath="/purchase-orders/filters"
            onChange={(f) => {
              setFilters(f);
              setPage(1);
            }}
          />
        </div>
        {data && (
          <div className="border-b border-slate-100 px-3 py-2.5 text-sm text-slate-600 sm:px-4">
            <span className="font-medium text-slate-900">{data.total}</span> purchase order{data.total === 1 ? "" : "s"} · total value{" "}
            <span className="num font-medium text-slate-900">{inr(totalValue)}</span> incl. GST
          </div>
        )}
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>PO</Th>
                <Th>Vendor</Th>
                <Th right>Value (incl. GST)</Th>
                <Th>Status</Th>
                <ActionsTh right />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={5} />
              ) : !items.length ? (
                <EmptyRow colSpan={5}>
                  {expiredTab ? (
                    "No expired purchase orders"
                  ) : status || hasListFilters(filters) ? (
                    "No purchase orders match these filters"
                  ) : !canCreate ? (
                    "No purchase orders yet."
                  ) : (
                    <>
                      No purchase orders yet.{" "}
                      <Link href="/purchase-orders/new" className="font-medium text-brand-700 underline">
                        Raise Your First PO
                      </Link>
                    </>
                  )}
                </EmptyRow>
              ) : (
                items.map((po) => {
                  const expired = !!po.deletedAt;
                  const receivable = !expired && (po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED");
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <Td>
                        <div className="flex items-center gap-1.5">
                          {expired ? (
                            // An expired PO can't be opened until it is restored
                            <span className="whitespace-nowrap font-medium text-slate-900">{po.poNo}</span>
                          ) : (
                            <Link href={`/purchase-orders/${po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                              {po.poNo}
                            </Link>
                          )}
                          {po.round > 1 && <Badge tone="violet">Round {po.round}</Badge>}
                          {(currentId === "all" || po.branch?.id !== currentId) && po.branch && <BranchCode code={po.branch.code} title={`Deliver to ${po.branch.name}`} />}
                        </div>
                        <p className="text-xs text-slate-500">
                          {date(po.orderDate)}
                          {po.createdBy && ` · ${po.createdBy.name}`}
                        </p>
                      </Td>
                      <Td className="min-w-40">
                        <p className="break-words font-medium text-slate-800">{po.vendor?.name ?? "—"}</p>
                        {po.vendorBranch && <p className="text-xs font-medium text-brand-700">{po.vendorBranch.code ? `${po.vendorBranch.name} (${po.vendorBranch.code})` : po.vendorBranch.name}</p>}
                        <p className="text-xs text-slate-500">
                          {po.vendor?.code && <span className="font-mono">{po.vendor.code}</span>}
                          {po.vendor?.code && po.itemCount !== undefined && " · "}
                          {po.itemCount !== undefined && `${po.itemCount} Product${po.itemCount === 1 ? "" : "s"}`}
                        </p>
                      </Td>
                      <Td right className="whitespace-nowrap font-medium text-slate-900">
                        {inr(po.totalAmount)}
                      </Td>
                      <Td>
                        <StatusBadge status={po.displayStatus ?? po.status} />
                        {expired && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            On {date(po.deletedAt)} · was {(po.status ?? "").toLowerCase().replace(/_/g, " ")}
                          </p>
                        )}
                        {po.displayStatus === "PARTIALLY_APPROVED" && (
                          <p className="num mt-0.5 text-xs text-slate-500">
                            {po.level} of {po.levelsNeeded} levels approved
                          </p>
                        )}
                        {po.displayStatus === "PARTIALLY_REJECTED" && (
                          <p className="num mt-0.5 text-xs text-slate-500">
                            Rejected at level {po.level + 1} of {po.levelsNeeded}
                          </p>
                        )}
                      </Td>
                      <ActionsTd right>
                          {receivable && can("purchases.receive") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<PackageCheck className="size-4" />}
                              onClick={() => router.push(`/goods-inward/new?po=${po.id}`)}
                            >
                              Receive
                            </Button>
                          )}
                          {expired ? (
                            po.canRestore ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<RotateCcw className="size-4" />}
                                loading={restoring === po.id}
                                onClick={() => restore(po)}
                              >
                                Restore
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-500">L2 or above can restore</span>
                            )
                          ) : (
                            <RowAction kind="view" label="Open" href={`/purchase-orders/${po.id}`} title={`Open ${po.poNo}`} />
                          )}
                          {!expired && mayEdit(po) && (
                            <RowAction
                              kind="edit"
                              label={po.status === "DRAFT" ? "Edit Draft" : undefined}
                              href={`/purchase-orders/${po.id}/edit`}
                              title={`Edit ${po.poNo}`}
                            />
                          )}
                      </ActionsTd>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
