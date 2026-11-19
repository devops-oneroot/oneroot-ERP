import type { Metadata } from "next";

export const metadata: Metadata = { title: "Supplier Stock" };

/** The page loads its data in the browser after sign-in, like the ERP pages: nothing to validate for instant navigation */
export const instant = false;

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return children;
}
