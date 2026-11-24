"use client";

import { Ban, CheckCircle2, FileMinus, FilePlus, Printer, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { Attachments } from "@/components/Attachments";
import { CancelNoteModal, canCancelNote } from "@/components/CancelNoteModal";
import { NoteForm, NoteStatusBadge, ReasonBadge, noteTypeName, postLabel, reducesPayable } from "@/components/NoteForm";
import { ListFilters, hasListFilters, noListFilters } from "@/components/ListFilters";
import {
  ActionsTd,
  ActionsTh,
  Button,
  Card,
  Dropdown,
  EmptyRow,
  ErrorBox,
  LoadingRow,
  Modal,
  PageHeader,
  PrintHeader,
  SystemGeneratedNote,
  Pagination,
  RowAction,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { vendorAddresses } from "@/lib/address";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { amountInWords, date, inr, n, qty } from "@/lib/format";
import { placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import { approvalLevel } from "@/lib/permissions";
import { NOTE_REASON_LABEL, type Branch, type DebitNote, type DebitNoteStatus, type NoteType, type Paged, type StoreSettings } from "@/lib/types";

type Filter = "" | DebitNoteStatus;
type TypeTab = "debit" | "credit";

export default function DebitNotesPage() {
  return (
    <RequirePerm perms={["notes.view"]}>
      <Notes />
    </RequirePerm>
  );
}

/** What posting a draft does, in words, for the confirm dialog */
function postMessage(dn: DebitNote) {
  const amount = inr(dn.totalAmount);
  if (!reducesPayable(dn)) {
    const what = dn.reasonType === "SHORT_SUPPLY" ? "the goods short-supplied" : "the goods rejected";
    return `Send ${dn.dnNo} to ${dn.vendor.name}? This records that the vendor has been told about ${what} on ${dn.grn?.grnNo ?? "goods inward"} (${amount}). Those goods never entered stock and were never billed, so stock and the vendor balance don't change.`;
  }
  const settles = dn.purchase ? ` The balance due on invoice ${dn.purchase.purchaseNo} is settled from it first.` : "";
  if (dn.noteType === "CREDIT") {
    return `Accept and apply credit note ${dn.dnNo}${dn.vendorRef ? ` (vendor's no. ${dn.vendorRef})` : ""} from ${dn.vendor.name}? ${amount} will be taken off what you owe the vendor.${settles} This can't be undone.`;
  }
  if (dn.affectsStock) {
    return `Send ${dn.dnNo} to ${dn.vendor.name}? The returned quantities will be taken out of stock now and ${amount} will be taken off what you owe the vendor.${settles} This can't be undone.`;
  }
  return `Send ${dn.dnNo} to ${dn.vendor.name}? ${amount} (${NOTE_REASON_LABEL[dn.reasonType].toLowerCase()}) will be taken off what you owe the vendor.${settles} Stock does not change. This can't be undone.`;
}

function Notes() {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const { can, user } = useAuth();
  const canCreate = can("notes.create");
  const canEdit = can("notes.edit");
  const canDelete = can("notes.delete");
  // Drafts: whoever raised them; posted notes (vendor gave another solution): L2 and above
  const level = approvalLevel(user);
  const canCancel = (dn: DebitNote) => canCancelNote(dn, { userId: user?.id, canDelete, level });
  const [cancelling, setCancelling] = useState<DebitNote | null>(null);
  const canVendors = can("vendors.view");
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: TypeTab = params.get("type") === "credit" ? "credit" : "debit";
  const noteType: NoteType = tab === "credit" ? "CREDIT" : "DEBIT";
  const isDebit = noteType === "DEBIT";
  const [status, setStatus] = useState<Filter>("");
  const [filters, setFilters] = useState(noListFilters);
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<DebitNote | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<DebitNote> & { drafts: { count: number; value: string | number } }>(
    "/debit-notes",
    { ...filters, noteType, status, page, pageSize: 25 },
  );
  const { data: store } = useApi<StoreSettings>("/settings");

  const rows = data?.items ?? [];
  // Draft totals come from the server so they cover every page
  const drafts = { length: data?.drafts.count ?? 0 };
  const draftValue = n(data?.drafts.value);

  function changeTab(t: TypeTab) {
    setPage(1);
    router.replace(t === "credit" ? `${pathname}?type=credit` : pathname, { scroll: false });
  }

  async function post(dn: DebitNote) {
    if (!(await confirm(postMessage(dn), { confirmLabel: postLabel(dn.noteType) }))) return;
    setBusy(dn.id);
    try {
      await api.post(`/debit-notes/${dn.id}/send`);
      toast.success(
        dn.noteType === "CREDIT"
          ? `${dn.dnNo} applied · payable reduced by ${inr(dn.totalAmount)}`
          : `${dn.dnNo} sent${dn.affectsStock ? " · stock removed" : ""}${reducesPayable(dn) ? " · payable reduced" : ""}`,
      );
      void reload();
      setViewing((v) => (v?.id === dn.id ? { ...v, status: "SENT" } : v));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const actions = (dn: DebitNote, size: "sm" | "md" = "sm") =>
    dn.status === "SENT" ? (
      canCancel(dn) && (
        <Button size={size} variant="ghost" icon={<Ban className="size-4" />} onClick={() => setCancelling(dn)}>
          Cancel
        </Button>
      )
    ) :
    dn.status === "DRAFT" &&
    (canEdit || canDelete) && (
      <>
        {canEdit && (
        <Button
          size={size}
          icon={dn.noteType === "DEBIT" ? <Send className="size-4" /> : <CheckCircle2 className="size-4" />}
          onClick={() => post(dn)}
          loading={busy === dn.id}
        >
          {postLabel(dn.noteType)}
        </Button>
        )}
        {canCancel(dn) && (
          <Button size={size} variant="ghost" icon={<Ban className="size-4" />} onClick={() => setCancelling(dn)} disabled={busy === dn.id}>
            Cancel
          </Button>
        )}
      </>
    );

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Debit & Credit Notes"
          subtitle={
            isDebit
              ? "Debit notes you raise to vendors to reduce what you owe — goods returned, rate overcharged, short supply, damaged in transit"
              : "Credit notes vendors give you, reducing what you owe — scheme incentives, price protection, cash discounts, accepted debit notes"
          }
          actions={
            !canCreate ? undefined : isDebit ? (
              <Button variant="add" icon={<FileMinus className="size-4" />} onClick={() => setFormOpen(true)}>
                New Debit Note
              </Button>
            ) : (
              <Button icon={<FilePlus className="size-4" />} onClick={() => setFormOpen(true)}>
                Record Credit Note
              </Button>
            )
          }
        />

        <Tabs<TypeTab>
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "debit", label: "Debit Notes" },
            { value: "credit", label: "Credit Notes" },
          ]}
        />

        {status !== "SENT" && status !== "CANCELLED" && drafts.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {drafts.length} draft {noteTypeName(noteType)}
            {drafts.length === 1 ? "" : "s"} worth {inr(draftValue)}{" "}
            {isDebit ? "not yet sent to the vendor" : "recorded but not yet applied"} — they don&apos;t change the vendor balance until{" "}
            {isDebit ? "sent" : "accepted & applied"}.
          </div>
        )}

        <Card bodyClassName="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["", "All"],
                  ["DRAFT", "Draft"],
                  ["SENT", isDebit ? "Sent" : "Applied"],
                  ["CANCELLED", "Cancelled"],
                ] as [Filter, string][]
              ).map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => {
                    setStatus(value);
                    setPage(1);
                  }}
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    status === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto">
              <ListFilters
                value={filters}
                optionsPath="/debit-notes/filters"
                onChange={(f) => {
                  setFilters(f);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {error ? (
            <div className="p-4">
              <ErrorBox message={error} onRetry={reload} />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{isDebit ? "Debit Note" : "Credit Note"}</Th>
                  <Th>Vendor</Th>
                  <Th>Reason</Th>
                  <Th>Against</Th>
                  <Th className="hidden md:table-cell">Vendor Ref</Th>
                  <Th right>Value Incl. GST</Th>
                  <Th>Status</Th>
                  <ActionsTh />
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <LoadingRow colSpan={8} />
                ) : !rows.length ? (
                  <EmptyRow colSpan={8}>
                    No {noteTypeName(noteType)}s{status || hasListFilters(filters) ? " for these filters" : " yet"}.
                  </EmptyRow>
                ) : (
                  rows.map((dn) => (
                    <tr key={dn.id} className={cx("align-top hover:bg-slate-50", dn.status === "CANCELLED" && "opacity-60")}>
                      <Td className="whitespace-nowrap">
                        <button type="button" onClick={() => setViewing(dn)} className="font-medium text-slate-900 hover:text-brand-700">
                          {dn.dnNo}
                        </button>
                        <p className="text-xs text-slate-500">{date(dn.noteDate)}</p>
                      </Td>
                      <Td className="min-w-36">
                        {canVendors ? (
                          <Link href={`/vendors/${dn.vendor.id}`} className="hover:text-brand-700">
                            {dn.vendor.name}
                          </Link>
                        ) : (
                          dn.vendor.name
                        )}
                      </Td>
                      <Td className="min-w-48 max-w-64">
                        <ReasonBadge reason={dn.reasonType} />
                        <p className="mt-0.5 text-xs text-slate-600">{dn.reason}</p>
                        {dn.status === "CANCELLED" && dn.cancelReason && <p className="mt-0.5 text-xs text-red-600">Cancelled: {dn.cancelReason}</p>}
                      </Td>
                      <Td className="whitespace-nowrap text-sm">
                        <Against dn={dn} />
                      </Td>
                      <Td className="hidden whitespace-nowrap text-slate-600 md:table-cell">{dn.vendorRef || "—"}</Td>
                      <Td right className="whitespace-nowrap font-medium">
                        {inr(dn.totalAmount)}
                      </Td>
                      <Td>
                        <NoteStatusBadge status={dn.status} type={dn.noteType} />
                      </Td>
                      <ActionsTd>
                        {actions(dn)}
                        <RowAction kind="view" title={`View ${dn.dnNo}`} onClick={() => setViewing(dn)} />
                      </ActionsTd>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
        </Card>
      </div>

      {viewing && (
        <>
          <Modal
            open
            onClose={() => setViewing(null)}
            size="lg"
            title={
              <span className="flex flex-wrap items-center gap-2">
                {viewing.dnNo} <NoteStatusBadge status={viewing.status} type={viewing.noteType} />
              </span>
            }
            footer={
              <>
                {actions(viewing, "md")}
                <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
                  Print
                </Button>
              </>
            }
          >
            <NoteDoc
              dn={viewing}
              store={store}
              onShipTo={
                canEdit && viewing.status !== "CANCELLED"
                  ? async (text) => {
                      const r = await api.patch<{ shipTo: string | null }>(`/debit-notes/${viewing.id}/ship-to`, { shipTo: text });
                      setViewing((v) => (v ? { ...v, shipTo: r.shipTo } : v));
                      void reload();
                    }
                  : undefined
              }
            />
            <Attachments type="NOTE" entityId={viewing.id} canManage={can("notes.create") || can("notes.edit")} bare className="mt-5 border-t border-slate-100 pt-4" />
          </Modal>
          {/* The modal is hidden when printing; this copy is what prints */}
          <div className="print-area hidden print:block">
            <NoteDoc dn={viewing} store={store} />
          </div>
        </>
      )}

      {cancelling && (
        <CancelNoteModal
          dn={cancelling}
          level={level}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            const id = cancelling.id;
            setCancelling(null);
            void reload();
            setViewing((v) => (v?.id === id ? { ...v, status: "CANCELLED" } : v));
          }}
        />
      )}

      <NoteForm
        open={formOpen}
        noteType={noteType}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          if (status && status !== "DRAFT") setStatus("DRAFT");
          void reload();
        }}
      />
    </>
  );
}

/** Invoice / PO / GRN the note is against */
function Against({ dn }: { dn: DebitNote }) {
  const links = [
    dn.purchase && { href: `/purchases/${dn.purchase.id}`, label: dn.purchase.purchaseNo, sub: dn.purchase.vendorInvoiceNo },
    dn.po && { href: `/purchase-orders/${dn.po.id}`, label: dn.po.poNo },
    dn.grn && { href: `/goods-inward/${dn.grn.id}`, label: dn.grn.grnNo },
  ].filter(Boolean) as { href: string; label: string; sub?: string | null }[];
  if (!links.length) return <span className="text-slate-400">{dn.affectsStock ? "Stock return" : "Vendor account"}</span>;
  return (
    <>
      {links.map((l) => (
        <p key={l.href}>
          <Link href={l.href} className="text-brand-700 hover:underline">
            {l.label}
          </Link>
          {l.sub && <span className="text-xs text-slate-500"> · {l.sub}</span>}
        </p>
      ))}
    </>
  );
}

/** Shipping address below "To": a text box while it can be changed, plain text on paper */
function ShipTo({ dn, onSave }: { dn: DebitNote; onSave?: (text: string) => Promise<void> }) {
  const toast = useToast();
  const [text, setText] = useState(dn.shipTo ?? "");
  const [saving, setSaving] = useState(false);
  // Choices: each active branch's address, or "" meaning a typed address
  const [pick, setPick] = useState("");
  const { data: branches } = useApi<Branch[]>(onSave ? "/branches" : null);
  const addressOf = (b: Branch) => [b.name, b.address, [b.city, b.state].filter(Boolean).join(", ")].filter(Boolean).join("\n");
  const options = [
    { value: "", label: "Type a different address" },
    ...(branches ?? []).filter((b) => b.isActive && b.address).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
  ];
  const choose = (id: string) => {
    setPick(id);
    const b = (branches ?? []).find((x) => x.id === id);
    if (b) setText(addressOf(b));
  };
  const changed = text.trim() !== (dn.shipTo ?? "").trim();
  if (!onSave) {
    if (!dn.shipTo) return null;
    return (
      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-slate-500">Ship To</p>
        <p className="whitespace-pre-line text-xs text-slate-700">{dn.shipTo}</p>
      </div>
    );
  }
  async function save() {
    setSaving(true);
    try {
      await onSave!(text);
      toast.success("Shipping address saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">Ship To</p>
      <Dropdown
        options={options}
        value={pick}
        onChange={choose}
        placeholder="Choose a branch address or type one"
        className="mt-1 w-full text-xs"
        aria-label="Ship to from"
      />
      <Textarea
        rows={3}
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type the shipping address for the returned goods"
        className="mt-1.5 text-xs"
        aria-label="Ship to address"
      />
      {changed && (
        <div className="mt-1.5 flex gap-2">
          <Button size="sm" onClick={save} loading={saving}>
            Save Address
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setText(dn.shipTo ?? "")} disabled={saving}>
            Undo
          </Button>
        </div>
      )}
    </div>
  );
}

function NoteDoc({ dn, store, onShipTo }: { dn: DebitNote; store: StoreSettings | null; onShipTo?: (text: string) => Promise<void> }) {
  const isDebit = dn.noteType === "DEBIT";
  const pos = placeOfSupply(dn.vendor, store);
  const hasBatches = dn.items.some((i) => i.batchNo);
  const against = [
    dn.purchase && `${dn.purchase.purchaseNo}${dn.purchase.vendorInvoiceNo ? ` (vendor bill ${dn.purchase.vendorInvoiceNo})` : ""}`,
    dn.po && dn.po.poNo,
    dn.grn && `${dn.grn.grnNo}${dn.reasonType === "REJECTED_AT_INWARD" ? " (rejected at inward)" : ""}`,
  ].filter(Boolean);
  return (
    <div className="paper rounded-md bg-white p-1 text-sm text-slate-800">
      <PrintHeader
        className="mb-4"
        store={store}
        title={isDebit ? "Debit Note" : "Credit Note"}
        number={dn.dnNo}
        status={
          dn.status === "CANCELLED" ? { label: "Cancelled", tone: "red" } : dn.status === "DRAFT" ? { label: "Draft", tone: "amber" } : null
        }
      />
      {/* Stacks on phones in the modal; the print: classes keep the printed copy as it was */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">{isDebit ? "To" : "From"}</p>
          <p className="break-words font-semibold">{dn.vendor.name}</p>
          {vendorAddresses(dn.vendor).billing && <p className="text-xs text-slate-600">Billing: {vendorAddresses(dn.vendor).billing}</p>}
          {vendorAddresses(dn.vendor).shipping && <p className="text-xs text-slate-600">Shipping: {vendorAddresses(dn.vendor).shipping}</p>}
          <p className="mt-1 text-xs text-slate-600">
            {dn.vendor.code && (
              <>
                Vendor code <span className="font-mono">{dn.vendor.code}</span> ·{" "}
              </>
            )}
            GSTIN <span className="font-mono">{dn.vendor.gstin || "—"}</span>
          </p>
          <p className="text-xs text-slate-600">Place of supply: {pos.label}</p>
          {/* Keyed so the box resets when another note opens or the saved text changes */}
          <ShipTo key={`${dn.id}:${dn.shipTo ?? ""}`} dn={dn} onSave={onShipTo} />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 break-words">
          <dt className="text-slate-500">Note no.</dt>
          <dd className="font-medium">{dn.dnNo}</dd>
          <dt className="text-slate-500">Date</dt>
          <dd>{date(dn.noteDate)}</dd>
          {dn.vendorRef && (
            <>
              <dt className="text-slate-500">{isDebit ? "Vendor ref." : "Vendor's note no."}</dt>
              <dd className="font-medium">{dn.vendorRef}</dd>
            </>
          )}
          <dt className="text-slate-500">Against</dt>
          <dd>{against.length ? against.join(" · ") : dn.affectsStock ? "Stock return" : "Vendor account"}</dd>
          <dt className="text-slate-500">Type</dt>
          <dd>{NOTE_REASON_LABEL[dn.reasonType]}</dd>
          <dt className="text-slate-500">Reason</dt>
          <dd>{dn.reason}</dd>
          {dn.status === "CANCELLED" && dn.cancelReason && (
            <>
              <dt className="text-slate-500">Cancelled</dt>
              <dd className="text-red-700">
                {dn.cancelReason}
                {dn.cancelledAt ? ` · ${date(dn.cancelledAt)}` : ""}
              </dd>
            </>
          )}
        </dl>
      </div>
      {/* Scrolls sideways inside the modal on phones; prints at full width */}
      <div className="max-w-full overflow-x-auto overscroll-x-contain print:overflow-visible">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-y border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Item</th>
            {hasBatches && <th className="py-1.5 pr-2">Batch</th>}
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">{dn.reasonType === "RATE_DIFFERENCE" ? "Overcharge / unit" : "Rate"}</th>
            <th className="py-1.5 pr-2 text-right">GST</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {dn.items.map((i, idx) => (
            <tr key={i.id} className="border-b border-slate-100">
              <td className="py-1.5 pr-2 text-slate-400">{idx + 1}</td>
              <td className="min-w-32 py-1.5 pr-2 print:min-w-0">
                {i.product?.name ?? i.description ?? "—"}
                {i.product?.hsnCode && <span className="text-xs text-slate-500"> · HSN {i.product.hsnCode}</span>}
                {i.product && i.description && <span className="block text-xs text-slate-500">{i.description}</span>}
              </td>
              {hasBatches && <td className="py-1.5 pr-2 font-mono text-xs">{i.batchNo || "—"}</td>}
              <td className="num py-1.5 pr-2 text-right">
                {qty(i.quantity)} {i.product?.unit ?? ""}
              </td>
              <td className="num py-1.5 pr-2 text-right">{inr(i.rate)}</td>
              <td className="num py-1.5 pr-2 text-right">{n(i.gstRate)}%</td>
              <td className="num py-1.5 text-right font-medium">{inr(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-4">
        <div className="max-w-sm">
          <p className="text-xs text-slate-500">Amount in words</p>
          <p className="font-medium">{amountInWords(n(dn.totalAmount))}</p>
        </div>
        <dl className="w-full space-y-1 sm:w-60 print:w-60">
          <div className="flex justify-between">
            <dt className="text-slate-500">Taxable value</dt>
            <dd className="num">{inr(dn.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">GST{pos.taxType ? ` (${pos.taxType})` : ""}</dt>
            <dd className="num">{inr(dn.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="num">{inr(dn.totalAmount)}</dd>
          </div>
        </dl>
      </div>
      <SystemGeneratedNote doc={isDebit ? "debit note" : "credit note"} className="mt-8 border-t border-slate-200 pt-2.5" />
    </div>
  );
}
