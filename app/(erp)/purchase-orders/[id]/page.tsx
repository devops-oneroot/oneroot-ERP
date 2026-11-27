"use client";

import { LOGOS } from "@/lib/logos";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  FileDown,
  FileText,
  Mail,
  PackageCheck,
  Pencil,
  Printer,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { ApprovalChain } from "@/components/ApprovalChain";
import { Attachments } from "@/components/Attachments";
import { NotesPanel } from "@/components/NotesPanel";
import { PaymentPanel } from "@/components/PaymentPanel";
import { PrintPortal } from "@/components/PrintPortal";
import { useCounts } from "@/components/Notifications";
import { isInterState } from "@/components/PoForm";
import { LazyPoTermsModal } from "@/components/lazy";
import { PO_TERMS_SHORT } from "@/components/PoTermsModal";
import { vendorAddresses } from "@/lib/address";
import { branchAddress, branchLabel } from "@/components/VendorBranches";
import { CHARGES_GST_RATE, gstSlabs, halfRate, placeOfSupply } from "@/lib/gst";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Input,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
  PrintLogo,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { amountInWords, date, dateTime, daysUntil, inr, n, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { printAs } from "@/lib/print";
import { PO_PAYMENT_TERMS, type PoHistory, type PurchaseOrder, type StoreSettings } from "@/lib/types";

type Decision = "approve" | "send_back" | "reject";

/** Who supplies the PO for GST: the vendor branch when it has its own GSTIN, else the vendor (as the backend decides) */
const supplierOf = (po: PurchaseOrder) => (po.vendorBranch?.gstin ? po.vendorBranch : po.vendor);

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, user } = useAuth();
  const { refresh } = useCounts();
  const toast = useToast();
  const confirm = useConfirm();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [sending, setSending] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const { data: po, error, loading, reload } = useApi<PurchaseOrder>(`/purchase-orders/${id}`);
  const { data: store } = useApi<StoreSettings>("/settings");

  async function cancelPo() {
    if (!po) return;
    const ok = await confirm(
      `Cancel ${po.poNo}? The vendor order for ${inr(po.totalAmount)} is withdrawn and no goods can be received against it. This cannot be undone.`,
      { danger: true, confirmLabel: "Cancel PO" },
    );
    if (!ok) return;
    setCancelling(true);
    try {
      await api.post(`/purchase-orders/${po.id}/cancel`);
      toast.success(`${po.poNo} cancelled`);
      refresh();
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCancelling(false);
    }
  }

  async function downloadPdf() {
    if (!po) return;
    try {
      const blob = await api.blob(`/purchase-orders/${po.id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !po) return <Spinner page />;
  if (!po) return null;

  const v = po.vendor;
  const items = po.items ?? [];
  const history = po.history ?? [];
  const pending = po.status === "PENDING_APPROVAL";
  const receivable = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED";
  // po.edit edits any open PO; a raiser their own drafts and sent-back POs
  const isBuyer = can("po.edit") || (can("po.create") && po.createdBy?.id === user?.id && (po.status === "DRAFT" || po.status === "SENT_BACK"));
  // Named approvers can open this page without the purchases section
  const canBrowse = can("purchases.view");
  const vb = po.vendorBranch;
  const supplier = supplierOf(po);
  // As saved: the backend decides it from the delivery branch's state, not only the store's
  const igst = po.isInterState ?? isInterState(supplier, store);
  const pos = placeOfSupply(supplier, store);
  const tax = n(po.taxAmount);
  const slabs = poGstSlabs(po);
  const late = receivable ? daysUntil(po.expectedDate) : null;
  const lastNote = (prefix: string) => history.find((h) => h.action.startsWith(prefix));

  const editLabel =
    po.status === "APPROVED" ? "Edit (needs re-approval)" : po.status === "DRAFT" || po.status === "SENT_BACK" ? "Edit and submit" : "Edit";

  const completedBills = (po.purchases ?? []).filter((p) => p.status === "COMPLETED");
  // Notes make sense once goods have been ordered from (or delivered by) the vendor
  const notesOpen = po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED" || po.status === "RECEIVED";
  const showNotes = notesOpen || (po.debitNotes?.length ?? 0) > 0;

  const sum = (key: "quantity" | "passedQty" | "rejectedQty" | "damagedQty" | "expiredQty") => items.reduce((s, i) => s + n(i[key]), 0);
  const pendingTotal = items.reduce((s, i) => s + n(i.pendingQty), 0);

  return (
    <>
      <div className="no-print mb-2">
        <Link
          href={canBrowse ? "/purchase-orders" : "/purchase-orders/approvals"}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-4" /> {canBrowse ? "Purchase Orders" : "PO Approvals"}
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {po.poNo}
            <StatusBadge status={po.displayStatus ?? po.status} />
            {po.round > 1 && <Badge tone="violet">Round {po.round}</Badge>}
          </span>
        }
        subtitle={`${v?.name ?? "Vendor"} · ${date(po.orderDate)} · ${inr(po.totalAmount)}`}
        actions={
          <>
            {/* data-print-po: the server presses this to make the PDF emailed to the vendor */}
            <Button data-print-po variant="secondary" icon={<Printer className="size-4" />} onClick={() => printAs("sheet", "size: A4; margin: 0 !important;", `Purchase Order - ${po.poNo}`)}>
              Print
            </Button>
            <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={downloadPdf}>
              PDF
            </Button>
            <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => setTermsOpen(true)}>
              Terms & Conditions
            </Button>
            {receivable && (can("po.create") || isBuyer || can("purchases.approve")) && (
              <Button
                variant={po.vendorEmailedAt ? "secondary" : "primary"}
                icon={<Mail className="size-4" />}
                disabled={!!po.vendorEmailedAt}
                title={po.vendorEmailedAt ? `Sent to the vendor by ${po.vendorEmailedBy ?? "—"} on ${dateTime(po.vendorEmailedAt)}` : undefined}
                onClick={() => setSending(true)}
              >
                {po.vendorEmailedAt ? "Sent to Vendor" : "Send to Vendor"}
              </Button>
            )}
            {po.canEdit && isBuyer && (
              <Button variant="edit" icon={<Pencil className="size-4" />} onClick={() => router.push(`/purchase-orders/${po.id}/edit`)}>
                {editLabel}
              </Button>
            )}
            {po.canEdit && can("purchases.cancel") && (
              <Button variant="secondary" icon={<Ban className="size-4" />} onClick={cancelPo} loading={cancelling}>
                Cancel PO
              </Button>
            )}
            {receivable && can("purchases.receive") && (
              <Button icon={<PackageCheck className="size-4" />} onClick={() => router.push(`/goods-inward/new?po=${po.id}`)}>
                Receive Goods
              </Button>
            )}
            {pending && po.canAct && (
              <>
                <Button variant="danger" icon={<XCircle className="size-4" />} onClick={() => setDecision("reject")}>
                  Reject
                </Button>
                <Button variant="secondary" icon={<CornerUpLeft className="size-4" />} onClick={() => setDecision("send_back")}>
                  Send Back
                </Button>
                <Button icon={<CheckCircle2 className="size-4" />} onClick={() => setDecision("approve")}>
                  Approve
                </Button>
              </>
            )}
          </>
        }
      />

      <StatusNotice po={po} lastNote={lastNote} />
      <LazyPoTermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
      {sending && <SendToVendorModal po={po} onClose={() => setSending(false)} onDone={() => { setSending(false); void reload(); }} />}

      {/* Printed on its own from under <body>, so nothing in the app layout can shift its pages */}
      <PrintPortal className="sheet-host">
        <PoPrint po={po} store={store} notApproved={po.status === "DRAFT" || pending || po.status === "SENT_BACK"} />
      </PrintPortal>

      <div className="print:hidden">
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3 print:block">
          <Card title="Order Details" className="lg:col-span-2 print:mb-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</p>
                {v ? (
                  <>
                    {can("vendors.view") ? (
                      <Link href={`/vendors/${v.id}`} className="mt-1 block break-words font-semibold text-slate-900 hover:text-brand-700">
                        {v.name}
                      </Link>
                    ) : (
                      <p className="mt-1 break-words font-semibold text-slate-900">{v.name}</p>
                    )}
                    <p className="break-words text-sm text-slate-600">
                      <span className="text-slate-500">Billing: </span>
                      {vendorAddresses(v).billing || "—"}
                    </p>
                    <p className="break-words text-sm text-slate-600">
                      <span className="text-slate-500">Shipping: </span>
                      {vendorAddresses(v).shipping || "—"}
                    </p>
                    <p className="text-sm text-slate-600">{[v.contactPerson, v.phone].filter(Boolean).join(" · ")}</p>
                    {vb && (
                      <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Buying From Branch</p>
                        <p className="font-semibold text-slate-900">
                          {branchLabel(vb)}
                          {!vb.isActive && <span className="ml-1.5 text-xs font-normal text-slate-500">(inactive)</span>}
                        </p>
                        <p className="break-words text-sm text-slate-600">{branchAddress(vb) || "—"}</p>
                        <p className="break-words text-sm text-slate-600">{[vb.contactPerson, vb.phone, vb.gstin && `GSTIN ${vb.gstin}`].filter(Boolean).join(" · ")}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">—</p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Invoice date</dt>
                <dd className="font-medium text-slate-900">{date(po.orderDate)}</dd>
                <dt className="text-slate-500">Expected</dt>
                <dd>
                  {date(po.expectedDate)}
                  {late !== null && late < 0 && (
                    <span className="no-print ml-1.5">
                      <Badge tone="red">{-late}d late</Badge>
                    </span>
                  )}
                </dd>
                <dt className="text-slate-500">Expiry</dt>
                <dd>{po.expiryDays ? `${po.expiryDays} days` : "—"}</dd>
                <dt className="text-slate-500">Vendor code</dt>
                <dd className="font-mono text-xs">{v?.code || "—"}</dd>
                <dt className="text-slate-500">{vb?.gstin ? "Branch GSTIN" : "Vendor GSTIN"}</dt>
                <dd className="break-all font-mono text-xs">{supplier?.gstin || "—"}</dd>
                <dt className="text-slate-500">Place of supply</dt>
                <dd>
                  {pos.label}
                </dd>
                {po.branch && (
                  <>
                    <dt className="text-slate-500">Deliver to</dt>
                    <dd>
                      <span className="font-medium text-slate-900">{po.branch.name}</span>
                      <span className="ml-1 font-mono text-[11px] text-slate-500">{po.branch.code}</span>
                      {(po.branch.address || po.branch.city) && (
                        <span className="block text-xs text-slate-500">{[po.branch.address, po.branch.city].filter(Boolean).join(", ")}</span>
                      )}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500">Payment terms</dt>
                <dd>
                  {PO_PAYMENT_TERMS.find((t) => t.value === (po.paymentTerm ?? "AFTER_GRN"))?.label}
                  {po.paymentTerm && po.paymentTerm !== "AFTER_GRN" && (
                    <span className="block text-xs text-slate-500">
                      Advance {inr(po.advanceAmount)} ·{" "}
                      {n(po.advancePaid) >= n(po.advanceAmount) - 0.004 ? (
                        <span className="font-medium text-brand-700">paid</span>
                      ) : (
                        <span className="font-medium text-amber-700">
                          {n(po.advancePaid) > 0 ? `${inr(po.advancePaid)} paid, ` : ""}
                          {inr(n(po.advanceAmount) - n(po.advancePaid))} due
                        </span>
                      )}
                    </span>
                  )}
                </dd>
                <dt className="text-slate-500">Raised by</dt>
                <dd>{po.createdBy?.name ?? "—"}</dd>
                <dt className="text-slate-500">Approval round</dt>
                <dd>{po.round}</dd>
              </dl>
            </div>
          </Card>

          <Card title="Approval" className="no-print">
            <ApprovalSteps po={po} history={history} />
          </Card>
        </div>

        <Card bodyClassName="p-0" className="mb-4" title={`Items (${items.length})`}>
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Product</Th>
                <Th>SKU Code</Th>
                <Th right>Ordered</Th>
                <Th right>Rate</Th>
                <Th right>Disc.</Th>
                <Th right>GST</Th>
                <Th right>Amount</Th>
                <Th right className="print:hidden">Passed</Th>
                <Th right className="print:hidden">Rejected</Th>
                <Th right className="print:hidden">Damaged</Th>
                <Th right className="print:hidden">Expired</Th>
                <Th right className="print:hidden">Pending</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id}>
                  <Td className="text-slate-400">{i + 1}</Td>
                  <Td className="min-w-40 sm:min-w-48">
                    <p className="font-medium text-slate-900">{it.product.name}</p>
                    <p className="text-xs text-slate-500">
                      {[it.product.hsnCode && `HSN ${it.product.hsnCode}`, it.product.packSize].filter(Boolean).join(" · ")}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-800 print:bg-transparent print:px-0">{it.product.sku}</span>
                  </Td>
                  <Td right className="whitespace-nowrap">
                    {qty(it.quantity)} <span className="text-xs text-slate-500">{it.product.unit}</span>
                  </Td>
                  <Td right>{inr(it.rate)}</Td>
                  <Td right className={n(it.discountPct) ? "text-brand-700" : "text-slate-400"}>
                    {n(it.discountPct) ? `${n(it.discountPct)}%` : "—"}
                  </Td>
                  <Td right className="text-slate-500">
                    {n(it.gstRate)}%
                  </Td>
                  <Td right className="font-medium text-slate-900">
                    {inr(it.amount)}
                  </Td>
                  <QtyCell value={it.passedQty} tone="text-brand-700" />
                  <QtyCell value={it.rejectedQty} tone="text-red-600" />
                  <QtyCell value={it.damagedQty} tone="text-amber-700" />
                  <QtyCell value={it.expiredQty} tone="text-amber-700" />
                  <QtyCell value={it.pendingQty} tone="font-semibold text-slate-900" />
                </tr>
              ))}
            </tbody>
            {items.length > 1 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td colSpan={3} className="text-right text-slate-600">
                    Total
                  </Td>
                  <Td right>{qty(sum("quantity"))}</Td>
                  <Td />
                  <Td />
                  <Td />
                  <Td right className="text-slate-900">
                    {inr(round2(items.reduce((s, it) => s + n(it.amount), 0)))}
                  </Td>
                  <Td right className="print:hidden">{qty(sum("passedQty"))}</Td>
                  <Td right className="print:hidden">{qty(sum("rejectedQty"))}</Td>
                  <Td right className="print:hidden">{qty(sum("damagedQty"))}</Td>
                  <Td right className="print:hidden">{qty(sum("expiredQty"))}</Td>
                  <Td right className="print:hidden">{qty(pendingTotal)}</Td>
                </tr>
              </tfoot>
            )}
          </Table>
          <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 sm:p-4">
            <div className="text-sm">
              <p className="text-xs text-slate-500">Amount in words</p>
              <p className="mt-0.5 font-medium text-slate-800">{amountInWords(n(po.totalAmount))}</p>
              {po.notes && (
                <>
                  <p className="mt-3 text-xs text-slate-500">Notes</p>
                  <p className="mt-0.5 whitespace-pre-line text-slate-700">{po.notes}</p>
                </>
              )}
            </div>
            <dl className="space-y-1.5 text-sm sm:ml-auto sm:w-72">
              {/* Charges come before GST: each is taxed at its own rate (18% by default) */}
              <Row label="Items Value" value={inr(po.subtotal)} />
              {n(po.transportCharges) > 0 && <Row label={`Transportation Charges ${transportNote(po)}`} value={inr(po.transportCharges)} />}
              {n(po.otherCharges) > 0 && (
                <Row
                  label={`${po.otherChargesNote ? `Other charges (${po.otherChargesNote})` : "Other Charges"} (excl. GST ${chargeRate(po.otherChargesGstRate)}%)`}
                  value={inr(po.otherCharges)}
                />
              )}
              <Row label="Taxable Value" value={inr(round2(n(po.subtotal) + n(po.transportCharges) + n(po.otherCharges)))} />
              <GstRows slabs={slabs} igst={igst} total={tax} />
              {n(po.roundOff) !== 0 && <Row label="Round Off" value={`${n(po.roundOff) > 0 ? "+" : "−"}${inr(Math.abs(n(po.roundOff)))}`} />}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <dt>PO Total</dt>
                <dd className="num">{inr(po.totalAmount)}</dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>

      <div className="no-print mb-4 grid grid-cols-1 gap-4">
        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <Truck className="size-4 text-slate-400" /> Goods Inward
            </span>
          }
          bodyClassName="p-0"
          actions={<span className="num text-xs text-slate-500">{po.receivedPct}% received</span>}
        >
          {!po.grns?.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              {receivable ? "Nothing received yet" : "Goods can be received once the PO is approved"}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {po.grns.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm sm:px-4">
                  {canBrowse ? (
                    <Link href={`/goods-inward/${g.id}`} className="font-medium text-brand-700 hover:underline">
                      {g.grnNo}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{g.grnNo}</span>
                  )}
                  <span className="text-xs text-slate-500">
                    {dateTime(g.receivedAt)}
                    {g.receivedBy && ` · ${g.receivedBy.name}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {/* Purchase Invoices removed from the PO (vendor bills are booked from the GRN)
        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4 text-slate-400" /> Purchase Invoices
            </span>
          }
          bodyClassName="p-0"
        >
          {!po.purchases?.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No vendor bills booked against this PO yet</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {po.purchases.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm sm:px-4">
                  {canBrowse ? (
                    <Link href={`/purchases/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.purchaseNo}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{p.purchaseNo}</span>
                  )}
                  <StatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        */}
      </div>

      {showNotes && v && (
        <NotesPanel
          className="mb-4"
          notes={po.debitNotes}
          allowNew={notesOpen}
          preset={{
            vendor: { id: v.id, name: v.name },
            po: { id: po.id, poNo: po.poNo },
            // One bill against this PO: the note is against it; otherwise the form lets you pick
            purchase: completedBills.length === 1 ? completedBills[0] : undefined,
          }}
          onChanged={() => void reload()}
        />
      )}

      {po.payment && v && (
        <PaymentPanel payment={po.payment} vendor={v} poId={po.id} docNo={po.poNo} onPaid={() => void reload()} className="no-print mb-4" />
      )}

      {/* Quotes, vendor invoices, spec sheets… attached to this PO */}
      <Attachments type="PO" entityId={po.id} canManage={can("po.create") || can("po.edit")} className="no-print mb-4" />

      <Card title="Approval History" className="no-print">
        <Timeline history={history} currentRound={po.round} />
      </Card>

      {decision && (
        <DecisionModal
          po={po}
          action={decision}
          onClose={() => setDecision(null)}
          onDone={() => {
            setDecision(null);
            refresh();
            void reload();
          }}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between max-sm:gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num text-slate-800">{value}</dd>
    </div>
  );
}

function QtyCell({ value, tone }: { value: unknown; tone: string }) {
  const x = n(value);
  return (
    <Td right className={cx("print:hidden", x ? tone : "text-slate-300")}>
      {x ? qty(x) : "—"}
    </Td>
  );
}

/** Banner explaining where the PO stands and what happens next */
function StatusNotice({ po, lastNote }: { po: PurchaseOrder; lastNote: (prefix: string) => PoHistory | undefined }) {
  const box = "no-print mb-4 flex gap-2.5 rounded-lg border px-4 py-3 text-sm";
  if (po.status === "PENDING_APPROVAL" && po.waitingFor) {
    const w = po.waitingFor;
    return (
      <div className={cx(box, "border-amber-200 bg-amber-50 text-amber-800")}>
        <Clock className="mt-0.5 size-4 shrink-0" />
        <p>
          Waiting for <strong>{w.approverName ?? "any manager"}</strong> ({w.title}) — step {po.level + 1} of {po.chain.length}.
          {po.canAct && <span className="font-medium"> You can approve, send back or reject it now.</span>}
        </p>
      </div>
    );
  }
  if (po.status === "SENT_BACK") {
    const h = lastNote("Sent back");
    return (
      <div className={cx(box, "border-amber-200 bg-amber-50 text-amber-800")}>
        <CornerUpLeft className="mt-0.5 size-4 shrink-0" />
        <p>
          Sent back for changes{h && ` by ${h.userName}`}
          {h?.note && (
            <>
              : <span className="italic">&ldquo;{h.note}&rdquo;</span>
            </>
          )}
          . Edit and resubmit to start approval round {po.round + 1}.
        </p>
      </div>
    );
  }
  if (po.status === "REJECTED") {
    const h = lastNote("Rejected");
    return (
      <div className={cx(box, "border-red-200 bg-red-50 text-red-700")}>
        <XCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          Rejected{h && ` by ${h.userName}`}
          {h?.note && (
            <>
              : <span className="italic">&ldquo;{h.note}&rdquo;</span>
            </>
          )}
          . Raise a new PO if the order is still needed.
        </p>
      </div>
    );
  }
  if (po.status === "DRAFT") {
    return (
      <div className={cx(box, "border-slate-200 bg-slate-50 text-slate-600")}>
        <FileText className="mt-0.5 size-4 shrink-0" />
        <p>This is a draft. Nobody has been asked to approve it yet — edit and submit it when ready.</p>
      </div>
    );
  }
  if (po.status === "CANCELLED") {
    return (
      <div className={cx(box, "border-slate-200 bg-slate-100 text-slate-600")}>
        <Ban className="mt-0.5 size-4 shrink-0" />
        <p>This PO was cancelled. No goods can be received against it.</p>
      </div>
    );
  }
  return null;
}

/** "Ragul (L1 Approval)" / "Ragul (for Owner)" → "Ragul": the step's title is shown beside it already */
const approverOnly = (userName: string, title: string) => userName.replace(new RegExp(`\\s*\\((for )?${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), "");

/**
 * Every step of the chain in the current round: its level, who may approve it, and what happened there —
 * approved / rejected / sent back by whom and when (with their comment), waiting since when, or not reached yet.
 */
function ApprovalSteps({ po, history }: { po: PurchaseOrder; history: PoHistory[] }) {
  const round = history.filter((h) => h.round === po.round);
  // The decision recorded at a step: "Approved · level 2", "Rejected · level 2", "Sent back · level 2"
  const decisionAt = (i: number) => [...round].reverse().find((h) => /^(Approved|Rejected|Sent back) · level \d+$/.test(h.action) && h.action.endsWith(` level ${i + 1}`));
  const submitted = [...round].reverse().find((h) => /^(Created and submitted|Submitted for approval|Resubmitted)/.test(h.action));
  const approvedAll = po.chain.length > 0 && po.chain.every((s) => s.state === "done") ? decisionAt(po.chain.length - 1) : undefined;

  const icon = (kind: "approved" | "rejected" | "sent" | "current" | "pending") =>
    kind === "approved" ? (
      <CheckCircle2 className="size-4 text-brand-600" />
    ) : kind === "current" ? (
      <Clock className="size-4 text-amber-600" />
    ) : kind === "rejected" ? (
      <XCircle className="size-4 text-red-600" />
    ) : kind === "sent" ? (
      <CornerUpLeft className="size-4 text-amber-600" />
    ) : (
      <span className="block size-4 rounded-full border-2 border-slate-300" />
    );

  return (
    <>
      <ApprovalChain chain={po.chain} className="mb-3" />
      {submitted && (
        <p className="mb-3 text-xs text-slate-500">
          {submitted.action} by <span className="font-medium text-slate-700">{submitted.userName}</span> · {dateTime(submitted.at)}
        </p>
      )}
      <ol className="space-y-3">
        {po.chain.map((s, i) => {
          const h = decisionAt(i);
          const kind =
            h?.action.startsWith("Approved") || s.state === "done"
              ? "approved"
              : h?.action.startsWith("Rejected") || s.state === "rejected"
                ? "rejected"
                : h?.action.startsWith("Sent back")
                  ? "sent"
                  : s.state === "current"
                    ? "current"
                    : "pending";
          // Waiting since the step before was approved (or since it was submitted, for the first step)
          const since = kind === "current" ? (i > 0 ? decisionAt(i - 1)?.at : submitted?.at) : undefined;
          return (
            <li key={s.order} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0">{icon(kind)}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-1.5 font-medium text-slate-800">
                  {s.level && <Badge tone={s.level === "L3" ? "violet" : s.level === "L2" ? "blue" : "slate"}>{s.level}</Badge>}
                  {s.title}
                  <span className="font-normal text-slate-500">· {s.approverName ?? "any manager"}</span>
                </p>
                {kind === "approved" ? (
                  <p className="text-xs text-slate-600">
                    {h ? (
                      <>
                        Approved by <span className="font-medium text-slate-800">{approverOnly(h.userName, s.title)}</span> · {dateTime(h.at)}
                      </>
                    ) : (
                      "Approved"
                    )}
                  </p>
                ) : kind === "rejected" ? (
                  <p className="text-xs text-red-700">
                    {h ? (
                      <>
                        Rejected by <span className="font-medium">{approverOnly(h.userName, s.title)}</span> · {dateTime(h.at)}
                      </>
                    ) : (
                      "Rejected here"
                    )}
                  </p>
                ) : kind === "sent" && h ? (
                  <p className="text-xs text-amber-800">
                    Sent back by <span className="font-medium">{approverOnly(h.userName, s.title)}</span> · {dateTime(h.at)}
                  </p>
                ) : kind === "current" ? (
                  <p className="text-xs text-amber-700">Waiting for a decision{since ? ` since ${dateTime(since)}` : ""}</p>
                ) : (
                  <p className="text-xs text-slate-400">Not reached yet</p>
                )}
                {h?.note && <p className="mt-1 whitespace-pre-line rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">&ldquo;{h.note}&rdquo;</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
        {po.chain.length} approval{po.chain.length === 1 ? "" : "s"} needed for {inr(po.totalAmount)}
        {approvedAll && ` · fully approved ${dateTime(approvedAll.at)}`}
      </p>
      <ApprovedBy po={po} history={history} />
    </>
  );
}

/**
 * Every approval given on this PO, oldest first: the PO's own steps in every round and the goods inward approved
 * against it — the step, who approved, when and their comment.
 */
function ApprovedBy({ po, history }: { po: PurchaseOrder; history: PoHistory[] }) {
  const rows = history
    .flatMap((h) => {
      // PO step: "Approved · level 2", approver recorded as "Name (Step title)" or "Name (for Step title)"
      const lvl = /^Approved · level (\d+)$/.exec(h.action);
      if (lvl) {
        const who = /^(.*?) \((?:for )?(.+)\)$/.exec(h.userName);
        const step = who?.[2] ?? (h.round === po.round ? po.chain[Number(lvl[1]) - 1]?.title : undefined) ?? `Step ${lvl[1]}`;
        return [{ id: h.id, what: "PO", step, name: who?.[1] ?? h.userName, at: h.at, note: h.note, round: h.round }];
      }
      // Goods inward step: "Goods inward approved · Step title"
      const grn = /^Goods inward approved · (.+)$/.exec(h.action);
      if (grn) return [{ id: h.id, what: "Goods Inward", step: grn[1], name: h.userName, at: h.at, note: h.note, round: h.round }];
      return [];
    })
    .sort((x, y) => x.at.localeCompare(y.at));
  const rounds = new Set(rows.map((r) => r.round)).size > 1;

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Approved By</p>
      {!rows.length ? (
        <p className="text-sm text-slate-400">No approvals yet</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                {rounds && <th className="px-2.5 py-1.5 font-medium">Round</th>}
                <th className="px-2.5 py-1.5 font-medium">Step</th>
                <th className="px-2.5 py-1.5 font-medium">Approved By</th>
                <th className="px-2.5 py-1.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  {rounds && <td className="px-2.5 py-1.5 text-slate-500">{r.round}</td>}
                  <td className="px-2.5 py-1.5">
                    <span className="text-slate-800">{r.step}</span>
                    {r.what !== "PO" && <p className="text-xs text-slate-500">{r.what}</p>}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <span className="font-medium text-slate-900">{r.name}</span>
                    {r.note && <p className="whitespace-pre-line text-xs text-slate-500">&ldquo;{r.note}&rdquo;</p>}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-slate-600">{dateTime(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const dotTone = (action: string) =>
  /^(Approved|GRN)/.test(action) || action.endsWith("posted")
    ? "bg-brand-500"
    : /^(Rejected|Cancelled)/.test(action)
      ? "bg-red-500"
      : /^Sent back|Edited|Saved changes/.test(action)
        ? "bg-amber-500"
        : "bg-sky-500";

function Timeline({ history, currentRound }: { history: PoHistory[]; currentRound: number }) {
  if (!history.length) return <p className="text-sm text-slate-400">No history yet</p>;
  const rounds = [...new Set(history.map((h) => h.round))].sort((a, b) => b - a);
  return (
    <div className="space-y-5">
      {rounds.map((r) => (
        <section key={r}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Round {r}</h3>
            {r === currentRound && rounds.length > 1 && <Badge tone="blue">Current</Badge>}
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <ol className="relative ml-1.5 border-l border-slate-200">
            {history
              .filter((h) => h.round === r)
              .map((h) => (
                <li key={h.id} className="relative pb-3 pl-5 last:pb-0">
                  <span className={cx("absolute -left-1.25 top-1.5 size-2.5 rounded-full ring-2 ring-white", dotTone(h.action))} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm">
                      <span className="font-medium text-slate-900">{h.action}</span>
                      <span className="text-slate-500"> · {h.userName}</span>
                    </p>
                    <p className="text-xs text-slate-400">{dateTime(h.at)}</p>
                  </div>
                  {h.note && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{h.note}</p>}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

const DECISION_COPY: Record<Decision, { title: string; button: string; variant: "primary" | "secondary" | "danger"; help: string }> = {
  approve: {
    title: "Approve",
    button: "Approve",
    variant: "primary",
    help: "Approving passes the PO to the next step, or marks it approved for goods inward if this is the last step.",
  },
  send_back: {
    title: "Send Back",
    button: "Send Back for Changes",
    variant: "primary",
    help: "The buyer is asked to make changes. When they resubmit, approval starts again from the first step as a new round.",
  },
  reject: {
    title: "Reject",
    button: "Reject PO",
    variant: "danger",
    help: "Rejecting closes the PO for good. The buyer has to raise a new one if the order is still needed.",
  },
};

const splitEmails = (s: string) => s.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send to Vendor: the PO emailed once, PDF attached, from the sender's mailbox, with CC typed here */
function SendToVendorModal({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [cc, setCc] = useState("");
  const [saving, setSaving] = useState(false);
  const to = (po.vendorBranch?.email || po.vendor?.email || "").trim();
  const ccList = splitEmails(cc);
  const badCc = ccList.filter((e) => !EMAIL_RE.test(e));

  async function send() {
    if (!to) return toast.error(`${po.vendor?.name ?? "The vendor"} has no email address — add it on the vendor first`);
    if (badCc.length) return toast.error(`Not a valid email: ${badCc.join(", ")}`);
    setSaving(true);
    try {
      const r = await api.post<{ to: string; cc: string[]; from: string; fallback?: string | null }>(`/purchase-orders/${po.id}/email`, { cc: ccList });
      toast.success(`${po.poNo} sent to ${r.to}${r.cc.length ? ` (cc ${r.cc.join(", ")})` : ""} from ${r.from}${r.fallback ? ` — shared account: ${r.fallback}` : ""}`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Send ${po.poNo} to Vendor`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<Mail className="size-4" />} onClick={send} loading={saving} disabled={!to}>
            Send Email
          </Button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">To</p>
          <p className="break-words font-medium text-slate-800">{to || <span className="text-red-600">No email on the vendor</span>}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500">From</p>
          <p className="break-words font-medium text-slate-800">{user?.email ?? "Your mailbox"}</p>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">CC (optional)</span>
        <Input autoFocus value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@example.com, another@example.com" />
        <span className={cx("mt-1 block text-xs", badCc.length ? "text-red-600" : "text-slate-500")}>
          {badCc.length ? `Not a valid email: ${badCc.join(", ")}` : "Separate addresses with commas."}
        </span>
      </label>
      <p className="mt-3 text-sm text-slate-600">The PO goes as a PDF attachment. A PO can be sent only once — the button is disabled after it is sent.</p>
    </Modal>
  );
}

function DecisionModal({ po, action, onClose, onDone }: { po: PurchaseOrder; action: Decision; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const copy = DECISION_COPY[action];
  const needsNote = action !== "approve";
  const step = po.waitingFor;

  async function submit() {
    if (needsNote && !note.trim()) return toast.error("Add a comment so the buyer knows what to change");
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${po.id}/decision`, { action, note: note.trim() || undefined });
      toast.success(
        action === "approve"
          ? po.level + 1 >= po.chain.length
            ? `${po.poNo} approved — Procurement is notified to send it to the vendor`
            : `${po.poNo} approved and passed to ${po.chain[po.level + 1]?.title ?? "the next step"}`
          : action === "send_back"
            ? `${po.poNo} sent back for changes`
            : `${po.poNo} rejected`,
      );
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${copy.title} ${po.poNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={copy.variant} onClick={submit} loading={saving}>
            {copy.button}
          </Button>
        </>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">Vendor</p>
          <p className="break-words font-medium text-slate-800">{po.vendor?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Value</p>
          <p className="num font-medium text-slate-800">{inr(po.totalAmount)}</p>
        </div>
        {step && (
          <div className="col-span-2">
            <p className="text-xs text-slate-500">Deciding for</p>
            <p className="font-medium text-slate-800">
              Step {po.level + 1} of {po.chain.length}: {step.title}
              {step.approverName && <span className="font-normal text-slate-500"> (assigned to {step.approverName})</span>}
            </p>
          </div>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-600">{copy.help}</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Comment{needsNote ? <span className="text-red-500"> *</span> : " (optional)"}
        </span>
        <Textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            action === "approve" ? "Anything the buyer or next approver should know" : action === "send_back" ? "What should be changed?" : "Why is this PO rejected?"
          }
        />
      </label>
    </Modal>
  );
}

/** Margin kept on every printed page (mm) */
const MARGIN_MM = 12;

/** GST % on a charge; older POs without one were saved before the 18% default */
const chargeRate = (rate: PurchaseOrder["transportGstRate"]) => (rate != null ? n(rate) : CHARGES_GST_RATE);
/** "(Excl. GST 18%)", or for an amount entered with GST: "(₹1,000.00 incl. GST 18% · value before GST)" */
const transportNote = (po: PurchaseOrder) => {
  const rate = chargeRate(po.transportGstRate);
  if (!po.transportGstInclusive) return `(Excl. GST ${rate}%)`;
  return `(${inr(round2(n(po.transportCharges) * (1 + rate / 100)))} incl. GST ${rate}% · value before GST)`;
};

/** Rate-wise GST of a saved PO: each item at its own rate (its amount less its taxable value), each charge at its rate */
function poGstSlabs(po: PurchaseOrder) {
  return gstSlabs([
    ...(po.items ?? []).map((it) => {
      const taxable = round2(n(it.quantity) * n(it.rate) * (1 - n(it.discountPct) / 100));
      return { taxable, gstRate: n(it.gstRate), tax: round2(n(it.amount) - taxable) };
    }),
    { taxable: n(po.transportCharges), gstRate: chargeRate(po.transportGstRate) },
    { taxable: n(po.otherCharges), gstRate: chargeRate(po.otherChargesGstRate) },
  ]);
}

/** CGST + SGST (or IGST) per GST rate, then the total when there is more than one rate */
function GstRows({ slabs, igst, total }: { slabs: ReturnType<typeof gstSlabs>; igst: boolean; total: number }) {
  return (
    <>
      {slabs.map((x) =>
        igst ? (
          <Row key={x.rate} label={`IGST ${x.rate}% on ${inr(x.taxable)}`} value={inr(x.tax)} />
        ) : (
          <Fragment key={x.rate}>
            <Row label={`CGST ${halfRate(x.rate)} on ${inr(x.taxable)}`} value={inr(round2(x.tax / 2))} />
            <Row label={`SGST ${halfRate(x.rate)} on ${inr(x.taxable)}`} value={inr(round2(x.tax - round2(x.tax / 2)))} />
          </Fragment>
        ),
      )}
      {slabs.length > 1 && <Row label="Total GST" value={inr(total)} />}
    </>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-brand-700">{children}</p>
);

/** A4 print layout of the PO (hidden on screen): header, details, three addresses, items, totals, terms */
function PoPrint({ po, store, notApproved }: { po: PurchaseOrder; store: StoreSettings | null | undefined; notApproved: boolean }) {
  const v = po.vendor;
  const vb = po.vendorBranch;
  const supplier = supplierOf(po);
  const items = po.items ?? [];
  // As saved: the backend decides it from the delivery branch's state, not only the store's
  const igst = po.isInterState ?? isInterState(supplier, store);
  const tax = n(po.taxAmount);
  const slabs = poGstSlabs(po);
  // Set by the server once the PO is sent for approval; a draft's validity hasn't started yet
  const validUntil = po.validUntil ? new Date(po.validUntil) : null;
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ");
  // Items only, incl. their GST (the PO's GST also covers the charges)
  const itemsTotal = round2(items.reduce((s, it) => s + n(it.amount), 0));
  const gross = round2(items.reduce((s, it) => s + n(it.quantity) * n(it.rate), 0));
  const discount = round2(gross - n(po.subtotal));

  const details: [string, string][] = [
    ["PO Number", po.poNo],
    ["PO Date", date(po.orderDate)],
    ["Expected Delivery", date(po.expectedDate)],
    ["Valid Till", validUntil ? `${date(validUntil)} · ${po.expiryDays} days` : po.expiryDays ? `${po.expiryDays} days from approval request` : "—"],
    ["Place of Supply", placeOfSupply(supplier, store).label],
    ["Vendor Code", v?.code || "—"],
    [vb?.gstin ? "Branch GSTIN" : "Vendor GSTIN", supplier?.gstin || "—"],
    ["Raised By", po.createdBy?.name ?? "—"],
    ["Status", po.status.charAt(0) + po.status.slice(1).toLowerCase().replace(/_/g, " ")],
  ];
  const addresses: { title: string; name?: string | null; lines: string[] }[] = [
    {
      title: "Vendor",
      name: v?.name,
      // Buying from a branch: the branch's address and GSTIN (the one the goods and the bill come from)
      lines: vb
        ? [
            `Branch: ${branchLabel(vb)}`,
            branchAddress(vb),
            [vb.contactPerson, vb.phone].filter(Boolean).join(" · "),
            supplier?.gstin ? `GSTIN: ${supplier.gstin}` : "",
          ]
        : [
            vendorAddresses(v).billing && `Billing: ${vendorAddresses(v).billing}`,
            vendorAddresses(v).shipping && `Shipping: ${vendorAddresses(v).shipping}`,
            v?.gstin ? `GSTIN: ${v.gstin}` : "",
          ],
    },
    {
      title: "Billed To",
      name: store?.storeName,
      lines: [join(store?.address, store?.city), join(store?.state, store?.pincode), store?.gstin ? `GSTIN: ${store.gstin}` : ""],
    },
    { title: "Ship To", name: po.branch ? `${po.branch.name} (${po.branch.code})` : store?.storeName, lines: [po.branch?.address ?? "", po.branch?.city ?? ""] },
  ];
  const th = "px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide";
  const td = "px-2.5 py-2 align-top";

  return (
    <div className="paper po-print hidden text-[11.5px] leading-[1.45] text-slate-800 [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:block">
      {/* The empty header / footer rows repeat on every printed page: the same top and bottom margin on all pages */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td style={{ height: `${MARGIN_MM}mm` }} />
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td style={{ height: `${MARGIN_MM}mm` }} />
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td style={{ paddingLeft: `${MARGIN_MM}mm`, paddingRight: `${MARGIN_MM}mm` }}>
              <div id="po-print-body" className="flex flex-col">
                {/* ── Header ── */}
                <div className="flex items-center justify-between gap-6 border-b-[3px] border-forest-700 pb-3">
                  {/* The full horizontal "oneroot" logo stands in for the company name; address and GSTIN beside it */}
                  <div className="flex items-center gap-3">
                    <PrintLogo src={LOGOS.horizontal.src} className="mx-0 shrink-0" imageClassName="h-9 w-auto" />
                    <div className="border-l border-slate-300 pl-3">
                      <p className="text-[10.5px] text-slate-500">{join(store?.address, store?.city, store?.state, store?.pincode)}</p>
                      {store?.gstin && <p className="text-[10.5px] text-slate-500">GSTIN: {store.gstin}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[19px] font-extrabold uppercase leading-none tracking-[0.06em] text-brand-800">Purchase Order</p>
                    <p className="mt-1.5 font-mono text-[12px] font-semibold text-slate-700">{po.poNo}</p>
                    {(po.status === "CANCELLED" || notApproved) && (
                      <p
                        className={cx(
                          "mt-1 inline-block rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide",
                          po.status === "CANCELLED" ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
                        )}
                      >
                        {po.status === "CANCELLED" ? "Cancelled" : "Not yet approved"}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Order details: four to a row ── */}
                <section className="mt-4">
                  <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-900">Order Details</h2>
                  <div className="grid grid-cols-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50/70">
                    {details.map(([label, value], i) => (
                      <div key={label} className={cx("px-3 py-2", i % 4 !== 0 && "border-l border-slate-200", i >= 4 && "border-t border-slate-200")}>
                        <Label>{label}</Label>
                        <p className="mt-0.5 font-semibold text-slate-900 first-letter:uppercase">{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ── Vendor, billing and shipping addresses ── */}
                <section className="mt-3 grid grid-cols-3 gap-3">
                  {addresses.map((a) => (
                    <div key={a.title} className="rounded-md border border-slate-200 border-t-[3px] border-t-brand-600 px-3 py-2.5">
                      <Label>{a.title}</Label>
                      <p className="mt-1 text-[12px] font-bold text-slate-900">{a.name || "—"}</p>
                      {a.lines.filter(Boolean).map((l) => (
                        <p key={l} className="text-[10.5px] text-slate-600">
                          {l}
                        </p>
                      ))}
                    </div>
                  ))}
                </section>

                {/* ── Items ── */}
                <section className="mt-4">
                  <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-900">Items ({items.length})</h2>
                  <table className="w-full border-collapse overflow-hidden rounded-md text-[11px]">
                    <thead>
                      <tr className="bg-forest-800 text-left text-white">
                        <th className={cx(th, "w-8 rounded-tl-md")}>#</th>
                        <th className={th}>Product</th>
                        <th className={th}>HSN</th>
                        <th className={cx(th, "text-right")}>Qty</th>
                        <th className={cx(th, "text-right")}>Rate</th>
                        <th className={cx(th, "text-right")}>Disc.</th>
                        <th className={cx(th, "text-right")}>GST</th>
                        <th className={cx(th, "rounded-tr-md text-right")}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={it.id} className={cx("break-inside-avoid border-b border-slate-200", i % 2 === 1 && "bg-slate-50")}>
                          <td className={cx(td, "text-slate-400")}>{i + 1}</td>
                          <td className={td}>
                            <p className="font-semibold text-slate-900">{it.product.name}</p>
                            <p className="text-[9.5px] text-slate-500">
                              SKU {it.product.sku}
                              {it.product.packSize && ` · ${it.product.packSize}`}
                            </p>
                          </td>
                          <td className={cx(td, "font-mono text-[10px]")}>{it.product.hsnCode || "—"}</td>
                          <td className={cx(td, "num whitespace-nowrap text-right")}>
                            {qty(it.quantity)} <span className="text-[9.5px] text-slate-500">{it.product.unit}</span>
                          </td>
                          <td className={cx(td, "num text-right")}>{inr(it.rate)}</td>
                          <td className={cx(td, "num text-right")}>{n(it.discountPct) ? `${n(it.discountPct)}%` : "—"}</td>
                          <td className={cx(td, "num text-right")}>{n(it.gstRate)}%</td>
                          <td className={cx(td, "num text-right font-semibold text-slate-900")}>{inr(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-b-2 border-slate-300 font-semibold">
                        <td colSpan={7} className={cx(td, "text-right text-slate-600")}>
                          Items total (incl. GST)
                        </td>
                        <td className={cx(td, "num text-right text-slate-900")}>{inr(itemsTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </section>

                {/* ── Amount in words / notes beside the totals ── */}
                <section className="mt-3 flex break-inside-avoid gap-5">
                  <div className="flex-1 space-y-2.5">
                    <div>
                      <Label>Amount in words</Label>
                      <p className="mt-0.5 font-semibold text-slate-900">{amountInWords(n(po.totalAmount))}</p>
                    </div>
                    {po.notes && (
                      <div>
                        <Label>Notes</Label>
                        <p className="mt-0.5 whitespace-pre-line text-slate-700">{po.notes}</p>
                      </div>
                    )}
                  </div>
                  <dl className="w-[68mm] overflow-hidden rounded-md border border-slate-200 text-[11px]">
                    <div className="space-y-1 px-3 py-2">
                      {discount > 0.004 && <Row label="Gross Value" value={inr(gross)} />}
                      {discount > 0.004 && <Row label="Discount" value={`−${inr(discount)}`} />}
                      <Row label="Items Value" value={inr(po.subtotal)} />
                      {n(po.transportCharges) > 0 && <Row label={`Transportation ${transportNote(po)}`} value={inr(po.transportCharges)} />}
                      {n(po.otherCharges) > 0 && (
                        <Row
                          label={`${po.otherChargesNote ? `Other (${po.otherChargesNote})` : "Other Charges"} (excl. GST ${chargeRate(po.otherChargesGstRate)}%)`}
                          value={inr(po.otherCharges)}
                        />
                      )}
                      <Row label="Taxable Value" value={inr(round2(n(po.subtotal) + n(po.transportCharges) + n(po.otherCharges)))} />
                      <GstRows slabs={slabs} igst={igst} total={tax} />
                      {n(po.roundOff) !== 0 && <Row label="Round Off" value={`${n(po.roundOff) > 0 ? "+" : "−"}${inr(Math.abs(n(po.roundOff)))}`} />}
                    </div>
                    <div className="flex items-center justify-between bg-forest-800 px-3 py-2 text-white">
                      <dt className="text-[10.5px] font-semibold uppercase tracking-wide">PO Total</dt>
                      <dd className="num text-[14px] font-bold">{inr(po.totalAmount)}</dd>
                    </div>
                  </dl>
                </section>

                {/* ── Terms and the signature note: right under the totals; the list runs on to the next page when it doesn't fit ── */}
                <div className="pt-4">
                  <section className="rounded-md border border-slate-300 px-3.5 py-3 [box-decoration-break:clone]">
                    <h2 className="break-after-avoid border-b border-slate-200 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-900">
                      Terms &amp; Conditions
                    </h2>
                    <ol className="mt-2 grid list-decimal grid-cols-2 gap-x-6 gap-y-1 pl-4 text-[9.5px] leading-[1.4] text-slate-600 marker:font-semibold marker:text-slate-500">
                      {PO_TERMS_SHORT.map((t) => (
                        <li key={t} className="break-inside-avoid">
                          {t}
                        </li>
                      ))}
                    </ol>
                  </section>
                  <p className="mt-2.5 break-before-avoid text-left text-[10px] italic text-slate-500">
                    <span className="font-semibold not-italic text-red-600">*</span> This is a system-generated purchase order and does not require a
                    signature.
                  </p>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
