"use client";

import { Button, Modal } from "./ui";

/** Standard terms every purchase order is placed on */
export const PO_TERMS: { title: string; text: string }[] = [
  {
    title: "PO Number on Tax Invoice",
    text: "This PO number must be mentioned on the vendor's tax invoice. Invoices without the PO number may not be accepted.",
  },
  {
    title: "Validity",
    text: "This purchase order is valid only for the expiry days chosen on it, counted from the invoice date. Goods supplied after it expires may be refused.",
  },
  {
    title: "Quantity & Specification",
    text: "Supply exactly the products, pack sizes and quantities ordered. Short, excess or substituted supply must be agreed in writing before dispatch.",
  },
  {
    title: "Price",
    text: "Rates are as stated on this PO, excluding GST, and are fixed for this order. GST is charged as applicable; transportation and other charges only where shown on the PO.",
  },
  {
    title: "Delivery",
    text: "Deliver to the branch named on the PO by the expected delivery date, with the tax invoice and delivery challan quoting this PO number.",
  },
  {
    title: "Batch, Expiry & Licences",
    text: "Seeds, fertilisers and pesticides must carry batch number, manufacturing and expiry dates on every pack, and be covered by valid licences / registrations. Stock with less than six months of shelf life left may be rejected.",
  },
  {
    title: "Inspection & Rejection",
    text: "All goods are checked at goods inward. Damaged, expired, mislabelled or sub-standard goods will be rejected and returned at the vendor's cost, and a debit note raised.",
  },
  {
    title: "Invoice & Payment",
    text: "The vendor's GST invoice must show our GSTIN, the PO number and HSN codes. Payment is made on the vendor's agreed credit terms, for the quantity accepted at goods inward.",
  },
  {
    title: "Cancellation",
    text: "We may cancel this PO, fully or for undelivered items, if delivery is late or the terms above are not met.",
  },
  {
    title: "Jurisdiction",
    text: "Any dispute is subject to Bangalore jurisdiction only.",
  },
];

/** One-line version of the terms for the printed PO */
export const PO_TERMS_SHORT: string[] = [
  "This PO number must be mentioned on the tax invoice.",
  "Valid only for the expiry days shown, from the PO date.",
  "Supply only the ordered products, pack sizes and quantities.",
  "Deliver by the expected date with an invoice quoting this PO no.",
  "Every pack must show batch, mfg and expiry dates; under 6 months' shelf life may be rejected.",
  "Damaged or sub-standard goods are returned at the vendor's cost.",
  "Payment as per agreed credit terms, for quantity accepted at goods inward.",
  "Disputes are subject to Bangalore jurisdiction only.",
];

/**  for purchase orders, opened from the PO form */
export function PoTermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Purchase Order — Terms & Conditions"
      size="lg"
      footer={<Button variant="danger" onClick={onClose}>Close</Button>}
    >
      <ol className="space-y-3 text-sm">
        {PO_TERMS.map((t, i) => (
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
