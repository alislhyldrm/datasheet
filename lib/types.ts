// App-level types shared by the client and the provider-agnostic API routes.

import type { ProviderId } from "./llm/types";

export interface UploadedDoc {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  // Which provider's Files API holds this PDF. A doc uploaded to one provider
  // cannot be queried through another, so the chat route rejects a mismatch
  // and the client clears its docs when the provider changes.
  provider: ProviderId;
  // Client-only fields; the API contract is unchanged. `objectUrl` points at
  // the File the user picked, so the viewer never re-downloads the PDF. It
  // dies with the page — a reload leaves the viewer with nothing to show.
  objectUrl?: string;
  pageCount?: number;
}

// GET /api/config: which providers the server holds a key for in its env, so
// the browser can run on those without being handed a key. No key material is
// ever included.
export interface ServerConfig {
  // Providers with a key in .env.local. A provider listed here works from the
  // settings panel with the key field left empty.
  providers: ProviderId[];
  // The one used when a request names none (LLM_PROVIDER, or the single key).
  provider: ProviderId | null;
  // The model that env config pairs with `provider` (LLM_MODEL or its default).
  model: string;
}

// A citation as surfaced to the UI. Anthropic fills this from its structured
// page_location; OpenAI/Gemini fill it from a parsed prompt marker, after which
// the client verifies the quote against the real page text (startPage goes null
// when it cannot be confirmed).
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
