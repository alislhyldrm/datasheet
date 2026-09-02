// Citation fallback for providers without a structured citation API (OpenAI,
// Gemini). The model is told to append a marker after every sourced sentence;
// this module parses those markers out of the token stream and turns them into
// the same `{ type: "citation" }` events Anthropic's native citations produce.
//
// The page number and quote here are MODEL-REPORTED, not API-verified. The
// client re-checks each quote against the real PDF text (lib/citations/verify)
// and drops or corrects the page before it is shown.

import type { Citation, ChatStreamEvent } from "@/lib/types";

// Chosen to never occur in datasheet prose and to survive a markdown pass
// intact. Kept ASCII so every tokenizer treats it the same way.
const OPEN = "[[cite:";
const CLOSE = "]]";
const MAX_QUOTE = 240;

export function citationContract(multiDoc: boolean): string {
  const dPart = multiDoc
    ? `\n- In multi-document mode, start the marker with the 1-based document number: \`[[cite:doc=2|page=5|<quote>]]\`. Document order is the order they were uploaded.`
    : "";
  return `# CITATION MARKERS (mandatory output format)

This interface has no structured citation channel, so you MUST mark every sourced statement inline.

- Immediately AFTER any sentence that reports a value, spec, pin, condition, or claim taken from the datasheet, append a marker: \`${OPEN}page=<n>|<verbatim quote>${CLOSE}\`
  - \`<n>\` is the PDF page number the value is printed on. A span is \`page=4-5\`. If you genuinely cannot tell the page, write \`page=?\`.
  - \`<verbatim quote>\` is text copied EXACTLY from the datasheet (max ${MAX_QUOTE} characters) — the row, cell, or line the value comes from. Do not paraphrase, translate, or reformat it. No newlines inside the quote.
  - No space before the marker. Put it before the sentence's closing punctuation is fine too.${dPart}
- One marker per source. If a sentence draws on two rows, use two markers back to back.
- Do NOT wrap the marker in backticks, quotes, or parentheses. Write it raw.
- If a fact is not in the datasheet, say so and emit no marker. Never invent a page or a quote to satisfy this format.

Example: \`Absolute maximum V_CC is 18 V.${OPEN}page=4|Supply voltage, V_CC ................ 18 V${CLOSE}\``;
}

function parseMarker(inner: string, multiDoc: boolean): Citation | null {
  // inner is the text between OPEN and CLOSE, e.g. "doc=2|page=4-5|Supply ..."
  let rest = inner;
  let documentIndex = 0;

  const docMatch = /^doc=(\d{1,3})\|/.exec(rest);
  if (docMatch) {
    documentIndex = Math.max(0, Number(docMatch[1]) - 1);
    rest = rest.slice(docMatch[0].length);
  }

  const pageMatch = /^page=(\?|\d{1,5}(?:-\d{1,5})?)\|/.exec(rest);
  if (!pageMatch) return null;
  rest = rest.slice(pageMatch[0].length);

  const quote = rest.trim().slice(0, MAX_QUOTE);
  if (!quote) return null;

  let startPage: number | null = null;
  let endPage: number | null = null;
  if (pageMatch[1] !== "?") {
    const [a, b] = pageMatch[1].split("-").map(Number);
    startPage = a;
    endPage = b ?? a;
  }

  return {
    citedText: quote,
    documentIndex: multiDoc ? documentIndex : 0,
    documentTitle: null,
    startPage,
    endPage,
  };
}

// How many trailing chars of `s` form a proper prefix of `needle` — those have
// to be held back in case the marker is still arriving.
function danglingPrefix(s: string, needle: string): number {
  const max = Math.min(s.length, needle.length - 1);
  for (let n = max; n > 0; n--) {
    if (needle.startsWith(s.slice(s.length - n))) return n;
  }
  return 0;
}

/**
 * Feed raw model text in as it streams; get back the SSE events to forward.
 * Call `flush()` once the stream ends to release any held-back tail.
 */
export class CitationContractParser {
  private buf = "";
  private multiDoc: boolean;

  constructor(multiDoc: boolean) {
    this.multiDoc = multiDoc;
  }

  push(text: string): ChatStreamEvent[] {
    this.buf += text;
    const out: ChatStreamEvent[] = [];

    for (;;) {
      const open = this.buf.indexOf(OPEN);

      if (open === -1) {
        const hold = danglingPrefix(this.buf, OPEN);
        const emit = this.buf.length - hold;
        if (emit > 0) {
          out.push({ type: "text", text: this.buf.slice(0, emit) });
          this.buf = this.buf.slice(emit);
        }
        return out;
      }

      if (open > 0) {
        out.push({ type: "text", text: this.buf.slice(0, open) });
        this.buf = this.buf.slice(open);
      }

      const close = this.buf.indexOf(CLOSE, OPEN.length);
      if (close === -1) return out; // marker still arriving

      const inner = this.buf.slice(OPEN.length, close);
      this.buf = this.buf.slice(close + CLOSE.length);

      const citation = parseMarker(inner, this.multiDoc);
      if (citation) {
        out.push({ type: "citation", citation });
      } else {
        // Malformed marker: show it as plain text rather than swallow output.
        out.push({ type: "text", text: OPEN + inner + CLOSE });
      }
    }
  }

  flush(): ChatStreamEvent[] {
    const tail = this.buf;
    this.buf = "";
    return tail ? [{ type: "text", text: tail }] : [];
  }
}
