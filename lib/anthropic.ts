import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-4-8";
export const MAX_TOKENS = 16000;
export const FILES_BETA = "files-api-2025-04-14";

// Datasheet PDF limits (Anthropic API): 32MB request / 100MB Files API,
// but we cap client-side well below to keep latency and cost sane.
export const MAX_PDF_BYTES = 40 * 1024 * 1024; // 40 MB

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
