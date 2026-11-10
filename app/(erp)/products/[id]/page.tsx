"use client";

import { AlertTriangle, ArrowLeft, Pencil, Power, SlidersHorizontal, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Barcode } from "@/components/Barcode";
import { BatchDetails } from "@/components/BatchDetails";
import { BranchCode } from "@/components/BranchNotice";
import { AttributeList } from "@/components/AttributeFields";
import { SerialsPanel } from "@/components/SerialsPanel";
import { BookingsCard } from "@/components/Bookings";
import { MovementBadge, MovementRef, SignedQty, useSeeCostPrice } from "@/components/StockBits";
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
  Table,
  Td,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { dateTime, inclGst, inr, n, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Paged, Product, StockMovement } from "@/lib/types";
import { LazyLabelPrintModal, LazyProductForm, LazyStockAdjustModal } from "@/components/lazy";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data: p, error, loading, reload } = useApi<Product>(`/products/${id}`);
  // Stock movements are Inventory's; someone with only Products sees the product without its history
  const canMoves = can("inventory.view");
  const moves = useApi<Paged<StockMovement>>(canMoves ? "/inventory/movements" : null, { productId: id, page, pageSize: 20 });
  const showCost = useSeeCostPrice();
  const { currentId, current } = useBranch();
  const allBranches = currentId === "all";

  const refresh = () => {
    void reload();
    if (canMoves) void moves.reload();
  };

  if (loading && !p) return <Spinner page />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!p) return null;

  const gst = n(p.gstRate);
  const netSale = n(p.salePrice) / (1 + gst / 100);
  const margin = netSale > 0 ? round2(((netSale - n(p.purchasePrice)) / netSale) * 100) : null;
  const stock = n(p.stock);
  const reorder = n(p.reorderLevel);
  const low = reorder > 0 && stock <= reorder;
  const batches = p.batches ?? [];
  const batchValue = batches.reduce((s, b) => s + n(b.quantity) * n(b.costPrice), 0);
  // With a branch selected, `stock` is that branch's; `totalStock` covers every branch
  const totalStock = n(p.totalStock ?? p.stock);
  const branchStock = p.branchStock ?? [];
  const multiBranch = branchStock.length > 1;
  const moveCols = allBranches ? 8 : 7;

  async function remove() {
    if (!p) return;
    const ok = await confirm(
      `Delete "${p.name}"? If it has been bought or sold it will be deactivated instead, keeping its history.`,
      { danger: true, confirmLabel: "Delete" },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.del<{ deleted: boolean; deactivated?: boolean }>(`/products/${p.id}`);
      if (res.deleted) {
        toast.success("Product deleted");
        router.push("/products");
      } else {
        toast.success("Product has transactions, so it was deactivated");
        void reload();
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    if (!p) return;
    setBusy(true);
    try {
      await api.patch(`/products/${p.id}`, { isActive: true });
      toast.success("Product reactivated");
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/products" className="no-print mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            {p.category?.taxType && <Badge>{p.category.taxType.name}</Badge>}
            {!p.isActive && <Badge>Inactive</Badge>}
          </span>
        }
        subtitle={[p.sku, p.brand, p.category?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="secondary" icon={<Tag className="size-4" />} onClick={() => setLabelsOpen(true)}>
              Labels
            </Button>
            {p.isActive
              ? can("products.delete") && (
                  <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={remove} loading={busy}>
                    Delete
                  </Button>
                )
              : can("products.edit") && (
                  <Button variant="secondary" icon={<Power className="size-4" />} onClick={reactivate} loading={busy}>
                    Reactivate
                  </Button>
                )}
            {can("products.edit") && (
              <Button variant="edit" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
            )}
            {can("inventory.adjust") && (
              <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setAdjustOpen(true)}>
                Adjust Stock
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Info label="Technical name / composition / serial no. / chassis no.">{p.technicalName}</Info>
            <Info label="Brand">{p.brand}</Info>
            <Info label="Manufacturer">{p.manufacturer}</Info>
            <Info label="Category">{p.category?.name}</Info>
            <Info label="Sub-Category">{p.subCategory?.name}</Info>
            <Info label="Pack Size">{p.packSize}</Info>
            <Info label="Unit">{p.unit}</Info>
            <Info label="HSN Code">{p.hsnCode}</Info>
            <Info label="GST Rate">{`${gst}%`}</Info>
           
            <Info label="Batch Tracking">{p.trackBatch ? "Batches & expiry tracked" : "Not tracked"}</Info>
            <Info label="Location in Store">{p.location}</Info>
            <Info label="Serial Numbers">{p.trackSerial ? "Each unit tracked" : "Not tracked"}</Info>
             <Info label="Barcode Image and Number">
              {p.barcode ? (
                <span className="block">
                  {/* <span className="font-mono">{p.barcode}</span> */}
                  <Barcode value={p.barcode} height={28} moduleWidth={1.2} className="mt-1 block max-w-[220px]" fluid />
                </span>
              ) : null}
            </Info>
          </dl>
          {p.subCategory?.fields && p.subCategory.fields.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <AttributeList fields={p.subCategory.fields} value={p.attributes} />
            </div>
          )}
          {p.description && <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">{p.description}</p>}
        </Card>

        <div className="space-y-4">
          <Card title="Pricing">
            <dl className="grid grid-cols-2 gap-4">
              {showCost && (
                <Info label="Purchase Rate (Incl. GST)">
                  <span className="num">{inr(inclGst(p.purchasePrice, gst))}</span>
                  <span className="block text-xs font-normal text-slate-500">{inr(p.purchasePrice)} excl. GST</span>
                </Info>
              )}
              <Info label="Selling Price (Incl. GST)">
                <span className="num">{inr(p.salePrice)}</span>
              </Info>
              <Info label="MRP">{n(p.mrp) ? <span className="num">{inr(p.mrp)}</span> : null}</Info>
              {showCost && (
                <Info label="Margin">
                  {margin === null ? null : (
                    <span className={cx("num", margin < 0 ? "text-red-600" : margin < 5 ? "text-amber-700" : "text-brand-700")}>
                      {margin}%
                    </span>
                  )}
                </Info>
              )}
            </dl>
            {showCost && <p className="mt-3 text-xs text-slate-400">Margin is on the selling price net of {gst}% GST.</p>}
          </Card>

          <Card title={current && multiBranch ? `Stock in ${current.name}` : "Stock"}>
            <div className="flex items-end justify-between">
              <div>
                <p className={cx("num text-2xl font-semibold", low ? "text-red-600" : stock <= 0 ? "text-slate-400" : "text-slate-900")}>
                  {qty(stock)} <span className="text-sm font-normal text-slate-500">{p.unit}</span>
                </p>
                {current && Math.abs(totalStock - stock) > 0.0005 && (
                  <p className="num text-xs text-slate-500">
                    of {qty(totalStock)} {p.unit} in all branches
                  </p>
                )}
                <p className="mt-0.5 text-xs text-slate-500">
                  Reorder level {reorder > 0 ? `${qty(reorder)} ${p.unit}` : "not set"}
                </p>
              </div>
              {low && (
                <Badge tone="red">
                  <AlertTriangle className="mr-1 size-3" /> Reorder
                </Badge>
              )}
            </div>
            {reorder > 0 && (
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div
                  className={cx("h-2 rounded-full", low ? "bg-red-500" : "bg-brand-500")}
                  style={{ width: `${Math.min(100, (stock / (reorder * 2)) * 100)}%` }}
                />
              </div>
            )}
            {showCost && (
              <p className="mt-3 text-xs text-slate-500">
                Value at cost <span className="num font-medium text-slate-700">{inr(batchValue)}</span>
              </p>
            )}
          </Card>

          {multiBranch && (
            <Card title="Stock by Branch" bodyClassName="p-0">
              <ul className="divide-y divide-slate-100">
                {branchStock.map((b) => {
                  const here = b.branchId === currentId;
                  return (
                    <li key={b.branchId} className={cx("flex items-center justify-between gap-3 px-4 py-2 text-sm", here && "bg-brand-50/60")}>
                      <span className="flex min-w-0 items-center gap-2">
                        <BranchCode code={b.code} />
                        <span className={cx("truncate", here ? "font-medium text-brand-800" : "text-slate-700")}>{b.name}</span>
                        {here && <Badge tone="green">Selected</Badge>}
                      </span>
                      <span className={cx("num whitespace-nowrap", b.quantity > 0 ? "font-medium text-slate-900" : "text-slate-400")}>
                        {qty(b.quantity)} <span className="text-xs font-normal text-slate-500">{p.unit}</span>
                      </span>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900">
                  <span>All branches</span>
                  <span className="num">
                    {qty(branchStock.reduce((s, b) => s + b.quantity, 0))} <span className="text-xs font-normal text-slate-500">{p.unit}</span>
                  </span>
                </li>
              </ul>
            </Card>
          )}
        </div>
      </div>

      <BatchDetails
        productId={p.id}
        unit={p.unit}
        productLocation={p.location}
        allBranches={allBranches}
        branchName={current && multiBranch ? current.name : undefined}
        showCost={showCost}
        canMoves={canMoves}
      />

      {p.trackSerial && (
        <div className="mt-4">
          <SerialsPanel productId={p.id} batches={batches} />
        </div>
      )}

      <div className="mt-4">
        <BookingsCard productId={p.id} title="Advance Bookings for This Product" />
      </div>

      {canMoves && (
        <Card title="Stock Movement History" className="mt-4" bodyClassName="p-0">
          {moves.error ? (
            <div className="p-4">
              <ErrorBox message={moves.error} onRetry={moves.reload} />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  {allBranches && <Th>Branch</Th>}
                  <Th>Type</Th>
                  <Th>Reference</Th>
                  <Th>Batch</Th>
                  <Th right>Qty</Th>
                  <Th right>Balance</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {moves.loading && !moves.data ? (
                  <LoadingRow colSpan={moveCols} />
                ) : !moves.data?.items.length ? (
                  <EmptyRow colSpan={moveCols}>No stock movements yet</EmptyRow>
                ) : (
                  moves.data.items.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap text-xs">{dateTime(m.createdAt)}</Td>
                      {allBranches && (
                        <Td>
                          <BranchCode code={m.branch?.code} title={m.branch?.name} />
                        </Td>
                      )}
                      <Td>
                        <MovementBadge type={m.type} />
                      </Td>
                      <Td>
                        <MovementRef m={m} />
                      </Td>
                      <Td className="text-xs">{m.batch?.batchNo ?? "—"}</Td>
                      <Td right>
                        <SignedQty value={m.quantity} />
                      </Td>
                      <Td right>{qty(m.balanceAfter)}</Td>
                      <Td className="max-w-64 truncate text-xs text-slate-500">{m.note || "—"}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
          {moves.data && <Pagination page={moves.data.page} totalPages={moves.data.totalPages} total={moves.data.total} onPage={setPage} />}
        </Card>
      )}

      <LazyProductForm
        open={editOpen}
        product={p}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          void reload();
        }}
      />
      <LazyStockAdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} onSaved={refresh} product={p} />
      <LazyLabelPrintModal
        open={labelsOpen}
        onClose={() => {
          setLabelsOpen(false);
          void reload();
        }}
        items={(batches.length ? batches : [null]).map((b) => ({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          packSize: p.packSize,
          mrp: b?.mrp ?? p.mrp,
          salePrice: p.salePrice,
          batchNo: b?.batchNo,
          expiryDate: b?.expiryDate,
          count: b ? Math.min(Math.ceil(n(b.quantity)), 100) : 1,
        }))}
      />
    </>
  );
}
