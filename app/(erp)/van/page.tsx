"use client";

import { Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNeedBranch } from "@/components/BranchNotice";
import { LoadLines, loadItems, loadProblem, type LoadLine } from "@/components/VanLoadLines";
import { Badge, Button, Card, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, PageHeader, Select, Table, Td, Textarea, Th, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, inr } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { VanTrip, VanTripListRow } from "@/lib/types";

export default function VanCampaignsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { can } = useAuth();
  const [opening, setOpening] = useState(false);
  const { data, error, loading, reload } = useApi<VanTripListRow[]>("/van-trips", { status });

  return (
    <>
      <PageHeader
        title="Van Campaigns"
        subtitle="Record who takes stock out on the van, which products and serial numbers, what came back, what was given free, and what the campaign spent"
        actions={
          can("sales.van") && (
            <Button variant="add" icon={<Plus className="size-4" />} onClick={() => setOpening(true)}>
              Start a Campaign
            </Button>
          )
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex items-center gap-2 border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status">
            <option value="">All Campaigns</option>
            <option value="OPEN">Out on the Road</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Date</Th>
                <Th>Taken Out By</Th>
                <Th>Vehicle · Route</Th>
                <Th right>Products</Th>
                <Th right>Free Samples</Th>
                <Th right>Expenses</Th>
                <Th right>Total Cost</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={9} />
              ) : !data?.length ? (
                <EmptyRow colSpan={9}>No van campaigns yet — start one when stock goes out on the van</EmptyRow>
              ) : (
                data.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/van/${t.id}`)}>
                    <Td className="font-medium text-brand-700">
                      <Link href={`/van/${t.id}`}>{t.tripNo}</Link>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{dateTime(t.date)}</Td>
                    <Td>{t.user?.name}</Td>
                    <Td className="text-xs text-slate-600">{[t.vehicleNo, t.route].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td right>{t.lines}</Td>
                    <Td right>{t.status === "OPEN" ? "—" : inr(t.samplesCost)}</Td>
                    <Td right>{inr(t.expensesTotal)}</Td>
                    <Td right className="font-semibold">{inr(t.totalCost)}</Td>
                    <Td>
                      {t.status === "OPEN" ? (
                        <Badge tone="amber">Out on the Road</Badge>
                      ) : t.lossCost > 0 ? (
                        <Badge tone="red">Closed · {inr(t.lossCost)} missing</Badge>
                      ) : (
                        <Badge tone="green">Closed</Badge>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>
      {opening && (
        <StartCampaignModal
          onClose={() => setOpening(false)}
          onOpened={(id) => {
            setOpening(false);
            router.push(`/van/${id}`);
          }}
        />
      )}
    </>
  );
}

function StartCampaignModal({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const toast = useToast();
  const needBranch = useNeedBranch("take stock out from it");
  const [vehicleNo, setVehicleNo] = useState("");
  const [route, setRoute] = useState("");
  const [team, setTeam] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LoadLine[]>([]);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = loadProblem(lines);
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      const t = await api.post<VanTrip>("/van-trips", {
        vehicleNo: vehicleNo.trim() || undefined,
        route: route.trim() || undefined,
        team: team.trim() || undefined,
        notes: notes.trim() || undefined,
        items: loadItems(lines),
      });
      toast.success(`Campaign ${t.tripNo} started`);
      onOpened(t.id);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Start a Van Campaign"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="van-open" loading={busy} disabled={needBranch.blocked} icon={<Truck className="size-4" />}>
            Start Campaign
          </Button>
        </>
      }
    >
      {needBranch.notice && <div className="mb-3">{needBranch.notice}</div>}
      <form id="van-open" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Vehicle No.">
          <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="KA 10 AB 1234" />
        </Field>
        <Field label="Route / Villages" className="sm:col-span-2">
          <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Hanur – Kollegal – Yelandur" />
        </Field>
        <Field label="Team" hint="Others going with you" className="sm:col-span-3">
          <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Names of the team members" />
        </Field>
        <Field label="Purpose" className="sm:col-span-3">
          <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Kharif demo – paddy seed and sprayers" />
        </Field>
        <Field label="Stock Taken Out" required className="sm:col-span-3" hint="It stays in the branch's stock but can't be sold at the counter until the campaign closes">
          <LoadLines lines={lines} setLines={setLines} />
        </Field>
      </form>
    </Modal>
  );
}
