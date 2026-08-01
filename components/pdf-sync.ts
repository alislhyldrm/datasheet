"use client";

import { createContext, useContext } from "react";
import type { Citation } from "@/lib/types";

// Where the viewer should scroll. `nonce` makes a repeat click on the same
// citation a fresh instruction rather than a no-op.
//
// `citedText` rides along so the viewer can find the sentence on the page and
// highlight it; `endPage` bounds how far past the first page to look for it.
export interface PageTarget {
  documentIndex: number;
  page: number;
  endPage: number | null;
  citedText: string;
  nonce: number;
}

// "mobile" means the chat is now off-screen, so the caller should not also
// open a popover the user cannot see.
export type CitationResult = "panel" | "mobile";

export const PdfSyncContext = createContext<
  ((citation: Citation) => CitationResult) | null
>(null);

export function usePdfSync() {
  return useContext(PdfSyncContext);
}
