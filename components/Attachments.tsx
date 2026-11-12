"use client";

import { Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, Link2, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Attachment, AttachmentEntity } from "@/lib/types";
import { Button, Card, ErrorBox, Spinner, cx, errMsg, useConfirm, useToast } from "./ui";

/** Same limits as the API */
const MAX_FILE_MB = 25;
const MAX_FILES_PER_UPLOAD = 10;
const VIDEO_EXT = /\.(mp4|m4v|mov|avi|mkv|webm|wmv|flv|3gp|3g2|mpe?g|mts|m2ts|ts|vob|ogv)$/i;
/** Opened in a new tab; everything else downloads */
const VIEWABLE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "text/csv"]);

export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Problems with chosen files (video, too big, empty); null when all are fine. Any number may be picked: they upload 10 at a time */
export function checkFiles(files: File[]): string | null {
  for (const f of files) {
    if (f.type.startsWith("video/") || VIDEO_EXT.test(f.name)) return `${f.name}: video files can't be attached`;
    if (f.size > MAX_FILE_MB * 1024 * 1024) return `${f.name} is ${fileSize(f.size)} — the limit is ${MAX_FILE_MB} MB per file`;
    if (!f.size) return `${f.name} is empty`;
  }
  return null;
}

/** Uploads files to a saved PO / GRN / note, in batches of 10 */
export async function uploadAttachments(type: AttachmentEntity, entityId: string, files: File[]) {
  const saved: Attachment[] = [];
  for (let i = 0; i < files.length; i += MAX_FILES_PER_UPLOAD) {
    const form = new FormData();
    for (const f of files.slice(i, i + MAX_FILES_PER_UPLOAD)) form.append("files", f, f.name);
    saved.push(...(await api.upload<Attachment[]>(`/attachments/${type}/${entityId}`, form)));
  }
  return saved;
}

function FileIcon({ name, mime, className }: { name: string; mime: string; className?: string }) {
  const c = cx("size-5 shrink-0", className);
  if (mime.startsWith("image/")) return <FileImage className={cx(c, "text-sky-600")} />;
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return <FileText className={cx(c, "text-red-600")} />;
  if (/\.(xlsx?|csv|ods)$/i.test(name) || mime.includes("spreadsheet") || mime === "text/csv") return <FileSpreadsheet className={cx(c, "text-brand-600")} />;
  if (/\.(docx?|odt|rtf|txt)$/i.test(name) || mime.includes("word")) return <FileText className={cx(c, "text-blue-600")} />;
  if (/\.(zip|rar|7z|gz|tar)$/i.test(name)) return <FileArchive className={cx(c, "text-amber-600")} />;
  return <File className={cx(c, "text-slate-500")} />;
}

/** Drop zone + "Choose files" button; hands back the files that pass the checks */
function FileDrop({ onFiles, busy, compact }: { onFiles: (files: File[]) => void; busy?: boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const problem = checkFiles(files);
    if (problem) return toast.error(problem);
    onFiles(files);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) take(e.dataTransfer.files);
  };
  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cx(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-dashed text-center text-sm transition-colors",
        compact ? "px-3 py-2.5" : "px-4 py-5",
        over ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50/60",
      )}
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <Button type="button" size="sm" variant="secondary" icon={<Upload className="size-4" />} loading={busy} onClick={() => input.current?.click()}>
        Choose Files
      </Button>
      <span className="text-slate-500">
        or drop them here · images, PDF, Word, Excel, CSV and more (no video) · up to {MAX_FILE_MB} MB each
      </span>
    </div>
  );
}

/** Files attached to a saved PO, GRN or debit / credit note: add (one or many), open, download, remove */
export function Attachments({
  type,
  entityId,
  canManage,
  className,
  bare,
}: {
  type: AttachmentEntity;
  entityId: string;
  canManage: boolean;
  className?: string;
  /** Without the card frame (inside a popup) */
  bare?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<Attachment[]>(`/attachments/${type}/${entityId}`);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function add(files: File[]) {
    setUploading(true);
    try {
      const saved = await uploadAttachments(type, entityId, files);
      toast.success(saved.length === 1 ? `${saved[0].fileName} attached` : `${saved.length} files attached`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setUploading(false);
    }
  }

  /** https://erp.oneroot.farm/files/<id>.jpg?exp=…&sig=… — opens without signing in, for 7 days */
  async function fileLink(a: Attachment) {
    const { path } = await api.get<{ path: string; expiresAt: string }>(`/attachments/file/${a.id}/link`);
    return window.location.origin + path;
  }

  async function open(a: Attachment, download: boolean) {
    const viewable = !download && VIEWABLE.has(a.mimeType);
    // Open the tab now, while the click still counts, then point it at the file once its link is ready
    const tab = viewable ? window.open("", "_blank") : null;
    setBusyId(a.id);
    try {
      const url = await fileLink(a);
      if (tab) tab.location.href = url;
      else {
        const link = document.createElement("a");
        link.href = `${url}&download=1`;
        link.download = a.fileName;
        link.click();
      }
    } catch (e) {
      tab?.close();
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink(a: Attachment) {
    setBusyId(a.id);
    try {
      // Clipboard write with a promise keeps Safari's user-gesture check happy while the link loads
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": fileLink(a).then((u) => new Blob([u], { type: "text/plain" })) })]);
      toast.success("Link copied — anyone with it can open the file for 7 days");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: Attachment) {
    if (!(await confirm(`Remove ${a.fileName}? The file is deleted.`, { danger: true, confirmLabel: "Remove" }))) return;
    setBusyId(a.id);
    try {
      await api.del(`/attachments/file/${a.id}`);
      toast.success(`${a.fileName} removed`);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  const body = (
    <div className="space-y-3">
      {canManage && <FileDrop onFiles={(f) => void add(f)} busy={uploading} compact={!!data?.length} />}
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : !data?.length ? (
        <p className="text-sm text-slate-500">No files attached{canManage ? " yet" : ""}.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {data.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <FileIcon name={a.fileName} mime={a.mimeType} />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => void open(a, false)}
                  className="block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  title={VIEWABLE.has(a.mimeType) ? "Open" : "Download"}
                >
                  {a.fileName}
                </button>
                <p className="truncate text-xs text-slate-500">
                  {fileSize(a.size)} · {a.uploadedBy?.name ?? "—"} · {dateTime(a.createdAt)}
                </p>
              </div>
              {busyId === a.id ? (
                <Spinner text={null} />
              ) : (
                <div className="flex shrink-0 items-center">
                  <button type="button" onClick={() => void copyLink(a)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:p-1.5" aria-label={`Copy link to ${a.fileName}`} title="Copy link (works for 7 days)">
                    <Link2 className="size-4" />
                  </button>
                  <button type="button" onClick={() => void open(a, true)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:p-1.5" aria-label={`Download ${a.fileName}`}>
                    <Download className="size-4" />
                  </button>
                  {canManage && (
                    <button type="button" onClick={() => void remove(a)} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1.5" aria-label={`Remove ${a.fileName}`}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const title = (
    <span className="inline-flex items-center gap-1.5">
      <Paperclip className="size-4 text-slate-400" /> Attachments{data?.length ? ` (${data.length})` : ""}
    </span>
  );
  if (bare)
    return (
      <section className={className}>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
        {body}
      </section>
    );
  return (
    <Card title={title} className={className}>
      {body}
    </Card>
  );
}

/** Files picked on a form before the record exists; the form uploads them (uploadAttachments) right after saving */
export function PendingFiles({ files, onChange, className }: { files: File[]; onChange: (files: File[]) => void; className?: string }) {
  return (
    <div className={cx("space-y-2", className)}>
      <FileDrop compact={files.length > 0} onFiles={(more) => onChange([...files, ...more.filter((m) => !files.some((f) => f.name === m.name && f.size === m.size))])} />
      {files.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 px-3 py-1.5">
              <FileIcon name={f.name} mime={f.type} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{f.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{fileSize(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:p-1" aria-label={`Remove ${f.name}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && <p className="text-xs text-slate-500">These files upload when you save.</p>}
    </div>
  );
}
