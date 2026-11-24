"use client";

import { Button, Modal } from "./ui";

/** Standard terms every customer (sales) return is accepted on */
export const RETURN_TERMS: { title: string; text: string }[] = [
  {
    title: "Original Bill",
    text: "Goods are taken back only against the original invoice they were sold on. The quantity returned cannot be more than what was billed and not already returned.",
  },
  {
    title: "Condition of Goods",
    text: "Packs must be sealed, unused and in their original packaging with the label, batch number and expiry date intact. Opened, used, leaking, torn or tampered packs are not accepted.",
  },
  {
    title: "Batch & Expiry",
    text: "The returned pack must be from the same batch that was sold. Goods that have expired, or are close to expiry, are taken back only at the store's discretion.",
  },
  {
    title: "Seeds, Fertilisers & Pesticides",
    text: "Seeds once sown, and fertilisers or pesticides once opened or mixed, cannot be returned. Complaints about germination or crop performance are taken up with the manufacturer, not settled by a return.",
  },
  {
    title: "Subsidised Fertiliser",
    text: "Subsidised fertiliser is returned only after the sale is reversed on the government fertiliser POS device; its reversal reference is recorded on the return.",
  },
  {
    title: "Equipment & Serial Numbers",
    text: "Sprayers, pumps and other serial-numbered equipment must carry the same serial number as billed and come back with all accessories, manuals and the box. Faults after use are handled under the manufacturer's warranty.",
  },
  {
    title: "Schemes & Free Goods",
    text: "Free goods received under a scheme must be returned along with the paid goods. Refunds are at the price actually billed, after discounts.",
  },
  {
    title: "Refund",
    text: "For credit customers the refund is adjusted against their dues as a credit note. Cash, UPI or bank refunds above the cashier's limit need a manager's approval.",
  },
  {
    title: "Jurisdiction",
    text: "Any dispute is subject to Bangalore jurisdiction only.",
  },
];

/** Terms & conditions for customer returns, opened from the return form */
export function ReturnTermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sales Return — Terms & Conditions"
      size="lg"
      footer={<Button variant="danger" onClick={onClose}>Close</Button>}
    >
      <ol className="space-y-3 text-sm">
        {RETURN_TERMS.map((t, i) => (
          <li key={t.title} className="flex gap-3">
            <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {i + 1}
            </span>
            <div>
              <p className="font-medium text-slate-800">{t.title}</p>
              <p className="mt-0.5 text-slate-600">{t.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
