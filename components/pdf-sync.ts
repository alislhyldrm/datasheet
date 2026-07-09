"use client";

import { createContext, useContext } from "react";
import type { Citation } from "@/lib/types";

// Where the viewer should scroll. `nonce` makes a repeat click on the same
// citation a fresh instruction rather than a no-op.
export interface PageTarget {
  documentIndex: number;
  page: number;
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
