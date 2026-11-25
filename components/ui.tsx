"use client";

import { THERMAL_LOGO_DATA_URL } from "@/lib/thermalLogo";
import { AlertTriangle, Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Pencil, Search, Trash2, X, XCircle } from "lucide-react";
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { date } from "@/lib/format";
import { LOGOS, type LogoImage } from "@/lib/logos";
import type { StoreSettings } from "@/lib/types";
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ───────────────────────── Buttons ─────────────────────────

/** Bordered square icon button of the top bar (notifications, theme): 40px, 36px on phones so the bar fits on one row */
export const TOP_ICON_BUTTON =
  "relative inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] sm:size-10 border border-line bg-surface text-slate-600 transition-colors hover:border-line-3 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

/** Action colours used everywhere: add / new = green, edit = yellow, delete / remove = red (danger) */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "add" | "edit";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-surface text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-crimson-700 shadow-sm",
  add: "bg-green-600 text-white hover:bg-green-700 shadow-sm",
  edit: "bg-yellow-400 text-yellow-950 hover:bg-yellow-500 shadow-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  loadingText = "Loading…",
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  /** Label shown next to the spinner while loading (icon-only buttons show just the spinner) */
  loadingText?: ReactNode;
  icon?: ReactNode;
}) {
  const hasLabel = children !== undefined && children !== null && children !== false && children !== "";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        buttonStyles[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <InfinityLoader tone="current" className="size-5" />
          {hasLabel && loadingText}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

// ───────────────────────── Form controls ─────────────────────────

const control =
  "rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500";

/** Full width unless the caller passes its own width class (w-24, min-w-…, etc.) */
const width = (className?: string) => (/(^|\s)!?(min-)?w-/.test(className ?? "") ? "" : "w-full");

/** `isPassword` hides the text and adds an eye button at the right end to show / hide it */
export function Input({ className, isPassword = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { isPassword?: boolean }) {
  const [shown, setShown] = useState(false);
  if (!isPassword) return <input className={cx(control, width(className), "h-9", className)} {...props} />;

  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = classes.filter((c) => LAYOUT_CLASS.test(c)).join(" ");
  const inner = classes.filter((c) => !LAYOUT_CLASS.test(c)).join(" ");
  return (
    <div className={cx("relative", width(outer), outer)}>
      <input {...props} type={shown ? "text" : "password"} className={cx(control, "h-9 w-full pr-9", inner)} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        disabled={props.disabled}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-600 focus:text-brand-600 focus:outline-none disabled:cursor-not-allowed"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/**
 * Drop-in replacement for a native <select>: same `value`, `onChange={(e) => … e.target.value}` and
 * <option>/<optgroup> children, rendered with the common Dropdown. Lists over 10 options get a search box
 * unless `isSearch` says otherwise.
 */
export function Select({
  className,
  children,
  value,
  onChange,
  disabled,
  isSearch,
  "aria-label": ariaLabel,
  title,
  id,
}: SelectHTMLAttributes<HTMLSelectElement> & { isSearch?: boolean }) {
  const options = optionsFrom(children);
  const current = value === undefined || value === null ? "" : String(value);
  // Like a native select, show the first option when the value matches none
  const fallback = options.some((o) => o.value === current) ? undefined : options[0]?.label;
  return (
    <Dropdown
      options={options}
      value={current}
      onChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)}
      placeholder={fallback}
      isSearch={isSearch ?? options.length > 10}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
      title={title}
      id={id}
    />
  );
}

// ───────────────────────── Date picker ─────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** "2026-10-17" → local Date (no time-zone shift); null when blank or malformed */
function parseDay(v: string | undefined | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Same day n months on, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb) */
function addMonths(d: Date, n: number) {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
}

/** Popup width; kept fixed so the grid never reflows between months */
const CALENDAR_WIDTH = 288;

/**
 * Drop-in replacement for <Input type="date">: same `value` ("YYYY-MM-DD" or ""), `onChange={(e) => … e.target.value}`,
 * `min`, `max` and `required`. Opens the common themed calendar; click the month or year in its header to jump
 * straight to another month / year. Keys: arrows move a day / week, PageUp / PageDown a month (with Shift a year),
 * Home / End the week's ends, Enter picks, Esc closes.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  className,
  placeholder = "Select Date",
  id,
  title,
  autoFocus,
  "aria-label": ariaLabel,
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "min" | "max"> & { value: string; min?: string; max?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  // The day the keyboard is on; its month is the one shown
  const [cursor, setCursor] = useState(() => parseDay(value) ?? new Date());
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const popupId = useId();

  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = classes.filter((c) => LAYOUT_CLASS.test(c)).join(" ");
  const inner = classes.filter((c) => !LAYOUT_CLASS.test(c)).join(" ");

  const selected = parseDay(value);
  const minDay = parseDay(min);
  const maxDay = parseDay(max);
  const todayDay = parseDay(dayKey(new Date()))!;
  const outOfRange = (d: Date) => (!!minDay && d < minDay) || (!!maxDay && d > maxDay);
  const clamp = (d: Date) => (minDay && d < minDay ? minDay : maxDay && d > maxDay ? maxDay : d);

  // Below the field when it fits, else above; never off the sides of the screen
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = trigger.current?.getBoundingClientRect();
      const h = popup.current?.offsetHeight ?? 340;
      if (!r) return;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - CALENDAR_WIDTH - 8));
      const top = r.bottom + 4 + h > window.innerHeight - 8 && r.top - 4 - h > 8 ? r.top - 4 - h : r.bottom + 4;
      setPos({ left, top });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !popup.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Keyboard focus follows the cursor day
  useEffect(() => {
    if (open && pos && view === "days") grid.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(cursor)}"]`)?.focus();
  }, [open, pos, view, cursor]);

  function show() {
    if (disabled) return;
    setCursor(clamp(selected ?? todayDay));
    setView("days");
    setPos(null);
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function emit(v: string) {
    if (v !== value) onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLInputElement>);
  }

  function pick(d: Date) {
    if (outOfRange(d)) return;
    emit(dayKey(d));
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Escape") {
      // Close just the calendar (or step back from the month / year list), not the modal around it
      e.preventDefault();
      e.stopPropagation();
      if (view === "days") close();
      else setView("days");
      return;
    }
    if (e.key === "Tab") return close(false);
    if (view !== "days") return;
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(cursor, e.shiftKey ? 12 : 1),
      Home: () => addDays(cursor, -cursor.getDay()),
      End: () => addDays(cursor, 6 - cursor.getDay()),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setCursor(moves[e.key]());
    }
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  // Six rows from the Sunday on or before the 1st, so the popup keeps one height
  const first = new Date(year, month, 1);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - first.getDay()));
  // Twelve years per page, with the shown year in it
  const yearStart = year - (((year % 12) + 12) % 12);
  const years = Array.from({ length: 12 }, (_, i) => yearStart + i);
  const monthOff = (y: number, m: number) => (!!minDay && new Date(y, m + 1, 0) < minDay) || (!!maxDay && new Date(y, m, 1) > maxDay);
  const yearOff = (y: number) => (!!minDay && y < minDay.getFullYear()) || (!!maxDay && y > maxDay.getFullYear());

  function step(dir: -1 | 1) {
    if (view === "days") setCursor(addMonths(cursor, dir));
    else if (view === "months") setCursor(addMonths(cursor, dir * 12));
    else setCursor(addMonths(cursor, dir * 144));
  }

  const headerButton = "rounded-md px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
  const navButton =
    "flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
  const cellButton = (isSelected: boolean, isOff: boolean, extra?: string) =>
    cx(
      "flex items-center justify-center rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
      isSelected ? "bg-brand-600 font-semibold text-white hover:bg-brand-700" : "text-slate-700 hover:bg-brand-50",
      isOff && "cursor-not-allowed opacity-35 hover:bg-transparent",
      extra,
    );

  return (
    <div ref={box} className={cx("relative", width(outer), outer)} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        autoFocus={autoFocus}
        onClick={() => (open ? close() : show())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}${selected ? `: ${date(selected)}` : ""}` : undefined}
        className={cx(control, "flex w-full items-center gap-2 text-left", !/(^|\s)h-/.test(inner) && "h-9", inner)}
      >
        <span className={cx("min-w-0 flex-1 truncate", !selected && "text-slate-400")}>{selected ? date(selected) : placeholder}</span>
        <Calendar className="size-4 shrink-0 text-slate-400" />
      </button>
      {/* Lets a form's own `required` check stop an empty date, with the browser's message pointing at this field */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          onFocus={() => trigger.current?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      )}

      {open &&
        createPortal(
          <div
            ref={popup}
            id={popupId}
            role="dialog"
            aria-label={ariaLabel ?? "Choose date"}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: CALENDAR_WIDTH }}
            className="no-print fixed z-[70] rounded-xl border border-slate-200 bg-surface p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <button type="button" className={navButton} onClick={() => step(-1)} aria-label={view === "days" ? "Previous Month" : view === "months" ? "Previous Year" : "Previous Years"}>
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex items-center">
                {view === "years" ? (
                  <span className="px-2 py-1 text-sm font-semibold text-slate-800">
                    {years[0]} – {years[11]}
                  </span>
                ) : (
                  <>
                    {view === "days" && (
                      <button type="button" className={headerButton} onClick={() => setView("months")} aria-label="Choose Month">
                        {MONTHS[month]}
                      </button>
                    )}
                    <button type="button" className={headerButton} onClick={() => setView("years")} aria-label="Choose Year">
                      {year}
                    </button>
                  </>
                )}
              </div>
              <button type="button" className={navButton} onClick={() => step(1)} aria-label={view === "days" ? "Next Month" : view === "months" ? "Next Year" : "Next Years"}>
                <ChevronRight className="size-4" />
              </button>
            </div>

            {view === "days" && (
              <div ref={grid} role="grid" className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((w) => (
                  <span key={w} role="columnheader" className="flex h-7 items-center justify-center text-[11px] font-semibold uppercase text-slate-400">
                    {w}
                  </span>
                ))}
                {days.map((d) => {
                  const key = dayKey(d);
                  const isSelected = key === value;
                  const off = outOfRange(d);
                  const isToday = key === dayKey(todayDay);
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      data-day={key}
                      tabIndex={key === dayKey(cursor) ? 0 : -1}
                      aria-selected={isSelected}
                      aria-disabled={off}
                      aria-label={date(d)}
                      onClick={() => pick(d)}
                      className={cellButton(
                        isSelected,
                        off,
                        cx("h-9", d.getMonth() !== month && !isSelected && "text-slate-400", isToday && !isSelected && "font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/50"),
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            )}

            {view === "months" && (
              <div className="grid grid-cols-3 gap-1.5">
                {MONTHS.map((m, i) => {
                  const off = monthOff(year, i);
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={off}
                      onClick={() => (setCursor(clamp(addMonths(cursor, i - month))), setView("days"))}
                      className={cellButton(i === month, off, "h-11")}
                    >
                      {m.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            )}

            {view === "years" && (
              <div className="grid grid-cols-3 gap-1.5">
                {years.map((y) => {
                  const off = yearOff(y);
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={off}
                      onClick={() => (setCursor(addMonths(cursor, (y - year) * 12)), setView("months"))}
                      className={cellButton(y === year, off, cx("h-11", y === todayDay.getFullYear() && y !== year && "font-semibold text-brand-700"))}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <button
                type="button"
                disabled={outOfRange(todayDay)}
                onClick={() => pick(todayDay)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Today
              </button>
              {!required && value && (
                <button type="button" onClick={() => (emit(""), close())} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export { LOGOS, type LogoImage } from "@/lib/logos";

/**
 * A OneRoot logo, centred in a rounded card. `logo` picks the image (a LOGOS entry or any
 * { src, width, height }); `alt` its text.
 * `framed` adds a shadow and soft ring so the card lifts off a dark background (the sidebar);
 * leave it off where the logo already sits on white (the login card).
 * `className` sizes and places the card; `imageClassName` sets the logo width (default 176px).
 */
export function Logo({
  logo = LOGOS.horizontal,
  alt = "OneRoot",
  className,
  imageClassName = "w-[176px]",
  framed = false,
  priority,
}: {
  logo?: LogoImage;
  alt?: string;
  className?: string;
  imageClassName?: string;
  framed?: boolean;
  /** Load eagerly (above-the-fold logos: sidebar, login) */
  priority?: boolean;
}) {
  return (
    <div
      className={cx(
        "inline-flex items-center justify-center overflow-hidden rounded-xl bg-surface",
        framed && "shadow-lg shadow-black/25 ring-1 ring-white/40",
        className,
      )}
    >
      <Image src={logo.src} alt={alt} width={logo.width} height={logo.height} priority={priority} className={cx("h-auto min-w-0", imageClassName)} />
    </div>
  );
}

/**
 * Company logo at the top of printed bills, invoices, notes and receipts (as on the PO), and so in the PO PDF
 * emailed to vendors. `src` picks the image (the stacked logo unless given).
 * `className` places it; `imageClassName` sizes the image (default 56px tall).
 */
/**
 * Thermal receipts: a plain black-on-white logo (no colour, no transparency, no CSS filter). Receipt printers have no
 * colour or grey, and their drivers turn the orange logo — or a transparent / filtered image — into blank paper.
 */
export const THERMAL_LOGO_SRC = THERMAL_LOGO_DATA_URL;
export const THERMAL_LOGO = "[print-color-adjust:exact] [-webkit-print-color-adjust:exact]";

export function PrintLogo({
  src = LOGOS.vertical.src,
  className,
  imageClassName = "h-14 w-auto",
}: {
  src?: string;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span className={cx("mx-auto flex w-fit items-center justify-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- plain img prints reliably */}
      <img src={src} alt="OneRoot" className={cx("block", imageClassName)} />
    </span>
  );
}

/**
 * Top of a printed bill / invoice / note, laid out like the PO: logo | company name, address, GSTIN on the left;
 * the document's title, number and status on the right.
 */
export function PrintHeader({
  store,
  title,
  number,
  status,
  details,
  className,
}: {
  store?: Partial<StoreSettings> | null;
  title: ReactNode;
  number?: ReactNode;
  /** e.g. Cancelled (red) or Draft (amber) */
  status?: { label: string; tone: "red" | "amber" } | null;
  /** Extra company lines under the address (phone, licences…) */
  details?: ReactNode;
  className?: string;
}) {
  const address = [store?.address, store?.city, store?.state, store?.pincode].filter(Boolean).join(", ");
  return (
    <div className={cx("flex items-center justify-between gap-6 border-b-[3px] border-forest-700 pb-3 text-left", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <PrintLogo className="mx-0 shrink-0" />
        <div className="min-w-0 border-l border-slate-300 pl-3">
          <p className="text-[15px] font-bold leading-tight text-slate-900">{store?.storeName ?? "OneRoot"}</p>
          {address && <p className="text-[10.5px] text-slate-500">{address}</p>}
          {store?.gstin && (
            <p className="text-[10.5px] text-slate-500">
              GSTIN: {store.gstin}
              {store.stateCode ? ` · State code: ${store.stateCode}` : ""}
            </p>
          )}
          {details}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[19px] font-extrabold uppercase leading-none tracking-[0.06em] text-brand-800">{title}</p>
        {number && <p className="mt-1.5 font-mono text-[12px] font-semibold text-slate-700">{number}</p>}
        {status && (
          <p
            className={cx(
              "mt-1 inline-block rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide",
              status.tone === "red" ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
            )}
          >
            {status.label}
          </p>
        )}
      </div>
    </div>
  );
}

/** Foot of every printed bill / invoice / note, in place of signature lines (as on the PO) */
export function SystemGeneratedNote({ doc = "bill", className }: { doc?: string; className?: string }) {
  return (
    <p className={cx("text-left text-[10px] italic text-slate-500", className)}>
      <span className="font-semibold not-italic text-red-600">*</span> This is a system-generated {doc} and does not require a signature.
    </p>
  );
}

/** Text inside an <option>, e.g. {code} · {name} */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** <option> and <optgroup> children → Dropdown options (fragments and arrays included) */
function optionsFrom(children: ReactNode, group?: string): DropdownOption[] {
  const out: DropdownOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: unknown; label?: string; children?: ReactNode }>(child)) return;
    if (child.type === "option") {
      const label = textOf(child.props.children);
      out.push({ value: child.props.value === undefined ? label : String(child.props.value), label, group });
    } else if (child.type === "optgroup") {
      out.push(...optionsFrom(child.props.children, child.props.label));
    } else if (child.type === Fragment) {
      out.push(...optionsFrom(child.props.children, group));
    }
  });
  return out;
}

export interface DropdownOption {
  value: string;
  label: string;
  /** Muted text shown after the label (and searched too), e.g. a code or city */
  hint?: string;
  /** Muted text on its own line under the label in the list (and searched too), e.g. a SKU */
  detail?: string;
  /** Heading the option is listed under */
  group?: string;
}

/** Classes that place or size the control (kept on the wrapper); the rest style the button */
const LAYOUT_CLASS = /^(?:[a-z0-9]+:)*!?(?:(?:min-|max-)?w-|col-span|row-span|-?m[trblxy]?-|flex-|shrink|grow|basis-|self-|order-)/;

/**
 * Styled dropdown: single choice, or with `multiple` a checkbox on every row (values / onValuesChange; the list
 * stays open while ticking). `isSearch` adds a filter box at the top of the list.
 * The list opens in a layer above the page, so modals and scrolling tables don't clip it.
 * A value missing from `options` (e.g. a legacy one) still shows as the selection.
 */
export function Dropdown({
  options,
  value = "",
  onChange,
  multiple = false,
  values = [],
  onValuesChange,
  placeholder = "Select…",
  isSearch = false,
  searchPlaceholder = "Search…",
  emptyText = "No options",
  allowClear = false,
  bare = false,
  anchor,
  rowActions,
  footer,
  disabled,
  className,
  title,
  id,
  "aria-label": ariaLabel,
}: {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  /** Checkbox on every row: any number can be ticked */
  multiple?: boolean;
  /** Ticked values (with `multiple`) */
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  placeholder?: string;
  isSearch?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Adds a "None" row that clears the value */
  allowClear?: boolean;
  /** No border or background, for a dropdown sitting inside its own styled box (e.g. the top bar) */
  bare?: boolean;
  /** Element the list lines up with (left edge and width) instead of the button, e.g. the box a bare dropdown sits in */
  anchor?: RefObject<HTMLElement | null>;
  /** Buttons at the end of an option's row (e.g. edit / delete); clicking one closes the list */
  rowActions?: (option: DropdownOption) => ReactNode;
  /** Pinned under the list (e.g. an "Add new" button); clicking it closes the list */
  footer?: ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();

  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const outer = classes.filter((c) => LAYOUT_CLASS.test(c)).join(" ");
  const inner = classes.filter((c) => !LAYOUT_CLASS.test(c)).join(" ");

  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.hint?.toLowerCase().includes(q) ||
          o.detail?.toLowerCase().includes(q) ||
          o.group?.toLowerCase().includes(q),
      )
    : options;
  const rows: DropdownOption[] = allowClear && !q ? [{ value: "", label: "None" }, ...matches] : matches;
  const selected = multiple ? undefined : options.find((o) => o.value === value);
  const isOn = (v: string) => (multiple ? values.includes(v) : v === value);
  // With `multiple`, the button lists what is ticked
  const tickedLabels = multiple ? options.filter((o) => values.includes(o.value)).map((o) => o.label) : [];

  // Keep the list pinned right under the button (or `anchor`), exactly as wide as it, and inside the screen; above it
  // when there's more room there. Phones: at least 14rem wide, so a narrow button still gets a readable list
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = (anchor?.current ?? trigger.current)?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const width = Math.min(vw < 640 ? Math.max(r.width, 224) : r.width, vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      if (below < 200 && above > below)
        setPos({ left, width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(320, above) });
      else setPos({ left, width, top: r.bottom + 4, maxHeight: Math.min(320, Math.max(120, below)) });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !popup.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    if (disabled) return;
    setQuery("");
    setPos(null);
    const all = allowClear ? [{ value: "" }, ...options] : options;
    setActive(Math.max(0, all.findIndex((o) => isOn(o.value))));
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function pick(o: DropdownOption) {
    if (multiple) {
      // Tick / untick and keep the list open for more
      onValuesChange?.(values.includes(o.value) ? values.filter((v) => v !== o.value) : [...values, o.value]);
      return;
    }
    if (o.value !== value) onChange?.(o.value);
    close();
  }

  // Popup key presses bubble here too (React portals follow the component tree)
  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) pick(rows[active]);
    } else if (e.key === "Escape") {
      // Close just the list, not the modal around it
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={box} className={cx("relative", width(outer), outer)} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : show())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={cx(
          bare ? "bg-transparent text-sm focus:outline-none disabled:opacity-50" : control,
          "flex w-full items-center gap-2 text-left",
          !bare && !/(^|\s)h-/.test(inner) && "h-9",
          inner,
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", (multiple ? !tickedLabels.length : !selected && !value) && "text-slate-400")}>
          {multiple ? tickedLabels.join(", ") || placeholder : (selected?.label ?? (value || placeholder))}
          {selected?.hint && <span className="ml-1.5 text-xs text-slate-400">{selected.hint}</span>}
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popup}
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            className="no-print fixed z-[70] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-lg"
          >
            {isSearch && (
              <div className="relative shrink-0 border-b border-slate-100 p-1.5">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                {/* Focused only when clicked; the list opens with focus left on the button (arrow keys still move through it) */}
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={listId}
                  className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
                />
              </div>
            )}
            <div ref={list} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
              {rows.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">{q ? "No matches" : emptyText}</p>}
              {rows.map((o, i) => (
                <Fragment key={`${o.group ?? ""}:${o.value || "__none"}:${i}`}>
                  {o.group && o.group !== rows[i - 1]?.group && (
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{o.group}</p>
                  )}
                  <div className={cx("flex items-center", i === active ? "bg-brand-50" : "hover:bg-slate-50")} onMouseEnter={() => setActive(i)}>
                  <button
                    type="button"
                    role="option"
                    data-index={i}
                    aria-selected={isOn(o.value)}
                    onClick={() => pick(o)}
                    className={cx(
                      "flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 text-left text-sm",
                      o.group ? "pl-5" : "pl-3",
                      !o.value && "text-slate-500",
                    )}
                  >
                    {multiple && (
                      <input type="checkbox" checked={isOn(o.value)} readOnly tabIndex={-1} aria-hidden className="pointer-events-none size-4 shrink-0 rounded border-slate-300 accent-brand-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {o.label}
                      {o.hint && <span className="ml-1.5 text-xs text-slate-400">{o.hint}</span>}
                      {o.detail && <span className="block truncate font-mono text-xs text-slate-500">{o.detail}</span>}
                    </span>
                    {!multiple && o.value === value && <Check className="size-4 shrink-0 text-brand-600" />}
                  </button>
                  {rowActions && o.value && (
                    <div className="flex shrink-0 items-center gap-0.5 pr-1.5" onClick={() => close(false)}>
                      {rowActions(o)}
                    </div>
                  )}
                  </div>
                </Fragment>
              ))}
            </div>
            {footer && (
              <div className="shrink-0 border-t border-slate-100 p-1" onClick={() => close(false)}>
                {footer}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(control, width(className), "py-2", className)} rows={3} {...props} />;
}

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  indeterminate = false,
  disabled,
  title,
  "aria-label": ariaLabel,
}: {
  /** Leave out for a bare checkbox (e.g. table row selection) and pass aria-label instead */
  label?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Partly-ticked state, e.g. a "select all" box when only some rows are picked */
  indeterminate?: boolean;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <label
      className={cx(
        "inline-flex items-center gap-2 text-sm text-slate-700",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      title={title}
    >
      <input
        ref={ref}
        type="checkbox"
        className="size-4 rounded border-slate-300 accent-brand-600 disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div data-search className={cx("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
        autoFocus={autoFocus}
      />
    </div>
  );
}

// ───────────────────────── Layout ─────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className="no-print mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {/* Wider screens: always the top-right corner, wrapping right-aligned. Phones: their own row under the title */}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:max-w-[65%] sm:shrink-0 sm:justify-end">{actions}</div>}
      </div>
    </>
  );
}

/**
 * The filter row at the top of a list card. Search and filters sit at the right end and wrap right-aligned; the
 * search box keeps a fixed width there. Phones: each control keeps its own (usually full) width.
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "no-print flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 p-3 sm:[&>*]:flex-none sm:[&>[data-search]]:w-72",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Card({
  title,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-slate-200 bg-surface shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
          <h2 className="min-w-0 text-sm font-semibold text-slate-800">{title}</h2>
          {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-3 sm:p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700",
  };
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-surface p-3 shadow-sm sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className={cx("rounded-lg p-1.5 [&>svg]:size-4", tones[tone])}>{icon}</span>}
      </div>
      <p className="num mt-2 break-words text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ───────────────────────── Data display ─────────────────────────

type Tone = "slate" | "green" | "amber" | "red" | "blue" | "violet";

const badgeTones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-brand-50 text-brand-700 ring-brand-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-slate-500/10",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

const statusTones: Record<string, Tone> = {
  PAID: "green",
  PARTIAL: "amber",
  UNPAID: "red",
  COMPLETED: "green",
  CANCELLED: "slate",
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  PARTIALLY_APPROVED: "blue",
  PARTIALLY_REJECTED: "red",
  SENT_BACK: "amber",
  APPROVED: "blue",
  PARTIALLY_RECEIVED: "violet",
  RECEIVED: "green",
  REJECTED: "red",
  SENT: "green",
  OPEN: "blue",
  ACCEPTED: "green",
  EXPIRED: "amber",
  SEED: "green",
  FERTILIZER: "blue",
  PESTICIDE: "violet",
  EQUIPMENT: "amber",
  OTHER: "slate",
  ADMIN: "violet",
  MANAGER: "blue",
  CASHIER: "green",
  ACCOUNTANT: "amber",
};

export function StatusBadge({ status }: { status: string }) {
  // PENDING_APPROVAL → "Pending Approval"
  const label = status.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge tone={statusTones[status] ?? "slate"}>{label}</Badge>;
}

/**
 * Wrapper giving tables consistent styling; use <Th>/<Td> inside.
 * Phones: every row is a card (see TableStack). `stack={false}` keeps the plain table, for tables with their own
 * phone layout.
 */
export function Table({ children, className, stack = true }: { children: ReactNode; className?: string; stack?: boolean }) {
  return (
    <TableStack stack={stack} className={cx("max-w-full overflow-x-auto overscroll-x-contain", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </TableStack>
  );
}

/**
 * The box around a <table> (its direct child) that turns the rows into cards on phones (`.table-stack` in
 * globals.css): each cell labelled with its column's header, the first named column as the card's title and an
 * "Actions" column as its footer. <Table> uses it; wrap a hand-built table in it to get the same.
 */
export function TableStack({ children, className, stack = true }: { children: ReactNode; className?: string; stack?: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  // Cells get their labels from the header row, kept up to date as rows load, change or reorder
  useEffect(() => {
    const el = box.current;
    if (!stack || !el) return;
    let frame = 0;
    const label = () => {
      frame = 0;
      const table = el.querySelector(":scope > table");
      const head = table?.querySelector(":scope > thead > tr:last-child");
      if (!table || !head) return;
      const heads: string[] = [];
      for (const th of head.children as HTMLCollectionOf<HTMLTableCellElement>) {
        // A header only screen readers see ("Open" over a button column) isn't shown as a label either
        const text = th.textContent?.trim() ?? "";
        const hidden = th.querySelector(".sr-only")?.textContent?.trim() === text;
        for (let i = 0; i < th.colSpan; i++) heads.push(hidden ? "" : text);
      }
      const titleCol = heads.findIndex((h) => h && h !== "#" && h.toLowerCase() !== "actions");
      for (const tr of table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr, :scope > tfoot > tr")) {
        const cells = [...(tr.children as HTMLCollectionOf<HTMLTableCellElement>)];
        // Full-width detail row (an expanded line, a note): only spanning cells hold anything; joins the card above
        setData(tr, "detail", cells.some((td) => td.colSpan > 1) && cells.every((td) => td.colSpan > 1 || !td.hasChildNodes()) ? "" : null);
        let col = 0;
        for (const td of cells) {
          // A cell spanning several columns (empty / loading rows, "Total" labels) has no single header
          const head = td.colSpan === 1 ? (heads[col] ?? "") : "";
          const actions = head.toLowerCase() === "actions";
          setData(td, "label", head && !actions ? head : null);
          setData(td, "actions", actions ? "" : null);
          // An input keeps its label, so an editable first column (qty, account) isn't a title
          setData(td, "title", td.colSpan === 1 && col === titleCol && !td.querySelector(FORM_CONTROL) ? "" : null);
          col += td.colSpan;
        }
      }
    };
    const schedule = () => (frame ||= requestAnimationFrame(label));
    label();
    // Not watching attributes, so setting the labels doesn't call this again
    const watch = new MutationObserver(schedule);
    watch.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      watch.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [stack]);

  return (
    <div ref={box} className={cx(stack && "table-stack", className)}>
      {children}
    </div>
  );
}

const FORM_CONTROL = "input:not([type=checkbox]), select, textarea, [aria-haspopup]";

/** Sets (or with null removes) a data- attribute, touching the element only when it changes */
function setData(el: HTMLElement, key: string, value: string | null) {
  if (value === null) {
    if (key in el.dataset) delete el.dataset[key];
  } else if (el.dataset[key] !== value) el.dataset[key] = value;
}

export function Th({ children, className, right, center }: { children?: ReactNode; className?: string; right?: boolean; center?: boolean }) {
  return (
    <th
      className={cx(
        "whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500",
        right && "text-right",
        center && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  right,
  center,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  right?: boolean;
  center?: boolean;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cx("border-b border-slate-100 px-3 py-2.5 text-slate-700", right && "num text-right", center && "text-center", className)}>
      {children}
    </td>
  );
}

/** Header of a list's row-actions column: "Actions", centred */
export function ActionsTh({ className, right }: { className?: string; right?: boolean }) {
  return (
    <Th center={!right} right={right} className={className}>
      Actions
    </Th>
  );
}

/** Row-actions cell of a list: its buttons centred under the Actions header, or at the right end with `right` */
export function ActionsTd({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return (
    <Td center={!right} right={right} className={className}>
      <div className={cx("flex items-center gap-1.5", right ? "justify-end" : "justify-center")}>{children}</div>
    </Td>
  );
}

const ROW_ACTION = {
  view: { icon: Eye, label: "View", tone: "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100" },
  edit: { icon: Pencil, label: "Edit", tone: "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100" },
  delete: { icon: Trash2, label: "Delete", tone: "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100" },
} as const;

/**
 * View / Edit / Delete button for a list row: a filled pill with its icon and label. Pass `href` to navigate, else `onClick`.
 * `label` overrides the text (e.g. "Remove"); `title` is the tooltip / accessible name (e.g. "Edit PO-26-27-00002").
 * `loading` shows a spinner and blocks clicks while the action runs.
 */
export function RowAction({
  kind,
  href,
  onClick,
  label,
  title,
  disabled,
  loading,
}: {
  kind: keyof typeof ROW_ACTION;
  href?: string;
  onClick?: () => void;
  label?: string;
  title?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { icon: Icon, label: text, tone } = ROW_ACTION[kind];
  const className = cx(
    "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    tone,
  );
  const body = (
    <>
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
      {label ?? text}
    </>
  );
  return href ? (
    <Link href={href} className={className} title={title} aria-label={title}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={className} title={title} aria-label={title}>
      {body}
    </button>
  );
}

export function EmptyRow({ colSpan, children = "Nothing here yet" }: { colSpan: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  );
}

export function LoadingRow({ colSpan, text = "Loading…" }: { colSpan: number; text?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center">
        <span className="inline-flex items-center gap-2 text-sm text-slate-500" role="status">
          <InfinityLoader className="size-6" />
          {text}
        </span>
      </td>
    </tr>
  );
}

/**
 * Loading indicator. `page` = a whole page (or the app) is loading: it sits in the exact centre of the screen,
 * whatever scrolls or sits around it. Without it, it fills the spot it is placed in (a card, a table cell).
 */
/**
 * The app's one loading icon: the "∞" of the OneRoot logo with a stroke running round it, turning in 90° steps
 * for as long as something loads (styles in globals.css). Green by default; `tone="current"` takes the text
 * colour instead, for use on coloured buttons where green would not show.
 */
export function InfinityLoader({ className, tone = "brand" }: { className?: string; tone?: "brand" | "current" }) {
  const loop = "M5 30C5 16 21 16 30 30C39 44 55 44 55 30C55 16 39 16 30 30C21 44 5 44 5 30Z";
  return (
    // Square box so the loop can turn upright without pushing its neighbours
    <svg viewBox="0 0 60 60" className={cx("or-loader-turn shrink-0", tone === "brand" && "text-brand-600", className)} aria-hidden>
      <path d={loop} pathLength={200} fill="none" stroke="currentColor" strokeWidth={6} opacity={0.22} />
      <path d={loop} pathLength={200} fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" className="or-loader-run" />
    </svg>
  );
}

export function Spinner({ className, text = "Loading…", page = false }: { className?: string; text?: ReactNode; page?: boolean }) {
  if (page) {
    return (
      <div className={cx("pointer-events-none fixed inset-0 z-40 flex items-center justify-center", className)} role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface/95 px-8 py-6 shadow-xl shadow-brand-900/10 backdrop-blur-sm">
          <InfinityLoader className="size-14" />
          {text && <span className="or-loader-text text-sm font-semibold tracking-wide text-brand-800">{text}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={cx("flex flex-col items-center justify-center gap-2.5 py-16", className)} role="status">
      <InfinityLoader className="size-10" />
      {text && <span className="text-sm text-slate-500">{text}</span>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {message}
      {onRetry && (
        <button className="ml-3 font-medium underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return <p className="px-3 py-2.5 text-xs text-slate-500">{total} record{total === 1 ? "" : "s"}</p>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs text-slate-500">
      <span>
        {total} records · page {page} of {totalPages}
      </span>
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="size-4" />} aria-label="Previous page" />
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} icon={<ChevronRight className="size-4" />} aria-label="Next page" />
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    // The base line is an inset shadow, not a border: tabs then sit inside the strip (no 1px overflow that made it
    // scroll up and down). Still swipes sideways on narrow screens, without a scrollbar.
    <div className="no-print no-scrollbar mb-4 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-slate-200)]">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cx(
            "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === t.value
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Label/value pair for detail pages */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{children || "—"}</dd>
    </div>
  );
}

// ───────────────────────── Modal ─────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  centered = false,
  className,
  scrollBody = true,
  sheet = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Wider screens: sit in the middle of the screen instead of near the top */
  centered?: boolean;
  /** Extra classes for the dialog box */
  className?: string;
  /** false: a fixed-height dialog whose body doesn't scroll; the content lays out (and scrolls) its own parts, e.g. only a list */
  scrollBody?: boolean;
  /** Phones: a bottom sheet as tall as its content instead of the whole screen (short dialogs, e.g. a confirm) */
  sheet?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    // A dropdown inside the modal handles its own Escape (defaultPrevented)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <div
      className={cx(
        "no-print fixed inset-0 z-50 flex justify-center bg-night-900/40 sm:items-start sm:overflow-y-auto sm:p-4",
        sheet ? "items-end" : "items-stretch",
        !centered && "sm:pt-[8vh]",
      )}
    >
      <div className="fixed inset-0" onClick={onClose} />
      {/* Phones: the whole screen (or a bottom sheet), header and footer pinned, the body scrolls; wider: a centred dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "relative flex w-full flex-col bg-surface shadow-xl sm:rounded-xl",
          sheet ? "max-h-[90dvh] rounded-t-2xl" : "h-[100dvh]",
          // Fixed-height layout (scrollBody off): the dialog keeps its height and the content scrolls its own parts
          scrollBody ? "sm:h-auto" : "sm:h-[88vh]",
          // my-auto centres it while it fits and still lets a taller one scroll from its top
          centered && "sm:my-auto",
          widths[size],
          "max-sm:max-w-none",
          className,
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5">
          <h3 className="min-w-0 truncate text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="-mr-1 shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="size-5 sm:size-4" />
          </button>
        </header>
        <div
          className={cx(
            "min-h-0 flex-1 px-4 py-4 sm:px-5",
            scrollBody ? "overflow-y-auto sm:max-h-[70vh] sm:flex-none" : "flex flex-col overflow-hidden",
          )}
        >
          {children}
        </div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3 max-sm:[&>:is(button,a)]:flex-1 max-sm:[&>:not(button,a)]:basis-full">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Promise-based confirm dialog: `if (await confirm("Delete?")) …` */
const ConfirmContext = createContext<(message: string, opts?: { danger?: boolean; confirmLabel?: string }) => Promise<boolean>>(
  async () => false,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    message: string;
    danger?: boolean;
    confirmLabel?: string;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (message: string, opts?: { danger?: boolean; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => setState({ message, ...opts, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title="Please Confirm"
        size="sm"
        sheet
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

// ───────────────────────── Toasts ─────────────────────────

type ToastTone = "success" | "error" | "warn";
type Toast = { id: number; message: string; tone: ToastTone };

/** How long a toast stays up; the progress bar under it runs down over the same time */
const TOAST_MS = 3000;

const TOAST_STYLE: Record<ToastTone, { box: string; icon: ReactNode; bar: string; title: string }> = {
  success: {
    box: "border-brand-200 bg-brand-50 text-brand-900",
    icon: <CheckCircle2 className="size-5 text-brand-600" />,
    bar: "bg-brand-500",
    title: "Success",
  },
  error: {
    box: "border-red-200 bg-red-50 text-red-900",
    icon: <XCircle className="size-5 text-red-600" />,
    bar: "bg-red-500",
    title: "Error",
  },
  warn: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    icon: <AlertTriangle className="size-5 text-amber-600" />,
    bar: "bg-amber-500",
    title: "Warning",
  },
};

type ToastApi = {
  /** Green: something worked */
  success: (m: string) => void;
  /** Green: same look as success, for plain information */
  info: (m: string) => void;
  /** Red: something failed */
  error: (m: string) => void;
  /** Yellow: worked, but needs attention */
  warn: (m: string) => void;
};
const ToastContext = createContext<ToastApi>({ success: () => {}, info: () => {}, error: () => {}, warn: () => {} });

/**
 * Toasts in the top-right corner: green / red / yellow, with a close button and a bar that runs from
 * full to empty over 3 s; the toast closes itself when the time is up (or at once on the close button).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.random();
    // Newest on top; at most 5 on screen
    setToasts((t) => [{ id, message, tone }, ...t].slice(0, 5));
  }, []);
  const success = useCallback((m: string) => push(m, "success"), [push]);
  const error = useCallback((m: string) => push(m, "error"), [push]);
  const warn = useCallback((m: string) => push(m, "warn"), [push]);
  const value: ToastApi = { success, info: success, error, warn };
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="no-print pointer-events-none fixed inset-x-4 top-4 z-[80] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** One toast: closes after TOAST_MS, its bar shrinking from 100% to 0% over the same time */
function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const st = TOAST_STYLE[toast.tone];
  // false on the first paint (bar full, slid in from the right), then true: the bar and slide transitions run
  const [running, setRunning] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    // Two frames, so the full-width bar is painted before it starts shrinking
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setRunning(true)));
    const timer = setTimeout(() => close.current(), TOAST_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cx("pointer-events-auto relative w-full overflow-hidden rounded-xl border shadow-lg shadow-slate-900/10", st.box)}
      style={{
        opacity: running ? 1 : 0,
        transform: running ? "translateX(0)" : "translateX(24px)",
        transition: "opacity 200ms ease-out, transform 200ms ease-out",
      }}
    >
      <div className="flex items-start gap-3 px-4 pb-3.5 pt-3">
        <span className="mt-0.5 shrink-0">{st.icon}</span>
        <div className="min-w-0 flex-1">
          {/* <p className="text-[13px] font-semibold leading-5">{st.title}</p> */}
          <p className="break-words text-sm leading-5 opacity-90">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* Time left: 100% → 0% over TOAST_MS, in the toast's colour */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
        <div
          className={cx("h-full", st.bar)}
          style={{ width: running ? "0%" : "100%", transition: running ? `width ${TOAST_MS}ms linear` : "none" }}
        />
      </div>
    </div>
  );
}

export const useToast = () => useContext(ToastContext);

/** Extract a message from an unknown error */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
