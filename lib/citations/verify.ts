// Client-side check for prompt-contract citations (OpenAI, Gemini). The model
// reports a page and a quote; this scores that quote against every page of the
// PDF and either confirms the reported page, replaces it with the page the text
// is actually on, or nulls it — in which case the chip shows "kaynak" rather
// than a page the document does not back.
//
// Pure string work. The caller supplies page text already extracted with
// pdf.js; `compact` and `matchQuote` are shared with the on-page highlighter so
// both agree on what counts as the same text.

import type { Citation } from "@/lib/types";
import { MIN_QUOTE, compact, matchQuote } from "@/lib/pdf/highlight";

// A model quote is never character-identical to pdf.js's extraction — footnote
// markers, re-flowed cells and dropped superscripts all cost a few characters —
// so verification is a score, not an equality.
//
// Corroboration: the model read this page, and the page carries most of the
// quote. Its own page number wins from here up.
const CONFIRM = 0.6;
// Overruling the model, or supplying a page it did not give, is a stronger
// claim and needs a stronger match.
const ADOPT = 0.85;

function scorePage(page: string, needle: string): number {
  return matchQuote(page, needle)?.score ?? 0;
}

/**
 * @param pageTexts  compacted text per page, index 0 = page 1
 * @param citation   a contract citation (citedText set, startPage model-claimed or null)
 * @returns the citation with startPage/endPage confirmed, corrected, or nulled
 */
export function verifyCitation(
  pageTexts: readonly string[],
  citation: Citation,
): Citation {
  if (pageTexts.length === 0) return citation;

  const needle = compact(citation.citedText);
  if (needle.length < MIN_QUOTE) {
    return { ...citation, startPage: null, endPage: null };
  }

  const scores = pageTexts.map((text) => scorePage(text, needle));
  const scoreOf = (page: number | null | undefined) =>
    page != null && page >= 1 && page <= scores.length ? scores[page - 1] : 0;

  // The model's own page wins as soon as the quote is corroborated there. A
  // spec can legitimately recur (a table repeated in a summary), and the page
  // it reported is the one it read the value off.
  if (scoreOf(citation.startPage) >= CONFIRM) {
    return {
      ...citation,
      endPage:
        scoreOf(citation.endPage) >= CONFIRM
          ? citation.endPage
          : citation.startPage,
    };
  }

  // Otherwise the text has to carry the citation on its own.
  const hits: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= ADOPT) hits.push(i + 1);
  }
  if (hits.length === 0) {
    return { ...citation, startPage: null, endPage: null };
  }

  // A tight run of pages becomes a span; a scatter collapses to the first hit.
  const first = hits[0];
  const last = hits[hits.length - 1];
  const contiguous = last - first === hits.length - 1 && last - first <= 2;
  return {
    ...citation,
    startPage: first,
    endPage: contiguous ? last : first,
  };
}
