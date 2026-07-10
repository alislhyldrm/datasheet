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
    <div className="card flex min-w-0 items-center gap-2 rounded-control py-1.5 pr-1.5 pl-2">
      <span className="shrink-0 rounded-inner bg-accent-soft px-1.5 py-0.5 font-mono text-micro font-medium text-accent">
        {index + 1}
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
        className="press flex size-11 shrink-0 items-center justify-center rounded-inner text-ink-muted transition-all duration-200 ease-fluid hover:bg-card-2 hover:text-danger"
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
