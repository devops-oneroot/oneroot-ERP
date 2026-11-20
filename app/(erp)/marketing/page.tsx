"use client";

import { ArrowRightLeft, Gift, PackageOpen, Pencil, Scale } from "lucide-react";
import { useState } from "react";
import { AdjustModal, EditItemModal, IssueModal, ReceiveModal, TransferModal, type MarketingStockRow } from "@/components/MarketingForms";
import {
  Badge,
  Button,
  Card,
  DateInput,
  EmptyRow,
  ErrorBox,
  FilterBar,
  LoadingRow,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Table,
  Tabs,
  Td,
  Th,
  cx,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch";
import { date, qty } from "@/lib/format";
import { useApi, useDebounced } from "@/lib/hooks";
import type { Paged } from "@/lib/types";

type Tab = "stock" | "history";

interface Entry {
  id: string;
  type: "RECEIVED" | "ISSUED" | "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTED";
  quantity: number;
  balanceAfter: number;
  givenToType: string | null;
  givenToName: string | null;
  purpose: string | null;
  note: string | null;
  refNo: string | null;
  sourceProductName: string | null;
  userName: string | null;
  entryDate: string;
  item: { name: string; unit: string };
  branch: { code: string; name: string };
  otherBranch: { code: string; name: string } | null;
}

const TYPE: Record<Entry["type"], { label: string; tone: "green" | "amber" | "blue" | "violet" | "slate" }> = {
  RECEIVED: { label: "Received", tone: "green" },
  ISSUED: { label: "Given out", tone: "amber" },
  TRANSFER_OUT: { label: "Moved out", tone: "blue" },
  TRANSFER_IN: { label: "Moved in", tone: "blue" },
  ADJUSTED: { label: "Count corrected", tone: "violet" },
};

/**
 * Marketing materials (leaflets, T-shirts…): given away, never sold. Counts only. Received from unpacking a kit (or
 * added directly), given out (to whom, what for), moved between branches, corrected after a count.
 */
export default function MarketingPage() {
  const { version } = useBranch();
  // A new branch in the top bar reloads everything
  return <MarketingMaterials key={version} />;
}

function MarketingMaterials() {
  const { can } = useAuth();
  const toast = useToast();
  const { current } = useBranch();
  const [tab, setTab] = useState<Tab>("stock");
  const stock = useApi<MarketingStockRow[]>("/marketing/stock");
  const [historyKey, setHistoryKey] = useState(0);
  const [open, setOpen] = useState<"receive" | "issue" | "transfer" | null>(null);
  const [issueItem, setIssueItem] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<MarketingStockRow | null>(null);
  const [editing, setEditing] = useState<MarketingStockRow | null>(null);

  const allBranches = !current;
  const items = stock.data ?? [];
  const canSeeHistory = can("marketing.view");

  // Every change needs a real branch, not "All branches"
  const start = (what: "receive" | "issue" | "transfer", itemId: string | null = null) => {
    if (allBranches) return toast.error('Choose a branch in the top bar first (not "All branches")');
    setIssueItem(itemId);
    setOpen(what);
  };
  const saved = () => {
    setOpen(null);
    setAdjusting(null);
    setEditing(null);
    void stock.reload();
    setHistoryKey((k) => k + 1);
  };

  return (
    <>
      <PageHeader
        title="Marketing Materials"
        subtitle={`Leaflets, T-shirts and other give-aways — not for sale, counts only · ${current ? `${current.code} — ${current.name}` : "All branches"}`}
        actions={
          <>
            {can("marketing.create") && (
              <Button variant="add" icon={<PackageOpen className="size-4" />} onClick={() => start("receive")}>
                Unpack Kit / Add
              </Button>
            )}
            {can("marketing.issue") && (
              <Button icon={<Gift className="size-4" />} onClick={() => start("issue")}>
                Give Out
              </Button>
            )}
            {can("marketing.transfer") && (
              <Button variant="secondary" icon={<ArrowRightLeft className="size-4" />} onClick={() => start("transfer")}>
                Move to Branch
              </Button>
            )}
          </>
        }
      />

      {canSeeHistory && (
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "stock", label: "Stock" },
            { value: "history", label: "History" },
          ]}
        />
      )}

      {tab === "stock" || !canSeeHistory ? (
        <Card bodyClassName="p-0">
          {stock.error ? (
            <div className="p-4">
              <ErrorBox message={stock.error} onRetry={stock.reload} />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th right>Received</Th>
                  <Th right>Used</Th>
                  {!allBranches && <Th right>Moved In / Out</Th>}
                  <Th right>Corrections</Th>
                  <Th right>Left</Th>
                  {allBranches && <Th>Where</Th>}
                  <Th right>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {stock.loading && !stock.data ? (
                  <LoadingRow colSpan={7} />
                ) : !items.length ? (
                  <EmptyRow colSpan={7}>No marketing materials yet{can("marketing.create") ? " — use “Unpack Kit / Add” to enter what came in the kit" : ""}</EmptyRow>
                ) : (
                  items.map((i) => (
                    <tr key={i.id} className={cx("hover:bg-slate-50", !i.isActive && "opacity-60")}>
                      <Td>
                        <span className="font-medium text-slate-900">{i.name}</span>
                        <span className="ml-1.5 text-xs text-slate-500">{i.unit}</span>
                      </Td>
                      <Td right>{qty(i.received)}</Td>
                      <Td right>{qty(i.used)}</Td>
                      {!allBranches && (
                        <Td right className="text-slate-600">
                          {i.movedIn || i.movedOut ? `+${qty(i.movedIn)} / −${qty(i.movedOut)}` : "—"}
                        </Td>
                      )}
                      <Td right className="text-slate-600">{i.adjusted ? (i.adjusted > 0 ? `+${qty(i.adjusted)}` : qty(i.adjusted)) : "—"}</Td>
                      <Td right>
                        <span className={cx("font-semibold", i.left <= 0 ? "text-red-600" : "text-slate-900")}>{qty(i.left)}</span>
                      </Td>
                      {allBranches && (
                        <Td className="text-xs text-slate-600">
                          {i.branches.length ? i.branches.map((b) => `${b.code}: ${qty(b.quantity)}`).join(" · ") : "—"}
                        </Td>
                      )}
                      <Td right className="whitespace-nowrap">
                        {can("marketing.issue") && !allBranches && i.left > 0 && (
                          <Button size="sm" variant="ghost" icon={<Gift className="size-4" />} onClick={() => start("issue", i.id)}>
                            Give Out
                          </Button>
                        )}
                        {can("marketing.edit") && !allBranches && (
                          <Button size="sm" variant="ghost" icon={<Scale className="size-4" />} onClick={() => setAdjusting(i)}>
                            Correct Count
                          </Button>
                        )}
                        {can("marketing.edit") && (
                          <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`} />
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <History key={historyKey} items={items} allBranches={allBranches} />
      )}

      <ReceiveModal open={open === "receive"} onClose={() => setOpen(null)} onSaved={saved} items={items} />
      {/* Mounted only while open, so each opening starts with a clean form */}
      {open === "issue" && <IssueModal open onClose={() => setOpen(null)} onSaved={saved} items={items} startItemId={issueItem} />}
      <TransferModal open={open === "transfer"} onClose={() => setOpen(null)} onSaved={saved} items={items} fromBranchId={current?.id ?? null} />
      <AdjustModal key={adjusting?.id ?? "none"} item={adjusting} onClose={() => setAdjusting(null)} onSaved={saved} />
      {editing && <EditItemModal key={editing.id} item={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </>
  );
}

function History({ items, allBranches }: { items: MarketingStockRow[]; allBranches: boolean }) {
  const [page, setPage] = useState(1);
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { data, error, loading, reload } = useApi<Paged<Entry>>("/marketing/entries", { page, pageSize: 50, itemId, type, from, to, search: q });
  const cols = allBranches ? 8 : 7;

  return (
    <Card bodyClassName="p-0">
      <FilterBar>
        <Select value={itemId} onChange={(e) => (setItemId(e.target.value), setPage(1))} aria-label="Item">
          <option value="">All items</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => (setType(e.target.value), setPage(1))} aria-label="Type">
          <option value="">All changes</option>
          {Object.entries(TYPE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <DateInput value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} max={to || undefined} />
        <DateInput value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} min={from || undefined} />
        <SearchInput value={search} onChange={(v) => (setSearch(v), setPage(1))} placeholder="Given to, purpose, ref…" />
      </FilterBar>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Item</Th>
              <Th>Change</Th>
              <Th right>Qty</Th>
              <Th right>Left After</Th>
              <Th>Given To / Details</Th>
              {allBranches && <Th>Branch</Th>}
              <Th>By</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={cols} />
            ) : !data?.items.length ? (
              <EmptyRow colSpan={cols}>Nothing recorded yet</EmptyRow>
            ) : (
              data.items.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap">
                    {date(e.entryDate)}
                    {e.refNo && <p className="font-mono text-[11px] text-slate-400">{e.refNo}</p>}
                  </Td>
                  <Td className="font-medium text-slate-900">{e.item.name}</Td>
                  <Td>
                    <Badge tone={TYPE[e.type].tone}>{TYPE[e.type].label}</Badge>
                  </Td>
                  <Td right className={cx("font-semibold", e.quantity < 0 ? "text-red-600" : "text-green-700")}>
                    {e.quantity > 0 ? "+" : ""}
                    {qty(e.quantity)} <span className="text-xs font-normal text-slate-500">{e.item.unit}</span>
                  </Td>
                  <Td right>{qty(e.balanceAfter)}</Td>
                  <Td className="text-sm">
                    {e.type === "ISSUED" && (
                      <p>
                        <span className="font-medium text-slate-800">{e.givenToType}</span>
                        {e.givenToName && <span className="text-slate-600"> · {e.givenToName}</span>}
                        {e.purpose && <span className="block text-xs text-slate-500">{e.purpose}</span>}
                      </p>
                    )}
                    {e.type === "RECEIVED" && <p className="text-slate-600">{e.sourceProductName ? `Unpacked from ${e.sourceProductName}` : "Added directly"}</p>}
                    {(e.type === "TRANSFER_OUT" || e.type === "TRANSFER_IN") && e.otherBranch && (
                      <p className="text-slate-600">
                        {e.type === "TRANSFER_OUT" ? "To" : "From"} {e.otherBranch.code} — {e.otherBranch.name}
                      </p>
                    )}
                    {e.note && <p className="text-xs text-slate-500">{e.note}</p>}
                  </Td>
                  {allBranches && <Td className="text-slate-600">{e.branch.code}</Td>}
                  <Td className="text-slate-600">{e.userName ?? "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
    </Card>
  );
}
