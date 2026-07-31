import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-5";
// Thinking tokens come out of the same budget as the answer, and Sonnet 5's
// tokenizer runs ~30% hotter than Opus 4.8's. The request streams, so there is
// no HTTP timeout pushing back on a large ceiling.
export const MAX_TOKENS = 64000;
// `xhigh` is the recommended level for the hardest work on Sonnet 5; `max` costs
// more and can overthink a lookup like this one.
export const EFFORT = "xhigh" as const;
export const FILES_BETA = "files-api-2025-04-14";

// The Anthropic Files API accepts up to 500 MB, and a PDF referenced by file_id
// is capped by pages (600 on a 1M-context model), not by request size. What
// binds first here is the upload route's own time budget: the server has to
// pull the blob and forward it before maxDuration expires.
export const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB

let cached: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}
