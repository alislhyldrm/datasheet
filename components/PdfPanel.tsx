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
          className="chrome flex shrink-0 gap-1.5 border-b border-hairline px-2 py-2"
        >
          {docs.map((doc, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={doc.fileId}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(i)}
                className={`press flex min-h-11 min-w-0 items-center gap-2 rounded-control px-2.5 text-meta transition-all duration-200 ease-fluid ${
                  selected
                    ? "card font-medium text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <span className="shrink-0 rounded-inner bg-accent-soft px-1.5 py-0.5 font-mono text-micro font-medium text-accent">
                  {i + 1}
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
