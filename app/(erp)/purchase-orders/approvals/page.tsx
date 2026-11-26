"use client";

import { CheckCheck, RefreshCw, Repeat, Settings2, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { ApprovalChain } from "@/components/ApprovalChain";
import { GrnApprovals } from "@/components/GrnApprovals";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  PageHeader,
  StatCard,
  Table,
  Tabs,
  Td,
  Th,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, inr, n } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ApprovalQueue, ChainStep, GrnApprovalQueue } from "@/lib/types";

const decisionBadge = (action: string) =>
  action.startsWith("Approved") ? (
    <Badge tone="green">Approved</Badge>
  ) : action.startsWith("Rejected") ? (
    <Badge tone="red">Rejected</Badge>
  ) : (
    <Badge tone="amber">Sent Back</Badge>
  );

interface BulkApproveResult {
  approved: number;
  failed: number;
  results: { id: string; poNo: string | null; ok: boolean; error?: string }[];
}

/** "Approved · level 2" → "level 2" */
const levelOf = (action: string) => action.split("·")[1]?.trim();

export default function ApprovalsPage() {
  const router = useRouter();
  const { can, user } = useAuth();
  // Same rule as the API: purchase staff open any PO, anyone else only the ones they are named on
  const seesAll = can("purchases.view", "purchases.approve", "purchases.receive");
  const canOpen = (chain: ChainStep[]) => seesAll || chain.some((s) => s.approverId === user?.id);
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<ApprovalQueue>("/purchase-orders/approvals");
  // GRN approval is switched off for now (goods inward posts straight away): only the PO tab shows
  const GRN_APPROVAL = false;
  // Only the hidden Goods Inward tab uses this, so it isn't fetched while GRN approval is off
  const grn = useApi<GrnApprovalQueue>(GRN_APPROVAL ? "/purchase-orders/approvals/grn" : null);
  // Purchase orders or goods inward (?tab=grn, where GRN approval notifications link)
  const params = useSearchParams();
  const pathname = usePathname();
  const tab: "po" | "grn" = GRN_APPROVAL && params.get("tab") === "grn" ? "grn" : "po";
  const setTab = (t: "po" | "grn") => router.replace(t === "po" ? pathname : `${pathname}?tab=grn`, { scroll: false });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [approving, setApproving] = useState(false);

  // Only POs waiting at a step this user can decide can be picked
  const actionable = data?.pending.filter((po) => po.canAct) ?? [];
  // Ignore picks that are no longer in the queue (approved elsewhere, refreshed)
  const picked = actionable.filter((po) => selected.has(po.id));
  const allPicked = actionable.length > 0 && picked.length === actionable.length;
  const pickedTotal = picked.reduce((sum, po) => sum + n(po.totalAmount), 0);

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(actionable.map((po) => po.id)) : new Set());
  }

  async function approvePicked() {
    if (!picked.length) return;
    const count = `${picked.length} purchase order${picked.length === 1 ? "" : "s"}`;
    if (!(await confirm(`Approve ${count} worth ${inr(pickedTotal)} in total?`, { confirmLabel: `Approve ${picked.length}` }))) return;
    setApproving(true);
    try {
      const r = await api.post<BulkApproveResult>("/purchase-orders/approvals/bulk-approve", { ids: picked.map((po) => po.id) });
      if (r.approved) toast.success(`Approved ${r.approved} PO${r.approved === 1 ? "" : "s"}`);
      const failed = r.results.filter((x) => !x.ok);
      if (failed.length) {
        const first = failed[0];
        toast.error(
          `${failed.length} not approved — ${first.poNo ?? "PO"}: ${first.error}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ""}`,
        );
      }
      setSelected(new Set(failed.map((x) => x.id)));
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setApproving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Purchase orders waiting for a decision, and what was decided recently" /* "and goods inward" while GRN approval is off */
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => void (tab === "grn" ? grn.reload() : reload())} loading={tab === "grn" ? grn.loading && !!grn.data : loading && !!data}>
              Refresh
            </Button>
            {can("admin.approval_rules") && (
              <Button variant="secondary" icon={<Settings2 className="size-4" />} onClick={() => router.push("/admin/approval-rules")}>
                Approval Rules
              </Button>
            )}
          </>
        }
      />

      {/* Tabs only when there is a second one: with GRN approval off the page is purchase orders only */}
      {GRN_APPROVAL && (
        <Tabs<"po" | "grn">
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "po", label: <>Purchase Orders{data?.mine ? <span className="ml-1.5"><Badge tone="amber">{data.mine}</Badge></span> : null}</> },
            { value: "grn", label: <>Goods Inward{grn.data?.mine ? <span className="ml-1.5"><Badge tone="amber">{grn.data.mine}</Badge></span> : null}</> },
          ]}
        />
      )}

      {tab === "grn" && <GrnApprovals data={grn.data} error={grn.error} loading={grn.loading} reload={() => void grn.reload()} />}

      {tab === "po" && error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}

      {tab === "po" && data && (
        // All cards (one per approval step + Re-Approvals + Waiting for You) on one line from lg up
        <div
          className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:[grid-template-columns:repeat(var(--cards),minmax(0,1fr))]"
          style={{ "--cards": data.byStep.length + 2 } as CSSProperties}
        >
          {data.byStep.map((s, i) => (
            <StatCard
              key={i}
              label={s.title}
              labelSub={s.approverName ?? "Any manager"}
              value={s.waiting}
              sub={s.waiting === 1 ? "PO waiting" : "POs waiting"}
              icon={<Users />}
              tone={s.waiting ? "amber" : "slate"}
            />
          ))}
          <StatCard label="Re-Approvals" value={data.reapprovals} sub="edited or resubmitted POs (round 2+)" icon={<Repeat />} tone="blue" />
          <StatCard
            label="Waiting for You"
            value={data.mine}
            sub={data.mine ? "you can decide these now" : "nothing needs you right now"}
            icon={<UserCheck />}
            tone={data.mine ? "green" : "slate"}
          />
        </div>
      )}

      {tab === "po" && (
      <Card
        title={
          picked.length ? (
            <span>
              {picked.length} selected
              <span className="ml-2 font-normal text-slate-500">· {inr(pickedTotal)}</span>
            </span>
          ) : (
            "Waiting for a decision"
          )
        }
        actions={
          picked.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)} disabled={approving}>
                Clear
              </Button>
              <Button size="sm" icon={<CheckCheck className="size-4" />} onClick={() => void approvePicked()} loading={approving}>
                Approve {picked.length}
              </Button>
            </div>
          )
        }
        bodyClassName="p-0"
        className="mb-4"
      >
        <Table>
          <thead>
            <tr>
              <Th className="w-10">
                <Checkbox
                  checked={allPicked}
                  indeterminate={picked.length > 0}
                  onChange={toggleAll}
                  disabled={!actionable.length || approving}
                  title={actionable.length ? "Select all you can approve" : "Nothing here is waiting for you"}
                  aria-label="Select all purchase orders you can approve"
                />
              </Th>
              <Th>PO</Th>
              <Th>Vendor</Th>
              <Th right>Value</Th>
              <Th className="hidden md:table-cell">Approval Chain</Th>
              <Th>Waiting With</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={7} />
            ) : !data?.pending.length ? (
              <EmptyRow colSpan={7}>No purchase orders are waiting for approval</EmptyRow>
            ) : (
              data.pending.map((po) => (
                <tr key={po.id} className={selected.has(po.id) && po.canAct ? "bg-brand-50/60" : "hover:bg-slate-50"}>
                  <Td>
                    <Checkbox
                      checked={po.canAct && selected.has(po.id)}
                      onChange={(on) => toggle(po.id, on)}
                      disabled={!po.canAct || approving}
                      title={po.canAct ? undefined : `Waiting for ${po.waitingFor?.approverName ?? "a manager"}`}
                      aria-label={`Select ${po.poNo}`}
                    />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {canOpen(po.chain) ? (
                        <Link href={`/purchase-orders/${po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                          {po.poNo}
                        </Link>
                      ) : (
                        <span className="whitespace-nowrap font-medium text-slate-900">{po.poNo}</span>
                      )}
                      {po.round > 1 && <Badge tone="violet">Round {po.round}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">
                      {date(po.orderDate)}
                      {po.createdBy && ` · ${po.createdBy.name}`}
                    </p>
                  </Td>
                  <Td className="min-w-40 sm:min-w-48">
                    <p className="break-words font-medium text-slate-800">{po.vendor?.name ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {po._count.items} item{po._count.items === 1 ? "" : "s"}
                      {po.lastAction && ` · ${po.lastAction.action} by ${po.lastAction.userName}`}
                    </p>
                  </Td>
                  <Td right className="whitespace-nowrap font-medium text-slate-900">
                    {inr(po.totalAmount)}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <ApprovalChain chain={po.chain} />
                  </Td>
                  <Td>
                    {po.waitingFor ? (
                      <>
                        <p className="whitespace-nowrap font-medium text-slate-800">{po.waitingFor.approverName ?? "Any manager"}</p>
                        <p className="text-xs text-slate-500">
                          {po.waitingFor.title} · step {po.level + 1} of {po.chain.length}
                        </p>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td right>
                    {canOpen(po.chain) && (
                      <Button size="sm" variant={po.canAct ? "primary" : "secondary"} onClick={() => router.push(`/purchase-orders/${po.id}`)}>
                        {po.canAct ? "Review" : "View"}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
      )}

      {tab === "po" && (
      <Card title="Recent Decisions" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>PO</Th>
              <Th>Decision</Th>
              <Th>By</Th>
              <Th>Comment</Th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <LoadingRow colSpan={5} />
            ) : !data?.decisions.length ? (
              <EmptyRow colSpan={5}>No approval decisions yet</EmptyRow>
            ) : (
              data.decisions.map((d) => (
                <tr key={d.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{dateTime(d.at)}</Td>
                  <Td>
                    {seesAll || data.pending.some((po) => po.id === d.po.id && canOpen(po.chain)) ? (
                      <Link href={`/purchase-orders/${d.po.id}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand-700">
                        {d.po.poNo}
                      </Link>
                    ) : (
                      <span className="whitespace-nowrap font-medium text-slate-900">{d.po.poNo}</span>
                    )}
                    {d.round > 1 && <p className="text-xs text-slate-500">Round {d.round}</p>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {decisionBadge(d.action)}
                      {levelOf(d.action) && <span className="whitespace-nowrap text-xs text-slate-400">{levelOf(d.action)}</span>}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{d.userName}</Td>
                  <Td className="min-w-48 text-slate-600">{d.note || <span className="text-slate-300">—</span>}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
      )}
    </>
  );
}
