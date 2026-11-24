"use client";

import { Save } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RequirePerm } from "@/components/AppShell";
import { CustomerTypeDiscounts } from "@/components/CustomerTypeDiscounts";
import { useAuth } from "@/lib/auth";
import { Button, Card, Checkbox, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea, errMsg, useToast } from "@/components/ui";
import { GstinField, StateSelect } from "@/components/GstinField";
import { api } from "@/lib/api";
import { GST_STATES, parseGstin } from "@/lib/gst";
import { useApi } from "@/lib/hooks";
import type { StoreSettings } from "@/lib/types";

const TEXT_FIELDS = [
  "storeName",
  "ownerName",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "stateCode",
  "pincode",
  "gstin",
  "fertilizerLicenseNo",
  "pesticideLicenseNo",
  "seedLicenseNo",
  "invoicePrefix",
  "purchasePrefix",
  "poPrefix",
  "receiptPrefix",
  "invoiceFooter",
  "reminderTemplate",
  "vendorTerms",
  "poMailSubject",
  "poMailBody",
] as const;

type TextKey = (typeof TEXT_FIELDS)[number] | "expiryAlertDays" | "reminderGraceDays" | "receiptFormat";
type Form = Record<TextKey, string> & { autoReminders: boolean; blockOverdueCredit: boolean; requireOpenShift: boolean };

const DEFAULT_TEMPLATE =
  "Namaste {name} ji, a gentle reminder from {store}: ₹{amount} is pending on your account ({days} days past due). Kindly clear it at your earliest convenience. If you have already paid, please ignore this message. Thank you! — {store} {phone}";

function toForm(s: StoreSettings): Form {
  const f = {} as Form;
  for (const k of TEXT_FIELDS) f[k] = (s[k] as string | null | undefined) ?? "";
  f.expiryAlertDays = String(s.expiryAlertDays ?? 60);
  f.reminderGraceDays = String(s.reminderGraceDays ?? 7);
  f.receiptFormat = s.receiptFormat ?? "A4";
  f.autoReminders = !!s.autoReminders;
  f.blockOverdueCredit = !!s.blockOverdueCredit;
  f.requireOpenShift = !!s.requireOpenShift;
  return f;
}

/** Indian financial year label used in document numbers, e.g. "26-27" */
function fyLabel(d = new Date()) {
  const y = d.getFullYear() % 100;
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${String(start).padStart(2, "0")}-${String(start + 1).padStart(2, "0")}`;
}

export default function SettingsPage() {
  return (
    <RequirePerm perms={["admin.settings"]}>
      <Settings />
    </RequirePerm>
  );
}

function Settings() {
  const { can } = useAuth();
  const { data, error, loading, reload, setData } = useApi<StoreSettings>("/settings");
  if (loading && !data) return <Spinner page />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <>
      <SettingsForm key={data.id} initial={data} onSaved={setData} />
      {/* Saved per row, so it sits outside the settings form */}
      {can("admin.schemes") && <CustomerTypeDiscounts />}
    </>
  );
}

function SettingsForm({ initial, onSaved }: { initial: StoreSettings; onSaved: (s: StoreSettings) => void }) {
  const canSave = useAuth().can("settings.edit");
  const toast = useToast();
  const [f, setF] = useState<Form>(() => toForm(initial));
  const [saved, setSaved] = useState<Form>(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  const set = (k: TextKey, v: string) => setF((s) => ({ ...s, [k]: v }));
  const text = (k: TextKey, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
  );

  const gstin = f.gstin.trim().toUpperCase();
  const gstinInfo = parseGstin(gstin);
  /** Picking a state also sets its GST state code */
  const setState = (name: string) => {
    const code = Object.entries(GST_STATES).find(([, n]) => n === name)?.[0] ?? "";
    setF((s) => ({ ...s, state: name, stateCode: code }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.storeName.trim()) return toast.error("Store name is required");
    const days = Number(f.expiryAlertDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) return toast.error("Expiry alert days must be between 1 and 365");
    const grace = Number(f.reminderGraceDays);
    if (!Number.isInteger(grace) || grace < 0 || grace > 90) return toast.error("Grace days must be between 0 and 90");
    // purchasePrefix is not on the form any more (Purchase Entry is switched off), so it isn't checked here
    for (const k of ["invoicePrefix", /* "purchasePrefix", */ "poPrefix", "receiptPrefix"] as const) {
      if (!f[k].trim()) return toast.error("Document prefixes cannot be blank");
    }
    if (!gstinInfo.empty && !gstinInfo.valid) return toast.error(`GSTIN: ${gstinInfo.error}`);
    if (gstinInfo.valid && f.stateCode && gstinInfo.stateCode !== f.stateCode) {
      return toast.error(`GSTIN is registered in ${gstinInfo.stateName} but the store state is ${f.state || f.stateCode}`);
    }
    const body: Record<string, unknown> = {
      expiryAlertDays: days,
      reminderGraceDays: grace,
      receiptFormat: f.receiptFormat,
      autoReminders: f.autoReminders,
      blockOverdueCredit: f.blockOverdueCredit,
      requireOpenShift: f.requireOpenShift,
    };
    for (const k of TEXT_FIELDS) body[k] = f[k].trim();
    body.gstin = gstin;
    for (const k of ["invoicePrefix", "purchasePrefix", "poPrefix", "receiptPrefix"] as const) body[k] = f[k].trim().toUpperCase();
    setSaving(true);
    try {
      const res = await api.put<StoreSettings>("/settings", body);
      const next = toForm(res);
      setF(next);
      setSaved(next);
      onSaved(res);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  const fy = fyLabel();
  const example = (prefix: string) => `${(prefix.trim() || "—").toUpperCase()}/${fy}/00001`;

  return (
    <form onSubmit={save}>
      <PageHeader
        title="Store Settings"
        subtitle="Store profile, GST registration, licences, printing, credit rules and reminders"
        actions={
          canSave && (
            <>
              {dirty && (
                <Button variant="ghost" onClick={() => setF(saved)}>
                  Discard Changes
                </Button>
              )}
              <Button type="submit" icon={<Save className="size-4" />} loading={saving} disabled={!dirty}>
                Save Settings
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Store Profile" note="Shown on the invoice header.">
          <Field label="Store Name" required className="sm:col-span-2">
            {text("storeName", { required: true })}
          </Field>
          {/* Owner name is saved but never printed or used anywhere, so the field is hidden (the saved value is kept)
          <Field label="Proprietor / Owner">{text("ownerName")}</Field>
          */}
          <Field label="Phone">{text("phone", { type: "tel" })}</Field>
          <Field label="Email" className="sm:col-span-2">
            {text("email", { type: "email" })}
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="City / Town">{text("city")}</Field>
          <Field label="PIN Code">{text("pincode", { inputMode: "numeric", maxLength: 6 })}</Field>
          <StateSelect value={f.state} onChange={setState} gstin={gstin} />
          <Field label="GST State Code" hint="Set from the state — decides CGST + SGST vs IGST on every bill">
            <Input value={f.stateCode ? `${f.stateCode} · ${GST_STATES[f.stateCode] ?? "unknown code"}` : ""} readOnly placeholder="Choose a state" className="bg-slate-50" />
          </Field>
        </Section>

        <div className="space-y-4">
          <Section title="GST & Licences" note="These numbers print on every invoice. Agri-input dealers must show valid licence numbers.">
            <GstinField
              label="Store GSTIN"
              className="sm:col-span-2"
              value={f.gstin}
              onChange={(g) => set("gstin", g)}
              onState={setState}
              showTaxType={false}
              hint="Leave blank if unregistered. The state is taken from the first two digits."
            />
            <Field label="Fertilizer Licence No.">{text("fertilizerLicenseNo")}</Field>
            <Field label="Pesticide (Insecticide) Licence No.">{text("pesticideLicenseNo")}</Field>
            <Field label="Seed Licence No.">{text("seedLicenseNo")}</Field>
          </Section>

          <Section title="Counter, Printing & Stock Alerts">
            <div className="sm:col-span-2">
              <Checkbox label="No billing without an open shift (cashier enters the opening cash first)" checked={f.requireOpenShift} onChange={(v) => setF((s) => ({ ...s, requireOpenShift: v }))} />
            </div>
            <Field label="Bill Print Layout" hint="Thermal receipts suit 80 mm / 58 mm roll printers at the counter; A4 is the full GST invoice">
              <Select value={f.receiptFormat} onChange={(e) => set("receiptFormat", e.target.value)}>
                <option value="A4">A4 Tax Invoice</option>
                <option value="THERMAL_80">Thermal Receipt · 80 mm</option>
                <option value="THERMAL_58">Thermal Receipt · 58 mm</option>
              </Select>
            </Field>
            <Field label="Expiry Alert Days" hint="Batches expiring within this many days are flagged on the dashboard and stock pages">
              {text("expiryAlertDays", { type: "number", min: 1, max: 365, step: 1 })}
            </Field>
          </Section>
        </div>

        <Section title="Credit Control & Due Reminders" note="Bills on credit fall due after each customer's credit days. After the grace period they count as overdue.">
          <Field label="Grace Days After Due Date" hint="Overdue reminders and credit checks start after this">
            {text("reminderGraceDays", { type: "number", min: 0, max: 90, step: 1 })}
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <Checkbox label="Block new credit sales to overdue customers (managers can override)" checked={f.blockOverdueCredit} onChange={(v) => setF((s) => ({ ...s, blockOverdueCredit: v }))} />
            <Checkbox
              label={`Send WhatsApp reminders automatically every day${initial.whatsappConfigured ? "" : " (needs the WhatsApp API keys on the server)"}`}
              checked={f.autoReminders}
              onChange={(v) => setF((s) => ({ ...s, autoReminders: v }))}
            />
          </div>
          <Field
            label="Reminder Message"
            className="sm:col-span-2"
            hint="Placeholders: {name} {amount} {overdue} {days} {store} {phone} {date}. Leave blank for the default."
          >
            <Textarea rows={4} value={f.reminderTemplate} onChange={(e) => set("reminderTemplate", e.target.value)} placeholder={DEFAULT_TEMPLATE} />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">
            WhatsApp sending: {initial.whatsappConfigured ? "API keys found — reminders can be sent from the server." : "not set up — the Due Reminders page opens WhatsApp with the message ready to send. To send automatically, set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (and optionally WHATSAPP_TEMPLATE) on the server."}
          </p>
        </Section>

        <div className="space-y-4">
          <Section title="Document Numbering" note="Numbers restart every financial year (April–March). Changing a prefix only affects new documents.">
            {(
              [
                ["invoicePrefix", "Sales Invoice"],
                // Purchase Entry is switched off (see /purchases/new). purchasePrefix still numbers the purchase invoices
                // booked from a GRN, so the saved value (default PUR) is kept and sent back unchanged
                // ["purchasePrefix", "Purchase Entry"],
                ["poPrefix", "Purchase Order"],
                ["receiptPrefix", "Payment / Receipt"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={`${label} Prefix`} hint={`e.g. ${example(f[k])}`}>
                <Input value={f[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} maxLength={8} className="font-mono" />
              </Field>
            ))}
          </Section>

          <Section title="Invoice Footer" note="Printed at the bottom of every sales invoice and receipt — terms, bank details, a thank-you note.">
            <Field label="Footer Text" className="sm:col-span-2">
              <Textarea
                rows={4}
                value={f.invoiceFooter}
                onChange={(e) => set("invoiceFooter", e.target.value)}
                placeholder={"Goods once sold will not be taken back.\nRead the label carefully before use.\nThank you for your business!"}
              />
            </Field>
          </Section>

          <PoMailTemplate subject={f.poMailSubject} body={f.poMailBody} onChange={(k, v) => set(k, v)} />

          <Section title="Vendor Terms & Conditions" note="Shown at the bottom of the New Vendor form. Write the lock-in period, early-exit rules and payment terms here, one point per line.">
            <Field label="Terms Text" className="sm:col-span-2">
              <Textarea
                rows={8}
                value={f.vendorTerms}
                onChange={(e) => set("vendorTerms", e.target.value)}
                placeholder={"1. The vendor agrees to a 5-year association from the date of registration.\n2. Early exit is allowed only after written notice and settlement of all dues.\n3. Payment is due within the credit days agreed on this vendor's record."}
              />
            </Field>
          </Section>
        </div>
      </div>
    </form>
  );
}

/** Default template and placeholders come from the server, which fills them in when the email goes out */
function PoMailTemplate({ subject, body, onChange }: { subject: string; body: string; onChange: (k: "poMailSubject" | "poMailBody", v: string) => void }) {
  const { data } = useApi<{ subject: string; body: string; placeholders: Record<string, string> }>("/purchase-orders/mail-template");
  const custom = !!(subject.trim() || body.trim());
  return (
    <Section
      title="Purchase Order Email"
      note="Sent when Procurement presses Send to Vendor on a fully approved PO (once per PO), from the mailbox of the user sending it, with the PO attached as a PDF. Leave blank to use the default."
    >
      <Field label="Subject" className="sm:col-span-2">
        <Input value={subject} onChange={(e) => onChange("poMailSubject", e.target.value)} placeholder={data?.subject} />
      </Field>
      <Field label="Message" className="sm:col-span-2" hint="One line per line of the email. The items are not listed in the email — they are in the attached PO PDF.">
        <Textarea rows={12} value={body} onChange={(e) => onChange("poMailBody", e.target.value)} placeholder={data?.body} className="font-mono text-xs" />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        {!custom && data && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onChange("poMailSubject", data.subject);
              onChange("poMailBody", data.body);
            }}
          >
            Start From Default
          </Button>
        )}
        {custom && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("poMailSubject", "");
              onChange("poMailBody", "");
            }}
          >
            Reset to Default
          </Button>
        )}
      </div>
      {data && (
        <div className="text-xs text-slate-500 sm:col-span-2">
          <p className="mb-1 font-medium text-slate-600">Placeholders</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {Object.entries(data.placeholders).map(([k, label]) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 font-mono text-slate-700">{`{${k}}`}</dt>
                <dd className="min-w-0 sm:truncate">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Section>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card title={title}>
      {note && <p className="-mt-1 mb-3 text-xs text-slate-500">{note}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
