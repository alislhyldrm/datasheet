// Finds a citation's text inside a PDF page and returns the boxes to draw over
// it. Pure geometry and string work: no pdf.js import, so it stays testable and
// out of the worker/SSR path. The caller hands over one page's text items plus
// the page's scale-1 viewport matrix, and gets rects back in PDF units — the
// viewer multiplies them by its own scale, so zooming never re-runs the search.

// Structurally a pdf.js TextItem, minus the fields this file doesn't read.
export interface TextChunk {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

// Top-left origin, PDF units (points at scale 1).
export interface MarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Anything the two extractions can disagree about without meaning anything
// different: pdf.js splits a datasheet row into a dozen runs, the model's
// extraction re-flows it, and neither agrees on where the spaces went. Hyphens
// go with them — "Human-body model" and "Human body model" are the same row,
// and a line-break hyphen is pure layout.
const DROP = /[\s\u002d\u00ad\u2010-\u2015\u2212\ufe58\ufe63\uff0d\u200b-\u200d\u2060\ufeff]/;
const APOSTROPHE = /[\u2018\u2019\u201a\u201b\u2032\u00b4\u02bc]/;
const QUOTE = /[\u201c\u201d\u201e\u201f\u2033]/;

// A citation shorter than this matches too much of the page to be worth
// drawing — a bare "18 V" would land on the first of a dozen occurrences.
const MIN_MATCH = 8;
// Tried in order when the full citation doesn't match: the tail is what
// re-flowing mangles, so anchoring on the head recovers most misses.
const PREFIXES = [200, 96, 48, 24];

// Baselines this close belong to the same line — enough to pull a subscript
// into the row it annotates, not enough to reach the next table row.
const BASELINE_TOLERANCE = 0.4;
// Runs this close on one line become a single band; a wide gap (a table's
// label and its value) stays two boxes, which is what a reader wants.
const GAP_TOLERANCE = 6;
// Descenders sit below the font box the transform gives us.
const PAD = 1;

function mapChar(ch: string): string {
  if (DROP.test(ch)) return "";
  if (APOSTROPHE.test(ch)) return "'";
  if (QUOTE.test(ch)) return '"';
  // Per character, not per string: NFKC can expand one char into several
  // (ﬁ → fi), and the index map below has to survive that.
  return ch.normalize("NFKC").toLowerCase();
}

function compact(text: string): string {
  let out = "";
  for (const ch of text) out += mapChar(ch);
  return out;
}

// The page as one whitespace-free string, with every character remembering the
// chunk and offset it came from.
interface Haystack {
  text: string;
  chunk: number[];
  offset: number[];
}

function buildHaystack(chunks: TextChunk[]): Haystack {
  let text = "";
  const chunk: number[] = [];
  const offset: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const str = chunks[i].str;
    for (let c = 0; c < str.length; c++) {
      const mapped = mapChar(str[c]);
      if (!mapped) continue;
      text += mapped;
      for (let k = 0; k < mapped.length; k++) {
        chunk.push(i);
        offset.push(c);
      }
    }
  }

  return { text, chunk, offset };
}

// m1 ∘ m2, i.e. pdf.js's Util.transform. Inlined so this module keeps its
// no-pdf.js-import promise.
function compose(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// A rect plus the baseline it sat on, which is what groups runs into lines:
// a subscript's box barely overlaps the body text's, but their baselines are
// a couple of points apart.
interface Span extends MarkRect {
  baseline: number;
}

// The slice [from, to) of one chunk, as an axis-aligned box. Written against
// the text direction rather than assuming horizontal, so a rotated label in a
// pinout drawing still gets a box that covers it.
function sliceRect(
  chunk: TextChunk,
  viewportMatrix: number[],
  from: number,
  to: number,
): Span | null {
  const length = chunk.str.length;
  if (!length) return null;

  const m = compose(viewportMatrix, chunk.transform);
  const height = Math.hypot(m[2], m[3]) || chunk.height;
  if (!height) return null;

  const direction = Math.hypot(m[0], m[1]) || 1;
  const ux = m[0] / direction;
  const uy = m[1] / direction;
  // Text direction rotated -90°: (1,0) → (0,-1), i.e. up the page in device
  // coordinates, which is where the glyph body sits relative to its baseline.
  const px = uy;
  const py = -ux;

  const start = (chunk.width * from) / length;
  const span = (chunk.width * (to - from)) / length;
  const x0 = m[4] + ux * start;
  const y0 = m[5] + uy * start;
  const x1 = x0 + ux * span;
  const y1 = y0 + uy * span;

  const xs = [x0, x1, x0 + px * height, x1 + px * height];
  const ys = [y0, y1, y0 + py * height, y1 + py * height];
  const left = Math.min(...xs);
  const top = Math.min(...ys);

  return {
    x: left,
    y: top - PAD,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top + 2 * PAD,
    baseline: m[5],
  };
}

function union(into: MarkRect, span: MarkRect): void {
  const right = Math.max(into.x + into.width, span.x + span.width);
  const bottom = Math.max(into.y + into.height, span.y + span.height);
  into.x = Math.min(into.x, span.x);
  into.y = Math.min(into.y, span.y);
  into.width = right - into.x;
  into.height = bottom - into.y;
}

// Group by baseline, then walk each line left to right. Doing it in one pass
// over a y-sorted list would let a subscript's box swallow the run to its
// left, because "next" in y order is not "next" in reading order.
function mergeSpans(spans: Span[]): MarkRect[] {
  const lines: Span[][] = [];
  for (const span of [...spans].sort((a, b) => a.baseline - b.baseline)) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(1, BASELINE_TOLERANCE * span.height);
    // Against the nearest baseline so far, not the line's first: a row can
    // step superscript → body → subscript, and each step is small even when
    // the whole spread is not.
    const near = line?.[line.length - 1].baseline ?? 0;
    if (line && Math.abs(near - span.baseline) <= tolerance) {
      line.push(span);
    } else {
      lines.push([span]);
    }
  }

  const merged: MarkRect[] = [];
  for (const line of lines) {
    let band: MarkRect | null = null;
    for (const span of line.sort((a, b) => a.x - b.x)) {
      if (band && span.x <= band.x + band.width + GAP_TOLERANCE) {
        union(band, span);
        continue;
      }
      band = { x: span.x, y: span.y, width: span.width, height: span.height };
      merged.push(band);
    }
  }

  return merged.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function locateCitation({
  chunks,
  citedText,
  viewportMatrix,
}: {
  chunks: TextChunk[];
  citedText: string;
  viewportMatrix: number[];
}): MarkRect[] {
  const needle = compact(citedText);
  if (needle.length < MIN_MATCH || chunks.length === 0) return [];

  const hay = buildHaystack(chunks);
  let at = hay.text.indexOf(needle);
  let length = needle.length;

  for (const prefix of PREFIXES) {
    if (at >= 0) break;
    if (prefix >= needle.length || prefix < MIN_MATCH) continue;
    at = hay.text.indexOf(needle.slice(0, prefix));
    length = prefix;
  }
  if (at < 0) return [];

  // Walk the matched range, cutting it at every chunk boundary.
  const spans: Span[] = [];
  let runStart = at;
  for (let i = at + 1; i <= at + length; i++) {
    const ended = i === at + length || hay.chunk[i] !== hay.chunk[runStart];
    if (!ended) continue;
    const chunk = chunks[hay.chunk[runStart]];
    const rect = sliceRect(
      chunk,
      viewportMatrix,
      hay.offset[runStart],
      hay.offset[i - 1] + 1,
    );
    if (rect) spans.push(rect);
    runStart = i;
  }

  return mergeSpans(spans);
}
