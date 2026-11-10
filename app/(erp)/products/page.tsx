"use client";

import { Download, Plus, Tags, Upload, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ColumnPicker, useColumns, type ColumnDef } from "@/components/ColumnPicker";
import { GenerateBarcodesButton } from "@/components/GenerateBarcodesButton";
import { useSeeCostPrice } from "@/components/StockBits";
import {
  ActionsTd,
  ActionsTh,
  RowAction,
  Badge,
  Button,
  Card,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Table,
  Td,
  Th,
  cx,
  errMsg,
  FilterBar,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { downloadCsv, inr, n, qty } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Category, Paged, Product, TaxType } from "@/lib/types";
import { LazyCategoryManager, LazyProductForm } from "@/components/lazy";

/** Margin on the GST-exclusive selling price */
function marginPct(p: Product) {
  const net = n(p.salePrice) / (1 + n(p.gstRate) / 100);
  return net > 0 && n(p.purchasePrice) > 0 ? ((net - n(p.purchasePrice)) / net) * 100 : null;
}

const isLow = (p: Product) => n(p.reorderLevel) > 0 && n(p.stock) <= n(p.reorderLevel);

function StockCell({ p }: { p: Product }) {
  const low = isLow(p);
  return (
    <>
      <span className={low ? "font-semibold text-red-600" : n(p.stock) <= 0 ? "text-slate-400" : "font-medium"}>{qty(p.stock)}</span>{" "}
      <span className="text-xs text-slate-500">{p.unit}</span>
      {/* With a branch selected, `stock` is that branch's; show the all-branch figure when it differs */}
      {p.totalStock !== undefined && Math.abs(n(p.totalStock) - n(p.stock)) > 0.0005 && (
        <p className="num text-[11px] text-slate-400">of {qty(p.totalStock)} total</p>
      )}
      {low && <p className="text-[11px] text-red-600">below reorder level</p>}
    </>
  );
}

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? <span className="text-slate-300">—</span> : String(v));

/** "Crop Protection › Herbicides" */
const categoryPath = (p: Product) => [p.category?.name, p.subCategory?.name].filter(Boolean).join(" › ");

export default function ProductsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const showCost = useSeeCostPrice();
  const { current, branches, locked } = useBranch();
  // Stock figures are for the selected branch; name it when the store has several
  const branchCode = current && (branches.length > 1 || locked) ? current.code : null;
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const { data: taxTypes } = useApi<TaxType[]>("/tax-types");
  const [categoryId, setCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [status, setStatus] = useState("active");
  const [stock, setStock] = useState("");
  const [sort, setSort] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const q = useDebounced(search);

  const { data: categories, reload: reloadCats } = useApi<Category[]>("/categories", { withSubs: "true" });
  // Sub-category choices follow the chosen category
  const subCategories = categories?.find((c) => c.id === categoryId)?.subCategories ?? [];
  const filters = {
    search: q,
    // "type" filters by the category's tax type
    taxTypeId: type,
    categoryId,
    subCategoryId,
    status,
    stock,
    sort,
  };
  const { data, error, loading, reload } = useApi<Paged<Product>>("/products", { ...filters, page, pageSize });
  // Units customers have booked with an advance and not yet bought (open bookings), per product
  const { data: booked } = useApi<Record<string, number>>("/bookings/booked");

  const allColumns = useMemo<ColumnDef<Product>[]>(() => {
    const cols: ColumnDef<Product>[] = [
      {
        id: "product",
        label: "Product Name",
        locked: true,
        render: (p) => (
          <>
            <Link href={`/products/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
              {p.name}
            </Link>
            {p.packSize && <p className="text-xs text-slate-500">{p.packSize}</p>}
          </>
        ),
        csv: (p) => p.name,
      },
      // Always shown: the SKU is how staff identify a product
      { id: "sku", label: "SKU Code", locked: true, render: (p) => <span className="whitespace-nowrap font-mono text-xs">{p.sku}</span>, csv: (p) => p.sku },
      { id: "barcode", label: "Barcode ID", render: (p) => dash(p.barcode), csv: (p) => p.barcode },
      {
        id: "type",
        label: "Type",
        defaultVisible: true,
        // The tax type set on the product's category (Products → Categories)
        render: (p) => (p.category?.taxType ? <Badge>{p.category.taxType.name}</Badge> : <span className="text-slate-400">—</span>),
        csv: (p) => p.category?.taxType?.name ?? "",
      },
      { id: "category", label: "Category", defaultVisible: true, render: (p) => dash(categoryPath(p)), csv: (p) => categoryPath(p) },
      { id: "brand", label: "Brand", defaultVisible: true, render: (p) => dash(p.brand), csv: (p) => p.brand },
      { id: "manufacturer", label: "Manufacturer", render: (p) => dash(p.manufacturer), csv: (p) => p.manufacturer },
      {
        id: "technicalName",
        label: "Composition",
        render: (p) => <span className="line-clamp-2 max-w-56 text-xs">{dash(p.technicalName)}</span>,
        csv: (p) => p.technicalName,
      },
      { id: "packSize", label: "Pack Size", render: (p) => dash(p.packSize), csv: (p) => p.packSize },
      { id: "hsn", label: "HSN", render: (p) => dash(p.hsnCode), csv: (p) => p.hsnCode },
      { id: "gst", label: "GST %", right: true, defaultVisible: true, render: (p) => `${n(p.gstRate)}%`, csv: (p) => n(p.gstRate) },
      { id: "unit", label: "Unit", render: (p) => p.unit, csv: (p) => p.unit },
    ];
    if (showCost) {
      cols.push({
        id: "purchasePrice",
        label: "Purchase Rate",
        right: true,
        render: (p) => (n(p.purchasePrice) ? inr(p.purchasePrice) : dash(null)),
        csv: (p) => n(p.purchasePrice),
      });
    }
    cols.push(
      { id: "salePrice", label: "Sale Price", right: true, defaultVisible: true, render: (p) => inr(p.salePrice), csv: (p) => n(p.salePrice) },
      {
        id: "mrp",
        label: "MRP",
        right: true,
        defaultVisible: true,
        render: (p) => <span className="text-slate-500">{n(p.mrp) ? inr(p.mrp) : "—"}</span>,
        csv: (p) => n(p.mrp),
      },
    );
    if (showCost) {
      cols.push({
        id: "margin",
        label: "Margin %",
        right: true,
        render: (p) => {
          const m = marginPct(p);
          return m === null ? dash(null) : <span className={m < 0 ? "text-red-600" : m < 5 ? "text-amber-700" : "text-brand-700"}>{m.toFixed(1)}%</span>;
        },
        csv: (p) => marginPct(p)?.toFixed(1),
      });
    }
    cols.push(
      {
        id: "stock",
        label: branchCode ? `Stock (${branchCode})` : "Stock",
        right: true,
        defaultVisible: true,
        render: (p) => <StockCell p={p} />,
        csv: (p) => n(p.stock),
      },
      {
        id: "booked",
        label: "Booked",
        right: true,
        defaultVisible: true,
        render: (p) =>
          n(booked?.[p.id]) > 0 ? (
            <Link href={`/bookings?search=${encodeURIComponent(p.name)}`} className="font-medium text-sky-700 hover:underline" title="Booked by customers with an advance, not yet bought">
              {qty(booked![p.id])}
            </Link>
          ) : (
            dash(null)
          ),
        csv: (p) => n(booked?.[p.id]),
      },
      {
        id: "free",
        label: "Free to Sell",
        right: true,
        render: (p) => {
          const b = n(booked?.[p.id]);
          if (b <= 0) return dash(null);
          const free = n(p.stock) - b;
          return <span className={free < 0 ? "font-semibold text-red-600" : "font-medium"} title={free < 0 ? `${qty(-free)} more booked than in stock — order more` : undefined}>{qty(free)}</span>;
        },
        csv: (p) => n(p.stock) - n(booked?.[p.id]),
      },
      { id: "reorderLevel", label: "Reorder Level", right: true, render: (p) => (n(p.reorderLevel) ? qty(p.reorderLevel) : dash(null)), csv: (p) => n(p.reorderLevel) },
    );
    if (showCost) {
      cols.push({
        id: "stockValue",
        label: "Stock Value",
        right: true,
        render: (p) => inr(n(p.stock) * n(p.purchasePrice)),
        csv: (p) => Math.round(n(p.stock) * n(p.purchasePrice) * 100) / 100,
      });
    }
    cols.push(
      {
        id: "batch",
        label: "Batch Tracking",
        render: (p) => (p.trackBatch ? <Badge tone="green">Batch & Expiry</Badge> : <span className="text-xs text-slate-400">No</span>),
        csv: (p) => (p.trackBatch ? "Yes" : "No"),
      },
      {
        id: "status",
        label: "Status",
        render: (p) => (p.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>),
        csv: (p) => (p.isActive ? "Active" : "Inactive"),
      },
    );
    return cols;
  }, [showCost, branchCode, booked]);

  const cols = useColumns("products", allColumns);
  const colCount = cols.columns.length + 1;
  const activeFilters = [type, categoryId, subCategoryId, stock, status !== "active" ? status : ""].filter(Boolean).length;

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  /** Deletes the product; one that has been bought, sold or quoted is deactivated instead (the server decides) */
  async function remove(p: Product) {
    const ok = await confirm(
      `Delete "${p.name}"? If it has been bought or sold it will be deactivated instead, keeping its history.`,
      { danger: true, confirmLabel: "Delete" },
    );
    if (!ok) return;
    setDeleting(p.id);
    try {
      const res = await api.del<{ deleted: boolean; deactivated?: boolean }>(`/products/${p.id}`);
      toast.success(res.deleted ? `${p.name} deleted` : `${p.name} has transactions, so it was deactivated`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDeleting(null);
    }
  }

  function clearFilters() {
    setType("");
    setCategoryId("");
    setSubCategoryId("");
    setStock("");
    setStatus("active");
    setSearch("");
    setPage(1);
  }

  /** Exports the visible columns for every product matching the filters */
  async function exportCsv() {
    const all = await api.get<Paged<Product>>("/products", { ...filters, pageSize: 500 });
    const visible = cols.columns.filter((c) => c.csv);
    downloadCsv(
      "products.csv",
      visible.map((c) => (c.id === "product" ? "Product name" : c.label)),
      all.items.map((p) => visible.map((c) => c.csv!(p))),
    );
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Seeds, fertilizers, pesticides and equipment you stock"
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>
              Export
            </Button>
            {can("products.create") && (
              <>
                <Link href="/products/import">
                  <Button variant="secondary" icon={<Upload className="size-4" />}>
                    Import
                  </Button>
                </Link>
                <GenerateBarcodesButton />
                <Button variant="secondary" icon={<Tags className="size-4" />} onClick={() => setCatsOpen(true)}>
                  Categories
                </Button>
                <Button variant="add" icon={<Plus className="size-4" />} onClick={openNew}>
                  New Product
                </Button>
              </>
            )}
          </>
        }
      />

      <Card bodyClassName="p-0">
        {/* Filters */}
        <FilterBar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name, SKU, barcode, brand, composition…"
            className="w-full sm:w-auto sm:min-w-60 sm:flex-1"
          />
          <Select value={type} onChange={(e) => (setType(e.target.value), setPage(1))} className="w-[calc(50%-0.25rem)] sm:w-36" aria-label="Type">
            <option value="">All Types</option>
            {(taxTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            value={categoryId}
            onChange={(e) => (setCategoryId(e.target.value), setSubCategoryId(""), setPage(1))}
            className="w-[calc(50%-0.25rem)] sm:w-44"
            aria-label="Category"
          >
            <option value="">All Categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={subCategoryId}
            onChange={(e) => (setSubCategoryId(e.target.value), setPage(1))}
            disabled={!categoryId}
            title={categoryId ? undefined : "Choose a category first"}
            className="w-[calc(50%-0.25rem)] sm:w-48"
            aria-label="Sub-Category"
          >
            <option value="">{categoryId ? "All Sub-Categories" : "Sub-Category"}</option>
            {subCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={stock} onChange={(e) => (setStock(e.target.value), setPage(1))} className="w-[calc(50%-0.25rem)] sm:w-36" aria-label="Stock">
            <option value="">Any Stock</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </Select>
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-[calc(50%-0.25rem)] sm:w-28" aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <Select value={sort} onChange={(e) => (setSort(e.target.value), setPage(1))} className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Sort by">
            <option value="">Sort: Name A–Z</option>
            <option value="sku">Sort: SKU</option>
            <option value="stock_asc">Stock: Low to High</option>
            <option value="stock_desc">Stock: High to Low</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">Newest First</option>
          </Select>
          {(activeFilters > 0 || search) && (
            <Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={clearFilters}>
              Clear
            </Button>
          )}
          <div className="ml-auto">
            <ColumnPicker state={cols} />
          </div>
        </FilterBar>

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                {cols.columns.map((c) => (
                  <Th key={c.id} right={c.right} className={c.className}>
                    {c.label}
                  </Th>
                ))}
                <ActionsTh className="sticky right-0" />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={colCount} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={colCount}>
                  {activeFilters || search ? (
                    <>
                      No products match these filters.{" "}
                      <button className="font-medium text-brand-700 underline" onClick={clearFilters}>
                        Clear Filters
                      </button>
                    </>
                  ) : (
                    <>
                      No products yet.{" "}
                      {can("products.create") && (
                        <button className="font-medium text-brand-700 underline" onClick={openNew}>
                          Add Your First Product
                        </button>
                      )}
                    </>
                  )}
                </EmptyRow>
              ) : (
                data.items.map((p) => (
                  <tr key={p.id} className={cx("group hover:bg-slate-50", !p.isActive && "opacity-60")}>
                    {cols.columns.map((c) => (
                      <Td key={c.id} right={c.right} className={cx("whitespace-nowrap", c.className)}>
                        {c.render(p)}
                      </Td>
                    ))}
                    <ActionsTd className="sticky right-0 bg-surface group-hover:bg-slate-50">
                      <RowAction kind="view" href={`/products/${p.id}`} title={`View ${p.name}: batches and stock history`} />
                      {can("products.edit") && (
                        <RowAction
                          kind="edit"
                          title={`Edit ${p.name}`}
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                        />
                      )}
                      {can("products.delete") && p.isActive && (
                        <RowAction kind="delete" title={`Delete ${p.name}`} loading={deleting === p.id} onClick={() => remove(p)} />
                      )}
                    </ActionsTd>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
            <label className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
              Rows per Page
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 w-20"
              >
                {[25, 50, 100].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </label>
          </div>
        )}
      </Card>

      <LazyProductForm
        open={formOpen}
        product={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
      <LazyCategoryManager
        open={catsOpen}
        onClose={() => {
          setCatsOpen(false);
          void reloadCats();
        }}
      />
    </>
  );
}
