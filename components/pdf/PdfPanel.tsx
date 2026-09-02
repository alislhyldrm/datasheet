"use client";
import PdfViewer from "./PdfViewer";
import type { PageTarget } from "./sync";
import type { UploadedDoc } from "@/lib/types";

export type PdfLayout = "stacked" | "single";

export default function PdfPanel({
  docs,
  activeIndex,
  onSelect,
  layout,
  target,
  onPageCount,
}: {
  docs: UploadedDoc[];
  activeIndex: number;
  onSelect: (index: number) => void;
  layout: PdfLayout;
  target: PageTarget | null;
  onPageCount: (fileId: string, pageCount: number) => void;
}) {
  const multi = docs.length > 1;
  const stacked = multi && layout === "stacked";

  if (stacked) {
    return (
      <>
        {/* Each document owns a row: its own scroll, zoom and page counter.
            A citation reaches the right one through target.documentIndex, so
            neither row has to become "active" first. */}
        {docs.map((doc, i) => (
          <section
            key={doc.fileId}
            aria-label={`Doküman ${i + 1}: ${doc.fileName}`}
            className={`flex min-h-0 flex-1 flex-col ${
              i > 0 ? "border-t border-hairline" : ""
            }`}
          >
            <PdfViewer
              doc={doc}
              labelIndex={i}
              target={target?.documentIndex === i ? target : null}
              onPageCount={onPageCount}
            />
          </section>
        ))}
      </>
    );
  }

  const active = docs[activeIndex];

  return (
    <>
      {multi && (
        <div
          role="group"
          aria-label="Dokümanlar"
          className="chrome flex shrink-0 gap-1 border-b border-hairline px-1.5 py-1"
        >
          {docs.map((doc, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={doc.fileId}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(i)}
                className={`press flex min-h-9 min-w-0 items-center gap-1.5 rounded-inner px-2 text-micro transition-all duration-200 ease-fluid ${
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

