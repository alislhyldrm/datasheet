"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import LogoMark from "./LogoMark";
import ThemeToggle from "./ThemeToggle";
import PdfPanel from "./PdfPanel";
import { PdfSyncContext, type CitationResult, type PageTarget } from "./pdf-sync";
import type { Citation, UploadedDoc } from "@/lib/types";

const ICON = { size: 20, strokeWidth: 1.75 } as const;
// Below this width the PDF replaces the chat rather than sitting beside it.
const CHAT_HIDDEN_BELOW = 768;

export default function AppShell({
  docs,
  onPageCount,
  children,
}: {
  docs: UploadedDoc[];
  onPageCount: (fileId: string, pageCount: number) => void;
  children: React.ReactNode;
}) {
  const hasDocs = docs.length > 0;

  // null = "follow the viewport" (split on desktop, closed below it). The
  // default is resolved in CSS so the server-rendered markup already matches
  // the final layout; `wide` only exists to report state to assistive tech.
  const [override, setOverride] = useState<boolean | null>(null);
  const [wide, setWide] = useState(false);
  const [activeDoc, setActiveDoc] = useState(0);
  const [target, setTarget] = useState<PageTarget | null>(null);
  const nonce = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const docCount = docs.length;
  const showCitation = useCallback(
    (citation: Citation): CitationResult => {
      const index = Math.min(Math.max(citation.documentIndex, 0), docCount - 1);
      setActiveDoc(index);
      setOverride(true);
      if (citation.startPage != null) {
        nonce.current += 1;
        setTarget({
          documentIndex: index,
          page: citation.startPage,
          nonce: nonce.current,
        });
      }
      return window.innerWidth < CHAT_HIDDEN_BELOW ? "mobile" : "panel";
    },
    [docCount],
  );

  const pdfOpen = override ?? wide;
  const activeIndex = Math.min(activeDoc, Math.max(docs.length - 1, 0));

  const pdfVisibility =
    override === null ? "hidden lg:flex" : override ? "flex" : "hidden";
  // Below md the two panes share the screen, so opening the PDF hides the chat.
  const chatVisibility = override === true ? "hidden md:flex" : "flex";

  return (
    <PdfSyncContext value={hasDocs ? showCitation : null}>
    <div className="flex h-[100dvh] flex-col bg-bg text-ink">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-title font-semibold tracking-tight">
            <LogoMark className="shrink-0 text-accent" />
            <span className="truncate">Datasheet Analiz</span>
          </h1>
          {!hasDocs && (
            <p className="mt-0.5 text-micro text-ink-muted">
              Kaynaklı, halüsinasyonsuz datasheet asistanı — her değer sayfa
              referansıyla.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {hasDocs && (
            <PanelToggle
              open={pdfOpen}
              auto={override === null}
              onToggle={() => setOverride(!pdfOpen)}
            />
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {hasDocs && (
          <section
            aria-label="PDF önizleme"
            className={`panel-enter min-w-0 flex-col bg-surface-2 md:w-[46%] md:shrink-0 md:border-r md:border-border lg:w-[55%] lg:min-w-[480px] ${pdfVisibility} w-full`}
          >
            <PdfPanel
              docs={docs}
              activeIndex={activeIndex}
              onSelect={setActiveDoc}
              target={target}
              onPageCount={onPageCount}
            />
          </section>
        )}

        <main
          className={`min-w-0 flex-1 flex-col bg-bg ${hasDocs ? chatVisibility : "flex"}`}
        >
          {children}
        </main>
      </div>
    </div>
    </PdfSyncContext>
  );
}

function PanelToggle({
  open,
  auto,
  onToggle,
}: {
  open: boolean;
  auto: boolean;
  onToggle: () => void;
}) {
  const segment = (active: boolean) =>
    `flex h-11 items-center rounded-md px-3.5 text-meta transition-colors duration-150 ease-out ${
      active ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"
    }`;

  return (
    <>
      <div className="flex rounded-lg border border-border p-0.5 md:hidden">
        <button
          type="button"
          aria-pressed={!open}
          onClick={() => open && onToggle()}
          className={segment(!open)}
        >
          Sohbet
        </button>
        <button
          type="button"
          aria-pressed={open}
          onClick={() => !open && onToggle()}
          className={segment(open)}
        >
          PDF
        </button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={open}
        aria-label={open ? "PDF panelini kapat" : "PDF panelini aç"}
        className="hidden h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink md:flex"
      >
        {/* While following the viewport, CSS picks the icon so the button
            matches the panel on the very first paint. */}
        {auto ? (
          <>
            <PanelLeft {...ICON} className="lg:hidden" aria-hidden="true" />
            <PanelLeftClose
              {...ICON}
              className="hidden lg:block"
              aria-hidden="true"
            />
          </>
        ) : open ? (
          <PanelLeftClose {...ICON} aria-hidden="true" />
        ) : (
          <PanelLeft {...ICON} aria-hidden="true" />
        )}
      </button>
    </>
  );
}
