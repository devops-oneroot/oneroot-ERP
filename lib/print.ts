"use client";

import type { StoreSettings } from "./types";

/** "sheet": a document rendered in a PrintPortal with its own margins (e.g. the PO), printed on its own */
export type PrintMode = "a4" | "thermal" | "labels" | "sheet";

/** Paper width for the receipt layout the store chose */
export const receiptWidth = (s: StoreSettings | null | undefined) => (s?.receiptFormat === "THERMAL_58" ? 58 : 80);
export const defaultPrintMode = (s: StoreSettings | null | undefined): "a4" | "thermal" => (s?.receiptFormat?.startsWith("THERMAL") ? "thermal" : "a4");

/**
 * Prints one part of the page: the A4 `.print-area`, the `.thermal-area` receipt, or a `.label-sheet`.
 * `pageCss` sets the paper size so the browser does not pad a receipt or label to A4; it may be a function, worked out
 * just before printing (once the content has rendered — a receipt is measured then).
 * `fileName` becomes the suggested name of a saved PDF (browsers use the page title); restored after printing.
 */
export function printAs(mode: PrintMode, pageCss?: string | (() => Promise<string>), fileName?: string) {
  document.body.dataset.print = mode;
  const title = document.title;
  // Characters a file name can't hold (e.g. the slashes in PO/26-27/00001) become dashes
  if (fileName) document.title = fileName.replace(/[\\/:*?"<>|]+/g, "-");
  let style: HTMLStyleElement | null = null;
  const done = () => {
    delete document.body.dataset.print;
    document.title = title;
    style?.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  setTimeout(async () => {
    // Margins are always 0 so the browser adds no date / URL header or footer (globals.css pads the content instead)
    const css = typeof pageCss === "function" ? await pageCss() : (pageCss ?? (mode === "thermal" ? "size: 80mm 297mm; margin: 0;" : null));
    if (css) {
      style = document.createElement("style");
      style.textContent = `@page { ${css} }`;
      document.head.appendChild(style);
    }
    window.print();
  }, 60);
}

/**
 * Length of the receipt about to print, in mm. Browsers ignore an "auto" page length, so without this a long bill is
 * split onto several "pages" and a receipt printer's auto-cutter (e.g. the Essae PR-55) cuts between them.
 * The receipt is laid out off-screen at its print width (after its images load) and measured.
 */
async function receiptLengthMm(): Promise<number | null> {
  const areas = [...document.querySelectorAll<HTMLElement>(".thermal-host .thermal-area")];
  if (!areas.length) return null;
  const pending = areas.flatMap((a) => [...a.querySelectorAll("img")]).filter((img) => !img.complete);
  await Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          setTimeout(resolve, 1500);
        }),
    ),
  );
  let px = 0;
  for (const a of areas) {
    const before = a.getAttribute("style") ?? "";
    a.style.setProperty("display", "block", "important");
    a.style.setProperty("position", "absolute");
    a.style.setProperty("left", "-10000px");
    a.style.setProperty("top", "0");
    px = Math.max(px, a.getBoundingClientRect().height);
    a.setAttribute("style", before);
  }
  return px > 0 ? Math.ceil((px * 25.4) / 96) : null;
}

/** What a receipt printer actually prints across: 72 mm on 80 mm paper, 48 mm on 58 mm paper */
const PRINT_WIDTH_MM: Record<number, number> = { 80: 72, 58: 48 };

/**
 * Prints the receipt on a page as wide as the printer prints (not the paper width: a page wider than that loses its
 * right edge) and exactly as long as the receipt, plus the print padding and a little feed for the cutter.
 */
export const printReceipt = (paperMm: number) =>
  printAs("thermal", async () => {
    const width = PRINT_WIDTH_MM[paperMm] ?? paperMm;
    const length = await receiptLengthMm();
    return `size: ${width}mm ${length ? length + 12 : 297}mm; margin: 0;`;
  });
