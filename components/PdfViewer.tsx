"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { PageTarget } from "./pdf-sync";
import { locateCitation, type MarkRect, type TextChunk } from "@/lib/pdf-highlight";
import type { UploadedDoc } from "@/lib/types";

const PAGE_GAP = 12;
const H_PADDING = 32;
const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const FLASH_MS = 200;
// How far past the citation's first page to keep looking for its text. A
// page_location can span a page break; anything beyond a page or two of it is
// a mismatch, not a continuation.
const SEARCH_AHEAD = 2;
// Where the highlight lands in the viewport: a third down, so the lines above
// it stay visible as context.
const SCROLL_LEAD = 3;
// A citation covering more than this much of the page's height is a table or a
// whole section, not a sentence. Measured on the NE555 datasheet: answers about
// a spec row cite the entire "Electrical Characteristics" block, ~90% of the
// page. Drawn at full strength that reads as "everything matters"; drawn faint
// it reads as "the source is this region", which is what it is.
const BROAD_SPREAD = 0.4;

// One page's text, as the highlighter needs it. Cached per page: re-clicking
// the same citation must not go back to the worker.
interface PageText {
  chunks: TextChunk[];
  viewportMatrix: number[];
}

interface Mark {
  page: number;
  rects: MarkRect[];
  // A block-sized citation, drawn faint — see BROAD_SPREAD.
  broad: boolean;
}

// pdf.js touches the DOM and spawns a worker, so it must not load during SSR.
// One worker is shared by every document in the session.
//
// The worker is handed to getDocument as an explicit `worker` param rather than
// through GlobalWorkerOptions.workerPort. Both routes share one worker, but the
// global one makes each loading task believe it OWNS that worker: closing any
// document then calls PDFWorker.destroy(), which terminates the single shared
// worker and breaks every other open document ("PDF açılamadı" on all of them).
// A worker passed in explicitly is never assigned to task._worker, so document
// lifetimes stay independent — which is what the side-by-side compare view and
// removing one of two documents both depend on.
let pdfjsPromise: Promise<{
  pdfjs: typeof import("pdfjs-dist");
  worker: import("pdfjs-dist").PDFWorker;
}> | null = null;

function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    const port = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
    // create() over `new PDFWorker()`: same result for a fresh port, but its
    // generated constructor type declares `port?: null`. Lives for the page
    // session; nothing destroys it.
    return { pdfjs, worker: pdfjs.PDFWorker.create({ port }) };
  });
  return pdfjsPromise;
}

export default function PdfViewer({
  doc,
  target,
  onPageCount,
  labelIndex,
}: {
  doc: UploadedDoc;
  target: PageTarget | null;
  onPageCount: (fileId: string, pageCount: number) => void;
  // Set when several documents share the panel: the name rides along in this
  // viewer's toolbar instead of costing a row of its own.
  labelIndex?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number }>();
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textCache = useRef(new Map<number, PageText>());

  const objectUrl = doc.objectUrl;

  useEffect(() => {
    if (!objectUrl) return;
    let cancelled = false;
    // Keyed by page number, so it only ever describes the document being
    // loaded here. Both panel layouts key the viewer by fileId, so a new
    // document arrives as a fresh mount rather than a swap under this effect.
    textCache.current.clear();
    // Tearing down the loading task is what releases the document and its
    // worker port; PDFDocumentProxy itself has no destroy in pdf.js 6.
    let task: PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        const { pdfjs, worker } = await loadPdfjs();
        if (cancelled) return;
        task = pdfjs.getDocument({ url: objectUrl, worker });
        const loaded = await task.promise;
        if (cancelled) return;
        // Page 1 sizes every placeholder. Datasheets are uniform; a mixed-size
        // document would only misplace the scroll estimate, not the render.
        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setBaseSize({ width: viewport.width, height: viewport.height });
        setPdf(loaded);
        onPageCount(doc.fileId, loaded.numPages);
      } catch {
        if (!cancelled) setError("PDF açılamadı.");
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [objectUrl, doc.fileId, onPageCount]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitScale =
    baseSize && containerWidth
      ? (containerWidth - H_PADDING) / baseSize.width
      : 1;
  const scale = fitScale * zoom;
  const pageHeight = baseSize ? baseSize.height * scale : 0;
  const stride = pageHeight + PAGE_GAP;
  const numPages = pdf?.numPages ?? 0;

  const scrollTo = (top: number) => {
    const element = scrollRef.current;
    if (!element) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    element.scrollTo({
      top: Math.max(top, 0),
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const scrollToPage = (next: number) => {
    if (!stride) return;
    scrollTo((next - 1) * stride);
  };

  // A citation was clicked: find its sentence, scroll to it, and leave the
  // highlight standing until the next citation (or Escape) clears it.
  //
  // `stride` is a dependency because a click can land before the document has
  // loaded, but each nonce must fire exactly once — otherwise zooming (which
  // changes stride) would yank the reader back to the last cited page. The
  // rects are stored in PDF units for the same reason: zoom rescales them
  // instead of re-running the search.
  const targetNonce = target?.nonce;
  const targetPage = target?.page;
  const targetEndPage = target?.endPage;
  const targetText = target?.citedText;
  const handledNonce = useRef(0);
  useEffect(() => {
    if (targetNonce == null || targetNonce === handledNonce.current) return;
    if (targetPage == null || !containerWidth || !stride || !numPages) return;
    if (!pdf) return;

    const first = Math.min(Math.max(targetPage, 1), numPages);
    const last = Math.min(
      Math.max(targetEndPage ?? first, first),
      first + SEARCH_AHEAD,
      numPages,
    );

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const readPage = async (n: number): Promise<PageText> => {
      const cached = textCache.current.get(n);
      if (cached) return cached;
      const loaded = await pdf.getPage(n);
      const content = await loaded.getTextContent();
      const value: PageText = {
        // TextMarkedContent items carry no glyphs; only runs of text can be
        // located on the page.
        chunks: content.items.flatMap((item) => ("str" in item ? [item] : [])),
        viewportMatrix: loaded.getViewport({ scale: 1 }).transform,
      };
      textCache.current.set(n, value);
      return value;
    };

    void (async () => {
      let found: Mark | null = null;
      for (let n = first; n <= last && !found; n++) {
        let text: PageText;
        try {
          text = await readPage(n);
        } catch {
          // A page whose text won't extract is a miss, not a failure: the
          // fallback below still gets the reader to the right page.
          continue;
        }
        if (cancelled) return;
        const rects = locateCitation({ ...text, citedText: targetText ?? "" });
        if (!rects.length) continue;
        // Rects come back sorted top-down, so the first one's top is the
        // highest; the bottom needs a look at all of them.
        const bottom = Math.max(...rects.map((r) => r.y + r.height));
        const spread = (bottom - rects[0].y) / (baseSize?.height || bottom);
        found = { page: n, rects, broad: spread > BROAD_SPREAD };
      }
      if (cancelled) return;

      // Claimed here rather than up front: a zoom while the search is still
      // running cancels it, and the re-run has to be allowed to finish the
      // job. Once a nonce has landed, later zooms leave the reader alone.
      handledNonce.current = targetNonce;
      setMark(found);
      if (!found) {
        scrollToPage(first);
        const element = pageRefs.current[first - 1];
        element?.classList.add("pdf-flash");
        timer = setTimeout(
          () => element?.classList.remove("pdf-flash"),
          FLASH_MS * 3,
        );
        return;
      }

      const lead = (scrollRef.current?.clientHeight ?? 0) / SCROLL_LEAD;
      scrollTo((found.page - 1) * stride + found.rects[0].y * scale - lead);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // scrollTo/scrollToPage are derived from stride and scale, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    targetNonce,
    targetPage,
    targetEndPage,
    targetText,
    containerWidth,
    stride,
    scale,
    baseSize,
    numPages,
    pdf,
  ]);

  // Escape clears the highlight — the one way out that doesn't require
  // finding another citation to click.
  useEffect(() => {
    if (!mark) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMark(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mark]);

  if (!objectUrl) {
    return (
      <Empty text="PDF önizlemesi için dokümanı yeniden yükle." />
    );
  }
  if (error) return <Empty text={error} />;

  return (
    <>
      {/* One thin strip above the pages: name, paging and zoom share it, so a
          stacked pair of documents spends ~40px on chrome instead of ~180. */}
      <div className="chrome flex shrink-0 items-center gap-1 border-b border-hairline px-1.5 py-1">
        {labelIndex != null && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5">
            <span className="shrink-0 rounded-inner bg-accent-soft px-1.5 py-0.5 font-mono text-micro font-medium text-accent">
              {labelIndex + 1}
            </span>
            <span className="truncate text-micro text-ink-muted">
              {doc.fileName}
            </span>
          </div>
        )}

        <div
          className={`flex items-center ${labelIndex != null ? "shrink-0" : "flex-1"}`}
        >
          <IconButton
            label="Önceki sayfa"
            disabled={page <= 1}
            onClick={() => scrollToPage(page - 1)}
          >
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <span className="min-w-[6ch] text-center font-mono text-micro text-ink-muted tabular-nums">
            {page}/{numPages || "-"}
          </span>
          <IconButton
            label="Sonraki sayfa"
            disabled={!numPages || page >= numPages}
            onClick={() => scrollToPage(page + 1)}
          >
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex shrink-0 items-center">
          <IconButton
            label="Uzaklaştır"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
          >
            <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <span className="min-w-[4ch] text-center font-mono text-micro text-ink-muted tabular-nums">
            {Math.round(zoom * 100)}
          </span>
          <IconButton
            label="Yakınlaştır"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          if (!stride) return;
          const next = Math.floor(event.currentTarget.scrollTop / stride) + 1;
          setPage(Math.min(Math.max(next, 1), numPages || 1));
        }}
        className="min-h-0 flex-1 overflow-auto px-4 py-4"
      >
        {pdf && baseSize ? (
          <div
            className="mx-auto flex flex-col"
            style={{ gap: PAGE_GAP, width: baseSize.width * scale }}
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                ref={(element) => {
                  pageRefs.current[n - 1] = element;
                }}
                style={{ height: pageHeight }}
                // Paper stays opaque: a PDF page is black ink on white, and
                // letting the mesh through it would wreck the contrast.
                className="relative overflow-hidden rounded-inner bg-paper shadow-[var(--raise)]"
              >
                {/* Only the visible page and its neighbours hold a canvas. */}
                {Math.abs(n - page) <= 1 && (
                  <PageCanvas pdf={pdf} pageNumber={n} scale={scale} />
                )}

                {/* Rects are in PDF units; the current scale places them over
                    the canvas without another pass over the page text. */}
                {mark?.page === n &&
                  mark.rects.map((rect, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={`pdf-mark${mark.broad ? " pdf-mark-broad" : ""}`}
                      style={{
                        left: rect.x * scale,
                        top: rect.y * scale,
                        width: rect.width * scale,
                        height: rect.height * scale,
                      }}
                    />
                  ))}
              </div>
            ))}
          </div>
        ) : (
          /* Skeleton in the shape of the pages that are about to arrive, not
             a spinner that describes nothing. */
          <div
            role="status"
            aria-label="PDF yükleniyor"
            className="mx-auto flex w-full max-w-[52ch] flex-col gap-3"
          >
            <span className="skeleton block aspect-[1/1.414] w-full rounded-inner" />
            <span className="skeleton block aspect-[1/1.414] w-full rounded-inner" />
          </div>
        )}
      </div>

    </>
  );
}

function PageCanvas({
  pdf,
  pageNumber,
  scale,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const render = page.render({ canvas, viewport });
      task = render;
      // Cancelling a render rejects its promise; that is the happy path here.
      await render.promise.catch(() => {});
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  return <canvas ref={canvasRef} className="block" />;
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="press flex size-8 items-center justify-center rounded-inner text-ink-muted transition-all duration-200 ease-fluid hover:bg-card-2 hover:text-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <p className="max-w-[32ch] text-center text-meta text-ink-muted">{text}</p>
    </div>
  );
}
