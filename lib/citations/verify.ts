// Client-side check for prompt-contract citations (OpenAI, Gemini). The model
// reports a page and a quote; this finds where that quote actually is in the
// PDF text and rewrites the citation to match — or nulls the page when the
// quote cannot be found, so the chip shows "kaynak" instead of a wrong page.
//
// Pure string work. The caller supplies page text already extracted with
// pdf.js; `compact` is shared with the on-page highlighter so both agree on
// what counts as the same text.

import type { Citation } from "@/lib/types";
import { compact } from "@/lib/pdf/highlight";

// Below this a quote matches too much of the page to trust (a bare "18 V").
const MIN_MATCH = 12;
// Tried in order when the whole quote doesn't match: re-flow mangles the tail,
// so anchoring on the head recovers most near-misses.
const PREFIXES = [200, 120, 64, 32];

function matchesPage(haystack: string, needle: string): boolean {
  if (haystack.includes(needle)) return true;
  for (const p of PREFIXES) {
    if (p < MIN_MATCH || p >= needle.length) continue;
    if (haystack.includes(needle.slice(0, p))) return true;
  }
  return false;
}

/**
 * @param pageTexts  compacted text per page, index 0 = page 1
 * @param citation   a contract citation (citedText set, startPage model-claimed or null)
 * @returns the citation with startPage/endPage corrected, or nulled if unverifiable
 */
export function verifyCitation(
  pageTexts: readonly string[],
  citation: Citation,
): Citation {
  if (pageTexts.length === 0) return citation;

  const needle = compact(citation.citedText);
  if (needle.length < MIN_MATCH) {
    return { ...citation, startPage: null, endPage: null };
  }

  const hits: number[] = [];
  for (let i = 0; i < pageTexts.length; i++) {
    if (matchesPage(pageTexts[i], needle)) hits.push(i + 1);
  }

  if (hits.length === 0) {
    return { ...citation, startPage: null, endPage: null };
  }

  // The model's claimed page, if it is among the hits, wins — a quote can
  // legitimately recur (a spec repeated in a summary table).
  if (citation.startPage != null && hits.includes(citation.startPage)) {
    const end =
      citation.endPage && hits.includes(citation.endPage)
        ? citation.endPage
        : citation.startPage;
    return { ...citation, startPage: citation.startPage, endPage: end };
  }

  // Otherwise trust the text. A tight run of pages becomes a span; a scatter
  // collapses to the first hit.
  const first = hits[0];
  const last = hits[hits.length - 1];
  const contiguous = last - first === hits.length - 1 && last - first <= 2;
  return {
    ...citation,
    startPage: first,
    endPage: contiguous ? last : first,
  };
}
