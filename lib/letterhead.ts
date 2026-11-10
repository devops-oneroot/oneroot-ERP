import type { StoreSettings } from "./types";

/** Active branch as the settings API returns it for printouts */
export interface LetterheadBranch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  gstin?: string | null;
}

export interface LetterheadAddress {
  branchId: string | null;
  /** e.g. Head Office, Warehouse, One Root Mall */
  label: string;
  address: string;
  phone?: string | null;
}

/**
 * How each branch is titled on invoices, by branch code (Admin → Branches), in print order.
 * The head office prints the full address from Store Settings rather than its branch record.
 * Branches not listed here print after these, under their own name.
 */
const ROLES: Record<string, { label: string; order: number; storeAddress?: boolean }> = {
  MAIN: { label: "Head Office", order: 0, storeAddress: true },
  CHMUDI: { label: "Warehouse", order: 1 },
  CHM: { label: "One Root Mall", order: 2 },
};

/** Address parts → one tidy line: line breaks and doubled commas removed, a repeated city / state left out */
function tidy(parts: (string | null | undefined)[]) {
  const out: string[] = [];
  for (const raw of parts) {
    for (const piece of (raw ?? "").split(/[\n,]+/)) {
      const p = piece.trim();
      if (p && !out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
    }
  }
  return out.join(", ");
}

/** Every address the store prints on its bills (all active branches), head office first */
export function letterhead(s: StoreSettings | null | undefined): LetterheadAddress[] {
  const storeAddress = tidy([s?.address, s?.city, s?.state, s?.pincode]);
  const branches = s?.branches ?? [];
  if (!branches.length) return storeAddress ? [{ branchId: null, label: "Head Office", address: storeAddress, phone: s?.phone }] : [];
  return branches
    .map((b) => {
      const role = ROLES[b.code];
      const address = role?.storeAddress && storeAddress ? storeAddress : tidy([b.address, b.city, b.state]);
      return { branchId: b.id, label: role?.label ?? b.name, address, phone: (role?.storeAddress ? s?.phone : b.phone) || b.phone, order: role?.order ?? 99 };
    })
    .filter((a) => a.address)
    .sort((a, b) => a.order - b.order)
    .map((a): LetterheadAddress => ({ branchId: a.branchId, label: a.label, address: a.address, phone: a.phone }));
}
