import type { ProviderId } from "./llm/types";

// Shared upload ceiling. The upload route and the client uploader both import
// this so no copy can quote a stale number.
//
// The per-provider caps differ. Anthropic uses inline Messages API input,
// while OpenAI and Gemini use their Files APIs. 100 MB is this app's own cap:
// past that, holding the whole file in memory to forward it stops being polite
// to a laptop. Datasheets are a few MB.
export const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB

// Claude's Messages API accepts a 32 MB request. Base64 expands a PDF by about
// one third, leaving this conservative ceiling for the document plus the JSON
// request envelope. Gemini and OpenAI retain their provider Files API paths.
export const MAX_ANTHROPIC_INLINE_PDF_BYTES = 23 * 1024 * 1024;

export function maxPdfBytes(provider?: ProviderId): number {
  return provider === "anthropic"
    ? MAX_ANTHROPIC_INLINE_PDF_BYTES
    : MAX_PDF_BYTES;
}
