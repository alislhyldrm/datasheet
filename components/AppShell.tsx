"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PanelLeft,
  PanelLeftClose,
  Rows2,
  Settings2,
  Square,
} from "lucide-react";
import LogoMark from "./LogoMark";
import ThemeToggle from "./ThemeToggle";
import SettingsDialog from "./SettingsDialog";
import PdfPanel, { type PdfLayout } from "./pdf/PdfPanel";
import {
  PdfSyncContext,
  type CitationResult,
  type PageTarget,
} from "./pdf/sync";
import { PROVIDER_META } from "@/lib/llm/providers-meta";
import type { LlmSettings } from "@/lib/llm-settings";
import type { Citation, ServerConfig, UploadedDoc } from "@/lib/types";

const ICON = { size: 20, strokeWidth: 1.75 } as const;
// Below this width the PDF replaces the chat rather than sitting beside it.
const CHAT_HIDDEN_BELOW = 768;

const STEPS = [
  "Datasheet yükle",
  "Soru sor, yanıt al",
  "Datasheet'leri karşılaştır",
];

export default function AppShell({
  docs,
  onPageCount,
  settings,
  server,
  settingsOpen,
  onSettingsOpenChange,
  onSaveSettings,
  children,
}: {
  docs: UploadedDoc[];
  onPageCount: (fileId: string, pageCount: number) => void;
  // What the app runs with: this browser's saved settings, or — when it has no
  // key — the provider/model the server reported from its own env config.
  settings: LlmSettings;
  server: ServerConfig | null;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onSaveSettings: (next: LlmSettings) => void;
  children: React.ReactNode;
}) {
  const hasDocs = docs.length > 0;
  // A key for the running provider exists: in this browser, or on the server.
  const keyed =
    Boolean(settings.apiKey) ||
    Boolean(server?.providers.includes(settings.provider));

  // null = "follow the viewport" (split on desktop, closed below it). The
  // default is resolved in CSS so the server-rendered markup already matches
  // the final layout; `wide` only exists to report state to assistive tech.
  const [override, setOverride] = useState<boolean | null>(null);
  const [wide, setWide] = useState(false);
  const [activeDoc, setActiveDoc] = useState(0);
  // Comparing two datasheets is the reason to open a second document, so a
  // multi-doc session starts with both on screen.
  const [layout, setLayout] = useState<PdfLayout>("stacked");
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
          endPage: citation.endPage,
          citedText: citation.citedText,
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
      <div className="grain" aria-hidden="true" />

      <div className="z-app relative flex h-[100dvh] flex-col text-ink">
        <header className="chrome z-sticky relative flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-title font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="card flex size-9 shrink-0 items-center justify-center rounded-control text-accent"
              >
                <LogoMark />
              </span>
              <span className="truncate">Datasheet Analiz</span>
            </h1>

            {!hasDocs && (
              <p className="mt-1 text-micro text-ink-muted">
                <a
                  href="https://github.com/alislhyldrm/datasheet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:text-accent hover:underline"
                >
                  Ali Salih Yıldırım
                </a>{" "}
                tarafından geliştirildi
              </p>
            )}

            {/* Hairline separators, not decorative dots. */}
            {!hasDocs && (
              <ul className="mt-1.5 flex flex-wrap items-center text-micro text-ink-muted">
                {STEPS.map((step, i) => (
                  <li
                    key={step}
                    className={
                      i === 0 ? "" : "ml-2.5 border-l border-hairline pl-2.5"
                    }
                  >
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {docs.length > 1 && pdfOpen && (
              <LayoutToggle layout={layout} onChange={setLayout} />
            )}
            {hasDocs && (
              <PanelToggle
                open={pdfOpen}
                auto={override === null}
                onToggle={() => setOverride(!pdfOpen)}
              />
            )}
            <button
              type="button"
              onClick={() => onSettingsOpenChange(true)}
              aria-label="Model ayarları"
              title={`${PROVIDER_META[settings.provider].label} · ${
                settings.model || PROVIDER_META[settings.provider].defaultModel
              }${keyed ? "" : " — anahtar gerekli"}`}
              className="press relative flex size-11 items-center justify-center rounded-control border border-hairline text-ink-muted transition-all duration-200 ease-fluid hover:border-accent-ring hover:text-accent"
            >
              <Settings2 {...ICON} aria-hidden="true" />
              {!keyed && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger"
                />
              )}
            </button>
            <ThemeToggle />
          </div>
        </header>

        <SettingsDialog
          open={settingsOpen}
          initial={settings}
          onSave={onSaveSettings}
          onClose={() => onSettingsOpenChange(false)}
        />

        <div className="flex min-h-0 flex-1">
          {hasDocs && (
            <section
              aria-label="PDF önizleme"
              // Opaque, not glass: this pane hosts a scroll container, and
              // backdrop-filter over scrolling content repaints every frame.
              className={`panel-enter min-w-0 flex-col bg-panel md:w-[46%] md:shrink-0 md:border-r md:border-hairline lg:w-[55%] lg:min-w-[480px] ${pdfVisibility} w-full`}
            >
              <PdfPanel
                docs={docs}
                activeIndex={activeIndex}
                onSelect={setActiveDoc}
                layout={layout}
                target={target}
                onPageCount={onPageCount}
              />
            </section>
          )}

          <main
            className={`min-w-0 flex-1 flex-col ${hasDocs ? chatVisibility : "flex"}`}
          >
            {children}
          </main>
        </div>
      </div>
    </PdfSyncContext>
  );
}

function LayoutToggle({
  layout,
  onChange,
}: {
  layout: PdfLayout;
  onChange: (layout: PdfLayout) => void;
}) {
  const segment = (active: boolean) =>
    `press flex size-9 items-center justify-center rounded-inner transition-all duration-200 ease-fluid ${
      active ? "card text-ink" : "text-ink-muted hover:text-ink"
    }`;

  return (
    <div className="well flex shrink-0 rounded-control p-1">
      <button
        type="button"
        aria-pressed={layout === "stacked"}
        aria-label="İki dokümanı alt alta göster"
        title="Alt alta"
        onClick={() => onChange("stacked")}
        className={segment(layout === "stacked")}
      >
        <Rows2 size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-pressed={layout === "single"}
        aria-label="Tek doküman göster"
        title="Tek tek"
        onClick={() => onChange("single")}
        className={segment(layout === "single")}
      >
        <Square size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
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
  // Sunken track, raised thumb: the selected segment is the only part of the
  // control that catches the light.
  const segment = (active: boolean) =>
    `press flex h-9 items-center rounded-inner px-3.5 text-meta transition-all duration-200 ease-fluid ${
      active ? "card font-medium text-ink" : "text-ink-muted hover:text-ink"
    }`;

  return (
    <>
      <div className="well flex rounded-control p-1 md:hidden">
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
        className="press hidden size-11 items-center justify-center rounded-control border border-hairline text-ink-muted transition-all duration-200 ease-fluid hover:border-accent-ring hover:text-accent md:flex"
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
