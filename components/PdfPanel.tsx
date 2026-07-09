"use client";

import PdfViewer from "./PdfViewer";
import type { PageTarget } from "./pdf-sync";
import type { UploadedDoc } from "@/lib/types";

export default function PdfPanel({
  docs,
  activeIndex,
  onSelect,
  target,
  onPageCount,
}: {
  docs: UploadedDoc[];
  activeIndex: number;
  onSelect: (index: number) => void;
  target: PageTarget | null;
  onPageCount: (fileId: string, pageCount: number) => void;
}) {
  const active = docs[activeIndex];

  return (
    <>
      {docs.length > 1 && (
        <div
          role="group"
          aria-label="Dokümanlar"
          className="flex shrink-0 gap-1 border-b border-border px-2 py-1.5"
        >
          {docs.map((doc, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={doc.fileId}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(i)}
                className={`flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-2.5 text-meta transition-colors duration-150 ease-out ${
                  selected
                    ? "bg-surface text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <span className="font-mono text-micro text-accent">
                  [{i + 1}]
                </span>
                <span className="truncate">{doc.fileName}</span>
              </button>
            );
          })}
        </div>
      )}

      <PdfViewer
        // Remounting per document keeps each viewer's scroll and zoom its own.
        key={active.fileId}
        doc={active}
        target={target?.documentIndex === activeIndex ? target : null}
        onPageCount={onPageCount}
      />
    </>
  );
}
