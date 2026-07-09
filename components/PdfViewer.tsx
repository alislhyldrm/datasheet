"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { PageTarget } from "./pdf-sync";
import type { UploadedDoc } from "@/lib/types";

const PAGE_GAP = 12;
const H_PADDING = 32;
const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const FLASH_MS = 200;

// pdf.js touches the DOM and spawns a worker, so it must not load during SSR.
// One worker is shared by every document in the session.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
    return pdfjs;
  });
  return pdfjsPromise;
}

export default function PdfViewer({
  doc,
  target,
  onPageCount,
}: {
  doc: UploadedDoc;
  target: PageTarget | null;
  onPageCount: (fileId: string, pageCount: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number }>();
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const objectUrl = doc.objectUrl;

  useEffect(() => {
    if (!objectUrl) return;
    let cancelled = false;
    // Tearing down the loading task is what releases the document and its
    // worker port; PDFDocumentProxy itself has no destroy in pdf.js 6.
    let task: PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        if (cancelled) return;
        task = pdfjs.getDocument({ url: objectUrl });
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

  const scrollToPage = (next: number) => {
    const element = scrollRef.current;
    if (!element || !stride) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    element.scrollTo({
      top: (next - 1) * stride,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  // A citation was clicked. The scroll is the state update: `page` follows
  // from onScroll, and the flash is a transient outline on the DOM node, so
  // neither belongs in React state.
  //
  // `stride` is a dependency because a click can land before the document has
  // loaded, but each nonce must fire exactly once — otherwise zooming (which
  // changes stride) would yank the reader back to the last cited page.
  const targetNonce = target?.nonce;
  const targetPage = target?.page;
  const handledNonce = useRef(0);
  useEffect(() => {
    if (targetNonce == null || targetNonce === handledNonce.current) return;
    if (targetPage == null || !containerWidth || !stride || !numPages) return;
    handledNonce.current = targetNonce;

    const next = Math.min(Math.max(targetPage, 1), numPages);
    scrollToPage(next);
    const element = pageRefs.current[next - 1];
    element?.classList.add("pdf-flash");
    const timer = setTimeout(
      () => element?.classList.remove("pdf-flash"),
      FLASH_MS * 3,
    );
    return () => clearTimeout(timer);
    // scrollToPage is derived from stride, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNonce, targetPage, containerWidth, stride, numPages]);

  if (!objectUrl) {
    return (
      <Empty text="PDF önizlemesi için dokümanı yeniden yükle." />
    );
  }
  if (error) return <Empty text={error} />;

  return (
    <>
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
                className="overflow-hidden rounded-sm bg-surface ring-1 ring-border"
              >
                {/* Only the visible page and its neighbours hold a canvas. */}
                {Math.abs(n - page) <= 1 && (
                  <PageCanvas pdf={pdf} pageNumber={n} scale={scale} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-micro text-ink-muted">
              yükleniyor
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        <div className="flex items-center gap-1">
          <IconButton
            label="Önceki sayfa"
            disabled={page <= 1}
            onClick={() => scrollToPage(page - 1)}
          >
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <span className="min-w-[7ch] text-center font-mono text-micro text-ink-muted">
            {page} / {numPages || "–"}
          </span>
          <IconButton
            label="Sonraki sayfa"
            disabled={!numPages || page >= numPages}
            onClick={() => scrollToPage(page + 1)}
          >
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            label="Uzaklaştır"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
          >
            <Minus size={18} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <span className="min-w-[5ch] text-center font-mono text-micro text-ink-muted">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            label="Yakınlaştır"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
          >
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>
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
      className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-40"
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
