"use client";

import { Ban } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import type { DebitNote } from "@/lib/types";
import { noteTypeName } from "./NoteForm";
import { Button, Checkbox, Field, Modal, Textarea, errMsg, useToast } from "./ui";

type Note = Pick<DebitNote, "id" | "dnNo" | "noteType" | "status" | "affectsStock" | "affectsBalance" | "totalAmount" | "reasonType" | "userId" | "grn">;

/** A note for goods not accepted at goods inward (rejected / damaged): cancelling it can take those goods into stock */
export const isInwardClaim = (dn: Pick<DebitNote, "grn" | "affectsStock" | "affectsBalance" | "reasonType">) =>
  !!dn.grn && !dn.affectsStock && !dn.affectsBalance && (dn.reasonType === "REJECTED_AT_INWARD" || dn.reasonType === "DAMAGED_IN_TRANSIT");

/** Who may cancel: drafts by whoever raised them (with notes.delete); posted notes and inward claims by L2 and above */
export function canCancelNote(dn: Pick<DebitNote, "status" | "userId" | "grn" | "affectsStock" | "affectsBalance" | "reasonType">, opts: { userId?: string; canDelete: boolean; level: number }) {
  if (dn.status === "CANCELLED") return false;
  if (opts.level >= 2 && (dn.status === "SENT" || isInwardClaim(dn))) return true;
  return dn.status === "DRAFT" && opts.canDelete && (!dn.userId || dn.userId === opts.userId);
}

/** Cancel a debit / credit note with a required reason; a posted note is fully undone */
export function CancelNoteModal({ dn, level, onClose, onCancelled }: { dn: Note; level: number; onClose: () => void; onCancelled: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const claim = isInwardClaim(dn) && level >= 2;
  // Inward claims: by default the goods are kept after all (the vendor offered another solution)
  const [acceptGoods, setAcceptGoods] = useState(claim);
  const [busy, setBusy] = useState(false);
  const posted = dn.status === "SENT";
  const moved = dn.affectsStock || dn.affectsBalance;

  async function save() {
    if (!reason.trim()) return toast.error("Enter the reason for cancelling");
    setBusy(true);
    try {
      const r = await api.post<{ restoredSerialProducts?: string[] }>(`/debit-notes/${dn.id}/cancel`, { reason: reason.trim(), acceptGoods: claim && acceptGoods });
      toast.success(
        `${dn.dnNo} cancelled${claim && acceptGoods ? " · goods taken into stock and added to the purchase" : ""}${posted && dn.affectsStock ? " · stock restored" : ""}${posted && moved ? " · payable restored" : ""}`,
      );
      if (r.restoredSerialProducts?.length) {
        toast.warn(`Add the serial numbers for ${r.restoredSerialProducts.join(", ")} on the product page — the stock is in, but it has no serial numbers yet`);
      }
      onCancelled();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${noteTypeName(dn.noteType)} ${dn.dnNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep Note
          </Button>
          <Button variant="danger" icon={<Ban className="size-4" />} loading={busy} onClick={() => void save()}>
            Cancel Note
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        {claim ? (
          <>
            <p>
              These goods were not accepted at goods inward{dn.grn ? ` on ${dn.grn.grnNo}` : ""}, so they are not in stock and not on the purchase yet.
            </p>
            <Checkbox label="Take the goods into stock — the vendor offered another solution" checked={acceptGoods} onChange={setAcceptGoods} />
            {acceptGoods ? (
              <ul className="list-disc space-y-1 pl-5">
                <li>The quantity goes into stock in its batch, at the PO rate, as if it had passed at goods inward.</li>
                <li>
                  Its value ({inr(dn.totalAmount)} incl. GST) is added to the purchase: if the vendor&apos;s bill is already booked, it is added to that bill and to what we owe
                  the vendor; otherwise the bill picks it up when it is booked.
                </li>
              </ul>
            ) : (
              <p>The note is just marked cancelled; the goods stay out of stock.</p>
            )}
          </>
        ) : !posted ? (
          <p>This note hasn&apos;t been {dn.noteType === "DEBIT" ? "sent" : "applied"} yet, so stock and balances are unaffected.</p>
        ) : moved ? (
          <>
            <p>This note was already {dn.noteType === "DEBIT" ? "sent" : "applied"}. Cancelling undoes it:</p>
            <ul className="list-disc space-y-1 pl-5">
              {dn.affectsStock && <li>The returned goods come back into stock, in the same batches.</li>}
              <li>What we owe the vendor goes back up by {inr(dn.totalAmount)}, including on the linked invoice.</li>
              <li>The accounting entry is reversed.</li>
            </ul>
          </>
        ) : (
          <p>This note was only a record (no stock or balance moved), so it is just marked cancelled.</p>
        )}
        <Field label="Reason" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vendor gave a discount instead of taking the goods back" autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
