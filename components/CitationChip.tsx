"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Citation } from "@/lib/types";
import { pageLabel } from "@/lib/citation-markdown";
import { usePdfSync } from "./pdf-sync";

const POPOVER_WIDTH = 288;
const GAP = 8;

export default function CitationChip({
  citation,
  showDoc,
}: {
  citation: Citation;
  showDoc: boolean;
}) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const showCitation = usePdfSync();

  const label = pageLabel(citation);

  function handleClick() {
    const popover = popoverRef.current;
    if (popover?.matches(":popover-open")) {
      popover.hidePopover();
      return;
    }
    // On a phone the chat is replaced by the PDF, so a popover anchored to the
    // now-hidden chip would float over the page it just jumped to.
    if (showCitation?.(citation) === "mobile") return;
    popover?.showPopover();
  }

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    // The popover is display:none until it opens, so its size can't be
    // measured here — the width is fixed and the height is handled by
    // translating upward when we flip above the chip.
    const place = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 2 * GAP);
      const left = Math.max(
        GAP,
        Math.min(
          anchor.left + anchor.width / 2 - width / 2,
          window.innerWidth - width - GAP,
        ),
      );
      const flipAbove = anchor.top > window.innerHeight / 2;
      popover.style.width = `${width}px`;
      popover.style.left = `${left}px`;
      popover.style.top = `${flipAbove ? anchor.top - GAP : anchor.bottom + GAP}px`;
      popover.style.transform = flipAbove ? "translateY(-100%)" : "";
    };

    const onBeforeToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") place();
    };
    const onToggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) closeRef.current?.focus();
    };

    popover.addEventListener("beforetoggle", onBeforeToggle);
    popover.addEventListener("toggle", onToggle);
    return () => {
      popover.removeEventListener("beforetoggle", onBeforeToggle);
      popover.removeEventListener("toggle", onToggle);
    };
  }, []);

  // Anything that moves the chip invalidates the position; closing is
  // steadier than chasing it.
  useEffect(() => {
    if (!open) return;
    const close = () => popoverRef.current?.hidePopover();
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Kaynağı göster: ${label}`}
        className="relative mx-0.5 inline-flex items-center rounded-inner bg-accent-soft px-1.5 py-0.5 align-baseline font-mono text-micro font-medium text-accent ring-1 ring-accent-ring ring-inset transition-all duration-200 ease-fluid after:absolute after:-inset-3 after:content-[''] hover:bg-accent/20"
      >
        {label}
      </button>

      {/* A bare `block` here would be an author rule beating the UA's
          `[popover]:not(:popover-open) { display: none }`, leaving every
          citation popover pinned open over the transcript. */}
      <span
        ref={popoverRef}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Kaynak alıntısı"
        className="chrome-float hidden rounded-control p-3 text-left [&:popover-open]:block"
      >
        {showDoc && citation.documentTitle && (
          <span className="mb-1 block truncate font-mono text-micro text-ink-muted">
            {citation.documentTitle} · {label}
          </span>
        )}
        <span className="block max-h-48 overflow-y-auto whitespace-pre-wrap text-meta leading-relaxed text-ink">
          “{citation.citedText.trim()}”
        </span>
        <button
          ref={closeRef}
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          className="mt-1 flex min-h-11 items-center gap-1 text-micro text-ink-muted transition-all duration-200 ease-fluid hover:text-accent"
        >
          <X size={12} aria-hidden="true" />
          kapat
        </button>
      </span>
    </>
  );
}
