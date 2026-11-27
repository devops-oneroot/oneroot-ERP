"use client";

import { Building2, PackagePlus, Trash2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GstinField, StateSelect } from "@/components/GstinField";
import { CustomerPicker, ProductPicker } from "@/components/pickers";
import { Button, Card, Checkbox, DateInput, Field, Input, Select, Table, Td, Textarea, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { inr, n, qty, round2, today } from "@/lib/format";
import { parseGstin, placeOfSupply } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { Customer, Product, Quotation, QuotationParty, StoreSettings } from "@/lib/types";

interface Line {
  key: number;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  stock?: number;
  gstRate: number;
  quantity: string;
  /** GST-inclusive, as on a sale */
  rate: string;
  discountPct: string;
}

const clampPct = (v: string) => Math.min(100, Math.max(0, n(v)));
const lineGross = (l: Line) => n(l.quantity) * n(l.rate);
const lineNet = (l: Line) => lineGross(l) * (1 - clampPct(l.discountPct) / 100);

/** Validity presets in days; a new quote is valid for 3 days unless changed */
const VALIDITY_DAYS = [3, 7, 15, 30];
const DEFAULT_VALIDITY_DAYS = 3;

/** YYYY-MM-DD that is `days` after the given YYYY-MM-DD */
const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + days);
  return today(d);
};

let nextKey = 1;

/**
 * Create or edit a quotation: the customer's details are typed in (or filled from a registered customer),
 * products come from inventory. Figures are worked out like a sale bill; the server has the final say.
 */
export function QuotationForm({ quotation }: { quotation?: Quotation }) {
  const router = useRouter();
  const toast = useToast();
  const { data: store } = useApi<StoreSettings>("/settings");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerId, setCustomerId] = useState(quotation?.customerId ?? "");
  const [party, setParty] = useState<QuotationParty>(quotation?.partyType ?? "CUSTOMER");
  const business = party === "BUSINESS";
  const [name, setName] = useState(quotation?.customerName ?? "");
  const [contactPerson, setContactPerson] = useState(quotation?.contactPerson ?? "");
  const [phone, setPhone] = useState(quotation?.customerPhone ?? "");
  const [email, setEmail] = useState(quotation?.customerEmail ?? "");
  const [gstin, setGstin] = useState(quotation?.customerGstin ?? "");
  const [address, setAddress] = useState(quotation?.customerAddress ?? "");
  const [city, setCity] = useState(quotation?.customerCity ?? "");
  const [state, setState] = useState(quotation?.customerState ?? "");
  const [pincode, setPincode] = useState(quotation?.customerPincode ?? "");
  const [quotationDate, setQuotationDate] = useState(quotation ? today(new Date(quotation.quotationDate)) : today());
  const [validUntil, setValidUntil] = useState(quotation ? (quotation.validUntil ? today(new Date(quotation.validUntil)) : "") : addDays(today(), DEFAULT_VALIDITY_DAYS));
  // Preset picked in "Valid For": a number of days, "custom" (date typed by hand) or "none" (no expiry)
  const [validFor, setValidFor] = useState<string>(() => {
    if (!quotation) return String(DEFAULT_VALIDITY_DAYS);
    if (!quotation.validUntil) return "none";
    const days = VALIDITY_DAYS.find((d) => addDays(today(new Date(quotation.quotationDate)), d) === today(new Date(quotation.validUntil!)));
    return days ? String(days) : "custom";
  });

  function changeQuotationDate(day: string) {
    setQuotationDate(day);
    // A preset follows the quotation date
    if (day && VALIDITY_DAYS.includes(Number(validFor))) setValidUntil(addDays(day, Number(validFor)));
  }

  function changeValidFor(v: string) {
    setValidFor(v);
    if (v === "none") setValidUntil("");
    else if (v !== "custom") setValidUntil(addDays(quotationDate, Number(v)));
  }
  // Extra flat discount on top of the lines; on edit it is already folded into each line's discount %
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState(quotation?.notes ?? "");
  const [terms, setTerms] = useState(quotation?.terms ?? "");
  // null = worked out from the customer's GSTIN / state
  const [interOverride, setInterOverride] = useState<boolean | null>(quotation ? quotation.isInterState : null);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<Line[]>(() =>
    (quotation?.items ?? []).map((i) => ({
      key: nextKey++,
      productId: i.productId,
      name: i.productName,
      sku: i.product?.sku ?? "",
      unit: i.unit,
      stock: i.product?.stock === undefined ? undefined : n(i.product.stock),
      gstRate: n(i.gstRate),
      quantity: String(n(i.quantity)),
      rate: String(n(i.rate)),
      discountPct: n(i.discountPct) ? String(n(i.discountPct)) : "",
    })),
  );

  // A customer quote carries no GSTIN; the place of supply then comes from the state alone
  const pos = placeOfSupply({ gstin: business ? gstin : "", state }, store);
  const interState = interOverride ?? pos.interState ?? false;

  function fillFrom(c: Customer | null) {
    setCustomer(c);
    setCustomerId(c?.id ?? "");
    if (!c) return;
    setName(c.name);
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setGstin(c.gstin ?? "");
    // A registered customer with a GSTIN is a business
    if (c.gstin) setParty("BUSINESS");
    setAddress([c.village, c.address].filter(Boolean).join(", "));
    setCity(c.city ?? "");
    setState(c.state ?? "");
    setPincode(c.pincode ?? "");
    setInterOverride(null);
  }

  function addProduct(p: Product) {
    const existing = lines.find((l) => l.productId === p.id);
    if (existing) {
      update(existing.key, { quantity: String(n(existing.quantity) + 1) });
      toast.success(`${p.name}: quantity increased`);
      return;
    }
    setLines((ls) => [
      ...ls,
      {
        key: nextKey++,
        productId: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        stock: n(p.stock),
        gstRate: n(p.gstRate),
        quantity: "1",
        rate: String(n(p.salePrice)),
        discountPct: "",
      },
    ]);
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Preview of the totals, spread the same way as the server (flat discount pro rata over lines)
  const gross = round2(lines.reduce((s, l) => s + lineGross(l), 0));
  const preTotal = lines.reduce((s, l) => s + lineNet(l), 0);
  const flat = Math.min(n(discount), preTotal);
  const factor = preTotal > 0 ? 1 - flat / preTotal : 1;
  const priced = lines.map((l) => {
    const amount = round2(lineNet(l) * factor);
    const taxable = round2(amount / (1 + l.gstRate / 100));
    return { amount, taxable, tax: round2(amount - taxable) };
  });
  const lineTotal = round2(priced.reduce((s, p) => s + p.amount, 0));
  const taxable = round2(priced.reduce((s, p) => s + p.taxable, 0));
  const tax = round2(priced.reduce((s, p) => s + p.tax, 0));
  const total = Math.round(lineTotal);
  const roundOff = round2(total - lineTotal);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error(business ? "Enter the business name" : "Enter the customer's name");
    if (business && !gstin) return toast.error("Enter the business's GSTIN");
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return toast.error("Phone must be 10 digits starting with 6, 7, 8 or 9");
    if (pincode && !/^\d{6}$/.test(pincode)) return toast.error("Pincode must be 6 digits");
    if (business && !parseGstin(gstin).valid) return toast.error("Check the GSTIN — it is not valid");
    if (!lines.length) return toast.error("Add at least one product");
    const bad = lines.find((l) => !(n(l.quantity) > 0));
    if (bad) return toast.error(`Enter a quantity for ${bad.name}`);
    if (validUntil && validUntil < quotationDate) return toast.error("Valid-until date is before the quotation date");
    setSaving(true);
    try {
      const body = {
        customerId: customerId || undefined,
        partyType: party,
        customerName: name.trim(),
        contactPerson: business ? contactPerson.trim() || undefined : undefined,
        customerPhone: phone || undefined,
        customerEmail: email.trim() || undefined,
        customerGstin: business ? gstin || undefined : undefined,
        customerAddress: address.trim() || undefined,
        customerCity: city.trim() || undefined,
        customerState: state || undefined,
        customerPincode: pincode || undefined,
        quotationDate,
        validUntil: validUntil || undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: n(l.quantity),
          rate: n(l.rate),
          discountPct: clampPct(l.discountPct),
        })),
        discount: n(discount) || undefined,
        isInterState: interOverride ?? undefined,
        notes: notes.trim() || undefined,
        terms: terms.trim() || undefined,
      };
      const saved = quotation
        ? await api.patch<Quotation>(`/quotations/${quotation.id}`, body)
        : await api.post<Quotation>("/quotations", body);
      toast.success(quotation ? `${saved.quotationNo} updated` : `Quotation ${saved.quotationNo} created`);
      router.push(`/quotations/${saved.id}`);
    } catch (err) {
      toast.error(errMsg(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card title={business ? "Business" : "Customer"}>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Quotation For</p>
              <div role="radiogroup" aria-label="Quotation for" className="grid grid-cols-2 gap-2 sm:w-96">
                {(
                  [
                    ["CUSTOMER", "Customer", "Farmer / walk-in", <User key="c" className="size-4" />],
                    ["BUSINESS", "Business", "GST-registered firm", <Building2 key="b" className="size-4" />],
                  ] as const
                ).map(([value, label, hint, icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={party === value}
                    onClick={() => {
                      setParty(value);
                      setInterOverride(null);
                    }}
                    className={cx(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      party === value ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-500/20" : "border-slate-300 text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {icon}
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <Field label="Fill from a registered customer" hint="Optional — or type the details below" as="div">
              <CustomerPicker value={customer} onChange={fillFrom} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={business ? "Business Name" : "Customer Name"} required>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!quotation} placeholder={business ? "Registered name of the firm" : undefined} />
              </Field>
              {business && (
                <GstinField value={gstin} onChange={setGstin} onState={setState} required hint="Printed on the quotation; decides IGST or CGST + SGST" />
              )}
              {business && (
                <Field label="Contact Person">
                  <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                </Field>
              )}
              <Field label="Phone" hint="10 digits">
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="98765 43210"
                />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Door no, street, village" />
              </Field>
              <Field label="City">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <StateSelect value={state} onChange={setState} gstin={business ? gstin : ""} />
                <Field label="Pincode">
                  <Input inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} />
                </Field>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Quotation">
          <div className="space-y-3">
            <Field label="Quotation Date">
              <DateInput value={quotationDate} onChange={(e) => changeQuotationDate(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valid For">
                <Select value={validFor} onChange={(e) => changeValidFor(e.target.value)}>
                  {VALIDITY_DAYS.map((d) => (
                    <option key={d} value={String(d)}>
                      {d} days
                    </option>
                  ))}
                  <option value="custom">Custom date</option>
                  <option value="none">No expiry</option>
                </Select>
              </Field>
              <Field label="Valid Until">
                <DateInput
                  value={validUntil}
                  min={quotationDate}
                  onChange={(e) => {
                    setValidUntil(e.target.value);
                    setValidFor(e.target.value ? "custom" : "none");
                  }}
                />
              </Field>
            </div>
            <div>
              <Checkbox
                label="Inter-state supply (IGST)"
                checked={interState}
                onChange={(v) => setInterOverride(v === (pos.interState ?? false) ? null : v)}
              />
              <p className="mt-1 text-xs text-slate-400">
                {interOverride === null
                  ? pos.interState === null
                    ? business
                      ? "Same state assumed — add the GSTIN or state to check"
                      : "Same state assumed — add the customer's state to check"
                    : `From the ${business ? "business's" : "customer's"} ${business && gstin ? "GSTIN" : "state"}: ${pos.taxType}`
                  : "Set by hand"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mb-4" bodyClassName="p-0" title={`Products${lines.length ? ` (${lines.length})` : ""}`}>
        <div className="border-b border-slate-100 p-3">
          <ProductPicker onPick={addProduct} />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th right>In Stock</Th>
              <Th right>Qty</Th>
              <Th>UOM</Th>
              <Th right>Rate (Incl. GST)</Th>
              <Th right>Disc. %</Th>
              <Th right>GST</Th>
              <Th right>Amount</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!lines.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-sm text-slate-400">
                  <PackagePlus className="mx-auto mb-2 size-7 text-slate-300" />
                  Search above to add products from inventory
                </td>
              </tr>
            ) : (
              lines.map((l, idx) => (
                <tr key={l.key}>
                  <Td className="min-w-44 sm:min-w-56">
                    <p className="font-medium text-slate-900">{l.name}</p>
                    {l.sku && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-800">{l.sku}</span>}
                  </Td>
                  <Td right className={cx("whitespace-nowrap text-slate-500", l.stock !== undefined && l.stock < n(l.quantity) && "text-amber-700")}>
                    {l.stock === undefined ? "—" : qty(l.stock)}
                  </Td>
                  <Td right>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      className="num ml-auto h-8 w-24 text-right"
                      value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: e.target.value })}
                      aria-label={`Quantity of ${l.name}`}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-slate-600">{l.unit}</Td>
                  <Td right>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="num ml-auto h-8 w-28 text-right"
                      value={l.rate}
                      onChange={(e) => update(l.key, { rate: e.target.value })}
                      aria-label={`Rate of ${l.name}`}
                    />
                  </Td>
                  <Td right>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0"
                      className={cx("num ml-auto h-8 w-20 text-right", n(l.discountPct) > 100 && "border-red-400")}
                      value={l.discountPct}
                      onChange={(e) => update(l.key, { discountPct: e.target.value })}
                      aria-label={`Discount % on ${l.name}`}
                    />
                  </Td>
                  <Td right className="text-slate-500">
                    {l.gstRate}%
                  </Td>
                  <Td right className="whitespace-nowrap font-medium text-slate-900">
                    {inr(priced[idx].amount)}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1"
                      aria-label={`Remove ${l.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Notes & Terms">
          <div className="space-y-3">
            <Field label="Notes" hint="Printed on the quotation">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
            <Field label="Terms & Conditions">
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={4}
                placeholder={"e.g. Delivery within 3 days of order\nPayment: 50% advance, balance on delivery"}
              />
            </Field>
          </div>
        </Card>

        <Card title="Summary">
          <dl className="space-y-1.5 text-sm">
            <SumRow label="Gross (Incl. GST)" value={inr(gross)} />
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-600">Extra Discount (₹)</dt>
              <dd>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  className="num h-8 w-28 text-right"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  aria-label="Extra discount on the whole quotation"
                />
              </dd>
            </div>
            {gross - lineTotal > 0.004 && <SumRow label="Total Discount" value={`− ${inr(gross - lineTotal)}`} />}
            <SumRow label="Taxable Value" value={inr(taxable)} />
            {interState ? (
              <SumRow label="IGST" value={inr(tax)} />
            ) : (
              <>
                <SumRow label="CGST" value={inr(round2(tax / 2))} />
                <SumRow label="SGST" value={inr(round2(tax - round2(tax / 2)))} />
              </>
            )}
            {roundOff !== 0 && <SumRow label="Round Off" value={`${roundOff > 0 ? "+" : "−"} ${inr(Math.abs(roundOff))}`} />}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <dt>Quoted Total</dt>
              <dd className="num">{inr(total)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!lines.length}>
              {quotation ? "Save Changes" : "Create Quotation"}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="num text-slate-800">{value}</dd>
    </div>
  );
}
