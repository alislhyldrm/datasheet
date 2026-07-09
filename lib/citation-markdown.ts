// Bridges the segment/citation model onto a single markdown string.
//
// Citations arrive pinned to the end of a segment. Emitting them as ordinary
// markdown links keeps the stream parseable at every flush — a half-written
// table or emphasis run still renders, and a link degrades to readable text if
// it is ever shown raw. ChatMessage maps the `#cite-N` href back to a chip.

import type { Citation, MessageSegment } from "./types";

export const CITE_HREF = /^#cite-(\d+)$/;

export function pageLabel(citation: Citation): string {
  if (citation.startPage == null) return "kaynak";
  if (citation.endPage && citation.endPage !== citation.startPage) {
    return `s.${citation.startPage}-${citation.endPage}`;
  }
  return `s.${citation.startPage}`;
}

export function buildMarkdown(segments: MessageSegment[]): {
  markdown: string;
  citations: Citation[];
} {
  const citations: Citation[] = [];
  let markdown = "";

  for (const segment of segments) {
    if (segment.citations.length === 0) {
      markdown += segment.text;
      continue;
    }
    // Keep the chip on the same line as the text it backs, rather than letting
    // the segment's trailing newlines orphan it into the next block.
    const trailing = /\s*$/.exec(segment.text)?.[0] ?? "";
    markdown += segment.text.slice(0, segment.text.length - trailing.length);
    for (const citation of segment.citations) {
      markdown += `[${pageLabel(citation)}](#cite-${citations.length})`;
      citations.push(citation);
    }
    markdown += trailing;
  }

  return { markdown, citations };
}
