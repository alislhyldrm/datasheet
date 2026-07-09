// App-level types layered over the Anthropic SDK.

export interface UploadedDoc {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  // Client-only fields; the API contract is unchanged. `objectUrl` points at
  // the File the user picked, so the viewer never re-downloads the PDF. It
  // dies with the page — a reload leaves the viewer with nothing to show.
  objectUrl?: string;
  pageCount?: number;
}

// A citation as surfaced to the UI (subset of the API page_location shape).
export interface Citation {
  citedText: string;
  documentIndex: number;
  documentTitle: string | null;
  startPage: number | null;
  endPage: number | null;
}

// One rendered segment of an assistant message: a run of text with the
// citations that back it (empty array = uncited text).
export interface MessageSegment {
  text: string;
  citations: Citation[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  // For assistant: segmented + cited. For user: single plain segment.
  segments: MessageSegment[];
  // Client-only: a stream or transport failure, rendered apart from the
  // answer text so it never leaks into the history sent back to the server.
  error?: string;
}

// Wire history sent back to the server (role + plain text is enough — the
// server re-attaches the documents itself).
export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

// SSE event shapes streamed from /api/chat.
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "citation"; citation: Citation }
  | { type: "done" }
  | { type: "error"; message: string };
