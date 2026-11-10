"use client";

import {
  BadgeCheck,
  TrendingUp,
  Bell,
  BellRing,
  BookOpen,
  CalendarClock,
  Boxes,
  ChevronDown,
  ChevronRight,
  FileMinus,
  PackageCheck,
  ClipboardList,
  FileText,
  HandCoins,
  IndianRupee,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Undo2,
  UserCog,
  UserRoundPlus,
  Users,
  Wallet,
  X,
  ReceiptText,
  // Megaphone, // Campaigns menu disabled
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { BranchProvider, useBranch } from "@/lib/branch";
import type { Permission } from "@/lib/permissions";
import { CountsProvider, useCounts } from "./Notifications";
import { TopBar } from "./TopBar";
import { QuickDock } from "./QuickActions";
import { LOGOS, Spinner, cx, Logo } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown (and the pages under it opened) only to users holding any of these; none = everyone */
  perms?: Permission[];
  badge?: "unread" | "approvals";
}

export interface NavGroup {
  section: string;
  items: NavItem[];
}

/**
 * Navigation order:
 * Dashboard -> Sales -> Purchases -> Inventory -> Finance
 * -> Notifications -> Admin.
 * Groups without a section render as direct links; the rest are accordions.
 */
const SIDEBAR_SCROLLBAR = {
  "--scrollbar-thumb": "rgb(255 255 255 / 0.28)",
  "--scrollbar-thumb-hover": "rgb(255 255 255 / 0.45)",
  "--scrollbar-track": "transparent",
} as CSSProperties;


export const NAV: NavGroup[] = [
  {
    section: "",
    items: [{ href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard /> }],
  },
  {
    section: "",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        icon: <Bell />,
        badge: "unread",
      },
    ],
  },
    {
    section: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: <Package />, perms: ["products.view"] },
      { href: "/inventory", label: "Stock & Batches", icon: <RotateCcw />, perms: ["inventory.view"] },
      { href: "/inventory/govt-match", label: "Govt Fertiliser Match", icon: <ShieldCheck />, perms: ["inventory.govt"] },
    ],
  },

    {
    section: "Purchases",
    items: [
      { href: "/vendors", label: "Vendors", icon: <Boxes />, perms: ["vendors.view"] },
      { href: "/vendor-branches", label: "Depot", icon: <Store />, perms: ["vendors.view"] },
      { href: "/purchase-orders", label: "Purchase Orders", icon: <ClipboardList />, perms: ["purchases.view"] },
      { href: "/goods-inward", label: "Goods Inward (GRN)", icon: <PackageCheck />, perms: ["grn.view", "purchases.receive"] },
      // { href: "/purchases", label: "Purchase Invoices", icon: <Truck />, perms: ["invoices.view"] },
      { href: "/debit-notes", label: "Debit & Credit Notes", icon: <FileMinus />, perms: ["notes.view"] },
    ],
  },
  {
    section: "Sales",
    items: [
      { href: "/sales", label: "Invoices", icon: <Receipt />, perms: ["sales.view"] },
      { href: "/sales/returns", label: "Sales Returns", icon: <Undo2 />, perms: ["returns.view", "sales.returns"] },
      { href: "/customers", label: "Customers", icon: <Users />, perms: ["customers.view"] },
      { href: "/customers/reminders", label: "Due Reminders", icon: <BellRing />, perms: ["customers.view"] },
      { href: "/approvals", label: "Approvals", icon: <BadgeCheck />, perms: ["sales.bill", "approvals.decide"] },
      { href: "/van", label: "Van Trips", icon: <Truck />, perms: ["van.view", "sales.van"] },
      { href: "/agents", label: "Agents", icon: <UserRoundPlus />, perms: ["sales.bill", "vendors.view"] },
      { href: "/quotations", label: "Quotations", icon: <ReceiptText />, perms: ["sales.view", "sales.bill"] },
      { href: "/bookings", label: "Advance Bookings", icon: <CalendarClock />, perms: ["bookings.view"] },
      // { href: "/campaigns", label: "Campaigns", icon: <Megaphone />, perms: ["admin.schemes"] },
    ],
  },
    {
    section: "Point of Sale",
    items: [
      {
        href: "/sales/new",
        label: "New Sale (POS)",
        icon: <ShoppingCart />,
        perms: ["sales.bill"],
      },
    ],
  },
  {
    section: "Finance",
    items: [
      { href: "/shifts", label: "Shifts & Cash", icon: <Landmark />, perms: ["cash.shifts"] },
      { href: "/payments", label: "Payments", icon: <IndianRupee />, perms: ["payments.view"] },
      { href: "/expenses", label: "Expenses", icon: <Wallet />, perms: ["expenses.view"] },
      { href: "/petty-cash", label: "Petty Cash", icon: <HandCoins />, perms: ["expenses.view"] },
      { href: "/accounts", label: "Accounts", icon: <BookOpen />, perms: ["accounts.view"] },
    ],
  },
  {
    // One entry: the Reports page, whose tabs (Finance, Sales, Purchases, Stock) switch between the reports
    section: "Analytics",
    items: [{ href: "/reports", label: "Reports", icon: <TrendingUp />, perms: ["reports.view"] }],
  },
  {
    section: "Admin",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: <UserCog />,
        perms: ["admin.users"],
      },
      {
        href: "/admin/schemes",
        label: "Schemes & Offers",
        icon: <Tags />,
        perms: ["admin.schemes"],
      },
      {
        href: "/admin/branches",
        label: "Branches",
        icon: <Store />,
        perms: ["admin.branches"],
      },
      {
        href: "/admin/settings",
        label: "Store Settings",
        icon: <Settings />,
        perms: ["admin.settings"],
      },
      {
        href: "/admin/approval-rules",
        label: "PO Approval Rules",
        icon: <BadgeCheck />,
        perms: ["admin.approval_rules"],
      },
      {
        href: "/admin/audit",
        label: "Audit Log",
        icon: <ShieldCheck />,
        perms: ["admin.audit"],
      },
    ],
  },
];

/** Pages under a gated sidebar item that any signed-in user may open (e.g. a named PO approver) */
const OPEN_ROUTES = ["/purchase-orders/approvals"];

/**
 * Detail pages a named approver opens from their queue without holding the section's permission. The API decides
 * who may see each record (a 403 shows as the page's error); /purchase-orders/new and …/edit keep their own guards.
 */
const OPEN_DETAIL_ROUTES = [/^\/purchase-orders\/(?!new$|approvals$)[^/]+$/];

/**
 * Pages whose access differs from the sidebar item they sit under, matching what their API allows:
 * a bill opens for whoever billed it (the POS prints from it) or returns goods on it, not only for invoice viewers.
 */
const ROUTE_PERMS: [RegExp, Permission[]][] = [
  [/^\/sales\/(?!new$|returns$)[^/]+$/, ["sales.view", "sales.bill", "sales.returns"]],
  [/^\/goods-inward\/[^/]+\/invoice$/, ["invoices.create"]],
];

/**
 * Most specific nav item wins, so /sales/new doesn't also light up /sales. Items that differ only by their query
 * (the reports, /reports?tab=…) match on it; with no tab given, the first of them (what the page shows) is active.
 */
function activeHref(pathname: string, search = "") {
  const current = new URLSearchParams(search);
  let best = "";
  let firstQueried = "";
  for (const g of NAV)
    for (const i of g.items) {
      const [path, query] = i.href.split("?");
      if (!(pathname === path || pathname.startsWith(path + "/"))) continue;
      if (query) {
        if (pathname !== path) continue;
        firstQueried ||= i.href;
        const wanted = new URLSearchParams(query);
        if (![...wanted].every(([k, v]) => current.get(k) === v)) continue;
      }
      if (i.href.length > best.length) best = i.href;
    }
  return best || firstQueried;
}

/** The accordion section holding the active route */
function getActiveSection(pathname: string, search = ""): string {
  const active = activeHref(pathname, search);
  return (
    NAV.find(
      (group) =>
        group.section !== "" &&
        group.items.some((item) => item.href === active),
    )?.section ?? ""
  );
}

function NavItemLink({
  item,
  active,
  nested,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const counts = useCounts();
  const badgeCount =
    item.badge === "unread"
      ? counts.unread
      : item.badge === "approvals"
        ? counts.approvals
        : 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors [&>svg]:shrink-0 [&>svg]:opacity-85",
        nested
          ? "text-[12.5px] [&>svg]:size-4"
          : "text-[13.5px] [&>svg]:size-[17px]",
        // Active: the same orange bar on the left for every menu, top-level or inside a section
        active ? "bg-brand-100 font-semibold text-brand-800 shadow-[inset_3px_0_0_var(--color-brand-500)]" : "text-slate-700 hover:bg-brand-100 hover:text-brand-800",
      )}
    >
      {item.icon}
      <span className="min-w-0 flex-1">{item.label}</span>
      {badgeCount > 0 && (
        <span
          className={cx(
            "num rounded-full px-1.5 font-semibold leading-5",
            nested ? "text-[10px]" : "text-[11px]",
            item.badge === "unread"
              ? "bg-red-500 text-white"
              : "bg-amber-400 text-amber-950",
          )}
        >
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

/** Sidebar navigation with single-open accordion behaviour */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { can } = useAuth();

  const active = activeHref(pathname, search);
  const activeSection = getActiveSection(pathname, search);

  const [openSection, setOpenSection] = useState(activeSection);
  const [prevActiveSection, setPrevActiveSection] = useState(activeSection);

  // Open the section holding the page whenever navigation moves into another section
  if (activeSection !== prevActiveSection) {
    setPrevActiveSection(activeSection);
    setOpenSection(activeSection);
  }

  function toggleSection(section: string) {
    setOpenSection((current) => (current === section ? "" : section));
  }

  return (
    <nav
      aria-label="Main navigation"
      className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-4"
      // The app's thin scrollbar (globals.css), light on a clear track so it reads on the dark green; only shows when the menu overflows
      style={SIDEBAR_SCROLLBAR}
    >
      {NAV.map((group, groupIndex) => {
        const items = group.items.filter((i) => !i.perms || can(...i.perms));
        if (!items.length) return null;

        // Dashboard and Notifications are direct links
        if (!group.section) {
          return (
            <div key={`direct-${groupIndex}`} className="space-y-1">
              {items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  active={active === item.href}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          );
        }

        const isOpen = openSection === group.section;
        const hasActiveItem = items.some((item) => item.href === active);

        return (
          <div key={group.section} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleSection(group.section)}
              aria-expanded={isOpen}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] font-medium transition-colors",
                hasActiveItem
                  ? "bg-brand-100 text-brand-800"
                  : "text-slate-700 hover:bg-brand-100 hover:text-brand-800",
              )}
            >
              <span className="flex-1">{group.section}</span>
              {isOpen ? (
                <ChevronDown className="size-4 shrink-0 opacity-80" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4 shrink-0 opacity-80" aria-hidden="true" />
              )}
            </button>

            {isOpen && (
              <div className="ml-3 space-y-1 border-l border-brand-200 pl-2">
                {items.map((item) => (
                  <NavItemLink
                    key={item.href}
                    item={item}
                    active={active === item.href}
                    nested
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** `onClose` (mobile / tablet drawer) adds a close button beside the logo, so it never sits on top of it */
function Sidebar({ onNavigate, onClose }: { onNavigate?: () => void; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col border-r border-brand-100 bg-brand-50">
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <Link href="/dashboard" onClick={onNavigate} className="block min-w-0 flex-1 items-center" aria-label="OneRoot.farm — dashboard">
          <Logo logo={LOGOS.horizontal} priority className="flex px-4 py-3 shadow-sm ring-1 ring-brand-100" imageClassName="w-[85%]" />
          <p className="mt-1.5 text-center text-[10.5px] font-medium uppercase tracking-[0.12em] text-brand-700">
            Agri Inputs ERP
          </p>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 shrink-0 rounded-md p-1.5 text-slate-600 transition-colors duration-200 hover:bg-brand-100 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      <Suspense fallback={<div className="flex-1" />}>
        <NavLinks onNavigate={onNavigate} />
      </Suspense>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [drawer, setDrawer] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  // Only the main panel scrolls, so a new page starts at its top (the browser only resets the window)
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Offline shell for the POS (production builds only; dev chunks change on every edit)
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Prevent background scrolling while the drawer is open
  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawer]);

  function openDrawer() {
    setDrawerMounted(true);
    // Start the transition after the drawer has mounted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawer(true));
    });
  }

  function closeDrawer() {
    setDrawer(false);
  }

  if (loading || !user) return <Spinner page />;

  return (
    <BranchProvider fallback={<Spinner page />}>
      <CountsProvider>
        {/*
          Three panels on a tinted frame — sidebar, top bar and main — with an even 8px gap and 8px corners.
          The frame fills the screen; only the content inside main scrolls. Printing drops the frame so long
          invoices and reports flow over several pages.
        */}
        <div className="flex h-dvh gap-2 overflow-hidden bg-frame p-2 print:block print:h-auto print:overflow-visible print:bg-surface print:p-0">
          <aside className="no-print hidden w-64 shrink-0 overflow-hidden rounded-xl lg:block">
            <Sidebar />
          </aside>

          {drawerMounted && (
            <div
              className={cx(
                "no-print fixed inset-0 z-50 lg:hidden",
                drawer ? "visible" : "invisible",
              )}
            >
              <div
                className={cx(
                  "absolute inset-0 bg-night-900/50 transition-opacity duration-500 ease-in-out motion-reduce:transition-none",
                  drawer ? "opacity-100" : "opacity-0",
                )}
                onClick={closeDrawer}
                aria-hidden="true"
              />
              <aside
                id="mobile-sidebar"
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation"
                className={cx(
                  // Same card as the desktop sidebar: inset 8px from the screen edges, rounded, clipped
                  "absolute inset-y-2 left-2 w-72 max-w-[85vw] transform-gpu overflow-hidden rounded-xl shadow-2xl shadow-black/30 transition-transform duration-500 ease-in-out motion-reduce:transition-none",
                  drawer ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
                )}
                onTransitionEnd={(event) => {
                  // Unmount once the closing slide has finished
                  if (event.target === event.currentTarget && !drawer) {
                    setDrawerMounted(false);
                  }
                }}
              >
                <Sidebar onNavigate={closeDrawer} onClose={closeDrawer} />
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-2 print:block">
            <TopBar onMenu={openDrawer} />
            {/* Floating, draggable shortcuts on every page */}
            <QuickDock />

            <main
              ref={mainRef}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-line bg-(--background) print:block print:overflow-visible print:rounded-none print:border-0 print:bg-surface"
            >
              {/* Grows to fill the panel, so the footer always sits at the bottom even on a short page */}
              <div className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 shrink-0 p-3 sm:p-4 lg:p-6 print:max-w-none print:p-0">
                <BranchScope>
                  <Suspense fallback={<Spinner page />}>
                    <RouteGate>{children}</RouteGate>
                  </Suspense>
                </BranchScope>
              </div>
              {/* Bottom of the panel on short pages; after the content on long ones */}
              <footer className="no-print mx-auto flex w-full max-w-[1440px] shrink-0 flex-wrap justify-between gap-2 border-t border-line px-3 py-3 text-xs text-slate-400 sm:px-4 lg:px-6">
                <span>© {new Date().getFullYear()} OneRoot Agri Inputs</span>
                <span>OneRoot ERP</span>
              </footer>
            </main>
          </div>
        </div>
      </CountsProvider>
    </BranchProvider>
  );
}

/** Re-mounts the page when the branch changes, so every list reloads for the new branch */
function BranchScope({ children }: { children: ReactNode }) {
  const { version } = useBranch();
  return <Fragment key={version}>{children}</Fragment>;
}

export function NoAccess() {
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <FileText className="mx-auto size-10 text-slate-300" />
      <p className="mt-3 font-medium text-slate-700">
        You don&apos;t have access to this page
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Ask an administrator to give you this permission in Users.
      </p>
    </div>
  );
}

/**
 * Whether the user may open this in-app link (query and hash ignored): the same rule as RouteGate, so links to
 * pages the user can't open can be shown as plain text or skipped.
 */
export function canOpenPath(href: string, can: (...perms: Permission[]) => boolean) {
  const pathname = href.split(/[?#]/)[0] || "/";
  if (OPEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) return true;
  if (OPEN_DETAIL_ROUTES.some((r) => r.test(pathname))) return true;
  const rule = ROUTE_PERMS.find(([r]) => r.test(pathname));
  if (rule) return can(...rule[1]);
  const active = activeHref(pathname);
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === active);
  return !item?.perms || can(...item.perms);
}

/** Pages inherit the permission of the sidebar item they sit under (typed URLs included) */
function RouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can } = useAuth();
  if (!canOpenPath(pathname, can)) return <NoAccess />;
  return <>{children}</>;
}

/** Wrap a page (or part of one) that needs a permission beyond its sidebar item's */
export function RequirePerm({
  perms,
  children,
}: {
  perms: Permission[];
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(...perms)) return <NoAccess />;
  return <>{children}</>;
}
