// Provider-agnostic contract. The route handlers know only this file; each
// concrete provider lives in its own module and is reached through the registry.

import type { ChatStreamEvent, HistoryTurn } from "@/lib/types";

export type ProviderId = "anthropic" | "openai" | "gemini";

// What a provider can actually back a claim with. The UI reads these to state
// the evidence level honestly rather than implying every provider cites the
// same way.
export interface ProviderCapabilities {
  // Reads the PDF whole (text + rendered pages), no retrieval/chunking.
  nativePdf: boolean;
  // Emits structured citations through its own API (vs. a prompt contract).
  nativeCitations: boolean;
  // Citations can name a page number.
  pageCitations: boolean;
  // Citations carry a verbatim quote from the source.
  exactQuoteCitations: boolean;
}

// A document already uploaded to one provider. Tagged with that provider: a
// file that lives in Anthropic's Files API is meaningless to OpenAI, so the
// chat route rejects a ref whose provider is not the active one.
export interface ProviderDocumentRef {
  provider: ProviderId;
  // Opaque provider handle: "file_..." (Anthropic), "file-..." (OpenAI),
  // "files/..." (Gemini). Never parsed, only echoed back to its provider.
  id: string;
  fileName: string;
  sizeBytes: number;
}

export interface UploadArgs {
  apiKey: string;
  fileName: string;
  bytes: Buffer;
}

export interface StreamChatArgs {
  apiKey: string;
  model: string;
  documents: ProviderDocumentRef[];
  question: string;
  history: HistoryTurn[];
  signal?: AbortSignal;
  emit: (event: ChatStreamEvent) => void;
}

export interface ProviderAdapter {
  id: ProviderId;
  capabilities: ProviderCapabilities;

  uploadDocument(args: UploadArgs): Promise<ProviderDocumentRef>;

  streamChat(args: StreamChatArgs): Promise<void>;

  // Best-effort cleanup. Not every provider needs it (Anthropic/OpenAI files
  // expire on their own); Gemini files are gone in 48h regardless.
  deleteDocument?(args: {
    apiKey: string;
    document: ProviderDocumentRef;
  }): Promise<void>;
}

// Thrown by an adapter when the caller's input is bad (missing key, unknown
// provider). The route maps it to a 400; anything else is a 500 or a mapped
// provider error.
export class ProviderConfigError extends Error {}
