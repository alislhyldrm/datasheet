// Shared upload ceiling. The upload route and the client uploader both import
// this so no copy can quote a stale number.
//
// The per-provider caps are higher and differ (Anthropic Files API 500 MB,
// OpenAI 512 MB, Gemini 50 MB / 1000 pages). 100 MB is this app's own limit:
// past that, holding the whole file in memory to forward it stops being polite
// to a laptop. Datasheets are a few MB.
export const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB
