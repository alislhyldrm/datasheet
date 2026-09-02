"use client";

// Shared pdf.js bootstrap. pdf.js touches the DOM and spawns a worker, so it
// must not load during SSR; one worker is shared by every document in the
// session.
//
// The worker is handed to getDocument as an explicit `worker` param rather than
// through GlobalWorkerOptions.workerPort. Both the viewer and citation
// verification open documents; the global worker makes each loading task
// believe it OWNS that worker, so closing any document calls
// PDFWorker.destroy() and breaks every other open document. A worker passed in
// explicitly is never assigned to task._worker, so document lifetimes stay
// independent.

import { compact } from "@/lib/pdf/highlight";

let pdfjsPromise: Promise<{
  pdfjs: typeof import("pdfjs-dist");
  worker: import("pdfjs-dist").PDFWorker;
}> | null = null;

export function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    const port = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
    return { pdfjs, worker: pdfjs.PDFWorker.create({ port }) };
  });
  return pdfjsPromise;
}

/**
 * Every page's text as one compacted, whitespace-free string, index 0 = page 1.
 * Used by citation verification to find where a quoted line actually sits.
 */
export async function extractPageTexts(url: string): Promise<string[]> {
  const { pdfjs, worker } = await loadPdfjs();
  const task = pdfjs.getDocument({ url, worker });
  try {
    const doc = await task.promise;
    const out: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const raw = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      out.push(compact(raw));
    }
    return out;
  } finally {
    void task.destroy();
  }
}
