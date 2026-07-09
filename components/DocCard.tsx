"use client";

import { X } from "lucide-react";
import type { UploadedDoc } from "@/lib/types";

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function DocCard({
  doc,
  index,
  onRemove,
}: {
  doc: UploadedDoc;
  index: number;
  onRemove: (fileId: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2 py-1.5 pr-1.5 pl-2.5">
      <span className="shrink-0 font-mono text-micro text-accent">
        [{index + 1}]
      </span>

      <span className="min-w-0">
        <span className="block truncate text-meta text-ink">
          {doc.fileName}
        </span>
        <span className="block font-mono text-micro text-ink-muted">
          {formatSize(doc.sizeBytes)}
          {doc.pageCount ? ` · ${doc.pageCount} sayfa` : ""}
        </span>
      </span>

      <button
        type="button"
        onClick={() => onRemove(doc.fileId)}
        aria-label={`${doc.fileName} dokümanını kaldır`}
        title="Kaldır"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-danger"
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
